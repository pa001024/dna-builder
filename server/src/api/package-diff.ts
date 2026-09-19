import { createHash } from "node:crypto"
import { mkdir, readFile, rm, stat, truncate, writeFile } from "node:fs/promises"
import { basename, dirname, join, parse, resolve } from "node:path"
import {
    getDataPackDiffBaseUrl,
    getDataPackDiffRecordPath,
    isDataPackDiffStorageConfigured,
    uploadDataPackDiffPatch,
} from "../util/data-pack-diff-storage"

const MAX_PATCH_SIZE = 2 * 1024 * 1024
/** 已放弃发送的差分占位文件大小：差分超过 MAX_PATCH_SIZE 后会被截断成 0 字节。 */
const DISCARDED_PATCH_SIZE = 0
const PACKAGE_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]*\.zip$/i
const DEFAULT_DATA_PACKAGE_BASE_URL = "https://cdn.dna-builder.cn/data-pack/"

type PackageFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

type PackageFeature = {
    packageName: string
    url: string
    size: number
    sha256: string
}

/** 差分镜像到对象存储的实现，返回差分可直接下载的地址。 */
export type PackageDiffUploader = (patchFile: string, patchName: string) => Promise<string>

/** 差分镜像记录：存在且与当前基址、体积一致时才允许 302 到对象存储。 */
type PatchUploadRecord = {
    url: string
    size: number
    uploadedAt: string
}

export type PackageDiffConfig = {
    /** 数据包官方基址。 */
    dataPackageBaseUrl?: string
    cacheDir?: string
    createDiff?: (oldFile: string, newFile: string, patchFile: string) => Promise<void>
    /** 覆盖差分镜像实现，便于测试；默认上传阿里云 OSS。 */
    uploadDiff?: PackageDiffUploader
    fetch?: PackageFetch
    hdiffzPath?: string
}

export type PackageDiffResult =
    /** 差分已镜像到对象存储，302 给客户端直连下载。 */
    | { mode: "patch"; patchName: string; patchUrl: string; targetPackageName: string; targetSha256: string | null }
    /** 差分只在本地（尚未镜像），由应用服务器直接下发。 */
    | { mode: "patch-local"; patchFile: string; patchName: string; targetPackageName: string; targetSha256: string | null }
    | { mode: "full"; targetPackageName: string; targetUrl: string; targetSha256: string | null }

/** 统一的时间戳前缀，前台响应与后台任务共用同一格式。 */
const timestamp = () => new Date().toLocaleString()

/** 后台任务表：按去重键记录进行中的任务，避免同一份差分被重复生成或重复上传。 */
const pendingBackgroundTasks = new Map<string, Promise<void>>()

/** 后台任务串行队列尾：让生成与上传依次执行，避免并发 hdiffz / 上传抢占 CPU 与带宽。 */
let backgroundQueue: Promise<void> = Promise.resolve()

/**
 * 等待当前排队中的后台任务（差分生成与镜像）全部结束。
 * 前台响应不会等待，只有测试与优雅退出场景需要。
 * @returns 队列清空后的 Promise。
 */
export async function whenPackageDiffIdle() {
    // 任务结束后会自行出队；循环是为了兼容「任务又排入新任务」的情况。
    while (pendingBackgroundTasks.size > 0) {
        await Promise.allSettled([...pendingBackgroundTasks.values()])
    }
}

/**
 * 验证并标准化客户端传入的安装包名，避免缓存目录穿越。
 * @param packageName 客户端已有的安装包名。
 * @returns 安全的安装包名。
 */
export function normalizePackageName(packageName: string) {
    const normalized = basename(packageName)
    if (normalized !== packageName || !PACKAGE_FILE_PATTERN.test(normalized)) {
        throw new Error("包名必须是 ZIP 文件名")
    }
    return normalized
}

/**
 * 读取官方数据包基址。显式传入了 old/new 后，无需再请求版本列表定位最新包。
 * @param config 差分服务配置。
 * @returns 官方基址。
 */
