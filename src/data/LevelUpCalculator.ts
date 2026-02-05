import { getModDropInfo } from "../utils/reward-utils"
import { draftDungeonMap, modDraftMap, modDungeonMap, resourceDraftMap, weaponDraftMap } from "./d"
import modData from "./d/mod.data"
import { draftShopSourceMap, modShopSourceMap, weaponShopSourceMap } from "./d/shop.data"
import type { Char, Mod, Weapon } from "./data-types"
import type { MergeCalculateData, WorkerMessageData, WorkerMethod, WorkerResponse } from "./LevelUpCalculator.worker"
import type { ModExt, WeaponExt } from "./LevelUpCalculatorImpl"

/**
 * 角色养成配置
 */
export interface CharLevelUpConfig {
    currentLevel: number
    targetLevel: number

    skills: [SkillLevelUpConfig, SkillLevelUpConfig, SkillLevelUpConfig]
}

export interface SkillLevelUpConfig {
    currentLevel: number
    targetLevel: number
}

/**
 * 武器养成配置
 */
export interface WeaponLevelUpConfig {
    currentLevel: number
    targetLevel: number
    currentRefine: number // 当前的熔炼等级
    targetRefine: number // 目标的熔炼等级
}

/**
 * 魔之楔养成配置
 */
export interface ModLevelUpConfig {
    currentLevel: number
    targetLevel: number
    count: number
}

/**
 * 养成计算器配置
 */
export interface LevelUpCalculatorConfig {
    // 角色相关（支持多选）
    chars?: CharLevelUpConfig[]
    // 武器相关（支持多选）
    weapons?: WeaponLevelUpConfig[]
    // 魔之楔相关（支持多选）
    mods?: ModLevelUpConfig[]
}

/**
 * 资源消耗结果
 */
export interface ResourceCost {
    [resourceName: string]: [number, number, "Mod" | "Draft"] | number | undefined
    铜币?: number
    深红凝珠?: number
}

/**
 * 资源依赖树节点
 */
export interface ResourceTreeNode {
    id: string
    cid?: number
    name: string
    type: "Resource" | "Mod" | "Draft"
    amount: number
    children?: ResourceTreeNode[]
}

/**
 * 养成计算器结果
 */
export interface LevelUpResult {
    totalCost: ResourceCost
    resourceTree?: ResourceTreeNode
    timeEstimate?: {
        days: number
        hours: number
        mins: number
        dungeonTimes: Record<number, [number, string]>
    }
    details: {
        levelUp: ResourceCost
        breakthrough?: ResourceCost
        craft?: ResourceCost
        skills?: ResourceCost
    }
}

export interface DungeonWithDrops {
    id: number
    name: string
    time: number
    items: Record<string, number>
    originalType?: string
    count?: number
}

/**
 * 时间估算结果
 */
export interface TimeEstimateResult {
    days: number
    hours: number
    mins: number
    dungeonTimes: Record<number, [number, string]>
}

/**
 * 养成计算器
 * 用于计算角色、武器、魔之楔的养成资源消耗
 * 支持 Web Worker 异步计算
 */

