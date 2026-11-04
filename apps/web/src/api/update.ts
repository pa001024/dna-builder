import { invoke } from "@tauri-apps/api/core"
import type { UnlistenFn } from "@tauri-apps/api/event"
import { listen } from "@tauri-apps/api/event"
import { relaunch } from "@tauri-apps/plugin-process"
import { check } from "@tauri-apps/plugin-updater"

export interface UpdateInfo {
    available: boolean
    currentVersion: string
    latestVersion: string
    body?: string
    /** 该版本改动过 DLL / resources，走 tauri updater 的整包 MSI 安装 */
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
 * 用 tauri updater 的整包 MSI 流程安装（DLL / resources 有变化的版本，或客户端低于差量基线）。
 * 走官方插件：签名校验、MSI 安装与提权都由它处理，等价于改动前的更新路径。
 * @param onProgress 下载进度回调（0-100）
 * @returns 插件源里没有该版本（或清单无法被插件解析）时返回 false，调用方退化为打开安装包下载页
 */
export async function downloadAndInstallFullUpdate(onProgress?: (progress: number) => void): Promise<boolean> {
    let update: Awaited<ReturnType<typeof check>>

    try {
        update = await check({ timeout: 10000 })
    } catch (error) {
        // 只有 exe 差量清单的 feed（如 GitHub 的 update.json）无法被插件解析，按「插件源不可用」处理
        console.warn("tauri updater 检查失败，改用安装包下载页:", error)
        return false
    }

    if (!update) {
        return false
    }

    let downloaded = 0
    let total = 0

    await update.downloadAndInstall(event => {
        switch (event.event) {
            case "Started":
                downloaded = 0
                total = event.data.contentLength ?? 0
                onProgress?.(0)
                break
            case "Progress":
                if (typeof event.data.chunkLength === "number") {
                    downloaded += event.data.chunkLength
                }
                if (total > 0) {
                    onProgress?.(Math.min(100, Math.round((downloaded / total) * 100)))
                }
                break
            case "Finished":
                onProgress?.(100)
                break
        }
    })

    await relaunch()
    return true
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
