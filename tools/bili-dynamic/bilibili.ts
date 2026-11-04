/**
 * @file B 站图文动态接口：WBI 签名、图片上传、创建动态。
 * 接口口径参考 https://github.com/Alterssss/dsh-bili-whale
 */

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { ConfigError } from "./errors.ts"
import type { BiliCredentials, CredentialState, PublishResult } from "./types.ts"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const REFERER = "https://t.bilibili.com/"
/** Origin 按规范不含路径，和 referer 分开写 */
const ORIGIN = "https://t.bilibili.com"
const NAV_URL = "https://api.bilibili.com/x/web-interface/nav"
const SPI_URL = "https://api.bilibili.com/x/frontend/finger/spi"
const UPLOAD_URL = "https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs"
const CREATE_URL = "https://api.bilibili.com/x/dynamic/feed/create/dyn"

const MIXIN_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7,
    16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

const BASE_HEADERS: Record<string, string> = {
    "user-agent": UA,
    referer: REFERER,
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9",
}

interface BiliResponse<T> {
    code: number
    message?: string
    msg?: string
    data?: T
}

interface NavData {
    isLogin: boolean
    uname: string
    mid: number
    wbi_img?: { img_url: string; sub_url: string }
}

interface UploadData {
    image_url: string
    image_width: number
    image_height: number
    img_size?: number
}

interface CreateData {
    dyn_id_str?: string
    dyn_id?: number
    errmsg?: string
}

interface UploadedImage {
    img_src: string
    img_width: number
    img_height: number
    img_size: number
}

function cookieValue(cookie: string, name: string): string {
    const match = new RegExp(`(?:^|;)\\s*${name}=([^;]*)`, "i").exec(cookie)
    return match ? match[1].trim() : ""
}

function normalizeCredential(rawValue: string | undefined, name: string): string {
    const text = String(rawValue ?? "").trim()
    if (!text) return ""
    const match = new RegExp(`(?:^|;)\\s*${name}=([^;]*)`, "i").exec(text)
    return (match ? match[1] : text).replace(/^["']|["']$/g, "").trim()
}

/**
 * 读取 B 站登录态。BILI_COOKIE 优先，其次分别读取三个变量。
 * 返回 status: ok / none / partial，避免把“没配”和“配错”混为一谈。
 */
export function readCredentials(env: Record<string, string | undefined> = process.env): CredentialState {
    const cookie = String(env.BILI_COOKIE ?? "").trim()
    const pick = (name: string) => cookieValue(cookie, name)
    const sessdata = normalizeCredential(env.BILI_SESSDATA, "SESSDATA") || pick("SESSDATA")
    const csrf = normalizeCredential(env.BILI_JCT, "bili_jct") || pick("bili_jct")
    const buvid3 = normalizeCredential(env.BILI_BUVID3, "buvid3") || pick("buvid3")
    const dedeUserId = normalizeCredential(env.BILI_DEDEUSERID, "DedeUserID") || pick("DedeUserID")

    if (!sessdata && !csrf) return { status: "none", missing: ["BILI_COOKIE 或 BILI_SESSDATA/BILI_JCT"], credentials: null }

    const missing: string[] = []
    if (!sessdata || sessdata.length < 20) missing.push("BILI_SESSDATA")
    if (!/^[0-9a-f]{32}$/i.test(csrf)) missing.push("BILI_JCT（应为 32 位十六进制）")
    if (missing.length > 0) return { status: "partial", missing, credentials: null }

    return { status: "ok", missing: [], credentials: { sessdata, csrf, buvid3, dedeUserId } }
}

async function requestJson<T>(
    url: string,
    init: RequestInit,
    label: string,
    timeout = 60_000
): Promise<{ response: Response; json: BiliResponse<T> }> {
    let response: Response
    try {
        response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) })
    } catch (error) {
        throw new Error(`${label}请求失败：${error instanceof Error ? error.message : error}`)
    }
    const raw = await response.text()
    try {
        return { response, json: JSON.parse(raw) as BiliResponse<T> }
    } catch {
        throw new Error(`${label}失败：HTTP ${response.status}，返回非 JSON：${raw.slice(0, 160)}`)
    }
}

async function ensureBuvid3(credentials: BiliCredentials): Promise<void> {
    if (credentials.buvid3) return
    try {
        const { json } = await requestJson<{ b_3?: string }>(
            SPI_URL,
            { headers: { ...BASE_HEADERS, referer: "https://www.bilibili.com/" } },
            "获取 buvid3 ",
            20_000
        )
        if (json.data?.b_3) credentials.buvid3 = json.data.b_3
    } catch (error) {
        console.warn(`  ! 未能自动获取 buvid3，继续尝试：${error instanceof Error ? error.message : error}`)
    }
}

function cookieHeader(credentials: BiliCredentials): string {
    const parts = [`SESSDATA=${credentials.sessdata}`, `bili_jct=${credentials.csrf}`]
    if (credentials.buvid3) parts.push(`buvid3=${credentials.buvid3}`)
    if (credentials.dedeUserId) parts.push(`DedeUserID=${credentials.dedeUserId}`)
    return parts.join("; ")
}

