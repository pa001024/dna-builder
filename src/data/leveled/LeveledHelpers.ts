import { buffMap, charMap, effectMap, modMap, monsterMap, petMap, weaponMap, weaponNameMap } from "../d"
import type { Buff, Char, Mod, Weapon } from "../data-types"
import { LeveledBuff, setLeveledBuffResolver } from "./LeveledBuff"
import { LeveledChar, setLeveledCharResolver } from "./LeveledChar"
import { LeveledMod, LeveledModWithCount, setLeveledModResolver } from "./LeveledMod"
import { LeveledMonster, setLeveledMonsterResolver } from "./LeveledMonster"
import { LeveledPet, setLeveledPetResolver } from "./LeveledPet"
import { LeveledSkill } from "./LeveledSkill"
import { LeveledWeapon, setLeveledWeaponResolver } from "./LeveledWeapon"

setLeveledBuffResolver(name => buffMap.get(name))
setLeveledCharResolver(id => charMap.get(id))
setLeveledModResolver(id => {
    const mod = modMap.get(id)
    return mod ? { mod, effect: effectMap.get(mod.名称) } : undefined
})
setLeveledWeaponResolver(id => {
    const weapon = typeof id === "number" ? weaponMap.get(id) : weaponNameMap.get(id)
    return weapon ? { weapon, effect: effectMap.get(weapon.名称) } : undefined
})
setLeveledMonsterResolver(id => monsterMap.get(id) || monsterMap.get(130))
setLeveledPetResolver(id => petMap.get(id))

export interface CharBuildInvSnapshot {
    buffLv?: Record<number, number>
    wLv?: Record<number, number>
}

/**
 * 提供从静态 BUFF 表构造等级化 BUFF 的入口，避免 LeveledBuff 自身绑定数据表。
 */
export class LeveledBuffHelper {
    static fromName(name: string, level?: number) {
        const buffData = buffMap.get(name)
        if (!buffData) {
            throw new Error(`Buff "${name}" 未在静态表中找到`)
        }
        return new LeveledBuff(buffData, level)
    }

    static fromData(buffData: Buff, level?: number) {
        return new LeveledBuff(buffData, level)
    }
}

/**
 * 提供从角色静态表构造等级化角色的入口。
 */
export class LeveledCharHelper {
    static fromId(id: string | number, level?: number) {
        const charData = charMap.get(id)
        if (!charData) {
            throw new Error(`角色 "${id}" 未在静态表中找到`)
        }
        return new LeveledChar(charData, level)
    }

    static fromData(charData: Char, level?: number) {
        return new LeveledChar(charData, level)
    }

    static getSkillNames(charName: string) {
        return charMap.get(charName)?.技能.map(skill => skill.名称) || []
    }

    static getSkillNamesWithSub(charName: string) {
        const skills = charMap.get(charName)?.技能.map(skill => new LeveledSkill(skill)) || []
        return skills.flatMap(skill => [skill.名称, ...skill.子技能.map(subSkill => `${skill.名称}[${subSkill}]`)])
    }

    static idToUrl(id?: number) {
        if (id === 160101) return LeveledChar.url("Nanzhu")
        if (id === 120101) return LeveledChar.url("Nanzhu02")
        const icon = charMap.get(id || 0)?.icon || "Empty"
        return LeveledChar.url(icon)
    }
}

/**
 * 提供从 MOD 静态表构造等级化 MOD 的入口。
 */
export class LeveledModHelper {
    static fromId(id: number, level?: number, buffLv?: number) {
        const modData = modMap.get(id)
        if (!modData) {
            throw new Error(`MOD ID "${id}" 未在静态表中找到`)
        }
        return new LeveledMod(modData, level, buffLv, effectMap.get(modData.名称))
    }

    static fromData(modData: Mod, level?: number, buffLv?: number) {
        return new LeveledMod(modData, level, buffLv, effectMap.get(modData.名称))
    }

    static optionalFromId(id: number, level: number, buffLv?: number) {
        const modData = modMap.get(id)
        if (!modData) {
            return null
        }
        return new LeveledMod(modData, level, buffLv, effectMap.get(modData.名称))
    }

