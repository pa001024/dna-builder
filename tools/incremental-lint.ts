#!/usr/bin/env bun
/**
 * @file 增量 lint 驱动器 —— `pnpm lint` 的实现。
 *
 * vue-tsc 每次都把整个工程（本仓库约 600 个源文件、4000 个程序文件）重新检查一遍，
 * 单次约 120~140s，而绝大多数改动只涉及其中很小的一部分。本脚本把类型检查交给
 * tsc-rs（TypeScript 7 原生编译器的 Rust 移植）全量检查（约 10s），再按增量口径
 * 只展示「改动文件 + 依赖它们的下游文件」的诊断 —— 上游文件的错误在各自被改的
 * 那次已经查过，不再重复打扰。`.vue` 文件经 tsc-rs-vue-mapper（content-mapper
 * 插件，用 @vue/language-core 与 vue-tsc 相同的 codegen 展开虚拟代码）参与检查，
 * 诊断位置自动映射回原文件。
 *
 * Rust 引擎解析与检查 103MB 数据字面量也在秒级，因此不需要旧版的数据文件声明替换、
 * components.d.ts 裁剪等程序内裁剪手段：program 恒为全量，控制力只体现在诊断过滤。
 *
 * 工作流程：
 * 1. 按 `tsconfig.json` 的 include/exclude 枚举工程内源文件，另枚举数据文件
 *    （tsconfig 排除了它们，但它们通过 import 参与 program，必须纳入指纹与依赖图，
 *    且本次直接以真实源码参与检查），记录 mtime + size 指纹；
 * 2. 与上次「检查通过」时写入 `.tmp/lint-cache.json` 的指纹比对，得到新增 / 修改 / 删除集合；
 * 3. 用缓存的 import 关系图求反向依赖闭包：改动文件 + 所有直接/间接依赖它们的文件
 *    （改动一个导出类型时，用到它的文件同样会报错，必须一起展示）即诊断根集合；
 * 4. 环境声明文件（`*.d.ts`、含 `declare global` / `declare module` 的文件）恒在
 *    program 内参与编译，但只在根集合命中时才展示它们的诊断；
 * 5. tsc-rs 全量检查并只展示根集合的诊断；环境声明的全局类型面变更或影响面过半时
 *    展示全部诊断 —— 日常 lint 永不触发分钟级的 vue-tsc CLI 全量；
 * 6. Biome 只处理改动过的文件。
 *
 * `--full` / `pnpm lint:full` 走真 vue-tsc CLI 全量（不替换数据文件），是唯一
 * 覆盖数据体错误检查的最终真相。
 *
 * 没有任何文件改动时直接跳过，秒过。
 *
 * 用法（一般通过 pnpm 脚本调用）：
 *   bun tools/incremental-lint.ts [--full] [--no-biome] [--verbose] [--help]
 */

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { glob } from "glob"
import * as ts from "typescript"

/** 工程根目录：本文件位于 `<root>/tools/` 下 */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
/** 临时文件目录（已被 .gitignore 忽略），指纹缓存放这里 */
const TMP_DIR = path.join(PROJECT_ROOT, ".tmp")
/** 改动指纹缓存文件 */
const CACHE_FILE = path.join(TMP_DIR, "lint-cache.json")
/** 缓存结构版本：本脚本的判断语义变化时 +1，让旧缓存整体失效 */
const CACHE_VERSION = 5
/** 影响闭包超过工程文件总数的该比例时，退回自研全量诊断（增量已无意义） */
const FULL_CHECK_RATIO = 0.5
/** 单次传给 Biome 的最大文件数，避免 Windows 命令行过长 */
const BIOME_CHUNK_SIZE = 120
/** 文件指纹采集的并发度，避免 Windows 上开太多句柄 */
const STAT_CONCURRENCY = 64
/** 全量 vue-tsc CLI 需要更大的堆，保持与旧命令一致 */
const NODE_OPTIONS = "--max-old-space-size=8192"
/** 运行 vue-tsc / biome 用的 node 可执行文件（避免 .cmd / shell 包装的平台差异） */
const NODE_BIN = process.env.DNA_LINT_NODE ?? "node"
/** vue-tsc 入口（仅 --full / lint:full 路径使用） */
const VUE_TSC_ENTRY = path.join(PROJECT_ROOT, "node_modules", "vue-tsc", "bin", "vue-tsc.js")
/** tsc-rs 启动器（ESM，由 node 直接执行；node_modules/.bin 的包装在 Windows 下需要 shell） */
const TSC_RS_ENTRY = process.env.TSC_RS_BIN ?? path.join(PROJECT_ROOT, "node_modules", "tsc-rs", "bin", "tsc-rs")
/** 传给 tsc-rs 的临时 tsconfig 所在目录（.tmp 已被 git 忽略，不会污染跟踪文件） */
const TSC_RS_TMP_DIR = path.join(TMP_DIR, "tsc-rs-check")
/** 本次运行的临时 tsconfig 路径（带 PID，防并发 lint 互踩） */
const TSC_RS_TMP_CONFIG = path.join(TSC_RS_TMP_DIR, `tsconfig.${process.pid}.json`)
/** 最小 program 的临时 tsconfig 路径（数据值变动快径） */
const TSC_RS_TMP_MIN_CONFIG = path.join(TSC_RS_TMP_DIR, `tsconfig.min.${process.pid}.json`)
/** 残留临时配置的超时时间：早于此的无主文件才清理（毫秒） */
const TSC_RS_TMP_STALE_MS = 10 * 60 * 1000
/** tsc-rs-vue-mapper 在 tsconfig 里的包名（contentMappers 口径） */
const VUE_MAPPER_PACKAGE = "tsc-rs-vue-mapper"
/** tsc-rs-data-mapper 在 tsconfig 里的包名：按 manifest 用缓存声明覆盖数据文件内容 */
const DATA_MAPPER_PACKAGE = "tsc-rs-data-mapper"
/** 数据文件声明缓存的目录，内容按「路径 + mtime + size」寻址 */
const DATA_DECL_DIR = path.join(TMP_DIR, "lint-data-decls")
/** 数据声明 manifest 文件名（位于 tsc-rs 临时配置同目录，供 data-mapper 读取） */
const DATA_DECL_MANIFEST = "data-decls.json"
/** Biome 入口 */
const BIOME_ENTRY = path.join(PROJECT_ROOT, "node_modules", "@biomejs", "biome", "bin", "biome")
/** Biome 可能处理的文件（超集，仅用于判断 Biome 要不要重跑） */
const LINT_GLOBS = ["**/*.{ts,tsx,mts,cts,vue,js,mjs,cjs,jsx,json,jsonc,json5,css,html}"]
/** 遍历 Biome 文件集时需要跳过的目录（node_modules、构建产物、各类工具缓存） */
const LINT_IGNORES = [
    "**/node_modules/**",
    "**/.git/**",
    "**/.tmp/**",
    "**/dist/**",
    "**/dist-ssr/**",
    "**/target/**",
    "**/coverage/**",
    "**/test-results/**",
    "**/output/**",
    "**/docs/**",
    "**/mock/**",
    "**/skills/**",
    "**/weixin/**",
    "**/.claude/**",
    "**/.codex/**",
    "**/.moonagent/**",
    "**/.omx/**",
    "**/.opencode/**",
    "**/.planning/**",
    "**/.playwright/**",
    "**/.playwright-cli/**",
    "**/.serena/**",
    "**/.trae/**",
    "**/.umap-cache/**",
    "**/.umap-export/**",
    "**/.workbuddy/**",
    "**/.vscode/**",
    "**/.idea/**",
    "externals/graphql-mobius/**",
    "public/imgs/**",
    "public/audio/**",
    "public/shaders/**",
    "src/data/txt/**",
    "src-tauri/gen/**",
    "src-tauri/sidecar/**",
]
/** 数据文件判定：与数据包改写插件同口径（tsconfig include 排除了它们） */
const DATA_GLOBS = ["src/data/d/**/*.data.ts"]
/** import / export ... from / require / 动态 import 的说明符抽取（宁可多抽，不可漏抽） */
const SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)["']([^"']+)["']/g
/** 环境声明判定：`.d.ts` 或源码里的 declare global / declare module */
const AMBIENT_PATTERN = /\bdeclare\s+(?:global|module)\b/
/** 可以当作 import 目标解析的扩展名补全顺序 */
const RESOLVE_SUFFIXES = [".ts", ".tsx", ".mts", ".cts", ".vue", ".d.ts", "/index.ts", "/index.tsx", "/index.vue"]

