import { describe, expect, it } from "vitest"
import { expandRewardSequenceSource, RewardSequenceSimulator } from "./reward-sequence"

describe("RewardSequenceSimulator", () => {
    it("应该按序列不放回抽取并在抽空后重置", () => {
        const simulator = new RewardSequenceSimulator([1, 2, 3])

        const firstRound = [simulator.draw(), simulator.draw(), simulator.draw()]
        expect(new Set(firstRound)).toHaveLength(3)
        expect(firstRound.every(item => item !== null)).toBe(true)

        const secondRound = simulator.draw()
        expect(secondRound).not.toBeNull()
    })

    it("应该按次数展开后不放回抽取", () => {
        const source = expandRewardSequenceSource(
            [
                { id: "A", p: 1 },
                { id: "B", p: 2 },
            ],
            item => item.p
        )
        const simulator = new RewardSequenceSimulator(source)
        const results = [simulator.draw(), simulator.draw(), simulator.draw()].filter(Boolean)

        expect(results).toHaveLength(3)
        expect(results.filter(item => item?.id === "A")).toHaveLength(1)
        expect(results.filter(item => item?.id === "B")).toHaveLength(2)
    })
})
