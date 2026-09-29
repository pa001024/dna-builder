import { createHash } from "node:crypto"
import { nanoid } from "nanoid"
import { getPublicObjectUrl, objectExists, putObject } from "./util/r2-storage"

const MAX_FILE_SIZE = 3 * 1024 * 1024
const HASH_IMAGE_PREFIX = "img/hash"

/**
 * @description 根据图片 MIME 类型推断扩展名。
 * @param mimeType 图片 MIME 类型
 * @returns 文件扩展名
 */
function getImageExtByMimeType(mimeType: string): string {
    if (mimeType === "image/jpeg") return "jpg"
    const ext = mimeType.split("/")[1]
    return ext || "jpg"
}

/**
 * @description 计算图片 Buffer 的 SHA-256 哈希。
 * @param buffer 图片二进制内容
 * @returns 十六进制哈希字符串
 */
function getBufferSha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex")
}

/**
 * @description 使用图片哈希作为文件名上传到 R2，避免重复上传同内容图片。
 * @param buffer 图片二进制内容
 * @param mimeType 图片 MIME 类型
 * @returns R2 图片地址
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
    const objectKey = `${HASH_IMAGE_PREFIX}/${hash}.${ext}`

    try {
        // 同内容对象已存在则跳过上传（去重）
        if (!(await objectExists(objectKey))) {
            await putObject(objectKey, buffer, mimeType)
        }
        return getPublicObjectUrl(objectKey)
    } catch (error) {
        console.error("按哈希上传图片到 R2 失败:", error)
        throw new Error("图片上传失败")
    }
}

/**
 * @description 上传图片到 R2，使用随机文件名。
 * @param file 浏览器 File 对象
 * @returns R2 图片地址
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
    const objectKey = `img/${nanoid()}.${ext}`

    try {
        const buffer = Buffer.from(await file.arrayBuffer())
        await putObject(objectKey, buffer, file.type)
        return getPublicObjectUrl(objectKey)
    } catch (error) {
        console.error("上传图片到 R2 失败:", error)
        throw new Error("图片上传失败")
    }
}
