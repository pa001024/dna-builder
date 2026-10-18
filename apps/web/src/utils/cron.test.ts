import { describe, expect, it } from "vitest"
import { DEFAULT_COUNTER_RESET_CRON, getNextCronOccurrence, normalizeCronExpression } from "./cron"

describe("cron helpers", () => {
    it("应该默认使用每周一凌晨5点", () => {
        expect(DEFAULT_COUNTER_RESET_CRON).toBe("0 5 * * 1")
    })

    it("应该规整 cron 表达式", () => {
        expect(normalizeCronExpression(" 0   5  *  *  1 ")).toBe("0 5 * * 1")
        expect(normalizeCronExpression("0 5 * *")).toBeNull()
        expect(normalizeCronExpression("0 5 * * 1 2")).toBe("0 5 * * 1 2")
    })

    it("应该计算下一个周一凌晨5点", () => {
        const current = new Date(2026, 3, 20, 4, 59, 0, 0).getTime()
        const next = getNextCronOccurrence("0 5 * * 1", current)

        expect(next).toBe(new Date(2026, 3, 20, 5, 0, 0, 0).getTime())
    })

    it("应该计算下一个匹配时间并跳过当天已过时刻", () => {
        const current = new Date(2026, 3, 20, 5, 0, 30, 0).getTime()
        const next = getNextCronOccurrence("0 5 * * 1", current)

        expect(next).toBe(new Date(2026, 3, 27, 5, 0, 0, 0).getTime())
    })

    it("应该拒绝非法 cron", () => {
        expect(getNextCronOccurrence("0 5 * * ?", Date.now())).toBeNull()
    })
})