/** 单个文件的改动指纹 */
interface FileStamp {
    /** 修改时间（毫秒），与 size 一起判定文件是否变化 */
    mtimeMs: number
    /** 文件字节数 */
    size: number
}

/** TS 依赖图里的单个节点 */
interface GraphNode {
    /** 该文件 import/require 到的工程内文件（相对工程根的 posix 路径） */
    imports: string[]
    /** 是否环境声明文件（`.d.ts` 或含 declare global/module），必须始终留在程序里 */
    ambient: boolean
    /** 全局类型面哈希（`.d.ts` 全文 / 其余文件 declare 块文本的 sha1，无则为空串），判定环境声明是否真变 */
    ambientHash: string
}

/** 数据文件的声明缓存条目：源码指纹区分「值变」，声明哈希区分「类型变」 */
interface DataDeclEntry {
    /** 生成声明时的源文件指纹（mtime + size），变化即数据变动 */
    stamp: FileStamp
    /** 声明文本的 sha1，变化即类型变动（下游必须重查） */
    declHash: string
    /** 声明缓存在 DATA_DECL_DIR 下的文件名 */
    file: string
}

/** `.tmp/lint-cache.json` 的结构 */
interface LintCache {
    /** 缓存结构版本 */
    version: number
    /** 工具链指纹：tsconfig / 依赖清单 / 本脚本语义变化时整体失效 */
    fingerprint: string
    /** 上次检查通过的时间（ISO），仅供参考 */
    lastRunAt: string | null
    /** TS 工程文件（含数据文件）的 mtime/size 指纹 */
    tsStamps: Record<string, FileStamp>
    /** TS 文件之间的依赖图 */
    tsGraph: Record<string, GraphNode>
    /** 数据文件 → 声明缓存条目（声明文件与源内容严格对应） */
    dataDecls: Record<string, DataDeclEntry>
    /** Biome 文件集的 mtime/size 指纹（超集，仅用于判断 Biome 是否需要重跑） */
    lintStamps: Record<string, FileStamp>
}

/** 命令行选项 */
interface CliOptions {
    /** 忽略缓存，强制执行全量检查 */
    full: boolean
    /** 跳过 Biome，只做类型检查 */
    skipBiome: boolean
    /** 打印更多过程信息 */
    verbose: boolean
    /** 打印帮助 */
    help: boolean
}

/** 文件新增 / 修改 / 删除集合 */
interface ChangeSet {
    added: string[]
    modified: string[]
    deleted: string[]
}

/**
 * 解析命令行参数。
 *
 * @param argv process.argv.slice(2)
 * @returns 归一化后的选项
 */
function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = { full: false, skipBiome: false, verbose: false, help: false }
    for (const arg of argv) {
        if (arg === "--full" || arg === "-f") options.full = true
        else if (arg === "--no-biome") options.skipBiome = true
        else if (arg === "--verbose" || arg === "-v") options.verbose = true
        else if (arg === "--help" || arg === "-h") options.help = true
        else throw new Error(`未知参数：${arg}（用 --help 查看用法）`)
    }
    return options
}

/**
 * 打印用法说明。
 */
function printHelp(): void {
    console.log(`增量 lint 驱动器

用法：
    bun tools/incremental-lint.ts [选项]

选项：
    -f, --full      忽略缓存，走真 vue-tsc 全量检查（等价于 pnpm lint:full 的类型检查）
        --no-biome  只做类型检查，不跑 Biome
    -v, --verbose   打印检查范围等过程信息
    -h, --help      显示本帮助

缓存：
    .tmp/lint-cache.json 记录各文件的修改时间戳、依赖图与数据文件声明缓存索引；
    删除该文件（或 .tmp 目录）即可回到首次检查的状态。`)
}

/**
 * 解析带注释与尾逗号的 JSON（tsconfig.json 里就有注释）。
 * 手写状态机剥离 `//`、`/* *\/` 注释与尾逗号，避免为读一个配置引入额外依赖。
 *
 * @param text 原始文本
 * @returns 解析结果
 */
function parseJsonc(text: string): unknown {
    let out = ""
    let inString = false
    let inLineComment = false
    let inBlockComment = false

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index]
        const next = text[index + 1]

        if (inLineComment) {
            if (char === "\n") {
                inLineComment = false
                out += char
            }
            continue
        }
        if (inBlockComment) {
            if (char === "*" && next === "/") {
                inBlockComment = false
                index += 1
            }
            continue
        }
        if (inString) {
            out += char
            if (char === "\\") {
                out += next ?? ""
                index += 1
            } else if (char === '"') {
                inString = false
            }
            continue
        }
        if (char === '"') {
            inString = true
            out += char
            continue
        }
        if (char === "/" && next === "/") {
            inLineComment = true
            index += 1
            continue
        }
        if (char === "/" && next === "*") {
            inBlockComment = true
            index += 1
            continue
        }
        if (char === ",") {
            // 尾逗号：向后跳过空白，若紧跟 } 或 ] 则整段丢弃
            let lookahead = index + 1
            while (lookahead < text.length && /\s/.test(text[lookahead])) lookahead += 1
            if (text[lookahead] === "}" || text[lookahead] === "]") continue
        }
        out += char
    }

    return JSON.parse(out)
}

/**
 * 读取文本文件；文件不存在或不可读时返回 null。
 *
 * @param absPath 绝对路径
 * @returns 文件内容或 null
 */
async function readTextSafe(absPath: string): Promise<string | null> {
    try {
        return await readFile(absPath, "utf8")
    } catch {
        return null
    }
}

/**
 * 读取文件指纹；文件不存在时返回 null。
 *
 * @param absPath 绝对路径
 * @returns mtime + size 或 null
 */
async function statSafe(absPath: string): Promise<FileStamp | null> {
    try {
        const info = await stat(absPath)
        if (!info.isFile()) return null
        return { mtimeMs: info.mtimeMs, size: info.size }
    } catch {
        return null
    }
}

/**
 * 批量采集文件指纹（分批并发，避免一次性打开过多句柄）。
 *
 * @param files 相对工程根的 posix 路径列表
 * @returns 路径 → 指纹
 */
async function collectStamps(files: string[]): Promise<Record<string, FileStamp>> {
    const stamps: Record<string, FileStamp> = {}
    for (let index = 0; index < files.length; index += STAT_CONCURRENCY) {
        const chunk = files.slice(index, index + STAT_CONCURRENCY)
        const results = await Promise.all(chunk.map(async rel => [rel, await statSafe(path.join(PROJECT_ROOT, rel))] as const))
        for (const [rel, stamp] of results) {
            if (stamp) stamps[rel] = stamp
        }
    }
    return stamps
}

/**
 * 比对前后两次指纹，得出新增 / 修改 / 删除的文件。
 *
 * @param previous 上次记录的指纹
 * @param current 本次采集的指纹
 * @returns 改动集合（相对路径，已排序）
 */
function diffStamps(previous: Record<string, FileStamp>, current: Record<string, FileStamp>): ChangeSet {
    const added: string[] = []
    const modified: string[] = []
    const deleted: string[] = []

    for (const [rel, stamp] of Object.entries(current)) {
        const before = previous[rel]
        if (!before) added.push(rel)
        else if (before.mtimeMs !== stamp.mtimeMs || before.size !== stamp.size) modified.push(rel)
    }
    for (const rel of Object.keys(previous)) {
        if (!current[rel]) deleted.push(rel)
    }

    return { added: added.sort(), modified: modified.sort(), deleted: deleted.sort() }
}

/**
 * 判断改动集合是否为空。
 *
 * @param changes 改动集合
 * @returns 三个子集合都为空时返回 true
 */
function isClean(changes: ChangeSet): boolean {
    return changes.added.length === 0 && changes.modified.length === 0 && changes.deleted.length === 0
}

