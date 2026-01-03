import { LeveledChar, LeveledMod, LeveledBuff, LeveledWeapon, LeveledSkillWeapon, LeveledSkill, modMap, LeveledMonster } from "./leveled"
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
    技能威力: number
    技能耐久: number
    技能效益: number
    技能范围: number
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
    技能倍率赋值: number
    召唤物攻击速度: number
    召唤物范围: number
    减伤: number
    有效生命: number
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
    /** 装填时间 基于武器基础值 */
    装填: number
    /** 弹匣容量 基于武器基础值 */
    弹匣: number
    /** 独立增伤 0开始 */
    独立增伤: number
    /** 追加伤害 0开始 */
    追加伤害: number
    /** 武器倍率 0开始 */
    武器倍率: number
}

import type { RawTimelineData } from "../store/timeline"
import { groupBy } from "lodash-es"
import { AbstractMod, DmgType, HpType, Skill, WeaponSkillType } from "./data-types"
import { ASTNode, parseAST } from "./ast"
import { DynamicMonster } from "."
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
    charMods?: (LeveledMod | null)[]
    meleeMods?: (LeveledMod | null)[]
    rangedMods?: (LeveledMod | null)[]
    skillWeaponMods?: (LeveledMod | null)[]
    buffs?: LeveledBuff[]
    melee: LeveledWeapon
    ranged: LeveledWeapon
    baseName: string
    enemyId?: number
    enemyLevel?: number
    enemyResistance?: number
    targetFunction?: string
    skillLevel?: number
    timeline?: CharBuildTimeline
}

export class CharBuild {
    // 静态宏定义: 用于AST表达式的宏替换
    static macros: Record<string, string> = {
        ATK: "攻击",
        DEF: "防御",
        HP: "生命",
        SP: "神智",
        DPH: "伤害*or(多重,1)",
        总伤: "伤害*max(1,召唤物攻击次数)",
        暴击伤害: "伤害.暴击",
        DCD: "伤害.暴击",
        DPS: "伤害*or(攻速,1+技能速度)*or(多重,1)",
        范围收益: "伤害*技能范围",
        耐久收益: "伤害*技能耐久",
        效益收益: "伤害*技能效益",
        每神智DPH: "伤害/神智消耗",
        每持续神智DPH: "伤害/每秒神智消耗",
        每神智DPS: "伤害*or(攻速,1+技能速度)/神智消耗",
        每持续神智DPS: "伤害*or(攻速,1+技能速度)/每秒神智消耗",
    }

    public _char!: LeveledChar
    get char() {
        return this._char
    }
    set char(char: LeveledChar) {
        this._char = char
        // 从skills表中获取角色技能数组，用参数skillLevel初始化LeveledSkill后储存为属性skills数组
        this.skills = this.char.技能.map((skill) => new LeveledSkill(skill.skillData, this.skillLevel))

        // 从char中获取同率武器值，如果非空则从武器表中获取同率武器属性，储存为字段skillWeapon
        if (this.char.同律武器) {
            try {
                const uweaponData = this.char.同律武器[0]
                const uweaponSkillData = {
                    名称: uweaponData.名称,
                    类型: "同律武器伤害",
                    字段: {},
                } as Skill
                // 固定获取Q技能的伤害字段
                this.skills[1].字段.forEach((field) => {
                    if (field.名称.includes("伤害")) uweaponSkillData.字段![field.名称] = field
                })
                uweaponData.技能 = [uweaponSkillData]
                this.skillWeapon = new LeveledSkillWeapon(uweaponData, this.skillLevel, this.char.等级)
            } catch (error) {
                console.error(`同律武器 ${this.char.同律武器} 初始化失败:`, error)
            }
        } else {
            this.skillWeapon = undefined
        }
    }
    get meleeWeaponSkills() {
        return this.meleeWeapon.技能 || []
    }
    get rangedWeaponSkills() {
        return this.rangedWeapon.技能 || []
    }
    get skillWeaponSkills() {
        return this.skillWeapon?.技能 || []
    }
    get weaponSkills() {
        return [...this.meleeWeaponSkills, ...this.rangedWeaponSkills, ...this.skillWeaponSkills]
    }
    get allSkills() {
        return [...this.skills, ...this.weaponSkills]
    }
    public skillLevel: number = 10
    public hpPercent: number
    public resonanceGain: number
    public auraMod?: LeveledMod
    public charMods: (LeveledMod | null)[]
    public meleeMods: (LeveledMod | null)[]
    public rangedMods: (LeveledMod | null)[]
    public skillWeaponMods: (LeveledMod | null)[]
    public buffs: LeveledBuff[]
    public dynamicBuffs: LeveledBuff[]
    public meleeWeapon: LeveledWeapon
    public rangedWeapon: LeveledWeapon
    public baseName = ""
    public imbalance = false
    _enemyId: number = 1001001
    get enemyId() {
        return this._enemyId
    }
    set enemyId(value: number) {
        this._enemyId = value
        try {
            this.enemy = new LeveledMonster(value, this.enemyLevel)
        } catch (error) {
            console.error(`敌人 ${value} 初始化失败:`, error)
            this.enemy = new LeveledMonster(1001001, this.enemyLevel)
        }
    }
    public enemy!: LeveledMonster
    _enemyLevel: number = 180
    _enemyResistance: number = 0
    get enemyLevel() {
        return this._enemyLevel
    }
    set enemyLevel(value: number) {
        this._enemyLevel = value
        if (this.enemy) this.enemy.等级 = value
    }
    get enemyResistance() {
        return this._enemyResistance
    }
    set enemyResistance(value: number) {
        this._enemyResistance = value
    }
    public targetFunction: string
    public skills!: LeveledSkill[]
    public skillWeapon?: LeveledSkillWeapon
    public timeline?: CharBuildTimeline

    get baseWithTarget() {
        return this.baseName + "::" + this.targetFunction
    }
    set baseWithTarget(value: string) {
        const [base, target] = value.split("::")
        this.baseName = base
        this.targetFunction = target || ""
    }

    get charModsWithAura() {
        return (this.auraMod ? [this.auraMod!, ...this.charMods] : this.charMods).filter((v) => v !== null)
    }

    // 血量类型系数表
    hpTypeCoefficients: Record<string, number> = {
        生命: 0.5,
        护盾: 1,
        战姿: 1,
    }
    hpTypeDMG: Record<keyof typeof HpType, keyof typeof DmgType> = {
        生命: "贯穿",
        护盾: "切割",
        战姿: "震荡",
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
        this.enemyLevel = options.enemyLevel || 80
        this.enemyId = options.enemyId || 1001001
        this.enemyResistance = options.enemyResistance || 0
        this.targetFunction = options.targetFunction || "伤害"
        this.timeline = options.timeline
    }

