import {
    type DnaSeasonAffix,
    flattenEquippedGear,
    getCraftCosts,
    getGearCraftState,
    getMasterworkMax,
    getSkillLevelIndex,
    getSkillLevelName,
    getSlotBaseAffixId,
    resolveAffixValue,
    resolveInlayAffixId,
    resourceMap,
    SKILL_LEVEL_SLOT_TYPES,
    type TranscendGearAffixRoll,
    type TranscendGearAffixSource,
    type TranscendGearCraftState,
    type TranscendGearItemConfig,
} from "@/data"
import {
    formatAffixDisplayValue,
    formatAffixValue,
    formatModeledAffixValue,
    getAffixAttrs,
    getAffixById,
    getAffixModeledValues,
    getAffixSummary,
    getAffixSummaryParts,
    getAffixUniqueEquips,
    getModeledValueName,
    isEffectOnlyAffix,
    quantizeAffixRangeValues,
} from "@/utils/transcendence-gear"
import { getBaseNameById, getCurrentSeasonId, getGearIconSrc, getUniqueEquipById } from "./catalog"
import { getAffixRollRange } from "./generation"

/**
 * 装备展示派生：词缀行（来源 / 最终数值）、宝石孔位效果、搜索文本。
 * 数值一律来自数据层 `resolveAffixValue`，界面不重写公式。
 */

/**
 * 词条行标记样式（上游 `PointStyle`）：0 灰点 / 1 Forge 叠图 / 2 专属橙星；孔位 3 空孔 / 4 已镶嵌。
 * `none` 表示基础词条或越界样式，整列折叠。
 */
export type GearLinePointStyle = 0 | 1 | 2 | 3 | 4 | "none"

/** 词条行标记：Forge 四类独立成立、可同时出现（上游 `BuildAffixRow`） */
export interface GearLineMarkState {
    base: boolean
    ancient: boolean
    finalMasterwork: boolean
    tempering: boolean
    enchant: boolean
    unique: boolean
    /** `ancient || finalMasterwork || tempering || enchant` */
    forge: boolean
    pointStyle: GearLinePointStyle
    source: TranscendGearAffixSource
    /** 来源未知（旧物品无法推断）：灰点仍渲染，aria 保留「来源未知」 */
    unknown: boolean
    /** 跨赛季专属（上游 `bDisabled`）：标签剥离、变红 */
    disabled: boolean
}

/** 物品展示用的一条词缀 */
export interface GearAffixLine {
    roll: TranscendGearAffixRoll
    affix?: DnaSeasonAffix
    source: TranscendGearAffixSource
    /** 词缀原文摘要（调用方逐段翻译） */
    summaryParts: string[]
    /** 最终数值文本；无属性 / 数据缺失时为空串 */
    valueText: string
    /** 档位文本（基础词条 = 强度） */
    rollText: string
    /** 当前强度下的最终值区间（随机 / 淬炼 / 附魔且非太古）：`[min~max]%`；其余为空串 */
    rangeText: string
    ancient: boolean
    /** 是否命中当前生效的最终精锻目标（精锻满级 + 目标词条可最终精锻） */
    finalMasterwork: boolean
    /** `affixes` 数组下标（专属行不在数组内，固定 -1） */
    affixIndex?: number
    /** 基础词条：下标命中槽位 `BaseAffixIdIndex`（模型里由槽位基础词条 id 反推） */
    base?: boolean
    /** 淬炼：下标命中 `craft.temperingAffixIndex` */
    tempering?: boolean
    /** 附魔：下标命中 `craft.enchantAffixIndex` */
    enchant?: boolean
    /** 专属：`affixId === UniqueAffixId` */
    unique?: boolean
    /** 任意打造标记：太古 / 最终精锻 / 淬炼 / 附魔 */
    forge?: boolean
    /** 上游 `PointStyle`（词条行只产出 0 / 1 / 2 / none） */
    pointStyle?: GearLinePointStyle
    /** 当前值 ≠ 基准值：数值用 `<Gold>` 金色（基础 / 太古强制白色） */
    valueHighlight?: boolean
    /** 跨赛季专属：标签剥离、变红 */
    disabled?: boolean
}

/** 孔位展示用的一颗宝石 */
export interface GearSocketLine {
    socketIndex: number
    gemId: number
    /** 宝石原文名；数据与快照都缺失时为空串（界面显示未知宝石 + CopyID） */
    name: string
    /** 是否缺少名称数据 */
    unknownGem: boolean
    iconSrc: string
    affixId: number | null
    affix?: DnaSeasonAffix
    summaryParts: string[]
    valueText: string
}

