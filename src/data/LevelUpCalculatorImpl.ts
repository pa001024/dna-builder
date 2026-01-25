import { getModDropInfo } from "../utils/reward-utils"
import { draftDungeonMap, modDraftMap, modDungeonMap, modMap, resourceDraftMap, walnutRewardMap, weaponDraftMap } from "./d"
import { CashToExpRate, charLevelUpExpCost, weaponLevelUpExpCost } from "./d/levelup.data"
import type { Char, Draft, Dungeon, Mod, Skill, Weapon } from "./data-types"
import type {
    CharLevelUpConfig,
    LevelUpCalculatorConfig,
    LevelUpResult,
    ModLevelUpConfig,
    ResourceCost,
    WeaponLevelUpConfig,
} from "./LevelUpCalculator"
import { LeveledMod } from "./leveled"

/**
 * 养成计算器
 * 用于计算角色、武器、魔之楔的养成资源消耗
 */

const breakthroughPoint = [0, 20, 30, 40, 50, 60, 70, 80]

export interface DungeonWithDrops {
    id: number
    name: string
    time: number
    items: Record<string, number>
    originalType?: string
    count?: number
}

// biome-ignore lint/complexity/noStaticOnlyClass: 1
export class LevelUpCalculatorImpl {
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
        const levelUpCost = LevelUpCalculatorImpl.calculateExpLevelUp(currentLevel, targetLevel, charLevelUpExpCost, "战斗旋律")

        // 计算突破消耗
        const breakthroughCost = LevelUpCalculatorImpl.calculateCharBreakthrough(char, currentBreakthrough, targetBreakthrough)

        // 计算技能升级消耗
        const skillCosts =
            config.skills?.map((skillConfig, index) =>
                LevelUpCalculatorImpl.calculateSkillLevelUp(char.技能[index], skillConfig.currentLevel, skillConfig.targetLevel)
            ) || []

        // 合并总消耗
        const totalCost = LevelUpCalculatorImpl.mergeCosts(levelUpCost, breakthroughCost, ...skillCosts)

        return {
            totalCost,
            details: {
                levelUp: levelUpCost,
                breakthrough: breakthroughCost,
                skills: LevelUpCalculatorImpl.mergeCosts(...skillCosts),
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
            LevelUpCalculatorImpl.mergeCost(skillCost, skill.升级[level])
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
        const levelUpCost = LevelUpCalculatorImpl.calculateExpLevelUp(currentLevel, targetLevel, weaponLevelUpExpCost, "武器说明书")

        // 计算突破消耗
        let breakthroughCost = {} as ResourceCost
        if (weapon) {
            breakthroughCost = LevelUpCalculatorImpl.calculateWeaponBreakthrough(weapon, currentBreakthrough, targetBreakthrough)
        }

        // 计算锻造消耗
        const craftCost = weapon ? LevelUpCalculatorImpl.calculateWeaponCraft(weapon, currentRefine, targetRefine) : {}

        // 合并总消耗
        const totalCost = LevelUpCalculatorImpl.mergeCosts(levelUpCost, breakthroughCost, craftCost)

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
        const { currentLevel, targetLevel, count } = config

        // 统一计算魔之楔升级消耗
        const totalCost = LevelUpCalculatorImpl.calculateModLevelUpCost(mod, currentLevel, targetLevel, count)
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
            return LevelUpCalculatorImpl.getDefaultResult()
        }

        // 确保配置数量与角色数量匹配
        const configs = config.chars.slice(0, chars.length)

        // 计算每个角色的消耗
        const results = chars.map((char, index) => {
            const charConfig = configs[index] || configs[0] // 如果配置不足，使用第一个配置
            return LevelUpCalculatorImpl.calculateSingleCharLevelUp(char, charConfig)
        })

        // 合并结果
        return LevelUpCalculatorImpl.mergeResults(results)
    }