    static fromCharSetting(
        selectedChar: string,
        inv: ReturnType<typeof import("../store/inv").useInvStore>,
        charSettings: typeof import("../composables/useCharSettings").defaultCharSettings,
        timeline?: CharBuildTimeline,
    ) {
        return new CharBuild({
            char: new LeveledChar(selectedChar, charSettings.charLevel),
            auraMod: new LeveledMod(charSettings.auraMod),
            charMods: charSettings.charMods.filter((mod) => mod !== null).map((v) => new LeveledMod(v[0], v[1], inv.getBuffLv(v[0]))),
            meleeMods: charSettings.meleeMods.filter((mod) => mod !== null).map((v) => new LeveledMod(v[0], v[1], inv.getBuffLv(v[0]))),
            rangedMods: charSettings.rangedMods.filter((mod) => mod !== null).map((v) => new LeveledMod(v[0], v[1], inv.getBuffLv(v[0]))),
            skillWeaponMods: charSettings.skillWeaponMods
                .filter((mod) => mod !== null)
                .map((v) => new LeveledMod(v[0], v[1], inv.getBuffLv(v[0]))),
            skillLevel: charSettings.charSkillLevel,
            buffs: charSettings.buffs.map((v) => new LeveledBuff(v[0], v[1])),
            melee: new LeveledWeapon(
                charSettings.meleeWeapon,
                charSettings.meleeWeaponRefine,
                charSettings.meleeWeaponLevel,
                inv.getBuffLv(charSettings.meleeWeapon),
            ),
            ranged: new LeveledWeapon(
                charSettings.rangedWeapon,
                charSettings.rangedWeaponRefine,
                charSettings.rangedWeaponLevel,
                inv.getBuffLv(charSettings.rangedWeapon),
            ),
            baseName: charSettings.baseName,
            imbalance: charSettings.imbalance,
            hpPercent: charSettings.hpPercent,
            resonanceGain: charSettings.resonanceGain,
            enemyId: charSettings.enemyId,
            enemyLevel: charSettings.enemyLevel,
            enemyResistance: charSettings.enemyResistance,
            targetFunction: charSettings.targetFunction,
            timeline,
        })
    }

    get mods() {
        return [...this.charMods, ...this.meleeMods, ...this.rangedMods, ...this.skillWeaponMods, this.auraMod, this.tempMod].filter(
            (v): v is LeveledMod => !!v,
        )
    }

    set mods(mods: LeveledMod[]) {
        this.applyMods(mods)
    }

    get modsWithWeapons() {
        return [...this.mods, this.meleeWeapon, this.rangedWeapon]
    }

    get attrs() {
        return this.calculateAttributes()
    }

    get meleeAttrs() {
        return this.calculateWeaponAttributes(this.meleeWeapon).weapon
    }

    get rangedAttrs() {
        return this.calculateWeaponAttributes(this.rangedWeapon).weapon
    }

    get skillWeaponAttrs() {
        return this.skillWeapon ? this.calculateWeaponAttributes(this.skillWeapon).weapon : undefined
    }

