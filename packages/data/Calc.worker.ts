import { runWasmAutobuild, runWasmIncome, type WasmIncomeItem } from "./CalcWasm"
import { type ModTypeKey, ModTypeMap } from "./CharBuild"
import { type CharBuildWorkerSnapshot, createBuildFromSnapshot, createWorkerSnapshot } from "./CharBuildSnapshot"
import type { CharSettings } from "./charSettings"
import type { Buff, Mod, Weapon } from "./data-types"
import { LeveledBuff } from "./leveled/LeveledBuff"
import { LeveledMod, LeveledModWithCount } from "./leveled/LeveledMod"
import { LeveledWeapon } from "./leveled/LeveledWeapon"

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

export type TargetValueItem = {
    key: string
    build: CharBuildWorkerSnapshot
    settings?: CharSettings
    charId?: number
}

export type CalcModOption = {
    data: Mod
    level: number
    buffLv?: number
    effect?: Buff
    count: number
}

export type CalcWeaponOption = {
    data: Weapon
    refine: number
    level: number
    effectLv?: number
    effect?: Buff
    forgeEffective: boolean
}

export type CalcWasmSource = {
    charId?: number
    settings?: CharSettings
}

export type CalcAutobuildRequest = CalcWasmSource & {
    id: number
    kind: "autobuild"
    build: CharBuildWorkerSnapshot
    includeTypes: ModTypeKey[]
    preserveTypes: ModTypeKey[]
    fixedMelee: boolean
    fixedRanged: boolean
    modOptions: CalcModOption[]
    meleeOptions: CalcWeaponOption[]
    rangedOptions: CalcWeaponOption[]
    enableLog: boolean
}

export type CalcIncomeRequest = CalcWasmSource & {
    id: number
    kind?: "income"
    build: CharBuildWorkerSnapshot
    buffs?: IncomeBuffItem[]
    mods?: IncomeModItem[]
    /** 候选魔之楔的落槽位置：有则按替换该槽位求收益，无则退化为附加口径 */
    replaceSlot?: IncomeReplaceSlot
    equippedMods?: IncomeEquippedModItem[]
    equippedBuffs?: IncomeEquippedBuffItem[]
    skillInherit?: string
}

export type CalcTargetValuesRequest = {
    id: number
    kind: "targetValues"
    builds: TargetValueItem[]
}

/** 实时日志消息：每生成一行构筑日志即回传主线程 */
export interface CalcLogMessage {
    id: number
    type: "log"
    message: string
}

export type CalcResponse = {
    id: number
    type: "result"
    newBuild?: CharBuildWorkerSnapshot
    log?: string
    iter?: number
    incomes?: Record<string, number>
    values?: Record<string, number>
    failed?: string[]
    settings?: CharSettings
    engine?: "ts" | "wasm"
    wasmError?: string
    error?: string
}

export type CalcWorkerMessage = CalcLogMessage | CalcResponse

/**
 * 从快照恢复带数量的 MOD 选项实例。
 * @param mod MOD 选项快照
 * @returns 带数量的 MOD 实例
 */
function createModOption(mod: CalcModOption) {
    return new LeveledModWithCount(mod.data, mod.level, mod.buffLv, mod.count, mod.effect)
}

/**
 * 从快照恢复武器选项实例。
 * @param weapon 武器选项快照
 * @returns 武器实例
 */
function createWeaponOption(weapon: CalcWeaponOption) {
    const leveled = new LeveledWeapon(weapon.data, weapon.refine, weapon.level, weapon.effectLv, weapon.effect)
    leveled.setForgeEffective(weapon.forgeEffective)
    return leveled
}

function wasmReady(request: CalcWasmSource): request is CalcWasmSource & { charId: number; settings: CharSettings } {
    return request.charId !== undefined && request.settings !== undefined
}

