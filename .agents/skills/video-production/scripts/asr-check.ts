#!/usr/bin/env bun
/**
 * @file 旁白验音：常驻 FunASR（SeACo-Paraformer）把每句 wav 转写回来，按 CER / recall / 最长丢字判定这句是否要重合成。
 *
 * 模型只加载一次（约半分钟），之后逐条走 stdin/stdout，整片 100 句也能在分钟级跑完。
 *
 * 用法：
 *   cd /e/dev/videos && bun <skill>/scripts/asr-check.ts --dir .tmp [--model paraformer-zh]
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { AsrServeSession, isQaPass, readQaThresholds } from "../../../../tools/voice/asr"

interface Cue {
    index: number
    zh: string
    en: string
    start: number
    end: number
    wav: string
}

interface CheckRow {
    index: number
    zh: string
    start: number
    end: number
    transcript: string
    cer: number
    recall: number
    missing: number
    longest_missing: number
    pass: boolean
}

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
 * 期望文本的归一化长度（与 asr_verify.py 的 normalize 同口径：去掉空白与标点）。
 * @param text 原文
 * @returns 归一化后的字符数
 */
function normalizedLength(text: string): number {
    return text
        .normalize("NFKC")
        .replace(/[\s，。？！、,.?!~～—…·"'“”‘’()（）<>/\\|｜_*-]/g, "").length
}

/**
 * 主流程：逐句验音 → 落盘 asr.json → 打印需要重合成的句子。
 */
async function main(): Promise<void> {
    const args = parseArgs()
    if (!args.dir) throw new Error("缺少 --dir（narrate.ts 的 --out 目录）")
    const dir = path.resolve(args.dir)
    const subs = JSON.parse(await readFile(path.join(dir, "subs.json"), "utf8")) as { cues: Cue[] }
    const thresholds = readQaThresholds()
    if (args.model) process.env.VOICE_ASR_MODEL = args.model

    const session = new AsrServeSession()
    await session.start()
    const rows: CheckRow[] = []
    try {
        for (const cue of subs.cues) {
            const result = await session.verify({ id: cue.index, wav: path.join(dir, cue.wav), text: cue.zh })
            rows.push({
                index: cue.index,
                zh: cue.zh,
                start: cue.start,
                end: cue.end,
                transcript: result.transcript,
                cer: result.cer,
                recall: result.recall,
                missing: result.missing,
                longest_missing: result.longest_missing,
                pass: isQaPass(result, thresholds, normalizedLength(cue.zh)),
            })
        }
    } finally {
        session.stop()
    }

    await writeFile(path.join(dir, "asr.json"), JSON.stringify(rows, null, 2))
    const failed = rows.filter(row => !row.pass)
    console.table(failed.map(row => ({ "#": row.index, cer: row.cer, recall: row.recall, missing: row.missing, zh: row.zh })))
    console.log(`验音 ${rows.length} 句，未通过 ${failed.length} 句（阈值 CER≤${thresholds.cer} / recall≥${thresholds.recall}）`)
    if (failed.length) console.log(`重合成：删掉对应 seg/seg-XXX-*.wav 后重跑 narrate.ts（或用 --force 全量）`)
}

await main()
