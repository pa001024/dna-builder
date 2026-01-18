import { getModDropInfo } from "../utils/reward-utils"
import { modDraftMap, modDungeonMap, modMap, resourceDraftMap, walnutRewardMap, weaponDraftMap } from "./d"
import { CashToExpRate, charLevelUpExpCost, weaponLevelUpExpCost } from "./d/levelup.data"
import type { Char, Draft, Mod, Skill, Weapon } from "./data-types"
import { LeveledMod } from "./leveled"

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
 * 养成计算器结果
 */
export interface LevelUpResult {
    totalCost: ResourceCost
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

const breakthroughPoint = [0, 20, 30, 40, 50, 60, 70, 80]

/**
 * 养成计算器
 * 用于计算角色、武器、魔之楔的养成资源消耗
 */

// biome-ignore lint/complexity/noStaticOnlyClass: 1
export class LevelUpCalculator {
    /**
     * 计算单个角色养成资源消耗
     * @param char 角色数据
     * @param config 角色养成配置
     * @returns 养成资源消耗结果
     */
    private static calculateSingleCharLevelUp(char: Char, config: CharLevelUpConfig): LevelUpResult {
        const { currentLevel, targetLevel } = config
        const currentBreakthrough = breakthroughPoint.findIndex(point => point >= currentLevel)
        const targetBreakthrough = breakthroughPoint.findIndex(point => point >= targetLevel)

        // 计算等级升级消耗
        const levelUpCost = LevelUpCalculator.calculateExpLevelUp(currentLevel, targetLevel, charLevelUpExpCost, "战斗旋律")

        // 计算突破消耗
        const breakthroughCost = LevelUpCalculator.calculateCharBreakthrough(char, currentBreakthrough, targetBreakthrough)

        // 计算技能升级消耗
        const skillCosts =
            config.skills?.map((skillConfig, index) =>
                LevelUpCalculator.calculateSkillLevelUp(char.技能[index], skillConfig.currentLevel, skillConfig.targetLevel)
            ) || []

        // 合并总消耗
        const totalCost = LevelUpCalculator.mergeCosts(levelUpCost, breakthroughCost, ...skillCosts)

        return {
            totalCost,
            details: {
                levelUp: levelUpCost,
                breakthrough: breakthroughCost,
                skills: LevelUpCalculator.mergeCosts(...skillCosts),
            },
        }
    }

    /**
     * 计算单个技能养成资源消耗
     * @param char 角色数据
     * @param config 技能养成配置
     * @returns 养成资源消耗结果
     */
    private static calculateSkillLevelUp(skill: Skill, currentLevel: number, targetLevel: number): ResourceCost {
        currentLevel = Math.max(currentLevel, 1)
        targetLevel = Math.min(targetLevel, 10)
        if (!skill.升级) return {}
        const skillCost = {} as ResourceCost
        // 计算从当前等级到目标等级所需的总经验
        for (let level = currentLevel; level < targetLevel; level++) {
            LevelUpCalculator.mergeCost(skillCost, skill.升级[level - 1])
        }
        return skillCost
    }

    /**
     * 计算单个武器养成资源消耗
     * @param weapon 武器数据
     * @param config 武器养成配置
     * @returns 养成资源消耗结果
     */
    private static calculateSingleWeaponLevelUp(weapon: Weapon, config: WeaponLevelUpConfig): LevelUpResult {
        const { currentLevel, targetLevel, currentRefine, targetRefine } = config
        const currentBreakthrough = breakthroughPoint.findIndex(point => point >= currentLevel)
        const targetBreakthrough = breakthroughPoint.findIndex(point => point >= targetLevel)

        // 计算等级升级消耗
        const levelUpCost = LevelUpCalculator.calculateExpLevelUp(currentLevel, targetLevel, weaponLevelUpExpCost, "武器说明书")

        // 计算突破消耗
        let breakthroughCost = {} as ResourceCost
        if (weapon) {
            breakthroughCost = LevelUpCalculator.calculateWeaponBreakthrough(weapon, currentBreakthrough, targetBreakthrough)
        }

        // 计算锻造消耗
        const craftCost = weapon ? LevelUpCalculator.calculateWeaponCraft(weapon, currentRefine, targetRefine) : {}

        // 合并总消耗
        const totalCost = LevelUpCalculator.mergeCosts(levelUpCost, breakthroughCost, craftCost)

        return {
            totalCost,
            details: {
                levelUp: levelUpCost,
                breakthrough: breakthroughCost,
                craft: craftCost,
            },
        }
    }

