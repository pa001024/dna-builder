import { invoke } from "@tauri-apps/api/core"
import type { UnlistenFn } from "@tauri-apps/api/event"
import { listen } from "@tauri-apps/api/event"

export interface UpdateInfo {
    available: boolean
    currentVersion: string
    latestVersion: string
    body?: string
    /** 该版本改动过 DLL / resources，只能下载完整安装包 */
    requiresFullInstall: boolean
    installerUrl?: string
}

interface NativeUpdateInfo {
    version: string
    notes: string
    pubDate?: string
    url: string
    size: number
    sha256: string
    currentVersion: string
    requiresFullInstall: boolean
    installerUrl?: string
}

interface UpdateProgress {
    downloaded: number
    total: number | null
}

export async function checkUpdate(): Promise<UpdateInfo | null> {
    try {
        const info = await invoke<NativeUpdateInfo | null>("update_check")
        if (!info) {
            return null
        }
        return {
            available: true,
            currentVersion: info.currentVersion,
            latestVersion: info.version,
            body: info.notes,
            requiresFullInstall: info.requiresFullInstall,
            installerUrl: info.installerUrl,
        }
    } catch (error) {
        console.error("检查更新失败:", error)
        return null
    }
}

/**
 * 下载 exe 差量包并安装：下载完成后启动 helper 替换 exe 并重启应用。
 * @param onProgress 下载进度回调（0-100）
 */
export async function downloadAndInstallUpdate(onProgress?: (progress: number) => void): Promise<void> {
    let unlisten: UnlistenFn | undefined
    try {
        unlisten = await listen<UpdateProgress>("update-progress", event => {
            const { downloaded, total } = event.payload
            if (onProgress && total && total > 0) {
                onProgress(Math.min(100, Math.round((downloaded / total) * 100)))
            }
        })

        const version = await invoke<string>("update_download")
        onProgress?.(100)
        // 安装成功后进程会被 helper 关闭并重启；失败时错误会抛到调用方
        await invoke("update_install", { version })
    } finally {
        unlisten?.()
    }
}
