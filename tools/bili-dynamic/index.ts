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
  BILI_SKIP=1        跳过发布（仍会渲染卡片）`)
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

function findPreviousTag(revision: string, currentTag: string): string {
    // 本地用 HEAD 预览时 currentTag 取自 package.json，不能与自身比较（区间会退化成 X..X 空集）
    const described = tryGit(["describe", "--tags", "--abbrev=0", `${revision}^`])
    if (described) return described
    const tags = tryGit(["tag", "--sort=-creatordate"])
        .split(/\r?\n/)
        .map(tag => tag.trim())
        .filter(tag => /^v\d/.test(tag) && tag !== revision && tag !== currentTag)
    return tags[0] ?? ""
}

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
    const previousTag = options.previous || process.env.PREVIOUS_TAG || findPreviousTag(revision, tag)
    const previousVersion = previousTag ? previousTag.replace(/^v/i, "") : ""
    const repo = options.repo || process.env.GITHUB_REPOSITORY || DEFAULT_REPO
    const meta: VersionMeta = {
        version,
        previousVersion,
        tag,
        previousTag,
        date: todayInShanghai(),
        repo,
        site: SITE,
    }

    const commitData = readCommitData(revision, previousTag)
    const summary = summarizeCommits(commitData.subjects)

    console.log("=== 版本 ===")
    console.log(`${previousTag ? `${previousTag} → ` : ""}${tag}（${commitData.subjects.length} 个提交）`)

    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY || ""
    const baseUrl = process.env.DEEPSEEK_BASE_URL || process.env.AI_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL
    const model = options.aiModel || process.env.DEEPSEEK_MODEL || process.env.AI_MODEL || DEFAULT_DEEPSEEK_MODEL

    let content: CardContent
    let html: string | null = null
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

    if (options.title) content.title = options.title
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
        return
    }
    if (process.env.BILI_SKIP === "1") {
        console.log("\nBILI_SKIP=1，跳过发布")
        return
    }

    const state = readCredentials(process.env)
    if (state.status === "none") throw new ConfigError("未配置 B 站凭据（BILI_COOKIE 或 BILI_SESSDATA/BILI_JCT）")
    if (state.status === "partial") throw new ConfigError(`B 站凭据不完整，缺少：${state.missing.join("、")}`)

    console.log("\n=== 发布到 B 站 ===")
    const result = await publishDynamic({ imagePath, text: content.body, credentials: state.credentials })
    console.log(`\n发布成功：${result.url}`)

    if (process.env.GITHUB_STEP_SUMMARY) {
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
        if (process.env.GITHUB_STEP_SUMMARY) {
            appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n> [!WARNING]\n> B 站动态已跳过：${error.message}\n`)
        }
        if (parseArgs(process.argv.slice(2)).strict) process.exitCode = 1
        return
    }
    console.error(`\n失败：${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
})
