import type { Buff, Char, Draft, Dungeon, Mod, Reward, RewardChild, Weapon, WeaponBase } from "../data-types"
import { type AbyssBuff, type AbyssDungeon, abyssBuffs, abyssDungeons } from "./abyss.data"
import baseData from "./base.data"
import buffData from "./buff.data"
import charData from "./char.data"
import draftData from "./draft.data"
import dungeonData from "./dungeon.data"
import effectData from "./effect.data"
import modData from "./mod.data"
import monsterData, { monsterMap } from "./monster.data"
import rewardData from "./reward.data"
import weaponData from "./weapon.data"

// 将静态表转换为Map，提高查找效率
export const charMap = new Map<number | string, Char>()
charData.forEach(char => {
    charMap.set(char.名称, char as Char)
    charMap.set(char.id, char as Char)
})

export { monsterData, monsterMap }

// 将mod数据转换为Map
export const modMap = new Map<number, Mod>()
modData.forEach(mod => {
    modMap.set(mod.id, mod as Mod)
})

// 将buff数据转换为Map
export const buffMap = new Map<string, Buff>()
buffData.forEach(buff => {
    buffMap.set(buff.名称, buff as Buff)
})

// 将effect数据转换为Map
export const effectMap = new Map<string, Buff>()
effectData.forEach(buff => {
    effectMap.set(buff.名称, buff as Buff)
})

// 将所有武器数据转换为统一的Map
export const weaponMap = new Map<number, Weapon>()
export const weaponNameMap = new Map<string, Weapon>()

// 添加近战武器到weaponMap
weaponData.forEach(weapon => {
    weaponMap.set(weapon.id, weapon as Weapon)
    weaponNameMap.set(weapon.名称, weapon as Weapon)
})

// 将base数据转换为Map，用于快速查找武器倍率信息
export const baseMap = new Map<string, WeaponBase[]>()

baseData.forEach((base: any) => {
    if (!baseMap.has(base.武器类型)) {
        baseMap.set(base.武器类型, [])
    }
    baseMap.get(base.武器类型)!.push(base as WeaponBase)
})

export const rewardMap = new Map<number, Reward>()

rewardData.forEach(v => {
    rewardMap.set(v.id, v)
})

export const modDraftMap = new Map<number, Draft>()
export const weaponDraftMap = new Map<number, Draft>()
export const draftMap = new Map<number, Draft>()
export const resourceDraftMap = new Map<number, Draft>()

draftData.forEach(v => {
    if (v.t === "Mod") modDraftMap.set(v.p, v)
    if (v.t === "Weapon") weaponDraftMap.set(v.p, v)
    if (v.t === "Resource") resourceDraftMap.set(v.p, v)
    draftMap.set(v.id, v)
})

export const abyssBuffMap = new Map<number, AbyssBuff>()
abyssBuffs.forEach(v => abyssBuffMap.set(v.id, v))
export const abyssDungeonMap = new Map<number, AbyssDungeon>()
abyssDungeons.forEach(v => {
    // 转换buffID为AbyssBuff对象
    v.buff = v.b.map(id => abyssBuffMap.get(id)!)
    // 转换角色ID为角色名称
    const cname = v.cid ? charMap.get(v.cid)?.名称 : undefined
    if (cname) v.cname = cname
    abyssDungeonMap.set(v.id, v)
})

// 将副本数据转换为Map，并建立Mod到副本的反向映射
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

dungeonData.forEach(dungeon => {
    dungeonMap.set(dungeon.id, dungeon as Dungeon)
    // 获取副本的所有奖励ID
    const rewardIds = [...(dungeon.r || []), ...(dungeon.sr || [])]
    if (rewardIds.length > 0) {
        rewardIds.forEach(rewardId => {
            const reward = rewardMap.get(rewardId)
            if (reward?.child) {
                // 递归查找Mod类型的奖励
                const modIds = new Set<number>()
                const draftIds = new Set<number>()
                findModRewards(reward.child, modIds, draftIds)

                // 建立Mod ID到Dungeon的映射
                modIds.forEach(modId => {
                    if (!modDungeonMap.has(modId)) {
                        modDungeonMap.set(modId, [])
                    }
                    modDungeonMap.get(modId)!.push(dungeon as Dungeon)
                })
                // 建立Draft ID到Dungeon的映射
                draftIds.forEach(draftId => {
                    if (!draftDungeonMap.has(draftId)) {
                        draftDungeonMap.set(draftId, [])
                    }
                    draftDungeonMap.get(draftId)!.push(dungeon as Dungeon)
                })
            }
        })
    }
})

import petData, { type Pet } from "./pet.data"
export const petMap = new Map<number, Pet>()
petData.forEach(v => petMap.set(v.id, v))

export type { DBMap, DBMapMarker } from "./map.data"

export { type Walnut, type WalnutReward, walnutMap, walnutRewardMap } from "./walnut.data"

import { type Fish, type FishingSpot, fishingSpots, fishs } from "./fish.data"
export const fishMap = new Map<number, Fish>()
fishs.forEach(v => fishMap.set(v.id, v))

export const fishingSpotMap = new Map<number, FishingSpot>()
fishingSpots.forEach(v => fishingSpotMap.set(v.id, v))

export const fish2SpotMap = new Map<number, { spotId: number; weight: number }[]>()
fishingSpots.forEach(v =>
    v.fishIds.forEach((id, index) => {
        if (!fish2SpotMap.has(id)) {
            fish2SpotMap.set(id, [])
        }
        fish2SpotMap.get(id)!.push({ spotId: v.id, weight: v.weights[index] })
    })
)

export type { Fish, FishingSpot }

export { type Resource, resourceData, resourceMap } from "./resource.data"
