import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { tauriFetch } from "@/api/app"

export const VERSION_URL_PUB = "http://pan01-1-hs.shyxhy.com/Packages/CN/WindowsNoEditor/PC_OBT_CN_Pub/"

export interface GameVersionListRes {
    GameVersionList: GameVersionList
}

export interface GameVersionListLocal {
    gameVersionList: {
        "1": {
            gameVersionList: Record<string, GameAssets>
        }
    }
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
    const res = await tauriFetch(`${VERSION_URL_PUB}BaseVersion.json`)
    return res.json() as Promise<GameVersionListRes>
}

/**
 * 下载游戏资源文件
 * @param filename 要下载的文件名
 * @param onProgress 下载进度回调函数
 * @param downloadDir 下载目录，默认为 download/
 * @returns 下载结果消息
 * @throws 下载失败时抛出错误
 */
export async function downloadAssets(filename: string, onProgress?: ProgressCallback, downloadDir: string = "download/"): Promise<string> {
    let unlistenFn: UnlistenFn | undefined

    try {
        // 确保下载目录路径以斜杠结尾
        const normalizedDir = downloadDir.endsWith("/") ? downloadDir : `${downloadDir}/`

        // 构建完整的文件路径
        const fullFilePath = `${normalizedDir}${filename}`

        // 如果提供了进度回调，则监听下载进度事件
        if (onProgress) {
            unlistenFn = await listen<DownloadProgress>("download_progress", event => {
                // 只处理当前文件的进度事件
                if (event.payload.filename === fullFilePath) {
                    onProgress({
                        ...event.payload,
                        filename: filename, // 只返回文件名，不包含路径
                    })
                }
            })
        }

        const result = await invoke<string>("download_file", {
            url: `${VERSION_URL_PUB}${filename}`,
            filename: fullFilePath,
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
