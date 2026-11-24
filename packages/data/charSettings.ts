import type { DotFrequencySettings } from "./CharBuild"
import { charMap, petMap, weaponNameMap } from "./d"
import { PET_BREAKTHROUGH_MAX_LEVEL } from "./leveled/LeveledPet"
import { normalizeTraitSlots, resolvePetBuffName, TRAIT_MAX_LEVEL, type TraitSlot } from "./petTrait"
import {
    migrateLegacyTraceBuffs,
    normalizeTraceStacks,
    resolveHighestActiveRoot,
    resolveTraceOffRoots,
    TRACE_LEVEL_MAX,
    type TraceStack,
    warnUnmappedLegacyTraceBuffs,
} from "./traceEffects"
import {
    createDefaultTranscendSettings,
    encodeTranscendSettings,
    getActiveGearVariant,
    isEmptyTranscendSettings,
    normalizeTranscendSettings,
    type TranscendSettings,
} from "./transcendSettings"

/** 浮点尾差归一化 */
export function roundBuffValue(value: number, digits = 6): number {
    return Number(value.toFixed(digits))
}

/** 专武信息：武器 id 与所在槽位类型 */
export type SignatureWeapon = { id: number; type: "近战" | "远程" }

/** MOD 槽位：`[魔之楔 id, 等级]`，null 表示空槽 */
export type ModSlot = [number, number] | null

/** MOD 槽位类型（取值与 ModEditer 的 type 属性一致） */
export type ModSlotType = "角色" | "近战" | "远程" | "同律"

/** 技能等级：`[E, Q, 被动]`，索引 0/1/2 依次对应 */
export type CharSkillLevels = [number, number, number]

/** 技能等级下限 */
export const CHAR_SKILL_LEVEL_MIN = 1
/**
 * 基础技能等级上限：游戏内技能升级只有 1–10 级（每个技能 9 档升级）。
 * 构筑设置里的 `charSkillLevel` 只存基础等级；溯源 / 升华等加成在装配期叠加。
 */
export const CHAR_SKILL_LEVEL_BASE_MAX = 10
/** 有效技能等级上限（源数据 `DataConst.MaxSkillLevel`，技能数值曲线 1–30） */
export const CHAR_SKILL_LEVEL_MAX = 30
/** 技能等级默认值（E/Q/被动均为 10 级） */
export const CHAR_SKILL_LEVEL_DEFAULT = 10

/**
 * 技能等级归一化的公共实现：兼容数字与稀疏数组，按给定上限钳制并取整。
 * @param value 原始技能等级（数字 | 数组 | 其他）
 * @param max 上限（基础等级 10 / 有效等级 30）
 * @returns 归一化后的三元组
 */
function normalizeSkillLevelsWithMax(value: unknown, max: number): CharSkillLevels {
    const clamp = (level: unknown, fallback: number): number => {
        if (!Number.isFinite(level)) return fallback
        return Math.max(CHAR_SKILL_LEVEL_MIN, Math.min(max, Math.round(level as number)))
    }
    if (Number.isFinite(value)) {
        const level = clamp(value, CHAR_SKILL_LEVEL_DEFAULT)
        return [level, level, level]
    }
    if (Array.isArray(value)) {
        const first = clamp((value as unknown[])[0], CHAR_SKILL_LEVEL_DEFAULT)
        const levels = [0, 1, 2].map(index => clamp((value as unknown[])[index], first)) as CharSkillLevels
        // 缺项回填：缺失项沿用首项（首项本身已是合法值），保证 `[10]` → `[10, 10, 10]`
        for (let index = 0; index < 3; index++) {
            if (!Number.isFinite((value as unknown[])[index])) {
                levels[index] = index === 0 ? first : levels[0]
            }
        }
        return levels
    }
    return [CHAR_SKILL_LEVEL_DEFAULT, CHAR_SKILL_LEVEL_DEFAULT, CHAR_SKILL_LEVEL_DEFAULT]
}

/**
 * 归一化基础技能等级为 `[E, Q, 被动]` 三元组（原地返回新数组，不修改入参）。
 * 兼容老格式：单个数字视为三项相同（如 `10` → `[10, 10, 10]`）。
 * 数组缺项时用首项（无首项则用默认值）补齐，各项钳制到 1-10 并取整；
 * 旧档里把溯源加成算进基础等级的超限值（如 12）会回落到 10，再由溯源重新叠加。
 * @param value 原始技能等级（数字 | 数组 | 其他）
 * @returns 归一化后的三元组
 */
export function normalizeCharSkillLevels(value: unknown): CharSkillLevels {
    return normalizeSkillLevelsWithMax(value, CHAR_SKILL_LEVEL_BASE_MAX)
}

/**
 * 归一化有效技能等级为 `[E, Q, 被动]` 三元组：基础等级 + 溯源 / 升华加成后的读数，钳制到 1-30。
 * 仅供读取已装配的最终等级（快照迁移 / 展示），不要用于设置输入。
 * @param value 原始有效等级（数字 | 数组 | 其他）
 * @returns 归一化后的三元组
 */
export function normalizeEffectiveSkillLevels(value: unknown): CharSkillLevels {
    return normalizeSkillLevelsWithMax(value, CHAR_SKILL_LEVEL_MAX)
}

/**
 * 按角色技能索引取对应的技能等级：0→E，1→Q，2 及之后→被动。
 * 索引越界（角色技能多于 3 个，如第二被动/协战）时沿用被动等级，保证计算不丢等级。
 * @param levels 归一化后的技能等级三元组（兼容老格式数字）
 * @param index 角色技能索引
 * @returns 该技能的等级
 */
export function resolveCharSkillLevel(levels: CharSkillLevels | number | readonly number[] | unknown, index: number): number {
    // 读的是已装配的有效等级（基础 + 溯源 / 升华加成），按 1-30 归一化；基础输入上限在 normalizeCharSkillLevels 里
    const normalized = normalizeEffectiveSkillLevels(levels)
    if (!Number.isInteger(index) || index <= 0) return normalized[0]
    if (index === 1) return normalized[1]
    return normalized[2]
}

/** MOD 变体字母：索引 0/1/2 依次对应配置 A/B/C */
export const MOD_VARIANT_LETTERS = ["A", "B", "C"] as const

/** MOD 变体字母类型 */
export type ModVariantLetter = (typeof MOD_VARIANT_LETTERS)[number]

/** MOD 变体数量上限（同一构筑最多三份配置：A/B/C） */
export const MOD_VARIANT_MAX_COUNT = MOD_VARIANT_LETTERS.length

/** 各槽位类型的固定槽位数（角色/近战/远程各 8 槽，同律 4 槽） */
export const MOD_SLOT_COUNTS: Record<ModSlotType, number> = { 角色: 8, 近战: 8, 远程: 8, 同律: 4 }

