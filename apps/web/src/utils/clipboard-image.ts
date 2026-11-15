import { invoke } from "@tauri-apps/api/core"
import * as clipboard from "@tauri-apps/plugin-clipboard-manager"
import { env } from "@/env"
import { detectImageMimeTypeByBytes } from "@/utils/image-data-url"

/**
 * 读取剪贴板中的图片。
 * 桌面端优先走 Tauri 原生：位图 → 富文本 HTML（图片可能只存在于 HTML 里）→ 纯文本 data URL；
 * 浏览器或原生格式都不命中时，再用 navigator Clipboard API 兜底。
 * @returns 图片文件；剪贴板没有图片或读取失败时返回 null
 */
export async function pasteImageFile(): Promise<File | null> {
    if (env.isApp) {
        const nativeImage = await readNativeImage()
        if (nativeImage) return nativeImage
        const fromHtml = await imageFileFromHtml(await readNativeHtml())
        if (fromHtml) return fromHtml
        const fromText = await imageFileFromText(await readNativeText())
        if (fromText) return fromText
    }
    return await readNavigatorImage()
}

/** 读取 Tauri 剪贴板中的位图，并把原始 RGBA 转成 PNG 文件 */
async function readNativeImage(): Promise<File | null> {
    let image: Awaited<ReturnType<typeof clipboard.readImage>> | null = null
    try {
        image = await clipboard.readImage()
        const { width, height } = await image.size()
        const rgba = await image.rgba()
        if (!width || !height || rgba.length !== width * height * 4) return null
        const { canvas, context } = createImageCanvas(width, height)
        const imageData = context.createImageData(width, height)
        imageData.data.set(rgba)
        context.putImageData(imageData, 0, 0)
        const blob = "convertToBlob" in canvas ? await canvas.convertToBlob({ type: "image/png" }) : await canvasToBlob(canvas)
        return blob ? new File([blob], "clipboard.png", { type: "image/png" }) : null
    } catch {
        return null
    } finally {
        if (image) void image.close().catch(() => {})
    }
}

/** 读取剪贴板 HTML 片段；原生插件不提供该格式，走自定义命令 */
async function readNativeHtml(): Promise<string> {
    try {
        return (await invoke<string | null>("read_clipboard_html")) ?? ""
    } catch {
        return ""
    }
}

/** 读取剪贴板纯文本 */
async function readNativeText(): Promise<string> {
    try {
        return (await clipboard.readText()) || ""
    } catch {
        return ""
    }
}

/** navigator Clipboard API 兜底：按图片 → HTML → 文本的顺序取图 */
async function readNavigatorImage(): Promise<File | null> {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.read !== "function") return null
    try {
        const items = await navigator.clipboard.read()
        const htmlList: string[] = []
        const textList: string[] = []
        for (const item of items) {
            const imageType = item.types.find(type => type.startsWith("image/"))
            if (imageType) {
                const blob = await item.getType(imageType)
                return new File([blob], imageFileName(blob.type || imageType), { type: blob.type || imageType })
            }
            if (item.types.includes("text/html")) htmlList.push(await (await item.getType("text/html")).text())
            if (item.types.includes("text/plain")) textList.push(await (await item.getType("text/plain")).text())
        }
        for (const html of htmlList) {
            const file = await imageFileFromHtml(html)
            if (file) return file
        }
        for (const text of textList) {
            const file = await imageFileFromText(text)
            if (file) return file
        }
    } catch {}
    return null
}

/**
 * 从富文本 HTML 中取第一张可读取的图片。
 * @param html 剪贴板 HTML 片段
 * @returns 图片文件；没有可读取的图片时返回 null
 */
async function imageFileFromHtml(html: string): Promise<File | null> {
    if (!html) return null
    const parsed = new DOMParser().parseFromString(html, "text/html")
    const sources = Array.from(parsed.querySelectorAll("img[src], image[href]"))
        .map(element => (element.getAttribute("src") || element.getAttribute("href") || "").trim())
        .filter(Boolean)
    // data URL 不需要网络且不受 CORS 影响，优先尝试
    const ordered = [...new Set(sources)].sort((a, b) => Number(isDataImageSource(b)) - Number(isDataImageSource(a)))
    for (const source of ordered) {
        const file = await imageFileFromSource(source)
        if (file) return file
    }
    return null
}

