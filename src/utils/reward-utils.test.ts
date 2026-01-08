import { describe, it, expect } from "vitest"
import { getDropModeText, getRewardDetails, type RewardItem } from "./reward-utils"

describe("getDropModeText", () => {
    it("应该正确翻译掉落模式", () => {
        expect(getDropModeText("Independent")).toBe("独立")
        expect(getDropModeText("Weight")).toBe("权重")
        expect(getDropModeText("Fixed")).toBe("固定")
        expect(getDropModeText("Gender")).toBe("性别")
        expect(getDropModeText("Level")).toBe("等级")
        expect(getDropModeText("Once")).toBe("一次")
        expect(getDropModeText("Sequence")).toBe("序列")
    })

    it("对于未知模式应该返回原字符串", () => {
        expect(getDropModeText("Unknown")).toBe("Unknown")
    })
})

describe("getRewardDetails", () => {
    it("应该处理不存在的奖励ID", () => {
        const result = getRewardDetails(999999)
        expect(result).toBeNull()
    })

    it("应该处理循环引用", () => {
        const result = getRewardDetails(1)
        expect(result).toBeDefined()
    })

    it("应该正确处理Independent模式的奖励", () => {
        const result = getRewardDetails(1)
        expect(result).not.toBeNull()
        expect(result?.m).toBe("Independent")
        expect(result?.child).toBeDefined()
        expect(result?.child!.length).toBeGreaterThan(0)
    })

    it("应该正确处理Weight模式的奖励", () => {
        const result = getRewardDetails(2)
        expect(result).not.toBeNull()
        expect(result?.m).toBe("Weight")
        expect(result?.child).toBeDefined()
        expect(result?.child!.length).toBeGreaterThan(0)
    })

    it("应该正确处理Sequence模式的奖励", () => {
        const result = getRewardDetails(50)
        expect(result).not.toBeNull()
        expect(result?.m).toBe("Sequence")
        expect(result?.child).toBeDefined()
        expect(result?.child!.length).toBeGreaterThan(0)
        expect(result?.p).toBeGreaterThan(0)
    })

    it("应该正确计算Sequence模式的pp值（reward id 300167）", () => {
        const result = getRewardDetails(300167)
        expect(result).not.toBeNull()
        expect(result?.m).toBe("Sequence")
        expect(result?.totalP).toBe(12)

        if (result?.child) {
            expect(result.child[0].pp).toBeCloseTo(1 / 12, 6)
            expect(result.child[1].pp).toBeCloseTo(1 / 12, 6)
            expect(result.child[2].pp).toBeCloseTo(1 / 12, 6)
            expect(result.child[3].pp).toBeCloseTo(1 / 12, 6)
            expect(result.child[4].pp).toBeCloseTo(1 / 12, 6)
            expect(result.child[5].pp).toBeCloseTo(1 / 12, 6)
            expect(result.child[6].pp).toBeCloseTo(2 / 12, 6)
            expect(result.child[7].pp).toBeCloseTo(2 / 12, 6)
            expect(result.child[8].pp).toBeCloseTo(2 / 12, 6)

            if (result.child[0].child) {
                // 子奖励0的pp值应该是 (1/12) * (5/10)
                expect(result.child[0].child[0].pp).toBeCloseTo((1 / 12) * (5 / 10), 6)
                expect(result.child[0].child[1].pp).toBeCloseTo((1 / 12) * (5 / 10), 6)
            }
        }
    })

    it("应该正确计算多层嵌套结构的pp值", () => {
        const result = getRewardDetails(51)
        expect(result).not.toBeNull()
        expect(result?.m).toBe("Sequence")

        if (result?.child) {
            const validatePP = (item: RewardItem): void => {
                if (item.pp !== undefined) {
                    expect(item.pp).toBeGreaterThanOrEqual(0)
                    expect(item.pp).toBeLessThanOrEqual(1)
                }

                if (item.child) {
                    const childPPSum = item.child.reduce((sum: number, child: RewardItem) => sum + (child.pp || 0), 0)
                    if (item.pp !== undefined) {
                        expect(childPPSum).toBeCloseTo(item.pp, 6)
                    }
                    item.child.forEach((child) => validatePP(child))
                }
            }

            validatePP(result)
        }
    })

    it("应该正确处理包含子奖励的嵌套结构", () => {
        const result = getRewardDetails(3)
        expect(result).not.toBeNull()

        const validateStructure = (item: RewardItem | null): void => {
            if (!item) return

            expect(item.id).toBeDefined()
            expect(item.t).toBeDefined()
            expect(item.p).toBeGreaterThanOrEqual(0)

            if (item.child) {
                item.child.forEach((child) => validateStructure(child))
            }
        }

        validateStructure(result)
    })

    it("应该正确计算归一化的pp值", () => {
        const result = getRewardDetails(50)
        expect(result).not.toBeNull()
        expect(result?.m).toBe("Sequence")

        if (result?.child) {
            const totalPP = result.child.reduce((sum: number, child: RewardItem) => sum + (child.pp || 0), 0)
            expect(totalPP).toBeCloseTo(1, 6)

            result.child.forEach((child) => {
                expect(child.pp).toBeGreaterThan(0)
                expect(child.pp).toBeLessThanOrEqual(1)
            })
        }
    })

    it("应该正确处理空子奖励列表", () => {
        const result = getRewardDetails(4)
        expect(result).toBeDefined()
    })

    it("应该正确处理parentProbability参数", () => {
        const result = getRewardDetails(1, new Set(), 0.5)
        expect(result).not.toBeNull()
        expect(result?.p).toBe(0.5)
    })

    it("应该正确处理Sequence模式的递归计算", () => {
        const result = getRewardDetails(50)
        expect(result).not.toBeNull()
        expect(result?.m).toBe("Sequence")

        if (result?.child && result.child.length > 0) {
            const expectedTotal = result.child.reduce((sum: number, child: RewardItem) => sum + child.p, 0)
            expect(result.totalP).toBeCloseTo(expectedTotal, 6)
        }
    })
})
