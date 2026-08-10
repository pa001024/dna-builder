import type { Dialogue } from "@/data/d/quest.data"

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
