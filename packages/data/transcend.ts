import { ALL_ELEMENT_WEAKNESS_KEY, ELEMENT_WEAKNESS_KEYS } from "./CharBuild"
import type { CharSkillLevels } from "./charSettings"
import { affixes, charMap, inlays, slots, talents, uniqueEquips } from "./d"
import charData from "./d/char.data"
import type { DnaSeasonAffix } from "./d/dnaseasonequip.data"
import type { DnaSeasonTalent } from "./d/dnaseasonprogress.data"
import type { Buff } from "./data-types"
import {
    ADDITIONAL_DAMAGE_ELEMENT_KEYS,
    SELF_ADDITIONAL_DAMAGE_KEY,
    warnLegacyAdditionalDamage,
    warnUnknownChaseSuffix,
} from "./leveled/additionalDamage"
import { LeveledBuff } from "./leveled/LeveledBuff"
import { resolveEffectiveSkillLevels, SKILL_LEVEL_ATTR_KEYS } from "./skillLevels"
import { TRANSCEND_BUFF_MAP, type TranscendAffixMapping, type TranscendTeammateMeta, UNIQUE_AFFIX_MAP } from "./transcendBuffs"
import {
    flattenEquippedGear,
    getTranscendAffixDedupeClass,
    getTranscendGearGroupKey,
    getTranscendGearGroupKeyOfSlot,
    getTranscendSideGearGroup,
    getTranscendSlotType,
    type TranscendGearAffixSource,
    type TranscendGearEntry,
    type TranscendSlotGroup,
} from "./transcendGear"
import type { TranscendSettings } from "./transcendSettings"
import { mergeTranscendSkillReplacement, TRANSCEND_SKILL_REPLACEMENTS, type TranscendSkillReplacement } from "./transcendSkills"

export { getTranscendSlotType } from "./transcendGear"

/**
 * 升华（DNASeason）数值适配：天赋 / 装备词条 → 构筑属性与 BUFF。
 *
 * 坐标口径：
 * - 装备位 `slotId` 1-8 主控、9-12 协战一、13-16 协战二（一人一套，互不共用）；
 * - 槽型 `slotType` 1-11（数据 `slots`），由装备位映射得到，词缀兼容性只按槽型判断。
 *
 * 数值公式（上游 `DNASeasonAffixValueUtils.CalcValue` / R7）：
 * `StepValue → 太古(max*Multi+Add) → 精造 ×N(refined*Multi+Add) → 最终精造(refined*Multi+Add)`。
 */

/**
 * 升华映射状态（二元）：exact 精确映射引擎属性，handwritten 本地手写建模。
 * 没有“不建模”档：每条属于此层的效果都必须在 exact 与 handwritten 之间二选一。
 */
export type TranscendMappingStatus = "exact" | "handwritten"

/** 安全查表：`constructor` / `toString` 等原型链键一律视为未登记 */
function lookup<T>(table: Record<string, T>, key: string | undefined): T | undefined {
    return key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined
}

/** 元素英文键 → 游戏内元素名 */
const ELEMENT_NAMES: Record<string, string> = {
    Fire: "火",
    Water: "水",
    Thunder: "雷",
    Wind: "风",
    Light: "光",
    Dark: "暗",
}

/** 武器细分类型（旧数据 raw 后缀 / 新数据 type 枚举）→ 武器作用域前缀 */
const WEAPON_SCOPE_PREFIX: Record<string, string> = {
    CMelee: "普通近战",
    CRanged: "普通远程",
    UMelee: "同律近战",
    URanged: "同律远程",
}

/** 武器前缀类词条（旧 raw attr → 属性后缀，仅旧快照会命中） */
const WEAPON_ATTR_SUFFIX: Record<string, string> = {
    WeaponATKModifierRate: "攻击",
    WeaponCRIModifierRate: "暴击",
    WeaponCRDModifierRate: "暴伤",
    TriggerProbModifierRate: "触发",
}

/** 通用属性词条（旧 raw 引擎名 → 规范名，仅旧快照会命中） */
const BASE_ATTR_KEYS: Record<string, string> = {
    ATK: "攻击",
    MaxHp: "生命",
    MaxES: "护盾",
    DEF: "防御",
    MaxSp: "神智",
    SkillIntensity: "技能威力",
    SkillEfficiency: "技能效益",
    SkillSustain: "技能耐久",
    SkillRange: "技能范围",
    StrongValue: "昂扬",
    EnmityValue: "背水",
    HyperTriggerRate: "充盈威力",
}

/**
 * 元素专属伤害率规范名（U14b）：上游按元素分量输出独立键，元素仅对匹配元素的角色生效。
 * `element` 字段保留作出处，但 key 本身已区分元素。
 */
const ELEMENT_DAMAGE_ATTRS: Record<string, string> = {
    火属性增伤: "火",
    水属性增伤: "水",
    雷属性增伤: "雷",
    风属性增伤: "风",
    光属性增伤: "光",
    暗属性增伤: "暗",
}

/**
 * 元素弱点规范名（U95）：与敌人抗性同区加算，正值为弱点。
 * 键名与 `CharBuild.ELEMENT_WEAKNESS_KEYS` 同源，避免双份字面量漂移。
 * `WeaknessType` 只作 UI 元数据，元素信息由属性名承载（`<Element>DamagedRate`）。
 */
const ELEMENT_WEAKNESS_ATTRS: Record<string, string> = Object.fromEntries(ELEMENT_WEAKNESS_KEYS.map(key => [key, key.slice(0, 1)]))

/**
 * 元素追伤规范名（U70）：键本身已区分元素；追伤是 otherMore 全局因子，不按角色元素过滤（§131/§132）。
 * 旧数据 `追加伤害` + element / `BonusDamage_<Element>` 迁回同一分量键。
 */
const ELEMENT_CHASE_ATTRS = new Set<string>(ADDITIONAL_DAMAGE_ELEMENT_KEYS)

/** 伤害率键（旧 raw 键含配置后缀）→ 规范名；规范名本身也可直接作为 attr */
const DAMAGE_RATE_KEYS: Record<string, string> = {
    DamageRate_Melee_Normal: "近战增伤",
    DamageRate_Ranged_Normal: "远程增伤",
    DamageRate_Skill_Normal: "技能伤害",
    DamageRate_Summon_Normal: "召唤物伤害",
    DamageRate_Almighty: "属性穿透",
    DamageRate_NoTag_S0DamageRate: "赛季增伤",
    DamageRate: "增伤",
}

/**
 * 伤害率分区（`rateZone`）→ 独立乘区属性键。
 * S0 是赛季专属乘区（词条 1030「造成伤害（步入梦乡）」），不与普通增伤合并；
 * Almighty 是属性穿透的正式分区名。未登记的 rateZone 告警后按常规映射降级。
 */
const RATE_ZONE_ATTR_KEYS: Record<string, string> = {
    S0DamageRate: "赛季增伤",
    Almighty: "属性穿透",
}

/**
 * 可被 `rateZone` 覆盖的纯伤害率属性。
 * 元素限定（元素增伤 / `<元素>DamageRate`）、减伤与取反语义不在其列：
 * 分区声明不得改写这些属性的过滤与取反口径。
 */
const RATE_ZONE_OVERRIDABLE_ATTRS = new Set(["增伤", "属性穿透", "赛季增伤", "DamageRate"])

/** 已告警的 rateZone 事件（未知分区 / 分区冲突）：映射逐条调用，同一事件只告警一次 */
const warnedRateZones = new Set<string>()

/**
 * 清空 rateZone 告警去重缓存。
 * 模块级集合会跨用例残留，watch 模式下会导致后续用例收不到告警。
 */
export function resetRateZoneWarnings(): void {
    warnedRateZones.clear()
}

/** 同一 rateZone 事件只告警一次 */
function warnRateZoneOnce(key: string, message: string): void {
    if (warnedRateZones.has(key)) return
    warnedRateZones.add(key)
    console.warn(message)
}

/**
 * 只作展示的回复 / 移速属性（旧 raw 引擎名）：可原样计入，但不参与伤害计算。
 */
const DISPLAY_ONLY_ATTRS: Record<string, string> = {
    HpRecoverValue: "生命回复",
    HpRecoverValueModifierRate: "生命恢复增幅",
    WalkSpeedModifier: "移动速度",
}

