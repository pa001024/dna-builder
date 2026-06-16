import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import type { Plugin } from "vite"

const DATA_PACK_MODULES = new Set([
    "accessory.data.ts",
    "achievement.data.ts",
    "autochess.data.ts",
    "backpackpuzzle.data.ts",
    "char.data.ts",
    "book.data.ts",
    "mod.data.ts",
    "weapon.data.ts",
    "monster.data.ts",
    "buff.data.ts",
    "effect.data.ts",
    "convert.data.ts",
    "draft.data.ts",
    "dungeon.data.ts",
    "event.data.ts",
    "abyss.data.ts",
    "fish.data.ts",
    "forge.data.ts",
    "headsculpture.data.ts",
    "iconticket.data.ts",
    "ironsurvival.data.ts",
    "jargon.data.ts",
    "levelup.data.ts",
    "limitedprize.data.ts",
    "charext.data.ts",
    "charext.en.data.ts",
    "charext.fr.data.ts",
    "charext.jp.data.ts",
    "charext.kr.data.ts",
    "charext.tc.data.ts",
    "charvoice.data.ts",
    "charvoice.en.data.ts",
    "charvoice.jp.data.ts",
    "charvoice.kr.data.ts",
    "optreward.data.ts",
    "reward.data.ts",
    "cutoff.data.ts",
    "reputation.data.ts",
    "resource.data.ts",
    "shop.data.ts",
    "solotreasure.data.ts",
    "subregion.data.ts",
    "title.data.ts",
    "pet.data.ts",
    "monstertag.data.ts",
    "mount.data.ts",
    "npc.data.ts",
    "walnut.data.ts",
    "partytopic.data.ts",
    "partytopic.en.data.ts",
    "partytopic.fr.data.ts",
    "partytopic.jp.data.ts",
    "partytopic.kr.data.ts",
    "partytopic.tc.data.ts",
    "quest.data.ts",
    "quest.en.data.ts",
    "quest.fr.data.ts",
    "quest.jp.data.ts",
    "quest.kr.data.ts",
    "quest.tc.data.ts",
    "questchain.data.ts",
])

type ExportFallback = {
    code: string
    kind: "array" | "object" | "map" | "undefined"
}

/**
 * 从声明语句生成空值。
 * @param declaration 变量声明
 * @returns 空值代码与类型
 */
function getFallbackFromExpression(
    expression: ts.Expression | undefined,
    declarations: Map<string, ts.VariableDeclaration>
): ExportFallback {
    if (!expression) {
        return { code: "undefined", kind: "undefined" }
    }

    if (ts.isParenthesizedExpression(expression)) {
        return getFallbackFromExpression(expression.expression, declarations)
    }

    if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
        return getFallbackFromExpression(expression.expression, declarations)
    }

    const isSatisfiesExpression = (
        ts as typeof ts & {
            isSatisfiesExpression?: (node: ts.Node) => node is ts.SatisfiesExpression
        }
    ).isSatisfiesExpression

    if (isSatisfiesExpression?.(expression)) {
        return getFallbackFromExpression(expression.expression, declarations)
    }

    if (ts.isArrayLiteralExpression(expression)) {
        return { code: "[]", kind: "array" }
    }

    if (ts.isObjectLiteralExpression(expression)) {
        return { code: "{}", kind: "object" }
    }

    if (ts.isNewExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "Map") {
        return { code: "new Map()", kind: "map" }
    }

    if (ts.isCallExpression(expression)) {
        if (ts.isPropertyAccessExpression(expression.expression) && expression.expression.name.text === "map") {
            return { code: "[]", kind: "array" }
        }

        if (expression.arguments[0]) {
            const nested = getFallbackFromExpression(expression.arguments[0] as ts.Expression, declarations)
            if (nested.kind !== "undefined") {
                return nested
            }
        }

        if (ts.isIdentifier(expression.expression)) {
            const nested = getFallbackFromExpression(declarations.get(expression.expression.text)?.initializer, declarations)
            if (nested.kind !== "undefined") {
                return nested
            }
        }
    }

    if (ts.isIdentifier(expression)) {
        const declaration = declarations.get(expression.text)
        return getFallbackFromExpression(declaration?.initializer, declarations)
    }

    return { code: "undefined", kind: "undefined" }
}

