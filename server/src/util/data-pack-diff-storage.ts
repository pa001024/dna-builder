import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
    getActiveBackends,
    isObjectStorageConfigured,
    listObjectKeys,
    putObject,
    putObjectToBackend,
    readObjectBytes,
} from "./object-storage"

/**
 * 数据包差分补丁的对象存储工具（OSS + R2 双写）。
 *
 * 判定可用的差分（0 < size <= 2MB）会镜像到 `data-pack/diff/` 下，客户端据此直连 CDN 下载，
 * 应用服务器只回一个 302，不再承担补丁字节的带宽。
 * 对象 key 与公开地址都由「数据包官方基址」推导，保证差分与数据包本体同源同路径：
 * 基址 `https://cdn.dna-builder.cn/data-pack/` → key `data-pack/diff/<name>.hdiff`
 * → 公开地址 `https://cdn.dna-builder.cn/data-pack/diff/<name>.hdiff`。
 * 配置来自环境变量（与 upload.ts / mod-storage.ts 一致）：OSS_* 与 R2_* 两套，
 * 写入时同时落两端（OSS 主、R2 从）；历史单端遗留由 syncDataPackDiffBackends 补齐。
 */

/** 差分补丁在数据包基址下的子目录。 */
const DIFF_DIR_NAME = "diff"

/** 差分补丁的对象内容类型。 */
const DIFF_CONTENT_TYPE = "application/octet-stream"

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
 * @description 生成差分补丁在对象存储上的对象 key。
 * @param packageBaseUrl 数据包官方基址，其路径部分即对象命名空间
 * @param patchName 差分文件名
 * @returns 对象 key，如 `data-pack/diff/v1.1-v1.2.hdiff`
 */
export function getDataPackDiffObjectKey(packageBaseUrl: string, patchName: string): string {
    const prefix = new URL(packageBaseUrl).pathname.replace(/^\/+|\/+$/g, "")
    return [prefix, DIFF_DIR_NAME, patchName].filter(Boolean).join("/")
}

/**
 * @description 把本地差分补丁上传到对象存储的 diff/ 目录（OSS 与 R2 双写）。
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
    await putObject(objectKey, bytes, DIFF_CONTENT_TYPE)
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

/**
 * @description 计算需要补传的差分副本计划：对每个 key 找出缺少它的端，并从已存在的端里挑一个源。
 * 目录占位对象（key 以 / 结尾）不是真实补丁，跳过。
 * @param keysByBackend 各端前缀下的 key 集合（按端 label 索引）
 * @returns 每条补传计划：key、缺失端 label 列表、读取源 label
 */
export function planDiffReplicaRepair(keysByBackend: Map<string, Set<string>>): { key: string; missing: string[]; source: string }[] {
    const labels = [...keysByBackend.keys()]
    const allKeys = new Set<string>()
    for (const keys of keysByBackend.values()) {
        for (const key of keys) {
            allKeys.add(key)
        }
    }

    const plan: { key: string; missing: string[]; source: string }[] = []
    for (const key of allKeys) {
        if (key.endsWith("/")) continue
        const missing = labels.filter(label => !keysByBackend.get(label)?.has(key))
        if (!missing.length) continue
        const source = labels.find(label => keysByBackend.get(label)?.has(key))
        if (!source) continue
        plan.push({ key, missing, source })
    }
    return plan
}

/**
 * @description 校验并补齐 diff/ 前缀下各存储端的缺失副本。
 * putObject 的从端写入只记日志，历史数据也可能只用单端上传过；这里逐端列出 key，
 * 把只存在于部分端的补丁从有的一端复制到缺失端，保证差分与数据包本体一样是双源。
 * @param packageBaseUrl 数据包官方基址，用于推导 diff/ 前缀
 * @returns 校验与补齐统计；只配置了单端时不做事
 */
export async function syncDataPackDiffBackends(packageBaseUrl: string): Promise<{ checked: number; repaired: number }> {
    const backends = getActiveBackends()
    // 只配了一端时本身就是单源，没有可补齐的另一端
    if (backends.length < 2) {
        return { checked: 0, repaired: 0 }
    }

    const prefix = `${getDataPackDiffObjectKey(packageBaseUrl, "")}/`
    const keysByBackend = new Map<string, Set<string>>()
    for (const backend of backends) {
        keysByBackend.set(backend.label, await listObjectKeys(prefix, backend))
    }

    const checked = new Set([...keysByBackend.values()].flatMap(keys => [...keys])).size
    let repaired = 0

    for (const item of planDiffReplicaRepair(keysByBackend)) {
        const source = backends.find(backend => backend.label === item.source)
        if (!source) continue
        try {
            const bytes = await readObjectBytes(item.key, source)
            for (const label of item.missing) {
                const target = backends.find(backend => backend.label === label)
                if (!target) continue
                await putObjectToBackend(target, item.key, bytes, DIFF_CONTENT_TYPE)
                console.log(`补齐差分冗余副本 - ${item.key} -> ${label}`)
            }
            repaired += 1
        } catch (error) {
            // 单个对象补传失败不阻断其余对象，留给下次启动重试
            console.error(`补齐差分冗余副本失败 - ${item.key}`, error)
        }
    }

    return { checked, repaired }
}
