import { describe, expect, it } from "vitest"
import { computeCostMicros, computeUsageCostMicros, isPeakPricing } from "./ai-pricing"

/**
 * 计费口径测试。
 *
 * 期望值按 DeepSeek 官网价目表手写，不引用被测常量，避免拿常量验证常量。
 * 与 `apps/server/src/ai-pricing.test.ts` 同口径，两边改动需同步。
 */

/** 微元换算：元 → 微元。 */
const yuan = (value: number) => value * 1_000_000

/**
 * 构造一个「北京时间」时刻。
 * @param iso 北京时间的 "YYYY-MM-DD HH:mm" 文本
 * @returns 对应的时间对象
 */
function beijingTime(iso: string): Date {
    return new Date(`${iso.replace(" ", "T")}:00+08:00`)
}

describe("isPeakPricing", () => {
    it("按北京时间工作日 9-12 / 14-18 判定高峰", () => {
        expect(isPeakPricing(beijingTime("2026-09-16 08:59"))).toBe(false)
        expect(isPeakPricing(beijingTime("2026-09-16 09:00"))).toBe(true)
        expect(isPeakPricing(beijingTime("2026-09-16 11:59"))).toBe(true)
        expect(isPeakPricing(beijingTime("2026-09-16 12:00"))).toBe(false)
        expect(isPeakPricing(beijingTime("2026-09-16 14:00"))).toBe(true)
        expect(isPeakPricing(beijingTime("2026-09-16 18:00"))).toBe(false)
    })

    it("周末全天按空闲时段计算", () => {
        expect(isPeakPricing(beijingTime("2026-09-19 10:00"))).toBe(false)
        expect(isPeakPricing(beijingTime("2026-09-20 15:00"))).toBe(false)
    })
})

describe("computeCostMicros", () => {
    it("空闲时段：缓存命中 0.02 / 未命中 1 / 输出 4 元每百万 tokens", () => {
        expect(computeCostMicros({ cacheHit: 1_000_000, cacheMiss: 0, output: 0 }, false)).toBe(yuan(0.02))
        expect(computeCostMicros({ cacheHit: 0, cacheMiss: 1_000_000, output: 0 }, false)).toBe(yuan(1))
        expect(computeCostMicros({ cacheHit: 0, cacheMiss: 0, output: 1_000_000 }, false)).toBe(yuan(4))
    })

    it("高峰时段单价是空闲时段的两倍", () => {
        expect(computeCostMicros({ cacheHit: 1_000_000, cacheMiss: 0, output: 0 }, true)).toBe(yuan(0.04))
        expect(computeCostMicros({ cacheHit: 0, cacheMiss: 1_000_000, output: 0 }, true)).toBe(yuan(2))
        expect(computeCostMicros({ cacheHit: 0, cacheMiss: 0, output: 1_000_000 }, true)).toBe(yuan(8))
    })
})

describe("computeUsageCostMicros", () => {
    it("缓存命中从输入总量里拆出来，剩余按未命中计价", () => {
        const usage = { inputTokens: 10_000, outputTokens: 800, cacheReadTokens: 6_000 }
        // 空闲：6000×0.02 + 4000×1 + 800×4 = 120 + 4000 + 3200 = 7320 微元
        expect(computeUsageCostMicros(usage, false)).toBe(7320)
        // 高峰全部翻倍
        expect(computeUsageCostMicros(usage, true)).toBe(14_640)
    })

    it("缓存命中量超过输入总量时按输入总量封顶，不会多计费", () => {
        // 命中按 100 封顶、未命中 0：100×0.02 = 2 微元（与后端 cap 口径一致）
        expect(computeUsageCostMicros({ inputTokens: 100, outputTokens: 0, cacheReadTokens: 200 }, false)).toBe(2)
    })

    it("没有用量时不产生费用", () => {
        expect(computeUsageCostMicros({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }, true)).toBe(0)
    })
})
