import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { getFileHash, getFileSize, tauriFetch } from "@/api/app"

/**
 * rawurl
 * 正式服
 * http://pan01-cdn-dna-ali.shyxhy.com/Packages/CN/WindowsNoEditor/PC_OBT_CN_Pub/BaseVersion.json
 * http://pan01-1-eo.shyxhy.com/Packages/CN/WindowsNoEditor/PC_OBT_CN_Pub/PreDownloadVersion.json
 * http://pan01-1-eo.shyxhy.com/Packages/CN/WindowsNoEditor/PC_OBT_CN_Pub/10/BaseVersion.json
 *
 * B服
 * http://pan01-1-eo.shyxhy.com/Packages/CN/WindowsNoEditor/PC_OBT_Bili_Pub/PackageBaseVersion.txt
 *
 * 热更
 * http://pan01-1-eo.shyxhy.com/Patches/FinalPatch/CN/Default/WindowsNoEditor/PC_OBT_CN_Pub/VersionList.json
 * http://pan01-1-eo.shyxhy.com/Patches/FinalPatch/CN/Default/WindowsNoEditor/PC_OBT_CN_Pub/1010116/PakFilesInfo.json
 * http://pan01-1-eo.shyxhy.com/Patches/FinalPatch/CN/Default/WindowsNoEditor/PC_OBT_CN_Pub/1010116/ResDiscreteInfo.json
 * 先看/VersionList.json 拿到 patchVersion
 * 拼到/${version}/PakFilesInfo.json 拿到文件名 拼到/${version}/${filename}
 * 本地
 * DNA Game\EM\EMPatches\Paks\CN\PC_OBT_CN_Pub\Patch\
 * 本地版本缓存 VersionList.json
 * 语音包记录 OptionalPatchSigns.json
 * patch下载到 Patch\${version}\
 */

export const CDN_LIST = [
    {
        name: "阿里",
        url: "http://pan01-cdn-dna-ali.shyxhy.com",
    },
    {
        name: "火山",
        url: "http://pan01-1-hs.shyxhy.com",
    },
    {
        name: "腾讯",
        url: "http://pan01-1-eo.shyxhy.com",
    },
    {
        name: "海外",
        url: "http://pan01-pack2.dna-panstudio.com",
    },
]
export const VERSION_URL_PUB = (server: string) => `/Packages/${server}/WindowsNoEditor/`

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
 * 统一本地哈希字符串格式，避免大小写差异影响比较结果。
 * @param hash 原始哈希字符串
 * @returns 归一化后的哈希字符串
 */
