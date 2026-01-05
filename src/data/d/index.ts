import { Mod, Buff, Weapon, WeaponBase, Char, Monster, Reward, Draft } from "../data-types"
import charData from "./char.data"
import monsterData from "./monster.data"
import modData from "./mod.data"
import buffData from "./buff.data"
import effectData from "./effect.data"
import weaponData from "./weapon.data"
import baseData from "./base.data"
import rewardData from "./reward.data"
import draftData from "./draft.data"

// 将静态表转换为Map，提高查找效率
export const charMap = new Map<number | string, Char>()
charData.forEach((char) => {
    charMap.set(char.名称, char as Char)
    charMap.set(char.id, char as Char)
})

// 将mob数据转换为Map
export const monsterMap = new Map<number, Monster>()
monsterData.forEach((mob) => {
    monsterMap.set(mob.id, mob as Monster)
})

// 将mod数据转换为Map
export const modMap = new Map<number, Mod>()
modData.forEach((mod) => {
    modMap.set(mod.id, mod as Mod)
})

// 将buff数据转换为Map
export const buffMap = new Map<string, Buff>()
buffData.forEach((buff) => {
    buffMap.set(buff.名称, buff as Buff)
})

// 将effect数据转换为Map
export const effectMap = new Map<string, Buff>()
effectData.forEach((buff) => {
    effectMap.set(buff.名称, buff as Buff)
})

// 将所有武器数据转换为统一的Map
export const weaponMap = new Map<number, Weapon>()
export const weaponNameMap = new Map<string, Weapon>()

// 添加近战武器到weaponMap
weaponData.forEach((weapon) => {
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
export const modRewardMap = new Map<number, Reward>()

rewardData.forEach((v) => {
    rewardMap.set(v.id, v)
    if (v.child) {
        const mods = v.child.filter((c) => c.t === "Mod")
        mods.forEach((mod) => modRewardMap.set(mod.id, v))
    }
})

export const modDraftMap = new Map<number, Draft>()
export const weaponDraftMap = new Map<number, Draft>()
export const draftMap = new Map<number, Draft>()

draftData.forEach((v) => {
    if (v.t === "Mod") modDraftMap.set(v.p, v)
    if (v.t === "Weapon") weaponDraftMap.set(v.p, v)
    draftMap.set(v.id, v)
})
