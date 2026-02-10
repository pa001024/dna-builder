import { describe, expect, it } from "vitest"
import modData from "../d/mod.data"
import { LevelUpCalculator, type ResourceCost } from "../LevelUpCalculator"
import { estimateTime, type ModExt } from "../LevelUpCalculatorImpl"

describe("LevelUpCalculator", () => {
    const mockResourceNeeds: ResourceCost = {
        深红凝珠: 68400,
        铜币: 3342000,
        "图纸: 决斗": [10, 51313, "Draft"],
        人面狮之决斗: [50, 41313, "Mod"],
        委托密函线索: 1100,
        "图纸: 羽翼·鼓舞·背水": [10, 56154, "Draft"],
        换生灵之背水: [10, 56153, "Mod"],
        不死鸟之羽翼: [100, 31004, "Mod"],
        海妖之羽翼·鼓舞: [100, 31301, "Mod"],
    }

    const calc = new LevelUpCalculator()

    /**
     * 构建最小化的魔之楔映射
     * @returns 供 estimateTime 使用的魔之楔映射
     */
    function createModMap() {
        return modData
            .map(mod => calc.extractMinimalModData(mod))
            .reduce((acc, mod) => {
                acc.set(mod.id, mod)
                return acc
            }, new Map<number, ModExt>())
    }

    /**
     * 统计估算结果中的总副本次数
     * @param result 时间估算结果
     * @returns 所有副本次数之和
     */
    function getTotalDungeonRuns(result: ReturnType<typeof estimateTime>) {
        return Object.values(result.dungeonTimes).reduce((sum, [times]) => sum + times, 0)
    }

    it("test estimateTime", () => {
        const modMap = createModMap()
        const result = estimateTime(mockResourceNeeds, Object.fromEntries(modMap))
        // console.log(result)
        // 检查天数必须大于0
        expect(result.days).toBeGreaterThan(0)
    })

    it("should reduce expected dungeon runs when drop bonus increases", () => {
        const modMap = createModMap()
        const baseResult = estimateTime(mockResourceNeeds, Object.fromEntries(modMap), {
            dungeonDropRateBonus: 0,
        })
        const boostedResult = estimateTime(mockResourceNeeds, Object.fromEntries(modMap), {
            dungeonDropRateBonus: 0.5,
        })

        expect(getTotalDungeonRuns(boostedResult)).toBeLessThan(getTotalDungeonRuns(baseResult))
    })

    it("should increase estimated minutes when dungeon time multiplier increases", () => {
        const modMap = createModMap()
        const simpleNeed: ResourceCost = {
            深红凝珠: 1080,
        }

        const fastResult = estimateTime(simpleNeed, Object.fromEntries(modMap), {
            dungeonDropRateBonus: 0,
            dungeonTimeMultiplier: 1,
        })
        const slowResult = estimateTime(simpleNeed, Object.fromEntries(modMap), {
            dungeonDropRateBonus: 0,
            dungeonTimeMultiplier: 2,
        })

        expect(fastResult.mins).toBe(1)
        expect(slowResult.mins).toBe(2)
    })
})