/**
 * 读取根 tsconfig 的 include / exclude。
 * 本工程只用了字符串数组形式，遇到引用其它 config 的复杂写法时直接报错，
 * 避免静默地把检查范围算错。
 *
 * @returns include / exclude 模式列表
 */
async function loadTsProject(): Promise<{ include: string[]; exclude: string[] }> {
    const raw = await readTextSafe(path.join(PROJECT_ROOT, "tsconfig.json"))
    if (!raw) throw new Error("找不到 tsconfig.json")

    const parsed = parseJsonc(raw) as { include?: unknown; exclude?: unknown; extends?: unknown }
    if (parsed.extends) throw new Error("tsconfig.json 使用了 extends，增量脚本无法推断检查范围，请改用 pnpm lint:full")

    const toPatterns = (value: unknown, field: string): string[] => {
        if (value === undefined) return []
        if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
            throw new Error(`tsconfig.json 的 ${field} 不是字符串数组，增量脚本无法解析，请改用 pnpm lint:full`)
        }
        return value as string[]
    }

    const include = toPatterns(parsed.include, "include")
    if (include.length === 0) throw new Error("tsconfig.json 未配置 include，增量脚本无法推断检查范围，请改用 pnpm lint:full")

    return { include, exclude: toPatterns(parsed.exclude, "exclude") }
}

/**
 * 枚举工程内的 TS / Vue 源文件（tsconfig include 口径，不含被 exclude 的数据文件）。
 *
 * @param include tsconfig 的 include
 * @param exclude tsconfig 的 exclude
 * @returns 相对工程根的 posix 路径（已排序）
 */
async function listTsFiles(include: string[], exclude: string[]): Promise<string[]> {
    const files = await glob(include, { cwd: PROJECT_ROOT, ignore: exclude, nodir: true, posix: true })
    return files.sort()
}

/**
 * 枚举数据文件（DATA_GLOBS 口径的 `*.data.ts`）。
 * 它们被 tsconfig 排除、只通过 import 参与 program，但改动会波及引用方，
 * 必须纳入指纹与依赖图。
 *
 * @returns 相对工程根的 posix 路径（已排序）
 */
async function listDataFiles(): Promise<string[]> {
    const files = await glob(DATA_GLOBS, { cwd: PROJECT_ROOT, nodir: true, posix: true })
    return files.sort()
}

/**
 * 枚举 Biome 可能处理的文件（比 tsconfig 范围更宽，用于判断 Biome 能否跳过）。
 *
 * @returns 相对工程根的 posix 路径（已排序）
 */
async function listLintFiles(): Promise<string[]> {
    const files = await glob(LINT_GLOBS, {
        cwd: PROJECT_ROOT,
        ignore: LINT_IGNORES,
        nodir: true,
        posix: true,
        dot: true,
    })
    return files.sort()
}

/**
 * 计算工具链指纹：tsconfig、依赖清单、Biome 配置或缓存结构变化时，缓存整体失效。
 *
 * @returns sha1 摘要
 */
async function computeFingerprint(): Promise<string> {
    const hash = createHash("sha1")
    hash.update(`v${CACHE_VERSION}`)
    for (const rel of ["tsconfig.json", "package.json", "pnpm-lock.yaml", "biome.json"]) {
        hash.update(rel)
        hash.update((await readTextSafe(path.join(PROJECT_ROOT, rel))) ?? "<missing>")
    }
    return hash.digest("hex")
}

/**
 * 读取缓存文件，内容不合法时按「无缓存」处理。
 *
 * @returns 缓存对象或 null
 */
async function loadCache(): Promise<LintCache | null> {
    const raw = await readTextSafe(CACHE_FILE)
    if (!raw) return null
    try {
        return JSON.parse(raw) as LintCache
    } catch {
        return null
    }
}

/**
 * 写入缓存文件。
 *
 * @param cache 完整缓存对象
 */
async function saveCache(cache: LintCache): Promise<void> {
    await mkdir(TMP_DIR, { recursive: true })
    await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 4)}\n`, "utf8")
}

/**
 * 取出 `.vue` 文件的 script 块；模板 / 样式里的字符串不参与依赖分析。
 *
 * @param text 文件全文
 * @param isVue 是否为 .vue 单文件组件
 * @returns 用于抽取 import 的文本
 */
function extractScriptText(text: string, isVue: boolean): string {
    if (!isVue) return text
    const blocks = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    return blocks.map(block => block[1]).join("\n")
}

/**
 * 抽取源码里所有 import / export ... from / require / 动态 import 的说明符。
 *
 * @param text 源码文本
 * @returns 说明符列表（未解析）
 */
function extractSpecifiers(text: string): string[] {
    const specifiers: string[] = []
    for (const match of text.matchAll(SPECIFIER_PATTERN)) {
        if (match[1]) specifiers.push(match[1])
    }
    return specifiers
}

/**
 * 把 import 说明符解析成工程内文件路径。
 * 只处理相对路径与 `@/` 别名；裸包名、`virtual:` 等不属于工程内文件，返回 null。
 *
 * @param specifier import 说明符（可能带 `?raw` 等查询串）
 * @param fromRel 发起 import 的文件（相对工程根）
 * @param known 工程内文件集合
 * @returns 命中的工程内文件路径或 null
 */
function resolveSpecifier(specifier: string, fromRel: string, known: Set<string>): string | null {
    const clean = specifier.split("?")[0].split("#")[0]
    if (!clean) return null

    let target: string
    if (clean.startsWith("@/")) target = path.posix.join("src", clean.slice(2))
    else if (clean.startsWith("./") || clean.startsWith("../")) target = path.posix.join(path.posix.dirname(fromRel), clean)
    else if (clean.startsWith("/")) target = clean.replace(/^\/+/, "")
    else return null

    if (known.has(target)) return target
    for (const suffix of RESOLVE_SUFFIXES) {
        const candidate = `${target}${suffix}`
        if (known.has(candidate)) return candidate
    }
    return null
}

/**
 * 判断文件是否承载全局 / 模块声明（这类文件必须始终留在程序里，否则会丢类型、产生假报错）。
 *
 * @param rel 相对工程根路径
 * @param text 源码文本
 * @returns 是环境声明文件时返回 true
 */
function isAmbientFile(rel: string, text: string): boolean {
    return rel.endsWith(".d.ts") || AMBIENT_PATTERN.test(text)
}

/**
 * 跳过一段空白字符。
 *
 * @param text 源码文本
 * @param index 起始下标
 * @returns 第一个非空白字符的下标（可能等于 text.length）
 */
function skipSpace(text: string, index: number): number {
    while (index < text.length && /\s/.test(text[index] as string)) index += 1
    return index
}

/**
 * 跳过一个字符串字面量（' " ` 均支持，处理反斜杠转义）。
 * 不处理模板字符串插值——类型声明块里不会出现；即使出现也只造成哈希抖动，
 * 后果是多跑一次全量，方向保守。
 *
 * @param text 源码文本
 * @param start 引号字符的下标
 * @returns 结束引号之后一位的下标（未闭合时为 text.length）
 */
function skipString(text: string, start: number): number {
    const quote = text[start] as string
    let index = start + 1
    while (index < text.length) {
        const char = text[index] as string
        if (char === "\\") {
            index += 2
            continue
        }
        if (char === quote) return index + 1
        index += 1
    }
    return index
}

/**
 * 从 `{` 起做括号配平扫描，返回配平 `}` 之后一位的下标；扫描中跳过注释与字符串，
 * 避免字面量里的引号 / 大括号干扰配平。扫描到文末仍未配平（文件被截断）时返回 -1。
 *
 * @param text 源码文本
 * @param openBraceIndex `{` 的下标
 * @returns 块结束下标（闭合 `}` 的下一位）或 -1
 */
function scanBalancedBraces(text: string, openBraceIndex: number): number {
    let depth = 0
    let index = openBraceIndex
    while (index < text.length) {
        const char = text[index] as string
        const next = text[index + 1]
        if (char === "/" && next === "/") {
            const lineEnd = text.indexOf("\n", index)
            if (lineEnd < 0) return -1
            index = lineEnd + 1
            continue
        }
        if (char === "/" && next === "*") {
            const blockEnd = text.indexOf("*/", index + 2)
            if (blockEnd < 0) return -1
            index = blockEnd + 2
            continue
        }
        if (char === '"' || char === "'" || char === "`") {
            index = skipString(text, index)
            continue
        }
        if (char === "{") depth += 1
        else if (char === "}") {
            depth -= 1
            if (depth === 0) return index + 1
        }
        index += 1
    }
    return -1
}