/**
 * 读取词缀来源：优先物品内记录，旧物品按槽位基础词条与 craft 索引推断，仍无法判断时为 unknown。
 * 最终精锻沿用 Random 来源（上游 `SourceType` 只区分 Base / Unique / Tempering / Enchant / Random）。
 * @param roll 词缀
 * @param slotType 槽型
 * @param craft 物品 craft 状态（旧物品来源回退用）
 * @param index 词缀在 `affixes` 中的下标（与 craft 索引同口径）
 * @returns 来源
 */
export function getAffixSource(
    roll: TranscendGearAffixRoll,
    slotType: number,
    craft?: Pick<TranscendGearCraftState, "temperingAffixIndex" | "enchantAffixIndex" | "finalMasterworkAffixIndex">,
    index?: number
): TranscendGearAffixSource {
    if (roll.source) return roll.source
    const baseAffixId = getSlotBaseAffixId(slotType)
    if (baseAffixId !== null && roll.affixId === baseAffixId) return "base"
    if (index !== undefined) {
        if (craft?.temperingAffixIndex === index) return "tempering"
        if (craft?.enchantAffixIndex === index) return "enchant"
        // 最终精锻不是独立来源：上游 SourceType 仍是 Random
        if (craft?.finalMasterworkAffixIndex === index) return "random"
    }
    return "unknown"
}

/** 词缀数值展示：最终文本 + 是否用金色（上游 `Value ~= Base` 时 `<Gold>`） */
export interface AffixValuePresentation {
    valueText: string
    gold: boolean
}

/** 技能等级词条解析结果：`skillTypes` 与 `skillIds` 统一判定（U58-fix） */
export interface AffixSkillLevelInfo {
    /** `skillTypes` 或 `skillIds` 任一非空 */
    isSkillLevel: boolean
    /** 展示用技能类型（去重）：显式类型在前，`skillIds` 按技能树槽位补 Skill1 / Skill2 / Passive */
    skillTypes: string[]
    /** 无法映射到技能槽位的 `skillIds`（不进入 chips，不影响其他 id 落槽） */
    unresolvedSkillIds: number[]
}

/**
 * 解析词条的技能等级目标：Plan 3 用 `skillTypes`，1.8.7.1 起的 Plan 4 用 `skillIds`。
 * `skillIds` 复用数据层 `getSkillLevelIndex`（角色技能树顺序 + 子技能继承 + 协战排除），不维护第二套映射。
 * @param affix 词缀
 * @returns 统一判定、展示用技能类型与未映射 id
 */
export function getAffixSkillLevelInfo(affix: DnaSeasonAffix): AffixSkillLevelInfo {
    const skillIds = affix.addSkillLevel?.skillIds ?? []
    const skillTypes: string[] = []
    const addType = (type: string) => {
        if (!skillTypes.includes(type)) skillTypes.push(type)
    }
    for (const type of affix.addSkillLevel?.skillTypes ?? []) addType(type)
    const slotIndexes = new Set<number>()
    const unresolvedSkillIds: number[] = []
    for (const skillId of skillIds) {
        const index = getSkillLevelIndex(skillId)
        if (index === undefined) unresolvedSkillIds.push(skillId)
        else slotIndexes.add(index)
    }
    for (const index of [...slotIndexes].sort((left, right) => left - right)) addType(SKILL_LEVEL_SLOT_TYPES[index])
    return { isSkillLevel: skillTypes.length > 0 || skillIds.length > 0, skillTypes, unresolvedSkillIds }
}

/**
 * 计算一条词缀的最终值文本与金色判定。
 * `Base` 取太古基数（MaxValue × AncientFunc，缺公式时为 MaxValue）或档位基础值，`Value` 为精锻 / 最终精锻后的最终值；
 * 基础 / 太古由调用方强制白色。`fine` 跟随区间自适应细精度（上游 `FormatAffixAddAttrs` 的 `bFinePrecision`）。
 * @param affix 词缀
 * @param roll 词缀 roll
 * @param slotId 装备位（解析器需要，纯展示不影响数值）
 * @param fine 是否启用 0.05 细精度（仅带强度区间的行）
 * @returns 展示文本与金色判定；无属性时文本为空串
 */
export function getAffixValuePresentation(
    affix: DnaSeasonAffix,
    roll: TranscendGearAffixRoll,
    slotId = 0,
    fine = false
): AffixValuePresentation {
    const attrs = getAffixAttrs(affix)
    const skillLevel = getAffixSkillLevelInfo(affix)
    if (!attrs.length && !skillLevel.isSkillLevel) return { valueText: "", gold: false }
    const result = resolveAffixValue(affix, { slotId, ...roll })
    const valueText = skillLevel.isSkillLevel ? `+${Math.round(result.final)}` : formatAffixDisplayValue(attrs[0], result.final, { fine })
    // 太古基数 = MaxValue × AncientFunc；缺 AncientFunc 时仍是 MaxValue（上游 `ApplyFunc(nil, MaxValue)`）
    const baseValue = roll.ancient ? result.afterAncient : result.rolled
    return { valueText, gold: result.final !== baseValue }
}