async function resolveDataPackageBaseUrl(config: PackageDiffConfig): Promise<string> {
    return config.dataPackageBaseUrl || process.env.OFFICIAL_DATA_PACK_BASE_URL || DEFAULT_DATA_PACKAGE_BASE_URL
}

/**
 * 计算文件 SHA-256，用于缓存特征与差分结果校验。
 * @param filePath 安装包或差分文件路径。
 * @returns 十六进制 SHA-256 摘要。
 */
async function calculateSha256(filePath: string) {
    return createHash("sha256")
        .update(await readFile(filePath))
        .digest("hex")
}

/**
 * 读取已缓存的包特征。
 * @param featurePath 特征文件路径。
 * @returns 已缓存特征，不存在时返回 null。
 */
async function readFeature(featurePath: string): Promise<PackageFeature | null> {
    try {
        return JSON.parse(await readFile(featurePath, "utf8")) as PackageFeature
    } catch {
        return null
    }
}

/**
 * 读取已缓存的目标包 SHA-256。
 * 命中缓存时无需为了填充响应头再下载一次整包，这是前台零等待的前提。
 * @param cacheDir 差分缓存目录。
 * @param packageName 目标官方包名。
 * @returns 已缓存的目标包摘要，未缓存时返回 null。
 */
async function readCachedTargetSha256(cacheDir: string, packageName: string) {
    const feature = await readFeature(join(cacheDir, "features", `${packageName}.json`))
    return feature?.sha256 ?? null
}

/**
 * 读取差分文件当前的字节数。
 * @param patchFile 差分文件路径。
 * @returns 字节数；文件不存在时返回 null。
 */
async function readPatchSize(patchFile: string) {
    try {
        return (await stat(patchFile)).size
    } catch {
        return null
    }
}

/**
 * 读取差分的镜像记录。
 * @param patchFile 差分文件路径。
 * @returns 镜像记录，不存在或损坏时返回 null。
 */
async function readPatchUploadRecord(patchFile: string): Promise<PatchUploadRecord | null> {
    try {
        return JSON.parse(await readFile(getDataPackDiffRecordPath(patchFile), "utf8")) as PatchUploadRecord
    } catch {
        return null
    }
}

/**
 * 写入差分的镜像记录，作为「可 302 到对象存储」的唯一凭据。
 * @param patchFile 差分文件路径。
 * @param record 镜像记录。
 */
async function writePatchUploadRecord(patchFile: string, record: PatchUploadRecord) {
    try {
        await writeFile(getDataPackDiffRecordPath(patchFile), JSON.stringify(record))
    } catch (error) {
        console.error(`${timestamp()} 写入差分镜像记录失败 - ${patchFile}`, error)
    }
}

/**
 * 删除差分的镜像记录。差分失效时同步清理，避免 302 到早已下架的旧对象。
 * @param patchFile 差分文件路径。
 */
async function removePatchUploadRecord(patchFile: string) {
    try {
        await rm(getDataPackDiffRecordPath(patchFile), { force: true })
    } catch (error) {
        console.error(`${timestamp()} 清理差分镜像记录失败 - ${patchFile}`, error)
    }
}

/**
 * 解析差分可用的对象存储地址。
 * 记录缺失、体积与磁盘不一致（差分被改写）或基址已变更时都视为不可用，需要重新镜像。
 * @param record 镜像记录。
 * @param patchSize 磁盘上差分文件的实际大小。
 * @param packageBaseUrl 数据包官方基址。
 * @returns 可直链下载的地址；不可用时返回 null。
 */
function resolvePatchUrl(record: PatchUploadRecord | null, patchSize: number, packageBaseUrl: string) {
    if (!record || record.size !== patchSize) {
        return null
    }
    return record.url.startsWith(getDataPackDiffBaseUrl(packageBaseUrl)) ? record.url : null
}

