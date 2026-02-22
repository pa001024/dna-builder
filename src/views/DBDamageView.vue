<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { computed, onBeforeUnmount, reactive, ref } from "vue"
import { useCharSettings } from "@/composables/useCharSettings"
import { CharBuild, CharBuildTimeline, LeveledChar } from "../data"
import { useInvStore } from "../store/inv"
import { useTimeline } from "../store/timeline"
import { useUIStore } from "../store/ui"
import { inlineActionsToTimeline } from "../utils/inlineActionsToTimeline"

type CalcMode = "weapon" | "skill"
type StepOperator = "+" | "-" | "*" | "/"

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
    | "independentBonus"
    | "weaponIndependentBonus"
    | "additionalDamageBonus"
    | "enemyResistance"
    | "penetrationBonus"
    | "enemyDefense"
    | "ignoreDefense"
    | "attackerLevel"
    | "enemyLevel"
    | "boostBonus"
    | "desperateBonus"
    | "hpPercent"
    | "imbalanceBonus"
    | "hpTypeCoefficient"
    | "triggerBonus"
    | "skillRate"
    | "skillFlatDamage"
    | "skillPowerMultiplier"

type SkillNumberFieldKey =
    | "enemyResistance"
    | "penetrationBonus"
    | "enemyDefense"
    | "ignoreDefense"
    | "skillIgnoreDefense"
    | "attackerLevel"
    | "enemyLevel"
    | "baseDamageBonus"
    | "skillDamageBonus"
    | "independentBonus"
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

type WeaponToggleFieldKey = "weaponMasteryEnabled" | "skillWeaponEnabled" | "sameDamageType" | "imbalanceEnabled"
type SkillToggleFieldKey = "imbalanceEnabled"

interface WeaponDamageInput {
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
    independentBonus: number
    weaponIndependentBonus: number
    additionalDamageBonus: number
    enemyResistance: number
    penetrationBonus: number
    enemyDefense: number
    ignoreDefense: number
    attackerLevel: number
    enemyLevel: number
    boostBonus: number
    desperateBonus: number
    hpPercent: number
    imbalanceBonus: number
    hpTypeCoefficient: number
    triggerBonus: number
    skillRate: number
    skillFlatDamage: number
    skillPowerMultiplier: number
    weaponMasteryEnabled: boolean
    skillWeaponEnabled: boolean
    sameDamageType: boolean
    imbalanceEnabled: boolean
}

interface SkillDamageInput {
    enemyResistance: number
    penetrationBonus: number
    enemyDefense: number
    ignoreDefense: number
    skillIgnoreDefense: number
    attackerLevel: number
    enemyLevel: number
    baseDamageBonus: number
    skillDamageBonus: number
    independentBonus: number
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
}

interface DamageStepContext<TInput> {
    input: TInput
    values: Record<string, number>
    get: (stepId: string) => number
}