/**
 * 按属性 / 技能类型格式化一条词缀的最终值。
 * @param affix 词缀
 * @param roll 词缀 roll
 * @param slotId 装备位（解析器需要，纯展示不影响数值）
 * @param fine 是否启用 0.05 细精度（仅带强度区间的行）
 * @returns 展示文本；无属性时为空串
 */
export function getAffixFinalValueText(affix: DnaSeasonAffix, roll: TranscendGearAffixRoll, slotId = 0, fine = false): string {
    return getAffixValuePresentation(affix, roll, slotId, fine).valueText
}

/** 暗金专属词条的属性键值对行（另起一行展示，替代效果文本后的裸数值） */
export interface GearAffixDetailRow {
    /** 渲染 key：同类来源内唯一 */
    key: string
    /** 属性 / 技能类型 / 建模行名称（已本地化） */
    name: string
    /** 结算值文本（技能等级为 `+N`） */
    value: string
}

/**
 * 暗金专属词条的属性明细行：技能等级按规范名（战技技能等级 / 终结技技能等级 / 被动技能等级）的官方译名 + `+N`，
 * 数据属性按属性名 + 结算值，无数据属性时按手写建模行名称 + 值。
 * 仅服务被 `uniqueEquips` 引用的 Plan 4 专属词条：宝石等非专属 Plan 4 词条直接返回空数组。
 * `slotId` 仅为解析器入参前向兼容，数据层 `resolveAffixValue` 当前不读取，默认 0 不产生数值偏差。
 * @param affix 词缀（专属行）
 * @param roll 词缀 roll（太古 / 精锻 / 最终精锻已含在结算值内）
 * @param slotId 装备位（前向兼容，不参与当前结算）
 * @param translate 界面文案翻译函数（技能等级兜底文案，支持插值参数）
 * @param gameText 游戏原文翻译函数（属性名 / 规范名 / 建模行名）
 * @returns 明细行；非专属或无展示内容时为空数组
 */
export function getUniqueAffixDetailRows(
    affix: DnaSeasonAffix,
    roll: TranscendGearAffixRoll,
    slotId: number,
    translate: (key: string, options?: Record<string, unknown>) => string,
    gameText: (text: string) => string
): GearAffixDetailRow[] {
    if (affix.plan !== 4 || !getAffixUniqueEquips(affix.id).length) return []
    const skillLevel = getAffixSkillLevelInfo(affix)
    const attrs = getAffixAttrs(affix)
    const modeled = getAffixModeledValues(affix.id)
    if (!skillLevel.isSkillLevel && !attrs.length && !modeled.length) return []
    const resolved = resolveAffixValue(affix, { slotId, ...roll })
    if (skillLevel.isSkillLevel) {
        const final = Math.round(resolved.final)
        // 技能 id 全部无法映射时仍要出值：复用手写计算器的「技能等级 +N」兜底文案
        if (!skillLevel.skillTypes.length) {
            return [{ key: "skill:unresolved", name: translate("db-transcendence.gear.calc_skill_level", { value: final }), value: "" }]
        }
        const value = `+${final}`
        // 名称走数据层唯一规范名 → 官方译名；未知类型回退原始类型名，不发明文案
        return skillLevel.skillTypes.map(type => ({ key: `skill:${type}`, name: gameText(getSkillLevelName(type) || type), value }))
    }
    if (attrs.length) {
        return attrs.map((attr, index) => ({
            key: `attr:${index}:${attr.attr}`,
            name: gameText(attr.attr),
            value: formatAffixValue(attr, resolved.final),
        }))
    }
    return modeled.map((item, index) => ({
        key: `modeled:${index}:${item.name}`,
        name: getModeledValueName(item, translate, gameText),
        value: formatModeledAffixValue(item),
    }))
}

/**
 * 词缀在指定强度下的最终值区间文本：`[min~max]%`（非百分比不带 %，技能等级取整数）。
 * 官方 tips 的方括号内不带 `+` 前缀，`%` 落在括号外。
 * 区间两端由数据层 `resolveAffixValue` 解析，再按上游 `FormatAffixAttrRangeValue` 量化
 * （先 0.5 步进；百分比两端同桶时才切 0.05 细精度）。
 * 强度缺失、区间塌缩或无可展示属性时为空串；
 * 固定值技能等级词条（Plan 4 `min === max`，强度不改变数值）按上游 AddSkillLevel 口径输出 `[v~v]`。
 * @param affix 词缀
 * @param equipBaseScore 强度 1-50
 * @param slotId 装备位（解析器需要，纯展示不影响数值）
 * @returns 区间文本
 */
