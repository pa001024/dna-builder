#!/usr/bin/env bun
/**
 * @file 增量 lint 驱动器 —— `pnpm lint` 的实现。
 *
 * vue-tsc 每次都把整个工程（本仓库约 600 个源文件、4000 个程序文件）重新检查一遍，
 * 单次约 120~140s，而绝大多数改动只涉及其中很小的一部分。本脚本不把 vue-tsc 当
 * CLI 用，而是进程内自建类型检查 program（与 vue-tsc 内部同一套拼装件：
 * @vue/language-core 的 Vue 语言插件 + @volar/typescript 的 createProgram 代理），
 * 以此获得两类 vue-tsc CLI 给不了的控制力：
 *
 * 1. **诊断范围**：program 仍会顺着 import 拉进上游闭包（类型信息所需），但诊断只对
 *    「改动文件 + 依赖它们的下游文件 + 环境声明文件」发起 —— 上游文件只编译不检查，
 *    它们自己的错误在各自被改的那次已经查过。
 * 2. **数据文件裁剪**：`src/data/d` 下约 103MB 的 `*.data.ts` 数据字面量，未改动的
 *    数据文件用 `ts.transpileDeclaration` 预生成的声明（`.d.ts` 文本）替代真实源码
 *    参与编译 —— 下游类型完整，但数据体不进 checker；被改动的数据文件保留真实源码
 *    并作为根文件正常诊断（改它就该查它），通过后再为新内容生成声明缓存。
 *
 * 工作流程：
 * 1. 按 `tsconfig.json` 的 include/exclude 枚举工程内源文件，另枚举数据文件
 *    （tsconfig 排除了它们，但它们通过 import 参与 program，必须纳入指纹与依赖图），
 *    记录 mtime + size 指纹；
 * 2. 与上次「检查通过」时写入 `.tmp/lint-cache.json` 的指纹比对，得到新增 / 修改 / 删除集合；
 * 3. 用缓存的 import 关系图求反向依赖闭包：改动文件 + 所有直接/间接依赖它们的文件
 *    （改动一个导出类型时，用到它的文件同样会报错，必须一起检查）；
 * 4. 再补上环境声明文件（`*.d.ts`、含 `declare global` / `declare module` 的文件）；
 * 5. 自建 program 做类型检查：增量模式只对根集合报诊断；环境声明的全局类型面变更或
 *    影响面过半时退回自研全量（对 program 全部文件诊断，数据文件仍替换）—— 日常 lint 永不触发
 *    分钟级的 vue-tsc CLI 全量；
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
import { proxyCreateProgram } from "@volar/typescript/lib/node/proxyCreateProgram"
import { createParsedCommandLine, createVueLanguagePlugin } from "@vue/language-core"
import { glob } from "glob"
import * as ts from "typescript"

/** 工程根目录：本文件位于 `<root>/tools/` 下 */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
/** 临时文件目录（已被 .gitignore 忽略），缓存与数据文件声明缓存都放这里 */
const TMP_DIR = path.join(PROJECT_ROOT, ".tmp")
/** 改动指纹缓存文件 */
const CACHE_FILE = path.join(TMP_DIR, "lint-cache.json")
/** 数据文件声明缓存的目录，内容按「路径 + mtime + size」寻址 */
const DATA_DECL_DIR = path.join(TMP_DIR, "lint-data-decls")
/** 缓存结构版本：本脚本的判断语义变化时 +1，让旧缓存整体失效 */
const CACHE_VERSION = 3
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

