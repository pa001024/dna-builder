import { describe, expect, it } from "vitest"
import type { AbyssDungeon } from "@/data"
import { abyssDungeons } from "@/data/d/abyss.data"
import {
    getAbyssCumulativeRewardItems,
    getAbyssCumulativeRewardRows,
    getAbyssStarCountByActCount,
    getImmortalMonsterLevelByActCount,
    getNextAbyssRewardStarLevel,
} from "./abyss-utils"

function getImmortalTestDungeon(): AbyssDungeon {
    const dungeon = abyssDungeons.find(item => item.id === 2013011)
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
        expect(getImmortalMonsterLevelByActCount(1)).toBe(90)
        expect(getImmortalMonsterLevelByActCount(2)).toBe(92)
        expect(getImmortalMonsterLevelByActCount(3)).toBe(94)
        expect(getImmortalMonsterLevelByActCount(4)).toBe(96)
        expect(getImmortalMonsterLevelByActCount(5)).toBe(98)
        expect(getImmortalMonsterLevelByActCount(6)).toBe(105)
        expect(getImmortalMonsterLevelByActCount(7)).toBe(108)
        expect(getImmortalMonsterLevelByActCount(8)).toBe(110)
        expect(getImmortalMonsterLevelByActCount(9)).toBe(112)
        expect(getImmortalMonsterLevelByActCount(12)).toBe(123)
        expect(getImmortalMonsterLevelByActCount(20)).toBe(146)
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
