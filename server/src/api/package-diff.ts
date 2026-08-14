import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, parse, resolve } from "node:path"

const MAX_PATCH_SIZE = 2 * 1024 * 1024
const PACKAGE_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]*\.(?:zip|msi)$/i
const DEFAULT_DATA_PACKAGE_BASE_URL = "https://cdn.dna-builder.cn/data-pack/"
const DEFAULT_UPDATE_MANIFEST_URLS = [
    "https://cdn.dna-builder.cn/latest.json",
    "https://github.com/pa001024/dna-builder/releases/latest/download/latest.json",
]

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
    /** 数据包版本列表地址。 */
    dataVersionsUrl?: string
    /** 更新包官方基址。 */
    updatePackageBaseUrl?: string
    /** 更新版本清单地址。 */
    updateManifestUrl?: string
    /** 更新版本清单地址列表。 */
    updateManifestUrls?: string[]
    cacheDir?: string
    createDiff?: (oldFile: string, newFile: string, patchFile: string) => Promise<void>
    fetch?: PackageFetch
    hdiffzPath?: string
    /** @deprecated 使用 dataPackageBaseUrl 或 updatePackageBaseUrl。 */
    officialPackageBaseUrl?: string
    /** @deprecated 使用 dataVersionsUrl 或 updateManifestUrl。 */
    latestPackageUrl?: string
}

export type PackageDiffKind = "data" | "update"

export type PackageDiffResult =
    | { mode: "patch"; patchFile: string; patchName: string; targetPackageName: string; targetSha256: string }
    | { mode: "full"; targetPackageName: string; targetUrl: string; targetSha256: string }

/**
 * 验证并标准化客户端传入的安装包名，避免缓存目录穿越。
 * @param packageName 客户端已有的安装包名。
 * @returns 安全的安装包名。
 */
export function normalizePackageName(packageName: string, extension?: "zip" | "msi") {
    const normalized = basename(packageName)
    const expectedExtension = extension ? new RegExp(`\\.${extension}$`, "i") : PACKAGE_FILE_PATTERN
    if (normalized !== packageName || !expectedExtension.test(normalized)) {
        throw new Error(extension ? `包名必须是 ${extension.toUpperCase()} 文件名` : "包名必须是 ZIP 或 MSI 文件名")
    }
    return normalized
}

/**
 * 读取官方数据包版本列表，定位最新 ZIP 的下载地址。
 * @param config 差分服务配置。
 * @param requestFetch 可替换的 fetch，便于测试。
 * @returns 官方基址与最新数据包地址。
 */
async function resolveDataPackageSource(config: PackageDiffConfig, requestFetch: PackageFetch) {
    const baseUrl = config.dataPackageBaseUrl || process.env.OFFICIAL_DATA_PACK_BASE_URL || DEFAULT_DATA_PACKAGE_BASE_URL
    const versionsUrl = config.dataVersionsUrl || process.env.OFFICIAL_DATA_PACK_VERSIONS_URL || new URL("versions.json", baseUrl).href
    const response = await requestFetch(versionsUrl)
    if (!response.ok) {
        throw new Error(`获取官方数据包版本失败: ${response.status}`)
    }

    const versions = (await response.json()) as { packageFile?: string }[]
    const packageFile = versions.find(item => typeof item.packageFile === "string")?.packageFile
    if (!packageFile) {
        throw new Error("官方数据包版本列表中未找到 ZIP 文件")
    }

    return {
        officialPackageBaseUrl: baseUrl,
        latestPackageUrl: new URL(normalizePackageName(packageFile, "zip"), baseUrl).href,
    }
}

/**
 * 读取官方更新清单，定位 Windows MSI 的下载地址。
 * @param config 差分服务配置。
 * @param requestFetch 可替换的 fetch，便于测试。
 * @returns 官方基址与最新更新包地址。
 */
