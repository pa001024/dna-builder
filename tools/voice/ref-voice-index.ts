import { writeFile } from "node:fs/promises"
import path from "node:path"
import charData from "../../packages/data/d/char.data"
import { charVoiceData } from "../../packages/data/d/charvoice.data"
import type { ExtVoiceEmotion } from "./emotion"
import { classifyEmotionHeuristic } from "./emotion"

export interface RefVoiceIndex {
    builtAt: string
    byCharEmotion: Record<string, string>
    fallbackByChar: Record<string, string>
    promptTextByRes: Record<string, string>
    charIdByName: Record<string, number>
}

function indexKey(charId: number, emotion: ExtVoiceEmotion): string {
    return `${charId}:${emotion}`
}

/**
 * 为每个角色的每种情绪挑选参考语音：用情绪最贴合的 charvoice 条目 res，
 * 缺失时回退该角色任意条目。
 * @returns 参考语音索引
 */
export function buildRefVoiceIndex(): RefVoiceIndex {
    const scored = new Map<string, { res: string; length: number }>()
    const fallbackByChar = new Map<number, string>()
    const promptTextByRes = new Map<string, string>()
    for (const voice of charVoiceData) {
        if (voice.hide || !voice.res || !voice.text) continue
        if (!promptTextByRes.has(voice.res)) promptTextByRes.set(voice.res, voice.text)
        if (!fallbackByChar.has(voice.charId)) fallbackByChar.set(voice.charId, voice.res)
        const emotion = classifyEmotionHeuristic(voice.text)
        const key = indexKey(voice.charId, emotion)
        const textLength = voice.text.length
        const current = scored.get(key)
        if (!current || Math.abs(textLength - 24) < Math.abs(current.length - 24)) {
            scored.set(key, { res: voice.res, length: textLength })
        }
        const neutralKey = indexKey(voice.charId, "neutral")
        if (!scored.has(neutralKey)) scored.set(neutralKey, { res: voice.res, length: textLength })
    }
    const byCharEmotion: Record<string, string> = {}
    for (const [key, value] of scored) byCharEmotion[key] = value.res
    const fallback: Record<string, string> = {}
    for (const [charId, res] of fallbackByChar) fallback[String(charId)] = res
    const promptText: Record<string, string> = {}
    for (const [res, text] of promptTextByRes) promptText[res] = text
    const charIdByName: Record<string, number> = {}
    for (const char of charData) {
        const name = (char.名称 ?? "").trim()
        if (name && !(name in charIdByName)) charIdByName[name] = char.id
    }
    return { builtAt: new Date().toISOString(), byCharEmotion, fallbackByChar: fallback, promptTextByRes: promptText, charIdByName }
}

if (import.meta.main) {
    const outPath = Bun.argv[2] ?? ".tmp/voice-ref-index.json"
    const index = buildRefVoiceIndex()
    await writeFile(path.resolve(outPath), JSON.stringify(index, null, 2))
    console.log(`chars=${Object.keys(index.fallbackByChar).length} pairs=${Object.keys(index.byCharEmotion).length} -> ${outPath}`)
}