/** 只作展示的规范名（U14 起上游直接输出规范名） */
const DISPLAY_ONLY_KEYS = new Set(Object.values(DISPLAY_ONLY_ATTRS))

/**
 * 上游 U14 起 `attr` 直接输出规范名，这些值可原样作为 CharBuild 属性键。
 * 元素限定（元素增伤 / `<元素>属性攻击` / `<元素>属性弱点`）与减伤另行处理。
 */
const CANONICAL_ATTR_KEYS = new Set<string>([
    ...Object.values(BASE_ATTR_KEYS),
    ...Object.values(DAMAGE_RATE_KEYS),
    ...Object.keys(ELEMENT_DAMAGE_ATTRS),
    ...Object.keys(ELEMENT_WEAKNESS_ATTRS),
    ALL_ELEMENT_WEAKNESS_KEY,
    ...ADDITIONAL_DAMAGE_ELEMENT_KEYS,
    SELF_ADDITIONAL_DAMAGE_KEY,
    ...Object.values(RATE_ZONE_ATTR_KEYS),
    "神智回复",
])

for (const prefix of Object.values(WEAPON_SCOPE_PREFIX)) {
    for (const suffix of Object.values(WEAPON_ATTR_SUFFIX)) {
        CANONICAL_ATTR_KEYS.add(`${prefix}${suffix}`)
    }
}

/** 规范名里的元素：`火属性攻击` → 火 */
function canonicalElementAttack(attr: string): string | undefined {
    const suffix = "属性攻击"
    if (!attr.endsWith(suffix)) return undefined
    const element = attr.slice(0, -suffix.length)
    return Object.values(ELEMENT_NAMES).includes(element) ? element : undefined
}

/** 上游元素枚举 / 中文元素名 → 中文元素名 */
function normalizeElement(value?: string): string | undefined {
    if (!value) return undefined
    return lookup(ELEMENT_NAMES, value) ?? (Object.values(ELEMENT_NAMES).includes(value) ? value : undefined)
}

/**
 * 从上游元数据恢复元素限定：旧数据把 `<Element>DamageRate` 收敛为 `元素增伤`、
 * 追伤收敛为 `追加伤害`，元素只剩在元数据里（U70 起按元数据迁回 `<元素>属性追伤`）。
 * 优先级：`element`（U14b 机读字段）→ `elementType` → `type`。
 */
function elementFromMeta(meta?: TranscendAttrMeta): string | undefined {
    return normalizeElement(meta?.element) ?? normalizeElement(meta?.elementType) ?? normalizeElement(meta?.type)
}

/** 技能类型 → `charSkillLevel` 下标（E / Q / 被动） */
const SKILL_TYPE_INDEX: Record<string, number> = { Skill1: 0, Skill2: 1, Passive: 2 }

/** 技能等级槽位下标 → 上游技能类型（`SKILL_TYPE_INDEX` 的逆映射，展示层复用同一口径） */
export const SKILL_LEVEL_SLOT_TYPES = ["Skill1", "Skill2", "Passive"] as const

/** 角色技能树的最小结构（`Skill` / `SubSkill` 同形） */
interface SkillNode {
    id?: number
    类型?: string
    子技能?: SkillNode[]
}

/** 技能 id → `charSkillLevel` 下标；延迟建立，按角色 `技能` 数组顺序（0=E / 1=Q / 2+=被动）与子技能归属。 */
let skillLevelIndexCache: Map<number, number> | null = null

/**
 * 取技能 id 对应的技能等级槽位（1.8.7.1 起 Plan 4 专属词条按 `AddSkillLevel.SkillID` 升级）。
 * 子技能沿用父技能槽位；协战技能不消耗技能等级。未收录的技能返回 undefined。
 * @param skillId 上游技能 id
 * @returns 0=E / 1=Q / 2=被动；未收录时 undefined
 */
export function getSkillLevelIndex(skillId: number): number | undefined {
    if (!skillLevelIndexCache) {
        const map = new Map<number, number>()
        const add = (skills: readonly SkillNode[] | undefined, parentIndex: number | undefined) => {
            for (const [index, skill] of (skills ?? []).entries()) {
                const slot = parentIndex ?? index
                if (skill.id !== undefined && skill.类型 !== "协战") map.set(skill.id, Math.min(slot, 2))
                if (skill.子技能?.length) add(skill.子技能, slot)
            }
        }
        for (const char of charData) add(char.技能, undefined)
        skillLevelIndexCache = map
    }
    return skillLevelIndexCache.get(skillId)
}

/** 升华 BUFF 的来源挂载类型（与 `LeveledBuff.pt` 对齐） */
export const TRANSCEND_BUFF_SOURCE = "Transcend"

/** 单条属性的映射结果 */
export interface TranscendAttrMapping {
    /** CharBuild 属性键；不可映射时为空串 */
    key: string
    status: TranscendMappingStatus
    note?: string
    /** 手写口径是否只覆盖了效果的一部分 */
    partial?: boolean
    /** 元素限定：仅同元素角色计入 */
    element?: string
    /** 数值取反（受到伤害降低 → 减伤） */
    negate?: boolean
}

/** 上游属性元数据：U14 后元素限定只保留在这里 */
export interface TranscendAttrMeta {
    /** 上游枚举（如 `Water` / `CMelee`） */
    type?: string
    elementType?: string
    /** U14b：折叠属性的机读元素（`Fire`/`Water`/`Thunder`/`Wind`/`Light`/`Dark`） */
    element?: string
    /** 伤害率分区（如 `S0DamageRate`） */
    rateZone?: string
}

/** 手写建模说明（只收 handwritten 条目）：供 UI 标注「手写 / 部分覆盖 / 未覆盖项」 */
export interface TranscendModelingNote {
    /** 天赋节点 id 或装备词条 id */
    id: number
    kind: "talent" | "gear"
    status: TranscendMappingStatus
    /** 是否实际参与计算 */
    counted: boolean
    /** 只覆盖部分效果时为 true */
    partial?: boolean
    /** 机械可读的已计入 token（UI 自行本地化） */
    included?: string[]
    /** 机械可读的未计入 token（UI 自行本地化） */
    excluded?: string[]
    note?: string
}

/**
 * 带来源标识的 BUFF 条目。
 * `key` 是稳定来源 key（节点 id + 效果下标 / 装备位 + 孔位 + 词条 id），
 * 去重与收益归因只认它和 `buff.id`，不解析展示名。
 */
export interface SourcedBuff {
    key: string
    id: number
    buff: Buff
    /** 覆盖率（0-1），缺省 1 */
    coverage?: number
    /** 同词条多效果时的效果下标（`single` 分组等结构化消费，不解析 key 字符串） */
    effectIndex?: number
    /** 队友限定增益口径（来源词条的 `team` 元数据，跨侧注入时消费） */
    team?: TranscendTeammateMeta
}

/** 天赋 BUFF 的稳定 key：节点 id + 效果下标 */
function talentBuffKey(talentId: number, effectIndex: number): string {
    return `talent:${talentId}:${effectIndex}`
}

/**
 * 装备 BUFF 的稳定 key：装备位 + 孔位 + 词条 id + 来源类（缺孔位记 `-`）。
 * 来源类与 U135 去重口径一致（tempering 单独一类，其余 / 缺失 / 非法值同一类），
 * 直接取归一化类而非信任原始 `source`；身份只表达「哪一行」，不表达档位 / 太古等行内容。
 */
function gearBuffKey(slotId: number, affixId: number, socketIndex?: number, source?: TranscendGearAffixSource): string {
    return `gear:${slotId}:${socketIndex ?? "-"}:${affixId}:${getTranscendAffixDedupeClass(source)}`
}

/** `single` 去重分组：词条 id + 结构化效果下标（同一词条多 BUFF 时各 BUFF 独立取最早来源） */
function singleBuffGroup(sourced: SourcedBuff): string {
    return `${sourced.id}:${sourced.effectIndex ?? sourced.buff.source?.effectIndex ?? 0}`
}

/** 天赋解析结果 */
export interface TalentResolveResult {
    /** 每个生效效果一个 BUFF（名称 `升华天赋·<规范属性名>`，attr 只含该效果） */
    buffs: SourcedBuff[]
    /** 合并后的属性表（用于展示 / 测试） */
    attrs: Record<string, number>
    modelingNotes: TranscendModelingNote[]
    warnings: string[]
}

