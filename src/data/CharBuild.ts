import { LeveledChar, LeveledMod, LeveledBuff, LeveledWeapon, LeveledSkill } from "./leveled"
import { charToSkillsMap } from "./leveled"

export class CharBuild {
    public char: LeveledChar
    public hpPercent: number
    public resonanceGain: number
    public mods: LeveledMod[]
    public buffs: LeveledBuff[]
    public meleeWeapon: LeveledWeapon
    public rangedWeapon: LeveledWeapon
    public baseName: string
    public enemyType: string
    public enemyLevel: number
    public enemyResistance: number
    public enemyHpType: string
    public targetFunction: string
    public skills: LeveledSkill[]
    public skillWeapon?: LeveledWeapon

    // 敌方类型系数表
    private enemyTypeCoefficients: Record<string, number> = {
        小型: 13,
        大型: 20,
        首领: 30,
    }

    constructor(options: {
        char: LeveledChar
        hpPercent: number
        resonanceGain: number
        mods?: LeveledMod[]
        buffs?: LeveledBuff[]
        melee: LeveledWeapon
        ranged: LeveledWeapon
        baseName: string
        enemyType?: string
        enemyLevel?: number
        enemyResistance?: number
        enemyHpType?: string
        targetFunction?: string
        skillLevel?: number
    }) {
        this.char = options.char
        this.hpPercent = Math.max(0, Math.min(1, options.hpPercent))
        this.resonanceGain = options.resonanceGain
        this.mods = options.mods || []
        this.buffs = options.buffs || []
        this.meleeWeapon = options.melee
        this.rangedWeapon = options.ranged
        this.baseName = options.baseName
        this.enemyType = options.enemyType || "小型"
        this.enemyLevel = options.enemyLevel || 80
        this.enemyResistance = options.enemyResistance || 0
        this.enemyHpType = options.enemyHpType || "生命"
        this.targetFunction = options.targetFunction || "伤害"

        // 从skills表中获取角色技能数组，用参数skillLevel初始化LeveledSkill后储存为私有属性skills数组
        const skillLevel = options.skillLevel || 10
        this.skills = []

        // 使用charToSkillsMap获取角色的所有技能
        const characterSkills = charToSkillsMap.get(this.char.名称) || []
        characterSkills.forEach((skillName) => {
            this.skills.push(new LeveledSkill(skillName, skillLevel))
        })

        // 从char中获取同率武器值，如果非空则从武器表中获取同率武器属性，储存为私有字段skillWeapon
        if (this.char.同律武器) {
            try {
                this.skillWeapon = new LeveledWeapon(this.char.同律武器)
            } catch (error) {
                console.error(`同律武器 ${this.char.同律武器} 初始化失败:`, error)
            }
        }
    }

    // 计算角色所有属性（基础属性和其他属性）
    public calculateAttributes(): {
        // 基础属性
        attack: number
        health: number
        shield: number
        defense: number
        sanity: number
        // 其他属性
        power: number
        durability: number
        efficiency: number
        range: number
        boost: number
        desperate: number
        damageIncrease: number
        weaponDamage: number
        skillDamage: number
        independentDamageIncrease: number
        penetration: number
        ignoreDefense: number
    } {
        const char = this.char

        // 计算各种加成
        const attackBonus = this.getTotalBonus("攻击")
        const healthBonus = this.getTotalBonus("生命")
        const shieldBonus = this.getTotalBonus("护盾")
        const defenseBonus = this.getTotalBonus("防御")
        const sanityBonus = this.getTotalBonus("神智")
        const elemDamageBonus = this.getTotalBonus("属性伤")

        // 计算基础值为1的属性
        const power = 1 + this.getTotalBonus("威力")
        const durability = 1 + this.getTotalBonus("耐久")
        const efficiency = 1 + this.getTotalBonus("效益")
        const range = 1 + this.getTotalBonus("范围")

        // 计算基础值为0的属性
        const boost = this.getTotalBonus("昂扬")
        const desperate = this.getTotalBonus("背水")
        const damageIncrease = this.getTotalBonus("增伤")
        const weaponDamage = this.getTotalBonus("武器伤害")
        const skillDamage = this.getTotalBonus("技能伤害")
        const independentDamageIncrease = this.getTotalBonusMul("独立增伤")
        const penetration = this.getTotalBonus("属性穿透")
        const ignoreDefense = this.getTotalBonusMul("无视防御")

        // 计算基础属性 - 不再应用重复的等级系数，因为LeveledChar已经处理了等级变化
        let attack = char.基础攻击 * (1 + attackBonus + this.resonanceGain)
        let health = char.基础生命 * (1 + healthBonus + this.resonanceGain)
        let shield = char.基础护盾 * (1 + shieldBonus + this.resonanceGain)
        let defense = char.基础防御 * (1 + defenseBonus + this.resonanceGain)
        let sanity = char.基础神智 * (1 + sanityBonus)

        // 应用属性伤加成
        attack *= 1 + elemDamageBonus

        // 结果处理
        health = Math.floor(health)
        shield = Math.floor(shield)
        defense = Math.floor(defense)
        sanity = Math.floor(sanity)
        attack = Math.round(attack * 100) / 100

        // 应用属性上限
        const clampedEfficiency = Math.min(efficiency, 1.75) // 175%
        const clampedRange = Math.min(range, 2.8) // 280%

        return {
            // 基础属性
            attack,
            health,
            shield,
            defense,
            sanity,
            // 其他属性
            power,
            durability,
            efficiency: clampedEfficiency,
            range: clampedRange,
            boost,
            desperate,
            damageIncrease,
            weaponDamage,
            skillDamage,
            independentDamageIncrease,
            penetration,
            ignoreDefense,
        }
    }