self.onmessage = (event: MessageEvent<CalcAutobuildRequest | CalcIncomeRequest | CalcTargetValuesRequest>) => {
    const request = event.data
    if (request.kind === "targetValues") {
        void handleTargetValues(request)
        return
    }
    if (request.kind === "autobuild") {
        if (wasmReady(request)) {
            void handleAutobuildWasm(request)
            return
        }
        handleAutobuildTs(request)
        return
    }
    if (wasmReady(request)) {
        void handleIncomeWasm(request)
        return
    }
    handleIncomeTs(request)
}

function handleAutobuildTs(request: CalcAutobuildRequest, wasmError?: string) {
    const { id } = request
    try {
        const build = createBuildFromSnapshot(request.build)
        const { newBuild, log, iter } = build.autoBuild({
            includeTypes: request.includeTypes,
            preserveTypes: request.preserveTypes,
            fixedMelee: request.fixedMelee,
            fixedRanged: request.fixedRanged,
            modOptions: request.modOptions.map(createModOption),
            meleeOptions: request.meleeOptions.map(createWeaponOption),
            rangedOptions: request.rangedOptions.map(createWeaponOption),
            enableLog: request.enableLog,
            // 实时回传每一行构筑日志
            onLog: message => {
                self.postMessage({ id, type: "log", message } satisfies CalcLogMessage)
            },
        })
        // 批量计算最终构筑各槽位已装备 MOD 的边际收益，避免主线程重复计算
        const incomes: Record<string, number> = {}
        request.includeTypes.forEach(key => {
            newBuild[key].forEach((_, index) => {
                incomes[`${key}:${index}`] = newBuild.calcEquippedModIncome(ModTypeMap[key], index)
            })
        })
        self.postMessage({
            id,
            type: "result",
            newBuild: createWorkerSnapshot(newBuild),
            log,
            iter,
            incomes,
            engine: "ts",
            ...(wasmError ? { wasmError } : {}),
        } satisfies CalcResponse)
    } catch (error) {
        self.postMessage({
            id,
            type: "result",
            error: error instanceof Error ? error.message : String(error),
        } satisfies CalcResponse)
    }
}

async function handleAutobuildWasm(request: CalcAutobuildRequest & { charId: number; settings: CharSettings }) {
    const { id } = request
    try {
        const result = await runWasmAutobuild({
            charId: request.charId,
            settings: request.settings,
            includeTypes: request.includeTypes,
            preserveTypes: request.preserveTypes,
            fixedMelee: request.fixedMelee,
            fixedRanged: request.fixedRanged,
            modOptions: request.modOptions,
            meleeOptions: request.meleeOptions,
            rangedOptions: request.rangedOptions,
        })
        self.postMessage({
            id,
            type: "result",
            settings: result.settings,
            log: result.log.join("\n"),
            iter: result.iters,
            engine: "wasm",
        } satisfies CalcResponse)
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.warn("wasm 自动配装失败，回退 TS", reason)
        handleAutobuildTs(request, reason)
    }
}

function calcIncomesTs(request: CalcIncomeRequest, onlyMinus = false, base?: number): Record<string, number> {
    const build = createBuildFromSnapshot(request.build)
    const incomes: Record<string, number> = {}
    const hasItems =
        (request.buffs?.length ?? 0) +
            (request.mods?.length ?? 0) +
            (request.equippedMods?.length ?? 0) +
            (request.equippedBuffs?.length ?? 0) >
        0
    // 基准伤害整请求只算一次：各候选计算前后都会恢复构筑原状，基准与逐项现算完全一致
    const baseValue = base ?? (hasItems ? build.calculate() : 0)
    request.buffs?.forEach(buff => {
        if (onlyMinus && !buff.minus) return
        const leveled = new LeveledBuff(buff.data, buff.level)
        if (buff.coverage !== undefined) {
            leveled.coverage = buff.coverage
        }
        incomes[buff.key] = build.calcIncome(leveled, buff.minus, baseValue)
    })
    if (onlyMinus) return incomes
    request.mods?.forEach(mod => {
        const leveled = new LeveledMod(mod.data, mod.level, mod.buffLv, mod.effect)
        incomes[mod.key] = request.replaceSlot
            ? build.calcReplacementModIncome(request.replaceSlot.type, request.replaceSlot.index, leveled, baseValue)
            : build.calcIncome(leveled, false, baseValue)
    })
    request.equippedMods?.forEach(mod => {
        incomes[mod.key] = build.calcEquippedModIncome(mod.type, mod.index, baseValue)
    })
    request.equippedBuffs?.forEach(buff => {
        const leveled = new LeveledBuff(buff.data, buff.level)
        if (buff.coverage !== undefined) {
            leveled.coverage = buff.coverage
        }
        incomes[buff.key] = build.calcEquippedBuffIncome(leveled, baseValue)
    })
    return incomes
}

