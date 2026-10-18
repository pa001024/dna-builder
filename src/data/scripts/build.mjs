import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { chmod, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import ts from "typescript"

const PKG = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DIST = path.join(PKG, "dist")
const SKIP_DIRS = new Set(["node_modules", "dist", "scripts", "tests", "coverage"])
/** 构建产物中 MCP 入口体积上限，超过则视为误把数据打进入口 */
const MCP_ENTRY_SIZE_LIMIT = 1024 * 1024

/**
 * 递归收集需要构建的 TS 入口（排除测试、配置与工具脚本）。
 * @param dir 扫描目录
 * @returns 入口文件绝对路径列表
 */
async function collectEntries(dir) {
    const out = []
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            out.push(...(await collectEntries(full)))
        } else if (
            entry.name.endsWith(".ts") &&
            !entry.name.endsWith(".test.ts") &&
            !entry.name.endsWith(".spec.ts") &&
            !entry.name.endsWith(".config.ts")
        ) {
            out.push(full)
        }
    }
    return out
}

/**
 * 递归收集构建产物中的 JS 与声明文件。
 * @param dir 扫描目录
 * @returns 产物文件绝对路径列表
 */
async function collectOutputs(dir) {
    const out = []
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            out.push(...(await collectOutputs(full)))
        } else if (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts")) {
            out.push(full)
        }
    }
    return out
}

/**
 * 将无后缀的相对引用补全为 Node ESM 可解析的路径。
 * @param fromDir 引用方所在目录
 * @param spec 原始引用
 * @returns 补全后的引用，无法解析时返回 undefined，已带后缀时返回 null
 */
function resolveSpecifier(fromDir, spec) {
    if (spec.endsWith(".js")) return existsSync(path.resolve(fromDir, spec)) ? null : undefined
    const abs = path.resolve(fromDir, spec)
    if (existsSync(`${abs}.js`)) return `${spec}.js`
    if (existsSync(path.join(abs, "index.js"))) return `${spec.replace(/\/+$/, "")}/index.js`
    return undefined
}

/**
 * 用 TS AST 精确改写产物中的相对引用（避免正则误伤数据文本）。
 * @param file 产物文件
 * @param missing 收集无法解析的引用
 * @returns 是否发生改写
 */
async function fixFileExtensions(file, missing) {
    const text = await readFile(file, "utf8")
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.Unknown)
    const edits = []
    const visit = node => {
        let literal
        if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteralLike(node.moduleSpecifier)
        ) {
            literal = node.moduleSpecifier
        } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
            literal = node.argument.literal
        } else if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments.length === 1 &&
            ts.isStringLiteralLike(node.arguments[0])
        ) {
            literal = node.arguments[0]
        }
        if (literal?.text.startsWith(".")) {
            const fixed = resolveSpecifier(path.dirname(file), literal.text)
            if (typeof fixed === "string") {
                edits.push({ start: literal.getStart(source) + 1, end: literal.getEnd() - 1, text: fixed })
            } else if (fixed === undefined) {
                missing.push(`${path.relative(DIST, file)} <- ${literal.text}`)
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(source)
    if (edits.length === 0) return false
    edits.sort((a, b) => b.start - a.start)
    let next = text
    for (const edit of edits) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end)
    await writeFile(file, next)
    return true
}

/**
 * 单次构建数据 JS + d.ts，MCP 入口仅转译不打包数据。
 */
async function main() {
    await rm(DIST, { recursive: true, force: true })

    const entries = await collectEntries(PKG)
    if (entries.length === 0) throw new Error("[build] no entry found")

    await build({
        entryPoints: entries,
        outdir: DIST,
        outbase: PKG,
        bundle: false,
        format: "esm",
        platform: "node",
        target: "node18",
        logLevel: "warning",
    })

    const tscBin = path.join(PKG, "node_modules", "typescript", "bin", "tsc")
    const tsc = spawnSync(process.execPath, [tscBin, "-p", "tsconfig.build.json"], { cwd: PKG, stdio: "inherit" })
    if (tsc.status !== 0) throw new Error("[build] tsc declaration emit failed")

    const outputs = await collectOutputs(DIST)
    const missing = []
    let fixedCount = 0
    for (const file of outputs) {
        if (await fixFileExtensions(file, missing)) fixedCount++
    }
    if (missing.length > 0) throw new Error(`[build] unresolvable relative imports:\n${missing.join("\n")}`)

    const mcpEntry = path.join(DIST, "mcp", "index.js")
    let mcpText = await readFile(mcpEntry, "utf8")
    if (!mcpText.startsWith("#!")) {
        await writeFile(mcpEntry, `#!/usr/bin/env node\n${mcpText}`)
        mcpText = await readFile(mcpEntry, "utf8")
    }
    await chmod(mcpEntry, 0o755)

    for (const required of ["index.js", "index.d.ts", path.join("mcp", "index.js")]) {
        if (!existsSync(path.join(DIST, required))) throw new Error(`[build] missing output: ${required}`)
    }
    if (Buffer.byteLength(mcpText) > MCP_ENTRY_SIZE_LIMIT) {
        throw new Error("[build] dist/mcp/index.js too large, data may have been bundled into the entry")
    }
    console.log(`[build] done: ${entries.length} modules, ${fixedCount} files extension-fixed`)
}

await main()
