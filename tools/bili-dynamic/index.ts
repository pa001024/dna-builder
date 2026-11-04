#!/usr/bin/env node
/**
 * @file 版本更新 → 卡片生成 agent → PNG → B 站图文动态。
 * 用法与 Secrets 配置见 .agents/docs/bili-dynamic.md。
 */

import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { runCardAgent } from "./agent/index.ts"
import { publishDynamic, readCredentials } from "./bilibili.ts"
import { captureFullPage } from "./browser.ts"
import { CARD_MIN_HEIGHT, CARD_WIDTH, renderFallbackHtml } from "./card.ts"
import { ConfigError, DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL } from "./errors.ts"
import { fallbackCardContent, finalizeBody } from "./fallback.ts"
import { type PreviousTagDeps, resolvePreviousTag } from "./previous-tag.ts"
import { buildReleaseNotes } from "./release-notes.ts"
import { summarizeCommits } from "./summary.ts"
import type { CardContent, VersionMeta } from "./types.ts"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const DEFAULT_REPO = "pa001024/dna-builder"
const SITE = "dna-builder.cn"

const BOOLEAN_FLAGS = new Set(["dry-run", "strict", "help", "no-ai"])

interface CliOptions {
    tag?: string
    previous?: string
    repo?: string
    out?: string
    image?: string
    text?: string
    title?: string
    aiModel?: string
    dryRun?: boolean
    strict?: boolean
    help?: boolean
    noAi?: boolean
}

interface CommitData {
    subjects: string[]
    log: string
    diffStat: string
}

function camelCase(name: string): string {
    return name.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
}

function parseArgs(argv: string[]): CliOptions {
    const options: Record<string, string | boolean> = {}
    for (let index = 0; index < argv.length; index += 1) {
        const raw = argv[index]
        if (!raw.startsWith("--")) throw new Error(`未知参数：${raw}`)
        const eq = raw.indexOf("=")
        const name = eq === -1 ? raw.slice(2) : raw.slice(2, eq)
        const inline = eq === -1 ? undefined : raw.slice(eq + 1)
        if (BOOLEAN_FLAGS.has(name)) {
            options[camelCase(name)] = true
            continue
        }
        const value = inline ?? argv[(index += 1)]
        if (value == null || value.startsWith("--")) throw new Error(`--${name} 需要一个值`)
        options[camelCase(name)] = value
    }
    return options as CliOptions
}

function printUsage(): void {
    console.log(`用法：node tools/bili-dynamic/index.ts [选项]

  --tag <tag>        版本 tag（默认 GITHUB_REF_NAME，本地测试可传 HEAD）
  --previous <tag>   上一版本 tag（默认自动查找）
  --repo <owner/repo> GitHub 仓库（默认 ${DEFAULT_REPO}）
  --out <path>       卡片 PNG 输出路径（默认 .tmp/bili-dynamic/<tag>.png）
  --image <path>     使用已有图片，跳过 HTML 渲染
  --text <text>      覆盖动态正文
  --title <text>     覆盖卡片大标题
  --no-ai            不使用 DeepSeek，直接走规则摘要
  --ai-model <name>  覆盖 DeepSeek 模型
  --dry-run          只生成图片与正文，不发布
  --strict           配置缺失/无效时改为失败（默认跳过并留痕）
  --help             显示本帮助

环境变量：
  DEEPSEEK_API_KEY   DeepSeek API Key；缺失或无效时跳过发布
  DEEPSEEK_BASE_URL  DeepSeek 接口地址（默认 ${DEFAULT_DEEPSEEK_BASE_URL}）
  DEEPSEEK_MODEL     模型名（默认 ${DEFAULT_DEEPSEEK_MODEL}）
  BILI_COOKIE        登录后的完整 Cookie（推荐）
  BILI_SESSDATA      Cookie 中的 SESSDATA
  BILI_JCT           Cookie 中的 bili_jct
  BILI_BUVID3        Cookie 中的 buvid3（可选，缺失时自动获取）
  BILI_DEDEUSERID    Cookie 中的 DedeUserID（可选）
  CHROME_PATH        Chrome/Edge 可执行文件路径（默认自动查找）
  BILI_DRY_RUN=1     等价于 --dry-run
  BILI_SKIP=1        跳过发布（仍会渲染卡片）
  DELTA_LINE         release 正文里的差量更新说明（由工作流传入）
  INSTALLER_URL      完整安装包地址（由工作流传入）`)
}