interface DamageStepDefinition<TInput> {
    id: string
    title: string
    formula: string
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
 * 创建武器伤害默认输入，便于快速进入调试。
 * @returns 默认武器输入
 */
function createDefaultWeaponInput(): WeaponDamageInput {
    return {
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
        independentBonus: 0.15,
        weaponIndependentBonus: 0.1,
        additionalDamageBonus: 0.12,
        enemyResistance: 0.2,
        penetrationBonus: 0.5,
        enemyDefense: 300,
        ignoreDefense: 0,
        attackerLevel: 80,
        enemyLevel: 80,
        boostBonus: 0.2,
        desperateBonus: 0.1,
        hpPercent: 0.7,
        imbalanceBonus: 0.3,
        hpTypeCoefficient: 0.5,
        triggerBonus: 0,
        skillRate: 2,
        skillFlatDamage: 0,
        skillPowerMultiplier: 1,
        weaponMasteryEnabled: true,
        skillWeaponEnabled: false,
        sameDamageType: true,
        imbalanceEnabled: false,
    }
}

/**
 * 创建技能伤害默认输入，便于快速进入调试。
 * @returns 默认技能输入
 */
function createDefaultSkillInput(): SkillDamageInput {
    return {
        enemyResistance: 0.2,
        penetrationBonus: 0.15,
        enemyDefense: 300,
        ignoreDefense: 0,
        skillIgnoreDefense: 0,
        attackerLevel: 80,
        enemyLevel: 80,
        baseDamageBonus: 0.25,
        skillDamageBonus: 0.3,
        independentBonus: 0.15,
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
    }
}

const ui = useUIStore()
const inv = useInvStore()
const selectedCharForImport = useLocalStorage("selectedChar", "赛琪")
const charSettingsForImport = useCharSettings(selectedCharForImport)
const timelinesForImport = useTimeline(selectedCharForImport)

interface ImportSkillField {
    名称: string
    safeName: string
    影响?: string
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
 * @param elementalDamageBonus 属性伤加成
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
 * 解析当前构筑使用的时间线（优先内联动作，其次命名时间线）。
 * @param charName 角色名称
 * @param baseName 技能名
 * @param actions 内联动作配置
 * @returns 可用于 CharBuild 的时间线对象
 */
function resolveTimelineFromCurrentBuild(
    charName: string,
    baseName: string,
    actions: (typeof charSettingsForImport.value)["actions"]
): CharBuildTimeline | undefined {
    if (actions.enable) {
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
    const fallbackChar = new LeveledChar(charName, rawSettings.charLevel)
    const baseName = rawSettings.baseName || fallbackChar.技能[0]?.名称 || ""
    if (!baseName) {
        throw new Error("当前构筑未配置技能")
    }

    const normalizedSettings = {
        ...rawSettings,
        baseName,
    }
    const timeline = resolveTimelineFromCurrentBuild(charName, baseName, normalizedSettings.actions)
    return CharBuild.fromCharSetting(charName, inv, normalizedSettings, timeline)
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
    const physicalDamageBonus = selectedWeapon ? build.getTotalBonus("物理", weaponPrefix) : 0
    const weaponBaseAttack = selectedWeapon?.基础攻击 || 0
    const weaponAttackDenominator = weaponBaseAttack * (masteryEnabled ? 1.2 : 1) * (1 + physicalDamageBonus)
    const weaponAttackBonus = weaponAttackDenominator > Number.EPSILON ? safeDivide(weaponAttrs?.攻击 || 0, weaponAttackDenominator) - 1 : 0
    const critRateSplit = splitBaseAndBonus(selectedWeapon?.基础暴击 || 0, weaponAttrs?.暴击 || 0)
    const critDamageSplit = splitBaseAndBonus(selectedWeapon?.基础暴伤 || 0, weaponAttrs?.暴伤 || 0)
    const triggerSplit = splitBaseAndBonus(selectedWeapon?.基础触发 || 0, weaponAttrs?.触发 || 0)
    const currentHpType = `${build.enemy.currentHPType || "生命"}`
    const damageTypeByHpType = (build.hpTypeDMG as Record<string, string>)[currentHpType]
    const hpTypeCoefficient = (build.hpTypeCoefficients as Record<string, number>)[currentHpType] ?? 0
    const sameDamageType = !!(selectedWeapon && damageTypeByHpType && selectedWeapon.伤害类型 === damageTypeByHpType)
    const {
        rate: skillRate,
        flat: skillFlatDamage,
        affectedByPower,
    } = extractSkillRateAndFlat(build, attrs.技能倍率乘数 || 1, attrs.技能倍率加数 || 0)
    const charBaseAttack = build.char.基础攻击
    const resonanceGain = build.resonanceGain
    const elementalDamageBonus = build.getTotalBonus("属性伤")
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
    result.independentBonus = attrs.独立增伤
    result.weaponIndependentBonus = weaponAttrs?.独立增伤 || 0
    /**
     * 追加伤害在部分构筑中可能通过不同链路注入（武器属性汇总/全局加成）。
     * 导入时取两者中的有效较大值，避免遗漏当前构筑页已生效的追加伤害来源。
     */
    const totalAdditionalDamageBonus = build.getTotalBonus("追加伤害")
    result.additionalDamageBonus = Math.max(weaponAttrs?.追加伤害 || 0, totalAdditionalDamageBonus)
    result.enemyResistance = build.enemyResistance
    result.penetrationBonus = attrs.属性穿透
    result.enemyDefense = build.enemy.def || 300
    result.ignoreDefense = attrs.无视防御
    result.attackerLevel = build.char.等级 || 80
    result.enemyLevel = build.enemy.等级 || 80
    result.boostBonus = attrs.昂扬
    result.desperateBonus = attrs.背水
    result.hpPercent = build.hpPercent
    result.imbalanceBonus = attrs.失衡易伤
    result.hpTypeCoefficient = hpTypeCoefficient
    result.triggerBonus = build.getTotalBonus("触发倍率")
    result.skillRate = skillRate
    result.skillFlatDamage = skillFlatDamage
    result.skillPowerMultiplier = attrs.技能威力
    result.skillWeaponEnabled = affectedByPower
    result.weaponMasteryEnabled = masteryEnabled
    result.sameDamageType = sameDamageType
    result.imbalanceEnabled = build.imbalance
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
    const { rate: skillRate, flat: skillFlatDamage } = extractSkillRateAndFlat(build, attrs.技能倍率乘数 || 1, attrs.技能倍率加数 || 0)
    const charBaseAttack = build.char.基础攻击
    const resonanceGain = build.resonanceGain
    const elementalDamageBonus = build.getTotalBonus("属性伤")
    const fixedAttackAdd = build.getTotalBonus("固定攻击")
    const charAttackBonus = deriveCharAttackBonus(attrs.攻击, charBaseAttack, resonanceGain, elementalDamageBonus, fixedAttackAdd)

    result.enemyResistance = build.enemyResistance
    result.penetrationBonus = attrs.属性穿透
    result.enemyDefense = build.enemy.def || 300
    result.ignoreDefense = attrs.无视防御
    result.skillIgnoreDefense = attrs.技能无视防御
    result.attackerLevel = build.char.等级 || 80
    result.enemyLevel = build.enemy.等级 || 80
    result.baseDamageBonus = attrs.增伤
    result.skillDamageBonus = attrs.技能伤害
    result.independentBonus = attrs.独立增伤
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
    result.skillPowerMultiplier = attrs.技能威力
    result.imbalanceEnabled = build.imbalance
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
        weaponOverrides.value = {}
        skillOverrides.value = {}
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
 * 构建武器伤害拆解步骤，公式与 CharBuild.calculateWeaponDamage 保持一致。
 * @returns 武器步骤定义
 */
function buildWeaponStepDefinitions(): DamageStepDefinition<WeaponDamageInput>[] {
    return [
        {
            id: "weaponMasteryRatio",
            title: "武器精通倍率",
            formula: "武器精通倍率 = 命中武器精通时为 1.2，否则为 1",
            compute: ({ input }) => (input.weaponMasteryEnabled ? 1.2 : 1),
            explain: ({ input }, value) => `${input.weaponMasteryEnabled ? "命中精通" : "未命中精通"} => ${formatNumber(value)}`,
        },
        {
            id: "charAttack",
            title: "角色攻击",
            formula: "角色攻击 = (角色基础攻击 * (1 + 角色攻击加成 + 和鸣增益) * (1 + 属性伤) + 固定攻击)保留2位",
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
            id: "triggerDamageMultiplier",
            title: "触发倍率",
            formula: "触发倍率 = 伤害类型匹配时(1 + 生命类型系数 + 触发倍率加成)，否则为 1",
            compute: ({ input }) => (input.sameDamageType ? 1 + input.hpTypeCoefficient + input.triggerBonus : 1),
            explain: ({ input }, value) =>
                `${input.sameDamageType ? `1 + ${formatNumber(input.hpTypeCoefficient)} + ${formatNumber(input.triggerBonus)}` : "1"} = ${formatNumber(value)}`,
        },
        {
            id: "finalTriggerRate",
            title: "最终触发率",
            formula: "最终触发率 = 基础触发 * (1 + 触发加成)",
            compute: ({ input }) => input.baseTriggerRate * (1 + input.triggerRateBonus),
            explain: ({ input }, value) =>
                `${formatNumber(input.baseTriggerRate)} * (1 + ${formatNumber(input.triggerRateBonus)}) = ${formatNumber(value)}`,
        },
        {
            id: "triggerExpectedDamageAdd",
            title: "触发期望倍率",
            formula: "触发期望倍率 = 1 + (触发倍率 - 1) * 最终触发率",
            compute: ({ get }) => 1 + (get("triggerDamageMultiplier") - 1) * get("finalTriggerRate"),
            explain: ({ get }, value) =>
                `1 + (${formatNumber(get("triggerDamageMultiplier"))} - 1) * ${formatNumber(get("finalTriggerRate"))} = ${formatNumber(value)}`,
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
            id: "resistance",
            title: "抗性乘区",
            formula: "抗性乘区 = (1 - 敌人抗性) * (1 + 属性穿透)，最小为 0",
            compute: ({ input }) => Math.max(0, (1 - input.enemyResistance) * (1 + input.penetrationBonus)),
            explain: ({ input }, value) => {
                const raw = (1 - input.enemyResistance) * (1 + input.penetrationBonus)
                return `(1 - ${formatNumber(input.enemyResistance)}) * (1 + ${formatNumber(input.penetrationBonus)}) = ${formatNumber(raw)} -> ${formatNumber(value)}`
            },
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
            id: "damageIncrease",
            title: "增伤乘区",
            formula: "增伤乘区 = 1 + 增伤 + 武器伤害",
            compute: ({ input }) => 1 + input.baseDamageBonus + input.weaponDamageBonus,
            explain: ({ input }, value) =>
                `1 + ${formatNumber(input.baseDamageBonus)} + ${formatNumber(input.weaponDamageBonus)} = ${formatNumber(value)}`,
        },
        {
            id: "independentDamageIncrease",
            title: "独立增伤乘区",
            formula: "独立增伤乘区 = (1 + 独立增伤) * (1 + 武器独立增伤)",
            compute: ({ input }) => (1 + input.independentBonus) * (1 + input.weaponIndependentBonus),
            explain: ({ input }, value) =>
                `(1 + ${formatNumber(input.independentBonus)}) * (1 + ${formatNumber(input.weaponIndependentBonus)}) = ${formatNumber(value)}`,
        },
        {
            id: "additionalDamage",
            title: "追加伤害乘区",
            formula: "追加伤害乘区 = 1 + 追加伤害",
            compute: ({ input }) => 1 + input.additionalDamageBonus,
            explain: ({ input }, value) => `1 + ${formatNumber(input.additionalDamageBonus)} = ${formatNumber(value)}`,
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
            formula: "通用乘区 = 增伤乘区 * 独立增伤乘区 * 追加伤害乘区 * 失衡乘区",
            compute: ({ get }) =>
                get("damageIncrease") * get("independentDamageIncrease") * get("additionalDamage") * get("imbalanceDamageMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("damageIncrease"))} * ${formatNumber(get("independentDamageIncrease"))} * ${formatNumber(get("additionalDamage"))} * ${formatNumber(get("imbalanceDamageMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "commonMore",
            title: "总乘区",
            formula: "总乘区 = 血量相关乘区 * 通用乘区",
            compute: ({ get }) => get("hpMore") * get("otherMore"),
            explain: ({ get }, value) => `${formatNumber(get("hpMore"))} * ${formatNumber(get("otherMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "elementalPart",
            title: "属性部分(含抗性)",
            formula: "属性部分(含抗性) = 角色攻击 * 抗性乘区",
            compute: ({ get }) => get("charAttack") * get("resistance"),
            explain: ({ get }, value) => `${formatNumber(get("charAttack"))} * ${formatNumber(get("resistance"))} = ${formatNumber(value)}`,
        },
        {
            id: "lowerCritNoTrigger",
            title: "未触发低暴击",
            formula: "未触发低暴击 = (武器攻击 + 属性部分(含抗性)) * 低暴击倍率 * 总乘区",
            compute: ({ get }) => (get("weaponAttack") + get("elementalPart")) * get("lowerCritDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `(${formatNumber(get("weaponAttack"))} + ${formatNumber(get("elementalPart"))}) * ${formatNumber(get("lowerCritDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "higherCritNoTrigger",
            title: "未触发高暴击",
            formula: "未触发高暴击 = (武器攻击 + 属性部分(含抗性)) * 高暴击倍率 * 总乘区",
            compute: ({ get }) => (get("weaponAttack") + get("elementalPart")) * get("higherCritDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `(${formatNumber(get("weaponAttack"))} + ${formatNumber(get("elementalPart"))}) * ${formatNumber(get("higherCritDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "lowerCritTrigger",
            title: "触发低暴击",
            formula: "触发低暴击 = (武器攻击 * (低暴击倍率 + 触发倍率 - 1) + 属性部分(含抗性) * 低暴击倍率) * 总乘区",
            compute: ({ get }) =>
                (get("weaponAttack") * (get("lowerCritDamage") + get("triggerDamageMultiplier") - 1) +
                    get("elementalPart") * get("lowerCritDamage")) *
                get("commonMore"),
            explain: ({ get }, value) =>
                `(${formatNumber(get("weaponAttack"))} * (${formatNumber(get("lowerCritDamage"))} + ${formatNumber(get("triggerDamageMultiplier"))} - 1) + ${formatNumber(get("elementalPart"))} * ${formatNumber(get("lowerCritDamage"))}) * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "higherCritTrigger",
            title: "触发高暴击",
            formula: "触发高暴击 = (武器攻击 * (高暴击倍率 + 触发倍率 - 1) + 属性部分(含抗性) * 高暴击倍率) * 总乘区",
            compute: ({ get }) =>
                (get("weaponAttack") * (get("higherCritDamage") + get("triggerDamageMultiplier") - 1) +
                    get("elementalPart") * get("higherCritDamage")) *
                get("commonMore"),
            explain: ({ get }, value) =>
                `(${formatNumber(get("weaponAttack"))} * (${formatNumber(get("higherCritDamage"))} + ${formatNumber(get("triggerDamageMultiplier"))} - 1) + ${formatNumber(get("elementalPart"))} * ${formatNumber(get("higherCritDamage"))}) * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "lowerCritExpectedTrigger",
            title: "期望触发低暴击",
            formula: "期望触发低暴击 = (武器攻击 * (低暴击倍率 + 触发期望倍率 - 1) + 属性部分(含抗性) * 低暴击倍率) * 总乘区",
            compute: ({ get }) =>
                (get("weaponAttack") * (get("lowerCritDamage") + get("triggerExpectedDamageAdd") - 1) +
                    get("elementalPart") * get("lowerCritDamage")) *
                get("commonMore"),
            explain: ({ get }, value) =>
                `(${formatNumber(get("weaponAttack"))} * (${formatNumber(get("lowerCritDamage"))} + ${formatNumber(get("triggerExpectedDamageAdd"))} - 1) + ${formatNumber(get("elementalPart"))} * ${formatNumber(get("lowerCritDamage"))}) * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "higherCritExpectedTrigger",
            title: "期望触发高暴击",
            formula: "期望触发高暴击 = (武器攻击 * (高暴击倍率 + 触发期望倍率 - 1) + 属性部分(含抗性) * 高暴击倍率) * 总乘区",
            compute: ({ get }) =>
                (get("weaponAttack") * (get("higherCritDamage") + get("triggerExpectedDamageAdd") - 1) +
                    get("elementalPart") * get("higherCritDamage")) *
                get("commonMore"),
            explain: ({ get }, value) =>
                `(${formatNumber(get("weaponAttack"))} * (${formatNumber(get("higherCritDamage"))} + ${formatNumber(get("triggerExpectedDamageAdd"))} - 1) + ${formatNumber(get("elementalPart"))} * ${formatNumber(get("higherCritDamage"))}) * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "expectedCritTrigger",
            title: "触发期望暴击",
            formula: "触发期望暴击 = (武器攻击 + 属性部分(含抗性)) * 暴击期望倍率 * 总乘区",
            compute: ({ get }) => (get("weaponAttack") + get("elementalPart")) * get("critExpectedDamage") * get("commonMore"),
            explain: ({ get }, value) =>
                `(${formatNumber(get("weaponAttack"))} + ${formatNumber(get("elementalPart"))}) * ${formatNumber(get("critExpectedDamage"))} * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "expectedCritNoTrigger",
            title: "未触发期望暴击",
            formula: "未触发期望暴击 = (武器攻击 * (暴击期望倍率 + 触发倍率 - 1) + 属性部分(含抗性) * 暴击期望倍率) * 总乘区",
            compute: ({ get }) =>
                (get("weaponAttack") * (get("critExpectedDamage") + get("triggerDamageMultiplier") - 1) +
                    get("elementalPart") * get("critExpectedDamage")) *
                get("commonMore"),
            explain: ({ get }, value) =>
                `(${formatNumber(get("weaponAttack"))} * (${formatNumber(get("critExpectedDamage"))} + ${formatNumber(get("triggerDamageMultiplier"))} - 1) + ${formatNumber(get("elementalPart"))} * ${formatNumber(get("critExpectedDamage"))}) * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
        },
        {
            id: "expectedDamage",
            title: "最终期望伤害",
            formula: "最终期望伤害 = (武器攻击 * (暴击期望倍率 + 触发期望倍率 - 1) + 属性部分(含抗性) * 暴击期望倍率) * 总乘区",
            compute: ({ get }) =>
                (get("weaponAttack") * (get("critExpectedDamage") + get("triggerExpectedDamageAdd") - 1) +
                    get("elementalPart") * get("critExpectedDamage")) *
                get("commonMore"),
            explain: ({ get }, value) =>
                `(${formatNumber(get("weaponAttack"))} * (${formatNumber(get("critExpectedDamage"))} + ${formatNumber(get("triggerExpectedDamageAdd"))} - 1) + ${formatNumber(get("elementalPart"))} * ${formatNumber(get("critExpectedDamage"))}) * ${formatNumber(get("commonMore"))} = ${formatNumber(value)}`,
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
            id: "defenseMultiplier",
            title: "防御乘区",
            formula: "防御乘区 = 1 - 防御减伤率，并限制在 0~1",
            compute: ({ get }) => clampNumber(1 - get("defenseDamageReduction"), 0, 1),
            explain: ({ get }, value) => `1 - ${formatNumber(get("defenseDamageReduction"))} = ${formatNumber(value)}`,
        },
        {
            id: "finalDamageAfterDefense",
            title: "防御后最终伤害",
            formula: "防御后最终伤害 = 最终伤害(期望) * 防御乘区",
            compute: ({ get }) => get("calculateExpectedDamage") * get("defenseMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("calculateExpectedDamage"))} * ${formatNumber(get("defenseMultiplier"))} = ${formatNumber(value)}`,
        },
    ]
}

/**
 * 构建技能伤害拆解步骤，公式与 CharBuild.calculateSkillDamage 保持一致。
 * @returns 技能步骤定义
 */
function buildSkillStepDefinitions(): DamageStepDefinition<SkillDamageInput>[] {
    return [
        {
            id: "resistancePenetration",
            title: "抗性乘区",
            formula: "抗性乘区 = (1 - 敌人抗性) * (1 + 属性穿透)，最小为 0",
            compute: ({ input }) => Math.max(0, (1 - input.enemyResistance) * (1 + input.penetrationBonus)),
            explain: ({ input }, value) => {
                const raw = (1 - input.enemyResistance) * (1 + input.penetrationBonus)
                return `(1 - ${formatNumber(input.enemyResistance)}) * (1 + ${formatNumber(input.penetrationBonus)}) = ${formatNumber(raw)} -> ${formatNumber(value)}`
            },
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
            id: "damageIncrease",
            title: "增伤乘区",
            formula: "增伤乘区 = 1 + 增伤 + 技能伤害",
            compute: ({ input }) => 1 + input.baseDamageBonus + input.skillDamageBonus,
            explain: ({ input }, value) =>
                `1 + ${formatNumber(input.baseDamageBonus)} + ${formatNumber(input.skillDamageBonus)} = ${formatNumber(value)}`,
        },
        {
            id: "independentDamageIncrease",
            title: "独立增伤乘区",
            formula: "独立增伤乘区 = 1 + 独立增伤",
            compute: ({ input }) => 1 + input.independentBonus,
            explain: ({ input }, value) => `1 + ${formatNumber(input.independentBonus)} = ${formatNumber(value)}`,
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
            id: "hpMore",
            title: "血量相关乘区",
            formula: "血量相关乘区 = 昂扬乘区 * 背水乘区",
            compute: ({ get }) => get("boostMultiplier") * get("desperateMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("boostMultiplier"))} * ${formatNumber(get("desperateMultiplier"))} = ${formatNumber(value)}`,
        },
        {
            id: "charAttack",
            title: "角色攻击",
            formula: "角色攻击 = (角色基础攻击 * (1 + 角色攻击加成 + 和鸣增益) * (1 + 属性伤) + 固定攻击)保留2位",
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
            formula: "技能基础伤害 = 技能倍率伤害 * 抗性乘区 * 增伤乘区 * 独立增伤乘区 * 失衡乘区",
            compute: ({ get }) =>
                get("skillBaseDamage") *
                get("resistancePenetration") *
                get("damageIncrease") *
                get("independentDamageIncrease") *
                get("imbalanceDamageMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("skillBaseDamage"))} * ${formatNumber(get("resistancePenetration"))} * ${formatNumber(get("damageIncrease"))} * ${formatNumber(get("independentDamageIncrease"))} * ${formatNumber(get("imbalanceDamageMultiplier"))} = ${formatNumber(value)}`,
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
            id: "defenseMultiplier",
            title: "防御乘区",
            formula: "防御乘区 = 1 - 防御减伤率，并限制在 0~1",
            compute: ({ get }) => clampNumber(1 - get("defenseDamageReduction"), 0, 1),
            explain: ({ get }, value) => `1 - ${formatNumber(get("defenseDamageReduction"))} = ${formatNumber(value)}`,
        },
        {
            id: "finalDamageAfterDefense",
            title: "防御后最终伤害",
            formula: "防御后最终伤害 = 最终伤害(期望) * 防御乘区",
            compute: ({ get }) => get("calculateExpectedDamage") * get("defenseMultiplier"),
            explain: ({ get }, value) =>
                `${formatNumber(get("calculateExpectedDamage"))} * ${formatNumber(get("defenseMultiplier"))} = ${formatNumber(value)}`,
        },
    ]
}

const mode = ref<CalcMode>("skill")
const usePercentInput = ref(false)
const weaponInput = reactive<WeaponDamageInput>(createDefaultWeaponInput())
const skillInput = reactive<SkillDamageInput>(createDefaultSkillInput())
const weaponOverrides = ref<Record<string, ManualStepOverride>>({})
const skillOverrides = ref<Record<string, ManualStepOverride>>({})
const weaponMergeItems = ref<MergeItem[]>([{ operator: "*", stepId: "expectedDamage" }])
const skillMergeItems = ref<MergeItem[]>([{ operator: "*", stepId: "expectedDamage" }])

const weaponStepDefinitions = buildWeaponStepDefinitions()
const skillStepDefinitions = buildSkillStepDefinitions()

interface NumberFieldConfig<TField extends string> {
    key: TField
    label: string
    step: string
}

interface ToggleFieldConfig<TField extends string> {
    key: TField
    label: string
}

interface GroupOutputConfig {
    label: string
    stepId: string
}

interface NumberFieldGroup<TNumberField extends string, TToggleField extends string> {
    title: string
    fields: NumberFieldConfig<TNumberField>[]
    toggles?: ToggleFieldConfig<TToggleField>[]
    outputs?: GroupOutputConfig[]
    emptyTip?: string
}

const weaponNumberGroups: NumberFieldGroup<WeaponNumberFieldKey, WeaponToggleFieldKey>[] = [
    {
        title: "攻击",
        fields: [
            { key: "charBaseAttack", label: "角色基础攻击", step: "0.01" },
            { key: "charAttackBonus", label: "角色攻击加成", step: "0.01" },
            { key: "resonanceGain", label: "和鸣增益", step: "0.01" },
            { key: "elementalDamageBonus", label: "属性伤", step: "0.01" },
            { key: "fixedAttackAdd", label: "固定攻击", step: "0.01" },
            { key: "weaponBaseAttack", label: "武器基础攻击", step: "0.01" },
            { key: "weaponAttackBonus", label: "武器攻击加成", step: "0.01" },
            { key: "physicalDamageBonus", label: "物理", step: "0.01" },
        ],
        toggles: [{ key: "weaponMasteryEnabled", label: "武器精通(1.2倍)" }],
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
        fields: [
            { key: "baseDamageBonus", label: "增伤", step: "0.01" },
            { key: "weaponDamageBonus", label: "武器伤害", step: "0.01" },
            { key: "independentBonus", label: "独立增伤", step: "0.01" },
            { key: "weaponIndependentBonus", label: "武器独立增伤", step: "0.01" },
            { key: "additionalDamageBonus", label: "追加伤害", step: "0.01" },
        ],
        outputs: [{ label: "增伤乘区", stepId: "damageIncrease" }],
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
        fields: [
            { key: "baseTriggerRate", label: "基础触发", step: "0.01" },
            { key: "triggerRateBonus", label: "触发加成", step: "0.01" },
            { key: "triggerBonus", label: "触发倍率加成", step: "0.01" },
            { key: "hpTypeCoefficient", label: "生命类型系数", step: "0.01" },
        ],
        toggles: [{ key: "sameDamageType", label: "伤害类型匹配(触发生效)" }],
        outputs: [{ label: "触发期望倍率", stepId: "triggerExpectedDamageAdd" }],
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
            { label: "防御乘区", stepId: "defenseMultiplier" },
            { label: "防御后最终伤害", stepId: "finalDamageAfterDefense" },
        ],
    },
    {
        title: "环境",
        fields: [
            { key: "enemyResistance", label: "敌人抗性", step: "0.01" },
            { key: "penetrationBonus", label: "属性穿透", step: "0.01" },
            { key: "imbalanceBonus", label: "失衡易伤", step: "0.01" },
        ],
        toggles: [{ key: "imbalanceEnabled", label: "处于失衡状态" }],
        outputs: [
            { label: "抗性乘区", stepId: "resistance" },
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
            { key: "elementalDamageBonus", label: "属性伤", step: "0.01" },
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
            { key: "independentBonus", label: "独立增伤", step: "0.01" },
        ],
        outputs: [{ label: "增伤乘区", stepId: "damageIncrease" }],
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
            { key: "skillIgnoreDefense", label: "技能无视防御", step: "0.01" },
            { key: "attackerLevel", label: "角色等级", step: "1" },
            { key: "enemyLevel", label: "怪物等级", step: "1" },
        ],
        outputs: [
            { label: "防御乘区", stepId: "defenseMultiplier" },
            { label: "防御后最终伤害", stepId: "finalDamageAfterDefense" },
        ],
    },
    {
        title: "环境",
        fields: [
            { key: "enemyResistance", label: "敌人抗性", step: "0.01" },
            { key: "penetrationBonus", label: "属性穿透", step: "0.01" },
            { key: "imbalanceBonus", label: "失衡易伤", step: "0.01" },
        ],
        toggles: [{ key: "imbalanceEnabled", label: "处于失衡状态" }],
        outputs: [
            { label: "抗性乘区", stepId: "resistancePenetration" },
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
}

/**
 * 读取当前模式的手动覆盖映射。
 */
const currentOverrides = computed(() => (mode.value === "weapon" ? weaponOverrides.value : skillOverrides.value))

/**
 * 读取当前模式的合并项。
 */
const currentMergeItems = computed(() => (mode.value === "weapon" ? weaponMergeItems.value : skillMergeItems.value))

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
            formula: definition.formula,
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
    return mode.value === "weapon"
        ? evaluateDamageSteps(weaponStepDefinitions, weaponInput, weaponOverrides.value)
        : evaluateDamageSteps(skillStepDefinitions, skillInput, skillOverrides.value)
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
    const keys =
        mode.value === "weapon"
            ? [
                  "finalDamageAfterDefense",
                  "expectedDamage",
                  "calculateExpectedDamage",
                  "skillBaseDamage",
                  "expectedCritTrigger",
                  "expectedCritNoTrigger",
                  "lowerCritExpectedTrigger",
                  "higherCritExpectedTrigger",
              ]
            : ["finalDamageAfterDefense", "expectedDamage", "calculateExpectedDamage", "skillBaseDamage", "finalDamage"]

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
 * 写入武器开关字段。
 * @param key 字段键
 * @param checked 开关值
 */
function setWeaponToggleValue(key: WeaponToggleFieldKey, checked: boolean): void {
    weaponInput[key] = checked
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
 * 获取武器字段展示标签。
 * @param key 字段键
 * @param label 原始标签
 * @returns 展示标签
 */
function getWeaponFieldLabel(key: WeaponNumberFieldKey, label: string): string {
    return usePercentInput.value && isWeaponPercentField(key) ? `${label}(%)` : label
}

/**
 * 获取技能字段展示标签。
 * @param key 字段键
 * @param label 原始标签
 * @returns 展示标签
 */
function getSkillFieldLabel(key: SkillNumberFieldKey, label: string): string {
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
 * 新增合并运算项，默认使用期望伤害。
 */
function addMergeItem(): void {
    currentMergeItems.value.push({ operator: "*", stepId: "expectedDamage" })
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
        <div class="mx-auto w-full max-w-7xl space-y-4 p-4">
            <div class="rounded-xl border border-base-300 bg-base-200/50 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 class="text-lg font-semibold">伤害公式</h2>
                        <p class="text-sm text-base-content/70">按步骤查看每个乘区和中间值，支持手动覆盖并实时查看结果变化。</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="btn btn-sm btn-primary" @click="importFromCurrentCharBuild">从当前构筑导入</button>
                        <button class="btn btn-sm btn-outline" @click="resetCurrentMode">重置当前模式</button>
                    </div>
                </div>
                <div class="mt-4 tabs tabs-box gap-2 p-1">
                    <button class="tab grow" :class="{ 'tab-active': mode === 'skill' }" @click="mode = 'skill'">技能伤害</button>
                    <button class="tab grow" :class="{ 'tab-active': mode === 'weapon' }" @click="mode = 'weapon'">武器伤害</button>
                </div>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
                <div class="rounded-xl border border-base-300 bg-base-200/40 p-4">
                    <div class="mb-3 flex items-center justify-between gap-2">
                        <h3 class="text-base font-semibold">输入参数</h3>
                        <label class="label cursor-pointer gap-2 p-0">
                            <span class="label-text text-xs">百分比输入</span>
                            <input v-model="usePercentInput" type="checkbox" class="toggle toggle-sm toggle-primary" />
                        </label>
                    </div>
                    <div v-if="mode === 'weapon'" class="space-y-3">
                        <div v-for="group in weaponNumberGroups" :key="group.title" class="rounded-lg bg-base-100 p-3">
                            <h4 class="mb-2 text-sm font-semibold">{{ group.title }}</h4>
                            <div v-if="group.fields.length > 0" class="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <label v-for="field in group.fields" :key="field.key" class="form-control">
                                    <div class="mb-1 text-xs text-base-content/70">{{ getWeaponFieldLabel(field.key, field.label) }}</div>
                                    <input
                                        class="input input-sm input-bordered w-full"
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
                                    <span class="label-text">{{ toggleField.label }}</span>
                                </label>
                            </div>
                            <div v-if="group.outputs && group.outputs.length > 0" class="mt-3 border-t border-base-300/60 pt-2">
                                <div class="mb-1 text-xs text-base-content/60">块输出</div>
                                <div class="space-y-1">
                                    <div
                                        v-for="output in group.outputs"
                                        :key="output.stepId"
                                        class="flex cursor-grab items-center justify-between rounded-md bg-base-200/70 px-2 py-1 active:cursor-grabbing"
                                        :class="{ 'opacity-50': !canAddStepToMerge(output.stepId) }"
                                        @mousedown.prevent="startOutputMouseDrag(output, $event)"
                                    >
                                        <div class="min-w-0 flex-1">
                                            <button
                                                class="text-left text-xs text-info hover:underline"
                                                @mousedown.stop
                                                @click.stop="jumpToStep(output.stepId)"
                                            >
                                                {{ output.label }}
                                            </button>
                                            <div class="font-mono text-sm">{{ formatNumber(getGroupOutputValue(output.stepId)) }}</div>
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
                                                    class="input input-xs input-bordered w-24 font-mono"
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
                                            class="btn btn-xs btn-circle btn-ghost"
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
                                v-if="group.fields.length === 0 && (!group.toggles || group.toggles.length === 0)"
                                class="text-xs text-base-content/60"
                            >
                                {{ group.emptyTip || "当前模式暂无该类参数" }}
                            </div>
                        </div>
                    </div>

                    <div v-else class="space-y-3">
                        <div v-for="group in skillNumberGroups" :key="group.title" class="rounded-lg bg-base-100 p-3">
                            <h4 class="mb-2 text-sm font-semibold">{{ group.title }}</h4>
                            <div v-if="group.fields.length > 0" class="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <label v-for="field in group.fields" :key="field.key" class="form-control">
                                    <div class="mb-1 text-xs text-base-content/70">{{ getSkillFieldLabel(field.key, field.label) }}</div>
                                    <input
                                        class="input input-sm input-bordered w-full"
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
                            <div v-if="group.outputs && group.outputs.length > 0" class="mt-3 border-t border-base-300/60 pt-2">
                                <div class="mb-1 text-xs text-base-content/60">块输出</div>
                                <div class="space-y-1">
                                    <div
                                        v-for="output in group.outputs"
                                        :key="output.stepId"
                                        class="flex cursor-grab items-center justify-between rounded-md bg-base-200/70 px-2 py-1 active:cursor-grabbing"
                                        :class="{ 'opacity-50': !canAddStepToMerge(output.stepId) }"
                                        @mousedown.prevent="startOutputMouseDrag(output, $event)"
                                    >
                                        <div class="min-w-0 flex-1">
                                            <button
                                                class="text-left text-xs text-info hover:underline"
                                                @mousedown.stop
                                                @click.stop="jumpToStep(output.stepId)"
                                            >
                                                {{ output.label }}
                                            </button>
                                            <div class="font-mono text-sm">{{ formatNumber(getGroupOutputValue(output.stepId)) }}</div>
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
                                                    class="input input-xs input-bordered w-24 font-mono"
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
                                            class="btn btn-xs btn-circle btn-ghost"
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
                                v-if="group.fields.length === 0 && (!group.toggles || group.toggles.length === 0)"
                                class="text-xs text-base-content/60"
                            >
                                {{ group.emptyTip || "当前模式暂无该类参数" }}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="space-y-4">
                    <div class="rounded-xl border border-base-300 bg-base-200/40 p-4">
                        <h3 class="mb-3 text-base font-semibold">核心结果</h3>
                        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div v-for="item in summaryItems" :key="item.key" class="rounded-lg bg-base-100 p-3">
                                <div class="text-xs text-base-content/70">{{ item.label }}</div>
                                <div class="font-mono text-base">{{ formatNumber(item.value) }}</div>
                            </div>
                        </div>
                    </div>

                    <div
                        ref="mergeDropZoneRef"
                        class="rounded-xl border border-base-300 bg-base-200/40 p-4 transition lg:sticky lg:top-4 lg:z-20"
                        :class="{ 'ring-2 ring-primary/40': isMergeDropActive }"
                    >
                        <div class="mb-3 flex items-center justify-between gap-2">
                            <div>
                                <h3 class="text-base font-semibold">多步骤合并运算</h3>
                                <div class="text-xs text-base-content/60">支持从左侧块输出拖入或点击 + 快速添加</div>
                            </div>
                            <button class="btn btn-sm btn-outline" @click="addMergeItem">添加步骤</button>
                        </div>
                        <div class="space-y-2">
                            <div v-for="(item, index) in currentMergeItems" :key="index" class="grid grid-cols-12 items-center gap-2">
                                <select v-model="item.operator" class="select select-sm col-span-2" :disabled="index === 0">
                                    <option value="+">+</option>
                                    <option value="-">-</option>
                                    <option value="*">*</option>
                                    <option value="/">/</option>
                                </select>
                                <select v-model="item.stepId" class="select select-sm col-span-9">
                                    <option v-for="option in stepOptions" :key="option.id" :value="option.id">
                                        {{ option.label }} = {{ formatNumber(option.value) }}
                                    </option>
                                </select>
                                <button
                                    class="btn btn-sm btn-ghost col-span-1 px-0"
                                    :disabled="currentMergeItems.length <= 1"
                                    @click="removeMergeItem(index)"
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                        <div class="mt-3 rounded-lg bg-base-100 p-3 text-sm">
                            <div class="text-xs text-base-content/70">公式展开</div>
                            <div class="mt-1 break-all font-mono">{{ mergeResult.formulaText }}</div>
                            <div class="mt-2 text-xs text-base-content/70">合并结果</div>
                            <div class="font-mono text-base">{{ formatNumber(mergeResult.result) }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="rounded-xl border border-base-300 bg-base-200/40 p-4">
                <h3 class="mb-3 text-base font-semibold">步骤拆解</h3>
                <div class="space-y-2">
                    <div v-for="step in evaluatedSteps" :id="`db-dmg-step-${step.id}`" :key="step.id" class="rounded-lg bg-base-100 p-3">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div class="font-semibold">{{ step.title }}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-xs text-base-content/60">最终值</div>
                                <div class="font-mono">{{ formatNumber(step.finalValue) }}</div>
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
            class="pointer-events-none fixed z-50 rounded-md border border-primary/30 bg-base-100/95 px-2 py-1 shadow-lg"
            :style="{ left: `${activeOutputDrag.x + 12}px`, top: `${activeOutputDrag.y + 12}px` }"
        >
            <div class="text-xs text-base-content/70">{{ activeOutputDrag.label }}</div>
            <div class="font-mono text-sm">{{ formatNumber(activeOutputDrag.value) }}</div>
        </div>
    </ScrollArea>
</template>
