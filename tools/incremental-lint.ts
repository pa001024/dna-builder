#!/usr/bin/env bun
/**
 * @file 增量 lint 驱动器 —— `pnpm lint` 的实现。
 *
 * vue-tsc 每次都把整个工程（本仓库约 600 个源文件、4000 个程序文件）重新检查一遍，
 * 单次约 120~140s，而绝大多数改动只涉及其中很小一部分。本脚本把「检查范围」缩小到
 * 改动过的文件及其受影响的下游文件，并把各文件的修改时间戳缓存到 `.tmp/lint-cache.json`，
 * 以此判断哪些文件真的变了。
 *
 * 工作流程：
 * 1. 按 `tsconfig.json` 的 include/exclude 枚举工程内源文件，记录 mtime + size 指纹；
 * 2. 与上次「检查通过」时写入 `.tmp/lint-cache.json` 的指纹比对，得到新增 / 修改 / 删除集合；
 * 3. 用缓存的 import 关系图求反向依赖闭包：改动文件 + 所有直接/间接依赖它们的文件
 *    （改动一个导出类型时，用到它的文件同样会报错，必须一起检查）；
 * 4. 再补上环境声明文件（`*.d.ts`、含 `declare global` / `declare module` 的文件），
 *    它们承载全局类型，缺失会产生假报错；
 * 5. 把上面这批根文件写进 `.tmp/lint-tsconfig.json`（extends 根 tsconfig），交给 vue-tsc
 *    做增量类型检查 —— 程序规模从约 4000 个文件降到几百个，冷跑 ~25s、热跑 ~5s；
 * 6. Biome 只处理改动过的文件；闭包过大或缓存失效时自动退回全量。
 *
 * 没有任何文件改动时直接跳过，秒过。需要一份完整的、覆盖全工程的检查时用 `pnpm lint:full`。
 *
 * 用法（一般通过 pnpm 脚本调用）：
 *   bun tools/incremental-lint.ts [--full] [--no-biome] [--verbose] [--help]
 */

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { glob } from "glob"

/** 工程根目录：本文件位于 `<root>/tools/` 下 */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
/** 临时文件目录（已被 .gitignore 忽略），缓存与自动生成的 tsconfig 都放这里 */
const TMP_DIR = path.join(PROJECT_ROOT, ".tmp")
/** 改动指纹缓存文件 */
const CACHE_FILE = path.join(TMP_DIR, "lint-cache.json")
/** 增量类型检查用的临时 tsconfig（extends 根 tsconfig，只覆盖 files/include） */
const TEMP_TSCONFIG = path.join(TMP_DIR, "lint-tsconfig.json")
/** 增量类型检查的 tsbuildinfo：根文件集合稳定时 vue-tsc 可据此跳过重复检查 */
const TEMP_BUILD_INFO = path.join(TMP_DIR, "lint-tsconfig.tsbuildinfo")
/** 缓存结构版本：本脚本的判断语义变化时 +1，让旧缓存整体失效 */
const CACHE_VERSION = 1
/** 影响闭包超过工程文件总数的该比例时，退回全量类型检查（增量已无意义） */
const FULL_CHECK_RATIO = 0.5
/** 单次传给 Biome 的最大文件数，避免 Windows 命令行过长 */
const BIOME_CHUNK_SIZE = 120
/** 文件指纹采集的并发度，避免 Windows 上开太多句柄 */
const STAT_CONCURRENCY = 64
/** 全量 vue-tsc 需要更大的堆，保持与旧命令一致 */
const NODE_OPTIONS = "--max-old-space-size=8192"
/** 运行 vue-tsc / biome 用的 node 可执行文件（避免 .cmd / shell 包装的平台差异） */
const NODE_BIN = process.env.DNA_LINT_NODE ?? "node"
/** vue-tsc 入口 */
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
}