/** 全部槽位类型（顺序即 UI 中的展示顺序：角色 → 近战 → 远程 → 同律） */
export const MOD_SLOT_TYPES = Object.keys(MOD_SLOT_COUNTS) as ModSlotType[]

/**
 * 一份 MOD 变体：槽位按类型分组，并带上角色中枢魔之楔（光环）。
 * 中枢在角色面板里是独立槽位（不在 8 个普通槽位中），因此单独存一个 id。
 */
export interface ModVariant extends Record<ModSlotType, ModSlot[]> {
    /** 中枢魔之楔（光环）id；0 表示未设置（此时沿用配置 A 的中枢） */
    中枢: number
}

/**
 * 变体 A 对应的既有字段：历史存档只有这一份配置，
 * 因此变体 A 始终复用原字段，既保证旧存档无需迁移，也让既有读写代码保持有效。
 */
const MOD_VARIANT_LEGACY_KEYS = {
    角色: "charMods",
    近战: "meleeMods",
    远程: "rangedMods",
    同律: "skillWeaponMods",
} as const

export interface NormalActions {
    /** 表达式 */
    s: string
    /** 延迟 */
    d: number
    /** 重复次数 */
    t?: number
    /** buff组索引 */
    b?: number | "-"
}

export interface BackgroundActions {
    /** 表达式 */
    s: string
    /** 间隔 */
    i: number
    /** 重复次数 */
    t?: number
    /** 延迟 */
    d?: number
    /** buff组索引 */
    b?: number | "-"
}

export interface InlineActions {
    /** 是否启用内联动作 */
    enable: boolean
    /** 动作 */
    i: NormalActions[]
    /** 背景动作 */
    b: BackgroundActions[]
    /** 血量 */
    hp: [number, number][]
    /** buff组 */
    bgs: [string, number][][]
}

/**
 * 创建一份新的内联动作默认值（未配置状态：未启用且各列表均为空）。
 * @returns 新的默认内联动作（每次调用返回全新对象，避免多构筑共享引用）
 */
export function createDefaultInlineActions(): InlineActions {
    return {
        enable: false,
        i: [],
        b: [],
        hp: [],
        bgs: [],
    }
}

/**
 * 判断内联动作是否为「未配置」状态（未启用且各列表均为空）。
 * 序列化时命中该状态的 actions 会被直接省略，以简化配置文件大小。
 * @param value 待判断的内联动作（缺失/null 视为未配置）
 * @returns 是否未配置
 */
export function isEmptyInlineActions(value: InlineActions | null | undefined): boolean {
    if (!value || typeof value !== "object") {
        return true
    }
    return (
        value.enable !== true &&
        (value.i?.length ?? 0) === 0 &&
        (value.b?.length ?? 0) === 0 &&
        (value.hp?.length ?? 0) === 0 &&
        (value.bgs?.length ?? 0) === 0
    )
}

/**
 * 归一化内联动作：缺失/null/形状非法时回退为默认值，保证运行时永远拿到可用结构。
 * @param value 原始内联动作（允许缺失或 null，即「为空」）
 * @returns 结构完整的内联动作
 */
export function normalizeInlineActions(value: unknown): InlineActions {
    const normalized = createDefaultInlineActions()
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return normalized
    }
    const raw = value as Partial<InlineActions>
    normalized.enable = raw.enable === true
    if (Array.isArray(raw.i)) {
        normalized.i = raw.i.filter(
            item =>
                item &&
                typeof item === "object" &&
                typeof (item as NormalActions).s === "string" &&
                Number.isFinite((item as NormalActions).d)
        ) as NormalActions[]
    }
    if (Array.isArray(raw.b)) {
        normalized.b = raw.b.filter(
            item =>
                item &&
                typeof item === "object" &&
                typeof (item as BackgroundActions).s === "string" &&
                Number.isFinite((item as BackgroundActions).i)
        ) as BackgroundActions[]
    }
    if (Array.isArray(raw.hp)) {
        normalized.hp = raw.hp.filter(
            (item): item is [number, number] => Array.isArray(item) && Number.isFinite(item[0]) && Number.isFinite(item[1])
        )
    }
    if (Array.isArray(raw.bgs)) {
        normalized.bgs = raw.bgs.filter((group): group is [string, number][][][number] => Array.isArray(group)) as [string, number][][]
    }
    return normalized
}

/** DOT 频率设置：直接复用 CharBuild 的定义，避免同一形状两处维护 */
export type { DotFrequencySettings } from "./CharBuild"

/**
 * 协战角色配置：让协战也能被完整构筑（等级 / 技能 / 单武器 / MOD / BUFF / 特效）。
 *
 * 角色 id 与武器 id 仍以 `teamN` / `teamNWeapon` 为唯一真源，这里不重复存 id；
 * 敌人环境继承主控，时间线与魔灵暂不参与协战构筑。
 */
export interface AssistCharSettings {
    /** 角色等级 1-80 */
    charLevel: number
    /** 技能等级 `[E, Q, 被动]` */
    charSkillLevel: CharSkillLevels
    /** 溯源等级 0..该角色最大溯级（6/7）：缺省取最大，1..N 溯全部生效 */
    traceLevel: number
    /** 关闭的根源序号（1..该角色最大根源）；缺省 = 全部激活 */
    traceOffRoots?: number[]
    /** 溯源层数 / 覆盖率设置 `[根源, 等级, 覆盖率?]`；缺省 = 全部按 `mx` 满层、覆盖率 1 */
    traceStacks?: TraceStack[]
    /** 计算技能（baseName），必须属于该协战角色的技能表 */
    baseName: string
    /** 额外精通武器类型（如 "长柄"），空字符串表示未解锁 */
    extraMastery: string
    /** 单武器槽（teamNWeapon）的等级 */
    weaponLevel: number
    /** 单武器槽（teamNWeapon）的精炼等级 0-5 */
    weaponRefine: number
    /** 目标函数表达式 */
    targetFunction: string
    /** 自定义变量：`[变量名, 表达式]` */
    customVariables: [string, string][]
    /** DOT 频率设置 */
    dotSettings: DotFrequencySettings
    /** 是否参与合计（未配置角色时默认不参与） */
    enabled: boolean
    /** 中枢魔之楔（光环）id，0 表示未设置 */
    auraMod: number
    charMods: ModSlot[]
    meleeMods: ModSlot[]
    rangedMods: ModSlot[]
    skillWeaponMods: ModSlot[]
    /** 当前激活的 MOD 变体索引（0/1/2 ↔ 配置 A/B/C） */
    modVariantIndex: number
    /** 额外 MOD 变体（B/C） */
    modVariants: ModVariant[]
    /** 启用的 BUFF：`[名称, 等级, 覆盖率?]`，覆盖率缺省为 1 */
    buffs: [string, number, number?][]
    /** 自定义 BUFF：`[属性名, 数值]` */
    customBuff: [string, number][]
    /** 是否使用全局背包特效等级（true 时忽略 effectConfig） */
    useGlobal: boolean
    /** 构筑本地特效等级配置（key: `m:<modId>` / `w:<weaponId>`） */
    effectConfig: Record<string, number>
}

