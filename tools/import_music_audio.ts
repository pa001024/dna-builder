#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

const DATASET_ROOT = path.resolve("..", "dna-voice-dataset")
const SOURCE_EVENT_ROOT = path.join(DATASET_ROOT, "EM/Content/Asset/Audio/FMOD/Events/bgm")
const SOURCE_LOG_PREFIX = SOURCE_EVENT_ROOT.replaceAll("\\", "/")
const LOG_DIRECTORY = path.resolve("..", "dna-unpack", "Fmodel", "Output", "Logs")
const MUSIC_DATA_PATH = path.resolve("..", "DuetNightAbyssData2", "final", "i18n", "cn", "Music.json")
const WRITE_MODE = Bun.argv.includes("--write")

interface MusicRow {
    id: number
    music: string
}

interface AudioCopyTask {
    id: number
    musicPath: string
    sourcePath: string
    targetPath: string
}

/**
 * 转义正则表达式中的文本字面量。
 * @param value 待转义文本。
 * @returns 可用于正则表达式的字面量文本。
 */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 读取文件内容的 SHA-256，用于拒绝覆盖内容不同的目标文件。
 * @param filePath 文件路径。
 * @returns 文件内容的 SHA-256。
 */
async function getFileHash(filePath: string): Promise<string> {
    const content = await readFile(filePath)
    return createHash("sha256").update(content).digest("hex")
}

/**
 * 判断指定路径是否为现有文件。
 * @param filePath 文件路径。
 * @returns 路径是否对应文件。
 */
async function isFile(filePath: string): Promise<boolean> {
    try {
        return (await stat(filePath)).isFile()
    } catch {
        return false
    }
}

/**
 * 从顺序导出的 FModel 日志中提取“uasset 到导出音频”的映射。
 * @returns 以 uasset 相对路径为键的导出音频相对路径集合。
 */
async function collectAudioMappings(): Promise<Map<string, Set<string>>> {
    const logNames = (await readdir(LOG_DIRECTORY)).filter(name => /^FModel-Log-.*\.log$/.test(name)).sort()
    const mappings = new Map<string, Set<string>>()
    const sourceLogRegex = new RegExp(`SaveAndPlaySound: Successfully saved ${escapeRegExp(SOURCE_LOG_PREFIX)}/(.+?\\.ogg)$`)

    for (const logName of logNames) {
        const lines = (await readFile(path.join(LOG_DIRECTORY, logName), "utf8")).split(/\r?\n/)
        let pendingUassetPath: string | null = null

        for (const line of lines) {
            const extractMatch = line.match(/User DOUBLE-CLICKED to extract 'EM\/Content\/Asset\/Audio\/FMOD\/Events\/bgm\/(.+?)\.uasset'/)
            if (extractMatch) {
                pendingUassetPath = extractMatch[1]
                continue
            }

            const saveMatch = line.match(sourceLogRegex)
            if (!pendingUassetPath || !saveMatch) {
                continue
            }

            const sources = mappings.get(pendingUassetPath) ?? new Set<string>()
            sources.add(saveMatch[1])
            mappings.set(pendingUassetPath, sources)
            pendingUassetPath = null
        }
    }

    return mappings
}

/**
 * 根据 Music 数据和日志映射建立待复制的音频任务。
 * @param musicRows 乐谱数据。
 * @param mappings uasset 到导出音频的映射。
 * @returns 经过完整校验的复制任务。
 */
async function buildCopyTasks(musicRows: MusicRow[], mappings: Map<string, Set<string>>): Promise<AudioCopyTask[]> {
    const tasksByMusicPath = new Map<string, AudioCopyTask>()

    for (const row of musicRows) {
        if (!row.music.startsWith("/bgm/")) {
            throw new Error(`Music[${row.id}] 的 music 路径无效: ${row.music}`)
        }

        if (tasksByMusicPath.has(row.music)) {
            continue
        }

        const uassetRelativePath = row.music.slice("/bgm/".length)
        const sourceRelativePaths = mappings.get(uassetRelativePath)
        if (!sourceRelativePaths || sourceRelativePaths.size === 0) {
            throw new Error(`Music[${row.id}] 未在 FModel 日志中找到映射: ${uassetRelativePath}`)
        }
        if (sourceRelativePaths.size !== 1) {
            throw new Error(`Music[${row.id}] 存在多个导出音频映射: ${uassetRelativePath} -> ${[...sourceRelativePaths].join(", ")}`)
        }

        const sourceRelativePath = [...sourceRelativePaths][0]
        const sourcePath = path.join(SOURCE_EVENT_ROOT, sourceRelativePath)
        const targetPath = path.join(DATASET_ROOT, `${row.music.slice(1)}.ogg`)

        if (!(await isFile(sourcePath))) {
            throw new Error(`Music[${row.id}] 的导出音频不存在: ${sourcePath}`)
        }
        tasksByMusicPath.set(row.music, {
            id: row.id,
            musicPath: row.music,
            sourcePath,
            targetPath,
        })
    }

    return [...tasksByMusicPath.values()]
}

/**
 * 复制已验证的音频；已有目标必须与源文件内容一致。
 * @param task 复制任务。
 * @returns 操作结果。
 */
async function copyAudio(task: AudioCopyTask): Promise<"copied" | "existing"> {
    if (await isFile(task.targetPath)) {
        const [sourceHash, targetHash] = await Promise.all([getFileHash(task.sourcePath), getFileHash(task.targetPath)])
        if (sourceHash !== targetHash) {
            throw new Error(`目标文件内容冲突，拒绝覆盖: ${task.targetPath}`)
        }
        return "existing"
    }

    await mkdir(path.dirname(task.targetPath), { recursive: true })
    await copyFile(task.sourcePath, task.targetPath)
    return "copied"
}

/**
 * 执行日志映射校验与音频复制。
 */
async function main(): Promise<void> {
    const musicRows = JSON.parse(await readFile(MUSIC_DATA_PATH, "utf8")) as MusicRow[]
    const mappings = await collectAudioMappings()
    const tasks = await buildCopyTasks(musicRows, mappings)
    const example = tasks.find(task => task.musicPath === "/bgm/1_0/musicbox/0094_feina_activity_level_02")
    if (!example) {
        throw new Error("未找到 0094_feina_activity_level_02 示例乐谱")
    }

    console.log(`已解析 ${tasks.length} 个唯一乐谱音频映射`)
    console.log(`示例: ${example.sourcePath} -> ${example.targetPath}`)

    if (!WRITE_MODE) {
        console.log("演练完成；使用 --write 执行复制")
        return
    }

    let copiedCount = 0
    let existingCount = 0
    for (const task of tasks) {
        const result = await copyAudio(task)
        if (result === "copied") {
            copiedCount += 1
        } else {
            existingCount += 1
        }
    }

    console.log(`复制完成: 新增 ${copiedCount} 个，已校验 ${existingCount} 个`)
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
