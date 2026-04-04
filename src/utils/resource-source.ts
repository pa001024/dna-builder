import { dungeonMap, rewardMap } from "@/data"
import { charMap, modMap } from "@/data/d"
import { getHardBossDetail, hardBossMap } from "@/data/d/hardboss.data"
import { questChainData } from "@/data/d/questchain.data"
import type { Resource } from "@/data/d/resource.data"
import shopData from "@/data/d/shop.data"
import { walnutMap } from "@/data/d/walnut.data"
import { findInRewardTree, getRewardDetails } from "@/utils/reward-utils"
import type { ShopSourceInfo, WeaponHardbossSourceInfo } from "@/utils/weapon-source"

export interface ResourceDungeonSourceInfo {
    key: string
    dungeonId: number
    dungeonName: string
    dungeonType: string
    dungeonLv?: number
    rewardId: number
    pp?: number
    times?: number
}

export interface ResourceQuestSourceInfo {
    key: string
    questChainId: number
    questChainName: string
    chapterName: string
    episode: string
    rewardId: number
    num?: number
    timeStart?: number
    timeEnd?: number
}

export interface ModQuestSourceInfo {
    key: string
    questChainId: number
    questChainName: string
    chapterName: string
    episode: string
    rewardId: number
    num?: number
    timeStart?: number
    timeEnd?: number
}

interface ModSpecialSourceRule {
    sourceType: "charBreakthrough"
    sourceTypeLabel: string
    charId: number
    description: string
    num?: number
}

const modSpecialSourceRules = new Map<number, ModSpecialSourceRule[]>([
    [
        150401,
        [
            {
                sourceType: "charBreakthrough",
                sourceTypeLabel: "角色突破",
                charId: 1504,
                description: "20级突破奖励",
                num: 1,
            },
        ],
    ],
])

export interface ModCharBreakthroughSourceInfo {
    key: string
    sourceTypeLabel: string
    title: string
    link: string
    detail?: string
    charId: number
    charName?: string
    num?: number
}

/**
 * 扫描梦魇残声奖励表，反查资源对应的来源。
 * @param resource 资源数据
 * @returns 梦魇残声来源列表
 */
export function collectResourceHardbossSources(resource: Resource): WeaponHardbossSourceInfo[] {
    const sources: WeaponHardbossSourceInfo[] = []
    const sourceKeySet = new Set<string>()
    const matchedWalnutIds = [...walnutMap.values()]
        .filter(walnut => walnut.奖励?.some(reward => reward.type === "Resource" && reward.id === resource.id))
        .map(walnut => walnut.id)

    hardBossMap.forEach(boss => {
        const bossDetail = getHardBossDetail(boss.id)
        if (!bossDetail) {
            return
        }

        bossDetail.diff.forEach(diff => {
            diff.dr.forEach(dr => {
                const reward = getRewardDetails(dr.RewardView)
                const directMatched = findInRewardTree(reward, resource.id, "Resource")
                if (directMatched) {
                    const key = `resource-hardboss-${boss.id}-${diff.id}-${dr.DynamicRewardId}-${dr.Index}-resource-${resource.id}`
                    if (!sourceKeySet.has(key)) {
                        sourceKeySet.add(key)
                        sources.push({
                            key,
                            type: "hardboss",
                            timeStart: dr.StartTime,
                            timeEnd: dr.EndTime,
                            hardbossName: boss.name,
                            hardbossLv: diff.lv,
                            hardbossId: boss.id,
                        })
                    }
                }

                matchedWalnutIds.forEach(walnutId => {
                    if (!findInRewardTree(reward, walnutId, "Walnut")) {
                        return
                    }

                    const key = `resource-hardboss-${boss.id}-${diff.id}-${dr.DynamicRewardId}-${dr.Index}-walnut-${walnutId}`
                    if (sourceKeySet.has(key)) {
                        return
                    }

                    sourceKeySet.add(key)
                    sources.push({
                        key,
                        type: "hardboss",
                        timeStart: dr.StartTime,
                        timeEnd: dr.EndTime,
                        hardbossName: boss.name,
                        hardbossLv: diff.lv,
                        walnutId,
                        hardbossId: boss.id,
                    })
                })
            })
        })
    })

    return sources
}

/**
 * 扫描奖励表，反查资源对应的副本来源。
 * @param resource 资源数据
 * @returns 副本来源列表
 */
export function collectResourceDungeonSources(resource: Resource): ResourceDungeonSourceInfo[] {
    const sources: ResourceDungeonSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    dungeonMap.forEach(dungeon => {
        const rewardIds = [...(dungeon.r || []), ...(dungeon.sr || [])]
        rewardIds.forEach(rewardId => {
            const reward = rewardMap.get(rewardId)
            if (!reward) {
                return
            }

            const rewardDetails = getRewardDetails(rewardId)
            const matched = findInRewardTree(rewardDetails, resource.id, "Resource")
            if (!matched) {
                return
            }

            const key = `dungeon-${dungeon.id}-${rewardId}-${resource.id}`
            if (sourceKeySet.has(key)) {
                return
            }

            sourceKeySet.add(key)
            sources.push({
                key,
                dungeonId: dungeon.id,
                dungeonName: dungeon.n,
                dungeonType: dungeon.t,
                dungeonLv: dungeon.lv,
                rewardId,
                pp: matched.pp,
                times: matched.times,
            })
        })
    })

    return sources
}