/** 创建协战默认配置；每次返回全新对象与数组，避免多位协战共享引用 */
export function createDefaultAssistSideSettings(): AssistCharSettings {
    return {
        charLevel: 80,
        charSkillLevel: [CHAR_SKILL_LEVEL_DEFAULT, CHAR_SKILL_LEVEL_DEFAULT, CHAR_SKILL_LEVEL_DEFAULT],
        traceLevel: TRACE_LEVEL_MAX,
        // 缺省 undefined：全部激活，由旧溯级迁移（新 UI 翻转后写数组）
        traceOffRoots: undefined,
        baseName: "",
        extraMastery: "",
        weaponLevel: 80,
        weaponRefine: 5,
        targetFunction: "",
        customVariables: [],
        dotSettings: { skill: 0, melee: 0, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: false },
        enabled: true,
        auraMod: 0,
        charMods: Array.from({ length: MOD_SLOT_COUNTS.角色 }, () => null),
        meleeMods: Array.from({ length: MOD_SLOT_COUNTS.近战 }, () => null),
        rangedMods: Array.from({ length: MOD_SLOT_COUNTS.远程 }, () => null),
        skillWeaponMods: Array.from({ length: MOD_SLOT_COUNTS.同律 }, () => null),
        modVariantIndex: 0,
        modVariants: [],
        buffs: [],
        customBuff: [],
        useGlobal: false,
        effectConfig: {},
    }
}

/**
 * 创建一份新的角色配置默认值，避免数组和对象在多个角色之间共享引用。
 * 传入角色专武时，默认武器直接装备该专武（无专武则回退通用默认武器）。
 * @param signatureWeapon 角色专武（可选）
 * @returns 新的默认角色配置
 */
export function createDefaultCharSettings(signatureWeapon?: SignatureWeapon | null) {
    return {
        charLevel: 80,
        baseName: "",
        hpPercent: 1,
        resonanceGain: 3,
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0,
        isRouge: false,
        targetFunction: "",
        /** 主控目标函数是否参与合计（目标卡上的「启用」，默认参与） */
        mainTargetEnabled: true,
        customVariables: [] as [string, string][],
        /** 技能等级 `[E, Q, 被动]`：老存档的单个数字载入时展开为三项相同 */
        charSkillLevel: [10, 10, 10] as CharSkillLevels,
        /** 溯源等级 0..7：缺省取最大（该角色无溯源时不生效）；旧档只用于迁移 */
        traceLevel: TRACE_LEVEL_MAX,
        /** 关闭的根源序号（1..该角色最大根源）；缺省（undefined）= 全部激活，由旧溯级迁移 */
        traceOffRoots: undefined as number[] | undefined,
        /** 溯源层数 / 覆盖率设置 `[根源, 等级, 覆盖率?]`：缺省空数组 = 全部按 mx 满层、覆盖率 1 */
        traceStacks: [] as TraceStack[],
        /** 额外精通武器类型（如 "长柄"），空字符串表示未解锁 */
        extraMastery: "",
        meleeWeapon: signatureWeapon?.type === "近战" ? signatureWeapon.id : 10206, //"枯朽",
        meleeWeaponLevel: 80,
        meleeWeaponRefine: 5,
        rangedWeapon: signatureWeapon?.type === "远程" ? signatureWeapon.id : 20102, //"剥离",
        rangedWeaponLevel: 80,
        rangedWeaponRefine: 5,
        auraMod: 31524, // 警惕
        imbalance: false,
        charMods: Array(8).fill(null) as ([number, number] | null)[],
        meleeMods: Array(8).fill(null) as ([number, number] | null)[],
        rangedMods: Array(8).fill(null) as ([number, number] | null)[],
        skillWeaponMods: Array(4).fill(null) as ([number, number] | null)[],
        /**
         * 当前激活的 MOD 变体索引（0/1/2 ↔ 配置 A/B/C）。
         * 变体 A 即上面的 charMods / auraMod 等字段，变体 B/C 存放在 modVariants 中。
         */
        modVariantIndex: 0,
        /** 额外 MOD 变体（B/C）：索引 0/1 ↔ 配置 B/C，含中枢魔之楔，可整份随构筑上传分享 */
        modVariants: [] as ModVariant[],
        buffs: [] as [string, number, number?][],
        customBuff: [] as [string, number][],
        /** 已选魔灵 id（0 表示未选择）：魔灵面板据此展示主动/被动与冷却，并把魔灵 BUFF 计入构筑 */
        petId: 0,
        /** 魔灵突破等级（0-3，默认满突破 3）：与潜质加成（如「老道」+1）叠加后得到技能数值索引（上限 4 = Lv.5） */
        petLevel: 3,
        /** 魔灵主动技覆盖率（0-1）：主动 BUFF 按该覆盖率缩放后计入构筑（手动模式用值） */
        petCoverage: 1,
        /** 魔灵主动技覆盖率是否自动计算（按效果持续时间 / 实际冷却） */
        petAutoCoverage: true,
        /** 魔灵潜质槽位（4 个，互不相同，存 [基础潜质 id, 等级]；null 表示空槽） */
        traits: Array(4).fill(null) as TraitSlot[],
        team1: "-" as number | "-",
        team1Weapon: "-" as number | "-",
        /** 1 号协战角色关联的服务器构筑 id（"-" 表示未关联，简洁模式据此弹窗展示其魔之楔） */
        team1Build: "-",
        /** 1 号协战角色关联的构筑 MOD 变体（A/B/C，关联的构筑没有该变体时按配置 A 展示） */
        team1BuildVariant: "A" as ModVariantLetter,
        team2: "-" as number | "-",
        team2Weapon: "-" as number | "-",
        /** 2 号协战角色关联的服务器构筑 id（"-" 表示未关联） */
        team2Build: "-",
        /** 2 号协战角色关联的构筑 MOD 变体（A/B/C） */
        team2BuildVariant: "A" as ModVariantLetter,
        /** 1 号协战角色的完整构筑配置（角色 id 仍以 team1 为真源） */
        assist1: createDefaultAssistSideSettings(),
        /** 2 号协战角色的完整构筑配置（角色 id 仍以 team2 为真源） */
        assist2: createDefaultAssistSideSettings(),
        timelineDPS: false,
        /** 升华配置（总开关 / 天赋 / 三组装备 / 变体）：默认关闭，由构筑页头部 toggle 启用 */
        transcend: createDefaultTranscendSettings(),
        /** 是否使用全局背包特效等级（true 时忽略 effectConfig，行为同旧版） */
        useGlobal: false,
        /** 构筑本地特效等级配置（key: `m:<modId>` / `w:<weaponId>`，缺省为最大） */
        effectConfig: {} as Record<string, number>,
        /** DOT 频率设置（技能/近战/远程/同律 每秒造成伤害的次数，0 表示不触发） */
        dotSettings: {
            skill: 0,
            melee: 0,
            ranged: 0,
            skillweapon: 0,
            forceOwnAdditionalDamage: false,
        } as DotFrequencySettings,
        actions: createDefaultInlineActions(),
    }
}

