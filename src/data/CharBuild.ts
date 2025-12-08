import { LeveledChar, LeveledMod, LeveledBuff, LeveledWeapon, LeveledSkillWeapon, LeveledSkill, modMap } from "./leveled"
import { base36Pad } from "../util"

export interface CharAttr {
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
    skillSpeed: number
}

export interface WeaponAttr {
    attack: number
    critRate: number
    critDamage: number
    triggerRate: number
    attackSpeed: number
    multiShot: number
    damageIncrease: number
    independentDamageIncrease: number
    additionalDamage: number
}

export class CharBuild {
    public char: LeveledChar
    public hpPercent: number
    public resonanceGain: number
    public auraMod?: LeveledMod
    public mods: LeveledMod[]
    public buffs: LeveledBuff[]
    public dynamicBuffs: LeveledBuff[]
    public meleeWeapon: LeveledWeapon
    public rangedWeapon: LeveledWeapon
    public _baseName = ""
    public enemyType: string
    public enemyLevel: number
    public enemyResistance: number
    public enemyHpType: string
    public targetFunction: string
    public skills: LeveledSkill[]
    public skillWeapon?: LeveledSkillWeapon

    // 敌方类型系数表
    private enemyTypeCoefficients: Record<string, number> = {
        小型: 13,
        small: 13,
        大型: 20,
        large: 20,
        首领: 30,
        boss: 30,
    }
    // 血量类型系数表
    private hpTypeCoefficients: Record<string, number> = {
        生命: 0.5,
        health: 0.5,
        护盾: 1,
        shield: 1,
        战姿: 1,
        combatStyle: 1,
    }

