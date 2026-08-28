<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { LeveledChar, LeveledSkillWeapon } from "@/data"
import { type SkinItem, skinData } from "@/data/d/accessory.data"
import { type CharExt, charExtData } from "@/data/d/charext.data"
import { type CharVoice, charVoiceData } from "@/data/d/charvoice.data"
import { resourceMap } from "@/data/d/resource.data"
import weaponData from "@/data/d/weapon.data"
import type { Char, Weapon } from "@/data/data-types"
import { LeveledWeapon } from "@/data/leveled/LeveledWeapon"
import { useSettingStore } from "@/store/setting"
import { formatProp } from "@/util"
import { resolveSkinIconUrl } from "@/utils/accessory-utils"
import { getRewardTypeText } from "@/utils/i18n-utils"
import { getRarityBadgeClass, getRarityGradientClass, getRarityName } from "@/utils/rarity-utils"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"

const props = defineProps<{
    char: Char
}>()
const setting = useSettingStore()

// 当前角色等级
const currentLevel = ref(80) // 默认80级
// 当前技能等级
const currentSkillLevel = ref(12)
const activeBottomTab = ref<"profile" | "skin" | "voice">("skin")
const currentVoiceId = ref<number | null>(null)
const isVoicePlaying = ref(false)
const voiceAudioRef = ref<HTMLAudioElement | null>(null)
type VoiceLocale = "zh" | "en" | "jp" | "kr"
const selectedVoiceLocale = ref<VoiceLocale>("zh")
const voiceLocaleOptions: { key: VoiceLocale; label: string; cvLabel: string }[] = [
    { key: "zh", label: "汉语", cvLabel: "中文CV" },
    { key: "en", label: "EN", cvLabel: "英文CV" },
    { key: "jp", label: "日本語", cvLabel: "日文CV" },
    { key: "kr", label: "한국어", cvLabel: "韩文CV" },
]

const VOICE_DATASET_BASE_URL = "https://modelscope.cn/datasets/pa001024/dna-voice-dataset/resolve/master"
type CharExtLocale = "zh" | "en" | "jp" | "kr" | "fr" | "tc"
type CharExtExtendedLocale = Exclude<CharExtLocale, "zh">
type VoiceExtendedLocale = Exclude<VoiceLocale, "zh">

const charExtDataCache: Partial<Record<CharExtLocale, CharExt[]>> = {
    zh: charExtData,
}
const charVoiceDataCache: Partial<Record<VoiceLocale, CharVoice[]>> = {
    zh: charVoiceData,
}
const charExtLoaderMap: Record<CharExtExtendedLocale, () => Promise<CharExt[]>> = {
    en: async () => (await import("@/data/d/charext.en.data")).charExtData_en,
    jp: async () => (await import("@/data/d/charext.jp.data")).charExtData_jp,
    kr: async () => (await import("@/data/d/charext.kr.data")).charExtData_kr,
    fr: async () => (await import("@/data/d/charext.fr.data")).charExtData_fr,
    tc: async () => (await import("@/data/d/charext.tc.data")).charExtData_tc,
}
const charVoiceLoaderMap: Record<VoiceExtendedLocale, () => Promise<CharVoice[]>> = {
    en: async () => (await import("@/data/d/charvoice.en.data")).charVoiceData_en,
    jp: async () => (await import("@/data/d/charvoice.jp.data")).charVoiceData_jp,
    kr: async () => (await import("@/data/d/charvoice.kr.data")).charVoiceData_kr,
}

// 创建LeveledChar实例
const leveledChar = computed(() => {
    return new LeveledChar(props.char.名称, currentLevel.value)
})

// 计算基础属性
const baseAttributes = computed(() => {
    return [
        { name: "攻击", value: leveledChar.value.基础攻击 },
        { name: "生命", value: leveledChar.value.基础生命 },
        { name: "防御", value: leveledChar.value.基础防御 },
        { name: "护盾", value: leveledChar.value.基础护盾 },
        { name: "最大神智", value: leveledChar.value.基础神智 },
    ]
})