export const defaultCharSettings = createDefaultCharSettings()

export type CharSettings = ReturnType<typeof createDefaultCharSettings>

/**
 * 角色配置输入形状：`actions`、`assist1` / `assist2` 支持为空或局部形状，载入时由 `normalizeCharSettings` 补齐。
 * 序列化时未配置的 actions 会被直接省略，以简化配置文件大小。
 */
export type CharSettingsInput = Omit<Partial<CharSettings>, "actions" | "assist1" | "assist2" | "transcend"> & {
    actions?: Partial<InlineActions> | null
    assist1?: Partial<AssistCharSettings> | null
    assist2?: Partial<AssistCharSettings> | null
    /** 升华配置：支持局部形状，载入时由 `normalizeTranscendSettings` 补齐 */
    transcend?: Partial<TranscendSettings> | null
}

/**
 * 创建一份空 MOD 变体（各槽位类型均为空槽，中枢未设置）。
 * @returns 空变体
 */
export function createEmptyModVariant(): ModVariant {
    const variant = { 中枢: 0 } as ModVariant
    MOD_SLOT_TYPES.forEach(type => {
        variant[type] = Array.from({ length: MOD_SLOT_COUNTS[type] }, () => null)
    })
    return variant
}

/**
 * 读取指定槽位类型在指定变体下的槽位数组（可直接读写）。
 *
 * 变体 A（索引 0）直接使用 charMods / meleeMods / rangedMods / skillWeaponMods 等既有字段，
 * 变体 B/C（索引 1/2）取自 modVariants；索引越界或数据缺失（旧存档、脏数据）时回退为配置 A，
 * 保证 UI 与计算永远能拿到一份可用的槽位数组。
 * @param settings 角色配置
 * @param type 槽位类型
 * @param variantIndex 变体索引（缺省取配置中当前激活的变体）
 * @returns 该变体的槽位数组
 */
export function getModVariantSlots(settings: CharSettings, type: ModSlotType, variantIndex: number = settings.modVariantIndex): ModSlot[] {
    if (variantIndex <= 0) {
        return settings[MOD_VARIANT_LEGACY_KEYS[type]] ?? []
    }
    return settings.modVariants?.[variantIndex - 1]?.[type] ?? settings[MOD_VARIANT_LEGACY_KEYS[type]] ?? []
}

/**
 * 读取当前已有的变体数量（配置 A 恒存在，B/C 需手动添加）。
 * @param settings 角色配置
 * @returns 变体数量（1-3）
 */
export function getModVariantCount(settings: CharSettings): number {
    return Math.max(1, Math.min(MOD_VARIANT_MAX_COUNT, 1 + (settings.modVariants?.length ?? 0)))
}

/**
 * 读取指定变体的中枢魔之楔（光环）id。
 * 变体 A（索引 0）使用既有的 auraMod 字段，变体 B/C 使用变体自身的值；
 * 变体未设置中枢（旧存档、脏数据）时沿用配置 A 的中枢，保证计算不会凭空丢掉光环。
 * @param settings 角色配置
 * @param variantIndex 变体索引（缺省取配置中当前激活的变体）
 * @returns 中枢魔之楔 id
 */
export function getModVariantAura(settings: CharSettings, variantIndex: number = settings.modVariantIndex): number {
    if (variantIndex <= 0) {
        return settings.auraMod
    }
    const aura = settings.modVariants?.[variantIndex - 1]?.中枢
    return Number.isFinite(aura) && (aura as number) > 0 ? (aura as number) : settings.auraMod
}

/**
 * 写入指定变体的中枢魔之楔（光环）id。
 * @param settings 角色配置（原地修改）
 * @param auraMod 中枢魔之楔 id
 * @param variantIndex 变体索引（缺省取配置中当前激活的变体）
 */
export function setModVariantAura(settings: CharSettings, auraMod: number, variantIndex: number = settings.modVariantIndex): void {
    if (variantIndex <= 0) {
        settings.auraMod = auraMod
        return
    }
    const variant = settings.modVariants?.[variantIndex - 1]
    if (variant) {
        variant.中枢 = auraMod
    }
}

/**
 * 以指定变体为模板创建新变体（槽位与中枢都深拷贝，避免变体之间共享同一数组或状态）。
 * @param settings 角色配置
 * @param variantIndex 模板变体索引
 * @returns 新变体
 */
export function createModVariantFrom(settings: CharSettings, variantIndex: number): ModVariant {
    const variant = createEmptyModVariant()
    variant.中枢 = getModVariantAura(settings, variantIndex)
    MOD_SLOT_TYPES.forEach(type => {
        variant[type] = getModVariantSlots(settings, type, variantIndex).map(slot => (slot ? ([...slot] as [number, number]) : null))
    })
    return variant
}

/**
 * 在配置末尾追加一份新变体，并把激活变体切到它。
 * 新变体以当前激活的变体为模板，方便在既有配置上做局部调整。
 * @param settings 角色配置（原地修改）
 * @returns 新变体的索引；已达上限（A/B/C 三份）时返回 -1
 */
export function addModVariant(settings: CharSettings): number {
    if (getModVariantCount(settings) >= MOD_VARIANT_MAX_COUNT) {
        return -1
    }
    const variant = createModVariantFrom(settings, settings.modVariantIndex)
    settings.modVariants = [...(settings.modVariants ?? []), variant]
    settings.modVariantIndex = settings.modVariants.length
    return settings.modVariantIndex
}

/**
 * 移除末尾的变体配置（仅当它正处于激活状态时允许，避免删除后变体字母错位）。
 * @param settings 角色配置（原地修改）
 * @returns 是否真的移除了
 */
export function removeLastModVariant(settings: CharSettings): boolean {
    const count = getModVariantCount(settings)
    if (count <= 1 || settings.modVariantIndex !== count - 1) {
        return false
    }
    settings.modVariants = (settings.modVariants ?? []).slice(0, -1)
    // 回到前一份变体（永远存在，因为配置 A 一定在）
    settings.modVariantIndex = Math.max(0, settings.modVariants.length)
    return true
}

/**
 * 读取变体索引对应的字母（越界时回退为 A）。
 * @param variantIndex 变体索引
 * @returns 变体字母
 */
