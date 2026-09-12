import type { CharBuild } from "@/data"
import { TokenType, tokenizeAST } from "@/data/ast"

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

//#region 表达式整字段删除（Ctrl/Alt + 退格）

/** 扫描到的表达式片段，position 为片段首字符在表达式中的下标 */
interface ExprToken {
    type: TokenType
    value: string
    position: number
}

/** 可与字段链相接的后缀 token：成员访问点、临时属性块、数字（临时属性值/字段成员） */
const FIELD_CHAIN_TOKEN_TYPES = new Set<TokenType>([TokenType.DOT, TokenType.LBRACE, TokenType.NUMBER])

/**
 * 用与 AST 词法器完全一致的规则扫描整个表达式（保留空白 token）。
 * 宏名原样保留，因为删除针对的是用户实际输入的文本。
 * @param expression 表达式文本
 * @returns token 序列；词法错误（含非法字符）时返回 undefined，由调用方回退到默认删除
 */
function lexExpression(expression: string): ExprToken[] | undefined {
    try {
        return tokenizeAST(expression)
    } catch {
        return undefined
    }
}

/**
 * 判断 token 是否为需要跳过的空白片段。
 * @param token 待判断的 token
 * @returns 是否为空白
 */
function isSpaceToken(token: ExprToken | undefined): boolean {
    return !!token && token.type === TokenType.WHITESPACE
}

/**
 * 查找与 tokens[openIndex] 处的左大括号配对的右大括号下标。
 * @param tokens token 序列
 * @param openIndex 左大括号下标
 * @returns 配对右大括号的下标；未配对时返回 undefined
 */
function findMatchingBrace(tokens: ExprToken[], openIndex: number): number | undefined {
    let depth = 0
    for (let i = openIndex; i < tokens.length; i++) {
        if (tokens[i].type === TokenType.LBRACE) depth++
        else if (tokens[i].type === TokenType.RBRACE) {
            depth--
            if (depth === 0) return i
        }
    }
    return undefined
}

/**
 * 查找与 tokens[openIndex] 处的左括号配对的右括号下标。
 * @param tokens token 序列
 * @param openIndex 左括号下标
 * @returns 配对右括号的下标；未配对时返回 undefined
 */
function findMatchingParen(tokens: ExprToken[], openIndex: number): number | undefined {
    let depth = 0
    for (let i = openIndex; i < tokens.length; i++) {
        if (tokens[i].type === TokenType.LPAREN) depth++
        else if (tokens[i].type === TokenType.RPAREN) {
            depth--
            if (depth === 0) return i
        }
    }
    return undefined
}

/**
 * 计算从 tokens[start] 开始的字段单元（字段主体 + 命名空间 + 成员访问/临时属性后缀链）的结束下标。
 * 字段单元内部不允许跨空白，因此不会越过运算符等其它片段。
 * @param tokens token 序列
 * @param start 单元起点下标
 * @returns 单元结束下标（不含）；tokens[start] 不能作为字段单元起点时返回 undefined
 */
function findUnitEnd(tokens: ExprToken[], start: number): number | undefined {
    let i = start
    const head = tokens[i]
    if (head.type === TokenType.LPAREN) {
        // 括号分组：配对后才算字段（(攻击+防御).暴击），"(" 本身不是字段
        const closeIndex = findMatchingParen(tokens, i)
        if (closeIndex === undefined) return undefined
        i = closeIndex + 1
    } else if (head.type === TokenType.IDENTIFIER) {
        const next = tokens[i + 1]
        // 命名空间 access：标识符 + "::" + 标识符 视作一个字段主体
        if (next?.type === TokenType.DOUBLE_COLON && tokens[i + 2]?.type === TokenType.IDENTIFIER) i += 2
        i++
    } else if (head.type === TokenType.NUMBER) {
        i++
    } else if (head.type === TokenType.DOT) {
        // 成员访问起点：".暴击"，自身不是字段主体
        i++
    } else if (head.type === TokenType.LBRACE) {
        // 临时属性块起点："{增伤:1}"，自身不是字段主体
        const closeIndex = findMatchingBrace(tokens, i)
        if (closeIndex === undefined) return undefined
        i = closeIndex + 1
    } else {
        return undefined
    }
    // 强制属性后缀 !（如 角色::攻击!）
    if (tokens[i]?.type === TokenType.BANG) i++
    // 成员访问与临时属性块可任意串联，如 字段{增伤:1}.暴击.触发
    for (;;) {
        const next = tokens[i]
        if (!next || !FIELD_CHAIN_TOKEN_TYPES.has(next.type)) break
        let memberEnd: number | undefined
        if (next.type === TokenType.NUMBER) {
            memberEnd = i + 1
        } else if (next.type === TokenType.DOT) {
            memberEnd = tokens[i + 1]?.type === TokenType.IDENTIFIER ? i + 2 : undefined
        } else {
            const closeIndex = findMatchingBrace(tokens, i)
            memberEnd = closeIndex === undefined ? undefined : closeIndex + 1
        }
        if (memberEnd === undefined) break
        i = memberEnd
        if (tokens[i]?.type === TokenType.BANG) i++
    }
    return i
}

