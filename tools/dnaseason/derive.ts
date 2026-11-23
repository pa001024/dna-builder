/**
 * 升华（DNASeason）导入期派生逻辑。
 *
 * 输入是上游 `final/i18n/cn/DNASeason*.json` 的原始结构与 `spawnUnits` 索引，
 * 输出可直接写入 `packages/data/d/dnaseason*.data.ts` 的纯 JSON 值。
 * 本文件不读文件、不依赖 Bun，供导入器与测试共用。
 */

type Json = Record<string, any>

export interface DnaSeasonSource {
    season: Json
    equip: Json
    progress: Json
    rift: Json
    /** spawnId → UnitId[]，由 `buildSpawnUnits` 生成。 */
    spawnUnits: Record<number, number[]>
}

export interface DnaSeasonModules {
    dnaseason: Record<string, unknown>
    dnaseasonequip: Record<string, unknown>
    dnaseasonprogress: Record<string, unknown>
    dnaseasonrift: Record<string, unknown>
    warnings: string[]
}

/** 4 个上游聚合 JSON 的必需顶层键；缺一个就可能在派生过程中报 TypeError。 */
const REQUIRED_TOP_LEVEL_KEYS: Record<keyof Omit<DnaSeasonSource, "spawnUnits">, readonly string[]> = {
    season: [
        "seasons",
        "tiers",
        "buffTypes",
        "buffLevels",
        "dropBonuses",
        "resources",
        "resourceTabs",
        "bagTabs",
        "stashTabs",
        "commissionTiers",
        "nestBosses",
        "equipConstants",
        "globalConstants",
    ],
    equip: [
        "slotTypes",
        "craftTypes",
        "slots",
        "rarities",
        "powerTiers",
        "namePrefixes",
        "baseNames",
        "uniqueEquips",
        "generateGroups",
        "crafts",
        "breakdowns",
        "affixPools",
        "affixLevels",
        "affixes",
        "inlays",
    ],
    progress: ["talentTypes", "stages", "levels", "talentTrees", "talentMenus", "talentLevelUpCosts", "talents"],
    rift: ["seasons", "eliteMonsterIds", "floors", "rankConfigs", "rankRewards", "rankRoles", "challenges", "monsterScores", "globals"],
}

const SOURCE_FILE_NAMES: Record<keyof typeof REQUIRED_TOP_LEVEL_KEYS, string> = {
    season: "DNASeason.json",
    equip: "DNASeasonEquip.json",
    progress: "DNASeasonProgress.json",
    rift: "DNASeasonRift.json",
}

/** 派生前检查上游 JSON 形状；历史版本导出空表时给明确错误，而非中途 TypeError。 */
function validateSource(source: DnaSeasonSource): void {
    for (const [name, keys] of Object.entries(REQUIRED_TOP_LEVEL_KEYS) as Array<
        [keyof typeof REQUIRED_TOP_LEVEL_KEYS, readonly string[]]
    >) {
        const json = source[name]
        if (!json || typeof json !== "object" || Array.isArray(json)) {
            throw new Error(`${SOURCE_FILE_NAMES[name]} 顶层不是对象，无法导入升华数据（检查上游 final/i18n/cn 产物）`)
        }
        const missing = keys.filter(key => json[key] === undefined)
        if (missing.length > 0) {
            throw new Error(
                `${SOURCE_FILE_NAMES[name]} 缺少必需顶层键：${missing.join("、")}（检查上游 final/i18n/cn 产物或 -v 版本是否包含 DNASeason）`
            )
        }
        const wrongShape = keys.filter(key => {
            const value = json[key]
            const arrayLike = [
                "seasons",
                "tiers",
                "buffTypes",
                "buffLevels",
                "dropBonuses",
                "resources",
                "resourceTabs",
                "bagTabs",
                "stashTabs",
                "commissionTiers",
                "nestBosses",
                "equipConstants",
                "slots",
                "rarities",
                "powerTiers",
                "namePrefixes",
                "baseNames",
                "uniqueEquips",
                "generateGroups",
                "crafts",
                "breakdowns",
                "affixPools",
                "affixLevels",
                "affixes",
                "inlays",
                "stages",
                "levels",
                "talentTrees",
                "talentMenus",
                "talentLevelUpCosts",
                "talents",
                "eliteMonsterIds",
                "floors",
                "rankConfigs",
                "rankRewards",
                "rankRoles",
                "challenges",
                "monsterScores",
            ]
            return arrayLike.includes(key) ? !Array.isArray(value) : !value || typeof value !== "object" || Array.isArray(value)
        })
        if (wrongShape.length > 0) {
            throw new Error(`${SOURCE_FILE_NAMES[name]} 顶层键形态不符：${wrongShape.join("、")}（检查上游 final/i18n/cn 产物）`)
        }
    }

    // 必需键齐全但数组全空同样是坏源（历史版本 / 未导出的空表），提前报错避免生成空数据文件。
    const minimumCounts: Array<[keyof typeof REQUIRED_TOP_LEVEL_KEYS, string, number]> = [
        ["season", "seasons", 1],
        ["equip", "affixes", 1],
        ["rift", "floors", 1],
    ]
    for (const [name, key, minimum] of minimumCounts) {
        const value = source[name][key]
        if (!Array.isArray(value) || value.length < minimum) {
            throw new Error(`${SOURCE_FILE_NAMES[name]} 的 ${key} 为空（至少 ${minimum} 条），拒绝导入空表`)
        }
    }
    if (!source.spawnUnits || typeof source.spawnUnits !== "object" || Object.keys(source.spawnUnits).length === 0) {
        throw new Error("MonsterSpawn 刷怪组索引为空（至少 1 条），拒绝导入空表（检查上游 Script/Datas/MonsterSpawn.lua）")
    }
}

