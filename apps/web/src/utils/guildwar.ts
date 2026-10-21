import { type GuildWarRefresh, guildWarRefresh } from "@/data/d/guildwar.data"

/** 协会战赛季周数（对齐 GuildBossUtils.GetSeasonWeekCount 固定 6，即 3 Boss × 6 周、每 Boss 一季打 2 周） */
export const GUILD_WAR_SEASON_WEEKS = 6

/** 一周秒数（对齐 GuildBossUtils.ONE_WEEK_SECONDS） */
export const GUILD_WAR_WEEK_SECONDS = 604800

/** 周阶段 constructionPoint 对应的资源 ID（协会资金） */
export const GUILD_CONSTRUCTION_POINT_RESOURCE_ID = 4005

/** 协会战槽位开放状态（对齐 GetBossSlotState；Unopened 为前端补充：有 GuildBossInfo 但不在轮换内，如 8509701 白龙占位） */
export type GuildWarSlotState = "Active" | "NotStarted" | "Ended" | "Unopened"

/** 单周期长度（秒）：6 周 */
const PERIOD_SECONDS = GUILD_WAR_SEASON_WEEKS * GUILD_WAR_WEEK_SECONDS

function sortedPeriods(): GuildWarRefresh[] {
    return [...guildWarRefresh].sort((a, b) => a.startTime - b.startTime)
}

/**
 * 本轮循环中的周期定位（含该周期实际开始时间）。
 * 轮换无限循环：全部周期跑完后回到首期（总周期 = 周期数 × 6 周）。
 * @param now 当前时间戳（秒）
 * @returns 周期与实际开始时间
 */
function locatePeriod(now: number): { period: GuildWarRefresh; effectiveStart: number } | undefined {
    const periods = sortedPeriods()
    if (!periods.length) {
        return undefined
    }
    if (now < periods[0].startTime) {
        return { period: periods[0], effectiveStart: periods[0].startTime }
    }
    const cycleLength = periods.length * PERIOD_SECONDS
    const elapsed = now - periods[0].startTime
    const index = Math.floor((elapsed % cycleLength) / PERIOD_SECONDS)
    const period = periods[index] ?? periods[0]
    const effectiveStart = periods[0].startTime + (elapsed - (elapsed % cycleLength)) + index * PERIOD_SECONDS
    return { period, effectiveStart }
}

/**
 * 当前周期（无限循环定位；now 早于全部则取第一份待开启）。
 * @param now 当前时间戳（秒）
 * @returns 当前周期；无数据时返回 undefined
 */
export function getGuildWarCurrentPeriod(now: number): GuildWarRefresh | undefined {
    return locatePeriod(now)?.period
}

/**
 * 轮换总周数（一轮 = 全部周期各 6 周）。
 * @returns 总周数
 */
export function getGuildWarCycleWeeks(): number {
    return Math.max(1, guildWarRefresh.length) * GUILD_WAR_SEASON_WEEKS
}

/**
 * 本轮循环中的周序号（1-based，跨整轮连续计数）。
 * @param now 当前时间戳（秒）
 * @returns 周序号；无数据时返回 0
 */
export function getGuildWarCycleWeekIndex(now: number): number {
    const periods = sortedPeriods()
    if (!periods.length) {
        return 0
    }
    const total = periods.length * GUILD_WAR_SEASON_WEEKS
    const elapsed = now - periods[0].startTime
    if (elapsed < 0) {
        return 1
    }
    return (Math.floor(elapsed / GUILD_WAR_WEEK_SECONDS) % total) + 1
}

/**
 * 某周期在本轮循环中的实际开始时间。
 * @param period 轮换周期
 * @param now 当前时间戳（秒）
 * @returns 实际开始时间戳（秒）
 */