/**
 * 抽取源码里的全局声明文本（按出现顺序拼接，参与哈希）。
 * 有体形式（`declare global { ... }`、`declare module "x" { ... }`）取整个块；
 * 无体形式（`declare module "x";`）取到行尾 / 分号——它同样扩充全局类型，出现与否必须参与哈希。
 * 注释 / 字符串里偶然出现的 declare 字样最坏只造成哈希抖动（多跑一次全量），方向保守。
 *
 * @param scriptText 参与依赖分析的文本（.vue 已抽取 script 块）
 * @returns 声明块文本；没有任何声明时为空串
 */
function extractAmbientSurface(scriptText: string): string {
    const pieces: string[] = []
    const pattern = /\bdeclare\s+(?:global|module)\b/g
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(scriptText)) !== null) {
        const start = match.index
        let index = skipSpace(scriptText, start + match[0].length)
        // declare module "名字" { 的名字串
        const quote = scriptText[index]
        if (quote === '"' || quote === "'" || quote === "`") {
            index = skipSpace(scriptText, skipString(scriptText, index))
        }
        if (scriptText[index] === "{") {
            const end = scanBalancedBraces(scriptText, index)
            if (end < 0) break
            pieces.push(scriptText.slice(start, end))
            pattern.lastIndex = end
        } else {
            // 无体声明：取到分号或行尾
            const lineEnd = scriptText.indexOf("\n", index)
            const semi = scriptText.indexOf(";", index)
            const stop = semi >= 0 && (lineEnd < 0 || semi < lineEnd) ? semi : lineEnd
            if (stop < 0) {
                pieces.push(scriptText.slice(start))
                break
            }
            pieces.push(scriptText.slice(start, semi === stop ? stop + 1 : stop))
            pattern.lastIndex = stop
        }
    }
    return pieces.join("\n")
}

/**
 * 计算文件的全局类型面哈希：`.d.ts` 用全文（整份文件都是类型面），
 * 其余文件用 declare 块文本；没有任何全局类型面时返回空串（与「未知 / 无缓存」同口径）。
 *
 * @param rel 相对工程根路径（用于区分 .d.ts）
 * @param scriptText 参与依赖分析的文本（.vue 已抽取 script 块）
 * @returns sha1 哈希或空串
 */
function ambientSurfaceHash(rel: string, scriptText: string): string {
    const surface = rel.endsWith(".d.ts") ? scriptText : extractAmbientSurface(scriptText)
    if (surface === "") return ""
    return createHash("sha1").update(surface).digest("hex")
}

/**
 * 解析单个 TS 文件的依赖图节点。
 *
 * @param rel 相对工程根路径
 * @param known 工程内文件集合
 * @returns 依赖图节点
 */
async function buildGraphNode(rel: string, known: Set<string>): Promise<GraphNode> {
    const text = (await readTextSafe(path.join(PROJECT_ROOT, rel))) ?? ""
    const scriptText = extractScriptText(text, rel.endsWith(".vue"))
    const imports = new Set<string>()
    for (const specifier of extractSpecifiers(scriptText)) {
        const resolved = resolveSpecifier(specifier, rel, known)
        if (resolved && resolved !== rel) imports.add(resolved)
    }
    return { imports: [...imports].sort(), ambient: isAmbientFile(rel, scriptText), ambientHash: ambientSurfaceHash(rel, scriptText) }
}

/**
 * 建立 / 复用工程依赖图。只有内容变过的文件才重新解析，其余直接取缓存节点。
 *
 * @param files 工程内文件列表（工程文件 + 数据文件）
 * @param known 工程内文件集合
 * @param cached 上次的依赖图
 * @param rebuildAll 是否整体重建（缓存失效或有文件增删时）
 * @param changed 本次内容变化过的文件集合
 * @returns 路径 → 依赖图节点
 */
async function buildGraph(
    files: string[],
    known: Set<string>,
    cached: Record<string, GraphNode>,
    rebuildAll: boolean,
    changed: Set<string>
): Promise<Record<string, GraphNode>> {
    const graph: Record<string, GraphNode> = {}
    const pending: string[] = []

    for (const rel of files) {
        const node = cached[rel]
        if (!rebuildAll && node && !changed.has(rel)) graph[rel] = node
        else pending.push(rel)
    }

    for (let index = 0; index < pending.length; index += STAT_CONCURRENCY) {
        const chunk = pending.slice(index, index + STAT_CONCURRENCY)
        const nodes = await Promise.all(chunk.map(async rel => [rel, await buildGraphNode(rel, known)] as const))
        for (const [rel, node] of nodes) graph[rel] = node
    }

    return graph
}

/**
 * 过滤改动集合中的纯值变数据文件：指纹变了但声明哈希没变（类型未变），下游视图不变，
 * 不应作为根种子；类型变动、生成失败、新增、删除的数据文件保留。
 *
 * @param changes 原始改动集合
 * @param dataPlan 数据声明准备结果；null 表示未跑声明准备（原样返回）
 * @returns 过滤后的改动集合
 */
export function filterDataOnlySeeds(changes: ChangeSet, dataPlan: DataDeclPlan | null): ChangeSet {
    if (dataPlan === null) return changes
    return {
        added: changes.added,
        modified: changes.modified.filter(rel => !isDataFile(rel) || dataPlan.typeChanged.has(rel) || dataPlan.genFailed.has(rel)),
        deleted: changes.deleted,
    }
}

/**
 * 由依赖图求前向闭包：种子文件 + 它们直接/间接 import 的文件（类型上下文所需）。
 *
 * @param seeds 种子文件（相对路径）
 * @param graph 依赖图
 * @returns 闭包文件集合
 */
function forwardClosure(seeds: string[], graph: Record<string, GraphNode>): Set<string> {
    const seen = new Set<string>()
    const queue = [...seeds]
    while (queue.length > 0) {
        const current = queue.pop() as string
        if (seen.has(current)) continue
        seen.add(current)
        for (const dependency of graph[current]?.imports ?? []) {
            if (!seen.has(dependency)) queue.push(dependency)
        }
    }
    return seen
}

/**
 * 规划数据值变动的最小检查 program。满足全部条件才走快径，否则返回 null 走全量：
 * - 变更全是已存在的改动数据文件（新增/删除改变图形状，保守走全量）；
 * - 改动文件文本不含 window./globalThis.（这类全局声明在源文件里，最小 program 不含）；
 * - 前向闭包不含 .vue 文件（模板需要 components.d.ts 的全局组件，会撑大 program）；
 * - 前向闭包不含非 .d.ts 的环境声明文件（同理，它们的全局声明不在 program 内）。
 * 最小 program = 改动文件 + 工程内 .d.ts 环境声明（components.d.ts 除外，见上）。
 *
 * @param changed 改动的数据文件：相对路径 → 源文本
 * @param graph 依赖图
 * @param ambientDts 工程内 .d.ts 环境声明文件（相对路径）
 * @returns 最小 program 的相对路径列表（含改动文件自身在前），不满足条件时返回 null
 */
export function planMinimalFiles(
    changed: { rel: string; text: string }[],
    graph: Record<string, GraphNode>,
    ambientDts: string[]
): string[] | null {
    if (changed.length === 0) return null
    for (const { text } of changed) {
        if (/(^|[^\w$.])window\.|globalThis\./.test(text)) return null
    }
    const closure = forwardClosure(
        changed.map(item => item.rel),
        graph
    )
    for (const rel of closure) {
        if (rel.endsWith(".vue")) return null
        if (rel.endsWith(".d.ts")) continue
        if (graph[rel]?.ambient) return null
    }
    return [...changed.map(item => item.rel), ...ambientDts.filter(rel => rel !== "src/components.d.ts")]
}

/**
 * 由依赖图构建反向表：被依赖的文件 → 依赖它的文件集合。
 *
 * @param graphs 依赖图列表（新旧图合并，删除的文件也要算上它原来的下游）
 * @returns 反向依赖表
 */