function keyOf(url: string): string {
    try {
        return new URL(url).pathname.split("/").pop()?.split(".")[0] ?? ""
    } catch {
        return ""
    }
}

/** WBI 签名覆盖查询参数里的全部字段（含 csrf），否则服务端重算签名会对不上 */
function buildWbiQuery(params: Record<string, string>, wbiImg: NavData["wbi_img"]): string {
    if (!wbiImg?.img_url || !wbiImg.sub_url) throw new ConfigError("登录接口未返回 wbi_img，无法签名（通常是风控拦截）")
    const raw = keyOf(wbiImg.img_url) + keyOf(wbiImg.sub_url)
    const mixin = MIXIN_TAB.map(index => raw[index] ?? "")
        .join("")
        .slice(0, 32)
    const entries: Record<string, string> = { ...params, wts: String(Math.round(Date.now() / 1000)) }
    const query = Object.keys(entries)
        .sort()
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(entries[key].replace(/[!'()*]/g, ""))}`)
        .join("&")
    const signature = createHash("md5")
        .update(query + mixin)
        .digest("hex")
    return `${query}&w_rid=${signature}`
}

async function getNav(cookie: string): Promise<NavData> {
    const { json } = await requestJson<NavData>(
        NAV_URL,
        { headers: { ...BASE_HEADERS, referer: "https://www.bilibili.com/", cookie } },
        "检查登录态"
    )
    if (json.code !== 0 || !json.data?.isLogin) {
        // -101 / -111 是登录态失效，属于凭据配置问题；其余码才是接口故障
        const expired = [-101, -111].includes(json.code)
        const message = `B 站登录态无效（code=${json.code} ${json.message ?? json.msg ?? ""}），请重新获取 Cookie`
        throw expired ? new ConfigError(message) : new Error(message)
    }
    return json.data
}

async function uploadImage(imagePath: string, credentials: BiliCredentials, cookie: string): Promise<UploadedImage> {
    const buffer = await readFile(imagePath)
    const ext = path.extname(imagePath).toLowerCase()
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".gif" ? "image/gif" : "image/png"
    const filename = `dynamic${mime === "image/jpeg" ? ".jpg" : mime === "image/gif" ? ".gif" : ".png"}`

    const form = new FormData()
    form.append("file_up", new Blob([new Uint8Array(buffer)], { type: mime }), filename)
    form.append("category", "daily")
    form.append("csrf", credentials.csrf)

    const { json } = await requestJson<UploadData>(
        UPLOAD_URL,
        { method: "POST", headers: { ...BASE_HEADERS, cookie }, body: form },
        "上传图片",
        180_000
    )
    if (json.code !== 0 || !json.data?.image_url) {
        throw new Error(`上传图片失败（code=${json.code} ${json.message ?? ""}）`)
    }

    return {
        img_src: String(json.data.image_url).replace(/^\/\//, "https://"),
        img_width: json.data.image_width,
        img_height: json.data.image_height,
        img_size: json.data.img_size ?? Math.ceil(buffer.length / 1024),
    }
}

async function createDynamic(
    text: string,
    image: UploadedImage,
    credentials: BiliCredentials,
    cookie: string,
    wbiImg: NavData["wbi_img"]
): Promise<string> {
    const dynReq: Record<string, unknown> = {
        pics: [image],
        scene: 2,
        meta: { app_meta: { from: "create.dynamic.web", mobi_app: "web" } },
    }
    if (text) dynReq.content = { contents: [{ raw_text: text, type: 1, biz_id: "" }] }

    // create/dyn 的 csrf 只认查询参数；放进正文会被忽略并返回 -111
    const { json } = await requestJson<CreateData>(
        `${CREATE_URL}?${buildWbiQuery({ csrf: credentials.csrf }, wbiImg)}`,
        {
            method: "POST",
            headers: { ...BASE_HEADERS, origin: ORIGIN, "content-type": "application/json", cookie },
            body: JSON.stringify({ dyn_req: dynReq }),
        },
        "发布动态",
        90_000
    )
    if (json.code !== 0) {
        throw new Error(`发布动态失败（code=${json.code} ${json.message ?? ""}${json.data?.errmsg ? `：${json.data.errmsg}` : ""}）`)
    }
    const dynId = json.data?.dyn_id_str ?? json.data?.dyn_id
    if (!dynId) throw new Error("发布接口未返回 dyn_id")
    return String(dynId)
}

export async function publishDynamic(options: { imagePath: string; text: string; credentials: BiliCredentials }): Promise<PublishResult> {
    const { imagePath, text, credentials } = options
    await ensureBuvid3(credentials)
    const cookie = cookieHeader(credentials)
    const nav = await getNav(cookie)
    console.log(`  B 站账号：${nav.uname}（mid ${nav.mid}）`)

    console.log("  上传卡片图片…")
    const image = await uploadImage(imagePath, credentials, cookie)
    console.log(`  图片已上传：${image.img_width}×${image.img_height}，${Math.round(image.img_size)} KB`)

    console.log("  创建图文动态…")
    const dynId = await createDynamic(text, image, credentials, cookie, nav.wbi_img)
    return { dynId, url: `https://t.bilibili.com/${dynId}`, uname: nav.uname }
}
