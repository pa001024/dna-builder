/**
 * 发布脚本共用的对象存储客户端（Cloudflare R2，S3 兼容）。
 *
 * 走 Bun 原生 S3Client，不再使用 ali-oss：R2 强制 SigV4 且校验 `x-amz-content-sha256`，
 * ali-oss 的 OSS 签名实现发不出该头（报 `Missing x-amz-content-sha256`），改 endpoint 也连不上。
 * 配置读自 `server/.env`：R2_* 优先，缺失时回退 OSS_*（含加速端点）；公开基址取 R2_URL（回退 CDN_URL）。
 */

import fs from "node:fs"
import path from "node:path"
import { parse } from "dotenv"

/** 超过该体积才汇报上传进度，避免小文件刷屏 */
const PROGRESS_THRESHOLD = 1024 * 1024

/** `server/.env` 的解析结果；发布脚本各自的私有配置（APP_TARGET 等）也从这里读 */
export const envConfig: Record<string, string> = (() => {
    const envPath = path.resolve("server", ".env")
    return fs.existsSync(envPath) ? parse(fs.readFileSync(envPath)) : {}
})()

/** 对象存储配置 */
export const storageConfig = {
    endpoint: envConfig.R2_ENDPOINT || envConfig.OSS_ACC_ENDPOINT || envConfig.OSS_ENDPOINT || "",
    bucket: envConfig.R2_BUCKET || envConfig.OSS_BUCKET || "",
    accessKeyId: envConfig.R2_ACCESS_KEY_ID || envConfig.OSS_ACCESS_KEY_ID || "",
    accessKeySecret: envConfig.R2_ACCESS_KEY_SECRET || envConfig.OSS_ACCESS_KEY_SECRET || "",
    publicUrl: (envConfig.R2_URL || envConfig.CDN_URL || "").replace(/\/+$/, ""),
}

let cachedClient: Bun.S3Client | null = null

/**
 * @description 校验对象存储配置完整性。
 * @throws 缺少端点、桶或密钥时抛错
 */
export function assertStorageConfig(): void {
    if (!storageConfig.endpoint || !storageConfig.bucket || !storageConfig.accessKeyId || !storageConfig.accessKeySecret) {
        throw new Error("缺少必要的对象存储环境变量（R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_ACCESS_KEY_SECRET）")
    }
}

/**
 * @description 取 S3 客户端；R2 无区域概念，region 固定 auto。
 * @returns S3 客户端
 * @throws 配置不完整时抛错
 */
export function createStorageClient(): Bun.S3Client {
    assertStorageConfig()
    if (!cachedClient) {
        const endpoint = /^https?:\/\//i.test(storageConfig.endpoint) ? storageConfig.endpoint : `https://${storageConfig.endpoint}`
        cachedClient = new Bun.S3Client({
            endpoint,
            bucket: storageConfig.bucket,
            accessKeyId: storageConfig.accessKeyId,
            secretAccessKey: storageConfig.accessKeySecret,
            region: "auto",
        })
    }
    return cachedClient
}

/**
 * @description 生成对象的公开访问地址。
 * @param key 对象 key
 * @returns 公网 URL
 */
export function getPublicUrl(key: string): string {
    const base = storageConfig.publicUrl || `https://${storageConfig.bucket}.${storageConfig.endpoint}`
    return `${base}/${key.replace(/^\/+/, "")}`
}

/**
 * @description 上传内存字节。同名对象直接覆盖。
 * @param key 对象 key
 * @param bytes 内容
 * @param contentType 内容类型
 */
export async function putBytes(key: string, bytes: Uint8Array, contentType?: string): Promise<void> {
    await createStorageClient().write(key, bytes, contentType ? { type: contentType } : undefined)
}

/**
 * @description 上传本地文件；大文件按块回传进度，便于发布时观察。
 * @param key 对象 key
 * @param filePath 本地文件路径
 * @param contentType 内容类型
 */
export async function putFile(key: string, filePath: string, contentType?: string): Promise<void> {
    const client = createStorageClient()
    const options = contentType ? { type: contentType } : undefined
    const size = fs.statSync(filePath).size
    if (size <= PROGRESS_THRESHOLD) {
        await client.write(key, Bun.file(filePath), options)
        return
    }

    let uploaded = 0
    let lastPercent = -1
    const reader = Bun.file(filePath).stream().getReader()
    const progressStream = new ReadableStream<Uint8Array>({
        async pull(controller) {
            const { done, value } = await reader.read()
            if (done) {
                controller.close()
                return
            }
            uploaded += value.byteLength
            const percent = Math.min(100, Math.round((uploaded / size) * 100))
            if (percent !== lastPercent) {
                lastPercent = percent
                // 用 \r 覆盖同一行，避免进度刷屏
                process.stdout.write(`\r📊 上传进度: ${percent}%`)
            }
            controller.enqueue(value)
        },
    })

    // 必须包成 Response：write 的类型签名不收裸 ReadableStream（运行时能收，但类型不过）
    await client.write(key, new Response(progressStream), options)
    process.stdout.write("\n")
}

/**
 * @description 分页列出前缀下的全部对象 key。
 * @param prefix 目录前缀
 * @returns key 集合
 */
export async function listAllKeys(prefix: string): Promise<Set<string>> {
    const client = createStorageClient()
    const keys = new Set<string>()
    let continuationToken: string | undefined

    do {
        const page = await client.list({ prefix, maxKeys: 1000, continuationToken })
        // 前缀下没有任何对象时 contents 为 undefined，不是空数组
        for (const item of page.contents ?? []) {
            keys.add(item.key)
        }
        continuationToken = page.isTruncated ? page.nextContinuationToken : undefined
    } while (continuationToken)

    return keys
}

/**
 * @description 删除对象。S3 语义下删除不存在的对象同样返回成功。
 * @param key 对象 key
 */
export async function removeObject(key: string): Promise<void> {
    await createStorageClient().delete(key)
}
