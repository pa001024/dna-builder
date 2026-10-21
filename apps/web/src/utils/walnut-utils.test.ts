import { describe, expect, it } from "vitest"
import { WalnutSequenceSimulator } from "./walnut-utils"

describe("walnut-utils", () => {
    it("默认参数下单轮期望开函次数为 10", () => {
        expect(WalnutSequenceSimulator.expectedCycleOpens([1, 7, 10, 13, 13, 13])).toBeCloseTo(10, 10)
    })

    it("各档位单件期望开函次数符合「批次只结算最高档」口径", () => {
        const parameter = [1, 7, 10, 13, 13, 13]
        expect(WalnutSequenceSimulator.expectedOpensForRewardIndex(parameter, 0, 1)).toBeCloseTo(10, 10)
        expect(WalnutSequenceSimulator.expectedOpensForRewardIndex(parameter, 1, 1)).toBeCloseTo(3.4539, 4)
        expect(WalnutSequenceSimulator.expectedOpensForRewardIndex(parameter, 2, 1)).toBeCloseTo(3.4589, 4)
        expect(WalnutSequenceSimulator.expectedOpensForRewardIndex(parameter, 3, 1)).toBeCloseTo(4.663, 3)
    })

    it("高档次顶掉低档次：单轮各档产出数之和等于可结算的批次槽位", () => {
        const parameter = [1, 7, 10, 13, 13, 13]
        let copies = 0
        for (let rewardIndex = 1; rewardIndex <= 5; rewardIndex++) {
            copies += WalnutSequenceSimulator.expectedCycleCopies(parameter, rewardIndex)
        }
        // 非金奖均值 M=28，最后一槽被金顶掉，可结算批次数 E[floor(M/3)] = 9
        expect(copies).toBeCloseTo(9, 6)
    })

    it("羽蛇背水密函参数下期望值正确", () => {
        const parameter = [1, 5, 36, 36, 36, 36]
        expect(WalnutSequenceSimulator.expectedOpensForRewardIndex(parameter, 0, 1)).toBeCloseTo(25.5, 10)
        expect(WalnutSequenceSimulator.expectedOpensForRewardIndex(parameter, 1, 1)).toBeCloseTo(10.7684, 4)
        expect(WalnutSequenceSimulator.expectedOpensForRewardIndex(parameter, 2, 1)).toBeCloseTo(2.1171, 4)
    })

    it("无法产出的档位返回 Infinity", () => {
        expect(WalnutSequenceSimulator.expectedOpensForRewardIndex([1, 0, 0, 0, 0, 0], 1, 1)).toBe(Number.POSITIVE_INFINITY)
    })

    it("参数化后出金概率与重构前一致", () => {
        expect(WalnutSequenceSimulator.calculateGoldProbability(1)).toBeCloseTo(0.000087, 6)
        expect(WalnutSequenceSimulator.calculateGoldProbability(5)).toBeCloseTo(0.045997, 6)
        expect(WalnutSequenceSimulator.calculateGoldProbability(19)).toBe(1)
    })

    it("出金概率按传入参数计算（羽蛇背水密函）", () => {
        const parameter = [1, 5, 36, 36, 36, 36]
        expect(WalnutSequenceSimulator.calculateGoldProbability(10, parameter)).toBeCloseTo(0.016005, 6)
        expect(WalnutSequenceSimulator.calculateGoldProbability(19, parameter)).toBeCloseTo(0.207617, 6)
        expect(WalnutSequenceSimulator.calculateGoldProbability(50, parameter)).toBe(1)
    })
})