function getEffectiveStart(period: GuildWarRefresh, now: number): number {
    const located = locatePeriod(now)
    if (located && located.period === period) {
        return located.effectiveStart
    }
    const periods = sortedPeriods()
    const first = periods[0]
    const index = periods.indexOf(period)
    if (!first || index < 0 || now < first.startTime) {
        return period.startTime
    }
    const cycleLength = periods.length * PERIOD_SECONDS
    const elapsed = now - first.startTime
    return first.startTime + (elapsed - (elapsed % cycleLength)) + index * PERIOD_SECONDS
}

/**
 * 周期内周序号（1-based，对齐 GetCurrentSeasonWeekIndex）。
 * @param period 轮换周期
 * @param now 当前时间戳（秒）
 * @returns 周序号
 */
export function getGuildWarWeekIndex(period: GuildWarRefresh, now: number): number {
    return Math.floor(Math.max(0, now - getEffectiveStart(period, now)) / GUILD_WAR_WEEK_SECONDS) + 1
}

/**
 * 当前开放槽位（1-based，对齐 GetActiveBossSlotIndex=(WeekIndex-1)%BossCount+1，同时只开一个）。
 * @param weekIndex 周期内周序号
 * @param bossCount 周期内 Boss 数
 * @returns 槽位序号
 */
export function getGuildWarActiveSlotIndex(weekIndex: number, bossCount: number): number {
    if (bossCount <= 0) {
        return 1
    }
    return ((weekIndex - 1) % bossCount) + 1
}

/**
 * 槽位开放状态（对齐 GetBossSlotState：超季 / 本季不再返场为 Ended，未到所在周为 NotStarted）。
 * @param period 轮换周期
 * @param slotIndex 槽位序号（1-based）
 * @param now 当前时间戳（秒）
 * @returns 槽位状态
 */
export function getGuildWarSlotState(period: GuildWarRefresh | undefined, slotIndex: number, now: number): GuildWarSlotState {
    const bossIds = period?.bossIds ?? []
    if (!period || slotIndex < 1 || slotIndex > bossIds.length) {
        return "Ended"
    }
    const weekIndex = getGuildWarWeekIndex(period, now)
    if (weekIndex > GUILD_WAR_SEASON_WEEKS) {
        return "Ended"
    }
    const activeSlot = getGuildWarActiveSlotIndex(weekIndex, bossIds.length)
    let until = slotIndex === activeSlot ? 0 : slotIndex - activeSlot
    if (slotIndex !== activeSlot && until <= 0) {
        until += bossIds.length
    }
    if (weekIndex + until > GUILD_WAR_SEASON_WEEKS) {
        return "Ended"
    }
    const nextStart = getEffectiveStart(period, now) + (weekIndex + until - 1) * GUILD_WAR_WEEK_SECONDS
    return now >= nextStart ? "Active" : "NotStarted"
}

/**
 * Boss 开放状态：不在当前周期轮换内一律占位未开。
 * @param bossId Boss ID
 * @param now 当前时间戳（秒）
 * @returns 开放状态
 */
export function getGuildWarBossState(bossId: number, now: number): GuildWarSlotState {
    const period = getGuildWarCurrentPeriod(now)
    if (!period) {
        return "Unopened"
    }
    const slot = period.bossIds.indexOf(bossId) + 1
    if (slot < 1) {
        return "Unopened"
    }
    return getGuildWarSlotState(period, slot, now)
}

/**
 * 当前可进本 Boss（Active 槽位对应的 Boss，无则返回 0）。
 * @param now 当前时间戳（秒）
 * @returns Boss ID
 */
export function getGuildWarActiveBossId(now: number): number {
    const period = getGuildWarCurrentPeriod(now)
    if (!period?.bossIds.length) {
        return 0
    }
    const weekIndex = getGuildWarWeekIndex(period, now)
    if (weekIndex > GUILD_WAR_SEASON_WEEKS) {
        return 0
    }
    return period.bossIds[getGuildWarActiveSlotIndex(weekIndex, period.bossIds.length) - 1] ?? 0
}