// 计算加成属性
const bonusAttributes = computed(() => {
    if (!props.char.加成) return []
    return Object.entries(props.char.加成).map(([key, value]) => {
        return { name: key, value: value }
    })
})

const exclusiveWeapon = computed<Weapon | null>(() => {
    if (!props.char.专武) {
        return null
    }
    return weaponData.find(weapon => weapon.id === props.char.专武) || null
})

const leveledExclusiveWeapon = computed(() => {
    if (!exclusiveWeapon.value) {
        return null
    }
    return new LeveledWeapon(exclusiveWeapon.value, 5, currentLevel.value)
})

const leveledWeapons = computed(() => {
    return props.char.同律武器
        ? props.char.同律武器.map(weapon => new LeveledSkillWeapon(weapon, currentSkillLevel.value, currentLevel.value))
        : null
})

/**
 * 构建专武基础属性行数据。
 */
const exclusiveWeaponAttrs = computed<{ name: string; value: string }[]>(() => {
    if (!exclusiveWeapon.value || !leveledExclusiveWeapon.value) {
        return []
    }
    return [
        { name: "攻击", value: String(+leveledExclusiveWeapon.value.基础攻击.toFixed(2)) },
        { name: "暴击", value: formatProp("基础暴击", exclusiveWeapon.value.暴击) },
        { name: "暴伤", value: formatProp("基础暴伤", exclusiveWeapon.value.暴伤) },
        { name: "触发", value: formatProp("基础触发", exclusiveWeapon.value.触发) },
    ]
})

/**
 * 构建同律武器基础属性行数据（继承型同律武器无独立基础属性）。
 * @param leveledWeapon 同律武器实例
 * @returns 属性行数组；继承型返回空数组
 */
function getSkillWeaponAttrs(leveledWeapon: LeveledSkillWeapon): { name: string; value: string }[] {
    if (leveledWeapon.inherit) {
        return []
    }
    return [
        { name: "攻击", value: String(+leveledWeapon.基础攻击.toFixed(2)) },
        { name: "暴击", value: formatProp("基础暴击", leveledWeapon._originalWeaponData.暴击) },
        { name: "暴伤", value: formatProp("基础暴伤", leveledWeapon._originalWeaponData.暴伤) },
        { name: "触发", value: formatProp("基础触发", leveledWeapon._originalWeaponData.触发) },
    ]
}

/**
 * 判断同律武器是否存在可直接展示的真实图标。
 * @param weapon 同律武器
 * @returns 是否存在真实图标
 */
function hasRealSkillWeaponIcon(weapon: LeveledSkillWeapon): boolean {
    return !!weapon._originalWeaponData.icon && !weapon.url.endsWith("/_.webp")
}

/**
 * 获取同律武器回退用的技能遮罩图标。
 * 与 WeaponTab 保持一致，优先使用同律配置指向的角色技能图标。
 * @param weapon 同律武器
 * @returns 技能图标 URL
 */
function getSkillWeaponMaskUrl(weapon: LeveledSkillWeapon): string {
    const sourceSkill = leveledChar.value.技能[(weapon._originalWeaponData.skill ?? [1])[0]]
    return sourceSkill?.url || weapon.技能?.[0]?.url || ""
}

/**
 * 获取同律武器继承描述。
 * @param weapon 同律武器
 * @returns 继承描述文本
 */
function getSkillWeaponInheritDescription(weapon: LeveledSkillWeapon): string {
    if (weapon.inherit === "melee") return "继承近战武器属性"
    if (weapon.inherit === "ranged") return "继承远程武器属性"
    return ""
}
const localizedCharExtData = ref<CharExt[]>(charExtData)
const localizedCharVoiceData = ref<CharVoice[]>(charVoiceData)

/**
 * 将设置语言代码映射为角色档案文本语言。
 * @param language 设置语言代码
 * @returns 角色档案语言
 */
function resolveCharExtLocaleBySetting(language: string): CharExtLocale {
    if (language === "jiaojiao") return "en"
    if (language.startsWith("en")) return "en"
    if (language.startsWith("ja")) return "jp"
    if (language.startsWith("ko")) return "kr"
    if (language.startsWith("fr")) return "fr"
    if (language === "zh-TW" || language.startsWith("zh-Hant")) return "tc"
    return "zh"
}

