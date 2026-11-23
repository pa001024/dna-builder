import { type BuffSelectContext, isBuffSelectable, isModProvidedBuff } from "./buffFilter"
import { CharBuild, type DotFrequencySettings, defaultDotFrequencySettings } from "./CharBuild"
import { createCustomBuff } from "./CharBuildHelper"
import { type CharSkillLevels, normalizeCharSkillLevels, type SignatureWeapon } from "./charSettings"
import { buffMap, charMap, monsterMap, petMap, weaponMap } from "./d"
import type { Buff } from "./data-types"
import { MaxMonsterLevelLimit } from "./game-const"
import { LeveledBuff } from "./leveled/LeveledBuff"
import { LeveledCharHelper, LeveledWeaponHelper } from "./leveled/LeveledHelpers"
import { PET_BREAKTHROUGH_MAX_LEVEL } from "./leveled/LeveledPet"
import {
    collectPetBuffs,
    collectTraitBuffs,
    getEffectivePetLevel,
    getPetBaseCd,
    getPetTraitByLevel,
    getPetTraits,
    isPetRelatedBuffName,
    resolvePetBuffName,
    resolvePetCoverage,
    TRAIT_MAX_LEVEL,
    TRAIT_SLOT_COUNT,
    type TraitSlot,
} from "./petTrait"
import { calculateTeamTotal } from "./teamBuild"
import {
    applyTraceBuffOverrides,
    collectTraceEffects,
    isOwnLegacyTraceBuff,
    normalizeTraceStacks,
    resolveHighestActiveRoot,
    resolveTraceOffRoots,
    TRACE_LEVEL_MAX,
    type TraceStack,
} from "./traceEffects"
import { buildTranscendTeamSides, collectTranscendEffects, resolveTranscendSkillLevelAttrs, type TranscendModelingNote } from "./transcend"
import { isEquippedGear, type TranscendGearGroup, toStoredGearItem } from "./transcendGear"
import {
    createDefaultTranscendSettings,
    getActiveGearVariant,
    normalizeTranscendSettings,
    type TranscendGearVariant,
    type TranscendNormalizeDatasets,
    type TranscendSettings,
    type TranscendSlotGroup,
} from "./transcendSettings"

/**
 * 独立升华构筑：主控 / 协战一 / 协战二各自一份 loadout + 共享的升华配置与环境。
 * 与老 `CharSettings` 的 MOD / 时间轴等玩法字段解耦；魔灵 / 潜质 / 自定义 BUFF 以 joint 字段
 * 共享同一份口径（只挂主控），便于原构筑页组件直接复用。
 */

const CHAR_LEVEL_MAX = 80
const WEAPON_LEVEL_MAX = 80
const WEAPON_REFINE_MAX = 5
const DEFAULT_MELEE_WEAPON = 10206
const DEFAULT_RANGED_WEAPON = 20102
const DEFAULT_ENEMY_ID = 130
const DEFAULT_ENEMY_LEVEL = 80
const DEFAULT_RESONANCE_GAIN = 3

/** 单个构筑位的角色 / 技能 / 武器配置 */
export interface TranscendSideLoadout {
    charId: number
    charLevel: number
    charSkillLevel: CharSkillLevels
    /** 溯源等级 0..该角色最大溯级（缺省取最大）；旧档只用于迁移 */
    traceLevel: number
    /** 关闭的根源序号（1..该角色最大根源）；缺省 = 全部激活 */
    traceOffRoots?: number[]
    /** 溯源层数 / 覆盖率设置 `[根源, 等级, 覆盖率?]`；缺省 = 全部按 `mx` 满层、覆盖率 1 */
    traceStacks?: TraceStack[]
    meleeWeapon: number
    meleeWeaponLevel: number
    meleeWeaponRefine: number
    rangedWeapon: number
    rangedWeaponLevel: number
    rangedWeaponRefine: number
    /** 额外精通武器类型（如 "长柄"）：跨精通武器据此生效锻造 / 潜质，空串表示未解锁 */
    extraMastery: string
    baseName: string
    /** 本位目标表达式（空串表示未设置；旧存档 / 未归一化输入缺字段时回退到顶层旧值） */
    targetFunction: string
    /** 本位目标表达式可用的自定义变量 `[名称, 表达式]` */
    customVariables: [string, string][]
    /** 本位 DOT 频率设置（每秒各来源触发次数，缺省全 0） */
    dotSettings: DotFrequencySettings
    /** 构筑位是否参与合计（三段均可禁用；角色无效时为 false） */
    enabled: boolean
}

/**
 * 与原构筑页共享的魔灵 / 潜质 / 自定义 BUFF 配置（joint 字段）。
 * 口径与原版一致：只注入主控构筑，协战不继承；魔灵 / 潜质相关 BUFF 不再作为普通 BUFF 注入。
 */
export interface TranscendJointSettings {
    /** 已选魔灵 id（0 表示未选择） */
    petId: number
    /** 魔灵突破等级（0-3，与潜质加成叠加后得到生效技能等级） */
    petLevel: number
    /** 魔灵主动技覆盖率（0-1，手动模式的值） */
    petCoverage: number
    /** 主动技覆盖率是否按「持续时间 / 实际冷却」自动折算 */
    petAutoCoverage: boolean
    /** 魔灵潜质槽位（固定 4 槽，`[基础潜质 id, 等级]`，null 表示空槽） */
    traits: TraitSlot[]
    /** 自定义 BUFF 属性 `[属性名, 数值]`（勾选「自定义BUFF」时生效） */
    customBuff: [string, number][]
}

/** 独立升华构筑设置 */
export interface TranscendBuildSettings extends TranscendJointSettings {
    main: TranscendSideLoadout
    assist1: TranscendSideLoadout
    assist2: TranscendSideLoadout
    /** 天赋 + 三组装备（主控 1-8 / 协战一 9-12 / 协战二 13-16，变体同步在 TranscendSettings 内） */
    transcend: TranscendSettings
    /**
     * 手动选择的 BUFF `[名称, 等级, 覆盖率?]`（与老 `CharSettings.buffs` 同形状）。
     * 注入时按构筑位上下文逐侧过滤：限定角色 / 武器 BUFF 只进入匹配的构筑位；
     * 魔之楔提供（`禁用` 非空）的 BUFF 一律排除；魔灵 / 潜质相关 BUFF 由 joint 字段接管。
     */
    buffs: [string, number, number?][]
    /** 旧版全局目标表达式：仅作旧存档 / 旧分享的迁移回退，归一化后镜像主控位的值 */
    targetFunction: string
    /** 旧版全局自定义变量 `[名称, 表达式]`：同上，归一化后镜像主控位的值 */
    customVariables: [string, string][]
    enemyId: number
    enemyLevel: number
    enemyResistance: number
    hpPercent: number
    resonanceGain: number
    imbalance: boolean
}