    /**
     * 计算单个魔之楔养成资源消耗
     * @param mod 魔之楔数据
     * @param config 魔之楔养成配置
     * @returns 养成资源消耗结果
     */
    private static calculateSingleModLevelUp(mod: Mod, config: ModLevelUpConfig): LevelUpResult {
        const { currentLevel, targetLevel } = config

        // 统一计算魔之楔升级消耗
        const totalCost = LevelUpCalculator.calculateModLevelUpCost(mod, currentLevel, targetLevel)
        const details = {
            levelUp: totalCost,
        }

        return {
            totalCost,
            details,
        }
    }

    /**
     * 计算角色养成资源消耗（支持多选）
     * @param chars 角色数据列表
     * @param config 计算器配置
     * @returns 养成资源消耗结果
     */
    static calculateCharLevelUp(chars: Char[], config: LevelUpCalculatorConfig): LevelUpResult {
        if (!config.chars || config.chars.length === 0 || chars.length === 0) {
            return LevelUpCalculator.getDefaultResult()
        }

        // 确保配置数量与角色数量匹配
        const configs = config.chars.slice(0, chars.length)

        // 计算每个角色的消耗
        const results = chars.map((char, index) => {
            const charConfig = configs[index] || configs[0] // 如果配置不足，使用第一个配置
            return LevelUpCalculator.calculateSingleCharLevelUp(char, charConfig)
        })

        // 合并结果
        return LevelUpCalculator.mergeResults(results)
    }

    /**
     * 计算武器养成资源消耗（支持多选）
     * @param weapons 武器数据列表
     * @param config 计算器配置
     * @returns 养成资源消耗结果
     */
    static calculateWeaponLevelUp(weapons: Weapon[], config: LevelUpCalculatorConfig): LevelUpResult {
        if (!config.weapons || config.weapons.length === 0 || weapons.length === 0) {
            return LevelUpCalculator.getDefaultResult()
        }

        // 确保配置数量与武器数量匹配
        const configs = config.weapons.slice(0, weapons.length)

        // 计算每个武器的消耗
        const results = weapons.map((weapon, index) => {
            const weaponConfig = configs[index] || configs[0] // 如果配置不足，使用第一个配置
            return LevelUpCalculator.calculateSingleWeaponLevelUp(weapon, weaponConfig)
        })

        // 合并结果
        return LevelUpCalculator.mergeResults(results)
    }

    /**
     * 计算魔之楔养成资源消耗（支持多选）
     * @param mods 魔之楔数据列表
     * @param config 计算器配置
     * @returns 养成资源消耗结果
     */
    static calculateModLevelUp(mods: Mod[], config: LevelUpCalculatorConfig): LevelUpResult {
        if (!config.mods || config.mods.length === 0 || mods.length === 0) {
            return LevelUpCalculator.getDefaultResult()
        }

        // 确保配置数量与魔之楔数量匹配
        const configs = config.mods.slice(0, mods.length)

        // 计算每个魔之楔的消耗
        const results = mods.map((mod, index) => {
            const modConfig = configs[index] || configs[0] // 如果配置不足，使用第一个配置
            return LevelUpCalculator.calculateSingleModLevelUp(mod, modConfig)
        })

        // 合并结果
        return LevelUpCalculator.mergeResults(results)
    }

    /**
     * 获取默认结果
     * @returns 默认养成资源消耗结果
     */
    private static getDefaultResult(): LevelUpResult {
        return {
            totalCost: {},
            details: {
                levelUp: {},
                breakthrough: {},
            },
        }
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

        // 计算时间估算
        const timeEstimate = LevelUpCalculator.estimateTime(totalCost)

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
            } as LevelUpResult["details"]
        )