export function normalizeFileHash(hash: string) {
    return hash.trim().toLowerCase()
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

export interface GameVersionListWithPre {
    subVersion: string
    gameVersionList: GameVersionListRes
    preVersion?: string
    preVersionList?: GameVersionListRes
}

export interface HotUpdateVersionInfo {
    major: number
    minor: number
    revamp: number
    patchKey: number
    patchVersion: number
    bOptional: boolean
    bRestart: boolean
}

export interface HotUpdateVersionListRes {
    versionList: Record<string, HotUpdateVersionInfo>
}

export interface HotUpdatePakFileInfo {
    fileName: string
    hash: string
    pakOptionalSign: string
    fileSize: number
    bExamineIgnore: boolean
}

export interface HotUpdatePakFilesInfoRes {
    pakFilesMap: Record<
        string,
        {
            pakFileInfos: HotUpdatePakFileInfo[]
        }
    >
}

export interface OptionalPatchInfo {
    state: string
    version: number
}

export interface OptionalPatchSignsRes {
    optionalPatchInfos: Record<string, OptionalPatchInfo>
}

/**
 * 下载进度回调函数
 */
export type ProgressCallback = (progress: DownloadProgress) => void

/**
 * 校验本地文件是否与远端清单一致。
 * @param filePath 本地文件路径
 * @param expectedSize 预期文件大小
 * @param expectedHash 预期 MD5 哈希
 * @returns 是否完全匹配
 */
export async function isLocalFileMatch(filePath: string, expectedSize: number, expectedHash: string) {
    try {
        const actualSize = await getFileSize(filePath)
        if (actualSize === 0 || actualSize !== expectedSize) {
            return false
        }

        const actualHash = await getFileHash(filePath)
        if (!actualHash) {
            return false
        }

        return normalizeFileHash(actualHash) === normalizeFileHash(expectedHash)
    } catch (error) {
        console.error("校验本地文件 hash 失败:", error)
        return false
    }
}

/**
 * 获取热更版本清单。
 * @param cdn CDN 地址
 * @param channel 渠道
 * @returns 热更版本清单
 */
export async function getHotUpdateVersionList(cdn: string, channel: string) {
    const server = channel.match(/(Global)_Pub/)?.[1] || "CN"
    const versionUrl = `/Patches/FinalPatch/${server}/Default/WindowsNoEditor/${channel}/VersionList.json`
    const res = await tauriFetch(`${cdn}${versionUrl}`)
    return (await res.json()) as HotUpdateVersionListRes
}

/**
 * 获取热更补丁文件清单。
 * @param cdn CDN 地址
 * @param channel 渠道
 * @param patchVersion 补丁版本号
 * @returns 补丁文件清单
 */
export async function getHotUpdatePakFilesInfo(cdn: string, channel: string, patchVersion: number) {
    const server = channel.match(/(Global)_Pub/)?.[1] || "CN"
    const versionUrl = `/Patches/FinalPatch/${server}/Default/WindowsNoEditor/${channel}/${patchVersion}/PakFilesInfo.json`
    const res = await tauriFetch(`${cdn}${versionUrl}`)
    return (await res.json()) as HotUpdatePakFilesInfoRes
}

/**
 * 获取热更离散资源清单。
 * @param cdn CDN 地址
 * @param channel 渠道
 * @param patchVersion 补丁版本号
 * @returns 离散资源清单
 */
export async function getHotUpdateResDiscreteInfo(cdn: string, channel: string, patchVersion: number) {
    const server = channel.match(/(Global)_Pub/)?.[1] || "CN"
    const versionUrl = `/Patches/FinalPatch/${server}/Default/WindowsNoEditor/${channel}/${patchVersion}/ResDiscreteInfo.json`
    const res = await tauriFetch(`${cdn}${versionUrl}`)
    return (await res.json()) as HotUpdatePakFilesInfoRes
}

/**
 * 下载热更补丁文件。
 * @param cdn CDN 地址
 * @param filename 文件名
 * @param channel 渠道
 * @param patchVersion 补丁版本号
 * @param concurrentThreads 并发线程数
 * @param onProgress 下载进度回调
 * @param downloadDir 下载目录
 * @returns 下载结果消息
 */
export async function downloadHotUpdateAssets(
    cdn: string,
    filename: string,
    channel: string,
    patchVersion: number,
    concurrentThreads = 10,
    onProgress?: ProgressCallback,
    downloadDir: string = "download/"
): Promise<string> {
    let unlistenFn: UnlistenFn | undefined

    try {
        const normalizedDir = downloadDir.endsWith("\\") ? downloadDir : `${downloadDir}\\`
        const fullFilePath = `${normalizedDir}${filename}`

        if (onProgress) {
            unlistenFn = await listen<DownloadProgress>("download_progress", event => {
                if (event.payload.filename === fullFilePath) {
                    onProgress({
                        ...event.payload,
                        filename: filename,
                    })
                }
            })
        }

        const server = channel.match(/(Global)_Pub/)?.[1] || "CN"
        const versionUrl = `/Patches/FinalPatch/${server}/Default/WindowsNoEditor/${channel}/${patchVersion}`
        const result = await invoke<string>("download_file", {
            url: `${cdn}${versionUrl}/${filename}`,
            filename: fullFilePath,
            concurrentThreads,
        })

        return result
    } catch (error) {
        console.error("下载热更资源失败:", error)
        throw new Error(`下载 ${filename} 失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
        if (unlistenFn) {
            unlistenFn()
        }
    }
}

export async function getBaseVersion(cdn: string, channel: string) {
    const server = channel.match(/(Global)_Pub/)?.[1] || "CN"
    const versionUrl = VERSION_URL_PUB(server)
    const subVersion = await tauriFetch(`${cdn}${versionUrl}${channel}/PackageBaseVersion.txt`)
    const subVersionText = await subVersion.text()

    try {
        const res = await tauriFetch(`${cdn}${versionUrl}${channel}${subVersionText ? `/${subVersionText}` : ""}/BaseVersion.json`)
        const result = {
            subVersion: subVersionText,
            gameVersionList: await res.json(),
        } as GameVersionListWithPre
        const preVersion = await tauriFetch(`${cdn}${versionUrl}${channel}/PreDownloadVersion.json`)
        if (!preVersion.ok) {
            return result
        }
        const preVersionJson = (await preVersion.json()) as {
            BaseVersion: number
            bOpen: boolean
        }
        const preVersionText = preVersionJson.BaseVersion.toString()
        if (subVersionText === preVersionText || !preVersionJson.bOpen) {
            return result
        }
        const pre = await tauriFetch(`${cdn}${versionUrl}${channel}${preVersionText ? `/${preVersionText}` : ""}/BaseVersion.json`)
        if (!pre.ok) {
            return result
        }
        result.preVersion = preVersionText
        result.preVersionList = await pre.json()
        return result
    } catch {
        const res = await tauriFetch(`${cdn}${versionUrl}${channel}/BaseVersion.json`)
        return {
            subVersion: "",
            gameVersionList: await res.json(),
        }
    }
}

/**
 * 下载游戏资源文件
 * @param filename 要下载的文件名
 * @param onProgress 下载进度回调函数
 * @param downloadDir 下载目录，默认为 download/
 * @returns 下载结果消息
 * @throws 下载失败时抛出错误
 */
export async function downloadAssets(
    cdn: string,
    filename: string,
    channel: string,
    subVersion: string,
    concurrentThreads = 10,
    onProgress?: ProgressCallback,
    downloadDir: string = "download/"
): Promise<string> {
    let unlistenFn: UnlistenFn | undefined

    try {
        // 确保下载目录路径以斜杠结尾
        const normalizedDir = downloadDir.endsWith("\\") ? downloadDir : `${downloadDir}\\`

        // 构建完整的文件路径
        const fullFilePath = `${normalizedDir}${filename}`

        // 如果提供了进度回调，则监听下载进度事件
        if (onProgress) {
            unlistenFn = await listen<DownloadProgress>("download_progress", event => {
                // console.debug(event)
                // 只处理当前文件的进度事件
                if (event.payload.filename === fullFilePath) {
                    onProgress({
                        ...event.payload,
                        filename: filename, // 只返回文件名，不包含路径
                    })
                }
            })
        }

        const server = channel.match(/(Global)_Pub/)?.[1] || "CN"
        const versionUrl = VERSION_URL_PUB(server)
        const result = await invoke<string>("download_file", {
            url: `${cdn}${versionUrl}${channel}/${subVersion ? `${subVersion}/` : ""}${filename}`,
            filename: fullFilePath,
            concurrentThreads,
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
