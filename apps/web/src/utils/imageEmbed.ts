import { detectImageFormatBySignature, encodeImageBytes, imageMimeForFormat } from "@/utils/imagePack"

/** 单张图片最终内嵌字节上限：再大就会拖慢图 JSON、历史快照与自动保存 */
export const MAX_EMBED_BYTES = 2 * 1024 * 1024
/** 源文件读取上限：PNG 会先转 WebP 再判断上限，所以放宽到远高于内嵌上限 */
const MAX_IMAGE_SOURCE_BYTES = 24 * 1024 * 1024

/** WebP 质量阶梯：首档优先保住截图文字清晰度，超标再逐级降低；全不达标时返回最小结果交给调用方报错 */
const WEBP_QUALITY_STEPS = [88, 75, 62, 48]
/** 转码前缩放边界：避免 8K 截图解码成超大像素缓冲 */
const MAX_WEBP_EDGE = 4096
const MAX_WEBP_PIXELS = 40_000_000

const IMAGE_FILE_RE = /\.(png|jpe?g|webp|gif|svg)$/i
const IMAGE_HEAD_BYTES = 64

function isDeclaredImage(file: File): boolean {
    return file.type.startsWith("image/") || IMAGE_FILE_RE.test(file.name)
}

export interface EmbeddedImagePayload {
    imageData: string
    imageMime: string
    imageName: string
}

export interface ImageBoxSize {
    width: number
    height: number
}

/**
 * 读取图片文件的像素尺寸；解码失败或环境不支持时返回 null。
 * @param file 图片文件
 * @returns 原始宽高
 */
export async function readImageFileSize(file: File): Promise<ImageBoxSize | null> {
    if (typeof createImageBitmap === "function") {
        try {
            const bitmap = await createImageBitmap(file)
            const size = { width: bitmap.width, height: bitmap.height }
            bitmap.close()
            return size
        } catch {
            // SVG 等格式可能不支持 ImageBitmap 解码，继续用 <img> 兜底
        }
    }
    if (typeof Image !== "function") return null
    const url = URL.createObjectURL(file)
    try {
        return await new Promise<ImageBoxSize | null>(resolve => {
            const image = new Image()
            image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
            image.onerror = () => resolve(null)
            image.src = url
        })
    } finally {
        URL.revokeObjectURL(url)
    }
}

/**
 * 按图片宽高比计算节点显示框，避免 object-contain 在固定框里留下空白边。
 * 长边不超过 maxEdge，小图不放大。
 * @param width 图片原始宽度
 * @param height 图片原始高度
 * @param maxEdge 显示框长边上限
 * @returns 显示框宽高；尺寸非法时返回 null
 */
