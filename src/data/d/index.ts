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

import { isDataPackHydrated, registerDataPackHydrationCallback } from "../data-pack-bridge"
import { skinData } from "./accessory.data"
import modData from "./mod.data"
import monsterData, { monsterMap } from "./monster.data"
import rewardData from "./reward.data"
import weaponData from "./weapon.data"

export { hairData, headFrameData } from "./accessory.data"

export const charMap = new Map<number | string, Char>()

export { cutoffData, monsterData, monsterMap }

export const cutoffMap = new Map<number, (typeof cutoffData)[number]>()

export const modMap = new Map<number, Mod>()

export const buffMap = new Map<string, Buff>()

export const effectMap = new Map<string, Buff>()

export const weaponMap = new Map<number, Weapon>()
export const weaponNameMap = new Map<string, Weapon>()
export const skinMap = new Map<number, (typeof skinData)[number]>()

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

/**
 * 递归查找奖励树中的所有Mod类型的奖励
 */
function findModRewards(child: RewardChild[], modIds: Set<number>, draftIds: Set<number>, visited: Set<number> = new Set()): void {
    if (!child || child.length === 0) return

    for (const item of child) {
        if (item.t === "Reward") {
            // 防止循环引用
            if (visited.has(item.id)) continue
            visited.add(item.id)

            const reward = rewardMap.get(item.id)
            if (reward?.child) {
                // 递归查找子奖励
                findModRewards(reward.child, modIds, draftIds, visited)
            }
        } else if (item.t === "Mod") {
            // 找到Mod类型的奖励
            if (item.d) {
                draftIds.add(item.id)
            } else {
                modIds.add(item.id)
            }
        }
    }
}

import petData, { type Pet } from "./pet.data"
export const petMap = new Map<number, Pet>()

export type { DBMap, DBMapMarker } from "./map.data"

export { type Walnut, type WalnutReward, walnutMap, walnutRewardMap } from "./walnut.data"

import { type Fish, type FishingSpot, fishingSpots, fishs } from "./fish.data"
export const fishMap = new Map<number, Fish>()

export const fishingSpotMap = new Map<number, FishingSpot>()

export const fish2SpotMap = new Map<number, { spotId: number; weight: number }[]>()

export { AbyssMonsterLevelLimit, MonsterLevelUpperLimit } from "./const.data"
export { type Resource, resourceData, resourceMap } from "./resource.data"
export type { Fish, FishingSpot }

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

    weaponMap.clear()
    weaponNameMap.clear()
    for (const weapon of weaponData) {
        weaponMap.set(weapon.id, weapon as Weapon)
        weaponNameMap.set(weapon.名称, weapon as Weapon)
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
    for (const dungeon of dungeonData) {
        dungeonMap.set(dungeon.id, dungeon as Dungeon)
        const rewardIds = [...(dungeon.r || []), ...(dungeon.sr || [])]
        if (rewardIds.length === 0) continue
        for (const rewardId of rewardIds) {
            const reward = rewardMap.get(rewardId)
            if (!reward?.child) continue
            const modIds = new Set<number>()
            const draftIds = new Set<number>()
            findModRewards(reward.child, modIds, draftIds)
            for (const modId of modIds) {
                if (!modDungeonMap.has(modId)) {
                    modDungeonMap.set(modId, [])
                }
                modDungeonMap.get(modId)!.push(dungeon as Dungeon)
            }
            for (const draftId of draftIds) {
                if (!draftDungeonMap.has(draftId)) {
                    draftDungeonMap.set(draftId, [])
                }
                draftDungeonMap.get(draftId)!.push(dungeon as Dungeon)
            }
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
}

rebuildStaticIndexes()
if (!isDataPackHydrated()) {
    registerDataPackHydrationCallback(rebuildStaticIndexes)
}
