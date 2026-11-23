import { CHAR_SKILL_LEVEL_MAX, CHAR_SKILL_LEVEL_MIN } from "@/data/charSettings"

/** 界面可调技能等级上限：数据层上限仍为 1..30，已存 >10 的值照常显示与计算 */
export const SKILL_LEVEL_UI_MAX = 10

/**
 * 技能等级滑杆的读写钳制：先按 `[CHAR_SKILL_LEVEL_MIN, max]` 归一化上限，再取整钳制；
 * 非有限值回落到上限。详情页默认上限 30，构筑页宿主传 `SKILL_LEVEL_UI_MAX`。
 * @param value 滑杆值 / 宿主传入等级
 * @param max 界面可调上限（缺省为数据层上限）
 * @returns 钳制后的整数等级
 */
export function clampCharSkillLevelView(value: number, max: number = CHAR_SKILL_LEVEL_MAX): number {
    const upper = Number.isFinite(max)
        ? Math.max(CHAR_SKILL_LEVEL_MIN, Math.min(CHAR_SKILL_LEVEL_MAX, Math.round(max)))
        : CHAR_SKILL_LEVEL_MAX
    if (!Number.isFinite(value)) return upper
    return Math.max(CHAR_SKILL_LEVEL_MIN, Math.min(upper, Math.round(value)))
}
