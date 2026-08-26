import { groupBy } from "lodash-es"
import type { RawTimelineData } from "../store/timeline"
import { type ASTNode, parseAST } from "./ast"
import { sumCharBuildBonusContributions } from "./charbuild-simd"
import type { AbstractMod, DmgType, HpType, Skill, WeaponSkill } from "./data-types"
import { LeveledBuff } from "./leveled/LeveledBuff"
import type { LeveledChar } from "./leveled/LeveledChar"
import type { LeveledMod, LeveledModWithCount } from "./leveled/LeveledMod"
import { type DynamicMonster, LeveledMonster } from "./leveled/LeveledMonster"
import { LeveledSkill } from "./leveled/LeveledSkill"
import { LeveledSkillWeapon } from "./leveled/LeveledSkillWeapon"
import { LeveledWeapon } from "./leveled/LeveledWeapon"

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
    技能无视防御: number
    技能速度: number
    失衡易伤: number
    技能倍率加数: number
    技能倍率乘数: number
    技能倍率赋值: number
    召唤物属性继承比例: number
    // 召唤物攻击速度/召唤物范围（角色属性，0起始增量）：= 角色直接加成（BUFF/角色MOD等）
    // + 由 calculateWeaponAttributes 按武器作用域召唤物转化词条汇总（仿充盈威力范式）
    召唤物攻击速度: number
    召唤物范围: number
    召唤物伤害: number
    召唤物独立增伤: number
    减伤: number
    有效生命: number
    // 转xx 系列属性：转物理类型（切割/贯穿/震荡/灾厄）按对应类型触发规则结算；
    // 转属克/转属逆 把物理+元素按比例转为属克/属逆元素，并按翻转抗性结算敌人抗性（总比例钳制到 100% 内）
    转切割?: number
    转贯穿?: number
    转震荡?: number
    转灾厄?: number
    转属克?: number
    转属逆?: number
    // 充盈威力（角色属性）：Σ 各武器触发率溢出 100% 的部分 × 该武器充盈威力转化（由 calculateWeaponAttributes 汇总）
    充盈威力: number
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
    /** 最大弹药 基于武器基础值 */
    弹药: number
    /** 独立增伤 0开始 */
    独立增伤: number
    /** 追加伤害 0开始 */
    追加伤害: number
    /** 武器倍率 0开始 */
    武器倍率: number
    /** 充盈威力转化（武器属性）：触发率溢出 100% 的部分按该比例转化为角色充盈威力，0 开始 */
    充盈威力转化: number
    /** 召唤物攻击速度转化（武器属性）：近战武器攻速按该比例转化为角色召唤物攻击速度，0 开始 */
    召唤物攻击速度转化: number
    /** 召唤物范围转化（武器属性）：角色技能范围按该比例转化为召唤物范围，0 开始 */
    召唤物范围转化: number
}

const weaponAttackTypeMap = [
    { prefix: "普攻", patterns: ["普通攻击"] },
    { prefix: "蓄力", patterns: ["蓄力攻击"] },
    { prefix: "下落", patterns: ["下落攻击"] },
    { prefix: "滑行", patterns: ["滑行攻击"] },
] as const

const weaponDamageFieldBaseMap = {
    "[近战]": "近战",
    "[远程]": "远程",
    "[同律]": "同律",
} as const

const weaponAttributeBaseMap = {
    攻击: "基础攻击",
    暴击: "基础暴击",
    暴伤: "基础暴伤",
    触发: "基础触发",
    攻速: "射速",
    装填: "基础装填",
    弹匣: "基础弹匣",
    弹药: "基础弹药",
} as const

const characterBonusAttributes = [
    "攻击",
    "固定攻击",
    "生命",
    "护盾",
    "防御",
    "神智",
    "属性伤",
    "技能威力",
    "技能耐久",
    "技能效益",
    "技能范围",
    "昂扬",
    "背水",
    "增伤",
    "武器伤害",
    "技能伤害",
    "技能速度",
    "属性穿透",
    "失衡易伤",
    "技能倍率加数",
    "召唤物属性继承比例",
    "召唤物攻击速度",
    "召唤物范围",
    "召唤物伤害",
    "召唤物独立增伤",
    "技能倍率赋值",
    "转切割",
    "转贯穿",
    "转震荡",
    "转灾厄",
    "转属克",
    "转属逆",
    "充盈威力",
] as const

const characterBonusIndex = Object.fromEntries(characterBonusAttributes.map((attribute, index) => [attribute, index])) as Record<
    (typeof characterBonusAttributes)[number],
    number
>

/** 魔之楔极性类型（趋向） */
type PolarityType = "A" | "D" | "V" | "O"
/** 极性遍历顺序（用于极化方案的确定性） */
const POLARITY_TYPES: PolarityType[] = ["V", "D", "A", "O"]

export class CharBuildTimeline {
    totalTime: number = 0
    hp: [number, number][] = []
    constructor(
        public name: string,
        public items: CharBuildTimelineItem[],
        hp?: [number, number][]
    ) {
        this.items.forEach(item => {
            const endTime = item.time + item.duration
            this.totalTime = Math.max(this.totalTime, endTime)
        })
        this.hp = hp || []
    }
    static fromRaw(raw: RawTimelineData) {
        return new CharBuildTimeline(
            raw.name,
            raw.items.map(item => ({
                track: item.i,
                name: item.n,
                time: item.t,
                duration: item.d,
                lv: item.l,
            })),
            raw.hp
        )
    }
}

export interface CharBuildTimelineItem {
    track: number
    name: string
    time: number // 单位秒
    duration: number // 单位秒
    lv?: number // 如果是BUFF则有此项
    buff?: LeveledBuff
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
    skillMods?: (LeveledMod | null)[]
    buffs?: LeveledBuff[]
    melee: LeveledWeapon
    ranged: LeveledWeapon
    baseName: string
    enemy?: LeveledMonster
    enemyId?: number
    enemyLevel?: number
    enemyResistance?: number
    targetFunction?: string
    customVariables?: [string, string][]
    customBuff?: [string, number][]
    skillLevel?: number
    timeline?: CharBuildTimeline
    timelineDPS?: boolean
    teamWeapons?: (number | string)[]
    teamWeaponCategories?: string[]
}

export class CharBuild {
    static fromCharSetting: (
        selectedChar: string,
        charSettings: typeof import("../composables/useCharSettings").defaultCharSettings,
        inv?: ReturnType<typeof import("../store/inv").useInvStore>,
        timeline?: CharBuildTimeline
    ) => CharBuild

    // 静态宏定义: 用于AST表达式的宏替换
    static macros: Record<string, string> = {
        ATK: "攻击",
        DEF: "防御",
        HP: "生命",
        SP: "神智",
        DPH: "or(多重,1)*伤害",
        总伤: "max(1,召唤物攻击次数)*伤害",
        暴击伤害: "伤害.暴击",
        DPS: "or(攻速,1+技能速度)*or(多重,1)*伤害",
        范围收益: "技能范围*伤害",
        耐久收益: "技能耐久*伤害",
        效益收益: "技能效益*伤害",
        每神智DPH: "1/神智消耗*伤害",
        每持续神智DPH: "1/每秒神智消耗*伤害",
        每神智DPS: "or(攻速,1+技能速度)/神智消耗*伤害",
        每持续神智DPS: "or(攻速,1+技能速度)/每秒神智消耗*伤害",
    }

    public _char!: LeveledChar
    get char() {
        return this._char
    }
    set char(char: LeveledChar) {
        this._char = char
        // 从skills表中获取角色技能数组，用参数skillLevel初始化LeveledSkill后储存为属性skills数组
        this.skills = this.char.技能.map(skill => new LeveledSkill(skill.skillData, this.skillLevel))

        // 从char中获取同率武器值，如果非空则从武器表中获取同率武器属性，储存为字段skillWeapon
        if (this.char.同律武器) {
            try {
                const uweaponData = this.char.同律武器[0]
                const skillIds = uweaponData.skill ?? [1]
                const sourceSkills = this.skills.filter((_, i) => skillIds.includes(i))
                const uweaponSkillData = {
                    名称: uweaponData.名称,
                    类型: "同律武器伤害",
                    icon: sourceSkills[0]?.skillData.icon,
                    字段: [],
                } as Skill
                // 获取所有技能的伤害字段
                sourceSkills.forEach(sourceSkill =>
                    sourceSkill.字段.forEach(field => {
                        if (field.名称.match(uweaponData.filter || "伤害") && field.名称.endsWith("伤害"))
                            uweaponSkillData.字段!.push(field)
                    })
                )
                uweaponData.技能 = [uweaponSkillData]
                this.skillWeapon = new LeveledSkillWeapon(uweaponData, this.skillLevel, this.char.等级)
            } catch (error) {
                console.error(`同律武器 ${this.char.同律武器} 初始化失败:`, error)
            }
        } else {
            this.skillWeapon = undefined
        }
        this.syncWeaponForgeEffective()
    }
    get charSkills() {
        return this.skills.slice(0, 3)
    }

    /**
     * 收集指定模组列表中的技能替换映射
     * @param mods 模组列表
     * @returns 技能替换映射（key 为原技能 ID）
     */
    private getSkillReplaceMap(mods: (LeveledMod | null)[]) {
        const replaceMap: Record<number, WeaponSkill> = {}
        mods.forEach(mod => {
            if (!mod?.技能替换) return
            Object.entries(mod.技能替换).forEach(([skillId, skillData]) => {
                replaceMap[+skillId] = skillData as WeaponSkill
            })
        })
        return replaceMap
    }

    /**
     * 将武器技能结构转换为通用技能结构
     * @param skillData 武器技能数据
     * @param fallbackSkill 原始技能（用于补齐武器类型与等级）
     * @returns 可用于 LeveledSkill 的技能数据
     */
    private normalizeWeaponSkillToSkill(skillData: WeaponSkill, fallbackSkill: LeveledSkill): Skill {
        return {
            id: skillData.id || fallbackSkill.id,
            名称: skillData.名称 || fallbackSkill.名称,
            类型: skillData.类型 || fallbackSkill.类型,
            武器: fallbackSkill.武器,
            描述: skillData.描述 || fallbackSkill.描述,
            字段: skillData.字段 || [],
        }
    }

    /**
     * 根据装备的模组将武器技能替换为对应版本
     * @param weaponSkills 原始武器技能列表
     * @param mods 生效模组列表
     * @returns 替换后的武器技能列表
     */
    private replaceWeaponSkillsByMods(weaponSkills: LeveledSkill[], mods: (LeveledMod | null)[]) {
        const replaceMap = this.getSkillReplaceMap(mods)
        if (Object.keys(replaceMap).length === 0) return weaponSkills

        return weaponSkills.map(skill => {
            const replacedSkill = replaceMap[skill.id]
            if (!replacedSkill) return skill
            const normalizedSkill = this.normalizeWeaponSkillToSkill(replacedSkill, skill)
            return new LeveledSkill(normalizedSkill, skill.等级, skill.武器名)
        })
    }

    /**
     * 根据技能名称确定其所属武器
     * @param baseName 技能名称
     * @returns 对应武器；若不是武器技能则返回 undefined
     */
    private getWeaponBySkillName(baseName: string) {
        if (this.meleeWeaponSkills.some(skill => skill.名称 === baseName)) {
            return this.meleeWeapon
        }
        if (this.rangedWeaponSkills.some(skill => skill.名称 === baseName)) {
            return this.rangedWeapon
        }
        if (this.skillWeaponSkills.some(skill => skill.名称 === baseName) || (this.skillWeapon && this.skillWeapon.名称 === baseName)) {
            return this.skillWeapon
        }
        return undefined
    }

