/**
 * 发布脚本共用的对象存储客户端（阿里云 OSS + Cloudflare R2，双写冗余）。
 *
 * 两侧都走 Bun 原生 `S3Client`，不依赖 ali-oss：R2 强制 SigV4 且校验 `x-amz-content-sha256`，
 * ali-oss 的 OSS 签名实现发不出该头；而 OSS 自身也能被 S3Client 访问，故两端共用一套代码。
 *
 * ⚠️ 两端的寻址风格相反，必须分别配置，否则对象会落到错误的 key 上：
 * - **OSS**：桶名进 endpoint（`https://<bucket>.<域名>`）且 `virtualHostedStyle: true`。
 *   OSS 拒绝 path-style（报 `Please use virtual hosted style to access.`）；
 *   而桶名若同时在 endpoint 与 `bucket` 参数里出现，key 会被多拼一层 `<bucket>/` 前缀，故不再传 bucket。
 * - **R2**：endpoint 是账号级地址、桶名走 path，`virtualHostedStyle: false`。
 *
 * 写入策略：**OSS 主、R2 从**。主端失败抛错中断发布；从端失败只告警，保证一端短暂不可用时仍能发版。
 * 配置读自 `server/.env`，公开基址分别取 CDN_URL（OSS）与 R2_URL（R2）。
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

/**
 * @description 补全端点协议前缀，裸域名按 https 处理。
 * @param endpoint 原始端点
 * @returns 带协议的端点
 */
function normalizeEndpoint(endpoint: string): string {
    if (!endpoint) return ""
    return /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`
}

/** 单个存储后端配置 */
export type StorageBackend = {
    /** 后端标识，用于日志与客户端缓存 */
    label: "OSS" | "R2"
    /** 完整端点：OSS 为「桶名.域名」，R2 为账号级地址 */
    endpoint: string
    /** 桶名；OSS 已在 endpoint 里出现，不再传给客户端 */
    bucket: string
    accessKeyId: string
    accessKeySecret: string
    /** 公开访问基址 */
    publicUrl: string
    /** 是否虚拟主机风格寻址（OSS true / R2 false） */
    virtualHostedStyle: boolean
}

/**
 * @description 读取 OSS 配置。桶名拼进 endpoint，故调用客户端时不再传 bucket。
 * @returns OSS 后端配置
 */
function readOssConfig(): StorageBackend {
    const host = envConfig.OSS_ENDPOINT || ""
    const bucket = envConfig.OSS_BUCKET || ""
    return {
        label: "OSS",
        endpoint: bucket && host ? `https://${bucket}.${host}` : "",
        bucket,
        accessKeyId: envConfig.OSS_ACCESS_KEY_ID || "",
        accessKeySecret: envConfig.OSS_ACCESS_KEY_SECRET || "",
        publicUrl: (envConfig.CDN_URL || "").replace(/\/+$/, ""),
        virtualHostedStyle: true,
    }
}

/**
 * @description 读取 R2 配置。桶名走 path，必须显式传给客户端。
 * @returns R2 后端配置
 */
function readR2Config(): StorageBackend {
    return {
        label: "R2",
        endpoint: normalizeEndpoint(envConfig.R2_ENDPOINT || ""),
        bucket: envConfig.R2_BUCKET || "",
        accessKeyId: envConfig.R2_ACCESS_KEY_ID || "",
        accessKeySecret: envConfig.R2_ACCESS_KEY_SECRET || "",
        publicUrl: (envConfig.R2_URL || "").replace(/\/+$/, ""),
        virtualHostedStyle: false,
    }
}

/** 后端列表：主端在前，公开地址一律取主端 */
function readBackends(): StorageBackend[] {
    return [readOssConfig(), readR2Config()]
}

/**
 * @description 判断单个后端配置是否齐全。
 * @param backend 后端配置
 * @returns 是否可读写
 */
function isConfigured(backend: StorageBackend): boolean {
    return Boolean(backend.endpoint && backend.bucket && backend.accessKeyId && backend.accessKeySecret)
}

/**
 * @description 列出当前生效（配置齐全）的后端，主端在前。
 * @returns 可用后端列表
 */