/** 单个构筑位的构建结果 */
export interface TranscendSideBuild {
    side: TranscendSlotGroup
    charId: number
    build: CharBuild
    /** 被跳过的装备 / 词条原因，供 UI 展示 */
    warnings: string[]
    /** 手写 / 部分覆盖条目的建模说明，供 UI 展示 */
    modelingNotes: TranscendModelingNote[]
}

/** 主控 + 协战合计结果；未启用的构筑位（含主控）为 null */
export interface TranscendTeamBuild {
    main: TranscendSideBuild | null
    assist1: TranscendSideBuild | null
    assist2: TranscendSideBuild | null
    /** 有效段伤害之和 */
    total: number
}

/**
 * 创建一份空协战 loadout（未启用、无角色/武器）。
 * @returns 新的协战 loadout
 */
function createAssistLoadout(): TranscendSideLoadout {
    return {
        charId: 0,
        charLevel: CHAR_LEVEL_MAX,
        charSkillLevel: [10, 10, 10],
        traceLevel: TRACE_LEVEL_MAX,
        traceStacks: [],
        meleeWeapon: 0,
        meleeWeaponLevel: WEAPON_LEVEL_MAX,
        meleeWeaponRefine: WEAPON_REFINE_MAX,
        rangedWeapon: 0,
        rangedWeaponLevel: WEAPON_LEVEL_MAX,
        rangedWeaponRefine: WEAPON_REFINE_MAX,
        extraMastery: "",
        baseName: "",
        targetFunction: "",
        customVariables: [],
        dotSettings: { ...defaultDotFrequencySettings },
        enabled: false,
    }
}

/**
 * 默认主控角色 id：数据表里的首个角色；数据未就绪（空表）时为 0。
 * 用于非法路由参数（如 `/transcend-build/999999`）回退到可计算的角色。
 * @returns 角色 id
 */
export function getDefaultTranscendCharId(): number {
    for (const key of charMap.keys()) {
        if (typeof key === "number" && key > 0) return key
    }
    return 0
}

/**
 * 解析主控角色 id：显式但非法的 id 回退到默认角色，未指定（0 / 非数字）保持 0。
 * @param charId 原始角色 id
 * @returns 可用的角色 id
 */
function resolveMainCharId(charId: number): number {
    if (!Number.isFinite(charId) || charId <= 0) return 0
    const id = Math.round(charId)
    return charMap.has(id) ? id : getDefaultTranscendCharId()
}

/**
 * 创建独立的升华构筑默认设置：主控默认角色与专武，协战默认未启用，升华配置默认关闭。
 * @param charId 主控角色 id（非法 id 回退到默认角色，0 表示未选择）
 * @param signatureWeapon 主控专武（可选，装备到对应槽位）
 * @returns 新的构筑设置
 */
export function createDefaultTranscendBuildSettings(charId: number, signatureWeapon?: SignatureWeapon | null): TranscendBuildSettings {
    return {
        main: {
            charId: resolveMainCharId(charId),
            charLevel: CHAR_LEVEL_MAX,
            charSkillLevel: [10, 10, 10],
            traceLevel: TRACE_LEVEL_MAX,
            traceStacks: [],
            meleeWeapon: signatureWeapon?.type === "近战" ? signatureWeapon.id : DEFAULT_MELEE_WEAPON,
            meleeWeaponLevel: WEAPON_LEVEL_MAX,
            meleeWeaponRefine: WEAPON_REFINE_MAX,
            rangedWeapon: signatureWeapon?.type === "远程" ? signatureWeapon.id : DEFAULT_RANGED_WEAPON,
            rangedWeaponLevel: WEAPON_LEVEL_MAX,
            rangedWeaponRefine: WEAPON_REFINE_MAX,
            extraMastery: "",
            baseName: "",
            targetFunction: "",
            customVariables: [],
            dotSettings: { ...defaultDotFrequencySettings },
            enabled: true,
        },
        assist1: createAssistLoadout(),
        assist2: createAssistLoadout(),
        transcend: createDefaultTranscendSettings(),
        buffs: [],
        petId: 0,
        petLevel: PET_BREAKTHROUGH_MAX_LEVEL,
        petCoverage: 1,
        petAutoCoverage: true,
        traits: Array(TRAIT_SLOT_COUNT).fill(null) as TraitSlot[],
        customBuff: [],
        targetFunction: "",
        customVariables: [],
        enemyId: DEFAULT_ENEMY_ID,
        enemyLevel: DEFAULT_ENEMY_LEVEL,
        enemyResistance: 0,
        hpPercent: 1,
        resonanceGain: DEFAULT_RESONANCE_GAIN,
        imbalance: false,
    }
}

/** 读取有限数值并钳制到区间；非法值回退 */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback
    return Math.max(min, Math.min(max, value as number))
}

/** 读取有限整数并钳制到区间；非法值回退 */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    return Math.round(clampNumber(value, min, max, fallback))
}

/** 读取正整数 id；非法 / 缺省按 0（未设置）处理，保留由数据表判断 */
function toId(value: unknown): number {
    if (value === undefined || value === null) return 0
    const id = Math.round(Number(value))
    return Number.isFinite(id) && id > 0 ? id : 0
}

/** 归一化选项：区分「读取 / 持久化」与「计算前净化」两套 id 口径 */
export interface TranscendNormalizeOptions {
    /**
     * 保留数据表里不存在的角色 / 武器 / 敌人 id（读取与持久化路径使用）。
     * 安全模式（版本门控）或数据包缺失时，存档里的高版本 id 不能被清零后写回，
     * 否则关闭安全模式后配置不可恢复；计算前仍走严格净化。
     */
    preserveUnknownIds?: boolean
}

/**
 * 归一化引用 id（角色 / 武器 / 敌人）。
 *
 * 形状非法（非数字 / 非正）一律取 `invalidValue`；形状合法但数据表里不存在时，
 * 仅在「保留未知 id」或对应数据表为空（安全模式 / 数据包缺失）时原样保留，
 * 否则回退到 `invalidValue`。字段缺失沿用 `fallback`。
 * @param value 原始值
 * @param fallback 缺省值（字段缺失时沿用）
 * @param has 数据表查找函数
 * @param dataEmpty 对应数据表是否为空
 * @param preserve 是否保留未知 id
 * @param invalidValue 非法 / 净化后的取值
 * @returns 归一化后的 id
 */
