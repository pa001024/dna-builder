#!/usr/bin/env bun
/**
 * @file 旁白一次性产出音频 + 时间轴：逐句 TTS → 裁掉边缘静音 → 按固定间隔拼接 voice.wav → 写 subs.json。
 *
 * 逐句合成让「字幕时间 = 前序句时长累加」天然与语音对齐（不需要强制对齐）；
 * ASR（asr-check.ts）只负责验「这句真的念全了」，不负责定时间。
 *
 * 用法：
 *   cd /e/dev/videos && bun /e/dev/dna-builder/.agents/skills/video-production/scripts/narrate.ts \
 *     --script script.tsv --out .tmp --ref refs/story_story_1002_101002_1948E9DE.wav
 */

import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { modelverseInferOnce, readModelverseConfig } from "../../../../tools/voice/modelverse-client"
import { readGptSoVitsConfig, synthesizeOnce } from "../../../../tools/voice/gpt-sovits"

interface Cue {
    zh: string
    en: string
    /** 送 TTS 的文本（第三列）；省略时同 zh，用于把顿号等符号换成模型好读的写法 */
    tts?: string
}

interface TimedCue extends Cue {
    index: number
    start: number
    end: number
    duration: number
    wav: string
}

interface SubtitleFile {
    voice: string
    duration: number
    gap: number
    cues: TimedCue[]
}

const SELF_DIR = typeof import.meta.dir === "string" ? import.meta.dir : "."
const DEFAULT_REF = "refs/story_story_1002_101002_1948E9DE.wav"

/**
 * 解析 `--key value` 形式的命令行参数。
 * @returns 参数表
 */
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
 * 读取文案表：每行 `中文<TAB>英文[<TAB>TTS 文本]`，`#` 开头与空行跳过。
 * 一行 = 一条字幕 = 一次 TTS；第三列只影响合成，字幕仍用第一列。
 * @param file 文案表路径
 * @returns 逐句文案
 */
async function readScript(file: string): Promise<Cue[]> {
    const text = await readFile(file, "utf8")
    const cues: Cue[] = []
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        const [zh, en = "", tts = ""] = trimmed.split(/\t+/)
        if (!zh.trim()) continue
        cues.push({ zh: zh.trim(), en: en.trim(), tts: tts.trim() || undefined })
    }
    if (!cues.length) throw new Error(`文案表为空: ${file}`)
    return cues
}

/**
 * 跑一条外部命令，非零退出即抛错。
 * @param command 命令与参数
 * @param cwd 工作目录
 */
async function run(command: string[], cwd?: string): Promise<void> {
    const proc = Bun.spawn(command, { stdout: "ignore", stderr: "pipe", cwd })
    const code = await proc.exited
    if (code !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`${command[0]} 退出 ${code}: ${stderr.slice(-400)}`)
    }
}

/**
 * 读取音频时长（秒）。
 * @param file 音频路径
 * @returns 秒数
 */
async function probeDuration(file: string): Promise<number> {
    const proc = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
        stdout: "pipe",
        stderr: "ignore",
    })
    const out = await new Response(proc.stdout).text()
    await proc.exited
    const value = Number(out.trim())
    if (!Number.isFinite(value) || value <= 0) throw new Error(`读不到时长: ${file}`)
    return value
}

/**
 * 裁掉首尾静音（阈值默认 -50dB），让字幕时间贴着真实发声。
 * @param input 原始 wav
 * @param output 裁剪后 wav
 * @param threshold 静音阈值
 */
async function trimEdges(input: string, output: string, threshold: string): Promise<void> {
    const filter = `silenceremove=start_periods=1:start_threshold=${threshold}:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=${threshold}:start_silence=0.05,areverse`
    await run(["ffmpeg", "-y", "-i", input, "-af", filter, "-ar", "32000", "-ac", "1", output])
}

/**
 * 生成固定长度的静音 wav。
 * @param file 输出路径
 * @param sampleRate 采样率
 * @param seconds 时长（秒）
 */
async function makeSilence(file: string, sampleRate: number, seconds: number): Promise<void> {
    await run(["ffmpeg", "-y", "-f", "lavfi", "-i", `anullsrc=r=${sampleRate}:cl=mono`, "-t", seconds.toFixed(3), file])
}

/**
 * 合成一句旁白到 wav；同名缓存存在则直接复用（文案/参考/参数变了 hash 就变）。
 * @param cue 文案
 * @param rawPath TTS 原始输出路径
 * @param cachePath 裁边后的正式 wav 路径
 * @param options 合成参数
 */
async function synthesizeCue(
    cue: Cue,
    rawPath: string,
    cachePath: string,
    options: {
        ref: string
        speed: number
        sampleRate: number
        emo?: string
        emoAlpha?: number
        force: boolean
        backend: "modelverse" | "gpts"
        prompt?: string
        promptLang: string
    }
): Promise<void> {
    if (!options.force && existsSync(cachePath) && existsSync(rawPath)) return
    const spoken = cue.tts ?? cue.zh
    console.log(`  TTS → ${path.basename(cachePath)}  ${spoken}`)
    // GPT-SoVITS 需要参考音频的原文；不等长或内容不符会直接吐出短垃圾音频
    const audio =
        options.backend === "gpts"
            ? await synthesizeOnce(readGptSoVitsConfig(), {
                  text: spoken,
                  textLang: "zh",
                  refAudioPath: options.ref,
                  promptText: options.prompt ?? "",
                  promptLang: options.promptLang,
                  speedFactor: options.speed,
              })
            : await modelverseInferOnce(readModelverseConfig(), {
                  text: spoken,
                  refAudioPath: options.ref,
                  emoAudioPath: options.emo,
                  emoAlpha: options.emoAlpha,
                  speed: options.speed,
                  sampleRate: options.sampleRate,
              })
    await writeFile(rawPath, new Uint8Array(audio))
}

