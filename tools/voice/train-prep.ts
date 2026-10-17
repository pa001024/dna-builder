import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import charData from "../../src/data/d/char.data"
import { charVoiceData } from "../../src/data/d/charvoice.data"
import { npcData } from "../../src/data/d/npc.data"
import { questData } from "../../src/data/d/quest.data"
import { stripStoryTextTags } from "../../src/data/story-text"

export interface CharTrainSet {
    charId: number
    speaker: string
    lines: Array<{ res: string; text: string; oggOptions: string[] }>
    skippedPlaceholders: number
    missingAudio: string[]
    storyLines?: number
}

const DATASET_ROOT = "D:/dev/dna-voice-dataset"
const FFMPEG = process.env.FFMPEG_PATH || "E:/soft/GPT-SoVITS-v2/ffmpeg.exe"

function speakerOf(res: string): string {
    const match = res.match(/^char_([A-Za-z0-9]+)_vo_/)
    return match ? match[1] : "unknown"
}

function storyOggOptions(voiceKey: string, datasetLang: string): string[] {
    const segments = voiceKey.replace(/\\/g, "/").split("/").filter(Boolean)
    if (!segments.length) return []
    const folder = segments[0]
    const flat = segments.join("_")
    return (["", "_f", "_m"] as const).map(suffix => `${datasetLang}/${folder}/voice_${datasetLang}_${flat}${suffix}.ogg`)
}

/**
 * 按角色聚合官方台词：角色语音 + 该角色在剧情中的有声对白（官方文本直出）。
 * @param datasetLang 数据集语言代码
 * @returns 角色到训练行的映射
 */
export function buildCharTrainSets(datasetLang = "ch"): CharTrainSet[] {
    const byChar = new Map<number, CharTrainSet>()
    for (const voice of charVoiceData) {
        if (voice.hide || !voice.res || !voice.text) continue
        const plain = stripStoryTextTags(voice.text).trim()
        let entry = byChar.get(voice.charId)
        if (!entry) {
            entry = { charId: voice.charId, speaker: speakerOf(voice.res), lines: [], skippedPlaceholders: 0, missingAudio: [] }
            byChar.set(voice.charId, entry)
        }
        if (/\{nickname2?\}|\{(性[别別]2?)[：:]/u.test(voice.text)) {
            entry.skippedPlaceholders += 1
            continue
        }
        if (!plain) continue
        entry.lines.push({ res: voice.res, text: plain, oggOptions: [`ch/char/voice_ch_${voice.res}.ogg`] })
    }
    const npcName = new Map<number, string>()
    for (const npc of npcData) {
        if (npc.name) npcName.set(npc.id, npc.name)
    }
    const npcChar = new Map<number, number>()
    for (const npc of npcData) {
        if (npc.charId !== undefined) npcChar.set(npc.id, npc.charId)
    }
    const charIdByName = new Map<string, number>()
    for (const char of charData) {
        const name = (char.名称 ?? "").trim()
        if (name && !charIdByName.has(name)) charIdByName.set(name, char.id)
    }
    const storyCountByChar = new Map<number, number>()
    for (const story of questData) {
        for (const quest of story.quests) {
            for (const node of quest.nodes ?? []) {
                for (const dialogue of node.dialogues ?? []) {
                    if (!dialogue.voice) continue
                    const charId =
                        (dialogue.npc !== undefined ? npcChar.get(dialogue.npc) : undefined) ??
                        charIdByName.get(
                            stripStoryTextTags(
                                dialogue.speakerName ?? (dialogue.npc !== undefined ? (npcName.get(dialogue.npc) ?? "") : "")
                            ).trim()
                        )
                    if (charId === undefined) continue
                    const entry = byChar.get(charId)
                    if (!entry) continue
                    const plain = stripStoryTextTags(dialogue.content ?? "").trim()
                    if (!plain || /\{nickname2?\}|\{(性[别別]2?)[：:]/u.test(dialogue.content ?? "")) {
                        entry.skippedPlaceholders += 1
                        continue
                    }
                    if (entry.lines.some(line => line.text === plain)) continue
                    entry.lines.push({
                        res: dialogue.voice!.replaceAll("/", "_"),
                        text: plain,
                        oggOptions: storyOggOptions(dialogue.voice!, datasetLang),
                    })
                    storyCountByChar.set(charId, (storyCountByChar.get(charId) ?? 0) + 1)
                }
            }
        }
    }
    for (const [charId, count] of storyCountByChar) {
        const entry = byChar.get(charId)
        if (entry) (entry as { storyLines?: number }).storyLines = count
    }
    return [...byChar.values()].sort((a, b) => a.charId - b.charId)
}

/**
 * 落盘单个角色的微调数据集：wav（32k 转换）+ .list（官方文本）。
 * @param trainSet 角色训练集
 * @param dataRoot 数据根目录
 * @param datasetLang 数据集语言代码
 * @returns .list 绝对路径
 */
export async function prepareCharDataset(trainSet: CharTrainSet, dataRoot: string): Promise<string> {
    const charDir = path.join(dataRoot, `char_${trainSet.speaker}`)
    await mkdir(charDir, { recursive: true })
    const listLines: string[] = []
    for (const line of trainSet.lines) {
        let oggPath = ""
        for (const relativeOgg of line.oggOptions) {
            const candidate = path.join(DATASET_ROOT, relativeOgg)
            if (await Bun.file(candidate).exists()) {
                oggPath = candidate
                break
            }
        }
        if (!oggPath) {
            trainSet.missingAudio.push(line.res)
            continue
        }
        const wavPath = path.join(charDir, `${line.res}.wav`)
        if (!(await Bun.file(wavPath).exists())) {
            const proc = Bun.spawn([FFMPEG, "-y", "-i", oggPath, "-ac", "1", "-ar", "44100", wavPath], {
                stdout: "ignore",
                stderr: "ignore",
            })
            if ((await proc.exited) !== 0) {
                trainSet.missingAudio.push(line.res)
                continue
            }
        }
        listLines.push(`${wavPath}|${trainSet.speaker}|ZH|${line.text}`)
    }
    const listPath = path.join(charDir, `${trainSet.speaker}.list`)
    await writeFile(listPath, listLines.join("\n") + "\n")
    return listPath
}

if (import.meta.main) {
    const dataRoot = path.resolve(Bun.argv[2] ?? "E:/soft/GPT-SoVITS-v5/data-chars")
    const only = Bun.argv[3] ? new Set(Bun.argv[3].split(",")) : undefined
    const sets = buildCharTrainSets().filter(set => !only || only.has(set.speaker) || only.has(String(set.charId)))
    for (const set of sets) {
        const listPath = await prepareCharDataset(set, dataRoot)
        console.log(
            `char_${set.speaker} id=${set.charId} lines=${set.lines.length} missing=${set.missingAudio.length} skippedPH=${set.skippedPlaceholders} -> ${listPath}`
        )
    }
}