async function resolveUpdatePackageSource(config: PackageDiffConfig, requestFetch: PackageFetch) {
    const manifestUrls =
        config.updateManifestUrls ||
        process.env.OFFICIAL_UPDATE_MANIFEST_URLS?.split(",")
            .map(url => url.trim())
            .filter(Boolean) ||
        (config.updateManifestUrl || process.env.OFFICIAL_UPDATE_MANIFEST_URL
            ? [config.updateManifestUrl || process.env.OFFICIAL_UPDATE_MANIFEST_URL!]
            : DEFAULT_UPDATE_MANIFEST_URLS)

    for (const manifestUrl of manifestUrls) {
        try {
            const response = await requestFetch(manifestUrl)
            if (!response.ok) {
                continue
            }

            const manifest = (await response.json()) as { platforms?: Record<string, { url?: string }> }
            const packageUrl = manifest.platforms?.["windows-x86_64-msi"]?.url || manifest.platforms?.["windows-x86_64"]?.url
            if (!packageUrl) {
                continue
            }

            const latestPackageUrl = new URL(packageUrl, manifestUrl).href
            normalizePackageName(decodeURIComponent(basename(new URL(latestPackageUrl).pathname)), "msi")
            return {
                officialPackageBaseUrl:
                    config.updatePackageBaseUrl || process.env.OFFICIAL_UPDATE_PACKAGE_BASE_URL || `${dirname(latestPackageUrl)}/`,
                latestPackageUrl,
            }
        } catch {}
    }

    throw new Error("官方更新清单中未找到 Windows MSI 文件")
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
 * 为客户端已有的官方安装包生成到当前官方安装包的差分下载结果。
 * @param packageName 客户端已有的官方安装包名。
 * @param config 差分服务配置。
 * @returns 差分文件或完整下载回退信息。
 */
export async function getPackageDiff(packageName: string, config: PackageDiffConfig = {}): Promise<PackageDiffResult> {
    const officialPackageBaseUrl = config.officialPackageBaseUrl || process.env.OFFICIAL_ZIP_BASE_URL
    const latestPackageUrl = config.latestPackageUrl || process.env.OFFICIAL_ZIP_LATEST_URL
    if (!officialPackageBaseUrl || !latestPackageUrl) {
        throw new Error("未配置官方 ZIP 下载地址")
    }

    const officialBaseUrl = new URL(officialPackageBaseUrl)
    const targetUrl = new URL(latestPackageUrl)
    if (targetUrl.origin !== officialBaseUrl.origin) {
        throw new Error("最新 ZIP 必须来自官方源")
    }

    const sourcePackageName = normalizePackageName(packageName)
    const targetPackageName = normalizePackageName(decodeURIComponent(basename(targetUrl.pathname)))
    const sourceUrl = new URL(sourcePackageName, officialBaseUrl.href.endsWith("/") ? officialBaseUrl : `${officialBaseUrl}/`).href
    const cacheDir = config.cacheDir || process.env.PACKAGE_DIFF_CACHE_DIR || resolve(import.meta.dir, "../../data/package-diff")
    const requestFetch = config.fetch || fetch
    const { feature: sourceFeature, packageFile: sourceFile } = await cacheOfficialPackage(
        sourcePackageName,
        sourceUrl,
        cacheDir,
        requestFetch
    )
    const { feature: targetFeature, packageFile: targetFile } = await cacheOfficialPackage(
        targetPackageName,
        targetUrl.href,
        cacheDir,
        requestFetch
    )

    if (sourceFeature.sha256 === targetFeature.sha256) {
        return { mode: "full", targetPackageName, targetUrl: targetUrl.href, targetSha256: targetFeature.sha256 }
    }

    const patchName = `${parse(sourcePackageName).name}-${parse(targetPackageName).name}.hdiff`
    const patchFile = join(cacheDir, "patches", patchName)
    try {
        const patchSize = (await stat(patchFile)).size
        if (patchSize <= MAX_PATCH_SIZE) {
            return { mode: "patch", patchFile, patchName, targetPackageName, targetSha256: targetFeature.sha256 }
        }
        return { mode: "full", targetPackageName, targetUrl: targetUrl.href, targetSha256: targetFeature.sha256 }
    } catch {}

    await mkdir(join(cacheDir, "patches"), { recursive: true })
    const createDiff =
        config.createDiff ||
        ((oldFile: string, newFile: string, outputFile: string) =>
            createHdiff(oldFile, newFile, outputFile, config.hdiffzPath || process.env.HDIFFZ_PATH || "hdiffz"))
    await createDiff(sourceFile, targetFile, patchFile)
    if ((await stat(patchFile)).size > MAX_PATCH_SIZE) {
        return { mode: "full", targetPackageName, targetUrl: targetUrl.href, targetSha256: targetFeature.sha256 }
    }
    return { mode: "patch", patchFile, patchName, targetPackageName, targetSha256: targetFeature.sha256 }
}

/**
 * 为数据包或桌面更新包生成差分下载结果。
 * @param kind 包类型。
 * @param packageName 客户端已有的官方包名。
 * @param config 差分服务配置。
 * @returns 差分文件或完整下载回退信息。
 */
export async function getOfficialPackageDiff(kind: PackageDiffKind, packageName: string, config: PackageDiffConfig = {}) {
    const requestFetch = config.fetch || fetch
    const source =
        kind === "data" ? await resolveDataPackageSource(config, requestFetch) : await resolveUpdatePackageSource(config, requestFetch)
    const extension = kind === "data" ? "zip" : "msi"
    normalizePackageName(packageName, extension)
    return getPackageDiff(packageName, {
        ...config,
        ...source,
    })
}

export const packageDiffMaxSize = MAX_PATCH_SIZE