export function getModVariantLetter(variantIndex: number): ModVariantLetter {
    return MOD_VARIANT_LETTERS[variantIndex] ?? "A"
}

/**
 * 读取变体字母对应的索引（非法字母回退为配置 A 的索引 0）。
 * @param letter 变体字母
 * @returns 变体索引
 */
export function getModVariantIndex(letter: unknown): number {
    const index = MOD_VARIANT_LETTERS.indexOf(typeof letter === "string" ? (letter.trim().toUpperCase() as ModVariantLetter) : "A")
    return index === -1 ? 0 : index
}

/**
 * 归一化变体字母：仅接受 A/B/C（忽略大小写与空白），其余（旧存档缺省、脏数据）一律视为配置 A。
 * @param value 待归一化的值
 * @returns 合法的变体字母
 */
export function normalizeModVariantLetter(value: unknown): ModVariantLetter {
    return getModVariantLetter(getModVariantIndex(value))
}

/**
 * 解析一份外部构筑（如协战关联的分享构筑）实际可用的变体：找不到所选变体时降级为配置 A。
 * @param settings 外部构筑的角色配置
 * @param letter 期望使用的变体字母
 * @returns 实际生效的变体字母
 */
export function resolveModVariantLetter(settings: CharSettings, letter: ModVariantLetter | string | undefined): ModVariantLetter {
    const index = getModVariantIndex(letter)
    return index < getModVariantCount(settings) ? getModVariantLetter(index) : "A"
}

/**
 * 归一化单个槽位列表：固定长度，只保留形状合法的 `[id, 等级]` 槽位。
 * @param value 原始槽位列表
 * @param length 目标槽位数
 * @returns 归一化后的槽位列表
 */
function normalizeModSlots(value: unknown, length: number): ModSlot[] {
    const slots = Array.isArray(value) ? value : []
    return Array.from({ length }, (_, index) => {
        const slot = slots[index]
        if (!Array.isArray(slot)) {
            return null
        }
        const [modId, level] = slot as unknown[]
        if (!Number.isFinite(modId) || !Number.isFinite(level)) {
            return null
        }
        return [Math.round(modId as number), Math.round(level as number)] as [number, number]
    })
}

/**
 * 归一化额外 MOD 变体：最多两份（B/C），每份补齐槽位类型、固定槽位数与中枢字段。
 * 形状不合法的条目补成空变体而不是丢弃，保证变体字母与数组下标始终一一对应。
 * @param value 原始变体列表
 * @returns 归一化后的变体列表
 */
function normalizeModVariants(value: unknown): ModVariant[] {
    if (!Array.isArray(value)) {
        return []
    }
    return value.slice(0, MOD_VARIANT_MAX_COUNT - 1).map(raw => {
        const variant = createEmptyModVariant()
        if (raw && typeof raw === "object") {
            MOD_SLOT_TYPES.forEach(type => {
                variant[type] = normalizeModSlots((raw as Record<string, unknown>)[type], MOD_SLOT_COUNTS[type])
            })
            // 中枢只接受合法 id，非法值记 0（读取时自动沿用配置 A 的中枢）
            const aura = (raw as Record<string, unknown>).中枢
            variant.中枢 = Number.isFinite(aura) && (aura as number) > 0 ? Math.round(aura as number) : 0
        }
        return variant
    })
}

/** 取整并钳制到区间；非有限数回退 fallback */
function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback
    return Math.max(min, Math.min(max, Math.round(value as number)))
}

/** 协战 DOT 频率：负值归零，缺失键沿用默认值 */
function normalizeAssistDotSettings(value: unknown, defaults: DotFrequencySettings): DotFrequencySettings {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<DotFrequencySettings>) : {}
    const frequency = (input: unknown, fallback: number) => (Number.isFinite(input) ? Math.max(0, input as number) : fallback)
    return {
        skill: frequency(raw.skill ?? defaults.skill, defaults.skill),
        melee: frequency(raw.melee ?? defaults.melee, defaults.melee),
        ranged: frequency(raw.ranged ?? defaults.ranged, defaults.ranged),
        skillweapon: frequency(raw.skillweapon ?? defaults.skillweapon, defaults.skillweapon),
        forceOwnAdditionalDamage:
            typeof raw.forceOwnAdditionalDamage === "boolean" ? raw.forceOwnAdditionalDamage : defaults.forceOwnAdditionalDamage === true,
    }
}

/** 协战 BUFF 列表：只保留合法条目，覆盖率与主控同口径（<1 才写第三项并收敛精度） */
function normalizeAssistBuffs(value: unknown, defaults: [string, number, number?][]): [string, number, number?][] {
    if (!Array.isArray(value)) return defaults.map(buff => [...buff] as [string, number, number?])
    return value
        .filter((buff): buff is [string, number, number?] => Array.isArray(buff) && typeof buff[0] === "string" && Number.isFinite(buff[1]))
        .map(([name, level, coverage]) => {
            if (typeof coverage !== "number" || !Number.isFinite(coverage) || coverage >= 1) {
                return [name, level]
            }
            return [name, level, roundBuffValue(coverage)]
        })
}

/** 协战自定义 BUFF：只保留 `[string, number]` 对并收敛浮点尾差 */
function normalizeAssistCustomBuff(value: unknown, defaults: [string, number][]): [string, number][] {
    if (!Array.isArray(value)) return defaults.map(([property, amount]) => [property, amount])
    return value
        .filter((entry): entry is [string, number] => Array.isArray(entry) && typeof entry[0] === "string" && Number.isFinite(entry[1]))
        .map(([property, amount]) => [property, roundBuffValue(amount)])
}

/** 特效等级配置：只保留 `string → 有限数` 的键值对 */
function normalizeEffectConfig(value: unknown, defaults: Record<string, number>): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...defaults }
    const result: Record<string, number> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, level]) => {
        if (Number.isFinite(level)) result[key] = level as number
    })
    return result
}

/**
 * 归一化协战角色配置：逐字段校验并钳制，缺失字段按 defaults 补齐。
 * 协战角色 id / 武器 id 以 `teamN` / `teamNWeapon` 为真源（这里不存 id），
 * 技能名对不上该角色技能表时回退首个技能，角色无效则为空。
 */