/** 词条方案名：上游只给 PlanId，没有官方文本，按词条语义在本地派生。 */
const PLAN_NAMES: Record<number, string> = {
    1: "基础词缀",
    2: "随机词缀",
    3: "技能等级",
    4: "专属词缀",
}

/** 按数值字段升序排序（返回新数组，不修改输入）。 */
function sortByNumber<T>(rows: T[], key: (row: T) => number): T[] {
    return [...rows].sort((left, right) => key(left) - key(right))
}

/** 按字符串字段升序排序（返回新数组）。 */
function sortByString<T>(rows: T[], key: (row: T) => string | number): T[] {
    return [...rows].sort((left, right) => (key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0))
}

/** 数字键对象按数值升序重排；值原样保留。 */
function sortNumericRecord<T>(input: Record<string, T> | undefined): Record<string, T> | undefined {
    if (!input) {
        return undefined
    }
    const output: Record<string, T> = {}
    for (const key of Object.keys(input).sort((left, right) => Number(left) - Number(right))) {
        output[key] = input[key]
    }
    return output
}

/** 任意键对象按字典序重排。 */
function sortKeyedRecord<T>(input: Record<string, T> | undefined): Record<string, T> | undefined {
    if (!input) {
        return undefined
    }
    const output: Record<string, T> = {}
    for (const key of Object.keys(input).sort()) {
        output[key] = input[key]
    }
    return output
}

/** 去重后升序。 */
function uniqSorted(values: number[] | undefined): number[] | undefined {
    return values ? [...new Set(values)].sort((left, right) => left - right) : undefined
}

/**
 * 单条技能替换（MOD `技能替换` 同形）：id 有限数字、名称非空字符串、字段为数组。
 * `类型` 允许上游省略（目标技能既无 SkillBtnDesc 也无 SkillType 招式名时），按空串透传，
 * 消费侧回落源技能类型；类型存在但不是字符串才丢弃。形态不对不猜测、不修补，由调用方告警。
 */
function normalizeSkillReplacement(value: unknown): { entry?: Json; error?: string } {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { error: "不是对象" }
    }
    const row = value as Json
    if (typeof row.id !== "number" || !Number.isFinite(row.id)) {
        return { error: "id 不是有限数字" }
    }
    if (typeof row.名称 !== "string" || row.名称 === "") {
        return { error: "名称不是非空字符串" }
    }
    if (row.类型 !== undefined && typeof row.类型 !== "string") {
        return { error: "类型不是字符串" }
    }
    if (row.字段 !== undefined && !Array.isArray(row.字段)) {
        return { error: "字段不是数组" }
    }
    const entry: Json = { id: row.id, 名称: row.名称, 类型: row.类型 ?? "" }
    if (row.字段 !== undefined) {
        entry.字段 = row.字段
    }
    return { entry }
}

/** 校验上游 skillReplacements：外层键为有限数字原技能 id；非法条目丢弃并告警。 */
export function normalizeSkillReplacements(value: unknown, affixId: number, warnings: string[]): Record<string, Json> | undefined {
    if (value === undefined) {
        return undefined
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        warnings.push(`词条 ${affixId} 的 skillReplacements 不是对象，已忽略`)
        return undefined
    }
    const output: Record<string, Json> = {}
    for (const [key, item] of Object.entries(value)) {
        const from = Number(key)
        if (key.trim() === "" || !Number.isFinite(from)) {
            warnings.push(`词条 ${affixId} 的 skillReplacements 键 ${key} 不是有限数字，已忽略`)
            continue
        }
        const result = normalizeSkillReplacement(item)
        if (!result.entry) {
            warnings.push(`词条 ${affixId} 的 skillReplacements[${key}] ${result.error}，已忽略`)
            continue
        }
        output[String(from)] = result.entry
    }
    const sorted = sortNumericRecord(output)
    return sorted && Object.keys(sorted).length > 0 ? sorted : undefined
}

