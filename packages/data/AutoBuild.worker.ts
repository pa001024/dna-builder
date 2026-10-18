import { type ModTypeKey, ModTypeMap } from "./CharBuild"
import { type CharBuildWorkerSnapshot, createBuildFromSnapshot, createWorkerSnapshot } from "./CharBuildSnapshot"
import type { Buff, Mod, Weapon } from "./data-types"
import { LeveledModWithCount } from "./leveled/LeveledMod"
import { LeveledWeapon } from "./leveled/LeveledWeapon"

export type AutoBuildModOption = {
    data: Mod
    level: number
    buffLv?: number
    effect?: Buff
    count: number
}

export type AutoBuildWeaponOption = {
    data: Weapon
    refine: number
    level: number
    effectLv?: number
    effect?: Buff
    forgeEffective: boolean
}

export interface AutoBuildRequest {
    id: number
    build: CharBuildWorkerSnapshot
    includeTypes: ModTypeKey[]
    preserveTypes: ModTypeKey[]
    fixedMelee: boolean
    fixedRanged: boolean
    modOptions: AutoBuildModOption[]
    meleeOptions: AutoBuildWeaponOption[]
    rangedOptions: AutoBuildWeaponOption[]
    enableLog: boolean
}

/** 实时日志消息：每生成一行构筑日志即回传主线程 */
export interface AutoBuildLogMessage {
    id: number
    type: "log"
    message: string
}

export interface AutoBuildResponse {
    id: number
    type: "result"
    newBuild?: CharBuildWorkerSnapshot
    log?: string
    iter?: number
    incomes?: Record<string, number>
    error?: string
}

export type AutoBuildWorkerMessage = AutoBuildLogMessage | AutoBuildResponse

/**
 * 从快照恢复带数量的 MOD 选项实例。
 * @param mod MOD 选项快照
 * @returns 带数量的 MOD 实例
 */
function createModOption(mod: AutoBuildModOption) {
    return new LeveledModWithCount(mod.data, mod.level, mod.buffLv, mod.count, mod.effect)
}

/**
 * 从快照恢复武器选项实例。
 * @param weapon 武器选项快照
 * @returns 武器实例
 */
function createWeaponOption(weapon: AutoBuildWeaponOption) {
    const leveled = new LeveledWeapon(weapon.data, weapon.refine, weapon.level, weapon.effectLv, weapon.effect)
    leveled.setForgeEffective(weapon.forgeEffective)
    return leveled
}

self.onmessage = (event: MessageEvent<AutoBuildRequest>) => {
    const { id } = event.data
    try {
        const build = createBuildFromSnapshot(event.data.build)
        const { newBuild, log, iter } = build.autoBuild({
            includeTypes: event.data.includeTypes,
            preserveTypes: event.data.preserveTypes,
            fixedMelee: event.data.fixedMelee,
            fixedRanged: event.data.fixedRanged,
            modOptions: event.data.modOptions.map(createModOption),
            meleeOptions: event.data.meleeOptions.map(createWeaponOption),
            rangedOptions: event.data.rangedOptions.map(createWeaponOption),
            enableLog: event.data.enableLog,
            // 实时回传每一行构筑日志
            onLog: message => {
                self.postMessage({ id, type: "log", message } satisfies AutoBuildLogMessage)
            },
        })
        // 批量计算最终构筑各槽位已装备 MOD 的边际收益，避免主线程重复计算
        const incomes: Record<string, number> = {}
        event.data.includeTypes.forEach(key => {
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
        } satisfies AutoBuildResponse)
    } catch (error) {
        self.postMessage({
            id,
            type: "result",
            error: error instanceof Error ? error.message : String(error),
        } satisfies AutoBuildResponse)
    }
}
