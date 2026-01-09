import { rewardMap } from "../data"
/**
 * 奖励项类型定义，包含掉落模式
 */
export interface RewardItem {
    id: number
    t: string
    c?: number
    d?: 1 // 是否是图纸
    dp?: 1 //是否是Drop类型
    p: number
    totalP?: number // 总和权重
    pp?: number // 总和概率
    times?: number // 期望次数
    m?: string
    n?: string
    child?: RewardItem[]
}

/**
 * 掉落模式类型
 */
export type DropMode = "Fixed" | "Gender" | "Independent" | "Level" | "Once" | "Sequence" | "Weight"

// 获取掉落模式文本
export function getDropModeText(mode: string): string {
    const modeMap: Record<string, string> = {
        Independent: "独立",
        Weight: "权重",
        Fixed: "固定",
        Gender: "性别",
        Level: "等级",
        Once: "一次",
        Sequence: "序列",
    }

    return modeMap[mode] || mode
}
/**
 * 递归获取奖励详情
 * @param rewardId 奖励ID
 * @param visited 已访问的奖励ID，防止循环引用
 * @param parentProbability 父奖励的概率，用于计算子奖励的实际概率
 * @returns 奖励详情根节点，包含所有子奖励和掉落模式
 */
export function getRewardDetails(
    rewardId: number,
    visited: Set<number> = new Set(),
    parentProbability: number = 1,
    isRoot: boolean = true,
): RewardItem | null {
    if (visited.has(rewardId)) {
        return null
    }
    visited.add(rewardId)

    const rewardGroup = rewardMap.get(rewardId)
    if (!rewardGroup) {
        return null
    }

    const currentDropMode = rewardGroup.m
    const childRewards: RewardItem[] = []

    for (const item of rewardGroup.child) {
        if (item.t === "Reward") {
            // 递归获取子奖励，Sequence模式下不缩放parentProbability
            const newParentProbability = item.p ?? 1
            const childReward = getRewardDetails(item.id, visited, newParentProbability, false)
            if (childReward) {
                childRewards.push(childReward)
            }
        } else {
            // 普通奖励项，概率乘以父概率
            const rewardItem: RewardItem = {
                id: item.id,
                t: item.t,
                c: item.c,
                p: item.p ?? 0,
                m: currentDropMode,
                n: item.n,
            }
            if (item.d) rewardItem.d = item.d
            if (item.dp) rewardItem.dp = item.dp
            childRewards.push(rewardItem)
        }
    }

    const result: RewardItem = {
        id: rewardId,
        t: "Reward",
        p: parentProbability,
        m: currentDropMode,
        child: childRewards,
    }

    if (isRoot) {
        const totalP = result.child?.reduce((sum, child) => sum + child.p, 0) || 0
        if (currentDropMode === "Sequence") result.totalP = totalP
        const calculatePP = (item: RewardItem, parentPP: number): void => {
            if (item.child && item.child.length > 0) {
                const childTotalP = item.child.reduce((sum, child) => sum + child.p, 0)
                item.child.forEach((child) => {
                    child.pp = parentPP * (child.p / childTotalP)
                    calculatePP(child, child.pp!)
                })
            } else {
                item.times = 1 / parentPP
            }
        }
        if (result.child) {
            result.child.forEach((child) => {
                child.pp = child.p / totalP
                calculatePP(child, child.pp!)
            })
        }
    }

    return result
}
