import { LeveledChar, LeveledMod, LeveledBuff, LeveledWeapon, LeveledSkillWeapon, LeveledSkill, modMap } from "./leveled"
import { LeveledModWithCount } from "./leveled/LeveledMod"
// 本地实现base36Pad函数，避免依赖浏览器API
function base36Pad(num: number): string {
    const base36 = num.toString(36).toUpperCase()
    return base36.padStart(4, "0")
}

export interface CharAttr {
    // 基础属性
    攻击: number
    生命: number
    护盾: number
    防御: number
    神智: number
    // 其他属性
    威力: number
    耐久: number
    效益: number
    范围: number
    昂扬: number
    背水: number
    增伤: number
    武器伤害: number
    技能伤害: number
    独立增伤: number
    属性穿透: number
    无视防御: number
    技能速度: number
    失衡易伤: number
    技能倍率加数: number
    召唤物攻击速度: number
    召唤物范围: number
    减伤: number
}

export interface WeaponAttr {
    /** 攻击 基于武器基础值 */
    攻击: number
    /** 暴击率 基于武器基础值 */
    暴击: number
    /** 暴击伤害 基于武器基础值 */
    暴伤: number
    /** 触发率 基于武器基础值 */
    触发: number
    /** 攻击速度 1开始 */
    攻速: number
    /** 多重射击倍率 1开始 */
    多重: number
    /** 增伤 0开始 */
    增伤: number
    /** 独立增伤 0开始 */
    独立增伤: number
    /** 追加伤害 0开始 */
    追加伤害: number
}

import type { RawTimelineData } from "../store/timeline"
import { groupBy } from "lodash-es"
export class CharBuildTimeline {
    totalTime: number = 0
    constructor(
        public name: string,
        public items: CharBuildTimelineItem[],
    ) {
        this.items.forEach((item) => {
            const endTime = item.time + item.duration
            this.totalTime = Math.max(this.totalTime, endTime)
        })
    }
    static fromRaw(raw: RawTimelineData) {
        return new CharBuildTimeline(
            raw.name,
            raw.items.map((item) => ({
                track: item.i,
                name: item.n,
                time: item.t,
                duration: item.d,
                lv: item.l,
            })),
        )
    }
}

export interface CharBuildTimelineItem {
    track: number
    name: string
    time: number // 单位秒
    duration: number // 单位秒
    lv?: number // 如果是BUFF则有此项
}

export interface CharBuildOptions {
    char: LeveledChar
    imbalance?: boolean
    hpPercent: number
    resonanceGain: number
    auraMod?: LeveledMod
    // mods?: LeveledMod[]
    charMods?: LeveledMod[]
    meleeMods?: LeveledMod[]
    rangedMods?: LeveledMod[]
    skillWeaponMods?: LeveledMod[]
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
    timeline?: CharBuildTimeline
}

export class CharBuild {
    public _char!: LeveledChar
    get char() {
        return this._char
    }
    set char(char: LeveledChar) {
        this._char = char
        // 从skills表中获取角色技能数组，用参数skillLevel初始化LeveledSkill后储存为私有属性skills数组
        this.skills = this.char.技能.map((skill) => new LeveledSkill(skill.skillData, this.skillLevel))

        // 从char中获取同率武器值，如果非空则从武器表中获取同率武器属性，储存为私有字段skillWeapon
        if (this.char.同律武器) {
            try {
                this.skillWeapon = new LeveledSkillWeapon(this.char.同律武器, this.skillLevel)
            } catch (error) {
                console.error(`同律武器 ${this.char.同律武器} 初始化失败:`, error)
            }
        } else {
            this.skillWeapon = undefined
        }
    }
    public skillLevel: number = 10
    public hpPercent: number
    public resonanceGain: number
    public auraMod?: LeveledMod
    public charMods: LeveledMod[]
    public meleeMods: LeveledMod[]
    public rangedMods: LeveledMod[]
    public skillWeaponMods: LeveledMod[]
    public buffs: LeveledBuff[]
    public dynamicBuffs: LeveledBuff[]
    public meleeWeapon: LeveledWeapon
    public rangedWeapon: LeveledWeapon
    public baseName = ""
    public imbalance = false
    public enemyType: string
    public enemyLevel: number
    public enemyResistance: number
    public enemyHpType: string
    public targetFunction: string
    public skills!: LeveledSkill[]
    public skillWeapon?: LeveledSkillWeapon
    public timeline?: CharBuildTimeline

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

    constructor(options: CharBuildOptions) {
        this.skillLevel = options.skillLevel || 10
        this.char = options.char
        this.hpPercent = Math.max(0, Math.min(1, options.hpPercent))
        this.resonanceGain = options.resonanceGain
        this.auraMod = options.auraMod
        this.charMods = options.charMods || []
        this.meleeMods = options.meleeMods || []
        this.rangedMods = options.rangedMods || []
        this.skillWeaponMods = options.skillWeaponMods || []
        this.buffs = options.buffs?.filter((v) => !v.code) || []
        this.dynamicBuffs = options.buffs?.filter((v) => v.code) || []
        this.imbalance = options.imbalance || false
        this.meleeWeapon = options.melee
        this.rangedWeapon = options.ranged
        this.baseName = options.baseName
        this.enemyType = options.enemyType || "小型"
        this.enemyLevel = options.enemyLevel || 80
        this.enemyResistance = options.enemyResistance || 0
        this.enemyHpType = options.enemyHpType || "生命"
        this.targetFunction = options.targetFunction || "伤害"
        this.timeline = options.timeline
    }

    get mods() {
        return [...this.charMods, ...this.meleeMods, ...this.rangedMods, ...this.skillWeaponMods]
    }

