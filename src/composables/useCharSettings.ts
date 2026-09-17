import { useLocalStorage } from "@vueuse/core"
import { computed, type Ref } from "vue"
import { charMap, petMap, weaponNameMap } from "@/data/d"
import { PET_BREAKTHROUGH_MAX_LEVEL } from "@/data/leveled/LeveledPet"
import { normalizeTraitSlots, resolvePetBuffName, TRAIT_MAX_LEVEL, type TraitSlot } from "@/data/petTrait"
import { roundBuffValue } from "@/util"

const LEGACY_CUSTOM_BUFF_STORAGE_KEY = "customBuff"

/** 专武信息：武器 id 与所在槽位类型 */
export type SignatureWeapon = { id: number; type: "近战" | "远程" }

/** MOD 槽位：`[魔之楔 id, 等级]`，null 表示空槽 */
export type ModSlot = [number, number] | null

/** MOD 槽位类型（取值与 ModEditer 的 type 属性一致） */
export type ModSlotType = "角色" | "近战" | "远程" | "同律"

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

/** DOT 频率设置：每种来源每秒造成伤害的次数（与 CharBuild.DotFrequencySettings 结构一致） */
export interface DotFrequencySettings {
    /** 技能DOT每秒次数 */
    skill: number
    /** 近战武器DOT每秒次数 */
    melee: number
    /** 远程武器DOT每秒次数 */
    ranged: number
    /** 同律武器DOT每秒次数 */
    skillweapon: number
    /** 手动设置存在自属性追加伤害（仅允许设置为有；未设置时按属性与来源自动判定） */
    forceOwnAdditionalDamage?: boolean
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
        customVariables: [] as [string, string][],
        charSkillLevel: 10,
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
        timelineDPS: false,
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
        actions: {
            enable: false,
            i: [],
            b: [],
            hp: [],
            bgs: [],
        } as InlineActions,
    }
}

export const defaultCharSettings = createDefaultCharSettings()

export type CharSettings = ReturnType<typeof createDefaultCharSettings>

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

/**
 * 将外部载入的角色配置补齐为当前版本所需结构。
 * @param settings 待补齐的角色配置
 * @returns 结构完整的角色配置
 */
export function normalizeCharSettings(settings?: Partial<CharSettings> | null): CharSettings {
    const normalized = createDefaultCharSettings()
    if (!settings || typeof settings !== "object") {
        return normalized
    }

    const entries = Object.entries(settings) as [keyof CharSettings, unknown][]
    entries.forEach(([key, value]) => {
        if (!(key in normalized) || value === undefined) {
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
 * 将角色配置标准化后序列化，确保覆盖率和自定义 BUFF 数值使用稳定格式。
 * @param settings 待序列化的角色配置
 * @returns JSON 文本
 */
export function serializeCharSettings(settings: Partial<CharSettings> | null | undefined): string {
    return JSON.stringify(normalizeCharSettings(settings))
}

/**
 * 读取旧版全局自定义 BUFF 存档。
 * @returns 旧版自定义 BUFF 条目
 */
function readLegacyCustomBuff(): [string, number][] {
    if (typeof localStorage === "undefined") {
        return []
    }

    const raw = localStorage.getItem(LEGACY_CUSTOM_BUFF_STORAGE_KEY)
    if (!raw) {
        return []
    }

    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) {
            return []
        }

        return parsed.filter(item => Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "number") as [
            string,
            number,
        ][]
    } catch {
        return []
    }
}

/**
 * 创建角色配置本地存储引用（以角色 id 为键）。
 * 可选传入专武解析回调：首次创建默认值时由调用方解析角色专武并写入默认武器，避免在 composable 中静态依赖数据包。
 * @param charIdRef 角色 id 引用（存储键主键）
 * @param getSignatureWeapon 专武解析回调（可选，按角色 id 解析）
 * @returns 角色配置引用
 */
export const useCharSettings = (charIdRef: Ref<number>, getSignatureWeapon?: (charId: number) => SignatureWeapon | null) => {
    const charSettingsKey = computed(() => `build.${charIdRef.value}`)
    const charSettings = useLocalStorage(charSettingsKey, createDefaultCharSettings(getSignatureWeapon?.(charIdRef.value)))
    charSettings.value = normalizeCharSettings(charSettings.value)

    if (charSettings.value.customBuff.length === 0) {
        const legacyCustomBuff = readLegacyCustomBuff()
        if (legacyCustomBuff.length > 0) {
            charSettings.value.customBuff = legacyCustomBuff
            localStorage.removeItem(LEGACY_CUSTOM_BUFF_STORAGE_KEY)
        }
    }

    return charSettings
}