/**
 * 从纯文本中取图片：支持 data URL，以及被当作纯文本复制进来的 HTML。
 * @param text 剪贴板纯文本
 * @returns 图片文件；不是图片时返回 null
 */
async function imageFileFromText(text: string): Promise<File | null> {
    const value = text.trim()
    if (!value) return null
    if (isDataImageSource(value)) return await imageFileFromSource(value)
    if (/<img[\s>]/i.test(value)) return await imageFileFromHtml(value)
    return null
}

/** 下载图片地址并转成文件；协议不支持或网络失败时返回 null */
async function imageFileFromSource(source: string): Promise<File | null> {
    const url = resolveImageSource(source)
    if (!url) return null
    if (env.isApp && url.toLowerCase().startsWith("file://")) return await imageFileFromPath(url)
    try {
        const response = await fetch(url)
        if (!response.ok) return null
        const blob = await response.blob()
        if (!blob.type.startsWith("image/")) return null
        return new File([blob], imageFileName(blob.type), { type: blob.type })
    } catch {
        return null
    }
}

/** 富文本 HTML 里的本地图片引用（如 Word 复制出的临时文件）走原生文件读取 */
async function imageFileFromPath(url: string): Promise<File | null> {
    try {
        const path = fileUrlToPath(url)
        if (!path) return null
        const bytes = new Uint8Array(await invoke<ArrayBuffer>("read_binary_file", { filePath: path }))
        const mime = detectImageMimeTypeByBytes(bytes) || imageMimeFromPath(path)
        if (!mime) return null
        const name = path.split(/[\\/]/).pop() || imageFileName(mime)
        return new File([bytes], name, { type: mime })
    } catch {
        return null
    }
}

/** 文件头识别不到的格式（SVG / BMP / TIFF）按扩展名补 MIME */
function imageMimeFromPath(path: string): string {
    const extension = path.split(".").pop()?.toLowerCase() ?? ""
    if (extension === "svg") return "image/svg+xml"
    if (extension === "bmp") return "image/bmp"
    if (extension === "tif" || extension === "tiff") return "image/tiff"
    return ""
}

/** file:// URL 转本地路径；Windows 去掉盘符前的斜杠 */
function fileUrlToPath(url: string): string {
    try {
        const parsed = new URL(url)
        const pathname = decodeURIComponent(parsed.pathname)
        if (parsed.host) return `//${parsed.host}${pathname}`
        return /^\/[A-Za-z]:/.test(pathname) ? pathname.slice(1) : pathname
    } catch {
        return ""
    }
}

/** 只接受可直接取回的图片地址；cid: 等上下文内引用无法读取 */
function resolveImageSource(source: string): string {
    const value = source.trim()
    if (!value) return ""
    const lower = value.toLowerCase()
    if (
        lower.startsWith("data:image/") ||
        lower.startsWith("http://") ||
        lower.startsWith("https://") ||
        lower.startsWith("blob:") ||
        lower.startsWith("file://")
    ) {
        return value
    }
    if (value.startsWith("//")) return `https:${value}`
    return ""
}

function isDataImageSource(source: string): boolean {
    return source.trim().toLowerCase().startsWith("data:image/")
}

/** 按 MIME 生成一个可展示的剪贴板图片文件名 */
function imageFileName(type: string): string {
    const extension = type === "image/jpeg" ? "jpg" : type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png"
    return `clipboard.${extension}`
}

/** 创建用于承接剪贴板 RGBA 的画布；优先 OffscreenCanvas */
function createImageCanvas(width: number, height: number) {
    if (typeof OffscreenCanvas === "function") {
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext("2d")
        if (context) return { canvas, context }
    }
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("无法创建图片画布")
    return { canvas, context }
}

/** HTMLCanvasElement 转 PNG Blob 的 Promise 包装 */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(resolve, "image/png"))
}
