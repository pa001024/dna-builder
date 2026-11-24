<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { useTranslation } from "i18next-vue"
import { computed, onBeforeUnmount, reactive, ref } from "vue"
import { useCharSettings } from "@/composables/useCharSettings"
import { useSearchParam } from "@/composables/useSearchParam"
import {
    CharBuild,
    CharBuildTimeline,
    charMap,
    DmgType,
    factionBonusKeyForEnemy,
    HP_TYPE_COEFFICIENTS,
    HP_TYPE_DAMAGE,
    HpType,
    LeveledCharHelper,
} from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { ADDITIONAL_DAMAGE_KEYS } from "@/data/leveled/additionalDamage"
import { useInvStore } from "@/store/inv"
import { useTimeline } from "@/store/timeline"
import { useUIStore } from "@/store/ui"
import {
    type AdditionalDamageComponentKey,
    type AdditionalDamageComponents,
    additionalDamageZone,
    createAdditionalDamageComponents,
    resolveAdditionalDamageComponents,
} from "@/utils/additionalDamageZone"
import { type FormulaStepDefinition, resolveStepFormula } from "@/utils/damageStepFormula"
import { inlineActionsToTimeline } from "@/utils/inlineActionsToTimeline"

type CalcMode = "weapon" | "skill" | "dot"
type StepOperator = "+" | "-" | "*" | "/"
type DamageTypeKey = keyof typeof DmgType
type HpTypeKey = keyof typeof HpType

const WEAPON_DAMAGE_TYPES = Object.values(DmgType) as DamageTypeKey[]
const ENEMY_HP_TYPES = Object.values(HpType) as HpTypeKey[]
const HP_TYPE_OPTIONS = ENEMY_HP_TYPES.map(value => ({ value, label: value }))

type WeaponNumberFieldKey =
    | "charBaseAttack"
    | "charAttackBonus"
    | "resonanceGain"
    | "elementalDamageBonus"
    | "fixedAttackAdd"
    | "weaponBaseAttack"
    | "weaponAttackBonus"
    | "physicalDamageBonus"
    | "baseCritRate"
    | "critRateBonus"
    | "baseCritDamage"
    | "critDamageBonus"
    | "baseTriggerRate"
    | "triggerRateBonus"
    | "baseDamageBonus"
    | "weaponDamageBonus"
    | "factionBonus"
    | "elementDamageIncrease"
    | "physicalDamageIncrease"
    | "attackTypeDamageBonus"
    | "attackTypeIndependentBonus"
    | "weaponIndependentPenalty"
    | "seasonBonus"
    | "independentBonus"
    | "weaponIndependentBonus"
    | AdditionalDamageComponentKey
    | "enemyResistance"
    | "elementWeakness"
    | "allElementWeakness"
    | "penetrationBonus"
    | "convertRestraint"
    | "convertReverse"
    | "convertCut"
    | "convertPierce"
    | "convertShock"
    | "convertCalamity"
    | "enemyDefense"
    | "ignoreDefense"
    | "attackerLevel"
    | "enemyLevel"
    | "boostBonus"
    | "desperateBonus"
    | "hpPercent"
    | "imbalanceBonus"
    | "triggerBonus"
    | "skillRate"
    | "skillFlatDamage"
    | "skillPowerMultiplier"
    | "fullnessConversion"
    | "fullnessModBonus"

type SkillNumberFieldKey =
    | "enemyResistance"
    | "elementWeakness"
    | "allElementWeakness"
    | "penetrationBonus"
    | "convertRestraint"
    | "convertReverse"
    | "convertCut"
    | "convertPierce"
    | "convertShock"
    | "convertCalamity"
    | "enemyDefense"
    | "ignoreDefense"
    | "skillIgnoreDefense"
    | "attackerLevel"
    | "enemyLevel"
    | "baseDamageBonus"
    | "skillDamageBonus"
    | "factionBonus"
    | "elementDamageIncrease"
    | "physicalDamageIncrease"
    | "attackTypeDamageBonus"
    | "attackTypeIndependentBonus"
    | "seasonBonus"
    | "independentBonus"
    | "skillIndependentBonus"
    | "skillAdditionalDamage"
    | "summonDamageBonus"
    | "summonIndependentBonus"
    | "boostBonus"
    | "desperateBonus"
    | "hpPercent"
    | "imbalanceBonus"
    | "charBaseAttack"
    | "charAttackBonus"
    | "resonanceGain"
    | "elementalDamageBonus"
    | "fixedAttackAdd"
    | "skillRate"
    | "skillFlatDamage"
    | "skillPowerMultiplier"
    | "fullnessPower"

type WeaponToggleFieldKey = "weaponMasteryEnabled" | "skillWeaponEnabled" | "imbalanceEnabled" | "fullnessFieldEnabled"
type SkillToggleFieldKey = "imbalanceEnabled" | "fullnessFieldEnabled" | "summonEnabled"
type WeaponSelectFieldKey = "damageType" | "enemyHpType"

type DotNumberFieldKey =
    | "charAttack"
    | "weaponAttack"
    | "fullnessPower"
    | "baseDamageBonus"
    | "factionBonus"
    | "seasonBonus"
    | "skillFreq"
    | "weaponOwnFreq"
    | "otherFreq"
    | "otherElementCount"
    | "boostBonus"
    | "desperateBonus"
    | "hpPercent"
    | "enemyResistance"
    | "elementWeakness"
    | "allElementWeakness"
    | "penetrationBonus"
    | "convertRestraint"
    | "convertReverse"

/** 武器模式输入：追伤七分量由 AdditionalDamageComponents 提供（六元素 + 自属性） */
type WeaponDamageInput = AdditionalDamageComponents & {
    charBaseAttack: number
    charAttackBonus: number
    resonanceGain: number
    elementalDamageBonus: number
    fixedAttackAdd: number
    weaponBaseAttack: number
    weaponAttackBonus: number
    physicalDamageBonus: number
    baseCritRate: number
    critRateBonus: number
    baseCritDamage: number
    critDamageBonus: number
    baseTriggerRate: number
    triggerRateBonus: number
    baseDamageBonus: number
    weaponDamageBonus: number
    /** 阵营增伤：歧视 + 敌方阵营对应增伤，与增伤同池加算 */
    factionBonus: number
    /** 元素增伤：只对元素结算分量加算（与增伤同池） */
    elementDamageIncrease: number
    /** 物理增伤：只对物理结算分量加算（与增伤同池） */
    physicalDamageIncrease: number
    /** 攻击类型增伤（普攻/蓄力/下落/滑行），与增伤同池加算 */
    attackTypeDamageBonus: number
    /** 攻击类型独立增伤，与独立增伤相乘 */
    attackTypeIndependentBonus: number
    /** 武器独立增伤惩罚（如箭雨），只作用于武器池独立增伤 */
    weaponIndependentPenalty: number
    /** 赛季增伤：赛季专属伤害率分区，独立乘区 */
    seasonBonus: number
    independentBonus: number
    weaponIndependentBonus: number
    enemyResistance: number
    /** 角色元素弱点：与敌人抗性同区加算，正值放大受到的元素伤害 */
    elementWeakness: number
    /** 全属性弱点：与敌人抗性同区加算，对六元素分量生效 */
    allElementWeakness: number
    penetrationBonus: number
    /** 转属克：敌人正抗时把该比例伤害转为克制元素并翻转抗性 */
    convertRestraint: number
    /** 转属逆：敌人负抗时把该比例伤害转为逆属元素并翻转抗性 */
    convertReverse: number
    convertCut: number
    convertPierce: number
    convertShock: number
    convertCalamity: number
    enemyDefense: number
    ignoreDefense: number
    attackerLevel: number
    enemyLevel: number
    boostBonus: number
    desperateBonus: number
    hpPercent: number
    imbalanceBonus: number
    triggerBonus: number
    skillRate: number
    skillFlatDamage: number
    skillPowerMultiplier: number
    weaponMasteryEnabled: boolean
    weaponMasteryMultiplier: number
    skillWeaponEnabled: boolean
    imbalanceEnabled: boolean
    /** 武器自身伤害类型：决定物理/元素分量占比、灾厄转化与触发匹配 */
    damageType: DamageTypeKey
    /** 敌方当前生命类型：决定触发生效的伤害类型与生命类型系数 */
    enemyHpType: HpTypeKey
    // 充盈：武器充盈转化（该武器作用域），充盈威力基础（角色MOD加成 + 其他武器转化）
    fullnessConversion: number
    fullnessModBonus: number
    // 当前伤害字段是否为充盈伤害（tag 含“充盈”）
    fullnessFieldEnabled: boolean
}

interface SkillDamageInput {
    enemyResistance: number
    /** 角色元素弱点：与敌人抗性同区加算，正值放大受到的元素伤害 */
    elementWeakness: number
    /** 全属性弱点：与敌人抗性同区加算，对六元素分量生效 */
    allElementWeakness: number
    penetrationBonus: number
    convertRestraint: number
    convertReverse: number
    convertCut: number
    convertPierce: number
    convertShock: number
    convertCalamity: number
    enemyDefense: number
    ignoreDefense: number
    skillIgnoreDefense: number
    attackerLevel: number
    enemyLevel: number
    baseDamageBonus: number
    skillDamageBonus: number
    /** 阵营增伤：歧视 + 敌方阵营对应增伤，与增伤同池加算 */
    factionBonus: number
    /** 元素增伤：只对元素结算分量加算（与增伤同池） */
    elementDamageIncrease: number
    /** 物理增伤：只对物理结算分量加算（与增伤同池） */
    physicalDamageIncrease: number
    attackTypeDamageBonus: number
    attackTypeIndependentBonus: number
    seasonBonus: number
    independentBonus: number
    /** 技能独立增伤：只作用于技能伤害池的独立乘区 */
    skillIndependentBonus: number
    /** 技能追伤：技能池的追加伤害独立乘区 */
    skillAdditionalDamage: number
    /** 召唤物伤害：字段 tag 含召唤物时并入增伤池 */
    summonDamageBonus: number
    /** 召唤物独立增伤：字段 tag 含召唤物时生效 */
    summonIndependentBonus: number
    boostBonus: number
    desperateBonus: number
    hpPercent: number
    imbalanceBonus: number
    charBaseAttack: number
    charAttackBonus: number
    resonanceGain: number
    elementalDamageBonus: number
    fixedAttackAdd: number
    skillRate: number
    skillFlatDamage: number
    skillPowerMultiplier: number
    imbalanceEnabled: boolean
    summonEnabled: boolean
    // 充盈：充盈威力（角色属性汇总）；当前伤害字段是否为充盈伤害（tag 含“充盈”）
    fullnessPower: number
    fullnessFieldEnabled: boolean
}

interface DotDamageInput {
    /** 角色攻击（所有来源共用） */
    charAttack: number
    /** 来源武器攻击（仅武器来源频率享受；多武器时按频率加权平均） */
    weaponAttack: number
    fullnessPower: number
    baseDamageBonus: number
    /** 阵营增伤：歧视 + 敌方阵营对应增伤，与增伤同池加算 */
    factionBonus: number
    seasonBonus: number
    /** 技能来源自身属性频率（次/秒，仅角色攻击） */
    skillFreq: number
    /** 武器来源自身属性频率（次/秒，角色攻击 + 武器攻击） */
    weaponOwnFreq: number
    /** 其余属性频率（次/秒，角色攻击 + 武器攻击） */
    otherFreq: number
    /** 其余属性元素种数（只用于其余属性抗性反转区的等效因子） */
    otherElementCount: number
    boostBonus: number
    desperateBonus: number
    hpPercent: number
    enemyResistance: number
    /** 角色元素弱点：只作用于自身属性分量 */
    elementWeakness: number
    /** 全属性弱点：自身属性与其余属性分量都吃 */
    allElementWeakness: number
    penetrationBonus: number
    convertRestraint: number
    convertReverse: number
}

interface DamageStepContext<TInput> {
    input: TInput
    values: Record<string, number>
    get: (stepId: string) => number
}

interface DamageStepDefinition<TInput> extends FormulaStepDefinition<TInput> {
    id: string
    title: string
    compute: (context: DamageStepContext<TInput>) => number
    explain: (context: DamageStepContext<TInput>, value: number) => string
}

interface ManualStepOverride {
    enabled: boolean
    value: number
}

interface EvaluatedDamageStep {
    id: string
    title: string
    formula: string
    detail: string
    autoValue: number
    finalValue: number
    overridden: boolean
}

interface MergeItem {
    operator: StepOperator
    stepId: string
}

interface MergeResult {
    result: number
    formulaText: string
}

interface ActiveOutputDragState {
    stepId: string
    label: string
    value: number
    x: number
    y: number
}

interface PendingOutputDragState {
    stepId: string
    label: string
    value: number
    startX: number
    startY: number
    dragging: boolean
}

/**
 * 数值截断到指定范围，避免生命比例越界导致公式异常。
 * @param value 输入值
 * @param min 最小值
 * @param max 最大值
 * @returns 截断后的值
 */
function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/**
 * 将任意输入安全转为有限数字，NaN/Infinity 时使用兜底值。
 * @param value 输入值
 * @param fallback 兜底值
 * @returns 有限数字
 */
function toFiniteNumber(value: number, fallback = 0): number {
    return Number.isFinite(value) ? value : fallback
}

/**
 * 安全除法，分母接近 0 时返回 0，避免页面出现 Infinity。
 * @param numerator 分子
 * @param denominator 分母
 * @returns 除法结果
 */
function safeDivide(numerator: number, denominator: number): number {
    return Math.abs(denominator) <= Number.EPSILON ? 0 : numerator / denominator
}

/**
 * 计算高等级减伤乘区。
 * 怪物等级大于等于 200 时生效。
 * @param enemyLevel 怪物等级
 * @returns 高等级减伤乘区
 */
function calculateLevelReduceRate(enemyLevel: number): number {
    if (enemyLevel < 200) {
        return 1
    }

    return 1 / (1 + (enemyLevel - 190) * 0.05)
}

/**
 * 统一格式化数值展示，保留小数但去除尾随 0。
 * @param value 数值
 * @param digits 最大小数位
 * @returns 格式化字符串
 */
function formatNumber(value: number, digits = 6): string {
    if (!Number.isFinite(value)) return "-"
    const fixed = value.toFixed(digits)
    return `${Number(fixed)}`
}

/**
 * 按给定位数四舍五入。
 * @param value 数值
 * @param digits 小数位
 * @returns 处理后的数值
 */
function roundByDigits(value: number, digits = 2): number {
    const scale = 10 ** digits
    return Math.round(value * scale) / scale
}

/**
 * 按伤害类型取触发倍率（与 CharBuild.getTriggerMultiplier 同口径）：
 * 灾厄只要求敌方存在抗性；其余类型需匹配敌方当前生命类型。
 * @param input 武器模式输入
 * @param type 伤害类型
 * @returns 触发倍率（已含 1 基准，可直接按 1 + (倍率 - 1) * 触发率 折算）
 */
function triggerMultiplierForType(
    input: Pick<WeaponDamageInput, "enemyResistance" | "enemyHpType" | "triggerBonus">,
    type: DamageTypeKey
): number {
    if (type === "灾厄") {
        return input.enemyResistance !== 0 ? 1 + input.triggerBonus : 1
    }
    return HP_TYPE_DAMAGE[input.enemyHpType] === type ? 1 + HP_TYPE_COEFFICIENTS[input.enemyHpType] + input.triggerBonus : 1
}

/**
 * 取当前抗性方向下生效的属转比例：正抗只看转属克，负抗只看转属逆，0 抗不转换。
 * @param input 含抗性与属转比例的输入
 * @returns 生效属转比例（未钳制）
 */
function resolveActiveElementConvert(input: { enemyResistance: number; convertRestraint: number; convertReverse: number }): number {
    if (input.enemyResistance > 0) return Math.max(0, input.convertRestraint)
    if (input.enemyResistance < 0) return Math.max(0, input.convertReverse)
    return 0
}

/**
 * 其余属性 DOT 的抗性反转等效因子（与 CharBuild.getOtherDotResistanceFactor 同口径）。
 * @param enemyResistance 敌人抗性
 * @param allElementWeakness 全属性弱点
 * @param otherElementCount 其余属性元素种数
 * @returns 每单位其余属性频率的等效抗性因子
 */
function resolveOtherDotResistanceFactor(enemyResistance: number, allElementWeakness: number, otherElementCount: number): number {
    const normal = Math.max(0, 1 - enemyResistance + allElementWeakness)
    if (enemyResistance === 0 || otherElementCount <= 0) return normal
    if (enemyResistance < 0) return Math.max(0, 1 - 0.5 + allElementWeakness)
    return (Math.max(0, 1 - -4 + allElementWeakness) + normal * (otherElementCount - 1)) / otherElementCount
}

/**
 * 创建武器伤害默认输入，便于快速进入调试。
 * @returns 默认武器输入
 */
function createDefaultWeaponInput(): WeaponDamageInput {
    return {
        ...createAdditionalDamageComponents(),
        火属性追伤: 0.12,
        charBaseAttack: 1200,
        charAttackBonus: 0.4,
        resonanceGain: 0,
        elementalDamageBonus: 0.33,
        fixedAttackAdd: 0,
        weaponBaseAttack: 800,
        weaponAttackBonus: 0.25,
        physicalDamageBonus: 0.1,
        baseCritRate: 0.2,
        critRateBonus: 0,
        baseCritDamage: 2,
        critDamageBonus: 0,
        baseTriggerRate: 0.3,
        triggerRateBonus: 0,
        baseDamageBonus: 0.25,
        weaponDamageBonus: 0.22,
        factionBonus: 0,
        elementDamageIncrease: 0,
        physicalDamageIncrease: 0,
        attackTypeDamageBonus: 0,
        attackTypeIndependentBonus: 0,
        weaponIndependentPenalty: 0,
        seasonBonus: 0,
        independentBonus: 0.15,
        weaponIndependentBonus: 0.1,
        enemyResistance: 0.2,
        elementWeakness: 0,
        allElementWeakness: 0,
        penetrationBonus: 0.5,
        convertRestraint: 0,
        convertReverse: 0,
        convertCut: 0,
        convertPierce: 0,
        convertShock: 0,
        convertCalamity: 0,
        enemyDefense: 300,
        ignoreDefense: 0,
        attackerLevel: 80,
        enemyLevel: 80,
        boostBonus: 0.2,
        desperateBonus: 0.1,
        hpPercent: 0.7,
        imbalanceBonus: 0.3,
        triggerBonus: 0,
        skillRate: 2,
        skillFlatDamage: 0,
        skillPowerMultiplier: 1,
        weaponMasteryEnabled: true,
        weaponMasteryMultiplier: 1.2,
        skillWeaponEnabled: false,
        imbalanceEnabled: false,
        damageType: "切割",
        enemyHpType: "生命",
        fullnessConversion: 0,
        // 充盈威力 1 起始：无加成时为 1（100% 基准）
        fullnessModBonus: 1,
        fullnessFieldEnabled: false,
    }
}

/**
 * 创建技能伤害默认输入，便于快速进入调试。
 * @returns 默认技能输入
 */
function createDefaultSkillInput(): SkillDamageInput {
    return {
        enemyResistance: 0.2,
        elementWeakness: 0,
        allElementWeakness: 0,
        penetrationBonus: 0.15,
        convertRestraint: 0,
        convertReverse: 0,
        convertCut: 0,
        convertPierce: 0,
        convertShock: 0,
        convertCalamity: 0,
        enemyDefense: 300,
        ignoreDefense: 0,
        skillIgnoreDefense: 0,
        attackerLevel: 80,
        enemyLevel: 80,
        baseDamageBonus: 0.25,
        skillDamageBonus: 0.3,
        factionBonus: 0,
        elementDamageIncrease: 0,
        physicalDamageIncrease: 0,
        attackTypeDamageBonus: 0,
        attackTypeIndependentBonus: 0,
        seasonBonus: 0,
        independentBonus: 0.15,
        skillIndependentBonus: 0,
        skillAdditionalDamage: 0,
        summonDamageBonus: 0,
        summonIndependentBonus: 0,
        boostBonus: 0.2,
        desperateBonus: 0.1,
        hpPercent: 0.7,
        imbalanceBonus: 0.3,
        charBaseAttack: 1200,
        charAttackBonus: 0.4,
        resonanceGain: 0,
        elementalDamageBonus: 0.33,
        fixedAttackAdd: 0,
        skillRate: 2,
        skillFlatDamage: 0,
        skillPowerMultiplier: 1,
        imbalanceEnabled: false,
        summonEnabled: false,
        fullnessPower: 1,
        fullnessFieldEnabled: false,
    }
}

/**
 * 创建 DOT 伤害默认输入，便于快速进入调试。
 * @returns 默认 DOT 输入
 */
function createDefaultDotInput(): DotDamageInput {
    return {
        charAttack: 1200,
        weaponAttack: 800,
        fullnessPower: 6.5,
        baseDamageBonus: 0.25,
        factionBonus: 0,
        seasonBonus: 0,
        skillFreq: 0,
        weaponOwnFreq: 2.5,
        otherFreq: 0,
        otherElementCount: 1,
        boostBonus: 0,
        desperateBonus: 0,
        hpPercent: 0.7,
        enemyResistance: 0.2,
        elementWeakness: 0,
        allElementWeakness: 0,
        penetrationBonus: 0.15,
        convertRestraint: 0,
        convertReverse: 0,
    }
}

const ui = useUIStore()
const inv = useInvStore()
// 步骤说明在 computed 内取词；i18next-vue 的 t 会记录语言依赖，切换语言时步骤重算
const { t } = useTranslation()
const selectedCharForImport = useLocalStorage("selectedChar", "赛琪")
const selectedCharForImportId = computed(() => charMap.get(selectedCharForImport.value)?.id || 0)
const charSettingsForImport = useCharSettings(selectedCharForImportId)
const timelinesForImport = useTimeline(selectedCharForImport)

interface ImportSkillField {
    名称: string
    safeName: string
    影响?: string
    tag?: string[]
    值: number
    值2?: number
}

/**
 * 将最终值拆分为“基础值 + 加成”结构，便于回填输入表单。
 * @param base 基础值
 * @param finalValue 最终值
 * @returns 拆分后的基础值与加成
 */
function splitBaseAndBonus(base: number, finalValue: number): { base: number; bonus: number } {
    if (Math.abs(base) <= Number.EPSILON) {
        return { base: finalValue, bonus: 0 }
    }
    return {
        base,
        bonus: safeDivide(finalValue, base) - 1,
    }
}

/**
 * 根据角色最终攻击逆推出“角色攻击加成”。
 * 采用与武器攻击一致的逆推方式，避免直接读取总加成时丢失 getModsBonus 影响。
 * @param finalCharAttack 角色最终攻击
 * @param charBaseAttack 角色基础攻击
 * @param resonanceGain 和鸣增益
 * @param elementalDamageBonus 属性攻击加成
 * @param fixedAttackAdd 固定攻击
 * @returns 逆推后的角色攻击加成
 */
function deriveCharAttackBonus(
    finalCharAttack: number,
    charBaseAttack: number,
    resonanceGain: number,
    elementalDamageBonus: number,
    fixedAttackAdd: number
): number {
    const denominator = charBaseAttack * (1 + elementalDamageBonus)
    if (denominator <= Number.EPSILON) return 0
    const attackWithoutFlat = finalCharAttack - fixedAttackAdd
    return toFiniteNumber(safeDivide(attackWithoutFlat, denominator) - 1 - resonanceGain)
}

/**
 * 将 AST 标识符规范化为技能字段匹配关键字。
 * @param identifier 标识符
 * @returns 去除方括号后的关键字
 */
