import {
    getTranscendGearGroupKeyOfSlot,
    getTranscendSideGearGroup,
    isEquippedGear,
    isLegacyGearEntry,
    syncActiveGearVariant,
    type TranscendEquippedGear,
    type TranscendGearEntry,
    type TranscendGearGroup,
    type TranscendGearItemConfig,
    type TranscendSettings,
    type TranscendSlotGroup,
} from "@/data"

/**
 * 升华装备组读写：物品级槽位操作（装备 / 卸下 / 孔位更新）。
 * 装备组可能同时含 v1 平铺条目（安全模式 / 缺包时的暂存形态），写入时原样保留其它槽位。
 */

/**
 * 取构筑位对应的装备组：三组一人一套（主控 1-8 / 协战一 9-12 / 协战二 13-16）。
 * @param settings 升华配置
 * @param side 构筑位
 * @returns 装备组（直接引用）
 */
export function getSideGearGroup(settings: TranscendSettings, side: TranscendSlotGroup): TranscendGearGroup {
    return getTranscendSideGearGroup(settings, side)
}

/**
 * 写回构筑位的装备组（直接替换引用并同步当前激活变体，调用方负责标记编辑）。
 * @param settings 升华配置
 * @param side 构筑位
 * @param group 新装备组
 */
export function setSideGearGroup(settings: TranscendSettings, side: TranscendSlotGroup, group: TranscendGearGroup): void {
    if (side === "main") settings.mainGear = group
    else if (side === "assist1") settings.assist1Gear = group
    else settings.assist2Gear = group
    syncActiveGearVariant(settings)
}

/**
 * 取当前激活变体的全部已装备物品（只读顶层三组装备）。
 * 库存「已装备」标记、分享摘要等只读场景共用这一口径；其它变体不参与。
 * @param settings 升华配置
 * @returns 已装备物品列表
 */
export function getEquippedGearItems(settings: TranscendSettings): TranscendGearItemConfig[] {
    const items: TranscendGearItemConfig[] = []
    for (const group of [settings.mainGear, settings.assist1Gear, settings.assist2Gear]) {
        for (const entry of Array.isArray(group) ? group : []) {
            if (isEquippedGear(entry)) items.push(entry.item)
        }
    }
    return items
}

/**
 * 取某装备位的完整物品。
 * @param group 装备组
 * @param slotId 装备位
 * @returns 装备槽；该槽没有 v2 物品时为 null
 */
export function getEquippedItem(group: readonly unknown[] | null | undefined, slotId: number): TranscendEquippedGear | null {
    for (const raw of Array.isArray(group) ? group : []) {
        if (isEquippedGear(raw) && Math.round(raw.slotId) === Math.round(slotId)) return raw
    }
    return null
}

/**
 * 取某装备位的 v1 平铺条目（仅在数据表不可用、尚未迁移时存在）。
 * @param group 装备组
 * @param slotId 装备位
 * @returns 平铺条目
 */
export function getLegacySlotEntries(group: readonly unknown[] | null | undefined, slotId: number): TranscendGearEntry[] {
    const result: TranscendGearEntry[] = []
    for (const raw of Array.isArray(group) ? group : []) {
        if (isLegacyGearEntry(raw) && Math.round(raw.slotId) === Math.round(slotId)) result.push(raw)
    }
    return result
}

/**
 * 替换某装备位的物品：移除该槽全部旧物品 / 旧词条后写入新物品；其它槽位（含 v1 条目）原样保留。
 * @param group 装备组
 * @param slotId 装备位
 * @param item 新物品；null 表示卸下
 * @returns 新的装备组（按装备位排序）
 */
export function setSlotItem(
    group: readonly unknown[] | null | undefined,
    slotId: number,
    item: TranscendGearItemConfig | null
): TranscendGearGroup {
    const id = Math.round(Number(slotId))
    if (!Number.isFinite(id) || !getTranscendGearGroupKeyOfSlot(id)) return Array.isArray(group) ? [...group] : []
    const next: TranscendGearGroup = []
    for (const raw of Array.isArray(group) ? group : []) {
        const entrySlot = Math.round(Number((raw as { slotId?: number } | null)?.slotId))
        if (entrySlot === id) continue
        next.push(raw as TranscendGearGroup[number])
    }
    if (item) next.push({ slotId: id, item })
    return next.sort((left, right) => Math.round(Number(left.slotId)) - Math.round(Number(right.slotId)))
}

/**
 * 更新已装备物品（保留槽位）：用于孔位镶嵌 / 拆除等物品级改写。
 * @param group 装备组
 * @param slotId 装备位
 * @param item 新物品
 * @returns 新的装备组
 */
export function updateSlotItem(
    group: readonly unknown[] | null | undefined,
    slotId: number,
    item: TranscendGearItemConfig
): TranscendGearGroup {
    return setSlotItem(group, slotId, item)
}