/**
 * 主流程：逐句合成 → 拼接 → 写 subs.json。
 */
async function main(): Promise<void> {
    const args = parseArgs()
    if (!args.script) throw new Error("缺少 --script（每行『中文<TAB>英文』）")
    const scriptPath = path.resolve(args.script)
    const outDir = path.resolve(args.out || path.join(".tmp", path.basename(scriptPath, path.extname(scriptPath))))
    const ref = path.resolve(args.ref || process.env.VOICE_REF || DEFAULT_REF)
    if (!existsSync(ref)) throw new Error(`参考音频不存在: ${ref}（放在视频仓库的 refs/ 下）`)
    const gap = Number(args.gap ?? 180) / 1000
    const tail = Number(args.tail ?? 400) / 1000
    const speed = Number(args.speed ?? 1)
    const sampleRate = Number(args.rate ?? 32000)
    const force = args.force === "true"
    const trim = args.trim !== "false"
    const backend = (args.backend ?? "modelverse") as "modelverse" | "gpts"
    if (backend === "gpts" && !args.prompt) throw new Error("GPT-SoVITS 需要 --prompt（参考音频的原文）")
    const promptLang = args["prompt-lang"] ?? "zh"

    const cues = await readScript(scriptPath)
    const segDir = path.join(outDir, "seg")
    await mkdir(segDir, { recursive: true })
    // --only 5,18：只合成指定序号，其余必须命中缓存；--tag 换模型时给缓存加盐
    const only = args.only ? new Set(args.only.split(",").map(value => Number(value.trim()))) : null
    console.log(`共 ${cues.length} 句 → ${outDir}（参考 ${path.basename(ref)}${only ? `，仅合成 ${[...only].join(",")}` : ""}）`)

    const timed: TimedCue[] = []
    const missing: number[] = []
    for (const [offset, cue] of cues.entries()) {
        const index = offset + 1
        const tag = String(index).padStart(3, "0")
        const hash = createHash("sha1")
            .update(
                `${cue.tts ?? cue.zh}|${ref}|${speed}|${sampleRate}|${args.emo ?? ""}|${args.emoAlpha ?? ""}|${backend}|${args.prompt ?? ""}${args.tag ? `|${args.tag}` : ""}`
            )
            .digest("hex")
            .slice(0, 8)
        const rawPath = path.join(segDir, `seg-${tag}-${hash}.raw.wav`)
        const segPath = path.join(segDir, `seg-${tag}-${hash}.wav`)
        const needSynth = !only || only.has(index)
        if (needSynth) {
            await synthesizeCue(cue, rawPath, segPath, {
                ref,
                speed,
                sampleRate,
                emo: args.emo ? path.resolve(args.emo) : undefined,
                emoAlpha: args.emoAlpha ? Number(args.emoAlpha) : undefined,
                force,
                backend,
                prompt: args.prompt,
                promptLang,
            })
            if (trim) await trimEdges(rawPath, segPath, args.threshold ?? "-50dB")
        } else if (!existsSync(segPath)) {
            // 未选中的句子只用现成缓存，缺了只记下来，不擅自重合成整片
            missing.push(index)
        }
        timed.push({ ...cue, index, start: 0, end: 0, duration: 0, wav: path.relative(outDir, segPath) })
    }
    if (missing.length) throw new Error(`第 ${missing.join(",")} 句没有缓存；把它们一起加进 --only 再跑`)

    const gapPath = path.join(segDir, `gap-${Math.round(gap * 1000)}ms.wav`)
    const tailPath = path.join(segDir, `tail-${Math.round(tail * 1000)}ms.wav`)
    await makeSilence(gapPath, sampleRate, gap)
    await makeSilence(tailPath, sampleRate, tail)

    const listLines: string[] = []
    let cursor = 0
    for (const cue of timed) {
        const duration = await probeDuration(path.join(outDir, cue.wav))
        cue.start = Number(cursor.toFixed(3))
        cue.end = Number((cursor + duration).toFixed(3))
        cue.duration = Number(duration.toFixed(3))
        // concat 列表里的相对路径以列表文件所在目录（seg/）为基准，不能按 outDir 算
        listLines.push(`file '${path.basename(cue.wav)}'`)
        listLines.push(`file '${path.basename(gapPath)}'`)
        cursor = cue.end + gap
    }
    listLines.push(`file '${path.basename(tailPath)}'`)

    const listPath = path.join(segDir, "concat.txt")
    await writeFile(listPath, `${listLines.join("\n")}\n`)
    const voicePath = path.join(outDir, "voice.wav")
    await rm(voicePath, { force: true })
    await run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:a", "pcm_s16le", "-ar", String(sampleRate), "-ac", "1", voicePath],
        outDir
    )

    const total = await probeDuration(voicePath)
    const payload: SubtitleFile = { voice: "voice.wav", duration: Number(total.toFixed(3)), gap, cues: timed }
    await writeFile(path.join(outDir, "subs.json"), JSON.stringify(payload, null, 2))

    console.table(timed.map(cue => ({ "#": cue.index, start: cue.start, end: cue.end, zh: cue.zh })))
    console.log(`voice.wav ${total.toFixed(2)}s → ${voicePath}`)
    console.log(`下一句：bun ${path.join(SELF_DIR, "asr-check.ts")} --dir ${path.relative(process.cwd(), outDir)}`)
}

await main()
