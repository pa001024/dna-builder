import sharp from "sharp"

/** 识别出的图片 MIME；不支持的容器也先如实识别，方便上层给出「请转换」的提示。 */
export type ImageMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/avif" | "image/heic"

/** 上传阶段默认接受的格式（§10：一期只收 JPEG/PNG/WebP，GIF 等要求转换）。 */
export const DEFAULT_UPLOAD_MIMES: readonly ImageMime[] = ["image/png", "image/jpeg", "image/webp"]

/** 单图解压像素上限（§10：40 MP）。 */
export const MAX_IMAGE_PIXELS = 40_000_000

/** 单图字节上限（§10：10 MiB）。 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** MIME → 存储扩展名；文件名由系统生成，不采信上传方的名字。 */
const EXTENSION_BY_MIME: Record<ImageMime, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/heic": "heic",
}

/** HEIC/HEIF 的 ftyp 主品牌；仅用于识别并提示转换，不接受上传。 */
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "mif1", "msf1"]

/** sharp 解码出的 format → MIME，用于发现「魔数说 A、解码说 B」的伪装文件。 */
const MIME_BY_SHARP_FORMAT: Record<string, ImageMime> = {
    png: "image/png",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    heif: "image/avif",
}

/**
 * @description 把字节上限格式化成便于理解的单位。
 */