export function getActiveBackends(): StorageBackend[] {
    return readBackends().filter(isConfigured)
}

/**
 * @description 判断对象存储是否已配置。只要主端可用即认为可用。
 * @returns 是否具备读写对象的能力
 */
export function isObjectStorageConfigured(): boolean {
    return getActiveBackends().length > 0
}

/**
 * @description 校验对象存储配置完整性。主端（OSS）必须齐全。
 * @throws 主端缺少端点、桶或密钥时抛错
 */
export function assertStorageConfig(): void {
    const primary = readBackends()[0]
    if (!isConfigured(primary)) {
        throw new Error(
            `缺少必要的对象存储环境变量（${primary.label}：OSS_ENDPOINT / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET）`
        )
    }
}

/** 客户端缓存：按后端标识存，配置指纹变化时重建 */
const clientCache = new Map<string, { fingerprint: string; client: Bun.S3Client }>()

/**
 * @description 取指定后端的 S3 客户端。R2 无区域概念，region 固定 auto。
 * @param backend 后端配置，默认主端
 * @returns S3 客户端
 * @throws 配置不完整时抛错
 */
export function createStorageClient(backend: StorageBackend = readBackends()[0]): Bun.S3Client {
    if (!isConfigured(backend)) {
        throw new Error(`${backend.label} 未配置（请检查 ${backend.label} 的端点 / 桶 / 密钥环境变量）`)
    }

    const fingerprint = [backend.endpoint, backend.bucket, backend.accessKeyId].join("|")
    const cached = clientCache.get(backend.label)
    if (cached && cached.fingerprint === fingerprint) {
        return cached.client
    }

    const client = new Bun.S3Client({
        endpoint: backend.endpoint,
        // OSS 的桶名已在 endpoint 里，再传 bucket 会让 key 多一层 `<bucket>/` 前缀
        bucket: backend.virtualHostedStyle ? undefined : backend.bucket,
        accessKeyId: backend.accessKeyId,
        secretAccessKey: backend.accessKeySecret,
        region: "auto",
        virtualHostedStyle: backend.virtualHostedStyle,
    })
    clientCache.set(backend.label, { fingerprint, client })
    return client
}

/**
 * @description 生成对象的公开访问地址（取主端基址）。
 * @param key 对象 key
 * @returns 公网 URL
 */
export function getPublicUrl(key: string): string {
    const primary = readBackends()[0]
    const base = primary.publicUrl || `${primary.endpoint}/${primary.bucket}`
    return `${base}/${key.replace(/^\/+/, "")}`
}

/**
 * @description 生成指定后端上对象的公开访问地址。
 * @param key 对象 key
 * @param backend 目标后端
 * @returns 公网 URL
 */
export function getPublicUrlOn(backend: StorageBackend, key: string): string {
    const base = backend.publicUrl || `${backend.endpoint}/${backend.bucket}`
    return `${base}/${key.replace(/^\/+/, "")}`
}

/**
 * @description 把「按后端生成内容」的写入派发到所有已配置后端，主端失败抛错、从端失败只告警。
 * 用于内容需要内嵌各自站点地址的场景（如 latest.json 里的下载链接）。
 * @param key 对象 key
 * @param buildContent 由后端生成内容
 * @param contentType 内容类型
 * @throws 主端写入失败时抛错
 */
export async function putGenerated(
    key: string,
    buildContent: (backend: StorageBackend) => string | Uint8Array,
    contentType?: string
): Promise<void> {
    const options = contentType ? ({ type: contentType } as const) : undefined
    await writeToAll(key, (client, backend) => client.write(key, buildContent(backend), options))
}

/**
 * @description 把单次写入派发到所有已配置后端：主端失败抛错，从端失败只告警。
 * @param key 对象 key
 * @param write 单后端写入动作，收到该后端的客户端与配置
 * @throws 主端写入失败时抛错
 */
