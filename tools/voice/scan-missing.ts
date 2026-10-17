import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { npcData } from "../../src/data/d/npc.data"
import { questData } from "../../src/data/d/quest.data"
import { stripStoryTextTags } from "../../src/data/story-text"

export interface MissingDialogue {
    id: number
    kind: "dialogue" | "option"
    storyId: number
    questId: number
    npc?: number
    speakerName?: string
    content: string
    speakable: boolean
}

export interface MissingScanResult {
    scannedAt: string
    total: number
    withVoice: number
    withoutVoice: number
    speakable: number
    items: MissingDialogue[]
}

function isSpeakable(content: string): boolean {
    const plain = stripStoryTextTags(content ?? "").trim()
    if (plain.length < 2) return false
    if (/^[…。？！.?!~～—\-—\s]+$/.test(plain)) return false
    if (/^（.*）$/.test(plain) && plain.length < 8) return false
    return true
}

/**
 * 扫描全部 quest 剧情，找出没有 voice 字段的对白。
 * @returns 扫描结果
 */
export function scanMissingVoices(): MissingScanResult {
    const items: MissingDialogue[] = []
    let total = 0
    let withVoice = 0
    for (const story of questData) {
        for (const quest of story.quests) {
            for (const node of quest.nodes ?? []) {
                for (const dialogue of node.dialogues ?? []) {
                    total += 1
                    if (dialogue.voice) {
                        withVoice += 1
                        continue
                    }
                    items.push({
                        id: dialogue.id,
                        kind: "dialogue",
                        storyId: story.id,
                        questId: quest.id,
                        npc: dialogue.npc,
                        speakerName: dialogue.speakerName,
                        content: dialogue.content ?? "",
                        speakable: isSpeakable(dialogue.content ?? ""),
                    })
                    for (const option of dialogue.options ?? []) {
                        total += 1
                        if (option.voice) {
                            withVoice += 1
                            continue
                        }
                        items.push({
                            id: option.id,
                            kind: "option",
                            storyId: story.id,
                            questId: quest.id,
                            npc: option.npc,
                            content: option.content ?? "",
                            speakable: isSpeakable(option.content ?? ""),
                        })
                    }
                }
            }
        }
    }
    return {
        scannedAt: new Date().toISOString(),
        total,
        withVoice,
        withoutVoice: items.length,
        speakable: items.filter(item => item.speakable).length,
        items,
    }
}

if (import.meta.main) {
    const outPath = Bun.argv[2] ?? ".tmp/voice-missing.json"
    const result = scanMissingVoices()
    const speakableOnly = Bun.argv.includes("--speakable-only")
    const payload = speakableOnly ? { ...result, items: result.items.filter(item => item.speakable) } : result
    await mkdir(path.dirname(path.resolve(outPath)), { recursive: true })
    await writeFile(path.resolve(outPath), JSON.stringify(payload, null, 2))
    const npcCharRows = npcData.filter(npc => npc.charId !== undefined).map(npc => ({ npcId: npc.id, charId: npc.charId }))
    const npcCharPath = path.join(path.dirname(path.resolve(outPath)), "voice-npc-char.json")
    await writeFile(npcCharPath, JSON.stringify(npcCharRows))
    console.log(`npc-char rows=${npcCharRows.length} -> ${npcCharPath}`)
    console.log(
        `total=${result.total} withVoice=${result.withVoice} without=${result.withoutVoice} speakable=${result.speakable} -> ${outPath}`
    )
}
