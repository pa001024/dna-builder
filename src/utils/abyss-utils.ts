import type { AbyssDungeon } from "@/data/d/abyss.data"
import { defaultImmortalSeasonId, type ImmortalMonsterLevelRule, immortalMonsterLevelRules } from "@/data/d/abyss.data"
import { AbyssMonsterLevelLimit } from "@/data/d/const.data"
import { getRewardDetails, type RewardItem } from "./reward-utils"

interface RewardBucket {
    reward: RewardItem
    count: number
}

/**
 * 获取不朽剧目使用的真实等级表。
 * @param abyssSeasonId 赛季ID，对应 AbyssSeason.AbyssSeasonId
 * @returns 当前赛季的真实等级表
 */
function getImmortalMonsterLevelRule(abyssSeasonId?: number): ImmortalMonsterLevelRule {
    if (abyssSeasonId && immortalMonsterLevelRules[abyssSeasonId]) {
        return immortalMonsterLevelRules[abyssSeasonId]
    }

    return immortalMonsterLevelRules[defaultImmortalSeasonId]
}

/**
 * 按幕数计算总星数。
 * @param actCount 幕数
 * @returns 总星数
 */
export function getAbyssStarCountByActCount(actCount: number): number {
    return Math.max(1, Math.trunc(actCount)) * 5
}

/**
 * 根据不朽剧目的幕数计算怪物等级。
 * 逻辑对齐 BP_AbyssComponent_C:GetAbyssDifficulty：
 * 先按赛季取真实的 AbyssLevel 序列，再按完整轮次叠加 LevelAddOn。
 * @param actCount 幕数
 * @param abyssSeasonId 赛季ID，对应 AbyssSeason.AbyssSeasonId
 * @returns 怪物等级
 */
export function getImmortalMonsterLevelByActCount(actCount: number, abyssSeasonId?: number): number {
    const rule = getImmortalMonsterLevelRule(abyssSeasonId)
    const abyssLevelIndex = Math.max(1, Math.trunc(actCount))
    const sequenceLength = rule.initLevels.length
    const loopTime = Math.trunc((abyssLevelIndex - 1) / sequenceLength)
    const realIndex = (abyssLevelIndex - 1) % sequenceLength
    const baseLevel = rule.initLevels[realIndex]

    return Math.min(baseLevel + rule.levelAddOn * loopTime, AbyssMonsterLevelLimit)
}

/**
 * 获取下一个累计奖励星数阈值。
 * 规则为 10 / 10 / 10 / 5 / 5 / 5 / 5 / 5 / 2 ...
 * @param starLevel 当前阈值
 * @returns 下一个阈值
 */
export function getNextAbyssRewardStarLevel(starLevel: number): number {
    if (starLevel < 30) {
        return starLevel + 10
    }

    if (starLevel < 60) {
        return starLevel + 5
    }

    return starLevel + 2
}

/**
 * 计算某个奖励档位在当前星数内的命中次数。
 * @param currentStarCount 当前总星数
 * @param currentLevel 奖励档位星数
 * @param nextLevel 下一个奖励档位星数
 * @returns 命中次数
 */
function getAbyssRewardRowCount(currentStarCount: number, currentLevel: number, nextLevel: number | null): number {
    const maxStar = Math.max(0, Math.trunc(currentStarCount))
    const start = Math.max(1, Math.trunc(currentLevel))
    if (maxStar < start) {
        return 0
    }

    const end = nextLevel ? Math.min(maxStar, Math.trunc(nextLevel) - 1) : maxStar
    if (end < start) {
        return 0
    }

    const interval = start < 30 ? 10 : start < 60 ? 5 : 2
    return Math.floor((end - start) / interval) + 1
}

/**
 * 计算当前幕数下命中的累计奖励行。
 * @param dungeon 深渊地牢
 * @param actCount 幕数
 * @returns 累计奖励行
 */
export function getAbyssCumulativeRewardRows(
    dungeon: AbyssDungeon,
    actCount: number
): Array<{ lv: number; r: number; a?: number; w?: 1; count: number }> {
    const abyssRewardRows = [...(dungeon.arl || [])].sort((a, b) => a.lv - b.lv)
    if (!abyssRewardRows.length) {
        return []
    }

    const currentStarCount = getAbyssStarCountByActCount(actCount)
    return abyssRewardRows
        .map((rewardRow, index) => {
            const nextLevel = abyssRewardRows[index + 1]?.lv ?? null
            return {
                lv: rewardRow.lv,
                r: rewardRow.r,
                a: rewardRow.a,
                w: rewardRow.w,
                count: getAbyssRewardRowCount(currentStarCount, rewardRow.lv, nextLevel),
            }
        })
        .filter(row => row.count > 0)
}

/**
 * 计算当前幕数下的累计奖励叶子项。
 * @param dungeon 深渊地牢
 * @param actCount 幕数
 * @returns 累计奖励叶子项
 */
export function getAbyssCumulativeRewardItems(dungeon: AbyssDungeon, actCount: number): RewardItem[] {
    const rewardRows = getAbyssCumulativeRewardRows(dungeon, actCount)
    if (!rewardRows.length) {
        return []
    }

    const rewardBuckets = new Map<string, RewardBucket>()

    for (const row of rewardRows) {
        collectRewardBuckets(getRewardDetails(row.r), row.count, rewardBuckets)
        if (row.a) {
            collectRewardBuckets(getRewardDetails(row.a), row.count, rewardBuckets)
        }
    }

    return Array.from(rewardBuckets.values())
        .map(bucket => ({
            ...bucket.reward,
            c: bucket.count,
        }))
        .sort((a, b) => (b.c || 0) - (a.c || 0))
}

/**
 * 递归收集奖励树中的叶子奖励数量。
 * @param reward 奖励树节点
 * @param multiplier 数量倍率
 * @param buckets 聚合容器
 */
function collectRewardBuckets(reward: RewardItem | null, multiplier: number, buckets: Map<string, RewardBucket>): void {
    if (!reward) {
        return
    }

    const nextMultiplier = multiplier * (reward.c ?? 1)
    if (reward.child?.length) {
        reward.child.forEach(child => collectRewardBuckets(child, nextMultiplier, buckets))
        return
    }

    if (reward.t === "Reward" || reward.t === "Drop") {
        return
    }

    const key = `${reward.t}-${reward.id}-${reward.d ? "draft" : "normal"}-${reward.n || ""}`
    const existed = buckets.get(key)
    if (existed) {
        existed.count += nextMultiplier
        return
    }

    buckets.set(key, {
        reward: {
            ...reward,
            c: nextMultiplier,
        },
        count: nextMultiplier,
    })
}