export function normalizeAssistSideSettings(value: unknown, teamId: number | "-", defaults: AssistCharSettings): AssistCharSettings {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<AssistCharSettings>) : {}
    const char = typeof teamId === "number" && Number.isFinite(teamId) ? charMap.get(Math.round(teamId)) : undefined
    const skillNames = (char?.技能 ?? []).map(skill => skill.名称).filter((name): name is string => typeof name === "string")
    const baseName = (typeof raw.baseName === "string" ? raw.baseName : "").trim()
    // 关闭的根源：字段缺失时按旧溯级迁移（traceLevel+1..max）；溯级同步为最高激活根源
    const traceOffRoots = resolveTraceOffRoots(raw.traceOffRoots, raw.traceLevel ?? defaults.traceLevel, char?.id)
    // 层数 / 覆盖率缺省为空（全部按 mx 满层）：空设置不写键，保持协战 loadout 的紧凑形状
    const traceStacks = normalizeTraceStacks(raw.traceStacks, char?.id)

    const normalized: AssistCharSettings = {
        charLevel: clampInteger(raw.charLevel, 1, 80, defaults.charLevel),
        charSkillLevel: normalizeCharSkillLevels(raw.charSkillLevel ?? defaults.charSkillLevel),
        // 溯级缺省取该协战角色最大溯级（旧档缺字段 → max），显式 0 表示关闭
        traceLevel: resolveHighestActiveRoot(traceOffRoots, char?.id),
        traceOffRoots,
        ...(traceStacks.length ? { traceStacks } : {}),
        // 未配置角色时技能名无意义；角色技能表里找不到时回退首个技能，保证计算不会落在未知技能上
        baseName: char ? (skillNames.includes(baseName) ? baseName : (skillNames[0] ?? "")) : "",
        extraMastery: typeof raw.extraMastery === "string" ? raw.extraMastery : defaults.extraMastery,
        weaponLevel: clampInteger(raw.weaponLevel, 1, 80, defaults.weaponLevel),
        weaponRefine: clampInteger(raw.weaponRefine, 0, 5, defaults.weaponRefine),
        targetFunction: typeof raw.targetFunction === "string" ? raw.targetFunction : defaults.targetFunction,
        customVariables: Array.isArray(raw.customVariables)
            ? raw.customVariables.filter(
                  (entry): entry is [string, string] => Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string"
              )
            : defaults.customVariables.map(([name, expression]) => [name, expression]),
        dotSettings: normalizeAssistDotSettings(raw.dotSettings, defaults.dotSettings),
        // 旧存档 / 新对象缺失启用位时按是否配置了有效角色推断
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : Boolean(char),
        auraMod: Number.isFinite(raw.auraMod) && (raw.auraMod as number) >= 0 ? Math.round(raw.auraMod as number) : 0,
        charMods: normalizeModSlots(raw.charMods ?? defaults.charMods, MOD_SLOT_COUNTS.角色),
        meleeMods: normalizeModSlots(raw.meleeMods ?? defaults.meleeMods, MOD_SLOT_COUNTS.近战),
        rangedMods: normalizeModSlots(raw.rangedMods ?? defaults.rangedMods, MOD_SLOT_COUNTS.远程),
        skillWeaponMods: normalizeModSlots(raw.skillWeaponMods ?? defaults.skillWeaponMods, MOD_SLOT_COUNTS.同律),
        modVariantIndex: 0,
        modVariants: normalizeModVariants(raw.modVariants ?? defaults.modVariants),
        buffs: normalizeAssistBuffs(raw.buffs, defaults.buffs),
        customBuff: normalizeAssistCustomBuff(raw.customBuff, defaults.customBuff),
        useGlobal: typeof raw.useGlobal === "boolean" ? raw.useGlobal : defaults.useGlobal,
        effectConfig: normalizeEffectConfig(raw.effectConfig, defaults.effectConfig),
    }

    normalized.modVariantIndex = clampInteger(raw.modVariantIndex ?? defaults.modVariantIndex, 0, normalized.modVariants.length, 0)
    return normalized
}

/**
 * 将外部载入的角色配置补齐为当前版本所需结构。
 * @param settings 待补齐的角色配置
 * @returns 结构完整的角色配置
 */
