import { describe, expect, it } from "vitest"
import { createRecentDedupe } from "@/utils/recent-dedupe"

describe("createRecentDedupe", () => {
    it("窗口内同键判重，窗口外放行", () => {
        const dedupe = createRecentDedupe(5_000)
        expect(dedupe.duplicate("a", 1_000)).toBe(false)
        expect(dedupe.duplicate("a", 3_000)).toBe(true)
        expect(dedupe.duplicate("a", 7_000)).toBe(false)
    })

    it("不同键互不影响，clear 清空记录", () => {
        const dedupe = createRecentDedupe(5_000)
        expect(dedupe.duplicate("a", 1_000)).toBe(false)
        expect(dedupe.duplicate("b", 1_000)).toBe(false)
        dedupe.clear()
        expect(dedupe.duplicate("a", 1_000)).toBe(false)
    })
})