    get meleeWeaponSkills() {
        return this.replaceWeaponSkillsByMods(this.meleeWeapon.技能 || [], this.meleeMods)
    }
    get rangedWeaponSkills() {
        return this.replaceWeaponSkillsByMods(this.rangedWeapon.技能 || [], this.rangedMods)
    }
    get skillWeaponSkills() {
        return this.replaceWeaponSkillsByMods(this.skillWeapon?.技能 || [], this.skillMods)
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
    public skillMods: (LeveledMod | null)[]
    public buffs: LeveledBuff[]
    public dynamicBuffs: LeveledBuff[]
    private _meleeWeapon!: LeveledWeapon
    private _rangedWeapon!: LeveledWeapon
    get meleeWeapon() {
        return this._meleeWeapon
    }
    set meleeWeapon(weapon: LeveledWeapon) {
        this._meleeWeapon = weapon
        weapon.setForgeEffective(!this._char || this.isWeaponForgeEffective(weapon))
    }
    get rangedWeapon() {
        return this._rangedWeapon
    }
    set rangedWeapon(weapon: LeveledWeapon) {
        this._rangedWeapon = weapon
        weapon.setForgeEffective(!this._char || this.isWeaponForgeEffective(weapon))
    }
    public teamWeaponCategories: string[] = []
    public baseName = ""
    public imbalance = false
    _enemyId: number = 130
    get enemyId() {
        return this._enemyId
    }
    set enemyId(value: number) {
        this._enemyId = value
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
    public customVariables: [string, string][] = []
    public customBuff: LeveledBuff[] = []
    public skills!: LeveledSkill[]
    public skillWeapon?: LeveledSkillWeapon
    public timeline?: CharBuildTimeline
    public timelineDPS = false

    get baseWithTarget() {
        return `${this.baseName}::${this.targetFunction}`
    }
    set baseWithTarget(value: string) {
        const [base, target] = value.split("::")
        this.baseName = base
        this.targetFunction = target || ""
    }

    get charModsWithAura() {
        const mods = [...this.charMods]
        if (this.auraMod) mods.push(this.auraMod)
        if (this.tempMod) mods.push(this.tempMod)
        return mods.filter(v => v !== null)
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
        this.skillMods = options.skillMods || []
        // 复合BUFF（同时含普通属性与code，如「艾达4溯」）需同时进入普通槽位与code槽位：
        // 普通属性部分先进属性链汇总，code部分在其后基于完整属性计算（普通buff优先于code）
        this.buffs = options.buffs?.filter(v => !v.code || v.properties.length > 0) || []
        this.dynamicBuffs = options.buffs?.filter(v => v.code) || []
        this.imbalance = options.imbalance || false
        this.meleeWeapon = options.melee
        this.rangedWeapon = options.ranged
        this.syncWeaponForgeEffective()
        this.syncInheritedSkillWeapon()
        this.baseName = options.baseName
        this.enemyLevel = options.enemyLevel || 80
        this.enemyId = options.enemyId ?? 130
        this.enemy = options.enemy || new LeveledMonster(this.enemyId, this.enemyLevel)
        this.enemyResistance = options.enemyResistance || 0
        this.targetFunction = options.targetFunction || "伤害"
        this.customVariables = options.customVariables || []
        this.customBuff = this.createCustomBuffs(options.customBuff || [])
        this.timeline = options.timeline
        this.timelineDPS = options.timelineDPS || false
        this.teamWeaponCategories = options.teamWeaponCategories || []
    }

    /**
     * 将配置内的自定义 BUFF 转换为当前构筑实例独有的 BUFF 列表。
     * @param customBuff 自定义 BUFF 条目
     * @returns 当前构筑可直接使用的 BUFF 实例
     */
    private createCustomBuffs(customBuff: [string, number][]) {
        if (!customBuff.length) return []
        const buff = {
            名称: "自定义BUFF",
            描述: "自行填写",
        } as Record<string, string | number>
        customBuff.forEach(([property, value]) => {
            buff[property] = value
        })
        return [new LeveledBuff(buff as never)]
    }

    /**
     * 将 inherit 型同律武器的伤害类型同步为当前继承武器的伤害类型。
     */
    private syncInheritedSkillWeapon() {
        if (!this.skillWeapon?.inherit) return

        const inheritedWeapon = this.skillWeapon.inherit === "melee" ? this.meleeWeapon : this.rangedWeapon
        if (!inheritedWeapon) return

        this.skillWeapon.伤害类型 = inheritedWeapon.伤害类型
    }

    /**
     * 按当前角色精通刷新灾厄熔炼潜能的生效状态。
     */
    private syncWeaponForgeEffective() {
        if (!this._meleeWeapon || !this._rangedWeapon || !this._char) return
        this.meleeWeapon.setForgeEffective(this.isWeaponCategoryMastered(this.meleeWeapon))
        this.rangedWeapon.setForgeEffective(this.isWeaponCategoryMastered(this.rangedWeapon))
    }

    /**
     * 判断角色精通是否匹配武器类型。
     * @param weapon 目标武器
     * @returns 是否匹配精通类型
     */
    public isWeaponCategoryMastered(weapon: Pick<LeveledWeapon | LeveledSkillWeapon, "类别">) {
        return this.char.精通.includes(weapon.类别) || this.char.精通.includes("全部类型")
    }

    /**
     * 判断武器潜能是否在当前角色精通下生效。
     * @param weapon 目标武器
     * @returns 是否生效
     */
    public isWeaponForgeEffective(weapon: LeveledWeapon) {
        return !weapon.hasForge || this.isWeaponCategoryMastered(weapon)
    }

    get mods() {
        return [...this.charMods, ...this.meleeMods, ...this.rangedMods, ...this.skillMods, this.auraMod, this.tempMod].filter(
            (v): v is LeveledMod => !!v
        )
    }

    set mods(mods: LeveledMod[]) {
        this.charMods = []
        this.meleeMods = []
        this.rangedMods = []
        this.skillMods = []
        this.tempMod = null
        this.charModsExclusiveSeries.clear()
        this.meleeModsExclusiveSeries.clear()
        this.rangedModsExclusiveSeries.clear()
        this.skillModsExclusiveSeries.clear()
        this.charModsExclusiveNames.clear()
        this.meleeModsExclusiveNames.clear()
        this.rangedModsExclusiveNames.clear()
        this.skillModsExclusiveNames.clear()
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
    public calculateAttributes(nocode = false, attrApplied = false): CharAttr {
        const char = this.char
        const bonuses = this.getCharacterBonusVector()

        // 计算各种加成
        let attackBonus = bonuses[characterBonusIndex.攻击]
        const attackAdd = bonuses[characterBonusIndex.固定攻击]
        let healthBonus = bonuses[characterBonusIndex.生命]
        let shieldBonus = bonuses[characterBonusIndex.护盾]
        let defenseBonus = bonuses[characterBonusIndex.防御]
        let sanityBonus = bonuses[characterBonusIndex.神智]
        let elemDamageBonus = bonuses[characterBonusIndex.属性伤]
        // 计算基础值为1的属性
        let power = 1 + bonuses[characterBonusIndex.技能威力]
        let durability = 1 + bonuses[characterBonusIndex.技能耐久]
        let efficiency = 1 + bonuses[characterBonusIndex.技能效益]
        let range = 1 + bonuses[characterBonusIndex.技能范围]

        // 计算基础值为0的属性
        let boost = bonuses[characterBonusIndex.昂扬]
        let desperate = bonuses[characterBonusIndex.背水]
        let damageIncrease = bonuses[characterBonusIndex.增伤]
        let weaponDamage = bonuses[characterBonusIndex.武器伤害]
        let skillDamage = bonuses[characterBonusIndex.技能伤害]
        let skillSpeed = bonuses[characterBonusIndex.技能速度]
        let penetration = bonuses[characterBonusIndex.属性穿透]
        let imbalanceDamageBonus = bonuses[characterBonusIndex.失衡易伤]
        let skillAdd = bonuses[characterBonusIndex.技能倍率加数]
        let summonAttrInheritRatio = 1 + bonuses[characterBonusIndex.召唤物属性继承比例]
        let summonAttackSpeed = bonuses[characterBonusIndex.召唤物攻击速度]
        let summonRange = bonuses[characterBonusIndex.召唤物范围]
        let summonDamage = bonuses[characterBonusIndex.召唤物伤害]
        // 召唤物独立增伤：0起始的增量（1 + 该值 = 召唤物伤害乘区），供「艾达4溯」等BUFF的code做乘法转化
        let summonIndependentDamage = bonuses[characterBonusIndex.召唤物独立增伤]
        const ignoreDefense = this.getTotalBonusMul("无视防御")
        const skillIgnoreDefense = this.getTotalBonusMul("技能无视防御")
        const independentDamageIncrease = this.getTotalBonusMul("独立增伤")
        const damageReduce = this.getTotalBonusReduce("减伤")
        const skillMultiplierSet = bonuses[characterBonusIndex.技能倍率赋值]
        const skillMultiplier = this.getTotalBonusMul("技能倍率乘数")

        // 转xx 系列属性（0 开始，累加）
        const convertCut = bonuses[characterBonusIndex.转切割]
        const convertPierce = bonuses[characterBonusIndex.转贯穿]
        const convertImpact = bonuses[characterBonusIndex.转震荡]
        const convertCalamity = bonuses[characterBonusIndex.转灾厄]
        const convertRestraint = bonuses[characterBonusIndex.转属克]
        const convertReverse = bonuses[characterBonusIndex.转属逆]
        // 角色 MOD 的充盈威力词条加成（如 56201 充盈·巧击），经公共加成向量汇总
        const fullnessBonus = bonuses[characterBonusIndex.充盈威力]

        // 应用MOD属性加成
        const modAttributeBonus = this.getTotalBonus(`${this.char.属性}MOD属性`)
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
            summonAttrInheritRatio += modAttributeBonus * this.getModsBonus(modsBySeries, "召唤物属性继承比例")
            summonAttackSpeed += modAttributeBonus * this.getModsBonus(modsBySeries, "召唤物攻击速度")
            summonRange += modAttributeBonus * this.getModsBonus(modsBySeries, "召唤物范围")
            summonDamage += modAttributeBonus * this.getModsBonus(modsBySeries, "召唤物伤害")
            summonIndependentDamage += modAttributeBonus * this.getModsBonus(modsBySeries, "召唤物独立增伤")
        }

        // 计算基础属性
        let attack = char.基础攻击 * (1 + attackBonus + this.resonanceGain)
        let health = char.基础生命 * (1 + healthBonus + this.resonanceGain)
        let shield = char.基础护盾 * (1 + shieldBonus + this.resonanceGain)
        let defense = char.基础防御 * (1 + defenseBonus + this.resonanceGain)
        let sanity = char.基础神智 * (1 + sanityBonus)

        // 应用属性伤加成
        attack = attack * (1 + elemDamageBonus) + attackAdd

        // 结果处理
        health = Math.round(health)
        shield = Math.round(shield)
        defense = Math.round(defense)
        sanity = Math.round(sanity)
        attack = Math.round(attack * 100) / 100

        // 应用属性上限
        efficiency = Math.min(efficiency, 1.75) // 175%
        range = Math.min(range, 2.8) // 280%
        durability = Math.min(durability, 4) // 400%

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
            技能无视防御: skillIgnoreDefense,
            技能速度: skillSpeed,
            失衡易伤: imbalanceDamageBonus,
            技能倍率加数: skillAdd,
            技能倍率乘数: skillMultiplier,
            召唤物属性继承比例: summonAttrInheritRatio,
            召唤物攻击速度: summonAttackSpeed,
            召唤物范围: summonRange,
            召唤物伤害: summonDamage,
            召唤物独立增伤: summonIndependentDamage,
            减伤: damageReduce,
            技能倍率赋值: skillMultiplierSet,
            有效生命: (health / (1 - defense / (300 + defense)) + shield) / (1 - damageReduce),
            // 转xx 系列属性
            转切割: convertCut,
            转贯穿: convertPierce,
            转震荡: convertImpact,
            转灾厄: convertCalamity,
            转属克: convertRestraint,
            转属逆: convertReverse,
            // 充盈威力为角色属性：角色 MOD 充盈威力加成（向量汇总），武器转化部分由 calculateWeaponAttributes 累加
            充盈威力: fullnessBonus,
        }
        // 应用MOD条件 如果有变化就再计算一次
        const condMods = this.charModsWithAura.filter(mod => mod.生效?.条件)
        if (this.applyCondition(attrs, condMods)) {
            return this.calculateAttributes(nocode)
        }
        if (!attrApplied && this.applyBuffAttr(attrs)) {
            return this.calculateAttributes(nocode, true)
        }
        // 应用MOD条件
        if (nocode) return attrs
        if (this.dynamicBuffs.length > 0) {
            const all = this.getAllWeaponsAttrs()
            // 惰性 MOD 原始属性：仅当 BUFF code 实际访问对应槽位时才汇总
            const modAttrs = this.getModAttrs()
            if (this.dynamicBuffs.length > 0) {
                for (const b of this.dynamicBuffs) {
                    const { weapon, ...rest } = b.applyDynamicAttr(char, attrs, this.getAllWeapons(), all, this.enemy, modAttrs)
                    attrs = rest
                }
            }
        }
        return attrs
    }

    /**
     * 根据当前最终角色属性刷新 BUFF 的动态属性字段。
     * @param attrs 当前角色属性
     * @returns 是否发生字段变更
     */
    private applyBuffAttr(attrs: CharAttr) {
        let changed = false
        this.buffs.forEach(buff => {
            changed ||= this.applyBuffAttrValue(buff, attrs)
        })
        return changed
    }

    /**
     * 按当前构筑上下文刷新单个 BUFF 的动态属性字段。
     * @param buff 目标BUFF
     * @param attrs 当前角色属性
     * @returns 是否发生字段变更
     */
    public applyBuffAttrValue(buff: LeveledBuff, attrs = this.calculateAttributes(true)) {
        return buff.applyAttr(attrs, expression => this.evaluateAST(expression, { ...attrs }))
    }

    /**
     * 返回已刷新动态属性字段的 BUFF 副本，用于展示和收益预览。
     * @param buff 目标BUFF
     * @returns 刷新后的BUFF副本
     */
    public prepareBuff(buff: LeveledBuff) {
        const prepared = buff.clone()
        this.applyBuffAttrValue(prepared)
        return prepared
    }

    public applyCondition(attrs: CharAttr, mods: LeveledMod[]) {
        const conditionValues = this.getConditionValues()
        let changed = false
        mods.forEach(mod => {
            changed ||= mod.applyCondition(attrs, this.charModsWithAura, conditionValues)
        })
        return changed
    }

    /**
     * 统计“melee + ranged + skill + 队友”武器类别数量，供条件MOD计算动态倍率
     */
    private getConditionValues() {
        const conditionValues: Record<string, number> = {}
        const weapons: (LeveledWeapon | LeveledSkillWeapon)[] = [this.meleeWeapon, this.rangedWeapon]
        /**
         * 同律武器存在继承关系时，不应在武器类别计数中额外算作一个独立武器。
         */
        if (this.skillWeapon && !this.skillWeapon.inherit) {
            weapons.push(this.skillWeapon)
        }
        for (const weapon of weapons) {
            const category = weapon?.类别
            if (!category) continue
            conditionValues[category] = (conditionValues[category] || 0) + 1
        }
        for (const category of this.teamWeaponCategories) {
            conditionValues[category] = (conditionValues[category] || 0) + 1
        }
        return conditionValues
    }

    /**
     * 获取参与充盈威力汇总的武器集合（近战/远程/同律非继承）。
     * 同律武器继承近战/远程时复用被继承武器面板，不重复计入。
     * @returns 武器集合
     */
    private getAllFullnessWeapons(): (LeveledWeapon | LeveledSkillWeapon)[] {
        const weapons: (LeveledWeapon | LeveledSkillWeapon)[] = [this.meleeWeapon, this.rangedWeapon]
        if (this.skillWeapon && !this.skillWeapon.inherit) {
            weapons.push(this.skillWeapon)
        }
        return weapons
    }

    /**
     * 计算单个武器的触发率与充盈威力转化。
     * 触发率数值允许溢出（不钳制 100% 上限），加成逻辑与 calculateWeaponAttributes 保持一致。
     * @param weapon 武器
     * @returns 触发率与充盈威力转化
     */
    private getWeaponFullness(weapon: LeveledWeapon | LeveledSkillWeapon) {
        if (weapon.inherit) {
            weapon = weapon.inherit === "melee" ? this.meleeWeapon : this.rangedWeapon
        }
        const prefix = weapon.类型
        let triggerRateBonus = this.getTotalBonus(`${prefix}触发`, prefix) + this.getTotalBonus(`触发`, prefix)
        if (prefix.startsWith("同律")) {
            const lowerPrefix = prefix.substring(2)
            triggerRateBonus += this.getTotalBonus(`${lowerPrefix}触发`, lowerPrefix)
        }
        const triggerRate = Math.round(weapon.基础触发 * (1 + triggerRateBonus) * 100) / 100
        const conversionRate = this.getTotalBonus("充盈威力转化", prefix)
        return { triggerRate, conversionRate }
    }

    /**
     * 计算单个武器的攻速与召唤物攻击速度转化。
     * 攻速加成逻辑与 calculateWeaponAttributes 保持一致（含 200% 上限），供召唤物攻速转化汇总使用。
     * @param weapon 武器
     * @returns 攻速与召唤物攻击速度转化
     */
    private getWeaponSummonSpeed(weapon: LeveledWeapon | LeveledSkillWeapon) {
        if (weapon.inherit) {
            weapon = weapon.inherit === "melee" ? this.meleeWeapon : this.rangedWeapon
        }
        const prefix = weapon.类型
        let attackSpeedBonus = this.getTotalBonus(`${prefix}攻速`, prefix) + this.getTotalBonus(`攻速`, prefix)
        if (prefix.startsWith("同律")) {
            const lowerPrefix = prefix.substring(2)
            attackSpeedBonus += this.getTotalBonus(`${lowerPrefix}攻速`, lowerPrefix)
        }
        const attackSpeed = (weapon.射速 || 1) * (1 + Math.min(attackSpeedBonus, 2))
        const conversionRate = this.getTotalBonus("召唤物攻击速度转化", prefix)
        return { attackSpeed, conversionRate }
    }

    // 计算武器属性
    public calculateWeaponAttributes(
        weapon = this.selectedWeapon || (this.selectedSkill?.召唤物 && this.meleeWeapon),
        nocode = false,
        nochar = false
    ): CharAttr & { weapon?: WeaponAttr } {
        const char = this.char
        let attrs: CharAttr & { weapon?: WeaponAttr } = nochar ? ({} as any) : this.calculateAttributes(true) // code因为底下会算 所以角色属性不需要计算了

        if (weapon) {
            if (weapon.inherit) {
                weapon = weapon.inherit === "melee" ? this.meleeWeapon : this.rangedWeapon
            }
            const prefix = weapon.类型
            // 计算各种加成
            let attackBonus = this.getTotalBonus(`${prefix}攻击`, prefix) + this.getTotalBonus(`攻击`, prefix)
            const physicalBonus = this.getTotalBonus("物理", prefix)
            let critRateBonus = this.getTotalBonus(`${prefix}暴击`, prefix) + this.getTotalBonus(`暴击`, prefix)
            let critDamageBonus = this.getTotalBonus(`${prefix}暴伤`, prefix) + this.getTotalBonus(`暴伤`, prefix)
            let triggerRateBonus = this.getTotalBonus(`${prefix}触发`, prefix) + this.getTotalBonus(`触发`, prefix)
            let attackSpeedBonus = this.getTotalBonus(`${prefix}攻速`, prefix) + this.getTotalBonus(`攻速`, prefix)
            let multiShotBonus = this.getTotalBonus(`${prefix}多重`, prefix) + this.getTotalBonus(`多重`, prefix)
            let damageIncrease = this.getTotalBonus(`${prefix}增伤`, prefix) + this.getTotalBonus(`增伤`, prefix)
            let reloadTimeBonus = this.getTotalBonus(`${prefix}装填`, prefix) + this.getTotalBonus(`装填`, prefix)
            let magazineBonus = this.getTotalBonus(`${prefix}弹匣`, prefix) + this.getTotalBonus(`弹匣`, prefix)
            let ammoBonus = this.getTotalBonus(`${prefix}弹药`, prefix) + this.getTotalBonus(`弹药`, prefix)
            let additionalDamage = this.getTotalBonus("追加伤害")
            let weaponDamageMul = this.getTotalBonus(`${prefix}武器倍率`, prefix) + this.getTotalBonus(`武器倍率`, prefix)
            let independentDamageIncrease =
                (1 + this.getTotalBonusMul(`${prefix}独立增伤`, prefix)) * (1 + this.getTotalBonusMul("独立增伤", prefix)) - 1

            // 应用MOD属性加成
            const modAttributeBonus = this.getTotalBonus(`${this.char.属性}MOD属性`)
            if (modAttributeBonus > 0) {
                // 计算狮鹫百首契约者MOD属性加成
                const modsBySeries = this.charMods.filter(
                    (mod): mod is LeveledMod => mod !== null && CharBuild.elmSeries.includes(mod.系列)
                )
                additionalDamage += modAttributeBonus * this.getModsBonus(modsBySeries, "追加伤害")
            }

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
                ammoBonus += this.getTotalBonus(`${lowerPrefix}弹药`, lowerPrefix)
                weaponDamageMul += this.getTotalBonus(`${lowerPrefix}武器倍率`, lowerPrefix)
                independentDamageIncrease =
                    (1 + independentDamageIncrease) * (1 + this.getTotalBonusMul(`${lowerPrefix}独立增伤`, lowerPrefix)) - 1
            }

            // 攻速上限
            attackSpeedBonus = Math.min(attackSpeedBonus, 2)

            let atkRatio = 1
            // 角色精通
            if (this.isWeaponCategoryMastered(weapon)) {
                atkRatio = 1.2
            }
            // 计算武器属性
            let attack = weapon.基础攻击 * (1 + attackBonus) * atkRatio
            let critRate = weapon.基础暴击 * (1 + critRateBonus)
            let critDamage = weapon.基础暴伤 * (1 + critDamageBonus)
            let triggerRate = weapon.基础触发 * (1 + triggerRateBonus)
            let attackSpeed = (weapon.射速 || 1) * (1 + attackSpeedBonus)
            const reloadTime = (weapon.基础装填 || 0) / (1 + reloadTimeBonus)
            const magazine = (weapon.基础弹匣 || 0) * (1 + magazineBonus)
            const ammo = ((weapon as LeveledWeapon).基础弹药 || 0) * (1 + ammoBonus)

            let multiShot = 1 + multiShotBonus

            // 应用武器物理加成
            attack *= 1 + physicalBonus

            // 触发率数值允许溢出（可超过 100%）：溢出部分由 calculateWeaponDamage 封顶触发效果，
            // 并在下方按该武器作用域的充盈威力转化转为角色的充盈威力，因此此处不设上限。
            // 取整
            attack = Math.round(attack * 100) / 100
            critRate = Math.round(critRate * 100) / 100
            critDamage = Math.round(critDamage * 100) / 100
            triggerRate = Math.round(triggerRate * 100) / 100
            attackSpeed = Math.round(attackSpeed * 100) / 100
            multiShot = Math.round(multiShot * 100) / 100
            independentDamageIncrease = Math.round(independentDamageIncrease * 1000) / 1000

            const weaponAttrs: WeaponAttr = {
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
                弹药: ammo,
                武器倍率: weaponDamageMul,
                // 充盈威力转化（武器属性）：该武器作用域（角色槽 + 该武器槽）MOD 充盈威力转化词条之和
                充盈威力转化: this.getTotalBonus("充盈威力转化", prefix),
                // 召唤物转化（武器属性）：与充盈威力转化同理，该武器作用域（角色槽 + 该武器槽）转化词条之和
                召唤物攻击速度转化: this.getTotalBonus("召唤物攻击速度转化", prefix),
                召唤物范围转化: this.getTotalBonus("召唤物范围转化", prefix),
            }
            attrs.weapon = weaponAttrs
        }
        // 充盈威力（角色属性）= 角色 MOD 充盈威力加成 + Σ 所有武器（近战/远程/同律非继承）溢出触发 × 该武器充盈威力转化。
        // 各武器的转化率只作用于该武器自身溢出的触发率，不跨武器累加转化率。
        let totalFullness = 0
        for (const w of this.getAllFullnessWeapons()) {
            const { triggerRate, conversionRate } = this.getWeaponFullness(w)
            totalFullness += Math.max(0, triggerRate - 1) * conversionRate
        }
        attrs.充盈威力 = (attrs.充盈威力 || 0) + totalFullness
        // 召唤物转化（角色属性）汇总，仿充盈威力转化范式：转化词条在武器作用域，转化结果计入角色属性。
        // 召唤物绑定近战武器，攻速转化以近战武器攻速全额为来源（如攻速 1.75 × 转化 0.495）；范围转化以角色技能范围为来源（由 LeveledSkill 公式应用技能范围）。
        if (this.meleeWeapon) {
            const { attackSpeed, conversionRate } = this.getWeaponSummonSpeed(this.meleeWeapon)
            attrs.召唤物攻击速度 = (attrs.召唤物攻击速度 || 0) + Math.max(0, attackSpeed) * conversionRate
            attrs.召唤物范围 = (attrs.召唤物范围 || 0) + this.getTotalBonus("召唤物范围转化", "近战")
        }
        if (nocode) return attrs

        if (this.dynamicBuffs.length > 0) {
            // TODO: 没做其他武器属性的code计算, 可能有问题 不过递归太多次也很麻烦
            const all = this.getAllWeaponsAttrs(weapon, attrs.weapon)
            // 惰性 MOD 原始属性：仅当 BUFF code 实际访问对应槽位时才汇总
            const modAttrs = this.getModAttrs()
            if (this.dynamicBuffs.length > 0) {
                for (const b of this.dynamicBuffs) {
                    attrs = b.applyDynamicAttr(char, attrs, this.getAllWeapons(weapon), all, this.enemy, modAttrs)
                }
            }
        }
        return attrs
    }

    getAllWeapons(weapon = this.selectedWeapon) {
        return [weapon, this.meleeWeapon, this.rangedWeapon, this.skillWeapon]
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
        return this.getAllWeapons(weapon)
            .map(w => (w ? (w.名称 === weapon?.名称 ? { weapon: weaponAttrs } : this.calculateWeaponAttributes(w, true, true)) : undefined))
            .map(a => a?.weapon)
    }

    getAllWeaponsByBase() {
        const map = new Map<string, LeveledWeapon | LeveledSkillWeapon>([
            ["远程", this.rangedWeapon],
            ["近战", this.meleeWeapon],
        ])
        if (this.skillWeapon) {
            map.set("同律", this.skillWeapon)
        }
        // add english alias
        map.set("melee", map.get("近战")!)
        map.set("ranged", map.get("远程")!)
        if (map.has("同律")) map.set("skill", map.get("同律")!)
        this.weaponSkills.forEach(ws => {
            if (ws.武器 && map.has(ws.武器.slice(0, 2))) {
                map.set(ws.名称, map.get(ws.武器.slice(0, 2))!)
            }
        })
        return map
    }

    getAllWeaponSkillsAttrs() {
        const map = new Map([
            ["远程", this.calculateWeaponAttributes(this.rangedWeapon, true, true).weapon],
            ["近战", this.calculateWeaponAttributes(this.meleeWeapon, true, true).weapon],
        ])
        if (this.skillWeapon) {
            map.set(
                "同律",
                this.skillWeapon.inherit === "melee"
                    ? map.get("近战")!
                    : this.skillWeapon.inherit === "ranged"
                      ? map.get("远程")!
                      : this.calculateWeaponAttributes(this.skillWeapon, true, true).weapon
            )
        }
        // add english alias
        map.set("melee", map.get("近战")!)
        map.set("ranged", map.get("远程")!)
        if (map.has("同律")) map.set("skill", map.get("同律")!)
        this.weaponSkills.forEach(ws => {
            if (ws.武器 && map.has(ws.武器.slice(0, 2))) {
                map.set(ws.名称, map.get(ws.武器.slice(0, 2)))
            }
        })
        return map
    }

    /**
     * 将细分武器前缀收敛到装备槽位，用于 MOD/武器归属过滤。
     * @param prefix 属性前缀
     * @returns 装备槽位前缀
     */
    private getAttributePrefixScope(prefix = "角色") {
        if (prefix.startsWith("同律近战")) return "同律近战"
        if (prefix.startsWith("同律远程")) return "同律远程"
        if (prefix.startsWith("近战")) return "近战"
        if (prefix.startsWith("远程")) return "远程"
        return prefix
    }