export function getAffixStrengthRangeText(affix: DnaSeasonAffix, equipBaseScore: number | undefined, slotId = 0): string {
    const strength = Math.round(Number(equipBaseScore) || 0)
    if (strength <= 0) return ""
    const attrs = getAffixAttrs(affix)
    const skillLevel = getAffixSkillLevelInfo(affix)
    if (!attrs.length && !skillLevel.isSkillLevel) return ""
    const range = getAffixRollRange(affix, strength)
    const entry = { affixId: affix.id, slotId, masterworkLevel: 0, ancient: false, finalMasterwork: false }
    if (range.min === range.max) {
        // 固定值技能等级词条：强度档位塌缩但数值本身固定，上游 `FormatEquipmentAffixRangeValueText` 仍输出 [v~v]
        if (!attrs.length && affix.minValue === affix.maxValue) {
            const value = Math.round(resolveAffixValue(affix, { ...entry, rollLevel: range.min }).final)
            return `[${value}~${value}]`
        }
        return ""
    }
    const lower = resolveAffixValue(affix, { ...entry, rollLevel: range.min }).final
    const upper = resolveAffixValue(affix, { ...entry, rollLevel: range.max }).final
    if (!attrs.length) return `[${Math.round(lower)}~${Math.round(upper)}]`
    const rangeValues = quantizeAffixRangeValues(attrs[0], lower, upper)
    const unit = rangeValues.percent ? "%" : ""

    return `[${rangeValues.lower}~${rangeValues.upper}]${unit}`
}

/**
 * 词条行的当前值是否跟随区间自适应 0.05 细精度（上游 `FormatAffixAddAttrs` 的 `bFinePrecision`）。
 * 与 `getAffixStrengthRangeText` 同源：强度有效、有属性且区间两端 coarse 相同。
 * @param affix 词缀
 * @param equipBaseScore 强度
 * @param slotId 装备位
 * @returns 需要细精度为 true
 */
function needsFineAffixValue(affix: DnaSeasonAffix, equipBaseScore: number | undefined, slotId = 0): boolean {
    const strength = Math.round(Number(equipBaseScore) || 0)
    const attrs = getAffixAttrs(affix)
    if (strength <= 0 || !attrs.length) return false
    const range = getAffixRollRange(affix, strength)
    if (range.min === range.max) return false
    const entry = { affixId: affix.id, slotId, masterworkLevel: 0, ancient: false, finalMasterwork: false }
    const lower = resolveAffixValue(affix, { ...entry, rollLevel: range.min }).final
    const upper = resolveAffixValue(affix, { ...entry, rollLevel: range.max }).final

    return quantizeAffixRangeValues(attrs[0], lower, upper).fine
}

/**
 * 词条是否确有档位区间（词缀卡「全档位」标签条件）。
 * 有属性块且非单值：Plan 2 / 3 恒有区间，手写建模 / 单值 / Plan 4 不显示。
 * @param affix 词缀
 * @returns 显示「全档位」为 true
 */
export function hasTierRange(affix: DnaSeasonAffix): boolean {
    if (!getAffixAttrs(affix).length) return false

    return affix.plan === 2 || affix.plan === 3 || affix.minValue !== affix.maxValue
}

/**
 * 当前生效的最终精锻目标下标：精锻满级且目标词条带最终精锻公式时才算数。
 * 满级口径与滑杆 / 摘要同源（数据 craft 1 `maxCount`）；craft 状态缺失时由 `getGearCraftState`
 * 按 per-affix 字段回退（旧数据）。
 * @param item 装备物品
 * @param state 已解析的 craft 状态（避免同一物品重复解析）
 * @returns 生效目标的词条下标；无效时 undefined
 */
function getActiveFinalMasterworkIndex(item: TranscendGearItemConfig, state = getGearCraftState(item)): number | undefined {
    const index = state.finalMasterworkAffixIndex
    if (index === undefined || state.masterworkLevel < getMasterworkMax()) return undefined
    const roll = Array.isArray(item.affixes) ? item.affixes[index] : undefined
    const affix = roll ? getAffixById(roll.affixId) : undefined
    return affix?.maxAffixUpdateFunc ? index : undefined
}

/** 会生成强度区间的来源：随机 / 淬炼 / 附魔（太古与基础 / 专属不显示） */
const RANGE_SOURCES: ReadonlySet<TranscendGearAffixSource> = new Set(["random", "tempering", "enchant"])

/**
 * 组织物品的词缀行：按 `item.affixes` 数组顺序输出（基础 / 随机 / 淬炼 / 附魔保持识别或编辑顺序），
 * 暗金专属行追加在数组行之后（专属词条不在 `affixes` 内）。
 * 标记严格按上游 `BuildAffixRow`：基础下标、太古、最终精锻 / 淬炼 / 附魔索引、专属 id 各自独立判定；
 * Forge 四类同时成立时全部保留（`pointStyle = 1`），由渲染层叠图。
 * @param item 装备物品
 * @param slotId 装备位（展示用）
 * @returns 词缀行
 */