    // 获取总加成
    public getTotalBonus(attribute: string, prefix?: string): number {
        let bonus = 0

        // 添加角色自带加成
        if (!prefix && typeof (this.char as any)[attribute] === "number") {
            bonus += (this.char as any)[attribute]
        }

        // 添加近战武器加成
        if ((!prefix || (prefix === "近战" && attribute !== "攻击")) && this.meleeWeapon) {
            if (typeof (this.meleeWeapon as any)[attribute] === "number") {
                bonus += (this.meleeWeapon as any)[attribute]
            }
        }
        // 添加远程武器加成
        if ((!prefix || (prefix === "远程" && attribute !== "攻击")) && this.rangedWeapon) {
            if (typeof (this.rangedWeapon as any)[attribute] === "number") {
                bonus += (this.rangedWeapon as any)[attribute]
            }
        }

        // 添加MOD加成
        if (!prefix || !attribute.startsWith(prefix))
            this.mods.forEach((mod) => {
                if (prefix && mod.类型 !== prefix) return
                if (typeof (mod as any)[attribute] === "number") {
                    bonus += (mod as any)[attribute]
                }
            })

        // 添加BUFF加成
        this.buffs.forEach((buff) => {
            if (prefix && attribute === "攻击") return
            if (typeof (buff as any)[attribute] === "number") {
                bonus += (buff as any)[attribute]
            }
        })

        return bonus
    }

    // 获取总加成
    private getTotalBonusMul(attribute: string, prefix?: string): number {
        let bonus = 1

        // 添加角色自带加成
        if (typeof (this.char as any)[attribute] === "number") {
            bonus *= 1 + (this.char as any)[attribute]
        }

        // 添加MOD加成
        this.mods.forEach((mod) => {
            if (prefix && mod.类型 !== prefix) return
            if (typeof (mod as any)[attribute] === "number") {
                bonus *= 1 + (mod as any)[attribute]
            }
        })

        // 添加BUFF加成
        this.buffs.forEach((buff) => {
            if (typeof (buff as any)[attribute] === "number") {
                bonus *= 1 + (buff as any)[attribute]
            }
        })

        return bonus - 1
    }

    // 计算武器属性
    public calculateWeaponAttributes(weapon: LeveledWeapon): {
        attack: number
        critRate: number
        critDamage: number
        triggerRate: number
        attackSpeed: number
        multiShot: number
        independentDamageIncrease: number
    } {
        const prefix = weapon.类型
        // 计算各种加成
        let attackBonus = this.getTotalBonus(`${prefix}攻击`, prefix) + this.getTotalBonus(`攻击`, prefix)
        let critRateBonus = this.getTotalBonus(`${prefix}暴击`, prefix) + this.getTotalBonus(`暴击`, prefix)
        let critDamageBonus = this.getTotalBonus(`${prefix}暴伤`, prefix) + this.getTotalBonus(`暴伤`, prefix)
        let triggerRateBonus = this.getTotalBonus(`${prefix}触发`, prefix) + this.getTotalBonus(`触发`, prefix)
        let attackSpeedBonus = this.getTotalBonus(`${prefix}攻速`, prefix) + this.getTotalBonus(`攻速`, prefix)
        let multiShotBonus = this.getTotalBonus(`${prefix}多重`, prefix) + this.getTotalBonus(`多重`, prefix)
        let independentDamageIncrease = this.getTotalBonusMul("独立增伤", prefix)

        if (prefix.startsWith("同律")) {
            const lowerPrefix = prefix.substring(2)
            attackBonus += this.getTotalBonus(`${lowerPrefix}攻击`, lowerPrefix)
            critRateBonus += this.getTotalBonus(`${lowerPrefix}暴击`, lowerPrefix)
            critDamageBonus += this.getTotalBonus(`${lowerPrefix}暴伤`, lowerPrefix)
            triggerRateBonus += this.getTotalBonus(`${lowerPrefix}触发`, lowerPrefix)
            attackSpeedBonus += this.getTotalBonus(`${lowerPrefix}攻速`, lowerPrefix)
            multiShotBonus += this.getTotalBonus(`${lowerPrefix}多重`, lowerPrefix)
        }

        // 计算武器属性
        let attack = weapon.基础攻击 * (1 + attackBonus)
        let critRate = weapon.基础暴击 * (1 + critRateBonus)
        let critDamage = weapon.基础暴伤 * (1 + critDamageBonus)
        let triggerRate = weapon.基础触发 * (1 + triggerRateBonus)
        let attackSpeed = 1 + attackSpeedBonus
        let multiShot = 1 + multiShotBonus

        // 应用武器物理加成
        const physicalBonus = this.getTotalBonus("物理", prefix)
        attack *= 1 + physicalBonus

        // 应用属性上限
        triggerRate = Math.min(triggerRate, 1) // 100%

        // 取整
        attack = +attack.toFixed(2)
        critRate = +critRate.toFixed(2)
        critDamage = +critDamage.toFixed(2)
        triggerRate = +triggerRate.toFixed(2)
        attackSpeed = +attackSpeed.toFixed(2)
        multiShot = +multiShot.toFixed(2)
        independentDamageIncrease = +independentDamageIncrease.toFixed(3)

        return {
            attack,
            critRate,
            critDamage,
            triggerRate,
            attackSpeed,
            multiShot,
            independentDamageIncrease,
        }
    }

