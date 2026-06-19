import { unzipSync } from "fflate"
import { computed, ref } from "vue"
import { tauriFetch } from "../api/app"

const IMGS_CACHE_DIR = "dna-builder-imgs"
const IMGS_REMOTE_BASE_URL = "https://cdn.dna-builder.cn/imgs"
const IMGS_PACK_REMOTE_BASE_URL = "https://cdn.dna-builder.cn/imgs-pack"
const IMGS_PACK_VERSIONS_FILE = "versions.json"

export type ImgsManifestEntry = {
    path: string
    url?: string
}

export type ImgsPackVersionInfo = {
    builtAt: string
    packageFile: string
    version: string
    files: string[]
    baseVersion?: string
}

type ImgsMountOptions = {
    manifest?: ImgsManifestEntry[]
    baseUrl?: string
}

let mountPromise: Promise<void> | null = null
export const imgsDownloadCompleted = ref(0)
export const imgsDownloadTotal = ref(0)
export const imgsDownloadActive = ref(false)
export const imgsDownloadPercent = computed(() => (imgsDownloadTotal.value > 0 ? imgsDownloadCompleted.value / imgsDownloadTotal.value : 0))

/**
 * 判断当前环境是否支持 OPFS。
 * @returns 是否支持 OPFS
 */
function hasOpfs(): boolean {
    return typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory)
}

/**
 * 获取图片资源基址。
 * @param baseUrl 外部基址
 * @returns 图片基址
 */
function getImgsBaseUrl(baseUrl?: string): string {
    return (baseUrl || IMGS_REMOTE_BASE_URL).replace(/\/$/, "")
}

/**
 * 获取图片包资源基址。
 * @param baseUrl 外部基址
 * @returns 图片包基址
 */