function git(args: string[]): string {
    return execFileSync("git", args, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 16 * 1024 * 1024,
    }).trim()
}

function tryGit(args: string[]): string {
    try {
        return git(args)
    } catch {
        return ""
    }
}

function resolveVersion(revision: string, pkgVersion: string): { revision: string; version: string; tag: string } {
    if (!revision || revision === "HEAD") {
        return { revision: "HEAD", version: pkgVersion, tag: `v${pkgVersion}` }
    }
    const version = revision.replace(/^v/i, "")
    return { revision, version, tag: revision.startsWith("v") ? revision : `v${version}` }
}

/** git merge-base --is-ancestor 用退出码表达结果，tryGit 吞掉了非零码，这里单独判定 */
function isAncestorOf(tag: string, revision: string): boolean {
    try {
        execFileSync("git", ["merge-base", "--is-ancestor", tag, revision], { cwd: ROOT, stdio: "ignore" })
        return true
    } catch {
        return false
    }
}

const PREVIOUS_TAG_DEPS: PreviousTagDeps = { tryGit, isAncestor: isAncestorOf }

function readCommitData(revision: string, previousTag: string): CommitData {
    const args = ["log", "--no-merges", "--pretty=format:%x1e%h%x09%s%n%b"]
    if (previousTag) {
        args.push(`${previousTag}..${revision}`, "-n", "60")
    } else {
        args.push("-n", "30", revision)
    }
    const raw = tryGit(args)
    const records = raw
        .split("\u001e")
        .map(record => record.trim())
        .filter(Boolean)
    const subjects = records
        .map(record => {
            const firstLine = record.split(/\r?\n/, 1)[0]
            const tab = firstLine.indexOf("\t")
            return tab >= 0 ? firstLine.slice(tab + 1).trim() : ""
        })
        .filter(Boolean)
    const diffStat = previousTag ? tryGit(["diff", "--stat", `${previousTag}..${revision}`]) : ""
    return { subjects, log: records.join("\n\n"), diffStat }
}

/** 读取完整提交标题列表：Release 正文的折叠区不能截断，否则会丢版本内的提交 */
function readAllSubjects(revision: string, previousTag: string): string[] {
    const args = ["log", "--no-merges", "--pretty=format:%s"]
    // 有上一版本时按区间取全量；没有区间就退回卡片同样的上限，避免把整个历史塞进 release
    if (previousTag) args.push(`${previousTag}..${revision}`)
    else args.push("-n", "30", revision)
    return tryGit(args)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
}

function todayInShanghai(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
        .format(new Date())
        .replaceAll("-", ".")
}

function iconDataUrl(): string {
    const iconPath = path.join(ROOT, "apps/web/public/app-icon.png")
    if (!existsSync(iconPath)) return ""
    return `data:image/png;base64,${readFileSync(iconPath).toString("base64")}`
}

/** 把结果写进 GitHub Actions 的步骤 output，供后续步骤渲染 summary */
function writeStepOutput(lines: string): void {
    const file = process.env.GITHUB_OUTPUT
    if (!file) return
    appendFileSync(file, lines.endsWith("\n") ? lines : `${lines}\n`)
}