function normalizeRefId(
    value: unknown,
    fallback: number,
    has: (id: number) => boolean,
    dataEmpty: boolean,
    preserve: boolean,
    invalidValue: number
): number {
    if (value === undefined) return fallback
    const id = Math.round(Number(value))
    if (!Number.isFinite(id) || id <= 0) return invalidValue
    if (has(id)) return id
    return dataEmpty || preserve ? id : invalidValue
}

/** 归一化敌人 id：未知怪物会让 LeveledMonster 抛错，计算路径统一回退到默认目标 */
function normalizeEnemyId(value: unknown, preserve: boolean): number {
    return normalizeRefId(value, DEFAULT_ENEMY_ID, id => monsterMap.has(id), monsterMap.size === 0, preserve, DEFAULT_ENEMY_ID)
}

/** 读取武器表里的全部类别（`类型[1]`，与 `LeveledWeapon.类别` 同口径） */
function getWeaponCategories(): Set<string> {
    const categories = new Set<string>()
    for (const weapon of weaponMap.values()) {
        const category = weapon.类型?.[1]
        if (category) categories.add(category)
    }
    return categories
}

/**
 * 读取角色可选的额外精通武器类别（供构筑页下拉过滤）。
 * 武器数据可用时剔除当前数据里没有武器的类别；数据不可用时原样返回。
 * @param charId 角色 id
 * @returns 可选类别列表；角色无效或没有额外精通时为空数组
 */
export function getTranscendExtraMasteryOptions(charId: number): string[] {
    const char = charMap.get(Math.round(Number(charId)))
    const allowed = Array.isArray(char?.额外精通) ? char.额外精通 : []
    if (!allowed.length) return []
    const unique = [...new Set(allowed)]
    if (weaponMap.size === 0) return unique
    const categories = getWeaponCategories()
    return unique.filter(category => categories.has(category))
}

/**
 * 归一化额外精通武器类型：
 * - 武器数据可用时必须是真实武器类别（`类型[1]`）；
 * - 角色有效时还必须在该角色的 `额外精通` 里（引擎会无条件授予该精通，不能凭空放行）；
 * - 角色未知或武器数据不可用（数据表为空）时保留原值，避免安全模式下丢配置。
 * @param value 原始值
 * @param fallback 缺省值（字段缺失时沿用）
 * @param charId 该构筑位的角色 id
 * @returns 合法的武器类别，空串表示未解锁
 */
function normalizeExtraMastery(value: unknown, fallback: string, charId: number): string {
    if (value === undefined) return fallback
    if (typeof value !== "string") return ""
    const category = value.trim()
    if (!category) return ""
    if (weaponMap.size > 0 && !getWeaponCategories().has(category)) return ""
    const char = charMap.get(charId)
    if (char && !(char.额外精通 ?? []).includes(category)) return ""
    return category
}

/**
 * 归一化自定义变量：只保留 `[名称, 表达式]` 且两者都非空的字符串对。
 * 名称合法性（重名、非法标识符）由 `CharBuild` 求值时判定，这里不重复实现。
 * @param value 原始变量列表
 * @returns 归一化后的键值对
 */
function normalizeCustomVariables(value: unknown): [string, string][] {
    if (!Array.isArray(value)) return []
    const result: [string, string][] = []
    for (const item of value) {
        if (!Array.isArray(item) || item.length < 2) continue
        const [rawName, rawExpression] = item as unknown[]
        const name = typeof rawName === "string" ? rawName.trim() : ""
        const expression = typeof rawExpression === "string" ? rawExpression.trim() : ""
        if (!name || !expression) continue
        result.push([name, expression])
    }
    return result
}

/** 旧版全局目标表达式 / 自定义变量：构筑位字段缺失或非法时的迁移来源 */
interface TranscendSideExpressions {
    targetFunction: string
    customVariables: [string, string][]
}

/** 逐条复制自定义变量，避免多个构筑位共享同一数组 */
function cloneCustomVariables(value: readonly [string, string][]): [string, string][] {
    return value.map(([name, expression]) => [name, expression] as [string, string])
}

/**
 * 归一化 DOT 频率设置：各来源频率取有限且 ≥ 0 的数值，`forceOwnAdditionalDamage` 取布尔。
 * 字段缺失沿用 base（默认全 0 / false），非法值按 0 / false 处理。
 * @param value 原始 DOT 设置
 * @param base 字段缺失时的缺省值
 * @returns 结构完整的 DOT 设置
 */
function normalizeDotSettings(value: unknown, base: DotFrequencySettings): DotFrequencySettings {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<DotFrequencySettings>) : {}
    return {
        skill: clampNumber(raw.skill, 0, Number.MAX_SAFE_INTEGER, base.skill),
        melee: clampNumber(raw.melee, 0, Number.MAX_SAFE_INTEGER, base.melee),
        ranged: clampNumber(raw.ranged, 0, Number.MAX_SAFE_INTEGER, base.ranged),
        skillweapon: clampNumber(raw.skillweapon, 0, Number.MAX_SAFE_INTEGER, base.skillweapon),
        forceOwnAdditionalDamage:
            typeof raw.forceOwnAdditionalDamage === "boolean" ? raw.forceOwnAdditionalDamage : base.forceOwnAdditionalDamage === true,
    }
}

/** 无 legacy 回退来源时使用的空表达式（未归一化输入直接净化 / 计算路径） */
const EMPTY_SIDE_EXPRESSIONS: TranscendSideExpressions = { targetFunction: "", customVariables: [] }

/**
 * 归一化手动 BUFF 列表：只保留 `[名称, 等级, 覆盖率?]`，名称按出现顺序去重（后者覆盖），
 * 等级钳制到该 BUFF 的等级上限，覆盖率钳制到 0-1（满覆盖省略第三项）。
 * @param value 原始 BUFF 列表
 * @returns 归一化后的列表
 */
function normalizeBuffList(value: unknown): [string, number, number?][] {
    if (!Array.isArray(value)) return []
    const map = new Map<string, [string, number, number?]>()
    for (const item of value) {
        if (!Array.isArray(item) || item.length < 2) continue
        const name = typeof item[0] === "string" ? item[0].trim() : ""
        if (!name) continue
        const rawLevel = Math.round(Number(item[1]))
        if (!Number.isFinite(rawLevel) || rawLevel <= 0) continue
        const maxLevel = Math.max(1, Math.round(buffMap.get(name)?.mx || rawLevel))
        const level = Math.max(1, Math.min(maxLevel, rawLevel))
        const rawCoverage = Number(item[2])
        if (!Number.isFinite(rawCoverage) || rawCoverage >= 1) {
            map.set(name, [name, level])
            continue
        }
        map.set(name, [name, level, +Math.max(0, rawCoverage).toFixed(6)])
    }
    return [...map.values()]
}

