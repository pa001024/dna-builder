import { npcMap } from "@/data/d"
import type { Dialogue } from "@/data/d/quest.data"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"

/**
 * 获取对话条目的实际显示文本。
 * @param dialogue 对话条目
 * @returns 对话显示文本
 */
export function getDialogueDisplayContent(dialogue: Pick<Dialogue, "content" | "options" | "voice">): string {
    const content = dialogue.content
    if (content?.trim()) {
        return content
    }

    if (dialogue.options?.length) {
        return ""
    }

    return dialogue.voice ? "…" : ""
}

/**
 * 获取对话说话人名称：优先使用导出器提供的 speakerName，无则回退 NPC 查表，
 * NPC 名称中的剧情占位符（如 `{nickname}`）按传入配置替换。
 * 返回值仍是游戏原文键，展示前需再过一次翻译。
 * @param dialogue 对话条目
 * @param config 剧情文本替换配置
 * @returns 说话人名称；无说话人时返回空串
 */
export function getDialogueSpeakerName(dialogue: Pick<Dialogue, "speakerName" | "npc">, config: StoryTextConfig): string {
    if (dialogue.speakerName) {
        return dialogue.speakerName
    }

    if (dialogue.npc === undefined) {
        return ""
    }

    const rawName = npcMap.get(dialogue.npc)?.name || `${dialogue.npc}`
    return replaceStoryPlaceholders(rawName, config)
}
