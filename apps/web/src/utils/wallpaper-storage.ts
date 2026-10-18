/**
 * 自定义底图的 OPFS 存储工具。
 *
 * 自定义底图（图片 data URL）持久化在 OPFS（Origin Private File System）中，
 * 避免 LocalStorage 的 5MB 容量限制。
 */

/** OPFS 中存放自定义底图的目录名 */
const WALLPAPER_DIR = "wallpaper"

/** OPFS 中存放自定义底图内容的文件名（内容为图片 data URL 文本） */
const WALLPAPER_FILE_NAME = "custom-wallpaper.txt"

/**
 * 判断当前环境是否支持 OPFS。
 * @returns 是否支持 OPFS
 */
function hasOpfs(): boolean {
    return typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory)
}

/**
 * 获取 OPFS 根目录。
 * @returns 根目录句柄
 */
async function getRootDirectory(): Promise<FileSystemDirectoryHandle> {
    if (!navigator.storage?.getDirectory) {
        throw new Error("当前环境不支持 OPFS")
    }

    return navigator.storage.getDirectory()
}

/**
 * 获取自定义底图目录（不存在时自动创建）。
 * @returns 目录句柄
 */
async function getWallpaperDirectory(): Promise<FileSystemDirectoryHandle> {
    const root = await getRootDirectory()
    return root.getDirectoryHandle(WALLPAPER_DIR, { create: true })
}

/**
 * 从 OPFS 读取自定义底图。
 * @returns 底图 data URL；未设置或读取失败时返回空字符串
 */
export async function readCustomWallpaper(): Promise<string> {
    if (!hasOpfs()) {
        return ""
    }

    try {
        const directory = await getWallpaperDirectory()
        const handle = await directory.getFileHandle(WALLPAPER_FILE_NAME, { create: false })
        const blob = await handle.getFile()
        const text = await blob.text()
        return text || ""
    } catch (error) {
        console.warn("读取自定义底图失败", error)
        return ""
    }
}

/**
 * 将自定义底图写入 OPFS。
 * @param dataUrl 底图 data URL；空字符串等价于删除
 */
export async function writeCustomWallpaper(dataUrl: string): Promise<void> {
    if (!dataUrl) {
        await removeCustomWallpaper()
        return
    }

    const directory = await getWallpaperDirectory()
    const handle = await directory.getFileHandle(WALLPAPER_FILE_NAME, { create: true })
    const writable = await handle.createWritable()
    await writable.write(dataUrl)
    await writable.close()
}

/**
 * 从 OPFS 删除自定义底图文件（文件不存在时静默忽略）。
 */
export async function removeCustomWallpaper(): Promise<void> {
    if (!hasOpfs()) {
        return
    }

    try {
        const directory = await getWallpaperDirectory()
        await directory.removeEntry(WALLPAPER_FILE_NAME)
    } catch {
        // 文件不存在等情况直接忽略
    }
}
