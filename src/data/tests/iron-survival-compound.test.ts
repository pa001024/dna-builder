import { beforeEach, describe, expect, it } from "vitest"
import type { CumulativeRewardBucket, IronSurvivalRewardRow } from "../../utils/iron-survival-reward-utils"
import {
    collectRewardExpectationBucketsFromReward,
    computeCompoundCumulativeBuckets,
    getIronTicketExpectation,
    IRON_SURVIVAL_LEVEL_STEP,
    resetIronTicketExpectationCache,
} from "../../utils/iron-survival-reward-utils"
import { dungeonMap, rewardMap } from "../d"
import { ironSurvivalDungeonData } from "../d/ironsurvival.data"
import type { RewardChild } from "../data-types"

/**
 * 蒙特卡洛验证：直接模拟「起始档投入 1 趟、波次等级逐档递增，每档掉落罗盘复投下一档」的随机过程，
 * 用多次试验的经验均值与复利公式期望做统计比对。
 *
 * 复利模型：第 L 档被打次数 P_L 满足 P_{startLevel} = 1、P_{L+step} = P_L × (1 + t_L)
 * （t_L 为该档打一次的罗盘期望），即每一趟打到 L 档后本身继续推进到 L+step，
 * 同时 L 档掉落的罗盘再开新趟，各档趟数按 (1 + t) 连乘；
 * 区间 [startLevel, endLevel) 半开，结束等级（尾端）不含，末尾档罗盘视为浪费。
 */

/** mulberry32 确定性伪随机数生成器，保证测试可复现 */
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

/** 单次奖励树采样的结果 */
interface RewardSample {
    drops: Map<string, number>
    tickets: number
}

function createEmptySample(): RewardSample {
    return { drops: new Map(), tickets: 0 }
}

/**
 * 按奖励组语义采样一次完整掉落（独立实现，不依赖期望公式）。
 * Fixed：全部子项必定掉落；Independent：每个子项按 p/10000 独立掉落；
 * 其余模式（Weight 等）：按权重恰好抽取一个子项。
 * 期望上与公式一致：P_i × c_i × E[嵌套奖励]。
 * @param rewardId 奖励组ID
 * @param rng 随机数发生器
 * @param visiting 当前递归路径上的奖励组ID，防止循环引用
 * @returns 采样得到的掉落与罗盘数
 */
function sampleRewardTree(rewardId: number, rng: () => number, visiting: Set<number> = new Set()): RewardSample {
    if (visiting.has(rewardId)) {
        return createEmptySample()
    }

    const reward = rewardMap.get(rewardId)
    if (!reward?.child?.length) {
        return createEmptySample()
    }

    const nextVisiting = new Set(visiting)
    nextVisiting.add(rewardId)
    const result = createEmptySample()

    /**
     * 把子项按次数并入采样结果。
     * @param child 奖励子项
     * @param count 掉落次数
     */
    const mergeChild = (child: RewardChild, count: number): void => {
        if (count <= 0) {
            return
        }

        if (child.t === "Reward") {
            for (let i = 0; i < count; i++) {
                const sub = sampleRewardTree(child.id, rng, nextVisiting)
                for (const [key, amount] of sub.drops) {
                    result.drops.set(key, (result.drops.get(key) || 0) + amount)
                }
                result.tickets += sub.tickets
            }
            return
        }

        const key = `${child.t}-${child.id}-${child.d ? "draft" : "normal"}-${child.n || ""}`
        result.drops.set(key, (result.drops.get(key) || 0) + count)
        if (child.t === "IronTicket") {
            result.tickets += count
        }
    }

    if (reward.m === "Fixed") {
        reward.child.forEach(child => mergeChild(child, child.c))
    } else if (reward.m === "Independent") {
        reward.child.forEach(child => {
            if (rng() < (child.p || 0) / 10000) {
                mergeChild(child, child.c)
            }
        })
    } else if (reward.child.some(child => (child.p || 0) > 0)) {
        const totalP = reward.child.reduce((sum, child) => sum + (child.p || 0), 0)
        let roll = rng() * totalP
        for (const child of reward.child) {
            roll -= child.p || 0
            if (roll < 0) {
                mergeChild(child, child.c)
                break
            }
        }
    }

    return result
}

/** 单次试验中允许的最大通关次数，防止奖励树异常导致模拟爆炸 */
const MAX_PLAYS_PER_TRIAL = 100000

/**
 * 模拟一次完整的复利随机过程：起始档投入 1 趟，此后每一趟打到 L 档都继续推进到 L+step，
 * 同时 L 档掉落罗盘再开新趟，直到结束等级（不含）为止。
 * @param rows 轮次奖励行
 * @param startLevel 起始等级（含）
 * @param endLevel 结束等级（不含）
 * @param rng 随机数发生器
 * @returns 总掉落与总通关次数
 */
