import { readFile } from "node:fs/promises"
import { join } from "node:path"
import OSS from "ali-oss"

/**
 * 数据包差分补丁的 OSS 存储工具。
 *
 * 判定可用的差分（0 < size <= 2MB）会镜像到 `data-pack/diff/` 下，客户端据此直连 CDN 下载，
 * 应用服务器只回一个 302，不再承担补丁字节的带宽。
 * 对象 key 与公开地址都由「数据包官方基址」推导，保证差分与数据包本体同源同路径：
 * 基址 `https://cdn.dna-builder.cn/data-pack/` → key `data-pack/diff/<name>.hdiff`
 * → 公开地址 `https://cdn.dna-builder.cn/data-pack/diff/<name>.hdiff`。
 * 配置来自环境变量（与 upload.ts / mod-storage.ts 一致）：OSS_REGION/OSS_ENDPOINT、OSS_BUCKET、
 * OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET。
 */

/** OSS 配置，全部来自环境变量。 */
const OSS_CONFIG = {
    region: process.env.OSS_REGION || process.env.OSS_ENDPOINT?.replace(".aliyuncs.com", "") || "oss-cn-hongkong",
    endpoint: process.env.OSS_ENDPOINT || "",
    bucket: process.env.OSS_BUCKET || "",
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
}

/** 差分补丁在数据包基址下的子目录。 */
const DIFF_DIR_NAME = "diff"

/**
 * @description 判断 OSS 是否已配置齐全，缺少凭证时镜像功能直接跳过。
 * @returns 是否具备上传差分的能力。
 */
export function isDataPackDiffStorageConfigured(): boolean {
    return Boolean(OSS_CONFIG.endpoint && OSS_CONFIG.bucket && OSS_CONFIG.accessKeyId && OSS_CONFIG.accessKeySecret)
}

/**
 * @description 生成差分补丁的对外基址（数据包基址下的 diff/ 子目录），末尾必定带斜杠。
 * @param packageBaseUrl 数据包官方基址。
 * @returns 差分补丁公开地址前缀。
 */
export function getDataPackDiffBaseUrl(packageBaseUrl: string): string {
    const base = packageBaseUrl.endsWith("/") ? packageBaseUrl : `${packageBaseUrl}/`
    return `${base}${DIFF_DIR_NAME}/`
}

/**
 * @description 生成差分补丁在 OSS 上的对象 key。
 * @param packageBaseUrl 数据包官方基址，其路径部分即 OSS 命名空间。
 * @param patchName 差分文件名。
 * @returns OSS 对象 key，如 `data-pack/diff/v1.1-v1.2.hdiff`。
 */
export function getDataPackDiffObjectKey(packageBaseUrl: string, patchName: string): string {
    const prefix = new URL(packageBaseUrl).pathname.replace(/^\/+|\/+$/g, "")
    return [prefix, DIFF_DIR_NAME, patchName].filter(Boolean).join("/")
}

/**
 * @description 创建 OSS 客户端实例；配置缺失时抛出错误。
 * @returns 可用于对象操作的 OSS 客户端。
 */
function getOssClient() {
    if (!isDataPackDiffStorageConfigured()) {
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
 * @description 把本地差分补丁上传到 OSS 的 diff/ 目录。
 * 差分文件名由「旧包-新包」唯一决定，同参数重复上传内容一致，直接覆盖写即可。
 * @param patchFile 本地差分文件路径。
 * @param patchName 差分文件名。
 * @param packageBaseUrl 数据包官方基址。
 * @returns 可直接下载的差分地址。
 */
export async function uploadDataPackDiffPatch(patchFile: string, patchName: string, packageBaseUrl: string): Promise<string> {
    const bytes = await readFile(patchFile)
    if (!bytes.length) {
        throw new Error("差分内容不能为空")
    }
    const objectKey = getDataPackDiffObjectKey(packageBaseUrl, patchName)
    const client = getOssClient()
    await client.put(objectKey, bytes, { mime: "application/octet-stream" })
    return new URL(patchName, getDataPackDiffBaseUrl(packageBaseUrl)).href
}

/**
 * @description 生成差分补丁的本地镜像记录路径（用于标记已可 302 到 OSS）。
 * @param patchFile 本地差分文件路径。
 * @returns 镜像记录文件路径。
 */
export function getDataPackDiffRecordPath(patchFile: string): string {
    return join(`${patchFile}.upload.json`)
}
