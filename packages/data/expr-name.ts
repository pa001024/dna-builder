/** 表达式标识符不允许的字符：与 `ast.ts` 词法器的标识符规则保持一致（`·` 与 `[]` 合法） */
const EXPR_IDENTIFIER_INVALID_RE = /[^a-zA-Z0-9_一-龥·[\]]/g

/**
 * 把游戏数据里的技能 / 字段 / 角色名转成可直接写入表达式的标识符。
 * `/` 保持旧的 `_` 替换；词法器不接受的字符（引号、感叹号、全角括号等）直接移除。
 * 数字开头会补 `_`，避免被词法器当成数字 token。
 * @param name 原始名称
 * @returns 表达式标识符
 */
export function toExprIdentifier(name: string): string {
    const cleaned = name.replace(/\//g, "_").replace(EXPR_IDENTIFIER_INVALID_RE, "")
    if (!cleaned) return "_"
    return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}
