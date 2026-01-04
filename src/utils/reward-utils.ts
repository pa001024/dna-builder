import { rewardMap } from "../data"
/**
 * 奖励项类型定义，包含掉落模式
 */
export interface RewardItem {
    id: number
    t: string
    c?: number
    d?: 1 // 是否是图纸
    p: number
    m?: string
    n?: string
    child?: RewardItem[]
}

/**
 * 掉落模式类型
 */
export type DropMode = "Fixed" | "Gender" | "Independent" | "Level" | "Once" | "Sequence" | "Weight"

/**
 * 递归获取奖励详情
 * @param rewardId 奖励ID
 * @param visited 已访问的奖励ID，防止循环引用
 * @param parentProbability 父奖励的概率，用于计算子奖励的实际概率
 * @returns 奖励详情根节点，包含所有子奖励和掉落模式
 */
export function getRewardDetails(rewardId: number, visited: Set<number> = new Set(), parentProbability: number = 1): RewardItem | null {
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
            // 递归获取子奖励
            const childReward = getRewardDetails(item.id, visited, (item.p ?? 1) * parentProbability)
            if (childReward) {
                // 判断子奖励的掉落模式是否与父奖励相同
                if (childReward.m === currentDropMode) {
                    // 如果掉落模式相同，合并子奖励的子元素到当前列表
                    if (childReward.child) {
                        // 将子奖励的子元素的概率乘以子奖励的概率
                        const mergedChild = childReward.child.map((child) => ({
                            ...child,
                            p: child.p * childReward.p,
                        }))
                        childRewards.push(...mergedChild)
                    }
                } else {
                    // 如果掉落模式不同，嵌套显示
                    childRewards.push(childReward)
                }
            }
        } else {
            // 普通奖励项，概率乘以父概率
            const rewardItem: RewardItem = {
                id: item.id,
                t: item.t,
                c: item.c,
                p: (item.p ?? 0) * parentProbability,
                m: currentDropMode,
                n: item.n,
            }
            if (item.d) rewardItem.d = item.d
            childRewards.push(rewardItem)
        }
    }

    // 检查是否需要归一化权重
    const isFlatList = childRewards.every((item) => !item.child || item.child.length === 0)
    if (isFlatList) {
        // 计算总权重
        const totalWeight = childRewards.reduce((sum, item) => sum + item.p, 0)
        // 归一化权重，确保总和为1
        if (totalWeight > 0) {
            const normalizedChildRewards = childRewards.map((item) => ({
                ...item,
                p: item.p / totalWeight,
            }))
            return {
                id: rewardId,
                t: "Reward",
                p: parentProbability,
                m: currentDropMode,
                child: normalizedChildRewards,
            }
        }
    }

    // 返回根奖励节点
    return {
        id: rewardId,
        t: "Reward",
        p: parentProbability,
        m: currentDropMode,
        child: childRewards,
    }
}