/**
 * 下载官方安装包并写入包特征。已缓存且特征存在的版本包不会重复下载。
 * @param packageName 官方安装包文件名。
 * @param packageUrl 官方安装包地址。
 * @param cacheDir 差分缓存目录。
 * @param requestFetch 可替换的 fetch，便于测试。
 * @returns 本地安装包文件与其特征。
 */
async function cacheOfficialPackage(packageName: string, packageUrl: string, cacheDir: string, requestFetch: PackageFetch) {
    const packageDir = join(cacheDir, "packages")
    const featureDir = join(cacheDir, "features")
    const packageFile = join(packageDir, packageName)
    const featureFile = join(featureDir, `${packageName}.json`)
    const cachedFeature = await readFeature(featureFile)

    try {
        await stat(packageFile)
        if (cachedFeature?.url === packageUrl) {
            return { feature: cachedFeature, packageFile }
        }
    } catch {}

    const response = await requestFetch(packageUrl)
    if (!response.ok) {
        throw new Error(`下载官方包失败: ${response.status}`)
    }
    await mkdir(packageDir, { recursive: true })
    await Bun.write(packageFile, response)
    await mkdir(featureDir, { recursive: true })
    const feature: PackageFeature = {
        packageName,
        url: packageUrl,
        size: (await stat(packageFile)).size,
        sha256: await calculateSha256(packageFile),
    }
    await writeFile(featureFile, JSON.stringify(feature))
    return { feature, packageFile }
}

/**
 * 使用 HDiffPatch 生成二进制差分文件。
 * @param oldFile 旧 ZIP 本地路径。
 * @param newFile 新 ZIP 本地路径。
 * @param patchFile 输出 hdiff 路径。
 * @param hdiffzPath hdiffz 可执行文件路径。
 */
async function createHdiff(oldFile: string, newFile: string, patchFile: string, hdiffzPath: string) {
    const process = Bun.spawn({ cmd: [hdiffzPath, oldFile, newFile, patchFile], stdout: "pipe", stderr: "pipe" })
    if ((await process.exited) !== 0) {
        throw new Error(`生成 HDiffPatch 失败: ${await new Response(process.stderr).text()}`)
    }
}

/**
 * 判断缓存的差分文件是否值得下发给客户端。
 * 0 字节是「差分过大、已判定不可用」的占位标记，既保留结论又不再占用磁盘。
 * @param patchSize 差分文件字节数。
 * @returns true 表示可以按差分下发。
 */
function isPatchSendable(patchSize: number) {
    return patchSize > DISCARDED_PATCH_SIZE && patchSize <= MAX_PATCH_SIZE
}

/**
 * 把不可下发的差分文件截断为 0 字节占位，回收磁盘占用。
 * 占位文件在后续请求中会直接命中「回退完整包」的结论，不会重新生成差分。
 * @param patchFile 差分文件路径。
 */
async function discardPatch(patchFile: string) {
    try {
        await truncate(patchFile, DISCARDED_PATCH_SIZE)
    } catch (error) {
        console.error(`回收过大差分失败: ${patchFile}`, error)
    }
    // 差分已不可用，连同镜像记录一起清掉，避免 302 到一份已失效的补丁。
    await removePatchUploadRecord(patchFile)
}

/**
 * 把后台任务排入串行队列，同一去重键已在队列中时直接跳过。
 * 任务内部自行吞掉异常，保证队列不会被单次失败打断，也不会产生未捕获的 Promise 拒绝。
 * @param key 去重键。
 * @param task 实际逻辑。
 */
function scheduleBackgroundTask(key: string, task: () => Promise<void>) {
    if (pendingBackgroundTasks.has(key)) {
        return
    }

    const settled = backgroundQueue
        .then(task)
        .catch(error => {
            console.error(`${timestamp()} 后台任务失败 - ${key}`, error)
        })
        .finally(() => {
            pendingBackgroundTasks.delete(key)
        })

    backgroundQueue = settled
    pendingBackgroundTasks.set(key, settled)
}

/** 差分镜像所需的上下文。 */
type PatchMirrorParams = {
    patchFile: string
    patchName: string
    patchSize: number
    packageBaseUrl: string
    config: PackageDiffConfig
}

