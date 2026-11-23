import { describe, expect, it } from "bun:test"
import { compareBugRanking, effectiveSeverity, type RankingInput, severityRank, sortBugRanking } from "./ranking"
import type { BugSeverity } from "./types"

function input(overrides: Partial<RankingInput> & { id: string }): RankingInput {
    return { effectiveSeverity: "S3", voteCount: 0, lastEvidenceAt: null, createdAt: 0, ...overrides }
}

describe("严重程度与排序（spec §14.4）", () => {
    it("effectiveSeverity：维护者确认优先，其次被采纳的 AI 建议，否则 U", () => {
        expect(effectiveSeverity({ confirmedSeverity: "S1", suggestedSeverity: "S3", severitySource: "ai" })).toBe("S1")
        expect(effectiveSeverity({ confirmedSeverity: null, suggestedSeverity: "S2", severitySource: "ai" })).toBe("S2")
        expect(effectiveSeverity({ confirmedSeverity: null, suggestedSeverity: "S2", severitySource: "deterministic" })).toBe("S2")
        expect(effectiveSeverity({ confirmedSeverity: null, suggestedSeverity: "S2", severitySource: null })).toBe("U")
        expect(effectiveSeverity({ confirmedSeverity: null, suggestedSeverity: null, severitySource: "ai" })).toBe("U")
    })

    it("档位顺序为 S0 > S1 > S2 > U > S3 > S4", () => {
        const order: BugSeverity[] = ["S0", "S1", "S2", "U", "S3", "S4"]
        for (let index = 1; index < order.length; index++) {
            expect(severityRank(order[index - 1]!)).toBeLessThan(severityRank(order[index]!))
        }
    })

    it("票数只在同档内影响排序，不能盖过高严重程度", () => {
        const critical = input({ id: "critical", effectiveSeverity: "S2", voteCount: 0 })
        const popular = input({ id: "popular", effectiveSeverity: "S3", voteCount: 10_000 })
        expect(compareBugRanking(critical, popular)).toBeLessThan(0)
    })

    it("同档内按票数 → 最近证据 → createdAt → id 稳定排序", () => {
        const a = input({ id: "a", effectiveSeverity: "S2", voteCount: 5, lastEvidenceAt: 100, createdAt: 10 })
        const b = input({ id: "b", effectiveSeverity: "S2", voteCount: 5, lastEvidenceAt: 200, createdAt: 10 })
        expect(compareBugRanking(b, a)).toBeLessThan(0)

        const older = input({ id: "older", effectiveSeverity: "S2", voteCount: 5, lastEvidenceAt: 200, createdAt: 10 })
        const newer = input({ id: "newer", effectiveSeverity: "S2", voteCount: 5, lastEvidenceAt: 200, createdAt: 20 })
        expect(compareBugRanking(older, newer)).toBeLessThan(0)

        const sameOne = input({ id: "x", effectiveSeverity: "S2", voteCount: 5, lastEvidenceAt: 200, createdAt: 10 })
        const sameTwo = input({ id: "y", effectiveSeverity: "S2", voteCount: 5, lastEvidenceAt: 200, createdAt: 10 })
        expect(compareBugRanking(sameOne, sameTwo)).toBeLessThan(0)
        expect(compareBugRanking(sameTwo, sameOne)).toBeGreaterThan(0)
    })

    it("sortBugRanking 返回新数组且不改动入参", () => {
        const items = [
            input({ id: "c", effectiveSeverity: "S4" }),
            input({ id: "a", effectiveSeverity: "S0" }),
            input({ id: "b", effectiveSeverity: "U" }),
        ]
        const sorted = sortBugRanking(items)
        expect(sorted.map(item => item.id)).toEqual(["a", "b", "c"])
        expect(items.map(item => item.id)).toEqual(["c", "a", "b"])
    })
})
