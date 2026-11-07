#!/usr/bin/env node
/**
 * @file B 站 Cookie 续期：cookie/info → correspondPath → refresh_csrf → refresh → confirm。
 * 定时任务每天跑一次即可保活；失败时退出码非 0（过期后只能重新登录拿 refresh_token）。
 * 接口口径见 bilibili-API-collect docs/login/cookie_refresh.md。
 */

import { execFileSync } from "node:child_process"
import { constants, createPublicKey, publicEncrypt } from "node:crypto"
import { cookieHeader, readCredentials } from "./bilibili.ts"
import { ConfigError } from "./errors.ts"
import type { BiliCredentials } from "./types.ts"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const INFO_URL = "https://passport.bilibili.com/x/passport-login/web/cookie/info"
const CORRESPOND_URL = "https://www.bilibili.com/correspond/1/"
const REFRESH_URL = "https://passport.bilibili.com/x/passport-login/web/cookie/refresh"
const CONFIRM_URL = "https://passport.bilibili.com/x/passport-login/web/confirm/refresh"

const RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg
Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71
nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40
JNrRuoEUXpabUzGB8QIDAQAB
-----END PUBLIC KEY-----`

const BASE_HEADERS: Record<string, string> = {
    "user-agent": UA,
    referer: "https://www.bilibili.com/",
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9",
}

function parseSetCookie(headers: Headers): Map<string, string> {
    const values = new Map<string, string>()
    for (const raw of headers.getSetCookie()) {
        const pair = raw.split(";", 1)[0]
        const eq = pair.indexOf("=")
        if (eq > 0) values.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
    return values
}

async function requestJson<T>(
    url: string,
    init: RequestInit,
    label: string
): Promise<{ response: Response; json: { code: number; message?: string; data?: T } }> {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
    const text = await response.text()
    try {
        return { response, json: JSON.parse(text) }
    } catch {
        throw new Error(`${label}失败：HTTP ${response.status}，返回非 JSON：${text.slice(0, 160)}`)
    }
}

/** 查询服务端是否要求刷新，同时拿到服务端毫秒时间戳（correspondPath 的有效期很短） */
async function refreshInfo(cookie: string, csrf: string): Promise<{ refresh: boolean; timestamp: number }> {
    const { json } = await requestJson<{ refresh: boolean; timestamp: number }>(
        `${INFO_URL}?csrf=${encodeURIComponent(csrf)}`,
        { headers: { ...BASE_HEADERS, cookie } },
        "检查刷新状态"
    )
    if (json.code === -101) throw new ConfigError("B 站登录态已失效（code=-101），需要重新登录并更新 BILI_COOKIE 与 BILI_REFRESH_TOKEN")
    if (json.code !== 0 || !json.data) throw new Error(`检查刷新状态失败（code=${json.code} ${json.message ?? ""}）`)
    return json.data
}

/** RSA-OAEP(SHA-256) 加密 refresh_{timestamp}，输出小写 hex */
function correspondPath(timestamp: number): string {
    const encrypted = publicEncrypt(
        { key: createPublicKey(RSA_PUBLIC_KEY), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
        Buffer.from(`refresh_${timestamp}`)
    )
    return encrypted.toString("hex")
}

async function fetchRefreshCsrf(cookie: string, path: string): Promise<string> {
    const response = await fetch(`${CORRESPOND_URL}${path}`, {
        headers: { ...BASE_HEADERS, cookie, accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
    })
    const html = await response.text()
    const match = /<div id="1-name">([^<]+)<\/div>/.exec(html)
    if (!response.ok || !match) throw new Error(`获取 refresh_csrf 失败（HTTP ${response.status}，correspondPath 可能过期）`)
    return match[1].trim()
}

async function postRefresh(
    cookie: string,
    credentials: BiliCredentials,
    refreshCsrf: string
): Promise<{ response: Response; refreshToken: string }> {
    const body = new URLSearchParams({
        csrf: credentials.csrf,
        refresh_csrf: refreshCsrf,
        source: "main_web",
        refresh_token: credentials.refreshToken ?? "",
    })
    const { response, json } = await requestJson<{ refresh_token?: string }>(
        REFRESH_URL,
        {
            method: "POST",
            headers: { ...BASE_HEADERS, "content-type": "application/x-www-form-urlencoded", cookie },
            body,
        },
        "刷新 Cookie"
    )
    if (json.code !== 0 || !json.data?.refresh_token) {
        const hint =
            json.code === -101
                ? "（登录态失效，需重新登录）"
                : json.code === 86095
                  ? "（refresh_csrf 错误或 refresh_token 与 cookie 不匹配，需重新登录）"
                  : ""
        throw new Error(`刷新 Cookie 失败（code=${json.code} ${json.message ?? ""}）${hint}`)
    }
    return { response, refreshToken: json.data.refresh_token }
}

/** 用新 Cookie + 旧 refresh_token 确认，使旧凭据失效 */
async function confirmRefresh(cookie: string, csrf: string, oldRefreshToken: string): Promise<void> {
    const body = new URLSearchParams({ csrf, refresh_token: oldRefreshToken })
    const { json } = await requestJson(
        CONFIRM_URL,
        {
            method: "POST",
            headers: { ...BASE_HEADERS, "content-type": "application/x-www-form-urlencoded", cookie },
            body,
        },
        "确认刷新"
    )
    if (json.code !== 0) console.warn(`  ! 确认刷新返回 code=${json.code} ${json.message ?? ""}（新凭据已生效，忽略）`)
}

/** 执行完整续期；返回新的凭据 */
export async function refreshCookies(credentials: BiliCredentials): Promise<BiliCredentials> {
    const cookie = cookieHeader(credentials)
    const { timestamp } = await refreshInfo(cookie, credentials.csrf)
    const refreshCsrf = await fetchRefreshCsrf(cookie, correspondPath(timestamp))
    const { response, refreshToken } = await postRefresh(cookie, credentials, refreshCsrf)

    const setCookie = parseSetCookie(response.headers)
    const sessdata = setCookie.get("SESSDATA")
    const csrf = setCookie.get("bili_jct")
    if (!sessdata || !csrf) throw new Error("刷新响应未下发新 Cookie（缺少 SESSDATA/bili_jct）")
    const next: BiliCredentials = {
        sessdata,
        csrf,
        buvid3: credentials.buvid3,
        dedeUserId: setCookie.get("DedeUserID") || credentials.dedeUserId,
        refreshToken,
    }

    await confirmRefresh(cookieHeader(next), csrf, credentials.refreshToken ?? "")
    return next
}

function ghSecretSet(name: string, value: string, repo: string | undefined): void {
    const args = ["secret", "set", name, "--body", value]
    if (repo) args.push("--repo", repo)
    execFileSync("gh", args, { stdio: ["ignore", "pipe", "inherit"] })
    console.log(`  已回写 secret ${name}`)
}

function printUsage(): void {
    console.log(`用法：node tools/bili-dynamic/refresh.ts [选项]

  --check          只查询是否需要刷新，不执行
  --force          无论服务端标志如何都执行刷新
  --write-secrets  刷新成功后通过 gh 把新凭据写回仓库 Secrets
  --repo <owner/repo>  写回 Secrets 的目标仓库（默认 GITHUB_REPOSITORY）
  --help           显示本帮助

