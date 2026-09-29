#!/usr/bin/env bun

/**
 * 图片补传：把 `public/imgs` 下远端缺失的文件补传到各存储端的 `imgs/` 前缀。
 *
 * 判定**按端各算各的**：每个后端（OSS / R2）各自列出前缀下的 key 集合，
 * 本地文件在某端已存在就跳过该端，只在缺失的那端补写。因此历史遗留的单端缺失
 * 会在一次运行里被补齐到两端，且不会重传已一致的文件。
 */

import fs from "node:fs"
import path from "node:path"
import { assertStorageConfig, getActiveBackends, getPublicUrl, listAllKeysInBackend, putFileToBackend } from "./object-storage"

const rootDir = path.resolve(".")
const localImgsDir = path.resolve(rootDir, "public/imgs")

/**
 * @description 由本地相对路径生成远端 key。
 * @param relPath 本地相对路径
 * @returns 远端 key
 */
function toRemoteKey(relPath: string): string {
    return path.posix.join("imgs", relPath.replaceAll(path.sep, "/"))
}

/**
 * @description 递归收集目录下的全部文件（不含目录本身）。
 * @param dirPath 当前目录
 * @param relativeDir 相对目录
 * @returns 扁平化的文件条目
 */
function collectLocalFiles(dirPath: string, relativeDir = ""): { absPath: string; relPath: string }[] {
    const files: { absPath: string; relPath: string }[] = []

    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const absPath = path.join(dirPath, entry.name)
        const relPath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name
        if (entry.isDirectory()) {
            files.push(...collectLocalFiles(absPath, relPath))
            continue
        }

        files.push({ absPath, relPath })
    }

    return files
}

/**
 * @description 把本地缺失的图片补传到各存储端，逐端判定与写入。
 * @throws 本地目录不存在或对象存储未配置时抛错
 */
async function uploadMissingImgs(): Promise<void> {
    if (!fs.existsSync(localImgsDir)) {
        throw new Error(`本地图片目录不存在: ${localImgsDir}`)
    }

    assertStorageConfig()

    const localFiles = collectLocalFiles(localImgsDir)
    console.log(`本地图片 ${localFiles.length} 个`)

    // 逐端拉取已有 key：判定各算各的，缺哪端补哪端
    const backends = getActiveBackends()
    const remoteKeysByBackend = new Map<string, Set<string>>()
    for (const backend of backends) {
        const keys = await listAllKeysInBackend("imgs/", backend)
        remoteKeysByBackend.set(backend.label, keys)
        console.log(`${backend.label} 远端已有 ${keys.size} 个对象`)
    }

    // 统计与上传：仅在目标端缺失时写入该端
    const uploadedByBackend = new Map<string, number>(backends.map(backend => [backend.label, 0]))
    let fullySkipped = 0

    for (const file of localFiles) {
        const remoteKey = toRemoteKey(file.relPath)
        const missingOn = backends.filter(backend => !remoteKeysByBackend.get(backend.label)?.has(remoteKey))
        if (!missingOn.length) {
            fullySkipped += 1
            continue
        }

        for (const backend of missingOn) {
            await putFileToBackend(backend, remoteKey, file.absPath)
            uploadedByBackend.set(backend.label, (uploadedByBackend.get(backend.label) ?? 0) + 1)
        }
        console.log(`上传: ${remoteKey} -> [${missingOn.map(b => b.label).join(", ")}] ${getPublicUrl(remoteKey)}`)
    }

    const summary = backends.map(backend => `${backend.label} 上传 ${uploadedByBackend.get(backend.label) ?? 0} 个`).join(", ")
    console.log(`完成: ${summary}, 两端均已存在跳过 ${fullySkipped} 个文件`)
}

void uploadMissingImgs().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
})
