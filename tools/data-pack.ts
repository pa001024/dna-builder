#!/usr/bin/env bun

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { encode } from "@msgpack/msgpack"
import { parse } from "dotenv"
import { zipSync } from "fflate"
import { globSync } from "glob"

type PlainData = unknown

type PackManifest = {
    builtAt: string
    packageFile: string
    version: string
    modules: Record<string, { exports: string[]; hasFunctions: boolean; hash: string }>
}

type PackImgsEntry = {
    path: string
    url?: string
}

type PackVersionEntry = {
    builtAt: string
    packageFile: string
    version: string
    notes?: string
}

import OSS from "ali-oss"

const args = process.argv.slice(2)
const shouldBuild = args.includes("build") || args.includes("upload")
const shouldUpload = args.includes("upload")
const versionArgIndex = args.findIndex(arg => arg === "-v" || arg === "--version")
const version = versionArgIndex >= 0 ? args[versionArgIndex + 1] : null
const notesArgIndex = args.findIndex(arg => arg === "-m" || arg === "--msg")
const notes = notesArgIndex >= 0 ? args[notesArgIndex + 1] : undefined

const rootDir = path.resolve(".")
const sourceRoot = path.resolve(rootDir, "src", "data", "d")
const outDir = path.resolve(rootDir, "mock", "data-pack")
const versionsPath = path.resolve(rootDir, "mock", "data-pack", "versions.json")
const publicImgsRoot = path.resolve(rootDir, "public", "imgs")
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
 * 将特殊值转换为可序列化结构。
 * @param value 原始值
 * @returns 可序列化值
 */
function sanitize(value: PlainData): PlainData {
    if (value === undefined) {
        return { __dnaPackType: "Undefined" }
    }

    if (value instanceof Date) {
        return { __dnaPackType: "Date", value: value.toISOString() }
    }

    if (value instanceof Map) {
        return {
            __dnaPackType: "Map",
            value: Array.from(value.entries()).map(([key, item]) => [sanitize(key), sanitize(item)]),
        }
    }

    if (value instanceof Set) {
        return {
            __dnaPackType: "Set",
            value: Array.from(value.values()).map(item => sanitize(item)),
        }
    }

    if (Array.isArray(value)) {
        return value.map(item => sanitize(item))
    }

    if (value && typeof value === "object") {
        const record: Record<string, PlainData> = {}
        for (const [key, item] of Object.entries(value as Record<string, PlainData>)) {
            record[key] = sanitize(item)
        }
        return record
    }

    return value
}

/**
 * 计算简易哈希。
 * @param value 输入字符串
 * @returns 哈希值
 */
function hashString(value: string): string {
    let hash = 2166136261
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, "0")
}

/**
 * 读取版本列表。
 * @returns 版本列表
 */
function readVersions(): PackVersionEntry[] {
    if (!fs.existsSync(versionsPath)) {
        return []
    }

    const raw = JSON.parse(fs.readFileSync(versionsPath, "utf8")) as PackVersionEntry[]
    return Array.isArray(raw) ? raw : []
}

/**
 * 写入版本列表。
 * @param versions 版本列表
 */
function writeVersions(versions: PackVersionEntry[]): void {
    fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2))
}

/**
 * 收集 public/imgs 下的资源清单。
 * @returns 图片清单
 */
function collectImgsManifest(): PackImgsEntry[] {
    if (!fs.existsSync(publicImgsRoot)) {
        return []
    }

    const entries: PackImgsEntry[] = []

    const walk = (dirPath: string, relativeDir = "") => {
        for (const dirent of fs.readdirSync(dirPath, { withFileTypes: true })) {
            const absPath = path.join(dirPath, dirent.name)
            const relPath = relativeDir ? path.posix.join(relativeDir, dirent.name) : dirent.name
            if (dirent.isDirectory()) {
                walk(absPath, relPath)
                continue
            }

            entries.push({
                path: relPath.replaceAll(path.sep, "/"),
            })
        }
    }

    walk(publicImgsRoot)
    entries.sort((a, b) => a.path.localeCompare(b.path, "zh-CN", { numeric: true }))
    return entries
}

/**
 * 创建 OSS 客户端。
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
 * 构建并输出数据包。
 * @param targetVersion 目标版本
 */
