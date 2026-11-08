import { dataDir, join } from "@tauri-apps/api/path"
import type { DownloadProgressEvent } from "@/api/app"
import { deleteFile, downloadFile, pathExists, readBinaryFile, readTextFile, writeTextFile } from "@/api/app"
import { buildCdnUrl, fetchWithCdnFallback, getOtherCdnBase } from "@/utils/cdn"

/** 原生云游戏客户端版本：与对象存储的 cloudgame/cloudgame-client-v<版本>.exe 一一对应，清单拿不到时兜底 */
export const CLOUDGAME_NATIVE_VERSION = "1.1.0"

/** 发布清单（与 apk/latest.json 同构，每次上传覆盖写）：本地部署版本与之不一致时重新下载 */
const CLOUDGAME_NATIVE_LATEST_PATH = "cloudgame/latest.json"
/** 客户端在对象存储上的目录 */
const CLOUDGAME_NATIVE_OBJECT_PREFIX = "cloudgame"
const CLOUDGAME_NATIVE_EXE_NAME = "cloudgame-client.exe"
const CLOUDGAME_NATIVE_VERSION_FILE = "cloudgame-client.version"
/** 清单请求超时：失败时退回常量版本，不阻塞启动 */
const LATEST_TIMEOUT_MS = 4000

/** 发布清单 `cloudgame/latest.json` 的内容。 */
export interface CloudgameNativeRelease {
    /** 版本号；本地标记与之不一致时更新 */
    version: string
    /** 对象存储上的文件名 */
    fileName: string
    /** 下载地址 */
    url: string
    /** exe 字节数 */
    size: number
    /** exe sha256 */
    sha256: string
    /** 发布时刻（ISO 8601） */
    builtAt: string
    /** 更新说明 */
    notes?: string
}

/** 原生客户端的本地部署路径。 */
export interface CloudgameNativePaths {
    /** 安装目录：%APPDATA%/dna-builder/bin */
    baseDir: string
    /** 可执行文件（CDN 下载直写，无解压步骤） */
    exePath: string
    /** 已部署版本标记 */
    versionPath: string
}

/**
 * 解析原生客户端的本地部署路径。
 * @returns 部署目录及各文件路径
 */
export async function resolveCloudgameNativePaths(): Promise<CloudgameNativePaths> {
    const baseDir = await join(await dataDir(), "dna-builder", "bin")
    return {
        baseDir,
        exePath: await join(baseDir, CLOUDGAME_NATIVE_EXE_NAME),
        versionPath: await join(baseDir, CLOUDGAME_NATIVE_VERSION_FILE),
    }
}

/**
 * 拉取发布清单（两端 CDN 依次尝试）。
 * @returns 清单；网络失败或内容非法时返回 null（调用方退回常量版本）
 */
export async function fetchCloudgameNativeRelease(): Promise<CloudgameNativeRelease | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), LATEST_TIMEOUT_MS)
    try {
        const response = await fetchWithCdnFallback(CLOUDGAME_NATIVE_LATEST_PATH, {
            cache: "no-cache",
            signal: controller.signal,
        })
        const data = (await response.json()) as Record<string, unknown>
        const version = typeof data.version === "string" ? data.version : ""
        const url = typeof data.url === "string" ? data.url : ""
        if (!version || !url) return null
        return {
            version,
            url,
            fileName: typeof data.fileName === "string" ? data.fileName : `cloudgame-client-v${version}.exe`,
            size: typeof data.size === "number" ? data.size : 0,
            sha256: typeof data.sha256 === "string" ? data.sha256 : "",
            builtAt: typeof data.builtAt === "string" ? data.builtAt : "",
            notes: typeof data.notes === "string" ? data.notes : undefined,
        }
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}

/**
 * 判断本地是否已部署指定版本的原生客户端。
 * @param paths 部署路径
 * @param version 期望版本；缺省为前端常量
 * @returns 可执行文件存在且版本标记一致时为 true
 */
export async function isCloudgameNativeInstalled(paths: CloudgameNativePaths, version = CLOUDGAME_NATIVE_VERSION): Promise<boolean> {
    if (!(await pathExists(paths.exePath))) return false
    try {
        return (await readTextFile(paths.versionPath)).trim() === version
    } catch {
        return false
    }
}

/**
 * 从 CDN 下载清单对应的原生客户端 exe：优先当前测速选中的源，失败后回退另一端。
 * 下载后按清单校验尺寸与 sha256，不一致时视为失败并换源重试。
 * @param paths 部署路径
 * @param release 发布清单；为 null 时按前端常量拼对象 key（不校验）
 * @param onProgress 下载进度回调
 */
export async function downloadCloudgameNative(
    paths: CloudgameNativePaths,
    release: CloudgameNativeRelease | null = null,
    onProgress?: (event: DownloadProgressEvent) => void
): Promise<void> {
    const fileName = release?.fileName || `cloudgame-client-v${CLOUDGAME_NATIVE_VERSION}.exe`
    const objectPath = `${CLOUDGAME_NATIVE_OBJECT_PREFIX}/${fileName}`
    const urls = [buildCdnUrl(objectPath), `${getOtherCdnBase()}/${objectPath}`]
    let lastError: unknown
    for (const url of urls) {
        try {
            await downloadFile(url, paths.exePath, { onProgress })
            await verifyCloudgameNativeDownload(paths.exePath, release)
            return
        } catch (error) {
            lastError = error
            // 换源前清掉半成品与断点信息，避免两端的文件尺寸不一致时按旧偏移续传
            await deleteFile(paths.exePath, true).catch(() => {})
            await deleteFile(`${paths.exePath}.progress`, true).catch(() => {})
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * 校验刚下载的 exe（尺寸与 sha256 和清单比对）。
 * @param exePath 本地 exe 路径
 * @param release 发布清单；为 null 或字段缺失时跳过对应项
 */
async function verifyCloudgameNativeDownload(exePath: string, release: CloudgameNativeRelease | null): Promise<void> {
    if (!release || (!release.size && !release.sha256)) return
    const data = await readBinaryFile(exePath)
    if (release.size > 0 && data.byteLength !== release.size) {
        throw new Error(`cloudgame native size mismatch: got ${data.byteLength}, want ${release.size}`)
    }
    if (release.sha256) {
        const digest = await crypto.subtle.digest("SHA-256", data)
        const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")
        if (actual !== release.sha256.toLowerCase()) throw new Error("cloudgame native sha256 mismatch")
    }
}

/**
 * 写入版本标记，完成本次部署（exe 下载即用，无需解压）。
 * @param paths 部署路径
 * @param version 本次部署的版本
 */
export async function installCloudgameNative(paths: CloudgameNativePaths, version = CLOUDGAME_NATIVE_VERSION): Promise<void> {
    await writeTextFile(paths.versionPath, version)
}