export function getItemAffixLines(item: TranscendGearItemConfig, slotId = 0): GearAffixLine[] {
    const lines: GearAffixLine[] = []
    const affixRolls = Array.isArray(item.affixes) ? item.affixes : []
    const craftState = getGearCraftState(item)
    const baseAffixId = getSlotBaseAffixId(item.slotType)
    // 模型没有单独的 BaseAffixIdIndex：用槽位基础词条 id 反推下标（无数据时回退 source 标记）
    const baseIndex =
        baseAffixId === null
            ? affixRolls.findIndex(roll => roll.source === "base")
            : affixRolls.findIndex(roll => roll.affixId === baseAffixId)
    const uniqueAffixId = item.uniqueAffix?.affixId
    const itemSeason = Math.round(Number(item.seasonId))
    const crossSeason = Number.isFinite(itemSeason) && itemSeason > 0 && itemSeason !== getCurrentSeasonId()
    for (const [index, roll] of affixRolls.entries()) {
        const affix = getAffixById(roll.affixId)
        const source = getAffixSource(roll, item.slotType, craftState, index)
        const base = index === baseIndex
        const ancient = !base && roll.ancient === true
        const finalMasterwork = !base && index === craftState.finalMasterworkAffixIndex
        const tempering = !base && index === craftState.temperingAffixIndex
        const enchant = !base && index === craftState.enchantAffixIndex
        const unique = uniqueAffixId !== undefined && roll.affixId === uniqueAffixId
        const forge = ancient || finalMasterwork || tempering || enchant
        const pointStyle: GearLinePointStyle = base ? "none" : forge ? 1 : unique ? 2 : 0
        const range = affix ? `${Math.max(1, Math.round(affix.totalValueLevel || 1))}` : ""
        const rangeText =
            affix && RANGE_SOURCES.has(source) && !roll.ancient ? getAffixStrengthRangeText(affix, item.equipBaseScore, slotId) : ""
        // 当前值与展示区间同源：区间实际渲染且两端同桶时，当前值也走 0.05 细精度
        const fine = Boolean(rangeText) && affix !== undefined && needsFineAffixValue(affix, item.equipBaseScore, slotId)
        const value = affix ? getAffixValuePresentation(affix, roll, slotId, fine) : { valueText: "", gold: false }
        lines.push({
            roll,
            affix,
            source,
            summaryParts: affix ? getAffixSummaryParts(affix) : [],
            valueText: value.valueText,
            rollText: range ? `${Math.round(roll.rollLevel)} / ${range}` : `${Math.round(roll.rollLevel)}`,
            rangeText,
            ancient: roll.ancient === true,
            finalMasterwork,
            affixIndex: index,
            base,
            tempering,
            enchant,
            unique,
            forge,
            pointStyle,
            valueHighlight: value.gold && !base && !ancient,
            disabled: crossSeason && unique,
        })
    }
    if (item.kind === "unique" && item.uniqueAffix) {
        const roll = item.uniqueAffix
        const affix = getAffixById(roll.affixId)
        const ancient = roll.ancient === true
        const value = affix ? getAffixValuePresentation(affix, roll, slotId) : { valueText: "", gold: false }
        lines.push({
            roll,
            affix,
            source: "unique",
            summaryParts: affix ? getAffixSummaryParts(affix) : [],
            valueText: value.valueText,
            rollText: "",
            rangeText: "",
            ancient,
            finalMasterwork: false,
            affixIndex: -1,
            base: false,
            tempering: false,
            enchant: false,
            unique: true,
            forge: ancient,
            pointStyle: ancient ? 1 : 2,
            valueHighlight: value.gold && !ancient,
            disabled: crossSeason,
        })
    }
    return lines
}

/**
 * 词条行的太古条件：非基础词条太古（上游只排除 base，专属 / 未知来源同样计入）。
 * 太古与最终精锻 / 淬炼 / 附魔可同时成立，由渲染层叠图，不再互相覆盖。
 * @param line 词缀行
 * @returns 命中太古条件为 true
 */
export function isAncientGearLine(line: Pick<GearAffixLine, "source" | "ancient"> & { base?: boolean }): boolean {
    return line.ancient === true && !isBaseGearLine(line)
}

/**
 * 装备图标的太古红星条件：任意非基础词条太古，专属 / 未知来源同样计入（上游 `DNASeasonEquipItem`）。
 * @param line 词缀行
 * @returns 图标显示红星为 true
 */
