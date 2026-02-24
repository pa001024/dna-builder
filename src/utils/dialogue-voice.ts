import type { StoryGender } from "@/utils/story-text"

export interface DialogueVoiceOptions {
    datasetBaseUrl?: string
    forceGenderNpcId?: number
    forceGenderNpcIds?: number[]
    gender: StoryGender
    gender2: StoryGender
    language: string
    npcId?: number
    text: string
    voice?: string
}

const DEFAULT_DATASET_BASE_URL = "https://modelscope.cn/datasets/pa001024/dna-voice-dataset/resolve/master"

/**
 * 将站点语言代码映射为语音数据集目录语言代码。
 * @param language 站点语言代码
 * @returns 数据集语言代码
 */
export function resolveDialogueVoiceLanguage(language: string): string {
    if (language.startsWith("zh")) return "ch"
    if (language.startsWith("ja")) return "jp"
    if (language.startsWith("ko")) return "kr"
    if (language.startsWith("en")) return "en"
    if (language.startsWith("fr")) return "fr"
    return "ch"
}

/**
 * 根据文本占位符与 NPC 规则判断语音是否需要性别后缀。
 * @param options 判定参数
 * @returns 语音性别后缀（`_m` / `_f`）或空字符串
 */
export function resolveDialogueVoiceGenderSuffix(options: Omit<DialogueVoiceOptions, "datasetBaseUrl" | "language" | "voice">): string {
    const { text, npcId, gender, gender2, forceGenderNpcId = 100001, forceGenderNpcIds } = options

    const forceNpcIdSet = new Set<number>(forceGenderNpcIds?.length ? forceGenderNpcIds : [forceGenderNpcId])

    if (npcId !== undefined && forceNpcIdSet.has(npcId)) {
        return gender === "male" ? "_m" : "_f"
    }

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
    const targetGender = hasPrimaryGenderPlaceholder ? gender : gender2
    return targetGender === "male" ? "_m" : "_f"
}

/**
 * 将原始对话语音键（如 `inv/Heitao/001/C85F3E30`）映射为完整语音地址。
 * @param options 语音映射参数
 * @returns 语音 URL；输入无效时返回空字符串
 */
export function buildDialogueVoiceUrl(options: DialogueVoiceOptions): string {
    const {
        voice,
        text,
        npcId,
        language,
        gender,
        gender2,
        forceGenderNpcId = 100001,
        forceGenderNpcIds,
        datasetBaseUrl = DEFAULT_DATASET_BASE_URL,
    } = options

    if (!voice) {
        return ""
    }

    const trimmedVoice = voice.trim()
    if (!trimmedVoice) {
        return ""
    }

    if (/^https?:\/\//i.test(trimmedVoice)) {
        return trimmedVoice
    }

    const normalizedVoice = trimmedVoice.replace(/\\/g, "/")
    const voiceSegments = normalizedVoice.split("/").filter(Boolean)
    if (!voiceSegments.length) {
        return ""
    }

    const folder = voiceSegments[0]
    const flattenedVoice = voiceSegments.join("_")
    const datasetLanguage = resolveDialogueVoiceLanguage(language)
    const genderSuffix = resolveDialogueVoiceGenderSuffix({
        text,
        npcId,
        gender,
        gender2,
        forceGenderNpcId,
        forceGenderNpcIds,
    })

    const mappedFileName = `voice_${datasetLanguage}_${flattenedVoice}${genderSuffix}.ogg`
    return `${datasetBaseUrl}/${datasetLanguage}/${folder}/${mappedFileName}`
}
