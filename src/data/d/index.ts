import type { Buff, Char, Draft, Dungeon, Mod, OptReward, Reward, RewardChild, Weapon } from "../data-types"
import { type AbyssBuff, type AbyssDungeon, abyssBuffs, abyssDungeons } from "./abyss.data"
import buffData from "./buff.data"
import charData from "./char.data"
import cutoffData from "./cutoff.data"
import draftData from "./draft.data"
import dungeonData from "./dungeon.data"
import effectData from "./effect.data"
import optRewardData from "./optreward.data"

export { eventData } from "./event.data"
export { weaponVerifyData } from "./weapon-verify.data"

import { isDataPackHydrated, registerDataPackHydrationCallback } from "../data-pack-bridge"
import { skinData } from "./accessory.data"
import dynQuestData, { type DynQuest } from "./dynquest.data"
import { type HardBoss, hardBossData } from "./hardboss.data"
import headSculptureData, { type HeadSculpture } from "./headsculpture.data"
import iconticketData, { type IconTicket } from "./iconticket.data"
import modData from "./mod.data"
import monsterData, { type Monster } from "./monster.data"
import npcData, { type NPC } from "./npc.data"
import partyTopicData, { type PartyTopic } from "./partytopic.data"
import questData, { type QuestStory } from "./quest.data"
import { type QuestChain, questChainData } from "./questchain.data"
import regionData, { type Region } from "./region.data"
import resourceData, { type Resource } from "./resource.data"
import rewardData from "./reward.data"
import shopData from "./shop.data"
import subRegionData, { type SubRegion } from "./subregion.data"
import walnutData, { type Walnut } from "./walnut.data"
import weaponData from "./weapon.data"

export { hairData, headFrameData } from "./accessory.data"

export const charMap = new Map<number | string, Char>()

export { cutoffData, monsterData }

export const cutoffMap = new Map<number, (typeof cutoffData)[number]>()

export const modMap = new Map<number, Mod>()

export const buffMap = new Map<string, Buff>()

export const effectMap = new Map<string, Buff>()

/** MOD 特效按 MOD id 精确索引（金色/紫色分别配置特效条目） */
export const modEffectMap = new Map<number, Buff>()

/** 武器特效按武器 id 精确索引 */
export const weaponEffectMap = new Map<number, Buff>()

export const weaponMap = new Map<number, Weapon>()
export const weaponNameMap = new Map<string, Weapon>()
export const skinMap = new Map<number, (typeof skinData)[number]>()

/** 任务链 id → 任务链（派生索引，随水合在 rebuildStaticIndexes 里从 questChainData 重建） */
export const questChainMap = new Map<number, QuestChain>()

export const rewardMap = new Map<number, Reward>()

export const optRewardMap = new Map<number, OptReward>()

export const modDraftMap = new Map<number, Draft>()
export const weaponDraftMap = new Map<number, Draft>()
export const draftMap = new Map<number, Draft>()
export const resourceDraftMap = new Map<number, Draft>()

export const abyssBuffMap = new Map<number, AbyssBuff>()
export const abyssDungeonMap = new Map<number, AbyssDungeon>()

export const dungeonMap = new Map<number, Dungeon>()
export const modDungeonMap = new Map<number, Dungeon[]>()
export const draftDungeonMap = new Map<number, Dungeon[]>()

/** 道具箱资源：带 pack 字段的 Resource（打开后产出 Mod/设计稿等） */
export const packResourceMap = new Map<number, Resource>()
/** 道具箱掉落副本：packId -> 掉落该道具箱的副本列表 */
export const packDungeonMap = new Map<number, Dungeon[]>()
/**
 * Mod 的道具箱来源：modId -> 包含该 Mod（或其图纸 d=1）的道具箱列表。
 * count 为单个道具箱产出的数量，isDraft 标记该条目是否为设计稿。
 */
export const modPackMap = new Map<number, { packId: number; packName: string; count: number; isDraft: boolean }[]>()

/**
 * 递归查找奖励树中的所有Mod类型的奖励
 */
