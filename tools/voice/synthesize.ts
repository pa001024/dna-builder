import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ExtVoiceEntry } from "../../src/data/d/extvoice.data"
import { npcData } from "../../src/data/d/npc.data"
import type { ExtVoiceEmotion } from "./emotion"
import { classifyEmotionsBatch, type EmotionBackend } from "./emotion"
import { readGptSoVitsConfig, synthesizeOnce } from "./gpt-sovits"
import { NANZHU_LIGHT_EMOTION_REF, resolveMalePromptText } from "./male-ref"
import { isUnknownSpeakerName } from "./ref-voice-story"
import { convertWavToOgg, resolveRefAudioWav, resolveStoryRefAudioWav } from "./resolve-ref-audio"
import type { MissingScanResult } from "./scan-missing"
import { buildRequiredVariants, type TtsVariant } from "./text-prep"

interface RefIndexFile {
    byCharEmotion: Record<string, string>
    fallbackByChar: Record<string, string>
    promptTextByRes: Record<string, string>
    charIdByName: Record<string, number>
}

interface StoryIndexFile {
    builtAt: string
    byName: Record<string, StoryCandidate[]>
    byNpc: Record<string, StoryCandidate[]>
}

interface NpcRefEmotionCache {
    indexBuiltAt: string
    byVoice: Record<string, ExtVoiceEmotion>
}

/**
 * 为同 NPC 参考候选批量补情绪（一次 BERT，多次复用，落盘缓存）。
 * @param storyIndex 故事声纹索引
 * @param cachePath 缓存路径
 * @returns voiceKey 到情绪的映射
 */
async function loadNpcRefEmotions(storyIndex: StoryIndexFile, cachePath: string): Promise<Record<string, ExtVoiceEmotion>> {
    let cache: NpcRefEmotionCache = { indexBuiltAt: "", byVoice: {} }
    try {
        cache = JSON.parse(await readFile(cachePath, "utf8")) as NpcRefEmotionCache
    } catch {
        cache = { indexBuiltAt: "", byVoice: {} }
    }
    if (cache.indexBuiltAt === storyIndex.builtAt) return cache.byVoice
    const texts: string[] = []
    const voices: string[] = []
    for (const candidates of Object.values(storyIndex.byNpc)) {
        for (const candidate of candidates) {
            if (!(candidate.voice in cache.byVoice)) {
                voices.push(candidate.voice)
                texts.push(candidate.text)
            }
        }
    }
    if (texts.length) {
        console.log(`classifying ${texts.length} npc-ref candidates...`)
        const emotions = await classifyEmotionsBatch(texts, "bert-local")
        for (const [index, voice] of voices.entries()) cache.byVoice[voice] = emotions[index] ?? "neutral"
    }
    cache.indexBuiltAt = storyIndex.builtAt
    await writeFile(cachePath, JSON.stringify(cache))
    return cache.byVoice
}

interface NpcCharRow {
    npcId: number
    charId?: number
}

interface StoryCandidate {
    voice: string
    text: string
}

interface VariantRef {
    variant: TtsVariant
    refWav: string
    refLabel: string
    promptText: string
}

const SKIP_IDENTITY_NAMES = new Set(["{nickname}", "{nickname2}", "？？？", "???"])

function stripIdentityTags(name: string): string {
    return name.replace(/<(?:H|W|Highlight|highlight|Title|blue|Blue)>|<\/>/g, "").trim()
}

const TEXT_LANG_BY_DATASET: Record<string, string> = { ch: "zh", jp: "ja", kr: "ko", en: "en", fr: "fr" }

function resolveDatasetLanguage(language: string): string {
    if (language.startsWith("zh")) return "ch"
    if (language.startsWith("jp") || language.startsWith("ja")) return "jp"
    if (language.startsWith("kr") || language.startsWith("ko")) return "kr"
    if (language.startsWith("en")) return "en"
    if (language.startsWith("fr")) return "fr"
    return "ch"
}

function parseArgs(): Record<string, string> {
    const raw = Bun.argv.slice(2)
    const args: Record<string, string> = {}
    for (let i = 0; i < raw.length; i += 1) {
        const match = raw[i].match(/^--([^=]+)(?:=(.*))?$/)
        if (!match) continue
        if (match[2] !== undefined) {
            args[match[1]] = match[2]
        } else if (i + 1 < raw.length && !raw[i + 1].startsWith("--")) {
            args[match[1]] = raw[i + 1]
            i += 1
        } else {
            args[match[1]] = "true"
        }
    }
    return args
}

