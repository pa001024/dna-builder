import { describe, expect, it } from "vitest"
import { raceLotteryData } from "@/data/d/race-lottery.data"
import {
    buildFinishTimeDistribution,
    buildInsideBuffPool,
    estimateTopNRates,
    poissonBinomialCdfAtMost,
    RACE_BUFF_MARKS,
    RACE_SPRINT_TIME,
    RACE_TRACK_LENGTH,
    simulateRace,
} from "@/utils/race-lottery-sim"

/**
 * 构造可复现的伪随机序列。
 * @param seed 种子。
 * @returns [0, 1) 随机数发生器。
 */
function mulberry32(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

describe("race-lottery-sim", () => {
    it("同名词条只保留最后一个，并剔除权重为 0 的词条", () => {
        const pool = buildInsideBuffPool(2)
        const names = pool.map(buff => buff.name)
        expect(new Set(names).size).toBe(names.length)
        expect(pool.every(buff => buff.randomWeight > 0)).toBe(true)
        // day2 的「躺平」应覆盖 day1 的同名词条
        const lieDown = pool.find(buff => buff.name === "躺平")
        expect(lieDown?.insideBuffId).toBe(2002)
        // 冲刺权重为 0，不应进入抽取池
        expect(pool.some(buff => buff.insideBuffId === 3002)).toBe(false)
    })

    it("冲刺前每 5 秒重抽词条", () => {
        expect(RACE_BUFF_MARKS).toEqual(
            Array.from({ length: Math.max(0, Math.ceil(RACE_SPRINT_TIME / 5) - 1) }, (_, index) => (index + 1) * 5)
        )

        let drawCount = 0
        simulateRace([{ playerId: 1, speed: 0.5 }], 1, () => {
            drawCount += 1
            return 0
        })
        expect(drawCount).toBe(RACE_BUFF_MARKS.length + 1)
    })

    it("匀速选手在超时前按初始速度前进，冲刺后加速完赛", () => {
        const constantBuff = raceLotteryData.insideBuffs.find(buff => buff.insideBuffId === 1001)!
        const sprintBuff = raceLotteryData.insideBuffs.find(buff => buff.insideBuffId === 3002)!
        const random = () => 0 // 始终抽到权重池第一个（匀速）
        const pool = buildInsideBuffPool(1)
        expect(pool[0]?.insideBuffId).toBe(constantBuff.insideBuffId)

        const speed = 0.5
        const result = simulateRace([{ playerId: 1, speed }], 1, random)
        // RaceTimeOutTime 前以基础速度跑，冲刺后按冲刺倍率完赛。
        expect(result[0].finishTime).toBeCloseTo(
            RACE_SPRINT_TIME + (RACE_TRACK_LENGTH - speed * RACE_SPRINT_TIME) / (speed * sprintBuff.effect),
            5
        )
        expect(result[0].rank).toBe(1)
    })

    it("完赛时间分布概率和质量为 1，且包含匀速冲刺点", () => {
        const sprintBuff = raceLotteryData.insideBuffs.find(buff => buff.insideBuffId === 3002)!
        const pool = buildInsideBuffPool(1)
        const totalWeight = pool.reduce((sum, buff) => sum + buff.randomWeight, 0)
        const weighted = pool.map(buff => ({ effect: buff.effect, probability: buff.randomWeight / totalWeight }))
        const speed = 0.5
        const masses = buildFinishTimeDistribution(speed, weighted, sprintBuff.effect)
        const sum = masses.reduce((total, item) => total + item.probability, 0)
        expect(sum).toBeCloseTo(1, 10)

        const uniformFinish = RACE_SPRINT_TIME + (RACE_TRACK_LENGTH - speed * RACE_SPRINT_TIME) / (speed * sprintBuff.effect)
        const hit = masses.find(item => Math.abs(item.time - uniformFinish) < 1e-6)
        expect(hit).toBeTruthy()
        expect(hit!.probability).toBeGreaterThan(0)
    })

    it("Poisson binomial：独立同分布时退化为二项分布", () => {
        // Binomial(n=3, p=0.5), P(X <= 1) = 0.5
        expect(poissonBinomialCdfAtMost([0.5, 0.5, 0.5], 1)).toBeCloseTo(0.5, 10)
        // 全 0 → P(X<=0)=1
        expect(poissonBinomialCdfAtMost([0, 0, 0], 0)).toBeCloseTo(1, 10)
        // 全 1 → P(X<=0)=0, P(X<=2)=0, P(X<=3) 但 maxK=2 时为 0
        expect(poissonBinomialCdfAtMost([1, 1, 1], 2)).toBeCloseTo(0, 10)
    })

    it("精确胜率总和约为 topN", () => {
        const players = raceLotteryData.players.slice(0, 8).map((player, index) => ({
            playerId: player.playerId,
            speed: 1 + index * 0.05,
        }))
        const rates = estimateTopNRates(players, 1, 6)
        const sum = rates.reduce((total, item) => total + item.rate, 0)
        expect(sum).toBeCloseTo(6, 6)
        expect(rates.every(item => item.rate >= 0 && item.rate <= 1)).toBe(true)
    })

    it("速度显著更高的选手胜率更高，且接近 1", () => {
        const players = [
            { playerId: 1, speed: 3 },
            { playerId: 2, speed: 1 },
            { playerId: 3, speed: 1 },
            { playerId: 4, speed: 1 },
            { playerId: 5, speed: 1 },
            { playerId: 6, speed: 1 },
            { playerId: 7, speed: 1 },
            { playerId: 8, speed: 1 },
        ]
        const rates = estimateTopNRates(players, 1, 6)
        const fast = rates.find(item => item.playerId === 1)!
        const slow = rates.find(item => item.playerId === 2)!
        expect(fast.rate).toBeGreaterThan(slow.rate)
        expect(fast.rate).toBeGreaterThan(0.9)
    })

    it("精确解与大量蒙特卡洛在误差内一致", () => {
        const players = raceLotteryData.players.slice(0, 6).map((player, index) => ({
            playerId: player.playerId,
            speed: 1.2 + index * 0.15,
        }))
        const exact = estimateTopNRates(players, 1, 3)
        const random = mulberry32(99)
        const wins = new Map(players.map(player => [player.playerId, 0]))
        const iterations = 8000
        for (let i = 0; i < iterations; i++) {
            const results = simulateRace(players, 1, random)
            for (const result of results) {
                if (result.rank <= 3) wins.set(result.playerId, (wins.get(result.playerId) || 0) + 1)
            }
        }
        for (const item of exact) {
            const mc = (wins.get(item.playerId) || 0) / iterations
            expect(Math.abs(mc - item.rate)).toBeLessThan(0.03)
        }
    })
})
