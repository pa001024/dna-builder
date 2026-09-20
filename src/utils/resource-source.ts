import { dungeonMap, ironSurvivalDungeonData, monsterLevelDropData, resourceMap, rewardMap } from "@/data"
import { charMap, draftMap, modMap } from "@/data/d"
import { eventData } from "@/data/d/event.data"
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
    d?: 1
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

export interface PackSourceInfo {
    key: string
    resourceId: number
    resourceName: string
    resourceIcon: string
    resourceRarity: number
    rewardId: number
    pp?: number
    times?: number
}

export type ModPackSourceInfo = PackSourceInfo

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
 * 收集深境探险/扼守（铁血/灾厄）副本的补充奖励组 ID。
 *
 * 这类副本除 dungeon.r/sr（波次奖励）外，实际产出还分布在两份独立表里：
 * - ironSurvivalDungeonData.IronRoundsReward(View)：等级档位奖励（元素晶块、深境罗盘等）；
 * - monsterLevelDropData.RewardId：强敌/首领掉落（灾厄武器原型等）。
 *
 * 反查资源来源时需要把这两张表的奖励组也纳入扫描，否则像
 * 深境探险 91604 掉落的「无止无休的原型」(15002) 这类道具在资源详情页会查不到副本来源。
 * @param dungeonId 副本 ID
 * @returns 补充奖励组 ID 列表（已去重）
 */
function collectIronSurvivalDungeonRewardIds(dungeonId: number): number[] {
    const detail = ironSurvivalDungeonData[dungeonId]
    if (!detail) {
        return []
    }

    const rewardIds = new Set<number>()
    for (const rewardId of Object.values(detail.IronRoundsRewardView ?? detail.IronRoundsReward ?? {})) {
        if (rewardId > 0) {
            rewardIds.add(rewardId)
        }
    }

    for (const dropId of detail.MonsterLevelDrop ?? []) {
        const drop = monsterLevelDropData[dropId]
        if (!drop) {
            continue
        }
        for (const rewardId of drop.RewardId ?? []) {
            if (rewardId > 0) {
                rewardIds.add(rewardId)
            }
        }
    }

    return [...rewardIds]
}

/**
 * 扫描奖励表，反查资源对应的副本来源。
 *
 * 除常规 dungeon.r/sr 波次奖励外，也会扫描深境探险/扼守副本的
 * 等级档位奖励表与强敌掉落表（见 collectIronSurvivalDungeonRewardIds）。
 * @param resource 资源数据
 * @returns 副本来源列表
 */