    set mods(mods: LeveledMod[]) {
        this.charMods = mods.filter((v) => v.类型 === "角色")
        this.meleeMods = mods.filter((v) => v.类型 === "近战")
        this.rangedMods = mods.filter((v) => v.类型 === "远程")
        this.skillWeaponMods = mods.filter((v) => v.类型.startsWith("同律"))
    }

    get modsWithWeapons() {
        return [...this.mods, this.meleeWeapon, this.rangedWeapon]
    }

    get baseNameTitle() {
        return this.baseName.replace(/\[.+?\]/, "")
    }
    get baseNameSub() {
        const match = this.baseName.match(/\[(.+?)\]/)
        return match ? match[1] : ""
    }

    // 计算角色所有属性（基础属性和其他属性）
    public calculateAttributes(props?: LeveledWeapon | LeveledMod | LeveledBuff, minus = false, nocode = false): CharAttr {
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
        let imbalanceDamageBonus = this.getTotalBonus("失衡易伤")
        let skillAdd = this.getTotalBonus("技能倍率加数")
        let summonAttackSpeed = this.getTotalBonus("召唤物攻击速度")
        let summonRange = this.getTotalBonus("召唤物范围")
        let ignoreDefense = this.getTotalBonusMul("无视防御")
        let independentDamageIncrease = this.getTotalBonusMul("独立增伤")
        let damageReduce = this.getTotalBonusMul("减伤")

        // 应用MOD属性加成
        let modAttributeBonus = this.getTotalBonus("MOD属性")
        if (modAttributeBonus > 0) {
            // 计算狮鹫百首契约者MOD属性加成
            const modsBySeries = this.mods.filter((mod) => CharBuild.elmSeries.includes(mod.系列))
            attackBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "攻击")
            healthBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "生命")
            shieldBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "护盾")
            defenseBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "防御")
            sanityBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "神智")
            elemDamageBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "属性伤")
            power += modAttributeBonus * this.getModsBonus(modsBySeries, "威力")
            durability += modAttributeBonus * this.getModsBonus(modsBySeries, "耐久")
            efficiency += modAttributeBonus * this.getModsBonus(modsBySeries, "效益")
            range += modAttributeBonus * this.getModsBonus(modsBySeries, "范围")
            boost += modAttributeBonus * this.getModsBonus(modsBySeries, "昂扬")
            desperate += modAttributeBonus * this.getModsBonus(modsBySeries, "背水")
            damageIncrease += modAttributeBonus * this.getModsBonus(modsBySeries, "增伤")
            weaponDamage += modAttributeBonus * this.getModsBonus(modsBySeries, "武器伤害")
            skillDamage += modAttributeBonus * this.getModsBonus(modsBySeries, "技能伤害")
            skillSpeed += modAttributeBonus * this.getModsBonus(modsBySeries, "技能速度")
            penetration += modAttributeBonus * this.getModsBonus(modsBySeries, "属性穿透")
            imbalanceDamageBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "失衡易伤")
            skillAdd += modAttributeBonus * this.getModsBonus(modsBySeries, "技能倍率加数")
            summonAttackSpeed += modAttributeBonus * this.getModsBonus(modsBySeries, "召唤物攻击速度")
            summonRange += modAttributeBonus * this.getModsBonus(modsBySeries, "召唤物范围")
        }

        if (props && ("类别" in props || !props.类型 || props.类型 === "角色")) {
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
                imbalanceDamageBonus -= this.getTotalBonusSingle(props, "失衡易伤")
                skillAdd -= this.getTotalBonusSingle(props, "技能倍率加数")
                summonAttackSpeed -= this.getTotalBonusSingle(props, "召唤物攻击速度")
                summonRange -= this.getTotalBonusSingle(props, "召唤物范围")
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
                imbalanceDamageBonus += this.getTotalBonusSingle(props, "失衡易伤")
                skillAdd += this.getTotalBonusSingle(props, "技能倍率加数")
                summonAttackSpeed += this.getTotalBonusSingle(props, "召唤物攻击速度")
                summonRange += this.getTotalBonusSingle(props, "召唤物范围")
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

        let attrs: CharAttr = {
            // 基础属性
            攻击: attack,
            生命: health,
            护盾: shield,
            防御: defense,
            神智: sanity,
            // 其他属性
            威力: power,
            耐久: durability,
            效益: efficiency,
            范围: range,
            昂扬: boost,
            背水: desperate,
            增伤: damageIncrease,
            武器伤害: weaponDamage,
            技能伤害: skillDamage,
            独立增伤: skillSpeed,
            属性穿透: penetration,
            无视防御: imbalanceDamageBonus,
            技能速度: skillAdd,
            失衡易伤: ignoreDefense,
            技能倍率加数: independentDamageIncrease,
            召唤物攻击速度: summonAttackSpeed,
            召唤物范围: summonRange,
            减伤: damageReduce,
        }
        // 应用MOD条件
        attrs = this.applyCondition(
            attrs,
            this.charMods.filter((mod) => mod.生效?.条件),
        )
        if (nocode) return attrs
        if (this.dynamicBuffs.length > 0 || (!minus && props?.code)) {
            const all = this.getAllWeaponsAttrs(props, minus)
            if (this.dynamicBuffs.length > 0) {
                for (const b of this.dynamicBuffs) {
                    if (minus && props!.名称 === b.名称) continue
                    attrs = b.applyDynamicAttr(char, attrs, this.allWeapons, all)
                }
            }
            if (!minus && props?.code) {
                attrs = props.applyDynamicAttr(char, attrs, this.allWeapons, all)
            }
        }

        return attrs
    }

    public applyCondition(attrs: CharAttr, mods: LeveledMod[]) {
        mods.forEach((mod) => {
            attrs = mod.applyCondition(attrs)
        })
        return attrs
    }

    // 计算武器属性
    public calculateWeaponAttributes(
        props?: LeveledWeapon | LeveledMod | LeveledBuff,
        minus = false,
        weapon = this.selectedWeapon || (this.selectedSkill?.召唤物 && this.meleeWeapon),
        nocode = false,
        nochar = false,
    ): CharAttr & { weapon?: WeaponAttr } {
        const char = this.char
        let attrs: CharAttr & { weapon?: WeaponAttr } = nochar ? ({} as any) : this.calculateAttributes(props, minus, true)

        if (weapon) {
            const prefix = weapon.类型
            // 计算各种加成
            let attackBonus = this.getTotalBonus(`${prefix}攻击`, prefix) + this.getTotalBonus(`攻击`, prefix)
            // 角色精通
            if (weapon.类别 === this.char.近战 || weapon.类别 === this.char.远程) {
                attackBonus += 0.2
            }
            let physicalBonus = this.getTotalBonus("物理", prefix)
            let critRateBonus = this.getTotalBonus(`${prefix}暴击`, prefix) + this.getTotalBonus(`暴击`, prefix)
            let critDamageBonus = this.getTotalBonus(`${prefix}暴伤`, prefix) + this.getTotalBonus(`暴伤`, prefix)
            let triggerRateBonus = this.getTotalBonus(`${prefix}触发`, prefix) + this.getTotalBonus(`触发`, prefix)
            let attackSpeedBonus = this.getTotalBonus(`${prefix}攻速`, prefix) + this.getTotalBonus(`攻速`, prefix)
            let multiShotBonus = this.getTotalBonus(`${prefix}多重`, prefix) + this.getTotalBonus(`多重`, prefix)
            let damageIncrease = this.getTotalBonus(`${prefix}增伤`, prefix) + this.getTotalBonus(`增伤`, prefix)
            let additionalDamage = this.getTotalBonus("追加伤害")
            let independentDamageIncrease =
                (1 + this.getTotalBonus(`${prefix}增伤`, prefix)) * (1 + this.getTotalBonusMul("独立增伤", prefix)) - 1

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
                    physicalBonus -= this.getTotalBonusSingle(props, `物理`, prefix)
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
                    independentDamageIncrease =
                        (1 + independentDamageIncrease) / (1 + this.getTotalBonusSingle(props, "独立增伤", prefix)) - 1

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
                    physicalBonus += this.getTotalBonusSingle(props, `物理`, prefix)
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
                    independentDamageIncrease =
                        (1 + independentDamageIncrease) * (1 + this.getTotalBonusSingle(props, "独立增伤", prefix)) - 1

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
                攻击: attack,
                暴击: critRate,
                暴伤: critDamage,
                触发: triggerRate,
                攻速: attackSpeed,
                多重: multiShot,
                增伤: damageIncrease,
                独立增伤: independentDamageIncrease,
                追加伤害: additionalDamage,
            }
            attrs.weapon = weaponAttrs
        }
        if (nocode) return attrs

        if (this.dynamicBuffs.length > 0 || (!minus && props?.code)) {
            // TODO: 没做其他武器属性的code计算, 可能有问题 不过递归太多次也很麻烦
            const all = this.getAllWeaponsAttrs(props, minus, weapon, attrs.weapon)
            if (this.dynamicBuffs.length > 0) {
                for (const b of this.dynamicBuffs) {
                    if (minus && props!.名称 === b.名称) continue
                    attrs = b.applyDynamicAttr(char, attrs, this.allWeapons, all)
                }
            }
            if (!minus && props?.code) {
                attrs = props.applyDynamicAttr(char, attrs, this.allWeapons, all)
            }
        }
        return attrs
    }

    get allWeapons() {
        return [this.selectedWeapon, this.meleeWeapon, this.rangedWeapon, this.skillWeapon]
    }

    /**
     * 获取所有武器属性
     * @param props 武器属性
     * @param minus 是否减去属性
     * @param weapon 当前武器
     * @param weaponAttrs 当前武器属性
     * @returns 所有武器属性
     */
    getAllWeaponsAttrs(
        props?: LeveledWeapon | LeveledMod | LeveledBuff,
        minus = false,
        weapon?: LeveledWeapon | LeveledSkillWeapon,
        weaponAttrs?: WeaponAttr,
    ) {
        return this.allWeapons
            .map((w) =>
                w
                    ? w.名称 === weapon?.名称
                        ? { weapon: weaponAttrs }
                        : this.calculateWeaponAttributes(props, minus, w, true, true)
                    : undefined,
            )
            .map((a) => a?.weapon)
    }

    // 获取单项目总加成
    public getTotalBonusSingle(props: LeveledWeapon | LeveledMod | LeveledBuff, attribute: string, prefix?: string): number {
        let bonus = 0

        const isMod = "id" in props && props.id && modMap.has(props.id)
        // 检查属性是否符合前缀
        if (!isMod || !prefix || !attribute.startsWith(prefix)) {
            if (prefix && (props as any).类型 && (props as any).类型 !== prefix) return 0
            // 这几种BUFF只对角色生效
            if (["攻击", "增伤", "独立增伤"].includes(attribute)) {
                if (!isMod && prefix) return 0
            }
            if (typeof (props as any)[attribute] === "number") {
                bonus += (props as any)[attribute]
            }
        }
        return bonus
    }

    // 获取总加成
    public getTotalBonus(attribute: string, prefix = "角色"): number {
        let bonus = 0

        // 添加角色自带加成
        if (prefix === "角色" && typeof this.char[attribute] === "number") {
            bonus += this.char[attribute]
        }

        // 添加近战武器加成
        if ((prefix === "角色" || (prefix === "近战" && attribute !== "攻击")) && this.meleeWeapon) {
            if (typeof this.meleeWeapon[attribute] === "number") {
                bonus += this.meleeWeapon[attribute]
            }
        }
        // 添加远程武器加成
        if ((prefix === "角色" || (prefix === "远程" && attribute !== "攻击")) && this.rangedWeapon) {
            if (typeof this.rangedWeapon[attribute] === "number") {
                bonus += this.rangedWeapon[attribute]
            }
        }

        // 添加MOD加成
        if (prefix === "角色" || !attribute.startsWith(prefix))
            this.mods.forEach((mod) => {
                if (prefix && mod.类型 !== prefix) return
                if (typeof mod[attribute] === "number") {
                    bonus += mod[attribute]
                }
            })

        // 添加BUFF加成
        this.buffs.forEach((buff) => {
            if (prefix !== "角色" && ["攻击", "增伤"].includes(attribute)) return
            if (typeof buff[attribute] === "number") {
                bonus += buff[attribute]
            }
        })

        return bonus
    }

    public getModsBonus(mods: LeveledMod[], attribute: string, prefix = "角色"): number {
        let bonus = 0

        // 添加MOD加成
        if (prefix === "角色" || !attribute.startsWith(prefix))
            mods.forEach((mod) => {
                if (prefix && mod.类型 !== prefix) return
                if (typeof mod[attribute] === "number") {
                    bonus += mod[attribute]
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
        const boost = attrs.昂扬
        const hpPercent = Math.max(0, Math.min(1, this.hpPercent || 0))
        return 1 + boost * hpPercent
    }

    // 计算背水乘区
    public calculateDesperateMultiplier(attrs: ReturnType<typeof this.calculateAttributes>): number {
        const desperate = attrs.背水
        const hpPercent = Math.max(0.25, Math.min(1, this.hpPercent))
        return 1 + 4 * desperate * (1 - hpPercent) * (1.5 - hpPercent)
    }

    /**
     * 计算防御乘区
     * @param attrs 属性
     * @param finalDef 可选, 最终防御值
     * @returns 防御乘区
     */
    public calculateDefenseMultiplier(attrs: ReturnType<typeof this.calculateAttributes>, finalDef?: number): number {
        // 如果敌方血量类型为护盾，防御乘区固定为1
        if (this.enemyHpType === "护盾") {
            return 1
        }

        const enemyTypeCoeff = this.enemyTypeCoefficients[this.enemyType] || 13
        // 确保等级和敌方等级都是有效的数字
        const charLevel = typeof this.char.等级 === "number" ? this.char.等级 : 80
        const enemyLevel = typeof this.enemyLevel === "number" ? this.enemyLevel : 80

        const levelDiff = Math.max(0, Math.min(20, Math.min(80, enemyLevel) - charLevel))
        const def = finalDef ?? enemyTypeCoeff * 10 * (1 - attrs.无视防御)
        const dmgReduce = def / (300 + def - levelDiff * 10) // 减伤率
        const defenseMultiplier = 1 - dmgReduce
        return Math.max(0, Math.min(1, defenseMultiplier))
    }

    // 计算技能伤害
    public calculateSkillDamage(attrs: ReturnType<typeof this.calculateAttributes>, skill: LeveledSkill) {
        // 计算技能基础伤害
        let damage = skill.伤害
        let baseDamage = damage?.额外 || 0
        if (damage) {
            const mul = damage.值 + attrs.技能倍率加数
            if (!damage.基础) {
                baseDamage += mul * attrs.攻击
            }
            if (damage.基础 === "生命") {
                baseDamage += mul * attrs.生命
            }
            if (damage.基础 === "防御") {
                baseDamage += mul * attrs.防御
            }
        }
        baseDamage *= attrs.威力

        // 计算各种乘区
        const resistancePenetration = Math.max(0, 1 - this.enemyResistance + attrs.属性穿透)
        const boostMultiplier = this.calculateBoostMultiplier(attrs)
        const desperateMultiplier = this.calculateDesperateMultiplier(attrs)
        const defenseMultiplier = this.calculateDefenseMultiplier(attrs)
        const damageIncrease = 1 + attrs.增伤 + attrs.技能伤害
        const independentDamageIncrease = 1 + attrs.独立增伤
        const imbalanceDamageMultiplier = this.imbalance ? attrs.失衡易伤 + 1.5 : 1

        // 计算最终伤害
        let finalDamage =
            baseDamage *
            resistancePenetration *
            boostMultiplier *
            desperateMultiplier *
            defenseMultiplier *
            damageIncrease *
            independentDamageIncrease *
            imbalanceDamageMultiplier

        return { expectedDamage: finalDamage }
    }

    // 计算武器伤害
    public calculateWeaponDamage(
        attrs: ReturnType<typeof this.calculateWeaponAttributes>,
        weapon: LeveledWeapon | LeveledSkillWeapon,
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
        const weaponDamagePhysical = weaponAttackMultiplier * weaponAttrs.攻击
        const weaponDamageElemental = weaponAttackMultiplier * attrs.攻击

        // 计算触发伤害期望
        const triggerDamageMultiplier =
            weapon.伤害类型 === this.enemyHpType ? this.hpTypeCoefficients[this.enemyHpType] + this.getTotalBonus("触发倍率") : 0
        const triggerRate = weaponAttrs.触发
        const triggerDamage = 1 + triggerDamageMultiplier
        const triggerExpectedDamage = 1 + triggerDamageMultiplier * triggerRate

        // 计算暴击伤害期望
        const critRate = weaponAttrs.暴击
        const critDamage = weaponAttrs.暴伤
        const lowerCritDamage = (weaponAttrs.暴伤 - 1) * Math.floor(weaponAttrs.暴击) + 1
        const higherCritDamage = (weaponAttrs.暴伤 - 1) * Math.ceil(weaponAttrs.暴击) + 1
        const critExpectedDamage = 1 + critRate * (critDamage - 1)

        // 计算各种乘区
        const resistancePenetration = 1 - this.enemyResistance + attrs.属性穿透
        const boostMultiplier = this.calculateBoostMultiplier(attrs)
        const desperateMultiplier = this.calculateDesperateMultiplier(attrs)
        const defenseMultiplier = this.calculateDefenseMultiplier(attrs)
        const damageIncrease = 1 + attrs.增伤 + weaponAttrs.增伤 + attrs.武器伤害
        const independentDamageIncrease = (1 + attrs.独立增伤) * (1 + weaponAttrs.独立增伤)
        const additionalDamage = 1 + weaponAttrs.追加伤害
        const imbalanceDamageMultiplier = this.imbalance ? attrs.失衡易伤 + 1.5 : 1
        const commonMore =
            boostMultiplier *
            desperateMultiplier *
            defenseMultiplier *
            damageIncrease *
            independentDamageIncrease *
            additionalDamage *
            imbalanceDamageMultiplier

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

    public hasSummon() {
        return this.selectedSkill?.召唤物 !== undefined
    }

    // 计算目标函数
    public calculateTargetFunction(damage: DamageResult, attrs: ReturnType<typeof this.calculateWeaponAttributes>): number {
        // 计算伤害(DPA)
        let dpa = damage.expectedDamage
        let tdd = dpa
        let dpac = damage.higherCritNoTrigger || dpa

        // 计算每秒伤害(DPS)
        let dps = damage.expectedDamage
        let dpb = damage.expectedDamage
        let weapon = this.selectedWeapon
        let skill = this.selectedSkill
        if (weapon && attrs.weapon) {
            const weaponAttrs = attrs.weapon
            dps = dpa = dpa * weaponAttrs.多重
            if (!this.timeline) dps = dpa * weaponAttrs.攻速
            dpb = dpb / (1 + weaponAttrs.追加伤害)
            // 非弹道武器多重直接加伤害
            if (weapon.弹道类型 === "非弹道") {
                dpb *= weaponAttrs.多重
            }
        } else if (skill) {
            if (!this.timeline) {
                dps = dpa * (1 + attrs.技能速度)
                // 召唤物
                const summon = skill.召唤物
                if (summon) {
                    const summonAttrs = skill.getSummonAttrsMap(attrs)!
                    const duration = summonAttrs?.duration || 0

                    const attackTimes = Math.floor((duration - summonAttrs?.delay) / summonAttrs?.interval)
                    tdd = dpa * attackTimes
                    dps = tdd / duration
                }
            }
        }
        // 除以时间线总长度
        if (this.timeline) dps /= this.timeline.totalTime
        // 计算效益影响下的神智消耗
        const baseSanityCost = skill?.神智消耗值 || 100 // 从技能中获取或使用默认值
        const baseSustainedCost = skill?.每秒神智消耗值 || 100 // 从技能中获取或使用默认值
        const sanityCost = Math.ceil(Math.max(0, baseSanityCost * (2 - attrs.效益)))
        let sustainedCost = baseSustainedCost
        const sustainedCostField = skill?.每秒神智消耗

        if (sustainedCostField && sustainedCostField.属性影响 && !sustainedCostField.属性影响.includes("耐久")) {
            sustainedCost = Math.ceil(Math.max(0, baseSustainedCost * (2 - attrs.效益)))
        } else {
            sustainedCost = Math.ceil(Math.max(0, baseSustainedCost * Math.max(0.25, (2 - attrs.效益) / attrs.耐久)))
        }

        switch (this.targetFunction) {
            case "弹片伤害":
            case "DPB":
                return dpb
            case "总伤":
            case "TDD":
                return tdd
            case "伤害":
            case "DPA":
                return dpa
            case "暴击伤害":
            case "DPAC":
                return dpac
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
                return damage.expectedDamage
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
        let bt = this.baseNameTitle
        const skill = this.skills.find((s) => s.名称 === bt)
        return skill
    }

    get selectedSkillKey() {
        let bt = this.baseNameTitle
        const index = this.skills.findIndex((s) => s.名称 === bt)
        return index >= 0 ? ["E", "Q", ""][index] : ""
    }

    public isModEffective(mod: LeveledMod, includeSelf = false) {
        if (!mod.生效?.条件) return false
        const attrs = this.calculateAttributes(includeSelf ? undefined : mod)
        return mod.checkCondition(attrs)
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
    public calculateOneTime(
        props?: LeveledWeapon | LeveledMod | LeveledBuff,
        minus = false,
        attrs?: ReturnType<typeof this.calculateWeaponAttributes>,
    ): number {
        // 查找要计算的武器或技能
        let damage: DamageResult = {
            expectedDamage: 0,
        }
        let weapon = this.selectedWeapon
        let bs = this.baseNameSub
        if (!attrs) attrs = this.calculateWeaponAttributes(props, minus)
        if (weapon) {
            if (bs) weapon.倍率名称 = bs
            damage = this.calculateWeaponDamage(attrs, weapon)
            if (weapon.类型.startsWith("同律")) {
                Object.keys(damage).forEach((k) => {
                    damage[k as keyof DamageResult] = damage[k as keyof DamageResult]! * attrs.威力
                })
            }
        } else {
            const skill = this.selectedSkill
            if (skill) {
                skill.子技能名 = bs
                damage = this.calculateSkillDamage(attrs, skill)
            }
        }

        // 计算目标函数
        return this.calculateTargetFunction(damage, attrs)
    }
    /**
     * 主计算函数(包含时间线)
     * @param props 武器、模组或 buff
     * @returns 目标函数结果
     */
    public calculate(props?: LeveledWeapon | LeveledMod | LeveledBuff, minus = false): number {
        let timeline = this.timeline
        if (!timeline) {
            return Math.round(this.calculateOneTime(props, minus))
        }
        let totalDamage = 0
        const buffItems = timeline.items.filter((i) => i.lv).map((i) => ({ ...i, buff: new LeveledBuff(i.name, i.lv) }))
        const skillItems = timeline.items.filter((i) => !i.lv)
        const skillLayers = groupBy(skillItems, (i) => i.track)
        const skillLayerKeys = Object.keys(skillLayers).map(Number).sort()
        function getBuffsAtTime(time: number, track: number) {
            // 查找当前轨道及后续轨道的 buff, 但不能超过下一层技能的轨道
            const maxTrack = skillLayerKeys.find((t) => t > track) || Infinity
            return buffItems
                .filter((i) => i.time <= time && i.time + i.duration >= time && i.track >= track && i.track < maxTrack)
                .map((i) => i.buff)
        }
        const initBaseName = this.baseName
        skillItems.forEach((i) => {
            const buffs = getBuffsAtTime(i.time, i.track)
            const build = buffs.length ? this.clone().applyBuffs(buffs) : this
            build.baseName = i.name
            const attrs = build.calculateWeaponAttributes(props, minus)
            const damage = build.calculateOneTime(props, minus, attrs)
            totalDamage += damage
            // 召唤物
            const summon = this.selectedSkill?.召唤物
            if (summon) {
                const newAttr = build.calculateWeaponAttributes(props, minus, build.meleeWeapon)
                const summonAttrs = this.selectedSkill.getFieldsWithAttr(newAttr)
                const duration = summonAttrs.find((a) => a.名称 === "召唤物持续时间")?.值 || 0
                const delay = summonAttrs.find((a) => a.名称 === "召唤物攻击延迟")?.值 || 0
                const interval = summonAttrs.find((a) => a.名称 === "召唤物攻击间隔")?.值 || 0
                const attackTimes = Math.floor((duration - delay) / interval)
                totalDamage *= attackTimes
            }
        })
        this.baseName = initBaseName
        return Math.round(totalDamage)
    }

    public applyBuffs(buffs: LeveledBuff[]) {
        this.buffs.push(...buffs)
        return this
    }
    /**
     * 计算单属性收益（加上属性值）
     * @param props 武器、模组或 buff
     * @returns 单属性值
     */
    public calcIncome(props?: LeveledWeapon | LeveledMod | LeveledBuff, minus = false): number {
        if (minus) {
            return this.calculate() / this.calculate(props, minus) - 1
        } else {
            return this.calculate(props, minus) / this.calculate() - 1
        }
    }

    clone() {
        return new CharBuild({
            char: new LeveledChar(this.char.名称, this.char.等级),
            hpPercent: this.hpPercent,
            resonanceGain: this.resonanceGain,
            imbalance: this.imbalance,
            auraMod: this.auraMod ? new LeveledMod(this.auraMod.id, this.auraMod.等级) : undefined,
            charMods: this.charMods.map((m) => new LeveledMod(m.id, m.等级, m.buffLv)),
            meleeMods: this.meleeMods.map((m) => new LeveledMod(m.id, m.等级, m.buffLv)),
            rangedMods: this.rangedMods.map((m) => new LeveledMod(m.id, m.等级, m.buffLv)),
            skillWeaponMods: this.skillWeaponMods.map((m) => new LeveledMod(m.id, m.等级, m.buffLv)),
            buffs: this.buffs.map((b) => new LeveledBuff(b.名称, b.等级)),
            melee: new LeveledWeapon(this.meleeWeapon.名称, this.meleeWeapon.精炼, this.meleeWeapon.等级, this.meleeWeapon.effectLv),
            ranged: new LeveledWeapon(this.rangedWeapon.名称, this.rangedWeapon.精炼, this.rangedWeapon.等级, this.meleeWeapon.effectLv),
            baseName: this.baseNameTitle,
            enemyType: this.enemyType,
            enemyLevel: this.enemyLevel,
            enemyResistance: this.enemyResistance,
            enemyHpType: this.enemyHpType,
            targetFunction: this.targetFunction,
            skillLevel: this.skills[0].等级,
            timeline: this.timeline,
        })
    }

    getCode(type = "角色") {
        const slots = type === "同律" ? 4 : 8
        const ids = this.mods.filter((v) => v.类型 === type).map((v) => v.id)
        const mods = this.codeSwapR(ids, slots)
            .map(base36Pad)
            .join("")
            .padEnd(slots * 4, "0")
        const auraMod = base36Pad(this.auraMod?.id || 0).padEnd(4, "0")
        const flag = type === "角色" ? "C" : "W"
        return `${flag}${base36Pad(this.char.id || 0)}${mods}${auraMod}`
    }
    codeSwapR(ids: number[], len = 8) {
        const rst = Array(len).fill(0)
        ids.map((v, i) => (rst[[1, 3, 4, 2, 5, 7, 8, 6][i] - 1] = v))
        return rst
    }
    codeSwap(ids: number[]) {
        // 交换顺序
        return ids.map((_, i) => ids[[1, 3, 4, 2, 5, 7, 8, 6][i] - 1])
    }
    importCode(charCode: string, type = "角色") {
        try {
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
                if (modIds.length < 4) {
                    console.warn("导入代码格式错误")
                    return
                }
                return { mods: this.codeSwap(modIds.slice(0, 8)) }
            }
        } catch (error) {
            console.warn("导入代码格式错误")
            return
        }
    }

    static indepSeries = ["百首", "狮鹫", "中庭蛇"]
    static elmSeries = ["狮鹫", "百首", "契约者", "换生灵"]
    static exclusiveSeries = [...CharBuild.indepSeries, "审判者", "巨鲸", "金乌", "焰灵", "黄衣", "夜使"]
    /**
     * 自动构筑
     * @param buildOptions 构筑参数
     * @returns 构筑结果
     */
    autoBuild({
        includeTypes,
        preserveTypes = [],
        fixedMelee,
        fixedRanged,
        modOptions,
        meleeOptions = [],
        rangedOptions = [],
        enableLog = true,
    }: BuildOption) {
        const initBuild = this.clone()
        includeTypes.forEach((key) => (preserveTypes.includes(key) ? 0 : (initBuild[key] = [])))
        const localBuild = initBuild.clone()
        // 创建一个集合记录已选择的互斥系列
        const selectedExclusiveSeries = {
            charMods: new Set<string>(),
            meleeMods: new Set<string>(),
            rangedMods: new Set<string>(),
            skillWeaponMods: new Set<string>(),
        }
        // 创建一个集合记录已选择的非契约者MOD名称（用于名称互斥）
        const selectedExclusiveNames = {
            charMods: new Set<string>(),
            meleeMods: new Set<string>(),
            rangedMods: new Set<string>(),
            skillWeaponMods: new Set<string>(),
        }
        // 记录已选择的MOD数量
        const selectedModCount = new Map<number, number>()

        includeTypes.forEach((key) => {
            localBuild[key] = []
            initBuild[key].forEach((mod) => addMod(key, mod))
        })
        let logString = ""
        function log(msg: string) {
            if (enableLog) logString += msg + "\n"
        }
        log(`开始自动构筑`)
        function addMod(key: ModTypeKey, mod: LeveledMod) {
            localBuild[key].push(mod)
            // 记录互斥系列
            if (CharBuild.indepSeries.includes(mod.系列)) {
                selectedExclusiveSeries[key].add(mod.系列)
            }
            // 记录非契约者MOD名称（用于名称互斥）
            if (mod.系列 !== "契约者") {
                mod.excludeNames.forEach((name) => selectedExclusiveNames[key].add(name))
            } else {
                selectedModCount.set(mod.id, (selectedModCount.get(mod.id) || 0) + 1)
            }
        }
        function removeMod(key: ModTypeKey, index: number) {
            const mod = localBuild[key][index]
            localBuild[key].splice(index, 1)
            // 从互斥系列集合中移除
            if (CharBuild.indepSeries.includes(mod.系列)) {
                selectedExclusiveSeries[key].delete(mod.系列)
            }
            // 从非契约者MOD名称集合中移除
            if (mod.系列 !== "契约者") {
                mod.excludeNames.forEach((name) => selectedExclusiveNames[key].delete(name))
            } else {
                const count = (selectedModCount.get(mod.id) || 0) - 1
                if (count > 0) selectedModCount.set(mod.id, count)
                else selectedModCount.delete(mod.id)
            }
        }
        function sortByIcome(key: ModTypeKey) {
            const initMods = initBuild[key]
            const rst = localBuild[key].slice(initMods.length).sort((a, b) => {
                return localBuild.calcIncome(b, true) - localBuild.calcIncome(a, true)
            })
            localBuild[key] = [...initMods, ...rst]
            return rst[0]
        }
        function findMaxMod(key: ModTypeKey) {
            const type = ModTypeMap[key]
            const mapped = modOptions
                .filter(
                    (v) =>
                        v.类型.startsWith(type) &&
                        (!v.属性 || v.属性 === localBuild.char.属性) &&
                        (!v.限定 ||
                            (key === "meleeMods" && [localBuild.meleeWeapon.伤害类型, localBuild.meleeWeapon.类别].includes(v.限定)) ||
                            (key === "rangedMods" && [localBuild.rangedWeapon.伤害类型, localBuild.rangedWeapon.类别].includes(v.限定)) ||
                            (key === "skillWeaponMods" &&
                                localBuild.skillWeapon &&
                                [localBuild.skillWeapon.伤害类型, localBuild.skillWeapon.类别].includes(v.限定))) &&
                        !v.excludeNames.some((name) => selectedExclusiveNames[key].has(name)) &&
                        !selectedExclusiveSeries[key].has(v.系列) &&
                        (selectedModCount.get(v.id) || 0) < v.count,
                )
                .map((v) => ({ mod: v, income: localBuild.calcIncome(v) }))
            if (mapped.length === 0) return { mod: null, income: 0 }
            return mapped.reduce((a, b) => (b.income > a.income ? b : a))
        }
        function findMaxMelee() {
            const tempBuild = localBuild.clone()
            tempBuild.meleeWeapon = LeveledWeapon.emptyWeapon
            return meleeOptions.reduce((a, b) => (tempBuild.calcIncome(b) > tempBuild.calcIncome(a) ? b : a))
        }
        function findMaxRanged() {
            const tempBuild = localBuild.clone()
            tempBuild.rangedWeapon = LeveledWeapon.emptyWeapon
            return rangedOptions.reduce((a, b) => (tempBuild.calcIncome(b) > tempBuild.calcIncome(a) ? b : a))
        }
        function next(iter: number) {
            let changed = false
            // 最大化武器
            if (!fixedMelee) {
                const maxed = findMaxMelee()
                if (maxed.名称 !== localBuild.meleeWeapon.名称) {
                    const oldName = localBuild.meleeWeapon.名称
                    const oldIncome = localBuild.calcIncome(localBuild.meleeWeapon, true)
                    localBuild.meleeWeapon = maxed
                    log(
                        `第${iter}次迭代: 用近战 ${maxed.名称} 替换 ${oldName} 收益: ${+(oldIncome * 100).toFixed(2)}% -> ${+(localBuild.calcIncome(maxed, true) * 100).toFixed(2)}%`,
                    )
                    changed = true
                }
            }
            if (!fixedRanged) {
                const maxed = findMaxRanged()
                if (maxed.名称 !== localBuild.rangedWeapon.名称) {
                    const oldName = localBuild.rangedWeapon.名称
                    const oldIncome = localBuild.calcIncome(localBuild.rangedWeapon, true)
                    localBuild.rangedWeapon = maxed
                    log(
                        `第${iter}次迭代: 用远程 ${maxed.名称} 替换 ${oldName} 收益: ${+(oldIncome * 100).toFixed(2)}% -> ${+(localBuild.calcIncome(maxed, true) * 100).toFixed(2)}%`,
                    )
                    changed = true
                }
            }
            // 最大化MOD
            includeTypes.forEach((key) => {
                let { mod: maxed, income: maxedIncome } = findMaxMod(key)
                if (maxed === null || initBuild[key].length >= ModTypeMaxSlot[key]) return
                if (!maxedIncome) {
                    log(`第${iter}次迭代: 当前选项MOD无收益, 直接退出`)
                    return
                }
                while (localBuild[key].length < ModTypeMaxSlot[key]) {
                    // 不添加收益0的MOD
                    if (maxedIncome <= 0) break
                    addMod(key, maxed)
                    changed = true
                    log(
                        `第${iter}次迭代: 添加${ModTypeMap[key]}(${localBuild[key].length}/${ModTypeMaxSlot[key]})>>> ${maxed.名称}(+${+(maxedIncome * 100).toFixed(2)}%)`,
                    )
                    ;({ mod: maxed, income: maxedIncome } = findMaxMod(key))
                    if (maxed === null) return
                }
                sortByIcome(key)
                const lastIncome = localBuild.calcIncome(localBuild[key].at(-1), true)
                const copyBuild = localBuild.clone()
                copyBuild[key].pop()
                const newIncome = copyBuild.calcIncome(maxed)
                log(
                    `第${iter}次迭代: ${ModTypeMap[key]}>>> ${localBuild[key].at(-1)?.名称}(+${+(lastIncome * 100).toFixed(2)}%) vs ${maxed.名称}(+${+(newIncome * 100).toFixed(2)}%)`,
                )
                if (newIncome > lastIncome) {
                    log(
                        `第${iter}次迭代: ${ModTypeMap[key]}>>> ${maxed.名称} 替换 ${localBuild[key].at(-1)?.名称} (${+(lastIncome * 100).toFixed(2)}% -> ${+(newIncome * 100).toFixed(2)}%)`,
                    )
                    removeMod(key, localBuild[key].length - 1)
                    addMod(key, maxed)
                    changed = true
                }
            })
            if (!changed) log(`无可替换MOD 结束自动构筑`)
            return changed
        }
        // 最大迭代次数
        const MAX_ITER = 200
        // 最大化MOD直到不再有变化
        for (let index = 0; index < MAX_ITER; index++) {
            if (!next(index + 1)) {
                return { newBuild: localBuild, log: logString, iter: index + 1 }
            }
        }
        return { newBuild: localBuild, log: logString, iter: MAX_ITER }
    }
}

export type ModTypeKey = "charMods" | "meleeMods" | "rangedMods" | "skillWeaponMods"
export enum ModTypeMap {
    charMods = "角色",
    meleeMods = "近战",
    rangedMods = "远程",
    skillWeaponMods = "同律",
}

export enum ModTypeMaxSlot {
    charMods = 8,
    meleeMods = 8,
    rangedMods = 8,
    skillWeaponMods = 4,
}

export interface DamageResult {
    /** 未触发低暴击伤害 */
    lowerCritNoTrigger?: number
    /** 未触发高暴击伤害 */
    higherCritNoTrigger?: number
    /** 触发低暴击伤害 */
    lowerCritTrigger?: number
    /** 触发高暴击伤害 */
    higherCritTrigger?: number
    /** 期望触发低暴击伤害 */
    lowerCritExpectedTrigger?: number
    /** 期望触发高暴击伤害 */
    higherCritExpectedTrigger?: number
    /** 期望伤害 */
    expectedDamage: number
}

export interface BuildOption {
    /** 包含的MOD类型 */
    includeTypes: ModTypeKey[]
    /** 保留的MOD类型 */
    preserveTypes?: ModTypeKey[]
    /** 是否固定近战武器 */
    fixedMelee?: boolean
    /** 是否固定远程武器 */
    fixedRanged?: boolean
    /** MOD选项 */
    modOptions: LeveledModWithCount[]
    /** 近战武器选项 */
    meleeOptions?: LeveledWeapon[]
    /** 远程武器选项 */
    rangedOptions?: LeveledWeapon[]
    /** 是否启用日志 */
    enableLog?: boolean
}