function simulateCompoundTrial(
    rows: IronSurvivalRewardRow[],
    startLevel: number,
    endLevel: number,
    rng: () => number
): { totals: Map<string, number>; plays: number } {
    const playsByLevel = new Map<number, number>([[startLevel, 1]])
    const totals = new Map<string, number>()
    let plays = 0

    for (let level = startLevel; level < endLevel; level += IRON_SURVIVAL_LEVEL_STEP) {
        const playCount = playsByLevel.get(level) || 0
        plays += playCount
        if (plays > MAX_PLAYS_PER_TRIAL) {
            throw new Error(`模拟通关次数超过上限 ${MAX_PLAYS_PER_TRIAL}（level=${level}，playCount=${playCount}）`)
        }

        let tickets = 0
        for (let i = 0; i < playCount; i++) {
            for (const row of rows) {
                if (row.threshold > level) {
                    continue
                }
                const sample = sampleRewardTree(row.rewardId, rng)
                for (const [key, amount] of sample.drops) {
                    totals.set(key, (totals.get(key) || 0) + amount)
                }
                tickets += sample.tickets
            }
        }

        // 下一档 = 本档所有趟数继续推进 + 本档罗盘再投入开新趟；若下一档超出结束等级则罗盘浪费
        const nextLevel = level + IRON_SURVIVAL_LEVEL_STEP
        if (nextLevel < endLevel) {
            playsByLevel.set(nextLevel, playCount + tickets)
        }
    }

    return { totals, plays }
}

/** 蒙特卡洛统计结果 */
interface MonteCarloResult {
    means: Map<string, number>
    stdErrs: Map<string, number>
    trials: number
    totalPlays: number
}

/**
 * 执行多次试验并统计各奖励键的经验均值与标准误。
 * @param rows 轮次奖励行
 * @param startLevel 起始等级（含）
 * @param endLevel 结束等级（不含）
 * @param trials 试验次数
 * @param seed 随机种子
 * @returns 统计结果
 */
function runMonteCarlo(
    rows: IronSurvivalRewardRow[],
    startLevel: number,
    endLevel: number,
    trials: number,
    seed: number
): MonteCarloResult {
    const rng = mulberry32(seed)
    const sums = new Map<string, number>()
    const sumSquares = new Map<string, number>()
    let totalPlays = 0

    for (let trial = 0; trial < trials; trial++) {
        const { totals, plays } = simulateCompoundTrial(rows, startLevel, endLevel, rng)
        totalPlays += plays
        for (const [key, amount] of totals) {
            sums.set(key, (sums.get(key) || 0) + amount)
            sumSquares.set(key, (sumSquares.get(key) || 0) + amount * amount)
        }
    }

    const means = new Map<string, number>()
    const stdErrs = new Map<string, number>()
    for (const [key, sum] of sums) {
        const mean = sum / trials
        const meanSquare = (sumSquares.get(key) || 0) / trials
        const variance = Math.max(0, meanSquare - mean * mean)
        means.set(key, mean)
        stdErrs.set(key, Math.sqrt(variance / trials))
    }

    return { means, stdErrs, trials, totalPlays }
}

/**
 * 断言公式期望与蒙特卡洛经验均值在统计误差内一致。
 * 容差 = 4σ（约 99.99% 置信区间）+ 2% 相对误差下限，用于覆盖极稀有掉落未命中的情形。
 * @param expected 公式产出的期望桶
 * @param mc 蒙特卡洛统计结果
 * @param context 断言上下文描述
 */
function assertMatchesExpectation(expected: Map<string, CumulativeRewardBucket>, mc: MonteCarloResult, context: string): void {
    // 模拟不应产出公式外的奖励键；公式中权重极小的「尘埃桶」模拟可能永远不会命中，由逐键容差兜底
    for (const key of mc.means.keys()) {
        expect(expected.has(key), `${context}：模拟不应产出公式外的奖励键 ${key}`).toBe(true)
    }

    for (const [key, bucket] of expected) {
        const expectedAmount = bucket.amount
        const mean = mc.means.get(key) || 0
        const stdErr = mc.stdErrs.get(key) || 0
        const tolerance = 4 * stdErr + Math.max(0.02 * expectedAmount, 1e-6)
        const deviation = Math.abs(mean - expectedAmount)
        expect(
            deviation,
            `${context}：${key} 公式期望 ${expectedAmount.toFixed(4)} vs 模拟均值 ${mean.toFixed(4)}（4σ=${(4 * stdErr).toFixed(4)}）`
        ).toBeLessThanOrEqual(tolerance)
    }
}

/** 从副本数据构建轮次奖励行（与组件 rewardRows 逻辑一致） */
function getDungeonRows(dungeonId: number): IronSurvivalRewardRow[] {
    const detail = ironSurvivalDungeonData[dungeonId]
    const rewardTable = detail.IronRoundsRewardView || detail.IronRoundsReward || {}
    return Object.entries(rewardTable)
        .map(([threshold, rewardId]) => ({ threshold: Number(threshold), rewardId: Number(rewardId) }))
        .sort((a, b) => a.threshold - b.threshold)
}