function findModRewards(
    child: RewardChild[],
    modIds: Set<number>,
    draftIds: Set<number>,
    packIds: Set<number>,
    visited: Set<number> = new Set()
): void {
    if (!child || child.length === 0) return

    for (const item of child) {
        if (item.t === "Reward") {
            // 防止循环引用
            if (visited.has(item.id)) continue
            visited.add(item.id)

            const reward = rewardMap.get(item.id)
            if (reward?.child) {
                // 递归查找子奖励
                findModRewards(reward.child, modIds, draftIds, packIds, visited)
            }
        } else if (item.t === "Mod") {
            // 找到Mod类型的奖励
            if (item.d) {
                draftIds.add(item.id)
            } else {
                modIds.add(item.id)
            }
        } else if (item.t === "Resource" && packResourceMap.has(item.id)) {
            // 找到道具箱类型的奖励（如 契约者魔之楔·风）
            packIds.add(item.id)
        }
    }
}

import petData, { type Pet } from "./pet.data"
export const petMap = new Map<number, Pet>()

export type { DBMap, DBMapMarker } from "./map.data"

export type { Walnut, WalnutReward } from "./walnut.data"

import { type Fish, type FishingSpot, fishingSpots, fishs } from "./fish.data"
export const fishMap = new Map<number, Fish>()

export const fishingSpotMap = new Map<number, FishingSpot>()

export const fish2SpotMap = new Map<number, { spotId: number; weight: number }[]>()

export { AbyssMonsterLevelLimit, MonsterLevelUpperLimit } from "./const.data"
export { type Resource, resourceData } from "./resource.data"
export type { Fish, FishingSpot }

export const npcMap = new Map<number, NPC>()
export const iconticketMap = new Map<number, IconTicket>()
export const headSculptureMap = new Map<number, HeadSculpture>()
export const partyTopicMap = new Map<number, PartyTopic>()
export const questMap = new Map<number, QuestStory>()
export const subRegionMap = new Map<number, SubRegion>()
export const regionMap = new Map<number, Region>()
export const dynQuestMap = new Map<number, DynQuest>()
export const hardBossMap = new Map<number, HardBoss>()
export const monsterMap = new Map<number, Monster>()
export const resourceMap = new Map<number | string, Resource>()
export const walnutMap = new Map<number, Walnut>()
export const walnutRewardMap = new Map<number, Walnut>()
export const modShopSourceMap = new Map<number, { shop: string; cost: string; n: number; t: "Walnut" | "Mod" }>()
export const weaponShopSourceMap = new Map<number, { shop: string; cost: string; n: number; t: "Walnut" | "Mod" }>()
export const draftShopSourceMap = new Map<number, { shop: string; cost: string; n: number; t: "Walnut" | "Draft" }>()

/**
 * 重建静态索引。
 */