/** 自定义 BUFF 名称（与原构筑页同一常量口径） */
const CUSTOM_BUFF_NAME = "自定义BUFF"

/**
 * 归一化自定义 BUFF 属性：只保留 `[属性名, 有限数值]`，同名属性后值覆盖，数值保留 6 位小数。
 * 属性名合法性由引擎汇总时判定，这里不重复实现。
 * @param value 原始属性列表
 * @returns 归一化后的键值对
 */
function normalizeCustomBuff(value: unknown): [string, number][] {
    if (!Array.isArray(value)) return []
    const map = new Map<string, number>()
    for (const item of value) {
        if (!Array.isArray(item) || item.length < 2) continue
        const name = typeof item[0] === "string" ? item[0].trim() : ""
        const amount = Number(item[1])
        if (!name || !Number.isFinite(amount)) continue
        map.set(name, +amount.toFixed(6))
    }
    return [...map.entries()]
}

/** 潜质目录是否已加载（安全模式 / 数据包缺失时为空） */
function hasTraitCatalog(): boolean {
    return getPetTraits().length > 0
}

/**
 * 归一化潜质槽位：固定 4 槽、同一基础潜质只保留一槽、非法档位丢弃。
 * 潜质目录可用时要求档位真实存在；目录为空（安全模式）时保留形状合法的槽位，避免丢配置。
 * @param value 原始槽位列表
 * @returns 结构完整的潜质槽位
 */
function normalizeJointTraits(value: unknown): TraitSlot[] {
    const picked: TraitSlot[] = []
    const usedBids = new Set<number>()
    const catalogReady = hasTraitCatalog()
    for (const slot of Array.isArray(value) ? value : []) {
        if (!Array.isArray(slot) || slot.length < 2) continue
        const bid = Math.round(Number(slot[0]))
        const level = Math.round(Number(slot[1]))
        if (!Number.isFinite(bid) || !Number.isFinite(level) || bid <= 0) continue
        if (level < 1 || level > TRAIT_MAX_LEVEL || usedBids.has(bid)) continue
        if (catalogReady && !getPetTraitByLevel(bid, level)) continue
        usedBids.add(bid)
        if (picked.length < TRAIT_SLOT_COUNT) picked.push([bid, level])
    }
    return Array.from({ length: TRAIT_SLOT_COUNT }, (_, index) => picked[index] ?? null)
}

/**
 * 旧存档迁移：把 BUFF 列表里勾选的魔灵内容搬进 joint 字段（与原构筑页 `migrateLegacyPetBuffs` 同口径）。
 * 历史版本把潜质 / 魔灵被动 / 主动技当普通 BUFF 勾选，不迁移会让同一效果既留在 BUFF 列表
 * 又由 joint 字段注入而重复计算；迁移后一律从 BUFF 列表移除。
 * @param settings 归一化后的构筑设置（原地修改）
 */
function migrateLegacyPetBuffs(settings: TranscendBuildSettings): void {
    const list = settings.buffs
    if (!list.length) return
    // 安全模式 / 数据包缺失时魔灵与潜质表为空：无法判定归属，保留原 BUFF 等下次载入再迁移
    if (!hasTraitCatalog() && petMap.size === 0) return
    const traits = [...settings.traits]
    const usedBids = new Set(traits.filter((slot): slot is [number, number] => slot !== null).map(slot => slot[0]))
    const hadPet = settings.petId > 0
    let petLevelTaken = hadPet
    const remaining: typeof list = []
    let migrated = false
    for (const item of list) {
        const [name, level, coverage] = item
        const origin = resolvePetBuffName(name)
        if (!origin) {
            if (!isPetRelatedBuffName(name)) {
                remaining.push(item)
                continue
            }
            // 无法识别归属的魔灵相关 BUFF 一并移除，避免变成隐藏但仍在生效的幽灵 BUFF
            migrated = true
            continue
        }
        migrated = true
        if (origin.kind === "trait") {
            const { trait } = origin
            const traitLevel = Math.max(1, Math.min(TRAIT_MAX_LEVEL, Math.round(level)))
            if (!usedBids.has(trait.bid) && getPetTraitByLevel(trait.bid, traitLevel)) {
                const slotIndex = traits.indexOf(null)
                if (slotIndex !== -1) {
                    traits[slotIndex] = [trait.bid, traitLevel]
                    usedBids.add(trait.bid)
                }
            }
            continue
        }
        if (!settings.petId) settings.petId = origin.petId
        if (!hadPet && origin.active && typeof coverage === "number") {
            settings.petCoverage = Math.max(0, Math.min(1, +coverage.toFixed(6)))
        }
        if (!petLevelTaken && Number.isFinite(level)) {
            settings.petLevel = Math.max(0, Math.min(PET_BREAKTHROUGH_MAX_LEVEL, Math.round(level)))
            petLevelTaken = true
        }
    }
    if (!migrated) return
    settings.buffs = remaining
    settings.traits = traits
}

/** 单个构筑位的 BUFF 过滤上下文 */
interface SideBuffContexts {
    /** 本位角色 / 武器 + （仅主控）其他构筑位的「(队友)」武器 */
    own: BuffSelectContext
}

/**
 * 构建单个构筑位的 BUFF 过滤上下文：
 * - 本位角色与武器 → `mainIds`（限定 / 角色来源 / 5熔武器 BUFF 只认本位）；
 * - 主控额外把其他构筑位的角色与武器作为 `phantomIds`（「(队友)」武器 / 协战角色 BUFF 计入主控）；
 * - 协战不接收队友来源 BUFF，避免同一来源在三段里重复叠加。
 * @param settings 构筑设置（含三侧 loadout）
 * @param side 构筑位
 * @returns 本位上下文
 */
function createSideBuffContexts(settings: TranscendBuildSettings, side: TranscendSlotGroup): SideBuffContexts {
    const own: number[] = []
    const others: number[] = []
    const elements: string[] = []
    for (const key of ["main", "assist1", "assist2"] as const) {
        const loadout = sanitizeSideLoadout(settings[key])
        if (!loadout) continue
        const char = charMap.get(loadout.charId)
        const ids = [loadout.charId, loadout.meleeWeapon, loadout.rangedWeapon].filter(id => id > 0)
        if (key === side) {
            own.push(...ids)
            if (char?.属性) elements.push(char.属性)
        } else {
            others.push(...ids)
        }
    }
    return {
        own: {
            charElm: elements[0] ?? "",
            mainIds: new Set(own),
            phantomIds: new Set(side === "main" ? others : []),
            elements: new Set(elements),
        },
    }
}

