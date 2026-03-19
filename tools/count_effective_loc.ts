#!/usr/bin/env bun

import { readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { glob } from "glob"

const DEFAULT_PATTERNS = ["**/*.ts", "**/*.vue"]
const DEFAULT_IGNORE_PATTERNS = [
    "**/*.data.ts",
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

/**
 * LOC 统计结果。
 */
interface EffectiveLocResult {
    filePath: string
    effectiveLines: number
    totalLines: number
}

/**
 * 解析命令行参数，支持限制路径和 top 数量。
 *
 * @returns {{ targetPath: string; top: number }}
 */
function parseArgs(): { targetPath: string; top: number } {
    const args = process.argv.slice(2)
    let targetPath = "."
    let top = 20

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]

        if (arg === "--top") {
            const rawValue = args[index + 1]
            const nextTop = Number(rawValue)
            if (!Number.isFinite(nextTop) || nextTop <= 0) {
                throw new Error(`--top 参数无效: ${rawValue ?? ""}`)
            }
            top = nextTop
            index += 1
            continue
        }

        targetPath = arg
    }

    return { targetPath, top }
}

/**
 * 判断当前位置是否以转义斜杠结尾。
 *
 * @param text 文本
 * @param index 当前索引
 * @returns {boolean}
 */
function isEscaped(text: string, index: number): boolean {
    let slashCount = 0
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
        slashCount += 1
    }
    return slashCount % 2 === 1
}

/**
 * 移除文本中的单行/块注释，尽量保留字符串与模板字符串内容。
 *
 * 这里统一处理 TS、CSS 与 Vue 模板中的注释：
 * - `//`
 * - `/* ... *\/`
 * - `<!-- ... -->`
 *
 * @param content 文件内容
 * @returns {string}
 */
function stripComments(content: string): string {
    let result = ""
    let inLineComment = false
    let inBlockComment = false
    let inHtmlComment = false
    let inSingleQuote = false
    let inDoubleQuote = false
    let inTemplateString = false

    for (let index = 0; index < content.length; index += 1) {
        const current = content[index]
        const next = content[index + 1] ?? ""
        const nextTwo = content.slice(index, index + 2)
        const nextThree = content.slice(index, index + 3)
        const nextFour = content.slice(index, index + 4)

        if (inLineComment) {
            if (current === "\n") {
                inLineComment = false
                result += "\n"
            }
            continue
        }

        if (inBlockComment) {
            if (nextTwo === "*/") {
                inBlockComment = false
                index += 1
            }
            continue
        }

        if (inHtmlComment) {
            if (nextThree === "-->") {
                inHtmlComment = false
                index += 2
            }
            continue
        }

        if (inSingleQuote) {
            result += current
            if (current === "'" && !isEscaped(content, index)) {
                inSingleQuote = false
            }
            continue
        }

        if (inDoubleQuote) {
            result += current
            if (current === '"' && !isEscaped(content, index)) {
                inDoubleQuote = false
            }
            continue
        }

        if (inTemplateString) {
            result += current
            if (current === "`" && !isEscaped(content, index)) {
                inTemplateString = false
            }
            continue
        }

        if (nextFour === "<!--") {
            inHtmlComment = true
            index += 3
            continue
        }

        if (nextTwo === "//") {
            inLineComment = true
            index += 1
            continue
        }

        if (nextTwo === "/*") {
            inBlockComment = true
            index += 1
            continue
        }

        if (current === "'") {
            inSingleQuote = true
            result += current
            continue
        }

        if (current === '"') {
            inDoubleQuote = true
            result += current
            continue
        }

        if (current === "`") {
            inTemplateString = true
            result += current
            continue
        }

        if (nextThree === "///") {
            result += current
            continue
        }

        result += current
    }

    return result
}

/**
 * 统计单个文件的有效 LOC。
 *
 * @param filePath 文件路径
 * @returns {Promise<EffectiveLocResult>}
 */
async function countFileEffectiveLoc(filePath: string): Promise<EffectiveLocResult> {
    const content = await readFile(filePath, "utf-8")
    const strippedContent = stripComments(content)
    const totalLines = content.split(/\r?\n/u).length
    const effectiveLines = strippedContent.split(/\r?\n/u).filter(line => line.trim().length > 0).length

    return {
        filePath: path.normalize(filePath),
        effectiveLines,
        totalLines,
    }
}

/**
 * 获取参与统计的文件列表。
 *
 * @param targetPath 目标目录或文件
 * @returns {Promise<string[]>}
 */
async function collectFiles(targetPath: string): Promise<string[]> {
    const normalizedTargetPath = path.normalize(targetPath)
    const isDirectFile = normalizedTargetPath.endsWith(".ts") || normalizedTargetPath.endsWith(".vue")

    if (isDirectFile) {
        if (normalizedTargetPath.endsWith(".data.ts")) {
            return []
        }
        return [normalizedTargetPath]
    }

    const files = await glob(DEFAULT_PATTERNS, {
        cwd: normalizedTargetPath,
        ignore: DEFAULT_IGNORE_PATTERNS,
        nodir: true,
        posix: false,
    })

    return files.map(filePath => path.join(normalizedTargetPath, filePath))
}

/**
 * 输出统计结果。
 *
 * @param results 各文件统计结果
 * @param top 展示前 N 个文件
 */
function printSummary(results: EffectiveLocResult[], top: number): void {
    const sortedResults = [...results].sort((left, right) => right.effectiveLines - left.effectiveLines)
    const totalEffectiveLines = sortedResults.reduce((sum, item) => sum + item.effectiveLines, 0)
    const totalLines = sortedResults.reduce((sum, item) => sum + item.totalLines, 0)

    console.log(`文件数: ${sortedResults.length}`)
    console.log(`总行数: ${totalLines}`)
    console.log(`有效 LOC: ${totalEffectiveLines}`)
    console.log("")
    console.log(`TOP ${Math.min(top, sortedResults.length)} 文件:`)

    sortedResults.slice(0, top).forEach((item, index) => {
        console.log(
            `${String(index + 1).padStart(2, "0")}. ${item.effectiveLines.toString().padStart(5, " ")} LOC | ${item.totalLines
                .toString()
                .padStart(5, " ")} lines | ${item.filePath}`
        )
    })
}

/**
 * 脚本主入口。
 */
async function main(): Promise<void> {
    const { targetPath, top } = parseArgs()
    const files = await collectFiles(targetPath)

    if (files.length === 0) {
        console.log("未找到符合条件的 .vue/.ts 文件")
        return
    }

    const results = await Promise.all(files.map(filePath => countFileEffectiveLoc(filePath)))
    printSummary(results, top)
}

await main()
