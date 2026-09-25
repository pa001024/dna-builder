import { useTranslation } from "i18next-vue"
import type { ParamText } from "@/data/data-types"
import { formatParamText } from "@/utils/param-text"
import { formatPetSkillText } from "@/utils/pet-skill-text"

/**
 * 游戏原文取词选项。
 *
 * 游戏原文本身就是翻译键（简体中文原文 → 译文），其中可能含 `.` 与 `:`
 * （如「角色攻击+60.0%。」「印象：道德」）。i18next 默认把这两个字符当键路径分隔符，
 * 所以取词时必须关掉，否则会按嵌套路径去查而取不到译文。
 */
const GAME_TEXT_OPTIONS = { keySeparator: false, nsSeparator: false } as const

/**
 * 把游戏数据里的原文文本翻译成当前语言。
 *
 * 数据层的名称、描述、技能文本等字段存的都是**简体中文原文**，各语言译文随数据包下发
 * （`src/data/translations-pack.ts` 注入 i18next）。组件里凡是直接输出这些字段的地方，
 * 都要过这个函数，否则界面会一直显示中文。
 *
 * 与 `$t` 的区别只在取词选项：原文含 `.` / `:` 时 `$t` 可能解析成键路径。
 * 未收录的文本原样返回（i18next 的行为），因此对界面自有文案调用它也是安全的。
 * @returns 翻译函数与「参数化文本」求值函数
 */
export function useGameText() {
    const { t } = useTranslation()

    /**
     * 翻译一条游戏原文。
     * @param text 简体中文原文
     * @returns 当前语言的译文；未收录或无值时返回空串
     */
    function gt(text: string | undefined | null): string {
        if (!text) {
            return ""
        }

        return t(text, GAME_TEXT_OPTIONS)
    }

    /**
     * 按档位求值 `熔炼` / `效果` 这类字段，并翻译其中的文案。
     *
     * 上游把「随等级/精炼变化的文案」导出成 `[模板, #1 取值, …]`（见 `ParamText`），
     * 翻译对照表只收录模板。此函数固定按「**先翻译模板、再代入数值**」求值——
     * 顺序反了会拿「角色攻击+60.0%。」这样的已代入文本去查表，永远查不到译文。
     * @param value 参数字段（也兼容纯字符串与多档位文本数组）
     * @param index 档位下标（武器为精炼等级，MOD 为 `等级 - 1`）
     * @param options 是否去掉首句（武器熔炼文案的首句是属性摘要，已在属性区展示）
     * @returns 当前语言下该档位的完整文本
     */
    function gpt(value: ParamText | null | undefined, index: number, options?: { stripFirstSentence?: boolean }): string {
        const text = formatParamText(value, index, gt)
        if (!options?.stripFirstSentence) {
            return text
        }
        const end = text.search(/[。！？]/)
        return end < 0 ? text : text.slice(end + 1).trim()
    }

    /**
     * 求值魔灵技能文案（`主动` / `被动` 的「模板 + 顺序占位符」形态）。
     *
     * 对照表收录的是含 `{%}` / `{}` 的模板原文，所以同样固定按
     * 「**先翻译模板、再代入数值**」求值，顺序反了永远查不到译文。
     * @param template 技能文案模板（`LeveledPet` 的 `主动模板` / `被动模板`）
     * @param values 该模板当前档位的数值（`LeveledPet` 的 `主动值` / `被动值`）
     * @returns 当前语言下代入数值后的文本
     */
    function petSkillText(template: string | undefined, values: number[]): string {
        if (!template) {
            return ""
        }

        return formatPetSkillText(gt(template), values)
    }

    return { gt, gpt, petSkillText }
}

/**
 * 在非组件上下文（纯函数、数据层）里翻译游戏原文。
 *
 * 优先用 `useGameText`；只有在拿不到组件实例时才用这个。
 * @param t i18next-vue 的翻译函数（来自 useTranslation）
 * @param text 简体中文原文
 * @returns 当前语言的译文
 */
export function translateGameText(t: (key: string, options?: Record<string, unknown>) => string, text: string | undefined | null): string {
    if (!text) {
        return ""
    }

    return t(text, GAME_TEXT_OPTIONS)
}