        return {
            totalCost,
            timeEstimate,
            details,
        }
    }

    /**
     * 计算等级升级消耗
     * @param currentLevel 当前等级
     * @param targetLevel 目标等级
     * @param expArray 经验值数组
     * @param bookType 经验书类型
     * @returns 资源消耗
     */
    private static calculateExpLevelUp(currentLevel: number, targetLevel: number, expArray: number[], bookType: string): ResourceCost {
        let totalExp = 0
        currentLevel = Math.max(currentLevel, 1)
        targetLevel = Math.min(targetLevel, 80)
        // 计算从当前等级到目标等级所需的总经验
        for (let level = currentLevel; level < targetLevel; level++) {
            totalExp += expArray[level - 1]
        }

        // 计算铜币消耗
        const cashCost = totalExp * CashToExpRate
        function calculateExpBooks(
            totalExp: number,
            bookType: string
        ): {
            [bookName: string]: number
        } {
            const expBooks: { [bookName: string]: number } = {}

            // 经验书类型和经验值
            const bookValues = {
                一: 500,
                二: 2000,
                三: 8000,
                四: 20000,
            }

            let remainingExp = totalExp

            // 不使用四阶经验书
            // 1. 按8:3比例消耗一组（武器说明书·二: 8, 武器说明书·三: 3）
            const groupExp = bookValues.二 * 8 + bookValues.三 * 3
            const groups = Math.floor(remainingExp / groupExp)

            if (groups > 0) {
                expBooks[`${bookType}·二`] = groups * 8
                expBooks[`${bookType}·三`] = groups * 3
                remainingExp -= groups * groupExp
            }

            // 2. 剩余经验用不超过3本的三级经验书
            const maxThreeBooks = 3
            let threeBooks = 0

            while (threeBooks < maxThreeBooks && remainingExp >= bookValues.三) {
                threeBooks++
                remainingExp -= bookValues.三
            }

            if (threeBooks > 0) {
                expBooks[`${bookType}·三`] = (expBooks[`${bookType}·三`] || 0) + threeBooks
            }

            // 3. 然后用二级经验书
            if (remainingExp > 0) {
                const twoBooks = Math.ceil(remainingExp / bookValues.二)
                expBooks[`${bookType}·二`] = (expBooks[`${bookType}·二`] || 0) + twoBooks
                remainingExp = 0
            }

            return expBooks
        }
        return {
            铜币: cashCost,
            ...calculateExpBooks(totalExp, bookType),
        }
    }

    /**
     * 计算角色突破消耗
     * @param char 角色数据
     * @param currentBreakthrough 当前突破阶段
     * @param targetBreakthrough 目标突破阶段
     * @returns 资源消耗
     */
    private static calculateCharBreakthrough(char: Char, currentBreakthrough: number, targetBreakthrough: number): ResourceCost {
        const cost: ResourceCost = {}

        // 计算突破消耗
        if (char.突破 && Array.isArray(char.突破)) {
            for (let i = currentBreakthrough; i < targetBreakthrough; i++) {
                const breakthroughCost = char.突破[i]
                if (breakthroughCost && typeof breakthroughCost === "object") {
                    LevelUpCalculator.mergeCost(cost, breakthroughCost)
                }
            }
        }

        return cost
    }

    /**
     * 计算武器突破消耗
     * @param weapon 武器数据
     * @param currentBreakthrough 当前突破阶段
     * @param targetBreakthrough 目标突破阶段
     * @returns 资源消耗
     */
    private static calculateWeaponBreakthrough(weapon: Weapon, currentBreakthrough: number, targetBreakthrough: number): ResourceCost {
        const cost: ResourceCost = {}

        // 计算突破消耗
        if (weapon.突破 && Array.isArray(weapon.突破)) {
            for (let i = currentBreakthrough; i < targetBreakthrough; i++) {
                const breakthroughCost = weapon.突破[i]
                if (breakthroughCost && typeof breakthroughCost === "object") {
                    LevelUpCalculator.mergeCost(cost, breakthroughCost)
                }
            }
        }

        return cost
    }

    /**
     * 计算武器锻造消耗
     * @param weapon 武器数据
     * @returns 资源消耗
     */
    private static calculateWeaponCraft(weapon: Weapon, currentRefine: number = 0, targetRefine: number = 0): ResourceCost {
        const cost: ResourceCost = {}
        const needRefine = Math.max(0, targetRefine - currentRefine)

        // 查找武器图纸
        const draft = weaponDraftMap.get(weapon.id)
        function calcDraftCost(d: Draft, n = 1) {
            // 计算锻造材料
            if (d.m) {
                cost.铜币 = (cost.铜币 || 0) + d.m * n
            }

            if (walnutRewardMap.has(d.p)) {
                cost.委托密函线索 = ((cost.委托密函线索 as number) || 0) + 100 * n
            }

            if (d.x) {
                d.x.forEach(item => {
                    cost[item.n] = ((cost[item.n] as number) || 0) + item.c * n
                    if (item.t === "Resource" && item.id !== 20029 && item.id !== 20032) {
                        const sub = resourceDraftMap.get(item.id)
                        if (sub) {
                            calcDraftCost(sub, item.c * n)
                        }
                    }
                })
            }
        }
        if (draft) {
            calcDraftCost(draft, needRefine + 1)
        }

        return cost
    }

    /**
     * 计算魔之楔升级消耗（统一等级系统）
     * @param mod 魔之楔数据
     * @param currentLevel 当前等级
     * @param targetLevel 目标等级
     * @param quality 品质
     * @returns 资源消耗
     */
    private static calculateModLevelUpCost(mod: Mod, currentLevel: number, targetLevel: number): ResourceCost {
        // 计算1-5级基础升级消耗
        const baseStart = Math.max(0, currentLevel)
        const baseEnd = Math.min(LeveledMod.getMaxLevel(mod.品质), targetLevel)
        if (baseStart === baseEnd) return {}
        const cost: ResourceCost & { 深红凝珠: number; 铜币: number } = { 深红凝珠: 0, 铜币: 0 }

        // 基础升级消耗：1-5级，每级固定消耗深红凝珠递增
        const crimsonPearlCosts = [300, 600, 900, 1200, 1500, 3000, 4500, 6000, 7500, 9000] // 1→2, 2→3, 3→4, 4→5
        const goldCosts = [1500, 3000, 4500, 6000, 7500, 15000, 22500, 30000, 37500, 45000] // 1→2, 2→3, 3→4, 4→5

        // 增幅升级消耗：6-10级，金色魔之楔专属
        const gold = [1, 1, 2, 2, 3]
        if (baseStart < baseEnd) {
            for (let level = baseStart; level < baseEnd; level++) {
                cost.深红凝珠 += crimsonPearlCosts[level]
                cost.铜币 += goldCosts[level]
            }
        }
        const draft = modDraftMap.get(mod.id)
        function calcDraftCost(d: Draft, n = 1, sub: boolean = false) {
            const name = `图纸: ${mod.名称}`
            if (walnutRewardMap.has(mod.id)) {
                cost.委托密函线索 = ((cost.委托密函线索 as number) || 0) + 100 * n
            }
            let totalGold = 1
            if (mod.品质 === "金" && targetLevel > 5 && !sub) {
                // 计算6-10级增幅消耗（仅金色魔之楔）
                const ampStart = Math.max(5, currentLevel) - 5 // 转换为增幅索引 (0-4)
                const ampEnd = Math.min(10, targetLevel) - 5 // 转换为增幅索引 (0-4)

                for (let i = ampStart; i < ampEnd; i++) {
                    totalGold += gold[i]
                }
            }
            cost[name] = [totalGold * n, mod.id, "Draft"]
            // 金色魔之楔需要5个同名紫色魔之楔
            cost.铜币 += d.m * totalGold * n
            for (const costmod of d.x) {
                if (costmod.t === "Mod") {
                    cost[costmod.n] = [((cost[costmod.n] as number[]) || [0])[0] + costmod.c * totalGold * n, costmod.id, "Mod"]
                    // 递归查询 如羽翼消耗换生灵
                    if (modDraftMap.get(costmod.id)) {
                        calcDraftCost(modDraftMap.get(costmod.id)!, totalGold, true)
                    }
                } else if (costmod.t === "Resource") {
                    const sub = resourceDraftMap.get(costmod.id)
                    if (sub) {
                        calcDraftCost(sub, costmod.c * totalGold * n, true)
                    }
                }
            }
        }
        if (draft) {
            calcDraftCost(draft)
        }

        return cost
    }

    /**
     * 估算资源获取时间
     * @param totalCost 总消耗
     * @returns 时间估算
     */
    private static estimateTime(totalCost: ResourceCost) {
        // 副本配置：每个副本每次掉落的资源量（简化配置，实际应该从数据文件读取）
        const dungeonDropConfig = [
            {
                id: 90907,
                name: "深红凝珠",
                time: 0.5,
                items: {
                    深红凝珠: 540 * 1.15, // 每次副本获得的深红凝珠
                },
            },
            {
                id: 90607,
                name: "战斗旋律",
                time: 1,
                items: {
                    战斗旋律·二: 8 * 1.15, // 每次副本获得的战斗旋律·二
                    // 战斗旋律·三: 3, // 每次副本获得的战斗旋律·三
                },
            },
            {
                id: 90807,
                name: "角色经验",
                time: 1,
                items: {
                    武器说明书·二: 8 * 1.15, // 每次副本获得的武器说明书·二
                    // 武器说明书·三: 3, // 每次副本获得的武器说明书·三
                },
            },
            {
                id: 90427,
                name: "委托密函线索",
                time: 1,
                items: {
                    委托密函线索: 6,
                },
            },
            {
                id: 90114,
                name: "皎皎之民的信物",
                time: 3,
                items: {
                    皎皎之民的信物: 48.3,
                },
            },
        ]

        let totalMinutes = 0
        const dungeonTimes: Record<number, [times: number, reason: string]> = {}

        // 计算每个资源所需的副本次数和总时间
        for (const category of dungeonDropConfig) {
            for (const [resource, amount] of Object.entries(category.items)) {
                if (totalCost[resource]) {
                    const c = Array.isArray(totalCost[resource]) ? totalCost[resource][0] : totalCost[resource] || 0
                    const runsNeeded = Math.ceil(c / amount)
                    const minutesNeeded = runsNeeded * category.time
                    totalMinutes += minutesNeeded
                    dungeonTimes[category.id] = [dungeonTimes[category.id]?.[0] || 0 + runsNeeded, category.name]
                }
            }
        }

        const otherDungeonTime: Record<string, number> = {
            Defense: 1, // 扼守
            ExtermPro: 0.5, // 驱离
            SurvivalMiniPro: 0.7, // 避险
        }
        for (const amount of Object.values(totalCost)) {
            if (Array.isArray(amount)) {
                const c = amount[0]
                // 处理魔之楔掉落
                const modId = amount[1]
                const dungeons = modDungeonMap.get(modId)
                if (dungeons) {
                    const minTimesDungeon = dungeons
                        .map(d => ({ ...d, ...getModDropInfo(d, modId) }))
                        .sort((a, b) => (b.pp || 0) - (a.pp || 0))[0]

                    const minutesNeeded = otherDungeonTime[minTimesDungeon.t] || 1
                    totalMinutes += minutesNeeded * (c * (minTimesDungeon.times || 0))
                    dungeonTimes[minTimesDungeon.id] = [
                        dungeonTimes[minTimesDungeon.id]?.[0] || 0 + c * (minTimesDungeon.times || 0),
                        (amount[2] === "Draft" ? "图纸: " : "") + modMap.get(modId)?.名称 || "-",
                    ]
                }
            }
        }

        // 转换为天和小时
        const totalHours = totalMinutes / 60
        const days = Math.floor(totalHours / 24)
        const hours = Math.floor(totalHours % 24)
        const mins = Math.floor(totalMinutes % 60)

        return {
            days,
            hours,
            mins,
            dungeonTimes,
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
                if (Array.isArray(amount)) {
                    cost[resource] = [((cost[resource] as number[]) || [0])[0] + amount[0], amount[1], amount[2]]
                } else {
                    cost[resource] = ((cost[resource] as number) || 0) + (amount || 0)
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
}