/**
 * 判断 BUFF 是否可注入该构筑位：排除魔之楔提供与魔灵 / 潜质相关 BUFF
 * （后者由 joint 字段注入，避免重复），再按本位上下文（主控额外含队友来源）过滤。
 * @param name BUFF 名称
 * @param contexts 本位上下文
 * @returns BUFF 数据；不可注入时为 null
 */
function resolveManualBuff(name: string, contexts: SideBuffContexts): Buff | null {
    if (isPetRelatedBuffName(name)) return null
    const buff = buffMap.get(name)
    if (!buff || isModProvidedBuff(buff)) return null
    return isBuffSelectable(buff, contexts.own) ? buff : null
}

/**
 * 解析某构筑位实际注入的手动 BUFF（等级 / 覆盖率按配置）。
 * 自定义 BUFF 按 `settings.customBuff` 现场构造，与原构筑页同一口径，只注入主控。
 * @param settings 构筑设置
 * @param side 构筑位
 * @param charId 该侧角色 id（属于本侧角色的旧 `*溯` 条目已由溯源区接管）
 * @returns 等级化 BUFF 列表
 */
function resolveSideManualBuffs(settings: TranscendBuildSettings, side: TranscendSlotGroup, charId: number): LeveledBuff[] {
    const list = normalizeBuffList(settings.buffs)
    if (!list.length) return []
    const contexts = createSideBuffContexts(settings, side)
    const customBuff = normalizeCustomBuff(settings.customBuff)
    const result: LeveledBuff[] = []
    for (const [name, level, coverage] of list) {
        if (name === CUSTOM_BUFF_NAME) {
            if (side === "main") result.push(createCustomBuff(customBuff, level, coverage ?? 1))
            continue
        }
        // 已由溯源区接管且属于本侧角色的旧 `*溯` 条目不再注入（避免与溯源区双计）
        if (isOwnLegacyTraceBuff(name, charId)) continue
        const buff = resolveManualBuff(name, contexts)
        if (!buff) continue
        const leveled = new LeveledBuff(buff, level)
        if (coverage !== undefined) leveled.coverage = coverage
        result.push(leveled)
    }
    return result
}

/** joint 字段注入主控构筑的结果 */
interface TranscendJointInjection {
    /** 潜质 BUFF + 魔灵被动 / 主动技 BUFF */
    buffs: LeveledBuff[]
    customBuff: [string, number][]
    petBaseCd: number
}

/**
 * 把 joint 字段（魔灵 / 潜质）解析为构筑注入项，与原版 `createCharBuildFromSettings` 同一口径：
 * 生效技能等级 = 突破等级 + 潜质加成，主动技覆盖率按自动 / 手动模式折算。
 * @param settings 构筑设置
 * @returns 注入项
 */
function resolveJointInjection(settings: TranscendBuildSettings): TranscendJointInjection {
    const traits = normalizeJointTraits(settings.traits)
    const petId = Number.isFinite(settings.petId) ? Math.max(0, Math.round(settings.petId)) : 0
    const petLevel = clampInt(settings.petLevel, 0, PET_BREAKTHROUGH_MAX_LEVEL, PET_BREAKTHROUGH_MAX_LEVEL)
    const effectiveLevel = getEffectivePetLevel(petLevel, traits)
    const coverage = resolvePetCoverage(
        petId,
        effectiveLevel,
        traits,
        clampNumber(settings.petCoverage, 0, 1, 1),
        settings.petAutoCoverage !== false
    )
    return {
        buffs: [...collectTraitBuffs(traits), ...collectPetBuffs(petId, effectiveLevel, coverage)],
        customBuff: normalizeCustomBuff(settings.customBuff),
        petBaseCd: getPetBaseCd(petId),
    }
}

/**
 * 归一化单个 loadout：钳制等级/精炼/技能，按需净化角色/武器 id，角色无效或显式禁用时关闭。
 * 目标表达式与自定义变量优先取构位自己的值；旧存档 / 未归一化输入缺字段或类型非法时回退到旧全局值。
 * @param input 原始 loadout
 * @param base 缺省值（字段缺失时沿用）
 * @param legacy 旧版全局目标表达式 / 自定义变量
 * @param preserve 是否保留数据表里不存在的 id
 * @returns 归一化后的 loadout
 */
function normalizeSideLoadout(
    input: unknown,
    base: TranscendSideLoadout,
    legacy: TranscendSideExpressions,
    preserve: boolean
): TranscendSideLoadout {
    const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Partial<TranscendSideLoadout>) : {}
    const charId = normalizeRefId(raw.charId, base.charId, id => charMap.has(id), charMap.size === 0, preserve, 0)
    // 旧溯级与关闭列表保持同一口径：溯级取最高激活根源（序列化省略空列表后可安全迁移）
    const traceOffRoots = resolveTraceOffRoots(raw.traceOffRoots, raw.traceLevel ?? base.traceLevel, charId)
    return {
        charId,
        charLevel: clampInt(raw.charLevel, 1, CHAR_LEVEL_MAX, base.charLevel),
        charSkillLevel: normalizeCharSkillLevels(raw.charSkillLevel ?? base.charSkillLevel),
        traceLevel: resolveHighestActiveRoot(traceOffRoots, charId),
        traceOffRoots,
        traceStacks: normalizeTraceStacks(raw.traceStacks, charId),
        meleeWeapon: normalizeRefId(raw.meleeWeapon, base.meleeWeapon, id => weaponMap.has(id), weaponMap.size === 0, preserve, 0),
        meleeWeaponLevel: clampInt(raw.meleeWeaponLevel, 1, WEAPON_LEVEL_MAX, base.meleeWeaponLevel),
        meleeWeaponRefine: clampInt(raw.meleeWeaponRefine, 0, WEAPON_REFINE_MAX, base.meleeWeaponRefine),
        rangedWeapon: normalizeRefId(raw.rangedWeapon, base.rangedWeapon, id => weaponMap.has(id), weaponMap.size === 0, preserve, 0),
        rangedWeaponLevel: clampInt(raw.rangedWeaponLevel, 1, WEAPON_LEVEL_MAX, base.rangedWeaponLevel),
        rangedWeaponRefine: clampInt(raw.rangedWeaponRefine, 0, WEAPON_REFINE_MAX, base.rangedWeaponRefine),
        extraMastery: normalizeExtraMastery(raw.extraMastery, base.extraMastery, charId),
        baseName: typeof raw.baseName === "string" ? raw.baseName : base.baseName,
        targetFunction: typeof raw.targetFunction === "string" ? raw.targetFunction : legacy.targetFunction,
        customVariables: Array.isArray(raw.customVariables)
            ? normalizeCustomVariables(raw.customVariables)
            : cloneCustomVariables(legacy.customVariables),
        dotSettings: normalizeDotSettings(raw.dotSettings, base.dotSettings),
        // 三段都可禁用：显式 false 或角色无效时不参与合计（旧存档主控缺 enabled 时为 true）
        enabled: raw.enabled !== false && charId > 0,
    }
}

