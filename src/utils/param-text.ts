import type { ParamText } from "@/data/data-types"

/** 把原文模板翻成当前语言的函数 */
export type ParamTextTranslator = (text: string) => string

/**
 * 句末标点：用于切出「首句」。
 *
 * 武器熔炼文案的首句是属性加成摘要（如「角色攻击+#1。」），
 * 该数值已由属性区单独展示，效果区只需其后正文。
 */
const SENTENCE_END = /[。！？]/

/**
 * 把档位夹进数组的有效下标范围。
 * @param index 档位下标
 * @param length 数组长度
 * @returns 有效下标；数组为空时返回 0
 */
function clampIndex(index: number, length: number): number {
    if (length <= 0) {
        return 0
    }
    return Math.min(Math.max(Math.trunc(index), 0), length - 1)
}

/**
 * 判断值是否为「模板 + 参数数组」形式。
 *
 * 参数化文本形如 `[模板, #1 的取值, #2 的取值, ...]`：首项是含 `#1`/`#2`
 * 占位符的模板，其后每一项都是某个占位符在各档位上的取值。
 * 只有首项是字符串、且第二项也是数组时才算参数化——单纯的多档位文本数组
 * （`["1级文案", "2级文案"]`）走按档位取项的路径。
 * @param value 待判断的值
 * @returns 是参数化文本返回 true
 */
export function isParameterizedText(value: ParamText | null | undefined): boolean {
    return Array.isArray(value) && typeof value[0] === "string" && Array.isArray(value[1])
}

/**
 * 取参数化文本的模板（需要翻译的那一项）。
 * @param value 待取值的字段
 * @returns 模板原文；无内容返回空串
 */
export function getParamTemplate(value: ParamText | null | undefined): string {
    if (typeof value === "string") {
        return value
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
        return value[0]
    }
    return ""
}

/**
 * 按档位把 `熔炼` / `效果` 这类字段求值成可直接展示的文本。
 *
 * 三种形态都支持：
 * - **字符串**：单条文本，原样交给 `translate`。
 * - **参数化数组** `[模板, #1 取值, #2 取值, …]`：先把模板翻成当前语言，
 *   再把 `#N` 替换为第 N 个参数数组的第 `index` 项。
 * - **多档位文本数组** `["1级文案", "2级文案", …]`：取第 `index` 项后翻译。
 *
 * 求值顺序固定为「**先翻译模板、再代入数值**」：翻译对照表里收录的是模板键
 * （如「角色攻击+#1。」），若先代入数值得到「角色攻击+60.0%。」再去翻译就查不到了。
 * @param value 待求值的字段
 * @param index 档位下标（武器的精炼等级、MOD 的 `等级 - 1`）
 * @param translate 模板翻译函数，默认不翻译
 * @returns 求值后的文本；无内容返回空串
 */
export function formatParamText(value: ParamText | null | undefined, index: number, translate?: ParamTextTranslator): string {
    const tr: ParamTextTranslator = translate ?? (text => text)

    if (typeof value === "string") {
        return value ? tr(value) : ""
    }

    if (!Array.isArray(value) || !value.length) {
        return ""
    }

    if (isParameterizedText(value)) {
        const template = String(value[0])
        const arrays = value.slice(1).filter((item): item is string[] => Array.isArray(item))
        return tr(template).replace(/#(\d+)/g, (matched, digits: string) => {
            const array = arrays[Number(digits) - 1]
            if (!Array.isArray(array) || !array.length) {
                return matched
            }
            return array[clampIndex(index, array.length)] ?? matched
        })
    }

    const texts = value.filter((item): item is string => typeof item === "string")
    if (!texts.length) {
        return ""
    }

    return tr(texts[clampIndex(index, texts.length)])
}

/**
 * 去掉首句，只保留其后正文。
 *
 * 武器熔炼文案的首句是属性加成摘要（「角色攻击+#1。」），数值已在属性区展示，
 * 效果区只留正文才能避免重复。只有一句时返回空串。
 * @param text 已求值（并已翻译）的完整文本
 * @returns 去掉首句后的正文
 */
export function stripFirstSentence(text: string): string {
    const end = text.search(SENTENCE_END)
    if (end < 0) {
        return text
    }
    return text.slice(end + 1).trim()
}

/**
 * 按极性标记把效果文案切成「前段 / 极性字母 / 后段」，供模板渲染极性图标。
 *
 * 极性字母只在**译文**里定位：上游的中文原文形如「仅当装备D趋向的魔之楔…」，
 * 但各语言对标记的译法完全不同（繁中「A趨向」/ 英「Track A」/ 日「Aルーン」/
 * 韩「A 성향」/ 法「affinité A」），唯一跨语言成立的特征是这个字母本身
 * 始终作为独立词出现，所以用「前后都不是字母的单个极性字母」来定位。
 * 定位失败时返回单元素数组，调用方退回整段显示（只是不显示图标）。
 * @param translated 已翻译的效果文本
 * @param polarity 极性字母
 * @returns 三段式 [前段, 极性字母, 后段]；无法定位时返回 [整段]
 */
export function splitByPolarity(translated: string, polarity?: string): string[] {
    if (!polarity) {
        return [translated]
    }

    const marker = translated.match(new RegExp(`(?<![A-Za-z])${polarity}(?![A-Za-z])`))
    if (!marker || marker.index === undefined) {
        return [translated]
    }

    return [translated.slice(0, marker.index), polarity, translated.slice(marker.index + polarity.length)]
}

/**
 * 判断效果文案的**原文**是否带极性标记（`[DVOA]趋向`）。
 *
 * 判定必须用原文：译文里的标记形态各异，正则匹配不到。
 * @param raw 效果原文
 * @returns 带极性标记返回 true
 */
export function hasPolarityMarker(raw: ParamText | null | undefined): boolean {
    return /[DVOA]趋向/.test(getParamTemplate(raw))
}
