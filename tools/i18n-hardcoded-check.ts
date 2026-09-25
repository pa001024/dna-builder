#!/usr/bin/env bun
/**
 * i18n-hardcoded-check.ts — 扫描代码中「面向用户但未国际化」的硬编码中文文案。
 *
 * 与 `tools/i18n-check.ts` 互补：那个工具检查「代码引用了但翻译文件里没有的键」，
 * 本工具检查「代码里根本没走 i18n 的中文文案」。两者一起看才能覆盖完整。
 *
 * 用法:
 *   bun tools/i18n-hardcoded-check.ts                 # 打印统计与待办清单摘要
 *   bun tools/i18n-hardcoded-check.ts --json          # 输出 tools/i18n-hardcoded-report.json
 *   bun tools/i18n-hardcoded-check.ts --md            # 输出 tools/i18n-hardcoded-report.md（含逐条清单）
 *   bun tools/i18n-hardcoded-check.ts --include-data  # 连 src/data 下的数据集一起扫（默认排除游戏数据集）
 *
 * 检测方式:
 *   - .vue 模板: 取文本节点、静态属性值（title/placeholder/aria-label/alt/label 等）与内联字符串字面量
 *   - .vue/ts 脚本: 用 TypeScript AST 取字符串字面量，剔除注释、import 路径与已包在 t(...) 里的
 *   注释里的中文（项目要求函数与复杂逻辑必须有中文 JSDoc）一律不计入。
 *
 * 分组: A 组 = 文件已接入 i18n 却仍有硬编码（真遗漏，优先修）；B 组 = 文件完全未接入 i18n。
 */

import { readdir, readFile, writeFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"
import ts from "typescript"

const ROOT = process.cwd()
const SRC_DIR = join(ROOT, "src")
const JSON_REPORT = join(ROOT, "tools", "i18n-hardcoded-report.json")
const MD_REPORT = join(ROOT, "tools", "i18n-hardcoded-report.md")

/** 中日韩统一表意文字（含扩展 A 与兼容区） */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
/** 需要跳过的目录 */
const SKIP_DIRS = new Set(["node_modules", "dist", ".vitest", "coverage", "tests", "generated"])
/** 生成目录：游戏数据集，文案由数据包下发，不属于界面硬编码 */
const DATA_DIR_RE = /^src\/data\/(d|generated)\//

/**
 * 判定为「不是文案」的属性名。
 * 动态绑定（: / v-bind:）一律排除，因为看到的是表达式而非字面量文案。
 */
const ATTR_DENY_RE = [
    /^class$/,
    /^style$/,
    /^data-/,
    /^v-/,
    /^#/,
    /^id$/,
    /^ref$/,
    /^key$/,
    /^type$/,
    /^format$/,
    /^pattern$/,
    /^src$/,
    /^href$/,
    /^to$/,
    /^target$/,
    /^(width|height|size|max|min|step|rows|cols|gap|duration|delay|scale|opacity)$/,
    /^(color|bg|fill|stroke|font|theme|mode|variant|align|position|orientation)$/,
    /^(path|file|filename|route|url|lang|locale|code|tag|icon|name|value|model)$/i,
    /(Class|Style|Color|Icon|Path|Url|Key|Id|Regex|Pattern|Format|Type)$/,
]
/** 允许作为「用户可见文案」的静态属性名 */
const ATTR_TEXT_RE = /^(title|placeholder|aria-label|aria-placeholder|aria-description|alt|label|tooltip|hint)$/

/** 单条命中 */
interface Hit {
    /** 相对仓库根的文件路径 */
    rel: string
    /** 命中上下文：tpl-text / tpl-attr / tpl-expr / script */
    ctx: string
    /** 细分类型：text / attr:xxx / literal / prop:xxx */
    kind: string
    /** 命中的文本 */
    text: string
    line: number
    col: number
}

/** 预计算行起点，把绝对索引换算成行列（O(1) 查询，避免逐字符扫描） */
function makeLocator(content: string): (idx: number) => { line: number; col: number } {
    const starts = [0]
    for (let i = 0; i < content.length; i++) {
        if (content[i] === "\n") starts.push(i + 1)
    }
    return idx => {
        let lo = 0
        let hi = starts.length - 1
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (starts[mid] <= idx) lo = mid
            else hi = mid - 1
        }
        return { line: lo + 1, col: idx - starts[lo] + 1 }
    }
}

/**
 * 从 TS/JS 源码中提取未国际化的中文字符串字面量。
 * @param code 脚本源码
 * @param offsetBase 该脚本在所属文件中的起始偏移（.vue 的 script 块需要）
 * @param loc 行列换算器
 * @param ctx 命中上下文标签
 * @param out 结果收集数组
 */
