import { existsSync } from "node:fs"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ExtVoiceEntry } from "../../src/data/d/extvoice.data"
import { npcData } from "../../src/data/d/npc.data"
import { AsrServeSession, isQaPass, type QaFailure, readQaThresholds } from "./asr"
import type { ExtVoiceEmotion } from "./emotion"
import { classifyEmotionsBatch, type EmotionBackend } from "./emotion"
import { readGptSoVitsConfig, synthesizeOnce } from "./gpt-sovits"
import { indexTtsOnce, readIndexTtsConfig } from "./index-client"
import { NANZHU_LIGHT_EMOTION_REF, resolveMalePromptText } from "./male-ref"
import { modelverseInferOnce, readModelverseConfig } from "./modelverse-client"
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
            let base: number
            if (candidateEmotion === emotion) base = 0
            else if (candidateEmotion === "neutral" || candidateEmotion === undefined) base = 1
            else base = 2
            const length = candidate.text.length
            if (length < 12 || length > 70) base += 0.5
            return base
        }
        return [...candidates].sort((a, b) => score(a) - score(b))
    }

    /**
     * 挑同名声纹：优先 12~70 字的候选（过短多为带混响的语气词），都没有才回退首个。
     * @param candidates 同名候选
     * @returns 首选候选
     */
    function pickNameCandidate(candidates: StoryCandidate[]): StoryCandidate | undefined {
        if (!candidates.length) return undefined
        return candidates.find(candidate => candidate.text.length >= 12 && candidate.text.length <= 70) ?? candidates[0]
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

    const questFilter = args.quest ? new Set(args.quest.split(",").map(Number)) : undefined
    const candidates = missing.items
        .filter(item => item.speakable && item.content.trim())
        .filter(item => !questFilter || questFilter.has(item.storyId) || questFilter.has(item.questId))
        .slice(0, maxItems)
    const emotions = await classifyEmotionsBatch(
        candidates.map(item => item.content),
        (args.emotion as EmotionBackend | undefined) ?? "bert-local"
    )
    const textLang = TEXT_LANG_BY_DATASET[datasetLanguage] ?? "zh"
    const backend = args.backend ?? process.env.VOICE_BACKEND ?? "gptsvits"
    const sovits = backend === "gptsvits" ? readGptSoVitsConfig() : undefined
    const indexCfg = backend === "index" ? readIndexTtsConfig() : undefined
    const modelverseCfg = backend === "modelverse" ? readModelverseConfig() : undefined
    const forceGenderNpcIds = new Set(npcData.filter(npc => npc.name === "{nickname}").map(npc => npc.id))
    const maleRefOverride = args["male-ref"] ?? process.env.VOICE_MALE_REF ?? ""
    const refAudioCacheDir = path.resolve(args["ref-audio-cache"] ?? ".tmp/voice-ref-audio")
    const qaEnabled = args["no-qa"] !== "true"
    const qaThresholds = readQaThresholds()
    const qaAttempts = Math.max(1, Number(args["qa-attempts"] ?? process.env.VOICE_QA_ATTEMPTS ?? 3))
    const qaReportPath = path.join(outDir, "qa-report.json")
    const qaFailures: QaFailure[] = []
    const recordQaFailure = async (failure: QaFailure): Promise<void> => {
        qaFailures.push(failure)
        await writeFile(qaReportPath, JSON.stringify({ thresholds: qaThresholds, failures: qaFailures }, null, 2))
    }
    const asrSession = qaEnabled ? new AsrServeSession() : undefined
    const passedOggByKey = new Map<string, string>()
    if (asrSession) {
        console.log("starting ASR QA session...")
        await asrSession.start()
    }
    const entries: ExtVoiceEntry[] = []

    await mkdir(outDir, { recursive: true })
    const startedAt = Date.now()
    let doneCount = 0
    let skipCount = 0
    let failCount = 0
    const jobsCount = Math.max(1, Number(args.jobs ?? process.env.VOICE_JOBS ?? (modelverseCfg !== undefined ? 8 : 1)))
    let asrLock: Promise<void> = Promise.resolve()
    const withAsrLock = async <T>(task: () => Promise<T>): Promise<T> => {
        const previous = asrLock
        let release!: () => void
        asrLock = new Promise<void>(resolve => {
            release = resolve
        })
        await previous
        try {
            return await task()
        } finally {
            release()
        }
    }
    let completedCount = 0
    const processItem = async (index: number, item: (typeof candidates)[number]): Promise<void> => {
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
        if (!variants.length) return
        const entry: ExtVoiceEntry = {
            id: item.id,
            voice: `aistory/${item.id}`,
        }
        if (dryRun) {
            entries.push(entry)
            return
        }
        const oggNames = variants.map(variant => `voice_${datasetLanguage}_aistory_${item.id}${variant.fileSuffix}.ogg`)
        if (oggNames.every(name => existsSync(path.join(outDir, name)))) {
            entries.push(entry)
            skipCount += 1
            return
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
            nameRef: pickNameCandidate(storyCandidates),
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
            return
        }
        if (!jobs.length) {
            skipCount += 1
            return
        }
        const pendingJobs = jobs.filter(job => {
            const finalName = `voice_${datasetLanguage}_aistory_${item.id}${job.variant.fileSuffix}.ogg`
            return !existsSync(path.join(outDir, finalName))
        })
        if (!pendingJobs.length) {
            entries.push(entry)
            skipCount += 1
            return
        }
        try {
            let itemOk = true
            for (const job of pendingJobs) {
                const finalName = `voice_${datasetLanguage}_aistory_${item.id}${job.variant.fileSuffix}.ogg`
                const finalPath = path.join(outDir, finalName)
                const cacheKey = `${job.variant.text}\n${job.refWav}`
                const cachedOgg = passedOggByKey.get(cacheKey)
                if (cachedOgg) {
                    await copyFile(cachedOgg, finalPath)
                    console.log(`synthesized ${finalName} emotion=${emotion} ref=${job.refLabel} reused`)
                    continue
                }
                const tmpWavPath = path.join(outDir, `tmp_${item.id}${job.variant.fileSuffix}.wav`)
                let passed = false
                for (let attempt = 0; attempt < qaAttempts; attempt += 1) {
                    const wav =
                        modelverseCfg !== undefined
                            ? await modelverseInferOnce(modelverseCfg, {
                                  text: job.variant.text,
                                  refAudioPath: job.refWav,
                                  emoAudioPath: job.refWav,
                              })
                            : indexCfg !== undefined
                              ? await indexTtsOnce(indexCfg, {
                                    text: job.variant.text,
                                    refAudioPath: job.refWav,
                                })
                              : await synthesizeOnce(sovits!, {
                                    text: job.variant.text,
                                    textLang,
                                    refAudioPath: job.refWav,
                                    promptText: job.promptText,
                                    promptLang: textLang,
                                    seed: attempt === 0 ? -1 : 1000 + attempt,
                                })
                    await writeFile(tmpWavPath, Buffer.from(wav))
                    if (!asrSession) {
                        passed = true
                        break
                    }
                    const qa = await withAsrLock(() => asrSession!.verify({ id: item.id, wav: tmpWavPath, text: job.variant.text }))
                    if (isQaPass(qa, qaThresholds, job.variant.text.length)) {
                        passed = true
                        if (attempt > 0) console.log(`qa-pass ${finalName} cer=${qa.cer} recall=${qa.recall} attempt=${attempt}`)
                        break
                    }
                    console.log(
                        `qa-retry ${finalName} cer=${qa.cer} recall=${qa.recall} miss=${qa.longest_missing} attempt=${attempt} asr=${qa.transcript.slice(0, 40)}`
                    )
                    if (attempt === qaAttempts - 1) {
                        await withAsrLock(() =>
                            recordQaFailure({
                                id: item.id,
                                suffix: job.variant.fileSuffix,
                                cer: qa.cer,
                                recall: qa.recall,
                                missing: qa.missing,
                                longest_missing: qa.longest_missing,
                                transcript: qa.transcript,
                                text: job.variant.text,
                                ref: job.refLabel,
                            })
                        )
                    }
                }
                if (!passed) {
                    itemOk = false
                    await rm(tmpWavPath, { force: true })
                    return
                }
                await convertWavToOgg(tmpWavPath, path.join(outDir, finalName))
                if (!keepWav) await rm(tmpWavPath, { force: true })
                passedOggByKey.set(cacheKey, finalPath)
                console.log(`synthesized ${finalName} emotion=${emotion} ref=${job.refLabel}`)
            }
            if (!itemOk) {
                failCount += 1
                return
            }
            entries.push(entry)
            doneCount += 1
        } catch (error) {
            failCount += 1
            console.log(`failed ${item.id}: ${error instanceof Error ? error.message.slice(0, 200) : error}`)
        }
    }

    let cursor = 0
    const nextIndex = (): number | undefined => {
        if (cursor >= candidates.length) return undefined
        const current = cursor
        cursor += 1
        return current
    }
    await Promise.all(
        Array.from({ length: jobsCount }, async () => {
            for (;;) {
                const next = nextIndex()
                if (next === undefined) break
                await processItem(next, candidates[next])
                completedCount += 1
                if (completedCount % 20 === 0) {
                    const elapsedMin = (Date.now() - startedAt) / 60000
                    console.log(
                        `progress ${completedCount}/${candidates.length} done=${doneCount} skip=${skipCount} fail=${failCount} ${elapsedMin.toFixed(1)}min`
                    )
                }
            }
        })
    )
    entries.sort((a, b) => a.id - b.id)

    if (asrSession) asrSession.stop()
    const fragment =
        `import type { ExtVoiceEntry } from "@/data/d/extvoice.data"\n\n` +
        `export const extVoiceFragment: ExtVoiceEntry[] = ${JSON.stringify(entries, null, 4)}\n`
    await writeFile(path.join(outDir, "extvoice.fragment.ts"), fragment)
    console.log(`entries=${entries.length} qaFailures=${qaFailures.length} -> ${path.join(outDir, "extvoice.fragment.ts")}`)
}

if (import.meta.main) {
    await main()
}
