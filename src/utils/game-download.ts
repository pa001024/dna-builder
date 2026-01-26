import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

export const VERSION_URL_PUB = "http://pan01-1-hs.shyxhy.com/Packages/CN/WindowsNoEditor/PC_OBT_CN_Pub/"

export interface GameVersionListRes {
    GameVersionList: GameVersionList
}

export interface GameVersionList {
    "1": {
        GameVersionList: Record<string, GameAssets>
    }
}

export interface GameAssets {
    ZipGameVersion: number
    ZipMd5: string
    ZipSize: number
    bIsSDK: string
}

/**
 * 下载进度信息
 */
export interface DownloadProgress {
    filename: string
    progress: number
    downloaded: number
    total: number
}

/**
 * 下载进度回调函数
 */
export type ProgressCallback = (progress: DownloadProgress) => void

export async function getBaseVersion() {
    const res = await fetch(`${VERSION_URL_PUB}BaseVersion.json`)
    return res.json() as Promise<GameVersionListRes>
}

/**
 * 下载游戏资源文件
 * @param filename 要下载的文件名
 * @param onProgress 下载进度回调函数
 * @returns 下载结果消息
 * @throws 下载失败时抛出错误
 */
export async function downloadAssets(filename: string, onProgress?: ProgressCallback): Promise<string> {
    let unlistenFn: UnlistenFn | undefined

    try {
        // 如果提供了进度回调，则监听下载进度事件
        if (onProgress) {
            unlistenFn = await listen<DownloadProgress>("download_progress", event => {
                // 只处理当前文件的进度事件
                if (event.payload.filename === filename) {
                    onProgress(event.payload)
                }
            })
        }

        const result = await invoke<string>("download_file", {
            url: `${VERSION_URL_PUB}${filename}`,
            filename: `download/${filename}`,
        })

        return result
    } catch (error) {
        console.error("下载资源失败:", error)
        throw new Error(`下载 ${filename} 失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
        // 无论下载成功还是失败，都移除事件监听
        if (unlistenFn) {
            unlistenFn()
        }
    }
}
