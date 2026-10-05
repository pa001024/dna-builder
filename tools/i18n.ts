#!/usr/bin/env bun
/**
 * i18n.ts — dna-builder 翻译文件统一 CLI（取代旧的 tools/i18n-tool.ts 与 tools/i18n-check.ts）。
 *
 * 用法（脚本别名 `bun i18n`，等价 `bun tools/i18n.ts`）:
 *   bun i18n add <key> [-cn 文案] [-en 文案] [-jp 文案] ...   # 插入或覆盖翻译（支持语言别名）
 *   bun i18n get <key> [--lang cn,en]                         # 读取某键各语言的值（默认全部）
 *   bun i18n rm  <key>                                        # 删除某键（所有语言）
 *   bun i18n langs                                            # 列出可用语言与别名
 *   bun i18n export                                           # 导出缺失翻译到 tools/i18n-diff.json
 *   bun i18n import                                           # 从 tools/i18n-diff.json 导入并删除该文件
 *   bun i18n check [--json] [--locale-gap]                    # 扫描代码引用但翻译文件缺失的键
 *
 * add 细节:
 *   - 语言参数用单横线短名（-cn / -jp / -ja / -kr / -tw …），也接受双横线与目录名（--zh-CN）；
 *   - 未指定的语言不写入，运行期由 i18next 的 fallbackLng(zh-CN) 回落；
 *   - key 含 "." 时按嵌套命名空间写入（如 char-build.new_key），无点号或加 --flat 时写顶层扁平键；
 *   - 文件按既有风格重写：递归 localeCompare 排序 + 4 空格缩进 + 结尾换行（与原文件字节一致）；
 *   - 完成后按实际文件内容检查：该键若非 6 种语言齐全则输出 warning（只改一种语言的译文、
 *     但文件本就齐全时不告警）；
 *   - 文案里出现疑似单花括号占位符（如 {name}，i18next 的插值是 {{name}}）时输出 warning，
 *     单花括号不会被替换、会原样展示给用户。
 *
 * check 细节:
 *   主检测: 代码中 t(...)/$t(...)/i18next.t(...) 静态引用、但 zh-CN 翻译文件中不存在的键；
 *   --locale-gap: 额外统计 zh-CN 已有、但 en/ja/ko/fr/zh-TW 缺失的键数。
 *   静态键仅匹配字符串字面量，模板字符串与变量计入 dynamic 计数后跳过。
 */