const charExtList = computed(() => localizedCharExtData.value.filter(item => item.charId === props.char.id))
const charSkinList = computed<SkinItem[]>(() =>
    skinData
        .filter(item => item.charId === props.char.id)
        .slice()
        .sort((left, right) => {
            if ((left.release || "") !== (right.release || "")) {
                return (left.release || "").localeCompare(right.release || "", "zh-CN")
            }
            return right.rarity - left.rarity
        })
)
const storyTextConfig = computed<StoryTextConfig>(() => {
    return {
        nickname: setting.protagonistName1?.trim() || "维塔",
        nickname2: setting.protagonistName2?.trim() || "墨斯",
        gender: setting.protagonistGender,
        gender2: setting.protagonistGender2,
    }
})

/**
 * 解析角色档案/语音文本中的剧情占位符。
 * @param text 原始文本
 * @returns 替换后的文本
 */
function formatStoryText(text: string | undefined): string {
    if (!text) {
        return ""
    }

    return replaceStoryPlaceholders(text, storyTextConfig.value)
}

/**
 * 将设置语言代码映射为语音文本语言。
 * @param language 设置语言代码
 * @returns 语音语言
 */
function resolveVoiceLocaleBySetting(language: string): VoiceLocale {
    if (language === "jiaojiao") return "en"
    if (language.startsWith("en")) return "en"
    if (language.startsWith("ja")) return "jp"
    if (language.startsWith("ko")) return "kr"
    return "zh"
}

/**
 * 将语音文本语言映射为数据集目录语言代码。
 * @param locale 语音语言
 * @returns 数据集目录语言代码
 */
function resolveVoiceDatasetLanguage(locale: VoiceLocale): string {
    if (locale === "zh") return "ch"
    return locale
}

/**
 * 获取皮肤图标地址。
 * @param icon 图标名
 * @returns 图标地址
 */
function getSkinIconUrl(icon: string): string {
    return resolveSkinIconUrl(icon)
}

/**
 * 将皮肤默认奖励项转换为资源成本展示入参。
 * @param groupName 默认奖励分组名
 * @param item 皮肤默认奖励项
 * @returns ResourceCostItem 的 value
 */
function getSkinDefaultItemValue(
    groupName: string,
    item: { id: number; num: number }
): [number, number, "Resource" | "HeadSculpture" | "Hair"] {
    if (groupName === "Hair") {
        return [item.num, item.id, "Hair"]
    }
    if (groupName === "HeadSculpture") {
        return [item.num, item.id, "HeadSculpture"]
    }
    return [item.num, item.id, "Resource"]
}

/**
 * 将皮肤升级消耗转换为资源成本展示入参。
 * @param step 皮肤升级消耗
 * @returns ResourceCostItem 的 value
 */
function getSkinUpgradeValue(step: { amount: number; currencyId: number }): [number, number, "Resource"] {
    return [step.amount, step.currencyId, "Resource"]
}

const skinDefaultCostItems = computed(() =>
    charSkinList.value.flatMap(skin =>
        Object.entries(skin.defaultItem || {}).flatMap(([groupName, items]) =>
            items.map(item => ({
                skinId: skin.id,
                groupName,
                item,
            }))
        )
    )
)

const skinUpgradeCostItems = computed(() =>
    charSkinList.value.flatMap(skin =>
        (skin.upgrade || []).map(step => ({
            skinId: skin.id,
            step,
        }))
    )
)

const voiceLanguage = computed(() => resolveVoiceDatasetLanguage(selectedVoiceLocale.value))

/**
 * 加载当前语言的角色档案数据，并缓存已加载模块。
 * @param language 设置语言代码
 */