function normalizeIdentifierForSkillField(identifier: string): string {
    const trimmed = identifier.trim()
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

/**
 * 判断字段是否为可用于倍率导入的伤害/治疗字段。
 * @param field 技能字段
 * @returns 是否属于伤害/治疗字段
 */
function isImportableDamageField(field: ImportSkillField): boolean {
    return field.名称.endsWith("伤害") || field.名称.endsWith("治疗")
}

/**
 * 判断技能字段是否受“技能威力”影响。
 * @param field 技能字段
 * @returns 是否受技能威力影响
 */
function isSkillFieldAffectedByPower(field: ImportSkillField): boolean {
    if (!field.影响) return false
    return field.影响.split(",").some(item => item.trim() === "技能威力")
}

/**
 * 从 targetFunction 解析目标字段，优先导入表达式对应的伤害字段倍率。
 * @param build 当前构筑
 * @returns 命中的技能字段；解析失败或未命中时返回 undefined
 */
function resolveSkillFieldFromTargetFunction(build: CharBuild): ImportSkillField | undefined {
    const selectedSkill = build.selectedSkill
    const targetFunction = (build.targetFunction || "").trim()
    if (!selectedSkill || !targetFunction) return undefined

    const identifiers = build.getIdentifierNames(targetFunction)
    if (identifiers.length === 0) return undefined

    for (const identifier of identifiers) {
        const keyword = normalizeIdentifierForSkillField(identifier)
        if (!keyword || keyword === "攻击" || keyword === "防御" || keyword === "生命") continue
        const matched = selectedSkill.字段.find(
            field => isImportableDamageField(field) && (field.safeName.includes(keyword) || field.名称.includes(keyword))
        )
        if (matched) {
            return matched
        }
    }
    return undefined
}

/**
 * 从当前技能字段提取“技能倍率 + 固定值”线性参数。
 * @param build 当前构筑
 * @param skillMul 技能倍率乘数
 * @param skillAdd 技能倍率加数
 * @returns 技能倍率、固定值与威力影响标记
 */
function extractSkillRateAndFlat(
    build: CharBuild,
    skillMul: number,
    skillAdd: number
): { rate: number; flat: number; affectedByPower: boolean } {
    const selectedSkill = build.selectedSkill
    if (!selectedSkill) return { rate: 1, flat: 0, affectedByPower: false }

    const fallbackDamageField =
        selectedSkill.字段.find(field => field.名称.endsWith("伤害") && !field.名称.includes("召唤物")) ||
        selectedSkill.字段.find(field => field.名称.endsWith("伤害"))
    const damageField = resolveSkillFieldFromTargetFunction(build) || fallbackDamageField
    if (!damageField) return { rate: 1, flat: 0, affectedByPower: false }

    const rate = toFiniteNumber(damageField.值 * skillMul + skillAdd, 1)
    const flat = toFiniteNumber(damageField.值2 || 0)
    return {
        rate,
        flat,
        affectedByPower: isSkillFieldAffectedByPower(damageField),
    }
}

/**
 * 解析当前构筑实际结算的伤害字段（优先 targetFunction 命中，其次兜底伤害字段）。
 * 返回对象来自 `selectedSkill.字段`，可读取原始 tag。
 * @param build 当前构筑
 * @returns 结算字段；无技能或字段时返回 undefined
 */
function resolveResolvedDamageField(build: CharBuild): ImportSkillField | undefined {
    const selectedSkill = build.selectedSkill
    if (!selectedSkill) return undefined

    const fallbackDamageField =
        selectedSkill.字段.find(field => field.名称.endsWith("伤害") && !field.名称.includes("召唤物")) ||
        selectedSkill.字段.find(field => field.名称.endsWith("伤害"))
    const targetField = resolveSkillFieldFromTargetFunction(build)
    return targetField
        ? selectedSkill.字段.find(field => field.safeName === targetField.safeName && field.名称 === targetField.名称) || fallbackDamageField
        : fallbackDamageField
}

/**
 * 判断当前结算字段的 tag 是否包含指定关键字。
 * @param build 当前构筑
 * @param tag 关键字（如「充盈」「召唤物」）
 * @returns 是否命中
 */
function isResolvedFieldTagged(build: CharBuild, tag: string): boolean {
    return !!resolveResolvedDamageField(build)?.tag?.includes(tag)
}

/**
 * 解析当前构筑使用的时间线（优先内联动作，其次命名时间线）。
 * @param charName 角色名称
 * @param baseName 技能名
 * @param actions 内联动作配置
 * @returns 可用于 CharBuild 的时间线对象
 */
function resolveTimelineFromCurrentBuild(
    charName: string,
    baseName: string,
    actions: (typeof charSettingsForImport.value)["actions"] | null | undefined
): CharBuildTimeline | undefined {
    if (actions?.enable) {
        return CharBuildTimeline.fromRaw(inlineActionsToTimeline(actions, charName))
    }
    const raw = timelinesForImport.value.find(item => item.name === baseName)
    return raw ? CharBuildTimeline.fromRaw(raw) : undefined
}

/**
 * 基于当前 CharBuildView 本地构筑创建 CharBuild 实例。
 * @returns 当前构筑实例
 */
function createBuildFromCurrentCharView(): CharBuild {
    const charName = selectedCharForImport.value
    if (!charName) {
        throw new Error("未找到当前角色，请先在角色构筑页选择角色")
    }

    const rawSettings = charSettingsForImport.value
    const fallbackChar = LeveledCharHelper.fromId(selectedCharForImportId.value, rawSettings.charLevel)
    const baseName = rawSettings.baseName || fallbackChar.技能[0]?.名称 || ""
    if (!baseName) {
        throw new Error("当前构筑未配置技能")
    }

    const normalizedSettings = {
        ...rawSettings,
        baseName,
    }
    const timeline = resolveTimelineFromCurrentBuild(charName, baseName, normalizedSettings.actions)
    return createCharBuildFromSettings(selectedCharForImportId.value, normalizedSettings, inv, timeline)
}

/**
 * 读取对象上的有限数值属性，缺失或非数字时按 0。
 * @param attrs 属性对象
 * @param key 属性键
 * @returns 数值
 */
function readNumericAttribute(attrs: object | null | undefined, key: string): number {
    const value = (attrs as Record<string, unknown> | null | undefined)?.[key]
    return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 * 导入构筑时的角色元素弱点（只作用于角色元素分量）。
 * @param build 当前构筑
 * @param attrs 已算好的角色/武器属性
 * @returns 角色元素弱点
 */
function resolveCharElementWeakness(build: CharBuild, attrs: object): number {
    return readNumericAttribute(attrs, `${build.char.属性}属性弱点`)
}

/**
 * 导入构筑时的阵营增伤：歧视 + 敌方阵营对应增伤（与增伤同池加算）。
 * @param build 当前构筑
 * @param attrs 已算好的角色/武器属性
 * @returns 阵营增伤
 */
function resolveFactionBonus(build: CharBuild, attrs: object | null | undefined): number {
    const factionKey = factionBonusKeyForEnemy(build.enemy?.f)
    return readNumericAttribute(attrs, "歧视") + (factionKey ? readNumericAttribute(attrs, factionKey) : 0)
}

/**
 * 导入构筑时的元素增伤：泛化 `元素增伤` + 角色元素的 `<元素>属性增伤`。
 * @param build 当前构筑
 * @param attrs 已算好的角色/武器属性
 * @returns 元素增伤
 */
function resolveElementDamageIncrease(build: CharBuild, attrs: object): number {
    return readNumericAttribute(attrs, "元素增伤") + readNumericAttribute(attrs, `${build.char.属性}属性增伤`)
}

/**
 * 将 CharBuild 快照映射为武器模式输入参数。
 * @param build 当前构筑
 * @returns 武器模式输入
 */
function buildWeaponInputFromCharBuild(build: CharBuild): WeaponDamageInput {
    const result = createDefaultWeaponInput()
    const attrs = build.calculateWeaponAttributes()
    const weaponAttrs = attrs.weapon
    const selectedWeapon = build.selectedWeapon
    const weaponPrefix = selectedWeapon?.类型 || "角色"
    const masteryEnabled = !!(selectedWeapon && (build.char.精通.includes(selectedWeapon.类别) || build.char.精通.includes("全部类型")))
    // 同律武器精通倍率 1.4，普通武器 1.2
    const masteryMultiplier = selectedWeapon?.类型.startsWith("同律") ? 1.4 : 1.2
    // 武器物理加成：泛化 `物理`（旧口径兜底）+ 按武器伤害类型匹配的具体口径（新数据，如切割攻击）
    const damageTypeAttackKey = selectedWeapon?.伤害类型 ? `${selectedWeapon.伤害类型}攻击` : undefined
    const physicalDamageBonus = selectedWeapon
        ? build.getTotalBonus("物理", weaponPrefix) + (damageTypeAttackKey ? build.getTotalBonus(damageTypeAttackKey, weaponPrefix) : 0)
        : 0
    const weaponBaseAttack = selectedWeapon?.基础攻击 || 0
    const weaponAttackDenominator = weaponBaseAttack * (masteryEnabled ? masteryMultiplier : 1) * (1 + physicalDamageBonus)
    const weaponAttackBonus = weaponAttackDenominator > Number.EPSILON ? safeDivide(weaponAttrs?.攻击 || 0, weaponAttackDenominator) - 1 : 0
    const critRateSplit = splitBaseAndBonus(selectedWeapon?.基础暴击 || 0, weaponAttrs?.暴击 || 0)
    const critDamageSplit = splitBaseAndBonus(selectedWeapon?.基础暴伤 || 0, weaponAttrs?.暴伤 || 0)
    const triggerSplit = splitBaseAndBonus(selectedWeapon?.基础触发 || 0, weaponAttrs?.触发 || 0)
    const currentHpType = (build.enemy.currentHPType || "生命") as HpTypeKey
    const {
        rate: skillRate,
        flat: skillFlatDamage,
        affectedByPower,
    } = extractSkillRateAndFlat(build, attrs.技能倍率乘数 || 1, attrs.技能倍率加数 || 0)
    const charBaseAttack = build.char.基础攻击
    const resonanceGain = build.resonanceGain
    // 属性攻击乘区：泛化 `属性攻击`（旧口径兜底）+ 本角色元素的具体口径（新数据）
    const elementalDamageBonus = build.getTotalBonus("属性攻击") + build.getTotalBonus(`${build.char.属性}属性攻击`)
    const fixedAttackAdd = build.getTotalBonus("固定攻击")
    const charAttackBonus = deriveCharAttackBonus(attrs.攻击, charBaseAttack, resonanceGain, elementalDamageBonus, fixedAttackAdd)

    result.charBaseAttack = charBaseAttack
    result.charAttackBonus = charAttackBonus
    result.resonanceGain = resonanceGain
    result.elementalDamageBonus = elementalDamageBonus
    result.fixedAttackAdd = fixedAttackAdd
    result.weaponBaseAttack = weaponBaseAttack
    result.weaponAttackBonus = toFiniteNumber(weaponAttackBonus)
    result.physicalDamageBonus = physicalDamageBonus
    result.baseCritRate = toFiniteNumber(critRateSplit.base)
    result.critRateBonus = toFiniteNumber(critRateSplit.bonus)
    result.baseCritDamage = toFiniteNumber(critDamageSplit.base)
    result.critDamageBonus = toFiniteNumber(critDamageSplit.bonus)
    result.baseTriggerRate = toFiniteNumber(triggerSplit.base)
    result.triggerRateBonus = toFiniteNumber(triggerSplit.bonus)
    result.baseDamageBonus = attrs.增伤 + (weaponAttrs?.增伤 || 0)
    result.weaponDamageBonus = attrs.武器伤害
    // 阵营增伤与普通增伤同池：角色侧 + 该武器槽 MOD（面板）
    result.factionBonus = resolveFactionBonus(build, attrs) + resolveFactionBonus(build, weaponAttrs)
    result.elementDamageIncrease = resolveElementDamageIncrease(build, attrs)
    result.physicalDamageIncrease = readNumericAttribute(attrs, "物理增伤")
    // 攻击类型增伤 / 武器独立增伤惩罚由字段级 tag 与 MOD 决定，页面不做构筑级回填
    result.attackTypeDamageBonus = 0
    result.attackTypeIndependentBonus = 0
    result.weaponIndependentPenalty = 0
    result.seasonBonus = readNumericAttribute(attrs, "赛季增伤")
    result.independentBonus = attrs.独立增伤
    result.weaponIndependentBonus = weaponAttrs?.独立增伤 || 0
    // 追伤按引擎口径回填七分量；聚合「追加伤害」是只读 Σ，不进入因子，也不回填为输入。
    Object.assign(result, resolveAdditionalDamageComponents(weaponAttrs))
    result.enemyResistance = build.enemyResistance
    result.elementWeakness = resolveCharElementWeakness(build, attrs)
    result.allElementWeakness = readNumericAttribute(attrs, "全属性弱点")
    result.penetrationBonus = attrs.属性穿透
    result.convertRestraint = readNumericAttribute(attrs, "转属克")
    result.convertReverse = readNumericAttribute(attrs, "转属逆")
    result.convertCut = readNumericAttribute(attrs, "转切割")
    result.convertPierce = readNumericAttribute(attrs, "转贯穿")
    result.convertShock = readNumericAttribute(attrs, "转震荡")
    result.convertCalamity = readNumericAttribute(attrs, "转灾厄")
    result.enemyDefense = build.enemy.def || 300
    result.ignoreDefense = attrs.无视防御
    result.attackerLevel = build.char.等级 || 80
    result.enemyLevel = build.enemy.等级 || 80
    result.boostBonus = attrs.昂扬
    result.desperateBonus = attrs.背水
    result.hpPercent = build.hpPercent
    result.imbalanceBonus = attrs.失衡易伤
    result.triggerBonus = build.getTotalBonus("触发倍率")
    result.skillRate = skillRate
    result.skillFlatDamage = skillFlatDamage
    result.skillPowerMultiplier = attrs.技能威力
    result.skillWeaponEnabled = affectedByPower
    result.weaponMasteryEnabled = masteryEnabled
    result.weaponMasteryMultiplier = masteryMultiplier
    result.damageType = (selectedWeapon?.伤害类型 as DamageTypeKey) || "切割"
    result.enemyHpType = currentHpType
    result.imbalanceEnabled = build.imbalance
    /**
     * 充盈：充盈威力（角色属性，1 起始总倍率）= 100% 基础 + 角色MOD充盈威力加成 + Σ各武器溢出触发 × 该武器充盈转化。
     * 本页武器模式只建模当前武器，导入时扣除当前武器的溢出转化，避免与“武器转化充盈威力”步骤重复计算。
     */
    const weaponFullnessConversion = weaponAttrs?.充盈转化 || 0
    const selectedWeaponOverflow = Math.max(0, (weaponAttrs?.触发 || 0) - 1)
    result.fullnessConversion = weaponFullnessConversion
    result.fullnessModBonus = Math.max(0, attrs.充盈威力 - selectedWeaponOverflow * weaponFullnessConversion)
    result.fullnessFieldEnabled = isResolvedFieldTagged(build, "充盈")
    return result
}

/**
 * 将 CharBuild 快照映射为技能模式输入参数。
 * @param build 当前构筑
 * @returns 技能模式输入
 */
function buildSkillInputFromCharBuild(build: CharBuild): SkillDamageInput {
    const result = createDefaultSkillInput()
    const attrs = build.calculateAttributes()
    const {
        rate: skillRate,
        flat: skillFlatDamage,
        affectedByPower,
    } = extractSkillRateAndFlat(build, attrs.技能倍率乘数 || 1, attrs.技能倍率加数 || 0)
    const charBaseAttack = build.char.基础攻击
    const resonanceGain = build.resonanceGain
    // 属性攻击乘区：泛化 `属性攻击`（旧口径兜底）+ 本角色元素的具体口径（新数据）
    const elementalDamageBonus = build.getTotalBonus("属性攻击") + build.getTotalBonus(`${build.char.属性}属性攻击`)
    const fixedAttackAdd = build.getTotalBonus("固定攻击")
    const charAttackBonus = deriveCharAttackBonus(attrs.攻击, charBaseAttack, resonanceGain, elementalDamageBonus, fixedAttackAdd)

    result.enemyResistance = build.enemyResistance
    result.elementWeakness = resolveCharElementWeakness(build, attrs)
    result.allElementWeakness = readNumericAttribute(attrs, "全属性弱点")
    result.penetrationBonus = attrs.属性穿透
    result.convertRestraint = readNumericAttribute(attrs, "转属克")
    result.convertReverse = readNumericAttribute(attrs, "转属逆")
    result.convertCut = readNumericAttribute(attrs, "转切割")
    result.convertPierce = readNumericAttribute(attrs, "转贯穿")
    result.convertShock = readNumericAttribute(attrs, "转震荡")
    result.convertCalamity = readNumericAttribute(attrs, "转灾厄")
    result.enemyDefense = build.enemy.def || 300
    result.ignoreDefense = attrs.无视防御
    result.skillIgnoreDefense = attrs.技能无视防御
    result.attackerLevel = build.char.等级 || 80
    result.enemyLevel = build.enemy.等级 || 80
    result.baseDamageBonus = attrs.增伤
    result.skillDamageBonus = attrs.技能伤害
    result.factionBonus = resolveFactionBonus(build, attrs)
    result.elementDamageIncrease = resolveElementDamageIncrease(build, attrs)
    result.physicalDamageIncrease = readNumericAttribute(attrs, "物理增伤")
    result.attackTypeDamageBonus = 0
    result.attackTypeIndependentBonus = 0
    result.seasonBonus = readNumericAttribute(attrs, "赛季增伤")
    result.independentBonus = attrs.独立增伤
    result.skillIndependentBonus = readNumericAttribute(attrs, "技能独立增伤")
    result.skillAdditionalDamage = readNumericAttribute(attrs, "技能追伤")
    result.summonDamageBonus = readNumericAttribute(attrs, "召唤物伤害")
    result.summonIndependentBonus = readNumericAttribute(attrs, "召唤物独立增伤")
    result.summonEnabled = isResolvedFieldTagged(build, "召唤物")
    result.boostBonus = attrs.昂扬
    result.desperateBonus = attrs.背水
    result.hpPercent = build.hpPercent
    result.imbalanceBonus = attrs.失衡易伤
    result.charBaseAttack = charBaseAttack
    result.charAttackBonus = charAttackBonus
    result.resonanceGain = resonanceGain
    result.elementalDamageBonus = elementalDamageBonus
    result.fixedAttackAdd = fixedAttackAdd
    result.skillRate = skillRate
    result.skillFlatDamage = skillFlatDamage
    // 技能威力只对影响列表含「技能威力」的字段生效（与 LeveledSkill 字段求值同口径）
    result.skillPowerMultiplier = affectedByPower ? attrs.技能威力 : 1
    result.imbalanceEnabled = build.imbalance
    // 充盈：充盈威力为角色属性（MOD加成 + 武器溢出转化汇总），技能模式直接取汇总结果。
    // 注意：calculateAttributes 只含角色MOD加成，武器溢出转化需经 calculateWeaponAttributes 汇总。
    const weaponAttrsForFullness = build.calculateWeaponAttributes()
    result.fullnessPower = weaponAttrsForFullness.充盈威力 ?? 1
    result.fullnessFieldEnabled = isResolvedFieldTagged(build, "充盈")
    return result
}

/**
 * 将 CharBuild 快照映射为 DOT 模式输入参数。
 * @param build 当前构筑
 * @returns DOT 模式输入
 */
function buildDotInputFromCharBuild(build: CharBuild): DotDamageInput {
    const result = createDefaultDotInput()
    const attrs = build.calculateWeaponAttributes()
    const freqs = build.calculateDotFrequencies(attrs)
    // 技能来源自身属性频率仅吃角色攻击；其余自身属性频率与其余属性频率均来自武器，吃对应武器攻击
    const skillFreq = freqs.sources.find(source => source.type === "skill")?.ownFreq || 0
    const weaponFreq = freqs.ownFreq - skillFreq + freqs.otherFreq
    // 多把武器同时贡献时，武器攻击按各武器来源频率加权平均，保证拆解公式与 CharBuild.calculateDotDamage 总值一致
    const weightedWeaponAttack = freqs.sources.reduce(
        (sum, source) => (source.type === "skill" ? sum : sum + source.weaponAttack * (source.ownFreq + source.otherFreq)),
        0
    )
    result.charAttack = attrs.攻击
    result.weaponAttack = weaponFreq > Number.EPSILON ? weightedWeaponAttack / weaponFreq : 0
    result.fullnessPower = attrs.充盈威力 ?? 1
    result.baseDamageBonus = attrs.增伤
    result.factionBonus = resolveFactionBonus(build, attrs)
    result.seasonBonus = readNumericAttribute(attrs, "赛季增伤")
    result.skillFreq = skillFreq
    result.weaponOwnFreq = freqs.ownFreq - skillFreq
    result.otherFreq = freqs.otherFreq
    result.otherElementCount = Math.max(...freqs.sources.filter(source => source.type !== "skill").map(source => source.otherElementCount), 0)
    result.boostBonus = attrs.昂扬
    result.desperateBonus = attrs.背水
    result.hpPercent = build.hpPercent
    result.enemyResistance = build.enemyResistance
    result.elementWeakness = resolveCharElementWeakness(build, attrs)
    result.allElementWeakness = readNumericAttribute(attrs, "全属性弱点")
    result.penetrationBonus = attrs.属性穿透
    result.convertRestraint = readNumericAttribute(attrs, "转属克")
    result.convertReverse = readNumericAttribute(attrs, "转属逆")
    return result
}

/**
 * 从当前 CharBuildView 构筑导入参数到武器/技能两种模式。
 */
function importFromCurrentCharBuild(): void {
    try {
        const build = createBuildFromCurrentCharView()
        replaceReactiveObject(weaponInput, buildWeaponInputFromCharBuild(build))
        replaceReactiveObject(skillInput, buildSkillInputFromCharBuild(build))
        replaceReactiveObject(dotInput, buildDotInputFromCharBuild(build))
        weaponOverrides.value = {}
        skillOverrides.value = {}
        dotOverrides.value = {}
        ui.showSuccessMessage(`已导入当前构筑: ${selectedCharForImport.value} / ${build.baseName}`)
    } catch (error) {
        ui.showErrorMessage("导入失败:", error instanceof Error ? error.message : "未知错误")
    }
}

/**
 * 将来源对象覆盖到响应式对象上，保持引用不变。
 * @param target 目标对象
 * @param source 来源对象
 */
function replaceReactiveObject<T extends object>(target: T, source: T): void {
    for (const key of Object.keys(source) as (keyof T)[]) {
        target[key] = source[key]
    }
}

/**
 * 构建武器伤害拆解步骤，公式与 CharBuild.calculateDamage 武器池口径保持一致。
 * @returns 武器步骤定义
 */
function buildWeaponStepDefinitions(): DamageStepDefinition<WeaponDamageInput>[] {
    return [
        {
            id: "weaponMasteryRatio",
            title: "武器精通倍率",
            formula: "武器精通倍率 = 命中武器精通时为 1.2（同律武器 1.4），否则为 1",
            compute: ({ input }) => (input.weaponMasteryEnabled ? input.weaponMasteryMultiplier : 1),
            explain: ({ input }, value) =>
                `${input.weaponMasteryEnabled ? `命中精通(${formatNumber(input.weaponMasteryMultiplier)}倍)` : "未命中精通"} => ${formatNumber(value)}`,
        },
        {
            id: "charAttack",
            title: "角色攻击",
            formula: "角色攻击 = (角色基础攻击 * (1 + 角色攻击加成 + 和鸣增益) * (1 + 属性攻击) + 固定攻击)保留2位",
            compute: ({ input }) => {
                const raw =
                    input.charBaseAttack * (1 + input.charAttackBonus + input.resonanceGain) * (1 + input.elementalDamageBonus) +
                    input.fixedAttackAdd
                return roundByDigits(raw, 2)
            },
            explain: ({ input }, value) => {
                const raw =
                    input.charBaseAttack * (1 + input.charAttackBonus + input.resonanceGain) * (1 + input.elementalDamageBonus) +
                    input.fixedAttackAdd
                return `(${formatNumber(input.charBaseAttack)} * (1 + ${formatNumber(input.charAttackBonus)} + ${formatNumber(input.resonanceGain)}) * (1 + ${formatNumber(input.elementalDamageBonus)}) + ${formatNumber(input.fixedAttackAdd)}) = ${formatNumber(raw)} -> ${formatNumber(value)}`
            },
        },
        {
            id: "weaponAttack",
            title: "武器攻击",
            formula: "武器攻击 = (武器基础攻击 * (1 + 武器攻击加成) * 武器精通倍率 * (1 + 物理))保留2位",
            compute: ({ input, get }) => {
                const raw =
                    input.weaponBaseAttack * (1 + input.weaponAttackBonus) * get("weaponMasteryRatio") * (1 + input.physicalDamageBonus)
                return roundByDigits(raw, 2)
            },
            explain: ({ input, get }, value) => {
                const raw =
                    input.weaponBaseAttack * (1 + input.weaponAttackBonus) * get("weaponMasteryRatio") * (1 + input.physicalDamageBonus)
                return `(${formatNumber(input.weaponBaseAttack)} * (1 + ${formatNumber(input.weaponAttackBonus)}) * ${formatNumber(get("weaponMasteryRatio"))} * (1 + ${formatNumber(input.physicalDamageBonus)})) = ${formatNumber(raw)} -> ${formatNumber(value)}`
            },
        },
        {
            id: "totalWeaponDamage",
            title: "总攻击",
            formula: "总攻击 = 角色攻击 + 武器攻击",
            compute: ({ get }) => get("charAttack") + get("weaponAttack"),
            explain: ({ get }, value) =>
                `${formatNumber(get("charAttack"))} + ${formatNumber(get("weaponAttack"))} = ${formatNumber(value)}`,
        },
        {
            id: "weaponPhysicalRatio",
            title: "武器物理占比",
            formula: "武器物理占比 = 灾厄伤害时取 1，否则 武器攻击 / 总攻击",
            compute: ({ input, get }) => (input.damageType === "灾厄" ? 1 : safeDivide(get("weaponAttack"), get("totalWeaponDamage"))),
            explain: ({ input, get }, value) =>
                input.damageType === "灾厄"
                    ? `灾厄伤害 => ${formatNumber(value)}`
                    : `${formatNumber(get("weaponAttack"))} / ${formatNumber(get("totalWeaponDamage"))} = ${formatNumber(value)}`,
        },
        {
            id: "weaponElementalRatio",
            title: "武器元素占比",
            formula: "武器元素占比 = 灾厄伤害时取 0，否则 角色攻击 / 总攻击",
            compute: ({ input, get }) => (input.damageType === "灾厄" ? 0 : safeDivide(get("charAttack"), get("totalWeaponDamage"))),
            explain: ({ input, get }, value) =>
                input.damageType === "灾厄"
                    ? `灾厄伤害 => ${formatNumber(value)}`
                    : `${formatNumber(get("charAttack"))} / ${formatNumber(get("totalWeaponDamage"))} = ${formatNumber(value)}`,
        },
        {
            id: "triggerDamageMultiplier",
            title: "触发倍率",
            formula:
                "触发倍率 = 灾厄伤害时(敌人抗性不为 0 则 1 + 触发倍率加成，否则为 1)，其余类型匹配敌方生命类型时 1 + 生命类型系数 + 触发倍率加成，否则为 1",
            compute: ({ input }) => triggerMultiplierForType(input, input.damageType),
            explain: ({ input }, value) => {
                if (input.damageType === "灾厄") {
                    return input.enemyResistance !== 0
                        ? `1 + ${formatNumber(input.triggerBonus)} = ${formatNumber(value)}`
                        : `敌人抗性为 0 => ${formatNumber(value)}`
                }
                const matchedType = HP_TYPE_DAMAGE[input.enemyHpType]
                return input.damageType === matchedType
                    ? `1 + ${formatNumber(HP_TYPE_COEFFICIENTS[input.enemyHpType])} + ${formatNumber(input.triggerBonus)} = ${formatNumber(value)}`
                    : `${input.damageType} 不匹配 ${input.enemyHpType}(${matchedType}) => ${formatNumber(value)}`
            },
        },
        {
            id: "finalTriggerRate",
            title: "最终触发率",
            formula: "最终触发率 = 基础触发 * (1 + 触发加成)，触发效果按 100% 封顶",
            compute: ({ input }) => input.baseTriggerRate * (1 + input.triggerRateBonus),
            explain: ({ input }, value) =>
                `${formatNumber(input.baseTriggerRate)} * (1 + ${formatNumber(input.triggerRateBonus)}) = ${formatNumber(value)}（触发效果按 ${formatNumber(clampNumber(value, 0, 1))} 结算）`,
        },
        {
            id: "triggerExpectedDamageAdd",
            title: "触发期望倍率",
            formula: "触发期望倍率 = 1 + (触发倍率 - 1) * min(1, 最终触发率)",
            compute: ({ get }) => 1 + (get("triggerDamageMultiplier") - 1) * clampNumber(get("finalTriggerRate"), 0, 1),
            explain: ({ get }, value) =>
                `1 + (${formatNumber(get("triggerDamageMultiplier"))} - 1) * ${formatNumber(clampNumber(get("finalTriggerRate"), 0, 1))} = ${formatNumber(value)}`,
        },
        {
            id: "cutTriggerMultiplier",
            title: "转切割触发倍率",
            formula: "转切割触发倍率 = 切割匹配敌方生命类型时 1 + 生命类型系数 + 触发倍率加成，否则为 1",
            compute: ({ input }) => triggerMultiplierForType(input, "切割"),
            explain: ({ input }, value) =>
                `${HP_TYPE_DAMAGE[input.enemyHpType] === "切割" ? "匹配" : "不匹配"} => ${formatNumber(value)}`,
        },
        {
            id: "pierceTriggerMultiplier",
            title: "转贯穿触发倍率",
            formula: "转贯穿触发倍率 = 贯穿匹配敌方生命类型时 1 + 生命类型系数 + 触发倍率加成，否则为 1",
            compute: ({ input }) => triggerMultiplierForType(input, "贯穿"),
            explain: ({ input }, value) =>
                `${HP_TYPE_DAMAGE[input.enemyHpType] === "贯穿" ? "匹配" : "不匹配"} => ${formatNumber(value)}`,
        },
        {
            id: "shockTriggerMultiplier",
            title: "转震荡触发倍率",
            formula: "转震荡触发倍率 = 震荡匹配敌方生命类型时 1 + 生命类型系数 + 触发倍率加成，否则为 1",
            compute: ({ input }) => triggerMultiplierForType(input, "震荡"),
            explain: ({ input }, value) =>
                `${HP_TYPE_DAMAGE[input.enemyHpType] === "震荡" ? "匹配" : "不匹配"} => ${formatNumber(value)}`,
        },
        {
            id: "calamityTriggerMultiplier",
            title: "转灾厄触发倍率",
            formula: "转灾厄触发倍率 = 敌人抗性不为 0 时 1 + 触发倍率加成，否则为 1",
            compute: ({ input }) => triggerMultiplierForType(input, "灾厄"),
            explain: ({ input }, value) =>
                `${input.enemyResistance !== 0 ? "敌人存在抗性" : "敌人抗性为 0"} => ${formatNumber(value)}`,
        },
        {
            id: "cutTriggerExpected",
            title: "转切割触发期望",
            formula: "转切割触发期望 = 1 + (转切割触发倍率 - 1) * min(1, 最终触发率)",
            compute: ({ get }) => 1 + (get("cutTriggerMultiplier") - 1) * clampNumber(get("finalTriggerRate"), 0, 1),
            explain: ({ get }, value) =>
                `1 + (${formatNumber(get("cutTriggerMultiplier"))} - 1) * ${formatNumber(clampNumber(get("finalTriggerRate"), 0, 1))} = ${formatNumber(value)}`,
        },
        {
            id: "pierceTriggerExpected",
            title: "转贯穿触发期望",
            formula: "转贯穿触发期望 = 1 + (转贯穿触发倍率 - 1) * min(1, 最终触发率)",
            compute: ({ get }) => 1 + (get("pierceTriggerMultiplier") - 1) * clampNumber(get("finalTriggerRate"), 0, 1),
            explain: ({ get }, value) =>
                `1 + (${formatNumber(get("pierceTriggerMultiplier"))} - 1) * ${formatNumber(clampNumber(get("finalTriggerRate"), 0, 1))} = ${formatNumber(value)}`,
        },
        {
            id: "shockTriggerExpected",
            title: "转震荡触发期望",
            formula: "转震荡触发期望 = 1 + (转震荡触发倍率 - 1) * min(1, 最终触发率)",
            compute: ({ get }) => 1 + (get("shockTriggerMultiplier") - 1) * clampNumber(get("finalTriggerRate"), 0, 1),
            explain: ({ get }, value) =>
                `1 + (${formatNumber(get("shockTriggerMultiplier"))} - 1) * ${formatNumber(clampNumber(get("finalTriggerRate"), 0, 1))} = ${formatNumber(value)}`,
        },
        {
            id: "calamityTriggerExpected",
            title: "转灾厄触发期望",
            formula: "转灾厄触发期望 = 1 + (转灾厄触发倍率 - 1) * min(1, 最终触发率)",
            compute: ({ get }) => 1 + (get("calamityTriggerMultiplier") - 1) * clampNumber(get("finalTriggerRate"), 0, 1),
            explain: ({ get }, value) =>
                `1 + (${formatNumber(get("calamityTriggerMultiplier"))} - 1) * ${formatNumber(clampNumber(get("finalTriggerRate"), 0, 1))} = ${formatNumber(value)}`,
        },
        {
            id: "finalCritRate",
            title: "最终暴击率",
            formula: "最终暴击率 = 基础暴击 * (1 + 暴击加成)",
            compute: ({ input }) => input.baseCritRate * (1 + input.critRateBonus),
            explain: ({ input }, value) =>
                `${formatNumber(input.baseCritRate)} * (1 + ${formatNumber(input.critRateBonus)}) = ${formatNumber(value)}`,
        },
        {
            id: "finalCritDamage",
            title: "最终暴伤",
            formula: "最终暴伤 = 基础暴伤 * (1 + 暴伤加成)",
            compute: ({ input }) => input.baseCritDamage * (1 + input.critDamageBonus),
            explain: ({ input }, value) =>
                `${formatNumber(input.baseCritDamage)} * (1 + ${formatNumber(input.critDamageBonus)}) = ${formatNumber(value)}`,
        },
        {
            id: "lowerCritDamage",
            title: "低暴击倍率",
            formula: "低暴击倍率 = (最终暴伤 - 1) * 最终暴击向下取整 + 1",
            compute: ({ get }) => (get("finalCritDamage") - 1) * Math.floor(get("finalCritRate")) + 1,
            explain: ({ get }, value) => {
                const floorCrit = Math.floor(get("finalCritRate"))
                return `(${formatNumber(get("finalCritDamage"))} - 1) * ${formatNumber(floorCrit)} + 1 = ${formatNumber(value)}`
            },
        },
        {
            id: "higherCritDamage",
            title: "高暴击倍率",
            formula: "高暴击倍率 = (最终暴伤 - 1) * 最终暴击向上取整 + 1",
            compute: ({ get }) => (get("finalCritDamage") - 1) * Math.ceil(get("finalCritRate")) + 1,
            explain: ({ get }, value) => {
                const ceilCrit = Math.ceil(get("finalCritRate"))
                return `(${formatNumber(get("finalCritDamage"))} - 1) * ${formatNumber(ceilCrit)} + 1 = ${formatNumber(value)}`
            },
        },
        {
            id: "critExpectedDamage",
            title: "暴击期望倍率",
            formula: "暴击期望倍率 = 1 + 最终暴击 * (最终暴伤 - 1)",
            compute: ({ get }) => 1 + get("finalCritRate") * (get("finalCritDamage") - 1),
            explain: ({ get }, value) =>
                `1 + ${formatNumber(get("finalCritRate"))} * (${formatNumber(get("finalCritDamage"))} - 1) = ${formatNumber(value)}`,
        },
        {
            id: "activeElementConvert",
            title: "生效属转比例",
            formula: "生效属转比例 = 敌人抗性 > 0 时取转属克，敌人抗性 < 0 时取转属逆，0 抗为 0",
            compute: ({ input }) => resolveActiveElementConvert(input),
            explain: ({ input }, value) =>
                `抗性 ${formatNumber(input.enemyResistance)} 取${input.enemyResistance > 0 ? "转属克" : input.enemyResistance < 0 ? "转属逆" : "无"} => ${formatNumber(value)}`,
        },
        {
            id: "convertPoolTotal",
            title: "转换池合计",
            formula: "转换池合计 = 生效属转比例 + 转切割 + 转贯穿 + 转震荡 + 转灾厄",
            compute: ({ input, get }) =>
                get("activeElementConvert") +
                Math.max(0, input.convertCut) +
                Math.max(0, input.convertPierce) +
                Math.max(0, input.convertShock) +
                Math.max(0, input.convertCalamity),
            explain: ({ input, get }, value) =>
                `${formatNumber(get("activeElementConvert"))} + ${formatNumber(Math.max(0, input.convertCut))} + ${formatNumber(Math.max(0, input.convertPierce))} + ${formatNumber(Math.max(0, input.convertShock))} + ${formatNumber(Math.max(0, input.convertCalamity))} = ${formatNumber(value)}`,
        },
        {
            id: "convertScale",
            title: "转换压缩系数",
            formula: "转换压缩系数 = 转换池合计 > 1 时为 1 / 转换池合计，否则为 1",
            compute: ({ get }) => (get("convertPoolTotal") > 1 ? 1 / get("convertPoolTotal") : 1),
            explain: ({ get }, value) =>
                get("convertPoolTotal") > 1
                    ? `1 / ${formatNumber(get("convertPoolTotal"))} = ${formatNumber(value)}`
                    : `转换池未超 100% => ${formatNumber(value)}`,
        },
        {
            id: "unconvertedRatio",
            title: "未转换比例",
            formula: "未转换比例 = max(0, 1 - min(1, 转换池合计))",
            compute: ({ get }) => Math.max(0, 1 - Math.min(1, get("convertPoolTotal"))),
            explain: ({ get }, value) => `max(0, 1 - min(1, ${formatNumber(get("convertPoolTotal"))})) = ${formatNumber(value)}`,
        },
        {
            id: "elementConvertRatio",
            title: "属转有效比例",
            formula: "属转有效比例 = min(1, 生效属转比例) * 转换压缩系数",
            compute: ({ get }) => Math.min(1, get("activeElementConvert")) * get("convertScale"),
            explain: ({ get }, value) =>
                `min(1, ${formatNumber(get("activeElementConvert"))}) * ${formatNumber(get("convertScale"))} = ${formatNumber(value)}`,
        },
        {
            id: "weaknessTotal",
            title: "属性弱点合计",
            formula: "属性弱点合计 = 元素弱点 + 全属性弱点（与敌人抗性同区加算）",
            compute: ({ input }) => input.elementWeakness + input.allElementWeakness,
            explain: ({ input }, value) =>
                `${formatNumber(input.elementWeakness)} + ${formatNumber(input.allElementWeakness)} = ${formatNumber(value)}`,
        },
        {
            id: "baseResistanceFactor",
            title: "基础抗性因子",
            formula: "基础抗性因子 = max(0, 1 - 敌人抗性 + 弱点合计)",
            compute: ({ input, get }) => Math.max(0, 1 - input.enemyResistance + get("weaknessTotal")),
            explain: ({ input, get }, value) =>
                `max(0, 1 - ${formatNumber(input.enemyResistance)} + ${formatNumber(get("weaknessTotal"))}) = ${formatNumber(value)}`,
        },
        {
            id: "flippedResistanceFactor",
            title: "翻转抗性因子",
            formula: "翻转抗性因子 = max(0, 1 - 翻转抗性 + 弱点合计)，敌人抗性大于 0 时翻转抗性为 -4，否则为 0.5",
            compute: ({ input, get }) => Math.max(0, 1 - (input.enemyResistance > 0 ? -4 : 0.5) + get("weaknessTotal")),
            explain: ({ input, get }, value) => {
                const flipped = input.enemyResistance > 0 ? -4 : 0.5
                return `max(0, 1 - ${formatNumber(flipped)} + ${formatNumber(get("weaknessTotal"))}) = ${formatNumber(value)}`
            },
        },
        {
            id: "elementalResistanceFactor",
            title: "元素抗性因子",
            formula: "元素抗性因子 = (1 - 属转有效比例) * 基础抗性因子 + 属转有效比例 * 翻转抗性因子",
            compute: ({ get }) =>
                (1 - get("elementConvertRatio")) * get("baseResistanceFactor") + get("elementConvertRatio") * get("flippedResistanceFactor"),
            explain: ({ get }, value) =>
                `(1 - ${formatNumber(get("elementConvertRatio"))}) * ${formatNumber(get("baseResistanceFactor"))} + ${formatNumber(get("elementConvertRatio"))} * ${formatNumber(get("flippedResistanceFactor"))} = ${formatNumber(value)}`,
        },
        {
            id: "physicalBasePart",
            title: "未转换物理分量",
            formula: "未转换物理分量 = 武器物理占比 * 未转换比例",
            compute: ({ get }) => get("weaponPhysicalRatio") * get("unconvertedRatio"),
            explain: ({ get }, value) =>
                `${formatNumber(get("weaponPhysicalRatio"))} * ${formatNumber(get("unconvertedRatio"))} = ${formatNumber(value)}`,
        },
        {
            id: "elementalBasePart",
            title: "未转换元素分量",
            formula: "未转换元素分量 = 武器元素占比 * 元素抗性因子 * 未转换比例",
            compute: ({ get }) => get("weaponElementalRatio") * get("elementalResistanceFactor") * get("unconvertedRatio"),
            explain: ({ get }, value) =>
                `${formatNumber(get("weaponElementalRatio"))} * ${formatNumber(get("elementalResistanceFactor"))} * ${formatNumber(get("unconvertedRatio"))} = ${formatNumber(value)}`,
        },
        {
            id: "convertedElementPhysicalPart",
            title: "属转物理分量",
            formula: "属转物理分量 = 武器物理占比 * 属转有效比例 * 翻转抗性因子",
            compute: ({ get }) => get("weaponPhysicalRatio") * get("elementConvertRatio") * get("flippedResistanceFactor"),
            explain: ({ get }, value) =>
                `${formatNumber(get("weaponPhysicalRatio"))} * ${formatNumber(get("elementConvertRatio"))} * ${formatNumber(get("flippedResistanceFactor"))} = ${formatNumber(value)}（转为属克/属逆元素结算）`,
        },
        {
            id: "convertedElementElementalPart",
            title: "属转元素分量",
            formula: "属转元素分量 = 武器元素占比 * 元素抗性因子 * 属转有效比例",
            compute: ({ get }) => get("weaponElementalRatio") * get("elementalResistanceFactor") * get("elementConvertRatio"),
            explain: ({ get }, value) =>
                `${formatNumber(get("weaponElementalRatio"))} * ${formatNumber(get("elementalResistanceFactor"))} * ${formatNumber(get("elementConvertRatio"))} = ${formatNumber(value)}（抗性已翻转，不重复翻转）`,
        },
        {
            id: "convertCutPart",
            title: "转切割分量",
            formula: "转切割分量 = (武器物理占比 + 武器元素占比 * 元素抗性因子) * max(0, 转切割) * 转换压缩系数",
            compute: ({ input, get }) =>
                (get("weaponPhysicalRatio") + get("weaponElementalRatio") * get("elementalResistanceFactor")) *
                Math.max(0, input.convertCut) *
                get("convertScale"),
            explain: ({ input, get }, value) =>
                `(${formatNumber(get("weaponPhysicalRatio"))} + ${formatNumber(get("weaponElementalRatio"))} * ${formatNumber(get("elementalResistanceFactor"))}) * ${formatNumber(Math.max(0, input.convertCut))} * ${formatNumber(get("convertScale"))} = ${formatNumber(value)}`,
        },
        {
            id: "convertPiercePart",
            title: "转贯穿分量",
            formula: "转贯穿分量 = (武器物理占比 + 武器元素占比 * 元素抗性因子) * max(0, 转贯穿) * 转换压缩系数",
            compute: ({ input, get }) =>
                (get("weaponPhysicalRatio") + get("weaponElementalRatio") * get("elementalResistanceFactor")) *
                Math.max(0, input.convertPierce) *
                get("convertScale"),
            explain: ({ input, get }, value) =>
                `(${formatNumber(get("weaponPhysicalRatio"))} + ${formatNumber(get("weaponElementalRatio"))} * ${formatNumber(get("elementalResistanceFactor"))}) * ${formatNumber(Math.max(0, input.convertPierce))} * ${formatNumber(get("convertScale"))} = ${formatNumber(value)}`,
        },
        {
            id: "convertShockPart",
            title: "转震荡分量",
            formula: "转震荡分量 = (武器物理占比 + 武器元素占比 * 元素抗性因子) * max(0, 转震荡) * 转换压缩系数",
            compute: ({ input, get }) =>
                (get("weaponPhysicalRatio") + get("weaponElementalRatio") * get("elementalResistanceFactor")) *
                Math.max(0, input.convertShock) *
                get("convertScale"),
            explain: ({ input, get }, value) =>
                `(${formatNumber(get("weaponPhysicalRatio"))} + ${formatNumber(get("weaponElementalRatio"))} * ${formatNumber(get("elementalResistanceFactor"))}) * ${formatNumber(Math.max(0, input.convertShock))} * ${formatNumber(get("convertScale"))} = ${formatNumber(value)}`,
        },
        {
            id: "convertCalamityPart",
            title: "转灾厄分量",
            formula: "转灾厄分量 = (武器物理占比 + 武器元素占比 * 元素抗性因子) * max(0, 转灾厄) * 转换压缩系数",
            compute: ({ input, get }) =>
                (get("weaponPhysicalRatio") + get("weaponElementalRatio") * get("elementalResistanceFactor")) *
                Math.max(0, input.convertCalamity) *
                get("convertScale"),
            explain: ({ input, get }, value) =>
                `(${formatNumber(get("weaponPhysicalRatio"))} + ${formatNumber(get("weaponElementalRatio"))} * ${formatNumber(get("elementalResistanceFactor"))}) * ${formatNumber(Math.max(0, input.convertCalamity))} * ${formatNumber(get("convertScale"))} = ${formatNumber(value)}`,
        },
        {
            id: "damageIncrease",
            title: "增伤池",
            formula: "增伤池 = 1 + 增伤 + 武器伤害 + 阵营增伤 + 攻击类型增伤",
            compute: ({ input }) => 1 + input.baseDamageBonus + input.weaponDamageBonus + input.factionBonus + input.attackTypeDamageBonus,
            explain: ({ input }, value) =>
                `1 + ${formatNumber(input.baseDamageBonus)} + ${formatNumber(input.weaponDamageBonus)} + ${formatNumber(input.factionBonus)} + ${formatNumber(input.attackTypeDamageBonus)} = ${formatNumber(value)}`,
        },
        {
            id: "elementDamageIncrease",
            title: "元素增伤乘区",
            formula: "元素增伤乘区 = 增伤池 + 元素增伤（只作用于元素结算分量）",
            compute: ({ input, get }) => get("damageIncrease") + input.elementDamageIncrease,
            explain: ({ input, get }, value) =>
                `${formatNumber(get("damageIncrease"))} + ${formatNumber(input.elementDamageIncrease)} = ${formatNumber(value)}`,
        },
        {
            id: "physicalDamageIncrease",
            title: "物理增伤乘区",
            formula: "物理增伤乘区 = 增伤池 + 物理增伤（只作用于物理结算分量）",
            compute: ({ input, get }) => get("damageIncrease") + input.physicalDamageIncrease,
            explain: ({ input, get }, value) =>
                `${formatNumber(get("damageIncrease"))} + ${formatNumber(input.physicalDamageIncrease)} = ${formatNumber(value)}`,
        },
        {
            id: "independentDamageIncrease",
            title: "独立增伤乘区",
            formula: "独立增伤乘区 = (1 + 独立增伤) * (1 + 武器独立增伤) / (1 + 武器独立增伤惩罚) * (1 + 攻击类型独立增伤)",
            compute: ({ input }) =>
                ((1 + input.independentBonus) * (1 + input.weaponIndependentBonus)) /
                (1 + input.weaponIndependentPenalty) *
                (1 + input.attackTypeIndependentBonus),
            explain: ({ input }, value) =>
                `(1 + ${formatNumber(input.independentBonus)}) * (1 + ${formatNumber(input.weaponIndependentBonus)}) / (1 + ${formatNumber(input.weaponIndependentPenalty)}) * (1 + ${formatNumber(input.attackTypeIndependentBonus)}) = ${formatNumber(value)}`,
        },
        {
            id: "additionalDamage",
            title: "追加伤害乘区",
            formula: "追加伤害乘区 = max(0, 1 + Σ 七分量)",
            compute: ({ input }) => Math.max(0, additionalDamageZone(input)),
            explain: ({ input }, value) =>
                `max(0, 1 + ${formatNumber(additionalDamageZone(input) - 1)}) = ${formatNumber(value)}（额外造成一段可触发额外效果的属性伤害）`,
        },
        {
            id: "imbalanceDamageMultiplier",
            title: "失衡乘区",
            formula: "失衡乘区 = 处于失衡状态时(失衡易伤 + 1.5)，否则为 1",
            compute: ({ input }) => (input.imbalanceEnabled ? input.imbalanceBonus + 1.5 : 1),
            explain: ({ input }, value) =>
                `${input.imbalanceEnabled ? `${formatNumber(input.imbalanceBonus)} + 1.5` : "1"} = ${formatNumber(value)}`,
        },
        {
            id: "penetrationMultiplier",
            title: "属性穿透乘区",
            formula: "属性穿透乘区 = max(0, 1 + 属性穿透)（对全部伤害分量整体生效）",
            compute: ({ input }) => Math.max(0, 1 + input.penetrationBonus),
            explain: ({ input }, value) => `max(0, 1 + ${formatNumber(input.penetrationBonus)}) = ${formatNumber(value)}`,
        },
        {
            id: "seasonDamageMultiplier",
            title: "赛季增伤乘区",
            formula: "赛季增伤乘区 = max(0, 1 + 赛季增伤)",
            compute: ({ input }) => Math.max(0, 1 + input.seasonBonus),
            explain: ({ input }, value) => `max(0, 1 + ${formatNumber(input.seasonBonus)}) = ${formatNumber(value)}`,
        },
        {
            id: "boostMultiplier",
            title: "昂扬乘区",
            formula: "昂扬乘区 = 1 + 昂扬 * 生命比例(限制在 0~1)",
            compute: ({ input }) => 1 + input.boostBonus * clampNumber(input.hpPercent, 0, 1),
            explain: ({ input }, value) => {
                const hp = clampNumber(input.hpPercent, 0, 1)
                return `1 + ${formatNumber(input.boostBonus)} * ${formatNumber(hp)} = ${formatNumber(value)}`
            },
        },
        {
            id: "desperateMultiplier",
            title: "背水乘区",
            formula: "背水乘区 = 1 + 4 * 背水 * (1 - 生命比例(限制在 0.25~1)) * (1.5 - 生命比例(限制在 0.25~1))",
            compute: ({ input }) => {
                const hp = clampNumber(input.hpPercent, 0.25, 1)
                return 1 + 4 * input.desperateBonus * (1 - hp) * (1.5 - hp)
            },
            explain: ({ input }, value) => {
                const hp = clampNumber(input.hpPercent, 0.25, 1)
                return `1 + 4 * ${formatNumber(input.desperateBonus)} * (1 - ${formatNumber(hp)}) * (1.5 - ${formatNumber(hp)}) = ${formatNumber(value)}`
            },
        },
        {
            id: "hpMore",
            title: "血量相关乘区",
            formula: "血量相关乘区 = 昂扬乘区 * 背水乘区",
            compute: ({ get }) => get("boostMultiplier") * get("desperateMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("boostMultiplier"))} * ${formatNumber(get("desperateMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "otherMore",
            title: "通用乘区",
            formula: "通用乘区 = 独立增伤乘区 * 追加伤害乘区 * 失衡乘区 * 属性穿透乘区 * 赛季增伤乘区",
            compute: ({ get }) =>
                get("independentDamageIncrease") *
                get("additionalDamage") *
                get("imbalanceDamageMultiplier") *
                get("penetrationMultiplier") *
                get("seasonDamageMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("independentDamageIncrease"))} * ${formatNumber(get("additionalDamage"))} * ${formatNumber(get("imbalanceDamageMultiplier"))} * ${formatNumber(get("penetrationMultiplier"))} * ${formatNumber(get("seasonDamageMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "commonMore",
            title: "总乘区",
            formula: "总乘区 = 血量相关乘区 * 通用乘区",
            compute: ({ get }) => get("hpMore") * get("otherMore"),
            explain: ({ get }, value) => `${formatNumber(get("hpMore"))} * ${formatNumber(get("otherMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "elementRatioTotal",
            title: "元素结算分量合计",
            formula: "元素结算分量合计 = 未转换元素分量 + 属转物理分量 + 属转元素分量",
            compute: ({ get }) => get("elementalBasePart") + get("convertedElementPhysicalPart") + get("convertedElementElementalPart"),
            explain: ({ get }, value) =>
                `${formatNumber(get("elementalBasePart"))} + ${formatNumber(get("convertedElementPhysicalPart"))} + ${formatNumber(get("convertedElementElementalPart"))} = ${formatNumber(value)}`,
        },
        {
            id: "physicalRatioTotal",
            title: "物理结算分量合计",
            formula: "物理结算分量合计 = 未转换物理分量 + 转切割分量 + 转贯穿分量 + 转震荡分量 + 转灾厄分量",
            compute: ({ get }) =>
                get("physicalBasePart") + get("convertCutPart") + get("convertPiercePart") + get("convertShockPart") + get("convertCalamityPart"),
            explain: ({ get }, value) =>
                `${formatNumber(get("physicalBasePart"))} + ${formatNumber(get("convertCutPart"))} + ${formatNumber(get("convertPiercePart"))} + ${formatNumber(get("convertShockPart"))} + ${formatNumber(get("convertCalamityPart"))} = ${formatNumber(value)}`,
        },
        {
            id: "physicalTriggerRatio",
            title: "物理分量触发满倍率",
            formula:
                "物理分量触发满倍率 = 未转换物理分量 * 触发倍率 + 转切割分量 * 转切割触发倍率 + 转贯穿分量 * 转贯穿触发倍率 + 转震荡分量 * 转震荡触发倍率 + 转灾厄分量 * 转灾厄触发倍率",
            compute: ({ get }) =>
                get("physicalBasePart") * get("triggerDamageMultiplier") +
                get("convertCutPart") * get("cutTriggerMultiplier") +
                get("convertPiercePart") * get("pierceTriggerMultiplier") +
                get("convertShockPart") * get("shockTriggerMultiplier") +
                get("convertCalamityPart") * get("calamityTriggerMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("physicalBasePart"))} * ${formatNumber(get("triggerDamageMultiplier"))} + ${formatNumber(get("convertCutPart"))} * ${formatNumber(get("cutTriggerMultiplier"))} + ${formatNumber(get("convertPiercePart"))} * ${formatNumber(get("pierceTriggerMultiplier"))} + ${formatNumber(get("convertShockPart"))} * ${formatNumber(get("shockTriggerMultiplier"))} + ${formatNumber(get("convertCalamityPart"))} * ${formatNumber(get("calamityTriggerMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "physicalExpectedTriggerRatio",
            title: "物理分量触发期望",
            formula:
                "物理分量触发期望 = 未转换物理分量 * 触发期望倍率 + 转切割分量 * 转切割触发期望 + 转贯穿分量 * 转贯穿触发期望 + 转震荡分量 * 转震荡触发期望 + 转灾厄分量 * 转灾厄触发期望",
            compute: ({ get }) =>
                get("physicalBasePart") * get("triggerExpectedDamageAdd") +
                get("convertCutPart") * get("cutTriggerExpected") +
                get("convertPiercePart") * get("pierceTriggerExpected") +
                get("convertShockPart") * get("shockTriggerExpected") +
                get("convertCalamityPart") * get("calamityTriggerExpected"),
            explain: ({ get }, value) =>
                `${formatNumber(get("physicalBasePart"))} * ${formatNumber(get("triggerExpectedDamageAdd"))} + ${formatNumber(get("convertCutPart"))} * ${formatNumber(get("cutTriggerExpected"))} + ${formatNumber(get("convertPiercePart"))} * ${formatNumber(get("pierceTriggerExpected"))} + ${formatNumber(get("convertShockPart"))} * ${formatNumber(get("shockTriggerExpected"))} + ${formatNumber(get("convertCalamityPart"))} * ${formatNumber(get("calamityTriggerExpected"))} = ${formatNumber(value)}`,
        },
        {
            id: "noTriggerWeightedRatio",
            title: "未触发加权分量",
            formula: "未触发加权分量 = 元素结算分量合计 * 元素增伤乘区 + 物理结算分量合计 * 物理增伤乘区",
            compute: ({ get }) =>
                get("elementRatioTotal") * get("elementDamageIncrease") + get("physicalRatioTotal") * get("physicalDamageIncrease"),
            explain: ({ get }, value) =>
                `${formatNumber(get("elementRatioTotal"))} * ${formatNumber(get("elementDamageIncrease"))} + ${formatNumber(get("physicalRatioTotal"))} * ${formatNumber(get("physicalDamageIncrease"))} = ${formatNumber(value)}`,
        },
        {
            id: "fullTriggerWeightedRatio",
            title: "满触发加权分量",
            formula: "满触发加权分量 = 元素结算分量合计 * 元素增伤乘区 + 物理分量触发满倍率 * 物理增伤乘区",
            compute: ({ get }) =>
                get("elementRatioTotal") * get("elementDamageIncrease") + get("physicalTriggerRatio") * get("physicalDamageIncrease"),
            explain: ({ get }, value) =>
                `${formatNumber(get("elementRatioTotal"))} * ${formatNumber(get("elementDamageIncrease"))} + ${formatNumber(get("physicalTriggerRatio"))} * ${formatNumber(get("physicalDamageIncrease"))} = ${formatNumber(value)}`,
        },
        {
            id: "expectedTriggerWeightedRatio",
            title: "触发期望加权分量",
            formula: "触发期望加权分量 = 元素结算分量合计 * 元素增伤乘区 + 物理分量触发期望 * 物理增伤乘区",
            compute: ({ get }) =>
                get("elementRatioTotal") * get("elementDamageIncrease") + get("physicalExpectedTriggerRatio") * get("physicalDamageIncrease"),
            explain: ({ get }, value) =>
                `${formatNumber(get("elementRatioTotal"))} * ${formatNumber(get("elementDamageIncrease"))} + ${formatNumber(get("physicalExpectedTriggerRatio"))} * ${formatNumber(get("physicalDamageIncrease"))} = ${formatNumber(value)}`,
        },
        {
            id: "lowerCritNoTrigger",
            title: "未触发低暴击",
            formula: "未触发低暴击 = 未触发加权分量 * 低暴击倍率 * 总乘区",
            compute: ({ get }) => get("noTriggerWeightedRatio") * get("lowerCritDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `${formatNumber(get("noTriggerWeightedRatio"))} * ${formatNumber(get("lowerCritDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "higherCritNoTrigger",
            title: "未触发高暴击",
            formula: "未触发高暴击 = 未触发加权分量 * 高暴击倍率 * 总乘区",
            compute: ({ get }) => get("noTriggerWeightedRatio") * get("higherCritDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `${formatNumber(get("noTriggerWeightedRatio"))} * ${formatNumber(get("higherCritDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "lowerCritTrigger",
            title: "触发低暴击",
            formula: "触发低暴击 = 满触发加权分量 * 低暴击倍率 * 总乘区",
            compute: ({ get }) => get("fullTriggerWeightedRatio") * get("lowerCritDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `${formatNumber(get("fullTriggerWeightedRatio"))} * ${formatNumber(get("lowerCritDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "higherCritTrigger",
            title: "触发高暴击",
            formula: "触发高暴击 = 满触发加权分量 * 高暴击倍率 * 总乘区",
            compute: ({ get }) => get("fullTriggerWeightedRatio") * get("higherCritDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `${formatNumber(get("fullTriggerWeightedRatio"))} * ${formatNumber(get("higherCritDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "lowerCritExpectedTrigger",
            title: "期望触发低暴击",
            formula: "期望触发低暴击 = 触发期望加权分量 * 低暴击倍率 * 总乘区",
            compute: ({ get }) => get("expectedTriggerWeightedRatio") * get("lowerCritDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `${formatNumber(get("expectedTriggerWeightedRatio"))} * ${formatNumber(get("lowerCritDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "higherCritExpectedTrigger",
            title: "期望触发高暴击",
            formula: "期望触发高暴击 = 触发期望加权分量 * 高暴击倍率 * 总乘区",
            compute: ({ get }) => get("expectedTriggerWeightedRatio") * get("higherCritDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `${formatNumber(get("expectedTriggerWeightedRatio"))} * ${formatNumber(get("higherCritDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "expectedCritTrigger",
            title: "触发期望暴击",
            formula: "触发期望暴击 = 满触发加权分量 * 暴击期望倍率 * 总乘区",
            compute: ({ get }) => get("fullTriggerWeightedRatio") * get("critExpectedDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `${formatNumber(get("fullTriggerWeightedRatio"))} * ${formatNumber(get("critExpectedDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "expectedCritNoTrigger",
            title: "未触发期望暴击",
            formula: "未触发期望暴击 = 未触发加权分量 * 暴击期望倍率 * 总乘区",
            compute: ({ get }) => get("noTriggerWeightedRatio") * get("critExpectedDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `${formatNumber(get("noTriggerWeightedRatio"))} * ${formatNumber(get("critExpectedDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "expectedDamage",
            title: "最终期望伤害",
            formula: "最终期望伤害 = 触发期望加权分量 * 暴击期望倍率 * 总乘区",
            compute: ({ get }) => get("expectedTriggerWeightedRatio") * get("critExpectedDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `${formatNumber(get("expectedTriggerWeightedRatio"))} * ${formatNumber(get("critExpectedDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "skillRawDamage",
            title: "技能原始倍率伤害",
            formula: "技能原始倍率伤害 = 技能倍率 * 总攻击 + 技能固定值",
            compute: ({ input, get }) => input.skillRate * get("totalWeaponDamage") + input.skillFlatDamage,
            explain: ({ input, get }, value) =>
                `${formatNumber(input.skillRate)} * ${formatNumber(get("totalWeaponDamage"))} + ${formatNumber(input.skillFlatDamage)} = ${formatNumber(value)}`,
        },
        {
            id: "skillBaseDamage",
            title: "技能倍率伤害",
            formula: "技能倍率伤害 = 技能原始倍率伤害 * (同律武器时技能威力，否则 1)",
            compute: ({ input, get }) => get("skillRawDamage") * (input.skillWeaponEnabled ? input.skillPowerMultiplier : 1),
            explain: ({ input, get }, value) => {
                const powerFactor = input.skillWeaponEnabled ? input.skillPowerMultiplier : 1
                return `${formatNumber(get("skillRawDamage"))} * ${formatNumber(powerFactor)} = ${formatNumber(value)}`
            },
        },
        {
            id: "skillDamageMultiplier",
            title: "技能倍率系数",
            formula: "技能倍率系数 = 技能倍率伤害 / 总攻击",
            compute: ({ get }) => safeDivide(get("skillBaseDamage"), get("totalWeaponDamage")),
            explain: ({ get }, value) =>
                `${formatNumber(get("skillBaseDamage"))} / ${formatNumber(get("totalWeaponDamage"))} = ${formatNumber(value)}`,
        },
        {
            id: "calculateExpectedDamage",
            title: "最终伤害(期望)",
            formula: "最终伤害(期望) = 最终期望伤害 * 技能倍率系数",
            compute: ({ get }) => get("expectedDamage") * get("skillDamageMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("expectedDamage"))} * ${formatNumber(get("skillDamageMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "fullnessOverflowTrigger",
            title: "触发溢出率",
            formula: "触发溢出率 = max(0, 最终触发率 - 1)",
            compute: ({ get }) => Math.max(0, get("finalTriggerRate") - 1),
            explain: ({ get }, value) => `max(0, ${formatNumber(get("finalTriggerRate"))} - 1) = ${formatNumber(value)}`,
        },
        {
            id: "weaponFullnessPower",
            title: "武器转化充盈威力",
            formula: "武器转化充盈威力 = 触发溢出率 * 充盈转化",
            compute: ({ input, get }) => get("fullnessOverflowTrigger") * input.fullnessConversion,
            explain: ({ input, get }, value) =>
                `${formatNumber(get("fullnessOverflowTrigger"))} * ${formatNumber(input.fullnessConversion)} = ${formatNumber(value)}`,
        },
        {
            id: "fullnessPower",
            title: "总充盈威力",
            formula: "总充盈威力 = 充盈威力基础(100%基础+角色MOD+其他武器) + 武器转化充盈威力",
            compute: ({ input, get }) => input.fullnessModBonus + get("weaponFullnessPower"),
            explain: ({ input, get }, value) =>
                `${formatNumber(input.fullnessModBonus)} + ${formatNumber(get("weaponFullnessPower"))} = ${formatNumber(value)}`,
        },
        {
            id: "fullnessMultiplier",
            title: "充盈乘区",
            formula: "充盈乘区 = 视为充盈伤害时总充盈威力（1 起始总倍率），否则为 1",
            compute: ({ input, get }) => (input.fullnessFieldEnabled ? get("fullnessPower") : 1),
            explain: ({ input, get }, value) => {
                const power = get("fullnessPower")
                const expression = input.fullnessFieldEnabled ? `${formatNumber(power)}` : "1"
                return `${expression} = ${formatNumber(value)}`
            },
        },
        {
            id: "fullnessDamage",
            title: "充盈后最终伤害",
            formula: "充盈后最终伤害 = 最终伤害(期望) * 充盈乘区",
            compute: ({ get }) => get("calculateExpectedDamage") * get("fullnessMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("calculateExpectedDamage"))} * ${formatNumber(get("fullnessMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "levelDiff",
            title: "等级差修正",
            formula: "等级差修正 = min(20, max(0, min(80, 怪物等级) - 角色等级))",
            compute: ({ input }) => clampNumber(Math.min(80, input.enemyLevel) - input.attackerLevel, 0, 20),
            explain: ({ input }, value) => {
                const cappedEnemyLevel = Math.min(80, input.enemyLevel)
                const rawDiff = cappedEnemyLevel - input.attackerLevel
                return `min(80, ${formatNumber(input.enemyLevel)}) - ${formatNumber(input.attackerLevel)} = ${formatNumber(rawDiff)} -> ${formatNumber(value)}`
            },
        },
        {
            id: "finalEnemyDefense",
            title: "最终怪物防御",
            formula: "最终怪物防御 = 怪物防御 * (1 - 无视防御)",
            compute: ({ input }) => input.enemyDefense * (1 - input.ignoreDefense),
            explain: ({ input }, value) =>
                `${formatNumber(input.enemyDefense)} * (1 - ${formatNumber(input.ignoreDefense)}) = ${formatNumber(value)}`,
        },
        {
            id: "defenseDamageReduction",
            title: "防御减伤率",
            formula: "防御减伤率 = 最终怪物防御 / (300 + 最终怪物防御 - 等级差修正 * 10)",
            compute: ({ get }) => safeDivide(get("finalEnemyDefense"), 300 + get("finalEnemyDefense") - get("levelDiff") * 10),
            explain: ({ get }, value) =>
                `${formatNumber(get("finalEnemyDefense"))} / (300 + ${formatNumber(get("finalEnemyDefense"))} - ${formatNumber(get("levelDiff"))} * 10) = ${formatNumber(value)}`,
        },
        {
            id: "levelReduceRate",
            title: "高等级减伤乘区",
            formula: "高等级减伤乘区 = 1 / (1 + (怪物等级 - 190) * 0.05)，仅在怪物等级大于等于 200 时生效",
            compute: ({ input }) => calculateLevelReduceRate(input.enemyLevel),
            explain: ({ input }, value) => {
                const reduceRate = calculateLevelReduceRate(input.enemyLevel)
                return input.enemyLevel > 200
                    ? `1 / (1 + (${formatNumber(input.enemyLevel)} - 190) * 0.05) = ${formatNumber(reduceRate)}`
                    : `Lv.${formatNumber(input.enemyLevel)} <= 200，结果 = ${formatNumber(value)}`
            },
        },
        {
            id: "defenseMultiplier",
            title: "防御乘区",
            formula: "防御乘区 = (1 - 防御减伤率) * 高等级减伤乘区，并限制在 0~1",
            compute: ({ get, input }) =>
                clampNumber((1 - get("defenseDamageReduction")) * calculateLevelReduceRate(input.enemyLevel), 0, 1),
            explain: ({ get, input }, value) =>
                `(${formatNumber(1 - get("defenseDamageReduction"))}) * ${formatNumber(calculateLevelReduceRate(input.enemyLevel))} = ${formatNumber(value)}`,
        },
        {
            id: "finalDamageAfterDefense",
            title: "防御后最终伤害",
            formula: "防御后最终伤害 = 充盈后最终伤害 * 防御乘区",
            compute: ({ get }) => get("fullnessDamage") * get("defenseMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("fullnessDamage"))} * ${formatNumber(get("defenseMultiplier"))} = ${formatNumber(value)}`,
        },
    ]
}

/**
 * 构建技能伤害拆解步骤，公式与 CharBuild.calculateDamage 技能池口径保持一致。
 * @returns 技能步骤定义
 */
function buildSkillStepDefinitions(): DamageStepDefinition<SkillDamageInput>[] {
    return [
        {
            id: "weaknessTotal",
            title: "属性弱点合计",
            formula: "属性弱点合计 = 元素弱点 + 全属性弱点（与敌人抗性同区加算）",
            compute: ({ input }) => input.elementWeakness + input.allElementWeakness,
            explain: ({ input }, value) =>
                `${formatNumber(input.elementWeakness)} + ${formatNumber(input.allElementWeakness)} = ${formatNumber(value)}`,
        },
        {
            id: "baseResistanceFactor",
            title: "基础抗性因子",
            formula: "基础抗性因子 = max(0, 1 - 敌人抗性 + 弱点合计)",
            compute: ({ input, get }) => Math.max(0, 1 - input.enemyResistance + get("weaknessTotal")),
            explain: ({ input, get }, value) =>
                `max(0, 1 - ${formatNumber(input.enemyResistance)} + ${formatNumber(get("weaknessTotal"))}) = ${formatNumber(value)}`,
        },
        {
            id: "flippedResistanceFactor",
            title: "翻转抗性因子",
            formula: "翻转抗性因子 = max(0, 1 - 翻转抗性 + 弱点合计)，敌人抗性大于 0 时翻转抗性为 -4，否则为 0.5",
            compute: ({ input, get }) => Math.max(0, 1 - (input.enemyResistance > 0 ? -4 : 0.5) + get("weaknessTotal")),
            explain: ({ input, get }, value) => {
                const flipped = input.enemyResistance > 0 ? -4 : 0.5
                return `max(0, 1 - ${formatNumber(flipped)} + ${formatNumber(get("weaknessTotal"))}) = ${formatNumber(value)}`
            },
        },
        {
            id: "activeElementConvert",
            title: "生效属转比例",
            formula: "生效属转比例 = 敌人抗性 > 0 时取转属克，敌人抗性 < 0 时取转属逆，0 抗为 0",
            compute: ({ input }) => resolveActiveElementConvert(input),
            explain: ({ input }, value) =>
                `抗性 ${formatNumber(input.enemyResistance)} 取${input.enemyResistance > 0 ? "转属克" : input.enemyResistance < 0 ? "转属逆" : "无"} => ${formatNumber(value)}`,
        },
        {
            id: "convertPoolTotal",
            title: "转换池合计",
            formula: "转换池合计 = 生效属转比例 + 转切割 + 转贯穿 + 转震荡 + 转灾厄",
            compute: ({ input, get }) =>
                get("activeElementConvert") +
                Math.max(0, input.convertCut) +
                Math.max(0, input.convertPierce) +
                Math.max(0, input.convertShock) +
                Math.max(0, input.convertCalamity),
            explain: ({ input, get }, value) =>
                `${formatNumber(get("activeElementConvert"))} + ${formatNumber(Math.max(0, input.convertCut))} + ${formatNumber(Math.max(0, input.convertPierce))} + ${formatNumber(Math.max(0, input.convertShock))} + ${formatNumber(Math.max(0, input.convertCalamity))} = ${formatNumber(value)}`,
        },
        {
            id: "convertScale",
            title: "转换压缩系数",
            formula: "转换压缩系数 = 转换池合计 > 1 时为 1 / 转换池合计，否则为 1",
            compute: ({ get }) => (get("convertPoolTotal") > 1 ? 1 / get("convertPoolTotal") : 1),
            explain: ({ get }, value) =>
                get("convertPoolTotal") > 1
                    ? `1 / ${formatNumber(get("convertPoolTotal"))} = ${formatNumber(value)}`
                    : `转换池未超 100% => ${formatNumber(value)}`,
        },
        {
            id: "unconvertedRatio",
            title: "未转换比例",
            formula: "未转换比例 = max(0, 1 - min(1, 转换池合计))",
            compute: ({ get }) => Math.max(0, 1 - Math.min(1, get("convertPoolTotal"))),
            explain: ({ get }, value) => `max(0, 1 - min(1, ${formatNumber(get("convertPoolTotal"))})) = ${formatNumber(value)}`,
        },
        {
            id: "elementConvertRatio",
            title: "属转有效比例",
            formula: "属转有效比例 = min(1, 生效属转比例) * 转换压缩系数",
            compute: ({ get }) => Math.min(1, get("activeElementConvert")) * get("convertScale"),
            explain: ({ get }, value) =>
                `min(1, ${formatNumber(get("activeElementConvert"))}) * ${formatNumber(get("convertScale"))} = ${formatNumber(value)}`,
        },
        {
            id: "unconvertedElementPart",
            title: "未转换元素分量",
            formula: "未转换元素分量 = 未转换比例 * 基础抗性因子",
            compute: ({ get }) => get("unconvertedRatio") * get("baseResistanceFactor"),
            explain: ({ get }, value) =>
                `${formatNumber(get("unconvertedRatio"))} * ${formatNumber(get("baseResistanceFactor"))} = ${formatNumber(value)}`,
        },
        {
            id: "convertedElementPart",
            title: "属转元素分量",
            formula: "属转元素分量 = 属转有效比例 * 翻转抗性因子",
            compute: ({ get }) => get("elementConvertRatio") * get("flippedResistanceFactor"),
            explain: ({ get }, value) =>
                `${formatNumber(get("elementConvertRatio"))} * ${formatNumber(get("flippedResistanceFactor"))} = ${formatNumber(value)}`,
        },
        {
            id: "convertCutPart",
            title: "转切割分量",
            formula: "转切割分量 = max(0, 转切割) * 转换压缩系数（按物理分量结算，不吃元素抗性）",
            compute: ({ input, get }) => Math.max(0, input.convertCut) * get("convertScale"),
            explain: ({ input, get }, value) =>
                `${formatNumber(Math.max(0, input.convertCut))} * ${formatNumber(get("convertScale"))} = ${formatNumber(value)}`,
        },
        {
            id: "convertPiercePart",
            title: "转贯穿分量",
            formula: "转贯穿分量 = max(0, 转贯穿) * 转换压缩系数（按物理分量结算，不吃元素抗性）",
            compute: ({ input, get }) => Math.max(0, input.convertPierce) * get("convertScale"),
            explain: ({ input, get }, value) =>
                `${formatNumber(Math.max(0, input.convertPierce))} * ${formatNumber(get("convertScale"))} = ${formatNumber(value)}`,
        },
        {
            id: "convertShockPart",
            title: "转震荡分量",
            formula: "转震荡分量 = max(0, 转震荡) * 转换压缩系数（按物理分量结算，不吃元素抗性）",
            compute: ({ input, get }) => Math.max(0, input.convertShock) * get("convertScale"),
            explain: ({ input, get }, value) =>
                `${formatNumber(Math.max(0, input.convertShock))} * ${formatNumber(get("convertScale"))} = ${formatNumber(value)}`,
        },
        {
            id: "convertCalamityPart",
            title: "转灾厄分量",
            formula: "转灾厄分量 = max(0, 转灾厄) * 转换压缩系数（按物理分量结算，不吃元素抗性）",
            compute: ({ input, get }) => Math.max(0, input.convertCalamity) * get("convertScale"),
            explain: ({ input, get }, value) =>
                `${formatNumber(Math.max(0, input.convertCalamity))} * ${formatNumber(get("convertScale"))} = ${formatNumber(value)}`,
        },
        {
            id: "damageIncrease",
            title: "增伤池",
            formula: "增伤池 = 1 + 增伤 + 技能伤害 + 召唤物伤害(召唤物字段时) + 阵营增伤 + 攻击类型增伤",
            compute: ({ input }) =>
                1 +
                input.baseDamageBonus +
                input.skillDamageBonus +
                (input.summonEnabled ? input.summonDamageBonus : 0) +
                input.factionBonus +
                input.attackTypeDamageBonus,
            explain: ({ input }, value) =>
                `1 + ${formatNumber(input.baseDamageBonus)} + ${formatNumber(input.skillDamageBonus)} + ${formatNumber(input.summonEnabled ? input.summonDamageBonus : 0)} + ${formatNumber(input.factionBonus)} + ${formatNumber(input.attackTypeDamageBonus)} = ${formatNumber(value)}`,
        },
        {
            id: "elementDamageIncrease",
            title: "元素增伤乘区",
            formula: "元素增伤乘区 = 增伤池 + 元素增伤（只作用于元素结算分量）",
            compute: ({ input, get }) => get("damageIncrease") + input.elementDamageIncrease,
            explain: ({ input, get }, value) =>
                `${formatNumber(get("damageIncrease"))} + ${formatNumber(input.elementDamageIncrease)} = ${formatNumber(value)}`,
        },
        {
            id: "physicalDamageIncrease",
            title: "物理增伤乘区",
            formula: "物理增伤乘区 = 增伤池 + 物理增伤（只作用于物理结算分量）",
            compute: ({ input, get }) => get("damageIncrease") + input.physicalDamageIncrease,
            explain: ({ input, get }, value) =>
                `${formatNumber(get("damageIncrease"))} + ${formatNumber(input.physicalDamageIncrease)} = ${formatNumber(value)}`,
        },
        {
            id: "independentDamageIncrease",
            title: "独立增伤乘区",
            formula: "独立增伤乘区 = (1 + 独立增伤) * (1 + 技能独立增伤) * (1 + 攻击类型独立增伤)",
            compute: ({ input }) => (1 + input.independentBonus) * (1 + input.skillIndependentBonus) * (1 + input.attackTypeIndependentBonus),
            explain: ({ input }, value) =>
                `(1 + ${formatNumber(input.independentBonus)}) * (1 + ${formatNumber(input.skillIndependentBonus)}) * (1 + ${formatNumber(input.attackTypeIndependentBonus)}) = ${formatNumber(value)}`,
        },
        {
            id: "skillAdditionalDamageZone",
            title: "技能追伤乘区",
            formula: "技能追伤乘区 = max(0, 1 + 技能追伤)",
            compute: ({ input }) => Math.max(0, 1 + input.skillAdditionalDamage),
            explain: ({ input }, value) => `max(0, 1 + ${formatNumber(input.skillAdditionalDamage)}) = ${formatNumber(value)}`,
        },
        {
            id: "summonIndependentMultiplier",
            title: "召唤物独立增伤乘区",
            formula: "召唤物独立增伤乘区 = 召唤物字段时(1 + 召唤物独立增伤)，否则为 1",
            compute: ({ input }) => (input.summonEnabled ? 1 + input.summonIndependentBonus : 1),
            explain: ({ input }, value) =>
                `${input.summonEnabled ? `1 + ${formatNumber(input.summonIndependentBonus)}` : "1"} = ${formatNumber(value)}`,
        },
        {
            id: "imbalanceDamageMultiplier",
            title: "失衡乘区",
            formula: "失衡乘区 = 处于失衡状态时(失衡易伤 + 1.5)，否则为 1",
            compute: ({ input }) => (input.imbalanceEnabled ? input.imbalanceBonus + 1.5 : 1),
            explain: ({ input }, value) =>
                `${input.imbalanceEnabled ? `${formatNumber(input.imbalanceBonus)} + 1.5` : "1"} = ${formatNumber(value)}`,
        },
        {
            id: "penetrationMultiplier",
            title: "属性穿透乘区",
            formula: "属性穿透乘区 = max(0, 1 + 属性穿透)（对全部伤害分量整体生效）",
            compute: ({ input }) => Math.max(0, 1 + input.penetrationBonus),
            explain: ({ input }, value) => `max(0, 1 + ${formatNumber(input.penetrationBonus)}) = ${formatNumber(value)}`,
        },
        {
            id: "seasonDamageMultiplier",
            title: "赛季增伤乘区",
            formula: "赛季增伤乘区 = max(0, 1 + 赛季增伤)",
            compute: ({ input }) => Math.max(0, 1 + input.seasonBonus),
            explain: ({ input }, value) => `max(0, 1 + ${formatNumber(input.seasonBonus)}) = ${formatNumber(value)}`,
        },
        {
            id: "boostMultiplier",
            title: "昂扬乘区",
            formula: "昂扬乘区 = 1 + 昂扬 * 生命比例(限制在 0~1)",
            compute: ({ input }) => 1 + input.boostBonus * clampNumber(input.hpPercent, 0, 1),
            explain: ({ input }, value) => {
                const hp = clampNumber(input.hpPercent, 0, 1)
                return `1 + ${formatNumber(input.boostBonus)} * ${formatNumber(hp)} = ${formatNumber(value)}`
            },
        },
        {
            id: "desperateMultiplier",
            title: "背水乘区",
            formula: "背水乘区 = 1 + 4 * 背水 * (1 - 生命比例(限制在 0.25~1)) * (1.5 - 生命比例(限制在 0.25~1))",
            compute: ({ input }) => {
                const hp = clampNumber(input.hpPercent, 0.25, 1)
                return 1 + 4 * input.desperateBonus * (1 - hp) * (1.5 - hp)
            },
            explain: ({ input }, value) => {
                const hp = clampNumber(input.hpPercent, 0.25, 1)
                return `1 + 4 * ${formatNumber(input.desperateBonus)} * (1 - ${formatNumber(hp)}) * (1.5 - ${formatNumber(hp)}) = ${formatNumber(value)}`
            },
        },
        {
            id: "hpMore",
            title: "血量相关乘区",
            formula: "血量相关乘区 = 昂扬乘区 * 背水乘区",
            compute: ({ get }) => get("boostMultiplier") * get("desperateMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("boostMultiplier"))} * ${formatNumber(get("desperateMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "elementRatioTotal",
            title: "元素结算分量合计",
            formula: "元素结算分量合计 = 未转换元素分量 + 属转元素分量",
            compute: ({ get }) => get("unconvertedElementPart") + get("convertedElementPart"),
            explain: ({ get }, value) =>
                `${formatNumber(get("unconvertedElementPart"))} + ${formatNumber(get("convertedElementPart"))} = ${formatNumber(value)}`,
        },
        {
            id: "physicalRatioTotal",
            title: "物理结算分量合计",
            formula: "物理结算分量合计 = 转切割分量 + 转贯穿分量 + 转震荡分量 + 转灾厄分量",
            compute: ({ get }) => get("convertCutPart") + get("convertPiercePart") + get("convertShockPart") + get("convertCalamityPart"),
            explain: ({ get }, value) =>
                `${formatNumber(get("convertCutPart"))} + ${formatNumber(get("convertPiercePart"))} + ${formatNumber(get("convertShockPart"))} + ${formatNumber(get("convertCalamityPart"))} = ${formatNumber(value)}`,
        },
        {
            id: "weightedDamageRatio",
            title: "加权伤害系数",
            formula: "加权伤害系数 = 元素结算分量合计 * 元素增伤乘区 + 物理结算分量合计 * 物理增伤乘区",
            compute: ({ get }) =>
                get("elementRatioTotal") * get("elementDamageIncrease") + get("physicalRatioTotal") * get("physicalDamageIncrease"),
            explain: ({ get }, value) =>
                `${formatNumber(get("elementRatioTotal"))} * ${formatNumber(get("elementDamageIncrease"))} + ${formatNumber(get("physicalRatioTotal"))} * ${formatNumber(get("physicalDamageIncrease"))} = ${formatNumber(value)}`,
        },
        {
            id: "charAttack",
            title: "角色攻击",
            formula: "角色攻击 = (角色基础攻击 * (1 + 角色攻击加成 + 和鸣增益) * (1 + 属性攻击) + 固定攻击)保留2位",
            compute: ({ input }) => {
                const raw =
                    input.charBaseAttack * (1 + input.charAttackBonus + input.resonanceGain) * (1 + input.elementalDamageBonus) +
                    input.fixedAttackAdd
                return roundByDigits(raw, 2)
            },
            explain: ({ input }, value) => {
                const raw =
                    input.charBaseAttack * (1 + input.charAttackBonus + input.resonanceGain) * (1 + input.elementalDamageBonus) +
                    input.fixedAttackAdd
                return `(${formatNumber(input.charBaseAttack)} * (1 + ${formatNumber(input.charAttackBonus)} + ${formatNumber(input.resonanceGain)}) * (1 + ${formatNumber(input.elementalDamageBonus)}) + ${formatNumber(input.fixedAttackAdd)}) = ${formatNumber(raw)} -> ${formatNumber(value)}`
            },
        },
        {
            id: "skillAttackPool",
            title: "总攻击",
            formula: "总攻击 = 角色攻击",
            compute: ({ get }) => get("charAttack"),
            explain: ({ get }, value) => `${formatNumber(get("charAttack"))} = ${formatNumber(value)}`,
        },
        {
            id: "skillRawDamage",
            title: "技能原始倍率伤害",
            formula: "技能原始倍率伤害 = 技能倍率 * 总攻击 + 技能固定值",
            compute: ({ input, get }) => input.skillRate * get("skillAttackPool") + input.skillFlatDamage,
            explain: ({ input, get }, value) =>
                `${formatNumber(input.skillRate)} * ${formatNumber(get("skillAttackPool"))} + ${formatNumber(input.skillFlatDamage)} = ${formatNumber(value)}`,
        },
        {
            id: "skillBaseDamage",
            title: "技能倍率伤害",
            formula: "技能倍率伤害 = 技能原始倍率伤害 * 技能威力",
            compute: ({ input, get }) => get("skillRawDamage") * input.skillPowerMultiplier,
            explain: ({ input, get }, value) =>
                `${formatNumber(get("skillRawDamage"))} * ${formatNumber(input.skillPowerMultiplier)} = ${formatNumber(value)}`,
        },
        {
            id: "finalDamage",
            title: "技能基础伤害",
            formula:
                "技能基础伤害 = 技能倍率伤害 * 加权伤害系数 * 独立增伤乘区 * 技能追伤乘区 * 召唤物独立增伤乘区 * 失衡乘区 * 属性穿透乘区 * 赛季增伤乘区",
            compute: ({ get }) =>
                get("skillBaseDamage") *
                get("weightedDamageRatio") *
                get("independentDamageIncrease") *
                get("skillAdditionalDamageZone") *
                get("summonIndependentMultiplier") *
                get("imbalanceDamageMultiplier") *
                get("penetrationMultiplier") *
                get("seasonDamageMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("skillBaseDamage"))} * ${formatNumber(get("weightedDamageRatio"))} * ${formatNumber(get("independentDamageIncrease"))} * ${formatNumber(get("skillAdditionalDamageZone"))} * ${formatNumber(get("summonIndependentMultiplier"))} * ${formatNumber(get("imbalanceDamageMultiplier"))} * ${formatNumber(get("penetrationMultiplier"))} * ${formatNumber(get("seasonDamageMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "expectedDamage",
            title: "最终期望伤害",
            formula: "最终期望伤害 = 技能基础伤害 * 血量相关乘区",
            compute: ({ get }) => get("finalDamage") * get("hpMore"),
            explain: ({ get }, value) => `${formatNumber(get("finalDamage"))} * ${formatNumber(get("hpMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "calculateExpectedDamage",
            title: "最终伤害(期望)",
            formula: "最终伤害(期望) = 最终期望伤害",
            compute: ({ get }) => get("expectedDamage"),
            explain: ({ get }, value) => `${formatNumber(get("expectedDamage"))} = ${formatNumber(value)}`,
        },
        {
            id: "fullnessPower",
            title: "总充盈威力",
            formula: "总充盈威力 = 充盈威力(角色属性汇总)",
            compute: ({ input }) => input.fullnessPower,
            explain: ({ input }, value) => `${formatNumber(input.fullnessPower)} = ${formatNumber(value)}`,
        },
        {
            id: "fullnessMultiplier",
            title: "充盈乘区",
            formula: "充盈乘区 = 视为充盈伤害时总充盈威力（1 起始总倍率），否则为 1",
            compute: ({ input, get }) => (input.fullnessFieldEnabled ? get("fullnessPower") : 1),
            explain: ({ input, get }, value) => {
                const power = get("fullnessPower")
                const expression = input.fullnessFieldEnabled ? `${formatNumber(power)}` : "1"
                return `${expression} = ${formatNumber(value)}`
            },
        },
        {
            id: "fullnessDamage",
            title: "充盈后最终伤害",
            formula: "充盈后最终伤害 = 最终伤害(期望) * 充盈乘区",
            compute: ({ get }) => get("calculateExpectedDamage") * get("fullnessMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("calculateExpectedDamage"))} * ${formatNumber(get("fullnessMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "levelDiff",
            title: "等级差修正",
            formula: "等级差修正 = min(20, max(0, min(80, 怪物等级) - 角色等级))",
            compute: ({ input }) => clampNumber(Math.min(80, input.enemyLevel) - input.attackerLevel, 0, 20),
            explain: ({ input }, value) => {
                const cappedEnemyLevel = Math.min(80, input.enemyLevel)
                const rawDiff = cappedEnemyLevel - input.attackerLevel
                return `min(80, ${formatNumber(input.enemyLevel)}) - ${formatNumber(input.attackerLevel)} = ${formatNumber(rawDiff)} -> ${formatNumber(value)}`
            },
        },
        {
            id: "totalIgnoreDefense",
            title: "总无视防御",
            formula: "总无视防御 = 无视防御 + 技能无视防御",
            compute: ({ input }) => input.ignoreDefense + input.skillIgnoreDefense,
            explain: ({ input }, value) =>
                `${formatNumber(input.ignoreDefense)} + ${formatNumber(input.skillIgnoreDefense)} = ${formatNumber(value)}`,
        },
        {
            id: "finalEnemyDefense",
            title: "最终怪物防御",
            formula: "最终怪物防御 = 怪物防御 * (1 - 总无视防御)",
            compute: ({ input, get }) => input.enemyDefense * (1 - get("totalIgnoreDefense")),
            explain: ({ input, get }, value) =>
                `${formatNumber(input.enemyDefense)} * (1 - ${formatNumber(get("totalIgnoreDefense"))}) = ${formatNumber(value)}`,
        },
        {
            id: "defenseDamageReduction",
            title: "防御减伤率",
            formula: "防御减伤率 = 最终怪物防御 / (300 + 最终怪物防御 - 等级差修正 * 10)",
            compute: ({ get }) => safeDivide(get("finalEnemyDefense"), 300 + get("finalEnemyDefense") - get("levelDiff") * 10),
            explain: ({ get }, value) =>
                `${formatNumber(get("finalEnemyDefense"))} / (300 + ${formatNumber(get("finalEnemyDefense"))} - ${formatNumber(get("levelDiff"))} * 10) = ${formatNumber(value)}`,
        },
        {
            id: "levelReduceRate",
            title: "高等级减伤乘区",
            formula: "高等级减伤乘区 = 1 / (1 + (怪物等级 - 190) * 0.05)，仅在怪物等级大于等于 200 时生效",
            compute: ({ input }) => calculateLevelReduceRate(input.enemyLevel),
            explain: ({ input }, value) => {
                const reduceRate = calculateLevelReduceRate(input.enemyLevel)
                return input.enemyLevel > 200
                    ? `1 / (1 + (${formatNumber(input.enemyLevel)} - 190) * 0.05) = ${formatNumber(reduceRate)}`
                    : `Lv.${formatNumber(input.enemyLevel)} <= 200，结果 = ${formatNumber(value)}`
            },
        },
        {
            id: "defenseMultiplier",
            title: "防御乘区",
            formula: "防御乘区 = (1 - 防御减伤率) * 高等级减伤乘区，并限制在 0~1",
            compute: ({ get, input }) =>
                clampNumber((1 - get("defenseDamageReduction")) * calculateLevelReduceRate(input.enemyLevel), 0, 1),
            explain: ({ get, input }, value) =>
                `(${formatNumber(1 - get("defenseDamageReduction"))}) * ${formatNumber(calculateLevelReduceRate(input.enemyLevel))} = ${formatNumber(value)}`,
        },
        {
            id: "finalDamageAfterDefense",
            title: "防御后最终伤害",
            formula: "防御后最终伤害 = 充盈后最终伤害 * 防御乘区",
            compute: ({ get }) => get("fullnessDamage") * get("defenseMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("fullnessDamage"))} * ${formatNumber(get("defenseMultiplier"))} = ${formatNumber(value)}`,
        },
    ]
}

/**
 * 构建 DOT 伤害拆解步骤，公式与 CharBuild.calculateDotDamage 保持一致。
 * @returns DOT 步骤定义
 */
function buildDotStepDefinitions(): DamageStepDefinition<DotDamageInput>[] {
    return [
        {
            id: "dotBaseDamage",
            title: "单跳基础伤害(角色攻击)",
            formula: "单跳基础伤害(角色攻击) = 角色攻击 * 0.2 * 6 * 4（技能来源按此结算）",
            compute: ({ input }) => input.charAttack * 0.2 * 6 * 4,
            explain: ({ input }, value) => `${formatNumber(input.charAttack)} * 0.2 * 6 * 4 = ${formatNumber(value)}`,
        },
        {
            id: "weaponBaseDamage",
            title: "单跳基础伤害(武器来源)",
            formula: "单跳基础伤害(武器来源) = (角色攻击 + 武器攻击) * 0.2 * 6 * 4（武器来源按此结算）",
            compute: ({ input }) => (input.charAttack + input.weaponAttack) * 0.2 * 6 * 4,
            explain: ({ input }, value) =>
                `(${formatNumber(input.charAttack)} + ${formatNumber(input.weaponAttack)}) * 0.2 * 6 * 4 = ${formatNumber(value)}`,
        },
        {
            id: "fullnessMultiplier",
            title: "充盈乘区",
            formula: "充盈乘区 = 充盈威力（1 起始总倍率）",
            compute: ({ input }) => input.fullnessPower,
            explain: ({ input }, value) => `${formatNumber(input.fullnessPower)} = ${formatNumber(value)}`,
        },
        {
            id: "damageIncrease",
            title: "增伤乘区",
            formula: "增伤乘区 = 1 + 增伤 + 阵营增伤",
            compute: ({ input }) => 1 + input.baseDamageBonus + input.factionBonus,
            explain: ({ input }, value) =>
                `1 + ${formatNumber(input.baseDamageBonus)} + ${formatNumber(input.factionBonus)} = ${formatNumber(value)}`,
        },
        {
            id: "seasonDamageMultiplier",
            title: "赛季增伤乘区",
            formula: "赛季增伤乘区 = max(0, 1 + 赛季增伤)",
            compute: ({ input }) => Math.max(0, 1 + input.seasonBonus),
            explain: ({ input }, value) => `max(0, 1 + ${formatNumber(input.seasonBonus)}) = ${formatNumber(value)}`,
        },
        {
            id: "boostMultiplier",
            title: "昂扬乘区",
            formula: "昂扬乘区 = 1 + 昂扬 * 生命比例(限制在 0~1)",
            compute: ({ input }) => 1 + input.boostBonus * clampNumber(input.hpPercent, 0, 1),
            explain: ({ input }, value) => {
                const hp = clampNumber(input.hpPercent, 0, 1)
                return `1 + ${formatNumber(input.boostBonus)} * ${formatNumber(hp)} = ${formatNumber(value)}`
            },
        },
        {
            id: "desperateMultiplier",
            title: "背水乘区",
            formula: "背水乘区 = 1 + 4 * 背水 * (1 - 生命比例(限制在 0.25~1)) * (1.5 - 生命比例(限制在 0.25~1))",
            compute: ({ input }) => {
                const hp = clampNumber(input.hpPercent, 0.25, 1)
                return 1 + 4 * input.desperateBonus * (1 - hp) * (1.5 - hp)
            },
            explain: ({ input }, value) => {
                const hp = clampNumber(input.hpPercent, 0.25, 1)
                return `1 + 4 * ${formatNumber(input.desperateBonus)} * (1 - ${formatNumber(hp)}) * (1.5 - ${formatNumber(hp)}) = ${formatNumber(value)}`
            },
        },
        {
            id: "hpMore",
            title: "血量相关乘区",
            formula: "血量相关乘区 = 昂扬乘区 * 背水乘区",
            compute: ({ get }) => get("boostMultiplier") * get("desperateMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("boostMultiplier"))} * ${formatNumber(get("desperateMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "totalFrequency",
            title: "DOT频率合计",
            formula: "DOT频率合计 = 技能来源频率 + 武器来源自身属性频率 + 其余属性频率",
            compute: ({ input }) => input.skillFreq + input.weaponOwnFreq + input.otherFreq,
            explain: ({ input }, value) =>
                `${formatNumber(input.skillFreq)} + ${formatNumber(input.weaponOwnFreq)} + ${formatNumber(input.otherFreq)} = ${formatNumber(value)}`,
        },
        {
            id: "weaponFrequency",
            title: "武器来源频率",
            formula: "武器来源频率 = 武器来源自身属性频率 + 其余属性频率（该部分频率吃武器攻击）",
            compute: ({ input }) => input.weaponOwnFreq + input.otherFreq,
            explain: ({ input }, value) =>
                `${formatNumber(input.weaponOwnFreq)} + ${formatNumber(input.otherFreq)} = ${formatNumber(value)}`,
        },
        {
            id: "weightedOwnBaseDamage",
            title: "自身属性频率加权基础伤害",
            formula:
                "自身属性频率加权基础伤害 = 单跳基础伤害(角色攻击) * (DOT频率合计 - 武器来源频率) + 单跳基础伤害(武器来源) * 武器来源自身属性频率",
            compute: ({ input, get }) =>
                get("dotBaseDamage") * (get("totalFrequency") - get("weaponFrequency")) +
                get("weaponBaseDamage") * input.weaponOwnFreq,
            explain: ({ input, get }, value) =>
                `${formatNumber(get("dotBaseDamage"))} * ${formatNumber(get("totalFrequency") - get("weaponFrequency"))} + ${formatNumber(get("weaponBaseDamage"))} * ${formatNumber(input.weaponOwnFreq)} = ${formatNumber(value)}`,
        },
        {
            id: "weightedOtherBaseDamage",
            title: "其余属性频率加权基础伤害",
            formula: "其余属性频率加权基础伤害 = 单跳基础伤害(武器来源) * 其余属性频率",
            compute: ({ input, get }) => get("weaponBaseDamage") * input.otherFreq,
            explain: ({ input, get }, value) =>
                `${formatNumber(get("weaponBaseDamage"))} * ${formatNumber(input.otherFreq)} = ${formatNumber(value)}`,
        },
        {
            id: "weightedBaseDamage",
            title: "频率加权基础伤害",
            formula: "频率加权基础伤害 = 自身属性频率加权基础伤害 + 其余属性频率加权基础伤害",
            compute: ({ get }) => get("weightedOwnBaseDamage") + get("weightedOtherBaseDamage"),
            explain: ({ get }, value) =>
                `${formatNumber(get("weightedOwnBaseDamage"))} + ${formatNumber(get("weightedOtherBaseDamage"))} = ${formatNumber(value)}`,
        },
        {
            id: "ownWeaknessTotal",
            title: "自身属性弱点合计",
            formula: "自身属性弱点合计 = 元素弱点 + 全属性弱点（与敌人抗性同区加算）",
            compute: ({ input }) => input.elementWeakness + input.allElementWeakness,
            explain: ({ input }, value) =>
                `${formatNumber(input.elementWeakness)} + ${formatNumber(input.allElementWeakness)} = ${formatNumber(value)}`,
        },
        {
            id: "baseOwnResistanceFactor",
            title: "自身属性基础抗性因子",
            formula: "自身属性基础抗性因子 = max(0, 1 - 敌人抗性 + 自身属性弱点合计)",
            compute: ({ input, get }) => Math.max(0, 1 - input.enemyResistance + get("ownWeaknessTotal")),
            explain: ({ input, get }, value) =>
                `max(0, 1 - ${formatNumber(input.enemyResistance)} + ${formatNumber(get("ownWeaknessTotal"))}) = ${formatNumber(value)}`,
        },
        {
            id: "flippedOwnResistanceFactor",
            title: "自身属性翻转抗性因子",
            formula: "自身属性翻转抗性因子 = max(0, 1 - 翻转抗性 + 自身属性弱点合计)，敌人抗性大于 0 时翻转抗性为 -4，否则为 0.5",
            compute: ({ input, get }) => Math.max(0, 1 - (input.enemyResistance > 0 ? -4 : 0.5) + get("ownWeaknessTotal")),
            explain: ({ input, get }, value) => {
                const flipped = input.enemyResistance > 0 ? -4 : 0.5
                return `max(0, 1 - ${formatNumber(flipped)} + ${formatNumber(get("ownWeaknessTotal"))}) = ${formatNumber(value)}`
            },
        },
        {
            id: "activeElementConvert",
            title: "生效属转比例",
            formula: "生效属转比例 = 敌人抗性 > 0 时取转属克，敌人抗性 < 0 时取转属逆，0 抗为 0，并限制在 0~1",
            compute: ({ input }) => clampNumber(resolveActiveElementConvert(input), 0, 1),
            explain: ({ input }, value) =>
                `抗性 ${formatNumber(input.enemyResistance)} 取${input.enemyResistance > 0 ? "转属克" : input.enemyResistance < 0 ? "转属逆" : "无"} => ${formatNumber(value)}`,
        },
        {
            id: "ownResistanceFactor",
            title: "自身属性抗性因子",
            formula: "自身属性抗性因子 = (1 - 生效属转比例) * 自身属性基础抗性因子 + 生效属转比例 * 自身属性翻转抗性因子",
            compute: ({ get }) =>
                (1 - get("activeElementConvert")) * get("baseOwnResistanceFactor") +
                get("activeElementConvert") * get("flippedOwnResistanceFactor"),
            explain: ({ get }, value) =>
                `(1 - ${formatNumber(get("activeElementConvert"))}) * ${formatNumber(get("baseOwnResistanceFactor"))} + ${formatNumber(get("activeElementConvert"))} * ${formatNumber(get("flippedOwnResistanceFactor"))} = ${formatNumber(value)}`,
        },
        {
            id: "penetrationMultiplier",
            title: "属性穿透乘区",
            formula: "属性穿透乘区 = 1 + 属性穿透",
            compute: ({ input }) => 1 + input.penetrationBonus,
            explain: ({ input }, value) => `1 + ${formatNumber(input.penetrationBonus)} = ${formatNumber(value)}`,
        },
        {
            id: "ownZone",
            title: "自身属性抗性区",
            formula: "自身属性抗性区 = max(0, 自身属性抗性因子 * 属性穿透乘区)",
            compute: ({ get }) => Math.max(0, get("ownResistanceFactor") * get("penetrationMultiplier")),
            explain: ({ get }, value) =>
                `max(0, ${formatNumber(get("ownResistanceFactor"))} * ${formatNumber(get("penetrationMultiplier"))}) = ${formatNumber(value)}`,
        },
        {
            id: "otherNormalResistanceFactor",
            title: "其余属性基础抗性因子",
            formula: "其余属性基础抗性因子 = max(0, 1 - 敌人抗性 + 全属性弱点)",
            compute: ({ input }) => Math.max(0, 1 - input.enemyResistance + input.allElementWeakness),
            explain: ({ input }, value) =>
                `max(0, 1 - ${formatNumber(input.enemyResistance)} + ${formatNumber(input.allElementWeakness)}) = ${formatNumber(value)}`,
        },
        {
            id: "otherResistanceFactor",
            title: "其余属性抗性因子",
            formula:
                "其余属性抗性因子 = 敌人抗性为 0 或元素种数为 0 时取基础因子；敌人抗性 < 0 时取 max(0, 1 - 0.5 + 全属性弱点)；否则 (max(0, 1 - (-4) + 全属性弱点) + 基础因子 * (元素种数 - 1)) / 元素种数",
            compute: ({ input }) =>
                resolveOtherDotResistanceFactor(input.enemyResistance, input.allElementWeakness, input.otherElementCount),
            explain: ({ input, get }, value) => {
                if (input.enemyResistance === 0 || input.otherElementCount <= 0) {
                    return `敌人抗性为 0 或元素种数为 0 => ${formatNumber(get("otherNormalResistanceFactor"))}`
                }
                if (input.enemyResistance < 0) {
                    return `max(0, 1 - 0.5 + ${formatNumber(input.allElementWeakness)}) = ${formatNumber(value)}`
                }
                return `(max(0, 1 - (-4) + ${formatNumber(input.allElementWeakness)}) + ${formatNumber(get("otherNormalResistanceFactor"))} * (${formatNumber(input.otherElementCount)} - 1)) / ${formatNumber(input.otherElementCount)} = ${formatNumber(value)}`
            },
        },
        {
            id: "otherZone",
            title: "其余属性抗性区",
            formula: "其余属性抗性区 = 其余属性抗性因子 * 属性穿透乘区",
            compute: ({ get }) => get("otherResistanceFactor") * get("penetrationMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("otherResistanceFactor"))} * ${formatNumber(get("penetrationMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "dotDamage",
            title: "每秒DOT伤害",
            formula:
                "每秒DOT伤害 = (自身属性频率加权基础伤害 * 自身属性抗性区 + 其余属性频率加权基础伤害 * 其余属性抗性区) * 充盈乘区 * 增伤乘区 * 血量相关乘区 * 赛季增伤乘区",
            compute: ({ get }) =>
                (get("weightedOwnBaseDamage") * get("ownZone") + get("weightedOtherBaseDamage") * get("otherZone")) *
                get("fullnessMultiplier") *
                get("damageIncrease") *
                get("hpMore") *
                get("seasonDamageMultiplier"),
            explain: ({ get }, value) =>
                `(${formatNumber(get("weightedOwnBaseDamage"))} * ${formatNumber(get("ownZone"))} + ${formatNumber(get("weightedOtherBaseDamage"))} * ${formatNumber(get("otherZone"))}) * ${formatNumber(get("fullnessMultiplier"))} * ${formatNumber(get("damageIncrease"))} * ${formatNumber(get("hpMore"))} * ${formatNumber(get("seasonDamageMultiplier"))} = ${formatNumber(value)}`,
        },
    ]
}

// 计算模式持久化到 URL query（?mode=weapon/dot，缺省为 skill），非法值回退 skill
const mode = useSearchParam<CalcMode>("mode", "skill", {
    parse: raw => (raw === "weapon" || raw === "skill" || raw === "dot" ? (raw as CalcMode) : "skill"),
})
const usePercentInput = ref(false)
const weaponInput = reactive<WeaponDamageInput>(createDefaultWeaponInput())
const skillInput = reactive<SkillDamageInput>(createDefaultSkillInput())
const dotInput = reactive<DotDamageInput>(createDefaultDotInput())
const weaponOverrides = ref<Record<string, ManualStepOverride>>({})
const skillOverrides = ref<Record<string, ManualStepOverride>>({})
const dotOverrides = ref<Record<string, ManualStepOverride>>({})
const weaponMergeItems = ref<MergeItem[]>([{ operator: "*", stepId: "expectedDamage" }])
const skillMergeItems = ref<MergeItem[]>([{ operator: "*", stepId: "expectedDamage" }])
const dotMergeItems = ref<MergeItem[]>([{ operator: "*", stepId: "dotDamage" }])

const weaponStepDefinitions = buildWeaponStepDefinitions()
const skillStepDefinitions = buildSkillStepDefinitions()
const dotStepDefinitions = buildDotStepDefinitions()

interface NumberFieldConfig<TField extends string> {
    key: TField
    /** 展示标签；追伤七分量的标签取属性名翻译，可不填 */
    label?: string
    step: string
}

interface ToggleFieldConfig<TField extends string> {
    key: TField
    label: string
}

interface SelectFieldConfig<TField extends string> {
    key: TField
    label: string
    options: Array<{ value: string; label: string }>
}

interface GroupOutputConfig {
    label: string
    stepId: string
}

interface NumberFieldGroup<TNumberField extends string, TToggleField extends string, TSelectField extends string = never> {
    title: string
    /** 是否在该分组顶部显示追伤乘区说明 */
    chaseNote?: boolean
    fields: NumberFieldConfig<TNumberField>[]
    toggles?: ToggleFieldConfig<TToggleField>[]
    selects?: SelectFieldConfig<TSelectField>[]
    outputs?: GroupOutputConfig[]
    emptyTip?: string
}

const weaponNumberGroups: NumberFieldGroup<WeaponNumberFieldKey, WeaponToggleFieldKey, WeaponSelectFieldKey>[] = [
    {
        title: "攻击",
        fields: [
            { key: "charBaseAttack", label: "角色基础攻击", step: "0.01" },
            { key: "charAttackBonus", label: "角色攻击加成", step: "0.01" },
            { key: "resonanceGain", label: "和鸣增益", step: "0.01" },
            { key: "elementalDamageBonus", label: "属性攻击", step: "0.01" },
            { key: "fixedAttackAdd", label: "固定攻击", step: "0.01" },
            { key: "weaponBaseAttack", label: "武器基础攻击", step: "0.01" },
            { key: "weaponAttackBonus", label: "武器攻击加成", step: "0.01" },
            { key: "physicalDamageBonus", label: "物理", step: "0.01" },
        ],
        toggles: [{ key: "weaponMasteryEnabled", label: "武器精通" }],
        outputs: [
            { label: "角色攻击", stepId: "charAttack" },
            { label: "武器攻击", stepId: "weaponAttack" },
        ],
    },
    {
        title: "技能",
        fields: [
            { key: "skillRate", label: "技能倍率", step: "0.01" },
            { key: "skillFlatDamage", label: "技能固定值", step: "0.01" },
            { key: "skillPowerMultiplier", label: "技能威力", step: "0.01" },
        ],
        toggles: [{ key: "skillWeaponEnabled", label: "同律武器(技能威力生效)" }],
        outputs: [{ label: "技能倍率伤害", stepId: "skillBaseDamage" }],
    },
    {
        title: "增伤",
        chaseNote: true,
        fields: [
            { key: "baseDamageBonus", label: "增伤", step: "0.01" },
            { key: "weaponDamageBonus", label: "武器伤害", step: "0.01" },
            { key: "factionBonus", label: "阵营增伤(歧视/敌方阵营)", step: "0.01" },
            { key: "attackTypeDamageBonus", label: "攻击类型增伤", step: "0.01" },
            { key: "elementDamageIncrease", label: "元素增伤", step: "0.01" },
            { key: "physicalDamageIncrease", label: "物理增伤", step: "0.01" },
            { key: "seasonBonus", label: "赛季增伤", step: "0.01" },
            { key: "independentBonus", label: "独立增伤", step: "0.01" },
            { key: "weaponIndependentBonus", label: "武器独立增伤", step: "0.01" },
            { key: "weaponIndependentPenalty", label: "武器独立增伤惩罚", step: "0.01" },
            { key: "attackTypeIndependentBonus", label: "攻击类型独立增伤", step: "0.01" },
            ...ADDITIONAL_DAMAGE_KEYS.map(key => ({ key, step: "0.01" })),
        ],
        outputs: [
            { label: "增伤池", stepId: "damageIncrease" },
            { label: "元素增伤乘区", stepId: "elementDamageIncrease" },
            { label: "物理增伤乘区", stepId: "physicalDamageIncrease" },
            { label: "独立增伤乘区", stepId: "independentDamageIncrease" },
            { label: "追加伤害乘区", stepId: "additionalDamage" },
            { label: "赛季增伤乘区", stepId: "seasonDamageMultiplier" },
        ],
    },
    {
        title: "暴击",
        fields: [
            { key: "baseCritRate", label: "基础暴击", step: "0.01" },
            { key: "critRateBonus", label: "暴击加成", step: "0.01" },
            { key: "baseCritDamage", label: "基础暴伤", step: "0.01" },
            { key: "critDamageBonus", label: "暴伤加成", step: "0.01" },
        ],
        outputs: [{ label: "暴击期望倍率", stepId: "critExpectedDamage" }],
    },
    {
        title: "触发",
        selects: [
            {
                key: "damageType",
                label: "武器伤害类型",
                options: WEAPON_DAMAGE_TYPES.map(value => ({ value, label: value })),
            },
            { key: "enemyHpType", label: "敌方生命类型", options: HP_TYPE_OPTIONS },
        ],
        fields: [
            { key: "baseTriggerRate", label: "基础触发", step: "0.01" },
            { key: "triggerRateBonus", label: "触发加成", step: "0.01" },
            { key: "triggerBonus", label: "触发倍率加成", step: "0.01" },
        ],
        outputs: [
            { label: "触发倍率", stepId: "triggerDamageMultiplier" },
            { label: "触发期望倍率", stepId: "triggerExpectedDamageAdd" },
        ],
    },
    {
        title: "转换",
        fields: [
            { key: "convertRestraint", label: "转属克", step: "0.01" },
            { key: "convertReverse", label: "转属逆", step: "0.01" },
            { key: "convertCut", label: "转切割", step: "0.01" },
            { key: "convertPierce", label: "转贯穿", step: "0.01" },
            { key: "convertShock", label: "转震荡", step: "0.01" },
            { key: "convertCalamity", label: "转灾厄", step: "0.01" },
        ],
        outputs: [
            { label: "生效属转比例", stepId: "activeElementConvert" },
            { label: "转换池合计", stepId: "convertPoolTotal" },
            { label: "未转换比例", stepId: "unconvertedRatio" },
            { label: "属转有效比例", stepId: "elementConvertRatio" },
        ],
    },
    {
        title: "充盈",
        fields: [
            { key: "fullnessConversion", label: "充盈转化", step: "0.01" },
            { key: "fullnessModBonus", label: "充盈威力基础(100%基础+角色MOD+其他武器)", step: "0.01" },
        ],
        toggles: [{ key: "fullnessFieldEnabled", label: "视为充盈伤害" }],
        outputs: [
            { label: "总充盈威力", stepId: "fullnessPower" },
            { label: "充盈乘区", stepId: "fullnessMultiplier" },
            { label: "充盈后最终伤害", stepId: "fullnessDamage" },
        ],
    },
    {
        title: "血量",
        fields: [
            { key: "boostBonus", label: "昂扬", step: "0.01" },
            { key: "desperateBonus", label: "背水", step: "0.01" },
            { key: "hpPercent", label: "生命比例", step: "0.01" },
        ],
        outputs: [{ label: "血量相关乘区", stepId: "hpMore" }],
    },
    {
        title: "防御",
        fields: [
            { key: "enemyDefense", label: "怪物防御", step: "1" },
            { key: "ignoreDefense", label: "无视防御", step: "0.01" },
            { key: "attackerLevel", label: "角色等级", step: "1" },
            { key: "enemyLevel", label: "怪物等级", step: "1" },
        ],
        outputs: [
            { label: "高等级减伤乘区", stepId: "levelReduceRate" },
            { label: "防御乘区", stepId: "defenseMultiplier" },
            { label: "防御后最终伤害", stepId: "finalDamageAfterDefense" },
        ],
    },
    {
        title: "环境",
        fields: [
            { key: "enemyResistance", label: "敌人抗性", step: "0.01" },
            { key: "elementWeakness", label: "元素弱点(角色元素)", step: "0.01" },
            { key: "allElementWeakness", label: "全属性弱点", step: "0.01" },
            { key: "penetrationBonus", label: "属性穿透", step: "0.01" },
            { key: "imbalanceBonus", label: "失衡易伤", step: "0.01" },
        ],
        toggles: [{ key: "imbalanceEnabled", label: "处于失衡状态" }],
        outputs: [
            { label: "属性弱点合计", stepId: "weaknessTotal" },
            { label: "基础抗性因子", stepId: "baseResistanceFactor" },
            { label: "翻转抗性因子", stepId: "flippedResistanceFactor" },
            { label: "元素抗性因子", stepId: "elementalResistanceFactor" },
            { label: "属性穿透乘区", stepId: "penetrationMultiplier" },
            { label: "失衡易伤乘区", stepId: "imbalanceDamageMultiplier" },
        ],
    },
]

const skillNumberGroups: NumberFieldGroup<SkillNumberFieldKey, SkillToggleFieldKey>[] = [
    {
        title: "攻击",
        fields: [
            { key: "charBaseAttack", label: "角色基础攻击", step: "0.01" },
            { key: "charAttackBonus", label: "角色攻击加成", step: "0.01" },
            { key: "resonanceGain", label: "和鸣增益", step: "0.01" },
            { key: "elementalDamageBonus", label: "属性攻击", step: "0.01" },
            { key: "fixedAttackAdd", label: "固定攻击", step: "0.01" },
        ],
        outputs: [{ label: "角色攻击", stepId: "charAttack" }],
    },
    {
        title: "技能",
        fields: [
            { key: "skillRate", label: "技能倍率", step: "0.01" },
            { key: "skillFlatDamage", label: "技能固定值", step: "0.01" },
            { key: "skillPowerMultiplier", label: "技能威力", step: "0.01" },
        ],
        outputs: [{ label: "技能倍率伤害", stepId: "skillBaseDamage" }],
    },
    {
        title: "增伤",
        fields: [
            { key: "baseDamageBonus", label: "增伤", step: "0.01" },
            { key: "skillDamageBonus", label: "技能伤害", step: "0.01" },
            { key: "factionBonus", label: "阵营增伤(歧视/敌方阵营)", step: "0.01" },
            { key: "attackTypeDamageBonus", label: "攻击类型增伤", step: "0.01" },
            { key: "elementDamageIncrease", label: "元素增伤", step: "0.01" },
            { key: "physicalDamageIncrease", label: "物理增伤", step: "0.01" },
            { key: "seasonBonus", label: "赛季增伤", step: "0.01" },
            { key: "independentBonus", label: "独立增伤", step: "0.01" },
            { key: "skillIndependentBonus", label: "技能独立增伤", step: "0.01" },
            { key: "skillAdditionalDamage", label: "技能追伤", step: "0.01" },
            { key: "attackTypeIndependentBonus", label: "攻击类型独立增伤", step: "0.01" },
            { key: "summonDamageBonus", label: "召唤物伤害", step: "0.01" },
            { key: "summonIndependentBonus", label: "召唤物独立增伤", step: "0.01" },
        ],
        toggles: [{ key: "summonEnabled", label: "当前字段为召唤物伤害" }],
        outputs: [
            { label: "增伤池", stepId: "damageIncrease" },
            { label: "元素增伤乘区", stepId: "elementDamageIncrease" },
            { label: "物理增伤乘区", stepId: "physicalDamageIncrease" },
            { label: "独立增伤乘区", stepId: "independentDamageIncrease" },
            { label: "技能追伤乘区", stepId: "skillAdditionalDamageZone" },
            { label: "召唤物独立增伤乘区", stepId: "summonIndependentMultiplier" },
            { label: "赛季增伤乘区", stepId: "seasonDamageMultiplier" },
        ],
    },
    {
        title: "转换",
        fields: [
            { key: "convertRestraint", label: "转属克", step: "0.01" },
            { key: "convertReverse", label: "转属逆", step: "0.01" },
            { key: "convertCut", label: "转切割", step: "0.01" },
            { key: "convertPierce", label: "转贯穿", step: "0.01" },
            { key: "convertShock", label: "转震荡", step: "0.01" },
            { key: "convertCalamity", label: "转灾厄", step: "0.01" },
        ],
        outputs: [
            { label: "生效属转比例", stepId: "activeElementConvert" },
            { label: "转换池合计", stepId: "convertPoolTotal" },
            { label: "未转换比例", stepId: "unconvertedRatio" },
            { label: "属转有效比例", stepId: "elementConvertRatio" },
        ],
    },
    {
        title: "血量",
        fields: [
            { key: "boostBonus", label: "昂扬", step: "0.01" },
            { key: "desperateBonus", label: "背水", step: "0.01" },
            { key: "hpPercent", label: "生命比例", step: "0.01" },
        ],
        outputs: [{ label: "血量相关乘区", stepId: "hpMore" }],
    },
    {
        title: "充盈",
        fields: [{ key: "fullnessPower", label: "充盈威力", step: "0.01" }],
        toggles: [{ key: "fullnessFieldEnabled", label: "视为充盈伤害" }],
        outputs: [
            { label: "充盈乘区", stepId: "fullnessMultiplier" },
            { label: "充盈后最终伤害", stepId: "fullnessDamage" },
        ],
    },
    {
        title: "防御",
        fields: [
            { key: "enemyDefense", label: "怪物防御", step: "1" },
            { key: "ignoreDefense", label: "无视防御", step: "0.01" },
            { key: "skillIgnoreDefense", label: "技能无视防御", step: "0.01" },
            { key: "attackerLevel", label: "角色等级", step: "1" },
            { key: "enemyLevel", label: "怪物等级", step: "1" },
        ],
        outputs: [
            { label: "高等级减伤乘区", stepId: "levelReduceRate" },
            { label: "防御乘区", stepId: "defenseMultiplier" },
            { label: "防御后最终伤害", stepId: "finalDamageAfterDefense" },
        ],
    },
    {
        title: "环境",
        fields: [
            { key: "enemyResistance", label: "敌人抗性", step: "0.01" },
            { key: "elementWeakness", label: "元素弱点(角色元素)", step: "0.01" },
            { key: "allElementWeakness", label: "全属性弱点", step: "0.01" },
            { key: "penetrationBonus", label: "属性穿透", step: "0.01" },
            { key: "imbalanceBonus", label: "失衡易伤", step: "0.01" },
        ],
        toggles: [{ key: "imbalanceEnabled", label: "处于失衡状态" }],
        outputs: [
            { label: "属性弱点合计", stepId: "weaknessTotal" },
            { label: "基础抗性因子", stepId: "baseResistanceFactor" },
            { label: "翻转抗性因子", stepId: "flippedResistanceFactor" },
            { label: "属性穿透乘区", stepId: "penetrationMultiplier" },
            { label: "失衡易伤乘区", stepId: "imbalanceDamageMultiplier" },
        ],
    },
]

const weaponNonPercentFields = new Set<WeaponNumberFieldKey>([
    "charBaseAttack",
    "fixedAttackAdd",
    "weaponBaseAttack",
    "enemyDefense",
    "attackerLevel",
    "enemyLevel",
    "skillFlatDamage",
])

const skillNonPercentFields = new Set<SkillNumberFieldKey>([
    "enemyDefense",
    "attackerLevel",
    "enemyLevel",
    "charBaseAttack",
    "fixedAttackAdd",
    "skillFlatDamage",
])

const dotNumberGroups: NumberFieldGroup<DotNumberFieldKey, never>[] = [
    {
        title: "攻击",
        fields: [
            { key: "charAttack", label: "角色攻击", step: "0.01" },
            { key: "weaponAttack", label: "武器攻击(来源加权)", step: "0.01" },
        ],
        outputs: [
            { label: "单跳基础伤害(角色攻击)", stepId: "dotBaseDamage" },
            { label: "单跳基础伤害(武器来源)", stepId: "weaponBaseDamage" },
        ],
    },
    {
        title: "充盈与增伤",
        fields: [
            { key: "fullnessPower", label: "充盈威力", step: "0.01" },
            { key: "baseDamageBonus", label: "增伤", step: "0.01" },
            { key: "factionBonus", label: "阵营增伤(歧视/敌方阵营)", step: "0.01" },
            { key: "seasonBonus", label: "赛季增伤", step: "0.01" },
        ],
        outputs: [
            { label: "充盈乘区", stepId: "fullnessMultiplier" },
            { label: "增伤乘区", stepId: "damageIncrease" },
            { label: "赛季增伤乘区", stepId: "seasonDamageMultiplier" },
        ],
    },
    {
        title: "DOT频率",
        fields: [
            { key: "skillFreq", label: "技能来源频率", step: "0.1" },
            { key: "weaponOwnFreq", label: "武器来源自身属性频率", step: "0.1" },
            { key: "otherFreq", label: "其余属性频率", step: "0.1" },
            { key: "otherElementCount", label: "其余属性元素种数", step: "1" },
        ],
        outputs: [
            { label: "DOT频率合计", stepId: "totalFrequency" },
            { label: "武器来源频率", stepId: "weaponFrequency" },
            { label: "自身属性频率加权基础伤害", stepId: "weightedOwnBaseDamage" },
            { label: "其余属性频率加权基础伤害", stepId: "weightedOtherBaseDamage" },
            { label: "频率加权基础伤害", stepId: "weightedBaseDamage" },
        ],
    },
    {
        title: "血量",
        fields: [
            { key: "boostBonus", label: "昂扬", step: "0.01" },
            { key: "desperateBonus", label: "背水", step: "0.01" },
            { key: "hpPercent", label: "生命比例", step: "0.01" },
        ],
        outputs: [{ label: "血量相关乘区", stepId: "hpMore" }],
    },
    {
        title: "环境",
        fields: [
            { key: "enemyResistance", label: "敌人抗性", step: "0.01" },
            { key: "elementWeakness", label: "元素弱点(角色元素)", step: "0.01" },
            { key: "allElementWeakness", label: "全属性弱点", step: "0.01" },
            { key: "penetrationBonus", label: "属性穿透", step: "0.01" },
            { key: "convertRestraint", label: "转属克", step: "0.01" },
            { key: "convertReverse", label: "转属逆", step: "0.01" },
        ],
        outputs: [
            { label: "自身属性抗性区", stepId: "ownZone" },
            { label: "其余属性抗性区", stepId: "otherZone" },
        ],
    },
]

const dotNonPercentFields = new Set<DotNumberFieldKey>([
    "charAttack",
    "weaponAttack",
    "skillFreq",
    "weaponOwnFreq",
    "otherFreq",
    "otherElementCount",
])

const resultLabelMap: Record<string, string> = {
    expectedDamage: "期望伤害",
    skillAttackPool: "总攻击",
    totalWeaponDamage: "总攻击",
    skillRawDamage: "技能原始倍率伤害",
    skillBaseDamage: "技能倍率伤害",
    finalDamage: "技能基础伤害(不含血量)",
    calculateExpectedDamage: "最终伤害(期望)",
    finalDamageAfterDefense: "防御后最终伤害",
    defenseMultiplier: "防御乘区",
    expectedCritTrigger: "触发期望暴击",
    expectedCritNoTrigger: "未触发期望暴击",
    lowerCritExpectedTrigger: "低暴击期望触发",
    higherCritExpectedTrigger: "高暴击期望触发",
    fullnessOverflowTrigger: "触发溢出率",
    weaponFullnessPower: "武器转化充盈威力",
    fullnessPower: "总充盈威力",
    fullnessMultiplier: "充盈乘区",
    fullnessDamage: "充盈后最终伤害",
    dotDamage: "每秒DOT伤害",
    dotBaseDamage: "单跳基础伤害(角色攻击)",
    weaponBaseDamage: "单跳基础伤害(武器来源)",
    weightedBaseDamage: "频率加权基础伤害",
    weightedOwnBaseDamage: "自身属性频率加权基础伤害",
    weightedOtherBaseDamage: "其余属性频率加权基础伤害",
    totalFrequency: "DOT频率合计",
    weaponFrequency: "武器来源频率",
    damageIncrease: "增伤乘区",
    elementDamageIncrease: "元素增伤乘区",
    physicalDamageIncrease: "物理增伤乘区",
    independentDamageIncrease: "独立增伤乘区",
    additionalDamage: "追加伤害乘区",
    skillAdditionalDamageZone: "技能追伤乘区",
    summonIndependentMultiplier: "召唤物独立增伤乘区",
    seasonDamageMultiplier: "赛季增伤乘区",
    penetrationMultiplier: "属性穿透乘区",
    weaknessTotal: "属性弱点合计",
    baseResistanceFactor: "基础抗性因子",
    flippedResistanceFactor: "翻转抗性因子",
    elementalResistanceFactor: "元素抗性因子",
    ownZone: "自身属性抗性区",
    otherZone: "其余属性抗性区",
    hpMore: "血量相关乘区",
    boostMultiplier: "昂扬乘区",
    desperateMultiplier: "背水乘区",
}

/**
 * 读取当前模式的手动覆盖映射。
 */
const currentOverrides = computed(() => {
    if (mode.value === "weapon") return weaponOverrides.value
    if (mode.value === "dot") return dotOverrides.value
    return skillOverrides.value
})

/**
 * 读取当前模式的合并项。
 */
const currentMergeItems = computed(() => {
    if (mode.value === "weapon") return weaponMergeItems.value
    if (mode.value === "dot") return dotMergeItems.value
    return skillMergeItems.value
})

/**
 * 顺序执行步骤计算，允许中间步骤手动覆盖并影响后续步骤。
 * @param definitions 步骤定义
 * @param input 当前输入
 * @param overrides 手动覆盖映射
 * @returns 步骤执行结果
 */
function evaluateDamageSteps<TInput extends object>(
    definitions: DamageStepDefinition<TInput>[],
    input: TInput,
    overrides: Record<string, ManualStepOverride>
): EvaluatedDamageStep[] {
    const values: Record<string, number> = {}

    return definitions.map(definition => {
        const context: DamageStepContext<TInput> = {
            input,
            values,
            get: (stepId: string) => values[stepId] ?? 0,
        }
        const autoValue = toFiniteNumber(definition.compute(context))
        const override = overrides[definition.id]
        const finalValue = override?.enabled ? toFiniteNumber(override.value, autoValue) : autoValue
        values[definition.id] = finalValue

        return {
            id: definition.id,
            title: definition.title,
            formula: resolveStepFormula(definition, input),
            detail: definition.explain(context, finalValue),
            autoValue,
            finalValue,
            overridden: !!override?.enabled,
        }
    })
}

/**
 * 计算当前模式的步骤结果。
 */
const evaluatedSteps = computed<EvaluatedDamageStep[]>(() => {
    if (mode.value === "weapon") return evaluateDamageSteps(weaponStepDefinitions, weaponInput, weaponOverrides.value)
    if (mode.value === "dot") return evaluateDamageSteps(dotStepDefinitions, dotInput, dotOverrides.value)
    return evaluateDamageSteps(skillStepDefinitions, skillInput, skillOverrides.value)
})

/**
 * 以键值映射形式暴露当前步骤结果，便于合并计算和摘要展示。
 */
const stepValueMap = computed(() => {
    return Object.fromEntries(evaluatedSteps.value.map(step => [step.id, step.finalValue]))
})

/**
 * 以键值映射形式暴露当前步骤自动值，便于输出端覆盖回填。
 */
const stepAutoValueMap = computed(() => {
    return Object.fromEntries(evaluatedSteps.value.map(step => [step.id, step.autoValue]))
})

/**
 * 读取步骤自动值。
 * @param stepId 步骤ID
 * @returns 步骤自动值
 */
function getStepAutoValue(stepId: string): number {
    return stepAutoValueMap.value[stepId] ?? 0
}

/**
 * 提供步骤下拉选项，附带实时数值。
 */
const stepOptions = computed(() => {
    return evaluatedSteps.value.map(step => ({
        id: step.id,
        label: step.title,
        value: step.finalValue,
    }))
})

/**
 * 以 Map 结构缓存步骤选项，便于快速校验步骤是否可参与合并。
 */
const stepOptionMap = computed(() => new Map(stepOptions.value.map(option => [option.id, option])))

const mergeDropZoneRef = ref<HTMLElement | null>(null)
const pendingOutputDrag = ref<PendingOutputDragState | null>(null)
const activeOutputDrag = ref<ActiveOutputDragState | null>(null)
const isMergeDropActive = ref(false)

/**
 * 当前模式的核心结果摘要。
 */
const summaryItems = computed(() => {
    let keys: string[]
    if (mode.value === "weapon") {
        keys = [
            "finalDamageAfterDefense",
            "expectedDamage",
            "calculateExpectedDamage",
            "skillBaseDamage",
            "expectedCritTrigger",
            "expectedCritNoTrigger",
            "lowerCritExpectedTrigger",
            "higherCritExpectedTrigger",
            "weaknessTotal",
            "elementalResistanceFactor",
            "fullnessPower",
            "fullnessMultiplier",
        ]
    } else if (mode.value === "dot") {
        keys = [
            "dotDamage",
            "weightedBaseDamage",
            "dotBaseDamage",
            "weaponBaseDamage",
            "totalFrequency",
            "weaponFrequency",
            "ownZone",
            "otherZone",
            "fullnessMultiplier",
            "damageIncrease",
            "seasonDamageMultiplier",
            "hpMore",
        ]
    } else {
        keys = [
            "finalDamageAfterDefense",
            "expectedDamage",
            "calculateExpectedDamage",
            "skillBaseDamage",
            "finalDamage",
            "weaknessTotal",
            "fullnessPower",
            "fullnessMultiplier",
        ]
    }

    return keys
        .filter(key => key in stepValueMap.value)
        .map(key => ({ key, label: resultLabelMap[key] || key, value: stepValueMap.value[key] }))
})

/**
 * 计算多步骤合并表达式结果。
 */
const mergeResult = computed<MergeResult>(() => {
    if (currentMergeItems.value.length === 0) {
        return { result: 0, formulaText: "-" }
    }

    const optionMap = new Map(stepOptions.value.map(option => [option.id, option]))
    const [firstItem] = currentMergeItems.value
    const firstOption = optionMap.get(firstItem.stepId)
    if (!firstOption) {
        return { result: 0, formulaText: "-" }
    }

    let result = firstOption.value
    let formulaText = `${firstOption.label}=${formatNumber(firstOption.value)}`

    for (let i = 1; i < currentMergeItems.value.length; i++) {
        const item = currentMergeItems.value[i]
        const currentOption = optionMap.get(item.stepId)
        if (!currentOption) continue

        const nextValue = currentOption.value
        if (item.operator === "+") result += nextValue
        if (item.operator === "-") result -= nextValue
        if (item.operator === "*") result *= nextValue
        if (item.operator === "/") result = safeDivide(result, nextValue)

        formulaText += ` ${item.operator} ${currentOption.label}=${formatNumber(nextValue)}`
    }

    return { result: toFiniteNumber(result), formulaText }
})

/**
 * 读取武器数值字段。
 * @param key 字段键
 * @returns 当前值
 */
function getWeaponFieldValue(key: WeaponNumberFieldKey): number {
    const isPercent = usePercentInput.value && isWeaponPercentField(key)
    return toInputDisplayValue(weaponInput[key], isPercent)
}

/**
 * 写入武器数值字段。
 * @param key 字段键
 * @param rawValue 输入文本
 */
function setWeaponFieldValue(key: WeaponNumberFieldKey, rawValue: string): void {
    const parsedValue = toFiniteNumber(Number(rawValue))
    const isPercent = usePercentInput.value && isWeaponPercentField(key)
    weaponInput[key] = isPercent ? parsedValue / 100 : parsedValue
}

/**
 * 读取武器开关字段。
 * @param key 字段键
 * @returns 开关值
 */
function getWeaponToggleValue(key: WeaponToggleFieldKey): boolean {
    return weaponInput[key]
}

/**
 * 获取武器开关展示标签，武器精通开关会跟随当前精通倍率展示。
 * @param toggleField 开关配置
 * @returns 展示标签
 */
function getWeaponToggleLabel(toggleField: ToggleFieldConfig<WeaponToggleFieldKey>): string {
    if (toggleField.key === "weaponMasteryEnabled") {
        return `武器精通(${formatNumber(weaponInput.weaponMasteryMultiplier)}倍)`
    }
    return toggleField.label
}

/**
 * 写入武器开关字段。
 * @param key 字段键
 * @param checked 开关值
 */
function setWeaponToggleValue(key: WeaponToggleFieldKey, checked: boolean): void {
    weaponInput[key] = checked
}

/**
 * 读取武器模式下拉字段。
 * @param key 字段键
 * @returns 当前值
 */
function getWeaponSelectValue(key: WeaponSelectFieldKey): string {
    return weaponInput[key]
}

/**
 * 写入武器模式下拉字段。
 * @param key 字段键
 * @param value 选项值
 */
function setWeaponSelectValue(key: WeaponSelectFieldKey, value: string): void {
    if (key === "damageType") {
        weaponInput.damageType = value as DamageTypeKey
        return
    }
    weaponInput.enemyHpType = value as HpTypeKey
}

/**
 * 读取技能数值字段。
 * @param key 字段键
 * @returns 当前值
 */
function getSkillFieldValue(key: SkillNumberFieldKey): number {
    const isPercent = usePercentInput.value && isSkillPercentField(key)
    return toInputDisplayValue(skillInput[key], isPercent)
}

/**
 * 写入技能数值字段。
 * @param key 字段键
 * @param rawValue 输入文本
 */
function setSkillFieldValue(key: SkillNumberFieldKey, rawValue: string): void {
    const parsedValue = toFiniteNumber(Number(rawValue))
    const isPercent = usePercentInput.value && isSkillPercentField(key)
    skillInput[key] = isPercent ? parsedValue / 100 : parsedValue
}

/**
 * 判断武器模式字段是否支持百分比输入。
 * @param key 字段键
 * @returns 是否支持百分比
 */
function isWeaponPercentField(key: WeaponNumberFieldKey): boolean {
    return !weaponNonPercentFields.has(key)
}

/**
 * 判断技能模式字段是否支持百分比输入。
 * @param key 字段键
 * @returns 是否支持百分比
 */
function isSkillPercentField(key: SkillNumberFieldKey): boolean {
    return !skillNonPercentFields.has(key)
}

/**
 * 将内部值映射为输入框显示值。
 * @param value 内部值
 * @param isPercent 是否按百分比显示
 * @returns 展示值
 */
function toInputDisplayValue(value: number, isPercent: boolean): number {
    return isPercent ? value * 100 : value
}

/**
 * 获取武器字段输入步长。
 * @param key 字段键
 * @param fallback 默认步长
 * @returns 最终步长
 */
function getWeaponFieldStep(key: WeaponNumberFieldKey, fallback: string): string {
    return usePercentInput.value && isWeaponPercentField(key) ? "0.1" : fallback
}

/**
 * 获取技能字段输入步长。
 * @param key 字段键
 * @param fallback 默认步长
 * @returns 最终步长
 */
function getSkillFieldStep(key: SkillNumberFieldKey, fallback: string): string {
    return usePercentInput.value && isSkillPercentField(key) ? "0.1" : fallback
}

/**
 * 获取武器字段展示标签；追伤七分量未配置标签时取属性名翻译。
 * @param key 字段键
 * @param label 原始标签（追伤七分量配置里不填）
 * @returns 展示标签
 */
function getWeaponFieldLabel(key: WeaponNumberFieldKey, label = ""): string {
    const percentSuffix = usePercentInput.value && isWeaponPercentField(key) ? "(%)" : ""
    return `${label || t(key)}${percentSuffix}`
}

/**
 * 获取技能字段展示标签。
 * @param key 字段键
 * @param label 原始标签
 * @returns 展示标签
 */
function getSkillFieldLabel(key: SkillNumberFieldKey, label = ""): string {
    return usePercentInput.value && isSkillPercentField(key) ? `${label}(%)` : label
}

/**
 * 读取技能开关字段。
 * @param key 字段键
 * @returns 开关值
 */
function getSkillToggleValue(key: SkillToggleFieldKey): boolean {
    return skillInput[key]
}

/**
 * 写入技能开关字段。
 * @param key 字段键
 * @param checked 开关值
 */
function setSkillToggleValue(key: SkillToggleFieldKey, checked: boolean): void {
    skillInput[key] = checked
}

/**
 * 判断 DOT 模式字段是否支持百分比输入。
 * @param key 字段键
 * @returns 是否支持百分比
 */
function isDotPercentField(key: DotNumberFieldKey): boolean {
    return !dotNonPercentFields.has(key)
}

/**
 * 读取 DOT 数值字段。
 * @param key 字段键
 * @returns 当前值
 */
function getDotFieldValue(key: DotNumberFieldKey): number {
    const isPercent = usePercentInput.value && isDotPercentField(key)
    return toInputDisplayValue(dotInput[key], isPercent)
}

/**
 * 写入 DOT 数值字段。
 * @param key 字段键
 * @param rawValue 输入文本
 */
function setDotFieldValue(key: DotNumberFieldKey, rawValue: string): void {
    const parsedValue = toFiniteNumber(Number(rawValue))
    const isPercent = usePercentInput.value && isDotPercentField(key)
    dotInput[key] = isPercent ? parsedValue / 100 : parsedValue
}

/**
 * 获取 DOT 字段输入步长。
 * @param key 字段键
 * @param fallback 默认步长
 * @returns 最终步长
 */
function getDotFieldStep(key: DotNumberFieldKey, fallback: string): string {
    return usePercentInput.value && isDotPercentField(key) ? "0.1" : fallback
}

/**
 * 获取 DOT 字段展示标签。
 * @param key 字段键
 * @param label 原始标签
 * @returns 展示标签
 */
function getDotFieldLabel(key: DotNumberFieldKey, label = ""): string {
    return usePercentInput.value && isDotPercentField(key) ? `${label}(%)` : label
}

/**
 * 查询步骤是否开启了手动覆盖。
 * @param stepId 步骤ID
 * @returns 是否覆盖
 */
function isStepOverridden(stepId: string): boolean {
    return !!currentOverrides.value[stepId]?.enabled
}

/**
 * 获取步骤的手动输入值，不存在时回退自动值。
 * @param stepId 步骤ID
 * @param autoValue 自动值
 * @returns 手动值
 */
function getStepManualValue(stepId: string, autoValue: number): number {
    return currentOverrides.value[stepId]?.value ?? autoValue
}

/**
 * 切换步骤覆盖开关，开启时默认注入当前自动值。
 * @param stepId 步骤ID
 * @param enabled 是否启用
 * @param autoValue 自动值
 */
function toggleStepOverride(stepId: string, enabled: boolean, autoValue: number): void {
    const overrideMap = currentOverrides.value
    const previous = overrideMap[stepId]
    overrideMap[stepId] = {
        enabled,
        value: previous?.value ?? autoValue,
    }
}

/**
 * 更新步骤手动输入值。
 * @param stepId 步骤ID
 * @param rawValue 输入值
 * @param autoValue 自动值
 */
function updateStepManualValue(stepId: string, rawValue: string, autoValue: number): void {
    const overrideMap = currentOverrides.value
    const value = toFiniteNumber(Number(rawValue), autoValue)
    const previous = overrideMap[stepId]
    overrideMap[stepId] = {
        enabled: previous?.enabled ?? true,
        value,
    }
}

/**
 * 将某个步骤覆盖值回填为自动值。
 * @param stepId 步骤ID
 * @param autoValue 自动值
 */
function restoreStepAutoValue(stepId: string, autoValue: number): void {
    updateStepManualValue(stepId, `${autoValue}`, autoValue)
}

/**
 * 读取分组输出对应的步骤值。
 * @param stepId 步骤ID
 * @returns 步骤实时值
 */
function getGroupOutputValue(stepId: string): number {
    return stepValueMap.value[stepId] ?? 0
}

/**
 * 判断步骤是否可加入合并表达式。
 * @param stepId 步骤ID
 * @returns 是否可加入
 */
function canAddStepToMerge(stepId: string): boolean {
    return stepOptionMap.value.has(stepId)
}

/**
 * 将指定步骤追加到合并表达式末尾。
 * @param stepId 步骤ID
 */
function addMergeItemByStepId(stepId: string): void {
    if (!canAddStepToMerge(stepId)) return
    currentMergeItems.value.push({ operator: "*", stepId })
}

/**
 * 滚动到指定步骤卡片，便于快速定位公式详情。
 * @param stepId 步骤ID
 */
function jumpToStep(stepId: string): void {
    const stepElement = document.getElementById(`db-dmg-step-${stepId}`)
    if (!stepElement) return
    stepElement.scrollIntoView({ behavior: "smooth", block: "center" })
}

/**
 * 判断当前鼠标坐标是否落在“多步骤合并运算”区域内。
 * @param clientX 鼠标X坐标
 * @param clientY 鼠标Y坐标
 * @returns 是否命中
 */
function isPointInMergeDropZone(clientX: number, clientY: number): boolean {
    const zone = mergeDropZoneRef.value
    if (!zone) return false
    const rect = zone.getBoundingClientRect()
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

/**
 * 清理拖拽状态并移除全局鼠标事件。
 */
function clearOutputMouseDragState(): void {
    pendingOutputDrag.value = null
    activeOutputDrag.value = null
    isMergeDropActive.value = false
    window.removeEventListener("mousemove", handleOutputMouseMove)
    window.removeEventListener("mouseup", handleOutputMouseUp)
}

/**
 * 处理块输出拖拽过程中的鼠标移动。
 * 使用底层 mouse 事件兼容 Tauri 环境，避免依赖浏览器 Drag API。
 * @param event 鼠标事件
 */
function handleOutputMouseMove(event: MouseEvent): void {
    const pending = pendingOutputDrag.value
    if (!pending) return

    if (!pending.dragging) {
        const movedX = Math.abs(event.clientX - pending.startX)
        const movedY = Math.abs(event.clientY - pending.startY)
        if (movedX + movedY < 4) return
        pending.dragging = true
    }

    activeOutputDrag.value = {
        stepId: pending.stepId,
        label: pending.label,
        value: pending.value,
        x: event.clientX,
        y: event.clientY,
    }
    isMergeDropActive.value = isPointInMergeDropZone(event.clientX, event.clientY)
}

/**
 * 处理块输出拖拽结束。
 * 当鼠标在合并区松开时自动追加对应步骤。
 * @param event 鼠标事件
 */
function handleOutputMouseUp(event: MouseEvent): void {
    const pending = pendingOutputDrag.value
    if (!pending) {
        clearOutputMouseDragState()
        return
    }

    const droppedInMergeZone = pending.dragging && isPointInMergeDropZone(event.clientX, event.clientY)
    if (droppedInMergeZone) {
        addMergeItemByStepId(pending.stepId)
    }
    clearOutputMouseDragState()
}

/**
 * 从块输出开始鼠标拖拽。
 * @param output 输出配置
 * @param event 鼠标按下事件
 */
function startOutputMouseDrag(output: GroupOutputConfig, event: MouseEvent): void {
    if (event.button !== 0) return
    if (!canAddStepToMerge(output.stepId)) return

    const option = stepOptionMap.value.get(output.stepId)
    const value = option?.value ?? getGroupOutputValue(output.stepId)
    pendingOutputDrag.value = {
        stepId: output.stepId,
        label: output.label,
        value,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
    }

    window.addEventListener("mousemove", handleOutputMouseMove)
    window.addEventListener("mouseup", handleOutputMouseUp)
}

/**
 * 新增合并运算项，默认使用当前模式的核心结果步骤。
 */
function addMergeItem(): void {
    currentMergeItems.value.push({ operator: "*", stepId: mode.value === "dot" ? "dotDamage" : "expectedDamage" })
}

/**
 * 删除指定运算项，至少保留 1 项。
 * @param index 项索引
 */
function removeMergeItem(index: number): void {
    if (currentMergeItems.value.length <= 1) return
    currentMergeItems.value.splice(index, 1)
}

/**
 * 重置当前模式的输入、覆盖和合并项。
 */
function resetCurrentMode(): void {
    if (mode.value === "weapon") {
        replaceReactiveObject(weaponInput, createDefaultWeaponInput())
        weaponOverrides.value = {}
        weaponMergeItems.value = [{ operator: "*", stepId: "expectedDamage" }]
    } else if (mode.value === "dot") {
        replaceReactiveObject(dotInput, createDefaultDotInput())
        dotOverrides.value = {}
        dotMergeItems.value = [{ operator: "*", stepId: "dotDamage" }]
    } else {
        replaceReactiveObject(skillInput, createDefaultSkillInput())
        skillOverrides.value = {}
        skillMergeItems.value = [{ operator: "*", stepId: "expectedDamage" }]
    }
}

onBeforeUnmount(() => {
    clearOutputMouseDragState()
})
</script>

<template>
    <ScrollArea class="h-full">
        <div class="stagger-rise mx-auto w-full max-w-7xl space-y-4 p-4">
            <div class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                        <h2 class="text-lg font-semibold tracking-tight">{{ $t("db-damage.damage_formula") }}</h2>
                        <p class="mt-0.5 text-xs text-base-content/55">{{ $t("db-damage.formula_desc") }}</p>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                        <button
                            class="inline-flex h-8 cursor-pointer items-center rounded-xs border border-primary bg-primary px-3 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 active:scale-[0.97]"
                            @click="importFromCurrentCharBuild"
                        >
                            {{ $t("db-damage.import_from_build") }}
                        </button>
                        <button
                            class="inline-flex h-8 cursor-pointer items-center rounded-xs border border-base-content/20 px-3 text-xs text-base-content/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                            @click="resetCurrentMode"
                        >
                            {{ $t("db-damage.reset_current_mode") }}
                        </button>
                    </div>
                </div>
                <!-- 计算模式切换方章 -->
                <div class="mt-3 grid grid-cols-3 gap-1.5">
                    <button
                        class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-1.5 text-xs transition-colors duration-150 active:scale-[0.97]"
                        :class="
                            mode === 'skill'
                                ? 'border-primary bg-primary font-semibold text-primary-content'
                                : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                        "
                        @click="mode = 'skill'"
                    >
                        {{ $t("技能伤害") }}
                    </button>
                    <button
                        class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-1.5 text-xs transition-colors duration-150 active:scale-[0.97]"
                        :class="
                            mode === 'weapon'
                                ? 'border-primary bg-primary font-semibold text-primary-content'
                                : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                        "
                        @click="mode = 'weapon'"
                    >
                        {{ $t("武器伤害") }}
                    </button>
                    <button
                        class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-1.5 text-xs transition-colors duration-150 active:scale-[0.97]"
                        :class="
                            mode === 'dot'
                                ? 'border-primary bg-primary font-semibold text-primary-content'
                                : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                        "
                        @click="mode = 'dot'"
                    >
                        {{ $t("db-damage.dot_damage") }}
                    </button>
                </div>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
                <div class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="INPUT" :title="$t('db-damage.input_params')">
                        <template #trailing>
                            <label class="label cursor-pointer gap-2 p-0">
                                <span class="text-xs text-base-content/55">{{ $t("db-damage.percentage_input") }}</span>
                                <input v-model="usePercentInput" type="checkbox" class="toggle toggle-sm toggle-primary" />
                            </label>
                        </template>
                    </SectionHeader>
                    <div v-if="mode === 'weapon'" class="space-y-3">
                        <div
                            v-for="group in weaponNumberGroups"
                            :key="group.title"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                        >
                            <h4 class="mb-2 text-[11px] tracking-wide text-base-content/55">{{ group.title }}</h4>
                            <p v-if="group.chaseNote" class="mb-2 text-[11px] text-base-content/50">
                                {{ $t("db-damage.chase_approximation_note") }}
                            </p>
                            <div v-if="group.selects && group.selects.length > 0" class="mb-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                                <label v-for="selectField in group.selects" :key="selectField.key" class="form-control">
                                    <div class="mb-1 text-xs text-base-content/70">{{ selectField.label }}</div>
                                    <select
                                        class="w-full cursor-pointer appearance-none rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 focus:border-primary"
                                        :value="getWeaponSelectValue(selectField.key)"
                                        @change="setWeaponSelectValue(selectField.key, ($event.target as HTMLSelectElement).value)"
                                    >
                                        <option v-for="option in selectField.options" :key="option.value" :value="option.value">
                                            {{ option.label }}
                                        </option>
                                    </select>
                                </label>
                            </div>
                            <div v-if="group.fields.length > 0" class="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <label v-for="field in group.fields" :key="field.key" class="form-control">
                                    <div class="mb-1 text-xs text-base-content/70">{{ getWeaponFieldLabel(field.key, field.label) }}</div>
                                    <input
                                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                        type="number"
                                        :step="getWeaponFieldStep(field.key, field.step)"
                                        :value="getWeaponFieldValue(field.key)"
                                        @input="setWeaponFieldValue(field.key, ($event.target as HTMLInputElement).value)"
                                    />
                                </label>
                            </div>
                            <div v-if="group.toggles && group.toggles.length > 0" class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                <label
                                    v-for="toggleField in group.toggles"
                                    :key="toggleField.key"
                                    class="label cursor-pointer justify-start gap-3"
                                >
                                    <input
                                        type="checkbox"
                                        class="toggle toggle-sm toggle-primary"
                                        :checked="getWeaponToggleValue(toggleField.key)"
                                        @change="setWeaponToggleValue(toggleField.key, ($event.target as HTMLInputElement).checked)"
                                    />
                                    <span class="label-text">{{ getWeaponToggleLabel(toggleField) }}</span>
                                </label>
                            </div>
                            <div v-if="group.outputs && group.outputs.length > 0" class="mt-3 border-t border-base-content/15 pt-2">
                                <div class="mb-1 text-xs text-base-content/60">块输出</div>
                                <div class="space-y-1">
                                    <div
                                        v-for="output in group.outputs"
                                        :key="output.stepId"
                                        class="flex cursor-grab items-center justify-between rounded-xs bg-base-content/3 px-2 py-1 active:cursor-grabbing"
                                        :class="{ 'opacity-50': !canAddStepToMerge(output.stepId) }"
                                        @mousedown.prevent="startOutputMouseDrag(output, $event)"
                                    >
                                        <div class="min-w-0 flex-1">
                                            <button
                                                class="text-left text-xs text-base-content/60 transition-colors duration-150 hover:text-primary hover:underline"
                                                @mousedown.stop
                                                @click.stop="jumpToStep(output.stepId)"
                                            >
                                                {{ output.label }}
                                            </button>
                                            <div class="font-orbitron text-[13px] font-semibold text-primary">
                                                {{ formatNumber(getGroupOutputValue(output.stepId)) }}
                                            </div>
                                            <div class="mt-1 flex flex-wrap items-center gap-2" @mousedown.stop>
                                                <label class="label cursor-pointer gap-1 p-0">
                                                    <span class="label-text text-[11px]">覆盖</span>
                                                    <input
                                                        type="checkbox"
                                                        class="toggle toggle-xs toggle-primary"
                                                        :checked="isStepOverridden(output.stepId)"
                                                        @change="
                                                            toggleStepOverride(
                                                                output.stepId,
                                                                ($event.target as HTMLInputElement).checked,
                                                                getStepAutoValue(output.stepId)
                                                            )
                                                        "
                                                    />
                                                </label>
                                                <input
                                                    class="w-24 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] text-base-content outline-none transition-colors duration-150 focus:border-primary disabled:border-base-content/10"
                                                    type="number"
                                                    step="0.0001"
                                                    :disabled="!isStepOverridden(output.stepId)"
                                                    :value="getStepManualValue(output.stepId, getStepAutoValue(output.stepId))"
                                                    @input="
                                                        updateStepManualValue(
                                                            output.stepId,
                                                            ($event.target as HTMLInputElement).value,
                                                            getStepAutoValue(output.stepId)
                                                        )
                                                    "
                                                />
                                                <button
                                                    class="btn btn-xs btn-ghost"
                                                    :disabled="!isStepOverridden(output.stepId)"
                                                    @click="restoreStepAutoValue(output.stepId, getStepAutoValue(output.stepId))"
                                                >
                                                    回填
                                                </button>
                                            </div>
                                        </div>
                                        <button
                                            class="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-sm leading-none text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                            :disabled="!canAddStepToMerge(output.stepId)"
                                            @mousedown.stop
                                            @click="addMergeItemByStepId(output.stepId)"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                                <div class="mt-1 text-[11px] text-base-content/55">支持块输出覆盖；按住并拖到右侧合并区，或点击 + 添加</div>
                            </div>
                            <div
                                v-if="group.fields.length === 0 && (!group.toggles || group.toggles.length === 0) && (!group.selects || group.selects.length === 0)"
                                class="text-xs text-base-content/60"
                            >
                                {{ group.emptyTip || "当前模式暂无该类参数" }}
                            </div>
                        </div>
                    </div>

                    <div v-else-if="mode === 'dot'" class="space-y-3">
                        <div
                            v-for="group in dotNumberGroups"
                            :key="group.title"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                        >
                            <h4 class="mb-2 text-[11px] tracking-wide text-base-content/55">{{ group.title }}</h4>
                            <div v-if="group.fields.length > 0" class="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <label v-for="field in group.fields" :key="field.key" class="form-control">
                                    <div class="mb-1 text-xs text-base-content/70">{{ getDotFieldLabel(field.key, field.label) }}</div>
                                    <input
                                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                        type="number"
                                        :step="getDotFieldStep(field.key, field.step)"
                                        :value="getDotFieldValue(field.key)"
                                        @input="setDotFieldValue(field.key, ($event.target as HTMLInputElement).value)"
                                    />
                                </label>
                            </div>
                            <div v-if="group.outputs && group.outputs.length > 0" class="mt-3 border-t border-base-content/15 pt-2">
                                <div class="mb-1 text-xs text-base-content/60">块输出</div>
                                <div class="space-y-1">
                                    <div
                                        v-for="output in group.outputs"
                                        :key="output.stepId"
                                        class="flex cursor-grab items-center justify-between rounded-xs bg-base-content/3 px-2 py-1 active:cursor-grabbing"
                                        :class="{ 'opacity-50': !canAddStepToMerge(output.stepId) }"
                                        @mousedown.prevent="startOutputMouseDrag(output, $event)"
                                    >
                                        <div class="min-w-0 flex-1">
                                            <button
                                                class="text-left text-xs text-base-content/60 transition-colors duration-150 hover:text-primary hover:underline"
                                                @mousedown.stop
                                                @click.stop="jumpToStep(output.stepId)"
                                            >
                                                {{ output.label }}
                                            </button>
                                            <div class="font-orbitron text-[13px] font-semibold text-primary">
                                                {{ formatNumber(getGroupOutputValue(output.stepId)) }}
                                            </div>
                                            <div class="mt-1 flex flex-wrap items-center gap-2" @mousedown.stop>
                                                <label class="label cursor-pointer gap-1 p-0">
                                                    <span class="label-text text-[11px]">覆盖</span>
                                                    <input
                                                        type="checkbox"
                                                        class="toggle toggle-xs toggle-primary"
                                                        :checked="isStepOverridden(output.stepId)"
                                                        @change="
                                                            toggleStepOverride(
                                                                output.stepId,
                                                                ($event.target as HTMLInputElement).checked,
                                                                getStepAutoValue(output.stepId)
                                                            )
                                                        "
                                                    />
                                                </label>
                                                <input
                                                    class="w-24 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] text-base-content outline-none transition-colors duration-150 focus:border-primary disabled:border-base-content/10"
                                                    type="number"
                                                    step="0.0001"
                                                    :disabled="!isStepOverridden(output.stepId)"
                                                    :value="getStepManualValue(output.stepId, getStepAutoValue(output.stepId))"
                                                    @input="
                                                        updateStepManualValue(
                                                            output.stepId,
                                                            ($event.target as HTMLInputElement).value,
                                                            getStepAutoValue(output.stepId)
                                                        )
                                                    "
                                                />
                                                <button
                                                    class="btn btn-xs btn-ghost"
                                                    :disabled="!isStepOverridden(output.stepId)"
                                                    @click="restoreStepAutoValue(output.stepId, getStepAutoValue(output.stepId))"
                                                >
                                                    回填
                                                </button>
                                            </div>
                                        </div>
                                        <button
                                            class="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-sm leading-none text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                            :disabled="!canAddStepToMerge(output.stepId)"
                                            @mousedown.stop
                                            @click="addMergeItemByStepId(output.stepId)"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                                <div class="mt-1 text-[11px] text-base-content/55">支持块输出覆盖；按住并拖到右侧合并区，或点击 + 添加</div>
                            </div>
                        </div>
                    </div>

                    <div v-else class="space-y-3">
                        <div
                            v-for="group in skillNumberGroups"
                            :key="group.title"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                        >
                            <h4 class="mb-2 text-[11px] tracking-wide text-base-content/55">{{ group.title }}</h4>
                            <div v-if="group.fields.length > 0" class="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <label v-for="field in group.fields" :key="field.key" class="form-control">
                                    <div class="mb-1 text-xs text-base-content/70">{{ getSkillFieldLabel(field.key, field.label) }}</div>
                                    <input
                                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                        type="number"
                                        :step="getSkillFieldStep(field.key, field.step)"
                                        :value="getSkillFieldValue(field.key)"
                                        @input="setSkillFieldValue(field.key, ($event.target as HTMLInputElement).value)"
                                    />
                                </label>
                            </div>
                            <div v-if="group.toggles && group.toggles.length > 0" class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                <label
                                    v-for="toggleField in group.toggles"
                                    :key="toggleField.key"
                                    class="label cursor-pointer justify-start gap-3"
                                >
                                    <input
                                        type="checkbox"
                                        class="toggle toggle-sm toggle-primary"
                                        :checked="getSkillToggleValue(toggleField.key)"
                                        @change="setSkillToggleValue(toggleField.key, ($event.target as HTMLInputElement).checked)"
                                    />
                                    <span class="label-text">{{ toggleField.label }}</span>
                                </label>
                            </div>
                            <div v-if="group.outputs && group.outputs.length > 0" class="mt-3 border-t border-base-content/15 pt-2">
                                <div class="mb-1 text-xs text-base-content/60">块输出</div>
                                <div class="space-y-1">
                                    <div
                                        v-for="output in group.outputs"
                                        :key="output.stepId"
                                        class="flex cursor-grab items-center justify-between rounded-xs bg-base-content/3 px-2 py-1 active:cursor-grabbing"
                                        :class="{ 'opacity-50': !canAddStepToMerge(output.stepId) }"
                                        @mousedown.prevent="startOutputMouseDrag(output, $event)"
                                    >
                                        <div class="min-w-0 flex-1">
                                            <button
                                                class="text-left text-xs text-base-content/60 transition-colors duration-150 hover:text-primary hover:underline"
                                                @mousedown.stop
                                                @click.stop="jumpToStep(output.stepId)"
                                            >
                                                {{ output.label }}
                                            </button>
                                            <div class="font-orbitron text-[13px] font-semibold text-primary">
                                                {{ formatNumber(getGroupOutputValue(output.stepId)) }}
                                            </div>
                                            <div class="mt-1 flex flex-wrap items-center gap-2" @mousedown.stop>
                                                <label class="label cursor-pointer gap-1 p-0">
                                                    <span class="label-text text-[11px]">覆盖</span>
                                                    <input
                                                        type="checkbox"
                                                        class="toggle toggle-xs toggle-primary"
                                                        :checked="isStepOverridden(output.stepId)"
                                                        @change="
                                                            toggleStepOverride(
                                                                output.stepId,
                                                                ($event.target as HTMLInputElement).checked,
                                                                getStepAutoValue(output.stepId)
                                                            )
                                                        "
                                                    />
                                                </label>
                                                <input
                                                    class="w-24 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] text-base-content outline-none transition-colors duration-150 focus:border-primary disabled:border-base-content/10"
                                                    type="number"
                                                    step="0.0001"
                                                    :disabled="!isStepOverridden(output.stepId)"
                                                    :value="getStepManualValue(output.stepId, getStepAutoValue(output.stepId))"
                                                    @input="
                                                        updateStepManualValue(
                                                            output.stepId,
                                                            ($event.target as HTMLInputElement).value,
                                                            getStepAutoValue(output.stepId)
                                                        )
                                                    "
                                                />
                                                <button
                                                    class="btn btn-xs btn-ghost"
                                                    :disabled="!isStepOverridden(output.stepId)"
                                                    @click="restoreStepAutoValue(output.stepId, getStepAutoValue(output.stepId))"
                                                >
                                                    回填
                                                </button>
                                            </div>
                                        </div>
                                        <button
                                            class="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-sm leading-none text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                            :disabled="!canAddStepToMerge(output.stepId)"
                                            @mousedown.stop
                                            @click="addMergeItemByStepId(output.stepId)"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                                <div class="mt-1 text-[11px] text-base-content/55">支持块输出覆盖；按住并拖到右侧合并区，或点击 + 添加</div>
                            </div>
                            <div
                                v-if="group.fields.length === 0 && (!group.toggles || group.toggles.length === 0) && (!group.selects || group.selects.length === 0)"
                                class="text-xs text-base-content/60"
                            >
                                {{ group.emptyTip || "当前模式暂无该类参数" }}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="space-y-4">
                    <div class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="RESULTS" title="核心结果" />
                        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div
                                v-for="item in summaryItems"
                                :key="item.key"
                                class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                            >
                                <div class="text-xs text-base-content/70">{{ item.label }}</div>
                                <div class="font-orbitron text-base font-semibold text-primary">
                                    {{ formatNumber(item.value) }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        ref="mergeDropZoneRef"
                        class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm transition lg:sticky lg:top-4 lg:z-20"
                        :class="{ 'ring-2 ring-primary/40': isMergeDropActive }"
                    >
                        <SectionHeader no-animate compact kicker="MERGE" title="多步骤合并运算">
                            <template #trailing>
                                <button
                                    class="inline-flex h-8 cursor-pointer items-center rounded-xs border border-base-content/20 px-3 text-xs text-base-content/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                    @click="addMergeItem"
                                >
                                    添加步骤
                                </button>
                            </template>
                        </SectionHeader>
                        <p class="-mt-0.5 mb-2 text-[11px] text-base-content/45">支持从左侧块输出拖入或点击 + 快速添加</p>
                        <div class="space-y-2">
                            <div v-for="(item, index) in currentMergeItems" :key="index" class="grid grid-cols-12 items-center gap-2">
                                <Select
                                    v-model="item.operator"
                                    class="col-span-2 min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                    :disabled="index === 0"
                                >
                                    <SelectItem value="+">+</SelectItem>
                                    <SelectItem value="-">-</SelectItem>
                                    <SelectItem value="*">*</SelectItem>
                                    <SelectItem value="/">/</SelectItem>
                                </Select>
                                <Select
                                    v-model="item.stepId"
                                    class="col-span-9 min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                >
                                    <SelectItem v-for="option in stepOptions" :key="option.id" :value="option.id">
                                        {{ option.label }}
                                        = {{ formatNumber(option.value) }}
                                    </SelectItem>
                                </Select>
                                <button
                                    class="btn btn-sm btn-ghost col-span-1 px-0"
                                    :disabled="currentMergeItems.length <= 1"
                                    @click="removeMergeItem(index)"
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                        <div class="mt-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm">
                            <div class="text-xs text-base-content/70">公式展开</div>
                            <div class="mt-1 break-all">{{ mergeResult.formulaText }}</div>
                            <div class="mt-2 text-xs text-base-content/70">合并结果</div>
                            <div class="font-orbitron text-base font-semibold text-primary">
                                {{ formatNumber(mergeResult.result) }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="STEPS" title="步骤拆解" />
                <div class="space-y-2">
                    <div
                        v-for="step in evaluatedSteps"
                        :id="`db-dmg-step-${step.id}`"
                        :key="step.id"
                        class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                    >
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div class="font-semibold">{{ step.title }}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-xs text-base-content/60">最终值</div>
                                <div class="font-orbitron text-[13px] font-semibold text-primary">
                                    {{ formatNumber(step.finalValue) }}
                                </div>
                            </div>
                        </div>

                        <div class="mt-2 text-xs">
                            <span class="text-base-content/60">公式:</span>
                            <code class="ml-1 break-all">{{ step.formula }}</code>
                        </div>
                        <div class="mt-1 text-xs">
                            <span class="text-base-content/60">展开:</span>
                            <code class="ml-1 break-all">{{ step.detail }}</code>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div
            v-if="activeOutputDrag"
            class="pointer-events-none fixed z-50 rounded-xs border border-primary/30 bg-base-100/95 px-2 py-1 shadow-lg"
            :style="{ left: `${activeOutputDrag.x + 12}px`, top: `${activeOutputDrag.y + 12}px` }"
        >
            <div class="text-xs text-base-content/70">{{ activeOutputDrag.label }}</div>
            <div class="font-orbitron text-sm font-semibold text-primary">{{ formatNumber(activeOutputDrag.value) }}</div>
        </div>
    </ScrollArea>
</template>
