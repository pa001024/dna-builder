import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { npcData } from "../../packages/data/d/npc.data"
import { type AsrVerifyResult, isQaPass, readQaThresholds, verifyPronunciationBatch } from "./asr"
import type { MissingScanResult } from "./scan-missing"
import { buildRequiredVariants } from "./text-prep"

function parseArgs(): Record<string, string> {
    const raw = Bun.argv.slice(2)
    const args: Record<string, string> = {}
    for (let i = 0; i < raw.length; i += 1) {
        const match = raw[i].match(/^--([^=]+)(?:=(.*))?$/)
        if (!match) continue
        if (match[2] !== undefined) args[match[1]] = match[2]
        else if (i + 1 < raw.length && !raw[i + 1].startsWith("--")) {
            args[match[1]] = raw[i + 1]
            i += 1
        } else args[match[1]] = "true"
    }
    return args
}

/**
 * 存量 QA 横扫：把 staging 里已有 ogg 逐个 ASR 验音，不过阈值的删文件并记报告，
 * 下次 synthesize 断点续跑会自动重做。
 */
async function main(): Promise<void> {
    const args = parseArgs()
    const language = args.lang ?? "zh-CN"
    const stagingDir = path.resolve(args.staging ?? ".tmp/voice-out/ch/aistory")
    const missingPath = path.resolve(args.missing ?? ".tmp/voice-missing.json")
    const thresholds = readQaThresholds()
    const pass = (result: Pick<AsrVerifyResult, "cer" | "recall" | "missing" | "longest_missing">, refLen: number): boolean =>
        isQaPass(result, thresholds, refLen)
    const deleteBad = args.delete !== "false"

    const missing = JSON.parse(await readFile(missingPath, "utf8")) as MissingScanResult
    const forceGenderNpcIds = new Set(npcData.filter(npc => npc.name === "{nickname}").map(npc => npc.id))
    const textById = new Map<number, Map<string, string>>()
    for (const item of missing.items) {
        if (!item.speakable || !item.content.trim()) continue
        const variants = buildRequiredVariants(item.content, item.npc, language, forceGenderNpcIds)
        textById.set(item.id, new Map(variants.map(variant => [variant.fileSuffix, variant.text])))
    }

    const ffmpeg = process.env.FFMPEG_PATH || "E:/soft/GPT-SoVITS-v2/ffmpeg.exe"
    const tmpDir = path.resolve(".tmp/voice-qa-sweep")
    await mkdir(tmpDir, { recursive: true })
    const { readdir } = await import("node:fs/promises")
    const files = (await readdir(stagingDir)).filter(name => /^voice_[a-z]+_aistory_\d+(_[mf])?\.ogg$/.test(name))
    const batch: Array<{ id: number; wav: string; text: string; file: string; suffix: string }> = []
    for (const file of files) {
        const match = file.match(/aistory_(\d+)(_[mf])?\.ogg$/)
        if (!match) continue
        const id = Number(match[1])
        const suffix = match[2] ?? ""
        const text = textById.get(id)?.get(suffix)
        if (!text) continue
        const wav = path.join(tmpDir, `${file}.wav`)
        const proc = Bun.spawn([ffmpeg, "-y", "-i", path.join(stagingDir, file), "-ac", "1", "-ar", "16000", wav], {
            stdout: "ignore",
            stderr: "ignore",
        })
        if ((await proc.exited) !== 0) continue
        batch.push({ id, wav, text, file, suffix })
    }
    console.log(`to-verify=${batch.length}`)
    const verifyInput = batch.map((item, index) => ({ id: index, wav: item.wav, text: item.text }))
    const results = await verifyPronunciationBatch(verifyInput)
    const resultByIndex = new Map(results.map(result => [result.id, result]))
    const failures: Array<{
        id: number
        file: string
        cer: number
        recall: number
        missing: number
        longest_missing: number
        transcript: string
    }> = []
    let checked = 0
    for (const [index, item] of batch.entries()) {
        const result = resultByIndex.get(index)
        checked += 1
        if (!result || !pass(result, item.text.length)) {
            failures.push({
                id: item.id,
                file: item.file,
                cer: result?.cer ?? 1,
                recall: result?.recall ?? 0,
                missing: result?.missing ?? 999,
                longest_missing: result?.longest_missing ?? 999,
                transcript: result?.transcript ?? "",
            })
            if (deleteBad) await rm(path.join(stagingDir, item.file), { force: true })
        }
    }
    for (const tmp of batch) await rm(tmp.wav, { force: true })
    await writeFile(path.join(stagingDir, "qa-sweep-report.json"), JSON.stringify({ thresholds, checked, failures }, null, 2))
    console.log(`checked=${checked} failures=${failures.length} ${deleteBad ? "(deleted)" : "(kept)"}`)
    for (const failure of failures.slice(0, 20)) {
        console.log(
            `bad ${failure.file} cer=${failure.cer} recall=${failure.recall} miss=${failure.longest_missing} asr=${failure.transcript.slice(0, 50)}`
        )
    }
}

if (import.meta.main) {
    await main()
}
