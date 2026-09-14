import { useLocalStorage } from "@vueuse/core"
import { computed, type Ref } from "vue"
import { charMap, petMap, weaponNameMap } from "@/data/d"
import { PET_BREAKTHROUGH_MAX_LEVEL } from "@/data/leveled/LeveledPet"
import { normalizeTraitSlots, resolvePetBuffName, TRAIT_MAX_LEVEL, type TraitSlot } from "@/data/petTrait"
import { roundBuffValue } from "@/util"

const LEGACY_CUSTOM_BUFF_STORAGE_KEY = "customBuff"

/** 专武信息：武器 id 与所在槽位类型 */
export type SignatureWeapon = { id: number; type: "近战" | "远程" }

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
        team2: "-" as number | "-",
        team2Weapon: "-" as number | "-",
        /** 2 号协战角色关联的服务器构筑 id（"-" 表示未关联） */
        team2Build: "-",
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
                const slotIndex = traits.findIndex(slot => slot === null)
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