import { readdir, readFile, unlink, writeFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"

const ROOT = process.cwd()
const I18N_DIR = join(ROOT, "public", "i18n")
const DIFF_FILE = join(ROOT, "tools", "i18n-diff.json")
const SRC_DIR = join(ROOT, "src")
const REPORT_FILE = join(ROOT, "tools", "i18n-check-report.json")

const LOCALES = ["en", "fr", "ja", "ko", "zh-CN", "zh-TW"]
const SOURCE_LOCALE = "zh-CN"

/** 语言别名 → 目录名。add/get/rm 的语言参数都经过它归一化 */
const LANG_ALIASES: Record<string, string> = {
    cn: "zh-CN",
    zh: "zh-CN",
    sc: "zh-CN",
    hans: "zh-CN",
    "zh-hans": "zh-CN",
    en: "en",
    eng: "en",
    jp: "ja",
    ja: "ja",
    jpn: "ja",
    kr: "ko",
    ko: "ko",
    kor: "ko",
    fr: "fr",
    fra: "fr",
    fre: "fr",
    tw: "zh-TW",
    tc: "zh-TW",
    hant: "zh-TW",
    "zh-hant": "zh-TW",
    "zh-tw": "zh-TW",
}

type JsonObject = Record<string, any>

/** 与 .husky/update-version.js 的 sortJson 保持一致（裸 localeCompare），避免提交时被 hook 重排 */
function compareKeys(a: string, b: string): number {
    return a.localeCompare(b)
}

/** 递归按 localeCompare 排序，保证落盘顺序与既有翻译文件一致 */
function sortDeep(value: any): any {
    if (Array.isArray(value)) {
        return value.map(sortDeep)
    }
    if (value && typeof value === "object") {
        const out: JsonObject = {}
        for (const key of Object.keys(value).sort(compareKeys)) {
            out[key] = sortDeep(value[key])
        }
        return out
    }
    return value
}

/** 序列化为项目既有格式：排序 + 4 空格缩进 + 结尾换行 */
function serialize(value: any): string {
    return `${JSON.stringify(sortDeep(value), null, 4)}\n`
}

function localeFile(locale: string): string {
    return join(I18N_DIR, locale, "translation.json")
}

async function readLocale(locale: string): Promise<JsonObject> {
    const raw = await readFile(localeFile(locale), "utf-8")
    return JSON.parse(raw) as JsonObject
}

/** 读取全部语言翻译文件；缺失的语言记入 failed */
async function readAllLocales(): Promise<{ files: Map<string, JsonObject>; failed: string[] }> {
    const files = new Map<string, JsonObject>()
    const failed: string[] = []
    let entries: string[]
    try {
        entries = await readdir(I18N_DIR)
    } catch {
        throw new Error(`找不到翻译目录：${I18N_DIR}`)
    }
    for (const locale of entries) {
        try {
            files.set(locale, await readLocale(locale))
        } catch {
            failed.push(locale)
        }
    }
    return { files, failed }
}

/** 归一化语言参数：目录名（大小写不敏感）优先，其次别名表 */
function resolveLocale(raw: string): string {
    const name = raw.replace(/^-+/, "")
    const exact = LOCALES.find(locale => locale.toLowerCase() === name.toLowerCase())
    if (exact) {
        return exact
    }
    const alias = LANG_ALIASES[name.toLowerCase()]
    if (alias) {
        return alias
    }
    throw new Error(`未知语言「${raw}」；可用：${LOCALES.join(", ")}，别名如 cn/jp/kr/tw`)
}

/** 匹配「单层花括号包住的标识符」。i18next 插值是 {{name}}，{name} 不会被替换，几乎都是笔误 */
const SINGLE_BRACE_PLACEHOLDER_RE = /(?<!\{)\{([A-Za-z0-9_][A-Za-z0-9_.]*)\}(?!\})/g

/**
 * 找出文案里疑似写错的占位符（如 {name}）。
 * @param value 待检查的文案
 * @returns 疑似占位符列表（原样，含花括号）；没有时为空数组
 */
function findSuspiciousPlaceholders(value: string): string[] {
    return [...value.matchAll(SINGLE_BRACE_PLACEHOLDER_RE)].map(match => match[0])
}

/** 顶层精确键优先，未命中再按 "." 逐层查找 */
function lookupKey(obj: JsonObject, key: string): any {
    if (Object.hasOwn(obj, key)) {
        return obj[key]
    }
    const parts = key.split(".")
    let current: any = obj
    for (const part of parts) {
        if (current && typeof current === "object" && Object.hasOwn(current, part)) {
            current = current[part]
        } else {
            return undefined
        }
    }
    return current
}

/** 写入键；flat 或无点号时写顶层，否则按 "." 建嵌套命名空间 */
function assignKey(obj: JsonObject, key: string, value: string, flat: boolean): void {
    if (flat || !key.includes(".")) {
        obj[key] = value
        return
    }
    const parts = key.split(".")
    let current: JsonObject = obj
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]
        const next = current[part]
        if (next === undefined) {
            current[part] = {}
        } else if (typeof next !== "object" || next === null || Array.isArray(next)) {
            throw new Error(`键路径冲突：${parts.slice(0, i + 1).join(".")} 已是标量值，无法作为命名空间`)
        }
        current = current[part]
    }
    current[parts[parts.length - 1]] = value
}

/** 删除键；顶层不存在时按 "." 逐层删除，随后清理因此变空的父命名空间 */
function removeKey(obj: JsonObject, key: string): boolean {
    if (Object.hasOwn(obj, key)) {
        delete obj[key]
        return true
    }
    const parts = key.split(".")
    const ancestors: JsonObject[] = []
    let current: any = obj
    for (let i = 0; i < parts.length - 1; i++) {
        current = current?.[parts[i]]
        if (!current || typeof current !== "object") {
            return false
        }
        ancestors.push(current)
    }
    const last = parts[parts.length - 1]
    if (!current || typeof current !== "object" || !Object.hasOwn(current, last)) {
        return false
    }
    delete current[last]
    // 自底向上清理空对象，避免留下 "probe": {} 这类空命名空间
    for (let i = ancestors.length - 1; i >= 0; i--) {
        if (Object.keys(ancestors[i]).length > 0) {
            break
        }
        const parent = i === 0 ? obj : ancestors[i - 1]
        delete parent[parts[i]]
    }
    return true
}

