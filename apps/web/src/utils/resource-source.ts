import { dungeonMap, ironSurvivalDungeonData, monsterLevelDropData, resourceMap, rewardMap } from "@/data"
import { charMap, draftMap, hardBossMap, modMap, walnutMap } from "@/data/d"
import { backpackPuzzleLevels } from "@/data/d/backpackpuzzle.data"
import { eventData } from "@/data/d/event.data"
import { getHardBossDetail } from "@/data/d/hardboss.data"
import { limitedPrizeItems, limitedPrizePools } from "@/data/d/limitedprize.data"
import { questChainData } from "@/data/d/questchain.data"
import type { Resource } from "@/data/d/resource.data"
import shopData from "@/data/d/shop.data"
import { weaponVerifyData } from "@/data/d/weapon-verify.data"
import type { Mod } from "@/data/data-types"
import { findInRewardTree, getRewardDetails } from "@/utils/reward-utils"
import { WalnutSequenceSimulator } from "@/utils/walnut-utils"
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

export function collectModShopSources(mod: Mod): ShopSourceInfo[] {
    const sources: ShopSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    shopData.forEach(shop => {
        shop.mainTabs.forEach(mainTab => {
            mainTab.subTabs.forEach(subTab => {
                subTab.items.forEach(item => {
                    const matched =
                        (item.itemType === "Mod" && item.typeId === mod.id) ||
                        (item.itemType === "Walnut" &&
                            walnutMap.get(item.typeId)?.奖励?.some(reward => reward.type === "Mod" && reward.id === mod.id))

                    if (!matched) {
                        return
                    }

                    const key = `shop-${shop.id}-${mainTab.id}-${subTab.id}-${item.id}-${mod.id}`
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

export interface ModWalnutSourceInfo {
    key: string
    walnutId: number
    rewardIndex: number
    /** 组别 i18n 键（walnut-source.tier_*）：金 / 大银 / 小银 / 铜 */
    tierKey: string
    /** 是否图纸奖励（d=1） */
    isDraft: boolean
    /** 该档位单次产出数量 */
    count: number
    /** 单件期望开函次数（长期平均口径，不可产出时为 Infinity） */
    expectedOpens: number
}

/**
 * 按奖励索引取组别 i18n 键：0=金，1=大银，2=小银，3+=铜。
 * @param rewardIndex 奖励在密函奖励数组中的索引
 * @returns 组别 i18n 键
 */
function getWalnutTierKey(rewardIndex: number): string {
    if (rewardIndex === 0) return "walnut-source.tier_gold"
    if (rewardIndex === 1) return "walnut-source.tier_big_silver"
    if (rewardIndex === 2) return "walnut-source.tier_small_silver"
    return "walnut-source.tier_copper"
}

/**
 * 扫描全部密函奖励表，反查产出指定魔之楔的奖励条目。
 * 同一只密函的成品（首位奖励）与图纸（d=1）是两条来源，组别与期望各算各的。
 * @param modId 魔之楔ID
 * @returns 密函来源列表
 */
export function collectModWalnutSources(modId: number): ModWalnutSourceInfo[] {
    const sources: ModWalnutSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    for (const walnut of walnutMap.values()) {
        walnut.奖励?.forEach((reward, rewardIndex) => {
            if (reward.type !== "Mod" || reward.id !== modId) {
                return
            }

            const key = `mod-walnut-${modId}-${walnut.id}-${rewardIndex}`
            if (sourceKeySet.has(key)) {
                return
            }

            sourceKeySet.add(key)
            sources.push({
                key,
                walnutId: walnut.id,
                rewardIndex,
                tierKey: getWalnutTierKey(rewardIndex),
                isDraft: reward.d === 1,
                count: reward.count,
                expectedOpens: WalnutSequenceSimulator.expectedOpensForRewardIndex(walnut.参数, rewardIndex, reward.count),
            })
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
    /** 奖励来源类型：拍照任务 / 签到 / 在线时长 / 礼盒 / 活动代币 / 累充档位 / 永恒梦魇 / 背包解谜 / 且试锋芒星数 / 奖池抽取 / 奖池集齐 */
    kind:
        | "photo-task"
        | "sign-in"
        | "online-time"
        | "box-drop"
        | "box-coin"
        | "top-up"
        | "hardboss"
        | "puzzle"
        | "verify"
        | "prize"
        | "prize-extra"
    /** 序号（拍照任务第几个 / 签到第几天，从 1 开始；top-up 时为积分档位；hardboss 时为 Boss id；puzzle 时为关卡 id；verify 时为所需总星数；prize / prize-extra 时为奖品档位，从 1 开始） */
    index: number
    /** 在线时长档位的分钟数（仅 online-time） */
    target?: number
    /** 展示用名称（仅 hardboss / puzzle）：Boss 短名 / 关卡名，渲染时经 $t 翻译 */
    title?: string
    /** 模式（仅 hardboss）：eternal 永恒 / challenge 高难 */
    mode?: "eternal" | "challenge"
    /** 是否首次通关奖励（仅 hardboss） */
    first?: boolean
    /** 奖池 id（仅 prize / prize-extra） */
    poolId?: number
    rewardId: number
    pp?: number
    times?: number
    num?: number
}

/**
 * 扫描活动表，反查资源对应的活动奖励来源（拍照任务 / 签到 / 在线时长 / 礼盒 / 活动代币 / 累充档位 / 永恒梦魇 / 背包解谜 / 且试锋芒星数 / 奖池抽取 / 奖池集齐）。
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
     * @param extra 附加展示字段与去重后缀（hardboss 的模式/首次标记、puzzle 的关卡名等）
     */
    const pushIfMatched = (
        event: (typeof eventData)[number],
        rewardId: number,
        kind: ResourceEventSourceInfo["kind"],
        index: number,
        target?: number,
        extra?: Pick<ResourceEventSourceInfo, "title" | "mode" | "first" | "poolId"> & { keySuffix?: string }
    ) => {
        const matched = findInRewardTree(getRewardDetails(rewardId), resource.id, "Resource")
        if (!matched) {
            return
        }

        const { keySuffix, ...rest } = extra ?? {}
        const key = `event-${event.id}-${kind}-${keySuffix ?? index}-${resource.id}`
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
            ...rest,
            rewardId,
            pp: matched.pp,
            times: matched.times,
            num: matched.num,
        })
    }

    /**
     * 直接记录一条来源（不经过奖励树匹配，如活动代币本身、奖池直给道具）。
     * @param event 所属活动
     * @param kind 来源类型
     * @param extra 序号 / 数量 / 奖池 id 与去重后缀
     */
    const pushDirect = (
        event: (typeof eventData)[number],
        kind: ResourceEventSourceInfo["kind"],
        extra?: Pick<ResourceEventSourceInfo, "index" | "num" | "poolId"> & { keySuffix?: string }
    ) => {
        const key = `event-${event.id}-${kind}-${extra?.keySuffix ?? extra?.index ?? 0}-${resource.id}`
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
            index: extra?.index ?? 0,
            num: extra?.num,
            poolId: extra?.poolId,
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
        event.hardBossEvent?.bosses.forEach(boss => {
            boss.modes.forEach(mode => {
                pushIfMatched(event, mode.reward, "hardboss", boss.id, undefined, {
                    title: boss.name,
                    mode: mode.mode,
                    first: false,
                    keySuffix: `${boss.id}-${mode.mode}-reward`,
                })
                pushIfMatched(event, mode.firstReward, "hardboss", boss.id, undefined, {
                    title: boss.name,
                    mode: mode.mode,
                    first: true,
                    keySuffix: `${boss.id}-${mode.mode}-first`,
                })
            })
        })
        backpackPuzzleLevels
            .filter(level => level.eventId === event.id)
            .forEach(level => {
                level.targetReward?.forEach(rewardId => {
                    pushIfMatched(event, rewardId, "puzzle", level.id, undefined, {
                        title: level.name,
                        keySuffix: `${level.id}`,
                    })
                })
            })
        if (weaponVerifyData.event.id === event.id) {
            weaponVerifyData.rewards.forEach(stage => {
                pushIfMatched(event, stage.rewardId, "verify", stage.requiredStar, undefined, {
                    keySuffix: `${stage.requiredStar}`,
                })
            })
        }
        const prizePool = limitedPrizePools[event.id]
        if (prizePool) {
            prizePool.LimitedPrizePoolId.forEach(poolId => {
                const pool = limitedPrizeItems[poolId]
                if (!pool) {
                    return
                }
                pool.Type.forEach((typeIndex, tierIndex) => {
                    if (typeIndex !== 6 || !(pool.Id[tierIndex] ?? []).includes(resource.id)) {
                        return
                    }
                    pushDirect(event, "prize", {
                        index: tierIndex + 1,
                        poolId,
                        num: pool.Count[tierIndex] ?? 1,
                        keySuffix: `${poolId}-${tierIndex + 1}`,
                    })
                })
            })
            Object.entries(prizePool.ExtraItem ?? {}).forEach(([tier, extra]) => {
                const [typeIndex, itemId, count] = extra
                if (typeIndex !== 6 || itemId !== resource.id) {
                    return
                }
                pushDirect(event, "prize-extra", {
                    index: Number(tier),
                    poolId: prizePool.LimitedPrizePoolId[0],
                    num: count,
                    keySuffix: `extra-${tier}`,
                })
            })
        }
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