/** 数据文件的声明缓存条目 */
interface DataDeclEntry {
    /** 生成声明时的源文件指纹 */
    stamp: FileStamp
    /** 声明缓存在 DATA_DECL_DIR 下的文件名（内容寻址）；空串表示曾生成失败（负缓存，避免每轮重试） */
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

/** 类型检查上下文：指纹、改动集合等由 main 阶段算好传入 */
interface TypeCheckContext {
    /** 工程内文件列表（工程文件 + 数据文件，相对路径） */
    tsFiles: string[]
    /** 本次采集的指纹 */
    tsStamps: Record<string, FileStamp>
    /** 本次内容变化过的数据文件（相对路径） */
    changedData: Set<string>
    /** 环境声明文件列表（需要始终留在 program 里，但不主动诊断） */
    ambientFiles: string[]
    /** 上次缓存（命中声明缓存时免生成） */
    previous: LintCache | null
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

/**
 * 汇总需要进 program 的环境声明文件（`.d.ts`、含 declare global/module）。
 * 它们不产生 import 边、不会被 program 自然拉入，缺失会产生假报错。
 *
 * @param graph 依赖图
 * @returns 环境声明文件列表（相对路径，已排序）
 */
function collectAmbientFiles(graph: Record<string, GraphNode>): string[] {
    return Object.entries(graph)
        .filter(([, node]) => node.ambient)
        .map(([rel]) => rel)
        .sort()
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
 * 规范化绝对路径：posix 分隔符 + Windows 下小写，与 TS host 的 getCanonicalFileName 口径一致。
 *
 * @param absPath 绝对路径
 * @returns 规范化后的路径
 */
function canonicalFilePath(absPath: string): string {
    const normalized = absPath.split(path.sep).join("/")
    return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase()
}

/**
 * 生成数据文件的类型声明文本（单文件变换，不做类型检查）。
 *
 * @param absPath 数据文件绝对路径（posix 分隔符）
 * @param sourceText 源文件全文
 * @returns 声明文本；生成失败（如有声明层错误）时返回 null，调用方回退为真实源码
 */
function generateDataDecl(absPath: string, sourceText: string): string | null {
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
        const hasErrors = (result.diagnostics ?? []).some(d => d.category === ts.DiagnosticCategory.Error)
        if (hasErrors) return null
        return result.outputText
    } catch {
        return null
    }
}

/**
 * 生成数据文件的声明并写入缓存目录。
 *
 * @param rel 数据文件相对路径
 * @param stamp 源文件指纹
 * @returns 缓存条目；生成失败时返回 null
 */
async function writeDataDecl(rel: string, stamp: FileStamp): Promise<DataDeclEntry | null> {
    const absPath = path.join(PROJECT_ROOT, rel)
    const source = await readTextSafe(absPath)
    if (source === null) return null
    const text = generateDataDecl(absPath.split(path.sep).join("/"), source)
    if (text === null) return null
    const file = dataDeclCacheFile(rel, stamp)
    await mkdir(DATA_DECL_DIR, { recursive: true })
    await writeFile(path.join(DATA_DECL_DIR, file), text, "utf8")
    return { stamp, file }
}

/**
 * 读取缓存的数据文件声明文本。
 *
 * @param entry 缓存条目
 * @returns 声明文本；缓存文件丢失时返回 null
 */
async function readDataDecl(entry: DataDeclEntry): Promise<string | null> {
    return readTextSafe(path.join(DATA_DECL_DIR, entry.file))
}

/** unplugin-vue-components 生成文件的标记行，用于识别 components.d.ts */
const COMPONENTS_DTS_MARKER = "Generated by unplugin-vue-components"
/**
 * components.d.ts 里的单条组件声明。文件里有两个形态（都要裁）：
 * `Foo: typeof import('...')['default']`（declare module 'vue' 的 GlobalComponents 区段）
 * `const Foo: typeof import('...')['default']`（declare global 的 JSX 支持区段）
 */
const COMPONENT_ENTRY_PATTERN = /^\s*(?:const\s+)?([\w$]+):\s*typeof import\(/

/**
 * 生成 components.d.ts 的裁剪版本：只保留被诊断文件引用到的全局组件条目。
 * 每条 `typeof import(...)` 都会把该组件连同整棵依赖闭包拉进 program（550 个组件
 * 常驻会让 program 涨到 3500+ 文件）。裁剪后未用到的组件标签退化为 any，
 * 默认 strictTemplates=false 下不产生诊断差异。
 *
 * @param text components.d.ts 原文
 * @param rootsTexts 被诊断文件的源文本列表
 * @returns 裁剪后的文本；无需裁剪（组件全被引用或没有可裁剪条目）时返回 null
 */
function trimComponentsDts(text: string, rootsTexts: string[]): string | null {
    // 标签名统一成「仅字母数字、小写」口径比对：PascalCase / kebab-case / 字符串形式都能命中
    const normalize = (value: string): string => value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
    const haystack = rootsTexts.map(rootsText => normalize(rootsText)).join("\n")
    const allNames: string[] = []
    const keptLines = text.split("\n").filter(line => {
        const match = COMPONENT_ENTRY_PATTERN.exec(line)
        if (!match) return true
        allNames.push(match[1])
        return haystack.includes(normalize(match[1]))
    })
    if (allNames.length === 0 || keptLines.length === text.split("\n").length) return null
    return keptLines.join("\n")
}

/**
 * 计算增量模式下 components.d.ts 的裁剪替换文本并写入替换表。
 *
 * @param overrideTexts 程序内文件的文本替换表
 * @param roots 被诊断文件（相对路径）
 * @param tsFiles 工程内文件列表
 * @param verbose 是否打印过程信息
 */
async function applyComponentsDtsTrim(
    overrideTexts: Map<string, string>,
    roots: string[],
    tsFiles: string[],
    verbose: boolean
): Promise<void> {
    const rel = "src/components.d.ts"
    if (!tsFiles.includes(rel)) return
    const original = await readTextSafe(path.join(PROJECT_ROOT, rel))
    if (original === null || !original.includes(COMPONENTS_DTS_MARKER)) return
    const rootsTexts: string[] = []
    for (const root of roots) {
        // components.d.ts 自身会因「引用所有组件」的依赖边进入根集合，它的文本不能参与匹配
        //（否则 275 个组件名全部命中，裁剪失效）
        if (root === rel) continue
        const text = await readTextSafe(path.join(PROJECT_ROOT, root))
        if (text !== null) rootsTexts.push(text)
    }
    const trimmed = trimComponentsDts(original, rootsTexts)
    if (trimmed !== null) {
        overrideTexts.set(canonicalFilePath(path.join(PROJECT_ROOT, rel)), trimmed)
        if (verbose) console.log(`[lint] components.d.ts 已按诊断范围裁剪（${original.length} → ${trimmed.length} 字节）`)
    }
}

/**
 * 构建自研类型检查 program：Vue 语言插件挂进真 TS program（.vue 由虚拟代码参与编译、
 * 诊断位置自动映射回原文件），未改动的数据文件以预生成声明替代真实源码。
 *
 * @param rootNames 增量根文件（绝对路径）；null 表示全量（按 tsconfig 的 fileNames）
 * @param overrideTexts 程序内文件的文本替换表（规范化绝对路径 → 替换文本）：数据文件的声明、components.d.ts 的裁剪版
 * @param verbose 是否打印过程信息
 * @returns program 与解析后的 tsconfig
 */
function createCheckerProgram(
    rootNames: string[] | null,
    overrideTexts: Map<string, string>,
    verbose: boolean
): { program: ts.Program; fileCount: number; replaced: number } {
    const started = Date.now()
    const configPath = path.join(PROJECT_ROOT, "tsconfig.json").split(path.sep).join("/")

    // vue 的 createParsedCommandLine 会把 readDirectory 桩成空（为语言服务设计，fileNames 恒为空），
    // 因此文件枚举与编译选项用 ts 原生解析（.vue 作为扩展输入），vue 专属选项才走 vue 的封装
    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, PROJECT_ROOT, {
        extraFileExtensions: [{ extension: "vue", isMixedContent: true, scriptKind: ts.ScriptKind.Defer }],
    })
    const configErrors: ts.Diagnostic[] = config.error ? [config.error] : []
    const vueOptions = createParsedCommandLine(ts, ts.sys, configPath).vueOptions

    const originalHost = ts.createCompilerHost(parsed.options, ts.sys.useCaseSensitiveFileNames)

    const host: ts.CompilerHost = {
        ...originalHost,
        getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) {
            const decl = overrideTexts.get(canonicalFilePath(fileName))
            if (decl !== undefined) {
                return ts.createSourceFile(fileName, decl, languageVersionOrOptions, false)
            }
            return originalHost.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile)
        },
    }

