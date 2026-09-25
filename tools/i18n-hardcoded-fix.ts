#!/usr/bin/env bun
/**
 * i18n-hardcoded-fix.ts — 按映射把硬编码界面文案改为 i18n 调用，并写入 6 语言翻译条目。
 *
 * 与 `tools/i18n-hardcoded-check.ts` 配套：先用检查工具得到清单，再用本工具按映射改造。
 *
 * 用法:
 *   bun tools/i18n-hardcoded-fix.ts <映射文件>            # 预演（dry-run），只报告不落盘
 *   bun tools/i18n-hardcoded-fix.ts <映射文件> --apply    # 实际改写源码与翻译文件
 *
 * 映射文件格式:
 * ```json
 * {
 *   "files": {
 *     "src/components/Foo.vue": {
 *       "ns": "foo",
 *       "texts": { "保存成功": "save_ok", "取消": "cancel" }
 *     }
 *   },
 *   "i18n": {
 *     "foo": {
 *       "zh-CN": { "save_ok": "保存成功", "cancel": "取消" },
 *       "en":    { "save_ok": "Saved", "cancel": "Cancel" }
 *     }
 *   }
 * }
 * ```
 *
 * 替换顺序（每处文案命中一种即停，避免误伤）:
 *   1. 静态属性        placeholder="文案"  →  :placeholder="$t('ns.key')"
 *   2. 模板文本节点    >文案<              →  >{{ $t('ns.key') }}<
 *   3. 模板内联字面量  '文案' / "文案"      →  $t('ns.key')
 *   4. 脚本字符串      "文案" / '文案'      →  t("ns.key")
 *
 * 注意: 脚本区用了 t(...) 时文件必须已有 `useTranslation()`；本工具只替换，不补 import。
 *       文本节点含 `{{ }}` 插值或多行时无法自动处理，会列入「未命中」由人工接手。
 */

import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const ROOT = process.cwd()
/** 语言包目录固定 6 个 */
const LOCALES = ["zh-CN", "zh-TW", "en", "ja", "ko", "fr"]
/** 视为「用户可见文案」的静态属性 */
const TEXT_ATTRS = ["placeholder", "title", "aria-label", "aria-placeholder", "aria-description", "alt", "label", "tooltip", "hint"]

interface FileRule {
    /** i18n 命名空间（点号键的第一段） */
    ns: string
    /** 原文 → 键名 */
    texts: Record<string, string>
}
interface Mapping {
    files: Record<string, FileRule>
    i18n?: Record<string, Record<string, Record<string, string>>>
}

/** 正则元字符转义 */
function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** 把文案转成宽松正则：词间允许任意空白，以适配模板里的格式化换行 */
function looseRe(text: string): string {
    return text.trim().split(/\s+/).map(escapeRe).join("\\s+")
}

/** 单处替换结果 */
interface ReplaceResult {
    text: string
    how: string | null
}

/**
 * 尝试在源码中替换一处模板层文案（属性 → 文本节点 → 内联字面量）。
 * @param src 源码
 * @param ns 命名空间
 * @param text 原文
 * @param key 键名
 * @returns 替换后的源码与命中方式；未命中时 how 为 null
 */
function replaceInTemplate(src: string, ns: string, text: string, key: string): ReplaceResult {
    const expr = `$t('${key.includes(".") ? key : `${ns}.${key}`}')`
    for (const attr of TEXT_ATTRS) {
        const re = new RegExp(`(\\s)${attr}="${looseRe(text)}"`, "g")
        if (re.test(src)) return { text: src.replace(re, (_m, sp: string) => `${sp}:${attr}="${expr}"`), how: `attr:${attr}` }
    }
    const tRe = new RegExp(`(>\\s*)${looseRe(text)}(\\s*<)`, "g")
    if (tRe.test(src)) return { text: src.replace(tRe, (_m, a: string, b: string) => `${a}{{ ${expr} }}${b}`), how: "text" }
    for (const q of ["'", '"']) {
        const re = new RegExp(`${q}${escapeRe(text)}${q}`, "g")
        if (re.test(src)) return { text: src.replace(re, () => expr), how: "inline" }
    }
    return { text: src, how: null }
}

