import { CharBuild, type CharBuildOptions, type DotFrequencySettings } from "./CharBuild"
import type { Buff, Char, Mod, Weapon } from "./data-types"
import { LeveledBuff } from "./leveled/LeveledBuff"
import { LeveledChar } from "./leveled/LeveledChar"
import { LeveledMod } from "./leveled/LeveledMod"
import type { Monster } from "./leveled/LeveledMonster"
import { LeveledMonster } from "./leveled/LeveledMonster"
import { LeveledWeapon } from "./leveled/LeveledWeapon"

export type ModSnapshot = {
    data: Mod
    level: number
    buffLv?: number
    effect?: Buff
} | null

export type WeaponSnapshot = {
    data: Weapon
    refine: number
    level: number
    effectLv?: number
    effect?: Buff
    forgeEffective: boolean
}

export interface CharBuildWorkerSnapshot {
    char: {
        data: Char
        level: number
    }
    skillLevel: number
    hpPercent: number
    resonanceGain: number
    auraMod?: ModSnapshot
    charMods: ModSnapshot[]
    meleeMods: ModSnapshot[]
    rangedMods: ModSnapshot[]
    skillMods: ModSnapshot[]
    buffs: {
        data: Buff
        level: number
        /** 覆盖率（0-1，默认1表示100%） */
        coverage?: number
    }[]
    melee: WeaponSnapshot
    ranged: WeaponSnapshot
    baseName: string
    imbalance: boolean
    enemy: {
        data: Monster
        level: number
        isRouge: boolean
        hpMultiplier: number
    }
    enemyId: number
    enemyLevel: number
    enemyResistance: number
    targetFunction: string
    customVariables: [string, string][]
    timelineDPS: boolean
    teamWeaponCategories: string[]
    /** 额外精通武器类型（如 "长柄"） */
    extraMastery: string
    /** DOT 频率设置（每种来源每秒造成伤害的次数） */
    dotSettings: DotFrequencySettings
}

/**
 * 将构筑实例转换为 worker 可结构化克隆的快照。
 * @param charBuild 构筑实例
 * @returns worker 构筑快照
 */
export function createWorkerSnapshot(charBuild: CharBuild): CharBuildWorkerSnapshot {
    const createModSnapshot = (mod: CharBuild["charMods"][number]) =>
        mod
            ? {
                  data: mod.originalModData,
                  level: mod.等级,
                  buffLv: mod.buffLv,
                  effect: mod.buff?._originalBuffData,
              }
            : null
    const createWeaponSnapshot = (weapon: CharBuild["meleeWeapon"]) => ({
        data: weapon._originalWeaponData,
        refine: weapon.精炼,
        level: weapon.等级,
        effectLv: weapon.effectLv,
        effect: weapon.buff?._originalBuffData,
        forgeEffective: weapon.forgeEffective,
    })

    return {
        char: {
            data: charBuild.char._originalCharData,
            level: charBuild.char.等级,
        },
        skillLevel: charBuild.skillLevel,
        hpPercent: charBuild.hpPercent,
        resonanceGain: charBuild.resonanceGain,
        auraMod: createModSnapshot(charBuild.auraMod || null),
        charMods: charBuild.charMods.map(createModSnapshot),
        meleeMods: charBuild.meleeMods.map(createModSnapshot),
        rangedMods: charBuild.rangedMods.map(createModSnapshot),
        skillMods: charBuild.skillMods.map(createModSnapshot),
        // 复合BUFF（code+普通属性）同一实例同时位于普通槽位与code槽位，按引用去重避免快照重复
        buffs: [...new Set([...charBuild.buffs, ...charBuild.dynamicBuffs])].map(buff => ({
            data: buff._originalBuffData,
            level: buff.等级,
            coverage: buff.coverage !== 1 ? buff.coverage : undefined,
        })),
        melee: createWeaponSnapshot(charBuild.meleeWeapon),
        ranged: createWeaponSnapshot(charBuild.rangedWeapon),
        baseName: charBuild.baseName,
        imbalance: charBuild.imbalance,
        enemy: {
            data: charBuild.enemy._baseData,
            level: charBuild.enemy.等级,
            isRouge: charBuild.enemy.isRouge,
            hpMultiplier: charBuild.enemy.hpMultiplier,
        },
        enemyId: charBuild.enemyId,
        enemyLevel: charBuild.enemyLevel,
        enemyResistance: charBuild.enemyResistance,
        targetFunction: charBuild.targetFunction,
        customVariables: charBuild.customVariables,
        timelineDPS: charBuild.timelineDPS,
        teamWeaponCategories: charBuild.teamWeaponCategories,
        extraMastery: charBuild.extraMastery,
        dotSettings: { ...charBuild.dotSettings },
    }
}

/**
 * 从可结构化克隆的快照恢复构筑实例。
 * @param snapshot 构筑快照
 * @returns 构筑实例
 */
export function createBuildFromSnapshot(snapshot: CharBuildWorkerSnapshot) {
    const createMod = (mod: ModSnapshot) => (mod ? new LeveledMod(mod.data, mod.level, mod.buffLv, mod.effect) : null)
    const createWeapon = (weapon: WeaponSnapshot) => {
        const leveled = new LeveledWeapon(weapon.data, weapon.refine, weapon.level, weapon.effectLv, weapon.effect)
        leveled.setForgeEffective(weapon.forgeEffective)
        return leveled
    }
    const options: CharBuildOptions = {
        char: new LeveledChar(snapshot.char.data, snapshot.char.level),
        skillLevel: snapshot.skillLevel,
        hpPercent: snapshot.hpPercent,
        resonanceGain: snapshot.resonanceGain,
        auraMod: createMod(snapshot.auraMod || null) || undefined,
        charMods: snapshot.charMods.map(createMod),
        meleeMods: snapshot.meleeMods.map(createMod),
        rangedMods: snapshot.rangedMods.map(createMod),
        skillMods: snapshot.skillMods.map(createMod),
        buffs: snapshot.buffs.map(buff => {
            const leveled = new LeveledBuff(buff.data, buff.level)
            if (buff.coverage !== undefined) {
                leveled.coverage = buff.coverage
            }
            return leveled
        }),
        melee: createWeapon(snapshot.melee),
        ranged: createWeapon(snapshot.ranged),
        baseName: snapshot.baseName,
        imbalance: snapshot.imbalance,
        enemy: new LeveledMonster(snapshot.enemy.data, snapshot.enemy.level, snapshot.enemy.isRouge, snapshot.enemy.hpMultiplier),
        enemyId: snapshot.enemyId,
        enemyLevel: snapshot.enemyLevel,
        enemyResistance: snapshot.enemyResistance,
        targetFunction: snapshot.targetFunction,
        customVariables: snapshot.customVariables,
        timelineDPS: snapshot.timelineDPS,
        teamWeaponCategories: snapshot.teamWeaponCategories,
        extraMastery: snapshot.extraMastery,
        dotSettings: snapshot.dotSettings,
    }
    return new CharBuild(options)
}
