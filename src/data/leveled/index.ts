import { Mod, Buff, Weapon, Skill, WeaponBase, Char } from "../data-types"
import gameData from "../data.json"

// 将静态表转换为Map，提高查找效率
const charMap = new Map<string, Char>()
gameData.char.forEach((char) => {
    charMap.set(char.名称, char as Char)
})

// 将mod数据转换为Map
const modMap = new Map<number, Mod>()
gameData.mod.forEach((mod) => {
    if (mod.id) {
        modMap.set(mod.id, mod as Mod)
    }
})

// 将buff数据转换为Map
const buffMap = new Map<string, Buff>()
gameData.buff.forEach((buff) => {
    buffMap.set(buff.名称, buff as Buff)
})

// 将所有武器数据转换为统一的Map
const weaponMap = new Map<string, Weapon>()

// 添加近战武器到weaponMap
gameData.weapon.forEach((weapon: any) => {
    if (weapon.名称) {
        weaponMap.set(weapon.名称, weapon as Weapon)
    }
})

// 将base数据转换为Map，用于快速查找武器倍率信息
const baseMap = new Map<string, WeaponBase[]>()

gameData.base.forEach((base: any) => {
    if (!baseMap.has(base.武器类型)) {
        baseMap.set(base.武器类型, [])
    }
    baseMap.get(base.武器类型)!.push(base as WeaponBase)
})

// 将技能数据转换为Map，按技能名称分组存储1级和10级数据
const skillMap = new Map<string, { level1: Skill; level10: Skill }>()

// 创建角色到技能的映射关系
const charToSkillsMap = new Map<string, string[]>()

// 首先将所有技能按名称和等级存储，并建立角色到技能的映射
gameData.skill.forEach((skill) => {
    if (skill.名称 && (skill.等级 === 1 || skill.等级 === 10)) {
        const key = skill.名称
        if (!skillMap.has(key)) {
            skillMap.set(key, { level1: {} as Skill, level10: {} as Skill })
        }
        if (skill.等级 === 1) {
            skillMap.get(key)!.level1 = skill as Skill
        } else {
            skillMap.get(key)!.level10 = skill as Skill
        }

        // 建立角色到技能的映射关系
        if (skill.角色) {
            const charName = skill.角色
            if (!charToSkillsMap.has(charName)) {
                charToSkillsMap.set(charName, [])
            }
            // 只添加一次技能名称
            if (!charToSkillsMap.get(charName)!.includes(key)) {
                charToSkillsMap.get(charName)!.push(key)
            }
        }
    }
})

// 导出各种映射表供其他模块使用
export { charToSkillsMap, charMap, modMap, buffMap, weaponMap, skillMap, baseMap }

// 导出LeveledChar、LeveledMod、LeveledBuff、LeveledWeapon、LeveledSkill类
export { LeveledChar } from "./LeveledChar"
export { LeveledMod } from "./LeveledMod"
export { LeveledBuff } from "./LeveledBuff"
export { LeveledWeapon } from "./LeveledWeapon"
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
