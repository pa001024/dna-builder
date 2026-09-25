/** 技能数值占位符：`{%}` 取百分比，`{}` 取原值，两者按出现顺序依次对应 `值` 的第 n 项 */
const SKILL_VALUE_PLACEHOLDER_RE = /\{%\}|\{\}/g

/**
 * 把魔灵技能数值代入文案模板。
 *
 * 模板是**简体中文原文**，同时也是翻译对照表的键，所以界面必须按
 * 「**先翻译模板、再代入数值**」的顺序求值：顺序反了会得到
 * 「…主角色攻击6000%的伤害…」这类已实例化文本，永远查不到译文。
 * @param template 含 `{%}` / `{}` 占位符的文案模板（已按当前语言翻译）
 * @param values 当前档位的数值，按占位符出现顺序对应
 * @returns 代入数值后的文本
 */
export function formatPetSkillText(template: string, values: number[]): string {
    let valueIndex = 0

    return template.replace(SKILL_VALUE_PLACEHOLDER_RE, placeholder => {
        if (valueIndex >= values.length) {
            return placeholder
        }

        const value = values[valueIndex]
        valueIndex++

        // 按占位符类型格式化当前顺序对应的数值，确保严格按出现顺序替换。
        if (placeholder === "{%}") {
            return `${+(value * 100).toFixed(2)}%`
        }

        return `${+value.toFixed(2)}`
    })
}