    const createProgram = proxyCreateProgram(ts, ts.createProgram, (tsModule, options) => ({
        languagePlugins: [createVueLanguagePlugin(tsModule, options.options, vueOptions, id => id)],
    }))
    const program = createProgram({
        rootNames: rootNames ?? parsed.fileNames,
        // 裸 ts.createProgram 会把 .vue 根文件当「不支持的扩展名」直接丢弃
        // （vue-tsc 靠打补丁注册扩展名，进程内等价解法是这个语言服务开关）
        options: { ...parsed.options, allowNonTsExtensions: true },
        host,
        configFileParsingDiagnostics: [...configErrors, ...parsed.errors],
    })

    if (verbose) {
        console.log(
            `[lint] program：${program.getSourceFiles().length} 个文件，文本替换 ${overrideTexts.size} 个（构建 ${(Date.now() - started) / 1000}s）`
        )
    }
    return { program, fileCount: program.getSourceFiles().length, replaced: overrideTexts.size }
}

/**
 * 收集自研 program 的诊断，顺序与 tsc 一致：配置 / 选项 / 全局 → 逐文件（语法 → 语义）。
 * 增量模式只对根文件发起诊断（上游只编译不检查）；全量模式对 program 全部文件发起。
 *
 * @param program 自建 program
 * @param fileNames 要诊断的文件（绝对路径）
 * @returns 诊断列表
 */
