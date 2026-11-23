import { customAlphabet } from "nanoid"
import { extensionForImageMime } from "./image-sniff"
import { deleteObject, getPublicObjectUrl, putObject } from "./object-storage"

/**
 * BUG 收集的图片资产存储。
 *
 * 原图与公开派生图同桶不同前缀：私有前缀永不生成公开 URL，只能经鉴权代理读取；
 * 文件名由服务端生成（小写字母数字），不采信上传文件名，扩展名按实际 MIME 决定。
 */

/** 私有原图前缀 */
export const BUG_ASSET_PRIVATE_PREFIX = "bug-assets/private/"

/** 公开派生图前缀 */
export const BUG_ASSET_PUBLIC_PREFIX = "bug-assets/public/"

/** 服务端生成的文件名：小写字母数字，长度 24（约 124 bit 熵） */
const generateObjectName = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 24)

/** 对象 key 允许的字符集（与生成口径一致） */
const SAFE_KEY_PATTERN = /^[a-z0-9/.-]+$/

/** 资产上传结果。 */
export type BugAssetUpload = {
    objectKey: string
    /** 仅公开派生图返回 CDN 地址；私有原图永远没有公开 URL */
    publicUrl?: string
}

/**
 * @description 判断对象 key 是否安全：仅小写字母数字与 `/.-`，且不含路径穿越。
 * @param key 对象 key
 * @returns 是否安全
 */
export function isSafeBugAssetKey(key: string): boolean {
    return typeof key === "string" && SAFE_KEY_PATTERN.test(key) && !key.includes("..") && !key.startsWith("/")
}

/**
 * @description 判断 key 是否属于 BUG 资产命名空间（删除/读取前的范围校验）。
 * @param key 对象 key
 * @returns 是否为 bug-assets 下的安全 key
 */
function isBugAssetKey(key: string): boolean {
    return isSafeBugAssetKey(key) && (key.startsWith(BUG_ASSET_PRIVATE_PREFIX) || key.startsWith(BUG_ASSET_PUBLIC_PREFIX))
}

/**
 * @description 上传 BUG 图片资产；同名覆盖不适用，内容去重由数据库按 sha256 负责。
 * @param bytes 图片字节
 * @param mime 校验后的图片 MIME
 * @param isPublic 是否公开派生图
 * @returns 对象 key 与公开地址（仅公开图）
 * @throws 内容为空或 MIME 不受支持时抛错
 */
export async function uploadBugAsset(bytes: Uint8Array, mime: string, isPublic: boolean): Promise<BugAssetUpload> {
    if (!bytes.length) {
        throw new Error("图片内容不能为空")
    }
    const extension = extensionForImageMime(mime)
    if (!extension) {
        throw new Error(`不支持的图片类型: ${mime}`)
    }

    const prefix = isPublic ? BUG_ASSET_PUBLIC_PREFIX : BUG_ASSET_PRIVATE_PREFIX
    const objectKey = `${prefix}${generateObjectName()}.${extension}`
    await putObject(objectKey, bytes, mime)

    return isPublic ? { objectKey, publicUrl: getPublicObjectUrl(objectKey) } : { objectKey }
}

/**
 * @description 批量删除 BUG 资产；越界/穿越 key 直接跳过，单条失败只记日志。
 * @param keys 对象 key 列表
 */
export async function deleteBugAssets(keys: string[]): Promise<void> {
    const safeKeys = keys.filter(isBugAssetKey)
    for (const key of safeKeys) {
        try {
            await deleteObject(key)
        } catch (error) {
            console.error(`删除 BUG 资产失败: ${key}`, error)
        }
    }
}

/**
 * @description 生成资产的对外地址：只有公开前缀返回 CDN URL，私有原图一律 null。
 * @param objectKey 对象 key
 * @returns CDN 地址；私有或非法 key 为 null
 */
export function getBugAssetUrl(objectKey: string): string | null {
    if (!isSafeBugAssetKey(objectKey) || !objectKey.startsWith(BUG_ASSET_PUBLIC_PREFIX)) return null
    return getPublicObjectUrl(objectKey)
}
