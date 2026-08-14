import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { basename, join, parse, resolve } from "node:path"

const MAX_PATCH_SIZE = 2 * 1024 * 1024
const PACKAGE_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]*\.zip$/i
const DEFAULT_DATA_PACKAGE_BASE_URL = "https://cdn.dna-builder.cn/data-pack/"

type PackageFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

type PackageFeature = {
    packageName: string
    url: string
    size: number
    sha256: string
}

export type PackageDiffConfig = {
    /** 数据包官方基址。 */
    dataPackageBaseUrl?: string
    cacheDir?: string
    createDiff?: (oldFile: string, newFile: string, patchFile: string) => Promise<void>
    fetch?: PackageFetch
    hdiffzPath?: string
}

export type PackageDiffResult =
    | { mode: "patch"; patchFile: string; patchName: string; targetPackageName: string; targetSha256: string }
    | { mode: "full"; targetPackageName: string; targetUrl: string; targetSha256: string }

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
 * 为客户端已有的旧官方数据包生成到指定新官方数据包的差分下载结果。
 * @param oldPackageName 客户端已有的旧官方数据包名。
 * @param newPackageName 目标新官方数据包名。
 * @param config 差分服务配置。
 * @returns 差分文件或完整下载回退信息。
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
    const sourceUrl = new URL(sourcePackageName, officialBaseUrl.href.endsWith("/") ? officialBaseUrl : `${officialBaseUrl}/`).href
    const targetUrl = new URL(targetPackageName, officialBaseUrl.href.endsWith("/") ? officialBaseUrl : `${officialBaseUrl}/`).href
    if (new URL(targetUrl).origin !== officialBaseUrl.origin) {
        throw new Error("目标 ZIP 必须来自官方源")
    }
    const cacheDir = config.cacheDir || process.env.PACKAGE_DIFF_CACHE_DIR || resolve(import.meta.dir, "../../data/package-diff")
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
    const timestamp = () => new Date().toLocaleString()

    if (sourceFeature.sha256 === targetFeature.sha256) {
        return { mode: "full", targetPackageName, targetUrl, targetSha256: targetFeature.sha256 }
    }

    const patchName = `${parse(sourcePackageName).name}-${parse(targetPackageName).name}.hdiff`
    const patchFile = join(cacheDir, "patches", patchName)
    try {
        const patchSize = (await stat(patchFile)).size
        if (patchSize <= MAX_PATCH_SIZE) {
            return { mode: "patch", patchFile, patchName, targetPackageName, targetSha256: targetFeature.sha256 }
        }
        return { mode: "full", targetPackageName, targetUrl, targetSha256: targetFeature.sha256 }
    } catch {}

    await mkdir(join(cacheDir, "patches"), { recursive: true })
    const createDiff =
        config.createDiff ||
        ((oldFile: string, newFile: string, outputFile: string) =>
            createHdiff(oldFile, newFile, outputFile, config.hdiffzPath || process.env.HDIFFZ_PATH || "hdiffz"))
    console.log(`${timestamp()} 开始生成差分 - ${sourcePackageName} -> ${targetPackageName}`)
    await createDiff(sourceFile, targetFile, patchFile)
    const newPatchSize = (await stat(patchFile)).size
    console.log(`${timestamp()} 差分生成完成 - ${patchName}, 大小: ${newPatchSize} 字节`)
    if (newPatchSize > MAX_PATCH_SIZE) {
        console.log(`${timestamp()} 新差分过大回退完整包 - ${patchName}, 大小: ${newPatchSize} 字节`)
        return { mode: "full", targetPackageName, targetUrl, targetSha256: targetFeature.sha256 }
    }
    return { mode: "patch", patchFile, patchName, targetPackageName, targetSha256: targetFeature.sha256 }
}

export const packageDiffMaxSize = MAX_PATCH_SIZE
