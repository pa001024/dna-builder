#!/usr/bin/env bun
/**
 * i18n_check.ts — 扫描代码中引用但未在翻译文件中配置的 i18n 键。
 *
 * 用法:
 *   bun tools/i18n_check.ts                 # 扫描并打印未配置的键（含引用位置）
 *   bun tools/i18n_check.ts --json          # 额外把报告写入 tools/i18n_check_report.json
 *   bun tools/i18n_check.ts --locale-gap    # 额外检查 zh-CN 已定义但其它语言缺失的键
 *
 * 检测内容:
 *   1. 主检测: 代码中通过 t(...)/$t(...)/i18next.t(...) 静态引用, 但 zh-CN 翻译文件中不存在的键
 *      （例如 dna-post.browse 这类漏配的键）
 *   2. 可选检测 (--locale-gap): zh-CN 已有, 但 en/ja/ko/fr/zh-TW 中缺失的键
 *
 * 静态键识别: 仅匹配 t("xxx") / t('xxx') 形式的字符串字面量;
 *            模板字符串 t(`${x}`) 与变量 t(var) 会被跳过并计入 dynamic 计数。
 */

import { readdir, readFile, writeFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"

const ROOT = process.cwd()
const SRC_DIR = join(ROOT, "src")
const I18N_DIR = join(ROOT, "public", "i18n")
const REPORT_FILE = join(ROOT, "tools", "i18n_check_report.json")

/** 作为基准的源语言（fallbackLng），代码引用的键必须在此语言中存在 */
const SOURCE_LOCALE = "zh-CN"
/** 需要扫描的语言目录（排除 jiaojiao，它复用 en） */
const LOCALES = ["en", "fr", "ja", "ko", "zh-CN", "zh-TW"]

/** 允许扫描的扩展名 */
const SCAN_EXTS = new Set([".vue", ".ts", ".tsx", ".js", ".jsx"])
/** 需要跳过的目录名 */
const SKIP_DIRS = new Set(["node_modules", "dist", ".vitest", "coverage", "tests"])

/**
 * 匹配翻译调用中的静态字符串键。
 * 覆盖: t("x") / $t("x") / i18next.t("x") / i18n.t("x") / window.i18next.t("x")
 * 仅捕获单/双引号包裹的字面量, 不捕获模板字符串与变量。
 */
// 末尾 (?=\s*[,)]) 要求字符串字面量后紧跟逗号或右括号,
// 以跳过字符串拼接形式 t("x." + key) 这类动态键
const T_CALL_RE = /\b(?:\$t|i18next\.t|i18n\.t|t)\(\s*(['"])([A-Za-z0-9_.\-/]+)\1(?=\s*[,)])/g
/** 用于统计被跳过的动态键（模板字符串/变量） */
const DYNAMIC_T_RE = /\b(?:\$t|i18next\.t|i18n\.t|t)\(\s*`/g

interface Usage {
    file: string
    line: number
    col: number
}

/** 递归收集目录下所有需要扫描的文件 */
async function collectFiles(dir: string, acc: string[] = []): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue
            await collectFiles(full, acc)
        } else if (entry.isFile() && SCAN_EXTS.has(extname(entry.name))) {
            acc.push(full)
        }
    }
    return acc
}

/**
 * 从单个文件中提取所有静态翻译键及其使用位置。
 * 仅当匹配到的 t( 确实是翻译函数调用时才记录；
 * 通过要求调用前是单词边界或 . / ( 来减少误报。
 */
async function extractFromFile(filePath: string): Promise<Array<{ key: string; usage: Usage }>> {
    const content = await readFile(filePath, "utf-8")
    const results: Array<{ key: string; usage: Usage }> = []
    const seen = new Set<number>()

    // 预计算每行起始偏移，便于把绝对索引换算回行列
    const lineStarts: number[] = [0]
    for (let i = 0; i < content.length; i++) {
        if (content[i] === "\n") lineStarts.push(i + 1)
    }
    const indexToLineCol = (idx: number): Usage => {
        // 二分查找所在行
        let lo = 0,
            hi = lineStarts.length - 1
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (lineStarts[mid] <= idx) lo = mid
            else hi = mid - 1
        }
        return {
            file: relative(ROOT, filePath).replace(/\\/g, "/"),
            line: lo + 1,
            col: idx - lineStarts[lo] + 1,
        }
    }

    for (const m of content.matchAll(T_CALL_RE)) {
        const key = m[2]
        // 去重同一文件同一位置的重复匹配
        const keyIdx = m.index ?? 0
        const startIdx = keyIdx
        if (seen.has(startIdx)) continue
        seen.add(startIdx)

        // 过滤明显不是翻译键的情况:
        //  - 过短或只是单字符（如 t("a") 通常是别的函数）
        //  - 含空格的中文句子（非键形式）
        if (key.length < 2) continue
        if (/\s/.test(key)) continue

        const usage = indexToLineCol(m.index ?? 0)
        results.push({ key, usage })
    }

    return results
}

/** 将嵌套对象按 i18next 默认 keySeparator(".") 展平为 "a.b.c" -> value 的 Map */
function flattenKeys(obj: Record<string, any>, prefix = ""): Map<string, string> {
    const out = new Map<string, string>()
    for (const [k, v] of Object.entries(obj)) {
        const full = prefix ? `${prefix}.${k}` : k
        if (v && typeof v === "object" && !Array.isArray(v)) {
            for (const [sk, sv] of flattenKeys(v, full)) out.set(sk, sv)
        } else {
            out.set(full, typeof v === "string" ? v : String(v ?? ""))
        }
    }
    return out
}

/** 读取所有语言的翻译文件并展平 */
async function loadAllTranslations(): Promise<Map<string, Map<string, string>>> {
    const out = new Map<string, Map<string, string>>()
    for (const locale of LOCALES) {
        const file = join(I18N_DIR, locale, "translation.json")
        try {
            const raw = await readFile(file, "utf-8")
            out.set(locale, flattenKeys(JSON.parse(raw)))
        } catch (e) {
            console.warn(`[warn] 无法读取 ${locale}: ${(e as Error).message}`)
        }
    }
    return out
}

function fmtPath(u: Usage): string {
    return `${u.file}:${u.line}:${u.col}`
}

interface Report {
    scannedFiles: number
    staticKeyRefs: number
    skippedDynamic: number
    uniqueKeysInCode: number
    uniqueKeysInSource: number
    missingFromSource: Array<{ key: string; usages: string[] }>
    localesMissingKeys: Record<string, number>
}

async function main() {
    const args = new Set(process.argv.slice(2))
    const wantJson = args.has("--json")
    const wantLocaleGap = args.has("--locale-gap")

    console.log(`扫描目录: ${relative(ROOT, SRC_DIR) || "."}`)
    const files = await collectFiles(SRC_DIR)
    console.log(`待扫描文件: ${files.length}`)

    // 统计动态键（仅计数）
    let skippedDynamic = 0
    for (const f of files) {
        const content = await readFile(f, "utf-8")
        for (const _ of content.matchAll(DYNAMIC_T_RE)) skippedDynamic++
    }

    // 提取静态键引用
    const keyToUsages = new Map<string, Usage[]>()
    for (const f of files) {
        const refs = await extractFromFile(f)
        for (const { key, usage } of refs) {
            const arr = keyToUsages.get(key) ?? []
            arr.push(usage)
            keyToUsages.set(key, arr)
        }
    }

    // 加载翻译
    const translations = await loadAllTranslations()
    const source = translations.get(SOURCE_LOCALE) ?? new Map<string, string>()

    // 主检测: 代码引用但 zh-CN 未定义的键
    const missingFromSource: Array<{ key: string; usages: string[] }> = []
    for (const [key, usages] of [...keyToUsages.entries()].sort((a, b) => a[0].localeCompare(b[0][0]))) {
        if (!source.has(key)) {
            missingFromSource.push({
                key,
                usages: usages.slice(0, 5).map(fmtPath), // 每个键最多列 5 处引用
            })
        }
    }

    // 可选: 各语言相对 zh-CN 缺失的键计数
    const localesMissingKeys: Record<string, number> = {}
    if (wantLocaleGap) {
        for (const [locale, map] of translations) {
            if (locale === SOURCE_LOCALE) continue
            let miss = 0
            for (const k of source.keys()) if (!map.has(k)) miss++
            localesMissingKeys[locale] = miss
        }
    }

    const report: Report = {
        scannedFiles: files.length,
        staticKeyRefs: [...keyToUsages.values()].reduce((n, u) => n + u.length, 0),
        skippedDynamic,
        uniqueKeysInCode: keyToUsages.size,
        uniqueKeysInSource: source.size,
        missingFromSource,
        localesMissingKeys,
    }

    // 控制台输出
    console.log("\n=== 统计 ===")
    console.log(`扫描文件            : ${report.scannedFiles}`)
    console.log(`静态键引用次数      : ${report.staticKeyRefs}`)
    console.log(`跳过的动态键调用    : ${report.skippedDynamic}`)
    console.log(`代码中去重后的键    : ${report.uniqueKeysInCode}`)
    console.log(`${SOURCE_LOCALE} 已定义键数  : ${report.uniqueKeysInSource}`)

    console.log(`\n=== 主检测: 代码引用但 ${SOURCE_LOCALE} 未配置的键 (${missingFromSource.length}) ===`)
    if (missingFromSource.length === 0) {
        console.log("  ✓ 无缺失")
    } else {
        for (const { key, usages } of missingFromSource) {
            console.log(`  • ${key}`)
            for (const u of usages) console.log(`      ↳ ${u}`)
        }
    }

    if (wantLocaleGap) {
        console.log("\n=== 可选: 其它语言相对 zh-CN 缺失的键数 ===")
        for (const [loc, n] of Object.entries(localesMissingKeys)) {
            console.log(`  ${loc.padEnd(6)}: ${n}`)
        }
    }

    if (wantJson) {
        await writeFile(REPORT_FILE, JSON.stringify(report, null, 4), "utf-8")
        console.log(`\n报告已写入: ${relative(ROOT, REPORT_FILE) || REPORT_FILE}`)
    }
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
