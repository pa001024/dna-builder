import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { __unstable__loadDesignSystem } from "@tailwindcss/node"
import { glob } from "glob"

const ROOT = process.cwd()
const STATIC_CLASS_ATTRIBUTE_PATTERN = /(?<![:\w-])(class(?:Name)?\s*=\s*)(["'])([\s\S]*?)\2/g
const DEFAULT_FILE_PATTERNS = ["**/*.vue", "**/*.html", "**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs", "**/*.ts", "**/*.tsx"]
const DEFAULT_IGNORE_PATTERNS = [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/.git/**",
    "**/.turbo/**",
    "**/.next/**",
    "**/target/**",
    "**/src-tauri/target/**",
    "**/mcp_server/target/**",
]
const ROOT_FONT_SIZE_PX = 16

/**
 * 加载 Tailwind 设计系统，用于复用其 canonical class 规则。
 *
 * @returns {Promise<any>}
 */
async function loadDesignSystem(): Promise<any> {
    return __unstable__loadDesignSystem('@import "tailwindcss";', { base: ROOT })
}

/**
 * 解析根 spacing token 的像素值。
 *
 * @param {any} designSystem Tailwind 设计系统
 * @returns {number | null}
 */
function getSpacingStepPx(designSystem: any): number | null {
    const spacingValue = designSystem.resolveThemeValue("--spacing")

    if (!spacingValue) {
        return null
    }

    if (spacingValue.endsWith("rem")) {
        const rem = Number.parseFloat(spacingValue.slice(0, -3))
        return Number.isFinite(rem) ? rem * ROOT_FONT_SIZE_PX : null
    }

    if (spacingValue.endsWith("px")) {
        const px = Number.parseFloat(spacingValue.slice(0, -2))
        return Number.isFinite(px) ? px : null
    }

    return null
}

/**
 * 按顶层冒号拆分 candidate，避免切开 arbitrary value 内部内容。
 *
 * @param {string} candidate Tailwind candidate
 * @returns {string[]}
 */
function splitCandidateSegments(candidate: string): string[] {
    const segments: string[] = []
    let bracketDepth = 0
    let current = ""

    for (const char of candidate) {
        if (char === "[") {
            bracketDepth += 1
            current += char
            continue
        }

        if (char === "]") {
            bracketDepth = Math.max(0, bracketDepth - 1)
            current += char
            continue
        }

        if (char === ":" && bracketDepth === 0) {
            segments.push(current)
            current = ""
            continue
        }

        current += char
    }

    segments.push(current)
    return segments
}

/**
 * 将 spacing 数值格式化为 Tailwind scale token。
 *
 * @param {number} value spacing 数值
 * @returns {string}
 */
function formatScaleValue(value: number): string {
    const rounded = Math.round(value * 1000) / 1000
    return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, "")
}

/**
 * 将 Tailwind 生成的 CSS 归一化，便于比较 spacing calc 与像素值的语义等价性。
 *
 * @param {string} css Tailwind 生成的 CSS 片段
 * @param {number} spacingStepPx spacing 基准像素值
 * @returns {string}
 */
function normalizeGeneratedCss(css: string, spacingStepPx: number): string {
    return css
        .replace(/calc\(var\(--spacing\)\s*\*\s*(-?\d+(?:\.\d+)?)\)/g, (_, rawScale: string) => {
            const pxValue = Number.parseFloat(rawScale) * spacingStepPx
            return `${formatScaleValue(pxValue)}px`
        })
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * 在官方 canonicalizer 未覆盖时，尝试把 `[Npx]` 改写为 spacing scale。
 *
 * 改写前会比较候选 class 生成的 CSS，只有语义完全一致才落盘。
 *
 * @param {any} designSystem Tailwind 设计系统
 * @param {string} candidate 原始 candidate
 * @returns {string}
 */
function fallbackCanonicalizeCandidate(designSystem: any, candidate: string): string {
    const spacingStepPx = getSpacingStepPx(designSystem)

    if (!spacingStepPx) {
        return candidate
    }

    const segments = splitCandidateSegments(candidate)
    const utility = segments.at(-1)

    if (!utility) {
        return candidate
    }

    const match = utility.match(/^(!?)(-?)([a-z0-9]+(?:-[a-z0-9]+)*)-\[(-?\d+(?:\.\d+)?)px\]$/i)

    if (!match) {
        return candidate
    }

    const [, important, negative, utilityName, rawPxValue] = match
    const pxValue = Number.parseFloat(rawPxValue)

    if (!Number.isFinite(pxValue)) {
        return candidate
    }

    const scaleValue = pxValue / spacingStepPx

    if (!Number.isFinite(scaleValue)) {
        return candidate
    }

    const normalizedScale = Math.round(scaleValue * 1000) / 1000

    if (Math.abs(normalizedScale * spacingStepPx - pxValue) > 0.001) {
        return candidate
    }

    const nextUtility = `${important}${negative}${utilityName}-${formatScaleValue(normalizedScale)}`
    const nextCandidate = [...segments.slice(0, -1), nextUtility].join(":")
    const originalCss = designSystem.candidatesToCss([candidate])[0]
    const nextCss = designSystem.candidatesToCss([nextCandidate])[0]

    if (!originalCss || !nextCss) {
        return candidate
    }

    if (normalizeGeneratedCss(originalCss, spacingStepPx) !== normalizeGeneratedCss(nextCss, spacingStepPx)) {
        return candidate
    }

    return nextCandidate
}

/**
 * 将静态 class 字符串拆分为 Tailwind candidates。
 *
 * @param {string} rawValue class 属性原始值
 * @returns {{ leading: string; trailing: string; tokens: string[] }}
 */
function tokenizeClassValue(rawValue: string): { leading: string; trailing: string; tokens: string[] } {
    const match = rawValue.match(/^(\s*)([\s\S]*?)(\s*)$/)
    const leading = match?.[1] ?? ""
    const body = match?.[2] ?? rawValue
    const trailing = match?.[3] ?? ""
    const tokens = body.length === 0 ? [] : body.split(/\s+/).filter(Boolean)
    return { leading, trailing, tokens }
}

/**
 * 判断一个静态 class 值是否适合自动改写。
 *
 * 这里只处理纯静态 class，显式跳过模板插值和转义引号复杂场景，
 * 避免在格式化阶段误改源码。
 *
 * @param {string} rawValue class 属性原始值
 * @returns {boolean}
 */
function shouldCanonicalize(rawValue: string) {
    return !rawValue.includes("{{") && !rawValue.includes("\\")
}

/**
 * 使用 Tailwind 内部 canonicalization 规则改写 class tokens。
 *
 * @param {any} designSystem Tailwind 设计系统
 * @param {string} rawValue class 属性原始值
 * @returns {string}
 */
function canonicalizeClassValue(designSystem: any, rawValue: string): string {
    if (!shouldCanonicalize(rawValue)) {
        return rawValue
    }

    const { leading, trailing, tokens } = tokenizeClassValue(rawValue)

    if (tokens.length === 0) {
        return rawValue
    }

    const canonicalTokens = designSystem
        .canonicalizeCandidates(tokens, {
            collapse: false,
            logicalToPhysical: false,
            rem: ROOT_FONT_SIZE_PX,
        })
        .map((token: string) => fallbackCanonicalizeCandidate(designSystem, token))

    return `${leading}${canonicalTokens.join(" ")}${trailing}`
}

/**
 * 在单个源码文件中改写静态 class/className 属性。
 *
 * @param {any} designSystem Tailwind 设计系统
 * @param {string} source 源码文本
 * @returns {string}
 */
function canonicalizeSource(designSystem: any, source: string): string {
    return source.replace(STATIC_CLASS_ATTRIBUTE_PATTERN, (fullMatch, prefix, quote, value) => {
        const nextValue = canonicalizeClassValue(designSystem, value)

        if (nextValue === value) {
            return fullMatch
        }

        return `${prefix}${quote}${nextValue}${quote}`
    })
}

/**
 * 收集需要参与 class canonicalization 的源码文件。
 *
 * @param {string[]} explicitFiles 命令行显式传入的文件
 * @returns {Promise<string[]>}
 */
async function collectFiles(explicitFiles: string[]): Promise<string[]> {
    if (explicitFiles.length > 0) {
        return explicitFiles.map(file => path.resolve(ROOT, file))
    }

    const files = await glob(DEFAULT_FILE_PATTERNS, {
        cwd: ROOT,
        absolute: true,
        nodir: true,
        ignore: DEFAULT_IGNORE_PATTERNS,
        windowsPathsNoEscape: true,
    })

    return files
}

/**
 * 执行格式化前的 Tailwind canonical class 改写。
 *
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
    const files = await collectFiles(process.argv.slice(2))
    const designSystem = await loadDesignSystem()
    let changedFileCount = 0

    for (const file of files) {
        const source = await readFile(file, "utf8")
        const nextSource = canonicalizeSource(designSystem, source)

        if (nextSource === source) {
            continue
        }

        await writeFile(file, nextSource, "utf8")
        changedFileCount += 1
    }

    console.log(`canonicalized tailwind classes in ${changedFileCount} file(s)`)
}

await main()