function extractScriptStrings(
    code: string,
    offsetBase: number,
    loc: (idx: number) => { line: number; col: number },
    ctx: string,
    out: Hit[]
): void {
    if (!code.trim()) return
    let sf: ts.SourceFile
    try {
        sf = ts.createSourceFile("scan.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    } catch {
        return
    }

    // 收集注释区间，用于剔除注释里的中文
    const comments: Array<{ pos: number; end: number }> = []
    const collectComments = (node: ts.Node): void => {
        for (const r of ts.getLeadingCommentRanges(code, node.getFullStart()) ?? []) comments.push(r)
        for (const r of ts.getTrailingCommentRanges(code, node.getEnd()) ?? []) comments.push(r)
        ts.forEachChild(node, collectComments)
    }
    collectComments(sf)
    const inComment = (idx: number): boolean => comments.some(r => idx >= r.pos && idx < r.end)

    const visit = (node: ts.Node): void => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            const text = node.text
            const start = node.getStart(sf)
            if (CJK_RE.test(text) && !inComment(start)) {
                const parent = node.parent
                // import/export 的模块路径不是文案
                if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) {
                    ts.forEachChild(node, visit)
                    return
                }
                // 已包在 t(...) / $t(...) / i18next.t(...) 里的不算遗漏
                let isI18n = false
                let cursor: ts.Node | undefined = parent
                for (let guard = 0; cursor && guard < 3; guard++) {
                    if (ts.isCallExpression(cursor)) {
                        const callee = cursor.expression.getText(sf)
                        if (/(^|\.)(\$?t|t)$/.test(callee) || /i18next\.t$|i18n\.t$/.test(callee)) isI18n = true
                        break
                    }
                    if (ts.isPropertyAssignment(cursor) || ts.isVariableDeclaration(cursor) || ts.isPropertySignature(cursor)) {
                        break
                    }
                    cursor = cursor.parent
                }
                if (!isI18n) {
                    const { line, col } = loc(offsetBase + start)
                    let kind = "string"
                    if (ts.isPropertyAssignment(parent)) kind = `prop:${parent.name.getText(sf)}`
                    else if (ts.isCaseClause(parent)) kind = "case"
                    else if (ts.isBinaryExpression(parent)) kind = `bin:${parent.operatorToken.getText(sf)}`
                    out.push({ rel: "", ctx, kind, text: text.slice(0, 160), line, col })
                }
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(sf)
}

/** 扫描单个 .vue 文件：模板 + 脚本 */
async function scanVue(content: string, out: Hit[]): Promise<void> {
    const loc = makeLocator(content)
    const tplMatch = content.match(/<template[^>]*>/)
    if (tplMatch) {
        const start = tplMatch.index + tplMatch[0].length
        const endIdx = content.indexOf("</template>", start)
        const tpl = content.slice(start, endIdx > 0 ? endIdx : content.length)
        // 屏蔽 HTML 注释（保持长度，便于回算偏移）
        const cleaned = tpl.replace(/<!--[\s\S]*?-->/g, x => " ".repeat(x.length))
        // 文本节点：标签之间、不含标签与插值花括号的裸文本
        for (const m of cleaned.matchAll(/>([^<>{}]*[\u4e00-\u9fff][^<>{}]*)</g)) {
            const raw = m[1].trim()
            if (!raw) continue
            const { line, col } = loc(start + m.index + 1)
            out.push({ rel: "", ctx: "tpl-text", kind: "text", text: raw.replace(/\s+/g, " ").slice(0, 160), line, col })
        }
        // 静态属性值（单行内）
        for (const m of cleaned.matchAll(/([@:\w][\w.:-]*)\s*=\s*"([^"\n]*[\u4e00-\u9fff][^"\n]*)"/g)) {
            const name = m[1]
            if (name.startsWith(":") || name.startsWith("v-bind:") || ATTR_DENY_RE.some(re => re.test(name))) continue
            const { line, col } = loc(start + m.index)
            out.push({ rel: "", ctx: "tpl-attr", kind: `attr:${name}`, text: m[2].slice(0, 160), line, col })
        }
        // 模板内联表达式里的字符串字面量
        for (const m of cleaned.matchAll(/'([^'\n<>]*[\u4e00-\u9fff][^'\n<>]*)'/g)) {
            const { line, col } = loc(start + m.index)
            out.push({ rel: "", ctx: "tpl-expr", kind: "literal", text: m[1].slice(0, 160), line, col })
        }
        for (const m of cleaned.matchAll(/"([^"\n<>]*[\u4e00-\u9fff][^"\n<>]*)"/g)) {
            const { line, col } = loc(start + m.index)
            out.push({ rel: "", ctx: "tpl-expr", kind: "dquote", text: m[1].slice(0, 160), line, col })
        }
    }
    for (const m of content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
        const base = m.index + m[0].indexOf(">") + 1
        extractScriptStrings(m[1], base, loc, "script", out)
    }
}

/** 递归收集待扫描文件 */
async function collectFiles(dir: string, includeData: boolean, acc: string[] = []): Promise<string[]> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue
            await collectFiles(full, includeData, acc)
        } else if ([".vue", ".ts"].includes(extname(entry.name))) {
            if (/\.(test|spec)\.ts$/.test(entry.name) || entry.name.endsWith(".d.ts")) continue
            acc.push(full)
        }
    }
    if (!includeData) return acc.filter(f => !DATA_DIR_RE.test(relative(ROOT, f).replace(/\\/g, "/")))
    return acc
}