function collectProgramDiagnostics(program: ts.Program, fileNames: string[]): ts.Diagnostic[] {
    const diagnostics: ts.Diagnostic[] = []
    diagnostics.push(...program.getConfigFileParsingDiagnostics())
    diagnostics.push(...program.getOptionsDiagnostics())
    diagnostics.push(...program.getGlobalDiagnostics())

    for (const fileName of fileNames) {
        const sourceFile = program.getSourceFile(fileName)
        if (!sourceFile) {
            diagnostics.push({
                file: undefined,
                start: undefined,
                length: undefined,
                category: ts.DiagnosticCategory.Error,
                code: 6053,
                messageText: `增量 lint：文件未能进入编译程序：${fileName}`,
            })
            continue
        }
        diagnostics.push(...program.getSyntacticDiagnostics(sourceFile))
        diagnostics.push(...program.getSemanticDiagnostics(sourceFile))
    }
    return diagnostics
}

/**
 * 运行自研类型检查（进程内，不经过 vue-tsc CLI）。
 *
 * 未改动的数据文件用声明缓存替代；被改动的数据文件用真实源码参与编译并诊断，
 * 检查通过后再为其生成声明缓存，供后续运行替换使用。
 *
 * @param roots 增量根文件（相对路径，已过滤存在性）；null 表示全量诊断
 * @param context 类型检查上下文（文件列表、指纹、改动集合、上次缓存）
 * @param verbose 是否打印过程信息
 * @returns 退出码与本次生成的声明缓存条目（通过时并入缓存）
 */
async function runCustomTypeCheck(
    roots: string[] | null,
    context: TypeCheckContext,
    verbose: boolean
): Promise<{ code: number; decls: Record<string, DataDeclEntry> }> {
    const started = Date.now()
    const { tsFiles, tsStamps, changedData, previous } = context
    const dataFiles = tsFiles.filter(rel => isDataFile(rel))

    // 组装声明替换表：未改动的数据文件走缓存（缺失即生成）；改动的走真实源码
    const decls: Record<string, DataDeclEntry> = {}
    const overrideTexts = new Map<string, string>()
    for (const rel of dataFiles) {
        if (changedData.has(rel)) continue
        const stamp = tsStamps[rel]
        if (!stamp) continue

        const cached = previous?.dataDecls?.[rel]
        let text: string | null = null
        let failedBefore = false
        if (cached && cached.stamp.mtimeMs === stamp.mtimeMs && cached.stamp.size === stamp.size) {
            if (cached.file === "") {
                // 曾生成失败（不满足单文件声明推断约束）：负缓存命中，直接回退真实源码
                failedBefore = true
            } else {
                text = await readDataDecl(cached)
                if (text !== null) decls[rel] = cached
            }
        }
        if (text === null && !failedBefore) {
            const entry = await writeDataDecl(rel, stamp)
            if (entry !== null) {
                text = await readDataDecl(entry)
                if (text !== null) decls[rel] = entry
            }
        }
        if (text === null) {
            // 回退真实源码参与编译（不诊断、不在缓存里记成功条目），并记录负缓存
            decls[rel] = { stamp, file: "" }
            if (verbose && !failedBefore) console.log(`[lint] 数据文件声明生成失败，回退真实源码参与编译：${rel}`)
        } else {
            overrideTexts.set(canonicalFilePath(path.join(PROJECT_ROOT, rel)), text)
        }
    }

    // 增量模式下裁剪 components.d.ts：550 条 typeof import 会把全部组件的闭包拉进 program
    if (roots !== null) {
        await applyComponentsDtsTrim(overrideTexts, roots, tsFiles, verbose)
    }

    const rootNames =
        roots === null
            ? null
            : [...new Set([...roots, ...context.ambientFiles])].map(rel => path.join(PROJECT_ROOT, rel).split(path.sep).join("/"))
    const { program } = createCheckerProgram(rootNames, overrideTexts, verbose)

    // 全量诊断覆盖 program 全部文件；增量只对根文件发起（环境声明只进 program 不诊断，上游只编译不诊断）
    const fileNames =
        roots === null
            ? program.getSourceFiles().map(sourceFile => sourceFile.fileName)
            : roots.map(rel => path.join(PROJECT_ROOT, rel).split(path.sep).join("/"))
    const diagnostics = collectProgramDiagnostics(program, fileNames)
    const hasErrors = diagnostics.some(d => d.category === ts.DiagnosticCategory.Error)

    if (diagnostics.length > 0) {
        const formatHost: ts.FormatDiagnosticsHost = {
            getCurrentDirectory: () => PROJECT_ROOT,
            getCanonicalFileName: f => (ts.sys.useCaseSensitiveFileNames ? f : f.toLowerCase()),
            getNewLine: () => ts.sys.newLine,
        }
        console.log(ts.formatDiagnostics(diagnostics, formatHost).trimEnd())
    }

    if (verbose) {
        console.log(`[lint] 类型检查用时 ${(Date.now() - started) / 1000}s（诊断 ${diagnostics.length} 条）`)
    }

    // 通过后再为改动的数据文件生成声明缓存：本次它们以真实源码参与编译，
    // 下次运行（未改动状态）即可用声明替换，数据体不再进 checker
    if (!hasErrors) {
        for (const rel of changedData) {
            if (decls[rel]) continue
            const stamp = tsStamps[rel]
            if (!stamp) continue
            const entry = await writeDataDecl(rel, stamp)
            // 失败也记负缓存条目：源文件再变（指纹不同）时会自动重试
            decls[rel] = entry ?? { stamp, file: "" }
        }
    }

    return { code: hasErrors ? 1 : 0, decls }
}

