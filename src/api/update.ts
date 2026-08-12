import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export interface UpdateInfo {
    available: boolean
    currentVersion: string
    latestVersion: string
    body?: string
    date?: string
}

export async function checkUpdate(): Promise<UpdateInfo | null> {
    try {
        return await invoke<UpdateInfo | null>("check_app_update")
    } catch (error) {
        console.error("检查更新失败:", error)
        return null
    }
}

export async function downloadAndInstallUpdate(onProgress?: (progress: number) => void): Promise<void> {
    try {
        const unlisten = await listen<{ progress: number }>("app-update-progress", event => onProgress?.(event.payload.progress))
        try {
            await invoke("download_and_install_app_update")
        } finally {
            unlisten()
        }
    } catch (error) {
        console.error("下载安装更新失败:", error)
        throw error
    }
}
