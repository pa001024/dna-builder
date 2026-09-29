/**
 * Cloudflare R2 对象存储工具（S3 兼容）。
 *
 * 全站静态资源（图片、MOD 包、数据包差分、安装包）统一存放于 R2，走 Bun 原生 S3Client，
 * 不依赖第三方 SDK。对象 key 即公开地址的相对路径，两者同源。
 *
 * 配置来自环境变量，R2_* 优先，缺失时回退到 OSS_*：
 * R2_ENDPOINT / R2_BUCKET / R2_ACCESS_KEY_ID / R2_ACCESS_KEY_SECRET，
 * 公开访问基址取 R2_URL（回退 CDN_URL）。
 */

/** 上传内容的允许形态：内存字节、Blob 或字符串。 */
export type ObjectPayload = Uint8Array | ArrayBuffer | Blob | string

/** 对象存储配置。 */
type StorageConfig = {
    endpoint: string
    bucket: string
    accessKeyId: string
    accessKeySecret: string
    publicUrl: string
}

/**
 * @description 补全端点协议前缀，裸域名按 https 处理。
 * @param endpoint 原始端点
 * @returns 带协议的端点
 */
function normalizeEndpoint(endpoint: string): string {
    if (!endpoint) return ""
    return /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`
}

/**
 * @description 读取存储配置。惰性求值，调用方注入的环境变量总能生效。
 * @returns 存储配置
 */
function getStorageConfig(): StorageConfig {
    return {
        endpoint: normalizeEndpoint(process.env.R2_ENDPOINT || process.env.OSS_ENDPOINT || ""),
        bucket: process.env.R2_BUCKET || process.env.OSS_BUCKET || "",
        accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.OSS_ACCESS_KEY_ID || "",
        accessKeySecret: process.env.R2_ACCESS_KEY_SECRET || process.env.OSS_ACCESS_KEY_SECRET || "",
        publicUrl: (process.env.R2_URL || process.env.CDN_URL || "").replace(/\/+$/, ""),
    }
}

let cachedClient: Bun.S3Client | null = null
let cachedFingerprint = ""

/**
 * @description 判断对象存储是否配置齐全。
 * @returns 是否具备读写对象的能力
 */
export function isObjectStorageConfigured(): boolean {
    const config = getStorageConfig()
    return Boolean(config.endpoint && config.bucket && config.accessKeyId && config.accessKeySecret)
}

/**
 * @description 取 S3 客户端；配置变更时自动重建。R2 无区域概念，region 固定 auto。
 * @returns S3 客户端
 * @throws 配置不完整时抛错
 */
function getClient(): Bun.S3Client {
    const config = getStorageConfig()
    if (!config.endpoint || !config.bucket || !config.accessKeyId || !config.accessKeySecret) {
        throw new Error("R2 未配置（请检查 R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_ACCESS_KEY_SECRET）")
    }
    const fingerprint = [config.endpoint, config.bucket, config.accessKeyId].join("|")
    if (!cachedClient || cachedFingerprint !== fingerprint) {
        cachedClient = new Bun.S3Client({
            endpoint: config.endpoint,
            bucket: config.bucket,
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.accessKeySecret,
            region: "auto",
        })
        cachedFingerprint = fingerprint
    }
    return cachedClient
}

/**
 * @description 生成对象的公开访问地址。
 * @param objectKey 对象 key
 * @returns 可直接访问的 URL；未配置公开基址时退回端点直连地址
 */
export function getPublicObjectUrl(objectKey: string): string {
    const config = getStorageConfig()
    const base = config.publicUrl || `${config.endpoint}/${config.bucket}`
    return `${base}/${objectKey.replace(/^\/+/, "")}`
}

/**
 * @description 判断对象是否已存在。
 * @param objectKey 对象 key
 * @returns 是否存在
 */
export async function objectExists(objectKey: string): Promise<boolean> {
    return getClient().file(objectKey).exists()
}

/**
 * @description 上传对象，同名直接覆盖。
 * @param objectKey 对象 key
 * @param data 对象内容
 * @param contentType 内容类型，省略时由内容与扩展名推断
 */
export async function putObject(objectKey: string, data: ObjectPayload, contentType?: string): Promise<void> {
    await getClient().write(objectKey, data, contentType ? { type: contentType } : undefined)
}

/**
 * @description 上传本地文件，大文件走流式传输，不整份读进内存。
 * @param objectKey 对象 key
 * @param filePath 本地文件绝对路径
 * @param contentType 内容类型
 */
export async function putObjectFromFile(objectKey: string, filePath: string, contentType?: string): Promise<void> {
    await putObject(objectKey, Bun.file(filePath), contentType)
}

/**
 * @description 删除对象。S3 语义下删除不存在的对象同样返回成功，调用方无需先判存在。
 * @param objectKey 对象 key
 */
export async function deleteObject(objectKey: string): Promise<void> {
    await getClient().delete(objectKey)
}