function buildReverseMap(graphs: Record<string, GraphNode>[]): Map<string, Set<string>> {
    const reverse = new Map<string, Set<string>>()
    for (const graph of graphs) {
        for (const [rel, node] of Object.entries(graph)) {
            for (const dependency of node.imports) {
                let bucket = reverse.get(dependency)
                if (!bucket) {
                    bucket = new Set<string>()
                    reverse.set(dependency, bucket)
                }
                bucket.add(rel)
            }
        }
    }
    return reverse
}

/**
 * 计算本次类型检查的根文件集合（诊断范围）：
 * 改动 / 删除的文件 + 所有（直接或间接）依赖它们的文件。
 *
 * 注意：环境声明文件不在这里种子 —— 未改动的环境声明只需要进 program（保证全局类型可用），
 * 不需要被诊断；把它们连传递依赖一起种子会让几乎所有编辑都膨胀成全量。
 * 环境声明文件「全局类型面变更」的场合由主流程整体退回全量诊断。
 *
 * @param changes 改动集合
 * @param graphs 依赖图列表（当前图在前）
 * @param existing 当前实际存在的文件集合
 * @returns 根文件列表（已排序）
 */
function computeRoots(changes: ChangeSet, graphs: Record<string, GraphNode>[], existing: Set<string>): string[] {
    const reverse = buildReverseMap(graphs)
    const affected = new Set<string>()
    const queue: string[] = []

    const seed = (rel: string): void => {
        if (affected.has(rel)) return
        affected.add(rel)
        queue.push(rel)
    }
    for (const rel of [...changes.added, ...changes.modified, ...changes.deleted]) seed(rel)

    while (queue.length > 0) {
        const current = queue.pop() as string
        for (const dependent of reverse.get(current) ?? []) seed(dependent)
    }

    return [...affected].filter(rel => existing.has(rel)).sort()
}

/** tsc-rs 输出首行口径：`相对路径(行,列): error TSxxxx:`，或无文件前缀的全局诊断 */
const TSC_RS_DIAGNOSTIC_PATTERN = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):/

/**
 * 判断路径是否为绝对路径（posix / Windows 盘符口径）。
 *
 * @param value 路径字符串
 * @returns 绝对路径时返回 true
 */
function isAbsoluteConfigPath(value: string): boolean {
    return value.startsWith("/") || /^[a-zA-Z]:\//.test(value)
}

/**
 * 把 tsconfig 里的相对路径模式转成绝对路径，使临时配置放在任何目录下口径一致。
 * 只处理字符串数组（include / exclude / files）与 paths / typeRoots 这类映射表；
 * 通配符（`*`）按字面保留，path.resolve 不会动它。
 *
 * @param value 配置值
 * @returns 转换后的配置值
 */
function absolutizeConfigPaths(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(item =>
            typeof item === "string" && !isAbsoluteConfigPath(item) ? path.resolve(PROJECT_ROOT, item).split(path.sep).join("/") : item
        )
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const out: Record<string, unknown> = {}
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            out[key] = absolutizeConfigPaths(entry)
        }
        return out
    }
    return value
}

/**
 * 判断文件是否为数据文件（src/data/d 下的 *.data.ts）。
 * 数据文件被 tsconfig 排除但通过 import 参与 program，改动会波及引用方，
 * 必须纳入指纹与依赖图；program 内一律以缓存声明替代真实源码。
 *
 * @param rel 相对工程根路径
 * @returns 是数据文件时返回 true
 */
function isDataFile(rel: string): boolean {
    return rel.startsWith("src/data/d/") && rel.endsWith(".data.ts")
}

/**
 * 数据文件声明缓存的文件名：按「路径 + mtime + size」内容寻址，源文件一变即换名。
 *
 * @param rel 数据文件相对路径
 * @param stamp 源文件指纹
 * @returns 缓存文件名
 */
function dataDeclCacheFile(rel: string, stamp: FileStamp): string {
    const hash = createHash("sha1").update(`${rel}|${stamp.mtimeMs}|${stamp.size}`).digest("hex")
    return `${path.posix.basename(rel, ".ts")}.${hash}.d.ts`
}

/**
 * 计算声明文本的哈希，用于判定「类型变动」（值变但声明文本不变即类型未变）。
 *
 * @param text 声明文本
 * @returns sha1 摘要
 */
function declTextHash(text: string): string {
    return createHash("sha1").update(text).digest("hex")
}

/**
 * 生成数据文件的类型声明文本（单文件变换，不做类型检查）。
 * 注意：这里刻意保留对 `typescript` 包的直接依赖——tsc-rs 是整 program 检查器，
 * 没有「单个文件转 .d.ts 文本」的 API（它的 --declaration 是面向 program 的 emit，
 * 需要 -p 上下文解析 paths、输出走镜像目录，不适合逐文件哈希比对）；而 transpileDeclaration
 * 是纯语法变换，不解析 import、不依赖 program，一个改动文件约几十毫秒。
 * 该包本就是 pinned devDependency（vue-tsc 要用），此 import 不增加任何安装成本。
 *
 * @param absPath 数据文件绝对路径（posix 分隔符）
 * @param sourceText 源文件全文
 * @returns 声明文本与变换期诊断（有 error 级诊断即文件内部检查未通过）
 */
function generateDataDecl(absPath: string, sourceText: string): { text: string | null; diagnostics: ts.Diagnostic[] } {
    try {
        const result = ts.transpileDeclaration(sourceText, {
            fileName: absPath.split(path.sep).join("/"),
            compilerOptions: {
                declaration: true,
                target: ts.ScriptTarget.ESNext,
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
                resolveJsonModule: true,
                experimentalDecorators: true,
            },
            reportDiagnostics: true,
        })
        return { text: result.outputText, diagnostics: result.diagnostics ?? [] }
    } catch {
        return { text: null, diagnostics: [] }
    }
}

/** 数据声明准备结果：manifest 供 data-mapper 覆盖内容，分类供根集合计算 */
export interface DataDeclPlan {
    /** 源码绝对路径（posix）→ 声明文件绝对路径：写入临时配置旁的 manifest */
    manifest: Record<string, string>
    /** 有 manifest 条目的数据文件（相对路径）：program 内为声明内容，不展示其诊断 */
    served: Set<string>
    /** 本次有效的声明缓存条目（通过后并入缓存） */
    decls: Record<string, DataDeclEntry>
    /** 声明文本发生变化的数据文件（类型变动，下游必须重查） */
    typeChanged: Set<string>
    /** 声明生成失败的数据文件（回退真实源码，需正常展示其诊断；下游保守重查） */
    genFailed: Set<string>
}

/**
 * 准备数据文件声明：值变与类型变分开计算。
 * - 指纹未变：沿用缓存声明（manifest 覆盖，tsc-rs 不解析数据体），下游视图不变；
 * - 指纹变了：本轮仍以真实源码参诊（保证体内部语义错误可见），同时重跑 transpile
 *   只为求声明哈希做类型比对、为下轮缓存声明；哈希不变则下游不受影响（根集合剔除）；
 * - 声明生成失败：保守按类型变动处理（下游重查），文件本身以真实源码正常参诊。
 *
 * @param dataFiles 数据文件相对路径（已排序）
 * @param tsStamps 本次采集的指纹
 * @param previous 上次缓存
 * @param verbose 是否打印过程信息
 * @returns 声明计划
 */
