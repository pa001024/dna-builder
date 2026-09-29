#!/usr/bin/env bun

/**
 * 图片补传：把 `public/imgs` 下远端缺失的文件补传到 R2 的 `imgs/` 前缀，已存在的同名对象跳过。
 *
 * 与 OSS 时代的差别：R2 没有「目录」概念，不需要逐目录 head 再 put 空占位对象，
 * 一次性列出前缀下全部 key 做差集即可（3.5k 个对象约 4 次 list）。
 */

import fs from "node:fs"
import path from "node:path"
import { assertStorageConfig, getPublicUrl, listAllKeys, putFile } from "./object-storage"

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
 * @description 上传远端缺失的图片。
 * @throws 本地目录不存在或对象存储未配置时抛错
 */
async function uploadMissingImgs(): Promise<void> {
    if (!fs.existsSync(localImgsDir)) {
        throw new Error(`本地图片目录不存在: ${localImgsDir}`)
    }

    assertStorageConfig()

    const localFiles = collectLocalFiles(localImgsDir)
    console.log(`本地图片 ${localFiles.length} 个，读取远端清单…`)
    const remoteKeys = await listAllKeys("imgs/")
    console.log(`远端已有 ${remoteKeys.size} 个对象`)

    let uploadedCount = 0
    let skippedCount = 0

    for (const file of localFiles) {
        const remoteKey = toRemoteKey(file.relPath)
        if (remoteKeys.has(remoteKey)) {
            skippedCount += 1
            continue
        }

        await putFile(remoteKey, file.absPath)
        uploadedCount += 1
        console.log(`上传: ${remoteKey} -> ${getPublicUrl(remoteKey)}`)
    }

    console.log(`完成: 上传 ${uploadedCount} 个文件, 跳过 ${skippedCount} 个文件`)
}

void uploadMissingImgs().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
})
