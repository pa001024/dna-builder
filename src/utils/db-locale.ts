import i18next from "i18next"
import { getLocalizedCharVoiceData } from "@/data/d/charvoice-locale"
import { resolveStoryLocaleBySetting, type StoryLocale } from "@/data/d/story-locale"
import {
    applyPackTranslations,
    getPackTranslationTable,
    isPackTranslationLocale,
    registerPackTranslationInvalidation,
} from "@/data/translations-pack"

/**
 * 资料检索 Agent 的数据语言。
 *
 * 取值与剧情数据语言（StoryLocale）完全一致，这样 lang 参数可以原样透传给
 * 按语言切换的数据集加载器（剧情对话、角色语音等）。
 */
export type DBAgentLang = StoryLocale

/** 全部数据语言，供工具 schema 的 enum 使用 */
export const DB_AGENT_LANGS: DBAgentLang[] = ["zh", "en", "jp", "kr", "fr", "tc"]

/** 数据语言 → i18next 语言代码 */
const I18N_LANGUAGE_MAP: Record<DBAgentLang, string> = {
    zh: "zh-CN",
    tc: "zh-TW",
    en: "en",
    jp: "ja",
    kr: "ko",
    fr: "fr",
}

/**
 * 把数据语言转成 i18next 语言代码。
 * @param lang 数据语言
 * @returns i18next 语言代码
 */
export function toI18nLanguage(lang: DBAgentLang): string {
    return I18N_LANGUAGE_MAP[lang]
}

/**
 * 归一化外部传入的语言写法。
 *
 * 模型可能给 `zh` / `jp`（本项目的数据语言），也可能直接抄界面语言 `zh-CN` / `ja-JP`，
 * 这里统一收敛到数据语言，无法识别时返回 undefined 交给调用方回退当前语言。
 * @param raw 原始语言写法
 * @returns 归一化后的数据语言；无法识别时为 undefined
 */
export function normalizeDBAgentLang(raw: unknown): DBAgentLang | undefined {
    const text = `${raw ?? ""}`.trim().toLowerCase()

    if (!text) {
        return undefined
    }

    if (text === "zh" || text.startsWith("zh-cn") || text.startsWith("zh-hans")) {
        return "zh"
    }
    if (text === "tc" || text === "zh-tw" || text.startsWith("zh-hant")) {
        return "tc"
    }
    if (text === "jp" || text === "ja" || text.startsWith("ja-")) {
        return "jp"
    }
    if (text === "kr" || text === "ko" || text.startsWith("ko-")) {
        return "kr"
    }
    if (text === "en" || text === "jiaojiao" || text.startsWith("en-")) {
        return "en"
    }
    if (text === "fr" || text.startsWith("fr-")) {
        return "fr"
    }

    return undefined
}

/**
 * 取当前界面语言对应的数据语言。
 * @returns 数据语言
 */
export function resolveCurrentDBAgentLang(): DBAgentLang {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("setting_lang") : ""
    const language = stored || (typeof navigator !== "undefined" ? navigator.language : "zh-CN")

    return resolveStoryLocaleBySetting(language)
}

/** 已就绪的语言（i18n 资源与按语言切分的数据集都已加载） */
const readyLanguages = new Set<DBAgentLang>()

/**
 * 加载一个 i18n 语言包，失败时只告警——检索层会退回原文，不影响流程。
 * @param i18nLang i18next 语言代码
 */
async function ensureI18nBundle(i18nLang: string): Promise<void> {
    if (!i18next.isInitialized || i18next.hasResourceBundle(i18nLang, "translation")) {
        return
    }

    try {
        await i18next.loadLanguages(i18nLang)
    } catch (error) {
        console.warn("[db-locale] 翻译资源加载失败，将按原文返回", { i18nLang, error })
    }
}