export function isAncientGearIconLine(line: Pick<GearAffixLine, "source" | "ancient"> & { base?: boolean }): boolean {
    return isAncientGearLine(line)
}

/**
 * 装备图标的太古红星条件：任一非基础词条太古（快捷判断，已有词缀行时直接 `some(isAncientGearIconLine)`）。
 * @param item 装备物品
 * @returns 图标显示红星为 true
 */
export function hasAncientGearAffix(item: TranscendGearItemConfig): boolean {
    return getItemAffixLines(item).some(isAncientGearIconLine)
}

/**
 * 词条行的太古总数：逐行按 `isAncientGearLine` 计数（上游 `AncientRows` 口径：基础排除，专属 / 未知来源计入）。
 * 太古可逐词缀出现，同一件装备多行太古时返回多颗。
 * @param lines 词缀行
 * @returns 太古行数
 */
export function getAncientGearLineCount(lines: ReadonlyArray<Pick<GearAffixLine, "source" | "ancient"> & { base?: boolean }>): number {
    return lines.reduce((count, line) => (isAncientGearLine(line) ? count + 1 : count), 0)
}

/**
 * 装备级太古总数：与上游 Tips 顶部 `List_Primordial` 同口径（`getItemAffixLines` 逐行判定，含太古专属行）。
 * 仅用于展示计数，不写入物品 / hash / 短码。
 * @param item 装备物品
 * @returns 太古词缀数
 */
export function getItemAncientAffixCount(item: TranscendGearItemConfig): number {
    return getAncientGearLineCount(getItemAffixLines(item))
}

/**
 * 专属词缀行：`affixId === UniqueAffixId`，无打造标记时行首渲染专属橙星（`PointStyle=2`）。
 * @param line 词缀行
 * @returns 是专属行为 true
 */
export function isUniqueGearLine(line: Pick<GearAffixLine, "source"> & { unique?: boolean }): boolean {
    return line.unique ?? line.source === "unique"
}

/**
 * 词条行的最终精锻条件：命中满级最终精锻目标且不是基础词条（专属 / 未知来源同样计入）。
 * 与太古 / 淬炼 / 附魔同时命中时各自保留，由渲染层叠图。
 * @param line 词缀行
 * @returns 命中最终精锻条件为 true
 */
export function isFinalMasterworkGearLine(line: Pick<GearAffixLine, "source" | "finalMasterwork"> & { base?: boolean }): boolean {
    return line.finalMasterwork === true && !isBaseGearLine(line)
}

/**
 * 基础词缀行：官方 tips 里没有标记槽，文本从最左开始。
 * @param line 词缀行
 * @returns 是基础行为 true
 */
export function isBaseGearLine(line: Pick<GearAffixLine, "source"> & { base?: boolean }): boolean {
    return line.base ?? line.source === "base"
}

/** 标记判定输入：显式字段优先，旧行 / 编辑器行按来源回退 */
type GearLineMarkInput = Pick<GearAffixLine, "source" | "ancient" | "finalMasterwork"> &
    Partial<Pick<GearAffixLine, "base" | "tempering" | "enchant" | "unique" | "disabled">>

/**
 * 词条行标记：严格按上游 `BuildAffixRow` 计算 PointStyle。
 * `base` → none；任意 Forge 标记 → 1；专属 → 2；否则 0。Forge 四类互不排斥，可同时为 true。
 * @param line 词缀行
 * @returns 标记状态
 */
export function getGearLineMarkState(line: GearLineMarkInput): GearLineMarkState {
    const base = line.base ?? line.source === "base"
    const ancient = !base && line.ancient === true
    const finalMasterwork = !base && line.finalMasterwork === true
    const tempering = !base && (line.tempering ?? line.source === "tempering")
    const enchant = !base && (line.enchant ?? line.source === "enchant")
    const unique = line.unique ?? line.source === "unique"
    const forge = ancient || finalMasterwork || tempering || enchant
    const pointStyle: GearLinePointStyle = base ? "none" : forge ? 1 : unique ? 2 : 0
    return {
        base,
        ancient,
        finalMasterwork,
        tempering,
        enchant,
        unique,
        forge,
        pointStyle,
        source: line.source,
        unknown: line.source === "unknown",
        disabled: line.disabled === true,
    }
}

/** 灰点 / 淬炼 / 附魔颜色（上游 `#99FFFFFF` + 0.6 不透明度、`#EB774E`、`#A34EEB`） */
export const GEAR_LINE_MARK_COLORS = {
    random: "#99FFFFFF",
    tempering: "#EB774E",
    enchant: "#A34EEB",
} as const

/**
 * 数值是否用 `<Gold>`：上游 `Value ~= Base`；基础 / 太古强制白色。
 * 优先用行内已算好的 `valueHighlight`，编辑器行按 affix / roll 现算。
 * @param line 词缀行
 * @param slotId 装备位（解析器需要，纯展示不影响数值）
 * @returns 金色为 true
 */
