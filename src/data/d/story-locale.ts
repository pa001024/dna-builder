import type { PartyTopic } from "./partytopic.data"
import { partyTopicData } from "./partytopic.data"
import type { QuestStory } from "./quest.data"
import { questData } from "./quest.data"

export type StoryLocale = "zh" | "en" | "jp" | "kr" | "fr" | "tc"
type StoryExtendedLocale = Exclude<StoryLocale, "zh">

const partyTopicDataCache: Partial<Record<StoryLocale, PartyTopic[]>> = {
    zh: partyTopicData,
}
const questDataCache: Partial<Record<StoryLocale, QuestStory[]>> = {
    zh: questData,
}

const partyTopicLoaderMap: Record<StoryExtendedLocale, () => Promise<PartyTopic[]>> = {
    en: async () => (await import("./partytopic.en.data")).partyTopicData_en,
    jp: async () => (await import("./partytopic.jp.data")).partyTopicData_jp,
    kr: async () => (await import("./partytopic.kr.data")).partyTopicData_kr,
    fr: async () => (await import("./partytopic.fr.data")).partyTopicData_fr,
    tc: async () => (await import("./partytopic.tc.data")).partyTopicData_tc,
}

const questLoaderMap: Record<StoryExtendedLocale, () => Promise<QuestStory[]>> = {
    en: async () => (await import("./quest.en.data")).questData_en,
    jp: async () => (await import("./quest.jp.data")).questData_jp,
    kr: async () => (await import("./quest.kr.data")).questData_kr,
    fr: async () => (await import("./quest.fr.data")).questData_fr,
    tc: async () => (await import("./quest.tc.data")).questData_tc,
}

/**
 * 将设置语言代码映射为剧情数据语言。
 * @param language 设置语言代码
 * @returns 剧情数据语言
 */
export function resolveStoryLocaleBySetting(language: string): StoryLocale {
    if (language.startsWith("en")) {
        return "en"
    }
    if (language.startsWith("ja")) {
        return "jp"
    }
    if (language.startsWith("ko")) {
        return "kr"
    }
    if (language.startsWith("fr")) {
        return "fr"
    }
    if (language === "zh-TW" || language.startsWith("zh-Hant")) {
        return "tc"
    }
    return "zh"
}

/**
 * 根据剧情语言加载对应的光阴集数据，并在模块内缓存结果。
 * @param locale 剧情语言
 * @returns 光阴集数据
 */
async function loadPartyTopicDataByLocale(locale: StoryLocale): Promise<PartyTopic[]> {
    const cachedData = partyTopicDataCache[locale]
    if (cachedData) {
        return cachedData
    }

    const data = await partyTopicLoaderMap[locale as StoryExtendedLocale]()
    partyTopicDataCache[locale] = data
    return data
}

/**
 * 根据剧情语言加载对应的任务剧情数据，并在模块内缓存结果。
 * @param locale 剧情语言
 * @returns 任务剧情数据
 */
async function loadQuestDataByLocale(locale: StoryLocale): Promise<QuestStory[]> {
    const cachedData = questDataCache[locale]
    if (cachedData) {
        return cachedData
    }

    const data = await questLoaderMap[locale as StoryExtendedLocale]()
    questDataCache[locale] = data
    return data
}

/**
 * 根据设置语言异步返回对应的光阴集数据。
 * @param language 设置语言代码
 * @returns 光阴集数据
 */
export function getLocalizedPartyTopicDataByLanguage(language: string): Promise<PartyTopic[]> {
    const locale = resolveStoryLocaleBySetting(language)
    return loadPartyTopicDataByLocale(locale)
}

/**
 * 根据设置语言异步返回对应的任务剧情数据。
 * @param language 设置语言代码
 * @returns 任务剧情数据
 */
export function getLocalizedQuestDataByLanguage(language: string): Promise<QuestStory[]> {
    const locale = resolveStoryLocaleBySetting(language)
    return loadQuestDataByLocale(locale)
}
