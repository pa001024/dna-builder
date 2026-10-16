import { writeFile } from "node:fs/promises"
import path from "node:path"
import { npcData } from "../../src/data/d/npc.data"
import { questData } from "../../src/data/d/quest.data"
import { stripStoryTextTags } from "../../src/data/story-text"

export interface StoryVoiceCandidate {
    voice: string
    text: string
}

export interface StoryVoiceIndex {
    builtAt: string
    byName: Record<string, StoryVoiceCandidate[]>
    byNpc: Record<string, StoryVoiceCandidate[]>
}

const SKIP_NAMES = new Set(["{nickname}", "{nickname2}", "？？？", "???"])

/** 未知说话人占位（此时必须回退 npc 名，禁止按占位符匹配声纹） */
export const UNKNOWN_SPEAKER_NAMES = new Set(["???", "？？？", "??", "？？", "...", "…", "···"])

/**
 * 判断说话人名是否为未知占位。
 * @param name 说话人名
 * @returns 是否为未知占位
 */
export function isUnknownSpeakerName(name: string | undefined): boolean {
    if (!name) return true
    return UNKNOWN_SPEAKER_NAMES.has(stripStoryTextTags(name).trim())
}

function identityOf(npcId: number | undefined, speakerName: string | undefined, npcName: Map<number, string>): string | undefined {
    const speaker = isUnknownSpeakerName(speakerName) ? undefined : speakerName
    const name = speaker || (npcId !== undefined ? npcName.get(npcId) : undefined)
    if (!name || SKIP_NAMES.has(name)) return undefined
    return stripStoryTextTags(name).trim() || undefined
}

/**
 * 按中文名建已有剧情语音索引：同一说话人在别处有 voice 的台词即为可用声纹。
 * @returns 说话人名到参考语音候选的映射
 */
export function buildStoryVoiceIndex(): StoryVoiceIndex {
    const npcName = new Map<number, string>()
    for (const npc of npcData) {
        if (npc.name) npcName.set(npc.id, npc.name)
    }
    const byName = new Map<string, StoryVoiceCandidate[]>()
    const byNpc = new Map<string, StoryVoiceCandidate[]>()
    const pushCapped = (map: Map<string, StoryVoiceCandidate[]>, key: string, candidate: StoryVoiceCandidate): void => {
        const list = map.get(key) ?? []
        if (list.length < 12 && !list.some(item => item.voice === candidate.voice)) {
            list.push(candidate)
            map.set(key, list)
        }
    }
    for (const story of questData) {
        for (const quest of story.quests) {
            for (const node of quest.nodes ?? []) {
                for (const dialogue of node.dialogues ?? []) {
                    if (!dialogue.voice) continue
                    const plain = stripStoryTextTags(dialogue.content ?? "").trim()
                    if (plain.length < 8 || plain.length > 80) continue
                    const candidate: StoryVoiceCandidate = { voice: dialogue.voice, text: plain }
                    if (dialogue.npc !== undefined) {
                        pushCapped(byNpc, String(dialogue.npc), candidate)
                    }
                    const name = identityOf(dialogue.npc, dialogue.speakerName, npcName)
                    if (!name) continue
                    const list = byName.get(name) ?? []
                    if (list.length < 10 && !list.some(item => item.voice === dialogue.voice)) {
                        list.push(candidate)
                        byName.set(name, list)
                    }
                }
            }
        }
    }
    return { builtAt: new Date().toISOString(), byName: Object.fromEntries(byName), byNpc: Object.fromEntries(byNpc) }
}

if (import.meta.main) {
    const outPath = Bun.argv[2] ?? ".tmp/voice-story-index.json"
    const index = buildStoryVoiceIndex()
    const names = Object.keys(index.byName)
    const candidates = names.reduce((sum, name) => sum + index.byName[name].length, 0)
    const npcs = Object.keys(index.byNpc)
    await writeFile(path.resolve(outPath), JSON.stringify(index))
    console.log(`names=${names.length} candidates=${candidates} npcs=${npcs.length} -> ${outPath}`)
}
