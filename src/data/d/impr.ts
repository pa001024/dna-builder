import type { DynQuest } from "./dynquest.data"
import dynQuestData from "./dynquest.data"
import type { NPC } from "./npc.data"
import npcData from "./npc.data"
import type { Dialogue, DialogueOption, ImprType, QuestStory } from "./quest.data"
import { questChainMap } from "./questchain.data"
import { getLocalizedQuestDataByLanguage } from "./story-locale"

export type ImprSourceType = "npc" | "dynquest" | "questchain"

export interface ImprEntry {
    sourceType: ImprSourceType
    sourceId: number
    sourceQuestId?: number
    sourceDialogueId?: number
    sourceOptionId?: number
    sourceOptions?: DialogueOption[]
    sourceOptionIndex?: number
    sourceName: string
    sourceDesc?: string
    sourceSubRegionId?: number
    regionId: number
    regionLabel: string
    valueType: ImprType
    value: number
    content: string
    displayText: string
    searchText: string
    sourceLink: string
}

/**
 * 获取地区标签。
 * @param regionId 地区 ID
 * @returns 地区标签
 */
export function getImprRegionLabel(regionId: number): string {
    if (regionId === 1011) {
        return "海伯利亚"
    }
    if (regionId === 1041) {
        return "华胥"
    }
    return `地区${regionId}`
}

/**
 * 判断对话节点是否包含正向印象变化。
 * @param item 对话或选项
 * @returns 是否包含正向印象变化
 */
function hasPositiveImpr(item: { impr?: [number, ImprType, number] }): item is { impr: [number, ImprType, number] } {
    return !!item.impr && item.impr[2] > 0
}

/**
 * 收集对话树中的印象项。
 * @param dialogues 对话节点
 * @param sourceType 来源类型
 * @param sourceId 来源 ID
 * @param sourceName 来源名称
 * @param sourceDesc 来源描述
 * @param sourceLink 来源链接
 * @param sourceSubRegionId 来源子区 ID
 * @returns 印象项
 */
function collectDialogueImprEntries(
    dialogues: Dialogue[] | undefined,
    sourceType: ImprSourceType,
    sourceId: number,
    sourceQuestId: number | undefined,
    sourceName: string,
    sourceLink: string,
    sourceSubRegionId: number | undefined,
    sourceDesc?: string
): ImprEntry[] {
    const entries: ImprEntry[] = []

    const visitDialogue = (dialogue: Dialogue) => {
        if (hasPositiveImpr(dialogue)) {
            const [regionId, valueType, value] = dialogue.impr
            const regionLabel = getImprRegionLabel(regionId)
            const content = dialogue.content?.trim() || "对话"
            entries.push({
                sourceType,
                sourceId,
                sourceQuestId,
                sourceDialogueId: dialogue.id,
                sourceName,
                sourceDesc,
                sourceSubRegionId,
                regionId,
                regionLabel,
                valueType,
                value,
                content,
                displayText: content,
                searchText: content,
                sourceLink,
            })
        }

        const options = dialogue.options ?? []
        for (const [optionIndex, option] of options.entries()) {
            visitOption(option, dialogue.id, options, optionIndex)
        }
    }

    const visitOption = (option: DialogueOption, sourceDialogueId: number, sourceOptions: DialogueOption[], sourceOptionIndex: number) => {
        if (hasPositiveImpr(option)) {
            const [regionId, valueType, value] = option.impr
            const regionLabel = getImprRegionLabel(regionId)
            const content = option.content?.trim() || "选项"
            entries.push({
                sourceType,
                sourceId,
                sourceQuestId,
                sourceDialogueId,
                sourceOptionId: option.id,
                sourceOptions,
                sourceOptionIndex,
                sourceName,
                sourceDesc,
                sourceSubRegionId,
                regionId,
                regionLabel,
                valueType,
                value,
                content,
                displayText: content,
                searchText: content,
                sourceLink,
            })
        }

        const childOptions = option.options ?? []
        for (const [childIndex, childOption] of childOptions.entries()) {
            visitOption(childOption, sourceDialogueId, childOptions, childIndex)
        }
    }

    for (const dialogue of dialogues ?? []) {
        visitDialogue(dialogue)
    }

    return entries
}

/**
 * 收集 NPC 的印象项。
 * @param npcs NPC 数据
 * @returns 印象项
 */
function buildNpcImprEntries(npcs: NPC[]): ImprEntry[] {
    const entries: ImprEntry[] = []

    for (const npc of npcs) {
        const sourceName = npc.name || `NPC ${npc.id}`
        entries.push(
            ...collectDialogueImprEntries(
                npc.talks,
                "npc",
                npc.id,
                undefined,
                sourceName,
                `/db/npc/${npc.id}`,
                npc.srId,
                npc.camp || npc.type
            )
        )
    }

    return entries
}

/**
 * 收集动态委托的印象项。
 * @param quests 动态委托数据
 * @returns 印象项
 */
function buildDynQuestImprEntries(quests: DynQuest[]): ImprEntry[] {
    const entries: ImprEntry[] = []

    for (const quest of quests) {
        const sourceName = quest.name || `委托 ${quest.id}`
        const sourceDesc = quest.desc
        for (const node of quest.nodes ?? []) {
            entries.push(
                ...collectDialogueImprEntries(
                    node.dialogues,
                    "dynquest",
                    quest.id,
                    undefined,
                    sourceName,
                    `/db/dynquest/${quest.id}`,
                    quest.subRegionId,
                    sourceDesc
                )
            )
        }
    }

    return entries
}

/**
 * 收集任务链的印象项。
 * @param questStories 任务剧情数据
 * @returns 印象项
 */
function buildQuestChainImprEntries(questStories: QuestStory[]): ImprEntry[] {
    const entries: ImprEntry[] = []

    for (const story of questStories) {
        for (const quest of story.quests) {
            const sourceName = questChainMap.get(story.id)?.name || `任务链 ${story.id}`
            const sourceDesc = quest.desc
            for (const node of quest.nodes ?? []) {
                entries.push(
                    ...collectDialogueImprEntries(
                        node.dialogues,
                        "questchain",
                        story.id,
                        quest.id,
                        sourceName,
                        `/db/questchain/${story.id}/${quest.id}`,
                        node.srId,
                        sourceDesc
                    )
                )
            }
        }
    }

    return entries
}

/**
 * 获取指定语言的印象项。
 * @param language 语言代码
 * @returns 印象项
 */
export async function getLocalizedImprEntriesByLanguage(language: string): Promise<ImprEntry[]> {
    const questStories = await getLocalizedQuestDataByLanguage(language)

    return [...buildNpcImprEntries(npcData), ...buildDynQuestImprEntries(dynQuestData), ...buildQuestChainImprEntries(questStories)]
}