export function normalizeCharSettings(settings?: CharSettingsInput | null): CharSettings {
    const normalized = createDefaultCharSettings()
    if (!settings || typeof settings !== "object") {
        return normalized
    }

    const entries = Object.entries(settings) as [keyof CharSettings, unknown][]
    entries.forEach(([key, value]) => {
        // actions 支持为空：缺失/null/局部形状由 normalizeInlineActions 统一处理，这里跳过通用合并
        if (key === "actions" || !(key in normalized) || value === undefined) {
            return
        }
        const defaultValue = normalized[key]

        if (Array.isArray(defaultValue)) {
            if (Array.isArray(value)) {
                ;(normalized[key] as typeof defaultValue) = value as typeof defaultValue
            }
            return
        }

        if (defaultValue && typeof defaultValue === "object") {
            if (value && typeof value === "object" && !Array.isArray(value)) {
                ;(normalized[key] as typeof defaultValue) = {
                    ...defaultValue,
                    ...(value as typeof defaultValue),
                }
            }
            return
        }

        if (typeof value === typeof defaultValue) {
            ;(normalized[key] as typeof defaultValue) = value as typeof defaultValue
        }
    })

    // team1/team2 兼容旧格式（角色名）与新格式（角色 id）：统一归一化为角色 id
    for (const key of ["team1", "team2"] as const) {
        const value = settings[key]
        if (value === undefined || value === null || value === "-") continue
        if (typeof value === "number") {
            normalized[key] = value
        } else if (typeof value === "string") {
            const char = charMap.get(value)
            // 查不到时保留原值，避免旧存档丢失
            normalized[key] = (char?.id ?? value) as CharSettings[typeof key]
        }
    }

    // 归一化BUFF覆盖率为合理精度：仅序列化设置过的覆盖率（第三元素），默认100%时保持旧的两元素格式
    normalized.buffs = normalized.buffs.map(buff => {
        const [name, level, coverage] = buff
        if (coverage === undefined || coverage >= 1) {
            return [name, level]
        }
        return [name, level, roundBuffValue(coverage)]
    })

    // 归一化自定义BUFF数值精度，清理旧存档中的浮点尾差（如 0.23499999），保持向前兼容
    normalized.customBuff = normalized.customBuff.map(([property, value]) => [property, roundBuffValue(value)])

    // 归一化潜质槽位：固定 4 槽，剔除重复（同一潜质只保留一槽）与已下线的潜质档位，并压紧到前几槽。
    // 早期版本曾把「潜质条目 id」直接存成数字，形状不对的槽位一律丢弃（存档脏数据不能让页面初始化抛错）。
    normalized.traits = normalizeTraitSlots(normalized.traits)

    // 旧存档迁移：把 BUFF 列表里勾选的魔灵内容搬进魔灵/潜质字段（潜质 → 潜质槽，魔灵被动/主动 → 魔灵选择）
    migrateLegacyPetBuffs(normalized)

    // 归一化魔灵：数据更新后已不存在的魔灵 id 回退为未选择，突破等级与主动技覆盖率钳制到合法区间
    if (!Number.isFinite(normalized.petId) || !petMap.has(normalized.petId)) {
        normalized.petId = 0
    }
    normalized.petLevel = Number.isFinite(normalized.petLevel)
        ? Math.max(0, Math.min(PET_BREAKTHROUGH_MAX_LEVEL, Math.round(normalized.petLevel)))
        : PET_BREAKTHROUGH_MAX_LEVEL
    normalized.petCoverage = Number.isFinite(normalized.petCoverage) ? Math.max(0, Math.min(1, roundBuffValue(normalized.petCoverage))) : 1
    normalized.petAutoCoverage = normalized.petAutoCoverage !== false

    // team1Weapon/team2Weapon 兼容旧格式（武器名）与新格式（武器 id）：统一归一化为武器 id
    for (const key of ["team1Weapon", "team2Weapon"] as const) {
        const value = settings[key]
        if (value === undefined || value === null || value === "-") continue
        if (typeof value === "number") {
            normalized[key] = value
        } else if (typeof value === "string") {
            const weapon = weaponNameMap.get(value)
            // 查不到时保留原值，避免旧存档丢失
            normalized[key] = (weapon?.id ?? value) as CharSettings[typeof key]
        }
    }

    // 协战构筑 id 只接受非空且非 "-" 的字符串（服务器构筑 id 为字符串，"-" 是未关联的占位值）
    for (const key of ["team1Build", "team2Build"] as const) {
        const value = settings[key]
        const trimmed = typeof value === "string" ? value.trim() : ""
        normalized[key] = trimmed && trimmed !== "-" ? trimmed : "-"
    }

    // 归一化协战构筑的 MOD 变体（A/B/C），非法值与旧存档缺省一律回落到配置 A
    for (const key of ["team1BuildVariant", "team2BuildVariant"] as const) {
        normalized[key] = normalizeModVariantLetter(settings[key])
    }

    // 主控目标函数启用位：非布尔值（旧存档缺失、脏数据）一律视为启用
    normalized.mainTargetEnabled = typeof settings.mainTargetEnabled === "boolean" ? settings.mainTargetEnabled : true

    // 协战 loadout 必须显式逐字段归一化：通用浅合并不会校验嵌套数组 / 对象；
    // team1/team2 已在上面归一化为角色 id，这里据其推断默认技能与启用状态
    normalized.assist1 = normalizeAssistSideSettings(settings.assist1, normalized.team1, createDefaultAssistSideSettings())
    normalized.assist2 = normalizeAssistSideSettings(settings.assist2, normalized.team2, createDefaultAssistSideSettings())

    // 升华配置必须显式归一化：通用浅合并会丢失天赋等级 / 装备组 / 变体等嵌套结构，缺失与脏数据一律回到关闭状态
    normalized.transcend = normalizeTranscendSettings(settings.transcend)

    // 归一化内联动作：支持为空（缺失/null/局部），运行时永远补齐为可用结构
    normalized.actions = normalizeInlineActions((settings as CharSettingsInput).actions)

    // 归一化技能等级：兼容老格式单个数字（如 12 → [12, 12, 12]）
    normalized.charSkillLevel = normalizeCharSkillLevels(settings.charSkillLevel)

    // 溯源等级：缺省取最大（具体角色的上限在计算期按角色数据钳制），显式 0 表示关闭
    normalized.traceOffRoots = resolveTraceOffRoots(settings.traceOffRoots, settings.traceLevel, undefined)
    // 旧溯级与关闭列表保持同一口径：全开时 traceLevel 恒为上限，序列化省略空列表后可安全迁移
    normalized.traceLevel = resolveHighestActiveRoot(normalized.traceOffRoots, undefined)
    // 溯源层数 / 覆盖率：主控归一化期不知道角色 id，先按通用上限钳制，收集期再按角色 mx 钳制
    normalized.traceStacks = normalizeTraceStacks(settings.traceStacks, undefined)

    // 旧 `*溯` 手写 BUFF 迁移：能映射的写入溯级并从 BUFF 列表移除，避免与新溯源区双计。
    // 显式携带关闭列表（含空数组）一律尊重；迁移激活只对字段缺失的旧档生效
    migrateLegacyTraceSettings(normalized, {
        main: Array.isArray(settings.traceOffRoots),
        assist1: Array.isArray(settings.assist1?.traceOffRoots),
        assist2: Array.isArray(settings.assist2?.traceOffRoots),
    })

    // 归一化 MOD 变体：补齐槽位结构，并把激活变体索引钳制到已有范围内
    normalized.modVariants = normalizeModVariants(settings.modVariants)
    normalized.modVariantIndex = Number.isFinite(settings.modVariantIndex)
        ? Math.max(0, Math.min(normalized.modVariants.length, Math.round(settings.modVariantIndex as number)))
        : 0

    return normalized
}

/**
 * 旧存档迁移：把 BUFF 列表里勾选的魔灵内容搬进魔灵/潜质字段。
 *
 * 历史版本把魔灵潜质与魔灵被动/主动技当成普通 BUFF 勾选（BUFF 列表现已不再展示它们），
 * 因此载入时按名称识别并迁移，避免同一效果既留在 BUFF 列表、又出现在新面板里被重复计算：
 * - `魔灵潜质:<潜质名>` → 潜质槽 `[基础潜质 id, 等级]`（等级沿用勾选的 BUFF 等级）；
 * - 魔灵名 → 该魔灵的被动物；`魔灵名(主动)` → 该魔灵的主动技，并沿用勾选的覆盖率；
 * - 迁移后从 BUFF 列表移除；无法识别归属的魔灵相关 BUFF 一并移除（否则会变成隐藏但仍在生效的幽灵 BUFF）。
 * @param settings 已补齐字段的角色配置（原地修改）
 */
function migrateLegacyPetBuffs(settings: CharSettings): void {
    const buffs = settings.buffs
    if (!buffs.length) return

    const traits = normalizeTraitSlots(settings.traits)
    const usedBids = new Set(traits.filter((slot): slot is [number, number] => slot !== null).map(slot => slot[0]))
    // 新字段已有魔灵选择时不再被旧 BUFF 覆盖（只搬还没搬过的内容）
    const hadPet = Boolean(settings.petId)
    let petId = settings.petId
    let petCoverage = settings.petCoverage
    let petLevel = settings.petLevel
    let petLevelTaken = hadPet
    const remaining: typeof buffs = []
    let migrated = false

    for (const buff of buffs) {
        const [name, level, coverage] = buff
        const origin = resolvePetBuffName(name)
        if (!origin) {
            remaining.push(buff)
            continue
        }
        migrated = true
        if (origin.kind === "trait") {
            const { trait } = origin
            // 同一潜质只占一槽；等级取档位对应的等级（BUFF 等级与潜质等级一一对应）
            const level0 = Math.max(1, Math.min(TRAIT_MAX_LEVEL, Math.round(level)))
            if (!usedBids.has(trait.bid)) {
                const slotIndex = traits.indexOf(null)
                if (slotIndex !== -1) {
                    traits[slotIndex] = [trait.bid, level0]
                    usedBids.add(trait.bid)
                }
            }
            continue
        }
        if (!petId) petId = origin.petId
        // 主动技的覆盖率与突破等级只在「本次迁移才选上魔灵」时沿用旧 BUFF 的值
        if (!hadPet && origin.active && typeof coverage === "number") petCoverage = coverage
        if (!petLevelTaken && Number.isFinite(level)) {
            petLevel = Math.max(0, Math.min(PET_BREAKTHROUGH_MAX_LEVEL, Math.round(level)))
            petLevelTaken = true
        }
    }

    if (!migrated) return
    settings.buffs = remaining
    settings.traits = traits
    settings.petId = petId
    settings.petLevel = petLevel
    settings.petCoverage = petCoverage
}