/**
 * 校验上游导出器给出的适用角色 id：只接受非空的正整数数组。
 * 缺失由调用方跳过；非法值不猜测、不修补，交由调用方告警并丢弃。
 */
export function normalizeCharIds(value: unknown): { ids?: number[]; error?: string } {
    if (!Array.isArray(value)) {
        return { error: "不是数组" }
    }
    if (value.length === 0) {
        return { error: "空数组" }
    }
    if (!value.every(item => typeof item === "number" && Number.isInteger(item) && item > 0)) {
        return { error: "包含非正整数" }
    }
    return { ids: [...new Set(value)].sort((left, right) => left - right) }
}

/** 选择固定字段，其余字段丢弃（用于 globalConstants / globals 这类标量表）。 */
function pickRecord(input: Json, keys: string[], warnings: string[], label: string): Json {
    const output: Json = {}
    for (const key of [...keys].sort()) {
        if (input[key] !== undefined) {
            output[key] = input[key]
        } else {
            warnings.push(`${label} 缺少字段 ${key}`)
        }
    }
    for (const key of Object.keys(input).sort()) {
        if (!keys.includes(key)) {
            warnings.push(`${label} 出现未登记字段 ${key}，已忽略`)
        }
    }
    return output
}

function deriveSeasonModule(source: Json, warnings: string[]): Record<string, unknown> {
    const seasons = source.seasons.map((season: Json) => ({
        ...season,
        questPhases: season.questPhases.map((phase: Json) => ({
            ...phase,
            quests: sortByNumber(phase.quests, (quest: Json) => quest.id),
        })),
        commissions: sortByNumber(season.commissions, (commission: Json) => commission.sort),
    }))

    const commissionTiers = sortByNumber(source.commissionTiers, (row: Json) => row.ruleId).map((row: Json) => ({
        ruleId: row.ruleId,
        tiers: sortByNumber(row.tiers, (tier: Json) => tier.tierId).map((tier: Json) => {
            const next: Json = { tierId: tier.tierId }
            const dropRewards = sortKeyedRecord(tier.dropRewards)
            if (dropRewards) {
                next.dropRewards = dropRewards
            }
            const dungeonRewards = uniqSorted(tier.dungeonRewards)
            if (dungeonRewards) {
                next.dungeonRewards = dungeonRewards
            }
            next.dungeonRewardView = tier.dungeonRewardView
            return next
        }),
    }))

    const globalConstants = pickRecord(
        source.globalConstants,
        ["DNASeasonSiftId", "DNASeasonTempBagMaxslot", "TalentTreeMobileVerticalOffset", "TalentTreeVerticalOffset"],
        warnings,
        "globalConstants"
    )

    return {
        rawSeasons: seasons,
        rawTiers: sortByNumber(source.tiers, (row: Json) => row.id),
        rawBuffTypes: sortByString(source.buffTypes, (row: Json) => row.id),
        rawBuffLevels: sortByNumber(source.buffLevels, (row: Json) => row.id),
        rawDropBonuses: sortByNumber(source.dropBonuses, (row: Json) => row.id),
        rawResources: uniqSorted(source.resources) ?? [],
        rawResourceTabs: sortByNumber(source.resourceTabs, (row: Json) => row.id),
        rawBagTabs: sortByNumber(source.bagTabs, (row: Json) => row.id),
        rawStashTabs: sortByNumber(source.stashTabs, (row: Json) => row.id),
        rawCommissionTiers: commissionTiers,
        rawNestBosses: sortByNumber(source.nestBosses, (row: Json) => row.dungeonId),
        rawEquipConstants: sortByNumber(source.equipConstants, (row: Json) => row.seasonId),
        rawGlobalConstants: globalConstants,
    }
}

/** Plan 4 词条映射状态：自动映射引擎属性（exact）或本地手写 buff（handwritten）。 */
export type Plan4MappingStatus = "exact" | "handwritten"

/**
 * Plan 4 的 addAttrs 精确映射白名单（与 `packages/data/transcend.ts` 的 `mapTranscendAttr` 对齐）。
 * U14 起上游直接输出规范名；白名单外的属性一律按 handwritten 处理并告警，避免静默标 exact。
 */
