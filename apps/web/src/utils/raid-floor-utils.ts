import { EventId2RaidSeason, RaidFloor, type RaidFloorItem, RaidSeason, RaidSeasonFloorMax, type RaidSeasonItem } from "@/data/d/raid.data"
import { getCurrentVersionLimit } from "@/data/versionGate"

/**
 * 爬塔制（RaidSeasonType 2）赛季的资料库逻辑层。
 *
 * 与游戏 Lua 的对应关系（E:/dev/DuetNightAbyssData2/Script）：
 * - GuildWarUtils.IsFloorMode → isFloorSeason
 * - LevelSelect:GetCurrentRaidDungeonList_Floor → getRaidFloorList
 * - GuildWarView:GetHighestFloor → getHighestFloor
 * - RaidSeason:Init（初始开放层数）→ getInitialUnlockFloor
 * - GuildWarView:IsUnlockedFloor/IsPassedFloor → isUnlockedFloor/isPassedFloor
 * - GuildWarView:IsKeyFloor → isKeyFloor
 * - GuildWarView:GetBubbleDisplayMaxFloor + FloorItem_C:71 → getBubbleDisplayMaxFloor/shouldShowBubble
 * - CommonUtils.RaidSeasonGetUnlockFloorCount → getUnlockFloorCount
 * - GuildWarUtils.FormatRankTime → formatRankTime
 * - GuildWarUtils.GetRaidFloorId → getFloorIdByNumber
 * - GuildWarUtils.GetRankingText → getRankingColumnKind
 *
 * 资料库没有实时存档与赛季时期（预热/正式）概念：凡 lua 里按时期二选一的字段，
 * 一律由调用方传入 isPreRaid 显式指定时期，页面提供预热/正式切换。
 */

/** 打分制赛季类型（RaidDungeon + 分数，老模式）。 */
export const RAID_SEASON_TYPE_SCORE = 1

/** 爬塔制赛季类型（RaidFloor + 层数/通关时间，新模式）。 */
export const RAID_SEASON_TYPE_FLOOR = 2

/**
 * 判断赛季是否为爬塔制。
 * @param season 赛季配置或赛季ID
 * @returns 爬塔制返回 true
 */
export function isFloorSeason(season: RaidSeasonItem | number | string): boolean {
    const item = typeof season === "object" ? season : RaidSeason[season]
    return item?.RaidSeasonType === RAID_SEASON_TYPE_FLOOR
}

/**
 * 取赛季配置。
 * @param seasonId 赛季ID
 * @returns 赛季配置，不存在时 undefined
 */
export function getRaidSeason(seasonId: number | string): RaidSeasonItem | undefined {
    return RaidSeason[seasonId]
}

/**
 * 当前赛季的楼层列表（只含已解锁层，按 FloorId 升序）。
 * @param seasonId 赛季ID
 * @param floorType 楼层类型：1 分组赛，2 巅峰排名
 * @param highestUnlocked 当前最高可打层（存档推进值；资料库演示用初始开放层数）
 * @returns 已解锁的楼层条目
 */
export function getRaidFloorList(seasonId: number | string, floorType: number, highestUnlocked: number): RaidFloorItem[] {
    return Object.values(RaidFloor)
        .filter(item => item.RaidSeason === Number(seasonId) && item.FloorType === floorType && item.Floor <= highestUnlocked)
        .sort((a, b) => a.FloorId - b.FloorId)
}

/**
 * 当前赛季某时期的全部楼层（不论解锁状态，按 FloorId 升序，资料库用于完整展示）。
 * @param seasonId 赛季ID
 * @param floorType 楼层类型：1 分组赛，2 巅峰排名
 * @returns 全部楼层条目
 */
export function getRaidFloorFullList(seasonId: number | string, floorType: number): RaidFloorItem[] {
    return Object.values(RaidFloor)
        .filter(item => item.RaidSeason === Number(seasonId) && item.FloorType === floorType)
        .sort((a, b) => a.FloorId - b.FloorId)
}

/**
 * 赛季某时期的最大层数。
 * @param seasonId 赛季ID
 * @param floorType 楼层类型：1 分组赛，2 巅峰排名
 * @returns 最大层数，未知时 0
 */
export function getHighestFloor(seasonId: number | string, floorType: number): number {
    const maxEntry = RaidSeasonFloorMax[Number(seasonId)]
    // 上游 Lua 的 {[1], [2]} 下标经加载器转为 JS 数组，楼层类型 1/2 对应下标 0/1
    const fromMax = Array.isArray(maxEntry) ? maxEntry[floorType - 1] : (maxEntry as Record<number, number> | undefined)?.[floorType]
    if (fromMax) return fromMax
    let highest = 0
    for (const item of Object.values(RaidFloor)) {
        if (item.RaidSeason === Number(seasonId) && item.FloorType === floorType && item.Floor > highest) {
            highest = item.Floor
        }
    }
    return highest
}

