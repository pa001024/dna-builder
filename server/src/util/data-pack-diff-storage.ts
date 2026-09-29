import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { isObjectStorageConfigured, putObject } from "./r2-storage"

/**
 * 数据包差分补丁的 R2 存储工具。
 *
 * 判定可用的差分（0 < size <= 2MB）会镜像到 `data-pack/diff/` 下，客户端据此直连 CDN 下载，
 * 应用服务器只回一个 302，不再承担补丁字节的带宽。
 * 对象 key 与公开地址都由「数据包官方基址」推导，保证差分与数据包本体同源同路径：
 * 基址 `https://dl.dobapp.cc/data-pack/` → key `data-pack/diff/<name>.hdiff`
 * → 公开地址 `https://dl.dobapp.cc/data-pack/diff/<name>.hdiff`。
 * 配置来自环境变量（与 upload.ts / mod-storage.ts 一致）：R2_ENDPOINT、R2_BUCKET、
 * R2_ACCESS_KEY_ID、R2_ACCESS_KEY_SECRET。
 */

/** 差分补丁在数据包基址下的子目录。 */
const DIFF_DIR_NAME = "diff"

/**
 * @description 判断对象存储是否已配置齐全，缺少凭证时镜像功能直接跳过。
 * @returns 是否具备上传差分的能力
 */
export function isDataPackDiffStorageConfigured(): boolean {
    return isObjectStorageConfigured()
}

/**
 * @description 生成差分补丁的对外基址（数据包基址下的 diff/ 子目录），末尾必定带斜杠。
 * @param packageBaseUrl 数据包官方基址
 * @returns 差分补丁公开地址前缀
 */
export function getDataPackDiffBaseUrl(packageBaseUrl: string): string {
    const base = packageBaseUrl.endsWith("/") ? packageBaseUrl : `${packageBaseUrl}/`
    return `${base}${DIFF_DIR_NAME}/`
}

/**
 * @description 生成差分补丁在 R2 上的对象 key。
 * @param packageBaseUrl 数据包官方基址，其路径部分即对象命名空间
 * @param patchName 差分文件名
 * @returns 对象 key，如 `data-pack/diff/v1.1-v1.2.hdiff`
 */
export function getDataPackDiffObjectKey(packageBaseUrl: string, patchName: string): string {
    const prefix = new URL(packageBaseUrl).pathname.replace(/^\/+|\/+$/g, "")
    return [prefix, DIFF_DIR_NAME, patchName].filter(Boolean).join("/")
}

/**
 * @description 把本地差分补丁上传到 R2 的 diff/ 目录。
 * 差分文件名由「旧包-新包」唯一决定，同参数重复上传内容一致，直接覆盖写即可。
 * @param patchFile 本地差分文件路径
 * @param patchName 差分文件名
 * @param packageBaseUrl 数据包官方基址
 * @returns 可直接下载的差分地址
 */
export async function uploadDataPackDiffPatch(patchFile: string, patchName: string, packageBaseUrl: string): Promise<string> {
    const bytes = await readFile(patchFile)
    if (!bytes.length) {
        throw new Error("差分内容不能为空")
    }
    const objectKey = getDataPackDiffObjectKey(packageBaseUrl, patchName)
    await putObject(objectKey, bytes, "application/octet-stream")
    return new URL(patchName, getDataPackDiffBaseUrl(packageBaseUrl)).href
}

/**
 * @description 生成差分补丁的本地镜像记录路径（用于标记已可 302 到对象存储）。
 * @param patchFile 本地差分文件路径
 * @returns 镜像记录文件路径
 */
export function getDataPackDiffRecordPath(patchFile: string): string {
    return join(`${patchFile}.upload.json`)
}