export class LevelUpCalculator {
    private worker: Worker | null = null
    private pendingPromises: Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }> = new Map()
    private messageId = 0

    /**
     * 构造函数
     */
    constructor() {
        // 初始化 Worker 相关状态
        this.worker = null
        this.pendingPromises = new Map()
        this.messageId = 0
    }

    /**
     * 初始化 Web Worker
     */
    private initWorker(): Worker {
        if (!this.worker) {
            this.worker = new Worker(new URL("./LevelUpCalculator.worker.ts", import.meta.url), {
                type: "module",
            })

            this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                const { success, result, error, id } = event.data
                const promise = this.pendingPromises.get(id)
                if (promise) {
                    this.pendingPromises.delete(id)
                    if (success && result) {
                        promise.resolve(result)
                    } else {
                        promise.reject(new Error(error || "Unknown error"))
                    }
                }
            }

            this.worker.onerror = error => {
                console.error("Worker error:", error)
                this.pendingPromises.forEach(promise => {
                    promise.reject(new Error("Worker error"))
                })
                this.pendingPromises.clear()
            }
        }
        return this.worker
    }

    /**
     * 向 Worker 发送消息并获取结果
     */
    private async sendMessage(method: WorkerMethod, data: WorkerMessageData): Promise<LevelUpResult | TimeEstimateResult> {
        const worker = this.initWorker()
        const id = ++this.messageId

        return new Promise((resolve, reject) => {
            this.pendingPromises.set(id, { resolve, reject })
            worker.postMessage({
                type: "calculate",
                method,
                data,
                id,
            })
        })
    }

    /**
     * 清洗配置数据，移除响应式代理
     * @param config 响应式配置数据
     * @returns 清洗后的配置数据
     */
    private cleanConfig(config: LevelUpCalculatorConfig): LevelUpCalculatorConfig {
        // 使用 JSON 序列化/反序列化移除响应式代理
        return JSON.parse(JSON.stringify(config))
    }

    /**
     * 提取角色计算所需的最小数据集
     * @param char 角色数据
     * @returns 精简后的角色数据
     */
    private extractMinimalCharData(char: Char) {
        return {
            id: char.id,
            突破: char.突破,
            技能: char.技能.map(skill => ({
                升级: skill.升级,
            })),
        }
    }

    /**
     * 提取武器计算所需的最小数据集
     * @param weapon 武器数据
     * @returns 精简后的武器数据
     */
    private extractMinimalWeaponData(weapon: Weapon): WeaponExt {
        console.log(weapon, weaponShopSourceMap.get(weapon.id))
        return {
            id: weapon.id,
            突破: weapon.突破,
            walnut: weaponShopSourceMap.get(weapon.id) && 1,
            draft: weaponDraftMap.get(weapon.id),
        }
    }

    /**
     * 提取魔之楔计算所需的最小数据集
     * @param mod 魔之楔数据
     * @returns 精简后的魔之楔数据
     */
    extractMinimalModData(mod: Mod): ModExt {
        const draft = modDraftMap.get(mod.id)
        const costDraft = modDraftMap.get(mod.消耗?.[0] || mod.id)
        let shop = undefined as { price: string; n: number } | undefined
        if (draft) {
            const item = draftShopSourceMap.get(draft.id)
            if (item) {
                shop = { price: item.cost, n: item.n }
            }
        }
        return {
            id: mod.id,
            品质: mod.品质,
            名称: mod.名称,
            消耗: mod.消耗,
            draft,
            costDraft,
            walnut: modShopSourceMap.get(mod.id) && 1,
            shop,
            dropInfo: modDungeonMap.get(mod.id)?.map(d => ({
                id: d.id,
                name: d.n,
                t: d.t,
                dropInfo: getModDropInfo(d, mod.id),
            })),
            draftInfo: draftDungeonMap.get(mod.id)?.map(d => ({
                id: d.id,
                name: d.n,
                t: d.t,
                dropInfo: getModDropInfo(d, mod.id),
            })),
        }
    }

    /**
     * 计算角色养成资源消耗（支持多选）
     * @param chars 角色数据列表
     * @param config 计算器配置
     * @returns 养成资源消耗结果
     */
    async calculateCharLevelUp(chars: Char[], config: LevelUpCalculatorConfig): Promise<LevelUpResult> {
        if (!config.chars || config.chars.length === 0 || chars.length === 0) {
            return this.getDefaultResult()
        }
        // 清洗配置数据，移除响应式代理
        const cleanConfig = this.cleanConfig(config)
        // 提取最小数据集，只传递计算所需的字段
        const minimalChars = chars.map(char => this.extractMinimalCharData(char))
        return this.sendMessage("calculateCharLevelUp", { chars: minimalChars, config: cleanConfig }) as Promise<LevelUpResult>
    }

    /**
     * 计算武器养成资源消耗（支持多选）
     * @param weapons 武器数据列表
     * @param config 计算器配置
     * @returns 养成资源消耗结果
     */
    async calculateWeaponLevelUp(weapons: Weapon[], config: LevelUpCalculatorConfig): Promise<LevelUpResult> {
        if (!config.weapons || config.weapons.length === 0 || weapons.length === 0) {
            return this.getDefaultResult()
        }
        // 清洗配置数据，移除响应式代理
        const cleanConfig = this.cleanConfig(config)
        // 提取最小数据集，只传递计算所需的字段
        const minimalWeapons = weapons.map(weapon => this.extractMinimalWeaponData(weapon))
        return this.sendMessage("calculateWeaponLevelUp", {
            weapons: minimalWeapons,
            config: cleanConfig,
            resourceDraftMap,
        }) as Promise<LevelUpResult>
    }

    /**
     * 计算魔之楔养成资源消耗（支持多选）
     * @param mods 魔之楔数据列表
     * @param config 计算器配置
     * @returns 养成资源消耗结果
     */
    async calculateModLevelUp(mods: Mod[], config: LevelUpCalculatorConfig): Promise<LevelUpResult> {
        if (!config.mods || config.mods.length === 0 || mods.length === 0) {
            return this.getDefaultResult()
        }
        // 清洗配置数据，移除响应式代理
        const cleanConfig = this.cleanConfig(config)
        // 提取最小数据集，只传递计算所需的字段
        const minimalMods = mods.map(mod => this.extractMinimalModData(mod))
        return this.sendMessage("calculateModLevelUp", {
            mods: minimalMods,
            config: cleanConfig,
            modDraftMap,
            resourceDraftMap,
        }) as Promise<LevelUpResult>
    }

    /**
     * 估算资源获取时间
     * @param totalCost 总消耗
     * @returns 时间估算
     */
    async estimateTime(totalCost: ResourceCost): Promise<TimeEstimateResult> {
        const modMap = modData
            .map(mod => this.extractMinimalModData(mod))
            .reduce((acc, mod) => {
                acc.set(mod.id, mod)
                return acc
            }, new Map<number, ModExt>())
        return (await this.sendMessage("estimateTime", { totalCost, modMap })) as TimeEstimateResult
    }

    /**
     * 合并计算所有养成资源消耗
     * @param chars 角色数据列表
     * @param charConfig 角色配置列表
     * @param weapons 武器数据列表
     * @param weaponConfig 武器配置列表
     * @param mods 魔之楔数据列表
     * @param modConfig 魔之楔配置列表
     * @returns 合并后的养成资源消耗结果
     */
    async mergeCalculate(
        chars?: Char[],
        charConfig?: CharLevelUpConfig[],
        weapons?: Weapon[],
        weaponConfig?: WeaponLevelUpConfig[],
        mods?: Mod[],
        modConfig?: ModLevelUpConfig[]
    ): Promise<{ charResult?: LevelUpResult; weaponResult?: LevelUpResult; modResult?: LevelUpResult }> {
        const message: MergeCalculateData = {
            modDraftMap,
            resourceDraftMap,
        }

        // 添加角色计算请求
        if (chars && charConfig && chars.length > 0 && charConfig.length > 0) {
            const minimalChars = chars.map(char => this.extractMinimalCharData(char))
            const cleanConfig = this.cleanConfig({ chars: charConfig })
            message.chars = { chars: minimalChars, config: cleanConfig }
        }

        // 添加武器计算请求
        if (weapons && weaponConfig && weapons.length > 0 && weaponConfig.length > 0) {
            const minimalWeapons = weapons.map(weapon => this.extractMinimalWeaponData(weapon))
            const cleanConfig = this.cleanConfig({ weapons: weaponConfig })
            message.weapons = { weapons: minimalWeapons, config: cleanConfig }
        }

        // 添加魔之楔计算请求
        if (mods && modConfig && mods.length > 0 && modConfig.length > 0) {
            const minimalMods = mods.map(mod => this.extractMinimalModData(mod))
            const cleanConfig = this.cleanConfig({ mods: modConfig })
            message.mods = { mods: minimalMods, config: cleanConfig }
        }

        if (Object.keys(message).length === 0) {
            return {}
        }

        // 使用自定义方法名发送合并计算请求
        return (await this.sendMessage("mergeCalculate", message)) as {
            charResult?: LevelUpResult
            weaponResult?: LevelUpResult
            modResult?: LevelUpResult
        }
    }

    /**
     * 获取默认结果
     * @returns 默认养成资源消耗结果
     */
    private getDefaultResult(): LevelUpResult {
        return {
            totalCost: {},
            details: {
                levelUp: {},
                breakthrough: {},
            },
        }
    }

    /**
     * 合并单个资源消耗到总成本
     * @param cost 总成本
     * @param newCost 新的资源消耗
     */
    private static mergeCost(cost: ResourceCost, newCost: ResourceCost) {
        if (newCost && typeof newCost === "object") {
            for (const [resource, amount] of Object.entries(newCost)) {
                if (amount !== undefined) {
                    if (Array.isArray(amount)) {
                        const currentValue = cost[resource]
                        if (Array.isArray(currentValue)) {
                            cost[resource] = [currentValue[0] + amount[0], amount[1], amount[2]]
                        } else {
                            cost[resource] = [amount[0], amount[1], amount[2]]
                        }
                    } else {
                        const currentValue = cost[resource] as number | undefined
                        cost[resource] = (currentValue || 0) + amount
                    }
                }
            }
        }
    }

    /**
     * 合并多个资源消耗
     * @param costs 多个资源消耗
     * @returns 合并后的资源消耗
     */
    private static mergeCosts(...costs: ResourceCost[]): ResourceCost {
        const result: ResourceCost = {}

        for (const cost of costs) {
            LevelUpCalculator.mergeCost(result, cost)
        }

        return result
    }

    /**
     * 合并多个养成结果
     * @param results 养成结果列表
     * @returns 合并后的养成资源消耗结果
     */
    static mergeResults(results: LevelUpResult[]): LevelUpResult {
        // 合并总消耗
        const totalCost = results.reduce((acc, result) => {
            return LevelUpCalculator.mergeCosts(acc, result.totalCost)
        }, {} as ResourceCost)

        // 合并详情
        const details = results.reduce(
            (acc, result) => {
                // 合并等级升级消耗
                acc.levelUp = LevelUpCalculator.mergeCosts(acc.levelUp, result.details.levelUp)

                // 合并突破消耗
                acc.breakthrough = LevelUpCalculator.mergeCosts(acc.breakthrough || {}, result.details.breakthrough || {})

                // 合并锻造消耗（如果有）
                if (result.details.craft) {
                    acc.craft = LevelUpCalculator.mergeCosts(acc.craft || {}, result.details.craft)
                }

                // 合并技能升级消耗（如果有）
                if (result.details.skills) {
                    acc.skills = LevelUpCalculator.mergeCosts(acc.skills || {}, result.details.skills)
                }

                return acc
            },
            {
                levelUp: {},
                breakthrough: {},
                craft: {},
                skills: {},
            } as LevelUpResult["details"]
        )

        // 合并资源依赖树
        let resourceTree: ResourceTreeNode | undefined
        if (results.length > 0) {
            // 收集所有结果的资源树
            const resourceTrees = results.map(result => result.resourceTree).filter((tree): tree is ResourceTreeNode => tree !== undefined)

            if (resourceTrees.length > 0) {
                if (resourceTrees.length === 1) {
                    // 如果只有一个资源树，直接使用它
                    resourceTree = resourceTrees[0]
                } else {
                    // 如果有多个资源树，创建一个根节点来包含它们
                    resourceTree = {
                        id: "root",
                        name: "总资源依赖",
                        type: "Resource",
                        amount: 1,
                        children: resourceTrees,
                    }
                }
            }
        }

        return {
            totalCost,
            resourceTree,
            details,
        }
    }

    /**
     * 销毁实例，清理资源
     */
    destroy(): void {
        if (this.worker) {
            this.worker.terminate()
            this.worker = null
            this.pendingPromises.forEach(promise => promise.reject(new Error("Worker destroyed")))
            this.pendingPromises.clear()
        }
    }
}
