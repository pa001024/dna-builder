import { check, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"

export interface UpdateInfo {
    available: boolean
    currentVersion: string
    latestVersion: string
    body?: string
    date?: string
    update: Update
}

export async function checkUpdate(): Promise<UpdateInfo | null> {
    try {
        const update = await check({ timeout: 10000 })

        if (update) {
            return {
                available: true,
                currentVersion: update.currentVersion,
                latestVersion: update.version,
                body: update.body,
                date: update.date,
                update,
            }
        }

        return null
    } catch (error) {
        console.error("检查更新失败:", error)
        return null
    }
}

export async function downloadAndInstallUpdate(onProgress?: (progress: number) => void): Promise<void> {
    try {
        const update = await check({ timeout: 10000 })

        if (!update) {
            throw new Error("没有可用的更新")
        }

        let downloaded = 0
        let total = 0

        await update.downloadAndInstall(event => {
            switch (event.event) {
                case "Started":
                    downloaded = 0
                    total = event.data.contentLength!
                    if (onProgress) onProgress(0)
                    break
                case "Progress":
                    if (event.data && "chunkLength" in event.data && typeof event.data.chunkLength === "number") {
                        downloaded += event.data.chunkLength!
                    }
                    if (onProgress && total > 0) {
                        const progress = Math.min(100, Math.round((downloaded / total) * 100))
                        onProgress(progress)
                    }
                    break
                case "Finished":
                    if (onProgress) onProgress(100)
                    break
            }
        })

        await relaunch()
    } catch (error) {
        console.error("下载安装更新失败:", error)
        throw error
    }
}
