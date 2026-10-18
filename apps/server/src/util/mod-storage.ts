import { createHash } from "node:crypto"
import { deleteObject, getPublicObjectUrl, objectExists, putObject } from "./object-storage"

/**
 * 游戏补丁 MOD 文件的存储工具（OSS + R2 双写）。
 * 压缩包、封面与预览图一律以内容 SHA-256 哈希作为文件名（同内容只存一份，天然去重），
 * 同时写入 OSS（主）与 R2（兜底），公开地址取主端 CDN_URL。
 * 配置来自环境变量：OSS_ENDPOINT/OSS_BUCKET/OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET、CDN_URL，
 * 以及 R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_ACCESS_KEY_SECRET、R2_URL。
 */

/** MOD 文件的对象命名空间前缀（哈希命名）。 */
const MOD_FILE_PREFIX = "mods/hash"

/**
 * @description 生成对象的对外访问地址（主端）。
 * @param objectKey 对象 key
 * @returns 可直接访问的文件 URL
 */
export function getModFileUrl(objectKey: string): string {
    return getPublicObjectUrl(objectKey)
}

/**
 * @description 计算字节内容的 SHA-256 哈希。
 * @param bytes 文件字节
 * @returns 十六进制哈希字符串
 */
function getSha256(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex")
}

/**
 * @description 上传 MOD 文件，以内容哈希作为文件名；对象已存在（同内容）时直接复用。
 * @param bytes 文件字节
 * @param ext 文件扩展名（zip/png/jpg/webp 等）
 * @returns 对象 key（mods/hash/<sha256>.<ext>）
 */
export async function uploadModFile(bytes: Uint8Array, ext: string): Promise<string> {
    if (!bytes.length) {
        throw new Error("文件内容不能为空")
    }
    const hash = getSha256(bytes)
    const objectKey = `${MOD_FILE_PREFIX}/${hash}.${ext}`
    // 同内容对象已存在则跳过上传（去重，按主端判定）
    if (!(await objectExists(objectKey))) {
        await putObject(objectKey, bytes)
    }
    return objectKey
}

/**
 * @description 判断对象 key 是否安全（仅允许服务端生成的标准路径，防止路径穿越）。
 * @param key 对象 key
 * @returns 是否安全
 */
export function isSafeModKey(key: string): boolean {
    return typeof key === "string" && !key.includes("..") && !key.startsWith("/") && !key.startsWith("\\")
}

/**
 * @description 删除 MOD 相关文件（逐个删除，忽略不存在的对象）。
 * @param fileKey 压缩包对象 key
 * @param coverKey 封面对象 key
 * @param imageKeys 预览图对象 key 列表，可为空
 */
export async function deleteModFiles(fileKey: string | null, coverKey: string | null, imageKeys: (string | null)[] = []) {
    const keys = [fileKey, coverKey, ...imageKeys].filter((key): key is string => !!key && isSafeModKey(key))
    if (!keys.length) return
    for (const key of keys) {
        try {
            await deleteObject(key)
        } catch (error) {
            console.error(`删除对象存储文件失败: ${key}`, error)
        }
    }
}