/** 单条装备词条的解析结果 */
export interface ResolvedGearEntry {
    slotId: number
    slotType: number
    affixId: number
    plan: number
    /** 词条来源类（展平条目携带；决定同 id 双行的行身份） */
    source?: TranscendGearAffixSource
    /** 数值词条的最终数值（Plan 1/2/4 固定属性、Plan 3 技能等级） */
    value?: number
    /** 数值词条映射出的属性 */
    attrs: Record<string, number>
    /** 引用的手写 BUFF 名称（Plan 4 被动） */
    buffs: string[]
    /** Plan 3 技能等级增量 */
    skillLevel?: number
    status: TranscendMappingStatus
    /** 手写口径是否只覆盖一部分效果 */
    partial?: boolean
    /** 已覆盖的机械可读 token */
    included?: string[]
    /** 未覆盖的机械可读 token */
    excluded?: string[]
    note?: string
    /** 队友限定增益口径（来源词条） */
    team?: TranscendTeammateMeta
}

/** 装备解析结果 */
export interface GearResolveResult {
    entries: ResolvedGearEntry[]
    /** 手写 BUFF（Plan 4）与数值 / 技能等级词条合成的 BUFF */
    buffs: SourcedBuff[]
    /** 合并后的属性表（数值词条与技能等级三键） */
    attrs: Record<string, number>
    /** 技能替换（原技能 id → 载荷）：导出身份/名称 + 手写字段兜底，同 source 冲突按 slotId 高者胜，同槽保持收集顺序 */
    skillReplacements: Record<number, TranscendSkillReplacement>
    modelingNotes: TranscendModelingNote[]
    warnings: string[]
}

/** 解析时可注入的数据表（测试 / 安全模式用；缺省读内置生成数据） */
export interface TranscendDataTables {
    affixes?: readonly DnaSeasonAffix[]
    talents?: readonly DnaSeasonTalent[]
}

/** 队友限定增益的构筑位上下文（来源侧过滤 / 受益侧元素过滤） */
export interface TranscendTeamSideContext {
    side: TranscendSlotGroup
    charId?: number
    charElement?: string
    active: boolean
}

/** 团队上下文来源：兼容 `CharSettings`（team1/team2 + assistN.enabled）与升华构筑设置（main/assistN.charId） */
export interface TranscendTeamSidesSource {
    /** 主控侧（升华构筑设置有该字段；`CharSettings` 用下方 `charId` 传入） */
    main?: { charId?: number; enabled?: boolean } | null
    /** 主控角色 id 的直接入口 */
    charId?: number
    team1?: string | number
    team2?: string | number
    assist1?: { charId?: number; enabled?: boolean } | null
    assist2?: { charId?: number; enabled?: boolean } | null
}

/** 构筑位稳定顺序：跨侧注入与 `single` 去重都按它取最早来源 */
export const TRANSCEND_TEAM_SIDE_ORDER: readonly TranscendSlotGroup[] = ["main", "assist1", "assist2"]

/** 稳定顺序下标（未知构筑位排最后，不抛错） */
function teamSideOrder(side: TranscendSlotGroup): number {
    const index = TRANSCEND_TEAM_SIDE_ORDER.indexOf(side)
    return index === -1 ? TRANSCEND_TEAM_SIDE_ORDER.length : index
}

/** 角色 id 归一化：数字或数字字符串（与构筑工厂 `toId` 同口径），其余 / 非正数视为未配置 */
function normalizeTeamCharId(value: unknown): number | undefined {
    const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN
    if (!Number.isFinite(numeric)) return undefined
    const id = Math.round(numeric)
    return id > 0 ? id : undefined
}

/** 角色元素：与 `LeveledCharHelper.fromId` 同口径（6 位 id 右移两位） */
function charElementOfCharId(charId: number | undefined): string | undefined {
    if (charId === undefined) return undefined
    return charMap.get(charId > 9999 ? Math.trunc(charId / 100) : charId)?.属性
}

/**
 * 构造三侧团队上下文：角色无效或协战未启用时该侧不参与来源与受益。
 * @param source 角色配置或升华构筑设置（可缺失 / 脏数据）
 * @param mainCharId 主控角色 id（`CharSettings` 不存主控 id）
 * @returns 三侧上下文（顺序恒为 main → assist1 → assist2）
 */
export function buildTranscendTeamSides(
    source: TranscendTeamSidesSource | null | undefined,
    mainCharId?: number
): TranscendTeamSideContext[] {
    const mainId = normalizeTeamCharId(mainCharId ?? source?.main?.charId ?? source?.charId)
    const assist1Id = normalizeTeamCharId(source?.team1 ?? source?.assist1?.charId)
    const assist2Id = normalizeTeamCharId(source?.team2 ?? source?.assist2?.charId)
    return [
        {
            side: "main",
            charId: mainId,
            charElement: charElementOfCharId(mainId),
            active: mainId !== undefined && source?.main?.enabled !== false,
        },
        {
            side: "assist1",
            charId: assist1Id,
            charElement: charElementOfCharId(assist1Id),
            active: assist1Id !== undefined && source?.assist1?.enabled !== false,
        },
        {
            side: "assist2",
            charId: assist2Id,
            charElement: charElementOfCharId(assist2Id),
            active: assist2Id !== undefined && source?.assist2?.enabled !== false,
        },
    ]
}

/**
 * 专属词条组件的解析抑制（收益快照专用）：只影响本次解析产出的三键 / 手写 BUFF，
 * 不写入物品、设置、存档或分享；正常构筑与 wasm 路径一律不传。
 */
export interface TranscendGearSuppress {
    /** 被抑制的 Plan 4 词条 id */
    affixId: number
    /** 只抑制该构筑位装备的副本；缺省 = 所有来源（旧测试 / 直接调用） */
    ownerSide?: TranscendSlotGroup
    /** 只抑制该装备位的副本（同一侧同词条多件时进一步收敛）；缺省 = 该侧全部槽位 */
    slotId?: number
    /** 抑制该词条的全部技能等级贡献（三键属性与合成 BUFF） */
    skillLevel?: boolean
    /** 抑制该词条手写 BUFF 中命中的属性键（建模明细行隔离） */
    attrs?: readonly string[]
}

/** 升华解析选项 */
export interface TranscendResolveOptions {
    /** 当前角色元素（"火"/"雷"/…）：元素专属属性与被动只在同角色元素上计入 */
    charElement?: string
    /** 当前角色 id：上游精确 charIds 非空时，只对该角色生效（禁止按描述文本匹配） */
    charId?: number
    /** 数据表覆盖：不传时使用生成数据 */
    tables?: TranscendDataTables
    /** 三侧团队上下文：缺省时不跨侧收集（保持独立构筑 / 直接调用的旧行为） */
    teamSides?: readonly TranscendTeamSideContext[]
    /** 装备解析抑制：只由 TS 收益快照专用路径传入（不写存档 / 分享） */
    suppress?: TranscendGearSuppress
}

/** 注入构筑的升华效果 */
export interface TranscendEffects {
    buffs: LeveledBuff[]
    /** 技能替换（原技能 id → 载荷）：按该构筑位收集，不跨位 */
    skillReplacements: Record<number, TranscendSkillReplacement>
    modelingNotes: TranscendModelingNote[]
    warnings: string[]
}

/** 词条 id → 槽型列表的缓存（数据包换入会替换数据数组，因此按数组引用校验后重建） */
let affixSlotTypeCache: { source: unknown; map: Map<number, number[]>; explicit: Map<number, number[]> } | null = null

/**
 * 读取词条可出现的槽型：显式 `slotTypes`（导入期本地建模，技能等级词条按已知部位映射）优先；
 * 其余按 Plan 1 槽位基础词条、Plan 2/3 淬炼池、Plan 4 唯一装与镶嵌引用推导。
 * @param affixId 词条 id
 * @returns 升序槽型列表；无推导依据时为空数组
 */