const PLAN4_EXACT_ATTRS = new Set([
    "攻击",
    "生命",
    "护盾",
    "防御",
    "神智",
    "技能威力",
    "技能效益",
    "技能耐久",
    "技能范围",
    "昂扬",
    "背水",
    "充盈威力",
    "神智回复",
    "近战增伤",
    "远程增伤",
    "技能伤害",
    "召唤物伤害",
    "属性穿透",
    "赛季增伤",
    "增伤",
    "减伤",
    "火属性增伤",
    "水属性增伤",
    "雷属性增伤",
    "风属性增伤",
    "光属性增伤",
    "暗属性增伤",
    // 元素弱点七键（U95）：与敌人抗性同区加算，上游 `<Element>DamagedRate` 按 exact 导出
    "火属性弱点",
    "水属性弱点",
    "雷属性弱点",
    "风属性弱点",
    "光属性弱点",
    "暗属性弱点",
    "全属性弱点",
    // 追伤七分量（U70）：元素写在键名里，与运行时 mapTranscendAttr 同口径按 exact 处理
    "火属性追伤",
    "水属性追伤",
    "雷属性追伤",
    "风属性追伤",
    "光属性追伤",
    "暗属性追伤",
    "自属性追伤",
])

/** 六元素攻击按 `<元素>属性攻击` 精确映射 */
const PLAN4_ELEMENT_ATTACKS = new Set(["水", "火", "风", "雷", "光", "暗"].map(element => `${element}属性攻击`))

/** 武器作用域属性：普通近战 / 普通远程 / 同律近战 / 同律远程 × 攻击 / 暴击 / 暴伤 / 触发 */
const PLAN4_WEAPON_ATTRS = new Set(
    ["普通近战", "普通远程", "同律近战", "同律远程"].flatMap(prefix => ["攻击", "暴击", "暴伤", "触发"].map(suffix => `${prefix}${suffix}`))
)

/** 只有展示口径的属性：可映射到引擎属性名，但不参与伤害计算 */
const PLAN4_HANDWRITTEN_ATTRS = new Set(["生命回复", "生命恢复增幅", "移动速度"])

/**
 * 元素限定属性：上游规范名不再单独携带元素，按手写部分覆盖处理。
 * 追伤自 U70 起按 `<元素>属性追伤` 分量输出，元素写在键名里，不再走折叠恢复；
 * 旧快照的字面 `追加伤害` 由运行时 `transcend.ts` 按 element 元数据迁移。
 */
const FOLDED_ELEMENT_ATTRS = new Set(["元素增伤"])
const PLAN4_ELEMENT_LIMITED_ATTRS = FOLDED_ELEMENT_ATTRS

/** 元素英文枚举 ↔ 中文名 */
const ELEMENT_ENUM_TO_CN: Record<string, string> = {
    Fire: "火",
    Water: "水",
    Thunder: "雷",
    Wind: "风",
    Light: "光",
    Dark: "暗",
}

/** 原型链键（`constructor` / `toString` 等）不得穿透为有效元素 */
function elementEnumToCn(value: unknown): string | undefined {
    return typeof value === "string" && Object.hasOwn(ELEMENT_ENUM_TO_CN, value) ? ELEMENT_ENUM_TO_CN[value] : undefined
}

/**
 * 折叠属性（元素增伤）的元素恢复，优先级与运行时一致：
 * `element` → `elementType` → `type`。
 * @param attr 上游属性节点
 * @returns 中文元素名；无法恢复时为 undefined
 */
export function recoverFoldedElement(attr: Json): string | undefined {
    for (const key of ["element", "elementType", "type"]) {
        const value = attr?.[key]
        const mapped = elementEnumToCn(value)
        if (mapped) return mapped
        if (typeof value === "string" && Object.values(ELEMENT_ENUM_TO_CN).includes(value)) return value
    }
    return undefined
}

/**
 * 元素增伤 必须能恢复元素：上游 `element` 或本地化文案变更时直接失败，
 * 避免导入出没有元素限定的数据（运行时只会丢弃，不会放大到全元素）。
 */
export function assertFoldedElements(source: Pick<DnaSeasonSource, "equip" | "progress">): void {
    const missing: string[] = []
    for (const affix of source.equip.affixes ?? []) {
        for (const attr of affix.addAttrs ?? []) {
            if (FOLDED_ELEMENT_ATTRS.has(attr?.attr) && !recoverFoldedElement(attr)) missing.push(`词条 ${affix.id}`)
        }
    }
    for (const talent of source.progress.talents ?? []) {
        for (const effect of talent.effects ?? []) {
            if (FOLDED_ELEMENT_ATTRS.has(effect?.attr) && !recoverFoldedElement(effect)) missing.push(`天赋 ${talent.id}`)
        }
    }
    if (missing.length > 0) {
        throw new Error(`元素增伤 无法恢复元素：${missing.join("、")}（检查上游 element 字段）`)
    }
}

/** 旧快照的 raw 伤害率键（含配置后缀）：运行时同样可落到具体规范名 */
const PLAN4_LEGACY_DAMAGE_RATE_KEYS = new Set([
    "DamageRate_Melee_Normal",
    "DamageRate_Ranged_Normal",
    "DamageRate_Skill_Normal",
    "DamageRate_Summon_Normal",
    "DamageRate_Almighty",
    "DamageRate_NoTag_S0DamageRate",
])

