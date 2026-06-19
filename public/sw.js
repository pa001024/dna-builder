const IMG_CACHE_NAME = "dna-builder-imgs-runtime"
const OPFS_ROOT_DIR = "dna-builder-imgs"

/**
 * 判断当前环境是否支持 OPFS。
 * @returns 是否支持 OPFS
 */
function hasOpfs() {
    return typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory)
}

/**
 * 规范化图片路径。
 * @param path 图片路径
 * @returns 规范化后的路径
 */
function normalizePath(path) {
    return String(path || "").replace(/^\/+/, "")
}

/**
 * 推断图片内容类型。
 * @param relPath 图片相对路径
 * @returns 内容类型
 */
function getContentType(relPath) {
    const lowerPath = normalizePath(relPath).toLowerCase()
    if (lowerPath.endsWith(".png")) return "image/png"
    if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) return "image/jpeg"
    if (lowerPath.endsWith(".gif")) return "image/gif"
    if (lowerPath.endsWith(".svg")) return "image/svg+xml"
    if (lowerPath.endsWith(".webp")) return "image/webp"
    if (lowerPath.endsWith(".avif")) return "image/avif"
    if (lowerPath.endsWith(".bmp")) return "image/bmp"
    if (lowerPath.endsWith(".ico")) return "image/x-icon"
    return "application/octet-stream"
}

/**
 * 获取 OPFS 根目录。
 * @returns 根目录句柄
 */
async function getRootDirectory() {
    if (!hasOpfs()) {
        throw new Error("当前环境不支持 OPFS")
    }

    return navigator.storage.getDirectory()
}

/**
 * 读取目录下的二进制文件。
 * @param directory 目录句柄
 * @param fileName 文件名
 * @returns 文件内容；不存在时返回 null
 */
async function readFile(directory, fileName) {
    try {
        const handle = await directory.getFileHandle(fileName, { create: false })
        const blob = await handle.getFile()
        return new Uint8Array(await blob.arrayBuffer())
    } catch {
        return null
    }
}

/**
 * 递归读取 OPFS 中的图片文件。
 * @param relPath 图片相对路径
 * @returns 图片内容；不存在时返回 null
 */
async function readImgFromOpfs(relPath) {
    const segments = normalizePath(relPath).split("/").filter(Boolean)
    if (!segments.length) {
        return null
    }

    const fileName = segments.pop()
    if (!fileName) {
        return null
    }

    const root = await getRootDirectory()
    let currentDir = await root.getDirectoryHandle(OPFS_ROOT_DIR, { create: false }).catch(() => null)
    if (!currentDir) {
        return null
    }

    for (const segment of segments) {
        currentDir = await currentDir.getDirectoryHandle(segment, { create: false }).catch(() => null)
        if (!currentDir) {
            return null
        }
    }

    return readFile(currentDir, fileName)
}

/**
 * 将 OPFS 内容写入运行时缓存。
 * @param request 请求对象
 * @returns 响应；找不到时返回 null
 */
async function respondFromOpfs(request) {
    const relPath = new URL(request.url).pathname.replace(/^\/imgs\/?/, "")
    const bytes = await readImgFromOpfs(relPath)
    if (!bytes) {
        return null
    }

    const response = new Response(bytes, {
        headers: { "Content-Type": getContentType(relPath) },
    })

    const cache = await caches.open(IMG_CACHE_NAME)
    await cache.put(request, response.clone())
    return response
}

self.addEventListener("install", event => {
    event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", event => {
    const requestUrl = new URL(event.request.url)
    if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith("/imgs/") || event.request.destination !== "image") {
        return
    }

    event.respondWith(
        (async () => {
            const cache = await caches.open(IMG_CACHE_NAME)
            const cached = await cache.match(event.request)
            if (cached) {
                return cached
            }

            const opfsResponse = await respondFromOpfs(event.request)
            if (opfsResponse) {
                return opfsResponse
            }

            const networkResponse = await fetch(event.request)
            if (networkResponse.ok) {
                await cache.put(event.request, networkResponse.clone())
            }
            return networkResponse
        })()
    )
})