async function loadLocalizedCharExtData(language: string): Promise<void> {
    const locale = resolveCharExtLocaleBySetting(language)
    const cachedData = charExtDataCache[locale]
    if (cachedData) {
        if (setting.lang === language) {
            localizedCharExtData.value = cachedData
        }
        return
    }

    const data = await charExtLoaderMap[locale as CharExtExtendedLocale]()
    charExtDataCache[locale] = data
    if (setting.lang !== language) {
        return
    }
    localizedCharExtData.value = data
}

/**
 * 加载当前语音语言的角色语音数据，并缓存已加载模块。
 * @param locale 语音语言
 */
async function loadLocalizedCharVoiceData(locale: VoiceLocale): Promise<void> {
    const cachedData = charVoiceDataCache[locale]
    if (cachedData) {
        if (selectedVoiceLocale.value === locale) {
            localizedCharVoiceData.value = cachedData
        }
        return
    }

    const data = await charVoiceLoaderMap[locale as VoiceExtendedLocale]()
    charVoiceDataCache[locale] = data
    if (selectedVoiceLocale.value !== locale) {
        return
    }
    localizedCharVoiceData.value = data
}

const charVoiceList = computed(() => localizedCharVoiceData.value.filter(item => item.charId === props.char.id))

/**
 * 根据语音语言获取角色对应 CV 名称。
 * @param locale 语音语言
 * @returns 对应 CV 名称
 */
function getCvNameByLocale(locale: VoiceLocale): string {
    if (locale === "en") {
        return props.char.英文CV || "暂无"
    }
    if (locale === "jp") {
        return props.char.日文CV || "暂无"
    }
    if (locale === "kr") {
        return props.char.韩文CV || "暂无"
    }
    return props.char.中文CV || "暂无"
}

/**
 * 根据语音文本占位符判断是否需要拼接性别后缀。
 * 仅当文本中包含“需要区分读音”的性别占位符时返回后缀。
 * 对 `{性别:他|她}` / `{性别:他们|她们}` 等同音写法不追加后缀。
 * @param text 语音文本
 * @returns 语音资源性别后缀（`_m` / `_f`）或空字符串
 */
function resolveVoiceGenderSuffixByText(text: string): string {
    const placeholderRegex = /\{(性[别別]2?)[:：]([^|｜{}]*)[|｜]([^{}]*)\}/g
    const matchedPlaceholders = [...text.matchAll(placeholderRegex)]
    if (matchedPlaceholders.length === 0) {
        return ""
    }

    const homophoneNeutralPairs = new Set(["他|她", "他们|她们", "他們|她們"])

    const effectivePlaceholderKeys = matchedPlaceholders
        .filter(match => {
            const maleText = (match[2] || "").trim()
            const femaleText = (match[3] || "").trim()
            return !homophoneNeutralPairs.has(`${maleText}|${femaleText}`)
        })
        .map(match => match[1])

    if (effectivePlaceholderKeys.length === 0) {
        return ""
    }

    const hasPrimaryGenderPlaceholder = effectivePlaceholderKeys.some(key => key === "性别" || key === "性別")
    const targetGender = hasPrimaryGenderPlaceholder ? setting.protagonistGender : setting.protagonistGender2
    return targetGender === "male" ? "_m" : "_f"
}

/**
 * 根据语言、角色 icon 和语音资源名拼接语音地址。
 * @param voice 语音条目
 * @returns 可播放的语音 URL；缺少角色 icon 时返回空字符串
 */
function buildVoiceUrl(voice: CharVoice): string {
    if (!props.char.icon) {
        return ""
    }
    const language = voiceLanguage.value
    const genderSuffix = resolveVoiceGenderSuffixByText(voice.text)
    const res = encodeURIComponent(`${voice.res}${genderSuffix}`)
    return `${VOICE_DATASET_BASE_URL}/${language}/char/voice_${language}_${res}.ogg`
}

/**
 * 停止当前语音播放并清理播放状态。
 */
function stopVoicePlayback(): void {
    const audio = voiceAudioRef.value
    if (!audio) {
        return
    }
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
    currentVoiceId.value = null
    isVoicePlaying.value = false
}

/**
 * 点击语音条目时切换播放/暂停，并在首次点击时按需加载音频资源。
 * @param voice 语音条目
 */