    // 计算昂扬乘区
    public calculateBoostMultiplier(): number {
        const boostBonus = this.getTotalBonus("昂扬")
        const hpPercent = Math.max(0, Math.min(1, this.hpPercent || 0))
        return 1 + boostBonus * hpPercent
    }

    // 计算背水乘区
    public calculateDesperateMultiplier(): number {
        const desperate = this.getTotalBonus("背水")
        const hpPercent = Math.max(0.25, Math.min(1, this.hpPercent))
        // 如果desperate为0或hpPercent为1，背水乘区为1
        if (desperate === 0 || hpPercent === 1) {
            return 1
        }
        return 1 + 4 * desperate * (1 - hpPercent) * (1.5 - hpPercent)
    }

    // 计算防御乘区
    public calculateDefenseMultiplier(): number {
        // 如果敌方血量类型为护盾，防御乘区固定为1
        if (this.enemyHpType === "护盾") {
            return 1
        }

        const enemyTypeCoeff = this.enemyTypeCoefficients[this.enemyType] || 13
        // 确保等级和敌方等级都是有效的数字
        const charLevel = typeof this.char.等级 === "number" ? this.char.等级 : 80
        const enemyLevel = typeof this.enemyLevel === "number" ? this.enemyLevel : 80

        const levelDiff = Math.max(0, Math.min(20, Math.min(80, enemyLevel) - charLevel))
        const baseDefenseMultiplier = enemyTypeCoeff / (30 + enemyTypeCoeff - levelDiff)
        const ignoreDefense = this.getTotalBonusMul("无视防御")

        // 计算最终防御乘区，并确保其在0到1之间
        const defenseMultiplier = 1 - (1 - (1 - baseDefenseMultiplier)) * (1 - ignoreDefense)
        return Math.max(0, Math.min(1, defenseMultiplier))
    }

    // 计算技能伤害
    public calculateSkillDamage(skill: LeveledSkill): number {
        const attrs = this.calculateAttributes()

        // 计算技能基础伤害
        let baseDamage = skill.固定伤害 || 0
        if (skill.攻击倍率) {
            baseDamage += skill.攻击倍率 * attrs.attack
        }
        if (skill.生命倍率) {
            baseDamage += skill.生命倍率 * attrs.health
        }
        if (skill.防御倍率) {
            baseDamage += skill.防御倍率 * attrs.defense
        }

        // 计算各种乘区
        const resistancePenetration = Math.max(0, 1 - this.enemyResistance + attrs.penetration)
        const boostMultiplier = this.calculateBoostMultiplier()
        const desperateMultiplier = this.calculateDesperateMultiplier()
        const defenseMultiplier = this.calculateDefenseMultiplier()
        const damageIncrease = 1 + attrs.damageIncrease + attrs.skillDamage
        const independentDamageIncrease = 1 + attrs.independentDamageIncrease

        // 计算最终伤害
        let finalDamage =
            baseDamage *
            resistancePenetration *
            boostMultiplier *
            desperateMultiplier *
            defenseMultiplier *
            damageIncrease *
            independentDamageIncrease

        return finalDamage
    }