async function prepareDataDecls(
    dataFiles: string[],
    tsStamps: Record<string, FileStamp>,
    previous: LintCache | null,
    verbose: boolean
): Promise<DataDeclPlan> {
    const manifest: Record<string, string> = {}
    const served = new Set<string>()
    const decls: Record<string, DataDeclEntry> = {}
    const typeChanged = new Set<string>()
    const genFailed = new Set<string>()
    let generated = 0

    for (const rel of dataFiles) {
        const stamp = tsStamps[rel]
        if (!stamp) continue
        const absSource = path.join(PROJECT_ROOT, rel).split(path.sep).join("/")
        const cached = previous?.dataDecls?.[rel]
        if (cached && cached.stamp.mtimeMs === stamp.mtimeMs && cached.stamp.size === stamp.size && cached.file !== "") {
            const absDecl = path.join(DATA_DECL_DIR, cached.file).split(path.sep).join("/")
            if ((await statSafe(path.join(DATA_DECL_DIR, cached.file))) !== null) {
                manifest[absSource] = absDecl
                served.add(rel)
                decls[rel] = cached
                continue
            }
        }
        const source = await readTextSafe(path.join(PROJECT_ROOT, rel))
        if (source === null) continue
        const { text, diagnostics } = generateDataDecl(absSource, source)
        const errors = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error)
        if (text === null || errors.length > 0) {
            genFailed.add(rel)
            typeChanged.add(rel)
            if (verbose) console.log(`[lint] 数据文件声明生成失败，回退真实源码参诊：${rel}`)
            continue
        }
        generated += 1
        const file = dataDeclCacheFile(rel, stamp)
        await mkdir(DATA_DECL_DIR, { recursive: true })
        await writeFile(path.join(DATA_DECL_DIR, file), text, "utf8")
        decls[rel] = { stamp, declHash: declTextHash(text), file }
        if (!cached || cached.declHash !== decls[rel]?.declHash) typeChanged.add(rel)
    }

    if (verbose && (generated > 0 || typeChanged.size > 0)) {
        console.log(`[lint] 数据声明：重生成 ${generated} 个，类型变动 ${typeChanged.size} 个，失败 ${genFailed.size} 个`)
    }
    return { manifest, served, decls, typeChanged, genFailed }
}

/**
 * 回收声明缓存目录里不再被缓存索引引用的文件。
 * 只在检查通过、即将写入新缓存时调用，失败运行不回收（旧条目可能仍被引用）。
 *
 * @param decls 本次要写入缓存的数据文件声明条目
 */
async function gcDataDeclDir(decls: Record<string, DataDeclEntry>): Promise<void> {
    const used = new Set(Object.values(decls).map(entry => entry.file))
    let entries: string[]
    try {
        entries = await readdir(DATA_DECL_DIR)
    } catch {
        return
    }
    for (const name of entries) {
        if (!used.has(name)) await rm(path.join(DATA_DECL_DIR, name), { force: true })
    }
}

/**
 * 由根 tsconfig 生成传给 tsc-rs 的临时配置对象（纯函数，便于单测）：
 * 剥离 TS 7 已移除的选项、挂上 tsc-rs-vue-mapper，并把相对路径模式转成绝对路径。
 *
 * @param rootConfig 根 tsconfig 解析结果
 * @returns 临时配置对象
 */
export function prepareTscRsConfig(rootConfig: Record<string, unknown>): Record<string, unknown> {
    const compilerOptions = { ...((rootConfig.compilerOptions as Record<string, unknown> | undefined) ?? {}) }
    // TS 7 移除了 baseUrl 与 esModuleInterop=false，保留会直接报 TS5102/TS5108；
    // paths 在无 baseUrl 时相对 tsconfig 所在目录解析，转成绝对路径后口径不变
    delete compilerOptions.baseUrl
    delete compilerOptions.esModuleInterop
    const tmp: Record<string, unknown> = { ...rootConfig, compilerOptions }
    for (const field of ["include", "exclude", "files"]) {
        if (tmp[field] !== undefined) tmp[field] = absolutizeConfigPaths(tmp[field])
    }
    if (compilerOptions.paths !== undefined) compilerOptions.paths = absolutizeConfigPaths(compilerOptions.paths)
    if (compilerOptions.typeRoots !== undefined) compilerOptions.typeRoots = absolutizeConfigPaths(compilerOptions.typeRoots)
    tmp.contentMappers = [
        { package: VUE_MAPPER_PACKAGE, extensions: [".vue"] },
        { package: DATA_MAPPER_PACKAGE, extensions: [".data.ts"] },
    ]
    return tmp
}

/**
 * 生成传给 tsc-rs 的临时 tsconfig（位于 .tmp 下，不污染跟踪文件），运行结束即删。
 */
async function writeTscRsConfig(): Promise<void> {
    const raw = await readTextSafe(path.join(PROJECT_ROOT, "tsconfig.json"))
    if (!raw) throw new Error("找不到 tsconfig.json")
    const tmp = prepareTscRsConfig(parseJsonc(raw) as Record<string, unknown>)
    await mkdir(TSC_RS_TMP_DIR, { recursive: true })
    await cleanupStaleTscRsConfigs()
    await writeFile(TSC_RS_TMP_CONFIG, `${JSON.stringify(tmp, null, 4)}\n`, "utf8")
}

/**
 * 清理崩溃残留的临时 tsconfig：只删「属主进程已不存在且超过超时时间」的文件，
 * 存活的并发 lint 进程的配置不受影响。
 */
async function cleanupStaleTscRsConfigs(): Promise<void> {
    let entries: string[]
    try {
        entries = await readdir(TSC_RS_TMP_DIR)
    } catch {
        return
    }
    const now = Date.now()
    for (const name of entries) {
        const match = /^tsconfig\.(?:min\.)?(\d+)\.json$/.exec(name)
        if (!match) continue
        const pid = Number(match[1])
        if (pid === process.pid) continue
        let alive = true
        try {
            process.kill(pid, 0)
        } catch (error) {
            alive = (error as NodeJS.ErrnoException)?.code !== "ESRCH"
        }
        if (alive) continue
        const stamp = await statSafe(path.join(TSC_RS_TMP_DIR, name))
        if (stamp && now - stamp.mtimeMs > TSC_RS_TMP_STALE_MS) {
            await rm(path.join(TSC_RS_TMP_DIR, name), { force: true })
        }
    }
}

/** tsc-rs 输出的一条诊断（含后续缩进的 elaboration 行） */
export interface TscRsDiagnostic {
    /** 相对工程根的 posix 路径；全局诊断（配置/选项错误）为 null */
    file: string | null
    /** 原样输出的文本行（含后续行） */
    lines: string[]
    /** 是否 error（warning 不影响退出码） */
    isError: boolean
}

/**
 * 解析 tsc-rs 的文本输出。首行 `路径(行,列): error TSxxxx:` 开一条诊断，
 * 后续缩进行归属上一条；无文件前缀的 `error TSxxxx:` 为全局诊断。
 *
 * @param output tsc-rs 的 stdout + stderr 合并文本
 * @returns 诊断列表（保持 tsc-rs 原顺序）
 */
function parseTscRsOutput(output: string): TscRsDiagnostic[] {
    const diagnostics: TscRsDiagnostic[] = []
    let current: TscRsDiagnostic | null = null
    for (const line of output.split("\n")) {
        const match = TSC_RS_DIAGNOSTIC_PATTERN.exec(line)
        if (match) {
            current = {
                file: match[1].split(path.sep).join("/"),
                lines: [line],
                isError: match[4] === "error",
            }
            diagnostics.push(current)
            continue
        }
        const global = /^error\s+(TS\d+):/.exec(line)
        if (global) {
            current = { file: null, lines: [line], isError: true }
            diagnostics.push(current)
            continue
        }
        if (current && (/^\s/.test(line) || line === "")) {
            current.lines.push(line)
        } else {
            current = null
        }
    }
    return diagnostics.filter(d => d.lines.some(l => l.trim() !== ""))
}

/**
 * 按增量口径过滤诊断：全局诊断恒展示；roots 为 null 时展示全部。
 *
 * @param diagnostics tsc-rs 全量诊断
 * @param roots 增量根文件（相对路径）；null 表示全量展示
 * @returns 命中的诊断
 */
export function filterDiagnosticsByRoots(diagnostics: TscRsDiagnostic[], roots: string[] | null): TscRsDiagnostic[] {
    if (roots === null) return diagnostics
    const rootSet = new Set(roots)
    return diagnostics.filter(d => d.file === null || rootSet.has(d.file))
}

/**
 * tsc-rs host 对无原文位置的虚拟代码诊断的注记行（fidelity 为 NONE 时附加，
 * 行列号实际是虚拟文本坐标，经常超出原文件行数，无法定位到用户代码）。
 */
const VIRTUAL_ONLY_MARKER = "has no corresponding location in the original file"

