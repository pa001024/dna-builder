import { panData, panDialoguesEn, panDialoguesFr, panDialoguesJp, panDialoguesKr, panDialoguesTc } from "./pan.data"
import type { PartyTopic } from "./partytopic.data"
import { partyTopicData, partyTopicTextEn, partyTopicTextFr, partyTopicTextJp, partyTopicTextKr, partyTopicTextTc } from "./partytopic.data"
import type { Dialogue, DialogueOption, QuestStory, StoryMediaMarker } from "./quest.data"
import { questData, questTextEn, questTextFr, questTextJp, questTextKr, questTextTc } from "./quest.data"

export type StoryLocale = "zh" | "en" | "jp" | "kr" | "fr" | "tc"
type StoryExtendedLocale = Exclude<StoryLocale, "zh">

const partyTopicDataCache = new Map<StoryLocale, PartyTopic[]>([["zh", partyTopicData]])
const questDataCache = new Map<StoryLocale, QuestStory[]>([["zh", questData]])

/**
 * 各语言光阴集 id→文本大表（对话正文用裸对话 id，行级字段用 `${行id}#${字段}` 复合键）。
 * 不分语言文件，译文在导入阶段已压成大表（见 tools/import-i18n-data.ts），此处同步直取。
 */
const partyTopicTextTables: Record<StoryExtendedLocale, Record<string, string>> = {
    en: partyTopicTextEn,
    jp: partyTopicTextJp,
    kr: partyTopicTextKr,
    fr: partyTopicTextFr,
    tc: partyTopicTextTc,
}

/**
 * 各语言任务剧情 id→文本大表（对话正文用裸对话 id，其余用 `${id}#${字段}` 复合键）。
 * 不分语言文件，译文在导入阶段已压成大表（见 tools/import-i18n-data.ts），此处同步直取。
 */
const questTextTables: Record<StoryExtendedLocale, Record<string, string>> = {
    en: questTextEn,
    jp: questTextJp,
    kr: questTextKr,
    fr: questTextFr,
    tc: questTextTc,
}

/**
 * 各语言潘神 id→文本大表（对话 id 与潘神 id 共表，键区间不重叠；中文走 panData 原文）。
 * 潘神不分语言文件，译文在导入阶段已压成大表（见 tools/import-i18n-data.ts），此处同步直取。
 */
const panDialogueTables: Record<StoryExtendedLocale, Record<number, string>> = {
    en: panDialoguesEn,
    jp: panDialoguesJp,
    kr: panDialoguesKr,
    fr: panDialoguesFr,
    tc: panDialoguesTc,
}

/**
 * 将设置语言代码映射为剧情数据语言。
 * @param language 设置语言代码
 * @returns 剧情数据语言
 */