function rebuildStaticIndexes(): void {
    charMap.clear()
    for (const char of charData) {
        charMap.set(char.名称, char as Char)
        charMap.set(char.id, char as Char)
    }

    cutoffMap.clear()
    for (const cutoff of cutoffData) {
        cutoffMap.set(cutoff.itemId, cutoff)
    }

    modMap.clear()
    for (const mod of modData) {
        modMap.set(mod.id, mod as Mod)
    }

    buffMap.clear()
    for (const buff of buffData) {
        buffMap.set(buff.名称, buff as Buff)
    }

    effectMap.clear()
    for (const buff of effectData) {
        effectMap.set(buff.名称, buff as Buff)
    }

    modEffectMap.clear()
    for (const buff of effectData) {
        if (buff.id !== undefined && modMap.has(buff.id)) {
            modEffectMap.set(buff.id, buff as Buff)
        }
    }

    weaponMap.clear()
    weaponNameMap.clear()
    for (const weapon of weaponData) {
        weaponMap.set(weapon.id, weapon as Weapon)
        weaponNameMap.set(weapon.名称, weapon as Weapon)
    }

    questChainMap.clear()
    for (const questChain of questChainData) {
        questChainMap.set(questChain.id, questChain)
    }

    // 武器特效需在 weaponMap 建立后再按 id 索引
    weaponEffectMap.clear()
    for (const buff of effectData) {
        if (buff.id !== undefined && weaponMap.has(buff.id)) {
            weaponEffectMap.set(buff.id, buff as Buff)
        }
    }

    skinMap.clear()
    for (const skin of skinData) {
        skinMap.set(skin.id, skin)
    }

    rewardMap.clear()
    for (const reward of rewardData) {
        rewardMap.set(reward.id, reward)
    }

    optRewardMap.clear()
    for (const reward of optRewardData) {
        optRewardMap.set(reward.id, reward)
    }

    modDraftMap.clear()
    weaponDraftMap.clear()
    draftMap.clear()
    resourceDraftMap.clear()
    for (const draft of draftData) {
        if (draft.t === "Mod") modDraftMap.set(draft.p, draft)
        if (draft.t === "Weapon") weaponDraftMap.set(draft.p, draft)
        if (draft.t === "Resource") resourceDraftMap.set(draft.p, draft)
        draftMap.set(draft.id, draft)
    }

    abyssBuffMap.clear()
    for (const abyssBuff of abyssBuffs) {
        abyssBuffMap.set(abyssBuff.id, abyssBuff)
    }

    abyssDungeonMap.clear()
    for (const dungeon of abyssDungeons) {
        dungeon.buff = dungeon.b.map(id => abyssBuffMap.get(id)!)
        const cname = dungeon.cid ? charMap.get(dungeon.cid)?.名称 : undefined
        if (cname) dungeon.cname = cname
        abyssDungeonMap.set(dungeon.id, dungeon)
    }

    dungeonMap.clear()
    modDungeonMap.clear()
    draftDungeonMap.clear()
    packResourceMap.clear()
    packDungeonMap.clear()
    modPackMap.clear()
    // 道具箱索引：先登记所有带 pack 字段的资源，供奖励树扫描识别
    for (const resource of resourceData) {
        if (resource.pack !== undefined) {
            packResourceMap.set(resource.id, resource)
        }
    }
    for (const dungeon of dungeonData) {
        dungeonMap.set(dungeon.id, dungeon as Dungeon)
        const rewardIds = [...(dungeon.r || []), ...(dungeon.sr || [])]
        if (rewardIds.length === 0) continue
        for (const rewardId of rewardIds) {
            const reward = rewardMap.get(rewardId)
            if (!reward?.child) continue
            const modIds = new Set<number>()
            const draftIds = new Set<number>()
            const packIds = new Set<number>()
            findModRewards(reward.child, modIds, draftIds, packIds)
            for (const modId of modIds) {
                if (!modDungeonMap.has(modId)) {
                    modDungeonMap.set(modId, [])
                }
                const modDungeons = modDungeonMap.get(modId)!
                if (!modDungeons.some(existingDungeon => existingDungeon.id === dungeon.id)) {
                    modDungeons.push(dungeon as Dungeon)
                }
            }
            for (const draftId of draftIds) {
                if (!draftDungeonMap.has(draftId)) {
                    draftDungeonMap.set(draftId, [])
                }
                const draftDungeons = draftDungeonMap.get(draftId)!
                if (!draftDungeons.some(existingDungeon => existingDungeon.id === dungeon.id)) {
                    draftDungeons.push(dungeon as Dungeon)
                }
            }
            for (const packId of packIds) {
                if (!packDungeonMap.has(packId)) {
                    packDungeonMap.set(packId, [])
                }
                const packDungeons = packDungeonMap.get(packId)!
                if (!packDungeons.some(existingDungeon => existingDungeon.id === dungeon.id)) {
                    packDungeons.push(dungeon as Dungeon)
                }
            }
        }
    }
    // 反查 Mod（或图纸）的道具箱来源
    for (const [packId, packResource] of packResourceMap) {
        const reward = rewardMap.get(packResource.pack!)
        if (!reward?.child) continue
        for (const item of reward.child) {
            if (item.t !== "Mod") continue
            const isDraft = item.d === 1
            if (!modPackMap.has(item.id)) {
                modPackMap.set(item.id, [])
            }
            modPackMap.get(item.id)!.push({
                packId,
                packName: packResource.name,
                count: item.c || 1,
                isDraft,
            })
        }
    }

    petMap.clear()
    for (const pet of petData) {
        petMap.set(pet.id, pet)
    }

    fishMap.clear()
    fishingSpotMap.clear()
    fish2SpotMap.clear()
    for (const fish of fishs) {
        fishMap.set(fish.id, fish)
    }
    for (const spot of fishingSpots) {
        fishingSpotMap.set(spot.id, spot)
        spot.fishIds.forEach((id, index) => {
            if (!fish2SpotMap.has(id)) {
                fish2SpotMap.set(id, [])
            }
            fish2SpotMap.get(id)!.push({ spotId: spot.id, weight: spot.weights[index] })
        })
    }

    npcMap.clear()
    for (const npc of npcData) {
        npcMap.set(npc.id, npc)
    }

    iconticketMap.clear()
    for (const ticket of iconticketData) {
        iconticketMap.set(ticket.id, ticket)
    }

    headSculptureMap.clear()
    for (const headSculpture of headSculptureData) {
        headSculptureMap.set(headSculpture.id, headSculpture)
    }

    partyTopicMap.clear()
    for (const partyTopic of partyTopicData) {
        partyTopicMap.set(partyTopic.id, partyTopic)
    }

    questMap.clear()
    for (const questStory of questData) {
        questMap.set(questStory.id, questStory)
    }

    subRegionMap.clear()
    for (const subRegion of subRegionData) {
        subRegionMap.set(subRegion.id, subRegion)
    }

    regionMap.clear()
    for (const region of regionData) {
        regionMap.set(region.id, region)
    }

    dynQuestMap.clear()
    for (const dynQuest of dynQuestData) {
        dynQuestMap.set(dynQuest.id, dynQuest)
    }

    hardBossMap.clear()
    for (const hardBoss of hardBossData) {
        hardBossMap.set(hardBoss.id, hardBoss)
    }

    monsterMap.clear()
    for (const monster of monsterData) {
        monsterMap.set(monster.id, monster)
    }

    resourceMap.clear()
    for (const resource of resourceData) {
        resourceMap.set(resource.id, resource)
        resourceMap.set(resource.name, resource)
    }

    walnutMap.clear()
    walnutRewardMap.clear()
    for (const walnut of walnutData) {
        walnutMap.set(walnut.id, walnut)
        const reward = walnut.奖励[0]
        if (reward.type === "Mod" || reward.type === "Weapon") {
            walnutRewardMap.set(reward.id, walnut)
        }
    }

    // 商店来源索引依赖上面的 modMap 与 walnutMap，必须放在它们之后重建
    rebuildShopSourceIndexes()
}