/** 旧快照兼容：U14 之前的引擎原始名（仅用于历史数据，不再作为新导出口径） */
const PLAN4_LEGACY_EXACT_ATTRS = new Set([
    "ATK",
    "MaxHp",
    "MaxES",
    "DEF",
    "MaxSp",
    "SkillIntensity",
    "SkillEfficiency",
    "SkillSustain",
    "SkillRange",
    "StrongValue",
    "EnmityValue",
    "HyperTriggerRate",
    "SpRecoverValue",
])

/** 旧快照兼容：武器 raw 属性必须带合法作用域后缀（`<Raw>_CMelee` 等），与运行时 `mapTranscendAttr` 一致 */
const PLAN4_LEGACY_WEAPON_ATTRS = new Set([
    "WeaponATKModifierRate",
    "WeaponCRIModifierRate",
    "WeaponCRDModifierRate",
    "TriggerProbModifierRate",
])

/** 武器作用域后缀（旧 raw attr 自带 `_` 后第二段） */
const LEGACY_WEAPON_SCOPES = new Set(["CMelee", "CRanged", "UMelee", "URanged"])

/** 旧快照兼容：六种元素攻击 raw 后缀（`ATK_<Element>`） */
const PLAN4_LEGACY_ELEMENT_ATTACKS = new Set(["Fire", "Water", "Thunder", "Wind", "Light", "Dark"].map(element => `ATK_${element}`))

/** 旧快照兼容：元素弱点 raw 后缀（`<Element>DamagedRate`，U95 起运行时映射为 `<元素>属性弱点`） */
const PLAN4_LEGACY_ELEMENT_DAMAGED_RATES = new Set(
    ["Fire", "Water", "Thunder", "Wind", "Light", "Dark"].map(element => `${element}DamagedRate`)
)

/** 旧快照兼容：只作展示的 raw 引擎名 */
const PLAN4_LEGACY_HANDWRITTEN_ATTRS = new Set(["HpRecoverValue", "HpRecoverValueModifierRate", "WalkSpeedModifier"])

/**
 * 单条 Plan 4 属性的映射状态。
 * @param attr 上游属性配置
 * @returns 映射状态；无法识别时返回 undefined 由调用方告警并降级
 */
export function plan4AttrStatus(attr: Json): Plan4MappingStatus | undefined {
    if (PLAN4_HANDWRITTEN_ATTRS.has(attr.attr) || PLAN4_ELEMENT_LIMITED_ATTRS.has(attr.attr)) {
        return "handwritten"
    }
    if (PLAN4_EXACT_ATTRS.has(attr.attr) || PLAN4_ELEMENT_ATTACKS.has(attr.attr) || PLAN4_WEAPON_ATTRS.has(attr.attr)) {
        return "exact"
    }
    // 旧快照兼容：attr 仍是 raw 引擎名
    if (PLAN4_LEGACY_HANDWRITTEN_ATTRS.has(attr.attr)) {
        return "handwritten"
    }
    if (attr.attr === "DamageRate" || PLAN4_LEGACY_DAMAGE_RATE_KEYS.has(attr.attr)) {
        // 运行时对所有 `DamageRate*` 都能落到具体分区或通用增伤，纯伤害率分区（含 S0）均为精确映射
        return "exact"
    }
    // 旧快照的裸 DamagedRate 只有个体减伤形态，运行时映射为 减伤
    if (attr.attr === "DamagedRate") {
        return "exact"
    }
    // 旧快照的 `<Element>DamagedRate` 映射为对应 `<元素>属性弱点`
    if (PLAN4_LEGACY_ELEMENT_DAMAGED_RATES.has(attr.attr)) {
        return "exact"
    }
    if (PLAN4_LEGACY_WEAPON_ATTRS.has(attr.attr)) {
        // 裸 raw 武器键没有作用域信息，derive 不得标 exact
        return undefined
    }
    for (const raw of PLAN4_LEGACY_WEAPON_ATTRS) {
        if (!attr.attr.startsWith(`${raw}_`)) continue
        // 旧快照的 raw 武器键必须自带 `<Raw>_<Scope>` 作用域
        const scope = attr.attr.slice(raw.length + 1)
        return LEGACY_WEAPON_SCOPES.has(scope) ? "exact" : undefined
    }
    if (PLAN4_LEGACY_EXACT_ATTRS.has(attr.attr) || PLAN4_LEGACY_ELEMENT_ATTACKS.has(attr.attr)) {
        return "exact"
    }
    return undefined
}

/**
 * 整条 Plan 4 词的映射状态：任一条属性 handwritten 即整条 handwritten；
 * 白名单外属性降级并告警，绝不静默标 exact。
 */
