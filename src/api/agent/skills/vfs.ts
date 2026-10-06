/**
 * 技能资料目录的纯逻辑层：路径归一、目录列举、read_file 的切片语义与 grep 的内容搜索，
 * 供 `tools/skill-files.ts` 与注册表调用，不做任何 IO。
 *
 * read_file 的优先级口径：slice（正数取开头 N 行、负数取末尾 N 行）> search（忽略大小写子串，附上下文）
 * > line（行号 1 起 ±range 行）；range 默认 3、上限 20；整读上限 2000 行 / 30000 字符。
 */

/** read_file 整读时的行数上限（超出需用切片参数分段读） */
export const MAX_READ_LINES = 2000
/** read_file 输出字符上限（超出截断并附续读提示） */
export const MAX_READ_CHARS = 30_000
/** line / search 模式默认的上下文行数（上下各 3 行） */
export const DEFAULT_CONTEXT_LINES = 3
/** line / search 模式允许的最大上下文行数 */
export const MAX_CONTEXT_LINES = 20
/** search 模式单次最多展示的命中数 */
export const MAX_SEARCH_MATCHES = 20
/** grep 单次最多输出的行数 */
export const MAX_GREP_LINES = 200

/** read_file 的切片参数 */
export interface ReadFileParams {
    /** 正数取开头 N 行，负数取末尾 N 行（优先级最高） */
    slice?: number
    search?: string
    line?: number
    range?: number
}

/** read_file 的渲染结果 */
export interface ReadFileResult {
    content: string
    totalLines: number
    /** 截断 / 越界等附加说明（无则为空串） */
    notice: string
}

/** grep 的搜索参数 */
export interface GrepOptions {
    /** 搜索模式（正则；非法时按普通文本匹配） */
    pattern: string
    /** 限定搜索的目录（空串 = 全库） */
    path?: string
    glob?: string
    ignoreCase?: boolean
    context?: number
}

/** grep 的结果 */
export interface GrepResult {
    content: string
    matchCount: number
    fileCount: number
    truncated: boolean
}

/** 归一化虚拟路径：去首尾斜杠、合并连续斜杠、根目录归一为空串；非法路径（`..`、反斜杠）返回 null。 */
export function normalizeVfsPath(raw: string | undefined | null): string | null {
    const trimmed = (raw ?? "").trim()
    if (!trimmed || trimmed === "/" || trimmed === ".") {
        return ""
    }

    if (trimmed.includes("\\")) {
        return null
    }

    const segments = trimmed
        .split("/")
        .map(segment => segment.trim())
        .filter(segment => segment !== "" && segment !== ".")

    if (segments.some(segment => segment === "..")) {
        return null
    }

    return segments.join("/")
}

/** 取虚拟路径的一级目录（技能名）；路径本身是根时返回空串。 */
export function vfsSkillName(path: string): string {
    return path.split("/")[0] ?? ""
}

/** 取虚拟路径去掉技能名后的相对路径（"my-skill/refs/a.md" → "refs/a.md"）。 */
export function vfsRelativePath(path: string): string {
    return path.split("/").slice(1).join("/")
}

/** 列举某个虚拟目录的直接子项：文件为原名，目录带尾部 `/`（按名称排序）。 */
export function listVfsChildren(files: readonly string[], dir: string): string[] {
    const prefix = dir ? `${dir}/` : ""
    const children = new Map<string, boolean>()

    for (const file of files) {
        if (dir && !(file === dir || file.startsWith(prefix))) {
            continue
        }

        const rest = file === dir ? "" : file.slice(prefix.length)
        if (!rest) {
            continue
        }

        const slashIndex = rest.indexOf("/")
        children.set(slashIndex >= 0 ? `${rest.slice(0, slashIndex)}/` : rest, slashIndex >= 0)
    }

    return [...children.keys()].sort((a, b) => a.localeCompare(b))
}