/**
 * 判断一条诊断是否落在虚拟代码的合成区（无原文位置）。
 * vue-tsc 实际不展示这类诊断（TS 5.9 在合成代码里也几乎不产生诊断）；
 * 展示它们只会给出越界行号，噪音大于信号，因此过滤。兜底真相仍由 lint:full 负责。
 *
 * @param diagnostic 单条诊断
 * @returns 附带无位置注记时返回 true
 */
export function isVirtualOnlyDiagnostic(diagnostic: TscRsDiagnostic): boolean {
    return diagnostic.lines.some(line => line.includes(VIRTUAL_ONLY_MARKER))
}

/**
 * 用 tsc-rs 子进程跑全量类型检查，再按增量口径过滤展示。
 * tsc-rs 恒检查整个 program（约 10s），增量语义体现为「只展示根集合的诊断」：
 * 上游文件的错误在它们各自被改的那次已经展示过。
 *
 * @param roots 增量根文件（相对路径，已过滤存在性）；null 表示展示全部诊断
 * @param verbose 是否打印过程信息
 * @returns 退出码（0 通过，1 有 error 级诊断或执行失败）
 */
async function runTscRsCheck(
    roots: string[] | null,
    manifest: Record<string, string>,
    verbose: boolean,
    minimalFiles: string[] | null = null
): Promise<{ code: number }> {
    const started = Date.now()
    await writeTscRsConfig()
    await writeFile(path.join(TSC_RS_TMP_DIR, DATA_DECL_MANIFEST), `${JSON.stringify(manifest, null, 4)}\n`, "utf8")
    let configPath = TSC_RS_TMP_CONFIG
    if (minimalFiles !== null) {
        const raw = await readTextSafe(path.join(PROJECT_ROOT, "tsconfig.json"))
        if (!raw) throw new Error("找不到 tsconfig.json")
        const full = prepareTscRsConfig(parseJsonc(raw) as Record<string, unknown>)
        const minimal = {
            compilerOptions: full.compilerOptions,
            contentMappers: full.contentMappers,
            files: minimalFiles.map(rel => path.join(PROJECT_ROOT, rel).split(path.sep).join("/")),
        }
        await writeFile(TSC_RS_TMP_MIN_CONFIG, `${JSON.stringify(minimal, null, 4)}\n`, "utf8")
        configPath = TSC_RS_TMP_MIN_CONFIG
    }
    try {
        const result = spawnSync(NODE_BIN, [TSC_RS_ENTRY, "--runExternalCode", "-p", configPath], {
            cwd: PROJECT_ROOT,
            encoding: "utf8",
            maxBuffer: 256 * 1024 * 1024,
        })
        if (result.error) {
            console.error(`[lint] 无法启动 tsc-rs（${TSC_RS_ENTRY}）：${result.error.message}，先跑 pnpm install？`)
            return { code: 1 }
        }
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
        const diagnostics = parseTscRsOutput(output)
        const virtualOnly = diagnostics.filter(isVirtualOnlyDiagnostic)
        const mapped = diagnostics.filter(d => !isVirtualOnlyDiagnostic(d))
        const shown = filterDiagnosticsByRoots(mapped, roots)
        const hidden = mapped.length - shown.length
        if (shown.length > 0) {
            console.log(
                shown
                    .map(d => d.lines.join("\n"))
                    .join("\n")
                    .trimEnd()
            )
        }
        if (verbose) {
            const parts = [`诊断 ${diagnostics.length} 条`]
            if (virtualOnly.length > 0) parts.push(`虚拟合成区 ${virtualOnly.length} 条已隐藏（无原文位置，lint:full 兜底）`)
            if (roots !== null) parts.push(`根集合内 ${shown.length} 条、范围外隐藏 ${hidden} 条`)
            const scope = minimalFiles !== null ? "最小 program 检查" : "全量检查"
            console.log(`[lint] tsc-rs ${scope}用时 ${(Date.now() - started) / 1000}s（${parts.join("，")}）`)
        }
        return { code: shown.some(d => d.isError) ? 1 : 0 }
    } finally {
        await rm(TSC_RS_TMP_CONFIG, { force: true })
        await rm(TSC_RS_TMP_MIN_CONFIG, { force: true })
        await rm(path.join(TSC_RS_TMP_DIR, DATA_DECL_MANIFEST), { force: true })
    }
}

/**
 * 用 node 运行一个 CLI 入口，输出直接继承到当前终端。
 *
 * @param entry 入口脚本绝对路径
 * @param args 参数列表
 * @returns 子进程退出码
 */
function runNode(entry: string, args: string[]): number {
    const inherited = process.env.NODE_OPTIONS ?? ""
    const nodeOptions = inherited.includes("--max-old-space-size") ? inherited : `${inherited} ${NODE_OPTIONS}`.trim()

    const result = spawnSync(NODE_BIN, [entry, ...args], {
        cwd: PROJECT_ROOT,
        stdio: "inherit",
        env: { ...process.env, NODE_OPTIONS: nodeOptions },
    })

    if (result.error) {
        console.error(`[lint] 无法启动 ${NODE_BIN}：${result.error.message}`)
        return 1
    }
    return result.status ?? 1
}

/**
 * 运行 Biome。改动文件多时按 BIOME_CHUNK_SIZE 分批，避免命令行过长。
 *
 * @param files 要处理的文件；传 null 表示全量
 * @returns 退出码
 */
function runBiome(files: string[] | null): number {
    if (files !== null && files.length === 0) return 0

    const chunks: string[][] = []
    if (files === null) chunks.push([])
    else for (let index = 0; index < files.length; index += BIOME_CHUNK_SIZE) chunks.push(files.slice(index, index + BIOME_CHUNK_SIZE))

    for (const chunk of chunks) {
        const code = runNode(BIOME_ENTRY, ["lint", "--fix", "--no-errors-on-unmatched", ...chunk])
        if (code !== 0) return code
    }
    return 0
}

/**
 * 运行真 vue-tsc CLI 全量检查（唯一覆盖数据体检查的最终真相路径）。
 *
 * @returns 退出码
 */
function runVueTscFull(): number {
    return runNode(VUE_TSC_ENTRY, ["--noEmit"])
}

/**
 * 打印一行动态。
 *
 * @param message 内容
 * @param verboseOnly 是否只在 --verbose 下打印
 * @param options 命令行选项
 */
function log(message: string, verboseOnly: boolean, options: CliOptions): void {
    if (verboseOnly && !options.verbose) return
    console.log(`[lint] ${message}`)
}

/**
 * 主流程：算改动 → 定范围 → Biome → 类型检查 → 通过后写缓存。
 */