function flattenKeys(obj: JsonObject, prefix = ""): Map<string, string> {
    const result = new Map<string, string>()
    for (const [key, value] of Object.entries(obj)) {
        const full = prefix ? `${prefix}.${key}` : key
        if (value && typeof value === "object" && !Array.isArray(value)) {
            for (const [nestedKey, nestedValue] of flattenKeys(value, full)) {
                result.set(nestedKey, nestedValue)
            }
        } else {
            result.set(full, typeof value === "string" ? value : String(value ?? ""))
        }
    }
    return result
}

function setNestedValue(obj: JsonObject, path: string, value: string): void {
    const keys = path.split(".")
    let current = obj
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i]
        if (!current[key]) {
            current[key] = {}
        }
        current = current[key]
    }
    current[keys[keys.length - 1]] = value
}

const HELP = `bun i18n <command> [options]

命令:
  add <key> [-cn 文案] [-en 文案] [-jp 文案] ...
                        插入或覆盖翻译。语言参数用短名（-cn/-en/-jp/-ja/-kr/-ko/-fr/-tw），
                        未指定的语言不写入。key 含 "." 时按嵌套命名空间写入，--flat 强制顶层。
                        附加 --dry-run 只预览不落盘。
                        完成后按实际文件内容检查：该键若非 6 种语言齐全则输出 warning；
                        文案含疑似单花括号占位符（如 {name}）时也会输出 warning
                        （i18next 插值的正确写法是双花括号 {{name}}）。
  get <key> [--lang cn,en] [--json]
                        读取某键各语言下的值（默认全部 6 种）；--lang 用逗号过滤部分语言，
                        别名可用（如 --lang cn,jp）。附加 --json 输出结构化结果。
  rm  <key>             删除某键（所有语言）
  langs                 列出可用语言与别名
  export                导出缺失翻译到 tools/i18n-diff.json
  import                从 tools/i18n-diff.json 导入并删除该文件
  check                 扫描代码引用但翻译文件缺失的键
                        附加 --json 输出报告文件，--locale-gap 统计各语言缺失数
`

