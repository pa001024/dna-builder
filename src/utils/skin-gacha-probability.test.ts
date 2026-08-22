import { describe, expect, it } from "vitest"
import {
    DEFAULT_GOLD_PITY,
    GOLD_SOFT_PITY_WINDOW,
    getGoldCombinedRate,
    getGoldExpectedPulls,
    getGoldPityConfig,
    getGoldRate,
    PURPLE_PITY,
} from "@/utils/skin-gacha-probability"

/** 万华皮肤卡池的概率配置（与 src/data/d/skingacha.data.ts 中 9999/1001 一致）：基础 0.3%、90 抽硬保底 */
const WANHUA_PROB = { ProbabilityId: 9999, ProbabilityGold: 30, ProbabilityPurple: 510, ShowGetStar5Times: 90 }

describe("skin-gacha-probability", () => {
    it("万华卡池配置解析：基础概率 0.3%、硬保底 90、软保底自第 75 抽起", () => {
        const config = getGoldPityConfig(WANHUA_PROB)
        expect(config.baseRate).toBeCloseTo(0.003, 9)
        expect(config.hardPity).toBe(90)
        expect(config.softPityStart).toBe(75)
        expect(config.step).toBeGreaterThan(0)
        expect(config.step).toBeCloseTo(0.0623125, 7)
    })

    it("综合概率（含保底）≈ 1.42%，与官方概率说明一致", () => {
        const config = getGoldPityConfig(WANHUA_PROB)
        expect(getGoldExpectedPulls(config)).toBeCloseTo(70.19, 1)
        expect(getGoldCombinedRate(config) * 100).toBeCloseTo(1.42, 2)
    })

    it("硬保底前保持基础概率，软保底后每抽线性递增，第 hardPity 抽必出", () => {
        const config = getGoldPityConfig(WANHUA_PROB)
        expect(getGoldRate(1, config)).toBeCloseTo(0.003, 9)
        expect(getGoldRate(config.softPityStart - 1, config)).toBeCloseTo(0.003, 9)
        // 第 75 抽起出金概率开始递增
        expect(getGoldRate(config.softPityStart, config)).toBeGreaterThan(0.003)
        expect(getGoldRate(config.softPityStart, config)).toBeCloseTo(0.003 + config.step, 9)
        // 第 89 抽仍未到 100%，第 90 抽（硬保底）必出
        expect(getGoldRate(config.hardPity - 1, config)).toBeLessThan(1)
        expect(getGoldRate(config.hardPity, config)).toBe(1)
    })

    it("概率单调不减：抽数越多出金概率越高", () => {
        const config = getGoldPityConfig(WANHUA_PROB)
        for (let n = 1; n < config.hardPity; n++) {
            expect(getGoldRate(n + 1, config)).toBeGreaterThanOrEqual(getGoldRate(n, config))
        }
    })

    it("不同基础概率/硬保底卡池也能按同规则推导软保底", () => {
        // 3001 卡池：基础 0.8%、80 抽硬保底
        const config = getGoldPityConfig({ ProbabilityId: 3001, ProbabilityGold: 80, ProbabilityPurple: 660, ShowGetStar5Times: 80 })
        expect(config.hardPity).toBe(80)
        expect(config.softPityStart).toBe(65)
        expect(getGoldRate(config.softPityStart - 1, config)).toBeCloseTo(0.008, 9)
        expect(getGoldRate(config.hardPity, config)).toBe(1)
    })

    it("缺失概率配置时回退默认 90 抽硬保底，且不会除零", () => {
        const config = getGoldPityConfig(undefined)
        expect(config.hardPity).toBe(DEFAULT_GOLD_PITY)
        expect(config.baseRate).toBe(0)
        expect(Number.isFinite(config.step)).toBe(true)
        expect(Number.isFinite(getGoldCombinedRate(config))).toBe(true)
    })

    it("导出常量符合既有规则", () => {
        expect(PURPLE_PITY).toBe(10)
        expect(DEFAULT_GOLD_PITY).toBe(90)
        expect(GOLD_SOFT_PITY_WINDOW).toBeGreaterThan(0)
    })
})
