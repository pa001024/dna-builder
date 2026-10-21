import { describe, expect, it } from "vitest"
import { RaidSeason } from "@/data/d/raid.data"
import { DNA_SAFE_VERSION_LIMIT, getCurrentVersionLimit, setCurrentVersionLimit } from "@/data/versionGate"
import {
    formatRankTime,
    getDefaultRaidSeason,
    getHighestFloor,
    getInitialUnlockFloor,
    getJumpTiers,
    getRaidFloorFullList,
    getRaidFloorList,
    getRaidSeasonVersion,
    getUnlockFloorCount,
    isFloorSeason,
    isKeyFloor,
    shouldShowBubble,
} from "./raid-floor-utils"

const season1007 = RaidSeason[1007]
const season1006 = RaidSeason[1006]

describe("raid-floor-utils", () => {
    it("赛季模式判断：1007 为爬塔制，1006 为打分制", () => {
        expect(isFloorSeason(1007)).toBe(true)
        expect(isFloorSeason(season1007)).toBe(true)
        expect(isFloorSeason(1006)).toBe(false)
        expect(isFloorSeason(season1006)).toBe(false)
    })

    it("初始开放层数：1007 预热/正式都是 30，老赛季缺省为 1", () => {
        expect(getInitialUnlockFloor(season1007, true)).toBe(30)
        expect(getInitialUnlockFloor(season1007, false)).toBe(30)
        expect(getInitialUnlockFloor(season1006, true)).toBe(1)
        expect(getInitialUnlockFloor(season1006, false)).toBe(1)
    })

    it("关键层：1007 每 30 层一个关键层", () => {
        expect(isKeyFloor(season1007, 30, false)).toBe(true)
        expect(isKeyFloor(season1007, 60, false)).toBe(true)
        expect(isKeyFloor(season1007, 90, true)).toBe(true)
        expect(isKeyFloor(season1007, 31, false)).toBe(false)
        expect(isKeyFloor(season1006, 30, false)).toBe(false)
    })

    it("气泡引导：只在最高可打层且不超过 100 时显示", () => {
        expect(shouldShowBubble(season1007, 30, 30)).toBe(true)
        expect(shouldShowBubble(season1007, 29, 30)).toBe(false)
        expect(shouldShowBubble(season1007, 101, 101)).toBe(false)
        expect(shouldShowBubble(season1006, 1, 1)).toBe(false)
    })

    it("跳层规则：剩余 65s 跳 15 层，剩余 0s 保底跳 2 层", () => {
        // 限时 90s，通关用时 25s → 剩余 65s → 跳 15 层
        expect(getUnlockFloorCount(season1007, 90, 25)).toBe(15)
        // 通关用时 40s → 剩余 50s → 跳 10 层
        expect(getUnlockFloorCount(season1007, 90, 40)).toBe(10)
        // 通关用时 60s → 剩余 30s → 跳 5 层
        expect(getUnlockFloorCount(season1007, 90, 60)).toBe(5)
        // 通关用时 90s → 剩余 0s → 保底跳 2 层
        expect(getUnlockFloorCount(season1007, 90, 90)).toBe(2)
        // 老赛季无跳层配置 → 0
        expect(getUnlockFloorCount(season1006, 90, 25)).toBe(0)
    })

    it("跳层配对明细与达标标记一致", () => {
        const tiers = getJumpTiers(season1007, 90, 40)
        expect(tiers).toEqual([
            { jumpTime: 65, jumpFloor: 15, reached: false },
            { jumpTime: 50, jumpFloor: 10, reached: true },
            { jumpTime: 30, jumpFloor: 5, reached: true },
            { jumpTime: 0, jumpFloor: 2, reached: true },
        ])
    })

    it("排行用时格式化为 分:秒.百分秒", () => {
        expect(formatRankTime(83.45)).toBe("01:23.45")
        expect(formatRankTime(90)).toBe("01:30.00")
        expect(formatRankTime(0)).toBe("00:00.00")
        expect(formatRankTime(undefined)).toBe("--")
    })

    it("楼层列表按时期过滤并按 FloorId 排序", () => {
        const list = getRaidFloorList(1007, 2, 30)
        expect(list).toHaveLength(30)
        expect(list[0].Floor).toBe(1)
        expect(list[29].Floor).toBe(30)
        expect(list.every(item => item.FloorType === 2 && item.RaidSeason === 1007)).toBe(true)
        expect(getHighestFloor(1007, 1)).toBe(180)
        expect(getHighestFloor(1007, 2)).toBe(180)
    })

    it("全量楼层列表不受解锁层限制（原版 180 层）", () => {
        const full = getRaidFloorFullList(1007, 2)
        expect(full).toHaveLength(180)
        expect(full[0].Floor).toBe(1)
        expect(full[179].Floor).toBe(180)
        expect(getRaidFloorFullList(1007, 1)).toHaveLength(180)
    })
})

describe("赛季默认选中与安全模式版本门限一致", () => {
    it("赛季号换算版本号：1001 → 1.1，1007 → 1.7", () => {
        expect(getRaidSeasonVersion(1001)).toBeCloseTo(1.1)
        expect(getRaidSeasonVersion(1006)).toBeCloseTo(1.6)
        expect(getRaidSeasonVersion(1007)).toBeCloseTo(1.7)
    })

    it("安全模式开启时默认选中版本门限内的最新赛季", () => {
        const limit = getCurrentVersionLimit()
        const season = getDefaultRaidSeason()
        expect(getRaidSeasonVersion(season)).toBeLessThanOrEqual(limit)
        expect(getRaidSeasonVersion(season)).toBeCloseTo(DNA_SAFE_VERSION_LIMIT)
    })

    it("关闭安全模式后默认选中最新赛季", () => {
        const previousLimit = getCurrentVersionLimit()
        setCurrentVersionLimit(Number.POSITIVE_INFINITY)
        try {
            expect(getDefaultRaidSeason()).toBe(Math.max(...Object.values(RaidSeason).map(item => item.RaidSeason)))
        } finally {
            setCurrentVersionLimit(previousLimit)
        }
    })
})