async function cmdAdd(args: string[]): Promise<void> {
    const values = new Map<string, string>()
    const positional: string[] = []
    let flat = false
    let dryRun = false

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === "--flat") {
            flat = true
        } else if (arg === "--dry-run") {
            dryRun = true
        } else if (arg.startsWith("-") && arg.length > 1) {
            const eq = arg.indexOf("=")
            const name = eq >= 0 ? arg.slice(0, eq) : arg
            const inlineValue = eq >= 0 ? arg.slice(eq + 1) : undefined
            const locale = resolveLocale(name)
            const value = inlineValue ?? args[++i]
            if (value === undefined) {
                throw new Error(`语言参数 ${name} 缺少值`)
            }
            values.set(locale, value)
        } else {
            positional.push(arg)
        }
    }

    const key = positional[0]
    if (!key) {
        throw new Error("用法：bun i18n add <key> [-cn 文案] [-en 文案] ...")
    }
    if (values.size === 0) {
        throw new Error("至少需要提供一个语言值，例如：bun i18n add common.new_key -cn 新键 -en New key")
    }

    const { files } = await readAllLocales()
    const missingLocales = [...values.keys()].filter(locale => !files.has(locale))
    if (missingLocales.length > 0) {
        throw new Error(`翻译目录不存在：${missingLocales.join(", ")}`)
    }

    const changes: Array<{ locale: string; status: "added" | "updated" | "unchanged"; value: string }> = []
    for (const [locale, value] of values) {
        const file = files.get(locale)!
        const existing = lookupKey(file, key)
        const status = existing === undefined ? "added" : existing === value ? "unchanged" : "updated"
        if (status !== "unchanged") {
            assignKey(file, key, value, flat)
        }
        changes.push({ locale, status, value })
    }

    console.log(`${dryRun ? "[dry-run] " : ""}${key}${flat ? "  (--flat)" : ""}`)
    for (const change of changes) {
        const label = change.status === "added" ? "新增" : change.status === "updated" ? "覆盖" : "未变化"
        console.log(`  ${change.locale.padEnd(6)} ${label}  ${change.value}`)
    }

    // 输入侧护栏：单花括号占位符不会被 i18next 插值（正确写法是 {{name}}），只警告不阻断
    for (const [locale, value] of values) {
        const suspects = findSuspiciousPlaceholders(value)

        if (suspects.length > 0) {
            console.warn(`\n⚠ warning: ${locale} 文案含疑似单花括号占位符 ${suspects.join("、")}`)
            console.warn("  i18next 插值的正确写法是双花括号（如 {{name}}）；单花括号不会被替换，会原样展示给用户。")
        }
    }

    if (dryRun) {
        console.log("（dry-run 未写文件，以下按预期结果检查完整性）")
    } else {
        const dirty = changes.filter(change => change.status !== "unchanged").map(change => change.locale)
        if (dirty.length === 0) {
            console.log("所有目标语言值均未变化，未写文件")
        } else {
            for (const locale of dirty) {
                await writeFile(localeFile(locale), serialize(files.get(locale)!), "utf-8")
            }
            console.log(`已更新 ${dirty.length} 个文件：${dirty.join(", ")}`)
        }
    }

    // 按实际文件内容判断：该键是否 6 种语言齐全。仅改一种语言的译文但文件本就齐全时不告警
    const incomplete = LOCALES.filter(locale => {
        const file = files.get(locale)
        return !file || lookupKey(file, key) === undefined
    })
    if (incomplete.length > 0) {
        console.warn(`\n⚠ warning: 键「${key}」缺少 ${incomplete.length} 种语言的译文：${incomplete.join(", ")}`)
        console.warn(`  该键在运行期会回落到 ${SOURCE_LOCALE}；如需补全，请对上述语言各加一个语言参数。`)
    }
}

/**
 * 解析 --lang 过滤参数；空/未提供时返回全部语言。
 * @param raw 逗号分隔的语言列表（别名可用）；`all` 视为全部
 * @returns 归一化后的语言目录列表
 */
function parseLangFilter(raw: string | undefined): string[] {
    if (!raw || raw.trim().toLowerCase() === "all") {
        return [...LOCALES]
    }
    const locales = raw
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
        .map(resolveLocale)
    return [...new Set(locales)]
}

async function cmdGet(key: string, json: boolean, langFilter?: string): Promise<void> {
    const { files } = await readAllLocales()
    const targets = parseLangFilter(langFilter)
    const table: Record<string, string> = {}
    for (const locale of targets) {
        const file = files.get(locale)
        if (!file) {
            table[locale] = ""
            continue
        }
        const value = lookupKey(file, key)
        table[locale] = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value)
    }
    if (json) {
        console.log(JSON.stringify({ key, values: table }, null, 4))
        return
    }
    console.log(`key: ${key}`)
    for (const [locale, value] of Object.entries(table)) {
        console.log(`  ${locale.padEnd(6)} ${value || "（缺失）"}`)
    }
    const missing = targets.filter(locale => !table[locale])
    if (missing.length > 0) {
        console.log(`\n  ${missing.length}/${targets.length} 种语言缺失：${missing.join(", ")}`)
    }
}

async function cmdRemove(key: string, dryRun: boolean): Promise<void> {
    const { files } = await readAllLocales()
    const hit: string[] = []
    for (const [locale, file] of files) {
        if (removeKey(file, key)) {
            hit.push(locale)
        }
    }
    if (hit.length === 0) {
        console.log(`未找到键：${key}`)
        return
    }
    console.log(`${dryRun ? "[dry-run] " : ""}删除 ${key}：${hit.join(", ")}`)
    if (dryRun) {
        return
    }
    for (const locale of hit) {
        await writeFile(localeFile(locale), serialize(files.get(locale)!), "utf-8")
    }
}

