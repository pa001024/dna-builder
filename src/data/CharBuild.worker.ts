import { type CharBuildWorkerSnapshot, createBuildFromSnapshot } from "./CharBuildSnapshot"
import type { Buff, Mod } from "./data-types"
import { LeveledBuff } from "./leveled/LeveledBuff"
import { LeveledMod } from "./leveled/LeveledMod"

// 兼容旧引用：快照类型统一由 CharBuildSnapshot 提供
export type { CharBuildWorkerSnapshot } from "./CharBuildSnapshot"

/** 候选 BUFF（按「加入该 BUFF 后的伤害变化」或「移除该 BUFF 后的伤害变化」求收益） */
export type IncomeBuffItem = {
    key: string
    data: Buff
    level: number
    minus: boolean
    /** 覆盖率（0-1，默认1表示100%） */
    coverage?: number
}

/** 候选魔之楔（按整槽替换求收益） */
export type IncomeModItem = {
    key: string
    data: Mod
    level: number
    buffLv?: number
    effect?: Buff
}

/** 已装备魔之楔（按移除对应槽位求收益） */
export type IncomeEquippedModItem = {
    key: string
    type: string
    index: number
}

/** 已装备 BUFF（含魔灵与魔灵潜质：按移除该 BUFF 后重算的方式求边际收益） */
export type IncomeEquippedBuffItem = {
    key: string
    data: Buff
    level: number
    /** 覆盖率（0-1，默认1表示100%） */
    coverage?: number
}

type IncomeRequest = {
    id: number
    build: CharBuildWorkerSnapshot
    buffs?: IncomeBuffItem[]
    mods?: IncomeModItem[]
    equippedMods?: IncomeEquippedModItem[]
    equippedBuffs?: IncomeEquippedBuffItem[]
}

type IncomeResponse = {
    id: number
    incomes?: Record<string, number>
    error?: string
}

self.onmessage = (event: MessageEvent<IncomeRequest>) => {
    try {
        const build = createBuildFromSnapshot(event.data.build)
        const incomes: Record<string, number> = {}
        event.data.buffs?.forEach(buff => {
            const leveled = new LeveledBuff(buff.data, buff.level)
            if (buff.coverage !== undefined) {
                leveled.coverage = buff.coverage
            }
            incomes[buff.key] = build.calcIncome(leveled, buff.minus)
        })
        event.data.mods?.forEach(mod => {
            incomes[mod.key] = build.calcIncome(new LeveledMod(mod.data, mod.level, mod.buffLv, mod.effect))
        })
        event.data.equippedMods?.forEach(mod => {
            incomes[mod.key] = build.calcEquippedModIncome(mod.type, mod.index)
        })
        event.data.equippedBuffs?.forEach(buff => {
            const leveled = new LeveledBuff(buff.data, buff.level)
            if (buff.coverage !== undefined) {
                leveled.coverage = buff.coverage
            }
            incomes[buff.key] = build.calcEquippedBuffIncome(leveled)
        })
        self.postMessage({ id: event.data.id, incomes } satisfies IncomeResponse)
    } catch (error) {
        self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) } satisfies IncomeResponse)
    }
}