function printContent(content: CardContent, source: string): void {
    console.log(`\n=== 更新内容（${source}）===`)
    console.log(`标题：${content.title}`)
    if (content.subtitle) console.log(`副标题：${content.subtitle}`)
    if (content.highlights.length > 0) {
        console.log("亮点：")
        for (const highlight of content.highlights) console.log(`  ${highlight.icon} ${highlight.title} — ${highlight.description}`)
    }
    console.log("分组：")
    for (const section of content.sections) {
        console.log(`  ${section.heading}（${section.items.length}）`)
        for (const item of section.items) console.log(`    - ${item.name ? `${item.name}：` : ""}${item.description}`)
    }
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
        printUsage()
        return
    }

    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string }
    const revision = options.tag || process.env.GITHUB_REF_NAME || "HEAD"
    if (!tryGit(["rev-parse", "--verify", revision])) throw new Error(`git 中找不到版本：${revision}`)

    const { version, tag } = resolveVersion(revision, pkg.version)
    // HEAD 预览时 package.json 的版本往往还没跟上，区间取「最近 tag 之后」；正式发布仍用当前 tag 作上界
    const upperTag = revision === "HEAD" ? "HEAD" : tag
    const previousTag = resolvePreviousTag(options.previous || process.env.PREVIOUS_TAG || "", revision, tag, PREVIOUS_TAG_DEPS)
    const previousVersion = previousTag ? previousTag.replace(/^v/i, "") : ""
    const repo = options.repo || process.env.GITHUB_REPOSITORY || DEFAULT_REPO
    const meta: VersionMeta = {
        version,
        previousVersion,
        tag,
        upperTag,
        previousTag,
        date: todayInShanghai(),
        repo,
        site: SITE,
    }

    const commitData = readCommitData(upperTag, previousTag)
    const summary = summarizeCommits(commitData.subjects)

    console.log("=== 版本 ===")
    // HEAD 预览时 tag 由 package.json 推导，上一版本可能同名，此时写成 "v1.5.2 → v1.5.2" 会误导
    const rangeLine = previousTag && previousTag !== tag ? `${previousTag} → ${tag}` : `${previousTag ? `${previousTag} 之后` : tag}`
    console.log(`${rangeLine}（${commitData.subjects.length} 个提交）`)

    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY || ""
    const baseUrl = process.env.DEEPSEEK_BASE_URL || process.env.AI_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL
    const model = options.aiModel || process.env.DEEPSEEK_MODEL || process.env.AI_MODEL || DEFAULT_DEEPSEEK_MODEL

    let content: CardContent
    let html: string | null = null
    let releaseNotes = ""
    let contentSource = "规则摘要"
    if (options.noAi) {
        console.log("\n--no-ai：使用规则摘要")
        content = fallbackCardContent(summary, meta)
    } else if (!apiKey) {
        throw new ConfigError("未配置 DEEPSEEK_API_KEY，无法生成更新卡片")
    } else {
        console.log(`\n=== 卡片生成 agent（${model}）===`)
        try {
            const generated = await runCardAgent({
                apiKey,
                baseUrl,
                model,
                root: ROOT,
                meta,
                log: line => console.log(line),
            })
            html = generated.html
            releaseNotes = generated.releaseNotes
            content = {
                ...fallbackCardContent(summary, meta),
                title: generated.title || `v${version} 更新`,
                body: generated.body,
            }
            contentSource = `agent · ${generated.rounds} 轮 / ${generated.compactions} 次压缩 / ${generated.tokens} tokens`
        } catch (error) {
            // Key / 地址配错属于配置问题，直接跳过；接口临时故障才回退规则模板
            if (error instanceof ConfigError) throw error
            console.warn(`卡片生成 agent 失败，回退到规则模板：${error instanceof Error ? error.message : error}`)
            content = fallbackCardContent(summary, meta)
            contentSource = "规则模板（agent 失败）"
        }
    }

    if (options.title) {
        content.title = options.title
        // --title 要落到实际截图用的 HTML 上；agent 的 HTML 无法改写标题，只能退回模板
        if (html) {
            console.warn("  --title 已指定：agent 生成的 HTML 无法改写标题，改用兜底模板渲染")
            html = null
        }
    }
    if (options.text) content.body = options.text
    content.body = finalizeBody(content.body, meta)
    printContent(content, contentSource)

    console.log("\n=== 动态正文 ===")
    console.log(content.body)

    const outPath = path.resolve(ROOT, options.out || path.join(".tmp", "bili-dynamic", `${tag}.png`))
    let imagePath = outPath
    if (options.image) {
        imagePath = path.resolve(ROOT, options.image)
        if (!existsSync(imagePath)) throw new Error(`图片不存在：${imagePath}`)
    } else {
        mkdirSync(path.dirname(outPath), { recursive: true })
        // --out 不带 .png 时不能拿 replace 推导，否则 html/txt 会被写进同一路径再被截图覆盖
        const basePath = /\.png$/i.test(outPath) ? outPath.replace(/\.png$/i, "") : outPath
        const htmlPath = `${basePath}.html`
        const textPath = `${basePath}.txt`
        writeFileSync(
            htmlPath,
            html ??
                renderFallbackHtml({
                    content,
                    version,
                    previousVersion,
                    date: meta.date,
                    iconDataUrl: iconDataUrl(),
                    repo,
                    site: SITE,
                }),
            "utf8"
        )
        writeFileSync(textPath, `${content.body}\n`, "utf8")

        // release 页正文：agent 生成的 markdown + 折叠的原始提交；没有生成结果时走原版
        const releasePath = `${basePath}.release.md`
        const releaseBody = buildReleaseNotes({
            tag,
            previousTag,
            repo,
            generated: releaseNotes,
            // 卡片摘要只需要代表性提交，折叠区则要完整列表，所以这里单独取一次
            commitSubjects: readAllSubjects(upperTag, previousTag),
            deltaLine: process.env.DELTA_LINE || undefined,
            installerUrl: process.env.INSTALLER_URL || undefined,
        })
        writeFileSync(releasePath, releaseBody, "utf8")
        // 只有 agent 真的产出了 markdown 才让工作流去覆盖 release 正文；否则保留原版
        if (releaseNotes) writeStepOutput(`release_notes_path=${releasePath}\n`)
        console.log(`  Release 正文：${path.relative(ROOT, releasePath)}（${releaseNotes ? "agent 生成" : "原版 git log"}）`)

        console.log("\n=== 渲染卡片 ===")
        const shot = await captureFullPage({
            htmlPath,
            outPath,
            width: CARD_WIDTH,
            minHeight: CARD_MIN_HEIGHT,
            scale: 2,
        })
        console.log(
            `  ${path.relative(ROOT, outPath)}（${shot.width}×${shot.height}，${(shot.bytes / 1024 / 1024).toFixed(2)} MB，${path.basename(shot.browser)}）`
        )
    }

    if (options.dryRun || process.env.BILI_DRY_RUN === "1") {
        console.log("\n[dry-run] 未发布到 B 站")
        writeStepOutput("dyn_status=dry-run\n")
        return
    }
    if (process.env.BILI_SKIP === "1") {
        console.log("\nBILI_SKIP=1，跳过发布")
        writeStepOutput("dyn_status=skipped\ndyn_reason=BILI_SKIP=1\n")
        return
    }

    const state = readCredentials(process.env)
    if (state.status === "none") throw new ConfigError("未配置 B 站凭据（BILI_COOKIE 或 BILI_SESSDATA/BILI_JCT）")
    if (state.status === "partial") throw new ConfigError(`B 站凭据不完整，缺少：${state.missing.join("、")}`)

    console.log("\n=== 发布到 B 站 ===")
    const result = await publishDynamic({ imagePath, text: content.body, credentials: state.credentials })
    console.log(`\n发布成功：${result.url}`)

    // 交给工作流的 Add summary 步骤统一渲染；本地/单独运行时才自己写一条
    writeStepOutput(`dyn_status=published\ndyn_url=${result.url}\ndyn_author=${result.uname}\n`)
    if (!process.env.GITHUB_OUTPUT && process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n- [B站动态](${result.url})（${result.uname}）\n`)
    }

    const size = statSync(imagePath).size
    console.log(`卡片文件：${path.relative(ROOT, imagePath)}（${(size / 1024 / 1024).toFixed(2)} MB）`)
}

main().catch(error => {
    // 配置问题默认只跳过并留痕，不让 release 步骤变红；--strict 时才失败
    if (error instanceof ConfigError) {
        console.warn(`\n跳过发布：${error.message}`)
        console.warn("配置方法见 .agents/docs/bili-dynamic.md")
        // 让工作流的 summary 知道是「跳过」而不是「发布成功」
        writeStepOutput(`dyn_status=skipped\ndyn_reason=${error.message.replace(/\r?\n/g, " ")}\n`)
        if (!process.env.GITHUB_OUTPUT && process.env.GITHUB_STEP_SUMMARY) {
            appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n> [!WARNING]\n> B 站动态已跳过：${error.message}\n`)
        }
        if (parseArgs(process.argv.slice(2)).strict) process.exitCode = 1
        return
    }
    console.error(`\n失败：${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
})
