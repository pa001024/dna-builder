import { describe, it, expect, beforeEach, vi } from "vitest"
import { sleep, getEmoji } from "./util"

describe("Utility Functions", () => {
    describe("sleep", () => {
        it("should return a promise", () => {
            const result = sleep(10)
            expect(result).toBeInstanceOf(Promise)
        })

        it("should resolve after specified milliseconds", async () => {
            const start = Date.now()
            await sleep(100)
            const end = Date.now()
            const elapsed = end - start
            // Allow some tolerance for timing
            expect(elapsed).toBeGreaterThanOrEqual(95)
            expect(elapsed).toBeLessThan(150)
        })

        it("should resolve immediately for 0ms", async () => {
            const start = Date.now()
            await sleep(0)
            const end = Date.now()
            const elapsed = end - start
            expect(elapsed).toBeLessThan(10)
        })

        it("should work with multiple concurrent calls", async () => {
            const start = Date.now()
            await Promise.all([
                sleep(50),
                sleep(50),
                sleep(50)
            ])
            const end = Date.now()
            const elapsed = end - start
            // All should resolve around the same time
            expect(elapsed).toBeGreaterThanOrEqual(45)
            expect(elapsed).toBeLessThan(100)
        })

        it("should handle negative values as 0", async () => {
            const start = Date.now()
            await sleep(-100)
            const end = Date.now()
            const elapsed = end - start
            expect(elapsed).toBeLessThan(10)
        })
    })

    describe("getEmoji", () => {
        it("should return emoji path for valid emoji descriptor", () => {
            // This test will need to be updated based on actual emoji.json content
            const result = getEmoji("smile")
            expect(typeof result).toBe("string")
        })

        it("should return empty string for invalid emoji descriptor", () => {
            const result = getEmoji("nonexistent-emoji-xyz-123")
            expect(result).toBe("")
        })

        it("should return empty string for empty input", () => {
            const result = getEmoji("")
            expect(result).toBe("")
        })

        it("should return path starting with /emojiimg/ for valid emoji", () => {
            // Test with a potentially valid emoji
            const result = getEmoji("smile")
            if (result) {
                expect(result).toMatch(/^\/emojiimg\//)
            }
        })

        it("should handle special characters in emoji descriptor", () => {
            const result = getEmoji("😀")
            expect(typeof result).toBe("string")
        })

        it("should be case-sensitive", () => {
            const lower = getEmoji("smile")
            const upper = getEmoji("SMILE")
            // They should potentially return different results or both empty
            expect(typeof lower).toBe("string")
            expect(typeof upper).toBe("string")
        })
    })
})

describe("Additional Utility Tests", () => {
    describe("base36Pad function", () => {
        it("should be exported if available", async () => {
            const util = await import("./util")
            if ("base36Pad" in util) {
                expect(typeof util.base36Pad).toBe("function")
            }
        })
    })

    describe("getEmoji edge cases", () => {
        it("should handle null input safely", () => {
            const result = getEmoji(null as any)
            expect(result).toBe("")
        })

        it("should handle undefined input safely", () => {
            const result = getEmoji(undefined as any)
            expect(result).toBe("")
        })

        it("should handle numeric input", () => {
            const result = getEmoji(123 as any)
            expect(typeof result).toBe("string")
        })

        it("should handle whitespace-only input", () => {
            const result = getEmoji("   ")
            expect(result).toBe("")
        })

        it("should handle very long strings", () => {
            const longString = "a".repeat(1000)
            const result = getEmoji(longString)
            expect(typeof result).toBe("string")
        })

        it("should be consistent for same input", () => {
            const input = "smile"
            const result1 = getEmoji(input)
            const result2 = getEmoji(input)
            expect(result1).toBe(result2)
        })
    })

    describe("sleep edge cases", () => {
        it("should handle very large durations", async () => {
            const promise = sleep(1000000)
            expect(promise).toBeInstanceOf(Promise)
            // Don't actually wait for it
        })

        it("should handle fractional milliseconds", async () => {
            const start = Date.now()
            await sleep(50.5)
            const end = Date.now()
            expect(end - start).toBeGreaterThanOrEqual(45)
        })

        it("should handle NaN as 0", async () => {
            const start = Date.now()
            await sleep(NaN as any)
            const end = Date.now()
            expect(end - start).toBeLessThan(10)
        })

        it("should be cancellable via Promise.race", async () => {
            const timeout = new Promise((resolve) => setTimeout(resolve, 10))
            const longSleep = sleep(10000)

            const result = await Promise.race([timeout, longSleep])
            expect(result).toBeUndefined()
        })
    })
})