import type { CharExt } from "./charext.data"
import { charExtData, charExtTextEn, charExtTextFr, charExtTextJp, charExtTextKr, charExtTextTc } from "./charext.data"

/**
 * 角色档案的按语言数据集。
 *
 * 不分语言文件：各语言共用一份中文结构，名称 / 解锁条件 / 正文的译文按语言各压成一张
 * id→文本大表（见 tools/import-i18n-data.ts），此处按需同步拼出本地化行。
 * 档案提供 zh / en / jp / kr / fr / tc 六套，与剧情数据语言（StoryLocale）完全一致。
 */

/** 档案数据集支持的语言 */
export type CharExtLocale = "zh" | "en" | "jp" | "kr" | "fr" | "tc"

type CharExtExtendedLocale = Exclude<CharExtLocale, "zh">

const charExtDataCache = new Map<CharExtLocale, CharExt[]>([["zh", charExtData]])

/**
 * 各语言档案 id→文本大表（名称 / 解锁条件 / 正文用 `${行id}#${字段}` 复合键）。
 * 不分语言文件，译文在导入阶段已压成大表，此处同步直取。
 */
const charExtTextTables: Record<CharExtExtendedLocale, Record<string, string>> = {
    en: charExtTextEn,
    jp: charExtTextJp,
    kr: charExtTextKr,
    fr: charExtTextFr,
    tc: charExtTextTc,
}

/**
 * 将设置语言代码或数据语言映射为档案语言。
 *
 * 同时接受两类写法：界面语言代码（`ja-JP` / `zh-TW`）与资料检索 Agent 的数据语言
 * （`jp` / `tc`），后者不是前者的前缀（`jp` 不以 `ja` 开头），必须单独判一次。
 * @param language 语言代码
 * @returns 档案语言
 */
export function resolveCharExtLocaleBySetting(language: string): CharExtLocale {
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
    if (text === "fr" || text.startsWith("fr-")) {
        return "fr"
    }
    if (text === "tc" || text === "zh-tw" || text === "zh-hk" || text.startsWith("zh-hant")) {
        return "tc"
    }

    return "zh"
}

/**
 * 根据语言取角色档案数据（同步）：中文直接返回原文，其余语言按 id→文本大表逐字段替换。
 * 结果按语言缓存；调用方原有的 `await` 照写无妨（await 非 Promise 值直接透传）。
 * @param locale 档案语言
 * @returns 角色档案数据
 */
export function loadCharExtDataByLocale(locale: CharExtLocale): CharExt[] {
    const cached = charExtDataCache.get(locale)

    if (cached) {
        return cached
    }

    const table = charExtTextTables[locale as CharExtExtendedLocale]
    const data = charExtData.map(item => ({
        ...item,
        name: table[`${item.id}#name`] ?? item.name,
        unlock: table[`${item.id}#unlock`] ?? item.unlock,
        text: table[`${item.id}#text`] ?? item.text,
    }))
    charExtDataCache.set(locale, data)

    return data
}

/**
 * 按语言取角色档案数据（同步，调用方原有的 `await` 照写无妨）。
 * @param language 语言代码
 * @returns 角色档案数据
 */
export function getLocalizedCharExtData(language: string): CharExt[] {
    return loadCharExtDataByLocale(resolveCharExtLocaleBySetting(language))
}

/**
 * 同步读取已缓存的角色档案数据。
 *
 * 供需要在同步路径里取数据的调用方使用（如资料检索 Agent 的模块条目）；
 * 大表随中文结构静态下发，任何语言都立即可用，不再有“尚未加载”的回退情形。
 * @param locale 档案语言
 * @returns 角色档案数据
 */
export function getCachedCharExtData(locale: CharExtLocale): CharExt[] {
    return loadCharExtDataByLocale(locale)
}
