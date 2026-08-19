import { createHash } from "node:crypto"
import OSS from "ali-oss"

/**
 * 游戏补丁 MOD 文件的 OSS 存储工具。
 * 压缩包、封面与预览图一律上传到阿里云 OSS，并以内容 SHA-256 哈希作为文件名（同内容只存一份，天然去重）。
 * 配置来自环境变量（与 upload.ts 的图片上传一致）：OSS_REGION/OSS_ENDPOINT、OSS_BUCKET、OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET、CDN_URL。
 */

/** OSS 配置，全部来自环境变量。 */
const OSS_CONFIG = {
    region: process.env.OSS_REGION || process.env.OSS_ENDPOINT?.replace(".aliyuncs.com", "") || "oss-cn-hongkong",
    endpoint: process.env.OSS_ENDPOINT || "",
    bucket: process.env.OSS_BUCKET || "",
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
    cdn: process.env.CDN_URL || "",
}

/** MOD 文件在 OSS 上的命名空间前缀（哈希命名）。 */
const MOD_FILE_PREFIX = "mods/hash"

/**
 * @description 创建 OSS 客户端实例；配置缺失时抛出错误。
 * @returns 可用于对象操作的 OSS 客户端。
 */
function getOssClient() {
    if (!OSS_CONFIG.endpoint || !OSS_CONFIG.bucket || !OSS_CONFIG.accessKeyId || !OSS_CONFIG.accessKeySecret) {
        throw new Error("OSS 未配置（请检查 OSS_ENDPOINT/OSS_BUCKET/OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET）")
    }
    return new OSS({
        region: OSS_CONFIG.region,
        accessKeyId: OSS_CONFIG.accessKeyId,
        accessKeySecret: OSS_CONFIG.accessKeySecret,
        bucket: OSS_CONFIG.bucket,
    })
}

/**
 * @description 生成 OSS 对象的对外访问地址（优先 CDN）。
 * @param ossKey OSS 对象 key。
 * @returns 可直接访问的文件 URL。
 */
export function getModFileUrl(ossKey: string): string {
    return OSS_CONFIG.cdn ? `${OSS_CONFIG.cdn}/${ossKey}` : `https://${OSS_CONFIG.bucket}.${OSS_CONFIG.endpoint}/${ossKey}`
}

/**
 * @description 计算字节内容的 SHA-256 哈希。
 * @param bytes 文件字节。
 * @returns 十六进制哈希字符串。
 */
function getSha256(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex")
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
 * @description 上传 MOD 文件到 OSS，以内容哈希作为文件名；对象已存在（同内容）时直接复用。
 * @param bytes 文件字节。
 * @param ext 文件扩展名（zip/png/jpg/webp 等）。
 * @returns OSS 对象 key（mods/hash/<sha256>.<ext>）。
 */
export async function uploadModFile(bytes: Uint8Array, ext: string): Promise<string> {
    if (!bytes.length) {
        throw new Error("文件内容不能为空")
    }
    const hash = getSha256(bytes)
    const ossKey = `${MOD_FILE_PREFIX}/${hash}.${ext}`
    const client = getOssClient()
    try {
        // 同内容对象已存在则跳过上传（去重）
        await client.head(ossKey)
        return ossKey
    } catch (error) {
        if (!isObjectNotFoundError(error)) throw error
    }
    await client.put(ossKey, Buffer.from(bytes))
    return ossKey
}

/**
 * @description 读取 MOD 压缩包字节（下载代理用），对象不存在时返回 null。
 * @param ossKey OSS 对象 key。
 * @returns 文件字节。
 */
export async function readModZip(ossKey: string): Promise<Uint8Array | null> {
    if (!isSafeModKey(ossKey)) return null
    try {
        const result = await getOssClient().get(ossKey)
        return new Uint8Array(result.content)
    } catch (error) {
        if (isObjectNotFoundError(error)) return null
        throw error
    }
}

/**
 * @description 判断 OSS key 是否安全（仅允许服务端生成的标准路径，防止路径穿越）。
 * @param key OSS 对象 key。
 * @returns 是否安全。
 */
export function isSafeModKey(key: string): boolean {
    return typeof key === "string" && !key.includes("..") && !key.startsWith("/") && !key.startsWith("\\")
}

/**
 * @description 删除 MOD 相关文件（逐个删除，忽略不存在的对象）。
 * @param fileKey 压缩包 OSS key。
 * @param coverKey 封面 OSS key。
 * @param imageKeys 预览图 OSS key 列表，可为空。
 */
export async function deleteModFiles(fileKey: string | null, coverKey: string | null, imageKeys: (string | null)[] = []) {
    const keys = [fileKey, coverKey, ...imageKeys].filter((key): key is string => !!key && isSafeModKey(key))
    if (!keys.length) return
    const client = getOssClient()
    for (const key of keys) {
        try {
            await client.delete(key)
        } catch (error) {
            if (isObjectNotFoundError(error)) continue
            console.error(`删除 OSS 对象失败: ${key}`, error)
        }
    }
}
