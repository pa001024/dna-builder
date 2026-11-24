import { useLocalStorage } from "@vueuse/core"
import { isEqual } from "lodash-es"
import { computed, type Ref, watch } from "vue"
import {
    type CharSettings,
    createDefaultCharSettings,
    normalizeCharSettings,
    type SignatureWeapon,
    serializeCharSettings,
} from "@/data/charSettings"

export type {
    BackgroundActions,
    CharSettings,
    CharSettingsInput,
    CharSkillLevels,
    DotFrequencySettings,
    InlineActions,
    ModSlot,
    ModSlotType,
    ModVariant,
    ModVariantLetter,
    NormalActions,
    SignatureWeapon,
} from "@/data/charSettings"
export {
    addModVariant,
    CHAR_SKILL_LEVEL_BASE_MAX,
    CHAR_SKILL_LEVEL_DEFAULT,
    CHAR_SKILL_LEVEL_MAX,
    CHAR_SKILL_LEVEL_MIN,
    createDefaultCharSettings,
    createDefaultInlineActions,
    createEmptyModVariant,
    createModVariantFrom,
    defaultCharSettings,
    getModVariantAura,
    getModVariantCount,
    getModVariantIndex,
    getModVariantLetter,
    getModVariantSlots,
    isEmptyInlineActions,
    MOD_SLOT_COUNTS,
    MOD_SLOT_TYPES,
    MOD_VARIANT_LETTERS,
    MOD_VARIANT_MAX_COUNT,
    normalizeCharSettings,
    normalizeCharSkillLevels,
    normalizeInlineActions,
    normalizeModVariantLetter,
    removeLastModVariant,
    resolveCharSkillLevel,
    resolveModVariantLetter,
    serializeCharSettings,
    setModVariantAura,
} from "@/data/charSettings"

const LEGACY_CUSTOM_BUFF_STORAGE_KEY = "customBuff"

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
 * 角色配置的本地存储编解码：写入走 `serializeCharSettings`（含 U96 升华压缩），
 * 读取先 `normalizeCharSettings` 再落内存；损坏内容回退该角色的默认配置。
 * @param charIdRef 角色 id 引用（读取时解析专武默认值）
 * @param getSignatureWeapon 专武解析回调（可选）
 * @returns useLocalStorage 的 serializer
 */
function createCharSettingsSerializer(charIdRef: Ref<number>, getSignatureWeapon?: (charId: number) => SignatureWeapon | null) {
    const fallback = () => createDefaultCharSettings(getSignatureWeapon?.(charIdRef.value))
    return {
        read: (raw: string): CharSettings => {
            try {
                const parsed = JSON.parse(raw)
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback()
                return normalizeCharSettings(parsed)
            } catch {
                return fallback()
            }
        },
        write: (value: CharSettings) => serializeCharSettings(value),
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
    // 自定义 serializer 让本地主存档也落 U96 压缩格式；读取端归一化，切换角色 / 刷新都走同一口径
    const charSettings = useLocalStorage(charSettingsKey, createDefaultCharSettings(getSignatureWeapon?.(charIdRef.value)), {
        serializer: createCharSettingsSerializer(charIdRef, getSignatureWeapon),
    })

    // 无 Storage 环境（node / SSR 测试）下 useLocalStorage 退化为普通 ref，换键不会重读；
    // 值可能被直接赋成旧存档形状，这里在换键后补一次归一化兜底（已归一化时 isEqual 命中，不触发双写）。
    watch(
        charSettingsKey,
        () => {
            const normalized = normalizeCharSettings(charSettings.value)
            if (!isEqual(normalized, charSettings.value)) charSettings.value = normalized
        },
        { flush: "pre" }
    )

    if (charSettings.value.customBuff.length === 0) {
        const legacyCustomBuff = readLegacyCustomBuff()
        if (legacyCustomBuff.length > 0) {
            charSettings.value.customBuff = legacyCustomBuff
            localStorage.removeItem(LEGACY_CUSTOM_BUFF_STORAGE_KEY)
        }
    }

    return charSettings
}