/**
 * 扫描任务链奖励表，反查资源对应的任务来源。
 * @param resource 资源数据
 * @returns 任务来源列表
 */
export function collectResourceQuestSources(resource: Resource): ResourceQuestSourceInfo[] {
    const sources: ResourceQuestSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    questChainData.forEach(questChain => {
        const rewardIds = [...(questChain.reward || []), ...Object.values(questChain.questReward || {})]
        rewardIds.forEach(rewardId => {
            const rewardDetails = getRewardDetails(rewardId)
            const matched = findInRewardTree(rewardDetails, resource.id, "Resource")
            if (!matched) {
                return
            }

            const key = `quest-${questChain.id}-${rewardId}-${resource.id}`
            if (sourceKeySet.has(key)) {
                return
            }

            sourceKeySet.add(key)
            sources.push({
                key,
                questChainId: questChain.id,
                questChainName: questChain.name,
                chapterName: questChain.chapterName,
                episode: questChain.episode,
                rewardId,
                num: matched.num,
                timeStart: questChain.startTime,
                timeEnd: questChain.endTime,
            })
        })
    })

    return sources
}

/**
 * 扫描任务链奖励表，反查魔之楔对应的任务来源。
 * @param mod 魔之楔数据
 * @returns 任务来源列表
 */
export function collectModQuestSources(modId: number): ModQuestSourceInfo[] {
    const sources: ModQuestSourceInfo[] = []
    const sourceKeySet = new Set<string>()
    const mod = modMap.get(modId)
    if (!mod) {
        return sources
    }

    questChainData.forEach(questChain => {
        const rewardIds = [...(questChain.reward || []), ...Object.values(questChain.questReward || {})]
        rewardIds.forEach(rewardId => {
            const rewardDetails = getRewardDetails(rewardId)
            const matched = findInRewardTree(rewardDetails, mod.id, "Mod")
            if (!matched) {
                return
            }

            const key = `mod-quest-${questChain.id}-${rewardId}-${mod.id}`
            if (sourceKeySet.has(key)) {
                return
            }

            sourceKeySet.add(key)
            sources.push({
                key,
                questChainId: questChain.id,
                questChainName: questChain.name,
                chapterName: questChain.chapterName,
                episode: questChain.episode,
                rewardId,
                num: matched.num,
                timeStart: questChain.startTime,
                timeEnd: questChain.endTime,
            })
        })
    })

    return sources
}

/**
 * 扫描特殊规则，反查魔之楔对应的角色突破来源。
 * @param modId 魔之楔ID
 * @returns 角色突破来源列表
 */
export function collectModCharBreakthroughSources(modId: number): ModCharBreakthroughSourceInfo[] {
    const sources: ModCharBreakthroughSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    for (const specialRule of modSpecialSourceRules.get(modId) || []) {
        const char = charMap.get(specialRule.charId)
        const key = `mod-special-${modId}-${specialRule.sourceType}-${specialRule.charId}`
        if (sourceKeySet.has(key)) {
            continue
        }

        sourceKeySet.add(key)
        sources.push({
            key,
            sourceTypeLabel: specialRule.sourceTypeLabel,
            title: char?.名称 || String(specialRule.charId),
            link: `/db/char/${specialRule.charId}`,
            detail: specialRule.description,
            charId: specialRule.charId,
            charName: char?.名称,
            num: specialRule.num,
        })
    }

    return sources
}

/**
 * 扫描商店表，反查资源对应的商店来源。
 * @param resource 资源数据
 * @returns 商店来源列表
 */
export function collectResourceShopSources(resource: Resource): ShopSourceInfo[] {
    const sources: ShopSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    shopData.forEach(shop => {
        shop.mainTabs.forEach(mainTab => {
            mainTab.subTabs.forEach(subTab => {
                subTab.items.forEach(item => {
                    const matched =
                        (item.itemType === "Resource" && item.typeId === resource.id) ||
                        (item.itemType === "Walnut" &&
                            walnutMap.get(item.typeId)?.奖励?.some(reward => reward.type === "Resource" && reward.id === resource.id))

                    if (!matched) {
                        return
                    }

                    const key = `shop-${shop.id}-${mainTab.id}-${subTab.id}-${item.id}-${resource.id}`
                    if (sourceKeySet.has(key)) {
                        return
                    }

                    sourceKeySet.add(key)
                    sources.push({
                        key,
                        itemId: item.id,
                        shopId: shop.id,
                        subTabId: subTab.id,
                        detail: `${mainTab.name} -> ${subTab.name}`,
                        shopName: shop.name,
                        price: item.price,
                        priceName: item.priceName,
                        num: item.num,
                        limit: item.limit,
                        timeStart: item.startTime,
                        timeEnd: item.endTime,
                    })
                })
            })
        })
    })

    return sources
}