/**
 * 归一化独立升华构筑设置：钳制等级/技能/精炼并补齐结构，装备走 `normalizeTranscendSettings`。
 * 兼容 v1（平铺词条）与 v2（完整物品配置）：数据表可用时 v1 自动迁移为 v2 物品，
 * 数据表为空（安全模式 / 缺包）时保留 v1 条目，下次加载重试；草案阶段不写版本号字段。
 *
 * 两种口径（见 `TranscendNormalizeOptions.preserveUnknownIds`）：
 * - 读取 / 持久化（`preserveUnknownIds: true`）：未知 char / weapon / enemy id 原样保留；
 * - 计算前（默认）：严格净化，未知引用清零 / 回退到默认目标。
 * 数据表为空（安全模式隐藏全部数据、数据包缺失）时两种口径都保留原 id。
 * @param input 原始设置（可缺失 / 旧版本 / 脏数据）
 * @param datasets 升华归一化数据源（缺省读静态数据）
 * @param options 归一化选项
 * @returns 结构完整的构筑设置
 */
export function normalizeTranscendBuildSettings(
    input: unknown,
    datasets?: TranscendNormalizeDatasets,
    options?: TranscendNormalizeOptions
): TranscendBuildSettings {
    const base = createDefaultTranscendBuildSettings(0)
    if (!input || typeof input !== "object" || Array.isArray(input)) return base
    const preserve = options?.preserveUnknownIds === true
    const raw = input as Partial<TranscendBuildSettings>
    // 旧存档 / 旧分享只有顶层全局值：作为各构筑位缺字段时的迁移来源
    const legacy: TranscendSideExpressions = {
        targetFunction: typeof raw.targetFunction === "string" ? raw.targetFunction : "",
        customVariables: normalizeCustomVariables(raw.customVariables),
    }
    const main = normalizeSideLoadout(raw.main, base.main, legacy, preserve)
    const normalized: TranscendBuildSettings = {
        main,
        assist1: normalizeSideLoadout(raw.assist1, base.assist1, legacy, preserve),
        assist2: normalizeSideLoadout(raw.assist2, base.assist2, legacy, preserve),
        transcend: normalizeTranscendSettings(raw.transcend, datasets),
        buffs: normalizeBuffList(raw.buffs),
        petId: normalizeRefId(raw.petId, base.petId, id => petMap.has(id), petMap.size === 0, preserve, 0),
        petLevel: clampInt(raw.petLevel, 0, PET_BREAKTHROUGH_MAX_LEVEL, base.petLevel),
        petCoverage: clampNumber(raw.petCoverage, 0, 1, base.petCoverage),
        petAutoCoverage: raw.petAutoCoverage !== false,
        traits: normalizeJointTraits(raw.traits),
        customBuff: normalizeCustomBuff(raw.customBuff),
        // 顶层镜像主控值：旧读者（分享展示 / 旧界面）仍读到合理值，计算一律用各构筑位自己的值
        targetFunction: main.targetFunction,
        customVariables: cloneCustomVariables(main.customVariables),
        enemyId: normalizeEnemyId(raw.enemyId, preserve),
        enemyLevel: clampInt(raw.enemyLevel, 1, MaxMonsterLevelLimit, DEFAULT_ENEMY_LEVEL),
        enemyResistance: Number.isFinite(raw.enemyResistance) ? (raw.enemyResistance as number) : 0,
        hpPercent: clampNumber(raw.hpPercent, 0, 1, 1),
        resonanceGain: clampNumber(raw.resonanceGain, 0, Number.MAX_SAFE_INTEGER, DEFAULT_RESONANCE_GAIN),
        imbalance: raw.imbalance === true,
    }
    // 旧存档里勾选的魔灵 / 潜质 BUFF 搬进 joint 字段后从 BUFF 列表移除，避免与注入项重复
    migrateLegacyPetBuffs(normalized)
    return normalized
}

/**
 * 持久化装备组：物品只保留可复现源字段（展示快照与派生字段由读取端归一化重建），
 * v1 平铺条目（安全模式残留）原样保留。
 * @param group 装备组
 * @returns 裁剪后的装备组
 */
function compactGearGroup(group: TranscendGearGroup): TranscendGearGroup {
    return group.map(entry => (isEquippedGear(entry) ? { slotId: entry.slotId, item: toStoredGearItem(entry.item) } : entry))
}

/**
 * 持久化装备变体：三组装备统一裁剪为源字段。
 * @param variant 装备变体
 * @returns 裁剪后的变体
 */
function compactGearVariant(variant: TranscendGearVariant): TranscendGearVariant {
    return {
        id: variant.id,
        mainGear: compactGearGroup(variant.mainGear),
        assist1Gear: compactGearGroup(variant.assist1Gear),
        assist2Gear: compactGearGroup(variant.assist2Gear),
    }
}

/**
 * 紧凑 loadout：空的层数设置不写入（缺省即全部按 mx 满层）。
 * @param loadout 归一化后的 loadout
 * @returns 裁剪后的 loadout
 */
function compactSideLoadout(loadout: TranscendSideLoadout): TranscendSideLoadout {
    if (loadout.traceStacks?.length) return loadout
    const rest = { ...loadout }
    delete rest.traceStacks
    return rest
}

/**
 * 生成可逆的紧凑持久化形状：归一化保证顶层三组装备与激活变体是同一份，
 * 置空顶层组后读取时由激活变体恢复；避免 16 槽 × 3 变体满配时 JSON 超出服务端 40,000 字符上限。
 * 三组装备与全部变体的物品同时裁剪为可复现源字段。
 * @param settings 待持久化 / 分享的构筑设置（可含脏数据）
 * @returns 顶层装备为空、物品只含源字段的紧凑设置（激活变体保留全部装备）
 */