/**
 * 尝试在源码中替换一处脚本层字符串字面量。
 * @param src 源码
 * @param ns 命名空间
 * @param text 原文
 * @param key 键名
 * @returns 替换后的源码与命中方式
 */
function replaceInScript(src: string, ns: string, text: string, key: string): ReplaceResult {
    const full = key.includes(".") ? key : `${ns}.${key}`
    for (const q of ['"', "'"]) {
        const re = new RegExp(`${q}${escapeRe(text)}${q}`, "g")
        if (re.test(src)) return { text: src.replace(re, () => `t("${full}")`), how: "script" }
    }
    return { text: src, how: null }
}

/** 按点号路径写入嵌套对象 */
function setNested(obj: Record<string, unknown>, path: string, value: string): void {
    const parts = path.split(".")
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i]
        if (!cur[seg] || typeof cur[seg] !== "object") cur[seg] = {}
        cur = cur[seg] as Record<string, unknown>
    }
    cur[parts[parts.length - 1]] = value
}

/** 读取嵌套值 */
function getNested(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj)
}

async function main(): Promise<void> {
    const mappingPath = process.argv[2]
    const apply = process.argv.includes("--apply")
    if (!mappingPath || mappingPath.startsWith("--")) {
        console.error("用法: bun tools/i18n-hardcoded-fix.ts <映射文件> [--apply]")
        process.exit(1)
    }
    const mapping: Mapping = JSON.parse(await readFile(mappingPath, "utf-8"))

    let totalHit = 0
    let totalMiss = 0
    const missList: string[] = []

    for (const [rel, rule] of Object.entries(mapping.files)) {
        const abs = join(ROOT, rel)
        let src = await readFile(abs, "utf-8")
        const hits: string[] = []
        const misses: string[] = []

        for (const [text, key] of Object.entries(rule.texts)) {
            let r = replaceInTemplate(src, rule.ns, text, key)
            if (!r.how) r = replaceInScript(src, rule.ns, text, key)
            if (r.how) {
                src = r.text
                hits.push(`${key}(${r.how})`)
            } else {
                misses.push(`${key} ← ${JSON.stringify(text)}`)
                missList.push(`${rel}: ${key} ← ${JSON.stringify(text)}`)
            }
        }

        console.log(`${rel}  [${rule.ns}]  命中 ${hits.length}/${Object.keys(rule.texts).length}`)
        for (const m of misses) console.log(`   ! 未命中 ${m}`)

        totalHit += hits.length
        totalMiss += misses.length
        if (apply && hits.length) await writeFile(abs, src, "utf-8")
    }

    console.log(`\n合计命中 ${totalHit}，未命中 ${totalMiss}`)

    const i18n = mapping.i18n ?? {}
    if (apply && Object.keys(i18n).length) {
        console.log("\n=== 写入翻译条目 ===")
        for (const locale of LOCALES) {
            const path = join(ROOT, "public", "i18n", locale, "translation.json")
            const json = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>
            let added = 0
            let skipped = 0
            for (const [ns, byLocale] of Object.entries(i18n)) {
                const entries = byLocale[locale]
                if (!entries) continue
                for (const [key, value] of Object.entries(entries)) {
                    const full = `${ns}.${key}`
                    if (getNested(json, full) !== undefined) {
                        skipped++
                        continue
                    }
                    setNested(json, full, value)
                    added++
                }
            }
            await writeFile(path, `${JSON.stringify(json, null, 4)}\n`, "utf-8")
            console.log(`${locale.padEnd(6)} 新增 ${String(added).padStart(3)}  跳过 ${skipped}`)
        }
    }

    if (!apply) console.log("\n（预演模式，未落盘；加 --apply 实际改写）")
    if (missList.length) {
        console.log("\n=== 未命中明细 ===")
        for (const m of missList) console.log("  " + m)
    }
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