function cmdLangs(): void {
    console.log("可用语言（目录名）：")
    for (const locale of LOCALES) {
        const aliases = Object.entries(LANG_ALIASES)
            .filter(([, target]) => target === locale)
            .map(([alias]) => alias)
        console.log(`  ${locale.padEnd(6)} 别名：${aliases.join(", ")}`)
    }
}

async function cmdExport(): Promise<void> {
    console.log("导出缺失翻译…")
    const { files } = await readAllLocales()

    const allKeys = new Set<string>()
    const localeKeysMap = new Map<string, Map<string, string>>()
    for (const [locale, translations] of files) {
        const keys = flattenKeys(translations)
        localeKeysMap.set(locale, keys)
        for (const key of keys.keys()) {
            allKeys.add(key)
        }
    }

    const diff: Record<string, Record<string, string>> = {}
    for (const key of allKeys) {
        const zhCNValue = localeKeysMap.get(SOURCE_LOCALE)?.get(key) ?? ""
        if (!zhCNValue) {
            continue
        }
        const keyData: Record<string, string> = {}
        let hasMissing = false
        for (const locale of LOCALES) {
            const keys = localeKeysMap.get(locale)
            if (!keys) {
                continue
            }
            const value = keys.get(key) ?? ""
            keyData[locale] = value
            if (locale !== SOURCE_LOCALE && !value) {
                hasMissing = true
            }
        }
        if (hasMissing) {
            diff[key] = keyData
        }
    }

    await writeFile(DIFF_FILE, serialize(diff), "utf-8")
    console.log(`差异已写入 ${relative(ROOT, DIFF_FILE)}`)
    console.log(`共 ${Object.keys(diff).length} 个键存在缺失翻译`)
}

async function cmdImport(): Promise<void> {
    console.log("导入缺失翻译…")
    let diff: Record<string, Record<string, string>>
    try {
        diff = JSON.parse(await readFile(DIFF_FILE, "utf-8")) as Record<string, Record<string, string>>
    } catch (error) {
        console.error(`无法读取 ${relative(ROOT, DIFF_FILE)}：${(error as Error).message}`)
        process.exit(1)
    }

    const { files } = await readAllLocales()
    const dirty = new Set<string>()
    for (const [key, translations] of Object.entries(diff)) {
        for (const [locale, value] of Object.entries(translations)) {
            if (value && files.has(locale)) {
                setNestedValue(files.get(locale)!, key, value)
                dirty.add(locale)
            }
        }
    }

    for (const locale of dirty) {
        await writeFile(localeFile(locale), serialize(files.get(locale)!), "utf-8")
    }
    await unlink(DIFF_FILE)
    console.log(`已导入，更新 ${dirty.size} 个文件`)
    console.log(`${relative(ROOT, DIFF_FILE)} 已删除`)
}

