import { useLocalStorage } from "@vueuse/core"
import { computed, type Ref } from "vue"
import { createDefaultCharSettings, normalizeCharSettings, type SignatureWeapon } from "@/data/charSettings"

export type {
    BackgroundActions,
    CharSettings,
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
    CHAR_SKILL_LEVEL_DEFAULT,
    CHAR_SKILL_LEVEL_MAX,
    CHAR_SKILL_LEVEL_MIN,
    createDefaultCharSettings,
    createEmptyModVariant,
    createModVariantFrom,
    defaultCharSettings,
    getModVariantAura,
    getModVariantCount,
    getModVariantIndex,
    getModVariantLetter,
    getModVariantSlots,
    MOD_SLOT_COUNTS,
    MOD_SLOT_TYPES,
    MOD_VARIANT_LETTERS,
    MOD_VARIANT_MAX_COUNT,
    normalizeCharSettings,
    normalizeCharSkillLevels,
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