async function toggleVoicePlayback(voice: CharVoice): Promise<void> {
    const audio = voiceAudioRef.value
    if (!audio) {
        return
    }

    const voiceUrl = buildVoiceUrl(voice)
    if (!voiceUrl) {
        return
    }

    if (currentVoiceId.value === voice.id) {
        if (audio.paused) {
            try {
                await audio.play()
            } catch (error) {
                console.error("角色语音播放失败:", error)
            }
        } else {
            audio.pause()
        }
        return
    }

    currentVoiceId.value = voice.id
    audio.pause()
    audio.currentTime = 0
    audio.src = voiceUrl

    try {
        await audio.play()
    } catch (error) {
        isVoicePlaying.value = false
        console.error("角色语音播放失败:", error)
    }
}

/**
 * 播放器播放事件回调。
 */
function handleVoicePlay(): void {
    isVoicePlaying.value = true
}

/**
 * 播放器暂停事件回调。
 */
function handleVoicePause(): void {
    isVoicePlaying.value = false
}

/**
 * 播放器结束事件回调。
 */
function handleVoiceEnded(): void {
    isVoicePlaying.value = false
    currentVoiceId.value = null
}

watch(
    () => props.char.id,
    () => {
        activeBottomTab.value = "skin"
        stopVoicePlayback()
    }
)

watch(
    () => setting.lang,
    async language => {
        selectedVoiceLocale.value = resolveVoiceLocaleBySetting(language)
        await loadLocalizedCharExtData(language)
    },
    { immediate: true }
)

watch(
    selectedVoiceLocale,
    async locale => {
        await loadLocalizedCharVoiceData(locale)
        stopVoicePlayback()
    },
    { immediate: true }
)

watch(
    () => [setting.protagonistGender, setting.protagonistGender2] as const,
    () => {
        stopVoicePlayback()
    }
)

watch(
    () => props.char.icon,
    () => {
        stopVoicePlayback()
    }
)