    /**
     * 计算武器养成资源消耗（支持多选）
     * @param weapons 武器数据列表
     * @param config 计算器配置
     * @returns 养成资源消耗结果
     */
    static calculateWeaponLevelUp(weapons: Weapon[], config: LevelUpCalculatorConfig): LevelUpResult {
        if (!config.weapons || config.weapons.length === 0 || weapons.length === 0) {
            return LevelUpCalculatorImpl.getDefaultResult()
        }

        // 确保配置数量与武器数量匹配
        const configs = config.weapons.slice(0, weapons.length)

        // 计算每个武器的消耗
        const results = weapons.map((weapon, index) => {
            const weaponConfig = configs[index] || configs[0] // 如果配置不足，使用第一个配置
            return LevelUpCalculatorImpl.calculateSingleWeaponLevelUp(weapon, weaponConfig)
        })

        // 合并结果
        return LevelUpCalculatorImpl.mergeResults(results)
    }

    /**
     * 计算魔之楔养成资源消耗（支持多选）
     * @param mods 魔之楔数据列表
     * @param config 计算器配置
     * @returns 养成资源消耗结果
     */
    static calculateModLevelUp(mods: Mod[], config: LevelUpCalculatorConfig): LevelUpResult {
        if (!config.mods || config.mods.length === 0 || mods.length === 0) {
            return LevelUpCalculatorImpl.getDefaultResult()
        }

        // 确保配置数量与魔之楔数量匹配
        const configs = config.mods.slice(0, mods.length)

        // 计算每个魔之楔的消耗
        const results = mods.map((mod, index) => {
            const modConfig = configs[index] || configs[0] // 如果配置不足，使用第一个配置
            return LevelUpCalculatorImpl.calculateSingleModLevelUp(mod, modConfig)
        })

        // 合并结果
        return LevelUpCalculatorImpl.mergeResults(results)
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
            return LevelUpCalculatorImpl.mergeCosts(acc, result.totalCost)
        }, {} as ResourceCost)

        // 合并详情
        const details = results.reduce(
            (acc, result) => {
                // 合并等级升级消耗
                acc.levelUp = LevelUpCalculatorImpl.mergeCosts(acc.levelUp, result.details.levelUp)

                // 合并突破消耗
                acc.breakthrough = LevelUpCalculatorImpl.mergeCosts(acc.breakthrough || {}, result.details.breakthrough || {})

                // 合并锻造消耗（如果有）
                if (result.details.craft) {
                    acc.craft = LevelUpCalculatorImpl.mergeCosts(acc.craft || {}, result.details.craft)
                }
                // 合并技能升级消耗（如果有）
                if (result.details.skills) {
                    acc.skills = LevelUpCalculatorImpl.mergeCosts(acc.skills || {}, result.details.skills)
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
                    LevelUpCalculatorImpl.mergeCost(cost, breakthroughCost)
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
                    LevelUpCalculatorImpl.mergeCost(cost, breakthroughCost)
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
    private static calculateModLevelUpCost(mod: Mod, currentLevel: number, targetLevel: number, count: number = 1): ResourceCost {
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
            let totalGold = 1 * n
            if (mod.品质 === "金" && targetLevel > 5 && !sub) {
                // 计算6-10级增幅消耗（仅金色魔之楔）
                const ampStart = Math.max(5, currentLevel) - 5 // 转换为增幅索引 (0-4)
                const ampEnd = Math.min(10, targetLevel) - 5 // 转换为增幅索引 (0-4)

                for (let i = ampStart; i < ampEnd; i++) {
                    totalGold += gold[i] * n
                }
            }
            cost[name] = [totalGold, mod.id, "Draft"]
            // 金色魔之楔需要5个同名紫色魔之楔
            cost.铜币 += d.m * totalGold
            for (const costmod of d.x) {
                if (costmod.t === "Mod") {
                    cost[costmod.n] = [((cost[costmod.n] as number[]) || [0])[0] + costmod.c * totalGold, costmod.id, "Mod"]
                    // 递归查询 如羽翼消耗换生灵
                    if (modDraftMap.get(costmod.id)) {
                        calcDraftCost(modDraftMap.get(costmod.id)!, totalGold, true)
                    }
                } else if (costmod.t === "Resource") {
                    const sub = resourceDraftMap.get(costmod.id)
                    if (sub) {
                        calcDraftCost(sub, costmod.c * totalGold, true)
                    }
                }
            }
        }
        if (draft) {
            calcDraftCost(draft, count)
        }

        return cost
    }

    // 基础副本配置：普通资源的副本
    static baseDungeonDropConfig: DungeonWithDrops[] = [
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
                // 战斗旋律·三: 3 * 1.15, // 每次副本获得的战斗旋律·三
            },
        },
        {
            id: 90807,
            name: "角色经验",
            time: 1,
            items: {
                武器说明书·二: 8 * 1.15, // 每次副本获得的武器说明书·二
                // 武器说明书·三: 3 * 1.15, // 每次副本获得的武器说明书·三
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
    // 定义不同类型副本的时间
    static otherDungeonTime: Record<string, number> = {
        Defense: 1, // 扼守
        ExtermPro: 0.5, // 驱离
        SurvivalMiniPro: 0.7, // 避险
    }

    /**
     * 获取最高效率魔之楔副本 (时间加权/动态模拟版)
     * 策略：
     * 1. 预计算所有相关副本针对所需资源的"分均掉率" (Drop Per Minute, DPM)。
     * 2. 迭代模拟：在每一步选择当前需求下 DPM 总和最高的副本。
     * 3. 计算该最优副本的"瓶颈资源"（最先被刷满的资源），计算刷满所需的次数。
     * 4. 累加次数，扣除资源需求。若某个资源需求归零，则在下一轮计算中不再贡献 DPM，从而触发副本切换。
     */
    static getModDropDungeons(totalCost: ResourceCost) {
        // --- 1. 初始化数据结构 ---

        // 记录资源的剩余需求量: "Draft-123" -> 100
        const remainingNeeds = new Map<string, number>()

        // 记录资源元数据（用于稀缺度排序）
        const resourceMeta = new Map<string, { sourceCount: number }>()

        // 缓存：DungeonID -> 包含的掉落信息列表 { 资源key, 分均掉率, 原掉率 }
        // 作用：预计算掉率和时间比，避免循环中重复计算
        const dungeonEfficiencyCache = new Map<number, { key: string; dpm: number; rawRate: number }[]>()

        // 缓存：DungeonID -> Dungeon对象
        // 作用：避免后续需要获取副本名称或类型时无法找到原始对象
        const dungeonLookup = new Map<number, Dungeon>()

        // 辅助函数：获取副本时间 (分钟)
        const getDungeonTime = (d: Dungeon) => LevelUpCalculatorImpl.otherDungeonTime[d.t] || 1

        // --- 2. 解析需求并构建缓存 ---
        for (const amount of Object.values(totalCost)) {
            if (Array.isArray(amount)) {
                const [count, modId, type] = amount
                if (count <= 0) continue

                const key = `${type}-${modId}`
                remainingNeeds.set(key, count)

                // 获取该资源的所有来源副本
                const dungeons = (type === "Draft" ? draftDungeonMap.get(modId) : modDungeonMap.get(modId)) || []

                // 记录稀缺度 (来源越少越稀缺)
                resourceMeta.set(key, { sourceCount: dungeons.length })

                // 遍历副本构建缓存
                for (const dungeon of dungeons) {
                    // 2.1 缓存 Dungeon 对象引用，实现 O(1) 查找
                    if (!dungeonLookup.has(dungeon.id)) {
                        dungeonLookup.set(dungeon.id, dungeon)
                    }

                    // 2.2 计算掉率效率
                    const dropInfo = getModDropInfo(dungeon, modId)
                    const rawRate = dropInfo.pp || 0 // pp 是掉落概率 (0-1)
                    if (rawRate <= 0) continue

                    const time = getDungeonTime(dungeon)
                    const dpm = rawRate / time // 分均掉率

                    if (!dungeonEfficiencyCache.has(dungeon.id)) {
                        dungeonEfficiencyCache.set(dungeon.id, [])
                    }
                    dungeonEfficiencyCache.get(dungeon.id)!.push({ key, dpm, rawRate })
                }
            }
        }

        // --- 3. 迭代模拟 (核心逻辑) ---

        // 记录每个副本累积需要刷取的次数 (浮点数，最后取整)
        const dungeonRunCounts = new Map<number, number>()
        // 记录返回给前端的结果对象
        const resultDungeonInfos = new Map<number, DungeonWithDrops>()

        let loopGuard = 0
        const MAX_LOOPS = remainingNeeds.size * 10 // 安全守卫，防止极端死循环

        while (remainingNeeds.size > 0 && loopGuard++ < MAX_LOOPS) {
            let bestDungeonId = -1
            let maxTotalDPM = -1 // 最大总分均掉率
            let maxScarcityScore = -1 // 最大稀缺度得分 (Tie-breaker)

            // 3.1 寻找当前状态下的最优副本
            // 遍历所有相关的副本
            for (const [dungeonId, drops] of dungeonEfficiencyCache) {
                let currentTotalDPM = 0
                let currentScarcityScore = 0
                let hasUsefulDrop = false

                // 计算该副本对当前剩余需求的贡献
                for (const drop of drops) {
                    // 只有当这个资源还需要时，才计入效率
                    if (remainingNeeds.has(drop.key)) {
                        currentTotalDPM += drop.dpm
                        // 稀缺度加分：优先刷来源少的资源 (1/来源数)
                        // 如果两个副本总效率一样，优先选那个能掉落"别的地方很难刷到的东西"的副本
                        currentScarcityScore += 1 / (resourceMeta.get(drop.key)!.sourceCount || 1)
                        hasUsefulDrop = true
                    }
                }

                if (!hasUsefulDrop) continue

                // 比较逻辑：优先分均效率，效率相同时优先稀缺度
                // 使用极小值处理浮点数比较
                if (currentTotalDPM > maxTotalDPM + 1e-9) {
                    maxTotalDPM = currentTotalDPM
                    maxScarcityScore = currentScarcityScore
                    bestDungeonId = dungeonId
                } else if (Math.abs(currentTotalDPM - maxTotalDPM) < 1e-9) {
                    if (currentScarcityScore > maxScarcityScore) {
                        maxScarcityScore = currentScarcityScore
                        bestDungeonId = dungeonId
                    }
                }
            }

            if (bestDungeonId === -1) break // 理论上不应发生，除非配置错误

            // 3.2 计算"瓶颈"：当前策略能维持多少次？
            // 即：在这个副本掉落的有用资源中，哪一个会最先被刷满？
            // 我们只看当前还需要的资源
            const activeDrops = dungeonEfficiencyCache.get(bestDungeonId)!.filter(d => remainingNeeds.has(d.key))

            let minRunsToCap = Infinity

            for (const drop of activeDrops) {
                const needed = remainingNeeds.get(drop.key)!
                // 需要刷多少次能满足这个资源: 剩余需求 / 单次掉率
                const runs = needed / drop.rawRate
                if (runs < minRunsToCap) {
                    minRunsToCap = runs
                }
            }

            // 3.3 执行模拟
            // 确保最小推进一步 (处理浮点数计算导致的极小值滞留)
            const runsToPerform = Math.max(minRunsToCap, 1e-6)

            // 累加次数
            const currentCount = dungeonRunCounts.get(bestDungeonId) || 0
            dungeonRunCounts.set(bestDungeonId, currentCount + runsToPerform)

            // 3.4 记录结果基本信息（如果是该副本第一次被选中）
            if (!resultDungeonInfos.has(bestDungeonId)) {
                const dungeon = dungeonLookup.get(bestDungeonId) // 直接从 Map 获取，无需查找
                if (dungeon) {
                    resultDungeonInfos.set(bestDungeonId, {
                        id: dungeon.id,
                        name: dungeon.n,
                        time: getDungeonTime(dungeon),
                        items: {}, // 掉率表
                        count: 0, // 初始化为0，最后统一赋值
                    })
                }
            }

            // 3.5 扣除资源需求并更新结果集掉率显示
            const keysToRemove: string[] = []
            const info = resultDungeonInfos.get(bestDungeonId)

            for (const drop of activeDrops) {
                // 将该副本掉落的所有有用资源都记录到结果 items 中
                // 只要该副本在模拟过程中被选中过，就记录其掉率
                if (info) {
                    info.items[drop.key] = drop.rawRate
                }

                const needed = remainingNeeds.get(drop.key)!
                const generated = runsToPerform * drop.rawRate
                const newNeed = needed - generated

                if (newNeed <= 1e-6) {
                    // 视为已满足
                    keysToRemove.push(drop.key)
                } else {
                    remainingNeeds.set(drop.key, newNeed)
                }
            }

            // 移除已满足的需求
            // 关键点：当需求被移除后，下一轮循环计算 bestDungeon 时，该资源的 DPM 将不再被计入总分
            // 这会导致副本的加权效率发生变化，从而算法可能会转向另一个副本
            keysToRemove.forEach(k => remainingNeeds.delete(k))
        }

        // --- 4. 组装并返回结果 ---
        const results: DungeonWithDrops[] = []
        for (const [id, info] of resultDungeonInfos) {
            const rawCount = dungeonRunCounts.get(id) || 0
            // 最终次数向上取整（游戏里不能刷半次副本）
            info.count = Math.ceil(rawCount)

            if (info.count > 0) {
                results.push(info)
            }
        }

        // 按照刷取次数降序排序返回
        return results.sort((a, b) => (b.count || 0) - (a.count || 0))
    }
    /**
     * 估算资源获取时间
     * @param totalCost 总消耗
     * @returns 时间估算
     */
    static estimateTime(totalCost: ResourceCost) {
        // 计算每个资源所需的副本次数和总时间
        let totalMinutes = 0
        const dungeonTimes: Record<number, [times: number, string[]]> = {}
        // 简化计算普通资源 普通资源来源单一
        for (const category of LevelUpCalculatorImpl.baseDungeonDropConfig) {
            for (const [resource, amount] of Object.entries(category.items)) {
                if (totalCost[resource]) {
                    const c = Array.isArray(totalCost[resource]) ? totalCost[resource][0] : totalCost[resource] || 0
                    const runsNeeded = Math.ceil(c / amount)
                    const minutesNeeded = runsNeeded * category.time
                    totalMinutes += minutesNeeded
                    dungeonTimes[category.id] = [(dungeonTimes[category.id]?.[0] || 0) + runsNeeded, [category.name]]
                }
            }
        }
        // 计算魔之楔
        const modDungeonsWithCount = LevelUpCalculatorImpl.getModDropDungeons(totalCost)
        for (const { id, count, time, items } of modDungeonsWithCount) {
            const minutesNeeded = (count || 0) * time
            totalMinutes += minutesNeeded
            const res = Object.keys(items).map(k => {
                const [type, name] = k.split("-")
                return type === "Mod" ? modMap.get(+name)?.名称 || name : `图纸: ${modMap.get(+name)?.名称 || name}`
            })
            dungeonTimes[id] = [(dungeonTimes[id]?.[0] || 0) + (count || 0), [...(dungeonTimes[id]?.[1] || []), ...res]]
        }

        // 转换副本理由格式，将数组转换为字符串
        const formattedDungeonTimes: Record<number, [number, string]> = {}
        for (const [id, [times, reasons]] of Object.entries(dungeonTimes)) {
            formattedDungeonTimes[+id] = [times, reasons.join("+")]
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
            dungeonTimes: formattedDungeonTimes,
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
            LevelUpCalculatorImpl.mergeCost(result, cost)
        }

        return result
    }
}
