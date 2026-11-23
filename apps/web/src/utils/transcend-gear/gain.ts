import { canonicalGearString, type TranscendBuildSettings, type TranscendGearItemConfig, type TranscendSlotGroup } from "@/data"

/**
 * 升华装备相对收益：统一 `(dps_with - dps_without) / dps_without` 口径。
 * 对比双方必须来自同一构筑、同一目标与同一数据包；任何一侧缺失 / 非有限值 / 基准为 0 时返回 `null`，
 * 界面显示占位而不是 0%。输出为比例（0.032 = +3.2%），展示统一走 {@link formatRelativeGain}。
 */

/** 收益占位文本（无法计算时使用，区别于真实的 0.0%） */
export const GAIN_PLACEHOLDER = "—"

/**
 * 计算相对收益比例。
 * @param withDamage 装备后的 DPS
 * @param withoutDamage 基准 DPS（同一构筑去掉该装备 / 换装前）
 * @returns 相对比例；不可计算时为 null
 */
export function relativeGain(withDamage: number | null | undefined, withoutDamage: number | null | undefined): number | null {
    if (typeof withDamage !== "number" || typeof withoutDamage !== "number") return null
    if (!Number.isFinite(withDamage) || !Number.isFinite(withoutDamage)) return null
    if (withoutDamage === 0) return null
    const gain = (withDamage - withoutDamage) / withoutDamage
    return Number.isFinite(gain) ? gain : null
}

/**
 * 带符号百分比文本：`+3.2%` / `-1.5%` / `0.0%`；不可计算时返回 `—`。
 * 四舍五入后为 0.000 时不加符号，避免出现 `+0.0%`。
 * @param gain 相对比例
 * @returns 展示文本
 */
export function formatRelativeGain(gain: number | null | undefined): string {
    if (typeof gain !== "number" || !Number.isFinite(gain)) return GAIN_PLACEHOLDER
    const percent = gain * 100
    const rounded = Math.abs(percent) < 0.05 ? 0 : percent
    const magnitude = Math.abs(rounded).toFixed(1)
    if (rounded > 0) return `+${magnitude}%`
    if (rounded < 0) return `-${magnitude}%`
    return `${magnitude}%`
}

/**
 * 取「该槽位为空」的同构筑设置（不改入参、不写激活变体）。
 * 与 `withItem` 互为逆操作：只移除对应装备组的该槽条目，其余设置原样保留。
 * @param settings 当前构筑设置
 * @param side 构筑位
 * @param slotId 装备位
 * @returns 去掉该槽物品后的新设置
 */
export function withoutItem(settings: TranscendBuildSettings, side: TranscendSlotGroup, slotId: number): TranscendBuildSettings {
    const key = side === "main" ? "mainGear" : side === "assist1" ? "assist1Gear" : "assist2Gear"
    const source = settings.transcend[key] as { slotId?: number }[] | undefined
    const group = (Array.isArray(source) ? source : []).filter(entry => Math.round(Number(entry.slotId)) !== slotId)
    return {
        ...settings,
        transcend: {
            ...settings.transcend,
            [key]: group,
        },
    }
}

/**
 * 物品收益缓存键：规范化词条 / 孔位 / craft 摘要 + 影响伤害的元数据。
 * `canonicalGearString` 不含品质 / 强度 / 已开孔数，单独拼接避免换强度后复用旧收益。
 * @param item 装备物品
 * @returns 稳定键
 */
export function gearItemKey(item: TranscendGearItemConfig): string {
    return [canonicalGearString(item), item.rarityId ?? "", item.equipBaseScore ?? "", item.socketCount ?? "", item.seasonId ?? ""].join(
        "|"
    )
}

/** 相对收益缓存：容量受限的插入序 LRU（Map 本身保持插入顺序） */
export interface RelativeGainCache {
    /** 命中返回比例或 null；未命中返回 undefined */
    get(key: string): number | null | undefined
    set(key: string, gain: number | null): void
    clear(): void
    readonly size: number
}

/**
 * 创建容量受限的收益缓存：列表滚动 / 反复筛选命中已有结果，不重复整体求值。
 * 只缓存成功值（失败项下次刷新重试），避免数据包恢复后残留 null。
 * @param limit 最大条目数
 * @returns 缓存实例
 */
export function createRelativeGainCache(limit = 512): RelativeGainCache {
    const entries = new Map<string, number | null>()
    return {
        get(key) {
            return entries.get(key)
        },
        set(key, gain) {
            if (entries.has(key)) entries.delete(key)
            entries.set(key, gain)
            if (entries.size > limit) {
                const oldest = entries.keys().next().value
                if (oldest !== undefined) entries.delete(oldest)
            }
        },
        clear() {
            entries.clear()
        },
        get size() {
            return entries.size
        },
    }
}