export function getAffixSlotTypes(affixId: number): number[] {
    if (!affixSlotTypeCache || affixSlotTypeCache.source !== affixes) {
        const explicit = new Map<number, number[]>()
        for (const affix of affixes) {
            if (!affix.slotTypes?.length) continue
            explicit.set(
                affix.id,
                [...new Set(affix.slotTypes.map(item => Math.round(item)))].sort((left, right) => left - right)
            )
        }
        const poolSlotTypes = new Map<number, number[]>()
        for (const slot of slots) {
            for (const pool of slot.temperAffixPoolIds ?? []) {
                const list = poolSlotTypes.get(pool) ?? []
                list.push(slot.id)
                poolSlotTypes.set(pool, list)
            }
        }
        const map = new Map<number, Set<number>>()
        const add = (id: number, slotType: number) => {
            const set = map.get(id) ?? new Set<number>()
            set.add(slotType)
            map.set(id, set)
        }
        for (const slot of slots) {
            if (slot.baseAffixId) add(slot.baseAffixId, slot.id)
        }
        for (const affix of affixes) {
            if (!affix.pool) continue
            for (const slotType of poolSlotTypes.get(affix.pool) ?? []) add(affix.id, slotType)
        }
        for (const equip of uniqueEquips) add(equip.affixId, equip.slot)
        for (const inlay of inlays) {
            for (const [key, slotTypes] of Object.entries(inlay.affixIdsBySlot)) {
                for (const slotType of slotTypes) add(Number(key), slotType)
            }
        }
        const sorted = new Map<number, number[]>()
        for (const [id, set] of map)
            sorted.set(
                id,
                [...set].sort((left, right) => left - right)
            )
        affixSlotTypeCache = { source: affixes, map: sorted, explicit }
    }
    const id = Math.round(affixId)
    const explicit = affixSlotTypeCache.explicit.get(id)
    if (explicit) return [...explicit]
    return affixSlotTypeCache.map.get(id) ?? []
}

/**
 * 判断词缀能否放进指定装备位：槽型有推导依据时必须匹配，无推导依据时放行（由 UI 决定）。
 * @param affixId 词条 id
 * @param slotId 装备位
 * @returns 是否兼容
 */
export function isAffixCompatibleWithSlot(affixId: number, slotId: number): boolean {
    const slotTypes = getAffixSlotTypes(affixId)
    if (!slotTypes.length) return true
    return slotTypes.includes(getTranscendSlotType(slotId))
}

/**
 * 减伤符号归一：仅负值取反（受到伤害 -x% → 减伤 +x%），正值保留原符号。
 * 正值不得静默翻转，由调用方补 warning / note。
 * @param value 上游原始数值
 * @param negate 映射是否要求取反
 * @returns 计入值
 */
export function resolveSignedValue(value: number, negate?: boolean): number {
    return negate && value < 0 ? -value : value
}

/**
 * 把上游属性映射到 CharBuild 属性键。
 * `rateZone` 先于属性名与只读属性判定：未登记的分区（含空串）降级为手写 + 部分覆盖并附说明，
 * 已知分区只覆盖纯伤害率属性，避免改写元素限定 / 减伤 / 取反语义。
 * @param attr 上游属性名（U14 起为规范名；仍兼容旧 raw 引擎名）
 * @param meta 属性元数据：元素限定与伤害率分区只能从这里恢复
 * @returns 映射结果；不可映射时 key 为空串、status 为 `handwritten`（需人工裁决）
 */
export function mapTranscendAttr(attr: string, meta?: TranscendAttrMeta): TranscendAttrMapping {
    const rateZone = meta?.rateZone
    let degradedZone: string | undefined
    if (rateZone !== undefined) {
        const zoneKey = lookup(RATE_ZONE_ATTR_KEYS, rateZone)
        if (zoneKey && RATE_ZONE_OVERRIDABLE_ATTRS.has(attr)) return { key: zoneKey, status: "exact" }
        if (zoneKey) {
            warnRateZoneOnce(`conflict:${rateZone}:${attr}`, `[transcend] 伤害率分区 ${rateZone} 不能覆盖 ${attr}，已忽略分区声明`)
        } else {
            // 空串同样是「声明了分区但未登记」：只读属性的早退不得绕过这里的可见降级
            degradedZone = rateZone
            warnRateZoneOnce(`unknown:${rateZone}`, `[transcend] 未登记的伤害率分区 ${rateZone}，按常规属性映射降级`)
        }
    }
    const mapping = mapTranscendAttrByName(attr, meta)
    if (degradedZone === undefined) return mapping
    // 未登记分区不得静默标精确：降级为手写 + 部分覆盖（UI 徽章 / modelingNotes 随状态透出）
    return {
        ...mapping,
        status: "handwritten",
        partial: true,
        note:
            mapping.note ??
            (mapping.key ? `伤害率分区 ${degradedZone} 未登记，按「${mapping.key}」常规映射降级` : `伤害率分区 ${degradedZone} 未登记`),
    }
}

/** 属性名映射本体（不含 rateZone 分区覆盖） */
function mapTranscendAttrByName(attr: string, meta?: TranscendAttrMeta): TranscendAttrMapping {
    const displayOnly = lookup(DISPLAY_ONLY_ATTRS, attr) ?? (DISPLAY_ONLY_KEYS.has(attr) ? attr : undefined)
    if (displayOnly) {
        return { key: displayOnly, status: "handwritten", note: `${displayOnly}只作展示，不参与伤害计算` }
    }
    if (attr === "减伤" || attr === "DamagedRate") {
        return { key: "减伤", status: "exact", negate: true }
    }
    if (attr === "元素增伤") {
        const element = elementFromMeta(meta)
        if (!element) return { key: "", status: "handwritten", note: "元素增伤的元素无法识别" }
        return { key: "元素增伤", status: "handwritten", partial: true, element, note: `${element}属性伤害率按元素增伤计入` }
    }
    if (attr === "追加伤害") {
        // 旧分享 / 旧包：元素只存在元数据里，按元素迁回分量键；无元素时按自属性追伤兜底并告警
        const element = elementFromMeta(meta)
        if (!element) {
            warnLegacyAdditionalDamage("升华旧数据「追加伤害」")
            return { key: SELF_ADDITIONAL_DAMAGE_KEY, status: "handwritten", note: "旧数据未标注元素，按自属性追伤计入" }
        }
        return {
            key: `${element}属性追伤`,
            status: "handwritten",
            partial: true,
            element,
            note: `${element}属性追伤按旧口径迁移计入`,
        }
    }
    const elementDamage = lookup(ELEMENT_DAMAGE_ATTRS, attr)
    if (elementDamage) return { key: attr, status: "exact", element: elementDamage }
    // 元素追伤与角色元素无关：不挂 `element`，任意角色都计入
    if (ELEMENT_CHASE_ATTRS.has(attr)) return { key: attr, status: "exact" }
    const attackElement = canonicalElementAttack(attr)
    if (attackElement) return { key: attr, status: "exact", element: attackElement }
    if (CANONICAL_ATTR_KEYS.has(attr)) return { key: attr, status: "exact" }

    const base = lookup(BASE_ATTR_KEYS, attr)
    if (base) return { key: base, status: "exact" }

    if (attr === "DamageRate" || Object.hasOwn(DAMAGE_RATE_KEYS, attr)) {
        return { key: lookup(DAMAGE_RATE_KEYS, attr)!, status: "exact" }
    }

    const weaponSuffix = lookup(WEAPON_ATTR_SUFFIX, attr)
    if (weaponSuffix) {
        // 旧快照的武器 raw 名必须自带作用域后缀（`<Raw>_CMelee`）；无后缀时无法恢复作用域
        const prefix = lookup(WEAPON_SCOPE_PREFIX, attr.split("_")[1])
        if (prefix) return { key: `${prefix}${weaponSuffix}`, status: "exact" }
        return { key: "", status: "handwritten", note: `${attr} 缺少武器作用域，无法映射` }
    }
    for (const [raw, suffix] of Object.entries(WEAPON_ATTR_SUFFIX)) {
        if (!attr.startsWith(`${raw}_`)) continue
        const prefix = lookup(WEAPON_SCOPE_PREFIX, attr.slice(raw.length + 1))
        if (prefix) return { key: `${prefix}${suffix}`, status: "exact" }
        return { key: "", status: "handwritten", note: `${attr} 缺少合法武器作用域，无法映射` }
    }

    if (attr.startsWith("ATK_")) {
        const element = lookup(ELEMENT_NAMES, attr.slice(4))
        if (element) return { key: `${element}属性攻击`, status: "exact", element }
    }
    // 元素弱点（U95）：`<Element>DamagedRate` → `<元素>属性弱点`；裸 `DamagedRate` 仍走上面的 `减伤`
    if (attr.endsWith("DamagedRate")) {
        const element = lookup(ELEMENT_NAMES, attr.slice(0, -"DamagedRate".length))
        if (element) return { key: `${element}属性弱点`, status: "exact", element }
    }
    // 旧数据：`<Element>DamageRate` 折叠为 元素增伤 + element；新数据已按独立元素键导出
    if (attr.endsWith("DamageRate")) {
        const element = lookup(ELEMENT_NAMES, attr.slice(0, -"DamageRate".length))
        if (element) return { key: "元素增伤", status: "handwritten", partial: true, element, note: `${element}属性伤害率按元素增伤计入` }
    }
    // 元素追伤：`BonusDamage_<Element>` → 分量键；裸 `BonusDamage` 没有元素信息 → 自属性追伤
    if (attr === "BonusDamage" || attr.startsWith("BonusDamage_")) {
        const suffix = attr.slice("BonusDamage_".length)
        const element = lookup(ELEMENT_NAMES, suffix)
        if (element) return { key: `${element}属性追伤`, status: "exact", element }
        if (attr === "BonusDamage") {
            warnLegacyAdditionalDamage("升华旧数据「BonusDamage」")
            return { key: SELF_ADDITIONAL_DAMAGE_KEY, status: "handwritten", note: "裸 BonusDamage 无元素信息，按自属性追伤计入" }
        }
        // 非元素后缀（如 BonusDamage_Normal / BonusDamage_Attack）：无元素信息 → 自属性追伤（U69-fix 口径）
        warnUnknownChaseSuffix(attr)
        return { key: SELF_ADDITIONAL_DAMAGE_KEY, status: "handwritten", note: `非元素后缀「${suffix}」按自属性追伤计入` }
    }
    if (attr === "SpRecoverValue") {
        return { key: "神智回复", status: "exact" }
    }
    return { key: "", status: "handwritten", note: `${attr} 未登记映射` }
}