/**
 * 提取顶层导出初始化语句。
 * @param sourcePath 源文件路径
 * @returns 导出与空值策略
 */
function collectExportFallbacks(sourcePath: string): Map<string, ExportFallback> {
    const source = fs.readFileSync(sourcePath, "utf8")
    const fallbacks = new Map<string, ExportFallback>()
    const declarations = new Map<string, ts.VariableDeclaration>()

    const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue
        }

        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name)) {
                continue
            }

            declarations.set(declaration.name.text, declaration)
            if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
                const exportName = declaration.name.text
                fallbacks.set(exportName, getFallbackFromExpression(declaration.initializer, declarations))
            }
        }
    }

    for (const statement of sourceFile.statements) {
        if (!ts.isExportAssignment(statement) || statement.isExportEquals) {
            continue
        }

        const fallback = getFallbackFromExpression(statement.expression, declarations)
        if (fallback.kind === "undefined" && ts.isCallExpression(statement.expression) && statement.expression.arguments[0]) {
            const nested = getFallbackFromExpression(statement.expression.arguments[0] as ts.Expression, declarations)
            if (nested.kind !== "undefined") {
                fallbacks.set("default", nested)
                continue
            }
        }
        fallbacks.set("default", fallback)
    }

    return fallbacks
}

/**
 * 生成数据包壳模块代码。
 * @param sourcePath 源文件路径
 * @returns 重写后的模块代码，未命中时返回 null
 */
function rewriteDataPackModule(sourcePath: string): string | null {
    const fileName = path.basename(sourcePath)
    if (!DATA_PACK_MODULES.has(fileName)) {
        return null
    }

    const moduleKey = path.relative(path.resolve("src/data/d"), sourcePath).replaceAll(path.sep, "/").replace(/\.ts$/, "")
    const source = fs.readFileSync(sourcePath, "utf8")
    const hasDefaultExport = /export\s+default\b/.test(source)
    const namedExports = [...source.matchAll(/export\s+(const|function|enum|class)\s+([A-Za-z0-9_]+)/g)]
        .map(match => match[2])
        .filter(Boolean)
    const exportNames = [...new Set([...namedExports, ...(hasDefaultExport ? ["default"] : [])])]
    const fallbacks = collectExportFallbacks(sourcePath)

    const lines = [
        `import { registerDataPackBinding } from "../data-pack-bridge"`,
        `import { syncDataPackModuleBindings } from "../data-pack"`,
        "",
    ]

    for (const exportName of exportNames) {
        if (exportName === "default") {
            const fallback = fallbacks.get("default") ?? { code: "undefined", kind: "undefined" }
            lines.push(`export let defaultExport = ${fallback.code}`)
            lines.push(
                `registerDataPackBinding(${JSON.stringify(moduleKey)}, "default", ${JSON.stringify(fallback.kind)}, value => { defaultExport = value as typeof defaultExport })`
            )
            continue
        }
        const fallback = fallbacks.get(exportName) ?? { code: "undefined", kind: "undefined" }
        lines.push(`export let ${exportName} = ${fallback.code}`)
        lines.push(
            `registerDataPackBinding(${JSON.stringify(moduleKey)}, ${JSON.stringify(exportName)}, ${JSON.stringify(fallback.kind)}, value => { ${exportName} = value as typeof ${exportName} })`
        )
    }

    lines.push("")
    lines.push(`syncDataPackModuleBindings(${JSON.stringify(moduleKey)})`)

    lines.push("")
    if (exportNames.includes("default")) {
        lines.push("export { defaultExport as default }")
    }
    return lines.join("\n")
}

/**
 * 创建数据包重写插件。
 * @returns Vite 插件
 */
export function dataPackRewritePlugin(): Plugin {
    return {
        name: "dna-builder-data-pack-rewrite",
        enforce: "pre",
        async load(id) {
            const cleanId = id.split("?")[0]
            if (!cleanId.endsWith(".data.ts")) {
                return null
            }

            const rewritten = rewriteDataPackModule(cleanId)
            return rewritten
        },
    }
}