    /**
     * 判断BUFF属性是否匹配当前属性作用域。
     * @param attribute 属性名
     * @param prefixScope 当前属性作用域
     * @returns 是否应参与汇总
     */
    private isBuffAttributeInScope(attribute: string, prefixScope: string) {
        const attributeScope = this.getAttributePrefixScope(attribute)
        if (attributeScope === "近战" || attributeScope === "远程" || attributeScope.startsWith("同律")) {
            return prefixScope === attributeScope
        }
        return true
    }

    /**
     * 根据技能名或字段名判断武器攻击细分乘区。
     * @param baseName 技能名称
     * @param fieldName 字段名称
     * @returns 细分乘区前缀
     */
    private getWeaponAttackTypePrefix(baseName: string, fieldName?: string) {
        const fieldPrefix = weaponAttackTypeMap.find(
            ({ patterns }) => fieldName && patterns.some(pattern => fieldName.includes(pattern))
        )?.prefix
        if (fieldPrefix) return fieldPrefix
        // 普攻连段字段（如"一段伤害"、"[萨麦尔]三段伤害"）不携带攻击类型关键字，
        // 通过"段伤害"后缀归入普攻；但排除已含其他攻击类型关键字的字段（如"下落攻击二段伤害"、"骑乘攻击一段伤害"）。
        if (fieldName && /段(?:剑气)?伤害$/.test(fieldName) && !/(蓄力|下落|滑行|射击|骑乘)攻击/.test(fieldName)) {
            return "普攻"
        }
        const basePrefix = weaponAttackTypeMap.find(({ patterns }) => patterns.some(pattern => baseName === pattern))?.prefix
        if (basePrefix) return basePrefix
        const skillWeapon = this.skillWeapon
        if (skillWeapon?.名称 === baseName) {
            return weaponAttackTypeMap.find(({ patterns }) => skillWeapon.视为 && patterns.some(pattern => skillWeapon.视为 === pattern))
                ?.prefix
        }
        return undefined
    }

    /**
     * 获取当前武器伤害字段适用的细分加成。
     * @param weaponPrefix 武器前缀
     * @param baseName 技能名称
     * @param fieldName 字段名称
     * @param attribute 加成属性
     * @returns 细分增伤加成
     */
    private getWeaponAttackTypeBonus(
        weaponPrefix: string,
        baseName: string,
        fieldName: string | undefined,
        attribute: "增伤" | "独立增伤",
        weapon?: LeveledWeapon | LeveledSkillWeapon
    ) {
        const attackTypePrefix = this.getWeaponAttackTypePrefix(baseName, fieldName)
        const weaponAttackTypePrefix =
            attackTypePrefix || (weapon instanceof LeveledSkillWeapon ? this.getWeaponAttackTypePrefix(weapon.视为 || "") : undefined)
        if (!weaponAttackTypePrefix) return 0
        const prefixScope = this.getAttributePrefixScope(weaponPrefix)
        const getBonus = attribute === "独立增伤" ? this.getTotalBonusMul.bind(this) : this.getTotalBonus.bind(this)
        let bonus = getBonus(`${weaponPrefix}${weaponAttackTypePrefix}${attribute}`, prefixScope)
        if (weaponPrefix.includes("近战")) {
            bonus += getBonus(`${weaponAttackTypePrefix}${attribute}`, prefixScope)
        }
        if (weaponPrefix.startsWith("同律")) {
            const lowerPrefix = weaponPrefix.substring(2)
            bonus += getBonus(`${lowerPrefix}${weaponAttackTypePrefix}${attribute}`, this.getAttributePrefixScope(lowerPrefix))
            if (lowerPrefix.includes("近战")) {
                bonus += getBonus(`${weaponAttackTypePrefix}${attribute}`, this.getAttributePrefixScope(lowerPrefix))
            }
        }
        return bonus
    }
    // 下列属性可以从角色穿透到武器
    static attrAllowCharToWeapon = new Set(["暴击", "暴伤", "触发", "攻速", "充盈威力转化", "召唤物攻击速度转化", "召唤物范围转化"])

    // 获取总加成
    public getTotalBonus(attribute: string, prefix = "角色"): number {
        let bonus = 0
        const prefixScope = this.getAttributePrefixScope(prefix)

        // 添加角色自带加成
        if (prefix === "角色" || attribute !== "攻击") {
            bonus += this.char.加成?.[attribute] || 0
        }

        // 添加近战武器加成
        if ((prefixScope === "角色" || (prefixScope === "近战" && attribute !== "攻击")) && this.meleeWeapon) {
            if (this.isWeaponForgeEffective(this.meleeWeapon) && typeof this.meleeWeapon[attribute] === "number") {
                bonus += this.meleeWeapon[attribute]
            }
        }
        // 添加远程武器加成
        if ((prefixScope === "角色" || (prefixScope === "远程" && attribute !== "攻击")) && this.rangedWeapon) {
            if (this.isWeaponForgeEffective(this.rangedWeapon) && typeof this.rangedWeapon[attribute] === "number") {
                bonus += this.rangedWeapon[attribute]
            }
        }

        // 添加MOD加成
        this.mods.forEach(mod => {
            if (
                CharBuild.attrAllowCharToWeapon.has(attribute)
                    ? mod.attrType !== "角色" && mod.attrType !== prefixScope
                    : prefixScope && mod.attrType !== prefixScope
            )
                return
            if (typeof mod.addAttr[attribute] === "number") {
                bonus += mod.addAttr[attribute]
            }
        })

        // 添加BUFF加成
        this.buffs.forEach(buff => {
            if (!this.isBuffAttributeInScope(attribute, prefixScope)) return
            if (prefixScope !== "角色" && ["攻击", "增伤"].includes(attribute)) return
            if (typeof buff[attribute] === "number") {
                bonus += buff[attribute]
            }
        })

        Object.entries(this.rangedWeapon.buffProps).forEach(([key, value]) => {
            if (prefixScope !== "角色" && ["攻击", "增伤"].includes(key)) return
            if (attribute === key && typeof value === "number") {
                bonus += value
            }
        })

        Object.entries(this.meleeWeapon.buffProps).forEach(([key, value]) => {
            if (prefixScope !== "角色" && ["攻击", "增伤"].includes(key)) return
            if (attribute === key && typeof value === "number") {
                bonus += value
            }
        })

        return bonus
    }

    /**
     * 归约角色公共加成；SIMD 模块就绪后使用连续 f64 矩阵，否则严格回退到既有逐属性求和。
     * @returns 顺序与 characterBonusAttributes 对齐的公共属性加成向量
     */
    private getCharacterBonusVector(): Float64Array {
        const attributeCount = characterBonusAttributes.length
        const sourceCount = 5 + this.mods.length + this.buffs.length
        const contributions = new Float64Array(sourceCount * attributeCount)
        let sourceIndex = 0

        /** 将一组记录的数值属性写入一行连续的 f64 贡献。 */
        const addSource = (source: Record<string, unknown> | undefined, readKey = (attribute: string) => attribute) => {
            if (source) {
                for (let index = 0; index < attributeCount; index++) {
                    const value = source[readKey(characterBonusAttributes[index])]
                    if (typeof value === "number") {
                        contributions[sourceIndex * attributeCount + index] = value
                    }
                }
            }
            sourceIndex++
        }

        addSource(this.char.加成)
        addSource(this.isWeaponForgeEffective(this.meleeWeapon) ? (this.meleeWeapon as unknown as Record<string, unknown>) : undefined)
        addSource(this.isWeaponForgeEffective(this.rangedWeapon) ? (this.rangedWeapon as unknown as Record<string, unknown>) : undefined)

        for (const mod of this.mods) {
            addSource(mod.attrType === "角色" ? mod.addAttr : undefined)
        }
        for (const buff of this.buffs) {
            addSource(buff as unknown as Record<string, unknown>)
        }
        addSource(this.rangedWeapon.buffProps)
        addSource(this.meleeWeapon.buffProps)

        const simdBonuses = sumCharBuildBonusContributions(contributions, sourceCount, attributeCount)
        if (simdBonuses) return simdBonuses

        return Float64Array.from(characterBonusAttributes, attribute => this.getTotalBonus(attribute))
    }

    public getModsBonus(mods: LeveledMod[], attribute: string, prefix = "角色"): number {
        let bonus = 0
        const prefixScope = this.getAttributePrefixScope(prefix)

        // 添加MOD加成
        if (prefix === "角色" || !attribute.startsWith(prefix))
            mods.forEach(mod => {
                if (prefixScope && mod.类型 !== prefixScope) return
                if (typeof mod[attribute] === "number") {
                    bonus += mod[attribute]
                }
            })

        return bonus
    }

    /**
     * 统计各装备槽位 MOD 的原始属性加成总和（惰性求值）。
     * 返回带惰性 getter 的对象：仅当动态 BUFF 的 code 实际访问对应槽位（如 meleeMods.暴击）时才汇总，
     * 未被访问的槽位不产生任何计算，避免算力浪费。
     * 仅汇总 MOD 区（魔之楔词条）自身的加成，不含 BUFF、角色基础值或武器基础值，
     * 因此结果不会被其他 BUFF（如[色散成霓]的暴击加成）影响。
     * 属性为不可枚举 accessor，防止返回值展开/解构时被误触发。
     * @returns 各槽位（角色/近战/远程/同律）的 MOD 属性总和（惰性求值）
     */
    public getModAttrs() {
        const slots: Record<string, (LeveledMod | null)[]> = {
            charMods: this.charMods,
            meleeMods: this.meleeMods,
            rangedMods: this.rangedMods,
            skillMods: this.skillMods,
        }
        const lazy: Record<string, Record<string, number>> = {}
        for (const [slot, mods] of Object.entries(slots)) {
            let cached: Record<string, number> | undefined
            Object.defineProperty(lazy, slot, {
                enumerable: false,
                configurable: false,
                get() {
                    if (!cached) {
                        cached = {}
                        for (const mod of mods) {
                            if (!mod) continue
                            for (const [key, value] of Object.entries(mod.addAttr)) {
                                if (typeof value === "number") cached[key] = (cached[key] || 0) + value
                            }
                        }
                    }
                    return cached
                },
            })
        }
        return lazy
    }

