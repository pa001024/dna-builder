#!/usr/bin/env bun
/**
 * @file 分段渲染：把整片按场景边界切成若干段，每段生成一个可独立渲染的 composition，
 * 逐段 render 后用 ffmpeg 拼接、再一次性挂上整条旁白音频。
 *
 * 为什么分段：整片（3 分钟以上、多场景 + 长音频）一次渲染常常要十几分钟且中途失败全废；
 * 分段后单段 30–90s、失败只重跑一段，还能并行。
 * 旁白不进分段：每段只渲画面（静音），最后 `-c copy` 拼接再挂 voice.wav，避免逐段 AAC 拼接漂移。
 *
 * 用法：
 *   cd /e/dev/videos && bun <skill>/scripts/parts.ts \
 *     --project . --subs .tmp/subs.json --scenes scenes.json --split 90 [--run]
 *
 * scenes.json: [{"id":"f1-announce","start":0,"duration":30.16}, ...]（id = compositions/<id>.html 里的 data-composition-id）
 */

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

interface Scene {
    id: string
    start: number
    duration: number
}

interface Cue {
    index: number
    zh: string
    en: string
    start: number
    end: number
}

interface SubtitleFile {
    voice: string
    duration: number
    cues: Cue[]
}

interface PartRange {
    index: number
    start: number
    end: number
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
 * 按目标长度在场景边界上切段（不切穿单个场景）。
 * @param scenes 场景表
 * @param target 每段目标秒数
 * @returns 分段区间
 */
function splitParts(scenes: Scene[], target: number): PartRange[] {
    const ordered = [...scenes].sort((left, right) => left.start - right.start)
    const parts: PartRange[] = []
    let start = ordered[0].start
    let cursor = start
    for (const scene of ordered) {
        if (cursor - start >= target && cursor > start) {
            parts.push({ index: parts.length + 1, start, end: cursor })
            start = cursor
        }
        cursor = Math.max(cursor, scene.start + scene.duration)
    }
    parts.push({ index: parts.length + 1, start, end: cursor })
    return parts.map(part => ({ ...part, start: Number(part.start.toFixed(3)), end: Number(part.end.toFixed(3)) }))
}

/**
 * 把区间 [from,to) 与 [start,end) 的交集算出来。
 * @returns 交集区间，无交集返回 undefined
 */
function overlap(from: number, to: number, start: number, end: number): { start: number; end: number } | undefined {
    const a = Math.max(from, start)
    const b = Math.min(to, end)
    return b - a > 0.01 ? { start: a, end: b } : undefined
}

/**
 * 生成一段的 composition HTML：字体、字幕样式、该段场景 clip、该段字幕 clip。
 * @param part 分段区间
 * @param scenes 场景表
 * @param cues 字幕
 * @param captionsCss 字幕样式
 * @param size 画布尺寸
 * @returns HTML 文本
 */
function renderPartHtml(
    part: PartRange,
    scenes: Scene[],
    cues: Cue[],
    captionsCss: string,
    size: { width: number; height: number }
): string {
    const clips = scenes
        .map(scene => ({ scene, span: overlap(part.start, part.end, scene.start, scene.start + scene.duration) }))
        .filter((row): row is { scene: Scene; span: { start: number; end: number } } => Boolean(row.span))
        .map(
            ({ scene, span }) =>
                `  <div id="s-${scene.id}" data-composition-id="${scene.id}" data-composition-src="compositions/${scene.id}.html" data-start="${(span.start - part.start).toFixed(3)}" data-duration="${(span.end - span.start).toFixed(3)}" data-track-index="1" data-width="${size.width}" data-height="${size.height}"></div>`
        )
    const captionClips = cues
        .map(cue => ({ cue, span: overlap(part.start, part.end, cue.start, cue.end) }))
        .filter((row): row is { cue: Cue; span: { start: number; end: number } } => Boolean(row.span))
        .map(({ cue, span }) => {
            const en = cue.en ? `<em>${cue.en.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</em>` : ""
            const zh = cue.zh.replace(/&/g, "&amp;").replace(/</g, "&lt;")
            return `  <div class="cap clip" id="cap-${String(cue.index).padStart(2, "0")}" data-start="${(span.start - part.start).toFixed(3)}" data-duration="${(span.end - span.start).toFixed(3)}" data-track-index="8"><span>${zh}${en}</span></div>`
        })
    const duration = (part.end - part.start).toFixed(3)
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${size.width}, height=${size.height}" />
<title>part-${String(part.index).padStart(2, "0")}</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face{font-family:"SerifSC";src:url("assets/fonts/NotoSerifCJKsc-Black.otf") format("opentype");font-weight:400;font-display:block}
@font-face{font-family:"HYSub";src:url("assets/fonts/blod.ttf") format("truetype");font-weight:400;font-display:block}
body{margin:0;background:#080B11}
#root{position:relative;width:100%;height:100%;overflow:hidden;background:#080B11}
${captionsCss}</style>
</head>
<body>
<div id="root" data-composition-id="part-${String(part.index).padStart(2, "0")}" data-start="0" data-width="${size.width}" data-height="${size.height}" data-duration="${duration}">
${clips.join("\n")}


${captionClips.join("\n")}
</div>
<script>
const tl = gsap.timeline({ paused: true });
window.__timelines = window.__timelines || {};
window.__timelines["part-${String(part.index).padStart(2, "0")}"] = tl;
</script>
</body>
</html>
`
}

/**
 * 主流程：切段 → 写 part-XX.html / concat.txt → 打印（或执行）逐段渲染 + 拼接 + 挂音轨。
 */
async function main(): Promise<void> {
    const args = parseArgs()
    if (!args.project || !args.subs || !args.scenes) throw new Error("需要 --project / --subs / --scenes")
    const project = path.resolve(args.project)
    const subs = JSON.parse(await readFile(path.resolve(args.subs), "utf8")) as SubtitleFile
    const scenes = JSON.parse(await readFile(path.resolve(args.scenes), "utf8")) as Scene[]
    if (!scenes.length) throw new Error("scenes.json 为空")
    const cssPath = path.resolve(args.css || path.join(path.dirname(path.resolve(args.subs)), "captions.css"))
    if (!existsSync(cssPath)) throw new Error(`缺字幕样式: ${cssPath}（先跑 captions.ts）`)
    const cssText = await readFile(cssPath, "utf8")
    const size = { width: Number(args.width ?? 1920), height: Number(args.height ?? 1080) }
    const target = Number(args.split ?? 90)

    const parts = splitParts(scenes, target)
    const renderDir = path.join(project, "renders", "parts")
    await mkdir(renderDir, { recursive: true })
    const concatLines: string[] = []
    for (const part of parts) {
        const name = `part-${String(part.index).padStart(2, "0")}`
        await writeFile(path.join(project, `${name}.html`), renderPartHtml(part, scenes, subs.cues, cssText, size))
        concatLines.push(`file 'renders/parts/${name}.mp4'`)
        console.log(`${name}: ${part.start.toFixed(2)} → ${part.end.toFixed(2)}s (${(part.end - part.start).toFixed(2)}s)`)
    }
    await writeFile(path.join(renderDir, "concat.txt"), `${concatLines.join("\n")}\n`)

    const pin = await readHyperframesPin(project)
    const cli = `npx --yes hyperframes@${pin}`
    const renderCommands = parts.map(
        part =>
            `${cli} render -c part-${String(part.index).padStart(2, "0")}.html --quality looks -o renders/parts/part-${String(part.index).padStart(2, "0")}.mp4`
    )
    const voice = resolveVoicePath(project, subs.voice)
    const slug = await resolveSlug(project, args.slug)
    const joined = path.join(renderDir, "joined.mp4")
    const finalOut = path.join(project, "renders", `${slug}-${size.height}p.mp4`)
    const ffmpegCommands = [
        `ffmpeg -y -f concat -safe 0 -i renders/parts/concat.txt -c copy ${path.relative(project, joined).split(path.sep).join("/")}`,
        `ffmpeg -y -i ${path.relative(project, joined).split(path.sep).join("/")} -i ${path.relative(project, voice).split(path.sep).join("/")} -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest ${path.relative(project, finalOut).split(path.sep).join("/")}`,
    ]

    console.log(`\n# 逐段渲染（在 ${project} 下执行）`)
    for (const command of renderCommands) console.log(command)
    console.log("\n# 拼接 + 挂整条旁白")
    for (const command of ffmpegCommands) console.log(command)

    if (args.run === "true") {
        for (const command of renderCommands) await runShell(command, project)
        for (const command of ffmpegCommands) await runShell(command, project)
        console.log(`\n成片 → ${finalOut}`)
    }
}

/**
 * 找旁白音频：优先 assets/（成片用的位置），退回 subs.json 同目录。
 * @param project 项目目录
 * @param voice subs.json 里记录的音频文件名
 * @returns 音频绝对路径
 */
function resolveVoicePath(project: string, voice: string): string {
    const inAssets = path.join(project, "assets", voice)
    if (existsSync(inAssets)) return inAssets
    const besideSubs = path.join(project, ".tmp", voice)
    if (existsSync(besideSubs)) return besideSubs
    return inAssets
}

/**
 * 片子短名：--slug 优先，其次 git 分支名（一视频一分支），最后目录名。
 * @param project 项目目录
 * @param explicit 命令行传入的 slug
 * @returns 短名
 */
async function resolveSlug(project: string, explicit?: string): Promise<string> {
    if (explicit) return explicit
    try {
        const proc = Bun.spawn(["git", "-C", project, "rev-parse", "--abbrev-ref", "HEAD"], { stdout: "pipe", stderr: "ignore" })
        const name = (await new Response(proc.stdout).text()).trim()
        await proc.exited
        if (name && name !== "HEAD" && name !== "template") return name
    } catch {}
    return path.basename(project)
}

/**
 * 读项目 package.json 里 pin 的 hyperframes 版本（没有就用 latest）。
 * @param project 项目目录
 * @returns 版本号字符串
 */
async function readHyperframesPin(project: string): Promise<string> {
    try {
        const pkg = JSON.parse(await readFile(path.join(project, "package.json"), "utf8")) as { scripts?: Record<string, string> }
        const match = JSON.stringify(pkg.scripts ?? {}).match(/hyperframes@(\d+\.\d+\.\d+)/)
        if (match) return match[1]
    } catch {}
    return "latest"
}

/**
 * 在项目目录下执行一条 shell 命令。
 * @param command 命令
 * @param cwd 工作目录
 */
async function runShell(command: string, cwd: string): Promise<void> {
    console.log(`\n$ ${command}`)
    const proc = Bun.spawn(["bash", "-lc", command], { cwd, stdout: "inherit", stderr: "inherit" })
    const code = await proc.exited
    if (code !== 0) throw new Error(`命令失败(${code}): ${command}`)
}

await main()
