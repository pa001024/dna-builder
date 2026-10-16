import { copyFile, mkdir, readdir, stat } from "node:fs/promises"
import path from "node:path"

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
 * 将 staging 区 ogg 按 `<lang>/aistory` 口径拷入本地 dna-voice-dataset 检出，
 * 随后在数据集仓库内提交推送即完成发布（modelscope 数据集为独立 git 仓库）。
 */
async function main(): Promise<void> {
    const args = parseArgs()
    const language = args.lang ?? "ch"
    const stagingDir = path.resolve(args.staging ?? `.tmp/voice-out/${language}/aistory`)
    const datasetRoot = path.resolve(args["dataset-root"] ?? Bun.env.VOICE_DATASET_ROOT ?? "../dna-voice-dataset")
    const targetDir = path.join(datasetRoot, language, "aistory")
    const write = args.write === "true"

    const names = (await readdir(stagingDir)).filter(name => name.endsWith(".ogg"))
    if (!names.length) throw new Error(`staging 为空或缺少 ogg：${stagingDir}（wav 需先转码为 ogg 再上传）`)
    for (const name of names) {
        if (!/^voice_[a-z]+_aistory_\d+(_[mf])?\.ogg$/.test(name)) throw new Error(`文件名不符合 aistory 口径：${name}`)
        const size = (await stat(path.join(stagingDir, name))).size
        if (size === 0) throw new Error(`空文件：${name}`)
    }
    console.log(`待上传 ${names.length} 个 -> ${targetDir}${write ? "" : "（预演，未加 --write）"}`)
    if (!write) return
    await mkdir(targetDir, { recursive: true })
    for (const name of names) {
        await copyFile(path.join(stagingDir, name), path.join(targetDir, name))
    }
    console.log(`已拷入 ${names.length} 个。请在 ${datasetRoot} 内 git add/commit/push 完成发布。`)
}

if (import.meta.main) {
    await main()
}