/**
 * 词条档位插值（上游 StepValue）。
 * @param affix 词条
 * @param rollLevel 档位
 * @returns 插值后的基础数值
 */
export function computeAffixStepValue(affix: DnaSeasonAffix, rollLevel: number): number {
    const { minValue: min, maxValue: max, totalValueLevel: total } = affix
    if (min === max) return min
    const count = Math.max(1, Math.round(total || 1))
    const level = Math.max(1, Math.round(rollLevel || 1))
    if (count === 1) return min
    if (level > count) return max
    return min + ((max - min) * (level - 1)) / (count - 1)
}

/** 应用词条数值公式（Add / Multi） */
function applyUpdateFunc(value: number, func?: { Multi?: number; Add?: number }): number {
    if (!func) return value
    return value * (func.Multi ?? 1) + (func.Add ?? 0)
}

/** 词条数值的逐段结果（与 U3 计算器同口径，供展示与测试） */
export interface AffixValueResult {
    rollLevel: number
    masterworkLevel: number
    rolled: number
    afterAncient: number
    afterMasterwork: number
    final: number
}

/**
 * 计算词条最终数值：StepValue → 太古基数 → 精造 ×N → 最终精造（上游 `DNASeasonAffixValueUtils.CalcValue`）。
 * 太古基数 = MaxValue × AncientFunc（无公式时原样取 MaxValue，RollLevel 不参与），普通精锻循环同样作用于太古；
 * 最终精造在循环后 ×1。精锻等级先 floor 再钳 0-10（游戏内有效范围；上游 `CalcValue` 钳 0-1000）。
 * @param affix 词条
 * @param entry 装备词条配置
 * @returns 逐段数值
 */
export function resolveAffixValue(affix: DnaSeasonAffix, entry: TranscendGearEntry): AffixValueResult {
    const total = Math.max(1, Math.round(affix.totalValueLevel || 1))
    const rollLevel = Math.max(1, Math.min(total, Math.round(entry.rollLevel || 1)))
    const masterworkLevel = Math.max(0, Math.min(10, Math.floor(entry.masterworkLevel || 0)))
    const rolled = computeAffixStepValue(affix, rollLevel)
    // 上游 `ApplyFunc(nil, MaxValue)` 原样返回 MaxValue：太古缺 AncientFunc 时不得回退 rolled
    const afterAncient = entry.ancient ? applyUpdateFunc(affix.maxValue, affix.ancientFunc) : rolled
    let afterMasterwork = afterAncient
    for (let index = 0; index < masterworkLevel; index++) {
        afterMasterwork = applyUpdateFunc(afterMasterwork, affix.affixUpdatePerLvFunc)
    }
    const final =
        entry.finalMasterwork && affix.maxAffixUpdateFunc ? applyUpdateFunc(afterMasterwork, affix.maxAffixUpdateFunc) : afterMasterwork
    return { rollLevel, masterworkLevel, rolled, afterAncient, afterMasterwork, final }
}

/**
 * 解析天赋：仅主控生效，等级达到 `unlockLevel` 的效果才计入。
 * 数值 = `base + levelGrow × level`（无 levelGrow 时取 base）。
 * @param talentLevels `[talentId, level]` 列表
 * @param options 解析选项（角色元素）
 * @returns 每个生效效果一个 BUFF + 合并属性表 + 手写建模说明
 */
export function resolveTalentEffects(
    talentLevels: readonly (readonly [number, number])[],
    options: TranscendResolveOptions = {}
): TalentResolveResult {
    const talentSource = options.tables?.talents ?? talents
    const talentMap = new Map<number, DnaSeasonTalent>(talentSource.map(talent => [talent.id, talent]))
    const buffs: SourcedBuff[] = []
    const attrs: Record<string, number> = {}
    const modelingNotes: TranscendModelingNote[] = []
    const warnings: string[] = []
    // 手写 / 残缺配置的守卫：缺字段、null 条目、非数字等级都不应抛错
    const list = Array.isArray(talentLevels) ? talentLevels : []
    const seenTalents = new Set<number>()
    for (const item of list) {
        if (!Array.isArray(item) || item.length < 2) continue
        const [rawId, rawLevel] = item
        const talent = talentMap.get(Math.round(Number(rawId)))
        const level = Math.round(Number(rawLevel))
        if (!talent || !Number.isFinite(level) || level <= 0) continue
        // 去重按节点 id：同一节点重复配置只计一次
        if (seenTalents.has(talent.id)) continue
        seenTalents.add(talent.id)
        const talentAttrs: Record<string, number> = {}
        let handwritten = false
        let partial = false
        let note: string | undefined
        for (const [effectIndex, effect] of talent.effects.entries()) {
            if (level < (effect.unlockLevel ?? 1)) continue
            const mapping = mapTranscendAttr(effect.attr, effect)
            if (!mapping.key) continue
            if (mapping.element && options.charElement && mapping.element !== options.charElement) continue
            const raw = (effect.base ?? 0) + (effect.levelGrow ?? 0) * level
            if (!raw) continue
            // 减伤：仅负值取反；正值保留符号并告警，不得静默翻转
            if (mapping.negate && raw > 0) {
                warnings.push(`天赋「${talent.name}」(${talent.id}) 的减伤数值为正（${raw}），保留原符号`)
            }
            const value = resolveSignedValue(raw, mapping.negate)
            talentAttrs[mapping.key] = (talentAttrs[mapping.key] ?? 0) + value
            // 一个效果一条 BUFF：名称取该效果的官方文案，id 只进结构化字段（不拼进名称）
            buffs.push({
                key: talentBuffKey(talent.id, effectIndex),
                id: talent.id,
                buff: {
                    id: talent.id,
                    source: { kind: "talent", id: talent.id, effectIndex },
                    名称: `升华天赋·${mapping.key}`,
                    描述: effect.description ?? talent.desc,
                    attr: { [mapping.key]: value },
                },
            })
            if (mapping.status === "handwritten") {
                handwritten = true
                note ??= mapping.note
            }
            if (mapping.partial) partial = true
        }
        if (!Object.keys(talentAttrs).length) continue
        for (const [key, value] of Object.entries(talentAttrs)) attrs[key] = (attrs[key] ?? 0) + value
        if (handwritten) {
            modelingNotes.push({
                id: talent.id,
                kind: "talent",
                status: "handwritten",
                counted: true,
                partial,
                note: note ?? `天赋「${talent.name}」按本地属性口径计入`,
            })
        }
    }
    return { buffs, attrs, modelingNotes, warnings }
}

