import { type StoryGender, stripStoryTextTags } from "../../packages/data/story-text"
import { buildDialogueVoiceUrl } from "../../apps/web/src/utils/dialogue-voice"

export interface TtsVariant {
    gender: StoryGender | "neutral"
    fileSuffix: "" | "_m" | "_f"
    text: string
}

const HOMOPHONE_NEUTRAL_PAIRS = new Set(["他|她", "他们|她们", "他們|她們"])

const GENDER_PLACEHOLDER_REGEX = /\{(性[别別]2?)[:：]([^|丨{}]*)[|丨]([^|丨{}]*)\}/g

/**
 * 昵称占位符替换为默认主角名（与前端设置缺省一致：维塔/墨斯，第三人称不 manifesto 第二人称）。
 * @param text 原始剧情文本
 * @returns 处理后的文本
 */
export function stripNicknamePlaceholders(text: string): string {
    return text
        .replace(/\{nickname2\}/g, "墨斯")
        .replace(/\{nickname\}/g, "维塔")
        .replace(/ {2,}/g, " ")
        .replace(/\s+([，。？！、,.?!])/g, "$1")
        .replace(/^[，、。]+/g, "")
        .trim()
}

/**
 * 用前端同一套 URL 规则反推某条对白需要哪几个语音文件。
 * @param content 对话原文
 * @param npcId 说话人 npc id
 * @param language 站点语言代码
 * @param forceGenderNpcIds 主角占位 NPC id 集（与前端 nicknameNpcIds 同口径）
 * @returns 所需文件后缀（"" / "_m" / "_f" 的子集）
 */
export function requiredVoiceSuffixes(
    content: string,
    npcId: number | undefined,
    language: string,
    forceGenderNpcIds: Set<number>
): ("" | "_m" | "_f")[] {
    const probeVoice = "aistory/0"
    const suffixes = new Set<"" | "_m" | "_f">()
    for (const gender of ["male", "female"] as StoryGender[]) {
        for (const gender2 of ["male", "female"] as StoryGender[]) {
            const url = buildDialogueVoiceUrl({
                voice: probeVoice,
                text: content,
                npcId,
                forceGenderNpcIds: [...forceGenderNpcIds],
                language,
                gender,
                gender2,
            })
            const fileName = url.split("/").pop() ?? ""
            const match = fileName.match(/(_[mf])\.ogg$/)
            suffixes.add(match ? (match[1] as "_m" | "_f") : "")
        }
    }
    return [...suffixes]
}

/**
 * 按目标文件后缀解析 TTS 文本（_m 用男性措辞，其余用女性措辞）。
 * @param text 去标签去昵称后的文本
 * @param suffix 目标文件后缀
 * @returns TTS 输入文本
 */
export function resolveVariantText(text: string, suffix: "" | "_m" | "_f"): string {
    return resolveGenderPlaceholders(text, suffix === "_m" ? "male" : "female")
}
/**
 * 按语言特性展开性别变体：中文同音（他/她）只出一版，
 * 其余语言中有实际发音差异的性别词则出 _m / _f 两版。
 * @param text 去标签后的原始文本
 * @param language 站点语言代码
 * @returns 待合成变体
 */
export function expandGenderVariants(text: string, language: string): TtsVariant[] {
    GENDER_PLACEHOLDER_REGEX.lastIndex = 0
    const matches = [...text.matchAll(GENDER_PLACEHOLDER_REGEX)]
    if (!matches.length) {
        return [{ gender: "neutral", fileSuffix: "", text }]
    }
    const effective = matches.filter(match => {
        const maleText = (match[2] || "").trim()
        const femaleText = (match[3] || "").trim()
        return !HOMOPHONE_NEUTRAL_PAIRS.has(`${maleText}|${femaleText}`)
    })
    if (!effective.length) {
        return [{ gender: "neutral", fileSuffix: "", text: resolveGenderPlaceholders(text, "female") }]
    }
    const datasetLanguage = resolveDatasetLanguage(language)
    if (datasetLanguage === "ch" || datasetLanguage === "jp") {
        return [{ gender: "neutral", fileSuffix: "", text: resolveGenderPlaceholders(text, "female") }]
    }
    return [
        { gender: "male", fileSuffix: "_m", text: resolveGenderPlaceholders(text, "male") },
        { gender: "female", fileSuffix: "_f", text: resolveGenderPlaceholders(text, "female") },
    ]
}

function resolveGenderPlaceholders(text: string, gender: StoryGender): string {
    return text.replace(/\{(性[别別]2?)[:：]([^|丨{}]*)[|丨]([^|丨{}]*)\}/g, (_, _key: string, maleText: string, femaleText: string) =>
        gender === "male" ? maleText : femaleText
    )
}

function resolveDatasetLanguage(language: string): string {
    if (language.startsWith("zh")) return "ch"
    if (language.startsWith("jp") || language.startsWith("ja")) return "jp"
    if (language.startsWith("kr") || language.startsWith("ko")) return "kr"
    if (language.startsWith("en")) return "en"
    if (language.startsWith("fr")) return "fr"
    return "ch"
}

/**
 * 生成单条对白的全部 TTS 输入文本：去样式标签 → 去昵称 → 按性别展开。
 * @param rawContent 对话原文
 * @param language 站点语言代码
 * @param nickname 回填昵称（为空则删除占位符）
 * @param forceGenderVariants 强制出 _m / _f 两版（主角占位 NPC：播放 URL 必带性别后缀）
 * @returns TTS 变体列表
 */
export function buildTtsVariants(rawContent: string, language: string, nickname = "", forceGenderVariants = false): TtsVariant[] {
    const plain = stripStoryTextTags(rawContent ?? "")
    if (!plain.trim() || !/[\p{L}\p{N}]/u.test(plain)) return []
    const withoutNickname = nickname
        ? plain.replace(/\{nickname2\}/g, "墨斯").replace(/\{nickname\}/g, nickname)
        : stripNicknamePlaceholders(plain)
    const variants = expandGenderVariants(withoutNickname.trim(), language).filter(variant => variant.text.trim().length > 0)
    if (forceGenderVariants && variants.length === 1 && variants[0].fileSuffix === "") {
        const text = variants[0].text
        return [
            { gender: "male", fileSuffix: "_m", text },
            { gender: "female", fileSuffix: "_f", text },
        ]
    }
    return variants
}

/**
 * 以前端 URL 规则为唯一口径生成待合成变体：需要哪几个文件就出哪几个。
 * @param rawContent 对话原文
 * @param npcId 说话人 npc id
 * @param language 站点语言代码
 * @param forceGenderNpcIds 主角占位 NPC id 集
 * @returns TTS 变体列表
 */
export function buildRequiredVariants(
    rawContent: string,
    npcId: number | undefined,
    language: string,
    forceGenderNpcIds: Set<number>
): TtsVariant[] {
    const plain = stripStoryTextTags(rawContent ?? "")
    if (!plain.trim() || !/[\p{L}\p{N}]/u.test(plain)) return []
    const clean = stripNicknamePlaceholders(plain).trim()
    if (!clean) return []
    return requiredVoiceSuffixes(rawContent, npcId, language, forceGenderNpcIds)
        .map(suffix => ({
            gender: (suffix === "_m" ? "male" : suffix === "_f" ? "female" : "neutral") as TtsVariant["gender"],
            fileSuffix: suffix,
            text: resolveVariantText(clean, suffix),
        }))
        .filter(variant => variant.text.trim().length > 0)
}
