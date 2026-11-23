import { crafts, type DnaSeasonCraft, getGearItemSocketCount, getSlotMaxInlayCount, type TranscendGearItemConfig } from "@/data"

/**
 * 升华装备打孔 / 孔位纯函数：已镶嵌 / 已开孔 / 上限三态、打孔 +1 与打孔消耗。
 * 打孔规则来自上游 craft 5（每次 +1 孔，无品质 / 强度门槛），上限只看槽型表。
 */

/** 添加镶孔对应的 craft id（上游 `DNASeasonEquipCraft` craft 5） */
export const TRANSCEND_PUNCH_CRAFT_ID = 5

/** 孔位三态：已镶嵌 / 已开孔 / 槽型上限 */
export interface GearSocketState {
    /** 已开孔数（含未镶嵌的孔） */
    opened: number
    /** 已镶嵌宝石数 */
    used: number
    /** 槽型孔位上限 */
    max: number
}

/** 一条打孔消耗（资源 id + 数量） */
export interface GearPunchCostRow {
    id: number
    count: number
}

/**
 * 孔位三态：`opened` 缺省按已镶嵌推断，并钳到 `max(已镶嵌数, 槽型上限)`；
 * 安全模式（上限表不可用，上限为 0）下也不超过已镶嵌数，避免极端字段造成巨量分配。
 * @param item 装备物品
 * @param slotType 槽型 id
 * @returns 孔位状态
 */
export function getGearSocketState(
    item: Pick<TranscendGearItemConfig, "sockets" | "socketCount"> | null | undefined,
    slotType: number
): GearSocketState {
    const max = getSlotMaxInlayCount(slotType)
    const used = Array.isArray(item?.sockets) ? item.sockets.length : 0
    const inferred = Math.max(getGearItemSocketCount(item), used)
    return { opened: Math.min(inferred, Math.max(used, max)), used, max }
}

/**
 * 改写已开孔数（钳制 0..上限）：减少时裁掉越界孔，宝石不静默丢失到上限之外。
 * @param item 装备物品
 * @param slotType 槽型 id
 * @param count 目标已开孔数
 * @returns 新物品
 */
export function setGearSocketCount(item: TranscendGearItemConfig, slotType: number, count: number): TranscendGearItemConfig {
    const max = getSlotMaxInlayCount(slotType)
    const opened = Math.max(0, Math.min(max, Math.round(Number(count) || 0)))
    const sockets = (Array.isArray(item.sockets) ? item.sockets : []).filter(socket => socket.socketIndex < opened)
    const next: TranscendGearItemConfig = { ...item }
    if (sockets.length) next.sockets = sockets.map(socket => ({ ...socket }))
    else delete next.sockets
    if (opened > 0) next.socketCount = opened
    else delete next.socketCount
    return next
}

/** 初始孔位卡片三态：未解锁 / 已解锁空槽 / 已镶嵌 */
export type GearSocketPhase = "locked" | "opened" | "inlaid"

/**
 * 初始孔位卡片是否可点击切换：已镶嵌孔位只读，点击不收起上方空槽也不拆宝石。
 * @param phase 孔位卡片三态
 * @returns 是否可切换
 */
export function canToggleGearSocket(phase: GearSocketPhase): boolean {
    return phase !== "inlaid"
}

/**
 * 初始已开孔数：新建（无存档值）统一 0；编辑按存档值钳到 `[min, max]`。
 * 历史存档超过当前部位上限时按上限钳制，已镶嵌所需孔数（`min`）优先抬高。
 * @param stored 存档已开孔数（新建为 null / undefined）
 * @param min 不可低于的孔数（已镶嵌所需）
 * @param max 槽型上限
 * @returns 初始已开孔数
 */
export function resolveInitialSocketCount(stored: number | null | undefined, min: number, max: number): number {
    if (stored === null || stored === undefined) return 0
    const upper = Math.max(0, Math.round(Number(max) || 0))
    const lower = Math.min(upper, Math.max(0, Math.round(Number(min) || 0)))
    return Math.min(upper, Math.max(lower, Math.round(Number(stored) || 0)))
}

/**
 * 点击初始孔位卡片切换已开孔数：未解锁孔位解锁到该槽，已解锁孔位收起该槽及其后的空槽。
 * 只返回新的已开孔数，不改 `sockets`；宝石安全由调用方的 `min` 钳制保证。
 * @param current 当前已开孔数
 * @param index 点击的孔位下标（0 起）
 * @param min 不可关闭的孔数（已镶嵌所需）
 * @param max 槽型上限
 * @returns 新的已开孔数
 */
export function toggleGearSocketCount(current: number, index: number, min: number, max: number): number {
    const upper = Math.max(0, Math.round(Number(max) || 0))
    const lower = Math.min(upper, Math.max(0, Math.round(Number(min) || 0)))
    const opened = Math.min(upper, Math.max(lower, Math.round(Number(current) || 0)))
    const slot = Math.max(0, Math.round(Number(index) || 0))
    const next = slot >= opened ? slot + 1 : slot
    return Math.max(lower, Math.min(upper, next))
}

/**
 * 打孔一次（+1 孔）：只改已开孔数，不添加宝石；达上限或该槽型无孔时原样返回。
 * @param item 装备物品
 * @param slotType 槽型 id
 * @returns 新物品或原物品
 */
export function addGearSocket(item: TranscendGearItemConfig, slotType: number): TranscendGearItemConfig {
    const state = getGearSocketState(item, slotType)
    if (state.max <= 0 || state.opened >= state.max) return item
    return setGearSocketCount(item, slotType, state.opened + 1)
}

/**
 * 打孔消耗：从数据表 craft 5 读取材料与货币，未命中时为空（不写死资源）。
 * @param craft 改造成本（缺省按 craft 5 查找）
 * @returns 消耗行
 */
export function getGearPunchCost(
    craft: DnaSeasonCraft | undefined = crafts.find(item => item.id === TRANSCEND_PUNCH_CRAFT_ID)
): GearPunchCostRow[] {
    if (!craft) return []
    const rows: GearPunchCostRow[] = Object.entries(craft.costItems ?? {}).map(([id, count]) => ({
        id: Number(id),
        count: Math.max(0, Math.round(Number(count) || 0)),
    }))
    if (craft.costPriceId !== undefined) {
        rows.push({ id: craft.costPriceId, count: Math.max(0, Math.round(craft.costPriceCount ?? 1)) })
    }
    return rows.filter(row => Number.isFinite(row.id) && row.id > 0)
}