    // 计算武器伤害
    public calculateWeaponDamage(weapon: LeveledWeapon): number {
        const attrs = this.calculateAttributes()
        const weaponAttrs = this.calculateWeaponAttributes(weapon)

        // 计算武器基础伤害
        const weaponAttackMultiplier = weapon.倍率 || 1
        const weaponDamagePhysical = weaponAttackMultiplier * weaponAttrs.attack
        const weaponDamageElemental = weaponAttackMultiplier * attrs.attack

        // 计算触发伤害期望
        const triggerDamageMultiplier = this.getTotalBonus("触发倍率")
        const triggerRate = weaponAttrs.triggerRate
        const triggerExpectedDamage = weaponDamagePhysical * (1 + triggerDamageMultiplier * triggerRate) + weaponDamageElemental

        // 计算暴击伤害期望
        const critRate = weaponAttrs.critRate
        const critDamage = weaponAttrs.critDamage
        const critExpectedDamage = triggerExpectedDamage * (1 + critRate * (critDamage - 1))

        // 计算各种乘区
        const resistancePenetration = Math.max(0, 1 - this.enemyResistance + attrs.penetration)
        const boostMultiplier = this.calculateBoostMultiplier()
        const desperateMultiplier = this.calculateDesperateMultiplier()
        const defenseMultiplier = this.calculateDefenseMultiplier()
        const damageIncrease = 1 + attrs.damageIncrease + attrs.weaponDamage
        const independentDamageIncrease = (1 + attrs.independentDamageIncrease) * (1 + weaponAttrs.independentDamageIncrease)
        const additionalDamage = this.getTotalBonus("追加伤害")

        // 计算最终伤害
        let finalDamage =
            critExpectedDamage *
            resistancePenetration *
            boostMultiplier *
            desperateMultiplier *
            defenseMultiplier *
            damageIncrease *
            independentDamageIncrease *
            (1 + additionalDamage)

        return finalDamage
    }

    // 计算目标函数
    public calculateTargetFunction(damage: number, weapon?: LeveledWeapon, skill?: LeveledSkill): number {
        const targetFunction = this.targetFunction
        const attrs = this.calculateAttributes()

        // 计算伤害(DPA)
        const dpa = damage

        // 计算每秒伤害(DPS)
        let dps = dpa
        if (weapon) {
            const weaponAttrs = this.calculateWeaponAttributes(weapon)
            dps = dpa * weaponAttrs.attackSpeed * weaponAttrs.multiShot
        } else if (skill) {
            // 如果是技能，这里可以添加技能速度的计算
            // 暂时使用默认值
            const skillSpeed = 1
            dps = dpa * skillSpeed
        }

        // 计算效益影响下的神智消耗
        const baseSanityCost = skill?.神智消耗 || 0 // 从技能中获取或使用默认值
        const baseSustainedCost = skill?.持续消耗 || 0 // 从技能中获取或使用默认值
        const sanityCost = Math.max(0, baseSanityCost * (2 - attrs.efficiency))
        const sustainedCost = Math.max(0, (baseSustainedCost / attrs.durability) * (2 - attrs.efficiency))

        switch (targetFunction) {
            case "伤害":
            case "DPA":
                return dpa
            case "每秒伤害":
            case "DPS":
                return dps
            case "每神智伤害":
            case "DPAPM":
                return sanityCost > 0 ? dpa / sanityCost : dpa
            case "每持续神智伤害":
            case "DPAPSM":
                return sustainedCost > 0 ? dpa / sustainedCost : dpa
            case "每神智每秒伤害":
            case "DPSPM":
                return sanityCost > 0 ? dps / sanityCost : dps
            case "每持续神智每秒伤害":
            case "DPSPSM":
                return sustainedCost > 0 ? dps / sustainedCost : dps
            default:
                return damage
        }
    }

    // 执行计算
    public calculate(): number {
        // 查找要计算的武器或技能
        let damage = 0
        let weapon: LeveledWeapon | undefined
        let skill: LeveledSkill | undefined

        // 检查近战武器
        if (this.meleeWeapon.名称 === this.baseName) {
            damage = this.calculateWeaponDamage(this.meleeWeapon)
            weapon = this.meleeWeapon
        }

        // 检查远程武器
        if (!damage && this.rangedWeapon.名称 === this.baseName) {
            damage = this.calculateWeaponDamage(this.rangedWeapon)
            weapon = this.rangedWeapon
        }

        // 检查同律武器
        if (!damage && this.skillWeapon && this.skillWeapon.名称 === this.baseName) {
            damage = this.calculateWeaponDamage(this.skillWeapon)
            weapon = this.skillWeapon
        }

        // 检查技能（从私有属性skills中查找指定技能名称）
        if (!damage) {
            skill = this.skills.find((s) => s.名称 === this.baseName)
            if (skill) {
                damage = this.calculateSkillDamage(skill)
            }
        }

        // 计算目标函数
        return this.calculateTargetFunction(damage, weapon, skill)
    }
}