function handleIncomeTs(request: CalcIncomeRequest) {
    try {
        const incomes = calcIncomesTs(request)
        self.postMessage({ id: request.id, type: "result", incomes, engine: "ts" } satisfies CalcResponse)
    } catch (error) {
        self.postMessage({
            id: request.id,
            type: "result",
            error: error instanceof Error ? error.message : String(error),
        } satisfies CalcResponse)
    }
}

async function handleIncomeWasm(request: CalcIncomeRequest & { charId: number; settings: CharSettings }) {
    const { id } = request
    try {
        const items: WasmIncomeItem[] = []
        request.buffs?.forEach(buff => {
            if (!buff.minus)
                items.push({ key: buff.key, kind: "buff_add", name: buff.data.名称, level: buff.level, coverage: buff.coverage })
        })
        request.mods?.forEach(mod => {
            if (request.replaceSlot) {
                items.push({
                    key: mod.key,
                    kind: "mod_replace",
                    slot: request.replaceSlot.type,
                    index: request.replaceSlot.index,
                    id: mod.data.id,
                    level: mod.level,
                    buffLevel: mod.buffLv,
                })
            } else {
                items.push({ key: mod.key, kind: "mod_add", id: mod.data.id, level: mod.level, buffLevel: mod.buffLv })
            }
        })
        request.equippedMods?.forEach(mod => {
            items.push({ key: mod.key, kind: "mod_remove", slot: mod.type, index: mod.index })
        })
        request.equippedBuffs?.forEach(buff => {
            items.push({ key: buff.key, kind: "buff_remove", name: buff.data.名称 })
        })
        const result = await runWasmIncome({
            charId: request.charId,
            settings: request.settings,
            skillInherit: request.skillInherit,
            items,
        })
        const incomes = { ...result.values }
        if (request.buffs?.some(buff => buff.minus)) {
            Object.assign(incomes, calcIncomesTs(request, true, result.base))
        }
        self.postMessage({ id, type: "result", incomes, engine: "wasm" } satisfies CalcResponse)
    } catch (error) {
        console.warn("wasm 收益计算失败，回退 TS", error)
        handleIncomeTs(request)
    }
}

async function handleTargetValues(request: CalcTargetValuesRequest) {
    const values: Record<string, number> = {}
    const failed: string[] = []
    const wasmItems = request.builds.filter(item => item.settings && item.charId !== undefined)
    const tsItems = request.builds.filter(item => !(item.settings && item.charId !== undefined))
    if (wasmItems.length > 0) {
        try {
            const first = wasmItems[0]
            const result = await runWasmIncome({
                charId: first.charId!,
                settings: first.settings!,
                items: wasmItems.map(item => ({ key: item.key, kind: "target", charId: item.charId!, settings: item.settings! })),
            })
            Object.assign(values, result.values)
        } catch (error) {
            console.warn("wasm 目标值失败，回退 TS", error)
            tsItems.push(...wasmItems)
        }
    }
    for (const item of tsItems) {
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
    for (const [key, value] of Object.entries(values)) {
        if (!Number.isFinite(value)) {
            delete values[key]
            failed.push(key)
        }
    }
    self.postMessage({
        id: request.id,
        type: "result",
        values,
        ...(failed.length > 0 ? { failed } : {}),
        engine: wasmItems.length > 0 ? "wasm" : "ts",
    } satisfies CalcResponse)
}
