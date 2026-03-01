<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useSettingStore } from "@/store/setting"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"
import { LeveledChar, LeveledSkillWeapon } from "../data"
import { type CharExt, charExtData } from "../data/d/charext.data"
import { type CharVoice, charVoiceData } from "../data/d/charvoice.data"
import type { Char } from "../data/data-types"
import { formatProp } from "../util"

const props = defineProps<{
    char: Char
}>()
const setting = useSettingStore()

// 当前角色等级
const currentLevel = ref(80) // 默认80级
// 当前技能等级
const currentSkillLevel = ref(12)
const activeBottomTab = ref<"profile" | "voice">("profile")
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
    en: async () => (await import("../data/d/charext.en.data")).charExtData_en,
    jp: async () => (await import("../data/d/charext.jp.data")).charExtData_jp,
    kr: async () => (await import("../data/d/charext.kr.data")).charExtData_kr,
    fr: async () => (await import("../data/d/charext.fr.data")).charExtData_fr,
    tc: async () => (await import("../data/d/charext.tc.data")).charExtData_tc,
}
const charVoiceLoaderMap: Record<VoiceExtendedLocale, () => Promise<CharVoice[]>> = {
    en: async () => (await import("../data/d/charvoice.en.data")).charVoiceData_en,
    jp: async () => (await import("../data/d/charvoice.jp.data")).charVoiceData_jp,
    kr: async () => (await import("../data/d/charvoice.kr.data")).charVoiceData_kr,
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

const leveledWeapons = computed(() => {
    return props.char.同律武器
        ? props.char.同律武器.map(weapon => new LeveledSkillWeapon(weapon, currentSkillLevel.value, currentLevel.value))
        : null
})
const localizedCharExtData = ref<CharExt[]>(charExtData)
const localizedCharVoiceData = ref<CharVoice[]>(charVoiceData)

/**
 * 将设置语言代码映射为角色档案文本语言。
 * @param language 设置语言代码
 * @returns 角色档案语言
 */
function resolveCharExtLocaleBySetting(language: string): CharExtLocale {
    if (language.startsWith("en")) return "en"
    if (language.startsWith("ja")) return "jp"
    if (language.startsWith("ko")) return "kr"
    if (language.startsWith("fr")) return "fr"
    if (language === "zh-TW" || language.startsWith("zh-Hant")) return "tc"
    return "zh"
}

const charExtList = computed(() => localizedCharExtData.value.filter(item => item.charId === props.char.id))
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
        activeBottomTab.value = "profile"
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
    <div class="p-3 space-y-4">
        <div class="flex items-center gap-3 p-3">
            <SRouterLink :to="`/db/char/${char.id}`" class="text-lg font-bold link link-primary">
                {{ $t(char.名称) }}
            </SRouterLink>
            <span class="text-xs text-base-content/70">ID: {{ char.id }}</span>
            <div class="text-sm text-base-content/70 flex items-center gap-2">
                <div class="px-1.5 py-0.5 rounded bg-base-200 text-base-content">
                    {{ $t(`${char.属性}属性`) }}
                </div>
                <div v-if="char.阵营" class="ml-auto text-xs text-base-content/70">
                    {{ $t(char.阵营) }}
                </div>
            </div>
        </div>

        <div class="flex justify-center items-center">
            <img :src="leveledChar.url" class="w-28 object-cover rounded" />
        </div>

        <div class="px-3 pt-0 pb-1 flex flex-wrap gap-2 text-xs text-base-content/80">
            <span v-if="char.版本" class="px-2 py-1 rounded bg-base-200">v{{ char.版本 }}</span>
            <span class="px-2 py-1 rounded bg-base-200">{{ char.精通.map(m => $t(m)).join("、") }}</span>
            <span v-if="char.别名" class="px-2 py-1 rounded bg-base-200">{{ $t(char.别名) }}</span>
            <span v-if="char.出生地" class="px-2 py-1 rounded bg-base-200">{{ $t("出生地") }}：{{ $t(char.出生地) }}</span>
            <span v-if="char.势力" class="px-2 py-1 rounded bg-base-200">{{ $t("势力") }}：{{ $t(char.势力) }}</span>
            <span v-if="char.生日" class="px-2 py-1 rounded bg-base-200">{{ $t("生日") }}：{{ char.生日 }}</span>
        </div>

        <!-- 等级调整 -->
        <div class="mb-3 p-3">
            <div class="flex items-center gap-4">
                <span class="text-sm min-w-12">Lv. <input v-model.number="currentLevel" type="text" class="w-12 text-center" /> </span>
                <input v-model.number="currentLevel" type="range" class="range range-primary range-xs grow" :min="1" :max="80" step="1" />
            </div>
        </div>

        <!-- 基础属性 -->
        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("char-build.base_attr") }}</div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div
                    v-for="attr in baseAttributes"
                    :key="attr.name"
                    class="flex justify-between items-center p-2 bg-base-300 rounded text-sm"
                >
                    <span class="text-base-content/70">{{ $t(attr.name) }}</span>
                    <span class="font-medium text-primary">{{ attr.value }}</span>
                </div>
            </div>
        </div>

        <!-- 加成属性 -->
        <div v-if="bonusAttributes.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("char-build.bonus_attr") }}</div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div
                    v-for="attr in bonusAttributes"
                    :key="attr.name"
                    class="flex justify-between items-center p-2 bg-base-300 rounded text-sm"
                >
                    <span class="text-base-content/70">{{ $t(attr.name) }}</span>
                    <span class="font-medium text-primary">{{ formatProp(attr.name, attr.value) }}</span>
                </div>
            </div>
        </div>

        <CharSkillShow :char="leveledChar" v-model="currentSkillLevel" />

        <!-- 溯源信息 -->
        <div v-if="char.溯源 && char.溯源.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("溯源") }}</div>
            <div class="space-y-3">
                <div v-for="(trace, index) in char.溯源" :key="index" class="text-sm">
                    <div class="mb-1">{{ $t("第" + ["一", "二", "三", "四", "五", "六"][index] + "根源") }}</div>
                    <div class="text-base-content/90">{{ $t(trace) }}</div>
                </div>
            </div>
        </div>

        <!-- 同律武器 -->
        <div v-if="char.同律武器 && char.同律武器.length > 0" class="p-1 bg-base-200 rounded">
            <div class="space-y-3">
                <div v-for="leveledWeapon in leveledWeapons" :key="leveledWeapon.id" class="p-2 rounded">
                    <div class="font-medium mb-1">{{ $t(leveledWeapon.名称) }}</div>
                    <div class="text-xs text-base-content/70 mb-4">
                        {{ leveledWeapon._originalWeaponData.类型.map(type => $t(type === "同律" ? "同律武器" : type)).join("、") }}
                    </div>

                    <div class="text-xs text-base-content/70 mb-2">{{ $t("char-build.base_attr") }}</div>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                            <span class="text-base-content/70">{{ $t("攻击") }}</span>
                            <span class="font-medium text-primary">{{ +leveledWeapon.基础攻击.toFixed(2) }}</span>
                        </div>
                        <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                            <span class="text-base-content/70">{{ $t("暴击") }}</span>
                            <span class="font-medium text-primary">{{
                                formatProp("基础暴击", leveledWeapon._originalWeaponData.暴击)
                            }}</span>
                        </div>
                        <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                            <span class="text-base-content/70">{{ $t("暴伤") }}</span>
                            <span class="font-medium text-primary">{{
                                formatProp("基础暴伤", leveledWeapon._originalWeaponData.暴伤)
                            }}</span>
                        </div>
                        <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                            <span class="text-base-content/70">{{ $t("触发") }}</span>
                            <span class="font-medium text-primary">{{
                                formatProp("基础触发", leveledWeapon._originalWeaponData.触发)
                            }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="p-3 bg-base-200 rounded space-y-3">
            <div class="flex flex-wrap gap-1 pb-1">
                <span
                    class="text-sm px-2 py-1 rounded cursor-pointer transition-colors duration-200 hover:bg-base-300"
                    :class="{ 'bg-primary text-white hover:bg-primary': activeBottomTab === 'profile' }"
                    @click="activeBottomTab = 'profile'"
                    >{{ $t("档案") }}</span
                >
                <span
                    class="text-sm px-2 py-1 rounded cursor-pointer transition-colors duration-200 hover:bg-base-300"
                    :class="{ 'bg-primary text-white hover:bg-primary': activeBottomTab === 'voice' }"
                    @click="activeBottomTab = 'voice'"
                    >{{ $t("语音") }}</span
                >
            </div>

            <div v-if="activeBottomTab === 'profile'" class="space-y-3">
                <div v-if="charExtList.length === 0" class="text-sm text-base-content/70">暂无角色档案数据</div>
                <div v-for="item in charExtList" :key="item.id" class="p-3 rounded bg-base-300/70 space-y-2">
                    <div class="flex items-center justify-between gap-2">
                        <div class="font-medium">{{ item.name }}</div>
                        <div class="text-xs text-base-content/70 shrink-0">{{ formatStoryText(item.unlock) }}</div>
                    </div>
                    <div class="text-sm whitespace-pre-line text-base-content/90">{{ formatStoryText(item.text) }}</div>
                </div>
            </div>

            <div v-else class="space-y-3">
                <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                    <button
                        v-for="option in voiceLocaleOptions"
                        :key="option.key"
                        type="button"
                        class="px-2 py-1 text-left rounded cursor-pointer transition-colors duration-200 hover:bg-base-300"
                        :class="selectedVoiceLocale === option.key ? 'bg-primary text-white hover:bg-primary' : 'bg-base-300/70'"
                        @click="selectedVoiceLocale = option.key"
                    >
                        <div class="text-sm font-medium">{{ option.label }}</div>
                        <div class="text-[11px] opacity-80">CV：{{ getCvNameByLocale(option.key) }}</div>
                    </button>
                </div>
                <div v-if="charVoiceList.length === 0" class="text-sm text-base-content/70">暂无角色语音数据</div>
                <div v-else-if="!char.icon" class="text-sm text-warning">当前角色缺少 icon，无法拼接语音资源地址</div>
                <div v-else class="space-y-2">
                    <div v-for="voice in charVoiceList" :key="voice.id" class="p-3 rounded bg-base-300/70">
                        <div class="flex items-start gap-3">
                            <div class="min-w-0 grow">
                                <div class="flex items-center justify-between gap-2 mb-1">
                                    <div class="font-medium text-sm truncate">{{ formatStoryText(voice.name) }}</div>
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
                                <div class="text-sm whitespace-pre-line text-base-content/90">{{ formatStoryText(voice.text) }}</div>
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
        </div>
    </div>
</template>