function getImgsPackBaseUrl(baseUrl?: string): string {
    return (baseUrl || IMGS_PACK_REMOTE_BASE_URL).replace(/\/$/, "")
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
 * 获取图片缓存目录。
 * @returns 缓存目录句柄
 */
async function getImgsDirectory(): Promise<FileSystemDirectoryHandle> {
    const root = await getRootDirectory()
    return root.getDirectoryHandle(IMGS_CACHE_DIR, { create: true })
}

/**
 * 规范化图片路径。
 * @param path 原始路径
 * @returns 规范化后的路径
 */
function normalizeImgPath(path: string): string {
    return path.replace(/^\/+/, "")
}

/**
 * 比较版本号。
 * @param left 左侧版本
 * @param right 右侧版本
 * @returns 比较结果
 */
function compareVersion(left: string, right: string): number {
    return left.localeCompare(right, "zh-CN", { numeric: true })
}

/**
 * 读取目录下文件。
 * @param directory 目录句柄
 * @param fileName 文件名
 * @returns 文件内容；不存在时返回 null
 */
async function readFile(directory: FileSystemDirectoryHandle, fileName: string): Promise<Uint8Array | null> {
    try {
        const handle = await directory.getFileHandle(fileName, { create: false })
        const blob = await handle.getFile()
        return new Uint8Array(await blob.arrayBuffer())
    } catch {
        return null
    }
}

/**
 * 写入二进制文件到 OPFS。
 * @param directory 目录句柄
 * @param fileName 文件名
 * @param bytes 文件内容
 */
async function writeFile(directory: FileSystemDirectoryHandle, fileName: string, bytes: Uint8Array): Promise<void> {
    const handle = await directory.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(bytes.slice())
    await writable.close()
}

/**
 * 获取图片的远端地址。
 * @param path 图片路径
 * @param baseUrl 图片基址
 * @returns 远端 URL
 */
function getRemoteImgUrl(path: string, baseUrl?: string): string {
    return new URL(normalizeImgPath(path), `${getImgsBaseUrl(baseUrl)}/`).toString()
}

/**
 * 获取图片包版本列表。
 * @param baseUrl 外部基址
 * @returns 图片包版本列表
 */
async function fetchRemoteImgsPackVersions(baseUrl?: string): Promise<ImgsPackVersionInfo[]> {
    try {
        const versionsUrl = new URL(IMGS_PACK_VERSIONS_FILE, `${getImgsPackBaseUrl(baseUrl)}/`).toString()
        let response: Response
        try {
            response = await fetch(versionsUrl, { cache: "no-store" })
        } catch {
            response = await tauriFetch(versionsUrl, { cache: "no-store" })
        }

        if (!response.ok) {
            return []
        }

        const payload = (await response.json()) as ImgsPackVersionInfo[]
        return Array.isArray(payload) ? payload.sort((a, b) => compareVersion(a.version, b.version)) : []
    } catch {
        return []
    }
}

/**
 * 读取图片包并解压。
 * @param versionInfo 图片包版本信息
 * @param baseUrl 图片包基址
 * @returns 解压后的文件映射
 */
async function loadImgsPack(versionInfo: ImgsPackVersionInfo, baseUrl: string): Promise<Record<string, Uint8Array>> {
    const response = await fetch(new URL(versionInfo.packageFile, `${baseUrl}/`).toString(), { cache: "no-store" })
    if (!response.ok) {
        throw new Error(`下载图片包失败: ${versionInfo.packageFile}`)
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    return unzipSync(bytes)
}

/**
 * 写入图片到 OPFS。
 * @param relPath 图片相对路径
 * @param bytes 图片内容
 * @param overwrite 是否强制覆盖
 */
async function cacheImg(relPath: string, bytes: Uint8Array, overwrite = false): Promise<void> {
    const segments = normalizeImgPath(relPath).split("/").filter(Boolean)
    if (!segments.length) {
        return
    }

    const fileName = segments.pop()
    if (!fileName) {
        return
    }

    const imgsDir = await getImgsDirectory()
    let currentDir = imgsDir
    for (const segment of segments) {
        currentDir = await currentDir.getDirectoryHandle(segment, { create: true })
    }

    if (!overwrite) {
        const cached = await readFile(currentDir, fileName)
        if (cached) {
            return
        }
    }

    await writeFile(currentDir, fileName, bytes)
}

/**
 * 从 OPFS 同步图片到运行时缓存。
 * @param relPath 图片相对路径
 * @returns 是否命中
 */
async function hydrateCacheFromOpfs(relPath: string): Promise<boolean> {
    const segments = normalizeImgPath(relPath).split("/").filter(Boolean)
    if (!segments.length) {
        return false
    }

    const fileName = segments.pop()
    if (!fileName) {
        return false
    }

    const imgsDir = await getImgsDirectory()
    let currentDir = imgsDir
    for (const segment of segments) {
        try {
            currentDir = await currentDir.getDirectoryHandle(segment, { create: false })
        } catch {
            return false
        }
    }

    const cached = await readFile(currentDir, fileName)
    if (!cached) {
        return false
    }

    return true
}

/**
 * 尝试通过图片包写入资源。
 * @param options 挂载配置
 * @param desiredPaths 目标路径集合
 * @param completedPaths 已完成路径集合
 */
async function tryMountImgsPacks(options: ImgsMountOptions, desiredPaths: Set<string>, completedPaths: Set<string>): Promise<void> {
    const packs = await fetchRemoteImgsPackVersions(options.baseUrl)
    if (!packs.length) {
        return
    }

    const baseUrl = getImgsPackBaseUrl(options.baseUrl)
    for (const pack of packs) {
        const entries = await loadImgsPack(pack, baseUrl)
        const packFiles = pack.files.length ? pack.files : Object.keys(entries).filter(name => name !== "manifest.json")

        for (const relPath of packFiles) {
            const normalizedPath = normalizeImgPath(relPath)
            if (!desiredPaths.has(normalizedPath) || completedPaths.has(normalizedPath)) {
                continue
            }

            const bytes = entries[normalizedPath]
            if (!bytes) {
                continue
            }

            await cacheImg(normalizedPath, bytes, true)
            completedPaths.add(normalizedPath)
            imgsDownloadCompleted.value += 1
        }
    }
}

/**
 * 将图片清单中的资源下载到 OPFS，并同步到运行时缓存。
 * @param options 挂载配置
 */
export async function mountImgsToVirtualPath(options: ImgsMountOptions = {}): Promise<void> {
    if (mountPromise) {
        return mountPromise
    }

    mountPromise = (async () => {
        if (!hasOpfs() || !options.manifest?.length) {
            imgsDownloadCompleted.value = 0
            imgsDownloadTotal.value = 0
            imgsDownloadActive.value = false
            return
        }

        const baseUrl = getImgsBaseUrl(options.baseUrl)
        const desiredPaths = new Set(options.manifest.map(entry => normalizeImgPath(entry.path)))
        const completedPaths = new Set<string>()
        imgsDownloadCompleted.value = 0
        imgsDownloadTotal.value = options.manifest.length
        imgsDownloadActive.value = true
        await tryMountImgsPacks(options, desiredPaths, completedPaths)
        await Promise.allSettled(
            options.manifest.map(async entry => {
                const relPath = normalizeImgPath(entry.path)
                if (completedPaths.has(relPath)) {
                    return
                }

                const hydrated = await hydrateCacheFromOpfs(relPath)
                if (hydrated) {
                    completedPaths.add(relPath)
                    imgsDownloadCompleted.value += 1
                    return
                }

                const response = await fetch(entry.url || getRemoteImgUrl(relPath, baseUrl), { cache: "no-store" })
                if (!response.ok) {
                    throw new Error(`下载图片失败: ${entry.path}`)
                }

                const bytes = new Uint8Array(await response.arrayBuffer())
                await cacheImg(relPath, bytes, true)
                completedPaths.add(relPath)
                imgsDownloadCompleted.value += 1
            })
        )
    })()

    try {
        await mountPromise
    } finally {
        imgsDownloadActive.value = false
        mountPromise = null
    }
}

/**
 * 删除图片缓存目录。
 */
export async function deleteImgsCache(): Promise<void> {
    if (!hasOpfs()) {
        return
    }

    const root = await getRootDirectory()
    try {
        await root.removeEntry(IMGS_CACHE_DIR, { recursive: true })
    } catch {}

    imgsDownloadCompleted.value = 0
    imgsDownloadTotal.value = 0
    imgsDownloadActive.value = false
}
