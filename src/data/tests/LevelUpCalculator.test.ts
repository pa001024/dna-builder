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

    it("test estimateTime", () => {
        const modMap = modData
            .map(mod => calc.extractMinimalModData(mod))
            .reduce((acc, mod) => {
                acc.set(mod.id, mod)
                return acc
            }, new Map<number, ModExt>())
        const result = estimateTime(mockResourceNeeds, Object.fromEntries(modMap))
        // console.log(result)
        // 检查天数必须大于0
        expect(result.days).toBeGreaterThan(0)
    })
})