    constructor(options: {
        char: LeveledChar
        hpPercent: number
        resonanceGain: number
        auraMod?: LeveledMod
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
        this.auraMod = options.auraMod
        this.mods = options.mods || []
        this.buffs = options.buffs?.filter((v) => !v.code) || []
        this.dynamicBuffs = options.buffs?.filter((v) => v.code) || []
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
        this.skills = this.char.技能.map((skill) => new LeveledSkill(skill, skillLevel))

        // 从char中获取同率武器值，如果非空则从武器表中获取同率武器属性，储存为私有字段skillWeapon
        if (this.char.同律武器) {
            try {
                this.skillWeapon = new LeveledSkillWeapon(this.char.同律武器, skillLevel)
            } catch (error) {
                console.error(`同律武器 ${this.char.同律武器} 初始化失败:`, error)
            }
        }
    }

    get baseName() {
        return this._baseName
    }
    set baseName(value: string) {
        this._baseName = value
        // this.skills?.map((skill) => (skill.子技能名 = this.baseNameSub))
    }

    get baseNameTitle() {
        return this.baseName.replace(/\[.+?\]/g, "")
    }
    get baseNameSub() {
        const match = this.baseName.match(/\[(.+?)\]/)
        return match ? match[1] : ""
    }

    // 计算角色所有属性（基础属性和其他属性）
    public calculateAttributes(props?: LeveledWeapon | LeveledMod | LeveledBuff, minus = false): CharAttr {
        const char = this.char

        // 计算各种加成
        let attackBonus = this.getTotalBonus("攻击")
        let attackAdd = this.getTotalBonus("固定攻击")
        let healthBonus = this.getTotalBonus("生命")
        let shieldBonus = this.getTotalBonus("护盾")
        let defenseBonus = this.getTotalBonus("防御")
        let sanityBonus = this.getTotalBonus("神智")
        let elemDamageBonus = this.getTotalBonus("属性伤")

        // 计算基础值为1的属性
        let power = 1 + this.getTotalBonus("威力")
        let durability = 1 + this.getTotalBonus("耐久")
        let efficiency = 1 + this.getTotalBonus("效益")
        let range = 1 + this.getTotalBonus("范围")

        // 计算基础值为0的属性
        let boost = this.getTotalBonus("昂扬")
        let desperate = this.getTotalBonus("背水")
        let damageIncrease = this.getTotalBonus("增伤")
        let weaponDamage = this.getTotalBonus("武器伤害")
        let skillDamage = this.getTotalBonus("技能伤害")
        let skillSpeed = this.getTotalBonus("技能速度")
        let penetration = this.getTotalBonus("属性穿透")
        let ignoreDefense = this.getTotalBonusMul("无视防御")
        let independentDamageIncrease = this.getTotalBonusMul("独立增伤")

        if (props) {
            if (minus) {
                attackBonus -= this.getTotalBonusSingle(props, "攻击")
                attackAdd -= this.getTotalBonusSingle(props, "固定攻击")
                healthBonus -= this.getTotalBonusSingle(props, "生命")
                shieldBonus -= this.getTotalBonusSingle(props, "护盾")
                defenseBonus -= this.getTotalBonusSingle(props, "防御")
                sanityBonus -= this.getTotalBonusSingle(props, "神智")
                elemDamageBonus -= this.getTotalBonusSingle(props, "属性伤")
                power -= this.getTotalBonusSingle(props, "威力")
                durability -= this.getTotalBonusSingle(props, "耐久")
                efficiency -= this.getTotalBonusSingle(props, "效益")
                range -= this.getTotalBonusSingle(props, "范围")
                boost -= this.getTotalBonusSingle(props, "昂扬")
                desperate -= this.getTotalBonusSingle(props, "背水")
                damageIncrease -= this.getTotalBonusSingle(props, "增伤")
                weaponDamage -= this.getTotalBonusSingle(props, "武器伤害")
                skillDamage -= this.getTotalBonusSingle(props, "技能伤害")
                skillSpeed -= this.getTotalBonusSingle(props, "技能速度")
                penetration -= this.getTotalBonusSingle(props, "属性穿透")
                ignoreDefense = (1 + ignoreDefense) / (1 + this.getTotalBonusSingle(props, "无视防御")) - 1
                independentDamageIncrease = (1 + independentDamageIncrease) / (1 + this.getTotalBonusSingle(props, "独立增伤")) - 1
            } else {
                attackBonus += this.getTotalBonusSingle(props, "攻击")
                attackAdd += this.getTotalBonusSingle(props, "固定攻击")
                healthBonus += this.getTotalBonusSingle(props, "生命")
                shieldBonus += this.getTotalBonusSingle(props, "护盾")
                defenseBonus += this.getTotalBonusSingle(props, "防御")
                sanityBonus += this.getTotalBonusSingle(props, "神智")
                elemDamageBonus += this.getTotalBonusSingle(props, "属性伤")
                power += this.getTotalBonusSingle(props, "威力")
                durability += this.getTotalBonusSingle(props, "耐久")
                efficiency += this.getTotalBonusSingle(props, "效益")
                range += this.getTotalBonusSingle(props, "范围")
                boost += this.getTotalBonusSingle(props, "昂扬")
                desperate += this.getTotalBonusSingle(props, "背水")
                damageIncrease += this.getTotalBonusSingle(props, "增伤")
                weaponDamage += this.getTotalBonusSingle(props, "武器伤害")
                skillDamage += this.getTotalBonusSingle(props, "技能伤害")
                skillSpeed += this.getTotalBonusSingle(props, "技能速度")
                penetration += this.getTotalBonusSingle(props, "属性穿透")
                ignoreDefense = (1 + ignoreDefense) * (1 + this.getTotalBonusSingle(props, "无视防御")) - 1
                independentDamageIncrease = (1 + independentDamageIncrease) * (1 + this.getTotalBonusSingle(props, "独立增伤")) - 1
            }
        }

        // 计算基础属性
        let attack = char.基础攻击 * (1 + attackBonus + this.resonanceGain) + attackAdd
        let health = char.基础生命 * (1 + healthBonus + this.resonanceGain)
        let shield = char.基础护盾 * (1 + shieldBonus + this.resonanceGain)
        let defense = char.基础防御 * (1 + defenseBonus + this.resonanceGain)
        let sanity = char.基础神智 * (1 + sanityBonus)

        // 应用属性伤加成
        attack *= 1 + elemDamageBonus

        // 结果处理
        health = Math.round(health)
        shield = Math.round(shield)
        defense = Math.round(defense)
        sanity = Math.round(sanity)
        attack = Math.round(attack * 100) / 100

        // 应用属性上限
        efficiency = Math.min(efficiency, 1.75) // 175%
        range = Math.min(range, 2.8) // 280%

        let attrs = {
            // 基础属性
            attack,
            health,
            shield,
            defense,
            sanity,
            // 其他属性
            power,
            durability,
            efficiency,
            range,
            boost,
            desperate,
            damageIncrease,
            weaponDamage,
            skillDamage,
            independentDamageIncrease,
            penetration,
            ignoreDefense,
            skillSpeed,
        }
        if (this.dynamicBuffs.length > 0) {
            for (const b of this.dynamicBuffs) {
                if (minus && props!.名称 === b.名称) continue
                attrs = b.applyDynamicAttr(char, attrs)
            }
        }
        if (!minus && (props as LeveledBuff)?.code) {
            attrs = (props as LeveledBuff).applyDynamicAttr(char, attrs)
        }

        return attrs
    }
    // 计算武器属性
    public calculateWeaponAttributes(props?: LeveledWeapon | LeveledMod | LeveledBuff, minus = false): CharAttr & { weapon?: WeaponAttr } {
        const char = this.char

        // 计算各种加成
        let attackBonus = this.getTotalBonus("攻击")
        let attackAdd = this.getTotalBonus("固定攻击")
        let healthBonus = this.getTotalBonus("生命")
        let shieldBonus = this.getTotalBonus("护盾")
        let defenseBonus = this.getTotalBonus("防御")
        let sanityBonus = this.getTotalBonus("神智")
        let elemDamageBonus = this.getTotalBonus("属性伤")

        // 计算基础值为1的属性
        let power = 1 + this.getTotalBonus("威力")
        let durability = 1 + this.getTotalBonus("耐久")
        let efficiency = 1 + this.getTotalBonus("效益")
        let range = 1 + this.getTotalBonus("范围")

        // 计算基础值为0的属性
        let boost = this.getTotalBonus("昂扬")
        let desperate = this.getTotalBonus("背水")
        let damageIncrease = this.getTotalBonus("增伤")
        let weaponDamage = this.getTotalBonus("武器伤害")
        let skillDamage = this.getTotalBonus("技能伤害")
        let skillSpeed = this.getTotalBonus("技能速度")
        let penetration = this.getTotalBonus("属性穿透")
        let ignoreDefense = this.getTotalBonusMul("无视防御")
        let independentDamageIncrease = this.getTotalBonusMul("独立增伤")

        if (props) {
            if (minus) {
                attackBonus -= this.getTotalBonusSingle(props, "攻击")
                attackAdd -= this.getTotalBonusSingle(props, "固定攻击")
                healthBonus -= this.getTotalBonusSingle(props, "生命")
                shieldBonus -= this.getTotalBonusSingle(props, "护盾")
                defenseBonus -= this.getTotalBonusSingle(props, "防御")
                sanityBonus -= this.getTotalBonusSingle(props, "神智")
                elemDamageBonus -= this.getTotalBonusSingle(props, "属性伤")
                power -= this.getTotalBonusSingle(props, "威力")
                durability -= this.getTotalBonusSingle(props, "耐久")
                efficiency -= this.getTotalBonusSingle(props, "效益")
                range -= this.getTotalBonusSingle(props, "范围")
                boost -= this.getTotalBonusSingle(props, "昂扬")
                desperate -= this.getTotalBonusSingle(props, "背水")
                damageIncrease -= this.getTotalBonusSingle(props, "增伤")
                weaponDamage -= this.getTotalBonusSingle(props, "武器伤害")
                skillDamage -= this.getTotalBonusSingle(props, "技能伤害")
                skillSpeed -= this.getTotalBonusSingle(props, "技能速度")
                penetration -= this.getTotalBonusSingle(props, "属性穿透")
                ignoreDefense = (1 + ignoreDefense) / (1 + this.getTotalBonusSingle(props, "无视防御")) - 1
                independentDamageIncrease = (1 + independentDamageIncrease) / (1 + this.getTotalBonusSingle(props, "独立增伤")) - 1
            } else {
                attackBonus += this.getTotalBonusSingle(props, "攻击")
                attackAdd += this.getTotalBonusSingle(props, "固定攻击")
                healthBonus += this.getTotalBonusSingle(props, "生命")
                shieldBonus += this.getTotalBonusSingle(props, "护盾")
                defenseBonus += this.getTotalBonusSingle(props, "防御")
                sanityBonus += this.getTotalBonusSingle(props, "神智")
                elemDamageBonus += this.getTotalBonusSingle(props, "属性伤")
                power += this.getTotalBonusSingle(props, "威力")
                durability += this.getTotalBonusSingle(props, "耐久")
                efficiency += this.getTotalBonusSingle(props, "效益")
                range += this.getTotalBonusSingle(props, "范围")
                boost += this.getTotalBonusSingle(props, "昂扬")
                desperate += this.getTotalBonusSingle(props, "背水")
                damageIncrease += this.getTotalBonusSingle(props, "增伤")
                weaponDamage += this.getTotalBonusSingle(props, "武器伤害")
                skillDamage += this.getTotalBonusSingle(props, "技能伤害")
                skillSpeed += this.getTotalBonusSingle(props, "技能速度")
                penetration += this.getTotalBonusSingle(props, "属性穿透")
                ignoreDefense = (1 + ignoreDefense) * (1 + this.getTotalBonusSingle(props, "无视防御")) - 1
                independentDamageIncrease = (1 + independentDamageIncrease) * (1 + this.getTotalBonusSingle(props, "独立增伤")) - 1
            }
        }

        // 计算基础属性
        let attack = char.基础攻击 * (1 + attackBonus + this.resonanceGain) + attackAdd
        let health = char.基础生命 * (1 + healthBonus + this.resonanceGain)
        let shield = char.基础护盾 * (1 + shieldBonus + this.resonanceGain)
        let defense = char.基础防御 * (1 + defenseBonus + this.resonanceGain)
        let sanity = char.基础神智 * (1 + sanityBonus)

        // 应用属性伤加成
        attack *= 1 + elemDamageBonus

        // 结果处理
        health = Math.round(health)
        shield = Math.round(shield)
        defense = Math.round(defense)
        sanity = Math.round(sanity)
        attack = Math.round(attack * 100) / 100

        // 应用属性上限
        efficiency = Math.min(efficiency, 1.75) // 175%
        range = Math.min(range, 2.8) // 280%

        let attrs: CharAttr & { weapon?: WeaponAttr } = {
            // 基础属性
            attack,
            health,
            shield,
            defense,
            sanity,
            // 其他属性
            power,
            durability,
            efficiency,
            range,
            boost,
            desperate,
            damageIncrease,
            weaponDamage,
            skillDamage,
            independentDamageIncrease,
            penetration,
            ignoreDefense,
            skillSpeed,
        }

        const weapon = this.selectedWeapon
        if (weapon) {
            const prefix = weapon.类型
            // 计算各种加成
            let attackBonus = this.getTotalBonus(`${prefix}攻击`, prefix) + this.getTotalBonus(`攻击`, prefix)
            // 角色精通
            if (weapon.类别 === this.char.近战 || weapon.类别 === this.char.远程) {
                attackBonus += 0.2
            }
            let critRateBonus = this.getTotalBonus(`${prefix}暴击`, prefix) + this.getTotalBonus(`暴击`, prefix)
            let critDamageBonus = this.getTotalBonus(`${prefix}暴伤`, prefix) + this.getTotalBonus(`暴伤`, prefix)
            let triggerRateBonus = this.getTotalBonus(`${prefix}触发`, prefix) + this.getTotalBonus(`触发`, prefix)
            let attackSpeedBonus = this.getTotalBonus(`${prefix}攻速`, prefix) + this.getTotalBonus(`攻速`, prefix)
            let multiShotBonus = this.getTotalBonus(`${prefix}多重`, prefix) + this.getTotalBonus(`多重`, prefix)
            let damageIncrease = this.getTotalBonus(`${prefix}增伤`, prefix) + this.getTotalBonus(`增伤`, prefix)
            let additionalDamage = this.getTotalBonus("追加伤害")
            let independentDamageIncrease = this.getTotalBonusMul("独立增伤", prefix)

            if (prefix.startsWith("同律")) {
                const lowerPrefix = prefix.substring(2)
                attackBonus += this.getTotalBonus(`${lowerPrefix}攻击`, lowerPrefix)
                critRateBonus += this.getTotalBonus(`${lowerPrefix}暴击`, lowerPrefix)
                critDamageBonus += this.getTotalBonus(`${lowerPrefix}暴伤`, lowerPrefix)
                triggerRateBonus += this.getTotalBonus(`${lowerPrefix}触发`, lowerPrefix)
                attackSpeedBonus += this.getTotalBonus(`${lowerPrefix}攻速`, lowerPrefix)
                damageIncrease += this.getTotalBonus(`${lowerPrefix}增伤`, lowerPrefix)
                multiShotBonus += this.getTotalBonus(`${lowerPrefix}多重`, lowerPrefix)
            }

            if (props) {
                if (minus) {
                    attackBonus -=
                        this.getTotalBonusSingle(props, `${prefix}攻击`, prefix) + this.getTotalBonusSingle(props, `攻击`, prefix)
                    critRateBonus -=
                        this.getTotalBonusSingle(props, `${prefix}暴击`, prefix) + this.getTotalBonusSingle(props, `暴击`, prefix)
                    critDamageBonus -=
                        this.getTotalBonusSingle(props, `${prefix}暴伤`, prefix) + this.getTotalBonusSingle(props, `暴伤`, prefix)
                    triggerRateBonus -=
                        this.getTotalBonusSingle(props, `${prefix}触发`, prefix) + this.getTotalBonusSingle(props, `触发`, prefix)
                    attackSpeedBonus -=
                        this.getTotalBonusSingle(props, `${prefix}攻速`, prefix) + this.getTotalBonusSingle(props, `攻速`, prefix)
                    multiShotBonus -=
                        this.getTotalBonusSingle(props, `${prefix}多重`, prefix) + this.getTotalBonusSingle(props, `多重`, prefix)
                    damageIncrease -=
                        this.getTotalBonusSingle(props, `${prefix}增伤`, prefix) + this.getTotalBonusSingle(props, `增伤`, prefix)
                    additionalDamage -= this.getTotalBonusSingle(props, `追加伤害`, prefix)
                    independentDamageIncrease = (1 + independentDamageIncrease) / (1 + this.getTotalBonusMul("独立增伤", prefix)) - 1

                    if (prefix.startsWith("同律")) {
                        const lowerPrefix = prefix.substring(2)
                        attackBonus -= this.getTotalBonusSingle(props, `${lowerPrefix}攻击`, lowerPrefix)
                        critRateBonus -= this.getTotalBonusSingle(props, `${lowerPrefix}暴击`, lowerPrefix)
                        critDamageBonus -= this.getTotalBonusSingle(props, `${lowerPrefix}暴伤`, lowerPrefix)
                        triggerRateBonus -= this.getTotalBonusSingle(props, `${lowerPrefix}触发`, lowerPrefix)
                        attackSpeedBonus -= this.getTotalBonusSingle(props, `${lowerPrefix}攻速`, lowerPrefix)
                        multiShotBonus -= this.getTotalBonusSingle(props, `${lowerPrefix}多重`, lowerPrefix)
                        damageIncrease -= this.getTotalBonusSingle(props, `${lowerPrefix}增伤`, lowerPrefix)
                    }
                } else {
                    attackBonus +=
                        this.getTotalBonusSingle(props, `${prefix}攻击`, prefix) + this.getTotalBonusSingle(props, `攻击`, prefix)
                    critRateBonus +=
                        this.getTotalBonusSingle(props, `${prefix}暴击`, prefix) + this.getTotalBonusSingle(props, `暴击`, prefix)
                    critDamageBonus +=
                        this.getTotalBonusSingle(props, `${prefix}暴伤`, prefix) + this.getTotalBonusSingle(props, `暴伤`, prefix)
                    triggerRateBonus +=
                        this.getTotalBonusSingle(props, `${prefix}触发`, prefix) + this.getTotalBonusSingle(props, `触发`, prefix)
                    attackSpeedBonus +=
                        this.getTotalBonusSingle(props, `${prefix}攻速`, prefix) + this.getTotalBonusSingle(props, `攻速`, prefix)
                    multiShotBonus +=
                        this.getTotalBonusSingle(props, `${prefix}多重`, prefix) + this.getTotalBonusSingle(props, `多重`, prefix)
                    damageIncrease +=
                        this.getTotalBonusSingle(props, `${prefix}增伤`, prefix) + this.getTotalBonusSingle(props, `增伤`, prefix)
                    additionalDamage += this.getTotalBonusSingle(props, `追加伤害`, prefix)
                    independentDamageIncrease = (1 + independentDamageIncrease) * (1 + this.getTotalBonusMul("独立增伤", prefix)) - 1

                    if (prefix.startsWith("同律")) {
                        const lowerPrefix = prefix.substring(2)
                        attackBonus += this.getTotalBonusSingle(props, `${lowerPrefix}攻击`, lowerPrefix)
                        critRateBonus += this.getTotalBonusSingle(props, `${lowerPrefix}暴击`, lowerPrefix)
                        critDamageBonus += this.getTotalBonusSingle(props, `${lowerPrefix}暴伤`, lowerPrefix)
                        triggerRateBonus += this.getTotalBonusSingle(props, `${lowerPrefix}触发`, lowerPrefix)
                        attackSpeedBonus += this.getTotalBonusSingle(props, `${lowerPrefix}攻速`, lowerPrefix)
                        multiShotBonus += this.getTotalBonusSingle(props, `${lowerPrefix}多重`, lowerPrefix)
                        damageIncrease += this.getTotalBonusSingle(props, `${lowerPrefix}增伤`, lowerPrefix)
                    }
                }
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
            attack = Math.round(attack * 100) / 100
            critRate = Math.round(critRate * 100) / 100
            critDamage = Math.round(critDamage * 100) / 100
            triggerRate = Math.round(triggerRate * 100) / 100
            attackSpeed = Math.round(attackSpeed * 100) / 100
            multiShot = Math.round(multiShot * 100) / 100
            independentDamageIncrease = Math.round(independentDamageIncrease * 1000) / 1000

            let weaponAttrs: WeaponAttr = {
                attack,
                critRate,
                critDamage,
                triggerRate,
                attackSpeed,
                multiShot,
                damageIncrease,
                independentDamageIncrease,
                additionalDamage,
            }
            attrs.weapon = weaponAttrs
        }
        if (this.dynamicBuffs.length > 0) {
            for (const b of this.dynamicBuffs) {
                if (minus && props!.名称 === b.名称) continue
                attrs = b.applyDynamicAttr(char, attrs, weapon, attrs.weapon)
            }
        }
        if (!minus && (props as LeveledBuff)?.code) {
            attrs = (props as LeveledBuff).applyDynamicAttr(char, attrs, weapon, attrs.weapon)
        }
        return attrs
    }

    // 获取单项目总加成
    public getTotalBonusSingle(props: LeveledWeapon | LeveledMod | LeveledBuff, attribute: string, prefix?: string): number {
        let bonus = 0

        const isMod = "id" in props && props.id && modMap.has(props.id)
        // 检查属性是否符合前缀
        if (!isMod || !prefix || !attribute.startsWith(prefix)) {
            if (prefix && (props as any).类型 && (props as any).类型 !== prefix) return 0
            if (["攻击", "增伤"].includes(attribute)) {
                if (!isMod && prefix) return 0
            }
            if (typeof (props as any)[attribute] === "number") {
                bonus += (props as any)[attribute]
            }
        }
        return bonus
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
            if (prefix && ["攻击", "增伤"].includes(attribute)) return
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

    // 计算昂扬乘区
    public calculateBoostMultiplier(attrs: ReturnType<typeof this.calculateAttributes>): number {
        const boost = attrs.boost
        const hpPercent = Math.max(0, Math.min(1, this.hpPercent || 0))
        return 1 + boost * hpPercent
    }

    // 计算背水乘区
    public calculateDesperateMultiplier(attrs: ReturnType<typeof this.calculateAttributes>): number {
        const desperate = attrs.desperate
        const hpPercent = Math.max(0.25, Math.min(1, this.hpPercent))
        // 如果desperate为0或hpPercent为1，背水乘区为1
        if (desperate === 0 || hpPercent === 1) {
            return 1
        }
        return 1 + 4 * desperate * (1 - hpPercent) * (1.5 - hpPercent)
    }

    // 计算防御乘区
    public calculateDefenseMultiplier(attrs: ReturnType<typeof this.calculateAttributes>): number {
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
        const ignoreDefense = attrs.ignoreDefense

        // 计算最终防御乘区，并确保其在0到1之间
        const defenseMultiplier = 1 - (1 - (1 - baseDefenseMultiplier)) * (1 - ignoreDefense)
        return Math.max(0, Math.min(1, defenseMultiplier))
    }

    // 计算技能伤害
    public calculateSkillDamage(attrs: ReturnType<typeof this.calculateAttributes>, skill: LeveledSkill): number {
        // 计算技能基础伤害
        let damage = skill.伤害
        let baseDamage = damage?.额外 || 0
        if (damage) {
            if (!damage.基础) {
                baseDamage += damage.值 * attrs.attack
            }
            if (damage.基础 === "生命") {
                baseDamage += damage.值 * attrs.health
            }
            if (damage.基础 === "防御") {
                baseDamage += damage.值 * attrs.defense
            }
        }
        baseDamage *= attrs.power

        // 计算各种乘区
        const resistancePenetration = Math.max(0, 1 - this.enemyResistance + attrs.penetration)
        const boostMultiplier = this.calculateBoostMultiplier(attrs)
        const desperateMultiplier = this.calculateDesperateMultiplier(attrs)
        const defenseMultiplier = this.calculateDefenseMultiplier(attrs)
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
    public calculateWeaponDamage(
        attrs: ReturnType<typeof this.calculateWeaponAttributes>,
        weapon: LeveledWeapon | LeveledSkillWeapon
    ): {
        lowerCritNoTrigger: number
        higherCritNoTrigger: number
        lowerCritExpectedTrigger: number
        higherCritExpectedTrigger: number
        lowerCritTrigger: number
        higherCritTrigger: number
        expectedDamage: number
    } {
        const weaponAttrs = attrs.weapon!
        // 计算武器基础伤害
        const weaponAttackMultiplier = weapon.倍率 || 1
        const weaponDamagePhysical = weaponAttackMultiplier * weaponAttrs.attack
        const weaponDamageElemental = weaponAttackMultiplier * attrs.attack

        // 计算触发伤害期望
        const triggerDamageMultiplier =
            weapon.伤害类型 === this.enemyHpType ? this.hpTypeCoefficients[this.enemyHpType] + this.getTotalBonus("触发倍率") : 0
        const triggerRate = weaponAttrs.triggerRate
        const triggerDamage = 1 + triggerDamageMultiplier
        const triggerExpectedDamage = 1 + triggerDamageMultiplier * triggerRate

        // 计算暴击伤害期望
        const critRate = weaponAttrs.critRate
        const critDamage = weaponAttrs.critDamage
        const lowerCritDamage = (weaponAttrs.critDamage - 1) * Math.floor(weaponAttrs.critRate) + 1
        const higherCritDamage = (weaponAttrs.critDamage - 1) * Math.ceil(weaponAttrs.critRate) + 1
        const critExpectedDamage = 1 + critRate * (critDamage - 1)

        // 计算各种乘区
        const resistancePenetration = 1 - this.enemyResistance + attrs.penetration
        const boostMultiplier = this.calculateBoostMultiplier(attrs)
        const desperateMultiplier = this.calculateDesperateMultiplier(attrs)
        const defenseMultiplier = this.calculateDefenseMultiplier(attrs)
        const damageIncrease = 1 + attrs.damageIncrease + weaponAttrs.damageIncrease + attrs.weaponDamage
        const independentDamageIncrease = (1 + attrs.independentDamageIncrease) * (1 + weaponAttrs.independentDamageIncrease)
        const additionalDamage = 1 + weaponAttrs.additionalDamage
        const commonMore =
            boostMultiplier * desperateMultiplier * defenseMultiplier * damageIncrease * independentDamageIncrease * additionalDamage

        // 计算最终伤害

        return {
            lowerCritNoTrigger: (weaponDamagePhysical + weaponDamageElemental * resistancePenetration) * lowerCritDamage * commonMore,
            higherCritNoTrigger: (weaponDamagePhysical + weaponDamageElemental * resistancePenetration) * higherCritDamage * commonMore,
            lowerCritTrigger:
                (weaponDamagePhysical * triggerDamage + weaponDamageElemental * resistancePenetration) * lowerCritDamage * commonMore,
            higherCritTrigger:
                (weaponDamagePhysical * triggerDamage + weaponDamageElemental * resistancePenetration) * higherCritDamage * commonMore,
            lowerCritExpectedTrigger:
                (weaponDamagePhysical * triggerExpectedDamage + weaponDamageElemental * resistancePenetration) *
                lowerCritDamage *
                commonMore,
            higherCritExpectedTrigger:
                (weaponDamagePhysical * triggerExpectedDamage + weaponDamageElemental * resistancePenetration) *
                higherCritDamage *
                commonMore,
            expectedDamage:
                (weaponDamagePhysical * triggerExpectedDamage + weaponDamageElemental * resistancePenetration) *
                critExpectedDamage *
                commonMore,
        }
    }

    // 计算目标函数
    public calculateTargetFunction(damage: number, weapon?: LeveledWeapon | LeveledSkillWeapon, skill?: LeveledSkill): number {
        const targetFunction = this.targetFunction
        const attrs = this.calculateAttributes()

        // 计算伤害(DPA)
        let dpa = damage

        // 计算每秒伤害(DPS)
        let dps = damage
        let dpb = damage
        if (weapon) {
            const { weapon: weaponAttrs } = this.calculateWeaponAttributes()
            dps = dpa * weaponAttrs!.attackSpeed * weaponAttrs!.multiShot
            dpa = dpa * weaponAttrs!.multiShot
            dpb = dpb / attrs.damageIncrease
        } else if (skill) {
            dps = dpa * (1 + attrs.skillSpeed)
        }

        // 计算效益影响下的神智消耗
        const baseSanityCost = skill?.神智消耗 || 0 // 从技能中获取或使用默认值
        const baseSustainedCost = skill?.每秒神智消耗 || 0 // 从技能中获取或使用默认值
        const sanityCost = Math.ceil(Math.max(0, baseSanityCost * (2 - attrs.efficiency)))
        const sustainedCost = Math.ceil(Math.max(0, (baseSustainedCost / attrs.durability) * (2 - attrs.efficiency)))

        switch (targetFunction) {
            case "弹片伤害":
            case "DPB":
                return dpb
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

    get selectedWeapon() {
        let weapon: LeveledWeapon | LeveledSkillWeapon | undefined
        let bt = this.baseNameTitle

        if (this.meleeWeapon.名称 === bt) weapon = this.meleeWeapon
        if (this.rangedWeapon.名称 === bt) weapon = this.rangedWeapon
        if (this.skillWeapon && this.skillWeapon.名称 === bt) weapon = this.skillWeapon
        return weapon
    }

    get selectedSkill() {
        let skill: LeveledSkill | undefined
        let bt = this.baseNameTitle

        skill = this.skills.find((s) => s.名称 === bt)
        return skill
    }

    get isMeleeWeapon() {
        return this.meleeWeapon.名称 === this.baseNameTitle
    }
    get isRangedWeapon() {
        return this.rangedWeapon.名称 === this.baseNameTitle
    }
    get isSkillWeapon() {
        return this.skillWeapon && this.skillWeapon.名称 === this.baseNameTitle
    }

    /**
     * 主计算函数
     * @param props 武器、模组或 buff
     * @returns 目标函数结果
     */
    public calculate(props?: LeveledWeapon | LeveledMod | LeveledBuff, minus = false): number {
        // 查找要计算的武器或技能
        let damage = 0
        let weapon = this.selectedWeapon
        let bs = this.baseNameSub
        const attrs = this.calculateWeaponAttributes(props, minus)
        if (weapon) {
            if (bs) weapon.倍率名称 = bs
            damage = this.calculateWeaponDamage(attrs, weapon).expectedDamage
            if (weapon.类型.startsWith("同律")) {
                damage *= attrs.power
            }
        }
        const skill = this.selectedSkill
        if (skill) {
            skill.子技能名 = bs
            damage = this.calculateSkillDamage(attrs, skill)
        }

        // 计算目标函数
        return this.calculateTargetFunction(damage, weapon, skill)
    }

    /**
     * 计算单属性收益（减去属性值）
     * @param props 武器、模组或 buff
     * @returns 单属性值
     */
    public calcIncomeMinus(props?: LeveledWeapon | LeveledMod | LeveledBuff): number {
        return this.calculate() / this.calculate(props, true) - 1
    }
    /**
     * 计算单属性收益（加上属性值）
     * @param props 武器、模组或 buff
     * @returns 单属性值
     */
    public calcIncome(props?: LeveledWeapon | LeveledMod | LeveledBuff, minus = false): number {
        if (minus) return this.calculate() / this.calculate(props, minus) - 1
        return this.calculate(props, minus) / this.calculate() - 1
    }

    clone() {
        return new CharBuild({
            char: new LeveledChar(this.char.名称, this.char.等级),
            hpPercent: this.hpPercent,
            resonanceGain: this.resonanceGain,
            mods: this.mods.map((m) => new LeveledMod(m.id, m.等级)),
            buffs: this.buffs.map((b) => new LeveledBuff(b.名称, b.等级)),
            melee: new LeveledWeapon(this.meleeWeapon.名称, this.meleeWeapon.精炼, this.meleeWeapon.等级),
            ranged: new LeveledWeapon(this.rangedWeapon.名称, this.rangedWeapon.精炼, this.rangedWeapon.等级),
            baseName: this.baseNameTitle,
            enemyType: this.enemyType,
            enemyLevel: this.enemyLevel,
            enemyResistance: this.enemyResistance,
            enemyHpType: this.enemyHpType,
            targetFunction: this.targetFunction,
            skillLevel: this.skills[0].等级,
        })
    }

    getCode(type = "角色") {
        const mods = this.mods
            .filter((v) => v.类型 === type)
            .map((v) => v.id)
            .map(base36Pad)
            .join("")
            .padEnd(8 * 4, "0")
        const auraMod = base36Pad(this.auraMod?.id || 0).padEnd(4, "0")
        const flag = type === "角色" ? "C" : "W"
        return `${flag}${base36Pad(this.char.id || 0)}${mods}${auraMod}`
    }
    codeSwap(ids: number[]) {
        if (ids.length < 8) return ids
        // 交换顺序
        return ids.map((_, i) => ids[[1, 4, 2, 3, 5, 8, 6, 7][i] - 1])
    }
    importCode(charCode: string, type = "角色") {
        let modIds =
            charCode
                .slice(5)
                .match(/.{4}/g)
                ?.map((v) => parseInt(v.toLowerCase(), 36)) || []
        if (type === "角色") {
            if (modIds.length !== 9) {
                console.warn("导入代码格式错误")
                return
            }
            return { mods: this.codeSwap(modIds.slice(0, 8)), auraMod: modIds[8] }
        } else {
            if (modIds.length !== 8) {
                console.warn("导入代码格式错误")
                return
            }
            return { mods: this.codeSwap(modIds.slice(0, 8)) }
        }
    }
}
