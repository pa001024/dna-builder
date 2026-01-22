import type { Char, Mod, Weapon } from "./data-types"
import type { LevelUpCalculatorConfig, LevelUpResult, ResourceCost } from "./LevelUpCalculator"
import { LevelUpCalculatorImpl } from "./LevelUpCalculatorImpl"

// 定义 Worker 消息类型
type WorkerMethod = "calculateCharLevelUp" | "calculateWeaponLevelUp" | "calculateModLevelUp" | "estimateTime" | "mergeCalculate"

// 合并计算请求数据类型
type MergeCalculateData = {
    chars?: {
        chars: Char[]
        config: LevelUpCalculatorConfig
    }
    weapons?: {
        weapons: Weapon[]
        config: LevelUpCalculatorConfig
    }
    mods?: {
        mods: Mod[]
        config: LevelUpCalculatorConfig
    }
}

type CalculateCharLevelUpData = {
    chars: Char[]
    config: LevelUpCalculatorConfig
}

type CalculateWeaponLevelUpData = {
    weapons: Weapon[]
    config: LevelUpCalculatorConfig
}

type CalculateModLevelUpData = {
    mods: Mod[]
    config: LevelUpCalculatorConfig
}

type EstimateTimeData = {
    totalCost: ResourceCost
}

type WorkerMessageData =
    | CalculateCharLevelUpData
    | CalculateWeaponLevelUpData
    | CalculateModLevelUpData
    | EstimateTimeData
    | MergeCalculateData

interface WorkerMessage {
    type: "calculate"
    method: WorkerMethod
    data: WorkerMessageData
    id: number
}

// Worker 响应类型
interface WorkerResponse {
    success: boolean
    result?:
        | LevelUpResult
        | ReturnType<typeof LevelUpCalculatorImpl.estimateTime>
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
                | ReturnType<typeof LevelUpCalculatorImpl.estimateTime>
                | { charResult?: LevelUpResult; weaponResult?: LevelUpResult; modResult?: LevelUpResult }

            // 使用主进程传递的精简数据直接计算，不再加载全部数据
            switch (method) {
                case "calculateCharLevelUp": {
                    const charDataMsg = data as CalculateCharLevelUpData
                    result = LevelUpCalculatorImpl.calculateCharLevelUp(charDataMsg.chars, charDataMsg.config)
                    break
                }
                case "calculateWeaponLevelUp": {
                    const weaponDataMsg = data as CalculateWeaponLevelUpData
                    result = LevelUpCalculatorImpl.calculateWeaponLevelUp(weaponDataMsg.weapons, weaponDataMsg.config)
                    break
                }
                case "calculateModLevelUp": {
                    const modDataMsg = data as CalculateModLevelUpData
                    result = LevelUpCalculatorImpl.calculateModLevelUp(modDataMsg.mods, modDataMsg.config)
                    break
                }
                case "estimateTime": {
                    const timeData = data as EstimateTimeData
                    result = LevelUpCalculatorImpl.estimateTime(timeData.totalCost)
                    break
                }
                case "mergeCalculate": {
                    // 处理合并计算请求
                    const mergeData = data as MergeCalculateData
                    const results: { charResult?: LevelUpResult; weaponResult?: LevelUpResult; modResult?: LevelUpResult } = {}

                    // 计算角色养成结果
                    if (mergeData.chars) {
                        results.charResult = LevelUpCalculatorImpl.calculateCharLevelUp(mergeData.chars.chars, mergeData.chars.config)
                    }

                    // 计算武器养成结果
                    if (mergeData.weapons) {
                        results.weaponResult = LevelUpCalculatorImpl.calculateWeaponLevelUp(
                            mergeData.weapons.weapons,
                            mergeData.weapons.config
                        )
                    }

                    // 计算魔之楔养成结果
                    if (mergeData.mods) {
                        results.modResult = LevelUpCalculatorImpl.calculateModLevelUp(mergeData.mods.mods, mergeData.mods.config)
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
