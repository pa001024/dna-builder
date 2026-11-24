import { CHAR_SKILL_LEVEL_BASE_MAX, CHAR_SKILL_LEVEL_MAX, CHAR_SKILL_LEVEL_MIN } from "@/data/charSettings"

/** 构筑设置可调的基础技能等级上限（游戏内升级 1–10）；详情页数据预览仍按有效等级 1–30 */
export const SKILL_LEVEL_UI_MAX = CHAR_SKILL_LEVEL_BASE_MAX

/**
 * 技能等级滑杆的读写钳制：先按 `[CHAR_SKILL_LEVEL_MIN, max]` 归一化上限，再取整钳制；
 * 非有限值回落到上限。详情页默认上限为有效等级 30，构筑页宿主传 `SKILL_LEVEL_UI_MAX`。
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