/**
 * 把可用的差分补丁镜像到对象存储，成功后写下镜像记录。
 * 失败只记日志：本地差分照旧可用，后续同参数请求会被应用服务器直接下发。
 * @param params 镜像上下文。
 */
async function mirrorPatchToStorage({ patchFile, patchName, patchSize, packageBaseUrl, config }: PatchMirrorParams) {
    try {
        const uploadDiff = config.uploadDiff || ((file, name) => uploadDataPackDiffPatch(file, name, packageBaseUrl))
        const url = await uploadDiff(patchFile, patchName)
        await writePatchUploadRecord(patchFile, { url, size: patchSize, uploadedAt: new Date().toISOString() })
        console.log(`${timestamp()} 差分已镜像到对象存储 - ${patchName} -> ${url}`)
    } catch (error) {
        console.error(`${timestamp()} 差分镜像到对象存储失败，改由应用服务器下发 - ${patchName}`, error)
    }
}

type BackgroundDiffParams = {
    sourcePackageName: string
    sourceUrl: string
    targetPackageName: string
    targetUrl: string
    packageBaseUrl: string
    cacheDir: string
    patchFile: string
    patchName: string
    requestFetch: PackageFetch
    config: PackageDiffConfig
}

/**
 * 在后台把「旧包 → 新包」的差分补齐进缓存，并镜像到对象存储，供后续同参数的请求直接命中。
 * 前台请求不等待它；生成结果沿用与前台一致的体积策略（过大则改写为 0 字节占位）。
 * @param params 生成差分所需的上下文。
 */
async function generatePackageDiffInBackground({
    sourcePackageName,
    sourceUrl,
    targetPackageName,
    targetUrl,
    packageBaseUrl,
    cacheDir,
    patchFile,
    patchName,
    requestFetch,
    config,
}: BackgroundDiffParams) {
    const { feature: sourceFeature, packageFile: sourceFile } = await cacheOfficialPackage(
        sourcePackageName,
        sourceUrl,
        cacheDir,
        requestFetch
    )
    const { feature: targetFeature, packageFile: targetFile } = await cacheOfficialPackage(
        targetPackageName,
        targetUrl,
        cacheDir,
        requestFetch
    )

    if (sourceFeature.sha256 === targetFeature.sha256) {
        console.log(`${timestamp()} 新旧包内容一致，跳过差分生成 - ${patchName}`)
        return
    }

    await mkdir(dirname(patchFile), { recursive: true })
    const createDiff =
        config.createDiff ||
        ((oldFile: string, newFile: string, outputFile: string) =>
            createHdiff(oldFile, newFile, outputFile, config.hdiffzPath || process.env.HDIFFZ_PATH || "hdiffz"))

    console.log(`${timestamp()} 开始后台生成差分 - ${sourcePackageName} -> ${targetPackageName}`)
    await createDiff(sourceFile, targetFile, patchFile)
    const patchSize = (await stat(patchFile)).size
    if (!isPatchSendable(patchSize)) {
        console.log(`${timestamp()} 差分不可用回退完整包并改写为 0 字节占位 - ${patchName}, 大小: ${patchSize} 字节`)
        await discardPatch(patchFile)
        return
    }

    console.log(`${timestamp()} 后台差分生成完成 - ${patchName}, 大小: ${patchSize} 字节`)
    // 只有判定可用的差分才镜像到对象存储，0 字节占位与超大差分不上传。
    await mirrorPatchToStorage({ patchFile, patchName, patchSize, packageBaseUrl, config })
}

