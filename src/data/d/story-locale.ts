import type { PartyTopic } from "./partytopic.data"
import { partyTopicData } from "./partytopic.data"
import { partyTopicData_en } from "./partytopic.en.data"
import { partyTopicData_fr } from "./partytopic.fr.data"
import { partyTopicData_jp } from "./partytopic.jp.data"
import { partyTopicData_kr } from "./partytopic.kr.data"
import { partyTopicData_tc } from "./partytopic.tc.data"
import type { QuestStory } from "./quest.data"
import { questData } from "./quest.data"
import { questData_en } from "./quest.en.data"
import { questData_fr } from "./quest.fr.data"
import { questData_jp } from "./quest.jp.data"
import { questData_kr } from "./quest.kr.data"
import { questData_tc } from "./quest.tc.data"

export type StoryLocale = "zh" | "en" | "jp" | "kr" | "fr" | "tc"

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
 * 根据设置语言返回对应的光阴集数据。
 * @param language 设置语言代码
 * @returns 光阴集数据
 */
export function getLocalizedPartyTopicDataByLanguage(language: string): PartyTopic[] {
    const locale = resolveStoryLocaleBySetting(language)
    if (locale === "en") {
        return partyTopicData_en
    }
    if (locale === "jp") {
        return partyTopicData_jp
    }
    if (locale === "kr") {
        return partyTopicData_kr
    }
    if (locale === "fr") {
        return partyTopicData_fr
    }
    if (locale === "tc") {
        return partyTopicData_tc
    }
    return partyTopicData
}

/**
 * 根据设置语言返回对应的任务剧情数据。
 * @param language 设置语言代码
 * @returns 任务剧情数据
 */
export function getLocalizedQuestDataByLanguage(language: string): QuestStory[] {
    const locale = resolveStoryLocaleBySetting(language)
    if (locale === "en") {
        return questData_en
    }
    if (locale === "jp") {
        return questData_jp
    }
    if (locale === "kr") {
        return questData_kr
    }
    if (locale === "fr") {
        return questData_fr
    }
    if (locale === "tc") {
        return questData_tc
    }
    return questData
}