async function buildDataPack(targetVersion: string): Promise<PackVersionEntry> {
    fs.mkdirSync(outDir, { recursive: true })

    const files = globSync("**/*.data.ts", { cwd: sourceRoot, absolute: true }).sort()
    const modules: Record<string, Record<string, PlainData>> = {}
    const manifestModules: PackManifest["modules"] = {}

    for (const file of files) {
        const rel = path.relative(sourceRoot, file).replaceAll(path.sep, "/")
        const moduleKey = rel.slice(0, -".ts".length)
        const mod = await import(pathToFileURL(file).href)
        const exportNames = Object.keys(mod).filter(name => name !== "default" || mod.default !== undefined)
        const packedExports: Record<string, PlainData> = {}

        for (const exportName of exportNames) {
            const value = mod[exportName]
            if (typeof value === "function") {
                continue
            }
            packedExports[exportName] = sanitize(value)
        }

        modules[moduleKey] = packedExports
        manifestModules[moduleKey] = {
            exports: exportNames,
            hasFunctions: /export\s+(function|class)\b|function\s+\w+\s*\(/.test(fs.readFileSync(file, "utf8")),
            hash: hashString(JSON.stringify(packedExports)),
        }
    }

    const manifest: PackManifest = {
        builtAt: new Date().toISOString(),
        packageFile: `${targetVersion}.zip`,
        version: targetVersion,
        modules: manifestModules,
    }
    // const imgsManifest = collectImgsManifest()

    const zipEntries: Record<string, Uint8Array> = {
        "manifest.json": new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
        // "imgs.json": new TextEncoder().encode(JSON.stringify(imgsManifest, null, 2)),
    }

    for (const [moduleKey, entry] of Object.entries(modules)) {
        zipEntries[`modules/${moduleKey}.msgpack`] = encode(entry)
    }

    const zipBytes = zipSync(zipEntries, { level: 9 })
    fs.writeFileSync(path.join(outDir, `${targetVersion}.zip`), zipBytes)

    const entry: PackVersionEntry = {
        builtAt: manifest.builtAt,
        packageFile: manifest.packageFile,
        version: manifest.version,
        notes,
    }
    const nextVersions = [entry, ...readVersions().filter(item => item.version !== targetVersion)]
    writeVersions(nextVersions)

    return entry
}

/**
 * 上传 zip 和版本列表。
 * @param entry 版本条目
 */
async function uploadDataPack(entry: PackVersionEntry): Promise<void> {
    if (!ossConfig.endpoint || !ossConfig.bucket || !ossConfig.accessKeyId || !ossConfig.accessKeySecret) {
        throw new Error("缺少必要的 OSS 环境变量")
    }

    const client = createOssClient()
    const localZipPath = path.join(outDir, `${entry.version}.zip`)
    const ossPrefix = "data-pack"
    const ossZipKey = `${ossPrefix}/${entry.version}.zip`
    const ossVersionsKey = `${ossPrefix}/versions.json`

    if (!fs.existsSync(localZipPath)) {
        throw new Error(`数据包文件不存在: ${localZipPath}`)
    }

    console.log(`📤 上传数据包文件到OSS: ${ossZipKey}`)
    await client.put(ossZipKey, fs.readFileSync(localZipPath))
    console.log(`✅ 上传成功: ${ossZipKey}`)

    console.log(`📤 上传版本列表到OSS: ${ossVersionsKey}`)
    await client.put(ossVersionsKey, fs.readFileSync(versionsPath))
    console.log(`✅ 上传成功: ${ossVersionsKey}`)

    console.log(`已上传 ${entry.version}.zip -> ${getPublicUrl(ossZipKey)}`)
    console.log(`已上传 versions.json -> ${getPublicUrl(ossVersionsKey)}`)
}

async function main() {
    if (!shouldBuild) {
        throw new Error("请指定 build 或 upload")
    }

    if (!version) {
        throw new Error("请通过 -v 指定数据包版本")
    }

    const targetVersion = version
    const entry = await buildDataPack(targetVersion)

    if (shouldUpload) {
        await uploadDataPack(entry)
    } else {
        console.log(`数据包已生成: ${path.join(outDir, `${targetVersion}.zip`)}`)
    }
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