export function fitImageBox(width: number, height: number, maxEdge = 320): ImageBoxSize | null {
    if (!(width > 0) || !(height > 0)) return null
    const scale = Math.min(1, maxEdge / Math.max(width, height))
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * 从剪贴板文件里挑第一张图片：格式以文件头魔数为准，不信任浏览器给的 MIME（PNG 常被标成 image/jpeg）。
 * 魔数未覆盖的格式（AVIF / BMP 等）退回声明 MIME / 扩展名。
 * @param files 剪贴板文件列表
 * @returns 图片文件，没找到返回 null
 */
export async function findImageFile(files: Iterable<File>): Promise<File | null> {
    const candidates = Array.from(files)
    for (const file of candidates) {
        const head = new Uint8Array(await file.slice(0, IMAGE_HEAD_BYTES).arrayBuffer())
        if (detectImageFormatBySignature(head) !== "raw") return file
    }
    return candidates.find(isDeclaredImage) ?? null
}

/**
 * 把图片文件编码为节点内嵌数据；PNG 会先转成 WebP，明显缩小图 JSON 体积。
 * @param file 图片文件
 * @returns 内嵌载荷
 */
export async function embedImageFile(file: File): Promise<EmbeddedImagePayload> {
    if (file.size > MAX_IMAGE_SOURCE_BYTES) {
        throw new Error(`图片过大（${formatByteSize(file.size)}），请压缩到 ${formatByteSize(MAX_IMAGE_SOURCE_BYTES)} 以内`)
    }

    const head = new Uint8Array(await file.slice(0, IMAGE_HEAD_BYTES).arrayBuffer())
    const format = detectImageFormatBySignature(head)
    if (format === "raw" && !isDeclaredImage(file)) {
        throw new Error("请选择图片文件")
    }

    const source = new Uint8Array(await file.arrayBuffer())
    let bytes: Uint8Array<ArrayBufferLike> = source
    // 格式以魔数为准；魔数识别不到时才采用浏览器声明的 MIME
    let mime = imageMimeForFormat(format) || file.type || "application/octet-stream"

    if (format === "png" && !isAnimatedPng(source)) {
        const webp = await transcodePngToWebp(source)
        if (webp && webp.length < source.length) {
            bytes = webp
            mime = "image/webp"
        }
    }

    if (bytes.length > MAX_EMBED_BYTES) {
        throw new Error(`图片过大（${formatByteSize(bytes.length)}），请压缩到 ${formatByteSize(MAX_EMBED_BYTES)} 以内后再试`)
    }

    return {
        imageData: encodeImageBytes(bytes).encoded,
        imageMime: mime,
        imageName: file.name,
    }
}

/**
 * 按 8 位无符号字节统计大小。
 * @param value 字节数
 * @returns 可读大小
 */
export function formatByteSize(value: number): string {
    if (!value) return "0 B"
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${(value / 1024 / 1024).toFixed(2)} MB`
}

/**
 * 扫描 PNG 的 acTL 块判断是否为动图：动图只保留静态首帧会丢内容，因此不转码。
 * @param bytes PNG 字节
 * @returns 是否为 APNG
 */
export function isAnimatedPng(bytes: Uint8Array): boolean {
    let offset = 8
    while (offset + 8 <= bytes.length) {
        const length = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
        if (type === "acTL") return true
        if (type === "IDAT" || type === "IEND") return false
        offset += 12 + length
    }
    return false
}

let webpEncoderPromise: Promise<typeof import("@jsquash/webp/encode")> | null = null

/** wasm 编码器体积较大，首次转码时才加载；只取编码入口，避免把解码器也打进包里 */
function loadWebpEncoder(): Promise<typeof import("@jsquash/webp/encode")> {
    webpEncoderPromise ??= import("@jsquash/webp/encode").catch(error => {
        webpEncoderPromise = null
        throw error
    })
    return webpEncoderPromise
}

/**
 * PNG → ImageData → WebP：按质量阶梯重试，返回体积最小的结果。
 * 任何一步失败都返回 null，调用方继续使用原始 PNG，不阻断粘贴。
 * @param source 原始 PNG 字节
 * @returns WebP 字节或 null
 */
async function transcodePngToWebp(source: Uint8Array): Promise<Uint8Array | null> {
    const imageData = await rasterizePng(source).catch(() => null)
    if (!imageData) return null

    let smallest: Uint8Array | null = null
    try {
        const { default: encode } = await loadWebpEncoder()
        for (const quality of WEBP_QUALITY_STEPS) {
            const encoded = new Uint8Array(await encode(imageData, { quality }))
            if (!encoded.length) break
            if (!smallest || encoded.length < smallest.length) smallest = encoded
            if (encoded.length <= MAX_EMBED_BYTES) break
        }
    } catch {
        return smallest
    }
    return smallest
}

/** 用浏览器原生解码把 PNG 画到画布并取回像素；超出边界时等比缩小 */
async function rasterizePng(source: Uint8Array): Promise<ImageData | null> {
    if (typeof createImageBitmap !== "function") return null
    const target = readPngTargetSize(source)
    const blob = new Blob([new Uint8Array(source)], { type: "image/png" })
    const bitmap = await createImageBitmap(
        blob,
        target ? { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "high" } : undefined
    )
    try {
        if (!bitmap.width || !bitmap.height) return null
        const scale = rasterizeScale(bitmap.width, bitmap.height)
        const width = Math.max(1, Math.round(bitmap.width * scale))
        const height = Math.max(1, Math.round(bitmap.height * scale))
        const context = createRasterContext(width, height)
        if (!context) return null
        context.drawImage(bitmap, 0, 0, width, height)
        return context.getImageData(0, 0, width, height)
    } finally {
        bitmap.close()
    }
}

/** 从 IHDR 读取尺寸并先算好缩放后的目标大小：超大截图不必先分配整张原始位图 */
function readPngTargetSize(source: Uint8Array): { width: number; height: number } | null {
    if (source.length < 24) return null
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength)
    const width = view.getUint32(16)
    const height = view.getUint32(20)
    if (!width || !height) return null
    const scale = rasterizeScale(width, height)
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    }
}

/** 计算解码缩放比例：同时受最长边与总像素数约束 */
function rasterizeScale(width: number, height: number): number {
    const edgeScale = MAX_WEBP_EDGE / Math.max(width, height)
    const pixelScale = Math.sqrt(MAX_WEBP_PIXELS / (width * height))
    return Math.min(1, edgeScale, pixelScale)
}

/** 优先用 OffscreenCanvas；环境不支持时退回普通 canvas */
function createRasterContext(width: number, height: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
    if (typeof OffscreenCanvas === "function") {
        return new OffscreenCanvas(width, height).getContext("2d")
    }
    if (typeof document === "undefined") return null
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    return canvas.getContext("2d")
}