    // 计算角色所有属性（基础属性和其他属性）
    public calculateAttributes(nocode = false): CharAttr {
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
        let power = 1 + this.getTotalBonus("技能威力")
        let durability = 1 + this.getTotalBonus("技能耐久")
        let efficiency = 1 + this.getTotalBonus("技能效益")
        let range = 1 + this.getTotalBonus("技能范围")

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
        let damageReduce = this.getTotalBonusReduce("减伤")
        let skillMultiplierSet = this.getTotalBonus("技能倍率赋值")

        // 应用MOD属性加成
        let modAttributeBonus = this.getTotalBonus("MOD属性")
        if (modAttributeBonus > 0) {
            // 计算狮鹫百首契约者MOD属性加成
            const modsBySeries = this.charMods.filter((mod): mod is LeveledMod => mod !== null && CharBuild.elmSeries.includes(mod.系列))
            attackBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "攻击")
            healthBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "生命")
            shieldBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "护盾")
            defenseBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "防御")
            sanityBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "神智")
            elemDamageBonus += modAttributeBonus * this.getModsBonus(modsBySeries, "属性伤")
            power += modAttributeBonus * this.getModsBonus(modsBySeries, "技能威力")
            durability += modAttributeBonus * this.getModsBonus(modsBySeries, "技能耐久")
            efficiency += modAttributeBonus * this.getModsBonus(modsBySeries, "技能效益")
            range += modAttributeBonus * this.getModsBonus(modsBySeries, "技能范围")
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
            技能威力: power,
            技能耐久: durability,
            技能效益: efficiency,
            技能范围: range,
            昂扬: boost,
            背水: desperate,
            增伤: damageIncrease,
            武器伤害: weaponDamage,
            技能伤害: skillDamage,
            独立增伤: independentDamageIncrease,
            属性穿透: penetration,
            无视防御: ignoreDefense,
            技能速度: skillSpeed,
            失衡易伤: imbalanceDamageBonus,
            技能倍率加数: skillAdd,
            召唤物攻击速度: summonAttackSpeed,
            召唤物范围: summonRange,
            减伤: damageReduce,
            技能倍率赋值: skillMultiplierSet,
            有效生命: (health / (1 - defense / (300 + defense)) + shield) / (1 - damageReduce),
        }
        // 应用MOD条件
        if (nocode) return attrs
        if (this.dynamicBuffs.length > 0) {
            const all = this.getAllWeaponsAttrs()
            if (this.dynamicBuffs.length > 0) {
                for (const b of this.dynamicBuffs) {
                    attrs = b.applyDynamicAttr(char, attrs, this.allWeapons, all)
                }
            }
        }
        // 应用MOD条件 如果有变化就再计算一次
        const condMods = this.charModsWithAura.filter((mod) => mod.生效?.条件)
        if (this.applyCondition(attrs, condMods)) {
            return this.calculateAttributes(nocode)
        }
        return attrs
    }

    public applyCondition(attrs: CharAttr, mods: LeveledMod[]) {
        let changed = false
        mods.forEach((mod) => {
            changed ||= mod.applyCondition(attrs, this.charModsWithAura)
        })
        return changed
    }

    // 计算武器属性
    public calculateWeaponAttributes(
        weapon = this.selectedWeapon || (this.selectedSkill?.召唤物 && this.meleeWeapon),
        nocode = false,
        nochar = false,
    ): CharAttr & { weapon?: WeaponAttr } {
        const char = this.char
        let attrs: CharAttr & { weapon?: WeaponAttr } = nochar ? ({} as any) : this.calculateAttributes(true)

        if (weapon) {
            const prefix = weapon.类型
            // 计算各种加成
            let attackBonus = this.getTotalBonus(`${prefix}攻击`, prefix) + this.getTotalBonus(`攻击`, prefix)
            // 角色精通
            if (this.char.精通.includes(weapon.类别) || this.char.精通.includes("全部类型")) {
                attackBonus += 0.2
            }
            let physicalBonus = this.getTotalBonus("物理", prefix)
            let critRateBonus = this.getTotalBonus(`${prefix}暴击`, prefix) + this.getTotalBonus(`暴击`, prefix)
            let critDamageBonus = this.getTotalBonus(`${prefix}暴伤`, prefix) + this.getTotalBonus(`暴伤`, prefix)
            let triggerRateBonus = this.getTotalBonus(`${prefix}触发`, prefix) + this.getTotalBonus(`触发`, prefix)
            let attackSpeedBonus = this.getTotalBonus(`${prefix}攻速`, prefix) + this.getTotalBonus(`攻速`, prefix)
            let multiShotBonus = this.getTotalBonus(`${prefix}多重`, prefix) + this.getTotalBonus(`多重`, prefix)
            let damageIncrease = this.getTotalBonus(`${prefix}增伤`, prefix) + this.getTotalBonus(`增伤`, prefix)
            let reloadTimeBonus = this.getTotalBonus(`${prefix}装填`, prefix) + this.getTotalBonus(`装填`, prefix)
            let magazineBonus = this.getTotalBonus(`${prefix}弹匣`, prefix) + this.getTotalBonus(`弹匣`, prefix)
            let additionalDamage = this.getTotalBonus("追加伤害")
            let weaponDamageMul = this.getTotalBonus(`${prefix}武器倍率`, prefix) + this.getTotalBonus(`武器倍率`, prefix)
            let independentDamageIncrease =
                (1 + this.getTotalBonusMul(`${prefix}独立增伤`, prefix)) * (1 + this.getTotalBonusMul("独立增伤", prefix)) - 1

            if (prefix.startsWith("同律")) {
                const lowerPrefix = prefix.substring(2)
                attackBonus += this.getTotalBonus(`${lowerPrefix}攻击`, lowerPrefix)
                critRateBonus += this.getTotalBonus(`${lowerPrefix}暴击`, lowerPrefix)
                critDamageBonus += this.getTotalBonus(`${lowerPrefix}暴伤`, lowerPrefix)
                triggerRateBonus += this.getTotalBonus(`${lowerPrefix}触发`, lowerPrefix)
                attackSpeedBonus += this.getTotalBonus(`${lowerPrefix}攻速`, lowerPrefix)
                damageIncrease += this.getTotalBonus(`${lowerPrefix}增伤`, lowerPrefix)
                multiShotBonus += this.getTotalBonus(`${lowerPrefix}多重`, lowerPrefix)
                reloadTimeBonus += this.getTotalBonus(`${lowerPrefix}装填`, lowerPrefix)
                magazineBonus += this.getTotalBonus(`${lowerPrefix}弹匣`, lowerPrefix)
                weaponDamageMul += this.getTotalBonus(`${lowerPrefix}武器倍率`, lowerPrefix)
                independentDamageIncrease =
                    (1 + independentDamageIncrease) * (1 + this.getTotalBonusMul(`${lowerPrefix}独立增伤`, lowerPrefix)) - 1
            }

            // 计算武器属性
            let attack = weapon.基础攻击 * (1 + attackBonus)
            let critRate = weapon.基础暴击 * (1 + critRateBonus)
            let critDamage = weapon.基础暴伤 * (1 + critDamageBonus)
            let triggerRate = weapon.基础触发 * (1 + triggerRateBonus)
            let attackSpeed = (weapon.射速 || 1) * (1 + attackSpeedBonus)
            let reloadTime = (weapon.基础装填 || 0) / (1 + reloadTimeBonus)
            let magazine = (weapon.基础弹匣 || 0) * (1 + magazineBonus)

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
                装填: reloadTime,
                弹匣: magazine,
                武器倍率: weaponDamageMul,
            }
            attrs.weapon = weaponAttrs
        }
        if (nocode) return attrs

        if (this.dynamicBuffs.length > 0) {
            // TODO: 没做其他武器属性的code计算, 可能有问题 不过递归太多次也很麻烦
            const all = this.getAllWeaponsAttrs(weapon, attrs.weapon)
            if (this.dynamicBuffs.length > 0) {
                for (const b of this.dynamicBuffs) {
                    attrs = b.applyDynamicAttr(char, attrs, this.allWeapons, all)
                }
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
    getAllWeaponsAttrs(weapon?: LeveledWeapon | LeveledSkillWeapon, weaponAttrs?: WeaponAttr) {
        return this.allWeapons
            .map((w) =>
                w ? (w.名称 === weapon?.名称 ? { weapon: weaponAttrs } : this.calculateWeaponAttributes(w, true, true)) : undefined,
            )
            .map((a) => a?.weapon)
    }

    getAllWeaponSkillsAttrs() {
        const map = new Map([
            ["远程", this.calculateWeaponAttributes(this.rangedWeapon, true, true).weapon],
            ["近战", this.calculateWeaponAttributes(this.meleeWeapon, true, true).weapon],
        ])
        if (this.skillWeapon) {
            map.set("同律", this.calculateWeaponAttributes(this.skillWeapon, true, true).weapon)
        }
        this.weaponSkills.forEach((ws) => {
            if (ws.武器 && map.has(ws.武器.slice(0, 2))) {
                map.set(ws.名称, map.get(ws.武器.slice(0, 2)))
            }
        })
        return map
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
        if (prefix === "角色" && typeof this.char.加成?.[attribute] === "number") {
            bonus += this.char.加成?.[attribute] || 0
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
        if (typeof this.char.加成?.[attribute] === "number") {
            bonus *= 1 + this.char.加成?.[attribute] || 0
        }

        // 添加MOD加成
        this.mods.forEach((mod) => {
            if (prefix && mod.类型 !== prefix) return
            if (typeof mod[attribute] === "number") {
                bonus *= 1 + mod[attribute]
            }
        })

        // 添加BUFF加成
        this.buffs.forEach((buff) => {
            if (prefix && attribute === "独立增伤") return
            if (typeof buff[attribute] === "number") {
                bonus *= 1 + buff[attribute]
            }
        })

        return bonus - 1
    }
    // 获取总加成
    private getTotalBonusReduce(attribute: string, prefix?: string): number {
        let bonus = 0

        // 添加MOD加成
        this.mods.forEach((mod) => {
            if (prefix && mod.类型 !== prefix) return
            if (typeof mod[attribute] === "number") {
                bonus = 1 - (1 - bonus) * (1 - mod[attribute])
            }
        })

        // 添加BUFF加成
        this.buffs.forEach((buff) => {
            if (typeof buff[attribute] === "number") {
                bonus = 1 - (1 - bonus) * (1 - buff[attribute])
            }
        })

        return bonus
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
        // 确保等级和敌方等级都是有效的数字
        const charLevel = this.char.等级 || 80
        const enemyLevel = this.enemy.等级 || 80

        const levelDiff = Math.max(0, Math.min(20, Math.min(80, enemyLevel) - charLevel))
        const def = finalDef ?? this.enemy.防御 * (1 - attrs.无视防御)
        const dmgReduce = def / (300 + def - levelDiff * 10) // 减伤率
        const defenseMultiplier = 1 - dmgReduce
        return Math.max(0, Math.min(1, defenseMultiplier))
    }

    // 计算技能伤害
    public calculateSkillDamage(attrs: ReturnType<typeof this.calculateAttributes>) {
        // 计算各种乘区
        const resistancePenetration = Math.max(0, 1 - this.enemyResistance + attrs.属性穿透)
        const boostMultiplier = this.calculateBoostMultiplier(attrs)
        const desperateMultiplier = this.calculateDesperateMultiplier(attrs)
        const damageIncrease = 1 + attrs.增伤 + attrs.技能伤害
        const independentDamageIncrease = 1 + attrs.独立增伤
        const imbalanceDamageMultiplier = this.imbalance ? attrs.失衡易伤 + 1.5 : 1

        // 计算最终伤害
        let finalDamage =
            resistancePenetration *
            boostMultiplier *
            desperateMultiplier *
            damageIncrease *
            independentDamageIncrease *
            imbalanceDamageMultiplier

        return { expectedDamage: finalDamage }
    }

    // 计算武器伤害
    public calculateWeaponDamage(
        attrs: ReturnType<typeof this.calculateWeaponAttributes>,
        weapon: LeveledWeapon | LeveledSkillWeapon,
    ): DamageResult {
        const weaponAttrs = attrs.weapon!
        // 计算武器基础伤害
        const weaponAttackMultiplier = 1 // 倍率 这里设为1 使用动态计算
        const totalWeaponDamage = attrs.攻击 + weaponAttrs.攻击
        const weaponDamagePhysical = (weaponAttackMultiplier * weaponAttrs.攻击) / totalWeaponDamage
        const weaponDamageElemental = (weaponAttackMultiplier * attrs.攻击) / totalWeaponDamage

        // 计算触发伤害期望
        const triggerDamageMultiplier =
            weapon.伤害类型 === this.hpTypeDMG[this.enemy.currentHPType]
                ? this.hpTypeCoefficients[this.enemy.currentHPType] + this.getTotalBonus("触发倍率")
                : 0
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
        const damageIncrease = 1 + attrs.增伤 + weaponAttrs.增伤 + attrs.武器伤害
        const independentDamageIncrease = (1 + attrs.独立增伤) * (1 + weaponAttrs.独立增伤)
        const additionalDamage = 1 + weaponAttrs.追加伤害
        const imbalanceDamageMultiplier = this.imbalance ? attrs.失衡易伤 + 1.5 : 1
        const commonMore =
            boostMultiplier *
            desperateMultiplier *
            damageIncrease *
            independentDamageIncrease *
            additionalDamage *
            imbalanceDamageMultiplier

        // 计算最终伤害
        const elementalPart = weaponDamageElemental * resistancePenetration
        return {
            lowerCritNoTrigger: (weaponDamagePhysical + elementalPart) * lowerCritDamage * commonMore,
            higherCritNoTrigger: (weaponDamagePhysical + elementalPart) * higherCritDamage * commonMore,
            lowerCritTrigger: (weaponDamagePhysical * triggerDamage + elementalPart) * lowerCritDamage * commonMore,
            higherCritTrigger: (weaponDamagePhysical * triggerDamage + elementalPart) * higherCritDamage * commonMore,
            lowerCritExpectedTrigger: (weaponDamagePhysical * triggerExpectedDamage + elementalPart) * lowerCritDamage * commonMore,
            higherCritExpectedTrigger: (weaponDamagePhysical * triggerExpectedDamage + elementalPart) * higherCritDamage * commonMore,
            expectedCritTrigger: (weaponDamagePhysical + elementalPart) * critExpectedDamage * commonMore,
            expectedCritNoTrigger: (weaponDamagePhysical * triggerDamage + elementalPart) * critExpectedDamage * commonMore,
            expectedDamage: (weaponDamagePhysical * triggerExpectedDamage + elementalPart) * critExpectedDamage * commonMore,
        }
    }

    /**
     * 计算基础属性和伤害 (immutable)
     */
    public calculateByBasename(baseName: string): [attrs: ReturnType<typeof this.calculateWeaponAttributes>, damage: DamageResult] {
        let weapon: LeveledWeapon | LeveledSkillWeapon | undefined
        switch (baseName) {
            case WeaponSkillType.普通攻击:
            case WeaponSkillType.蓄力攻击:
            case WeaponSkillType.下落攻击:
            case WeaponSkillType.滑行攻击:
                weapon = this.meleeWeapon
                break
            case WeaponSkillType.射击:
                weapon = this.rangedWeapon
                break
            default:
                if (this.skillWeapon && this.skillWeapon.名称 === baseName) weapon = this.skillWeapon
                break
        }
        const attrs = this.calculateWeaponAttributes(weapon)
        const damage: DamageResult = weapon ? this.calculateWeaponDamage(attrs, weapon) : this.calculateSkillDamage(attrs)
        return [attrs, damage]
    }

    /**
     * 计算随机伤害 (immutable)
     */
    public calculateRandomDamage(baseWithTarget: string, enemy?: DynamicMonster) {
        const [baseName, target] = baseWithTarget.split("::")
        const targetFunction = target || "伤害"
        const [attrs, damage] = this.calculateByBasename(baseName)
        // 计算随机暴击率影响
        let dmg = 1
        const cc = (attrs.weapon?.暴击 || 0) % 1
        if (cc > 0 && damage.higherCritExpectedTrigger && damage.lowerCritExpectedTrigger) {
            const r = Math.random()
            dmg = r < cc ? damage.higherCritExpectedTrigger : damage.lowerCritExpectedTrigger
            dmg /= damage.expectedDamage
        }
        const final = this.calculateTargetFunction(damage, attrs, targetFunction)
        const floating = 1 + 0.1 * Math.random() - 0.05 // -0.05 ~ 0.05
        const defenseMultiplier = this.calculateDefenseMultiplier(attrs)
        dmg = final * dmg * floating
        let finalDamage = 0
        if (!enemy) enemy = this.enemy
        if (enemy.currentShield > 0) {
            if (dmg >= enemy.currentShield) {
                const hpDMG = (dmg - enemy.currentShield) * defenseMultiplier
                finalDamage = enemy.currentShield + hpDMG
                enemy.currentShield = 0
                enemy.currentHP -= hpDMG
            } else {
                finalDamage = dmg
                enemy.currentShield -= dmg
            }
        } else {
            finalDamage = dmg * defenseMultiplier
            enemy.currentHP -= finalDamage
        }
        return finalDamage
    }

    public hasSummon() {
        return this.selectedSkill?.召唤物 !== undefined
    }

    // 计算目标函数
    public calculateTargetFunction(
        damage: DamageResult,
        attrs: ReturnType<typeof this.calculateWeaponAttributes>,
        targetFunction?: string,
    ): number {
        let astInput = targetFunction || this.targetFunction || "伤害"

        // 调用ast解析器解析目标函数表达式
        let result = this.evaluateAST(astInput, damage, attrs)
        // 除以时间线总长度
        // if (this.targetFunction === "DPS" && this.timeline) result /= this.timeline.totalTime
        return result
    }
    astCache = new Map<string, ASTNode>()
    getIdentifierNames(astInput: string) {
        try {
            const ast = parseAST(astInput, CharBuild.macros)
            const identifiers = new Set<string>()
            const collectIdentifiers = (node: ASTNode) => {
                if (node.type === "property") {
                    identifiers.add(node.name)
                } else if (node.type === "member_access") {
                    collectIdentifiers(node.object)
                } else if (node.type === "function") {
                    for (const arg of node.args) {
                        collectIdentifiers(arg)
                    }
                } else if (node.type === "binary") {
                    collectIdentifiers(node.left)
                    collectIdentifiers(node.right)
                } else if (node.type === "unary") {
                    collectIdentifiers(node.argument)
                }
            }
            collectIdentifiers(ast)
            return [...identifiers]
        } catch (e) {}
        return []
    }
    /**
     * 验证AST表达式是否合法
     */
    validateAST(astInput: string): string | undefined {
        if (!astInput) return ""
        try {
            const ast = parseAST(astInput, CharBuild.macros)

            // 验证AST中的标识符是否存在
            const attrs = this.calculateWeaponAttributes()

            const weaponAttrs = this.getAllWeaponSkillsAttrs()
            const skillAttrs = new Map(this.allSkills.map((v) => [v.名称, v.getFieldsWithAttr(attrs)]))
            skillAttrs.set("E", skillAttrs.get(this.skills[0].名称)!)
            skillAttrs.set("Q", skillAttrs.get(this.skills[1].名称)!)
            const getWeaponAttr = (fieldName: string, base?: string) =>
                weaponAttrs?.get(base || this.baseName)?.[fieldName as keyof WeaponAttr] || 0
            const getSkillAttr = (fieldName: string, base?: string) =>
                skillAttrs?.get(base || this.baseName)?.find((v) => v.名称.includes(fieldName))

            // 递归验证AST节点
            const validateNode = (node: ASTNode): string | undefined => {
                switch (node.type) {
                    case "property": {
                        const fieldName = node.name
                        // 检查是否是技能字段、属性或武器属性
                        const isSkillField = getSkillAttr(fieldName, node.namespace)
                        const isAttr = fieldName in attrs
                        const isWeaponAttr = getWeaponAttr(fieldName, node.namespace)

                        if (!isSkillField && !isAttr && !isWeaponAttr) {
                            const ns = node.namespace ? `${node.namespace}::` : ""
                            return `找不到标识符: "${ns}${fieldName}"`
                        }
                        break
                    }
                    case "binary":
                        const leftError = validateNode(node.left)
                        if (leftError) return leftError
                        const rightError = validateNode(node.right)
                        if (rightError) return rightError
                        break
                    case "unary":
                        const unaryError = validateNode(node.argument)
                        if (unaryError) return unaryError
                        break
                    case "function":
                        for (const arg of node.args) {
                            const argError = validateNode(arg)
                            if (argError) return argError
                        }
                        break
                    case "member_access":
                        const memberError = validateNode(node.object)
                        if (memberError) return memberError
                        break
                }
                return undefined
            }

            const error = validateNode(ast)
            if (error) {
                return error
            }
            return undefined
        } catch (e: any) {
            // 重新抛出错误，而不是返回
            return e.message || (e as string)
        }
    }
    /**
     * 解释AST表达式并计算结果
     * @param astInput AST表达式字符串
     * @param damage 伤害结果对象
     * @param attrs 武器属性对象
     * @returns 计算结果
     */
    evaluateAST(astInput: string, damage: DamageResult, attrs: ReturnType<typeof this.calculateWeaponAttributes>) {
        if (!astInput) return 0
        let ast = this.astCache.get(astInput)
        if (!ast) {
            try {
                ast = parseAST(astInput, CharBuild.macros)
                this.astCache.set(astInput, ast)
            } catch (e) {
                console.error("表达式错误:", e)
                this.targetFunction = "伤害"
            }
        }
        if (!ast) return 0
        const weaponAttrs = this.getAllWeaponSkillsAttrs()
        const skillAttrs = new Map(this.allSkills.map((v) => [v.名称, v.getFieldsWithAttr(attrs)]))
        const getWeaponAttr = (fieldName: string, base?: string) =>
            weaponAttrs?.get(base || this.baseName)?.[fieldName as keyof WeaponAttr] || 0
        const getSkillAttr = (fieldName: string, base?: string) =>
            skillAttrs?.get(base || this.baseName)?.find((v) => v.名称.includes(fieldName))

        function evaluateSkill(fieldName: string, ns?: string) {
            if (fieldName === "[攻击]") return attrs.攻击 + getWeaponAttr("攻击", ns)
            else if (fieldName === "[防御]") return attrs.防御
            else if (fieldName === "[生命]") return attrs.生命
            const field = getSkillAttr(fieldName, ns)
            if (!field) return 0
            // 计算技能基础伤害
            const mul = field.值
            if (!field.名称.endsWith("伤害")) return mul
            let baseDamage = field.值2 || 0
            let times = field.段数 || 1
            if (!field.基础) {
                const patk = getWeaponAttr("攻击", ns) || 0
                baseDamage += mul * (attrs.攻击 + patk)
            } else if (field.基础 === "生命") {
                baseDamage += mul * attrs.生命
            } else if (field.基础 === "防御") {
                baseDamage += mul * attrs.防御
            }
            return baseDamage * times
        }
        function evaluateAttr(fieldName: string) {
            return fieldName in attrs ? attrs[fieldName as keyof CharAttr] : 0
        }
        function evaluateWeaponAttr(fieldName: string, ns?: string) {
            if (fieldName === "武器攻击") fieldName = "攻击"
            return getWeaponAttr(fieldName, ns)
        }
        const evaluateIdentity = (fieldName: string, ns?: string) => {
            if (ns) return evaluateSkill(fieldName, ns) || evaluateWeaponAttr(fieldName, ns) || evaluateAttr(fieldName) || 0
            else return evaluateSkill(fieldName, ns) || evaluateAttr(fieldName) || evaluateWeaponAttr(fieldName, ns) || 0
        }
        function evaluateMember(memberName?: string) {
            if (memberName === "暴击") return damage.higherCritExpectedTrigger || damage.expectedDamage
            if (memberName === "未暴击") return damage.lowerCritExpectedTrigger || damage.expectedDamage
            if (memberName === "触发") return damage.expectedCritTrigger || damage.expectedDamage
            if (memberName === "未触发") return damage.expectedCritNoTrigger || damage.expectedDamage
            if (memberName === "暴击触发" || memberName === "触发暴击") return damage.higherCritTrigger || damage.expectedDamage
            if (memberName === "未触发暴击" || memberName === "暴击未触发") return damage.higherCritNoTrigger || damage.expectedDamage
            if (memberName === "触发未暴击" || memberName === "未暴击触发") return damage.lowerCritTrigger || damage.expectedDamage
            if (memberName === "未暴击未触发" || memberName === "未触发未暴击") return damage.lowerCritNoTrigger || damage.expectedDamage
            return damage.expectedDamage // 找不到成员默认期望伤害
        }
        // AST求值函数
        const evaluate = (node: ASTNode): number => {
            switch (node.type) {
                case "number":
                    return node.value

                case "binary": {
                    const left = evaluate(node.left)
                    const right = evaluate(node.right)
                    switch (node.operator) {
                        case "+":
                            return left + right
                        case "-":
                            return left - right
                        case "*":
                            return left * right
                        case "/":
                            return right !== 0 ? left / right : 0
                        case "%":
                            return right !== 0 ? left % right : 0
                        case "//":
                            return right !== 0 ? Math.floor(left / right) : 0
                        default:
                            throw new Error(`未知的二元运算符: ${node.operator}`)
                    }
                }

                case "unary": {
                    const argument = evaluate(node.argument)
                    switch (node.operator) {
                        case "+":
                            return +argument
                        case "-":
                            return -argument
                        default:
                            throw new Error(`未知的一元运算符: ${node.operator}`)
                    }
                }

                case "property": {
                    const value = evaluateIdentity(node.name, node.namespace)
                    // 如果是技能字段（evaluateSkill返回值>0），需要乘以默认的伤害系数
                    const skillValue = evaluateSkill(node.name, node.namespace)
                    if (skillValue) {
                        return value * evaluateMember()
                    }
                    return value
                }

                case "function": {
                    const args = node.args.map((arg) => evaluate(arg))
                    switch (node.name) {
                        case "min":
                            return Math.min(...args)
                        case "max":
                            return Math.max(...args)
                        case "floor":
                            return Math.floor(args[0])
                        case "ceil":
                            return Math.ceil(args[0])
                        case "or":
                            return args.find((v) => v !== 0) ?? args[args.length - 1]
                        case "log":
                            return Math.log(args[0])
                        case "power":
                            return Math.pow(args[0], args[1])
                        default:
                            throw new Error(`未知的函数: ${node.name}`)
                    }
                }

                case "member_access": {
                    // 对于成员访问，object部分不应该乘以默认伤害系数
                    // 所以我们需要重新计算object，但跳过默认伤害系数的乘法
                    const objectNode = node.object

                    // 如果object是property节点，直接调用evaluateIdentity而不乘以evaluateMember()
                    let objectValue: number
                    if (objectNode.type === "property") {
                        objectValue = evaluateIdentity(objectNode.name, objectNode.namespace)
                    } else {
                        objectValue = evaluate(objectNode)
                    }

                    const memberName = node.property
                    // 成员访问用于修改伤害计算方式
                    return objectValue * evaluateMember(memberName)
                }

                default:
                    throw new Error(`未知的AST节点类型: ${(node as ASTNode).type}`)
            }
        }

        return evaluate(ast)
    }

    get selectedWeapon() {
        let weapon: LeveledWeapon | LeveledSkillWeapon | undefined

        if (this.isMeleeWeapon) weapon = this.meleeWeapon
        else if (this.isRangedWeapon) weapon = this.rangedWeapon
        else if (this.isSkillWeapon) weapon = this.skillWeapon
        return weapon
    }

    get selectedSkillType() {
        if (this.isMeleeWeapon) return "近战"
        else if (this.isRangedWeapon) return "远程"
        else if (this.isSkillWeapon) return "同律"
        return "角色"
    }

    get selectedSkill() {
        let bt = this.baseName
        const skill = this.allSkills.find((s) => s.名称 === bt)
        return skill
    }

    get selectedSkillKey() {
        let bt = this.baseName
        const index = this.skills.findIndex((s) => s.名称 === bt)
        return index >= 0 ? ["E", "Q", ""][index] : ""
    }

    public checkModEffective(mod: LeveledMod, includeSelf = true): { isEffective: boolean; props: Record<string, any> } | undefined {
        if (!mod.生效?.条件) return undefined
        if (includeSelf && !this.mods.includes(mod) && mod.id !== this.auraMod?.id) {
            const clone = this.clone()
            clone.applyMods([mod])
            return clone.checkModEffective(mod, false)
        }
        const attrs = this.calculateAttributes()
        return mod.checkCondition(
            attrs,
            this.charMods.filter((v) => v !== null),
        )
    }

    get isSkill() {
        return this.selectedSkillType === "角色"
    }
    get isMeleeWeapon() {
        return [WeaponSkillType.普通攻击, WeaponSkillType.蓄力攻击, WeaponSkillType.下落攻击, WeaponSkillType.滑行攻击].includes(
            this.baseName as WeaponSkillType,
        )
    }
    get isRangedWeapon() {
        return WeaponSkillType.射击 === (this.baseName as WeaponSkillType)
    }
    get isSkillWeapon() {
        return this.skillWeapon && this.skillWeapon.名称 === this.baseName
    }
    get isTimeline() {
        return this.timeline !== undefined
    }
    /**
     * 主计算函数
     * @param props 武器、模组或 buff
     * @returns 目标函数结果
     */
    public calculateOneTime(attrs?: ReturnType<typeof this.calculateWeaponAttributes>): number {
        // 查找要计算的武器或技能
        let damage: DamageResult = {
            expectedDamage: 0,
        }
        let weapon = this.selectedWeapon
        if (!attrs) attrs = this.calculateWeaponAttributes()
        if (weapon) {
            damage = this.calculateWeaponDamage(attrs, weapon)
        } else {
            const skill = this.selectedSkill
            if (skill) {
                damage = this.calculateSkillDamage(attrs)
            }
        }
        // 计算目标函数
        const final = this.calculateTargetFunction(damage, attrs)
        const defenseMultiplier = this.calculateDefenseMultiplier(attrs)
        let finalDamage = 0
        // 计算防御乘区
        if (final > 0) {
            if (this.enemy.currentShield > 0) {
                if (final >= this.enemy.currentShield) {
                    const hpDMG = (final - this.enemy.currentShield) * defenseMultiplier
                    finalDamage = this.enemy.currentShield + hpDMG
                    this.enemy.currentShield = 0
                    this.enemy.currentHP -= hpDMG
                } else {
                    finalDamage = final
                    this.enemy.currentShield -= final
                }
            } else {
                finalDamage = final * defenseMultiplier
                this.enemy.currentHP -= finalDamage
            }
        }
        return finalDamage
    }
    /**
     * 主计算函数(包含时间线)
     * @param props 武器、模组或 buff
     * @returns 目标函数结果
     */
    public calculate(): number {
        this.enemy.resetHP()
        let timeline = this.timeline
        if (!timeline) {
            return Math.round(this.calculateOneTime())
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
            build.baseWithTarget = i.name
            const attrs = build.calculateWeaponAttributes()
            const damage = build.calculateOneTime(attrs)
            totalDamage += damage
            // 召唤物
            const summon = this.selectedSkill?.召唤物
            if (summon) {
                const newAttr = build.calculateWeaponAttributes(build.meleeWeapon)
                const summonAttrs = this.selectedSkill.getFieldsWithAttr(newAttr)
                const duration = Math.min(summonAttrs.find((a) => a.名称 === "召唤物持续时间")?.值 || 0, i.duration)
                const delay = summonAttrs.find((a) => a.名称 === "召唤物攻击延迟")?.值 || 0
                const interval = summonAttrs.find((a) => a.名称 === "召唤物攻击间隔")?.值 || 0
                const attackTimes = Math.floor((duration - delay) / interval)
                totalDamage *= attackTimes
            }
            if (attrs.weapon && this.selectedWeapon?.射速) {
                const reloadTime = attrs.weapon.装填 || 0
                const magazine = attrs.weapon.弹匣 || 1e11
                const attackSpeed = attrs.weapon.攻速 || 1
                const attackTime = magazine / attackSpeed
                // 攻击时间占比 = 攻击时间 / (攻击时间 + 装填时间)
                const atPercent = attackTime / (attackTime + reloadTime)
                const attackTimes = Math.floor(i.duration * atPercent * attackSpeed)
                totalDamage *= attackTimes
            }
        })
        this.baseName = initBaseName
        return Math.round(totalDamage)
    }
    charModsExclusiveSeries = new Set<string>()
    meleeModsExclusiveSeries = new Set<string>()
    rangedModsExclusiveSeries = new Set<string>()
    skillWeaponModsExclusiveSeries = new Set<string>()
    charModsExclusiveNames = new Set<string>()
    meleeModsExclusiveNames = new Set<string>()
    rangedModsExclusiveNames = new Set<string>()
    skillWeaponModsExclusiveNames = new Set<string>()
    public applyMods(mods: LeveledMod[]) {
        const keys = ["charMods", "meleeMods", "rangedMods", "skillWeaponMods"] as const
        const toAddMods = {
            charMods: mods.filter((v) => v.attrType === "角色"),
            meleeMods: mods.filter((v) => v.attrType === "近战"),
            rangedMods: mods.filter((v) => v.attrType === "远程"),
            skillWeaponMods: mods.filter((v) => v.attrType === "同律"),
        }
        // 处理互斥逻辑
        keys.forEach((key) => {
            for (const mod of toAddMods[key]) {
                if (mod.isMinus) {
                    this[key].push(mod)
                    continue
                }
                // 记录互斥系列
                if (CharBuild.exclusiveSeries.includes(mod.系列)) {
                    if (!this[`${key}ExclusiveSeries`].has(mod.系列)) {
                        mod.excludeSeries.forEach((series) => this[`${key}ExclusiveSeries`].add(series))
                        this[key].push(mod)
                    }
                }
                // 记录非契约者MOD名称（用于名称互斥）
                if (mod.系列 !== "契约者") {
                    if (!this[`${key}ExclusiveNames`].has(mod.名称)) {
                        this[`${key}ExclusiveNames`].add(mod.名称)
                        this[key].push(mod)
                    }
                } else {
                    this[key].push(mod)
                }
            }
        })
        return this
    }

    public removeMods(mods: LeveledMod[]) {
        const keys = ["charMods", "meleeMods", "rangedMods", "skillWeaponMods"] as const
        const toAddMods = {
            charMods: mods.filter((v) => v.attrType === "角色"),
            meleeMods: mods.filter((v) => v.attrType === "近战"),
            rangedMods: mods.filter((v) => v.attrType === "远程"),
            skillWeaponMods: mods.filter((v) => v.attrType === "同律"),
        }
        keys.forEach((key) => {
            for (const mod of toAddMods[key]) {
                const index = this[key].findIndex((m) => m?.equals(mod))
                if (index !== -1) {
                    this[key] = this[key].splice(index, 1)
                    // 移除互斥系列
                    mod.excludeSeries.forEach((series) => this[`${key}ExclusiveSeries`].delete(series))
                    // 移除互斥名称
                    this[`${key}ExclusiveNames`].delete(mod.名称)
                }
            }
        })
        return this
    }

    public applyBuffs(buffs: LeveledBuff[]) {
        // 取交集 然后对已存在的BUFF进行level+1
        const existingNames = new Set(this.buffs.map((b) => b.名称))
        const names = new Set(buffs.map((b) => b.名称))
        this.buffs.push(...buffs.filter((b) => !names.has(b.名称)))
        // 对已存在的BUFF进行level+1
        this.buffs.forEach((b) => {
            if (existingNames.has(b.名称)) {
                b.等级++
            }
        })
        return this
    }

    public removeBuffs(buffs: LeveledBuff[] | string[]) {
        if (!buffs.length) return this
        const names = new Set(typeof buffs[0] === "string" ? (buffs as string[]) : (buffs as LeveledBuff[]).map((b) => b.名称))
        this.buffs = this.buffs.filter((b) => !names.has(b.名称))
        return this
    }
    /** 收益计算用的临时槽位 平时不应该有任何值 */
    tempMod: LeveledMod | null = null
    /**
     * 计算单属性收益（加上属性值）
     * @param props 武器、模组或 buff
     * @returns 单属性值
     */
    public calcIncome(props: AbstractMod | LeveledBuff, minus = false): number {
        if (minus) {
            let mval = 0
            if (props instanceof LeveledBuff) {
                if (props.code) {
                    const index = this.dynamicBuffs.findIndex((b) => b.名称 === props.名称)
                    if (index !== -1) {
                        this.dynamicBuffs.splice(index, 1)
                    }
                    mval = this.calculate()
                    this.dynamicBuffs.push(props)
                } else {
                    this.buffs.push(props.minusAttr)
                    mval = this.calculate()
                    this.buffs.pop()
                }
            } else {
                this.tempMod = props.minusAttr as LeveledMod
                mval = this.calculate()
                this.tempMod = null
            }
            return this.calculate() / mval - 1
        } else {
            let mval = 0
            if (props instanceof LeveledBuff) {
                if (props.code) {
                    this.dynamicBuffs.push(props)
                    mval = this.calculate()
                    this.dynamicBuffs.pop()
                } else {
                    this.buffs.push(props)
                    mval = this.calculate()
                    this.buffs.pop()
                }
            } else {
                this.tempMod = props as LeveledMod
                mval = this.calculate()
                this.tempMod = null
            }
            return mval / this.calculate() - 1
        }
    }

    clone() {
        return new CharBuild({
            char: new LeveledChar(this.char.名称, this.char.等级),
            hpPercent: this.hpPercent,
            resonanceGain: this.resonanceGain,
            imbalance: this.imbalance,
            auraMod: this.auraMod ? this.auraMod.clone() : undefined,
            charMods: this.charMods.map((m) => (m ? m.clone() : null)),
            meleeMods: this.meleeMods.map((m) => (m ? m.clone() : null)),
            rangedMods: this.rangedMods.map((m) => (m ? m.clone() : null)),
            skillWeaponMods: this.skillWeaponMods.map((m) => (m ? m.clone() : null)),
            buffs: this.buffs.map((b) => new LeveledBuff(b.名称, b.等级)),
            melee: this.meleeWeapon.clone(),
            ranged: this.rangedWeapon.clone(),
            baseName: this.baseName,
            enemyId: this.enemyId,
            enemyLevel: this.enemyLevel,
            enemyResistance: this.enemyResistance,
            targetFunction: this.targetFunction,
            skillLevel: this.skills[0].等级,
            timeline: this.timeline,
        })
    }
    getMods(charTab: string) {
        if (charTab === "角色") {
            return this.charMods
        } else if (charTab === "近战") {
            return this.meleeMods
        } else if (charTab === "远程") {
            return this.rangedMods
        } else if (charTab === "同律") {
            return this.skillWeaponMods
        }
        return []
    }
    getModCost(charTab: string) {
        return this.getMods(charTab).reduce((acc, cur) => acc + (cur?.耐受 || 0), 0)
    }
    getModCostMax(charTab: string) {
        const max = this.getModCap(charTab)
        let now = this.getModCost(charTab)
        const costs = this.getMods(charTab)
            .map((m, i) => ({ m, i }))
            .sort((a, b) => (b.m?.耐受 || 0) - (a.m?.耐受 || 0))
        for (const cost of costs) {
            if (now > max) {
                now -= (cost.m?.耐受 || 0) - Math.ceil((cost.m?.耐受 || 0) / 2)
            } else {
                break
            }
        }
        return now
    }
    getModCap(charTab: string) {
        let charOrWeapon: { 等级: number } = this.char
        if (charTab === "近战") {
            charOrWeapon = this.meleeWeapon
        } else if (charTab === "远程") {
            charOrWeapon = this.rangedWeapon
        }
        return 20 + ((charTab === "角色" && this.auraMod?.["最大耐受"]) || 0) + charOrWeapon.等级
    }
    getModCostTransfer(charTab: string) {
        const max = this.getModCap(charTab)
        let now = this.getModCost(charTab)
        const costs = this.getMods(charTab)
            .map((m, i) => ({ m, i }))
            .sort((a, b) => (b.m?.耐受 || 0) - (a.m?.耐受 || 0))
        let need: number[] = []
        for (const cost of costs) {
            if (now > max) {
                now -= (cost.m?.耐受 || 0) - Math.ceil((cost.m?.耐受 || 0) / 2)
                need.push(cost.i)
            } else {
                break
            }
        }
        return need
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
    static exclusiveSeries = [...CharBuild.indepSeries, "囚狼", "换生灵", "海妖", "审判者", "巨鲸", "金乌", "焰灵", "黄衣", "夜使"]

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
        includeTypes.forEach((key) =>
            preserveTypes.includes(key) ? (initBuild[key] = initBuild[key].filter((v) => v !== null)) : (initBuild[key] = []),
        )
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
            initBuild[key].forEach((mod) => addMod(key, mod!))
        })
        let logString = ""
        function log(msg: string) {
            if (enableLog) logString += msg + "\n"
        }
        log(`开始自动构筑`)
        function addMod(key: ModTypeKey, mod: LeveledMod) {
            localBuild[key].push(mod)
            // 记录互斥系列
            if (CharBuild.exclusiveSeries.includes(mod.系列)) {
                mod.excludeSeries.forEach((series) => selectedExclusiveSeries[key].add(series))
            }
            // 记录非契约者MOD名称（用于名称互斥）
            if (mod.系列 !== "契约者") {
                selectedExclusiveNames[key].add(mod.名称)
            } else {
                selectedModCount.set(mod.id, (selectedModCount.get(mod.id) || 0) + 1)
            }
        }
        function removeMod(key: ModTypeKey, index: number) {
            const mod = localBuild[key][index]!
            localBuild[key].splice(index, 1)
            // 从互斥系列集合中移除
            if (CharBuild.exclusiveSeries.includes(mod.系列)) {
                mod.excludeSeries.forEach((series) => selectedExclusiveSeries[key].delete(series))
            }
            // 从非契约者MOD名称集合中移除
            if (mod.系列 !== "契约者") {
                selectedExclusiveNames[key].delete(mod.名称)
            } else {
                const count = (selectedModCount.get(mod.id) || 0) - 1
                if (count > 0) selectedModCount.set(mod.id, count)
                else selectedModCount.delete(mod.id)
            }
        }
        function sortByIcome(key: ModTypeKey) {
            const initMods = initBuild[key]
            const rst = localBuild[key].slice(initMods.length).sort((a, b) => {
                return localBuild.calcIncome(b!, true) - localBuild.calcIncome(a!, true)
            })
            localBuild[key] = [...initMods, ...rst]
            return rst[0]
        }
        function findMaxMod(key: ModTypeKey) {
            const type = ModTypeMap[key]
            const mapped = modOptions
                .filter(
                    (v) =>
                        v.系列 !== "羽蛇" &&
                        v.类型.startsWith(type) &&
                        (!v.属性 || v.属性 === localBuild.char.属性) &&
                        (!v.限定 ||
                            (key === "meleeMods" && [localBuild.meleeWeapon.伤害类型, localBuild.meleeWeapon.类别].includes(v.限定)) ||
                            (key === "rangedMods" && [localBuild.rangedWeapon.伤害类型, localBuild.rangedWeapon.类别].includes(v.限定)) ||
                            (key === "skillWeaponMods" &&
                                localBuild.skillWeapon &&
                                [localBuild.skillWeapon.伤害类型, localBuild.skillWeapon.类别].includes(v.限定))) &&
                        !selectedExclusiveNames[key].has(v.名称) &&
                        !selectedExclusiveSeries[key].has(v.系列) &&
                        (selectedModCount.get(v.id) || 0) < v.count,
                )
                .map((v) => ({ mod: v, income: localBuild.calcIncome(v) }))
            if (mapped.length === 0) return { mod: null, income: 0 }
            mapped.sort((a, b) => b.income - a.income)
            const firstIncome = mapped[0].income
            const lastSameIncome = mapped.findLastIndex((v) => v.income === firstIncome)
            // 从相同收益中随机选择一个
            return mapped[Math.floor(Math.random() * (lastSameIncome + 1))]
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
            if (!fixedMelee && !initBuild.isMeleeWeapon) {
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
            if (!fixedRanged && !initBuild.isRangedWeapon) {
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
                const lastIncome = localBuild.calcIncome(localBuild[key].at(-1)!, true)
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
export enum RModTypeMap {
    角色 = "charMods",
    近战 = "meleeMods",
    远程 = "rangedMods",
    同律 = "skillWeaponMods",
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
    /** 触发期望暴击伤害 */
    expectedCritTrigger?: number
    /** 未触发期望暴击伤害 */
    expectedCritNoTrigger?: number
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
