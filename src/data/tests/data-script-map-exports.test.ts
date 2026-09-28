import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const DATA_SCRIPT_DIR = path.resolve(__dirname, "..", "d")

/**
 * 判断表达式中是否直接构造了 Map。
 *
 * 只扫描当前表达式自身，不进入箭头函数/函数表达式体：
 * 导出函数内部临时建 Map 属于函数实现，不属于「导出 Map」。
 * @param expression 待检查的表达式
 * @returns 是否构造了 Map
 */
function createsMap(expression: ts.Expression): boolean {
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
        return false
    }

    if (ts.isParenthesizedExpression(expression)) {
        return createsMap(expression.expression)
    }

    if (ts.isNewExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "Map") {
        return true
    }

    return ts.forEachChild(expression, child => (ts.isExpression(child) && createsMap(child) ? true : undefined)) ?? false
}

/**
 * 收集单个 data 脚本中导出的 Map 型变量名。
 *
 * 命中两种写法：显式标注 `Map<...>` 的类型注解，以及初始化表达式里直接 `new Map(...)`
 * （含 `[...].reduce(..., new Map())` 这类派生索引）。
 * @param sourcePath data 脚本路径
 * @returns 违规的导出名列表
 */
function findExportedMapBindings(sourcePath: string): string[] {
    const source = fs.readFileSync(sourcePath, "utf8")
    // 便宜的预筛：任何 Map 相关写法都必须含 "Map" 字样，避免为十几 MB 的纯数据文件做 AST 解析
    if (!source.includes("Map")) return []

    const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const violations: string[] = []

    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue
        if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue

        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name)) continue

            const annotation = declaration.type?.getText(sourceFile) ?? ""
            if (/^Map</.test(annotation)) {
                violations.push(declaration.name.text)
                continue
            }

            if (declaration.initializer && createsMap(declaration.initializer)) {
                violations.push(declaration.name.text)
            }
        }
    }

    return violations
}

describe("data 脚本导出约束", () => {
    it("data 脚本不导出任何动态生成的 Map（派生索引一律放 data/d/index.ts 重建）", () => {
        const scripts = fs
            .readdirSync(DATA_SCRIPT_DIR)
            .filter(name => name.endsWith(".data.ts"))
            .sort()
        expect(scripts.length).toBeGreaterThan(0)

        const offenders = scripts
            .map(name => ({ name, violations: findExportedMapBindings(path.join(DATA_SCRIPT_DIR, name)) }))
            .filter(entry => entry.violations.length > 0)
            .map(entry => `${entry.name}: ${entry.violations.join(", ")}`)

        expect(offenders).toEqual([])
    })
})
