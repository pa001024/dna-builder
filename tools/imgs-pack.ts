#!/usr/bin/env bun

import fs from "node:fs"
import path from "node:path"
import { zipSync } from "fflate"
import { assertStorageConfig, getPublicUrl, putFile } from "./object-storage"

type ImgsPackVersionEntry = {
    builtAt: string
    packageFile: string
    version: string
    baseVersion?: string
    files: string[]
}

const rootDir = path.resolve(".")
const publicImgsRoot = path.resolve(rootDir, "public", "imgs")
const outDir = path.resolve(rootDir, "mock", "imgs-pack")
const versionsPath = path.resolve(outDir, "versions.json")

/**
 * 确保目录存在。
 * @param dirPath 目录路径
 */
function ensureDir(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true })
}

/**
 * 规范化相对路径。
 * @param filePath 文件路径
 * @returns 规范化路径
 */
function normalizePath(filePath: string): string {
    return filePath.replace(/^\/+/, "").replaceAll(path.sep, "/")
}

/**
 * 读取当前工作区图片文件。
 * @returns 图片文件映射
 */
function collectCurrentFiles(): string[] {
    const files: string[] = []
    const walk = (dirPath: string, relDir = "") => {
        for (const dirent of fs.readdirSync(dirPath, { withFileTypes: true })) {
            const absPath = path.join(dirPath, dirent.name)
            const relPath = relDir ? path.posix.join(relDir, dirent.name) : dirent.name
            if (dirent.isDirectory()) {
                walk(absPath, relPath)
                continue
            }

            files.push(normalizePath(relPath))
        }
    }

    if (fs.existsSync(publicImgsRoot)) {
        walk(publicImgsRoot)
    }

    return files.sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
}

/**
 * 读取已有版本列表。
 * @returns 版本列表
 */
function readVersions(): ImgsPackVersionEntry[] {
    if (!fs.existsSync(versionsPath)) {
        return []
    }

    const raw = JSON.parse(fs.readFileSync(versionsPath, "utf8")) as ImgsPackVersionEntry[]
    return Array.isArray(raw) ? raw : []
}

/**
 * 筛选所有历史版本中尚未打包的图片。
 * @param currentFiles 当前图片列表
 * @param versions 历史版本列表
 * @returns 待打包的新增图片列表
 */
export function collectNewFiles(currentFiles: string[], versions: Pick<ImgsPackVersionEntry, "files">[]): string[] {
    const packedFiles = new Set(versions.flatMap(entry => entry.files))
    return currentFiles.filter(file => !packedFiles.has(file))
}

/**
 * 构建单个图片包。
 * @param version 版本标签
 * @param files 文件列表
 * @returns 输出条目
 */
function buildPack(version: string, files: string[]): ImgsPackVersionEntry {
    const zipEntries: Record<string, Uint8Array> = {
        "manifest.json": new TextEncoder().encode(JSON.stringify({ version, files }, null, 2)),
    }

    for (const file of files) {
        const absPath = path.join(publicImgsRoot, file)
        if (fs.existsSync(absPath)) {
            zipEntries[file] = fs.readFileSync(absPath)
        }
    }

    fs.writeFileSync(path.join(outDir, `${version}.zip`), zipSync(zipEntries, { level: 9 }))

    return {
        builtAt: new Date().toISOString(),
        packageFile: `${version}.zip`,
        version,
        files,
    }
}

/**
 * 上传图片包与版本列表到对象存储（OSS 与 R2 双写，发布内容固定覆盖写）。
 * @param entry 版本条目
 */
async function uploadImgsPack(entry: ImgsPackVersionEntry): Promise<void> {
    assertStorageConfig()

    const localZipPath = path.join(outDir, `${entry.version}.zip`)
    const prefix = "imgs-pack"
    const zipKey = `${prefix}/${entry.version}.zip`
    const versionsKey = `${prefix}/versions.json`

    if (!fs.existsSync(localZipPath)) {
        throw new Error(`图片包文件不存在: ${localZipPath}`)
    }

    console.log(`📤 上传图片包文件到对象存储: ${zipKey}`)
    await putFile(zipKey, localZipPath)
    console.log(`✅ 上传成功: ${zipKey}`)

    console.log(`📤 上传版本列表到对象存储: ${versionsKey}`)
    await putFile(versionsKey, versionsPath)
    console.log(`✅ 上传成功: ${versionsKey}`)

    console.log(`已上传 ${entry.version}.zip -> ${getPublicUrl(zipKey)}`)
    console.log(`已上传 versions.json -> ${getPublicUrl(versionsKey)}`)
}

/**
 * 生成图片包版本列表。
 */
async function main(): Promise<void> {
    ensureDir(outDir)
    const files = collectCurrentFiles()
    const versions = readVersions()
    const newFiles = collectNewFiles(files, versions)
    if (!newFiles.length) {
        console.log("没有新增图片，跳过打包")
        return
    }

    const version = String(versions.length + 1)
    const entry = buildPack(version, newFiles)
    const entries: ImgsPackVersionEntry[] = [...versions, entry]

    fs.writeFileSync(versionsPath, JSON.stringify(entries, null, 2))
    console.log(`已生成图片包: ${entries.length} 个版本`)

    if (process.argv.includes("upload")) {
        await uploadImgsPack(entry)
    }
}

if (import.meta.main) {
    main().catch(error => {
        console.error(error)
        process.exit(1)
    })
}
