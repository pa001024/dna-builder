import { createHash } from "node:crypto"
import OSS from "ali-oss"
import { nanoid } from "nanoid"

const OSS_CONFIG = {
    region: process.env.OSS_REGION || process.env.OSS_ENDPOINT?.replace(".aliyuncs.com", "") || "oss-cn-hongkong",
    endpoint: process.env.OSS_ENDPOINT || "",
    bucket: process.env.OSS_BUCKET || "",
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
    cdn: process.env.CDN_URL || "",
}

const MAX_FILE_SIZE = 3 * 1024 * 1024
const HASH_IMAGE_PREFIX = "img/hash"

/**
 * @description 创建 OSS 客户端实例。
 * @returns 可用于对象操作的 OSS 客户端。
 */
function getOssClient() {
    return new OSS({
        region: OSS_CONFIG.region,
        accessKeyId: OSS_CONFIG.accessKeyId,
        accessKeySecret: OSS_CONFIG.accessKeySecret,
        bucket: OSS_CONFIG.bucket,
    })
}

/**
 * @description 生成 OSS 对外访问地址。
 * @param ossKey OSS 对象 key。
 * @returns 可直接访问的图片 URL。
 */
function getPublicImageUrl(ossKey: string): string {
    return OSS_CONFIG.cdn ? `${OSS_CONFIG.cdn}/${ossKey}` : `https://${OSS_CONFIG.bucket}.${OSS_CONFIG.endpoint}/${ossKey}`
}

/**
 * @description 根据图片 MIME 类型推断扩展名。
 * @param mimeType 图片 MIME 类型。
 * @returns 文件扩展名。
 */
function getImageExtByMimeType(mimeType: string): string {
    if (mimeType === "image/jpeg") return "jpg"
    const ext = mimeType.split("/")[1]
    return ext || "jpg"
}

/**
 * @description 判断 OSS 错误是否为对象不存在。
 * @param error 捕获到的异常对象。
 * @returns 是否为“对象不存在”错误。
 */
function isObjectNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false

    const status = "status" in error ? Number((error as { status?: unknown }).status) : NaN
    if (status === 404) return true

    const code = "code" in error ? String((error as { code?: unknown }).code || "") : ""
    return code === "NoSuchKey" || code === "NotFound"
}

/**
 * @description 确保指定对象存在；若不存在则上传。
 * @param client OSS 客户端。
 * @param ossKey OSS 对象 key。
 * @param buffer 图片二进制内容。
 */
async function ensureObjectUploaded(client: ReturnType<typeof getOssClient>, ossKey: string, buffer: Buffer): Promise<void> {
    try {
        await client.head(ossKey)
        return
    } catch (error) {
        if (!isObjectNotFoundError(error)) throw error
    }
    await client.put(ossKey, buffer)
}

/**
 * @description 计算图片 Buffer 的 SHA-256 哈希。
 * @param buffer 图片二进制内容。
 * @returns 十六进制哈希字符串。
 */
function getBufferSha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex")
}

/**
 * @description 使用图片哈希作为文件名上传，避免重复上传同内容图片。
 * @param buffer 图片二进制内容。
 * @param mimeType 图片 MIME 类型。
 * @returns OSS 图片地址。
 */
export async function uploadImageBufferByHash(buffer: Buffer, mimeType: string): Promise<string> {
    if (!buffer.length) {
        throw new Error("图片内容不能为空")
    }

    if (!mimeType.startsWith("image/")) {
        throw new Error("只支持图片格式")
    }

    if (buffer.length > MAX_FILE_SIZE) {
        throw new Error("图片大小不能超过 3MB")
    }

    const hash = getBufferSha256(buffer)
    const ext = getImageExtByMimeType(mimeType)
    const ossKey = `${HASH_IMAGE_PREFIX}/${hash}.${ext}`

    try {
        const client = getOssClient()
        await ensureObjectUploaded(client, ossKey, buffer)
        return getPublicImageUrl(ossKey)
    } catch (error) {
        console.error("按哈希上传图片到 OSS 失败:", error)
        throw new Error("图片上传失败")
    }
}

/**
 * @description 上传图片到 OSS，使用随机文件名。
 * @param file 浏览器 File 对象。
 * @returns OSS 图片地址。
 */
export async function uploadImage(file: File): Promise<string> {
    if (!file) {
        throw new Error("文件不能为空")
    }

    if (!file.type.startsWith("image/")) {
        throw new Error("只支持图片格式")
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error("图片大小不能超过 3MB")
    }

    const ext = file.name.split(".").pop() || "jpg"
    const fileName = `${nanoid()}.${ext}`
    const ossKey = `img/${fileName}`

    try {
        const client = getOssClient()
        const buffer = Buffer.from(await file.arrayBuffer())
        await client.put(ossKey, buffer)
        return getPublicImageUrl(ossKey)
    } catch (error) {
        console.error("上传图片到 OSS 失败:", error)
        throw new Error("图片上传失败")
    }
}