/**
 * 开赛初始开放层数（存档 ReadUnlockFloor 的初值）。
 * @param season 赛季配置
 * @param isPreRaid 是否为分组赛时期
 * @returns 初始开放层数，老赛季缺省为 1
 */
export function getInitialUnlockFloor(season: RaidSeasonItem | undefined, isPreRaid: boolean): number {
    if (!season) return 0
    return isPreRaid ? (season.PreRaidFloorUnlock ?? 1) : (season.RaidFloorUnlock ?? 1)
}

/**
 * 判断楼层是否已解锁。
 * @param floor 层数
 * @param highestUnlocked 当前最高可打层
 * @returns 已解锁返回 true
 */
export function isUnlockedFloor(floor: number, highestUnlocked: number): boolean {
    return floor <= highestUnlocked
}

/**
 * 判断楼层是否已通过。
 * @param floor 层数
 * @param passedFloor 已通过的最高层（无存档时传 0）
 * @returns 已通过返回 true
 */
export function isPassedFloor(floor: number, passedFloor: number): boolean {
    return floor <= passedFloor
}

/**
 * 判断是否为关键层（特殊样式/气泡层）。
 * @param season 赛季配置
 * @param floor 层数
 * @param isPreRaid 是否为分组赛时期（分组赛时期用 PreKeyFloor，巅峰排名时期用 KeyFloor）
 * @returns 关键层返回 true
 */
export function isKeyFloor(season: RaidSeasonItem | undefined, floor: number, isPreRaid: boolean): boolean {
    const keyFloors = isPreRaid ? season?.PreKeyFloor : season?.KeyFloor
    if (!keyFloors) return false
    return keyFloors.includes(floor)
}

/**
 * 气泡引导上限层数。
 * @param season 赛季配置
 * @returns 上限层数，未配置时 0（不显示气泡）
 */
export function getBubbleDisplayMaxFloor(season: RaidSeasonItem | undefined): number {
    return season?.BubbleDisplayMaxFloor ?? 0
}

/**
 * 楼层是否显示气泡引导：只有“当前最高可打层”且不超过上限时才显示。
 * @param season 赛季配置
 * @param floor 层数
 * @param highestUnlocked 当前最高可打层
 * @returns 显示气泡返回 true
 */
export function shouldShowBubble(season: RaidSeasonItem | undefined, floor: number, highestUnlocked: number): boolean {
    if (!season) return false
    return highestUnlocked === floor && floor <= getBubbleDisplayMaxFloor(season) && getBubbleDisplayMaxFloor(season) > 0
}

export interface JumpTier {
    /** 剩余时间门槛（秒）。 */
    jumpTime: number
    /** 达标时单次跳过层数。 */
    jumpFloor: number
    /** 当前剩余时间是否达标。 */
    reached: boolean
}

/**
 * 按剩余时间计算单次可跳层数：剩余越多跳得越多，保底取 JumpFloor 末位。
 * @param season 赛季配置
 * @param timeLimit 副本限时（秒，取自 Dungeon.BPOverrideVars.TimeLimit）
 * @param passTime 通关用时（秒）
 * @returns 单次解锁层数，无配置时 0
 */
export function getUnlockFloorCount(season: RaidSeasonItem | undefined, timeLimit: number, passTime: number): number {
    const tiers = getJumpTiers(season, timeLimit, passTime)
    let count = 0
    for (const tier of tiers) {
        if (tier.reached) count = Math.max(count, tier.jumpFloor)
    }
    return count
}

/**
 * 跳层规则配对明细（JumpTime/JumpFloor 按下标配对），供页面展示与模拟。
 * @param season 赛季配置
 * @param timeLimit 副本限时（秒）
 * @param passTime 通关用时（秒）
 * @returns 配对明细（无配置时空数组）
 */
export function getJumpTiers(season: RaidSeasonItem | undefined, timeLimit: number, passTime: number): JumpTier[] {
    const jumpTime = season?.JumpTime
    const jumpFloor = season?.JumpFloor
    if (!jumpTime || !jumpFloor || jumpTime.length !== jumpFloor.length) return []
    const timeRemain = timeLimit - passTime
    return jumpTime.map((threshold, index) => ({
        jumpTime: threshold,
        jumpFloor: jumpFloor[index],
        reached: threshold <= timeRemain,
    }))
}

/**
 * 剩余时间（限时减去通关用时），负数按 0 计。
 * @param timeLimit 副本限时（秒）
 * @param passTime 通关用时（秒）
 * @returns 剩余时间（秒）
 */
export function getFloorTimeRemain(timeLimit: number, passTime: number): number {
    return Math.max(0, timeLimit - passTime)
}

/**
 * 排行用时格式化（分:秒.百分秒，如 01:23.45）。
 * @param timeSec 秒数
 * @returns 格式化文本，无效输入返回 "--"
 */