export function plan4MappingStatus(affix: Json, warnings: string[]): Plan4MappingStatus {
    if (affix.addAttrs?.length) {
        const statuses = affix.addAttrs.map((attr: Json) => {
            const status = plan4AttrStatus(attr)
            if (!status) {
                // 白名单之外的属性不得静默按 exact 处理：无法确认可精确映射，降级为手写并告警
                warnings.push(`词条 ${affix.id} 的 Plan 4 属性 ${attr.attr} 未登记映射，状态按 handwritten 处理`)
                return "handwritten" as Plan4MappingStatus
            }
            return status
        })
        return statuses.includes("handwritten") ? "handwritten" : "exact"
    }
    // 被动 / 技能改造 / 专属机制：一律本地手写 buff（见 packages/data/transcendBuffs.ts）
    return "handwritten"
}

/** 技能等级词条家族分界：<1500 主控装备，1500-1599 协战装备。 */
const ASSIST_AFFIX_ID_MIN = 1500
const ASSIST_AFFIX_ID_MAX = 1599

/**
 * 已知的技能等级词条部位映射（FEEDBACK §138 补正）：技能类型 × 家族 → 槽型。
 * 槽型 11 与 1/2/4/7 暂无技能等级词条；未给出的组合保持不可选，待现场证据补齐，不臆造。
 */
const SKILL_LEVEL_SLOT_TYPES: Record<string, { main?: readonly number[]; assist?: readonly number[] }> = {
    Skill1: { main: [3], assist: [8] },
    Skill2: { main: [5], assist: [9] },
    Passive: { main: [6], assist: [10] },
}