/**
 * 旧 `*溯` 迁移出的根源必须立即生效：从关闭列表中移除 1..grade（字段缺失时先按旧档口径补齐）。
 * @param target 该侧设置
 * @param grade 迁移出的最高根源
 */
function activateMigratedTraceRoots(target: { traceOffRoots?: number[] }, grade: number): void {
    if (grade <= 0) return
    target.traceOffRoots = (target.traceOffRoots ?? []).filter(root => !(root >= 1 && root <= grade))
}

/**
 * 旧存档迁移：把已迁入结构化溯源表的 `*溯` 手写 BUFF 转成溯级，并从 BUFF 列表移除，
 * 避免同一效果既由溯源区自动注入、又留在手动列表里被双计。
 * - `菲娜4溯` / `菲娜6溯` → 主控或对应协战侧溯级；
 * - `菲娜被动+1溯`（及已删除的 `*旧` 载体）→ 1、2 根源 + `菲娜被动(团队)`
 *   （P 等级由有效等级解析；45% / 24% 由溯源规则与 1 溯源效果提供）；
 * - 无法映射的旧条目保留手选并提示一次，不静默丢弃构筑能力。
 * - 迁移激活只用于旧档：输入显式携带 `traceOffRoots` 时一律尊重用户关闭的根源。
 * - 迁移结束后按关闭列表重新同步溯级，保证旧字段与生效集合一致。
 * @param settings 已补齐字段的角色配置（原地修改）
 * @param explicitOffRoots 各侧输入是否显式携带 `traceOffRoots`（含空数组）
 */
function migrateLegacyTraceSettings(settings: CharSettings, explicitOffRoots: { main: boolean; assist1: boolean; assist2: boolean }): void {
    const unmapped: string[] = []
    const main = migrateLegacyTraceBuffs(settings.buffs)
    settings.buffs = main.buffs
    if (!explicitOffRoots.main) activateMigratedTraceRoots(settings, main.grade)
    settings.traceLevel = resolveHighestActiveRoot(settings.traceOffRoots ?? [], undefined)
    unmapped.push(...main.unmapped)
    for (const key of ["assist1", "assist2"] as const) {
        const assist = settings[key]
        if (!assist) continue
        const teamId = key === "assist1" ? settings.team1 : settings.team2
        const charId = typeof teamId === "number" ? teamId : undefined
        const side = migrateLegacyTraceBuffs(assist.buffs, charId)
        assist.buffs = side.buffs
        if (!explicitOffRoots[key]) activateMigratedTraceRoots(assist, side.grade)
        assist.traceLevel = resolveHighestActiveRoot(assist.traceOffRoots ?? [], charId)
        unmapped.push(...side.unmapped)
    }
    if (unmapped.length) warnUnmappedLegacyTraceBuffs([...new Set(unmapped)])
}

/**
 * 紧凑输出：主控空的关闭根源 / 层数设置不写入（加载方恢复为全部激活 / 满层）。
 * 协战侧保持完整字段形状（U88a 存档契约），只在主控省这两项。
 * @param output 序列化输出（原地修改）
 */
function stripEmptyTraceFields(output: Record<string, unknown>): void {
    if (Array.isArray(output.traceOffRoots) && output.traceOffRoots.length === 0) delete output.traceOffRoots
    if (Array.isArray(output.traceStacks) && output.traceStacks.length === 0) delete output.traceStacks
}

/**
 * 将角色配置标准化后序列化，确保覆盖率和自定义 BUFF 数值使用稳定格式。
 * 未配置的 actions（未启用且各列表均为空，含缺失/null）会被直接省略，以简化配置文件大小；
 * 未使用升华（关闭且无天赋、无装备）时省略 `transcend`，使用时输出 U96 压缩载荷。
 * @param settings 待序列化的角色配置（actions 支持为空）
 * @returns JSON 文本
 */
export function serializeCharSettings(settings: CharSettingsInput | null | undefined): string {
    const normalized = normalizeCharSettings(settings)
    const output = { ...normalized } as unknown as Record<string, unknown>
    if (isEmptyTranscendSettings(normalized.transcend)) delete output.transcend
    else output.transcend = encodeTranscendSettings(normalized.transcend)
    if (isEmptyInlineActions(normalized.actions)) delete output.actions
    stripEmptyTraceFields(output)
    return JSON.stringify(output)
}

/**
 * 序列化用于分享 / 上传的角色配置：结构与 `serializeCharSettings` 相同（含 U96 压缩），
 * 但升华装备只保留当前激活变体（不重复写顶层三组），使启用升华后的分享载荷保持紧凑；
 * 未使用升华时与 `serializeCharSettings` 同口径省略 `transcend` 键（载入方据此保留本地升华）。
 * 本地存档 / 缓存键请继续使用 `serializeCharSettings`（保留全部变体）。
 * @param settings 待序列化的角色配置（actions 支持为空）
 * @returns JSON 文本
 */
export function serializeCharSettingsForShare(settings: CharSettingsInput | null | undefined): string {
    const normalized = normalizeCharSettings(settings)
    const active = getActiveGearVariant(normalized.transcend)
    const transcend: TranscendSettings = active
        ? {
              ...normalized.transcend,
              gearVariants: [
                  {
                      id: active.id,
                      mainGear: normalized.transcend.mainGear,
                      assist1Gear: normalized.transcend.assist1Gear,
                      assist2Gear: normalized.transcend.assist2Gear,
                  },
              ],
              activeGearVariant: active.id,
          }
        : normalized.transcend
    const output = { ...normalized } as unknown as Record<string, unknown>
    if (isEmptyTranscendSettings(transcend)) delete output.transcend
    else output.transcend = encodeTranscendSettings(transcend)
    if (isEmptyInlineActions(normalized.actions)) delete output.actions
    stripEmptyTraceFields(output)
    return JSON.stringify(output)
}
