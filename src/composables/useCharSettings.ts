import { useLocalStorage } from "@vueuse/core"
import { computed, type Ref } from "vue"

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
        buffs: [] as [string, number][],
        customBuff: [] as [string, number][],
        team1: "-",
        team1Weapon: "-" as number | "-",
        team2: "-",
        team2Weapon: "-" as number | "-",
        timelineDPS: false,
        /** 是否使用全局背包特效等级（true 时忽略 effectConfig，行为同旧版） */
        useGlobal: false,
        /** 构筑本地特效等级配置（key: `m:<modId>` / `w:<weaponId>`，缺省为最大） */
        effectConfig: {} as Record<string, number>,
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

    return normalized
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
 * 创建角色配置本地存储引用。
 * 可选传入专武解析回调：首次创建默认值时由调用方解析角色专武并写入默认武器，避免在 composable 中静态依赖数据包。
 * @param charNameRef 角色名称引用
 * @param getSignatureWeapon 专武解析回调（可选）
 * @returns 角色配置引用
 */
export const useCharSettings = (charNameRef?: Ref<string>, getSignatureWeapon?: (charName: string) => SignatureWeapon | null) => {
    const charName = charNameRef ?? useLocalStorage("selectedChar", "赛琪")
    const charSettingsKey = computed(() => `build.${charName.value}`)
    const charSettings = useLocalStorage(charSettingsKey, createDefaultCharSettings(getSignatureWeapon?.(charName.value)))
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