function deriveEquipModule(source: Json, warnings: string[]): Record<string, unknown> {
    const pools = new Map<number, string>(source.affixPools.map((pool: Json) => [pool.id, pool.name]))

    const affixes = sortByNumber(source.affixes, (row: Json) => row.id).map((affix: Json) => {
        const next: Json = {
            id: affix.id,
            plan: affix.plan,
        }
        if (affix.addAttrs) {
            next.addAttrs = affix.addAttrs
        }
        next.minValue = affix.minValue
        next.maxValue = affix.maxValue
        next.totalValueLevel = affix.totalValueLevel
        for (const key of ["affixUpdatePerLvFunc", "ancientFunc", "maxAffixUpdateFunc"]) {
            const func = sortKeyedRecord(affix[key])
            if (func) {
                next[key] = func
            }
        }
        if (affix.pool !== undefined) {
            next.pool = affix.pool
        }
        // 无池 Plan 3 技能等级词条（1038-1040 / 1510-1512）：客户端没有「随机词条池」字段
        // （AffixPoolId 只服务淬炼页签，15xx 这 3 条的池在 1.8.7.1 被真实删除），槽位适用性只能本地建模。
        // U102 的「协战槽 8-11」限定已被 FEEDBACK §138 及其补正推翻：技能等级词条按部位出现
        // （如主控项链带「被动技能等级 +7」），按 skillTypes × 家族输出已知槽型，未知组合不输出。
        // 只认 `addSkillLevel.skillTypes` 非空（skillIds / 空对象不视为技能类型词条）。
        const skillTypes = affix.addSkillLevel?.skillTypes
        const family =
            affix.id >= ASSIST_AFFIX_ID_MIN && affix.id <= ASSIST_AFFIX_ID_MAX
                ? "assist"
                : affix.id < ASSIST_AFFIX_ID_MIN
                  ? "main"
                  : undefined
        if (affix.plan === 3 && Array.isArray(skillTypes) && skillTypes.length > 0 && affix.pool === undefined && family) {
            const slotTypes = [...new Set(skillTypes.flatMap(skillType => SKILL_LEVEL_SLOT_TYPES[skillType]?.[family] ?? []))].sort(
                (left, right) => left - right
            )
            if (slotTypes.length) {
                next.slotTypes = slotTypes
            }
        }
        const exclusionAffixIds = uniqSorted(affix.exclusionAffixIds)
        if (exclusionAffixIds) {
            next.exclusionAffixIds = exclusionAffixIds
        }
        if (affix.desc !== undefined) {
            next.desc = affix.desc
        }
        if (affix.charIds !== undefined) {
            const charIds = normalizeCharIds(affix.charIds)
            if (charIds.ids) {
                next.charIds = charIds.ids
            } else {
                warnings.push(`词条 ${affix.id} 的 charIds 非法（${charIds.error}），已忽略`)
            }
        }
        if (affix.passiveEffectId !== undefined) {
            next.passiveEffectId = affix.passiveEffectId
        }
        if (affix.addSkillLevel) {
            next.addSkillLevel = affix.addSkillLevel
        }
        if (affix.activateSkills) {
            next.activateSkills = sortNumericRecord(affix.activateSkills)
        }
        const skillReplacements = normalizeSkillReplacements(affix.skillReplacements, affix.id, warnings)
        if (skillReplacements) {
            next.skillReplacements = skillReplacements
        }
        const planName = PLAN_NAMES[affix.plan]
        if (!planName) {
            throw new Error(`未知词条方案 Plan ${affix.plan}（词条 ${affix.id}）`)
        }
        next.planName = planName
        if (affix.pool !== undefined) {
            const poolName = pools.get(affix.pool)
            if (!poolName) {
                throw new Error(`词条 ${affix.id} 引用了未知词条池 ${affix.pool}`)
            }
            next.poolName = poolName
        }
        if (affix.plan === 4) {
            next.mappingStatus = plan4MappingStatus(affix, warnings)
        }
        return next
    })

    const inlays = sortByNumber(source.inlays, (row: Json) => row.id).map((inlay: Json) => {
        const affixIdsBySlot: Record<string, number[]> = {}
        const slots = (sortNumericRecord<number[]>(inlay.affixIdsBySlot) ?? {}) as Record<string, number[]>
        for (const key of Object.keys(slots)) {
            affixIdsBySlot[key] = [...slots[key]].sort((left, right) => left - right)
        }
        return { ...inlay, affixIdsBySlot }
    })

    const crafts = sortByNumber(source.crafts, (row: Json) => row.id).map((craft: Json) => {
        const next: Json = { ...craft }
        if (craft.costItems) {
            next.costItems = sortNumericRecord(craft.costItems) ?? {}
        }
        return next
    })

    const breakdowns = sortByNumber(source.breakdowns, (row: Json) => row.rarity).map((row: Json) => ({
        ...row,
        tierIds: uniqSorted(row.tierIds) ?? [],
    }))

    const affixLevels = sortByNumber(source.affixLevels, (row: Json) => row.power).map((row: Json) => ({
        power: row.power,
        plans: sortByNumber(row.plans, (plan: Json) => plan.planId),
    }))

    const { slotTypes, craftTypes, ...rest } = source
    if (!Object.keys(slotTypes).length || !Object.keys(craftTypes).length) {
        warnings.push("升华装备槽型/打造类型为空")
    }

    const uniqueEquips = sortByNumber(rest.uniqueEquips, (row: Json) => row.id)

    return {
        rawSlotTypes: sortNumericRecord(slotTypes) ?? {},
        rawCraftTypes: sortNumericRecord(craftTypes) ?? {},
        rawSlots: sortByNumber(rest.slots, (row: Json) => row.id).map((row: Json) => {
            const next: Json = { ...row }
            const pools = uniqSorted(row.temperAffixPoolIds)
            if (pools) {
                next.temperAffixPoolIds = pools
            }
            return next
        }),
        rawRarities: sortByNumber(rest.rarities, (row: Json) => row.id),
        rawPowerTiers: sortByNumber(rest.powerTiers, (row: Json) => row.id),
        rawNamePrefixes: sortByNumber(rest.namePrefixes, (row: Json) => row.id),
        rawBaseNames: sortByNumber(rest.baseNames, (row: Json) => row.id),
        rawUniqueEquips: uniqueEquips,
        rawGenerateGroups: sortByNumber(rest.generateGroups, (row: Json) => row.id),
        rawCrafts: crafts,
        rawBreakdowns: breakdowns,
        rawAffixPools: sortByNumber(rest.affixPools, (row: Json) => row.id),
        rawAffixLevels: affixLevels,
        rawAffixes: affixes,
        rawInlays: inlays,
    }
}

function deriveProgressModule(source: Json, warnings: string[]): Record<string, unknown> {
    const talents = sortByNumber(source.talents, (row: Json) => row.id).map((row: Json) => {
        const next: Json = { ...row }
        if (row.unlockChildren) {
            next.unlockChildren = [...row.unlockChildren]
        }
        return next
    })
    const parents = new Map<number, number[]>()
    for (const talent of talents) {
        parents.set(talent.id, [])
    }
    for (const talent of talents) {
        for (const childId of talent.unlockChildren ?? []) {
            const list = parents.get(childId)
            if (!list) {
                throw new Error(`天赋 ${talent.id} 的子节点 ${childId} 不在天赋表中`)
            }
            list.push(talent.id)
        }
    }
    for (const talent of talents) {
        talent.parentIds = (parents.get(talent.id) ?? []).sort((left, right) => left - right)
        if (talent.unlockChildren) {
            talent.unlockChildren = [...talent.unlockChildren].sort((left, right) => left - right)
        }
    }

    const levels = sortByNumber(source.levels, (row: Json) => row.level)
    const seen = new Set<number>()
    for (const level of levels) {
        if (seen.has(level.level)) {
            warnings.push(`升华等级 ${level.level} 出现重复行（多阶段）`)
        }
        seen.add(level.level)
    }
    if (!Object.keys(source.talentTypes).length) {
        warnings.push("天赋类型表为空")
    }

    return {
        rawTalentTypes: sortNumericRecord(source.talentTypes) ?? {},
        rawStages: sortByNumber(source.stages, (row: Json) => row.id),
        rawLevels: levels,
        rawTalentTrees: sortByNumber(source.talentTrees, (row: Json) => row.id),
        rawTalentMenus: sortByNumber(source.talentMenus, (row: Json) => row.talentType).map((row: Json) => ({
            ...row,
            cost: sortNumericRecord(row.cost) ?? {},
        })),
        rawTalentLevelUpCosts: sortByNumber(source.talentLevelUpCosts, (row: Json) => row.level).map((row: Json) => ({
            ...row,
            cost: sortNumericRecord(row.cost) ?? {},
        })),
        rawTalents: talents.map((row: Json) => ({
            ...row,
            effects: [...row.effects].sort((left: Json, right: Json) => left.index - right.index),
        })),
    }
}