/**
 * 手写 BUFF 的元素限定是否允许当前角色元素：未限定或未提供角色元素时放行。
 * BUFF 挂载与技能替换收集共用此谓词，避免两者门控口径分叉。
 * @param limit 手写 BUFF 的 `限定`
 * @param charElement 当前角色元素
 * @returns 是否生效
 */
export function isTranscendBuffElementAllowed(limit: string | undefined, charElement: string | undefined): boolean {
    return !limit || !charElement || limit === charElement
}

/**
 * 解析一组装备词条：数值词条（Plan 1/2/4 固定属性）、技能等级（Plan 3）、手写被动（Plan 4）。
 * @param entries 装备词条配置
 * @param side 装备分组（决定装备位范围）
 * @param options 解析选项
 * @returns 逐条结果、属性、手写 BUFF、技能等级增量与警告
 */
export function resolveGearEffects(
    entries: readonly TranscendGearEntry[],
    side: TranscendSlotGroup,
    options: TranscendResolveOptions = {}
): GearResolveResult {
    const affixSource = options.tables?.affixes ?? affixes
    const affixMap = new Map<number, DnaSeasonAffix>(affixSource.map(affix => [affix.id, affix]))
    const result: GearResolveResult = {
        entries: [],
        buffs: [],
        attrs: {},
        skillReplacements: {},
        modelingNotes: [],
        warnings: [],
    }
    const seen = new Set<string>()
    /**
     * 抑制是否命中该侧 / 该装备位的条目：owner side / slotId 缺省时不限制，
     * 避免同一专属词条装在多个构筑位时把其它副本一并抑制。
     */
    const suppressAppliesTo = (slotId: number): boolean => {
        const suppress = options.suppress
        if (!suppress) return false
        if (suppress.ownerSide !== undefined && suppress.ownerSide !== side) return false
        if (suppress.slotId !== undefined && Math.round(suppress.slotId) !== slotId) return false
        return true
    }
    /**
     * 当前词条被收益快照抑制的属性键：`suppress.affixId` 命中时才生效，
     * 与 `@` 前缀两种写法都匹配（建模行名称不带前缀）。
     */
    const suppressedAttrsOf = (affixId: number, slotId: number): ReadonlySet<string> | undefined => {
        const suppress = options.suppress
        if (!suppress || suppress.affixId !== affixId || !suppress.attrs?.length || !suppressAppliesTo(slotId)) return undefined
        return new Set(suppress.attrs)
    }
    /** Plan 4 专属词条的手写建模：写状态 / 备注并挂载手写 BUFF；带技能等级的 1.8.7.1 词条同样要挂。 */
    const applyUniqueAffixMapping = (
        affix: DnaSeasonAffix,
        special: TranscendAffixMapping | undefined,
        resolved: ResolvedGearEntry,
        slotId: number,
        socketIndex: number | undefined,
        buffKey: string,
        affixClass: "tempering" | "other"
    ) => {
        const suppressedAttrs = suppressedAttrsOf(affix.id, slotId)
        resolved.status = special?.status ?? affix.mappingStatus ?? "handwritten"
        resolved.note = special?.note
        // 队友限定口径随词条透传：跨侧收集按它区分目标，本地侧据此屏蔽「只给其他队友」的 BUFF
        resolved.team = special?.team
        if (!special) {
            result.warnings.push(`专属词缀 ${affix.id} 缺少手写映射（UNIQUE_AFFIX_MAP），未计入`)
        }
        for (const [buffIndex, name] of (special?.buffs ?? []).entries()) {
            const buff = TRANSCEND_BUFF_MAP.get(name)
            if (!buff) {
                result.warnings.push(`手写 BUFF「${name}」不存在（词条 ${affix.id}）`)
                continue
            }
            const limited = typeof buff.限定 === "string" ? buff.限定 : ""
            if (!isTranscendBuffElementAllowed(limited, options.charElement)) continue
            // 建模明细行隔离：只去掉被抑制的属性键；全部被抑制的 BUFF 不再挂载（等价于该组件不存在）
            let applied = buff
            if (suppressedAttrs && buff.attr) {
                const attr: NonNullable<typeof buff.attr> = {}
                let hit = false
                for (const [key, value] of Object.entries(buff.attr)) {
                    const plain = key.startsWith("@") ? key.slice(1) : key
                    if (suppressedAttrs.has(key) || suppressedAttrs.has(plain)) {
                        hit = true
                        continue
                    }
                    attr[key] = value
                }
                if (hit) {
                    if (!Object.keys(attr).length) continue
                    applied = { ...buff, attr }
                }
            }
            resolved.buffs.push(name)
            // 名称保留手写表原文，来源改由结构化字段承载（slotId / socketIndex / affixId / 来源类）
            result.buffs.push({
                key: `${buffKey}:${buffIndex}`,
                id: affix.id,
                effectIndex: buffIndex,
                buff: {
                    ...applied,
                    id: applied.id ?? affix.id,
                    source: { kind: "gear", id: affix.id, slotId, socketIndex, affixSourceClass: affixClass },
                },
                coverage: special?.coverage,
                team: special?.team,
            })
        }
    }
    /** 技能替换候选：先收集，循环结束后按 slotId 统一裁决，避免依赖装备条目数组顺序 */
    const pendingSkillReplacements: {
        sourceId: number
        affixId: number
        slotId: number
        payload: TranscendSkillReplacement
    }[] = []
    /** 收集词条生效时的技能替换：导出为身份权威，手写字段只在导出无字段时叠加；元素门控与手写 BUFF 同口径 */
    const collectSkillReplacements = (affix: DnaSeasonAffix, special: TranscendAffixMapping | undefined, slotId: number) => {
        const manualBuffs = (special?.buffs ?? []).map(name => TRANSCEND_BUFF_MAP.get(name)).filter((buff): buff is Buff => Boolean(buff))
        // 生效的手写 BUFF 全部因元素限定被排除时，替换同样不生效
        if (
            manualBuffs.length > 0 &&
            manualBuffs.every(buff => !isTranscendBuffElementAllowed(typeof buff.限定 === "string" ? buff.限定 : "", options.charElement))
        ) {
            return
        }
        const exported = affix.skillReplacements
        const handwritten = TRANSCEND_SKILL_REPLACEMENTS[affix.id]
        const sourceKeys = new Set([...Object.keys(exported ?? {}), ...Object.keys(handwritten ?? {})])
        for (const sourceKey of sourceKeys) {
            const merged = mergeTranscendSkillReplacement(affix.id, sourceKey, exported?.[sourceKey])
            const sourceId = Number(sourceKey)
            if (!merged || !Number.isFinite(sourceId)) continue
            pendingSkillReplacements.push({ sourceId, affixId: affix.id, slotId, payload: merged })
        }
    }
    // 手写 / 残缺配置的守卫：缺数组、null 条目、非数字槽位/词条都跳过而不是抛错
    const list = Array.isArray(entries) ? entries : []
    for (const entry of list) {
        if (!entry || typeof entry !== "object") continue
        const slotId = Math.round(Number(entry.slotId))
        const affixId = Math.round(Number(entry.affixId))
        if (!Number.isFinite(slotId) || !Number.isFinite(affixId)) continue
        // 三组一人一套：归属校验按构筑位同域（主控 1-8 / 协战一 9-12 / 协战二 13-16）
        if (getTranscendGearGroupKeyOfSlot(slotId) !== getTranscendGearGroupKey(side)) {
            result.warnings.push(`装备位 ${slotId} 不属于 ${side} 分组，已忽略`)
            continue
        }
        // 孔位词条按 socketIndex 区分：同件装备两颗宝石不能被合并成一条；
        // 来源类写进行身份，同 id 的随机行与淬炼行各自保留（未归一化 / 非法 source 归入同一类）
        const socketIndex = entry.socketIndex === undefined ? undefined : Math.round(Number(entry.socketIndex))
        const affixClass = getTranscendAffixDedupeClass(entry.source)
        const buffKey = gearBuffKey(slotId, affixId, socketIndex, entry.source)
        if (seen.has(buffKey)) continue
        seen.add(buffKey)
        const affix = affixMap.get(affixId)
        if (!affix) {
            result.warnings.push(`词条 ${affixId} 不存在，已忽略`)
            continue
        }
        const slotType = getTranscendSlotType(slotId)
        if (!isAffixCompatibleWithSlot(affixId, slotId)) {
            result.warnings.push(`词条 ${affixId} 不能装备在装备位 ${slotId}（槽型 ${slotType}），已忽略`)
            continue
        }
        // 角色专属词条按上游精确 charIds 过滤；未提供 charId 时不做角色过滤（纯数据场景）
        if (affix.charIds?.length && options.charId !== undefined && !affix.charIds.includes(options.charId)) {
            result.warnings.push(`词条 ${affixId} 仅适用于角色 ${affix.charIds.join("、")}，当前角色 ${options.charId} 已忽略`)
            continue
        }

        const special = affix.plan === 4 ? UNIQUE_AFFIX_MAP[affixId] : undefined
        collectSkillReplacements(affix, special, slotId)
        const resolved: ResolvedGearEntry = {
            slotId,
            slotType,
            affixId,
            plan: affix.plan,
            ...(entry.source ? { source: entry.source } : {}),
            attrs: {},
            buffs: [],
            status: "exact",
            partial: special?.partial,
            included: special?.included,
            excluded: special?.excluded,
        }

        if (affix.addSkillLevel) {
            const value = resolveAffixValue(affix, entry).final
            const level = Math.round(value)
            resolved.value = value
            resolved.skillLevel = level
            // 收益快照抑制：只去掉技能等级组件（三键 + 合成 BUFF），其余被动照常计入
            const suppressedSkillLevel =
                options.suppress?.affixId === affixId && options.suppress.skillLevel === true && suppressAppliesTo(slotId)
            if (!suppressedSkillLevel) {
                // `skillTypes` 与 `skillIds` 命中同槽只计一次（技能与其子技能常同属一个槽位）
                const skillIndexes = new Set<number>()
                for (const skillType of affix.addSkillLevel.skillTypes ?? []) {
                    const index = SKILL_TYPE_INDEX[skillType]
                    if (index !== undefined) skillIndexes.add(index)
                }
                for (const skillId of affix.addSkillLevel.skillIds ?? []) {
                    const index = getSkillLevelIndex(skillId)
                    if (index !== undefined) skillIndexes.add(index)
                }
                if (!skillIndexes.size) result.warnings.push(`词条 ${affixId} 的技能等级目标无法解析，未计入`)
                // 技能等级走标准属性管线：三键 attr 与合成 BUFF 同时产出（属性面板 / 引擎二次解析同源）
                const skillAttrs: Record<string, number> = {}
                for (const index of skillIndexes) {
                    const key = SKILL_LEVEL_ATTR_KEYS[index]
                    skillAttrs[key] = level
                    resolved.attrs[key] = (resolved.attrs[key] ?? 0) + level
                    result.attrs[key] = (result.attrs[key] ?? 0) + level
                }
                if (skillIndexes.size) {
                    const slotName = slots.find(slot => slot.id === slotType)?.name ?? `槽型${slotType}`
                    result.buffs.push({
                        key: `${buffKey}:skill`,
                        id: affixId,
                        buff: {
                            id: affixId,
                            source: { kind: "gear", id: affixId, slotId, socketIndex, affixSourceClass: affixClass },
                            名称: `升华装备·${slotName}·技能等级`,
                            描述: affix.desc ?? "",
                            attr: skillAttrs,
                        },
                    })
                }
            }
            // 专属词条除技能等级外仍带被动 / 机制效果，继续按本地手写映射计入
            if (affix.plan === 4) applyUniqueAffixMapping(affix, special, resolved, slotId, socketIndex, buffKey, affixClass)
        } else if (affix.addAttrs?.length) {
            const value = resolveAffixValue(affix, entry).final
            resolved.value = value
            let handwritten = false
            for (const addAttr of affix.addAttrs) {
                const mapping = mapTranscendAttr(addAttr.attr, addAttr)
                if (!mapping.key) {
                    resolved.note ??= mapping.note
                    continue
                }
                if (mapping.element && options.charElement && mapping.element !== options.charElement) continue
                // 减伤：仅负值取反；正值保留符号并告警，不得静默翻转
                if (mapping.negate && value > 0) {
                    result.warnings.push(`词条 ${affixId} 的减伤数值为正（${value}），保留原符号`)
                    resolved.note ??= "减伤数值为正，按原符号计入"
                }
                const raw = resolveSignedValue(value, mapping.negate)
                resolved.attrs[mapping.key] = (resolved.attrs[mapping.key] ?? 0) + raw
                result.attrs[mapping.key] = (result.attrs[mapping.key] ?? 0) + raw
                if (mapping.status === "handwritten") {
                    handwritten = true
                    resolved.note ??= mapping.note
                }
                if (mapping.partial) resolved.partial = true
            }
            const counted = Object.keys(resolved.attrs).length > 0
            if (handwritten || !counted) resolved.status = "handwritten"
            else if (affix.plan === 4) resolved.status = special?.status ?? affix.mappingStatus ?? "handwritten"
            if (!counted) resolved.note ??= "属性不可映射"
            if (counted) {
                const attrNames = affix.addAttrs.map(addAttr => addAttr.attr).join("·")
                const slotName = slots.find(slot => slot.id === slotType)?.name ?? `槽型${slotType}`
                result.buffs.push({
                    key: buffKey,
                    id: affixId,
                    buff: {
                        id: affixId,
                        source: { kind: "gear", id: affixId, slotId, socketIndex, affixSourceClass: affixClass },
                        名称: `升华装备·${slotName}·${attrNames}`,
                        描述: affix.desc ?? "",
                        attr: resolved.attrs,
                    },
                })
            }
        } else if (affix.plan === 4) {
            applyUniqueAffixMapping(affix, special, resolved, slotId, socketIndex, buffKey, affixClass)
        } else {
            resolved.status = "handwritten"
            resolved.note = "无固定属性与被动，未计入"
            result.warnings.push(`词条 ${affixId} 没有可计算的属性`)
        }

        result.entries.push(resolved)
        if (resolved.status !== "exact") {
            result.modelingNotes.push({
                id: affixId,
                kind: "gear",
                status: "handwritten",
                counted: Object.keys(resolved.attrs).length > 0 || resolved.buffs.length > 0,
                partial: resolved.partial,
                included: resolved.included,
                excluded: resolved.excluded,
                note: resolved.note,
            })
        }
    }
    // 同 source 冲突按装备位高者胜（稳定排序：同槽保持收集顺序），告警带被覆盖词条 id
    const appliedSkillReplacements = new Map<number, { affixId: number; slotId: number }>()
    const sortedReplacements = [...pendingSkillReplacements].sort((left, right) => left.slotId - right.slotId)
    for (const candidate of sortedReplacements) {
        const previous = appliedSkillReplacements.get(candidate.sourceId)
        if (previous) {
            result.warnings.push(
                `技能替换 ${candidate.sourceId} 被词条 ${candidate.affixId} 覆盖（装备位 ${candidate.slotId}；原词条 ${previous.affixId}，装备位 ${previous.slotId}）`
            )
        }
        appliedSkillReplacements.set(candidate.sourceId, { affixId: candidate.affixId, slotId: candidate.slotId })
        result.skillReplacements[candidate.sourceId] = candidate.payload
    }
    return result
}

