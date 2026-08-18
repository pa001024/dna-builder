import { rewardMap } from "@/data"
import type { Reward, RewardChild } from "@/data/data-types"

/** 深境探险每波怪物等级递增步长 */
export const IRON_SURVIVAL_LEVEL_STEP = 5
/** 深境探险每波奖励发放的批次数量 */
export const IRON_SURVIVAL_REWARD_BATCH_COUNT = 1

/** 深境探险轮次奖励行：怪物等级达到 threshold 后，每波可获取 rewardId 奖励组 */
export interface IronSurvivalRewardRow {
    threshold: number
    rewardId: number
}

/** 累计奖励桶：按奖励子项聚合的期望数量 */
export interface CumulativeRewardBucket {
    key: string
    t: string
    id: number
    n: string
    d?: 1
    amount: number
}

/**
 * 归档单个奖励子项到累计桶。
 * @param buckets 累计容器
 * @param rewardChild 奖励子项
 * @param amount 该奖励子项应累计的数量
 */
export function pushRewardBucket(buckets: Map<string, CumulativeRewardBucket>, rewardChild: RewardChild, amount: number): void {
    if (amount <= 0) {
        return
    }

    const key = `${rewardChild.t}-${rewardChild.id}-${rewardChild.d ? "draft" : "normal"}-${rewardChild.n || ""}`
    const existed = buckets.get(key)
    if (existed) {
        existed.amount += amount
        return
    }

    buckets.set(key, {
        key,
        t: rewardChild.t,
        id: rewardChild.id,
        n: rewardChild.n || `${rewardChild.t} ${rewardChild.id}`,
        d: rewardChild.d,
        amount,
    })
}

/**
 * 计算单个奖励子项的实际概率。
 * @param reward 父奖励组
 * @param rewardChild 奖励子项
 * @param totalP 父奖励组的总权重
 * @returns 实际概率，取值为 0~1
 */
export function getRewardChildProbability(reward: Reward, rewardChild: RewardChild, totalP: number): number {
    if (reward.m === "Fixed") {
        return 1
    }

    if (reward.m === "Independent") {
        return (rewardChild.p || 0) / 10000
    }

    if (totalP <= 0) {
        return 0
    }

    return (rewardChild.p || 0) / totalP
}

/**
 * 将奖励树按实际概率转换为累计期望桶。
 * @param rewardId 奖励组ID
 * @param buckets 累计容器
 * @param multiplier 当前累计倍率
 * @param visiting 当前递归路径上的奖励组ID，防止循环引用
 */
export function collectRewardExpectationBucketsFromReward(
    rewardId: number,
    buckets: Map<string, CumulativeRewardBucket>,
    multiplier = 1,
    visiting: Set<number> = new Set()
): void {
    if (visiting.has(rewardId)) {
        return
    }

    const reward = rewardMap.get(rewardId)
    if (!reward?.child?.length) {
        return
    }

    const nextVisiting = new Set(visiting)
    nextVisiting.add(rewardId)

    const totalP = reward.child.reduce((sum, child) => sum + (child.p || 0), 0)

    reward.child.forEach(rewardChild => {
        const probability = getRewardChildProbability(reward, rewardChild, totalP)
        if (probability <= 0) {
            return
        }

        const nextMultiplier = multiplier * probability * rewardChild.c
        if (rewardChild.t === "Reward") {
            collectRewardExpectationBucketsFromReward(rewardChild.id, buckets, nextMultiplier, nextVisiting)
            return
        }

        pushRewardBucket(buckets, rewardChild, nextMultiplier)
    })
}

const ironTicketExpectationCache = new Map<number, number>()

/**
 * 计算单个奖励组展开后罗盘（IronTicket）的总掉落期望。
 * @param rewardId 奖励组ID
 * @returns 罗盘掉落期望数量
 */
export function getIronTicketExpectation(rewardId: number): number {
    const cached = ironTicketExpectationCache.get(rewardId)
    if (cached !== undefined) {
        return cached
    }

    const buckets = new Map<string, CumulativeRewardBucket>()
    collectRewardExpectationBucketsFromReward(rewardId, buckets)
    const expectation = Array.from(buckets.values()).reduce((sum, bucket) => sum + (bucket.t === "IronTicket" ? bucket.amount : 0), 0)
    ironTicketExpectationCache.set(rewardId, expectation)
    return expectation
}

/**
 * 清空罗盘期望缓存，测试中保证隔离。
 */
export function resetIronTicketExpectationCache(): void {
    ironTicketExpectationCache.clear()
}

/**
 * 计算复利累计奖励期望：起始档投入 1 趟，波次等级逐档递增（每档一波），
 * 每一趟打到 L 档时，都会以 t_L 的期望掉落 L+step 档罗盘（罗盘可再投入 L+step 档开新趟），
 * 且该趟本身也会继续推进到 L+step 档，逐档复投直到结束等级（不含）。
 * 第 L 档被打次数 P_L 满足 P_{startLevel} = 1、P_{L+step} = P_L + P_L × t_L = P_L × (1 + t_L)
 * （t_L 为该档打一次的罗盘掉落期望），即各档趟数按 (1 + t) 连乘：
 *   复利(m, n) = Σ_{w ∈ [m, n)} Chain(w, n)，Chain(w, n) = 掉落(w) × (1 + 概率(w)) × Chain(w+step, n)
 * @param rows 轮次奖励行
 * @param startLevel 起始等级（含）
 * @param endLevel 结束等级（不含，[startLevel, endLevel) 半开区间）
 * @param step 每档等级递增步长
 * @param batchCount 每次通关奖励发放批次
 * @returns 复利路径下各奖励子项的累计期望桶
 */
export function computeCompoundCumulativeBuckets(
    rows: IronSurvivalRewardRow[],
    startLevel: number,
    endLevel: number,
    step = IRON_SURVIVAL_LEVEL_STEP,
    batchCount = IRON_SURVIVAL_REWARD_BATCH_COUNT
): Map<string, CumulativeRewardBucket> {
    const buckets = new Map<string, CumulativeRewardBucket>()
    let playCount = 1

    for (let level = startLevel; level < endLevel; level += step) {
        const waveRows = rows.filter(row => row.threshold <= level)
        let waveTicket = 0
        for (const row of waveRows) {
            collectRewardExpectationBucketsFromReward(row.rewardId, buckets, playCount * batchCount)
            waveTicket += getIronTicketExpectation(row.rewardId)
        }

        playCount = playCount * (1 + waveTicket)
    }

    return buckets
}