/**
 * 批量合成入口：读缺语音清单 → BERT 情绪 → 参考语音 → 性别/昵称预处理 →
 * GPT-SoVITS 合成 → 落盘 staging → 输出 extvoice.data.ts 片段。
 */
async function main(): Promise<void> {
    const args = parseArgs()
    const language = args.lang ?? "zh-CN"
    const datasetLanguage = resolveDatasetLanguage(language)
    const limit = Number(args.limit ?? 50)
    const maxItems = limit <= 0 ? Number.MAX_SAFE_INTEGER : limit
    const dryRun = args["dry-run"] === "true"
    const keepWav = args["keep-wav"] === "true"
    const missingPath = path.resolve(args.missing ?? ".tmp/voice-missing.json")
    const refIndexPath = path.resolve(args["ref-index"] ?? ".tmp/voice-ref-index.json")
    const storyIndexPath = path.resolve(args["story-index"] ?? ".tmp/voice-story-index.json")
    const npcCharPath = path.resolve(args["npc-char"] ?? ".tmp/voice-npc-char.json")
    const outDir = path.resolve(args.out ?? `.tmp/voice-out/${datasetLanguage}/aistory`)

    const missing = JSON.parse(await readFile(missingPath, "utf8")) as MissingScanResult
    const refIndex = JSON.parse(await readFile(refIndexPath, "utf8")) as RefIndexFile
    let storyIndex: StoryIndexFile = { builtAt: "", byName: {}, byNpc: {} }
    try {
        storyIndex = JSON.parse(await readFile(storyIndexPath, "utf8")) as StoryIndexFile
    } catch {
        storyIndex = { builtAt: "", byName: {}, byNpc: {} }
    }
    const storyByName = storyIndex.byName ?? {}
    const storyByNpc = storyIndex.byNpc ?? {}
    const npcRefEmotions = await loadNpcRefEmotions(storyIndex, path.resolve(".tmp/voice-npc-ref-emotion.json"))
    interface VariantRefContext {
        emotion: ExtVoiceEmotion
        datasetLanguage: string
        refAudioCacheDir: string
        charRef: string | undefined
        charPrompt: string
        promptTextByRes: Record<string, string>
        npcCandidates: StoryCandidate[]
        npcEmotions: Record<string, ExtVoiceEmotion>
        nameRef: StoryCandidate | undefined
        maleOverride: string
    }

    /**
     * 按情绪给同 NPC 候选排序（命中情绪优先，其次 neutral，其余保序）。
     * @param candidates 同 NPC 参考候选
     * @param emotion 目标情绪
     * @param npcEmotions voiceKey 到情绪的映射
     * @returns 排序后的候选
     */
    function rankNpcCandidates(
        candidates: StoryCandidate[],
        emotion: ExtVoiceEmotion,
        npcEmotions: Record<string, ExtVoiceEmotion>
    ): StoryCandidate[] {
        const score = (candidate: StoryCandidate): number => {
            const candidateEmotion = npcEmotions[candidate.voice]
            if (candidateEmotion === emotion) return 0
            if (candidateEmotion === "neutral" || candidateEmotion === undefined) return 1
            return 2
        }
        return [...candidates].sort((a, b) => score(a) - score(b))
    }

    /**
     * 为单个变体解析参考音频：同 NPC 情绪匹配优先，各后缀只吃对性别的文件，逐个试到成功为止。
     * @param variant 待合成变体
     * @param context 解析上下文
     * @returns 变体任务；无可用参考时返回 undefined
     */
    async function resolveVariantJob(variant: TtsVariant, context: VariantRefContext): Promise<VariantRef | undefined> {
        const suffix = variant.fileSuffix
        if (suffix === "_m") {
            for (const candidate of rankNpcCandidates(context.npcCandidates, context.emotion, context.npcEmotions).slice(0, 3)) {
                try {
                    const wav = await resolveStoryRefAudioWav(candidate.voice, context.refAudioCacheDir, context.datasetLanguage, "_m")
                    return { variant, refWav: wav, refLabel: candidate.voice, promptText: candidate.text }
                } catch {}
            }
            const maleRes = context.maleOverride.endsWith(".wav") ? "" : context.maleOverride || NANZHU_LIGHT_EMOTION_REF[context.emotion]
            try {
                if (context.maleOverride.endsWith(".wav")) {
                    return {
                        variant,
                        refWav: path.resolve(context.maleOverride),
                        refLabel: context.maleOverride,
                        promptText: variant.text.slice(0, 60),
                    }
                }
                if (maleRes) {
                    const wav = await resolveRefAudioWav(maleRes, context.refAudioCacheDir, context.datasetLanguage)
                    return {
                        variant,
                        refWav: wav,
                        refLabel: maleRes,
                        promptText: resolveMalePromptText(maleRes, context.promptTextByRes) || variant.text.slice(0, 60),
                    }
                }
            } catch {
                return undefined
            }
            return undefined
        }
        if (suffix === "_f") {
            for (const candidate of rankNpcCandidates(context.npcCandidates, context.emotion, context.npcEmotions).slice(0, 3)) {
                try {
                    const wav = await resolveStoryRefAudioWav(candidate.voice, context.refAudioCacheDir, context.datasetLanguage, "_f")
                    return { variant, refWav: wav, refLabel: candidate.voice, promptText: candidate.text }
                } catch {}
            }
        } else {
            for (const candidate of rankNpcCandidates(context.npcCandidates, context.emotion, context.npcEmotions).slice(0, 3)) {
                try {
                    const wav = await resolveStoryRefAudioWav(candidate.voice, context.refAudioCacheDir, context.datasetLanguage, "")
                    return { variant, refWav: wav, refLabel: candidate.voice, promptText: candidate.text }
                } catch {}
            }
        }
        if (context.nameRef) {
            try {
                const wav = await resolveStoryRefAudioWav(context.nameRef.voice, context.refAudioCacheDir, context.datasetLanguage)
                return { variant, refWav: wav, refLabel: context.nameRef.voice, promptText: context.nameRef.text }
            } catch {}
        }
        if (context.charRef) {
            try {
                const wav = await resolveRefAudioWav(context.charRef, context.refAudioCacheDir, context.datasetLanguage)
                return { variant, refWav: wav, refLabel: context.charRef, promptText: context.charPrompt || variant.text.slice(0, 60) }
            } catch {}
        }
        return undefined
    }

    /** npc id 到中文名的映射 */
    const npcNameMap = new Map<number, string>()
    for (const npc of npcData) {
        if (npc.name) npcNameMap.set(npc.id, npc.name)
    }
    let npcCharMap = new Map<number, number>()
    try {
        const rows = JSON.parse(await readFile(npcCharPath, "utf8")) as NpcCharRow[]
        npcCharMap = new Map(rows.map(row => [row.npcId, row.charId ?? 0]))
    } catch {
        npcCharMap = new Map()
    }

    const candidates = missing.items.filter(item => item.speakable && item.content.trim()).slice(0, maxItems)
    const emotions = await classifyEmotionsBatch(
        candidates.map(item => item.content),
        (args.emotion as EmotionBackend | undefined) ?? "bert-local"
    )
    const textLang = TEXT_LANG_BY_DATASET[datasetLanguage] ?? "zh"
    const sovits = readGptSoVitsConfig()
    const forceGenderNpcIds = new Set(npcData.filter(npc => npc.name === "{nickname}").map(npc => npc.id))
    const maleRefOverride = args["male-ref"] ?? process.env.VOICE_MALE_REF ?? ""
    const refAudioCacheDir = path.resolve(args["ref-audio-cache"] ?? ".tmp/voice-ref-audio")
    const entries: ExtVoiceEntry[] = []

    await mkdir(outDir, { recursive: true })
    const startedAt = Date.now()
    let doneCount = 0
    let skipCount = 0
    let failCount = 0
    for (const [index, item] of candidates.entries()) {
        const emotion: ExtVoiceEmotion = emotions[index] ?? "neutral"
        const directCharId = item.npc !== undefined ? npcCharMap.get(item.npc) : undefined
        const rawSpeaker = isUnknownSpeakerName(item.speakerName) ? undefined : item.speakerName
        const identity = rawSpeaker || (item.npc !== undefined ? npcNameMap.get(item.npc) : undefined)
        const identityName = identity ? stripIdentityTags(identity) : undefined
        const nameMatchedCharId = identityName ? refIndex.charIdByName[identityName] : undefined
        const charId = directCharId ?? nameMatchedCharId
        const charRef = (charId && (refIndex.byCharEmotion[`${charId}:${emotion}`] ?? refIndex.fallbackByChar[String(charId)])) || undefined
        const storyCandidates =
            identity && !SKIP_IDENTITY_NAMES.has(identity) ? (storyByName[identity] ?? storyByName[stripIdentityTags(identity)] ?? []) : []
        const variants = buildRequiredVariants(item.content, item.npc, language, forceGenderNpcIds)
        if (!variants.length) continue
        const entry: ExtVoiceEntry = {
            id: item.id,
            voice: `aistory/${item.id}`,
        }
        if (dryRun) {
            entries.push(entry)
            continue
        }
        const oggNames = variants.map(variant => `voice_${datasetLanguage}_aistory_${item.id}${variant.fileSuffix}.ogg`)
        if (oggNames.every(name => existsSync(path.join(outDir, name)))) {
            entries.push(entry)
            skipCount += 1
            continue
        }
        const jobContext: VariantRefContext = {
            emotion,
            datasetLanguage,
            refAudioCacheDir,
            charRef,
            charPrompt: charRef ? (refIndex.promptTextByRes[charRef] ?? "") : "",
            promptTextByRes: refIndex.promptTextByRes,
            npcCandidates: item.npc !== undefined ? (storyByNpc[String(item.npc)] ?? []) : [],
            npcEmotions: npcRefEmotions,
            nameRef: storyCandidates[0],
            maleOverride: maleRefOverride,
        }
        const jobs: VariantRef[] = []
        try {
            for (const variant of variants) {
                const job = await resolveVariantJob(variant, jobContext)
                if (!job) {
                    console.log(`skip ${item.id}${variant.fileSuffix}: 无可用参考（npc=${item.npc} 说话人=${identity ?? "-"}）`)
                    continue
                }
                jobs.push(job)
            }
        } catch (error) {
            failCount += 1
            console.log(`failed ${item.id}: ${error instanceof Error ? error.message.slice(0, 200) : error}`)
            continue
        }
        if (!jobs.length) {
            skipCount += 1
            continue
        }
        const pendingJobs = jobs.filter(job => {
            const finalName = `voice_${datasetLanguage}_aistory_${item.id}${job.variant.fileSuffix}.ogg`
            return !existsSync(path.join(outDir, finalName))
        })
        if (!pendingJobs.length) {
            entries.push(entry)
            skipCount += 1
            continue
        }
        try {
            const uniqueTexts = [...new Map(pendingJobs.map(job => [job.variant.text + job.refWav, job])).values()]
            const wavByKey = new Map<string, string>()
            for (const job of uniqueTexts) {
                const wav = await synthesizeOnce(sovits, {
                    text: job.variant.text,
                    textLang,
                    refAudioPath: job.refWav,
                    promptText: job.promptText,
                    promptLang: textLang,
                })
                const tmpWavPath = path.join(outDir, `tmp_${item.id}${job.variant.fileSuffix}.wav`)
                await writeFile(tmpWavPath, Buffer.from(wav))
                wavByKey.set(job.variant.text + job.refWav, tmpWavPath)
            }
            for (const job of pendingJobs) {
                const srcWavPath = wavByKey.get(job.variant.text + job.refWav)!
                const finalName = `voice_${datasetLanguage}_aistory_${item.id}${job.variant.fileSuffix}.ogg`
                await convertWavToOgg(srcWavPath, path.join(outDir, finalName))
                console.log(`synthesized ${finalName} emotion=${emotion} ref=${job.refLabel}`)
            }
            for (const tmpWavPath of new Set(wavByKey.values())) {
                if (!keepWav) await rm(tmpWavPath, { force: true })
            }
            entries.push(entry)
            doneCount += 1
        } catch (error) {
            failCount += 1
            console.log(`failed ${item.id}: ${error instanceof Error ? error.message.slice(0, 200) : error}`)
        }
        if ((index + 1) % 20 === 0) {
            const elapsedMin = (Date.now() - startedAt) / 60000
            console.log(
                `progress ${index + 1}/${candidates.length} done=${doneCount} skip=${skipCount} fail=${failCount} ${elapsedMin.toFixed(1)}min`
            )
        }
    }

    const fragment =
        `import type { ExtVoiceEntry } from "@/data/d/extvoice.data"\n\n` +
        `export const extVoiceFragment: ExtVoiceEntry[] = ${JSON.stringify(entries, null, 4)}\n`
    await writeFile(path.join(outDir, "extvoice.fragment.ts"), fragment)
    console.log(`entries=${entries.length} -> ${path.join(outDir, "extvoice.fragment.ts")}`)
}

if (import.meta.main) {
    await main()
}