/**
 * 跨侧收集队友限定 BUFF：遍历其他已启用构筑位的装备组，只取 `other-teammates` / `all-teammates`
 * 词条，克隆为收益侧的派生 BUFF（不改来源构筑、不写持久化设置）。
 * @param settings 升华配置
 * @param targetSide 受益构筑位
 * @param options 解析选项（受益侧 `charElement` 用于过滤 BUFF `限定`）
 * @returns 派生 BUFF；key 以 `team:` 前缀区分，来源侧自身永不获得 `other-teammates`
 */
function collectTeammateBuffs(
    settings: TranscendSettings,
    targetSide: TranscendSlotGroup,
    options: TranscendResolveOptions
): SourcedBuff[] {
    const teamSides = options.teamSides
    if (!teamSides?.length) return []
    const result: SourcedBuff[] = []
    /** 同一来源侧同一 affixId 已计入的装备实例（slot + socket）：一件多 BUFF 只算一份 */
    const perSourceInstances = new Map<string, Set<string>>()
    const ordered = [...teamSides].sort((left, right) => teamSideOrder(left.side) - teamSideOrder(right.side))
    for (const source of ordered) {
        if (!source.active || source.side === targetSide) continue
        const sourceGear = getTranscendSideGearGroup(settings, source.side)
        const flattened = flattenEquippedGear(Array.isArray(sourceGear) ? sourceGear : [])
        // 来源侧只按来源角色过滤 charIds；BUFF `限定` 不在这里判（队友 BUFF 的元素语义看受益者）
        const sourceResult = resolveGearEffects(flattened.entries, source.side, {
            charId: source.charId,
            charElement: undefined,
            tables: options.tables,
            // 收益快照的组件抑制必须作用于来源侧副本，否则团队合计口径下队友词条组件收益恒 0
            suppress: options.suppress,
        })
        for (const sourced of sourceResult.buffs) {
            const team = sourced.team
            if (!team) continue
            if (team.target !== "other-teammates" && team.target !== "all-teammates") continue
            const limited = typeof sourced.buff.限定 === "string" ? sourced.buff.限定 : ""
            if (!isTranscendBuffElementAllowed(limited, options.charElement)) continue
            if ((team.stackScope ?? "per-source") !== "single") {
                const countKey = `${source.side}:${sourced.id}`
                const instanceKey = `${sourced.buff.source?.slotId ?? "-"}:${sourced.buff.source?.socketIndex ?? "-"}`
                const instances = perSourceInstances.get(countKey) ?? new Set<string>()
                perSourceInstances.set(countKey, instances)
                if (!instances.has(instanceKey)) {
                    if (instances.size >= (team.maxStacksPerSource ?? 1)) continue
                    instances.add(instanceKey)
                }
            }
            const key = `team:${source.side}:${sourced.key}`
            result.push({
                key,
                id: sourced.id,
                effectIndex: sourced.effectIndex,
                buff: {
                    ...sourced.buff,
                    source: {
                        kind: "gear",
                        id: sourced.buff.source?.id ?? sourced.id,
                        slotId: sourced.buff.source?.slotId,
                        socketIndex: sourced.buff.source?.socketIndex,
                        affixSourceClass: sourced.buff.source?.affixSourceClass,
                        ownerSide: source.side,
                        stackKey: key,
                    },
                },
                coverage: sourced.coverage,
                team,
            })
        }
    }
    return result
}

