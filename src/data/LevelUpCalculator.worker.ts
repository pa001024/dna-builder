import type { Draft } from "./data-types"
import type { LevelUpCalculatorConfig, LevelUpResult, ResourceCost } from "./LevelUpCalculator"
import {
    type CharExt,
    calculateCharLevelUp,
    calculateModLevelUp,
    calculateWeaponLevelUp,
    estimateTime,
    type ModExt,
    type WeaponExt,
} from "./LevelUpCalculatorImpl"

// 定义 Worker 消息类型
export type WorkerMethod = "calculateCharLevelUp" | "calculateWeaponLevelUp" | "calculateModLevelUp" | "estimateTime" | "mergeCalculate"

// 合并计算请求数据类型
export type MergeCalculateData = {
    chars?: {
        chars: CharExt[]
        config: LevelUpCalculatorConfig
    }
    weapons?: {
        weapons: WeaponExt[]
        config: LevelUpCalculatorConfig
    }
    mods?: {
        mods: ModExt[]
        config: LevelUpCalculatorConfig
    }
    modDraftMap: Map<number, Draft>
    resourceDraftMap: Map<number, Draft>
}

export type CalculateCharLevelUpData = {
    chars: CharExt[]
    config: LevelUpCalculatorConfig
}

export type CalculateWeaponLevelUpData = {
    weapons: WeaponExt[]
    config: LevelUpCalculatorConfig
    resourceDraftMap: Map<number, Draft>
}

export type CalculateModLevelUpData = {
    mods: ModExt[]
    config: LevelUpCalculatorConfig
    modDraftMap: Map<number, Draft>
    resourceDraftMap: Map<number, Draft>
}

export type EstimateTimeData = {
    totalCost: ResourceCost
    modMap: Map<number, ModExt>
}

export type WorkerMessageData =
    | CalculateCharLevelUpData
    | CalculateWeaponLevelUpData
    | CalculateModLevelUpData
    | EstimateTimeData
    | MergeCalculateData

export interface WorkerMessage {
    type: "calculate"
    method: WorkerMethod
    data: WorkerMessageData
    id: number
}

// Worker 响应类型
export interface WorkerResponse {
    success: boolean
    result?:
        | LevelUpResult
        | ReturnType<typeof estimateTime>
        | { charResult?: LevelUpResult; weaponResult?: LevelUpResult; modResult?: LevelUpResult }
    error?: string
    id: number
}

// 处理 Worker 消息
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const { type, method, data, id } = event.data

    if (type === "calculate") {
        try {
            let result:
                | LevelUpResult
                | ReturnType<typeof estimateTime>
                | { charResult?: LevelUpResult; weaponResult?: LevelUpResult; modResult?: LevelUpResult }
            // 使用主进程传递的精简数据直接计算，不再加载全部数据
            switch (method) {
                case "calculateCharLevelUp": {
                    const charDataMsg = data as CalculateCharLevelUpData
                    result = calculateCharLevelUp(charDataMsg.chars, charDataMsg.config)
                    break
                }
                case "calculateWeaponLevelUp": {
                    const weaponDataMsg = data as CalculateWeaponLevelUpData
                    result = calculateWeaponLevelUp(
                        weaponDataMsg.weapons,
                        Object.fromEntries(weaponDataMsg.resourceDraftMap),
                        weaponDataMsg.config
                    )
                    break
                }
                case "calculateModLevelUp": {
                    const modDataMsg = data as CalculateModLevelUpData
                    result = calculateModLevelUp(modDataMsg.mods, modDataMsg.modDraftMap, modDataMsg.resourceDraftMap, modDataMsg.config)
                    break
                }
                case "estimateTime": {
                    const timeData = data as EstimateTimeData
                    result = estimateTime(timeData.totalCost, Object.fromEntries(timeData.modMap))
                    break
                }
                case "mergeCalculate": {
                    // 处理合并计算请求
                    const mergeData = data as MergeCalculateData
                    const results: { charResult?: LevelUpResult; weaponResult?: LevelUpResult; modResult?: LevelUpResult } = {}

                    // 计算角色养成结果
                    if (mergeData.chars) {
                        results.charResult = calculateCharLevelUp(mergeData.chars.chars, mergeData.chars.config)
                    }

                    // 计算武器养成结果
                    if (mergeData.weapons) {
                        results.weaponResult = calculateWeaponLevelUp(
                            mergeData.weapons.weapons,
                            Object.fromEntries(mergeData.resourceDraftMap),
                            mergeData.weapons.config
                        )
                    }

                    // 计算魔之楔养成结果
                    if (mergeData.mods) {
                        results.modResult = calculateModLevelUp(
                            mergeData.mods.mods,
                            mergeData.modDraftMap,
                            mergeData.resourceDraftMap,
                            mergeData.mods.config
                        )
                    }

                    result = results
                    break
                }
                default:
                    throw new Error(`Unknown method: ${method}`)
            }

            self.postMessage({ success: true, result, id } as WorkerResponse)
        } catch (error) {
            self.postMessage({ success: false, error: error instanceof Error ? error.message : String(error), id } as WorkerResponse)
        }
    }
}
