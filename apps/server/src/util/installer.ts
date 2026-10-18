import { fetch } from "bun"
import { getPublicObjectUrl, isObjectStorageConfigured } from "./object-storage"

/**
 * 缓存的最新安装包信息。
 */
type CachedInstaller = {
    /** 安装包下载地址（主端 CDN）。 */
    url: string
    /** 缓存过期时间戳。 */
    expireTime: number
}

let cachedInstaller: CachedInstaller | null = null

/**
 * 获取 Windows 安装包下载地址。
 * 从在线的 latest.json 解析最新版本，带缓存，避免每次请求都回源 CDN。
 * @returns Windows 安装包（MSI/EXE）的下载地址；未配置对象存储或解析失败时返回 null。
 */
export async function getLatestInstallerUrl(): Promise<string | null> {
    if (!isObjectStorageConfigured()) {
        return null
    }

    const CACHE_DURATION = 15 * 60 * 1000
    if (cachedInstaller && Date.now() < cachedInstaller.expireTime) {
        return cachedInstaller.url
    }

    try {
        // latest.json 由 Tauri 构建产物上传到对象存储，含各平台安装包直链
        const latestJsonUrl = getPublicObjectUrl("latest.json")
        const response = await fetch(latestJsonUrl)

        if (!response.ok) {
            console.error("获取 latest.json 失败:", response.status)
            return null
        }

        const latestData = (await response.json()) as {
            platforms?: Record<string, { url?: string }>
        }

        const downloadUrl = latestData.platforms?.["windows-x86_64"]?.url || latestData.platforms?.["windows-x86_64-msi"]?.url

        if (!downloadUrl) {
            console.error("latest.json 中未找到 Windows 安装包地址")
            return null
        }

        cachedInstaller = {
            url: downloadUrl,
            expireTime: Date.now() + CACHE_DURATION,
        }
        return downloadUrl
    } catch (error) {
        console.error("获取最新安装包信息失败:", error)
        if (cachedInstaller) {
            console.log("使用过期的缓存安装包地址")
            return cachedInstaller.url
        }
        return null
    }
}