/**
 * 为客户端已有的旧官方数据包查询到指定新官方数据包的下载结果。
 *
 * 前台只做磁盘查询，不做任何网络与计算：
 * - 差分可用且已镜像到对象存储 → 返回 302 地址，字节完全由 CDN 承担；
 * - 差分可用但尚未镜像 → 本地下发，同时把镜像排入后台队列；
 * - 差分已判定不可用（0 字节占位）→ 直接回退完整包；
 * - 从未生成过 → 立刻回退完整包，生成与镜像转入后台串行队列，后续同 old/new 的请求即可命中。
 *
 * @param oldPackageName 客户端已有的旧官方数据包名。
 * @param newPackageName 目标新官方数据包名。
 * @param config 差分服务配置。
 * @returns 差分文件地址、本地差分或完整下载回退信息。
 */
export async function getPackageDiff(
    oldPackageName: string,
    newPackageName: string,
    config: PackageDiffConfig = {}
): Promise<PackageDiffResult> {
    const requestFetch = config.fetch || fetch
    normalizePackageName(oldPackageName)
    normalizePackageName(newPackageName)
    const officialPackageBaseUrl = await resolveDataPackageBaseUrl(config)

    const officialBaseUrl = new URL(officialPackageBaseUrl)
    const sourcePackageName = normalizePackageName(oldPackageName)
    const targetPackageName = normalizePackageName(newPackageName)
    const baseHref = officialBaseUrl.href.endsWith("/") ? officialBaseUrl.href : `${officialBaseUrl.href}/`
    const sourceUrl = new URL(sourcePackageName, baseHref).href
    const targetUrl = new URL(targetPackageName, baseHref).href
    if (new URL(targetUrl).origin !== officialBaseUrl.origin) {
        throw new Error("目标 ZIP 必须来自官方源")
    }

    const cacheDir = config.cacheDir || process.env.PACKAGE_DIFF_CACHE_DIR || resolve(import.meta.dir, "../../data/package-diff")
    const patchName = `${parse(sourcePackageName).name}-${parse(targetPackageName).name}.hdiff`
    const patchFile = join(cacheDir, "patches", patchName)
    const targetSha256 = await readCachedTargetSha256(cacheDir, targetPackageName)

    const cachedPatchSize = await readPatchSize(patchFile)
    if (cachedPatchSize !== null) {
        if (!isPatchSendable(cachedPatchSize)) {
            // 0 字节占位表示已判定不可用，无需重新生成；历史遗留的超大差分顺手截断回收。
            if (cachedPatchSize > MAX_PATCH_SIZE) {
                console.log(`${timestamp()} 回收过大差分缓存 - ${patchName}, 原本大小: ${cachedPatchSize} 字节`)
                await discardPatch(patchFile)
            }
            return { mode: "full", targetPackageName, targetUrl, targetSha256 }
        }

        const patchUrl = resolvePatchUrl(await readPatchUploadRecord(patchFile), cachedPatchSize, officialPackageBaseUrl)
        if (patchUrl) {
            return { mode: "patch", patchName, patchUrl, targetPackageName, targetSha256 }
        }

        // 历史遗留的本地差分：先照常本地下发，同时排队补做镜像，之后即可改走 302。
        if (config.uploadDiff || isDataPackDiffStorageConfigured()) {
            const mirrorParams = { patchFile, patchName, patchSize: cachedPatchSize, packageBaseUrl: officialPackageBaseUrl, config }
            scheduleBackgroundTask(getDataPackDiffRecordPath(patchFile), () => mirrorPatchToStorage(mirrorParams))
        }
        return { mode: "patch-local", patchFile, patchName, targetPackageName, targetSha256 }
    }

    // 从未生成过这一对差分：不再等待生成完成，直接让客户端走完整包下载（302）。
    scheduleBackgroundTask(patchFile, () =>
        generatePackageDiffInBackground({
            sourcePackageName,
            sourceUrl,
            targetPackageName,
            targetUrl,
            packageBaseUrl: officialPackageBaseUrl,
            cacheDir,
            patchFile,
            patchName,
            requestFetch,
            config,
        })
    )
    console.log(`${timestamp()} 无已生成差分，直接回退完整包并在后台补生成 - ${patchName}`)
    return { mode: "full", targetPackageName, targetUrl, targetSha256 }
}

export const packageDiffMaxSize = MAX_PATCH_SIZE
