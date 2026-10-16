import { mkdir } from "node:fs/promises"
import path from "node:path"

const VOICE_DATASET_BASE_URL = "https://modelscope.cn/datasets/pa001024/dna-voice-dataset/resolve/master"

const FFMPEG_CANDIDATES = [process.env.FFMPEG_PATH || "", "E:/soft/GPT-SoVITS-v2/ffmpeg.exe", "ffmpeg"].filter(Boolean)

/**
 * 把 charvoice 参考语音 res 解析为数据集 ogg 地址。
 * @param res 参考语音 res（如 char_Heitao_vo_gain）
 * @param language 数据集语言代码
 * @returns ogg 直链
 */
export function buildRefAudioUrl(res: string, language = "ch"): string {
    return `${VOICE_DATASET_BASE_URL}/${language}/char/voice_${language}_${encodeURIComponent(res)}.ogg`
}

/**
 * wav 转 opus ogg（64k），与前端数据集音频口径一致。
 * @param wavPath 输入 wav 路径
 * @param oggPath 输出 ogg 路径
 */
export async function convertWavToOgg(wavPath: string, oggPath: string): Promise<void> {
    let lastError = ""
    for (const ffmpeg of FFMPEG_CANDIDATES) {
        const proc = Bun.spawn([ffmpeg, "-y", "-i", wavPath, "-c:a", "libopus", "-b:a", "64k", oggPath], {
            stdout: "ignore",
            stderr: "pipe",
        })
        const exitCode = await proc.exited
        if (exitCode === 0 && (await Bun.file(oggPath).exists())) return
        lastError = (await new Response(proc.stderr).text()).slice(-300)
    }
    throw new Error(`ogg 转码失败: ${lastError}`)
}

/**
 * 把剧情语音 key（如 story/1002/100293/1914AD4C）展开为候选 ogg 直链。
 * @param voiceKey 剧情语音 key
 * @param language 数据集语言代码
 * @returns 按 _f / _m / 无后缀排序的候选地址
 */
export function buildStoryVoiceUrls(voiceKey: string, language = "ch"): string[] {
    const segments = voiceKey.replace(/\\/g, "/").split("/").filter(Boolean)
    if (!segments.length) return []
    const folder = segments[0]
    const flat = segments.join("_")
    const suffixes = ["_f", "_m", ""]
    return suffixes.map(suffix => `${VOICE_DATASET_BASE_URL}/${language}/${folder}/voice_${language}_${flat}${suffix}.ogg`)
}

/**
 * 下载剧情参考音频并转 wav，默认依次试 _f / _m / 无后缀，命中即停。
 * @param voiceKey 剧情语音 key
 * @param cacheDir 缓存目录
 * @param language 数据集语言代码
 * @param requireSuffix 指定后缀时只试该文件（男声作业只吃 _m，404 即抛由上层回退）
 * @returns 本地 wav 路径
 */
export async function resolveStoryRefAudioWav(
    voiceKey: string,
    cacheDir: string,
    language = "ch",
    requireSuffix?: "_m" | "_f" | ""
): Promise<string> {
    await mkdir(cacheDir, { recursive: true })
    const safeName = voiceKey.replace(/\\/g, "/").split("/").filter(Boolean).join("_") + (requireSuffix === undefined ? "" : requireSuffix)
    const wavPath = path.resolve(cacheDir, `story_${safeName}.wav`)
    if (await Bun.file(wavPath).exists()) return wavPath
    const oggPath = path.resolve(cacheDir, `story_${safeName}.ogg`)
    if (!(await Bun.file(oggPath).exists())) {
        const urls = buildStoryVoiceUrls(voiceKey, language)
        const wanted = requireSuffix === undefined ? urls : urls.filter(url => url.endsWith(`${requireSuffix}.ogg`))
        let downloaded = false
        for (const url of wanted) {
            const response = await fetch(url)
            if (!response.ok) continue
            await Bun.write(oggPath, await response.arrayBuffer())
            downloaded = true
            break
        }
        if (!downloaded) throw new Error(`参考音频均 404: ${voiceKey}`)
    }
    return convertOggToWav(oggPath, wavPath)
}

/**
 * ogg 转 32k 单声道 wav。
 * @param oggPath 输入 ogg 路径
 * @param wavPath 输出 wav 路径
 * @returns 输出 wav 路径
 */
export async function convertOggToWav(oggPath: string, wavPath: string): Promise<string> {
    let lastError = ""
    for (const ffmpeg of FFMPEG_CANDIDATES) {
        const proc = Bun.spawn([ffmpeg, "-y", "-i", oggPath, "-ac", "1", "-ar", "32000", wavPath], {
            stdout: "ignore",
            stderr: "pipe",
        })
        const exitCode = await proc.exited
        if (exitCode === 0 && (await Bun.file(wavPath).exists())) return wavPath
        lastError = (await new Response(proc.stderr).text()).slice(-300)
    }
    throw new Error(`ffmpeg 转码失败: ${lastError}`)
}

/**
 * 下载角色参考音频并转 wav，落本地缓存（GPT-SoVITS 只吃本地路径）。
 * @param res 参考语音 res
 * @param cacheDir 缓存目录
 * @param language 数据集语言代码
 * @returns 本地 wav 路径
 */
export async function resolveRefAudioWav(res: string, cacheDir: string, language = "ch"): Promise<string> {
    await mkdir(cacheDir, { recursive: true })
    const wavPath = path.resolve(cacheDir, `${res}.wav`)
    if (await Bun.file(wavPath).exists()) return wavPath
    const oggPath = path.resolve(cacheDir, `${res}.ogg`)
    if (!(await Bun.file(oggPath).exists())) {
        const response = await fetch(buildRefAudioUrl(res, language))
        if (!response.ok) throw new Error(`参考音频下载失败 ${response.status}: ${res}`)
        await Bun.write(oggPath, await response.arrayBuffer())
    }
    let lastError = ""
    for (const ffmpeg of FFMPEG_CANDIDATES) {
        const proc = Bun.spawn([ffmpeg, "-y", "-i", oggPath, "-ac", "1", "-ar", "32000", wavPath], {
            stdout: "ignore",
            stderr: "pipe",
        })
        const exitCode = await proc.exited
        if (exitCode === 0 && (await Bun.file(wavPath).exists())) return wavPath
        lastError = (await new Response(proc.stderr).text()).slice(-300)
    }
    throw new Error(`ffmpeg 转码失败: ${lastError}`)
}
