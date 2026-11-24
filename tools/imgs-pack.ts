#!/usr/bin/env bun

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { zipSync } from "fflate"
import { assertStorageConfig, getPublicUrl, putFile } from "./object-storage"

type ImgsPackVersionEntry = {
    builtAt: string
    packageFile: string
    version: string
    baseVersion?: string
    files: string[]
}

/** 仓库根：本文件位于 `<root>/tools/` 下，与调用方 cwd 无关 */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const webDir = path.resolve(rootDir, "apps", "web")
const publicImgsRoot = path.resolve(webDir, "public", "imgs")
const outDir = path.resolve(webDir, "mock", "imgs-pack")
const versionsPath = path.resolve(outDir, "versions.json")
/** 待发布的版本列表：上传成功后才替换 `versions.json`，避免本地清单领先 CDN */
const pendingVersionsPath = path.resolve(outDir, "versions.pending.json")

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
 * @param strict 为 true 时任一源文件缺失即抛错（重新打包旧版本用）
 * @returns 输出条目
 */
function buildPack(version: string, files: string[], strict = false): ImgsPackVersionEntry {
    const zipEntries: Record<string, Uint8Array> = {
        "manifest.json": new TextEncoder().encode(JSON.stringify({ version, files }, null, 2)),
    }
    const missingFiles: string[] = []

    for (const file of files) {
        const absPath = path.join(publicImgsRoot, file)
        if (fs.existsSync(absPath)) {
            zipEntries[file] = fs.readFileSync(absPath)
        } else {
            missingFiles.push(file)
        }
    }

    if (strict && missingFiles.length) {
        throw new Error(`图片源文件缺失，无法重新打包 ${version}：${missingFiles.join(", ")}`)
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
 * 上传单个图片包 zip（OSS 主、R2 从）。
 * @param entry 版本条目
 */
async function uploadImgsZip(entry: ImgsPackVersionEntry): Promise<void> {
    const localZipPath = path.join(outDir, `${entry.version}.zip`)
    const zipKey = `imgs-pack/${entry.version}.zip`

    if (!fs.existsSync(localZipPath)) {
        throw new Error(`图片包文件不存在: ${localZipPath}`)
    }

    console.log(`📤 上传图片包文件到对象存储: ${zipKey}`)
    await putFile(zipKey, localZipPath)
    console.log(`✅ 上传成功: ${zipKey}`)
    console.log(`已上传 ${entry.version}.zip -> ${getPublicUrl(zipKey)}`)
}

/**
 * 上传版本列表：先写临时文件上传，成功后才替换本地 `versions.json`。
 *
 * zip 上传失败时本地清单保持不变，重跑会重新生成同一个版本号，不会出现
 * 「本地清单已有该版本、CDN 上没有对应 zip」的错位。
 * @param entries 版本列表
 */
async function uploadImgsVersions(entries: ImgsPackVersionEntry[]): Promise<void> {
    const versionsKey = "imgs-pack/versions.json"

    fs.writeFileSync(pendingVersionsPath, JSON.stringify(entries, null, 2))
    console.log(`📤 上传版本列表到对象存储: ${versionsKey}`)
    try {
        await putFile(versionsKey, pendingVersionsPath)
    } catch (error) {
        fs.rmSync(pendingVersionsPath, { force: true })
        throw error
    }

    fs.renameSync(pendingVersionsPath, versionsPath)
    console.log(`✅ 上传成功: ${versionsKey}`)
    console.log(`已上传 versions.json -> ${getPublicUrl(versionsKey)}`)
}

/**
 * 提示「已打包但未上传」并让命令以失败退出。
 * @param action 已完成的本地动作
 */
function reportMissingUpload(action: string): void {
    console.error(
        `❌ ${action}，但没有上传：缺少 upload 参数，versions.json 未修改。\n` +
            "   发布必须带 upload 参数（打包与上传同步完成），否则 CDN 上的版本列表会引用不存在的包。\n" +
            "   重新执行：bun tools/imgs-pack.ts <相同参数> upload"
    )
    process.exitCode = 1
}

/**
 * 解析命令行参数。
 * @param argv 命令行参数（不含 node/bun 与脚本路径）
 * @returns 是否上传与需要重新打包的版本列表
 */
function parseArgs(argv: string[]): { upload: boolean; repackVersions: string[] } {
    const repackIndex = argv.indexOf("repack")
    const repackVersions = repackIndex < 0 ? [] : argv.slice(repackIndex + 1).filter(arg => arg !== "upload" && arg !== "build")

    return { upload: argv.includes("upload"), repackVersions }
}

/**
 * 用当前图片重新打包指定版本（历史 zip 里的图片可能已被覆盖修改）。
 * @param versions 历史版本列表
 * @param targets 需要重新打包的版本
 * @param upload 是否上传
 * @throws 版本不存在、源文件缺失或上传失败时抛错
 */
async function repackPacks(versions: ImgsPackVersionEntry[], targets: string[], upload: boolean): Promise<void> {
    const missingVersions = targets.filter(version => !versions.some(entry => entry.version === version))
    if (missingVersions.length) {
        throw new Error(`版本不存在: ${missingVersions.join(", ")}`)
    }

    for (const version of targets) {
        const entry = versions.find(item => item.version === version)
        if (!entry) {
            continue
        }

        const rebuilt = buildPack(entry.version, entry.files, true)
        console.log(`已重新打包 ${rebuilt.packageFile}（${rebuilt.files.length} 张）`)
    }

    if (!upload) {
        reportMissingUpload("已重新生成本地图片包")
        return
    }

    assertStorageConfig()
    for (const version of targets) {
        const entry = versions.find(item => item.version === version)
        if (entry) {
            await uploadImgsZip(entry)
        }
    }
    await uploadImgsVersions(versions)
}

/**
 * 生成图片包并同步发布。
 *
 * 不带 `upload` 时只产本地 zip、不修改 `versions.json`，并以失败退出——
 * 版本列表一旦领先于已上传的 zip，客户端就会引用 404 的包。
 */
async function main(): Promise<void> {
    ensureDir(outDir)
    const { upload, repackVersions } = parseArgs(process.argv.slice(2))
    const versions = readVersions()

    if (repackVersions.length) {
        await repackPacks(versions, repackVersions, upload)
        return
    }

    const files = collectCurrentFiles()
    const newFiles = collectNewFiles(files, versions)
    if (!newFiles.length) {
        console.log("没有新增图片，跳过打包")
        return
    }

    const version = String(versions.length + 1)
    const entry = buildPack(version, newFiles)
    if (!upload) {
        reportMissingUpload(`已生成本地图片包 ${entry.packageFile}`)
        return
    }

    assertStorageConfig()
    await uploadImgsZip(entry)
    await uploadImgsVersions([...versions, entry])
}

if (import.meta.main) {
    main().catch(error => {
        console.error(error)
        process.exit(1)
    })
}
