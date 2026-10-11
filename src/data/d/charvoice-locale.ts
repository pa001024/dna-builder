import type { CharVoice } from "./charvoice.data"
import { charVoiceData, charVoiceTextEn, charVoiceTextFr, charVoiceTextJp, charVoiceTextKr, charVoiceTextTc } from "./charvoice.data"

/**
 * 角色语音的按语言数据集。
 *
 * 不分语言文件：各语言共用一份中文结构，名称 / 台词的译文按语言各压成一张
 * id→文本大表（见 tools/import-i18n-data.ts），此处按需同步拼出本地化行。
 * 上游已有 tc / fr 语音文本，一并纳入（此前只有中文 / 英文 / 日文 / 韩文四套）。
 */

/** 语音数据集支持的语言 */
export type CharVoiceLocale = "zh" | "en" | "jp" | "kr" | "tc" | "fr"

type CharVoiceExtendedLocale = Exclude<CharVoiceLocale, "zh">

const charVoiceDataCache = new Map<CharVoiceLocale, CharVoice[]>([["zh", charVoiceData]])

/**
 * 各语言语音 id→文本大表（名称 / 台词用 `${行id}#${字段}` 复合键）。
 * 不分语言文件，译文在导入阶段已压成大表，此处同步直取。
 */
const charVoiceTextTables: Record<CharVoiceExtendedLocale, Record<string, string>> = {
    en: charVoiceTextEn,
    jp: charVoiceTextJp,
    kr: charVoiceTextKr,
    tc: charVoiceTextTc,
    fr: charVoiceTextFr,
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
    if (text === "tc" || text === "zh-tw" || text === "zh-hk" || text.startsWith("zh-hant")) {
        return "tc"
    }
    if (text === "fr" || text.startsWith("fr-")) {
        return "fr"
    }

    return "zh"
}

/**
 * 根据语言取角色语音数据（同步）：中文直接返回原文，其余语言按 id→文本大表逐字段替换。
 * 结果按语言缓存；调用方原有的 `await` 照写无妨（await 非 Promise 值直接透传）。
 * @param locale 语音语言
 * @returns 角色语音数据
 */
export function loadCharVoiceDataByLocale(locale: CharVoiceLocale): CharVoice[] {
    const cached = charVoiceDataCache.get(locale)

    if (cached) {
        return cached
    }

    const table = charVoiceTextTables[locale as CharVoiceExtendedLocale]
    const data = charVoiceData.map(item => ({
        ...item,
        name: table[`${item.id}#name`] ?? item.name,
        text: table[`${item.id}#text`] ?? item.text,
    }))
    charVoiceDataCache.set(locale, data)

    return data
}

/**
 * 按语言取角色语音数据（同步，调用方原有的 `await` 照写无妨）。
 * @param language 语言代码
 * @returns 角色语音数据
 */
export function getLocalizedCharVoiceData(language: string): CharVoice[] {
    return loadCharVoiceDataByLocale(resolveCharVoiceLocaleBySetting(language))
}

/**
 * 同步读取已缓存的角色语音数据。
 *
 * 供需要在同步路径里取数据的调用方使用（如资料检索 Agent 的模块条目）；
 * 大表随中文结构静态下发，任何语言都立即可用，不再有“尚未加载”的回退情形。
 * @param locale 语音语言
 * @returns 角色语音数据
 */
export function getCachedCharVoiceData(locale: CharVoiceLocale): CharVoice[] {
    return loadCharVoiceDataByLocale(locale)
}
