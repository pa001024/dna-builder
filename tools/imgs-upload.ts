#!/usr/bin/env bun

import fs from "node:fs"
import path from "node:path"
import OSS from "ali-oss"
import { parse } from "dotenv"

type OssListV2Result = {
    objects?: { name: string }[]
    prefixes?: string[]
    isTruncated?: boolean
    nextContinuationToken?: string
}

type RemoteDirState = {
    files: Set<string>
    prefixes: Set<string>
}

const rootDir = path.resolve(".")
const localImgsDir = path.resolve(rootDir, "public/imgs")
const envPath = path.resolve(rootDir, "server/.env")
const envConfig = fs.existsSync(envPath) ? parse(fs.readFileSync(envPath)) : {}

const ossConfig = {
    region:
        envConfig.OSS_REGION ||
        envConfig.OSS_ACC_ENDPOINT?.replace(".aliyuncs.com", "") ||
        envConfig.OSS_ENDPOINT?.replace(".aliyuncs.com", "") ||
        "oss-cn-hongkong",
    endpoint: envConfig.OSS_ACC_ENDPOINT || envConfig.OSS_ENDPOINT || "",
    bucket: envConfig.OSS_BUCKET || "",
    accessKeyId: envConfig.OSS_ACCESS_KEY_ID || "",
    accessKeySecret: envConfig.OSS_ACCESS_KEY_SECRET || "",
}

/**
 * 创建 OSS 客户端。
 * @returns OSS 客户端
 */
function createOssClient(): OSS {
    return new OSS({
        region: ossConfig.region,
        endpoint: ossConfig.endpoint,
        accessKeyId: ossConfig.accessKeyId,
        accessKeySecret: ossConfig.accessKeySecret,
        bucket: ossConfig.bucket,
    })
}

/**
 * 规范化目录前缀。
 * @param prefix 目录前缀
 * @returns 规范化后的目录前缀
 */
function normalizePrefix(prefix: string): string {
    const trimmed = prefix.replace(/^\/+/, "").replace(/\/+$/, "")
    return trimmed ? `${trimmed}/` : ""
}

/**
 * 生成远端 key。
 * @param relPath 本地相对路径
 * @returns 远端 key
 */
function toRemoteKey(relPath: string): string {
    return path.posix.join("imgs", relPath.replaceAll(path.sep, "/"))
}

/**
 * 递归扫描本地目录。
 * @param dirPath 当前目录
 * @param relativeDir 相对目录
 * @returns 扁平化条目
 */
function collectLocalEntries(dirPath: string, relativeDir = ""): { absPath: string; relPath: string; isDirectory: boolean }[] {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const result: { absPath: string; relPath: string; isDirectory: boolean }[] = []

    for (const entry of entries) {
        const absPath = path.join(dirPath, entry.name)
        const relPath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name
        result.push({
            absPath,
            relPath,
            isDirectory: entry.isDirectory(),
        })

        if (entry.isDirectory()) {
            result.push(...collectLocalEntries(absPath, relPath))
        }
    }

    return result
}

/**
 * 列出 OSS 目录内容。
 * @param client OSS 客户端
 * @param prefix 目录前缀
 * @returns 目录状态
 */
async function listRemoteDirectory(client: OSS, prefix: string): Promise<RemoteDirState> {
    const files = new Set<string>()
    const prefixes = new Set<string>()
    let continuationToken: string | undefined
    const normalizedPrefix = normalizePrefix(prefix)

    do {
        const query: Record<string, string | number> = {
            prefix: normalizedPrefix,
            delimiter: "/",
            "max-keys": 1000,
        }

        if (continuationToken) {
            query["continuation-token"] = continuationToken
        }

        const result = (await client.listV2(query)) as OssListV2Result
        for (const object of result.objects ?? []) {
            files.add(object.name)
        }
        for (const remotePrefix of result.prefixes ?? []) {
            prefixes.add(remotePrefix)
        }

        continuationToken = result.isTruncated ? result.nextContinuationToken : undefined
    } while (continuationToken)

    return { files, prefixes }
}

/**
 * 确保远端目录存在。
 * @param client OSS 客户端
 * @param dirPrefix 目录前缀
 */
async function ensureRemoteDirectory(client: OSS, dirPrefix: string): Promise<void> {
    const normalizedPrefix = normalizePrefix(dirPrefix)
    if (!normalizedPrefix) {
        return
    }

    try {
        await client.head(normalizedPrefix)
        return
    } catch {
        await client.put(normalizedPrefix, Buffer.alloc(0))
    }
}

/**
 * 上传缺失图片。
 */
async function uploadMissingImgs(): Promise<void> {
    if (!fs.existsSync(localImgsDir)) {
        throw new Error(`本地图片目录不存在: ${localImgsDir}`)
    }

    if (!ossConfig.endpoint || !ossConfig.bucket || !ossConfig.accessKeyId || !ossConfig.accessKeySecret) {
        throw new Error("缺少必要的 OSS 环境变量")
    }

    const client = createOssClient()
    const localEntries = collectLocalEntries(localImgsDir)
    const remoteCache = new Map<string, RemoteDirState>()

    const getRemoteState = async (dirPrefix: string) => {
        const normalizedPrefix = normalizePrefix(dirPrefix)
        const cached = remoteCache.get(normalizedPrefix)
        if (cached) {
            return cached
        }

        const state = await listRemoteDirectory(client, normalizedPrefix)
        remoteCache.set(normalizedPrefix, state)
        return state
    }

    for (const entry of localEntries.filter(item => item.isDirectory)) {
        const remoteDirPrefix = toRemoteKey(entry.relPath)
        const remoteState = await getRemoteState(remoteDirPrefix)
        if (!remoteState.prefixes.has(normalizePrefix(remoteDirPrefix))) {
            await ensureRemoteDirectory(client, remoteDirPrefix)
            remoteCache.delete(normalizePrefix(remoteDirPrefix))
        }
    }

    let uploadedCount = 0
    let skippedCount = 0

    for (const entry of localEntries.filter(item => !item.isDirectory)) {
        const remoteKey = toRemoteKey(entry.relPath)
        const remoteDirPrefix = path.posix.dirname(remoteKey)
        const remoteState = await getRemoteState(remoteDirPrefix)

        if (remoteState.files.has(remoteKey)) {
            skippedCount += 1
            continue
        }

        const normalizedParent = normalizePrefix(remoteDirPrefix)
        if (normalizedParent && !remoteState.prefixes.has(normalizedParent)) {
            await ensureRemoteDirectory(client, remoteDirPrefix)
            remoteCache.delete(normalizedParent)
        }

        await client.put(remoteKey, entry.absPath)
        uploadedCount += 1
        console.log(`上传: ${remoteKey}`)
    }

    console.log(`完成: 上传 ${uploadedCount} 个文件, 跳过 ${skippedCount} 个文件`)
}

void uploadMissingImgs().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
})