/** 主流程 */
async function main(): Promise<void> {
    const args = new Set(process.argv.slice(2))
    const wantJson = args.has("--json")
    const wantMd = args.has("--md")
    const includeData = args.has("--include-data")

    const files = await collectFiles(SRC_DIR, includeData)
    const hits: Hit[] = []
    for (const file of files) {
        const content = await readFile(file, "utf-8")
        if (!CJK_RE.test(content)) continue
        const rel = relative(ROOT, file).replace(/\\/g, "/")
        const local: Hit[] = []
        if (file.endsWith(".vue")) await scanVue(content, local)
        else {
            const loc = makeLocator(content)
            extractScriptStrings(content, 0, loc, "ts", local)
        }
        for (const h of local) hits.push({ ...h, rel })
    }

    // 只保留高置信度的「界面文案」：模板文本节点、静态属性、脚本字符串
    const candidates = hits.filter(h => {
        if (h.ctx === "tpl-expr") return false
        if (h.ctx === "tpl-attr") return ATTR_TEXT_RE.test(h.kind.replace(/^attr:/, ""))
        return true
    })

    // A/B 分组：文件是否已接入 i18n
    const fileHits = new Map<string, Hit[]>()
    for (const h of candidates) {
        if (!fileHits.has(h.rel)) fileHits.set(h.rel, [])
        fileHits.get(h.rel)!.push(h)
    }
    const groupA = new Map<string, Hit[]>()
    const groupB = new Map<string, Hit[]>()
    for (const [rel, list] of fileHits) {
        const content = await readFile(join(ROOT, rel), "utf-8")
        const i18nCalls = (content.match(/\$t\(|i18next\.t\(|\bt\(["'`]|useTranslation/g) ?? []).length
        ;(i18nCalls > 0 ? groupA : groupB).set(rel, list)
    }

    const countOf = (g: Map<string, Hit[]>): number => [...g.values()].reduce((s, v) => s + v.length, 0)

    console.log(`扫描文件        : ${files.length}`)
    console.log(`硬编码命中      : ${candidates.length} 条 / ${fileHits.size} 文件`)
    console.log(`  A 组 已接入 i18n 但有遗漏 : ${countOf(groupA)} 条 / ${groupA.size} 文件`)
    console.log(`  B 组 完全未接入 i18n      : ${countOf(groupB)} 条 / ${groupB.size} 文件`)
    console.log(`去重文案        : ${new Set(candidates.map(h => h.text)).size} 条`)

    if (wantJson) {
        // Map 直接 JSON.stringify 会变成 {}，统一转成普通对象再落盘
        const toObject = (g: Map<string, Hit[]>): Record<string, Hit[]> =>
            Object.fromEntries([...g.entries()].sort((a, b) => b[1].length - a[1].length))
        await writeFile(
            JSON_REPORT,
            JSON.stringify(
                {
                    scannedFiles: files.length,
                    total: candidates.length,
                    uniqueTexts: new Set(candidates.map(h => h.text)).size,
                    groupA: toObject(groupA),
                    groupB: toObject(groupB),
                },
                null,
                4
            ),
            "utf-8"
        )
        console.log(`\nJSON 报告: ${relative(ROOT, JSON_REPORT)}`)
    }

    if (wantMd) {
        let md = "# 硬编码界面文案审计报告\n\n"
        md += `> 由 \`bun tools/i18n-hardcoded-check.ts --md\` 生成。扫描 ${files.length} 个文件，命中 ${candidates.length} 条。\n\n`
        for (const [label, g, desc] of [
            ["A 组 · 已接入 i18n 却仍有硬编码", groupA, "文件已在用 i18n，这些是漏网的真遗漏，优先修。"],
            ["B 组 · 完全未接入 i18n", groupB, "整块界面尚未接入 i18n。"],
        ] as Array<[string, Map<string, Hit[]>, string]>) {
            md += `## ${label}（${g.size} 文件 / ${countOf(g)} 条）\n\n${desc}\n\n`
            for (const [rel, list] of [...g.entries()].sort((a, b) => b[1].length - a[1].length)) {
                md += `<details><summary><code>${rel}</code>（${list.length} 条）</summary>\n\n`
                for (const h of list) md += `- L${h.line} \`${h.kind}\` — ${h.text}\n`
                md += `\n</details>\n\n`
            }
        }
        await writeFile(MD_REPORT, md, "utf-8")
        console.log(`MD 报告  : ${relative(ROOT, MD_REPORT)}`)
    }
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