async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
        printHelp()
        return
    }

    const started = Date.now()
    const tsProject = await loadTsProject()
    const projectFiles = await listTsFiles(tsProject.include, tsProject.exclude)
    const projectSet = new Set(projectFiles)
    // 数据文件被 tsconfig 排除但通过 import 参与 program，必须并入指纹与依赖图口径
    const dataFiles = (await listDataFiles()).filter(rel => !projectSet.has(rel))
    const tsFiles = [...projectFiles, ...dataFiles].sort()
    const tsSet = new Set(tsFiles)
    const lintFiles = await listLintFiles()
    const fingerprint = await computeFingerprint()

    const cache = await loadCache()
    const cacheValid = cache !== null && cache.version === CACHE_VERSION && cache.fingerprint === fingerprint
    const previous = cacheValid ? (cache as LintCache) : null

    const tsStamps = await collectStamps(tsFiles)
    const lintStamps = await collectStamps(lintFiles)
    const tsChanges = diffStamps(previous?.tsStamps ?? {}, tsStamps)
    const lintChanges = diffStamps(previous?.lintStamps ?? {}, lintStamps)
    const changedSet = new Set([...tsChanges.added, ...tsChanges.modified])

    log(
        `工程内 TS/Vue 文件 ${projectFiles.length} 个 + 数据文件 ${dataFiles.length} 个，Biome 文件集 ${lintFiles.length} 个`,
        true,
        options
    )

    // 依赖图：缓存整体失效或有文件增删时重建，否则只重解析内容变过的文件
    const rebuildAll = previous === null || tsChanges.added.length > 0 || tsChanges.deleted.length > 0
    const graph = await buildGraph(tsFiles, tsSet, previous?.tsGraph ?? {}, rebuildAll, changedSet)
    log(`依赖图：重建 ${rebuildAll ? "全部" : `${changedSet.size} 个改动`}文件`, true, options)

    // 首次运行（无缓存）时所有文件都算「新增」，因此必然走全量，和旧命令行为一致
    const tsDirty = !cacheValid || !isClean(tsChanges)
    const biomeDirty = !cacheValid || !isClean(lintChanges)

    // 环境声明文件影响的是整个程序（例如 src/components.d.ts 一变，所有用到自动导入组件的
    // 模板推断结果都会变），而模板引用不产生 import 边，闭包算不到它们，只能全量诊断。
    // 但「环境声明文件被改动」≠「全局类型面变了」：普通源文件里的 window.* 声明扩充
    // （如 CharBuildView.vue / store/db.ts）改到声明以外的代码是常事，按全局类型面哈希判定，
    // 只有 .d.ts 全文或 declare 块文本真正增删改时才退回全量。
    const ambientChanged = [...tsChanges.added, ...tsChanges.modified, ...tsChanges.deleted].some(rel => {
        const before = previous?.tsGraph[rel]?.ambientHash ?? ""
        const after = graph[rel]?.ambientHash ?? ""
        return before !== after
    })

    // 数据声明准备（值变与类型变分开）：必须在根集合计算之前——纯值变的数据文件
    // 不应把下游带入根集合；内部检查（transpile 期）报错直接失败，不进 tsc-rs。
    let dataPlan: DataDeclPlan | null = null
    if (tsDirty && !options.full) {
        dataPlan = await prepareDataDecls(
            tsFiles.filter(rel => isDataFile(rel)),
            tsStamps,
            previous,
            options.verbose
        )
    }

    // 类型检查范围：值变但类型未变的数据文件不做种子（下游视图不变，无需重查）
    let tsMode: "skip" | "full" | "custom-incremental" | "custom-full" = "skip"
    let tsReason = ""
    let roots: string[] = []
    if (tsDirty) {
        roots = computeRoots(filterDataOnlySeeds(tsChanges, dataPlan), [graph, previous?.tsGraph ?? {}], tsSet)
        if (options.full) {
            tsMode = "full"
            tsReason = "--full"
        } else if (ambientChanged) {
            tsMode = "custom-full"
            tsReason = "环境声明文件有改动"
        } else if (roots.length >= projectFiles.length * FULL_CHECK_RATIO) {
            tsMode = "custom-full"
            tsReason = `影响面过大（${roots.length}/${projectFiles.length}）`
        } else {
            tsMode = "custom-incremental"
        }
    }

    // Biome 范围：改动文件少就只跑改动文件，否则全量
    const lintSet = new Set(lintFiles)
    let biomeMode: "skip" | "full" | "changed" = "skip"
    let biomeFiles: string[] = []
    if (!options.skipBiome && biomeDirty) {
        biomeFiles = [...lintChanges.added, ...lintChanges.modified].filter(rel => lintSet.has(rel))
        const tooBroad = options.full || biomeFiles.length === 0 || biomeFiles.length > BIOME_CHUNK_SIZE * 4
        biomeMode = tooBroad ? "full" : "changed"
    }

    if (tsMode === "skip" && biomeMode === "skip") {
        log(`自上次检查以来没有文件改动，跳过（用时 ${((Date.now() - started) / 1000).toFixed(1)}s）`, false, options)
        return
    }

    if (biomeMode !== "skip") {
        log(biomeMode === "full" ? "Biome：全量检查" : `Biome：只检查 ${biomeFiles.length} 个改动文件`, false, options)
        const code = runBiome(biomeMode === "full" ? null : biomeFiles)
        if (code !== 0) {
            console.error("[lint] Biome 未通过，已停止后续类型检查（缓存不更新，下次会重新检查这些文件）")
            process.exitCode = code
            return
        }
    } else if (options.skipBiome) {
        log("按 --no-biome 跳过 Biome", false, options)
    }

    if (tsMode !== "skip") {
        if (tsMode === "full") {
            log(`vue-tsc：全量类型检查（${tsReason}，含数据体检查的最终真相）`, false, options)
            const code = runVueTscFull()
            if (code !== 0) {
                console.error("[lint] vue-tsc 未通过（缓存不更新，下次会重新检查这些文件）")
                process.exitCode = code
                return
            }
        } else {
            // 以声明覆盖的数据文件（未改动）不展示诊断；改动过的数据文件本轮以真实源码参诊，
            // 正常展示（它们已被种子过滤剔除，这里补回；删除的文件不存在，无需展示）
            const served = dataPlan?.served ?? new Set<string>()
            const changedUnserved = [...tsChanges.added, ...tsChanges.modified].filter(
                rel => isDataFile(rel) && !served.has(rel) && tsSet.has(rel)
            )
            const displayRoots: string[] | null =
                tsMode === "custom-full"
                    ? null
                    : [...new Set([...roots, ...changedUnserved])].filter(rel => !(isDataFile(rel) && served.has(rel)))
            // 纯值变数据文件走最小 program 快径（只检查改动文件自身，约 1s）；口径不满足则全量
            let minimalFiles: string[] | null = null
            if (
                tsMode === "custom-incremental" &&
                tsChanges.added.length === 0 &&
                tsChanges.deleted.length === 0 &&
                tsChanges.modified.length > 0 &&
                tsChanges.modified.every(isDataFile) &&
                dataPlan !== null &&
                dataPlan.typeChanged.size === 0 &&
                dataPlan.genFailed.size === 0
            ) {
                const texts = await Promise.all(
                    tsChanges.modified.map(async rel => ({
                        rel,
                        text: (await readTextSafe(path.join(PROJECT_ROOT, rel))) ?? "",
                    }))
                )
                minimalFiles = planMinimalFiles(
                    texts,
                    graph,
                    tsFiles.filter(rel => rel.endsWith(".d.ts"))
                )
            }
            if (minimalFiles !== null) {
                log(`类型检查：数据值变动独立检查 ${tsChanges.modified.length} 个文件`, false, options)
            } else {
                log(
                    tsMode === "custom-full"
                        ? `类型检查：tsc-rs 全量诊断（${tsReason}）`
                        : `类型检查：tsc-rs 全量检查，仅展示 ${displayRoots?.length ?? 0} 个根文件的诊断` +
                              `（改动 ${tsChanges.added.length + tsChanges.modified.length} 个，其余为受影响的下游）`,
                    false,
                    options
                )
            }
            const result = await runTscRsCheck(
                minimalFiles !== null ? tsChanges.modified : displayRoots,
                dataPlan?.manifest ?? {},
                options.verbose,
                minimalFiles
            )
            if (result.code !== 0) {
                console.error("[lint] 类型检查未通过（缓存不更新，下次会重新检查这些文件）")
                process.exitCode = result.code
                return
            }
        }
    } else {
        log("没有改动的 TS 文件或不在src目录下，跳过类型检查", false, options)
    }

    // 只有全部通过才落盘指纹：失败时缓存保持旧值，下次会重新检查这批文件；
    // 未跑声明准备的模式（跳过 / vue-tsc 全量）沿用旧声明索引，不回收
    const dataDecls = dataPlan?.decls ?? previous?.dataDecls ?? {}
    if (dataPlan !== null) await gcDataDeclDir(dataDecls)
    const nextCache: LintCache = {
        version: CACHE_VERSION,
        fingerprint,
        lastRunAt: new Date().toISOString(),
        tsStamps: await collectStamps(tsFiles),
        tsGraph: graph,
        dataDecls,
        // --no-biome 时不动 Biome 指纹，避免下次误以为 Biome 已经检查过这些文件
        lintStamps: options.skipBiome ? (previous?.lintStamps ?? {}) : await collectStamps(lintFiles),
    }
    await saveCache(nextCache)

    log(`通过，用时 ${((Date.now() - started) / 1000).toFixed(1)}s`, false, options)
    log("需要覆盖全工程（含数据体）的检查时用：pnpm lint:full", true, options)
}

const invokedAsScript = typeof process.argv[1] === "string" && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedAsScript) await main()

export { parseTscRsOutput }