function deriveRiftModule(source: Json, spawnUnits: Record<number, number[]>, warnings: string[]): Record<string, unknown> {
    const floors = sortByNumber(source.floors, (row: Json) => row.id).map((row: Json) => {
        const next: Json = { ...row }
        for (const key of ["dungeonIds", "challengeIds", "scoreRuleIds", "unlockTierIds"]) {
            const value = uniqSorted(row[key])
            if (value) {
                next[key] = value
            } else {
                delete next[key]
            }
        }
        return next
    })

    const normalIds = new Set<number>()
    for (const floor of source.floors) {
        for (const id of floor.normalMonsterIds ?? []) {
            normalIds.add(id)
        }
        for (const id of floor.eliteMonsterIds ?? []) {
            warnings.push(`螺旋层 ${floor.floor} 使用层内精英刷怪组 ${id}，已合并进 spawnUnits`)
            normalIds.add(id)
        }
    }
    for (const id of source.eliteMonsterIds) {
        normalIds.add(id)
    }
    for (const id of normalIds) {
        if (!spawnUnits[id]) {
            throw new Error(`刷怪组 ${id} 在 MonsterSpawn 中不存在`)
        }
    }
    const sortedSpawnUnits: Record<number, number[]> = {}
    for (const id of [...normalIds].sort((left, right) => left - right)) {
        sortedSpawnUnits[id] = spawnUnits[id]
    }

    return {
        rawSeasons: sortByNumber(source.seasons, (row: Json) => row.id).map((row: Json) => ({
            ...row,
            displayName: `第 ${row.subSeasonNum} 赛季`,
        })),
        rawEliteMonsterIds: uniqSorted(source.eliteMonsterIds) ?? [],
        rawSpawnUnits: sortedSpawnUnits,
        rawFloors: floors,
        rawRankConfigs: sortByNumber(source.rankConfigs, (row: Json) => row.id),
        rawRankRewards: sortByNumber(source.rankRewards, (row: Json) => row.id),
        rawRankRoles: sortByNumber(source.rankRoles, (row: Json) => row.id),
        rawChallenges: sortByNumber(source.challenges, (row: Json) => row.id).map((row: Json) => ({
            ...row,
            dropBonus: sortByNumber(row.dropBonus, (bonus: Json) => bonus.id),
        })),
        rawMonsterScores: sortByNumber(source.monsterScores, (row: Json) => row.id),
        rawGlobals: pickRecord(
            source.globals,
            [
                "RiftInitUnlockLayer",
                "RiftMaxLayer",
                "RiftRankDeathInitialPenalty",
                "RiftRankDeathPenalty",
                "RiftRankRewardTime",
                "RiftReviveCountdown",
            ],
            warnings,
            "globals"
        ),
    }
}

/** 把 4 个上游 JSON 派生为 4 个数据模块的变量表（纯函数，可重复调用）。 */
export function deriveDnaSeasonModules(source: DnaSeasonSource): DnaSeasonModules {
    validateSource(source)
    assertFoldedElements(source)
    const warnings: string[] = []
    const season = deriveSeasonModule(source.season, warnings)
    const equip = deriveEquipModule(source.equip, warnings)
    const progress = deriveProgressModule(source.progress, warnings)
    const rift = deriveRiftModule(source.rift, source.spawnUnits, warnings)
    // 赛季资源清单是唯一权威，resourceTabs 引用需全部在清单内
    const resources = new Set(season.rawResources as number[])
    for (const tab of season.rawResourceTabs as Json[]) {
        for (const id of tab.resources) {
            if (!resources.has(id)) {
                warnings.push(`资源页 ${tab.id} 引用了不在赛季资源清单内的 ${id}`)
            }
        }
    }
    return {
        dnaseason: season,
        dnaseasonequip: equip,
        dnaseasonprogress: progress,
        dnaseasonrift: rift,
        warnings,
    }
}
