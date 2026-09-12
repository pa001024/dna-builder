import type { CharBuild } from "@/data"

/** 表达式左边界字符：以这些字符结尾时，其后插入字段无需补 "+" 连接符 */
const LEFT_NO_PLUS_RE = /[+\-*/%(=[{,:.]$/

/** 表达式右边界字符：以这些字符开头时，其前插入字段无需补 "+" 连接符 */
const RIGHT_NO_PLUS_RE = /^[+\-*/%)\]},:]/

/** 左边界需要补空格的操作符：紧跟在这些符号之后插入字段时补一个空格（如 攻击 * → 攻击 * 字段） */
const LEFT_SPACE_RE = /[,+\-*/%]$/

/** 右边界需要补空格的操作符：插入点紧接这些符号时补一个空格（如 *2 → * 2） */
const RIGHT_SPACE_RE = /^[,+\-*/%]/

/**
 * 将字段文本插入表达式，并自动判断是否需要补 "+" 连接符与空格。
 * 判定思路与 ASTHelp 中「插入伤害类型成员自动补 .」一致：仅当插入点两侧都能接上操作数时才补连接符，
 * 因此空表达式、紧跟在运算符/左括号/逗号之后、以及紧跟右括号之前都不会多出 "+"。
 * 不补 "+" 时仍会在运算符/逗号相邻处留一个空格，避免与既有 token 粘连。
 * @param existing 现有表达式文本
 * @param insert 待插入的字段文本（如 角色::攻击!）
 * @param index 插入位置（字符索引），默认追加到末尾
 * @returns 插入后的表达式文本
 */
export function joinExprText(existing: string, insert: string, index: number = existing.length): string {
    const safeIndex = Math.max(0, Math.min(index, existing.length))
    const before = existing.slice(0, safeIndex)
    const after = existing.slice(safeIndex)
    const needLeftPlus = before.trim() !== "" && !LEFT_NO_PLUS_RE.test(before.trimEnd())
    const needRightPlus = after.trim() !== "" && !RIGHT_NO_PLUS_RE.test(after.trimStart())
    const leftJoiner = needLeftPlus ? " + " : LEFT_SPACE_RE.test(before) ? " " : ""
    const rightJoiner = needRightPlus ? " + " : RIGHT_SPACE_RE.test(after) ? " " : ""
    return before + leftJoiner + insert + rightJoiner + after
}

/**
 * 获取技能字段对应的 AST 命名空间。
 * 角色主技能按 e/q/p 映射；其余技能（含武器技能）按技能 safeName 映射，
 * 与 evaluateAST 的 skillAttrs 键一致（skillAttrs 仅按技能名与 e/q/p 建立索引）。
 * @param charBuild 当前构筑
 * @param fieldName 字段名
 * @returns 命名空间；非当前选中技能的字段返回空字符串
 */
export function resolveSkillFieldNamespace(charBuild: CharBuild | undefined | null, fieldName: string): string {
    const skill = charBuild?.selectedSkill
    if (!charBuild || !skill) return ""
    const isField = skill.字段.some(field => field.名称 === fieldName || field.safeName === fieldName)
    if (!isField) return ""
    const index = charBuild.skills.findIndex(s => s.名称 === skill.名称)
    if (index >= 0) return ["e", "q", "p"][index] || skill.safeName
    return skill.safeName
}

/**
 * 将角色属性 / 技能字段解析为可直接写入表达式的文本，供「点击追加」与「拖拽放置」共用，
 * 保证同一字段无论点击还是拖拽都得到完全相同的表达式片段。
 * 已带命名空间的字段原样返回（仅把 / 替换为 _）；技能字段补全技能命名空间；
 * 其余角色属性补 角色:: 前缀并以 ! 强制按属性解析（如 角色::攻击!）。
 * @param charBuild 当前构筑
 * @param fieldName 字段名（角色属性键或技能字段名）
 * @returns 表达式字段文本
 */
export function resolveCharFieldExpression(charBuild: CharBuild | undefined | null, fieldName: string): string {
    const cleaned = fieldName.replace(/\//g, "_")
    if (cleaned.includes("::")) return cleaned
    const namespace = resolveSkillFieldNamespace(charBuild, cleaned)
    if (namespace) return `${namespace}::${cleaned}`
    return `角色::${cleaned}!`
}