/**
 * 重建商店来源索引。
 *
 * 遍历全部商店条目：密函类条目按密函首个奖励反查魔之楔/武器 id，
 * 直接售卖的魔之楔按 id 命中 modMap，设计稿按 id 单独入索引。
 */
function rebuildShopSourceIndexes(): void {
    modShopSourceMap.clear()
    weaponShopSourceMap.clear()
    draftShopSourceMap.clear()
    for (const shop of shopData) {
        for (const mainTab of shop.mainTabs) {
            for (const subTab of mainTab.subTabs) {
                for (const item of subTab.items) {
                    const shopName = `${mainTab.name} - ${subTab.name}`
                    if (item.itemType === "Walnut") {
                        const walnut = walnutMap.get(item.typeId)
                        if (walnut) {
                            const reward = walnut.奖励[0]
                            if (reward.type === "Mod") {
                                modShopSourceMap.set(reward.id, {
                                    shop: shopName,
                                    cost: item.priceName,
                                    n: item.price,
                                    t: "Walnut",
                                })
                            } else if (reward.type === "Weapon") {
                                weaponShopSourceMap.set(reward.id, {
                                    shop: shopName,
                                    cost: item.priceName,
                                    n: item.price,
                                    t: "Walnut",
                                })
                            }
                        } else if (modMap.has(item.typeId)) {
                            modShopSourceMap.set(item.typeId, {
                                shop: shopName,
                                cost: item.priceName,
                                n: item.price,
                                t: "Mod",
                            })
                        }
                    } else if (item.itemType === "Draft") {
                        draftShopSourceMap.set(item.typeId, {
                            shop: shopName,
                            cost: item.priceName,
                            n: item.price,
                            t: "Draft",
                        })
                    }
                }
            }
        }
    }
}

registerDataPackHydrationCallback(rebuildStaticIndexes)
if (!isDataPackHydrated()) {
    rebuildStaticIndexes()
}
