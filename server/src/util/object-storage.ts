/**
 * 服务端对象存储工具（阿里云 OSS + Cloudflare R2，双写冗余）。
 *
 * 全站静态资源（图片、MOD 包、数据包差分、安装包）同时写入 OSS 与 R2，读取侧以 OSS 为主源、
 * R2 为兜底。两侧都走 Bun 原生 `S3Client`，不依赖 ali-oss：R2 强制 SigV4 且校验
 * `x-amz-content-sha256`，ali-oss 的 OSS 签名实现发不出该头；而 OSS 自身也能被 S3Client 访问。
 *
 * ⚠️ 两端的寻址风格相反，必须分别配置，否则对象会落到错误的 key 上：
 * - **OSS**：桶名进 endpoint（`https://<bucket>.<域名>`）且 `virtualHostedStyle: true`。
 *   OSS 拒绝 path-style（报 `Please use virtual hosted style to access.`）；
 *   桶名若同时出现在 endpoint 与 `bucket` 参数里，key 会被多拼一层 `<bucket>/` 前缀。
 * - **R2**：endpoint 是账号级地址、桶名走 path，`virtualHostedStyle: false`。
 *
 * 写入策略：**OSS 主、R2 从**。主端失败抛错；从端失败只记日志，保证一端短暂不可用时业务不中断。
 * 配置来自环境变量并惰性求值，调用方注入的 env 总能生效（容器部署时由进程环境提供）。
 */

/** 上传内容的允许形态：内存字节、Blob 或字符串。 */
export type ObjectPayload = Uint8Array | ArrayBuffer | Blob | string

/** 单个存储后端配置。 */
type StorageBackend = {
    /** 后端标识，用于日志与客户端缓存 */
    label: "OSS" | "R2"
    /** 完整端点：OSS 为「桶名.域名」，R2 为账号级地址 */
    endpoint: string
    /** 桶名 */
    bucket: string
    accessKeyId: string
    accessKeySecret: string
    /** 公开访问基址 */
    publicUrl: string
    /** 是否虚拟主机风格寻址（OSS true / R2 false） */
    virtualHostedStyle: boolean
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
 * @description 读取 OSS 配置。桶名拼进 endpoint，调用客户端时不再传 bucket。
 * @returns OSS 后端配置
 */
function readOssConfig(): StorageBackend {
    const host = process.env.OSS_ENDPOINT || ""
    const bucket = process.env.OSS_BUCKET || ""
    return {
        label: "OSS",
        endpoint: bucket && host ? `https://${bucket}.${host}` : "",
        bucket,
        accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
        accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
        publicUrl: (process.env.CDN_URL || "").replace(/\/+$/, ""),
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
        endpoint: normalizeEndpoint(process.env.R2_ENDPOINT || ""),
        bucket: process.env.R2_BUCKET || "",
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        accessKeySecret: process.env.R2_ACCESS_KEY_SECRET || "",
        publicUrl: (process.env.R2_URL || "").replace(/\/+$/, ""),
        virtualHostedStyle: false,
    }
}

/**
 * @description 读取后端列表。主端（OSS）在前，公开地址与读取判定一律取主端。
 * @returns 后端列表
 */
function readBackends(): StorageBackend[] {
    return [readOssConfig(), readR2Config()]
}

/**
 * @description 判断单个后端配置是否齐全。
 * @param backend 后端配置
 * @returns 是否可读写
 */
function isBackendConfigured(backend: StorageBackend): boolean {
    return Boolean(backend.endpoint && backend.bucket && backend.accessKeyId && backend.accessKeySecret)
}

/**
 * @description 列出当前生效（配置齐全）的后端，主端在前。
 * @returns 可用后端列表
 */
export function getActiveBackends(): StorageBackend[] {
    return readBackends().filter(isBackendConfigured)
}

/**
 * @description 判断对象存储是否配置齐全。只要主端可用即认为可用；两端都缺时镜像等功能跳过。
 * @returns 是否具备读写对象的能力
 */
export function isObjectStorageConfigured(): boolean {
    return getActiveBackends().length > 0
}

/** 客户端缓存：按后端标识存，配置指纹变化时重建 */
const clientCache = new Map<string, { fingerprint: string; client: Bun.S3Client }>()

/**
 * @description 取指定后端的 S3 客户端。R2 无区域概念，region 固定 auto。
 * @param backend 后端配置，默认主端
 * @returns S3 客户端
 * @throws 配置不完整时抛错
 */
function getClient(backend: StorageBackend = readBackends()[0]): Bun.S3Client {
    if (!isBackendConfigured(backend)) {
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
 * @param objectKey 对象 key
 * @returns 可直接访问的 URL；未配置公开基址时退回端点直连地址
 */
export function getPublicObjectUrl(objectKey: string): string {
    const primary = readBackends()[0]
    const base = primary.publicUrl || `${primary.endpoint}/${primary.bucket}`
    return `${base}/${objectKey.replace(/^\/+/, "")}`
}

/**
 * @description 判断对象是否已存在（查主端）。
 * @param objectKey 对象 key
 * @returns 是否存在
 */
export async function objectExists(objectKey: string): Promise<boolean> {
    return getClient().file(objectKey).exists()
}

/**
 * @description 把单次写入派发到所有已配置后端：主端失败抛错，从端失败只记日志。
 * @param objectKey 对象 key
 * @param write 单后端写入动作
 * @throws 主端写入失败时抛错
 */
async function writeToAll(objectKey: string, write: (client: Bun.S3Client, backend: StorageBackend) => Promise<unknown>): Promise<void> {
    const active = getActiveBackends()
    if (!active.length) {
        throw new Error("对象存储未配置，无法上传")
    }

    // 先写主端：失败即抛错，避免两端都缺数据
    await write(getClient(active[0]), active[0])

    // 从端并行补写：失败只记日志，不阻断业务
    const secondaries = active.slice(1)
    if (!secondaries.length) return
    const results = await Promise.allSettled(secondaries.map(backend => write(getClient(backend), backend)))
    results.forEach((result, index) => {
        if (result.status === "rejected") {
            const backend = secondaries[index]
            console.error(`R2 冗余写入失败: ${objectKey} (${backend.label})`, result.reason)
        }
    })
}

/**
 * @description 上传对象到全部后端，同名直接覆盖。
 * @param objectKey 对象 key
 * @param data 对象内容
 * @param contentType 内容类型，省略时由内容与扩展名推断
 */
export async function putObject(objectKey: string, data: ObjectPayload, contentType?: string): Promise<void> {
    const options = contentType ? ({ type: contentType } as const) : undefined
    await writeToAll(objectKey, client => client.write(objectKey, data, options))
}

/**
 * @description 上传本地文件到全部后端，大文件走流式传输，不整份读进内存。
 * @param objectKey 对象 key
 * @param filePath 本地文件绝对路径
 * @param contentType 内容类型
 */
export async function putObjectFromFile(objectKey: string, filePath: string, contentType?: string): Promise<void> {
    await putObject(objectKey, Bun.file(filePath), contentType)
}

/**
 * @description 从全部后端删除对象。S3 语义下删除不存在的对象同样返回成功，单端失败只记日志。
 * @param objectKey 对象 key
 */
export async function deleteObject(objectKey: string): Promise<void> {
    const active = getActiveBackends()
    const results = await Promise.allSettled(active.map(backend => getClient(backend).delete(objectKey)))
    results.forEach((result, index) => {
        if (result.status === "rejected") {
            console.error(`删除 ${active[index].label} 对象失败: ${objectKey}`, result.reason)
        }
    })
}
