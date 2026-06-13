import { CharBuild, type CharBuildOptions } from "./CharBuild"
import type { Buff, Char, Mod, Weapon } from "./data-types"
import { LeveledBuff } from "./leveled/LeveledBuff"
import { LeveledChar } from "./leveled/LeveledChar"
import { LeveledMod } from "./leveled/LeveledMod"
import type { Monster } from "./leveled/LeveledMonster"
import { LeveledMonster } from "./leveled/LeveledMonster"
import { LeveledWeapon } from "./leveled/LeveledWeapon"

type ModSnapshot = {
    data: Mod
    level: number
    buffLv?: number
    effect?: Buff
} | null

type WeaponSnapshot = {
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
}

type BuffIncomeRequest = {
    id: number
    build: CharBuildWorkerSnapshot
    buffs: {
        key: string
        data: Buff
        level: number
        minus: boolean
    }[]
}

type BuffIncomeResponse = {
    id: number
    incomes?: Record<string, number>
    error?: string
}

/**
 * 从可结构化克隆的快照恢复构筑实例。
 * @param snapshot 构筑快照
 * @returns 构筑实例
 */
function createBuildFromSnapshot(snapshot: CharBuildWorkerSnapshot) {
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
        buffs: snapshot.buffs.map(buff => new LeveledBuff(buff.data, buff.level)),
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
    }
    return new CharBuild(options)
}

self.onmessage = (event: MessageEvent<BuffIncomeRequest>) => {
    try {
        const build = createBuildFromSnapshot(event.data.build)
        const incomes: Record<string, number> = {}
        event.data.buffs.forEach(buff => {
            incomes[buff.key] = build.calcIncome(new LeveledBuff(buff.data, buff.level), buff.minus)
        })
        self.postMessage({ id: event.data.id, incomes } satisfies BuffIncomeResponse)
    } catch (error) {
        self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) } satisfies BuffIncomeResponse)
    }
}