/**
 * 判断文件是否为数据文件（src/data/d 下的 *.data.ts）。
 *
 * @param rel 相对工程根路径
 * @returns 是数据文件时返回 true
 */
function isDataFile(rel: string): boolean {
    return rel.startsWith("src/data/d/") && rel.endsWith(".data.ts")
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

    const context: TypeCheckContext = {
        tsFiles,
        tsStamps,
        changedData: new Set(),
        ambientFiles: [],
        previous,
    }

    // 类型检查范围
    let tsMode: "skip" | "full" | "custom-incremental" | "custom-full" = "skip"
    let tsReason = ""
    let roots: string[] = []
    if (tsDirty) {
        roots = computeRoots(tsChanges, [graph, previous?.tsGraph ?? {}], tsSet)
        // 冷缓存（首跑 / 缓存版本升级 / 工具链指纹变化）时没有改动基线，所有文件都算「新增」；
        // 数据文件若照此全算「改动」，103MB 数据体将以真实源码进 program（实测内存 10GB+）。
        // 与增量同口径处理：数据文件一律走声明替换（缺失即生成），数据体检查仍交给 lint:full。
        context.changedData =
            previous === null ? new Set() : new Set([...tsChanges.added, ...tsChanges.modified].filter(rel => isDataFile(rel)))
        context.ambientFiles = collectAmbientFiles(graph)
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

    let dataDecls = previous?.dataDecls ?? {}
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
            log(
                tsMode === "custom-full"
                    ? `类型检查：自研全量诊断（${tsReason}，数据文件仍裁剪）`
                    : `类型检查：增量诊断 ${roots.length} 个文件（改动 ${tsChanges.added.length + tsChanges.modified.length} 个，其余为受影响的下游与环境声明）`,
                false,
                options
            )
            const result = await runCustomTypeCheck(tsMode === "custom-full" ? null : roots, context, options.verbose)
            if (result.code !== 0) {
                console.error("[lint] 类型检查未通过（缓存不更新，下次会重新检查这些文件）")
                process.exitCode = result.code
                return
            }
            dataDecls = result.decls
        }
    } else {
        log("没有改动的 TS 文件，跳过类型检查", false, options)
    }

    // 只有全部通过才落盘指纹：失败时缓存保持旧值，下次会重新检查这批文件
    await gcDataDeclDir(dataDecls)
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

await main()
