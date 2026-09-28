import type { CharExt } from "./charext.data"
import { charExtData } from "./charext.data"

/**
 * 角色档案的按语言数据集。
 *
 * 档案正文与语音一样，各语言是各自一套数据（不是同一份数据换文本键），
 * 因此按语言分别加载；档案提供 zh / en / jp / kr / fr / tc 六套，
 * 与剧情数据语言（StoryLocale）完全一致。
 */

/** 档案数据集支持的语言 */
export type CharExtLocale = "zh" | "en" | "jp" | "kr" | "fr" | "tc"

type CharExtExtendedLocale = Exclude<CharExtLocale, "zh">

const charExtDataCache: Partial<Record<CharExtLocale, CharExt[]>> = {
    zh: charExtData,
}

const charExtLoaderMap: Record<CharExtExtendedLocale, () => Promise<CharExt[]>> = {
    en: async () => (await import("./charext.en.data")).charExtData_en,
    jp: async () => (await import("./charext.jp.data")).charExtData_jp,
    kr: async () => (await import("./charext.kr.data")).charExtData_kr,
    fr: async () => (await import("./charext.fr.data")).charExtData_fr,
    tc: async () => (await import("./charext.tc.data")).charExtData_tc,
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
 * 根据语言加载角色档案数据，并在模块内缓存结果。
 * @param locale 档案语言
 * @returns 角色档案数据
 */
export async function loadCharExtDataByLocale(locale: CharExtLocale): Promise<CharExt[]> {
    const cached = charExtDataCache[locale]

    if (cached) {
        return cached
    }

    const data = await charExtLoaderMap[locale as CharExtExtendedLocale]()
    charExtDataCache[locale] = data

    return data
}

/**
 * 按语言取角色档案数据（异步加载并缓存）。
 * @param language 语言代码
 * @returns 角色档案数据
 */
export function getLocalizedCharExtData(language: string): Promise<CharExt[]> {
    return loadCharExtDataByLocale(resolveCharExtLocaleBySetting(language))
}

/**
 * 同步读取已缓存的角色档案数据。
 *
 * 供需要在同步路径里取数据的调用方使用（如资料检索 Agent 的模块条目）；
 * 目标语言尚未加载时回退中文，保证返回结构始终可用。
 * @param locale 档案语言
 * @returns 角色档案数据
 */
export function getCachedCharExtData(locale: CharExtLocale): CharExt[] {
    return charExtDataCache[locale] ?? charExtData
}
