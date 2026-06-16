const IMGS_CACHE_DIR = "dna-builder-imgs"
const IMGS_REMOTE_BASE_URL = "https://cdn.dna-builder.cn/imgs"

export type ImgsManifestEntry = {
    path: string
    url?: string
}

type ImgsMountOptions = {
    manifest?: ImgsManifestEntry[]
    baseUrl?: string
}

let mountPromise: Promise<void> | null = null

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
 * 写入图片到 OPFS。
 * @param relPath 图片相对路径
 * @param bytes 图片内容
 */
async function cacheImg(relPath: string, bytes: Uint8Array): Promise<void> {
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

    const cached = await readFile(currentDir, fileName)
    if (cached) {
        return
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
 * 将图片清单中的资源下载到 OPFS，并同步到运行时缓存。
 * @param options 挂载配置
 */
export async function mountImgsToVirtualPath(options: ImgsMountOptions = {}): Promise<void> {
    if (mountPromise) {
        return mountPromise
    }

    mountPromise = (async () => {
        if (!hasOpfs() || !options.manifest?.length) {
            return
        }

        const baseUrl = getImgsBaseUrl(options.baseUrl)
        await Promise.allSettled(
            options.manifest.map(async entry => {
                const relPath = normalizeImgPath(entry.path)
                const hydrated = await hydrateCacheFromOpfs(relPath)
                if (hydrated) {
                    return
                }

                const response = await fetch(entry.url || getRemoteImgUrl(relPath, baseUrl), { cache: "no-store" })
                if (!response.ok) {
                    throw new Error(`下载图片失败: ${entry.path}`)
                }

                const bytes = new Uint8Array(await response.arrayBuffer())
                await cacheImg(relPath, bytes)
            })
        )
    })()

    try {
        await mountPromise
    } finally {
        mountPromise = null
    }
}
