import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"

/**
 * DNA Builder AST 表达式的 CodeMirror 专用语法高亮。
 * 词法规则与 src/data/ast.ts 的 Tokenizer 保持一致；配色与 ASTHelp 面板的 AST 树一致，
 * 通过 --ast-* CSS 变量驱动，支持亮暗主题实时切换（变量定义见 CodeEditor.vue）。
 */

export interface AstLanguageOptions {
    /** 内置宏名集合（如 总伤/DPS），词法阶段会被替换，编辑器中按宏高亮 */
    macros?: Set<string>
}

/**
 * 创建 AST 语言的 CodeMirror 语法解析器（StreamLanguage 行扫描器）。
 * 行级状态用于区分成员访问、临时属性名等上下文：括号深度、属性块深度、
 * 下一个标识符是否为临时属性名、前一个有效 token 是否为成员访问符 .。
 * @param options 可选配置（内置宏集合）
 * @returns AST 语言实例
 */
export function createAstLanguage(options: AstLanguageOptions = {}) {
    const macros = options.macros ?? new Set<string>()
    return StreamLanguage.define({
        startState: () => ({ parenDepth: 0, braceDepth: 0, expectAttrName: false, lastWasDot: false }),
        token(stream, state) {
            if (stream.eatSpace()) return null
            // 数字：以数字开头，可含小数点
            if (stream.match(/^\d[\d.]*/)) return "number"
            // 运算符（含 //）
            if (stream.match(/^\/\//)) return "operator"
            if (stream.match(/^[+\-*/%]/)) return "operator"
            // 命名空间分隔符 ::
            if (stream.match(/^::/)) {
                state.lastWasDot = false
                return "operator"
            }
            if (stream.match(/^\./)) {
                state.lastWasDot = true
                return "punctuation"
            }
            if (stream.match(/^\{/)) {
                state.braceDepth++
                state.expectAttrName = true
                state.lastWasDot = false
                return "punctuation"
            }
            if (stream.match(/^\}/)) {
                state.braceDepth = Math.max(0, state.braceDepth - 1)
                state.lastWasDot = false
                return "punctuation"
            }
            if (stream.match(/^\(/)) {
                state.parenDepth++
                state.lastWasDot = false
                return "punctuation"
            }
            if (stream.match(/^\)/)) {
                state.parenDepth = Math.max(0, state.parenDepth - 1)
                state.lastWasDot = false
                return "punctuation"
            }
            if (stream.match(/^,/)) {
                // 位于临时属性块顶层时，逗号后应为下一个属性名
                if (state.braceDepth > 0 && state.parenDepth === 0) state.expectAttrName = true
                state.lastWasDot = false
                return "punctuation"
            }
            if (stream.match(/^:/)) {
                state.lastWasDot = false
                return "punctuation"
            }
            // 标识符：[Tag]Name / 属性 / 函数 / 命名空间 / 成员 / 宏
            if (stream.match(/^[a-zA-Z_\u4e00-\u9fa5·\[\]][a-zA-Z0-9_\u4e00-\u9fa5·\[\]]*/)) {
                const value = stream.current()
                const afterDot = state.lastWasDot
                const expectAttr = state.expectAttrName
                state.lastWasDot = false
                state.expectAttrName = false
                const rest = stream.string.slice(stream.pos)
                // 命名空间：后面紧跟 ::
                if (rest.startsWith("::")) return "namespace"
                // 函数：后面紧跟 (（function 是修饰符，须位于基础 tag 之后）
                if (/^\s*\(/.test(rest)) return "variableName.function"
                // 成员访问：紧跟在一个 . 之后（special 修饰符须位于基础 tag 之后）
                if (afterDot) return "propertyName.special"
                // 临时属性名：位于 { 或 , 之后
                if (expectAttr) return "attributeName"
                // 内置宏
                if (macros.has(value)) return "macroName"
                // 方括号关键字（[攻击] 等，无后续名称）
                if (value.endsWith("]")) return "keyword"
                // 带标签的字段（[Tag]Name，如 [幻象]伤害）按技能字段着色
                if (value.includes("[")) return "typeName"
                return "propertyName"
            }
            // 未知字符：吃进一个字符并中性着色（词法校验会在 parse 阶段报错）
            stream.next()
            return "punctuation"
        },
    })
}

/** AST 语言高亮样式：与 ASTHelp 的 AST 树配色一致（颜色经 --ast-* CSS 变量注入） */
export const astHighlightStyle = HighlightStyle.define([
    { tag: [t.number, t.integer, t.float], color: "var(--ast-number)" },
    { tag: t.keyword, color: "var(--ast-keyword)" },
    { tag: t.propertyName, color: "var(--ast-property)" },
    { tag: t.special(t.propertyName), color: "var(--ast-member)" },
    { tag: t.attributeName, color: "var(--ast-attr)" },
    { tag: t.function(t.variableName), color: "var(--ast-function)" },
    { tag: t.namespace, color: "var(--ast-namespace)" },
    { tag: t.typeName, color: "var(--ast-type)" },
    { tag: t.macroName, color: "var(--ast-macro)" },
    { tag: t.operator, color: "var(--ast-operator)" },
    { tag: t.punctuation, color: "var(--ast-punctuation)" },
])

/**
 * AST 语言扩展：语法解析 + 高亮，供 CodeEditor 在 language="ast" 时使用。
 * @param options 可选配置（内置宏集合）
 * @returns CodeMirror 扩展数组
 */
export function astLanguageExtension(options: AstLanguageOptions = {}) {
    return [createAstLanguage(options), syntaxHighlighting(astHighlightStyle)]
}