export function compactTranscendBuildSettings(settings: unknown): TranscendBuildSettings {
    const normalized = normalizeTranscendBuildSettings(settings, undefined, { preserveUnknownIds: true })
    const transcend: TranscendSettings = {
        ...normalized.transcend,
        mainGear: compactGearGroup(normalized.transcend.mainGear),
        assist1Gear: compactGearGroup(normalized.transcend.assist1Gear),
        assist2Gear: compactGearGroup(normalized.transcend.assist2Gear),
        gearVariants: normalized.transcend.gearVariants.map(compactGearVariant),
    }
    const sides = {
        main: compactSideLoadout(normalized.main),
        assist1: compactSideLoadout(normalized.assist1),
        assist2: compactSideLoadout(normalized.assist2),
    }
    if (!getActiveGearVariant(transcend)) return { ...normalized, ...sides, transcend }
    return {
        ...normalized,
        ...sides,
        transcend: { ...transcend, mainGear: [], assist1Gear: [], assist2Gear: [] },
    }
}

/**
 * 序列化独立升华构筑设置（本地持久化格式：紧凑形状 + 保留未知 id，数据缺失时不丢配置）。
 * 顶层装备组可由激活变体恢复，序列化时不重复写入。
 * @param settings 待序列化的设置
 * @returns JSON 文本
 */
export function serializeTranscendBuildSettings(settings: unknown): string {
    return JSON.stringify(compactTranscendBuildSettings(settings))
}

/** 分享 JSON 的类型标记（避免把任意 JSON 当成构筑导入） */
export const TRANSCEND_BUILD_SHARE_KIND = "dna-builder/transcend-build"

/** 分享 / 导入结果 */
export interface TranscendBuildSharePayload {
    /** 分享内容里的主控角色 id（0 表示未选择） */
    charId: number
    /** 归一化后的构筑设置（保留未知 id，便于跨版本导入） */
    settings: TranscendBuildSettings
}

/**
 * 生成分享 JSON：带类型标记与版本号，内容为保留未知 id 的归一化设置。
 * 仅本地导出 / 导入，不经服务端。
 * @param settings 构筑设置
 * @returns JSON 文本
 */
export function createTranscendBuildShare(settings: unknown): string {
    const normalized = compactTranscendBuildSettings(settings)
    return JSON.stringify({
        kind: TRANSCEND_BUILD_SHARE_KIND,
        charId: normalized.main.charId,
        settings: normalized,
    })
}

/**
 * 解析分享 JSON：兼容带标记的分享包与裸构筑设置；非法 / 非构筑内容返回 null。
 * 解析结果保留未知 id，由调用方决定是否替换当前构筑。
 * @param text 剪贴板 / 文件内容
 * @returns 分享内容；无法解析时为 null
 */
export function parseTranscendBuildShare(text: string): TranscendBuildSharePayload | null {
    if (typeof text !== "string" || !text.trim()) return null
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return null
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const container = parsed as { kind?: unknown; settings?: unknown }
    const raw = container.kind === TRANSCEND_BUILD_SHARE_KIND ? container.settings : parsed
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
    const candidate = raw as { main?: unknown; transcend?: unknown; enemyId?: unknown; buffs?: unknown }
    // 至少要有 loadout 结构，避免把任意对象归一化成一份空构筑
    if (!candidate.main || typeof candidate.main !== "object") return null
    const settings = normalizeTranscendBuildSettings(candidate, undefined, { preserveUnknownIds: true })
    return { charId: settings.main.charId, settings }
}

/**
 * 防御性 loadout 形状归一化：只补齐结构与数值范围，不净化 id（未知 id 由 `createTranscendBuild` 判为不可构建）。
 * 目标表达式 / 自定义变量按「本位 → legacy 顶层旧值 → 默认空值」回退。
 * @param input 原始 loadout（可能残缺 / 脏数据）
 * @param legacy 旧版全局目标表达式 / 自定义变量
 * @returns 结构完整的 loadout；形状不是对象时为 null
 */
function sanitizeSideLoadout(input: unknown, legacy: TranscendSideExpressions = EMPTY_SIDE_EXPRESSIONS): TranscendSideLoadout | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null
    const raw = input as Partial<TranscendSideLoadout>
    const charId = toId(raw.charId)
    const traceOffRoots = resolveTraceOffRoots(raw.traceOffRoots, raw.traceLevel, charId)
    return {
        charId,
        charLevel: clampInt(raw.charLevel, 1, CHAR_LEVEL_MAX, CHAR_LEVEL_MAX),
        charSkillLevel: normalizeCharSkillLevels(raw.charSkillLevel),
        traceLevel: resolveHighestActiveRoot(traceOffRoots, charId),
        traceOffRoots,
        traceStacks: normalizeTraceStacks(raw.traceStacks, charId),
        meleeWeapon: toId(raw.meleeWeapon),
        meleeWeaponLevel: clampInt(raw.meleeWeaponLevel, 1, WEAPON_LEVEL_MAX, WEAPON_LEVEL_MAX),
        meleeWeaponRefine: clampInt(raw.meleeWeaponRefine, 0, WEAPON_REFINE_MAX, WEAPON_REFINE_MAX),
        rangedWeapon: toId(raw.rangedWeapon),
        rangedWeaponLevel: clampInt(raw.rangedWeaponLevel, 1, WEAPON_LEVEL_MAX, WEAPON_LEVEL_MAX),
        rangedWeaponRefine: clampInt(raw.rangedWeaponRefine, 0, WEAPON_REFINE_MAX, WEAPON_REFINE_MAX),
        extraMastery: typeof raw.extraMastery === "string" ? raw.extraMastery.trim() : "",
        baseName: typeof raw.baseName === "string" ? raw.baseName : "",
        targetFunction: typeof raw.targetFunction === "string" ? raw.targetFunction : legacy.targetFunction,
        customVariables: Array.isArray(raw.customVariables)
            ? normalizeCustomVariables(raw.customVariables)
            : cloneCustomVariables(legacy.customVariables),
        dotSettings: normalizeDotSettings(raw.dotSettings, defaultDotFrequencySettings),
        enabled: raw.enabled !== false && charId > 0,
    }
}

/**
 * 按构筑位构建 CharBuild：注入该位的升华装备（主控额外含天赋）与技能等级增量，
 * 主控再加 joint 字段（魔灵 / 潜质 / 自定义 BUFF）。
 * 不传 MOD / 队伍 / 时间轴（升华玩法没有这些内容）；魔灵 / 潜质只挂主控，协战不继承。
 *
 * 前置条件：`settings` 可来自归一化结果，也可为未归一化的存档数据（函数内部做形状归一化）；
 * 但引用必须存在于当前数据表——未知角色或未知/非法武器一律返回 null 而不是抛错。
 * 环境参数（敌人 / 血量 / 回响）按严格口径净化，未知怪物回退默认目标。
 * @param settings 升华构筑设置（可缺失 / 脏数据）
 * @param side 构筑位（主控 / 协战一 / 协战二）
 * @returns 构筑实例与解析告警 / 建模说明；该位角色或武器非法时为 null
 */
