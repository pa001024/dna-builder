import { type Dungeon, rewardMap } from "../data"

/**
 * 奖励项类型定义，包含掉落模式
 */
export interface RewardItem {
    id: number
    t: string
    c?: number
    d?: 1 // 是否是设计稿
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
 * 自选奖励组的原始结构。
 */
export interface OptRewardItem {
    id: number
    child: RewardItem[]
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
export function getRewardDetails(
    rewardId: number,
    visited: Set<number> = new Set(),
    parentProbability: number = 1,
    isRoot: boolean = true
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
                childReward.c = item.c
                if (item.n) {
                    childReward.n = item.n
                }
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
                if (currentDropMode === "Sequence") item.totalP = childTotalP
                if (childTotalP <= 0) {
                    const fallbackPP = currentDropMode === "Fixed" ? parentPP : 0
                    item.child.forEach(child => {
                        child.pp = fallbackPP
                        calculatePP(child, fallbackPP)
                    })
                    return
                }
                item.child.forEach(child => {
                    child.pp = parentPP * (child.p / childTotalP)
                    calculatePP(child, child.pp!)
                })
            } else {
                item.times = parentPP > 0 ? 1 / parentPP : undefined
            }
        }
        if (result.child) {
            if (totalP <= 0) {
                const fallbackPP = currentDropMode === "Fixed" ? 1 : 0
                result.child.forEach(child => {
                    child.pp = fallbackPP
                    calculatePP(child, fallbackPP)
                })
                return result
            }

            result.child.forEach(child => {
                child.pp = child.p / totalP
                calculatePP(child, child.pp!)
            })
        }
    }

    return result
}

/**
 * 递归查找奖励树中当前Mod的掉落信息
 */
export function findInRewardTree(
    reward: RewardItem | null,
    id: number,
    type = "Mod"
): { pp?: number; times?: number; num?: number; d?: 1; n?: string } | null {
    if (!reward) return null

    const isMatchedItem = (item: RewardItem): boolean => {
        if (type === "Draft") {
            return item.t === "Mod" && item.id === id && item.d === 1
        }

        return item.t === type && item.id === id
    }

    if (reward.child) {
        for (const child of reward.child) {
            if (isMatchedItem(child)) {
                return { pp: child.pp, times: child.times, num: child.c ?? 1, d: child.d, n: child.n }
            } else {
                const result = findInRewardTree(child, id, type)
                if (result) return result
            }
        }
    }

    return null
}

/**
 * 获取Mod在特定副本中的掉落概率信息
 */
export function getModDropInfo(dungeon: Dungeon, modId: number): { pp?: number; times?: number } {
    // 合并所有奖励组ID，确保r和sr都是数组
    const allRewardIds = [...(dungeon.r || []), ...(dungeon.sr || [])]

    // 遍历所有奖励组，查找当前Mod
    for (const rewardId of allRewardIds) {
        const rewardDetails = getRewardDetails(rewardId)
        const modDropInfo = findInRewardTree(rewardDetails, modId, "Mod")
        if (modDropInfo) {
            return modDropInfo
        }
    }

    return {}
}

/**
 * 获取道具箱在特定副本中的掉落概率信息
 * 道具箱在奖励树中以 Resource 类型出现（如 110064 契约者魔之楔·风）。
 * @param dungeon 副本数据
 * @param packId 道具箱资源 ID
 * @returns 掉落概率信息
 */
export function getPackDropInfo(dungeon: Dungeon, packId: number): { pp?: number; times?: number } {
    // 合并所有奖励组ID，确保r和sr都是数组
    const allRewardIds = [...(dungeon.r || []), ...(dungeon.sr || [])]

    // 遍历所有奖励组，查找当前道具箱
    for (const rewardId of allRewardIds) {
        const rewardDetails = getRewardDetails(rewardId)
        const packDropInfo = findInRewardTree(rewardDetails, packId, "Resource")
        if (packDropInfo) {
            return packDropInfo
        }
    }

    return {}
}

/**
 * 获取Draft在特定副本中的掉落概率信息
 */
export function getDraftDropInfo(dungeon: Dungeon, draftId: number): { pp?: number; times?: number } {
    // 合并所有奖励组ID，确保r和sr都是数组
    const allRewardIds = [...(dungeon.r || []), ...(dungeon.sr || [])]

    // 遍历所有奖励组，查找当前Draft
    for (const rewardId of allRewardIds) {
        const rewardDetails = getRewardDetails(rewardId)
        const draftDropInfo = findInRewardTree(rewardDetails, draftId, "Draft")
        if (draftDropInfo) {
            return draftDropInfo
        }
    }

    return {}
}
