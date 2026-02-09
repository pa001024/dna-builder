import { type Dungeon, rewardMap } from "../data"

// 获取奖励类型文本
export function getRewardTypeText(type: string): string {
    const typeMap: Record<string, string> = {
        Char: "角色",
        CharAccessory: "角色饰品",
        Drop: "掉落物",
        HeadFrame: "头像框",
        HeadSculpture: "头像",
        Mod: "魔之楔",
        Mount: "载具",
        Draft: "图纸",
        Pet: "魔灵",
        Resource: "资源",
        Reward: "奖励组",
        Skin: "角色皮肤",
        Title: "称号",
        TitleFrame: "称号框",
        Walnut: "密函",
        Weapon: "武器",
        WeaponAccessory: "武器饰品",
        WeaponSkin: "武器皮肤",
    }

    return typeMap[type] || type
}

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
                item.child.forEach(child => {
                    child.pp = parentPP * (child.p / childTotalP)
                    calculatePP(child, child.pp!)
                })
            } else {
                item.times = 1 / parentPP
            }
        }
        if (result.child) {
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
export function findInRewardTree(reward: RewardItem | null, id: number, type = "Mod"): { pp?: number; times?: number } | null {
    if (!reward) return null

    if (reward.child) {
        for (const child of reward.child) {
            if (child.t === type && child.id === id) {
                return { pp: child.pp, times: child.times }
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
