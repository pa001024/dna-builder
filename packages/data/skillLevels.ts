import { CHAR_SKILL_LEVEL_DEFAULT, CHAR_SKILL_LEVEL_MAX, CHAR_SKILL_LEVEL_MIN, type CharSkillLevels } from "./charSettings"

/**
 * 技能等级属性键：属性值 = 技能等级加成 `+N`（可为负），最终等级 = `clamp(round(基础 + Σ三键), 1..30)`。
 * 等级驱动只认静态数值：BUFF 层的字符串表达式三键已在聚合时排除；MOD / 武器效果层的表达式三键
 * 目前会计入聚合（TS 与 Rust 同口径，现有数据无此类条目）。
 */
export const SKILL_LEVEL_ATTR_KEYS = ["E技能等级", "Q技能等级", "P技能等级"] as const

/** 技能等级规范名（官方 TextMap 键）：展示层据此取官方六语言译名，不再手写「战技 / 终结技 / 被动」 */
export const SKILL_TYPE_LEVEL_NAMES: Record<string, string> = {
    Skill1: "战技技能等级",
    Skill2: "终结技技能等级",
    Passive: "被动技能等级",
}

/**
 * 取技能类型的等级规范名（官方 TextMap 键，调用方再过 `gameText` 翻译）。
 * @param skillType 上游技能类型（Skill1 / Skill2 / Passive）
 * @returns 官方规范名；未知类型回退空串
 */
export function getSkillLevelName(skillType: string): string {
    return SKILL_TYPE_LEVEL_NAMES[skillType] ?? ""
}

/**
 * 技能等级加成三元组归一化：缺失 / 非数字记 0，不钳制（加成可为负，最终等级统一钳制）。
 * @param bonus 原始加成（数字或三元组，可缺失）
 * @returns 归一化后的加成三元组
 */
export function normalizeSkillLevelBonus(bonus?: number | readonly number[] | null): CharSkillLevels {
    const read = (index: number) => {
        const value = typeof bonus === "number" ? bonus : Array.isArray(bonus) ? bonus[index] : undefined
        return typeof value === "number" && Number.isFinite(value) ? value : 0
    }
    return [read(0), read(1), read(2)]
}

/**
 * 解析有效技能等级：基础三元组 + 全部加成来源先加总，再一次性四舍五入并钳制 1-30。
 * 单一真源：技能装配、页面注入与协战构造都只经这里，避免各自 round / clamp 产生漂移。
 * @param base 基础技能等级 `[E, Q, 被动]`
 * @param bonusSources 各来源的技能等级加成（可为空 / 缺失项按 0）
 * @returns 最终有效技能等级
 */
export function resolveEffectiveSkillLevels(
    base: CharSkillLevels,
    ...bonusSources: (CharSkillLevels | readonly number[] | null | undefined)[]
): CharSkillLevels {
    return base.map((rawValue, index) => {
        let total = Number.isFinite(rawValue) ? rawValue : CHAR_SKILL_LEVEL_DEFAULT
        for (const source of bonusSources) {
            const value = source?.[index]
            if (typeof value === "number" && Number.isFinite(value)) total += value
        }
        return Math.max(CHAR_SKILL_LEVEL_MIN, Math.min(CHAR_SKILL_LEVEL_MAX, Math.round(total)))
    }) as CharSkillLevels
}

/**
 * 技能等级加成展示：带符号整数（`+8` / `-3`），三个属性面板共用。
 * @param value 技能等级加成
 * @returns 展示字符串
 */
export function formatSkillLevelBonus(value: number): string {
    return `${value >= 0 ? "+" : ""}${+value.toFixed(0)}`
}

/**
 * 属性面板是否展示该数值：0 与非有限值不展示（技能等级加成 0 时隐藏）。
 * 与各面板的通用过滤同口径，避免只对三键特殊化。
 * @param value 属性值
 * @returns 是否展示
 */
export function isAttrValueVisible(value: unknown): boolean {
    return typeof value === "number" && Number.isFinite(value) && value !== 0
}
