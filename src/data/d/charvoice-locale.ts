import type { CharVoice } from "./charvoice.data"
import { charVoiceData } from "./charvoice.data"

/**
 * 角色语音的按语言数据集。
 *
 * 语音的每条台词在各语言里是独立数据集（不是同一份数据换文本键），
 * 因此这里按语言分别加载；语音只提供中文 / 英文 / 日文 / 韩文四套，
 * 其余语言（繁中、法文）回退中文。
 */

/** 语音数据集支持的语言 */
export type CharVoiceLocale = "zh" | "en" | "jp" | "kr"

type CharVoiceExtendedLocale = Exclude<CharVoiceLocale, "zh">

const charVoiceDataCache: Partial<Record<CharVoiceLocale, CharVoice[]>> = {
    zh: charVoiceData,
}

const charVoiceLoaderMap: Record<CharVoiceExtendedLocale, () => Promise<CharVoice[]>> = {
    en: async () => (await import("./charvoice.en.data")).charVoiceData_en,
    jp: async () => (await import("./charvoice.jp.data")).charVoiceData_jp,
    kr: async () => (await import("./charvoice.kr.data")).charVoiceData_kr,
}

/**
 * 将设置语言或数据语言映射为语音语言。
 * @param language 语言代码
 * @returns 语音语言
 */
export function resolveCharVoiceLocaleBySetting(language: string): CharVoiceLocale {
    const text = `${language ?? ""}`.trim().toLowerCase()

    if (text === "jiaojiao" || text === "en" || text.startsWith("en-")) {
        return "en"
    }
    if (text === "jp" || text === "ja" || text.startsWith("ja-")) {
        return "jp"
    }
    if (text === "kr" || text === "ko" || text.startsWith("ko-")) {
        return "kr"
    }

    return "zh"
}

/**
 * 根据语言加载角色语音数据，并在模块内缓存结果。
 * @param locale 语音语言
 * @returns 角色语音数据
 */
export async function loadCharVoiceDataByLocale(locale: CharVoiceLocale): Promise<CharVoice[]> {
    const cached = charVoiceDataCache[locale]

    if (cached) {
        return cached
    }

    const data = await charVoiceLoaderMap[locale as CharVoiceExtendedLocale]()
    charVoiceDataCache[locale] = data

    return data
}

/**
 * 按语言取角色语音数据（异步加载并缓存）。
 * @param language 语言代码
 * @returns 角色语音数据
 */
export function getLocalizedCharVoiceData(language: string): Promise<CharVoice[]> {
    return loadCharVoiceDataByLocale(resolveCharVoiceLocaleBySetting(language))
}

/**
 * 同步读取已缓存的角色语音数据。
 *
 * 供需要在同步路径里取数据的调用方使用（如资料检索 Agent 的模块条目）；
 * 目标语言尚未加载时回退中文，保证返回结构始终可用。
 * @param locale 语音语言
 * @returns 角色语音数据
 */
export function getCachedCharVoiceData(locale: CharVoiceLocale): CharVoice[] {
    return charVoiceDataCache[locale] ?? charVoiceData
}
