import { describe, expect, it } from "vitest"
import type { AbyssDungeon } from "@/data/d/abyss.data"
import { abyssDungeons, defaultImmortalSeasonId, immortalMonsterLevelRules } from "@/data/d/abyss.data"
import {
    getAbyssCumulativeRewardItems,
    getAbyssCumulativeRewardRows,
    getAbyssStarCountByActCount,
    getImmortalMonsterLevelByActCount,
    getNextAbyssRewardStarLevel,
} from "./abyss-utils"

function getImmortalTestDungeon(): AbyssDungeon {
    const dungeon = abyssDungeons.find((item: AbyssDungeon) => item.id === 2013011)
    if (!dungeon) {
        throw new Error("缺少不朽剧目测试数据")
    }

    return dungeon
}

describe("abyss-utils", () => {
    it("应该按幕数换算星数", () => {
        expect(getAbyssStarCountByActCount(12)).toBe(60)
        expect(getAbyssStarCountByActCount(36)).toBe(180)
    })

    it("应该按不朽剧目幕数换算怪物等级", () => {
        const rule = immortalMonsterLevelRules[1007]
        const expected = (actCount: number) => {
            const levelIndex = Math.max(1, Math.trunc(actCount))
            const loopTime = Math.trunc((levelIndex - 1) / rule.initLevels.length)
            const realIndex = (levelIndex - 1) % rule.initLevels.length
            return rule.initLevels[realIndex] + rule.levelAddOn * loopTime
        }

        expect(rule.abyssId).toBe(1312)
        expect(rule.levelIds).toEqual([13031, 13032, 13033, 13034, 13035, 13036])
        expect(rule.initLevels).toEqual([90, 92, 94, 96, 98, 104])
        expect(rule.levelAddOn).toBe(16)
        expect(getImmortalMonsterLevelByActCount(1, 1007)).toBe(expected(1))
        expect(getImmortalMonsterLevelByActCount(2, 1007)).toBe(expected(2))
        expect(getImmortalMonsterLevelByActCount(3, 1007)).toBe(expected(3))
        expect(getImmortalMonsterLevelByActCount(4, 1007)).toBe(expected(4))
        expect(getImmortalMonsterLevelByActCount(5, 1007)).toBe(expected(5))
        expect(getImmortalMonsterLevelByActCount(6, 1007)).toBe(expected(6))
        expect(getImmortalMonsterLevelByActCount(7, 1007)).toBe(expected(7))
        expect(getImmortalMonsterLevelByActCount(8, 1007)).toBe(expected(8))
        expect(getImmortalMonsterLevelByActCount(9, 1007)).toBe(expected(9))
        expect(getImmortalMonsterLevelByActCount(12, 1007)).toBe(expected(12))
        expect(getImmortalMonsterLevelByActCount(13, 1007)).toBe(expected(13))
        expect(getImmortalMonsterLevelByActCount(18, 1007)).toBe(expected(18))
        expect(getImmortalMonsterLevelByActCount(24, 1007)).toBe(expected(24))
        expect(getImmortalMonsterLevelByActCount(24)).toBe(getImmortalMonsterLevelByActCount(24, defaultImmortalSeasonId))
    })

    it("应该按阈值顺序推进累计奖励星数", () => {
        expect(getNextAbyssRewardStarLevel(10)).toBe(20)
        expect(getNextAbyssRewardStarLevel(20)).toBe(30)
        expect(getNextAbyssRewardStarLevel(30)).toBe(35)
        expect(getNextAbyssRewardStarLevel(55)).toBe(60)
        expect(getNextAbyssRewardStarLevel(60)).toBe(62)
        expect(getNextAbyssRewardStarLevel(62)).toBe(64)
    })

    it("应该正确计算不朽剧目 12 幕的累计奖励行", () => {
        const dungeon = getImmortalTestDungeon()
        const rows = getAbyssCumulativeRewardRows(dungeon, 12)

        expect(rows).toEqual([
            { lv: 10, r: 48001, a: 10, w: 1, count: 3 },
            { lv: 35, r: 48002, a: 5, w: 1, count: 6 },
        ])
    })

    it("应该正确计算 400 星到 410 星只多 5 次最后一档", () => {
        const dungeon = getImmortalTestDungeon()
        const rowsAt400 = getAbyssCumulativeRewardRows(dungeon, 80)
        const rowsAt410 = getAbyssCumulativeRewardRows(dungeon, 82)

        const lastRowAt400 = rowsAt400.find(row => row.lv === 62)
        const lastRowAt410 = rowsAt410.find(row => row.lv === 62)

        expect(lastRowAt400?.count).toBe(170)
        expect(lastRowAt410?.count).toBe(175)
        expect((lastRowAt410?.count || 0) - (lastRowAt400?.count || 0)).toBe(5)
    })

    it("应该把累计奖励展开成具体物品数量", () => {
        const dungeon = getImmortalTestDungeon()
        const items = getAbyssCumulativeRewardItems(dungeon, 12)
        const ticket = items.find(item => item.t === "Resource" && item.id === 214)

        expect(ticket?.c).toBe(1050)
    })
})
