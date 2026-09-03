import { useLocalStorage } from "@vueuse/core"
import { computed, type Ref } from "vue"
import { charMap, weaponNameMap } from "@/data/d"
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
        team1: "-" as number | "-",
        team1Weapon: "-" as number | "-",
        team2: "-" as number | "-",
        team2Weapon: "-" as number | "-",
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

    return normalized
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
