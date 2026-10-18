/**
 * 魔灵展示名映射。
 *
 * 展示名一律用简体中文原文表示，它同时是翻译对照表的键，调用方负责过 `$t` / `gt`。
 */

/** 魔灵类型值 → 展示名（对应 `pet.data.ts` 的 `类型`；999 是列表页的「魔灵潜质」伪类型） */
const PET_TYPE_NAMES: Record<number, string> = {
    1: "活力魔灵",
    2: "失活魔灵",
    3: "活动魔灵",
    999: "魔灵潜质",
}

/**
 * 取魔灵类型的展示名。
 * @param type 类型值
 * @returns 展示名（简体中文原文）
 */
export function getPetTypeName(type: number): string {
    return PET_TYPE_NAMES[type] || type.toString()
}

/** 魔灵品质值 → 展示名 */
const PET_QUALITY_NAMES: Record<number, string> = {
    1: "白",
    2: "绿",
    3: "蓝",
    4: "紫",
    5: "金",
}

/**
 * 取魔灵品质的展示名。
 * @param quality 品质值
 * @returns 展示名（简体中文原文）
 */
export function getPetQualityName(quality: number): string {
    return PET_QUALITY_NAMES[quality] || quality.toString()
}