describe("深境探险复利累计奖励（蒙特卡洛验证）", () => {
    const TRIALS = 4000
    const SEED = 20240601

    beforeEach(() => {
        resetIronTicketExpectationCache()
    })

    it("副本 91601 各等级区间下，模拟均值与复利公式期望在统计误差内一致", () => {
        const rows = getDungeonRows(91601)
        const baseLevel = dungeonMap.get(91601)?.lv || 1

        // [startLevel, endLevel) 半开区间；[100, 240) 覆盖 100~235，等效原有「Lv.235 及以下」
        for (const [startLevel, endLevel] of [
            [baseLevel, baseLevel + IRON_SURVIVAL_LEVEL_STEP],
            [baseLevel, 240],
            [120, 180],
            [180, 240],
            [200, 240],
            [235, 240],
        ] as const) {
            const expected = computeCompoundCumulativeBuckets(rows, startLevel, endLevel)
            const mc = runMonteCarlo(rows, startLevel, endLevel, TRIALS, SEED + startLevel * 10 + endLevel)
            assertMatchesExpectation(expected, mc, `91601 等级区间 [${startLevel}, ${endLevel})`)
        }
    }, 60000)

    it("副本 91701 满等级区间下，模拟均值与复利公式期望在统计误差内一致", () => {
        const rows = getDungeonRows(91701)
        const baseLevel = dungeonMap.get(91701)?.lv || 1
        const expected = computeCompoundCumulativeBuckets(rows, baseLevel, 240)
        const mc = runMonteCarlo(rows, baseLevel, 240, TRIALS, SEED)
        assertMatchesExpectation(expected, mc, `91701 等级区间 [${baseLevel}, 240)`)
    }, 60000)

    it("恒定罗盘期望场景：复利递推符合闭式解，且与蒙特卡洛一致", () => {
        // 单一行 303124（每打一次罗盘期望 0.02 = 190007×2 × 1%），区间 [100, 300) → 40 档，t 恒为 0.02
        const rows: IronSurvivalRewardRow[] = [{ threshold: 100, rewardId: 303124 }]
        const startLevel = 100
        const endLevel = 300
        const ticketPerPlay = getIronTicketExpectation(303124)
        const levelCount = (endLevel - startLevel) / IRON_SURVIVAL_LEVEL_STEP

        // 闭式解：P_k = (1 + t)^k，总通关数 ΣP = Σ_{i=0}^{M-1} (1 + t)^i = ((1 + t)^M - 1) / t
        const expectedTotalPlays = ((1 + ticketPerPlay) ** levelCount - 1) / ticketPerPlay

        const expected = computeCompoundCumulativeBuckets(rows, startLevel, endLevel)
        const ticketBucket = Array.from(expected.values()).find(bucket => bucket.t === "IronTicket")
        expect(ticketBucket, "应产出罗盘桶").toBeDefined()
        expect(ticketBucket!.amount, "罗盘期望").toBeCloseTo(ticketPerPlay * expectedTotalPlays, 9)

        const mc = runMonteCarlo(rows, startLevel, endLevel, TRIALS, SEED + 1)
        // 经验通关总数也应接近闭式解
        expect(Math.abs(mc.totalPlays / TRIALS - expectedTotalPlays)).toBeLessThanOrEqual(4 * Math.sqrt(expectedTotalPlays / TRIALS) + 0.01)
        assertMatchesExpectation(expected, mc, `恒定 t=${ticketPerPlay} 场景（[${startLevel}, ${endLevel})）`)
    })

    it("无罗盘掉落时，复利退化为每档各打一次的普通累计", () => {
        // 190000/190001 均无罗盘，T=0 → P 恒为 1，复利与普通累计一致
        const rows: IronSurvivalRewardRow[] = [
            { threshold: 100, rewardId: 190000 },
            { threshold: 120, rewardId: 190001 },
        ]
        const startLevel = 100
        const endLevel = 130

        const compound = computeCompoundCumulativeBuckets(rows, startLevel, endLevel)
        const plain = new Map<string, CumulativeRewardBucket>()
        for (let level = startLevel; level < endLevel; level += IRON_SURVIVAL_LEVEL_STEP) {
            for (const row of rows) {
                if (row.threshold <= level) {
                    collectRewardExpectationBucketsFromReward(row.rewardId, plain, 1)
                }
            }
        }

        expect(compound.size).toBe(plain.size)
        for (const [key, bucket] of plain) {
            expect(compound.get(key)?.amount).toBeCloseTo(bucket.amount, 9)
        }

        const mc = runMonteCarlo(rows, startLevel, endLevel, TRIALS, SEED + 2)
        assertMatchesExpectation(compound, mc, `无罗盘场景（[${startLevel}, ${endLevel})）`)
    })
})
