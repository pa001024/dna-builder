import { dataDir, join } from "@tauri-apps/api/path"
import { type DownloadProgressEvent, deleteFile, downloadFile, pathExists, readTextFile, writeTextFile } from "@/api/app"
import { buildCdnUrl, getOtherCdnBase } from "@/utils/cdn"

/** 原生云游戏客户端版本：与对象存储的 cloudgame/cloudgame-client-v<版本>.exe 一一对应 */
export const CLOUDGAME_NATIVE_VERSION = "1.1.0"

const CLOUDGAME_NATIVE_OBJECT_PATH = `cloudgame/cloudgame-client-v${CLOUDGAME_NATIVE_VERSION}.exe`
const CLOUDGAME_NATIVE_EXE_NAME = "cloudgame-client.exe"
const CLOUDGAME_NATIVE_VERSION_FILE = "cloudgame-client.version"

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
 * 判断本地是否已部署当前版本的原生客户端。
 * @param paths 部署路径
 * @returns 可执行文件存在且版本标记一致时为 true
 */
export async function isCloudgameNativeInstalled(paths: CloudgameNativePaths): Promise<boolean> {
    if (!(await pathExists(paths.exePath))) return false
    try {
        return (await readTextFile(paths.versionPath)).trim() === CLOUDGAME_NATIVE_VERSION
    } catch {
        return false
    }
}

/**
 * 从 CDN 下载原生客户端 exe：优先当前测速选中的源，失败后回退另一端。
 * @param paths 部署路径
 * @param onProgress 下载进度回调
 */
export async function downloadCloudgameNative(
    paths: CloudgameNativePaths,
    onProgress?: (event: DownloadProgressEvent) => void
): Promise<void> {
    const urls = [buildCdnUrl(CLOUDGAME_NATIVE_OBJECT_PATH), `${getOtherCdnBase()}/${CLOUDGAME_NATIVE_OBJECT_PATH}`]
    let lastError: unknown
    for (const url of urls) {
        try {
            await downloadFile(url, paths.exePath, { onProgress })
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
 * 写入版本标记，完成本次部署（exe 下载即用，无需解压）。
 * @param paths 部署路径
 */
export async function installCloudgameNative(paths: CloudgameNativePaths): Promise<void> {
    await writeTextFile(paths.versionPath, CLOUDGAME_NATIVE_VERSION)
}
