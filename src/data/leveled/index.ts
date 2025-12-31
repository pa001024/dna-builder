import { Mod, Buff, Weapon, WeaponBase, Char, Monster } from "../data-types"
import charData from "../char.data"
import buffData from "../buff.data"
import effectData from "../effect.data"
import weaponData from "../weapon.data"
import modData from "../mod.data"
import monsterData from "../monster.data"
import baseData from "../base.data"

export { LeveledMonster } from "./LeveledMonster"

// 将静态表转换为Map，提高查找效率
const charMap = new Map<number | string, Char>()
charData.forEach((char) => {
    charMap.set(char.名称, char as Char)
    charMap.set(char.id, char as Char)
})

// 将mob数据转换为Map
const monsterMap = new Map<number, Monster>()
if (monsterData) {
    monsterData.forEach((mob) => {
        monsterMap.set(mob.id, mob as Monster)
    })
}

// 将mod数据转换为Map
const modMap = new Map<number, Mod>()
modData.forEach((mod) => {
    if (mod.id) {
        modMap.set(mod.id, mod as Mod)
    }
})

// 将buff数据转换为Map
const buffMap = new Map<string, Buff>()
buffData.forEach((buff) => {
    buffMap.set(buff.名称, buff as Buff)
})

// 将effect数据转换为Map
const effectMap = new Map<string, Buff>()
effectData.forEach((buff) => {
    effectMap.set(buff.名称, buff as Buff)
})

// 将所有武器数据转换为统一的Map
const weaponMap = new Map<string, Weapon>()

// 添加近战武器到weaponMap
weaponData.forEach((weapon: any) => {
    if (weapon.名称) {
        weaponMap.set(weapon.名称, weapon as Weapon)
    }
})

// 将base数据转换为Map，用于快速查找武器倍率信息
const baseMap = new Map<string, WeaponBase[]>()

baseData.forEach((base: any) => {
    if (!baseMap.has(base.武器类型)) {
        baseMap.set(base.武器类型, [])
    }
    baseMap.get(base.武器类型)!.push(base as WeaponBase)
})

/**
 * 角色/武器等级升级倍率表
 * 1-80级对应的倍数
 */
export const CommonLevelUp = [
    1, 1.0422, 1.086, 1.1305, 1.1774, 1.3988, 1.4474, 1.5012, 1.5589, 1.6157, 1.8331, 1.8921, 1.9527, 2.0162, 2.0813, 2.3128, 2.3809,
    2.4505, 2.5186, 2.5897, 2.8339, 2.9053, 2.9795, 3.0538, 3.1288, 3.3098, 3.5538, 3.6327, 3.7117, 3.7921, 4.1028, 4.1842, 4.2765, 4.3725,
    4.4705, 4.8047, 4.9053, 5.0059, 5.1021, 5.1933, 5.5294, 5.621, 5.7141, 5.8079, 5.9032, 6.2508, 6.348, 6.4451, 6.5437, 6.6416, 6.8191,
    7.1079, 7.2107, 7.3127, 7.4155, 7.7876, 7.8938, 7.9999, 8.1061, 8.5685, 8.6863, 8.803, 8.9214, 9.0424, 9.7101, 9.7488, 9.8684, 9.9916,
    10.1107, 10.2122, 11.236, 11.3504, 11.459, 11.5667, 11.9809, 12.093, 12.2051, 12.3222, 12.4372, 12.5522,
]

// 导出各种映射表供其他模块使用
export { charMap, modMap, buffMap, effectMap, weaponMap, baseMap, monsterMap }

// 导出LeveledChar、LeveledMod、LeveledBuff、LeveledWeapon、LeveledSkill类
export { LeveledChar } from "./LeveledChar"
export { LeveledMonster as LeveledMob } from "./LeveledMonster"
export { LeveledMod, LeveledModWithCount } from "./LeveledMod"
export { LeveledBuff } from "./LeveledBuff"
export { LeveledWeapon } from "./LeveledWeapon"
export { LeveledSkillWeapon } from "./LeveledSkillWeapon"
export { LeveledSkill } from "./LeveledSkill"

/*
示例用法：

// 创建一个等级为50的黎瑟角色
const 黎瑟50级 = new LeveledChar('黎瑟', 50);
console.log('50级黎瑟属性:', 黎瑟50级.getFullProperties());

// 创建一个没有指定等级的丽蓓卡角色
const 丽蓓卡 = new LeveledChar('丽蓓卡');
console.log('未指定等级的丽蓓卡属性:', 丽蓓卡.getFullProperties());

// 之后设置等级
丽蓓卡.等级 = 30;
console.log('设置为30级后的丽蓓卡属性:', 丽蓓卡.getFullProperties());

// 创建一个等级为3的MOD
const 炽灼3级 = new LeveledMod(11001, 3);
console.log('3级炽灼MOD属性:', 炽灼3级.getFullProperties());

// 创建一个等级为2的Buff
const 助战50攻2级 = new LeveledBuff('助战50攻', 2);
console.log('2级助战50攻Buff属性:', 助战50攻2级.getFullProperties());
*/