export function isGoldGearLineValue(
    line: Pick<GearAffixLine, "affix" | "roll" | "source" | "ancient" | "valueHighlight"> & { base?: boolean },
    slotId = 0
): boolean {
    if (line.valueHighlight !== undefined) return line.valueHighlight
    if (!line.affix || isBaseGearLine(line) || isAncientGearLine(line)) return false
    return getAffixValuePresentation(line.affix, line.roll, slotId).gold
}

/**
 * 孔位标记（上游 `PointStyle` 3/4）：无宝石 → 空孔 3；有宝石 → 已镶嵌 4。
 * @param gemId 宝石 id；空孔为 undefined / 0
 * @returns 孔位标记种类
 */
export function getGearSocketMarkKind(gemId: number | undefined): "emptyGroove" | "occupiedGroove" {
    return gemId && gemId > 0 ? "occupiedGroove" : "emptyGroove"
}

/**
 * 孔位 PointStyle：空孔 3 / 已镶嵌 4（上游 `Groove_Empty` / 动态镶嵌图标）。
 * @param gemId 宝石 id；空孔为 undefined / 0
 * @returns 3 或 4
 */
export function getGearSocketPointStyle(gemId: number | undefined): 3 | 4 {
    return gemId && gemId > 0 ? 4 : 3
}

/**
 * 词缀行标题（保留富文本标签，调用方用 `TranscendRichText` 渲染）。
 * 专属 desc-only 显示「效果:」+ 原文；其余按摘要分段，最后回退描述原文；未知词条用未知文案。
 * @param affix 词缀；数据缺失时 undefined
 * @param summaryParts 词缀摘要分段（待翻译原文）
 * @param translate 游戏原文翻译函数
 * @param labels 效果前缀与未知词条文案
 * @returns 标题（可能含白名单标签）
 */
export function getGearAffixTitle(
    affix: DnaSeasonAffix | undefined,
    summaryParts: readonly string[],
    translate: (text: string | undefined | null) => string,
    labels: { effect: string; unknown: string }
): string {
    if (!affix) return labels.unknown
    if (isEffectOnlyAffix(affix)) return `${labels.effect}${translate(affix.desc)}`
    const parts = summaryParts.map(part => translate(part)).filter(Boolean)
    if (parts.length) return parts.join(" · ")
    return translate(affix.desc)
}

/**
 * 装备图标的最终精锻太阳条件：当前生效目标存在（精锻满级 + 目标可最终精锻）。
 * craft 状态优先，旧数据按 per-affix 字段回退。
 * @param item 装备物品
 * @returns 图标显示太阳为 true
 */
export function hasFinalMasterworkGearAffix(item: TranscendGearItemConfig): boolean {
    return getActiveFinalMasterworkIndex(item) !== undefined
}

/** 装备级 craft 摘要 */
export interface GearCraftSummary {
    masterworkLevel: number
    masterworkMax: number
    finalMasterwork: boolean
    tempering: boolean
    enchant: boolean
    temperingCount: number
    enchantCount: number
}

/**
 * 装备级 craft 摘要：精锻等级 / 上限、最终目标是否生效、淬炼 / 附魔是否存在与次数。
 * 精锻是装备级唯一值，界面不得按词条分别展示。
 * @param item 装备物品
 * @returns craft 摘要
 */
export function getGearCraftSummary(item: TranscendGearItemConfig): GearCraftSummary {
    const state = getGearCraftState(item)
    return {
        masterworkLevel: state.masterworkLevel,
        masterworkMax: getMasterworkMax(),
        finalMasterwork: getActiveFinalMasterworkIndex(item) !== undefined,
        tempering: state.temperingAffixIndex !== undefined,
        enchant: state.enchantAffixIndex !== undefined,
        temperingCount: state.temperingCount,
        enchantCount: state.enchantCount,
    }
}

/** craft 成本的一行（资源名 / 图标由数据表补齐） */
export interface GearCraftCostLine {
    id: number
    count: number
    /** 是否为货币行 */
    price: boolean
    /** 资源原文名（调用方过 `gt`）；缺失时为空串 */
    name: string
    icon: string
}

/**
 * craft 成本明细：材料与货币按附魔次数成长后逐行取整，craft 6 为空。
 * @param craftId craft id
 * @param state 物品 craft 状态或附魔次数（决定成长倍率）
 * @returns 成长倍率与资源行
 */
