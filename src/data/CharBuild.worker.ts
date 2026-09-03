import { type CharBuildWorkerSnapshot, createBuildFromSnapshot } from "./CharBuildSnapshot"
import type { Buff, Mod } from "./data-types"
import { LeveledBuff } from "./leveled/LeveledBuff"
import { LeveledMod } from "./leveled/LeveledMod"

// 兼容旧引用：快照类型统一由 CharBuildSnapshot 提供
export type { CharBuildWorkerSnapshot } from "./CharBuildSnapshot"

type IncomeRequest = {
    id: number
    build: CharBuildWorkerSnapshot
    buffs?: {
        key: string
        data: Buff
        level: number
        minus: boolean
        /** 覆盖率（0-1，默认1表示100%） */
        coverage?: number
    }[]
    mods?: {
        key: string
        data: Mod
        level: number
        buffLv?: number
        effect?: Buff
    }[]
    equippedMods?: {
        key: string
        type: string
        index: number
    }[]
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
        self.postMessage({ id: event.data.id, incomes } satisfies IncomeResponse)
    } catch (error) {
        self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) } satisfies IncomeResponse)
    }
}