/** 把通配符（仅 `*`）转成正则；空串返回 null。 */
function globToRegExp(glob: string | undefined): RegExp | null {
    const pattern = (glob ?? "").trim()
    if (!pattern) {
        return null
    }

    return new RegExp(
        pattern
            .split("*")
            .map(segment => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join(".*"),
        "i"
    )
}

/** 把上下文行数收敛到 [0, MAX_CONTEXT_LINES]（缺省 DEFAULT_CONTEXT_LINES）。 */
function clampContextLines(value: number | undefined): number {
    return Math.min(Math.max(Math.trunc(value ?? DEFAULT_CONTEXT_LINES) || 0, 0), MAX_CONTEXT_LINES)
}

/** 合并重叠 / 相邻的命中窗口，返回 [start, end) 行区间。 */
function mergeHitWindows(hits: readonly number[], context: number, totalLines: number): Array<[number, number]> {
    const windows: Array<[number, number]> = []

    for (const hit of hits) {
        const start = Math.max(0, hit - context)
        const end = Math.min(totalLines, hit + context + 1)

        if (windows.length && start <= windows[windows.length - 1][1]) {
            windows[windows.length - 1][1] = Math.max(windows[windows.length - 1][1], end)
        } else {
            windows.push([start, end])
        }
    }

    return windows
}

/** 渲染一个带全局行号的行窗口（cat -n 风格）；超出预算时截断并报告实际消耗的字符数。 */
function renderWindow(lines: readonly string[], start: number, end: number, budget: number = MAX_READ_CHARS): { text: string; chars: number; hitCharCap: boolean } {
    const parts: string[] = []
    let chars = 0
    let hitCharCap = false

    for (let index = start; index < end; index++) {
        const row = `${index + 1}\t${lines[index]}`
        chars += row.length + 1

        if (chars > budget) {
            hitCharCap = true
            break
        }

        parts.push(row)
    }

    return { text: parts.join("\n"), chars, hitCharCap }
}

/**
 * 按切片语义渲染文件内容（口径见文件头）。搜索模式下所有命中窗口共享同一个字符预算，
 * 保证总输出不超过 MAX_READ_CHARS。
 */
export function renderReadFile(content: string, params: ReadFileParams): ReadFileResult {
    const lines = content.split(/\r?\n/)
    // 以换行结尾的文件 split 会多出一个空行，不算一行
    if (lines.length > 1 && lines[lines.length - 1] === "") {
        lines.pop()
    }

    const totalLines = lines.length
    let notice = ""

    const wrap = (body: string): string => `[共 ${totalLines} 行]\n${body}`

    // slice：正数取头部 N 行、负数取尾部 N 行（优先级最高）
    if (typeof params.slice === "number" && Number.isFinite(params.slice) && params.slice !== 0) {
        const count = Math.min(Math.abs(Math.trunc(params.slice)), MAX_READ_LINES)
        const window = params.slice > 0 ? renderWindow(lines, 0, Math.min(count, totalLines)) : renderWindow(lines, Math.max(0, totalLines - count), totalLines)

        if (window.hitCharCap) {
            notice = `输出因超过 ${MAX_READ_CHARS} 字符被截断，请用更小的 slice 或改用 line / search 定位。`
        }

        return { content: wrap(window.text), totalLines, notice }
    }

    // search：忽略大小写的子串搜索，每个命中附 range 行上下文
    const search = (params.search ?? "").trim()
    if (search) {
        const range = clampContextLines(params.range)
        const needle = search.toLowerCase()
        const matches: number[] = []

        for (let index = 0; index < totalLines; index++) {
            if (lines[index].toLowerCase().includes(needle)) {
                matches.push(index)
                if (matches.length >= MAX_SEARCH_MATCHES) {
                    break
                }
            }
        }

        if (!matches.length) {
            return { content: wrap(`（未找到包含「${search}」的行）`), totalLines, notice }
        }

        const windows = mergeHitWindows(matches, range, totalLines)
        const parts: string[] = []
        let remaining = MAX_READ_CHARS
        let hitCharCap = false

        for (const [start, end] of windows) {
            const window = renderWindow(lines, start, end, remaining)
            remaining -= window.chars
            parts.push(window.text)

            if (window.hitCharCap) {
                hitCharCap = true
                break
            }
        }

        if (hitCharCap) {
            notice = `输出因超过 ${MAX_READ_CHARS} 字符被截断，请用更具体的关键词或更小的 range。`
        }

        const hidden = matches.length >= MAX_SEARCH_MATCHES ? `（只显示前 ${MAX_SEARCH_MATCHES} 处命中）` : ""

        return { content: wrap(`命中 ${matches.length} 处${hidden}：\n${parts.join("\n…\n")}`), totalLines, notice }
    }

    // line：行号附近的窗口（默认上下各 3 行）
    if (typeof params.line === "number" && Number.isFinite(params.line)) {
        const range = clampContextLines(params.range)
        const center = Math.trunc(params.line)

        if (center < 1 || center > totalLines) {
            return { content: wrap(""), totalLines, notice: `行号 ${center} 超出范围（共 ${totalLines} 行）。` }
        }

        const window = renderWindow(lines, Math.max(0, center - 1 - range), Math.min(totalLines, center + range))

        return { content: wrap(window.text), totalLines, notice: window.hitCharCap ? `输出因超过 ${MAX_READ_CHARS} 字符被截断。` : "" }
    }

    // 兜底：整读（带行数与字符上限，附续读提示）
    const capped = lines.length > MAX_READ_LINES ? MAX_READ_LINES : totalLines
    const window = renderWindow(lines, 0, capped)

    if (lines.length > MAX_READ_LINES) {
        notice = `文件共 ${totalLines} 行，只返回前 ${MAX_READ_LINES} 行；可用 line / slice / search 参数读取其余部分。`
    } else if (window.hitCharCap) {
        notice = `输出因超过 ${MAX_READ_CHARS} 字符被截断，请用 line / slice / search 参数分段读取。`
    }

    return { content: wrap(window.text), totalLines, notice }
}

/** 在技能文件集合里做内容搜索（rg 风格输出：命中行 `:`、上下文行 `-`、窗口间 `--`）。 */
export function grepSkillFiles(files: ReadonlyArray<{ path: string; content: string }>, options: GrepOptions): GrepResult {
    const dir = normalizeVfsPath(options.path) ?? ""
    const glob = globToRegExp(options.glob)
    const ignoreCase = options.ignoreCase !== false
    const context = Math.min(Math.max(Math.trunc(options.context ?? 2) || 0, 0), 10)

    // 正则优先，非法正则按普通文本兜底（对模型更宽容）
    let matcher: RegExp
    try {
        matcher = new RegExp(options.pattern, ignoreCase ? "i" : "")
    } catch {
        matcher = new RegExp(options.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ignoreCase ? "i" : "")
    }

    let truncated = false
    let matchCount = 0
    let fileCount = 0
    let budget = MAX_GREP_LINES
    const sections: string[] = []

    for (const file of files) {
        if (budget <= 0) {
            truncated = true
            break
        }

        if (dir && !(file.path === dir || file.path.startsWith(`${dir}/`))) {
            continue
        }

        if (glob && !glob.test(file.path)) {
            continue
        }

        const lines = file.content.split(/\r?\n/)
        const hitRows: number[] = []

        for (let index = 0; index < lines.length; index++) {
            if (matcher.test(lines[index])) {
                hitRows.push(index)
            }
        }

        if (!hitRows.length) {
            continue
        }

        matchCount += hitRows.length
        fileCount += 1

        const windows = mergeHitWindows(hitRows, context, lines.length)
        const rows: string[] = []
        const hitSet = new Set(hitRows)

        for (const [start, end] of windows) {
            for (let index = start; index < end; index++) {
                if (budget <= 0) {
                    truncated = true
                    break
                }

                rows.push(`/${file.path}${hitSet.has(index) ? ":" : "-"}${index + 1}:${lines[index]}`)
                budget -= 1
            }

            if (budget <= 0) {
                break
            }
        }

        if (rows.length) {
            sections.push(rows.join("\n"))
        }
    }

    const footer = `（共 ${matchCount} 处命中，${fileCount} 个文件${truncated ? `；输出超过 ${MAX_GREP_LINES} 行已截断` : ""}）`

    return { content: sections.length ? `${sections.join("\n\n--\n\n")}\n\n${footer}` : footer, matchCount, fileCount, truncated }
}