/**
 * 汇总升华效果：主控含天赋 + 主控装备，协战只含自己组装备（上游口径：协战不吃天赋）。
 * 传入 `options.teamSides` 时额外收集其他构筑位的队友限定 BUFF（只注入 BUFF，不叠加技能等级 / 替换）。
 * @param settings 升华配置（可缺失/未开启）
 * @param side 构筑分组
 * @param options 解析选项（角色元素 / 角色 id / 三侧上下文）
 * @returns 可直接并入 `CharBuildOptions.buffs` 的等级化 BUFF、技能等级增量与手写建模说明
 */
export function collectTranscendEffects(
    settings: TranscendSettings | null | undefined,
    side: TranscendSlotGroup,
    options: TranscendResolveOptions = {}
): TranscendEffects {
    const empty: TranscendEffects = {
        buffs: [],
        skillReplacements: {},
        modelingNotes: [],
        warnings: [],
    }
    if (!settings?.enabled) return empty

    // 手写 / 残缺配置（如只有 { enabled: true }）不能抛错：缺失数组按空处理
    const talentLevels = Array.isArray(settings.talentLevels) ? settings.talentLevels : []
    const talentsResult = side === "main" ? resolveTalentEffects(talentLevels, options) : undefined
    // 三组一人一套：各构筑位只读取自己的装备组；post-U32b 的 assistGear 仅作只读兼容别名
    const gearEntries = getTranscendSideGearGroup(settings, side)
    // v1 平铺词条与 v2 物品统一展平：物品含专属 / 普通词条与按槽型解析的宝石词条
    const flattened = flattenEquippedGear(Array.isArray(gearEntries) ? gearEntries : [])
    const gearResult = resolveGearEffects(flattened.entries, side, options)
    // 协战停用时既不做来源也不做受益方（主控在 CharSettings 没有启用位，不据此屏蔽）
    const targetContext = options.teamSides?.find(context => context.side === side)
    const teammateBuffs = targetContext && side !== "main" && !targetContext.active ? [] : collectTeammateBuffs(settings, side, options)

    const buffs: LeveledBuff[] = []
    const seenKeys = new Set<string>()
    // 只给其他构筑位的 BUFF 不注入装备者自己（受益侧会从来源侧收集），跨侧派生条目不再过滤
    const localBuffs = [...(talentsResult?.buffs ?? []), ...gearResult.buffs].filter(sourced => sourced.team?.target !== "other-teammates")
    // 候选来源顺序：本地副本按受益侧自身，跨侧副本按 `ownerSide`；`single` 全队去重按此稳定顺序取最早一份
    const candidates = [
        ...localBuffs.map(sourced => ({ sourced, order: teamSideOrder(side) })),
        ...teammateBuffs.map(sourced => ({ sourced, order: teamSideOrder(sourced.buff.source?.ownerSide ?? side) })),
    ]
    const singleBest = new Map<string, number>()
    candidates.forEach((candidate, index) => {
        if ((candidate.sourced.team?.stackScope ?? "per-source") !== "single") return
        const group = singleBuffGroup(candidate.sourced)
        const best = singleBest.get(group)
        if (best === undefined || candidate.order < candidates[best].order) singleBest.set(group, index)
    })
    for (const [index, candidate] of candidates.entries()) {
        const sourced = candidate.sourced
        // `single`：local + cross 统一按词条 + 效果下标只保留最早来源（同序保留先出现的一份）
        if ((sourced.team?.stackScope ?? "per-source") === "single" && singleBest.get(singleBuffGroup(sourced)) !== index) continue
        // 去重按稳定来源 key：同名 BUFF（不同节点 / 不同装备位）互不吞并
        if (seenKeys.has(sourced.key)) continue
        seenKeys.add(sourced.key)
        const leveled = new LeveledBuff(sourced.buff, 1)
        // 只标注来源类型，不写 pid：pid + pt 会被收益请求当作「特效挂载点」下发 wasm
        leveled.pt = TRANSCEND_BUFF_SOURCE
        if (leveled.id === undefined) leveled.id = sourced.id
        if (sourced.coverage !== undefined) leveled.coverage = sourced.coverage
        buffs.push(leveled)
    }

    return {
        buffs,
        skillReplacements: gearResult.skillReplacements,
        modelingNotes: [...(talentsResult?.modelingNotes ?? []), ...gearResult.modelingNotes],
        warnings: [...(talentsResult?.warnings ?? []), ...flattened.warnings, ...gearResult.warnings],
    }
}

/**
 * 只解析某构筑位的技能等级三键属性（升华装备词条），不构造 `LeveledBuff` / 不收集队友 BUFF。
 * 与 `collectTranscendEffects` 同源（天赋当前不提供技能等级增量）：两条路径共享 `resolveGearEffects`，
 * 任何 gear 语义变更都必须保持同值（回归护栏：`skillLevel30.test.ts` 的「二路解析同值」用例）。
 * @param settings 升华配置（可缺失 / 未开启）
 * @param side 构筑位
 * @param options 解析选项（角色 id / 元素）
 * @returns 三键技能等级加成 `[E, Q, P]`
 */
export function resolveTranscendSkillLevelAttrs(
    settings: TranscendSettings | null | undefined,
    side: TranscendSlotGroup,
    options: TranscendResolveOptions = {}
): CharSkillLevels {
    if (!settings?.enabled) return [0, 0, 0]
    const gearEntries = getTranscendSideGearGroup(settings, side)
    const flattened = flattenEquippedGear(Array.isArray(gearEntries) ? gearEntries : [])
    const attrs = resolveGearEffects(flattened.entries, side, options).attrs
    return SKILL_LEVEL_ATTR_KEYS.map(key => attrs[key] ?? 0) as unknown as CharSkillLevels
}

/**
 * 把升华技能等级增量叠加到技能等级三元组上，并钳制到 1-30。
 * @param base 基础技能等级（`[E, Q, 被动]`）
 * @param bonus 增量
 * @returns 叠加后的技能等级
 */
export function addTranscendSkillLevels(base: CharSkillLevels, bonus: CharSkillLevels): CharSkillLevels {
    return resolveEffectiveSkillLevels(base, bonus)
}