const SCAN_EXTS = new Set([".vue", ".ts", ".tsx", ".js", ".jsx"])
const SKIP_DIRS = new Set(["node_modules", "dist", ".vitest", "coverage", "tests"])
const T_CALL_RE = /\b(?:\$t|i18next\.t|i18n\.t|t)\(\s*(['"])([A-Za-z0-9_.\-/]+)\1(?=\s*[,)])/g
const DYNAMIC_T_RE = /\b(?:\$t|i18next\.t|i18n\.t|t)\(\s*`/g

interface Usage {
    file: string
    line: number
    col: number
}

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

async function extractFromFile(filePath: string): Promise<Array<{ key: string; usage: Usage }>> {
    const content = await readFile(filePath, "utf-8")
    const results: Array<{ key: string; usage: Usage }> = []
    const seen = new Set<number>()

    const lineStarts: number[] = [0]
    for (let i = 0; i < content.length; i++) {
        if (content[i] === "\n") lineStarts.push(i + 1)
    }
    const indexToLineCol = (idx: number): Usage => {
        let lo = 0
        let hi = lineStarts.length - 1
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
        const startIdx = m.index ?? 0
        if (seen.has(startIdx)) continue
        seen.add(startIdx)
        if (key.length < 2) continue
        if (/\s/.test(key)) continue
        results.push({ key, usage: indexToLineCol(m.index ?? 0) })
    }

    return results
}

function fmtPath(u: Usage): string {
    return `${u.file}:${u.line}:${u.col}`
}

interface CheckReport {
    scannedFiles: number
    staticKeyRefs: number
    skippedDynamic: number
    uniqueKeysInCode: number
    uniqueKeysInSource: number
    missingFromSource: Array<{ key: string; usages: string[] }>
    localesMissingKeys: Record<string, number>
}

async function cmdCheck(wantJson: boolean, wantLocaleGap: boolean): Promise<void> {
    console.log(`扫描目录: ${relative(ROOT, SRC_DIR) || "."}`)
    const files = await collectFiles(SRC_DIR)
    console.log(`待扫描文件: ${files.length}`)

    let skippedDynamic = 0
    for (const f of files) {
        const content = await readFile(f, "utf-8")
        for (const _ of content.matchAll(DYNAMIC_T_RE)) skippedDynamic++
    }

    const keyToUsages = new Map<string, Usage[]>()
    for (const f of files) {
        const refs = await extractFromFile(f)
        for (const { key, usage } of refs) {
            const arr = keyToUsages.get(key) ?? []
            arr.push(usage)
            keyToUsages.set(key, arr)
        }
    }

    const { files: translations } = await readAllLocales()
    const flatTranslations = new Map<string, Map<string, string>>()
    for (const [locale, raw] of translations) {
        flatTranslations.set(locale, flattenKeys(raw))
    }
    const source = flatTranslations.get(SOURCE_LOCALE) ?? new Map<string, string>()

    const missingFromSource: Array<{ key: string; usages: string[] }> = []
    for (const [key, usages] of [...keyToUsages.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (!source.has(key)) {
            missingFromSource.push({ key, usages: usages.slice(0, 5).map(fmtPath) })
        }
    }

    const localesMissingKeys: Record<string, number> = {}
    if (wantLocaleGap) {
        for (const [locale, map] of flatTranslations) {
            if (locale === SOURCE_LOCALE) continue
            let miss = 0
            for (const k of source.keys()) if (!map.has(k)) miss++
            localesMissingKeys[locale] = miss
        }
    }

    const report: CheckReport = {
        scannedFiles: files.length,
        staticKeyRefs: [...keyToUsages.values()].reduce((n, u) => n + u.length, 0),
        skippedDynamic,
        uniqueKeysInCode: keyToUsages.size,
        uniqueKeysInSource: source.size,
        missingFromSource,
        localesMissingKeys,
    }

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
        await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 4)}\n`, "utf-8")
        console.log(`\n报告已写入: ${relative(ROOT, REPORT_FILE) || REPORT_FILE}`)
    }
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2)
    const command = argv[0]
    const rest = argv.slice(1)

    switch (command) {
        case "add":
            await cmdAdd(rest)
            break
        case "get": {
            const langIdx = rest.findIndex(a => a === "--lang" || a.startsWith("--lang="))
            let langValue: string | undefined
            const skip = new Set<number>()
            if (langIdx >= 0) {
                const arg = rest[langIdx]
                if (arg.includes("=")) {
                    langValue = arg.slice(arg.indexOf("=") + 1)
                } else {
                    langValue = rest[langIdx + 1]
                    skip.add(langIdx + 1) // 排除 --lang 的取值，避免 "cn,en" 被当成 key
                }
            }
            const key = rest.find((a, i) => !a.startsWith("-") && !skip.has(i))
            if (!key) {
                throw new Error("用法：bun i18n get <key> [--lang cn,en] [--json]")
            }
            await cmdGet(key, rest.includes("--json"), langValue)
            break
        }
        case "rm":
        case "remove":
        case "del": {
            const key = rest.find(a => !a.startsWith("-"))
            if (!key) {
                throw new Error("用法：bun i18n rm <key> [--dry-run]")
            }
            await cmdRemove(key, rest.includes("--dry-run"))
            break
        }
        case "langs":
        case "lang":
            cmdLangs()
            break
        case "export":
            await cmdExport()
            break
        case "import":
            await cmdImport()
            break
        case "check":
            await cmdCheck(rest.includes("--json"), rest.includes("--locale-gap"))
            break
        case undefined:
        case "-h":
        case "--help":
        case "help":
            console.log(HELP)
            break
        default:
            console.error(`未知命令：${command}\n`)
            console.log(HELP)
            process.exit(1)
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