function formatByteLimit(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        const mib = bytes / 1024 / 1024
        return `${Number.isInteger(mib) ? mib : mib.toFixed(1)} MiB`
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KiB`
}

/**
 * @description 判断字节在指定偏移处是否为给定 ASCII 串。
 */
function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
    if (bytes.length < offset + text.length) return false
    for (let index = 0; index < text.length; index++) {
        if (bytes[offset + index] !== text.charCodeAt(index)) return false
    }
    return true
}

/**
 * @description 判断字节是否以给定序列开头。
 */
function startsWithBytes(bytes: Uint8Array, prefix: readonly number[]): boolean {
    if (bytes.length < prefix.length) return false
    return prefix.every((byte, index) => bytes[index] === byte)
}

/**
 * @description 按魔数识别图片真实格式，不信任扩展名与请求声明的 MIME。
 * @param bytes 文件字节
 * @returns 识别结果；无法识别时 mime 为 null
 */
export function sniffImage(bytes: Uint8Array): { mime: ImageMime | null; ok: boolean } {
    if (!bytes.length) return { mime: null, ok: false }

    if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ok: true }
    if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ok: true }
    if (asciiAt(bytes, 0, "GIF8")) return { mime: "image/gif", ok: true }
    if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) return { mime: "image/webp", ok: true }
    if (asciiAt(bytes, 4, "ftyp") && (asciiAt(bytes, 8, "avif") || asciiAt(bytes, 8, "avis"))) {
        return { mime: "image/avif", ok: true }
    }
    if (asciiAt(bytes, 4, "ftyp") && HEIC_BRANDS.some(brand => asciiAt(bytes, 8, brand))) {
        return { mime: "image/heic", ok: true }
    }

    return { mime: null, ok: false }
}

/**
 * @description 取 MIME 对应的扩展名。
 * @param mime 图片 MIME
 * @returns 扩展名；未知 MIME 为 null
 */
export function extensionForImageMime(mime: string): string | null {
    return EXTENSION_BY_MIME[mime as ImageMime] ?? null
}

/** 图片校验选项。 */
export type ValidateImageOptions = {
    /** 解码像素上限，默认 40 MP */
    maxPixels?: number
    /** 字节上限，默认 10 MiB */
    maxBytes?: number
    /** 允许的 MIME 列表，默认 PNG/JPEG/WebP */
    allowedMimes?: readonly ImageMime[]
    /** 上传方声明的 MIME；提供时与魔数不一致即拒绝 */
    declaredMime?: string | null
}

/** 图片校验结果。 */
export type ValidateImageResult = {
    ok: boolean
    error?: string
    mime?: ImageMime
    width?: number
    height?: number
}

/**
 * @description 校验上传图片：魔数、声明 MIME、文件头可解析性、尺寸与字节预算。
 * 只做检查，不落盘；真正解码发生在 `reencodeImage`，通过后才生成剥除元数据的安全派生图。
 * @param bytes 文件字节
 * @param options 校验阈值
 * @returns 校验结果；失败时 error 说明具体限制
 */
export async function validateImageAsset(bytes: Uint8Array, options: ValidateImageOptions = {}): Promise<ValidateImageResult> {
    const maxPixels = options.maxPixels ?? MAX_IMAGE_PIXELS
    const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES
    const allowedMimes = options.allowedMimes ?? DEFAULT_UPLOAD_MIMES

    if (!bytes.length) return { ok: false, error: "图片内容为空" }
    if (bytes.byteLength > maxBytes) {
        return { ok: false, error: `图片不得超过 ${formatByteLimit(maxBytes)}` }
    }

    const { mime } = sniffImage(bytes)
    if (!mime) return { ok: false, error: "无法识别的图片格式" }

    const declaredMime = options.declaredMime?.split(";")[0]?.trim().toLowerCase()
    if (declaredMime && declaredMime !== mime) {
        return { ok: false, error: `声明的类型 ${declaredMime} 与实际格式 ${mime} 不一致` }
    }

    if (!allowedMimes.includes(mime)) {
        return { ok: false, error: `不支持的图片格式 ${mime}，请转换为 PNG/JPEG/WebP 后重试` }
    }

    let metadata: sharp.Metadata
    try {
        // metadata() 只读文件头，不解码像素；像素预算由下方显式检查给出具体限制，
        // 不能交给 sharp 的 limitInputPixels（它只会抛笼统的解码错误）
        metadata = await sharp(bytes, { limitInputPixels: false }).metadata()
    } catch {
        return { ok: false, error: "图片内容无法解码" }
    }

    if (MIME_BY_SHARP_FORMAT[metadata.format ?? ""] !== mime) {
        return { ok: false, error: "图片实际编码与文件头不一致" }
    }

    const width = metadata.width
    const height = metadata.height
    if (!width || !height) return { ok: false, error: "无法读取图片尺寸" }
    if (width * height > maxPixels) {
        return { ok: false, error: `图片像素不得超过 ${maxPixels}（当前 ${width}×${height}）` }
    }

    return { ok: true, mime, width, height }
}

/** 重编码选项。 */
export type ReencodeOptions = {
    /** 输出容器，默认 webp */
    format?: "webp" | "png"
    /** 输入解压像素上限（防解压炸弹），默认 40 MP */
    maxInputPixels?: number
}

/**
 * @description 重新编码安全派生图：自动纠正方向、按像素预算缩放，且不写入任何元数据（EXIF/GPS 等默认被 sharp 丢弃）。
 * @param bytes 原图字节
 * @param maxPixels 输出像素上限
 * @param options 输出格式等
 * @returns 派生图字节
 */
export async function reencodeImage(bytes: Uint8Array, maxPixels = MAX_IMAGE_PIXELS, options: ReencodeOptions = {}): Promise<Buffer> {
    const format = options.format ?? "webp"
    const image = sharp(bytes, { limitInputPixels: options.maxInputPixels ?? MAX_IMAGE_PIXELS })
    const metadata = await image.metadata()

    // rotate() 不带参数即按 EXIF Orientation 转正，后续输出不保留该标签
    let pipeline = image.rotate()
    const width = metadata.width ?? 0
    const height = metadata.height ?? 0
    const pixels = width * height
    if (pixels > maxPixels) {
        const scale = Math.sqrt(maxPixels / pixels)
        pipeline = pipeline.resize({
            width: Math.max(1, Math.floor(width * scale)),
            height: Math.max(1, Math.floor(height * scale)),
            fit: "inside",
        })
    }

    return pipeline.toFormat(format, format === "webp" ? { quality: 82 } : {}).toBuffer()
}
