const DATA_URL_IMAGE_REGEX = /^data:(image\/(?:png|gif|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i

/**
 * @description 根据图片二进制头部识别真实 MIME 类型。
 * @param bytes 图片二进制数据。
 * @returns 识别后的 MIME，未识别时返回 null。
 */
export function detectImageMimeTypeByBytes(bytes: Uint8Array): string | null {
    if (
        bytes.length >= 6 &&
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) &&
        bytes[5] === 0x61
    ) {
        return "image/gif"
    }

    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return "image/png"
    }

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg"
    }

    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return "image/webp"
    }

    return null
}

/**
 * @description 综合文件头、file.type 与扩展名识别图片 MIME。
 * @param file 图片文件对象。
 * @param bytes 图片二进制数据。
 * @returns 识别后的 MIME。
 */
export function detectImageMimeType(file: File, bytes: Uint8Array): string {
    const detectedByHeader = detectImageMimeTypeByBytes(bytes)
    if (detectedByHeader) return detectedByHeader

    const normalizedType = file.type.toLowerCase()
    if (normalizedType.startsWith("image/")) {
        return normalizedType === "image/jpg" ? "image/jpeg" : normalizedType
    }

    const ext = file.name.split(".").pop()?.toLowerCase()
    if (ext === "gif") return "image/gif"
    if (ext === "png") return "image/png"
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
    if (ext === "webp") return "image/webp"

    return "image/png"
}

/**
 * @description 将字节数组编码为 Base64 字符串（不含 DataURL 前缀）。
 * @param bytes 图片字节数组。
 * @returns Base64 字符串。
 */
export function bytesToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000
    let binary = ""
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize)
        binary += String.fromCharCode(...chunk)
    }
    return btoa(binary)
}

/**
 * @description 读取文件并按真实 MIME 生成 DataURL，避免 GIF 被误标记为 JPEG。
 * @param file 图片文件。
 * @returns 真实 MIME 的 DataURL。
 */
export async function fileToDataUrlWithRealMime(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const mimeType = detectImageMimeType(file, bytes)
    return `data:${mimeType};base64,${bytesToBase64(bytes)}`
}

/**
 * @description 解码 Base64 前缀内容，获取用于识别格式的头部字节。
 * @param base64Data Base64 数据部分（不含 DataURL 前缀）。
 * @param maxBytes 最多解码的字节数。
 * @returns 解码后的字节数组。
 */
function decodeBase64HeaderBytes(base64Data: string, maxBytes = 16): Uint8Array {
    const normalized = base64Data.replace(/\s+/g, "")
    const neededChars = Math.ceil(maxBytes / 3) * 4
    const base64Header = normalized.slice(0, neededChars)
    if (!base64Header) return new Uint8Array()

    try {
        const binary = atob(base64Header)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }
        return bytes
    } catch (_error) {
        return new Uint8Array()
    }
}

/**
 * @description 修正单个图片 DataURL 的 MIME 前缀，确保与真实二进制类型一致。
 * @param dataUrl 图片 DataURL。
 * @returns 修正后的 DataURL。
 */
export function normalizeImageDataUrlMime(dataUrl: string): string {
    const matched = DATA_URL_IMAGE_REGEX.exec(dataUrl)
    if (!matched) return dataUrl

    const declared = matched[1].toLowerCase() === "image/jpg" ? "image/jpeg" : matched[1].toLowerCase()
    const base64Data = matched[2].replace(/\s+/g, "")
    const detected = detectImageMimeTypeByBytes(decodeBase64HeaderBytes(base64Data))
    if (!detected || detected === declared) return dataUrl

    return `data:${detected};base64,${base64Data}`
}

/**
 * @description 统一修正消息内联图片 DataURL 的 MIME，避免 GIF 误发为 JPEG 前缀。
 * @param html 原始消息 HTML。
 * @returns 修正后的 HTML。
 */
export function normalizeInlineImageDataUrlMime(html: string): string {
    if (!html.includes("data:image/")) return html

    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    const images = doc.body.querySelectorAll("img[src^='data:image/']")
    for (const image of images) {
        const src = image.getAttribute("src")
        if (!src) continue
        image.setAttribute("src", normalizeImageDataUrlMime(src))
    }

    return doc.body.innerHTML
}