/**
 * 确保指定语言可用：翻译资源与「按语言切分的数据集」都就绪。
 *
 * 检索期需要在同步路径里读译文与数据集（如模块条目、模块名），这里统一做一次异步预热。
 * 预热范围只含体积小、且被同步读取的角色语音；剧情正文由检索函数自身异步取用，不在此处加载。
 * @param lang 数据语言
 */
export async function ensureDBAgentLangReady(lang: DBAgentLang): Promise<void> {
    if (readyLanguages.has(lang)) {
        return
    }

    readyLanguages.add(lang)

    // 中文是游戏原文基准：模块名等要先取中文再翻成目标语言，因此中文包必须可用
    await ensureI18nBundle("zh-CN")

    if (lang !== "zh") {
        await ensureI18nBundle(toI18nLanguage(lang))
        // 游戏文案随数据包下发，先确保它已注入 i18next 再建索引，
        // 否则会缓存一份「只有界面文案」的不完整索引
        if (isPackTranslationLocale(lang)) {
            await applyPackTranslations(lang)
        }
        // 预建反向索引：首次检索时不必现场扫全量词条
        getReverseIndex(lang)
    }

    try {
        await getLocalizedCharVoiceData(lang)
    } catch (error) {
        console.warn("[db-locale] 语音数据集加载失败，将回退中文原文", { lang, error })
    }
}

/**
 * 把数据的原文（中文）翻成目标语言，未收录时原样返回。
 * @param text 原文
 * @param lang 目标语言
 * @returns 译文或原文
 */
export function translateDBAgentText(text: string | undefined, lang: DBAgentLang): string | undefined {
    if (!text || lang === "zh") {
        return text
    }

    // 数据里的名称可能自带 `.` / `:` 等字符，必须关掉键分隔符解析，否则会被当成 i18n 路径
    const translated = i18next.t(text, {
        lng: toI18nLanguage(lang),
        defaultValue: text,
        keySeparator: false,
        nsSeparator: false,
    })

    return typeof translated === "string" && translated ? translated : text
}

/**
 * 翻译逗号分隔说明里的名称，整体未收录时逐段翻译再拼回。
 *
 * 条目副信息由多段原文拼成（如「火 · 单手剑」），整串通常不在词条表里，
 * 逐段翻译能拿到其中已收录的部分，剩余段保留原文。
 * @param text 拼接后的文本
 * @param lang 目标语言
 * @returns 翻译后的文本
 */
export function translateDBAgentParts(text: string | undefined, lang: DBAgentLang): string | undefined {
    if (!text || lang === "zh") {
        return text
    }

    const whole = translateDBAgentText(text, lang)

    if (whole !== text) {
        return whole
    }

    return text
        .split(" · ")
        .map(part => translateDBAgentText(part, lang) || part)
        .join(" · ")
}

/** 反向索引：译文（小写）→ 对应的中文原文 */
type ReverseIndex = Map<string, string[]>

/** 反向索引缓存：按语言缓存，避免每次检索都重扫词条表 */
const reverseIndexCache = new Map<DBAgentLang, ReverseIndex>()

// 数据包换版本会换掉文案对照表，索引与「已就绪」标记都要作废，下次检索时按新表重建
registerPackTranslationInvalidation(() => {
    reverseIndexCache.clear()
    readyLanguages.clear()
})

/**
 * 递归收集「中文原文 → 译文」的词条。
 * @param node 词条节点
 * @param index 输出索引
 */
function collectTranslations(node: unknown, index: ReverseIndex): void {
    if (!node || typeof node !== "object") {
        return
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (typeof value === "string") {
            // 只索引「键是游戏原文」的词条：界面文案的键是英文点号路径，反向查会污染结果
            if (!key.trim() || !value.trim() || !/[\u4e00-\u9fff]/.test(key)) {
                continue
            }

            const normalized = value.trim().toLowerCase()
            const existing = index.get(normalized)

            if (existing) {
                if (!existing.includes(key) && existing.length < 8) {
                    existing.push(key)
                }
            } else {
                index.set(normalized, [key])
            }

            continue
        }

        if (value && typeof value === "object") {
            collectTranslations(value, index)
        }
    }
}