async function writeToAll(key: string, write: (client: Bun.S3Client, backend: StorageBackend) => Promise<unknown>): Promise<void> {
    const active = getActiveBackends()
    if (!active.length) {
        throw new Error("对象存储未配置，无法上传")
    }

    // 先写主端：失败即中断发布，避免两端都缺数据
    await write(createStorageClient(active[0]), active[0])

    // 从端并行补写：失败只告警，不阻断发布
    const secondaries = active.slice(1)
    if (!secondaries.length) return
    const results = await Promise.allSettled(secondaries.map(backend => write(createStorageClient(backend), backend)))
    results.forEach((result, index) => {
        if (result.status === "rejected") {
            const backend = secondaries[index]
            console.warn(`⚠️  ${backend.label} 冗余写入失败（${key}）：${(result.reason as Error)?.message ?? result.reason}`)
        }
    })
}

/**
 * @description 把本地文件写入单个后端，大文件按块回传进度。
 * @param client S3 客户端
 * @param key 对象 key
 * @param filePath 本地文件路径
 * @param contentType 内容类型
 */
async function writeFileToClient(client: Bun.S3Client, key: string, filePath: string, contentType?: string): Promise<void> {
    const options = contentType ? ({ type: contentType } as const) : undefined
    const size = fs.statSync(filePath).size
    if (size <= PROGRESS_THRESHOLD) {
        await client.write(key, Bun.file(filePath), options)
        return
    }

    let lastPercent = -1

    /**
     * @description 生成带进度的文件流，供大文件上传时观察进度。
     * @returns 可读流
     */
    const createProgressStream = (): ReadableStream<Uint8Array> => {
        const reader = Bun.file(filePath).stream().getReader()
        let uploaded = 0
        return new ReadableStream<Uint8Array>({
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
    }

    // 必须包成 Response：write 的类型签名不收裸 ReadableStream（运行时能收，但类型不过）
    await client.write(key, new Response(createProgressStream()), options)
    process.stdout.write("\n")
}

/**
 * @description 上传内存字节到全部后端。同名对象直接覆盖。
 * @param key 对象 key
 * @param bytes 内容
 * @param contentType 内容类型
 */
export async function putBytes(key: string, bytes: Uint8Array, contentType?: string): Promise<void> {
    const options = contentType ? ({ type: contentType } as const) : undefined
    await writeToAll(key, client => client.write(key, bytes, options))
}

/**
 * @description 上传本地文件到指定单个后端。补传脚本需要「按端差异化写入」时用它。
 * @param backend 目标后端
 * @param key 对象 key
 * @param filePath 本地文件路径
 * @param contentType 内容类型
 */
export async function putFileToBackend(backend: StorageBackend, key: string, filePath: string, contentType?: string): Promise<void> {
    await writeFileToClient(createStorageClient(backend), key, filePath, contentType)
}

/**
 * @description 上传本地文件到全部后端；大文件按块回传进度，便于发布时观察。
 * @param key 对象 key
 * @param filePath 本地文件路径
 * @param contentType 内容类型
 */
export async function putFile(key: string, filePath: string, contentType?: string): Promise<void> {
    await writeToAll(key, client => writeFileToClient(client, key, filePath, contentType))
}

/**
 * @description 分页列出指定后端前缀下的全部对象 key。
 * @param prefix 目录前缀
 * @param backend 目标后端，默认主端
 * @returns key 集合
 */
export async function listAllKeysInBackend(prefix: string, backend: StorageBackend = readBackends()[0]): Promise<Set<string>> {
    const client = createStorageClient(backend)
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
 * @description 分页列出前缀下的全部对象 key（取主端视图）。
 * @param prefix 目录前缀
 * @returns key 集合
 */
export async function listAllKeys(prefix: string): Promise<Set<string>> {
    return listAllKeysInBackend(prefix)
}

/**
 * @description 从全部后端删除对象。S3 语义下删除不存在的对象同样返回成功，单端失败只告警。
 * @param key 对象 key
 */
export async function removeObject(key: string): Promise<void> {
    const active = getActiveBackends()
    const results = await Promise.allSettled(active.map(backend => createStorageClient(backend).delete(key)))
    results.forEach((result, index) => {
        if (result.status === "rejected") {
            console.warn(`⚠️  ${active[index].label} 删除失败（${key}）：${(result.reason as Error)?.message ?? result.reason}`)
        }
    })
}