/**
 * 在 token 序列中挑选覆盖光标左侧内容的字段单元：取「覆盖锚点、且结束 token 最靠右」的单元。
 * 支持三类起点：字段主体（含命名空间与 ! 后缀）、临时属性块 {..}、括号分组（如 (攻+防).暴击）。
 * @param tokens token 序列
 * @param pos 光标位置
 * @returns 单元的起止 token 下标（不含结束下标）；没有可用单元时返回 undefined
 */
function selectUnitAt(tokens: ExprToken[], pos: number): { start: number; end: number } | undefined {
    // 光标前的空白不计入删除范围，锚点取光标前最后一个非空白 token 的起点
    let anchor = 0
    for (const token of tokens) {
        if (isSpaceToken(token) || token.position >= pos) continue
        anchor = token.position
    }
    let best: { start: number; end: number } | undefined
    for (let start = 0; start < tokens.length; start++) {
        if (isSpaceToken(tokens[start])) continue
        // 单元起点必须在锚点之前（或正好是锚点）；起点在锚点之后的留给默认删除
        if (tokens[start].position > anchor) break
        const end = findUnitEnd(tokens, start)
        if (end === undefined) continue
        // 单元必须覆盖锚点（即覆盖光标左侧的内容），否则该单元在光标左侧已结束
        const last = tokens[end - 1]
        if (last.position + last.value.length <= anchor) continue
        if (!best || end > best.end) best = { start, end }
    }
    return best
}

/**
 * 计算 Ctrl/Alt + 退格应删除的区间：把光标所在（或左侧紧邻）的整个 AST 字段（如 近战::攻击!）一次删掉。
 * 字段链为「字段主体 + 命名空间 + 成员访问 .xx + 临时属性 {..} + ! 后缀」的连续片段，
 * 遇到运算符、逗号、右括号等即结束；光标停在字段中间时同样删掉整段，避免拆开 "::"/"!"。
 * 光标左侧不是完整字段（例如紧跟在 ")" 之后、停在独立的 "." / "{" 之后、输入了非法字符）时返回 undefined，
 * 由调用方回退到浏览器/编辑器默认的按词删除。
 * @param expression 表达式文本
 * @param caret 光标位置（字符下标，即选区起点/终点）
 * @returns 待删除区间 [start, end)；无需整字段删除时返回 undefined
 */
export function findFieldDeleteRange(expression: string, caret: number): { start: number; end: number } | undefined {
    const pos = Math.max(0, Math.min(caret, expression.length))
    if (pos === 0) return undefined
    // 需要扫描整个表达式：字段可能跨越光标（如光标停在 "近战::攻|击!" 中间）
    const tokens = lexExpression(expression)
    if (!tokens?.length) return undefined
    const unit = selectUnitAt(tokens, pos)
    if (!unit) return undefined
    // 光标停在字段中间的 token 上时，连同该 token 的完整内容一起删除，避免残留半个标识符
    if (unit.end < tokens.length && tokens[unit.end].position < pos && tokens[unit.end].type !== TokenType.WHITESPACE) {
        unit.end++
    }
    // 删除区间右边界必须是字段链能收尾的 token（右括号/右大括号结尾属于独立片段，交给默认删除）
    const tail = tokens[unit.end - 1]
    if (
        tail.type !== TokenType.IDENTIFIER &&
        tail.type !== TokenType.NUMBER &&
        tail.type !== TokenType.BANG &&
        tail.type !== TokenType.RBRACE
    ) {
        return undefined
    }
    // 括号必须成对落在删除区间内，避免把 max(攻击, 防御) 之类只删掉一半
    if (!hasBalancedPairs(tokens.slice(unit.start, unit.end))) return undefined
    const rangeStart = tokens[unit.start].position
    const rangeEnd = tail.position + tail.value.length
    if (rangeStart >= rangeEnd) return undefined
    return { start: rangeStart, end: rangeEnd }
}

/**
 * 判断 token 片段内的圆括号与大括号是否各自成对且顺序正确（不含未配对/交叉的错误输入）。
 * @param tokens 待校验的 token 片段
 * @returns 括号是否平衡
 */
function hasBalancedPairs(tokens: ExprToken[]): boolean {
    const pairs: [TokenType, TokenType][] = [
        [TokenType.LPAREN, TokenType.RPAREN],
        [TokenType.LBRACE, TokenType.RBRACE],
    ]
    for (const [open, close] of pairs) {
        const stack: number[] = []
        for (const token of tokens) {
            if (token.type === open) stack.push(token.position)
            else if (token.type === close && stack.pop() === undefined) return false
        }
        if (stack.length) return false
    }
    return true
}

//#endregion