/**
 * 取某语言的反向索引（译文 → 中文原文）。
 *
 * 数据源优先用数据包下发的文案对照表：游戏文案已迁移到数据包里，内置翻译文件只剩
 * 界面文案与属性说明，单靠资源包会查不到角色名/物品名这类原文。数据包未安装时退回
 * 资源包扫描，行为与迁移前一致。
 *
 * 语言包尚未加载且数据包也没有对应表时**不缓存**空索引：否则预热完成后索引仍是空的，
 * 后续所有其他语言的检索都会静默退化成「只能匹配原文」。
 * @param lang 数据语言
 * @returns 反向索引
 */
function getReverseIndex(lang: DBAgentLang): ReverseIndex {
    const cached = reverseIndexCache.get(lang)

    if (cached) {
        return cached
    }

    const index: ReverseIndex = new Map()

    if (isPackTranslationLocale(lang)) {
        collectTranslations(getPackTranslationTable(lang), index)
    }

    const i18nLang = toI18nLanguage(lang)
    const bundle = i18next.getResourceBundle(i18nLang, "translation")

    if (bundle) {
        collectTranslations(bundle, index)
    }

    if (!index.size) {
        return index
    }

    reverseIndexCache.set(lang, index)

    return index
}

/** 单次检索最多补充的原文候选数，避免关键词过短时把检索面撑得过大 */
const MAX_EXPANDED_KEYWORDS = 10

/**
 * 扩展检索关键词：把其他语言的写法映射回游戏原始数据里的中文写法。
 *
 * 游戏数据只在少数模块（剧情、语音等）按语言切分，其余模块的名称与字段仍是中文原文，
 * 因此用英文/日文提问时必须先把词换成原文，才能在数据里命中。
 * @param keyword 用户语言的检索词
 * @param lang 提问使用的数据语言
 * @returns 可直接用于匹配原文的关键词列表（首个始终是原关键词）
 */
export function expandDBAgentKeyword(keyword: string, lang: DBAgentLang): string[] {
    const trimmed = keyword.trim()

    if (!trimmed || lang === "zh") {
        return trimmed ? [trimmed] : []
    }

    const index = getReverseIndex(lang)
    const needle = trimmed.toLowerCase()
    const expanded: string[] = [trimmed]
    const matched = new Map<string, number>()

    for (const [translation, originals] of index) {
        if (translation === needle) {
            for (const original of originals) {
                matched.set(original, 0)
            }

            continue
        }

        // 过短的关键词做包含匹配会命中一大片无关词条，只保留精确命中
        if (needle.length < 2 || !translation.includes(needle)) {
            continue
        }

        for (const original of originals) {
            if (!matched.has(original)) {
                // 命中位置越靠前说明该译文越贴近检索词，排序时优先
                matched.set(original, translation.indexOf(needle))
            }
        }
    }

    const ordered = [...matched.entries()].sort((a, b) => a[1] - b[1] || a[0].length - b[0].length).map(([original]) => original)

    for (const original of ordered) {
        if (expanded.length > MAX_EXPANDED_KEYWORDS) {
            break
        }

        if (!expanded.includes(original)) {
            expanded.push(original)
        }
    }

    return expanded
}

/**
 * 把其他语言的筛选取值还原成游戏原文。
 *
 * 模型可能把筛选项取值也翻译一遍（例如把「主线任务」写成它的英文说法），
 * 这里在译文可反查时换回原文，保证筛选口径与列表页一致。
 * @param value 筛选取值
 * @param lang 提问使用的数据语言
 * @returns 原文取值（无可反查项时原样返回）
 */
export function resolveDBAgentValue(value: string, lang: DBAgentLang): string {
    const trimmed = value.trim()

    if (!trimmed || lang === "zh") {
        return trimmed
    }

    return getReverseIndex(lang).get(trimmed.toLowerCase())?.[0] ?? trimmed
}