    // 获取总加成
    private getTotalBonusMul(attribute: string, prefix = "角色"): number {
        let bonus = 1
        const prefixScope = this.getAttributePrefixScope(prefix)

        // 添加角色自带加成
        if (typeof this.char.加成?.[attribute] === "number") {
            bonus *= 1 + this.char.加成?.[attribute] || 0
        }

        // 添加MOD加成
        this.mods.forEach(mod => {
            if (prefixScope && mod.attrType !== prefixScope) return
            if (typeof mod.addAttr[attribute] === "number") {
                bonus *= 1 + mod.addAttr[attribute]
            }
        })

        // 添加BUFF加成
        this.buffs.forEach(buff => {
            if (!this.isBuffAttributeInScope(attribute, prefixScope)) return
            if (prefixScope !== "角色" && attribute === "独立增伤") return
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
        this.mods.forEach(mod => {
            if (prefix && mod.类型 !== prefix) return
            if (typeof mod[attribute] === "number") {
                bonus = 1 - (1 - bonus) * (1 - mod[attribute])
            }
        })

        // 添加BUFF加成
        this.buffs.forEach(buff => {
            if (typeof buff[attribute] === "number") {
                bonus = 1 - (1 - bonus) * (1 - buff[attribute])
            }
        })

        return bonus
    }

    // 计算昂扬乘区
    public calculateBoostMultiplier(attrs: ReturnType<typeof this.calculateAttributes>, hpPercent = this.hpPercent): number {
        const boost = attrs.昂扬
        hpPercent = Math.max(0, Math.min(1, hpPercent))
        return 1 + boost * hpPercent
    }

    // 计算背水乘区
    public calculateDesperateMultiplier(attrs: ReturnType<typeof this.calculateAttributes>, hpPercent = this.hpPercent): number {
        const desperate = attrs.背水
        hpPercent = Math.max(0.25, Math.min(1, hpPercent))
        // 4(x-1.25)^2-0.25
        return 1 + 4 * desperate * (1 - hpPercent) * (1.5 - hpPercent)
    }

    /**
     * 计算高等级减伤乘区。
     * 怪物等级大于等于 200 时生效。
     * @param enemyLevel 怪物等级
     */
    private calculateLevelReduceRate(enemyLevel: number): number {
        if (enemyLevel < 200) {
            return 1
        }

        return 1 / (1 + (enemyLevel - 190) * 0.05)
    }

    /**
     * 计算防御乘区
     * @param attrs 属性
     * @param finalDef 可选, 最终防御值
     * @returns 防御乘区
     */
    public calculateDefenseMultiplier(attrs: ReturnType<typeof this.calculateAttributes>, finalDef?: number, isSkill = false): number {
        const enemyLevel = this.enemy.等级 || 80
        if (this.enemy.currentShield > 0) return this.calculateLevelReduceRate(enemyLevel)
        // 确保等级和敌方等级都是有效的数字
        const charLevel = this.char.等级 || 80

        const levelDiff = Math.max(0, Math.min(20, Math.min(80, enemyLevel) - charLevel))
        const def = finalDef ?? this.enemy.def * (1 - (isSkill ? attrs.技能无视防御 + attrs.无视防御 : attrs.无视防御))
        const dmgReduce = def / (300 + def - levelDiff * 10) // 减伤率
        const defenseMultiplier = (1 - dmgReduce) * this.calculateLevelReduceRate(enemyLevel)
        return Math.max(0, Math.min(1, defenseMultiplier))
    }

    /**
     * 计算转属克/转属逆后的有效敌人抗性因子（即原计算中的 max(0, 1 - 敌人抗性)）。
     * 两种属性方向相反、各自独立生效（总比例各自钳制到 [0,1]）：
     * - 转属逆：只把负抗（弱抗，如 -4）翻转为正抗 0.5；敌人抗性为 0 或正抗时不做处理。
     * - 转属克：只把正抗（强抗，如 0.5）翻转为负抗 -4；敌人抗性为 0 或负抗时不做处理。
     * - 敌人 0 抗始终不做处理（视为 0 抗）。
     * 生效的转换按比例混合：转换比例 c 的部分按翻转后的抗性结算，其余部分按原抗性结算。
     * @param attrs 属性（含可选的 转属克/转属逆）
     * @returns 混合后的抗性因子（恒 >= 0）
     */
    private getResistanceFactor(attrs: CharAttr): number {
        const factor = (r: number) => Math.max(0, 1 - r)
        const r = this.enemyResistance
        if (r === 0) return factor(0)
        if (r < 0) {
            // 负抗：只有转属逆生效（负抗 → 等效正抗 0.5）
            const convert = Math.max(0, Math.min(1, attrs.转属逆 || 0))
            return (1 - convert) * factor(r) + convert * factor(0.5)
        }
        // 正抗：只有转属克生效（正抗 → 等效负抗 -4）
        const convert = Math.max(0, Math.min(1, attrs.转属克 || 0))
        return (1 - convert) * factor(r) + convert * factor(-4)
    }

    // 计算技能伤害
    public calculateSkillDamage(
        attrs: ReturnType<typeof this.calculateAttributes>,
        baseName = this.baseName,
        fieldName?: string
    ): DamageResult {
        // 计算各种乘区（转属克/转属逆经 getResistanceFactor 改变敌人抗性因子，属性穿透整体相乘）
        const resistancePenetration = Math.max(0, this.getResistanceFactor(attrs) * (1 + attrs.属性穿透))
        const boostMultiplier = this.calculateBoostMultiplier(attrs)
        const desperateMultiplier = this.calculateDesperateMultiplier(attrs)
        // 召唤物伤害应按字段名判断（如「[召唤物·战车]技能伤害」），而不是技能名
        const skill = this.allSkills.find(s => s.名称 === baseName)
        const resolvedFieldName = fieldName
            ? skill?.字段.find(f => f.safeName.includes(fieldName) || f.名称.includes(fieldName))?.名称 || fieldName
            : undefined
        const isSummonDamage = resolvedFieldName ? resolvedFieldName.includes("召唤物") : !!skill?.召唤物
        const damageIncrease = 1 + attrs.增伤 + attrs.技能伤害 + (isSummonDamage ? attrs.召唤物伤害 : 0)
        const independentDamageIncrease = 1 + attrs.独立增伤
        // 召唤物独立增伤乘区（0起始增量，1 + 该值 = 仅召唤物伤害结算的倍率）：如「艾达4溯」将召唤物攻击速度超额部分按比例转化为该乘区
        const summonIndependentDamageMultiplier = isSummonDamage ? 1 + attrs.召唤物独立增伤 : 1
        const imbalanceDamageMultiplier = this.imbalance ? attrs.失衡易伤 + 1.5 : 1

        const hpMore = boostMultiplier * desperateMultiplier
        // 计算最终伤害
        const finalDamage =
            resistancePenetration *
            damageIncrease *
            independentDamageIncrease *
            summonIndependentDamageMultiplier *
            imbalanceDamageMultiplier

        return {
            expectedDamage: finalDamage * hpMore,
            noHpDamage: finalDamage,
            // 技能伤害视为纯元素结算，无物理分量
            physicalDamage: 0,
            elementDamage: finalDamage * hpMore,
        }
    }

    // 计算武器伤害
    public calculateWeaponDamage(
        attrs: ReturnType<typeof this.calculateWeaponAttributes>,
        weapon: LeveledWeapon | LeveledSkillWeapon,
        damageType = weapon.伤害类型
    ): DamageResult {
        const weaponAttrs = attrs.weapon!
        // 计算武器基础伤害
        const weaponAttackMultiplier = 1 // 倍率 这里设为1 使用动态计算
        const totalWeaponDamage = attrs.攻击 + weaponAttrs.攻击
        const inheritAllSkillWeapon = weapon instanceof LeveledSkillWeapon && !!weapon.inherit && weapon.atk === "all"
        // inherit + atk=all 的同律武器保持纯元素结算，不能被继承的灾厄类型转为物理分量。
        const convertElementalToPhysical = damageType === "灾厄" && !inheritAllSkillWeapon
        const weaponDamagePhysical = convertElementalToPhysical
            ? 1
            : inheritAllSkillWeapon
              ? 0
              : (weaponAttackMultiplier * weaponAttrs.攻击) / totalWeaponDamage
        const weaponDamageElemental = convertElementalToPhysical
            ? 0
            : inheritAllSkillWeapon
              ? 1
              : (weaponAttackMultiplier * attrs.攻击) / totalWeaponDamage

        // 触发倍率：物理伤害类型按敌方当前血量类型结算，灾厄类型需敌方存在抗性才可触发。
        const getTriggerMultiplier = (type: string): number => {
            if (type === "灾厄") {
                return this.enemyResistance !== 0 ? 1 + this.getTotalBonus("触发倍率") : 0
            }
            return type === this.hpTypeDMG[this.enemy.currentHPType]
                ? this.hpTypeCoefficients[this.enemy.currentHPType] + this.getTotalBonus("触发倍率")
                : 0
        }
        // 触发效果按 100% 封顶：触发率数值允许溢出（>100%），但溢出部分不重复计入触发期望，
        // 而是由 calculateWeaponAttributes 按该武器作用域的充盈威力转化转为角色的充盈威力；负值同样钳制为 0，
        // 避免触发期望溢出为负导致伤害输出归零（如 [近战]{触发:-9}）。
        const triggerRate = Math.min(1, Math.max(0, weaponAttrs.触发))

        // 计算暴击伤害期望
        // 暴击率允许超过 100% 溢出为更高暴击档位（见下方 floor/ceil 逻辑），因此不做上限钳制。
        const critRate = weaponAttrs.暴击
        const critDamage = weaponAttrs.暴伤
        const lowerCritDamage = (weaponAttrs.暴伤 - 1) * Math.floor(weaponAttrs.暴击) + 1
        const higherCritDamage = (weaponAttrs.暴伤 - 1) * Math.ceil(weaponAttrs.暴击) + 1
        const critExpectedDamage = 1 + critRate * (critDamage - 1)

        // 计算各种乘区（转属克/转属逆 按压缩后的有效比例经下方 resistance 翻转元素分量的抗性因子；
        // 物理分量原本不受抗性影响，但 转属克/转属逆 会按比例将物理分量转为属克/属逆元素，同样享受翻转抗性）
        const enemyResistance = this.enemyResistance
        // 翻转抗性因子：转属克/转属逆 将物理分量转为属克/属逆元素时按翻转后的抗性结算（元素分量本身已由下方 resistance 翻转）
        const flippedResistance = enemyResistance > 0 ? -4 : 0.5
        const flippedFactor = Math.max(0, 1 - flippedResistance)
        const resistancePenetration = Math.max(0, 1 + attrs.属性穿透)
        const boostMultiplier = this.calculateBoostMultiplier(attrs)
        const desperateMultiplier = this.calculateDesperateMultiplier(attrs)
        const damageIncrease = 1 + attrs.增伤 + weaponAttrs.增伤 + attrs.武器伤害
        const independentDamageIncrease = (1 + attrs.独立增伤) * (1 + weaponAttrs.独立增伤)
        const additionalDamage = 1 + weaponAttrs.追加伤害
        const imbalanceDamageMultiplier = this.imbalance ? attrs.失衡易伤 + 1.5 : 1
        const hpMore = boostMultiplier * desperateMultiplier
        const otherMore = damageIncrease * independentDamageIncrease * additionalDamage * imbalanceDamageMultiplier * resistancePenetration
        const commonMore = hpMore * otherMore

        // 计算最终伤害（支持 转xx 系列属性）
        // 转属克/转属逆（按敌人抗性方向取其一）与 转切割/转贯穿/转震荡/转灾厄 共享同一转换比例池：
        // 转属克/转属逆 把物理+元素按比例转为属克/属逆元素（翻转抗性）；转物理类型把物理+元素按比例转为对应物理子类（按触发规则结算）。
        // 合计转换比例超过 100% 时等比重压缩（convertScale），不足 100% 时剩余 (1 - total) 按原始物理/元素比例结算。
        const activeElementKey: "转属克" | "转属逆" | undefined =
            enemyResistance > 0 ? "转属克" : enemyResistance < 0 ? "转属逆" : undefined
        const physicalConvertKeywords = ["转切割", "转贯穿", "转震荡", "转灾厄"] as const
        const rawElementConvert = activeElementKey ? Math.max(0, attrs[activeElementKey] || 0) : 0
        const rawPhysicalConvert = physicalConvertKeywords.reduce((sum, k) => sum + Math.max(0, attrs[k] || 0), 0)
        const poolTotal = rawElementConvert + rawPhysicalConvert
        const convertScale = poolTotal > 1 ? 1 / poolTotal : 1
        const unconverted = Math.max(0, 1 - Math.min(1, poolTotal))
        // 元素转换的有效比例（经统一池压缩后）决定属克/属逆元素的抗性翻转程度，保证压缩前后抗性一致
        const elementConvertRatio = Math.min(1, rawElementConvert) * convertScale
        const resistance = (() => {
            const f = (r: number) => Math.max(0, 1 - r)
            const r = enemyResistance
            if (r === 0) return f(0)
            if (r < 0) return (1 - elementConvertRatio) * f(r) + elementConvertRatio * f(0.5)
            return (1 - elementConvertRatio) * f(r) + elementConvertRatio * f(-4)
        })()

        type ConvertEntry = { key: string; ratio: number; kind: "element" | "physical" }
        const conversionEntries: ConvertEntry[] = []
        if (activeElementKey) conversionEntries.push({ key: activeElementKey, ratio: rawElementConvert, kind: "element" })
        for (const key of physicalConvertKeywords) {
            conversionEntries.push({ key, ratio: Math.max(0, attrs[key] || 0), kind: "physical" })
        }

        const elementalPart = weaponDamageElemental * resistance
        const physicalBase = weaponDamagePhysical
        // parts 记录每个伤害分量：ratio 为结算前系数，triggerAdd 为触发加成，settlesElement 标记最终结算类型
        const parts: { ratio: number; triggerAdd: number; settlesElement: boolean }[] = []
        if (inheritAllSkillWeapon) {
            // 同律 inherit+atk=all：纯元素伤害，无物理分量、不吃触发加成（触发倍率仅按物理伤害类型结算）
            if (unconverted > 0) parts.push({ ratio: elementalPart * unconverted, triggerAdd: 0, settlesElement: true })
        } else {
            // 未转换的物理部分（原物理类型，按原始伤害类型触发）；未转换的元素部分（原元素类型，无触发）
            if (physicalBase > 0 && unconverted > 0)
                parts.push({ ratio: physicalBase * unconverted, triggerAdd: getTriggerMultiplier(damageType), settlesElement: false })
            if (unconverted > 0) parts.push({ ratio: elementalPart * unconverted, triggerAdd: 0, settlesElement: true })
        }
        // 转换部分：遍历统一转换池，按 convertScale 压缩后的比例把对应比例的物理+元素分量转为目标类型
        for (const e of conversionEntries) {
            const ratio = e.ratio * convertScale
            if (ratio <= 0) continue
            if (e.kind === "element") {
                // 转属克/转属逆：物理→属克/属逆元素（翻转抗性结算、无触发）；元素分量已实现翻转（见 getResistanceFactor），直接计入元素
                if (physicalBase > 0) parts.push({ ratio: physicalBase * ratio * flippedFactor, triggerAdd: 0, settlesElement: true })
                parts.push({ ratio: elementalPart * ratio, triggerAdd: 0, settlesElement: true })
            } else {
                // 转切割/转贯穿/转震荡/转灾厄：物理+元素一并转为对应物理子类，按物理类型触发规则结算（settlesElement: false）
                const triggerAdd = getTriggerMultiplier(e.key.slice(1))
                if (inheritAllSkillWeapon) {
                    parts.push({ ratio: elementalPart * ratio, triggerAdd, settlesElement: false })
                } else {
                    if (physicalBase > 0) parts.push({ ratio: physicalBase * ratio, triggerAdd, settlesElement: false })
                    parts.push({ ratio: elementalPart * ratio, triggerAdd, settlesElement: false })
                }
            }
        }
        const allPart = parts.reduce((sum, p) => sum + p.ratio, 0)
        const triggerAllPart = parts.reduce((sum, p) => sum + p.ratio * (1 + p.triggerAdd), 0)
        const expectedTriggerAllPart = parts.reduce((sum, p) => sum + p.ratio * (1 + p.triggerAdd * triggerRate), 0)
        // 按结算类型拆分期望伤害（物理/元素），用于 物理/元素 属性访问器
        const physicalExpectedTriggerAllPart = parts
            .filter(p => !p.settlesElement)
            .reduce((sum, p) => sum + p.ratio * (1 + p.triggerAdd * triggerRate), 0)
        const elementExpectedTriggerAllPart = parts
            .filter(p => p.settlesElement)
            .reduce((sum, p) => sum + p.ratio * (1 + p.triggerAdd * triggerRate), 0)
        const lowerCritNoTriggerBase = lowerCritDamage * commonMore
        const higherCritNoTriggerBase = higherCritDamage * commonMore
        const expectedCritNoTriggerBase = critExpectedDamage * commonMore
        const lowerCritNoTrigger = allPart * lowerCritNoTriggerBase
        const higherCritNoTrigger = allPart * higherCritNoTriggerBase
        const expectedCritNoTrigger = allPart * expectedCritNoTriggerBase
        const lowerCritTrigger = triggerAllPart * lowerCritNoTriggerBase
        const higherCritTrigger = triggerAllPart * higherCritNoTriggerBase
        const lowerCritExpectedTrigger = expectedTriggerAllPart * lowerCritNoTriggerBase
        const higherCritExpectedTrigger = expectedTriggerAllPart * higherCritNoTriggerBase
        const expectedCritTrigger = expectedTriggerAllPart * expectedCritNoTriggerBase
        const expectedDamage = expectedTriggerAllPart * expectedCritNoTriggerBase
        const noHpDamage = expectedTriggerAllPart * critExpectedDamage * otherMore
        return {
            lowerCritNoTrigger,
            higherCritNoTrigger,
            lowerCritTrigger,
            higherCritTrigger,
            lowerCritExpectedTrigger,
            higherCritExpectedTrigger,
            expectedCritTrigger,
            expectedCritNoTrigger,
            expectedDamage,
            noHpDamage,
            // 物理/元素 分量期望伤害（按结算类型拆分；转属克/转属逆 转换到元素的部分计入元素）
            physicalDamage: physicalExpectedTriggerAllPart * expectedCritNoTriggerBase,
            elementDamage: elementExpectedTriggerAllPart * expectedCritNoTriggerBase,
        }
    }

    /**
     * 计算基础属性和伤害 (immutable)
     */
    public calculateByBasename(baseName: string): [attrs: ReturnType<typeof this.calculateWeaponAttributes>, damage: DamageResult] {
        const weapon = this.getWeaponBySkillName(baseName)
        const attrs = this.calculateWeaponAttributes(weapon)
        const damage: DamageResult = weapon ? this.calculateWeaponDamage(attrs, weapon) : this.calculateSkillDamage(attrs, baseName)
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
        const final = this.calculateTargetFunction(attrs, targetFunction)
        const floating = 1 + 0.1 * Math.random() - 0.05 // -0.05 ~ 0.05
        const defenseMultiplier = this.calculateDefenseMultiplier(attrs, undefined, (attrs.weapon?.暴击 || 0) === 0)
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
    public calculateTargetFunction(attrs?: ReturnType<typeof this.calculateWeaponAttributes>, targetFunction?: string): number {
        const astInput = targetFunction || this.targetFunction || "伤害"

        // 调用ast解析器解析目标函数表达式
        try {
            const result = this.evaluateAST(astInput, attrs)
            return result
        } catch (e) {
            console.error("计算目标函数时出错:", e)
            return 0
        }
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
                } else if (node.type === "temporary_attributes") {
                    collectIdentifiers(node.target)
                    for (const attribute of node.attributes) {
                        collectIdentifiers(attribute.value)
                    }
                }
            }
            collectIdentifiers(ast)
            return [...identifiers]
        } catch {}
        return []
    }
    /**
     * 验证AST表达式是否合法
     * @param astInput AST表达式字符串
     * @param knownIdentifiers 额外已知的标识符（如自定义函数的参数名）
     */
    validateAST(astInput: string, knownIdentifiers?: Set<string>): string | undefined {
        if (!astInput) return ""
        try {
            const ast = parseAST(astInput, CharBuild.macros)

            // 验证AST中的标识符是否存在
            const attrs = this.calculateWeaponAttributes()

            const weaponAttrs = this.getAllWeaponSkillsAttrs()
            const skillAttrs = new Map(this.allSkills.map(v => [v.safeName, v.getFieldsWithAttr(attrs)]))
            skillAttrs.set("E", skillAttrs.get(this.skills[0].safeName)!)
            skillAttrs.set("Q", skillAttrs.get(this.skills[1].safeName)!)
            skillAttrs.set("P", skillAttrs.get(this.skills[2].safeName)!)
            // 大小写别名：玩家常输入小写 e::/q::/p::
            skillAttrs.set("e", skillAttrs.get(this.skills[0].safeName)!)
            skillAttrs.set("q", skillAttrs.get(this.skills[1].safeName)!)
            skillAttrs.set("p", skillAttrs.get(this.skills[2].safeName)!)
            const customVariableNames = new Set(this.getValidCustomVariables().map(([key]) => key))
            const customFunctions = this.getValidCustomFunctions()
            // 已校验过函数体的自定义函数，避免递归定义导致死循环
            const validatedCustomFunctionBodies = new Set<string>()
            const getWeaponAttr = (fieldName: string, base?: string) =>
                weaponAttrs?.get(base || this.baseName)?.[fieldName as keyof WeaponAttr] || 0
            const getSkillAttr = (fieldName: string, base?: string) =>
                skillAttrs?.get(base || this.baseName)?.find(v => v.safeName.includes(fieldName))

            /**
             * 获取伤害字段实际使用的武器面板键。
             * @param fieldName 字段名
             * @param base 字段命名空间
             * @returns 武器面板键；非武器伤害字段返回 undefined
             */
            const getWeaponDamageBase = (fieldName: string, base?: string) => {
                const keywordBase = weaponDamageFieldBaseMap[fieldName as keyof typeof weaponDamageFieldBaseMap]
                if (keywordBase) return keywordBase
                const key = base || this.baseName
                if (!weaponAttrs.has(key)) return undefined
                if (["[攻击]", "[防御]", "[生命]"].includes(fieldName)) return key
                const field = getSkillAttr(fieldName, base)
                return field && (field.名称.endsWith("伤害") || field.名称.endsWith("伤害倍率")) ? key : undefined
            }

            /**
             * 从临时属性目标中提取被修饰的字段。
             * @param node 临时属性目标节点
             * @returns 被修饰的字段节点；无法提取时返回 undefined
             */
            const getTargetProperty = (node: ASTNode): Extract<ASTNode, { type: "property" }> | undefined => {
                if (node.type === "property") return node
                if (node.type === "member_access") return getTargetProperty(node.object)
                if (node.type === "temporary_attributes") return getTargetProperty(node.target)
                return undefined
            }

            // 递归验证AST节点
            const validateNode = (node: ASTNode): string | undefined => {
                switch (node.type) {
                    case "property": {
                        const fieldName = node.name
                        if (knownIdentifiers?.has(fieldName)) break
                        if (["[攻击]", "[防御]", "[生命]", "[近战]", "[远程]", "[同律]"].includes(fieldName)) break
                        if (!node.namespace && !node.forceAttr && customVariableNames.has(fieldName)) break
                        // ! 后缀强制按属性解析：技能字段不参与匹配
                        const isSkillField = node.forceAttr ? undefined : getSkillAttr(fieldName, node.namespace)
                        const isAttr = fieldName in attrs
                        const isWeaponAttr = getWeaponAttr(fieldName, node.namespace || "ranged")

                        if (!isSkillField && !isAttr && !isWeaponAttr) {
                            const ns = node.namespace ? `${node.namespace}::` : ""
                            return `找不到标识符: "${ns}${fieldName}"`
                        }
                        break
                    }
                    case "binary": {
                        const leftError = validateNode(node.left)
                        if (leftError) return leftError
                        const rightError = validateNode(node.right)
                        if (rightError) return rightError
                        break
                    }
                    case "unary": {
                        const unaryError = validateNode(node.argument)
                        if (unaryError) return unaryError
                        break
                    }
                    case "function": {
                        const isBuiltin = ["min", "max", "floor", "ceil", "or", "log", "power", "hp"].includes(node.name)
                        const customFunction = customFunctions.get(node.name)
                        if (!isBuiltin && !customFunction) return `未知函数: "${node.name}"`
                        if (customFunction && customFunction.params.length !== node.args.length)
                            return `函数 "${node.name}" 参数数量不符: 需要 ${customFunction.params.length} 个,实际传入 ${node.args.length} 个`
                        // 校验自定义函数体（参数视为已知标识符），递归定义只校验一次
                        if (customFunction && !validatedCustomFunctionBodies.has(node.name)) {
                            validatedCustomFunctionBodies.add(node.name)
                            const bodyError = this.validateAST(customFunction.expression, new Set(customFunction.params))
                            validatedCustomFunctionBodies.delete(node.name)
                            if (bodyError) return `函数 "${node.name}" 定义错误: ${bodyError}`
                        }
                        for (const arg of node.args) {
                            const argError = validateNode(arg)
                            if (argError) return argError
                        }
                        break
                    }
                    case "member_access": {
                        const memberError = validateNode(node.object)
                        if (memberError) return memberError
                        break
                    }
                    case "temporary_attributes": {
                        const targetError = validateNode(node.target)
                        if (targetError) return targetError
                        const targetProperty = getTargetProperty(node.target)
                        const weaponBase = targetProperty ? getWeaponDamageBase(targetProperty.name, targetProperty.namespace) : undefined
                        const temporaryWeaponAttrs = weaponBase ? weaponAttrs.get(weaponBase) : undefined
                        for (const attribute of node.attributes) {
                            const isWeaponAttribute = typeof temporaryWeaponAttrs?.[attribute.name as keyof WeaponAttr] === "number"
                            const isCharAttribute = typeof attrs[attribute.name as keyof typeof attrs] === "number"
                            if (!isWeaponAttribute && !isCharAttribute) {
                                return `找不到临时属性: "${attribute.name}"`
                            }
                            const valueError = validateNode(attribute.value)
                            if (valueError) return valueError
                        }
                        break
                    }
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
     * 解析自定义函数定义键，如 "fn(x)" 或 "fn(x, y)"。
     * @param key 定义键
     * @returns 函数名与参数列表；非函数定义返回 undefined
     */
    parseCustomFunctionDefinition(key: string): { name: string; params: string[] } | undefined {
        const trimmedKey = key.trim()
        const match = /^([a-zA-Z_\u4e00-\u9fa5·[][a-zA-Z0-9_\u4e00-\u9fa5·\]]*)\s*\(([^()]*)\)\s*$/.exec(trimmedKey)
        if (!match) return undefined
        const params = match[2]
            .split(",")
            .map(param => param.trim())
            .filter(Boolean)
        return { name: match[1], params }
    }

    /**
     * 验证自定义变量名称是否符合表达式标识符规则，支持函数定义（如 "fn(x, y)"）。
     * @param key 自定义变量名称
     * @returns 错误信息；合法时返回 undefined
     */
    validateCustomVariableKey(key: string): string | undefined {
        const trimmedKey = key.trim()
        if (!trimmedKey) return "变量名不能为空"
        if (trimmedKey.includes("::") || trimmedKey.includes(".")) return `变量名不支持命名空间或成员访问: "${trimmedKey}"`

        // 函数定义: fn(x, y)，函数名与参数名需合法且参数不重复
        const functionMatch = this.parseCustomFunctionDefinition(trimmedKey)
        if (functionMatch) {
            if (!/^[a-zA-Z_\u4e00-\u9fa5·[][a-zA-Z0-9_\u4e00-\u9fa5·\]]*$/.test(functionMatch.name)) return `变量名不合法: "${trimmedKey}"`
            const paramSet = new Set<string>()
            for (const param of functionMatch.params) {
                if (!/^[a-zA-Z_\u4e00-\u9fa5·][a-zA-Z0-9_\u4e00-\u9fa5·[\]]*$/.test(param)) return `函数参数不合法: "${param}"`
                if (paramSet.has(param)) return `函数参数重复: "${param}"`
                paramSet.add(param)
            }
            return undefined
        }

        if (!/^[a-zA-Z_\u4e00-\u9fa5·[][\]a-zA-Z0-9_\u4e00-\u9fa5·]*$/.test(trimmedKey)) return `变量名不合法: "${trimmedKey}"`

        try {
            const ast = parseAST(trimmedKey, CharBuild.macros)
            if (ast.type !== "property" || ast.name !== trimmedKey || ast.namespace) return `变量名不合法: "${trimmedKey}"`
        } catch (e: any) {
            return e.message || (e as string)
        }
        return undefined
    }

    /**
     * 验证单个自定义变量配置（函数定义额外校验函数体，参数视为已知标识符）。
     * @param key 自定义变量名称
     * @param value 自定义变量表达式
     * @returns 错误信息；合法时返回 undefined
     */
    validateCustomVariable(key: string, value: string): string | undefined {
        const keyError = this.validateCustomVariableKey(key)
        if (keyError) return keyError
        if (!value.trim()) return `变量 "${key.trim()}" 的表达式不能为空`
        const functionDefinition = this.parseCustomFunctionDefinition(key)
        if (functionDefinition) {
            return this.validateAST(value, new Set(functionDefinition.params))
        }
        return this.validateAST(value)
    }

    /**
     * 获取合法且非空的自定义变量配置（仅普通变量，函数定义排除在外）。
     * @returns 自定义变量键值对
     */
    private getValidCustomVariables() {
        return this.customVariables
            .map(([key, value]) => [key.trim(), value.trim()] as [string, string])
            .filter(([key, value]) => key && value && !this.validateCustomVariableKey(key) && !this.parseCustomFunctionDefinition(key))
    }

    /**
     * 获取合法且非空的自定义函数定义（如 "fn(x) = x*2"）。
     * @returns 函数名到定义的映射
     */
    private getValidCustomFunctions(): Map<string, { params: string[]; expression: string }> {
        const functions = new Map<string, { params: string[]; expression: string }>()
        for (const [key, value] of this.customVariables) {
            const trimmedKey = key.trim()
            const trimmedValue = value.trim()
            if (!trimmedKey || !trimmedValue) continue
            if (this.validateCustomVariableKey(trimmedKey)) continue
            const definition = this.parseCustomFunctionDefinition(trimmedKey)
            if (!definition) continue
            functions.set(definition.name, { params: definition.params, expression: trimmedValue })
        }
        return functions
    }

    /**
     * 计算自定义变量或自定义函数定义的示例结果。
     * 函数定义以参数示例值 (1, 2, 3...) 代入求值，用于界面预览。
     * @param key 定义键（函数定义形如 "fn(x, y)"）
     * @param value 定义表达式
     * @returns 计算结果；无法计算时返回 0
     */
    evaluateCustomVariableDefinition(key: string, value: string): number {
        const definition = this.parseCustomFunctionDefinition(key)
        if (!definition) return this.evaluateAST(value)
        const attrs = this.calculateWeaponAttributes()
        const scope = new Map<string, number>()
        definition.params.forEach((param, index) => scope.set(param, index + 1))
        return this.evaluateAST(value, attrs, undefined, undefined, scope)
    }

    /**
     * 解释AST表达式并计算结果
     * @param astInput AST表达式字符串
     * @param damage 伤害结果对象
     * @param attrs 武器属性对象
     * @param scope 函数调用时的参数作用域（参数名到值的映射）
     * @returns 计算结果
     */
    evaluateAST(
        astInput: string,
        inputattrs?: ReturnType<typeof this.calculateWeaponAttributes>,
        resolvingVariables = new Set<string>(),
        customVariableValueCache = new Map<string, number>(),
        scope = new Map<string, number>()
    ) {
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
        const attrs = inputattrs || this.calculateWeaponAttributes()
        const weaponsMap = this.getAllWeaponsByBase()
        const weaponAttrs = this.getAllWeaponSkillsAttrs()
        const selectedWeapon = this.selectedWeapon
        /**
         * 优先使用当前已计算出的武器属性，避免动态属性在AST求值时被基础映射覆盖。
         */
        const getCalculatedWeaponAttr = (base?: string) => {
            const key = base || this.baseName
            if (attrs.weapon && selectedWeapon && weaponsMap.get(key) === selectedWeapon) {
                return attrs.weapon
            }
            return weaponAttrs.get(key)
        }
        const skillAttrs = new Map(this.allSkills.map(v => [v.safeName, v.getFieldsWithAttr(attrs)]))
        skillAttrs.set("E", skillAttrs.get(this.skills[0].safeName)!)
        skillAttrs.set("Q", skillAttrs.get(this.skills[1].safeName)!)
        skillAttrs.set("P", skillAttrs.get(this.skills[2].safeName)!)
        // 大小写别名：玩家常输入小写 e::/q::/p::
        skillAttrs.set("e", skillAttrs.get(this.skills[0].safeName)!)
        skillAttrs.set("q", skillAttrs.get(this.skills[1].safeName)!)
        skillAttrs.set("p", skillAttrs.get(this.skills[2].safeName)!)
        const getWeaponAttr = (fieldName: string, base?: string) => getCalculatedWeaponAttr(base)?.[fieldName as keyof WeaponAttr] || 0
        const getSkillAttr = (fieldName: string, base?: string) =>
            skillAttrs?.get(base || this.baseName)?.find(v => v.safeName.includes(fieldName))
        type TemporaryAttributes = Record<string, number>
        /**
         * 获取武器伤害关键词对应的装备类型。
         * @param fieldName AST字段名
         * @returns 对应装备类型；普通字段返回 undefined
         */
        const getWeaponFieldBase = (fieldName?: string) =>
            fieldName ? weaponDamageFieldBaseMap[fieldName as keyof typeof weaponDamageFieldBaseMap] : undefined
        /**
         * 获取伤害字段实际使用的武器面板键。
         * @param base 字段命名空间
         * @param fieldName 字段名
         * @returns 武器面板键；非武器伤害字段返回 undefined
         */
        const getWeaponDamageBase = (base?: string, fieldName?: string) => {
            const keywordBase = getWeaponFieldBase(fieldName)
            if (keywordBase) return keywordBase
            const key = base || this.baseName
            if (!weaponsMap.has(key) || !fieldName) return undefined
            if (["[攻击]", "[防御]", "[生命]"].includes(fieldName)) return key
            const field = getSkillAttr(fieldName, base)
            return field && (field.名称.endsWith("伤害") || field.名称.endsWith("伤害倍率")) ? key : undefined
        }
        /**
         * 获取武器面板对应的实际基础武器，同律继承时返回被继承武器。
         * @param base 武器面板键
         * @returns 用于读取基础值的实际武器
         */
        const getEffectiveWeapon = (base: string) => {
            const weapon = weaponsMap.get(base)
            if (weapon instanceof LeveledSkillWeapon && weapon.inherit) {
                return weapon.inherit === "melee" ? this.meleeWeapon : this.rangedWeapon
            }
            return weapon
        }
        /**
         * 获取武器临时加成使用的基础值。
         * @param weapon 实际基础武器
         * @param attribute 武器面板属性名
         * @returns 对应基础值；无独立基础字段的属性以1为基准
         */
        const getWeaponAttributeBase = (weapon: LeveledWeapon | LeveledSkillWeapon, attribute: keyof WeaponAttr) => {
            const baseAttribute = weaponAttributeBaseMap[attribute as keyof typeof weaponAttributeBaseMap]
            if (!baseAttribute) return 1
            const baseValue = weapon[baseAttribute as keyof typeof weapon]
            return typeof baseValue === "number" ? baseValue : 0
        }
        /**
         * 生成当前武器伤害字段使用的临时武器面板。
         * @param base 字段命名空间
         * @param fieldName 字段名
         * @param temporaryAttributes 临时加成值
         * @returns 应用 y += base * x 后的武器面板
         */
        const getTemporaryWeaponAttr = (base?: string, fieldName?: string, temporaryAttributes?: TemporaryAttributes) => {
            const weaponBase = getWeaponDamageBase(base, fieldName)
            const weaponAttr = getCalculatedWeaponAttr(weaponBase || base)
            if (!weaponBase || !weaponAttr || !temporaryAttributes) return weaponAttr
            const weapon = getEffectiveWeapon(weaponBase)
            if (!weapon) return weaponAttr
            const fieldWeaponAttr = { ...weaponAttr }
            const writableWeaponAttr = fieldWeaponAttr as unknown as Record<string, number>
            for (const [attribute, value] of Object.entries(temporaryAttributes)) {
                const currentValue = weaponAttr[attribute as keyof WeaponAttr]
                if (typeof currentValue !== "number") continue
                writableWeaponAttr[attribute] = currentValue + getWeaponAttributeBase(weapon, attribute as keyof WeaponAttr) * value
            }
            return fieldWeaponAttr
        }
        /**
         * 获取当前字段使用的角色属性，并依次应用召唤物继承与字段临时属性。
         * @param base 字段所属技能或武器
         * @param temporaryAttributes 仅对当前字段生效的属性增量
         * @param fieldName 字段名
         * @returns 当前字段的独立属性上下文
         */
        const getSummonAttrs = (base?: string, temporaryAttributes?: TemporaryAttributes, fieldName?: string) => {
            const key = base || this.baseName
            const summonSkill = this.allSkills.find(skill => skill.名称 === key)
            // 召唤物属性继承判断：技能声明了召唤物，或字段名含「召唤物」（如「[召唤物·战车]技能伤害」，技能本身未声明召唤物元数据）
            const resolvedFieldName = fieldName
                ? summonSkill?.字段.find(f => f.safeName.includes(fieldName) || f.名称.includes(fieldName))?.名称 || fieldName
                : undefined
            const isSummonField = !!summonSkill?.召唤物 || !!resolvedFieldName?.includes("召唤物")
            const summonRatio = isSummonField ? attrs.召唤物属性继承比例 : 1
            const currentAttrs =
                summonRatio === 1
                    ? attrs
                    : {
                          ...attrs,
                          攻击: attrs.攻击 * summonRatio,
                          昂扬: attrs.昂扬 * summonRatio,
                          背水: attrs.背水 * summonRatio,
                      }
            if (!temporaryAttributes) return currentAttrs
            const fieldAttrs = { ...currentAttrs }
            const writableAttrs = fieldAttrs as unknown as Record<string, number>
            const temporaryWeaponAttr = getTemporaryWeaponAttr(base, fieldName, temporaryAttributes)
            for (const [attribute, value] of Object.entries(temporaryAttributes)) {
                if (getWeaponDamageBase(base, fieldName) && typeof temporaryWeaponAttr?.[attribute as keyof WeaponAttr] === "number")
                    continue
                if (typeof attrs[attribute as keyof typeof attrs] !== "number") throw new Error(`找不到临时属性: "${attribute}"`)
                writableAttrs[attribute] = (writableAttrs[attribute] || 0) + value
            }
            return fieldAttrs
        }
        const isDamageSkillField = (fieldName: string, base?: string) => {
            if (["[攻击]", "[防御]", "[生命]"].includes(fieldName) || getWeaponFieldBase(fieldName)) return true
            const field = getSkillAttr(fieldName, base)
            return !!field && (field.名称.endsWith("伤害") || field.名称.endsWith("伤害倍率"))
        }
        const damageCache = new Map<string, DamageResult>()
        const getWeaponAttackTypeBonus = (base: string | undefined, fieldName: string | undefined, attribute: "增伤" | "独立增伤") => {
            const key = base || this.baseName
            const weapon = weaponsMap.get(key) || this.selectedWeapon || this.meleeWeapon
            return this.getWeaponAttackTypeBonus(weapon.类型, key, fieldName, attribute, weapon)
        }
        const getDamage = (base?: string, fieldName?: string, temporaryAttributes?: TemporaryAttributes) => {
            const weaponFieldBase = getWeaponFieldBase(fieldName)
            const key = weaponFieldBase || base || this.baseName
            const cacheKey = fieldName ? `${key}::${fieldName}` : key
            if (!temporaryAttributes && damageCache.has(cacheKey)) return damageCache.get(cacheKey)!
            const weapon = weaponsMap.get(key)
            const weaponAttr = getTemporaryWeaponAttr(key, fieldName, temporaryAttributes)
            const skillAttrsContext = getSummonAttrs(key, temporaryAttributes, fieldName)
            const fieldDamageType = fieldName ? getSkillAttr(fieldName, base)?.伤害类型 : undefined
            const attackTypeDamageBonus = getWeaponAttackTypeBonus(key, fieldName, "增伤")
            const attackTypeIndependentDamageBonus = getWeaponAttackTypeBonus(key, fieldName, "独立增伤")
            const damage =
                weapon && weaponAttr
                    ? this.calculateWeaponDamage(
                          {
                              ...(temporaryAttributes ? skillAttrsContext : attrs),
                              weapon: {
                                  ...weaponAttr,
                                  增伤: weaponAttr.增伤 + attackTypeDamageBonus,
                                  独立增伤: (1 + weaponAttr.独立增伤) * (1 + attackTypeIndependentDamageBonus) - 1,
                              },
                          },
                          weapon,
                          fieldDamageType
                      )
                    : this.calculateSkillDamage(
                          {
                              ...skillAttrsContext,
                              增伤: skillAttrsContext.增伤 + attackTypeDamageBonus,
                              独立增伤: (1 + skillAttrsContext.独立增伤) * (1 + attackTypeIndependentDamageBonus) - 1,
                          },
                          base,
                          fieldName
                      )
            if (!temporaryAttributes) damageCache.set(cacheKey, damage)
            return damage
        }
        const defCache = new Map<boolean, number>()
        const getDef = (base?: string, fieldName?: string, temporaryAttributes?: TemporaryAttributes) => {
            const key = base || this.baseName
            const isWeapon = !!(weaponsMap.get(key) && getCalculatedWeaponAttr(base))
            if (!temporaryAttributes && defCache.has(isWeapon)) return defCache.get(isWeapon)!
            const def = this.calculateDefenseMultiplier(
                temporaryAttributes ? getSummonAttrs(key, temporaryAttributes, fieldName) : attrs,
                undefined,
                !isWeapon
            )
            if (!temporaryAttributes) defCache.set(isWeapon, def)
            return def
        }
        /**
         * 解析并计算技能表达式，如 "{%}×3+{%}"
         * @param format 表达式格式字符串
         * @param value1 第一个值（按出现顺序）
         * @param value2 第二个值（按出现顺序）
         * @param baseValue 基础属性值（用于 {%} 占位符的乘法）
         * @returns 计算结果
         */
        const evaluateExpression = (format: string, value1: number, value2: number = 0, baseValue: number = 0): number => {
            // 使用统一计数器和单个正则表达式处理所有占位符
            let count = 0

            // 匹配 {%} 或 {}
            let expr = format.replace(/\{%\}|\{\}/g, match => {
                count++
                const value = count % 2 === 1 ? value1 : value2

                // 根据占位符类型决定是否乘以 baseValue
                if (match === "{%}") {
                    return `(${value} * ${baseValue})`
                } else {
                    return value.toString()
                }
            })

            // 替换 × 为 * 以便计算
            expr = expr.replace(/×/g, "*")

            try {
                const formatAst = parseAST(expr, CharBuild.macros)
                const result = evaluate(formatAst)
                return Number.isNaN(result) ? value1 * baseValue : result
            } catch {
                try {
                    // 使用 Function 构造函数安全计算表达式
                    // 只允许基本算术运算
                    const safeExpr = expr.replace(/[^0-9+\-*/.()\s]/g, "")
                    const result = new Function(`return ${safeExpr}`)()
                    return Number.isNaN(result) ? value1 * baseValue : result
                } catch {
                    // 如果解析失败，返回 value1 * baseValue
                    return value1 * baseValue
                }
            }
        }

        const customVariableExpressions = new Map(this.getValidCustomVariables())
        const evaluateCustomVariable = (fieldName: string) => {
            const expression = customVariableExpressions.get(fieldName)
            if (!expression) return undefined
            if (customVariableValueCache.has(fieldName)) return customVariableValueCache.get(fieldName)!
            if (resolvingVariables.has(fieldName)) return 0

            resolvingVariables.add(fieldName)
            const value = this.evaluateAST(expression, attrs, resolvingVariables, customVariableValueCache)
            resolvingVariables.delete(fieldName)
            const safeValue = Number.isFinite(value) ? value : 0
            customVariableValueCache.set(fieldName, safeValue)
            return safeValue
        }

        const customFunctionDefinitions = this.getValidCustomFunctions()
        const functionBodyAstCache = new Map<string, ASTNode>()
        const resolvingFunctions = new Set<string>()
        /**
         * 求值自定义函数调用：将实参绑定到形参后求值函数体。
         * @param name 函数名
         * @param args 已求值的实参
         * @param currentScope 调用处的参数作用域
         * @returns 计算结果；未找到定义时返回 undefined
         */
        const evaluateCustomFunction = (name: string, args: number[], currentScope: Map<string, number>): number | undefined => {
            const definition = customFunctionDefinitions.get(name)
            if (!definition) return undefined
            if (definition.params.length !== args.length) {
                throw new Error(`函数 "${name}" 需要 ${definition.params.length} 个参数,实际传入 ${args.length} 个`)
            }
            if (resolvingFunctions.has(name)) return 0 // 检测到递归调用，返回 0 避免死循环
            let bodyAst = functionBodyAstCache.get(definition.expression)
            if (!bodyAst) {
                bodyAst = parseAST(definition.expression, CharBuild.macros)
                functionBodyAstCache.set(definition.expression, bodyAst)
            }
            const nextScope = new Map(currentScope)
            definition.params.forEach((param, index) => nextScope.set(param, args[index]))
            resolvingFunctions.add(name)
            try {
                return evaluate(bodyAst, undefined, nextScope)
            } finally {
                resolvingFunctions.delete(name)
            }
        }

        /**
         * 解析标识符值。! 后缀（forceAttr）强制按属性解析：跳过技能字段与自定义变量的匹配，
         * 只从武器属性/角色属性中取值，解决含特定字符的技能字段挤占属性查询的问题。
         * @param fieldName 字段名
         * @param ns 命名空间
         * @param temporaryAttributes 临时属性
         * @param forceAttr 是否强制按属性值解析
         * @param currentScope 函数参数作用域
         * @returns 解析结果
         */
        const evaluateIdentity = (
            fieldName: string,
            ns?: string,
            temporaryAttributes?: TemporaryAttributes,
            forceAttr = false,
            currentScope?: Map<string, number>
        ) => {
            if (!ns && !forceAttr && currentScope?.has(fieldName)) return currentScope.get(fieldName)!
            if (!forceAttr && !ns) {
                const customValue = evaluateCustomVariable(fieldName)
                if (customValue !== undefined) return customValue
            }
            if (ns)
                return (
                    (forceAttr ? 0 : evaluateSkill(fieldName, ns, temporaryAttributes)) ||
                    evaluateWeaponAttr(fieldName, ns) ||
                    evaluateAttr(fieldName, ns, temporaryAttributes) ||
                    0
                )
            else
                return (
                    (forceAttr ? 0 : evaluateSkill(fieldName, ns, temporaryAttributes)) ||
                    evaluateAttr(fieldName, ns, temporaryAttributes) ||
                    evaluateWeaponAttr(fieldName, ns) ||
                    0
                )
        }

        function evaluateMember(memberName?: string, ns?: string, fieldName?: string, temporaryAttributes?: TemporaryAttributes) {
            const damage = getDamage(ns, fieldName, temporaryAttributes)
            // 无成员访问（裸伤害字段）：返回完整期望伤害乘区（默认伤害系数）
            if (!memberName) return damage.expectedDamage
            memberName = memberName?.replace(/非|低/g, "未")
            if (memberName === "N") return damage.noHpDamage
            if (memberName === "物理") return damage.physicalDamage ?? 0
            if (memberName === "元素") return damage.elementDamage ?? damage.expectedDamage
            if (memberName === "暴击") return damage.higherCritExpectedTrigger || damage.expectedDamage
            if (memberName === "未暴击") return damage.lowerCritExpectedTrigger || damage.expectedDamage
            if (memberName === "触发") return damage.expectedCritTrigger || damage.expectedDamage
            if (memberName === "未触发") return damage.expectedCritNoTrigger || damage.expectedDamage
            if (memberName === "暴击触发" || memberName === "触发暴击") return damage.higherCritTrigger || damage.expectedDamage
            if (memberName === "未触发暴击" || memberName === "暴击未触发") return damage.higherCritNoTrigger || damage.expectedDamage
            if (memberName === "触发未暴击" || memberName === "未暴击触发") return damage.lowerCritTrigger || damage.expectedDamage
            if (memberName === "未暴击未触发" || memberName === "未触发未暴击") return damage.lowerCritNoTrigger || damage.expectedDamage
            return 0 // 找不到成员默认0
        }

        /**
         * 计算技能值
         * @param fieldName 技能字段名
         * @param ns 命名空间
         * @returns 计算结果
         */
        function evaluateSkill(fieldName: string, ns?: string, temporaryAttributes?: TemporaryAttributes) {
            const weaponFieldBase = getWeaponFieldBase(fieldName)
            const fieldBase = weaponFieldBase || ns
            const currentAttrs = getSummonAttrs(fieldBase, temporaryAttributes, fieldName)
            if (weaponFieldBase) {
                if (!weaponsMap.has(weaponFieldBase)) return 0
                const fieldWeaponAttr = getTemporaryWeaponAttr(weaponFieldBase, fieldName, temporaryAttributes)
                return (currentAttrs.攻击 + (fieldWeaponAttr?.攻击 || 0)) * getDef(weaponFieldBase, fieldName, temporaryAttributes)
            }
            if (fieldName === "[攻击]") {
                const fieldWeaponAttr = getTemporaryWeaponAttr(ns, fieldName, temporaryAttributes)
                return (currentAttrs.攻击 + (fieldWeaponAttr?.攻击 || 0)) * getDef(ns, fieldName, temporaryAttributes)
            } else if (fieldName === "[防御]") return currentAttrs.防御 * getDef(ns, fieldName, temporaryAttributes)
            else if (fieldName === "[生命]") return currentAttrs.生命 * getDef(ns, fieldName, temporaryAttributes)
            const field = getSkillAttr(fieldName, ns)

            if (!field) return 0
            // 计算技能基础伤害
            if (field.名称.endsWith("伤害") || field.名称.endsWith("治疗")) {
                let baseDamage = 0
                const value1 = field.值
                const value2 = field.值2 || 0

                // 计算基础属性值
                let baseValue = 0
                if (!field.基础) {
                    const patk = getTemporaryWeaponAttr(ns, fieldName, temporaryAttributes)?.攻击 || 0
                    baseValue = currentAttrs.攻击 + patk
                } else if (field.基础 === "生命") {
                    baseValue = currentAttrs.生命
                } else if (field.基础 === "防御") {
                    baseValue = currentAttrs.防御
                }

                // 解析并计算表达式
                if (typeof field.格式 === "string") {
                    // 使用格式字符串和两个值计算
                    baseDamage = evaluateExpression(field.格式, value1, value2, baseValue)
                } else {
                    // 传统方式计算
                    baseDamage = value1 * baseValue + value2
                }

                if (field.名称.endsWith("治疗"))
                    return baseDamage // 治疗不考虑防御
                else return baseDamage * getDef(ns, fieldName, temporaryAttributes)
            }
            return typeof field.值 === "number" ? field.值 : 0
        }
        function evaluateAttr(fieldName: string, ns?: string, temporaryAttributes?: TemporaryAttributes) {
            const currentAttrs = temporaryAttributes ? getSummonAttrs(ns, temporaryAttributes, fieldName) : attrs
            return fieldName in currentAttrs ? (currentAttrs[fieldName as keyof CharAttr] ?? 0) : 0
        }
        function evaluateWeaponAttr(fieldName: string, ns?: string) {
            if (fieldName === "武器攻击") fieldName = "攻击"
            return getWeaponAttr(fieldName, ns)
        }
        /**
         * 合并字段后缀声明的临时属性，同名属性按增量累加。
         * @param attributes AST中的临时属性声明
         * @param inheritedAttributes 外层已经生效的临时属性
         * @returns 合并后的临时属性
         */
        const mergeTemporaryAttributes = (
            attributes: Extract<ASTNode, { type: "temporary_attributes" }>["attributes"],
            inheritedAttributes?: TemporaryAttributes,
            currentScope?: Map<string, number>
        ) => {
            const mergedAttributes = { ...inheritedAttributes }
            for (const attribute of attributes) {
                mergedAttributes[attribute.name] =
                    (mergedAttributes[attribute.name] || 0) + evaluate(attribute.value, inheritedAttributes, currentScope)
            }
            return mergedAttributes
        }
        /**
         * 从成员访问对象中提取原始字段及其临时属性。
         * @param node 成员访问的对象节点
         * @param temporaryAttributes 外层已经生效的临时属性
         * @param currentScope 函数参数作用域
         * @returns 字段节点与合并后的临时属性；非字段对象返回 undefined
         */
        const getPropertyContext = (
            node: ASTNode,
            temporaryAttributes?: TemporaryAttributes,
            currentScope?: Map<string, number>
        ): { property: Extract<ASTNode, { type: "property" }>; temporaryAttributes?: TemporaryAttributes } | undefined => {
            if (node.type === "property") return { property: node, temporaryAttributes }
            if (node.type !== "temporary_attributes") return undefined
            return getPropertyContext(
                node.target,
                mergeTemporaryAttributes(node.attributes, temporaryAttributes, currentScope),
                currentScope
            )
        }
        // AST求值函数
        const evaluate = (node: ASTNode, temporaryAttributes?: TemporaryAttributes, currentScope?: Map<string, number>): number => {
            switch (node.type) {
                case "number":
                    return node.value

                case "binary": {
                    const left = evaluate(node.left, temporaryAttributes, currentScope)
                    const right = evaluate(node.right, temporaryAttributes, currentScope)
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
                    const argument = evaluate(node.argument, temporaryAttributes, currentScope)
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
                    // 函数参数：直接返回绑定值，不参与伤害乘区
                    if (!node.namespace && !node.forceAttr && currentScope?.has(node.name)) return currentScope.get(node.name)!
                    const value = evaluateIdentity(node.name, node.namespace, temporaryAttributes, node.forceAttr, currentScope)
                    if (!node.forceAttr) {
                        if (!node.namespace && customVariableExpressions.has(node.name)) return value
                        // 只有真正的伤害字段才需要乘以默认的伤害系数
                        const skillValue = evaluateSkill(node.name, node.namespace, temporaryAttributes)
                        if (skillValue && isDamageSkillField(node.name, node.namespace)) {
                            return value * evaluateMember(undefined, node.namespace, node.name, temporaryAttributes)
                        }
                    }
                    return value
                }

                case "function": {
                    const args = node.args.map(arg => evaluate(arg, temporaryAttributes, currentScope))
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
                            return args.find(v => v !== 0) ?? args[args.length - 1]
                        case "log":
                            return Math.log(args[0])
                        case "power":
                            return args[0] ** args[1]
                        case "hp":
                            return this.calculateDesperateMultiplier(attrs, args[0]) * this.calculateBoostMultiplier(attrs, args[0])
                        default:
                            break
                    }
                    const customFunctionValue = evaluateCustomFunction(node.name, args, currentScope || new Map())
                    if (customFunctionValue !== undefined) return customFunctionValue
                    throw new Error(`未知的函数: ${node.name}`)
                }

                case "member_access": {
                    // 对于成员访问，object部分不应该乘以默认伤害系数
                    // 所以我们需要重新计算object，但跳过默认伤害系数的乘法
                    const objectNode = node.object
                    const propertyContext = getPropertyContext(objectNode, temporaryAttributes, currentScope)

                    // 如果object是property节点，直接调用evaluateIdentity而不乘以evaluateMember()
                    let objectValue: number
                    if (propertyContext) {
                        objectValue = evaluateIdentity(
                            propertyContext.property.name,
                            propertyContext.property.namespace,
                            propertyContext.temporaryAttributes,
                            propertyContext.property.forceAttr,
                            currentScope
                        )
                    } else {
                        objectValue = evaluate(objectNode, temporaryAttributes, currentScope)
                    }

                    const memberName = node.property
                    if (
                        propertyContext &&
                        (propertyContext.property.forceAttr ||
                            !isDamageSkillField(propertyContext.property.name, propertyContext.property.namespace))
                    ) {
                        return objectValue
                    }
                    // 成员访问用于修改伤害计算方式
                    return (
                        objectValue *
                        evaluateMember(
                            memberName,
                            propertyContext?.property.namespace,
                            propertyContext?.property.name,
                            propertyContext?.temporaryAttributes
                        )
                    )
                }

                case "temporary_attributes":
                    return evaluate(node.target, mergeTemporaryAttributes(node.attributes, temporaryAttributes, currentScope), currentScope)

                default:
                    throw new Error(`未知的AST节点类型: ${(node as ASTNode).type}`)
            }
        }

        return evaluate(ast, undefined, scope)
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
        const bt = this.baseName
        const skill = this.allSkills.find(s => s.名称 === bt)
        return skill
    }

    get selectedSkillKey() {
        const bt = this.baseName
        const index = this.skills.findIndex(s => s.名称 === bt)
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
        return mod.checkCondition(attrs, this.charModsWithAura, this.getConditionValues())
    }

    get isSkill() {
        return this.selectedSkillType === "角色"
    }
    get isMeleeWeapon() {
        return this.meleeWeaponSkills.some(skill => skill.名称 === this.baseName)
    }
    get isRangedWeapon() {
        return this.rangedWeaponSkills.some(skill => skill.名称 === this.baseName)
    }
    get isSkillWeapon() {
        return (
            this.skillWeaponSkills.some(skill => skill.名称 === this.baseName) ||
            !!(this.skillWeapon && this.skillWeapon.名称 === this.baseName)
        )
    }
    get is_melee() {
        return this.isMeleeWeapon
    }
    get is_ranged() {
        return this.isRangedWeapon
    }
    get is_skill() {
        return this.isSkillWeapon
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
        // 计算目标函数
        const final = this.calculateTargetFunction(attrs)
        let finalDamage = 0
        // 计算防御乘区
        if (final > 0) {
            if (this.enemy.currentShield > 0) {
                if (final >= this.enemy.currentShield) {
                    const over = final - this.enemy.currentShield // 超过护盾的伤害
                    this.enemy.currentShield = 0
                    const after = this.calculateTargetFunction(attrs) // 重新计算一次生命值伤害
                    const radio = after / final // 计算生命值减伤率
                    const hpDmg = over * radio // 减伤率*超过护盾的伤害
                    this.enemy.currentHP -= hpDmg
                    finalDamage = this.enemy.currentShield + hpDmg // 护盾伤害+生命值伤害
                } else {
                    finalDamage = final
                    this.enemy.currentShield -= final
                }
            } else {
                finalDamage = final
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
        const timeline = this.timeline
        if (!timeline) {
            return this.calculateOneTime()
        }

        let totalDamage = 0
        const buffItems = timeline.items
            .filter(i => i.lv)
            .map(i => {
                if (!i.buff) {
                    throw new Error(`时间线 BUFF "${i.name}" 缺少预构建实例`)
                }
                return { ...i, buff: i.buff }
            })
        const skillItems = timeline.items.filter(i => !i.lv)
        const skillLayers = groupBy(skillItems, i => i.track)
        const skillLayerKeys = Object.keys(skillLayers).map(Number).sort()

        function getBuffsAtTime(time: number, track: number) {
            // 查找当前轨道及后续轨道的 buff, 但不能超过下一层技能的轨道
            const maxTrack = skillLayerKeys.find(t => t > track) || Infinity
            return buffItems
                .filter(i => i.time <= time && i.time + i.duration >= time && i.track >= track && i.track < maxTrack)
                .map(i => i.buff)
        }

        // 根据时间和hp数据计算当前生命值百分比
        function getHpPercentAtTime(time: number, hpData: [number, number][]): number {
            if (!hpData || hpData.length === 0) {
                return 0
            }

            // 处理时间超出范围的情况
            if (time <= hpData[0][0]) {
                return hpData[0][1]
            }
            if (time >= hpData[hpData.length - 1][0]) {
                return hpData[hpData.length - 1][1]
            }

            // 找到时间所在的区间
            for (let i = 0; i < hpData.length - 1; i++) {
                const [time1, hp1] = hpData[i]
                const [time2, hp2] = hpData[i + 1]

                if (time >= time1 && time <= time2) {
                    // 线性插值计算当前hp值
                    const ratio = (time - time1) / (time2 - time1)
                    return hp1 + (hp2 - hp1) * ratio
                }
            }

            return 0
        }

        const initHpPercent = this.hpPercent
        const initBaseName = this.baseName
        skillItems.forEach(i => {
            // 根据时间计算当前hpPercent
            if (timeline.hp?.length > 0) {
                this.hpPercent = getHpPercentAtTime(i.time, timeline.hp)
            }

            const buffs = getBuffsAtTime(i.time, i.track)
            const build = buffs.length ? this.clone().applyBuffs(buffs) : this
            build.baseWithTarget = i.name
            const attrs = build.calculateWeaponAttributes()
            const damage = build.calculateOneTime(attrs)
            totalDamage += damage
            // 召唤物
            const summon = build.selectedSkill?.召唤物
            if (summon) {
                const newAttr = build.calculateWeaponAttributes(build.meleeWeapon)
                const summonAttrs = build.selectedSkill.getFieldsWithAttr(newAttr)
                const duration = Math.min(summonAttrs.find(a => a.名称 === "召唤物持续时间")?.值 || 0, i.duration)
                const delay = summonAttrs.find(a => a.名称 === "召唤物攻击延迟")?.值 || 0
                const interval = summonAttrs.find(a => a.名称 === "召唤物攻击间隔")?.值 || 0
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
        this.hpPercent = initHpPercent
        this.baseName = initBaseName
        if (this.timelineDPS) {
            totalDamage /= timeline.totalTime
        }
        return totalDamage
    }
    charModsExclusiveSeries = new Set<string>()
    meleeModsExclusiveSeries = new Set<string>()
    rangedModsExclusiveSeries = new Set<string>()
    skillModsExclusiveSeries = new Set<string>()
    charModsExclusiveNames = new Set<string>()
    meleeModsExclusiveNames = new Set<string>()
    rangedModsExclusiveNames = new Set<string>()
    skillModsExclusiveNames = new Set<string>()
    public applyMods(mods: LeveledMod[]) {
        const keys = ["charMods", "meleeMods", "rangedMods", "skillMods"] as const
        const toAddMods = {
            charMods: mods.filter(v => v.attrType === "角色"),
            meleeMods: mods.filter(v => v.attrType === "近战"),
            rangedMods: mods.filter(v => v.attrType === "远程"),
            skillMods: mods.filter(v => v.attrType.startsWith("同律")),
        }
        // 处理互斥逻辑
        keys.forEach(key => {
            for (const mod of toAddMods[key]) {
                // 记录互斥系列
                if (CharBuild.exclusiveSeries.includes(mod.系列)) {
                    if (!this[`${key}ExclusiveSeries`].has(mod.系列)) {
                        mod.excludeSeries.forEach(series => this[`${key}ExclusiveSeries`].add(series))
                    }
                }
                if (mod.系列 !== "契约者") {
                    // 记录非契约者MOD名称（用于名称互斥）
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
        const keys = ["charMods", "meleeMods", "rangedMods", "skillMods"] as const
        const toAddMods = {
            charMods: mods.filter(v => v.attrType === "角色"),
            meleeMods: mods.filter(v => v.attrType === "近战"),
            rangedMods: mods.filter(v => v.attrType === "远程"),
            skillMods: mods.filter(v => v.attrType.startsWith("同律")),
        }
        keys.forEach(key => {
            for (const mod of toAddMods[key]) {
                const index = this[key].findIndex(m => m?.equals(mod))
                if (index !== -1) {
                    this[key] = this[key].splice(index, 1)
                    // 移除互斥系列
                    mod.excludeSeries.forEach(series => this[`${key}ExclusiveSeries`].delete(series))
                    // 移除互斥名称
                    this[`${key}ExclusiveNames`].delete(mod.名称)
                }
            }
        })
        return this
    }

    public applyBuffs(buffs: LeveledBuff[]) {
        // 取交集 然后对已存在的BUFF进行level+1
        const existingNames = new Set(this.buffs.map(b => b.名称))
        const names = new Set(buffs.map(b => b.名称))
        this.buffs.push(...buffs.filter(b => !names.has(b.名称)))
        // 对已存在的BUFF进行level+1
        this.buffs.forEach(b => {
            if (existingNames.has(b.名称)) {
                b.等级++
            }
        })
        return this
    }

    public removeBuffs(buffs: LeveledBuff[] | string[]) {
        if (!buffs.length) return this
        const names = new Set(typeof buffs[0] === "string" ? (buffs as string[]) : (buffs as LeveledBuff[]).map(b => b.名称))
        this.buffs = this.buffs.filter(b => !names.has(b.名称))
        // 复合BUFF（如「艾达4溯」）同一实例同时位于code槽位，需一并移除
        this.dynamicBuffs = this.dynamicBuffs.filter(b => !names.has(b.名称))
        return this
    }

    /**
     * 将BUFF加入对应生效槽位：复合BUFF（同时含code与普通属性）同时进入普通槽位与code槽位。
     * @param buff 目标BUFF
     */
    public pushBuffToSlots(buff: LeveledBuff) {
        if (buff.code) this.dynamicBuffs.push(buff)
        if (!buff.code || buff.properties.length > 0) this.buffs.push(buff)
    }

    /**
     * 按实例引用从对应生效槽位移除BUFF（复合BUFF同一实例可能同时位于两个槽位）。
     * @param buff 目标BUFF
     */
    public removeBuffFromSlots(buff: LeveledBuff) {
        const dynamicIndex = this.dynamicBuffs.indexOf(buff)
        if (dynamicIndex !== -1) this.dynamicBuffs.splice(dynamicIndex, 1)
        const normalIndex = this.buffs.indexOf(buff)
        if (normalIndex !== -1) this.buffs.splice(normalIndex, 1)
    }
    /** 收益计算用的临时槽位 平时不应该有任何值 */
    tempMod: LeveledMod | null = null
    /**
     * 计算单属性收益（加上属性值）
     * @param props 武器、模组或 buff
     * @returns 单属性值
     */
    public calcIncome(props: AbstractMod | LeveledBuff, minus = false): number {
        if (props instanceof LeveledBuff && props.attr) {
            props = this.prepareBuff(props)
        }
        if (minus) {
            let mval = 0
            if (props instanceof LeveledBuff) {
                if (props.code) {
                    // 复合BUFF需同时从普通槽位与code槽位移除（如「艾达4溯」的召唤物攻击速度+code部分）
                    this.buffs = this.buffs.filter(b => b.名称 !== props.名称)
                    this.dynamicBuffs = this.dynamicBuffs.filter(b => b.名称 !== props.名称)
                    mval = this.calculate()
                    this.pushBuffToSlots(props)
                } else if (props.attr) {
                    return this.calcEquippedBuffIncome(props)
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
            if (
                props instanceof LeveledWeapon &&
                props.类型 === "近战" &&
                (this.isMeleeWeapon || (this.isSkillWeapon && this.skillWeapon!.inherit === "melee"))
            ) {
                const temp = this.meleeWeapon
                this.meleeWeapon = props
                this.syncWeaponForgeEffective()
                mval = this.calculate()
                this.meleeWeapon = temp
                this.syncWeaponForgeEffective()
            } else if (
                props instanceof LeveledWeapon &&
                props.类型 === "远程" &&
                (this.isRangedWeapon || (this.isSkillWeapon && this.skillWeapon!.inherit === "ranged"))
            ) {
                const temp = this.rangedWeapon
                this.rangedWeapon = props
                this.syncWeaponForgeEffective()
                mval = this.calculate()
                this.rangedWeapon = temp
                this.syncWeaponForgeEffective()
            } else if (props instanceof LeveledBuff) {
                if (props.code) {
                    // 复合BUFF需同时进入普通槽位与code槽位
                    this.pushBuffToSlots(props)
                    mval = this.calculate()
                    this.removeBuffFromSlots(props)
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

    /**
     * 精确计算已装备BUFF的边际收益。
     * @param buff 目标BUFF
     * @returns 移除该BUFF后的边际收益
     */
    public calcEquippedBuffIncome(buff: LeveledBuff) {
        const baseValue = this.calculate()
        const copyBuild = this.clone()
        copyBuild.buffs = copyBuild.buffs.filter(item => item.名称 !== buff.名称)
        copyBuild.dynamicBuffs = copyBuild.dynamicBuffs.filter(item => item.名称 !== buff.名称)
        const withoutValue = copyBuild.calculate()
        if (Math.abs(withoutValue) < Number.EPSILON) return 0
        return baseValue / withoutValue - 1
    }

    /**
     * 精确计算已装备魔之楔的边际收益。
     * 通过克隆当前构筑并真实移除指定槽位后重算，避免 `minusAttr`
     * 在条件联动、乘区耦合或属性上限场景下出现负值误判。
     * @param type 魔之楔槽位类型
     * @param index 槽位索引
     * @returns 移除该槽位后的边际收益
     */
    public calcEquippedModIncome(type: string, index: number): number {
        let resolvedType = type
        if (resolvedType === "同律" && this.skillWeapon?.inherit) {
            resolvedType = this.skillWeapon.inherit === "melee" ? "近战" : "远程"
        }

        const baseValue = this.calculate()
        const copyBuild = this.clone()

        /**
         * 按槽位类型移除克隆构筑中的对应魔之楔。
         */
        switch (resolvedType) {
            case "角色":
                copyBuild.charMods[index] = null
                break
            case "近战":
                copyBuild.meleeMods[index] = null
                break
            case "远程":
                copyBuild.rangedMods[index] = null
                break
            case "同律":
                copyBuild.skillMods[index] = null
                break
            default:
                return 0
        }

        const removedValue = copyBuild.calculate()
        if (!removedValue) {
            return 0
        }
        // console.log(JSON.stringify(this), JSON.stringify(copyBuild))
        return baseValue / removedValue - 1
    }

    clone() {
        const cloned = new CharBuild({
            char: this.char.clone(),
            hpPercent: this.hpPercent,
            resonanceGain: this.resonanceGain,
            imbalance: this.imbalance,
            auraMod: this.auraMod ? this.auraMod.clone() : undefined,
            charMods: this.charMods.map(m => (m ? m.clone() : null)),
            meleeMods: this.meleeMods.map(m => (m ? m.clone() : null)),
            rangedMods: this.rangedMods.map(m => (m ? m.clone() : null)),
            skillMods: this.skillMods.map(m => (m ? m.clone() : null)),
            // 复合BUFF同一实例同时位于普通槽位与code槽位，按引用去重后再克隆，避免重复生效
            buffs: [...new Set([...this.buffs, ...this.dynamicBuffs])].map(b => b.clone()),
            melee: this.meleeWeapon.clone(),
            ranged: this.rangedWeapon.clone(),
            baseName: this.baseName,
            enemyId: this.enemyId,
            enemy: this.enemy.clone(),
            enemyLevel: this.enemyLevel,
            enemyResistance: this.enemyResistance,
            targetFunction: this.targetFunction,
            customVariables: this.customVariables.map(variable => [...variable] as [string, string]),
            skillLevel: this.skills[0].等级,
            timeline: this.timeline,
            timelineDPS: this.timelineDPS,
            teamWeaponCategories: [...this.teamWeaponCategories],
        })
        return cloned
    }
    getMods(charTab: string) {
        if (charTab === "同律" && this.skillWeapon?.inherit) {
            charTab = this.skillWeapon.inherit === "melee" ? "近战" : "远程"
        }
        if (charTab === "角色") {
            return [...this.charMods, this.auraMod]
        } else if (charTab === "近战") {
            return this.meleeMods
        } else if (charTab === "远程") {
            return this.rangedMods
        } else if (charTab === "同律") {
            return this.skillMods
        }
        return []
    }
    /**
     * 计算给定MOD集合在指定上限下需要极化的槽位索引（半价削减耐受）。
     * 按耐受从高到低半价直至不超过上限；0耐受/空槽位不参与。
     * @param mods MOD集合（角色类型末尾可为光环MOD（undefined/null），可被极化）
     * @param cap 耐受上限
     * @returns 需要极化的槽位索引（0 起）
     */
    private calcPolarizationPlan(mods: (LeveledMod | null | undefined)[], cap: number) {
        const need = new Set<number>()
        let now = mods.reduce((acc, cur) => acc + (cur?.耐受 || 0), 0)
        mods.map((m, i) => ({ m, i }))
            .filter(cost => (cost.m?.耐受 || 0) > 0)
            .sort((a, b) => (b.m?.耐受 || 0) - (a.m?.耐受 || 0))
            .forEach(cost => {
                if (now <= cap) return
                now -= (cost.m?.耐受 || 0) - Math.ceil((cost.m?.耐受 || 0) / 2)
                need.add(cost.i)
            })
        return [...need]
    }

    /**
     * 计算指定MOD集合按极化方案削减后的总耐受。
     * @param mods MOD集合
     * @param plan 极化方案索引
     * @returns 极化后的总耐受
     */
    private calcPolarizedCost(mods: (LeveledMod | null | undefined)[], plan: number[]) {
        const need = new Set(plan)
        return mods.reduce(
            (acc, cur, index) => acc + (cur?.耐受 || 0) - (need.has(index) ? (cur?.耐受 || 0) - Math.ceil((cur?.耐受 || 0) / 2) : 0),
            0
        )
    }

    /**
     * 获取指定类型的MOD总耐受。
     * @param charTab MOD类型（角色/近战/远程/同律）
     * @param extraMods 可选的第二套MOD表（方案兼容注入，仅参与耐受/极性计算，不参与数据计算）。
     *                 角色类型需传 9 元素（8 角色MOD + 1 光环MOD，光环可为 null，光环可被极化即光环极化）；
     *                 其余类型传对应槽位数（近战/远程 8，同律 4），空元素用 null 占位。
     * @returns 总耐受值（第一套 + 第二套）
     */
    getModCost(charTab: string, extraMods?: (LeveledMod | null)[]) {
        if (charTab === "同律" && this.skillWeapon?.inherit) {
            charTab = this.skillWeapon.inherit === "melee" ? "近战" : "远程"
        }
        const extraCost = (extraMods || []).reduce((acc, cur) => acc + (cur?.耐受 || 0), 0)
        return this.getMods(charTab).reduce((acc, cur) => acc + (cur?.耐受 || 0), 0) + extraCost
    }

    /**
     * 获取指定类型按极化方案削减后的最大可行耐受。
     * @param charTab MOD类型
     * @param extraMods 可选的第二套MOD表（注入时返回两套在共享极化方案下的峰值负荷，含异极性惩罚）
     * @returns 极化后的总耐受
     */
    getModCostMax(charTab: string, extraMods?: (LeveledMod | null)[]) {
        if (charTab === "同律" && this.skillWeapon?.inherit) {
            charTab = this.skillWeapon.inherit === "melee" ? "近战" : "远程"
        }
        const cap = this.getModCap(charTab)
        const base = this.getMods(charTab)
        const extra = extraMods || []
        if (extra.length === 0) return this.calcPolarizedCost(base, this.calcPolarizationPlan(base, cap))
        const plan = this.getSharedPolarizationPlan(charTab, extra)
        return Math.max(plan.cost1, plan.cost2)
    }
    getModCap(charTab: string) {
        if (charTab === "同律" && this.skillWeapon?.inherit) {
            charTab = this.skillWeapon.inherit === "melee" ? "近战" : "远程"
        }
        let charOrWeapon: { 等级: number } = this.char
        if (charTab === "近战") {
            charOrWeapon = this.meleeWeapon
        } else if (charTab === "远程") {
            charOrWeapon = this.rangedWeapon
        }
        return 20 + ((charTab === "角色" && this.auraMod?.最大耐受) || 0) + charOrWeapon.等级
    }
    /**
     * 计算一套普通MOD（不含中央槽）在给定极化方案下的总耐受与各槽位状态。
     * 规则：MOD极性 = 槽位极性 → 半价(ceil)；MOD有极性但与槽位极性不同 → ×1.5(ceil)（惩罚）；
     *      无极性MOD不受影响；未极化槽位原价；空槽位中性。
     * 分配：同极性槽优先半价最贵的MOD；其余极化槽优先落在空槽/无极性MOD上（无惩罚），
     *      仍多余的极化槽由最便宜的未匹配MOD承受 ×1.5 惩罚。
     * @param normals 普通槽MOD列表
     * @param counts 各极性极化槽数量
     * @param aura 中央槽MOD（光环，可为空）
     * @param auraType 中央槽极性（未极化 null）
     * @param normalSlotCount 普通槽位数（角色/近战/远程 8，同律 4）
     * @param auraIndex 中央槽在完整MOD列表中的索引（用于标记槽位）
     * @returns 总耐受与半价/惩罚槽位索引
     */
    private calcSetCost(
        normals: (LeveledMod | null | undefined)[],
        counts: Record<PolarityType, number>,
        aura: LeveledMod | null,
        auraType: PolarityType | null,
        normalSlotCount: number,
        auraIndex: number
    ) {
        const N = normalSlotCount
        const K = POLARITY_TYPES.reduce((sum, T) => sum + counts[T], 0)
        const groups: Record<PolarityType, { i: number; cost: number }[]> = { A: [], D: [], V: [], O: [] }
        const noPol: { i: number; cost: number }[] = []
        let occupied = 0
        normals.forEach((m, i) => {
            if (!m?.耐受) return
            occupied++
            ;(m.极性 ? groups[m.极性 as PolarityType] : noPol).push({ i, cost: m.耐受 })
        })
        POLARITY_TYPES.forEach(T => groups[T].sort((a, b) => b.cost - a.cost))

        let cost = 0
        const halved: number[] = []
        const penalized: number[] = []
        let matchedCount = 0

        // 1. 同极性槽位半价（每极性最贵的 counts[T] 个）
        POLARITY_TYPES.forEach(T => {
            groups[T].slice(0, counts[T]).forEach(m => {
                cost += Math.ceil(m.cost / 2)
                halved.push(m.i)
            })
            matchedCount += Math.min(counts[T], groups[T].length)
        })

        // 2. 剩余极化槽优先落在空槽/无极性MOD上（无惩罚），多余的由未匹配MOD承受 ×1.5 惩罚
        const unmatched = POLARITY_TYPES.flatMap(T => groups[T].slice(counts[T]))
        const emptySlots = N - occupied
        const dangerSlots = K - matchedCount
        const safeHold = emptySlots + noPol.length
        const penaltyCount = Math.min(unmatched.length, Math.max(0, dangerSlots - safeHold))
        const sortedUnmatched = [...unmatched].sort((a, b) => a.cost - b.cost)
        const penalizeSet = new Set(sortedUnmatched.slice(0, penaltyCount).map(m => m.i))
        sortedUnmatched.forEach(m => {
            if (penalizeSet.has(m.i)) {
                cost += Math.ceil(m.cost * 1.5)
                penalized.push(m.i)
            } else {
                cost += m.cost
            }
        })
        noPol.forEach(m => (cost += m.cost))

        // 3. 中央槽（光环）：同极性半价、异极性惩罚、无极性或未极化原价
        if (aura?.耐受) {
            if (auraType === aura.极性) {
                cost += Math.ceil(aura.耐受 / 2)
                halved.push(auraIndex)
            } else if (auraType && aura.极性) {
                cost += Math.ceil(aura.耐受 * 1.5)
                penalized.push(auraIndex)
            } else {
                cost += aura.耐受
            }
        }

        return { cost, halved, penalized }
    }

    /**
     * 生成同时满足两套MOD的共享极化方案（本质：用同一套极化方案分别应用到两套MOD）。
     * 极化方案 = 各极性极化槽数量（普通槽，不超过槽位数）+ 中央槽极性（角色类型，可极化一次）。
     * 应用规则：每套中对应极性的MOD按耐受从高到低优先半价；异极性槽位 ×1.5 惩罚。
     * 贪心：每步完整重算两套耐受，选择"对仍超出上限的套合计节省最大"的候选；
     * 平局时优先帮助两套、其次缺口更大、再次优先满足第一套；不可破坏已满足的套；
     * 若无法同时满足，优先满足第一套。
     * @param charTab MOD类型
     * @param extraMods 第二套MOD表（角色类型需含光环元素，光环可参与极化）
     * @returns 共享极化方案（含各套半价/惩罚槽位索引与最终耐受）
     */
    getSharedPolarizationPlan(charTab: string, extraMods?: (LeveledMod | null)[]) {
        if (charTab === "同律" && this.skillWeapon?.inherit) {
            charTab = this.skillWeapon.inherit === "melee" ? "近战" : "远程"
        }
        const cap = this.getModCap(charTab)
        const base = this.getMods(charTab)
        const extra = extraMods || []
        const isChar = charTab === "角色"
        const normalSlotCount = ModTypeMaxSlot[RModTypeMap[charTab as keyof typeof RModTypeMap]] || 8

        // 拆分中央槽（光环，仅角色类型为末尾元素）与普通MOD
        const splitAura = (mods: (LeveledMod | null | undefined)[]) => {
            if (!isChar || mods.length === 0) return { aura: null as LeveledMod | null, normals: mods }
            return { aura: mods[mods.length - 1] || null, normals: mods.slice(0, -1) }
        }
        const s1 = splitAura(base)
        const s2 = splitAura(extra)
        const auraIndex1 = base.length - 1
        const auraIndex2 = extra.length - 1

        const counts: Record<PolarityType, number> = { A: 0, D: 0, V: 0, O: 0 }
        let auraType: PolarityType | null = null

        while (true) {
            const r1 = this.calcSetCost(s1.normals, counts, s1.aura, auraType, normalSlotCount, auraIndex1)
            const r2 = this.calcSetCost(s2.normals, counts, s2.aura, auraType, normalSlotCount, auraIndex2)
            const cost1 = r1.cost
            const cost2 = r2.cost
            if (cost1 <= cap && cost2 <= cap) break

            const over1 = cost1 > cap
            const over2 = cost2 > cap
            const deficit1 = Math.max(0, cost1 - cap)
            const deficit2 = Math.max(0, cost2 - cap)
            const totalPolarized = POLARITY_TYPES.reduce((sum, T) => sum + counts[T], 0)

            type PolarCandidate = {
                benefit: number
                helped: number
                maxDeficit: number
                helpFirst: boolean
                T: PolarityType
                kind: "normal" | "aura"
            }
            const candidates: PolarCandidate[] = []
            /**
             * 收集候选极化（新增一个 T 型槽或把中央槽极化为 T）。
             * @param benefit 对仍超上限的套合计节省
             * @param T 极性
             * @param kind 槽位种类
             * @param help1 是否帮助第一套
             * @param help2 是否帮助第二套
             */
            const consider = (benefit: number, T: PolarityType, kind: "normal" | "aura", help1: boolean, help2: boolean) => {
                if (benefit <= 0) return
                const helped = (help1 ? 1 : 0) + (help2 ? 1 : 0)
                const maxDeficit = help1 && help2 ? Math.max(deficit1, deficit2) : help1 ? deficit1 : deficit2
                candidates.push({ benefit, helped, maxDeficit, helpFirst: help1, T, kind })
            }
            /**
             * 贪心优先级：合计节省 > 帮助套数 > 优先满足第一套 > 缺口更大 > 固定极性顺序。
             * @param a 候选A
             * @param b 候选B
             * @returns b 是否优于 a
             */
            const isBetter = (a: PolarCandidate, b: PolarCandidate) =>
                b.benefit > a.benefit ||
                (b.benefit === a.benefit &&
                    (b.helped > a.helped ||
                        (b.helped === a.helped &&
                            ((b.helpFirst && !a.helpFirst) || (b.helpFirst === a.helpFirst && b.maxDeficit > a.maxDeficit)))))

            for (const T of POLARITY_TYPES) {
                // 普通槽 +1（不超过槽位上限）
                if (totalPolarized < normalSlotCount) {
                    const newCounts = { ...counts, [T]: counts[T] + 1 }
                    const c1 = this.calcSetCost(s1.normals, newCounts, s1.aura, auraType, normalSlotCount, auraIndex1).cost
                    const c2 = this.calcSetCost(s2.normals, newCounts, s2.aura, auraType, normalSlotCount, auraIndex2).cost
                    // 优先满足第一套：绝不使已满足的第一套超出上限或耐受增加；第二套可让步
                    const valid = over1 || (c1 <= cap && c1 <= cost1)
                    const benefit = (over1 ? Math.max(0, cost1 - c1) : 0) + (over2 ? Math.max(0, cost2 - c2) : 0)
                    if (valid && benefit > 0) consider(benefit, T, "normal", over1 && c1 < cost1, over2 && c2 < cost2)
                }
                // 中央槽极化为 T（仅未极化时可极化一次）
                if (auraType === null) {
                    const c1 = this.calcSetCost(s1.normals, counts, s1.aura, T, normalSlotCount, auraIndex1).cost
                    const c2 = this.calcSetCost(s2.normals, counts, s2.aura, T, normalSlotCount, auraIndex2).cost
                    const valid = over1 || (c1 <= cap && c1 <= cost1)
                    const benefit = (over1 ? Math.max(0, cost1 - c1) : 0) + (over2 ? Math.max(0, cost2 - c2) : 0)
                    if (valid && benefit > 0) consider(benefit, T, "aura", over1 && c1 < cost1, over2 && c2 < cost2)
                }
            }

            const best = candidates.reduce<PolarCandidate | null>((prev, cur) => (!prev || isBetter(prev, cur) ? cur : prev), null)
            if (!best) break
            if (best.kind === "aura") auraType = best.T
            else counts[best.T]++
        }

        const final1 = this.calcSetCost(s1.normals, counts, s1.aura, auraType, normalSlotCount, auraIndex1)
        const final2 = this.calcSetCost(s2.normals, counts, s2.aura, auraType, normalSlotCount, auraIndex2)
        const over1 = final1.cost > cap
        const over2 = final2.cost > cap

        // 无法共存原因；优先满足第一套（第一套满足后第二套仍超上限才判定无法共存）
        let reason: "" | "overcap" | "aura" = ""
        if (over1) {
            reason = "overcap"
        } else if (over2) {
            reason = s1.aura && s2.aura && s1.aura.极性 !== s2.aura.极性 ? "aura" : "overcap"
        }

        return {
            plan: counts,
            aura: auraType,
            first: final1.halved,
            second: final2.halved,
            firstPenalty: final1.penalized,
            secondPenalty: final2.penalized,
            cost1: final1.cost,
            cost2: final2.cost,
            ok: !over1 && !over2,
            reason,
        }
    }

    /**
     * 计算需要极化的MOD槽位索引（半价削减耐受）。
     * - 无第二套时：对第一套按耐受从高到低贪心半价（含光环，可光环极化）；
     * - 有第二套时：返回共享极化方案（getSharedPolarizationPlan）在各套的槽位索引并集，
     *   第一套为 0..getMods(charTab).length-1，第二套从 getMods(charTab).length 起偏移。
     * @param charTab MOD类型
     * @param extraMods 可选的第二套MOD表（角色类型需含光环元素）
     * @returns 需要极化的槽位索引
     */
    getModCostTransfer(charTab: string, extraMods?: (LeveledMod | null)[]) {
        if (charTab === "同律" && this.skillWeapon?.inherit) {
            charTab = this.skillWeapon.inherit === "melee" ? "近战" : "远程"
        }
        const cap = this.getModCap(charTab)
        const base = this.getMods(charTab)
        const extra = extraMods || []
        if (extra.length === 0) return this.calcPolarizationPlan(base, cap)
        const plan = this.getSharedPolarizationPlan(charTab, extra)
        const offset = base.length
        return [...plan.first, ...plan.second.map(index => offset + index)]
    }

    /**
     * 方案兼容检查：判断两套MOD能否共用同一套极化方案（见 getSharedPolarizationPlan）。
     * @param charTab MOD类型
     * @param extraMods 第二套MOD表（角色类型需含光环元素）
     * @returns 兼容结果（ok 与 reason：overcap | aura）
     */
    checkSchemeCompat(charTab: string, extraMods?: (LeveledMod | null)[]) {
        const plan = this.getSharedPolarizationPlan(charTab, extraMods)
        return { ok: plan.ok, reason: plan.reason }
    }

    getCode(type = "角色") {
        if (type === "同律" && this.skillWeapon?.inherit) {
            type = this.skillWeapon.inherit === "melee" ? "近战" : "远程"
        }
        const slots = type === "同律" ? 4 : 8
        const ids = this.mods.filter(v => v.类型 === type).map(v => v.id)
        const mods = this.codeSwapR(ids, slots)
            .map(base36Pad)
            .join("")
            .padEnd(slots * 4, "0")
        const auraMod = base36Pad(this.auraMod?.id || 0).padEnd(4, "0")
        const isChar = type === "角色"
        const id = isChar ? this.char.id : type === "近战" ? this.meleeWeapon.id : this.rangedWeapon.id
        const flag = isChar ? "C" : "W"
        return `${flag}${base36Pad(id)}${mods}${isChar ? auraMod : ""}`
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
        if (type === "同律" && this.skillWeapon?.inherit) {
            type = this.skillWeapon.inherit === "melee" ? "近战" : "远程"
        }
        try {
            const modIds =
                charCode
                    .slice(5)
                    .match(/.{4}/g)
                    ?.map(v => parseInt(v.toLowerCase(), 36)) || []
            if (type === "角色") {
                if (modIds.length !== 9) {
                    console.warn("导入代码格式错误")
                    return { mods: Array(8).fill(0), auraMod: 0 }
                }
                return { mods: this.codeSwap(modIds.slice(0, 8)), auraMod: modIds[8] }
            } else {
                if (modIds.length < 4) {
                    console.warn("导入代码格式错误")
                    return { mods: Array(8).fill(0) }
                }
                return { mods: this.codeSwap(modIds.slice(0, 8)) }
            }
        } catch (error) {
            console.warn("导入代码格式错误", error)
            return
        }
    }

    static indepSeries = ["百首", "狮鹫", "中庭蛇"]
    static elmSeries = ["狮鹫", "百首", "契约者", "换生灵"]
    static exclusiveSeries = [...CharBuild.indepSeries, "囚狼1", "换生灵", "海妖", "审判者", "巨鲸", "金乌", "焰灵", "黄衣", "夜使"]

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
        onLog,
    }: BuildOption) {
        const initBuild = this.clone()
        includeTypes.forEach(key =>
            preserveTypes.includes(key) ? (initBuild[key] = initBuild[key].filter(v => v !== null)) : (initBuild[key] = [])
        )
        const localBuild = initBuild.clone()
        // 创建一个集合记录已选择的互斥系列
        const selectedExclusiveSeries = {
            charMods: new Set<string>(),
            meleeMods: new Set<string>(),
            rangedMods: new Set<string>(),
            skillMods: new Set<string>(),
        }
        // 创建一个集合记录已选择的非契约者MOD名称（用于名称互斥）
        const selectedExclusiveNames = {
            charMods: new Set<string>(),
            meleeMods: new Set<string>(),
            rangedMods: new Set<string>(),
            skillMods: new Set<string>(),
        }
        // 记录已选择的MOD数量
        const selectedModCount = new Map<number, number>()

        includeTypes.forEach(key => {
            localBuild[key] = []
            initBuild[key].forEach(mod => addMod(key, mod!))
        })
        let logString = ""
        function log(msg: string) {
            if (enableLog) logString += `${msg}\n`
            // 实时日志回调：每行日志即时转发，用于进度展示（与 enableLog 相互独立）
            onLog?.(msg)
        }
        log(`开始自动构筑`)
        /**
         * 判断指定槽位类型是否已经达到上限。
         * @param key MOD槽位类型
         * @returns 是否已满
         */
        function isTypeFull(key: ModTypeKey) {
            return localBuild[key].length >= ModTypeMaxSlot[key]
        }
        function addMod(key: ModTypeKey, mod: LeveledMod) {
            if (isTypeFull(key)) return false
            localBuild[key].push(mod)
            // 记录互斥系列
            if (CharBuild.exclusiveSeries.includes(mod.系列) || (mod.系列 === "囚狼" && mod.id > 100000)) {
                mod.excludeSeries.forEach(series => selectedExclusiveSeries[key].add(series))
            }
            // 记录非契约者MOD名称（用于名称互斥）
            if (mod.系列 !== "契约者") {
                selectedExclusiveNames[key].add(mod.名称)
            } else {
                selectedModCount.set(mod.id, (selectedModCount.get(mod.id) || 0) + 1)
            }
            return true
        }
        function removeMod(key: ModTypeKey, index: number) {
            const mod = localBuild[key][index]!
            localBuild[key].splice(index, 1)
            // 从互斥系列集合中移除
            if (CharBuild.exclusiveSeries.includes(mod.系列)) {
                mod.excludeSeries.forEach(series => selectedExclusiveSeries[key].delete(series))
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

        /**
         * 精确计算已装备MOD的边际收益（通过真实移除后重算）
         * @param key MOD槽位类型
         * @param index MOD索引
         * @returns 边际收益
         */
        function calcEquippedModIncome(key: ModTypeKey, index: number) {
            const mod = localBuild[key][index]
            if (!mod) return 0
            const baseValue = localBuild.calculate()
            const copyBuild = localBuild.clone()
            copyBuild[key].splice(index, 1)
            const removedValue = copyBuild.calculate()
            if (!removedValue) return 0
            return baseValue / removedValue - 1
        }

        function sortByIcome(key: ModTypeKey) {
            const initMods = initBuild[key]
            const scored = localBuild[key]
                .slice(initMods.length)
                .map((mod, offset) => ({
                    mod: mod!,
                    income: calcEquippedModIncome(key, initMods.length + offset),
                }))
                .sort((a, b) => b.income - a.income)
            localBuild[key] = [...initMods, ...scored.map(v => v.mod)]
            return scored[0]?.mod
        }

        /**
         * 获取指定类型与极性的可选MOD候选（含收益）
         * @param key MOD槽位类型
         * @param polarity 可选的极性过滤
         * @returns 候选MOD与收益列表
         */
        function getModCandidates(key: ModTypeKey, polarity?: "D" | "O" | "V" | "A") {
            const type = ModTypeMap[key]
            return modOptions
                .filter(
                    v =>
                        v.系列 !== "羽蛇" &&
                        v.类型.startsWith(type) &&
                        (!polarity || v.极性 === polarity) &&
                        (!v.属性 || v.属性 === localBuild.char.属性) &&
                        (!v.限定 ||
                            (key === "charMods" && [localBuild.char.名称, localBuild.char.属性].includes(v.限定)) ||
                            (key === "meleeMods" && [localBuild.meleeWeapon.伤害类型, localBuild.meleeWeapon.类别].includes(v.限定)) ||
                            (key === "rangedMods" && [localBuild.rangedWeapon.伤害类型, localBuild.rangedWeapon.类别].includes(v.限定)) ||
                            (key === "skillMods" &&
                                localBuild.skillWeapon &&
                                [localBuild.skillWeapon.伤害类型, localBuild.skillWeapon.类别].includes(v.限定))) &&
                        !selectedExclusiveNames[key].has(v.名称) &&
                        !selectedExclusiveSeries[key].has(v.系列 === "囚狼" && v.id > 100000 ? "囚狼1" : v.系列) &&
                        (selectedModCount.get(v.id) || 0) < (v.count || Number.POSITIVE_INFINITY)
                )
                .map(v => ({ mod: v, income: localBuild.calcIncome(v) }))
        }

        /**
         * 统计候选 MOD 的有效属性数量，用于同收益时优先选择属性更完整的项。
         * @param mod 候选 MOD
         * @returns 有效属性数量
         */
        function countModProperties(mod: LeveledMod) {
            return mod.baseProperties.filter(prop => {
                if (prop === "id") return false
                const value = mod[prop]
                return typeof value === "number" && value !== 0
            }).length
        }

        /**
         * 选取当前收益最高的可用MOD
         * @param key MOD槽位类型
         * @param polarity 可选的极性过滤
         * @returns 最高收益MOD与收益值
         */
        function findMaxMod(key: ModTypeKey, polarity?: "D" | "O" | "V" | "A") {
            const mapped = getModCandidates(key, polarity)
            if (mapped.length === 0) return { mod: null, income: 0 }
            const maxIncome = Math.max(...mapped.map(v => v.income))
            const topIncome = mapped.filter(v => v.income === maxIncome)
            const maxPropertyCount = Math.max(...topIncome.map(v => countModProperties(v.mod)))
            const topPropertyCount = topIncome.filter(v => countModProperties(v.mod) === maxPropertyCount)
            return topPropertyCount[Math.floor(Math.random() * topPropertyCount.length)] || topIncome[0]
        }

        /**
         * 解析趋向条件并换算为所需极性数量
         * @param condition 单条生效条件
         * @returns 极性与所需数量；若非趋向条件则返回undefined
         */
        function parsePolarityCondition(condition: [string, string, number]) {
            const [attr, op, value] = condition
            if (!/^[DOVA]趋向$/.test(attr)) return undefined
            if (op !== ">=" && op !== ">" && op !== "=") return undefined
            const required = op === ">" ? Math.floor(value) + 1 : Math.ceil(value)
            return {
                polarity: attr.slice(0, 1) as "D" | "O" | "V" | "A",
                required,
            }
        }

        /**
         * 计算单个MOD在条件判断视角下的极性计数
         * @param polarity 目标极性
         * @param conditionMods 当前参与条件计算的MOD集合
         * @param mod 当前正在判断条件的MOD
         * @returns 极性数量（与LeveledMod.checkCondition保持一致）
         */
        function getConditionPolarityCount(polarity: "D" | "O" | "V" | "A", conditionMods: LeveledMod[], mod: LeveledMod) {
            const baseCount = conditionMods.filter(v => v.极性 === polarity).length
            const hasSameModId = conditionMods.some(v => v.id === mod.id)
            if (mod.极性 === polarity && !hasSameModId) {
                return baseCount + 1
            }
            return baseCount
        }

        /**
         * 收集当前所有可用候选中的条件MOD。
         * @returns 按槽位类型分组的条件候选
         */
        function getConditionalCandidates() {
            return includeTypes.flatMap(key =>
                getModCandidates(key).map(v => ({
                    key,
                    mod: v.mod,
                }))
            )
        }

        /**
         * 判断当前条件MOD在现有构筑下还差多少才能生效。
         * @param mod 条件MOD
         * @returns 缺口列表
         */
        function getConditionDeficits(mod: LeveledMod) {
            const attrs = localBuild.calculateAttributes()
            const conditionMods = localBuild.charModsWithAura
            const deficits: { kind: "attr" | "polarity"; attr: string; missing: number }[] = []

            ;(mod.生效?.条件 || []).forEach(([attr, op, value]: [string, string, number]) => {
                const parsedPolarity = parsePolarityCondition([attr, op, value])
                if (parsedPolarity) {
                    const current = getConditionPolarityCount(parsedPolarity.polarity, conditionMods, mod)
                    const missing = parsedPolarity.required - current
                    if (missing > 0) {
                        deficits.push({
                            kind: "polarity",
                            attr: parsedPolarity.polarity,
                            missing,
                        })
                    }
                    return
                }

                const currentValue = attrs[attr as keyof CharAttr]
                if (typeof currentValue !== "number") return

                const selfValue = typeof mod[attr] === "number" ? mod[attr] : 0
                const effectiveValue = currentValue + selfValue
                const required = op === ">" ? value + Number.EPSILON : value
                const missing = required - effectiveValue
                if (missing > 0) {
                    deficits.push({
                        kind: "attr",
                        attr,
                        missing,
                    })
                }
            })

            return deficits
        }

        /**
         * 条件预热：先用可用的普通MOD补齐条件，再让常规收益迭代继续跑。
         * @param iter 当前迭代轮次
         * @returns 是否发生变化
         */
        function prioritizeConditionMods(iter: number) {
            let changed = false
            while (true) {
                const conditionalCandidates = getConditionalCandidates()
                    .filter(({ mod }) => mod.生效?.条件?.length)
                    .filter(({ mod }) => !localBuild.checkModEffective(mod)?.isEffective)

                if (!conditionalCandidates.length) break

                const targetNeeds = conditionalCandidates
                    .map(({ mod }) => ({
                        mod,
                        deficits: getConditionDeficits(mod),
                    }))
                    .filter(item => item.deficits.length > 0)

                if (!targetNeeds.length) break

                const needMap = new Map<string, number>()
                targetNeeds.forEach(({ deficits }) => {
                    deficits.forEach(deficit => {
                        needMap.set(deficit.attr, (needMap.get(deficit.attr) || 0) + deficit.missing)
                    })
                })

                let best: { key: ModTypeKey; mod: LeveledMod; score: number } | null = null
                for (const key of includeTypes) {
                    for (const candidate of getModCandidates(key).map(v => v.mod)) {
                        if (candidate.生效?.条件?.length && !localBuild.checkModEffective(candidate)?.isEffective) continue
                        let score = 0
                        needMap.forEach((missing, attr) => {
                            if (attr === candidate.极性 && candidate.极性) {
                                score += missing
                                return
                            }
                            if (attr in candidate && typeof candidate[attr] === "number") {
                                score += Math.min(candidate[attr], missing)
                            }
                        })
                        if (!score && candidate.生效?.条件?.length) {
                            const candidateDeficits = getConditionDeficits(candidate)
                            score = candidateDeficits.reduce((sum, deficit) => sum + deficit.missing, 0)
                        }
                        if (score <= 0) continue
                        if (!best || score > best.score) {
                            best = { key, mod: candidate, score }
                        }
                    }
                }

                if (!best) break
                if (addMod(best.key, best.mod)) {
                    changed = true
                    log(`第${iter}次迭代: 条件优先添加${ModTypeMap[best.key]}>>> ${best.mod.名称}`)
                } else {
                    break
                }
            }

            return changed
        }

        function findMaxMelee() {
            let options = meleeOptions
            // 当计算近战武器伤害时，只考虑相同类别武器
            if (localBuild.isMeleeWeapon) {
                options = options.filter(v => v.类别 === localBuild.meleeWeapon.类别)
            }
            return options.reduce((a, b) => {
                // console.log(a.名称, localBuild.calcIncome(a))
                return localBuild.calcIncome(b) > localBuild.calcIncome(a) ? b : a
            })
        }
        function findMaxRanged() {
            let options = rangedOptions
            // 当计算远程武器伤害时，只考虑相同类别武器
            if (localBuild.isRangedWeapon) {
                options = options.filter(v => v.类别 === localBuild.rangedWeapon.类别)
            }
            return options.reduce((a, b) => (localBuild.calcIncome(b) > localBuild.calcIncome(a) ? b : a))
        }
        function next(iter: number) {
            let changed = false
            // 最大化武器
            if (!fixedMelee && !initBuild.isMeleeWeapon && meleeOptions.length) {
                const maxed = findMaxMelee()
                if (maxed.名称 !== localBuild.meleeWeapon.名称) {
                    const old = localBuild.meleeWeapon
                    const oldIncome = localBuild.calcIncome(localBuild.meleeWeapon)
                    localBuild.meleeWeapon = maxed
                    const newIncome = localBuild.calcIncome(maxed)
                    if (newIncome > oldIncome) {
                        log(
                            `第${iter}次迭代: 用近战 ${maxed.名称} 替换 ${old.名称} 收益: ${+(oldIncome * 100).toFixed(2)}% -> ${+(newIncome * 100).toFixed(2)}%`
                        )
                        changed = true
                    } else {
                        localBuild.meleeWeapon = old
                    }
                }
            }
            if (!fixedRanged && !initBuild.isRangedWeapon && rangedOptions.length) {
                const maxed = findMaxRanged()
                if (maxed.名称 !== localBuild.rangedWeapon.名称) {
                    const old = localBuild.rangedWeapon
                    const oldIncome = localBuild.calcIncome(localBuild.rangedWeapon)
                    localBuild.rangedWeapon = maxed
                    const newIncome = localBuild.calcIncome(maxed)
                    if (newIncome > oldIncome) {
                        log(
                            `第${iter}次迭代: 用远程 ${maxed.名称} 替换 ${old.名称} 收益: ${+(oldIncome * 100).toFixed(2)}% -> ${+(newIncome * 100).toFixed(2)}%`
                        )
                        changed = true
                    } else {
                        localBuild.rangedWeapon = old
                    }
                }
            }
            // 先处理带趋向条件的角色MOD，优先补齐触发条件
            changed = prioritizeConditionMods(iter) || changed
            // 最大化MOD
            includeTypes.forEach(key => {
                let { mod: maxed, income: maxedIncome } = findMaxMod(key)
                if (maxed === null || initBuild[key].length >= ModTypeMaxSlot[key]) return
                if (!maxedIncome) {
                    log(`第${iter}次迭代: 当前选项MOD无收益, 直接退出`)
                    return
                }
                while (localBuild[key].length < ModTypeMaxSlot[key]) {
                    // 不添加收益0的MOD
                    if (maxedIncome <= 0) break
                    if (!addMod(key, maxed)) break
                    changed = true
                    log(
                        `第${iter}次迭代: 添加${ModTypeMap[key]}(${localBuild[key].length}/${ModTypeMaxSlot[key]})>>> ${maxed.名称}(+${+(maxedIncome * 100).toFixed(2)}%)`
                    )
                    ;({ mod: maxed, income: maxedIncome } = findMaxMod(key))
                    if (maxed === null) return
                }
                sortByIcome(key)
                const removableIndex = localBuild[key].length - 1
                const removableMod = localBuild[key][removableIndex]
                if (!removableMod || !maxed) return

                const lastIncome = calcEquippedModIncome(key, removableIndex)
                const copyBuild = localBuild.clone()
                copyBuild[key].splice(removableIndex, 1)
                const newIncome = copyBuild.calcIncome(maxed)
                const oldTotal = localBuild.calculate()
                const replacedBuild = localBuild.clone()
                replacedBuild[key][removableIndex] = maxed
                const newTotal = replacedBuild.calculate()

                log(
                    `第${iter}次迭代: ${ModTypeMap[key]}>>> ${removableMod.名称}(+${+(lastIncome * 100).toFixed(2)}%) vs ${maxed.名称}(+${+(newIncome * 100).toFixed(2)}%)`
                )

                // 替换判定以总收益为准，避免条件联动导致的边际收益误判
                if (newTotal > oldTotal) {
                    log(
                        `第${iter}次迭代: ${ModTypeMap[key]}>>> ${maxed.名称} 替换 ${removableMod.名称} (${+(lastIncome * 100).toFixed(2)}% -> ${+(newIncome * 100).toFixed(2)}%)`
                    )
                    removeMod(key, removableIndex)
                    if (addMod(key, maxed)) {
                        changed = true
                    } else {
                        addMod(key, removableMod)
                    }
                }
            })
            if (!changed) log(`无可替换MOD 结束自动构筑`)
            return changed
        }

        /**
         * 构筑状态签名（用于检测循环迭代）
         * @returns 当前构筑的稳定字符串签名
         */
        function getBuildSignature() {
            const toIds = (mods: (LeveledMod | null)[]) =>
                mods
                    .filter((mod): mod is LeveledMod => mod !== null)
                    .map(mod => mod.id)
                    .sort((a, b) => a - b)
                    .join(",")
            return [
                localBuild.meleeWeapon.id,
                localBuild.rangedWeapon.id,
                localBuild.auraMod?.id || 0,
                toIds(localBuild.charMods),
                toIds(localBuild.meleeMods),
                toIds(localBuild.rangedMods),
                toIds(localBuild.skillMods),
            ].join("|")
        }
        // 最大迭代次数
        const MAX_ITER = 20
        // 最大化MOD直到不再有变化
        const visitedStates = new Set<string>()
        for (let index = 0; index < MAX_ITER; index++) {
            const signature = getBuildSignature()
            if (visitedStates.has(signature)) {
                log(`检测到构筑状态循环，结束自动构筑`)
                return { newBuild: localBuild, log: logString, iter: index + 1 }
            }
            visitedStates.add(signature)
            if (!next(index + 1)) {
                return { newBuild: localBuild, log: logString, iter: index + 1 }
            }
        }
        return { newBuild: localBuild, log: logString, iter: MAX_ITER }
    }
}

export type ModTypeKey = "charMods" | "meleeMods" | "rangedMods" | "skillMods"
export enum ModTypeMap {
    charMods = "角色",
    meleeMods = "近战",
    rangedMods = "远程",
    skillMods = "同律",
}
export enum RModTypeMap {
    角色 = "charMods",
    近战 = "meleeMods",
    远程 = "rangedMods",
    同律 = "skillMods",
}

export const ModTypeMaxSlot: Record<ModTypeKey, number> = {
    charMods: 8,
    meleeMods: 8,
    rangedMods: 8,
    skillMods: 4,
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
    /** 无血量因数伤害 */
    noHpDamage: number
    /** 物理分量伤害（期望，按结算类型拆分，转属克/转属逆 转换到元素的部分不计入物理） */
    physicalDamage?: number
    /** 元素分量伤害（期望，按结算类型拆分，含转属克/转属逆 转换到属克/属逆元素的部分） */
    elementDamage?: number
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
    /** 日志实时回调：每生成一行构筑日志时调用（与 enableLog 相互独立） */
    onLog?: (msg: string) => void
}
