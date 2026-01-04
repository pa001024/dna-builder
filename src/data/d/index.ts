import { Mod, Buff, Weapon, WeaponBase, Char, Monster, Reward } from "../data-types"
import charData from "./char.data"
import monsterData from "./monster.data"
import modData from "./mod.data"
import buffData from "./buff.data"
import effectData from "./effect.data"
import weaponData from "./weapon.data"
import baseData from "./base.data"
import rewardData from "./reward.data"

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
export const weaponMap = new Map<string, Weapon>()

// 添加近战武器到weaponMap
weaponData.forEach((weapon: any) => {
    if (weapon.名称) {
        weaponMap.set(weapon.名称, weapon as Weapon)
    }
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

rewardData.forEach((v) => {
    rewardMap.set(v.id, v)
})