export function formatRankTime(timeSec: number | string | undefined | null): string {
    const value = Number(timeSec)
    if (!Number.isFinite(value) || value < 0) return "--"
    const totalCenti = Math.floor(value * 100 + 0.5)
    const centi = totalCenti % 100
    const totalSec = Math.floor(totalCenti / 100)
    const sec = totalSec % 60
    const min = Math.floor(totalSec / 60)
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(centi).padStart(2, "0")}`
}

/**
 * 按层数反查楼层ID。
 * @param seasonId 赛季ID
 * @param floor 层数
 * @param floorType 楼层类型：1 分组赛，2 巅峰排名
 * @returns 楼层ID，找不到时 undefined
 */
export function getFloorIdByNumber(seasonId: number | string, floor: number, floorType: number): number | undefined {
    for (const [floorId, item] of Object.entries(RaidFloor)) {
        if (item.RaidSeason === Number(seasonId) && item.FloorType === floorType && item.Floor === floor) {
            return Number(floorId)
        }
    }
    return undefined
}

/**
 * 排行榜列口径：爬塔制显示层数+用时，打分制显示分数。
 * @param season 赛季配置或赛季ID
 * @returns 列口径
 */
export function getRankingColumnKind(season: RaidSeasonItem | number | string): "floor" | "score" {
    return isFloorSeason(season) ? "floor" : "score"
}

/**
 * 赛季号换算版本号：1007 → 1.7（赛季号编码了版本，与界面赛季方章同一口径）。
 * @param seasonId 赛季ID
 * @returns 版本号，非法赛季号返回 NaN
 */
export function getRaidSeasonVersion(seasonId: number | string): number {
    const id = Number(seasonId)
    if (!Number.isFinite(id)) return Number.NaN
    return Math.floor(id / 1000) + (id % 1000) / 10
}

/**
 * 赛季时间线（秒级时间戳，北京时间 UTC+8 展示）。
 * 与游戏 GuildWarUtils.lua 的对应关系：
 * - IsPreRaidTime = [eventStart, eventStart+PreRaidTime*3600) → 分组赛
 * - IsOfficalRaidTime = [eventStart+PreRaidTime*3600, +RaidTime*3600) → 巅峰赛
 * - IsRaidEnded = 可玩结束之后；IsEventTime = 到 eventEnd 为止（结算/领奖展示期）。
 */
export interface RaidSeasonPeriod {
    /** 活动开始 EventStartTime */
    eventStart: number
    /** 分组赛结束 = 巅峰赛开始（Start + PreRaidTime*3600） */
    peakStart: number
    /** 巅峰赛结束（不可再进本，Start + PreRaidTime*3600 + RaidTime*3600） */
    raidEnd: number
    /** 活动结束 EventEndTime（赛季结束后的结算/领奖展示期终点） */
    eventEnd: number
}

/**
 * 取赛季时间线：活动开始 / 分组赛结束·巅峰赛开始 / 巅峰赛结束 / 活动结束。
 * 事件起止取 EventId2RaidSeason（与 EventMain.lua 一致），阶段时长取 RaidSeason.PreRaidTime/RaidTime（小时）。
 * @param seasonId 赛季ID
 * @returns 时间线，赛季或事件时间缺失时 undefined
 */
export function getRaidSeasonPeriod(seasonId: number | string): RaidSeasonPeriod | undefined {
    const season = RaidSeason[seasonId]
    if (!season) return undefined
    const event = EventId2RaidSeason[season.EventId]
    if (!event) return undefined
    const eventStart = event.EventStartTime
    const peakStart = eventStart + season.PreRaidTime * 3600
    const raidEnd = peakStart + season.RaidTime * 3600
    return { eventStart, peakStart, raidEnd, eventEnd: event.EventEndTime }
}

/** 北京时区时间戳格式化（秒级时间戳 → YYYY-MM-DD HH:mm:ss，UTC+8）。
 * @param timestamp 秒级时间戳
 * @returns 北京时间文本
 */
export function formatRaidDateTime(timestamp: number): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(new Date(timestamp * 1000))
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? ""
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`
}

/**
 * 当前安全模式下允许展示的最大赛季：版本不超过版本门限的最新赛季。
 * 关闭安全模式（门限 Infinity）时即最新赛季；无赛季满足时回退到最早赛季。
 * @returns 默认赛季ID，无任何赛季时 0
 */
export function getDefaultRaidSeason(): number {
    const seasonIds = Object.values(RaidSeason)
        .map(item => item.RaidSeason)
        .sort((a, b) => a - b)
    if (seasonIds.length === 0) return 0

    const limit = getCurrentVersionLimit()
    const allowed = seasonIds.filter(seasonId => getRaidSeasonVersion(seasonId) <= limit)
    return allowed.at(-1) ?? seasonIds[0]
}