export function createTranscendBuild(
    settings: TranscendBuildSettings | null | undefined,
    side: TranscendSlotGroup = "main"
): TranscendSideBuild | null {
    if (!settings || typeof settings !== "object") return null
    // 未归一化输入（旧存档 / 旧分享 / 直接构造）缺 per-side 字段时回退到顶层旧值
    const legacy: TranscendSideExpressions = {
        targetFunction: typeof settings.targetFunction === "string" ? settings.targetFunction : "",
        customVariables: normalizeCustomVariables(settings.customVariables),
    }
    const loadout = sanitizeSideLoadout(settings[side], legacy)
    if (!loadout) return null
    // 未知角色 / 武器会让引擎抛错：与未知角色一致返回 null，交给调用方按「该段不可计算」处理
    if (!charMap.has(loadout.charId)) return null
    if (loadout.meleeWeapon > 0 && !weaponMap.has(loadout.meleeWeapon)) return null
    if (loadout.rangedWeapon > 0 && !weaponMap.has(loadout.rangedWeapon)) return null
    const char = LeveledCharHelper.fromId(loadout.charId, loadout.charLevel)
    // 队友限定增益按三侧上下文跨位注入：三侧统一走 `sanitizeSideLoadout`（数字字符串 charId 与当前侧同口径）
    const teamSides = buildTranscendTeamSides({
        main: side === "main" ? loadout : sanitizeSideLoadout(settings.main, legacy),
        assist1: side === "assist1" ? loadout : sanitizeSideLoadout(settings.assist1, legacy),
        assist2: side === "assist2" ? loadout : sanitizeSideLoadout(settings.assist2, legacy),
    })
    // 天赋只给主控，协战只吃自己组装备（由 collectTranscendEffects 保证）
    const effects = collectTranscendEffects(settings.transcend, side, {
        charElement: char.属性,
        charId: loadout.charId,
        teamSides,
    })
    // 溯源按每侧激活集合（关闭列表）自动生成；该模型没有 per-side BUFF 列表，requiresBuff 统一读全局手选列表
    const sharedBuffNames = (Array.isArray(settings.buffs) ? settings.buffs : []).map(entry => entry[0])
    // 规则判定 `skillLevel` 条件时按需取三侧升华技能等级增量：按各侧装备三键 attrs 预解析（与引擎同值）
    const transcendSkillLevelBonus = (target: TranscendSlotGroup): CharSkillLevels => {
        const context = teamSides.find(item => item.side === target)
        if (context?.charId === undefined) return [0, 0, 0]
        return resolveTranscendSkillLevelAttrs(settings.transcend, target, {
            charId: context.charId,
            charElement: context.charElement,
        })
    }
    const trace = collectTraceEffects(settings, side, {
        charId: loadout.charId,
        teamSides,
        buffNames: { main: sharedBuffNames, assist1: sharedBuffNames, assist2: sharedBuffNames },
        transcendSkillLevelBonus,
    })
    // 手动 BUFF 按该构筑位的角色 / 武器上下文过滤；魔灵 / 潜质 / 自定义 BUFF 只挂主控；
    // 溯源规则的字段覆盖作用于同名手动 BUFF（名称 / 身份不变）
    const manualBuffs = applyTraceBuffOverrides(resolveSideManualBuffs(settings, side, loadout.charId), trace.buffOverrides)
    const joint = side === "main" ? resolveJointInjection(settings) : null
    const build = new CharBuild({
        char,
        melee: LeveledWeaponHelper.fromId(loadout.meleeWeapon, loadout.meleeWeaponRefine, loadout.meleeWeaponLevel),
        ranged: LeveledWeaponHelper.fromId(loadout.rangedWeapon, loadout.rangedWeaponRefine, loadout.rangedWeaponLevel),
        // 只传基础等级：装备 / 溯源技能等级随各自合成 BUFF 进入属性池，由 CharBuild 二次解析
        skillLevel: loadout.charSkillLevel,
        buffs: [...manualBuffs, ...(joint?.buffs ?? []), ...trace.buffs, ...effects.buffs],
        skillReplacements: effects.skillReplacements,
        customBuff: joint?.customBuff ?? [],
        petBaseCd: joint?.petBaseCd ?? 0,
        baseName: loadout.baseName,
        extraMastery: loadout.extraMastery,
        // 各构筑位自己的表达式与变量（逐条复制的独立副本，页面后续替换设置项不会改动构筑实例）
        customVariables: loadout.customVariables,
        imbalance: settings.imbalance === true,
        hpPercent: clampNumber(settings.hpPercent, 0, 1, 1),
        resonanceGain: clampNumber(settings.resonanceGain, 0, Number.MAX_SAFE_INTEGER, DEFAULT_RESONANCE_GAIN),
        enemyId: normalizeEnemyId(settings.enemyId, false),
        enemyLevel: clampInt(settings.enemyLevel, 1, MaxMonsterLevelLimit, DEFAULT_ENEMY_LEVEL),
        enemyResistance: Number.isFinite(settings.enemyResistance) ? (settings.enemyResistance as number) : 0,
        targetFunction: loadout.targetFunction,
        dotSettings: loadout.dotSettings,
    })
    return {
        side,
        charId: loadout.charId,
        build,
        warnings: effects.warnings,
        modelingNotes: effects.modelingNotes,
    }
}

/**
 * 构建已启用的主控与协战，并合计三段伤害。
 * 未启用 / 角色无效的段返回 null 且不参与合计（启用判断对三段一致，主控也可禁用）。
 * @param settings 升华构筑设置
 * @returns 三段构筑与合计伤害
 */
export function buildTranscendTeam(settings: TranscendBuildSettings | null | undefined): TranscendTeamBuild {
    const normalized = normalizeTranscendBuildSettings(settings)
    const buildSide = (side: TranscendSlotGroup) => (normalized[side].enabled ? createTranscendBuild(normalized, side) : null)
    const main = buildSide("main")
    const assist1 = buildSide("assist1")
    const assist2 = buildSide("assist2")
    return {
        main,
        assist1,
        assist2,
        total: calculateTeamTotal([main?.build, assist1?.build, assist2?.build]),
    }
}
