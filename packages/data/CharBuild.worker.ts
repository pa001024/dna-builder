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

/** 候选魔之楔落槽位置：选楔弹窗正在编辑的槽位，同请求内全部候选共用 */
export type IncomeReplaceSlot = {
    type: string
    index: number
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

/** 目标值请求条目：一次请求可携带多份构筑（构筑列表场景） */
export type TargetValueItem = {
    key: string
    build: CharBuildWorkerSnapshot
}

type IncomeRequest = {
    id: number
    kind?: "income"
    build: CharBuildWorkerSnapshot
    buffs?: IncomeBuffItem[]
    mods?: IncomeModItem[]
    /** 候选魔之楔的落槽位置：有则按替换该槽位求收益，无则退化为附加口径 */
    replaceSlot?: IncomeReplaceSlot
    equippedMods?: IncomeEquippedModItem[]
    equippedBuffs?: IncomeEquippedBuffItem[]
}

type TargetValueRequest = {
    id: number
    kind: "targetValues"
    builds: TargetValueItem[]
}

type IncomeResponse = {
    id: number
    incomes?: Record<string, number>
    error?: string
}

type TargetValueResponse = {
    id: number
    values?: Record<string, number>
    /** 单份构筑计算失败不影响整批，失败项只在这里留痕 */
    failed?: string[]
}

/**
 * 批量求解构筑目标值（`calculate()`）：主线程只负责组装快照，重活全部落在本线程。
 * @param request 目标值请求
 */
function handleTargetValues(request: TargetValueRequest) {
    const values: Record<string, number> = {}
    const failed: string[] = []
    for (const item of request.builds) {
        try {
            const value = createBuildFromSnapshot(item.build).calculate()
            if (Number.isFinite(value)) {
                values[item.key] = value
            } else {
                failed.push(item.key)
            }
        } catch (error) {
            failed.push(`${item.key}:${error instanceof Error ? error.message : String(error)}`)
        }
    }
    self.postMessage({
        id: request.id,
        values,
        ...(failed.length > 0 ? { failed } : {}),
    } satisfies TargetValueResponse)
}

self.onmessage = (event: MessageEvent<IncomeRequest | TargetValueRequest>) => {
    const request = event.data
    if (request.kind === "targetValues") {
        handleTargetValues(request)
        return
    }
    try {
        const build = createBuildFromSnapshot(request.build)
        const incomes: Record<string, number> = {}
        const hasItems =
            (request.buffs?.length ?? 0) +
                (request.mods?.length ?? 0) +
                (request.equippedMods?.length ?? 0) +
                (request.equippedBuffs?.length ?? 0) >
            0
        // 基准伤害整请求只算一次：各候选计算前后都会恢复构筑原状，基准与逐项现算完全一致
        const base = hasItems ? build.calculate() : 0
        request.buffs?.forEach(buff => {
            const leveled = new LeveledBuff(buff.data, buff.level)
            if (buff.coverage !== undefined) {
                leveled.coverage = buff.coverage
            }
            incomes[buff.key] = build.calcIncome(leveled, buff.minus, base)
        })
        request.mods?.forEach(mod => {
            const leveled = new LeveledMod(mod.data, mod.level, mod.buffLv, mod.effect)
            incomes[mod.key] = request.replaceSlot
                ? build.calcReplacementModIncome(request.replaceSlot.type, request.replaceSlot.index, leveled, base)
                : build.calcIncome(leveled, false, base)
        })
        request.equippedMods?.forEach(mod => {
            incomes[mod.key] = build.calcEquippedModIncome(mod.type, mod.index, base)
        })
        request.equippedBuffs?.forEach(buff => {
            const leveled = new LeveledBuff(buff.data, buff.level)
            if (buff.coverage !== undefined) {
                leveled.coverage = buff.coverage
            }
            incomes[buff.key] = build.calcEquippedBuffIncome(leveled, base)
        })
        self.postMessage({ id: request.id, incomes } satisfies IncomeResponse)
    } catch (error) {
        self.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) } satisfies IncomeResponse)
    }
}