    static fromDNA(dnaMod: import("dna-api").DNAModesBean) {
        const modData = modMap.get(+dnaMod.id)
        if (modData) {
            return new LeveledMod(modData, dnaMod.level, undefined, effectMap.get(modData.名称))
        }
        if (+dnaMod.id === -1) return null
        return new LeveledMod({
            id: +dnaMod.id,
            名称: dnaMod.name || "?",
            系列: "?",
            品质: (dnaMod.quality && ["白", "绿", "蓝", "紫", "金"][dnaMod.quality - 1]) || "白",
            耐受: 1,
            类型: "?",
        })
    }

    static withCount(modData: Mod, level?: number, buffLv?: number, count?: number) {
        return new LeveledModWithCount(modData, level, buffLv, count, effectMap.get(modData.名称))
    }

    static withCountFromId(id: number, level?: number, buffLv?: number, count?: number) {
        const modData = modMap.get(id)
        if (!modData) {
            throw new Error(`MOD ID "${id}" 未在静态表中找到`)
        }
        return LeveledModHelper.withCount(modData, level, buffLv, count)
    }

    static getUrl(modId: number) {
        const mod = LeveledModHelper.fromId(modId)
        return mod.url
    }

    static getQuality(id: number) {
        return modMap.get(id)?.品质 || "紫"
    }
}

/**
 * 提供从武器静态表构造等级化武器的入口。
 */
export class LeveledWeaponHelper {
    static fromId(id: number | string, refine?: number, level?: number, effectLv?: number) {
        const weaponData = typeof id === "number" ? weaponMap.get(id) : weaponNameMap.get(id)
        if (!weaponData) {
            throw new Error(`武器 "${id}" 未在静态表中找到`)
        }
        return new LeveledWeapon(weaponData, refine, level, effectLv, effectMap.get(weaponData.名称))
    }

    static fromData(weaponData: Weapon, refine?: number, level?: number, effectLv?: number) {
        return new LeveledWeapon(weaponData, refine, level, effectLv, effectMap.get(weaponData.名称))
    }

    static idToUrl(id?: number) {
        const icon = weaponMap.get(id || 0)?.icon || ""
        return LeveledWeapon.url(icon)
    }

    static getCategory(id: number | string) {
        return LeveledWeaponHelper.fromId(id).类别
    }
}

/**
 * 提供从怪物静态表构造等级化怪物的入口。
 */
export class LeveledMonsterHelper {
    static fromId(id: number, level = 180, isRouge = false, hpMultiplier = 1) {
        const monsterData = monsterMap.get(id) || monsterMap.get(130)
        if (!monsterData) {
            throw new Error(`怪物 "${id}" 未在静态表中找到`)
        }
        return new LeveledMonster(monsterData, level, isRouge, hpMultiplier)
    }
}

/**
 * 提供从魔灵静态表构造等级化魔灵的入口。
 */
export class LeveledPetHelper {
    static fromId(id: number, level?: number) {
        const petData = petMap.get(id)
        if (!petData) {
            return null
        }
        return new LeveledPet(petData, level)
    }
    static idToUrl(id: number) {
        return LeveledPet.url(petMap.get(id)?.icon)
    }
}

/**
 * 从背包快照读取 MOD BUFF 等级。
 * @param inv 背包快照
 * @param modId MOD ID
 * @returns BUFF 等级
 */
export function getBuffLvFromSnapshot(inv: CharBuildInvSnapshot | undefined, modId: number) {
    return inv?.buffLv?.[modId] || 0
}

/**
 * 从背包快照读取武器 BUFF 等级。
 * @param inv 背包快照
 * @param weaponId 武器 ID
 * @param elm 当前角色属性
 * @returns 武器 BUFF 等级
 */
export function getWBuffLvFromSnapshot(inv: CharBuildInvSnapshot | undefined, weaponId: number, elm = "any") {
    const level = inv?.wLv?.[weaponId] || 0
    if (!level) return 0
    const weapon = weaponMap.get(weaponId)
    const effect = weapon?.名称 ? effectMap.get(weapon.名称) : undefined
    if (effect?.限定 && effect.限定 !== elm && elm !== "any") {
        return 0
    }
    return level
}
