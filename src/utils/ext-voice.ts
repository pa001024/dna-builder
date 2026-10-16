import { extVoiceMap } from "@/data/d"
import type { Dialogue } from "@/data/d/quest.data"
import { buildDialogueVoiceUrl } from "@/utils/dialogue-voice"
import type { StoryGender } from "@/utils/story-text"

export interface ExtVoiceResolveOptions {
    language: string
    gender: StoryGender
    gender2: StoryGender
    forceGenderNpcIds?: number[]
    datasetBaseUrl?: string
}

export interface ResolvedDialogueVoice {
    url: string
    ai: boolean
}

/**
 * 取对话的 AI 补语音条目（无则返回 undefined）。
 * @param dialogueId 对话 id
 * @returns AI 语音条目
 */
export function getExtVoiceEntry(dialogueId: number) {
    return extVoiceMap.get(dialogueId)
}

/**
 * 解析对话的最终播放语音：原生 voice 优先，无原生 voice 时回退 AI 补语音。
 * @param dialogue 对话条目
 * @param text 展示文本（用于性别后缀判定）
 * @param options 语言与性别配置
 * @returns 语音地址与 AI 标记；均无时返回 null
 */
export function resolveDialogueEffectiveVoice(
    dialogue: Pick<Dialogue, "id" | "voice" | "npc">,
    text: string,
    options: ExtVoiceResolveOptions
): ResolvedDialogueVoice | null {
    const base = {
        language: options.language,
        gender: options.gender,
        gender2: options.gender2,
        forceGenderNpcIds: options.forceGenderNpcIds,
        datasetBaseUrl: options.datasetBaseUrl,
    }
    if (dialogue.voice) {
        const url = buildDialogueVoiceUrl({ ...base, voice: dialogue.voice, text, npcId: dialogue.npc })
        return url ? { url, ai: false } : null
    }
    const entry = extVoiceMap.get(dialogue.id)
    if (!entry) {
        return null
    }
    const url = buildDialogueVoiceUrl({ ...base, voice: entry.voice, text, npcId: dialogue.npc })
    return url ? { url, ai: true } : null
}

/**
 * 判断对话是否有可播放语音（含 AI 补语音）。
 * @param dialogue 对话条目
 * @returns 是否可播放
 */
export function hasDialogueVoice(dialogue: Pick<Dialogue, "id" | "voice">): boolean {
    return !!dialogue.voice || extVoiceMap.has(dialogue.id)
}