export function getGearCraftCostLines(
    craftId: number,
    state?: Pick<TranscendGearCraftState, "enchantCount"> | number
): { multiplier: number; rows: GearCraftCostLine[] } {
    const cost = getCraftCosts(craftId, state)
    const rows = cost.rows.map(row => {
        const resource = resourceMap.get(row.id)
        return {
            id: row.id,
            count: row.count,
            price: row.price,
            name: resource?.name ?? "",
            icon: resource ? `/imgs/res/${resource.icon}.webp` : "",
        }
    })
    return { multiplier: cost.multiplier, rows }
}

/**
 * 解析物品孔位在当前槽型下实际生效的宝石词缀（同一宝石不同装备效果不同）。
 * @param item 装备物品
 * @returns 宝石行
 */
export function getItemSocketLines(item: TranscendGearItemConfig): GearSocketLine[] {
    const lines: GearSocketLine[] = []
    for (const socket of Array.isArray(item.sockets) ? item.sockets : []) {
        const affixId = resolveInlayAffixId(socket.gemId, item.slotType)
        const affix = affixId === null ? undefined : getAffixById(affixId)
        const resource = resourceMap.get(socket.gemId)
        const name = resource?.name || socket.nameSnapshot || ""
        const roll: TranscendGearAffixRoll = {
            affixId: affixId ?? 0,
            rollLevel: 1,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
        }
        lines.push({
            socketIndex: socket.socketIndex,
            gemId: socket.gemId,
            name,
            unknownGem: !name,
            iconSrc: resource ? `/imgs/res/${resource.icon}.webp` : socket.iconSnapshot || "",
            affixId,
            affix,
            summaryParts: affix ? getAffixSummaryParts(affix) : [],
            valueText: affix ? getAffixFinalValueText(affix, roll) : "",
        })
    }
    return lines.sort((left, right) => left.socketIndex - right.socketIndex)
}

/**
 * 物品搜索文本：名称 / 快照名 / 词缀摘要 / 属性名 / 宝石名 / id。
 * 同时收录原文与逐段翻译后的文本，非中文界面可按可见词缀文案搜索。
 * @param item 装备物品
 * @param translate 游戏原文翻译函数（缺省原文）
 * @returns 搜索文本
 */
export function getItemSearchTokens(
    item: TranscendGearItemConfig,
    translate: (text: string | undefined | null) => string = text => text ?? ""
): string[] {
    const tokens: string[] = []
    const add = (value: unknown) => {
        const text = String(value ?? "").trim()
        if (text) tokens.push(text)
    }
    add(item.nameSnapshot)
    add(item.uniqueId)
    add(item.iconId)
    add(item.nameId)
    const unique = getUniqueEquipById(item.uniqueId)
    const base = getBaseNameById(item.iconId)
    if (unique) {
        add(unique.name)
        add(translate(unique.name))
    }
    if (base) {
        add(base.name)
        add(translate(base.name))
    }
    for (const line of getItemAffixLines(item)) {
        if (line.affix) {
            add(getAffixSummary(line.affix))
            add(line.affix.desc)
            add(translate(getAffixSummary(line.affix)))
            add(translate(line.affix.desc))
            for (const part of line.summaryParts) add(translate(part))
            for (const attr of getAffixAttrs(line.affix)) {
                add(attr.attr)
                add(translate(attr.attr))
            }
        }
        add(line.roll.affixId)
    }
    for (const socket of getItemSocketLines(item)) {
        add(socket.name)
        add(translate(socket.name))
        if (socket.affix) {
            add(getAffixSummary(socket.affix))
            add(translate(getAffixSummary(socket.affix)))
        }
    }
    return tokens
}

/**
 * 物品词缀条数摘要：基础 / 随机 / 专属分别计数。
 * @param item 装备物品
 * @returns 计数
 */
export function getItemAffixCounts(item: TranscendGearItemConfig): { base: number; random: number; unique: number } {
    const baseAffixId = getSlotBaseAffixId(item.slotType)
    const uniqueAffixId = item.uniqueAffix?.affixId
    let base = 0
    let random = 0
    for (const roll of item.affixes) {
        if (roll.source === "base" || (roll.source === undefined && baseAffixId === roll.affixId)) base += 1
        else if (roll.affixId !== uniqueAffixId) random += 1
    }
    return { base, random, unique: item.kind === "unique" && item.uniqueAffix ? 1 : 0 }
}

/**
 * 装备物品图标（库存 / 槽位通用）。
 * @param item 装备物品
 * @returns 图片地址；缺失时为空串
 */
export function getItemIconSrc(item: TranscendGearItemConfig): string {
    return getGearIconSrc(item)
}

/**
 * 由已装备组展平出某槽位的条目（安全模式 / 旧存档只读展示）。
 * @param group 装备组
 * @param slotId 装备位
 * @returns 展平条目
 */
export function getFlattenedSlotEntries(group: readonly unknown[], slotId: number) {
    return flattenEquippedGear(group).entries.filter(entry => entry.slotId === Math.round(slotId))
}