onBeforeUnmount(() => {
    stopVoicePlayback()
})
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 角色档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative flex items-start gap-3.5">
                <div class="size-20 shrink-0 overflow-hidden rounded-xs bg-linear-15 sm:size-24" :class="getRarityGradientClass(5)">
                    <ImageFallback :src="leveledChar.url" :alt="char.名称" class="w-full h-full object-cover object-top">
                        <img src="/imgs/webp/T_Head_Empty.webp" :alt="char.名称" class="w-full h-full object-cover object-top" />
                    </ImageFallback>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Character File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/char/${char.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(char.名称) }}
                        </SRouterLink>
                        <CopyID :id="char.id" />
                    </div>
                    <p v-if="char.别名" class="mt-1.5 text-sm text-base-content/55">{{ $t(char.别名) }}</p>

                    <!-- 元信息行：元素 / 阵营 / 版本 -->
                    <div class="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-base-content/60">
                        <span class="inline-flex items-center gap-1.5">
                            <img class="h-5 w-2.5 object-cover" :src="LeveledChar.elementUrl(char.属性)" :alt="$t(`${char.属性}属性`)" />
                            {{ $t(`${char.属性}属性`) }}
                        </span>
                        <template v-if="char.阵营">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span>{{ $t(char.阵营) }}</span>
                        </template>
                        <template v-if="char.版本">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span class="font-mono tabular-nums">v{{ char.版本 }}</span>
                        </template>
                    </div>
                    <!-- 档案行：精通 / 出生地 / 势力 / 生日 -->
                    <div class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-base-content/50">
                        <span>{{ char.精通.map(m => $t(m)).join("、") }}</span>
                        <template v-if="char.出生地">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span>{{ $t("出生地") }}：{{ $t(char.出生地) }}</span>
                        </template>
                        <template v-if="char.势力">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span>{{ $t("势力") }}：{{ $t(char.势力) }}</span>
                        </template>
                        <template v-if="char.生日">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span>{{ $t("生日") }}：{{ char.生日 }}</span>
                        </template>
                    </div>
                </div>
            </div>
        </header>

        <!-- 等级调整 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LEVEL" />
            <LevelSlider v-model="currentLevel" />
        </section>

        <!-- 基础属性 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ATTRIBUTES" :title="$t('char-build.base_attr')" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                <div
                    v-for="attr in baseAttributes"
                    :key="attr.name"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t(attr.name) }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ attr.value }}</span>
                </div>
            </div>
        </section>

        <!-- 加成属性 -->
        <section v-if="bonusAttributes.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BONUS" :title="$t('char-build.bonus_attr')" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                <div
                    v-for="attr in bonusAttributes"
                    :key="attr.name"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t(attr.name) }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        formatProp(attr.name, attr.value)
                    }}</span>
                </div>
            </div>
        </section>

        <CharSkillShow :char="leveledChar" v-model="currentSkillLevel" />

        <CharTraceShow :char="char" />

        <!-- 溯源突破消耗 -->
        <section
            v-if="char.第七溯源消耗 && char.第七溯源消耗.length > 0"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="UNLOCK" :title="$t('溯源突破')" />
            <div class="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                <ResourceCostItem
                    v-for="cost in char.第七溯源消耗"
                    :key="cost[0]"
                    :name="resourceMap.get(cost[0])?.name || String(cost[0])"
                    :value="cost[1]"
                />
            </div>
        </section>

        <!-- 专武 -->
        <section
            v-if="exclusiveWeapon && leveledExclusiveWeapon"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="SIGNATURE" :title="$t('专武')">
                <template #trailing>
                    <SRouterLink
                        :to="`/db/weapon/${exclusiveWeapon.id}`"
                        class="group inline-flex items-center gap-1 text-xs text-base-content/50 transition-colors duration-150 hover:text-primary"
                    >
                        {{ $t("查看详情") }}
                        <Icon
                            icon="ri:arrow-right-up-line"
                            class="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                        />
                    </SRouterLink>
                </template>
            </SectionHeader>

            <!-- 武器名片 -->
            <div class="mb-2 flex items-center gap-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <ImageFallback
                    :src="leveledExclusiveWeapon.url"
                    :alt="exclusiveWeapon.名称"
                    class="size-12 shrink-0 rounded-xs object-cover"
                />
                <div class="min-w-0">
                    <SRouterLink
                        :to="`/db/weapon/${exclusiveWeapon.id}`"
                        class="block truncate text-sm font-semibold transition-colors duration-150 hover:text-primary"
                    >
                        {{ $t(exclusiveWeapon.名称) }}
                    </SRouterLink>
                    <div class="mt-1 truncate text-[10px] text-base-content/45">
                        {{ exclusiveWeapon.类型.map(type => $t(type)).join(" / ") }}
                        ·
                        {{ $t(exclusiveWeapon.伤害类型) }}
                    </div>
                </div>
            </div>

            <!-- 基础属性 -->
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                <div
                    v-for="attr in exclusiveWeaponAttrs"
                    :key="attr.name"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t(attr.name) }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ attr.value }}</span>
                </div>
            </div>

            <!-- 熔炼效果 -->
            <div v-if="exclusiveWeapon.熔炼 && exclusiveWeapon.熔炼.length > 0" class="mt-2.5">
                <div class="mb-2 text-[11px] tracking-wide text-base-content/55">{{ $t("属性") }}</div>
                <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-relaxed text-base-content/85">
                    {{ exclusiveWeapon.熔炼[5] }}
                </div>
            </div>
        </section>

        <!-- 同律武器 -->
        <section
            v-if="char.同律武器 && char.同律武器.length > 0"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="CO-LAW" :title="$t('同律武器')" />
            <div class="space-y-3">
                <div
                    v-for="leveledWeapon in leveledWeapons"
                    :key="leveledWeapon.id"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex items-center gap-3">
                        <ImageFallback
                            v-if="hasRealSkillWeaponIcon(leveledWeapon)"
                            :src="leveledWeapon.url"
                            :alt="leveledWeapon.名称"
                            class="size-12 shrink-0 rounded-xs object-cover"
                        />
                        <div v-else class="size-12 shrink-0 rounded-xs">
                            <div
                                class="flex h-full w-full items-center justify-center bg-base-content"
                                :style="{ mask: `url(${getSkillWeaponMaskUrl(leveledWeapon)}) no-repeat center/68%` }"
                            />
                        </div>
                        <div class="min-w-0">
                            <div class="truncate text-sm font-semibold">{{ $t(leveledWeapon.名称) }}</div>
                            <div class="mt-1 truncate text-[10px] text-base-content/45">
                                {{
                                    leveledWeapon._originalWeaponData.类型.map(type => $t(type === "同律" ? "同律武器" : type)).join(" / ")
                                }}
                            </div>
                        </div>
                    </div>

                    <!-- 基础属性 / 继承说明 -->
                    <div
                        v-if="leveledWeapon.inherit"
                        class="mt-2.5 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm text-base-content/85"
                    >
                        {{ getSkillWeaponInheritDescription(leveledWeapon) }}
                    </div>
                    <template v-else>
                        <div class="mt-2.5 grid grid-cols-2 gap-1.5 md:grid-cols-4">
                            <div
                                v-for="attr in getSkillWeaponAttrs(leveledWeapon)"
                                :key="attr.name"
                                class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                            >
                                <span class="text-xs text-base-content/60">{{ $t(attr.name) }}</span>
                                <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                                    attr.value
                                }}</span>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </section>

        <CharExtraExcelWeaponUnlock :char="char" />

        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <AniTabs
                v-model="activeBottomTab"
                :tabs="[
                    { label: $t('皮肤'), value: 'skin' },
                    { label: $t('档案'), value: 'profile' },
                    { label: $t('语音'), value: 'voice' },
                ]"
            />

            <div v-if="activeBottomTab === 'profile'" class="mt-2 space-y-2">
                <div v-if="charExtList.length === 0" class="text-sm text-base-content/60">暂无角色档案数据</div>
                <div
                    v-for="item in charExtList"
                    :key="item.id"
                    class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 p-3"
                >
                    <div class="flex items-center justify-between gap-2">
                        <div class="font-medium">{{ item.name }}</div>
                        <div class="shrink-0 text-xs text-base-content/45">{{ formatStoryText(item.unlock) }}</div>
                    </div>
                    <div class="text-sm leading-relaxed whitespace-pre-line text-base-content/85">{{ formatStoryText(item.text) }}</div>
                </div>
            </div>

            <div v-else-if="activeBottomTab === 'skin'" class="mt-2 space-y-2">
                <div v-if="charSkinList.length === 0" class="text-sm text-base-content/60">暂无皮肤数据</div>
                <div v-else class="space-y-2">
                    <div
                        v-for="skin in charSkinList"
                        :key="skin.id"
                        class="space-y-3 rounded-xs border border-base-content/10 bg-base-content/3 p-3"
                    >
                        <div class="flex items-start gap-3">
                            <img :src="getSkinIconUrl(skin.icon)" :alt="skin.name" class="size-16 shrink-0 rounded-xs object-cover" />
                            <div class="min-w-0 flex-1">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="min-w-0">
                                        <div class="text-sm font-medium">{{ $t(skin.name) }}</div>
                                        <div class="mt-1 text-[10px] text-base-content/45">
                                            {{ skin.release ? `v${skin.release}` : "未标注版本" }}
                                        </div>
                                    </div>
                                    <span :class="getRarityBadgeClass(skin.rarity)">
                                        {{ getRarityName(skin.rarity) }}
                                    </span>
                                </div>
                                <div class="mt-2 text-sm leading-relaxed whitespace-pre-line text-base-content/85">{{ $t(skin.desc) }}</div>
                            </div>
                        </div>

                        <div v-if="skin.icon.startsWith('T_Head_') && skin.icon !== 'T_Head_Nvzhu'" class="space-y-2">
                            <div class="mb-2 text-[11px] tracking-wide text-base-content/55">立绘</div>
                            <ImagePreview
                                :thumb-url="`/imgs/bust/${skin.icon.replace('_Head', '_Bust')}.webp`"
                                :full-url="`https://cdn.dna-builder.cn/img/res/${skin.icon.replace('_Head', '_Bust')}.webp`"
                            />
                        </div>

                        <div v-if="skin.defaultItem && Object.keys(skin.defaultItem).length > 0" class="space-y-2">
                            <div class="mb-2 text-[11px] tracking-wide text-base-content/55">默认奖励</div>
                            <div class="space-y-2">
                                <div v-for="groupName in Object.keys(skin.defaultItem)" :key="`${skin.id}-${groupName}`" class="space-y-1">
                                    <div class="text-xs text-base-content/55">{{ $t(getRewardTypeText(groupName)) }}</div>
                                    <div class="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                                        <ResourceCostItem
                                            v-for="entry in skinDefaultCostItems.filter(
                                                entry => entry.skinId === skin.id && entry.groupName === groupName
                                            )"
                                            :key="`${entry.skinId}-${entry.groupName}-${entry.item.id}`"
                                            :name="entry.item.name"
                                            :value="getSkinDefaultItemValue(entry.groupName, entry.item)"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div v-if="skin.upgrade && skin.upgrade.length > 0" class="space-y-2">
                            <div class="mb-2 text-[11px] tracking-wide text-base-content/55">升级消耗</div>
                            <div class="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                                <div
                                    v-for="entry in skinUpgradeCostItems.filter(entry => entry.skinId === skin.id)"
                                    :key="`${entry.skinId}-${entry.step.step}`"
                                    class="space-y-1"
                                >
                                    <div class="font-mono text-[11px] tabular-nums text-base-content/55">Lv.{{ entry.step.step }}</div>
                                    <ResourceCostItem :name="entry.step.currency" :value="getSkinUpgradeValue(entry.step)" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="mt-2 space-y-3">
                <!-- 语音语言选择方章 -->
                <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1.5">
                    <button
                        v-for="option in voiceLocaleOptions"
                        :key="option.key"
                        type="button"
                        class="cursor-pointer rounded-xs border px-2.5 py-1.5 text-left transition-colors duration-150"
                        :class="
                            selectedVoiceLocale === option.key
                                ? 'border-primary bg-primary/10'
                                : 'border-base-content/15 hover:border-primary/40'
                        "
                        @click="selectedVoiceLocale = option.key"
                    >
                        <div class="text-sm font-medium" :class="selectedVoiceLocale === option.key ? 'text-primary' : ''">
                            {{ option.label }}
                        </div>
                        <div class="mt-0.5 text-[11px] text-base-content/50">CV：{{ getCvNameByLocale(option.key) }}</div>
                    </button>
                </div>
                <div v-if="charVoiceList.length === 0" class="text-sm text-base-content/60">暂无角色语音数据</div>
                <div v-else-if="!char.icon" class="text-sm text-warning">当前角色缺少 icon，无法拼接语音资源地址</div>
                <div v-else class="space-y-2">
                    <div
                        v-for="voice in charVoiceList"
                        :key="voice.id"
                        class="rounded-xs border border-base-content/10 bg-base-content/3 p-3"
                    >
                        <div class="flex items-start gap-3">
                            <div class="min-w-0 grow">
                                <div class="mb-1 flex items-center justify-between gap-2">
                                    <div class="truncate text-sm font-medium">{{ formatStoryText(voice.name) }}</div>
                                    <button type="button" class="btn btn-ghost btn-xs shrink-0" @click="toggleVoicePlayback(voice)">
                                        <Icon
                                            :icon="
                                                currentVoiceId === voice.id && isVoicePlaying
                                                    ? 'ri:pause-circle-line'
                                                    : 'ri:play-circle-line'
                                            "
                                        />
                                    </button>
                                </div>
                                <div class="text-sm leading-relaxed whitespace-pre-line text-base-content/85">
                                    {{ formatStoryText(voice.text) }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <audio
                ref="voiceAudioRef"
                class="hidden"
                preload="none"
                @ended="handleVoiceEnded"
                @pause="handleVoicePause"
                @play="handleVoicePlay"
            />
        </section>
    </div>
</template>