/** `.tmp/lint-cache.json` 的结构 */
interface LintCache {
    /** 缓存结构版本 */
    version: number
    /** 工具链指纹：tsconfig / 依赖清单 / 本脚本语义变化时整体失效 */
    fingerprint: string
    /** 上次「全量」vue-tsc 通过的时间（ISO），null 表示还没有干净基线 */
    tsFullCleanAt: string | null
    /** 上次「全量」Biome 通过的时间（ISO），null 表示还没有干净基线 */
    biomeFullCleanAt: string | null
    /** TS 工程文件的 mtime/size 指纹 */
    tsStamps: Record<string, FileStamp>
    /** TS 文件之间的依赖图 */
    tsGraph: Record<string, GraphNode>
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
    -f, --full      忽略缓存，全量检查（等价于 pnpm lint:full）
        --no-biome  只做类型检查，不跑 Biome
    -v, --verbose   打印检查范围等过程信息
    -h, --help      显示本帮助

缓存：
    .tmp/lint-cache.json 记录各文件的修改时间戳与依赖图；
    删除该文件（或 .tmp 目录）即可回到首次全量检查的状态。`)
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
 * 枚举工程内的 TS / Vue 源文件。
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
    return { imports: [...imports].sort(), ambient: isAmbientFile(rel, scriptText) }
}

/**
 * 建立 / 复用工程依赖图。只有内容变过的文件才重新解析，其余直接取缓存节点。
 *
 * @param files 工程内文件列表
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
 * 计算本次类型检查的根文件集合：
 * 改动 / 删除的文件 + 所有（直接或间接）依赖它们的文件 + 环境声明文件。
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

    // 环境声明文件承载全局类型，缺了它们会冒出「Property does not exist」之类的假报错
    for (const [rel, node] of Object.entries(graphs[0])) {
        if (node.ambient) seed(rel)
    }

    return [...affected].filter(rel => existing.has(rel)).sort()
}

/**
 * 生成临时 tsconfig：继承根 tsconfig 的编译选项，只把根文件限制为本次要检查的集合。
 *
 * @param roots 根文件列表（相对工程根）
 * @returns 临时 tsconfig 的绝对路径
 */
async function writeTempTsconfig(roots: string[]): Promise<string> {
    const config = {
        // 相对路径基于本文件所在目录（.tmp/）解析
        extends: "../tsconfig.json",
        include: [],
        files: roots.map(rel => `../${rel}`),
    }
    await mkdir(TMP_DIR, { recursive: true })
    await writeFile(TEMP_TSCONFIG, `${JSON.stringify(config, null, 4)}\n`, "utf8")
    return TEMP_TSCONFIG
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
 * 运行 vue-tsc。
 *
 * @param roots 增量检查的根文件；传 null 表示按 tsconfig.json 全量检查
 * @returns 退出码
 */
async function runVueTsc(roots: string[] | null): Promise<number> {
    if (roots === null) return runNode(VUE_TSC_ENTRY, ["--noEmit"])
    if (roots.length === 0) return 0

    const configPath = await writeTempTsconfig(roots)
    return runNode(VUE_TSC_ENTRY, ["-p", configPath, "--noEmit", "--incremental", "--tsBuildInfoFile", TEMP_BUILD_INFO])
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
 * 主流程：算改动 → 定范围 → Biome → vue-tsc → 通过后写缓存。
 */
async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
        printHelp()
        return
    }

    const started = Date.now()
    const tsProject = await loadTsProject()
    const tsFiles = await listTsFiles(tsProject.include, tsProject.exclude)
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

    log(`工程内 TS/Vue 文件 ${tsFiles.length} 个，Biome 文件集 ${lintFiles.length} 个`, true, options)

    // 依赖图：缓存整体失效或有文件增删时重建，否则只重解析内容变过的文件
    const rebuildAll = previous === null || tsChanges.added.length > 0 || tsChanges.deleted.length > 0
    const graph = await buildGraph(tsFiles, tsSet, previous?.tsGraph ?? {}, rebuildAll, changedSet)
    log(`依赖图：重建 ${rebuildAll ? "全部" : `${changedSet.size} 个改动`}文件`, true, options)

    // 首次运行（无缓存）时所有文件都算「新增」，因此必然走全量，和旧命令行为一致
    const tsDirty = !cacheValid || !isClean(tsChanges)
    const biomeDirty = !cacheValid || !isClean(lintChanges)

    // 环境声明文件影响的是整个程序（例如 src/components.d.ts 一变，所有用到自动导入组件的
    // 模板推断结果都会变），而模板引用不产生 import 边，闭包算不到它们，只能退回全量。
    const ambientChanged = [...tsChanges.added, ...tsChanges.modified, ...tsChanges.deleted].some(
        rel => graph[rel]?.ambient === true || previous?.tsGraph[rel]?.ambient === true
    )

    // 类型检查范围
    let tsMode: "skip" | "full" | "incremental" = "skip"
    let tsReason = ""
    let roots: string[] = []
    if (tsDirty) {
        roots = computeRoots(tsChanges, [graph, previous?.tsGraph ?? {}], tsSet)
        if (options.full) {
            tsMode = "full"
            tsReason = "--full"
        } else if (ambientChanged) {
            tsMode = "full"
            tsReason = "环境声明文件有改动"
        } else if (roots.length >= tsFiles.length * FULL_CHECK_RATIO) {
            tsMode = "full"
            tsReason = `影响面过大（${roots.length}/${tsFiles.length}）`
        } else {
            tsMode = "incremental"
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
        log(
            tsMode === "full"
                ? `vue-tsc：全量类型检查（${tsReason}）`
                : `vue-tsc：增量类型检查 ${roots.length} 个文件（改动 ${tsChanges.added.length + tsChanges.modified.length} 个，其余为受影响的下游与环境声明）`,
            false,
            options
        )
        const code = await runVueTsc(tsMode === "full" ? null : roots)
        if (code !== 0) {
            console.error("[lint] vue-tsc 未通过（缓存不更新，下次会重新检查这些文件）")
            process.exitCode = code
            return
        }
    } else {
        log("vue-tsc：没有改动的 TS 文件，跳过类型检查", false, options)
    }

    // 只有全部通过才落盘指纹：失败时缓存保持旧值，下次会重新检查这批文件
    const nextCache: LintCache = {
        version: CACHE_VERSION,
        fingerprint,
        lastRunAt: new Date().toISOString(),
        tsStamps: await collectStamps(tsFiles),
        tsGraph: graph,
        // --no-biome 时不动 Biome 指纹，避免下次误以为 Biome 已经检查过这些文件
        lintStamps: options.skipBiome ? (previous?.lintStamps ?? {}) : await collectStamps(lintFiles),
    }
    await saveCache(nextCache)

    log(`通过，用时 ${((Date.now() - started) / 1000).toFixed(1)}s`, false, options)
    log("需要覆盖全工程的检查时用：pnpm lint:full", true, options)
}

await main()
