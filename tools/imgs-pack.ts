#!/usr/bin/env bun

import fs from "node:fs"
import path from "node:path"
import { zipSync } from "fflate"
import { parse } from "dotenv"
import OSS from "ali-oss"

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
const envPath = path.resolve(rootDir, "server", ".env")
const envConfig = fs.existsSync(envPath) ? parse(fs.readFileSync(envPath)) : {}
const ossConfig = {
    endpoint: envConfig.OSS_ACC_ENDPOINT || envConfig.OSS_ENDPOINT || "",
    bucket: envConfig.OSS_BUCKET || "",
    accessKeyId: envConfig.OSS_ACCESS_KEY_ID || "",
    accessKeySecret: envConfig.OSS_ACCESS_KEY_SECRET || "",
    cdn: envConfig.CDN_URL || "",
}

/**
 * 确保目录存在。
 * @param dirPath 目录路径
 */
function ensureDir(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true })
}

/**
 * 创建 OSS 客户端。
 * @returns OSS 客户端
 */
function createOssClient() {
    return new OSS({
        region: ossConfig.endpoint.replace(".aliyuncs.com", "") || "oss-cn-hongkong",
        endpoint: ossConfig.endpoint,
        accessKeyId: ossConfig.accessKeyId,
        accessKeySecret: ossConfig.accessKeySecret,
        bucket: ossConfig.bucket,
    })
}

/**
 * 获取公开 URL。
 * @param ossKey OSS key
 * @returns 公网 URL
 */
function getPublicUrl(ossKey: string): string {
    return ossConfig.cdn ? `${ossConfig.cdn.replace(/\/$/, "")}/${ossKey}` : `https://${ossConfig.bucket}.${ossConfig.endpoint}/${ossKey}`
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
 * 比较两个文件列表是否一致。
 * @param left 左侧列表
 * @param right 右侧列表
 * @returns 是否一致
 */
function filesEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
        return false
    }

    return left.every((item, index) => item === right[index])
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
 * 上传图片包与版本列表到 OSS。
 * @param entry 版本条目
 */
async function uploadImgsPack(entry: ImgsPackVersionEntry): Promise<void> {
    if (!ossConfig.endpoint || !ossConfig.bucket || !ossConfig.accessKeyId || !ossConfig.accessKeySecret) {
        throw new Error("缺少必要的 OSS 环境变量")
    }

    const client = createOssClient()
    const localZipPath = path.join(outDir, `${entry.version}.zip`)
    const ossPrefix = "imgs-pack"
    const ossZipKey = `${ossPrefix}/${entry.version}.zip`
    const ossVersionsKey = `${ossPrefix}/versions.json`

    if (!fs.existsSync(localZipPath)) {
        throw new Error(`图片包文件不存在: ${localZipPath}`)
    }

    console.log(`📤 上传图片包文件到OSS: ${ossZipKey}`)
    await client.put(ossZipKey, fs.readFileSync(localZipPath))
    console.log(`✅ 上传成功: ${ossZipKey}`)

    console.log(`📤 上传版本列表到OSS: ${ossVersionsKey}`)
    await client.put(ossVersionsKey, fs.readFileSync(versionsPath))
    console.log(`✅ 上传成功: ${ossVersionsKey}`)

    console.log(`已上传 ${entry.version}.zip -> ${getPublicUrl(ossZipKey)}`)
    console.log(`已上传 versions.json -> ${getPublicUrl(ossVersionsKey)}`)
}

/**
 * 生成图片包版本列表。
 */
async function main(): Promise<void> {
    ensureDir(outDir)
    const files = collectCurrentFiles()
    const versions = readVersions()
    const lastEntry = versions.at(-1)
    if (lastEntry && filesEqual(lastEntry.files, files)) {
        console.log("图片无变化，跳过打包")
        return
    }

    const version = String(versions.length + 1)
    const entry = buildPack(version, files)
    const entries: ImgsPackVersionEntry[] = [...versions, entry]

    fs.writeFileSync(versionsPath, JSON.stringify(entries, null, 2))
    console.log(`已生成图片包: ${entries.length} 个版本`)

    if (process.argv.includes("upload")) {
        await uploadImgsPack(entry)
    }
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
