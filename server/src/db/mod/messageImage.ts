import { createHash } from "node:crypto"
import { uploadImageBufferByHash } from "../../upload"

const INLINE_IMAGE_SRC_REGEX = /<img\b[^>]*\bsrc\s*=\s*(['"])(data:image\/(?:png|gif|jpeg|jpg|webp);base64,[^"']+)\1/gi
const DATA_URL_REGEX = /^data:(image\/(?:png|gif|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i

const DEFAULT_MAX_MESSAGE_LENGTH = 80_000
const DEFAULT_LARGE_INLINE_IMAGE_BYTES = 50 * 1024
const DEFAULT_ESTIMATED_OSS_URL_LENGTH = 160
const HASH_UPLOAD_URL_CACHE_MAX_SIZE = 500

const HASH_UPLOAD_URL_CACHE = new Map<string, string>()

type UploadDataUrlImage = (dataUrl: string) => Promise<string>

type InlineImageCandidate = {
    dataUrl: string
    dataUrlLength: number
    estimatedBytes: number
    hash: string
    count: number
}

type ParsedDataUrlImage = {
    mimeType: string
    buffer: Buffer
    hash: string
}

type ResolvedProcessOptions = {
    maxMessageLength: number
    largeInlineImageBytes: number
    estimatedUploadedUrlLength: number
    uploadDataUrlImage: UploadDataUrlImage
}

export type ProcessMessageImageContentOptions = {
    maxMessageLength?: number
    largeInlineImageBytes?: number
    estimatedUploadedUrlLength?: number
    uploadDataUrlImage?: UploadDataUrlImage
}

/**
 * @description 解析 Data URL 图片，并提取 MIME、二进制与哈希信息。
 * @param dataUrl 图片 Data URL。
 * @returns 解析结果；非法 Data URL 返回 null。
 */
function parseDataUrlImage(dataUrl: string): ParsedDataUrlImage | null {
    const matched = DATA_URL_REGEX.exec(dataUrl)
    if (!matched) return null

    const mimeType = matched[1].toLowerCase()
    const base64Data = matched[2].replace(/\s+/g, "")
    const buffer = Buffer.from(base64Data, "base64")
    if (!buffer.length) return null

    const hash = createHash("sha256").update(buffer).digest("hex")
    return {
        mimeType,
        buffer,
        hash,
    }
}

/**
 * @description 记录哈希上传缓存并限制容量，避免内存无限增长。
 * @param hash 图片内容哈希。
 * @param url 上传后的 OSS 地址。
 */
function rememberHashUploadUrl(hash: string, url: string): void {
    HASH_UPLOAD_URL_CACHE.delete(hash)
    HASH_UPLOAD_URL_CACHE.set(hash, url)

    if (HASH_UPLOAD_URL_CACHE.size <= HASH_UPLOAD_URL_CACHE_MAX_SIZE) return

    const oldestKey = HASH_UPLOAD_URL_CACHE.keys().next().value
    if (!oldestKey) return
    HASH_UPLOAD_URL_CACHE.delete(oldestKey)
}

/**
 * @description 给 OSS 图片 URL 追加自动格式压缩参数，避免返回消息体过大。
 * @param url 原始 OSS 图片地址。
 * @returns 追加 `x-oss-process=image/format,auto` 后的地址。
 */
export function appendOssAutoFormat(url: string): string {
    return url
    // if (!url) return url
    // if (/(?:\?|&)x-oss-process=/.test(url)) return url
    // const separator = url.includes("?") ? "&" : "?"
    // return `${url}${separator}x-oss-process=image/format,auto`
}

/**
 * @description 估算 Data URL 对应的原始二进制大小（字节）。
 * @param dataUrl Base64 Data URL。
 * @returns 估算后的字节大小。
 */
export function estimateDataUrlBytes(dataUrl: string): number {
    const commaIndex = dataUrl.indexOf(",")
    if (commaIndex < 0) return 0

    const base64Data = dataUrl.slice(commaIndex + 1).replace(/\s+/g, "")
    if (!base64Data) return 0

    let padding = 0
    if (base64Data.endsWith("==")) padding = 2
    else if (base64Data.endsWith("=")) padding = 1

    return Math.max(0, Math.floor((base64Data.length * 3) / 4) - padding)
}

/**
 * @description 将 Data URL 图片上传到 OSS，并返回带自动格式压缩参数的 URL。
 * @param dataUrl 前端内联图片 Data URL。
 * @returns 上传后的 OSS 图片地址。
 * @throws Error 当 Data URL 不合法或上传失败时抛出异常。
 */
export async function uploadDataUrlImageToOss(dataUrl: string): Promise<string> {
    const parsed = parseDataUrlImage(dataUrl)
    if (!parsed) {
        throw new Error("不支持的图片格式")
    }

    const uploadedUrl = await uploadImageBufferByHash(parsed.buffer, parsed.mimeType)
    return appendOssAutoFormat(uploadedUrl)
}

/**
 * @description 收集消息中所有内联图片，并统计重复次数。
 * @param content 原始消息 HTML。
 * @returns 去重后的内联图片候选列表。
 */
function collectInlineImageCandidates(content: string): InlineImageCandidate[] {
    const candidateMap = new Map<string, InlineImageCandidate>()

    for (const match of content.matchAll(INLINE_IMAGE_SRC_REGEX)) {
        const dataUrl = match[2]
        if (!dataUrl) continue

        const parsed = parseDataUrlImage(dataUrl)
        if (!parsed) continue

        const existed = candidateMap.get(dataUrl)
        if (existed) {
            existed.count += 1
            continue
        }

        candidateMap.set(dataUrl, {
            dataUrl,
            dataUrlLength: dataUrl.length,
            estimatedBytes: parsed.buffer.length,
            hash: parsed.hash,
            count: 1,
        })
    }

    return [...candidateMap.values()]
}

/**
 * @description 根据“单图大小”和“总消息长度”选择需要转存 OSS 的图片。
 * @param contentLength 当前消息长度。
 * @param candidates 可上传的内联图片列表。
 * @param options 处理参数。
 * @returns 需要上传 OSS 的图片列表。
 */
function selectUploadCandidates(
    contentLength: number,
    candidates: InlineImageCandidate[],
    options: ResolvedProcessOptions
): InlineImageCandidate[] {
    const selected = new Map<string, InlineImageCandidate>()
    let projectedLength = contentLength

    for (const candidate of candidates) {
        if (candidate.estimatedBytes < options.largeInlineImageBytes) continue
        selected.set(candidate.dataUrl, candidate)
        projectedLength -= (candidate.dataUrlLength - options.estimatedUploadedUrlLength) * candidate.count
    }

    if (projectedLength <= options.maxMessageLength) {
        return [...selected.values()]
    }

    const restCandidates = candidates
        .filter(candidate => !selected.has(candidate.dataUrl))
        .sort((a, b) => b.dataUrlLength * b.count - a.dataUrlLength * a.count)

    for (const candidate of restCandidates) {
        selected.set(candidate.dataUrl, candidate)
        projectedLength -= (candidate.dataUrlLength - options.estimatedUploadedUrlLength) * candidate.count
        if (projectedLength <= options.maxMessageLength) break
    }

    return [...selected.values()]
}

/**
 * @description 合并处理参数，并补齐默认值。
 * @param options 调用方传入的处理参数。
 * @returns 完整参数对象。
 */
function resolveProcessOptions(options: ProcessMessageImageContentOptions): ResolvedProcessOptions {
    return {
        maxMessageLength: options.maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH,
        largeInlineImageBytes: options.largeInlineImageBytes ?? DEFAULT_LARGE_INLINE_IMAGE_BYTES,
        estimatedUploadedUrlLength: options.estimatedUploadedUrlLength ?? DEFAULT_ESTIMATED_OSS_URL_LENGTH,
        uploadDataUrlImage: options.uploadDataUrlImage ?? uploadDataUrlImageToOss,
    }
}

/**
 * @description 处理消息中的内联图片：超大图片自动转存到 OSS，并替换为短链接。
 * @param content 原始消息 HTML。
 * @param options 可选处理参数，测试时可注入上传函数。
 * @returns 转换后的消息 HTML。
 */
export async function processMessageImageContent(content: string, options: ProcessMessageImageContentOptions = {}): Promise<string> {
    if (!content.includes("data:image/")) return content

    const resolvedOptions = resolveProcessOptions(options)
    const candidates = collectInlineImageCandidates(content)
    if (!candidates.length) return content

    const uploadCandidates = selectUploadCandidates(content.length, candidates, resolvedOptions)
    if (!uploadCandidates.length) return content

    let processed = content
    const uploadedByHash = new Map<string, string>()

    for (const candidate of uploadCandidates) {
        const uploadedUrlCached = uploadedByHash.get(candidate.hash) || HASH_UPLOAD_URL_CACHE.get(candidate.hash)
        if (uploadedUrlCached) {
            processed = processed.replaceAll(candidate.dataUrl, uploadedUrlCached)
            continue
        }

        const uploadedUrl = await resolvedOptions.uploadDataUrlImage(candidate.dataUrl)
        uploadedByHash.set(candidate.hash, uploadedUrl)
        rememberHashUploadUrl(candidate.hash, uploadedUrl)
        processed = processed.replaceAll(candidate.dataUrl, uploadedUrl)
    }

    return processed
}