export function collectResourceDungeonSources(resource: Resource): ResourceDungeonSourceInfo[] {
    const sources: ResourceDungeonSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    dungeonMap.forEach(dungeon => {
        const ironRewardIds = collectIronSurvivalDungeonRewardIds(dungeon.id)
        const ironRewardIdSet = new Set(ironRewardIds)
        const rewardIds = [...new Set([...(dungeon.r || []), ...(dungeon.sr || []), ...ironRewardIds])]
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

            // 深境探险/扼守的补充奖励是“达到等级档位/击杀强敌”的条件掉落，
            // 奖励组本身不含可换算的掉落概率，因此不展示 pp/times。
            const isIronSurvivalReward = ironRewardIdSet.has(rewardId)
            sourceKeySet.add(key)
            sources.push({
                key,
                dungeonId: dungeon.id,
                dungeonName: dungeon.n,
                dungeonType: dungeon.t,
                dungeonLv: dungeon.lv,
                rewardId,
                pp: isIronSurvivalReward ? undefined : matched.pp,
                times: isIronSurvivalReward ? undefined : matched.times,
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
                d: matched.d,
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
 * 扫描资源道具箱奖励表，反查魔之楔对应的来源。
 * @param modId 魔之楔ID
 * @returns 道具箱来源列表
 */
export function collectModPackSources(modId: number): PackSourceInfo[] {
    const sources: PackSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    for (const resource of Array.from(resourceMap.values())) {
        if (resource.pack === undefined) {
            continue
        }

        const reward = getRewardDetails(resource.pack)
        if (!reward) {
            continue
        }

        const matched = findInRewardTree(reward, modId, "Mod")
        if (!matched) {
            continue
        }

        const key = `resource-pack-${resource.id}-${resource.pack}-${modId}`
        if (sourceKeySet.has(key)) {
            continue
        }

        sourceKeySet.add(key)
        sources.push({
            key,
            resourceId: resource.id,
            resourceName: resource.name,
            resourceIcon: resource.icon,
            resourceRarity: resource.rarity,
            rewardId: resource.pack,
            pp: matched.pp,
            times: matched.times,
        })
    }

    return sources
}

/**
 * 反查资源对应的道具箱来源。
 * @param resource 资源数据
 * @returns 道具箱来源列表
 */
export function collectResourcePackSources(resource: Resource): PackSourceInfo[] {
    const sources: PackSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    for (const packResource of resourceMap.values()) {
        if (packResource.pack === undefined) {
            continue
        }

        const reward = getRewardDetails(packResource.pack)
        const matched = findInRewardTree(reward, resource.id, "Resource")
        if (!matched) {
            continue
        }

        const key = `resource-pack-${packResource.id}-${packResource.pack}-${resource.id}`
        if (sourceKeySet.has(key)) {
            continue
        }

        sourceKeySet.add(key)
        sources.push({
            key,
            resourceId: packResource.id,
            resourceName: packResource.name,
            resourceIcon: packResource.icon,
            resourceRarity: packResource.rarity,
            rewardId: packResource.pack,
            pp: matched.pp,
            times: matched.times,
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

/** 活动奖励来源信息 */
export interface ResourceEventSourceInfo {
    key: string
    eventId: number
    eventName: string
    startTime: number
    endTime: number | null
    /** 奖励来源类型：拍照任务 / 签到 / 在线时长 / 礼盒 / 活动代币 / 累充档位 */
    kind: "photo-task" | "sign-in" | "online-time" | "box-drop" | "box-coin" | "top-up"
    /** 序号（拍照任务第几个 / 签到第几天，从 1 开始；top-up 时为积分档位） */
    index: number
    /** 在线时长档位的分钟数（仅 online-time） */
    target?: number
    rewardId: number
    pp?: number
    times?: number
    num?: number
}

/**
 * 扫描活动表，反查资源对应的活动奖励来源（拍照任务 / 签到 / 在线时长 / 礼盒 / 活动代币 / 累充档位）。
 * @param resource 资源数据
 * @returns 活动来源列表
 */
export function collectResourceEventSources(resource: Resource): ResourceEventSourceInfo[] {
    const sources: ResourceEventSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    /**
     * 解析单个奖励 id，命中目标资源时记录来源。
     * @param event 所属活动
     * @param rewardId 奖励 id
     * @param kind 来源类型
     * @param index 序号
     * @param target 在线时长分钟数
     */
    const pushIfMatched = (
        event: (typeof eventData)[number],
        rewardId: number,
        kind: ResourceEventSourceInfo["kind"],
        index: number,
        target?: number
    ) => {
        const matched = findInRewardTree(getRewardDetails(rewardId), resource.id, "Resource")
        if (!matched) {
            return
        }

        const key = `event-${event.id}-${kind}-${index}-${resource.id}`
        if (sourceKeySet.has(key)) {
            return
        }

        sourceKeySet.add(key)
        sources.push({
            key,
            eventId: event.id,
            eventName: event.name,
            startTime: event.startTime,
            endTime: event.endTime,
            kind,
            index,
            target,
            rewardId,
            pp: matched.pp,
            times: matched.times,
            num: matched.num,
        })
    }

    /**
     * 直接记录一条来源（不经过奖励树匹配，如活动代币本身）。
     * @param event 所属活动
     * @param kind 来源类型
     */
    const pushDirect = (event: (typeof eventData)[number], kind: ResourceEventSourceInfo["kind"]) => {
        const key = `event-${event.id}-${kind}-${resource.id}`
        if (sourceKeySet.has(key)) {
            return
        }

        sourceKeySet.add(key)
        sources.push({
            key,
            eventId: event.id,
            eventName: event.name,
            startTime: event.startTime,
            endTime: event.endTime,
            kind,
            index: 0,
            rewardId: resource.id,
        })
    }

    for (const event of eventData) {
        event.photoTasks?.forEach((task, index) => {
            pushIfMatched(event, task.reward, "photo-task", index + 1)
        })
        event.signIn?.rewards.slice(0, event.signIn.duration).forEach((rewardId, index) => {
            pushIfMatched(event, rewardId, "sign-in", index + 1)
        })
        event.onlineTime?.forEach(entry => {
            pushIfMatched(event, entry.reward, "online-time", entry.target, entry.target)
        })
        event.boxDrop?.rewardId.forEach((rewardId, index) => {
            pushIfMatched(event, rewardId, "box-drop", index + 1)
        })
        if (event.boxDrop && event.boxDrop.boxCoinId === resource.id) {
            pushDirect(event, "box-coin")
        }
        Object.entries(event.topUpDetail?.scoreRankReward ?? {}).forEach(([score, rewardId]) => {
            pushIfMatched(event, rewardId, "top-up", Number(score))
        })
    }

    return sources
}

/**
 * 反查深境罗盘对应的副本奖励来源。
 * @param ticketId 深境罗盘 ID
 * @returns 副本来源列表
 */
export function collectIronTicketDungeonSources(ticketId: number): ResourceDungeonSourceInfo[] {
    const sources: ResourceDungeonSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    dungeonMap.forEach(dungeon => {
        const rewardIds = [...(dungeon.r || []), ...(dungeon.sr || [])]
        for (const rewardId of rewardIds) {
            const matched = findInRewardTree(getRewardDetails(rewardId), ticketId, "IronTicket")
            if (!matched) {
                continue
            }

            const key = `dungeon-${dungeon.id}-${rewardId}-${ticketId}`
            if (sourceKeySet.has(key)) {
                continue
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
        }
    })

    return sources
}

/**
 * 反查深境罗盘对应的梦魇残声奖励来源。
 * @param ticketId 深境罗盘 ID
 * @returns 梦魇残声来源列表
 */
export function collectIronTicketHardbossSources(ticketId: number): WeaponHardbossSourceInfo[] {
    const sources: WeaponHardbossSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    hardBossMap.forEach(boss => {
        const bossDetail = getHardBossDetail(boss.id)
        if (!bossDetail) {
            return
        }

        bossDetail.diff.forEach(diff => {
            diff.dr.forEach(dr => {
                const matched = findInRewardTree(getRewardDetails(dr.RewardView), ticketId, "IronTicket")
                if (!matched) {
                    return
                }

                const key = `hardboss-${boss.id}-${diff.id}-${dr.DynamicRewardId}-${dr.Index}-${ticketId}`
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
                    hardbossId: boss.id,
                })
            })
        })
    })

    return sources
}

/**
 * 反查深境罗盘对应的任务链奖励来源。
 * @param ticketId 深境罗盘 ID
 * @returns 任务链来源列表
 */
export function collectIronTicketQuestSources(ticketId: number): ResourceQuestSourceInfo[] {
    const sources: ResourceQuestSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    questChainData.forEach(questChain => {
        const rewardIds = [...(questChain.reward || []), ...Object.values(questChain.questReward || {})]
        rewardIds.forEach(rewardId => {
            const matched = findInRewardTree(getRewardDetails(rewardId), ticketId, "IronTicket")
            if (!matched) {
                return
            }

            const key = `quest-${questChain.id}-${rewardId}-${ticketId}`
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
                d: matched.d,
                timeStart: questChain.startTime,
                timeEnd: questChain.endTime,
            })
        })
    })

    return sources
}

/**
 * 反查深境罗盘对应的商店来源。
 * @param ticketId 深境罗盘 ID
 * @returns 商店来源列表
 */
export function collectIronTicketShopSources(ticketId: number): ShopSourceInfo[] {
    const sources: ShopSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    shopData.forEach(shop => {
        shop.mainTabs.forEach(mainTab => {
            mainTab.subTabs.forEach(subTab => {
                subTab.items.forEach(item => {
                    const draft = item.itemType === "Draft" ? draftMap.get(item.typeId) : undefined
                    if (draft?.t !== "IronTicket" || draft.p !== ticketId) {
                        return
                    }

                    const key = `shop-${shop.id}-${mainTab.id}-${subTab.id}-${item.id}-${ticketId}`
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