export function resolveStoryLocaleBySetting(language: string): StoryLocale {
    if (language === "jiaojiao") {
        return "en"
    }
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
 * 本地化一条对话选项（含嵌套选项），结构字段原样保留。
 * @param option 中文选项
 * @param table 对应语言的 id→文本大表
 * @returns 本地化后的选项（新对象，不改动中文原文）
 */
function localizeDialogueOption(option: DialogueOption, table: Record<string, string>): DialogueOption {
    return {
        ...option,
        content: table[`${option.id}#option`] ?? option.content,
        options: option.options?.map(item => localizeDialogueOption(item, table)),
    }
}

/**
 * 本地化一条对话（或媒体标记），结构字段原样保留。
 * @param dialogue 中文对话或媒体标记
 * @param table 对应语言的 id→文本大表
 * @returns 本地化后的对话（新对象，不改动中文原文）
 */
function localizeDialogue(dialogue: Dialogue, table: Record<string, string>): Dialogue
function localizeDialogue(dialogue: StoryMediaMarker, table: Record<string, string>): StoryMediaMarker
function localizeDialogue(dialogue: Dialogue | StoryMediaMarker, table: Record<string, string>): Dialogue | StoryMediaMarker {
    if ("type" in dialogue) {
        return { ...dialogue, name: table[`${dialogue.id}#name`] ?? dialogue.name }
    }
    return {
        ...dialogue,
        content: table[String(dialogue.id)] ?? dialogue.content,
        speakerName: table[`${dialogue.id}#speaker`] ?? dialogue.speakerName,
        options: dialogue.options?.map(option => localizeDialogueOption(option, table)),
    }
}

/**
 * 按剧情语言取光阴集数据（同步）：中文直接返回原文，其余语言按 id→文本大表逐字段替换。
 * 结果按语言缓存；调用方的 `await` 不受影响（await 非 Promise 值直接透传）。
 * @param locale 剧情语言
 * @returns 光阴集数据
 */
function loadPartyTopicDataByLocale(locale: StoryLocale): PartyTopic[] {
    const cachedData = partyTopicDataCache.get(locale)
    if (cachedData) {
        return cachedData
    }

    const table = partyTopicTextTables[locale as StoryExtendedLocale]
    const data = partyTopicData.map(topic => ({
        ...topic,
        name: table[`${topic.id}#name`] ?? topic.name,
        desc: table[`${topic.id}#desc`] ?? topic.desc,
        memoryName: table[`${topic.id}#memoryName`] ?? topic.memoryName,
        memoryDesc: table[`${topic.id}#memoryDesc`] ?? topic.memoryDesc,
        dialogues: topic.dialogues?.map(dialogue =>
            "type" in dialogue ? localizeDialogue(dialogue, table) : localizeDialogue(dialogue, table)
        ),
    }))
    partyTopicDataCache.set(locale, data)
    return data
}

/**
 * 按剧情语言取任务剧情数据（同步）：中文直接返回原文，其余语言按 id→文本大表逐字段替换。
 * 结果按语言缓存；调用方的 `await` 不受影响（await 非 Promise 值直接透传）。
 * @param locale 剧情语言
 * @returns 任务剧情数据
 */
function loadQuestDataByLocale(locale: StoryLocale): QuestStory[] {
    const cachedData = questDataCache.get(locale)
    if (cachedData) {
        return cachedData
    }

    const table = questTextTables[locale as StoryExtendedLocale]
    const data = questData.map(story => ({
        ...story,
        quests: story.quests.map(quest => ({
            ...quest,
            name: table[`${quest.id}#name`] ?? quest.name,
            desc: table[`${quest.id}#desc`] ?? quest.desc,
            nodes: quest.nodes?.map(node => ({
                ...node,
                name: table[`${node.id}#name`] ?? node.name,
                questions: node.questions?.map(question => ({
                    ...question,
                    name: table[`${question.id}#name`] ?? question.name,
                    tips: table[`${question.id}#tips`] ?? question.tips,
                })),
                answers: node.answers?.map(answer => ({
                    ...answer,
                    name: table[`${answer.id}#name`] ?? answer.name,
                    desc: table[`${answer.id}#desc`] ?? answer.desc,
                })),
                dialogues: node.dialogues?.map(dialogue => localizeDialogue(dialogue, table)),
            })),
        })),
    }))
    questDataCache.set(locale, data)
    return data
}

/**
 * 按设置语言取潘神文本（对话内容或潘神名称，Quest 式按 id 查各语言大表）。
 * @param id 对话 id 或潘神 id
 * @param language 设置语言代码
 * @returns 对应语言文本；中文或无译文（与原文相同的不进表）时返回 undefined，调用方回退 panData 中文原文
 */
export function getPanLocalizedText(id: number, language: string): string | undefined {
    const locale = resolveStoryLocaleBySetting(language)
    if (locale === "zh") {
        return undefined
    }
    return panDialogueTables[locale]?.[id]
}

/**
 * 按设置语言取潘神名称。
 * @param panId 潘神 id
 * @param language 设置语言代码
 * @returns 本地化名；无译文时回退中文原名
 */
export function getPanLocalizedName(panId: number, language: string): string {
    return getPanLocalizedText(panId, language) ?? panData.find(pan => pan.id === panId)?.name ?? String(panId)
}

/**
 * 按数据语言直接取光阴集数据。
 *
 * 调用方已经持有数据语言（如检索层拿到的 lang 参数）时用它，避免把数据语言
 * 再当成设置语言代码传进映射函数。
 * @param locale 数据语言
 * @returns 光阴集数据
 */
export function getPartyTopicDataByLocale(locale: StoryLocale): PartyTopic[] {
    return loadPartyTopicDataByLocale(locale)
}

/**
 * 根据设置语言返回对应的光阴集数据（同步，调用方原有的 `await` 照写无妨）。
 * @param language 设置语言代码
 * @returns 光阴集数据
 */
export function getLocalizedPartyTopicDataByLanguage(language: string): PartyTopic[] {
    const locale = resolveStoryLocaleBySetting(language)
    return loadPartyTopicDataByLocale(locale)
}

/**
 * 根据设置语言返回对应的任务剧情数据（同步，调用方原有的 `await` 照写无妨）。
 * @param language 设置语言代码
 * @returns 任务剧情数据
 */
export function getLocalizedQuestDataByLanguage(language: string): QuestStory[] {
    const locale = resolveStoryLocaleBySetting(language)
    return loadQuestDataByLocale(locale)
}

/**
 * 按数据语言直接取任务剧情数据。
 *
 * 调用方已经持有数据语言（如检索层拿到的 lang 参数）时用它，避免把数据语言
 * 再当成设置语言代码传进映射函数。
 * @param locale 数据语言
 * @returns 任务剧情数据
 */
export function getQuestDataByLocale(locale: StoryLocale): QuestStory[] {
    return loadQuestDataByLocale(locale)
}