环境变量：
  BILI_COOKIE / BILI_SESSDATA / BILI_JCT / BILI_BUVID3 / BILI_DEDEUSERID  同发布脚本
  BILI_REFRESH_TOKEN  localStorage 的 ac_time_value（www.bilibili.com 登录后 F12 获取）
  GH_TOKEN            --write-secrets 需要（PAT，需 Secrets 写权限；GITHUB_TOKEN 不行）`)
}

async function main(): Promise<void> {
    const args = process.argv.slice(2)
    if (args.includes("--help")) {
        printUsage()
        return
    }
    const checkOnly = args.includes("--check")
    const force = args.includes("--force")
    const writeSecrets = args.includes("--write-secrets")
    const repoIndex = args.indexOf("--repo")
    const repo = repoIndex >= 0 ? args[repoIndex + 1] : process.env.GITHUB_REPOSITORY

    // 续期一旦发生旧凭据即作废；先确认回写通道可用，避免轮转了却存不下
    if (writeSecrets) {
        if (!process.env.GH_TOKEN) throw new ConfigError("--write-secrets 需要 GH_TOKEN（能写 Actions secrets 的 PAT）")
        execFileSync("gh", ["--version"], { stdio: "ignore" })
    }

    const state = readCredentials(process.env)
    if (state.status !== "ok") {
        throw new ConfigError(state.status === "none" ? "未配置 B 站凭据" : `B 站凭据不完整，缺少：${state.missing.join("、")}`)
    }
    const credentials = state.credentials
    const cookie = cookieHeader(credentials)

    const info = await refreshInfo(cookie, credentials.csrf)
    console.log(`服务端刷新标志：${info.refresh ? "需要刷新" : "暂不需要"}`)
    if (checkOnly) return
    if (!info.refresh && !force) {
        console.log("无需刷新（--force 可强制执行）")
        return
    }
    if (!credentials.refreshToken) {
        throw new ConfigError("未配置 BILI_REFRESH_TOKEN（localStorage 的 ac_time_value），无法续期；请重新登录 www.bilibili.com 后获取")
    }

    console.log("执行 Cookie 续期…")
    const next = await refreshCookies(credentials)
    console.log(`  新 SESSDATA：${next.sessdata.slice(0, 8)}…（${next.sessdata.length} 字符）`)
    console.log(`  新 refresh_token：${next.refreshToken?.slice(0, 8)}…`)

    if (writeSecrets) {
        ghSecretSet("BILI_COOKIE", cookieHeader(next), repo)
        ghSecretSet("BILI_REFRESH_TOKEN", next.refreshToken ?? "", repo)
    } else {
        console.log("\n新凭据（未回写，--write-secrets 可自动更新仓库 Secrets）：")
        console.log(`BILI_COOKIE=${cookieHeader(next)}`)
        console.log(`BILI_REFRESH_TOKEN=${next.refreshToken}`)
    }
}

main().catch(error => {
    console.error(`\n续期失败：${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
})
