#!/usr/bin/env bun
/**
 * @file 双语字幕产物：subs.json → HyperFrames 字幕 clip 片段 + captions.css + 双语 srt。
 *
 * 字幕是 index.html 里的独立 clip 轨道（默认 track-index 8），不是画面的一部分：
 * 每句一个 clip，data-start / data-duration 直接来自 narrate.ts 的句级时间，天然与语音对齐。
 *
 * 用法：
 *   cd /e/dev/videos && bun <skill>/scripts/captions.ts --dir .tmp [--track 8] [--hold 120]
 */

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

interface Cue {
    index: number
    zh: string
    en: string
    start: number
    end: number
    duration: number
}

interface SubtitleFile {
    voice: string
    duration: number
    cues: Cue[]
}

const CAPTION_CSS = `.cap{position:absolute;left:0;right:0;bottom:26px;display:flex;justify-content:center;pointer-events:none}
.cap span{font-family:"HYSub",sans-serif;font-size:42px;line-height:1.26;color:#F4F8FD;letter-spacing:.02em;
  background:rgba(6,9,14,.66);padding:10px 28px 12px;border-radius:6px;text-align:center;max-width:1560px;
  text-shadow:0 2px 10px rgba(0,0,0,.75)}
.cap em{display:block;font-style:normal;font-size:26px;line-height:1.3;color:#AFC0D4;
  letter-spacing:.01em;margin-top:7px;text-shadow:0 2px 8px rgba(0,0,0,.7)}
`

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
 * 转义字幕文本里会破坏 HTML 结构的字符。
 * @param text 原文
 * @returns 可嵌入的文本
 */
function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * 秒 → srt 时间码。
 * @param seconds 秒
 * @returns `00:00:01,234`
 */
function toSrtTime(seconds: number): string {
    const total = Math.max(0, seconds)
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const secs = Math.floor(total % 60)
    const millis = Math.round((total - Math.floor(total)) * 1000)
    const pad = (value: number, width = 2) => String(value).padStart(width, "0")
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`
}

/**
 * 主流程：写 captions.html（clip 片段）、captions.css、subs.srt。
 */
async function main(): Promise<void> {
    const args = parseArgs()
    if (!args.dir) throw new Error("缺少 --dir（narrate.ts 的 --out 目录）")
    const dir = path.resolve(args.dir)
    const subs = JSON.parse(await readFile(path.join(dir, "subs.json"), "utf8")) as SubtitleFile
    const track = Number(args.track ?? 8)
    const hold = Number(args.hold ?? 120) / 1000

    const clips = subs.cues.map(cue => {
        const start = cue.start.toFixed(2)
        const duration = Math.max(0.4, cue.end - cue.start + hold).toFixed(2)
        const en = cue.en ? `<em>${escapeHtml(cue.en)}</em>` : ""
        return `<div class="cap clip" id="cap-${String(cue.index).padStart(2, "0")}" data-start="${start}" data-duration="${duration}" data-track-index="${track}"><span>${escapeHtml(cue.zh)}${en}</span></div>`
    })
    await writeFile(path.join(dir, "captions.html"), `${clips.join("\n")}\n`)
    await writeFile(path.join(dir, "captions.css"), CAPTION_CSS)

    const srt = subs.cues
        .map((cue, offset) => {
            const end = Math.min(subs.duration, cue.end + hold)
            const body = cue.en ? `${cue.zh}\n${cue.en}` : cue.zh
            return `${offset + 1}\n${toSrtTime(cue.start)} --> ${toSrtTime(end)}\n${body}\n`
        })
        .join("\n")
    await writeFile(path.join(dir, "subs.srt"), srt)

    const missingEn = subs.cues.filter(cue => !cue.en).length
    console.log(`字幕 ${subs.cues.length} 条 → captions.html / captions.css / subs.srt（track ${track}，片长 ${subs.duration}s）`)
    if (missingEn) console.log(`⚠ ${missingEn} 条没有英文行（subs.json 的 en 为空）`)
}

await main()
