import { decode } from "@msgpack/msgpack"
import { unzipSync } from "fflate"
import { tauriFetch } from "../api/app"
import { hydrateRegisteredDataPackBindings, markDataPackHydrated, resetRegisteredDataPackBindings } from "./data-pack-bridge"
import { mountImgsToVirtualPath } from "./imgs-runtime"

export type DataPackModuleRecord = Record<string, unknown>

export interface DataPackModuleMeta {
    exports: string[]
    hasFunctions: boolean
    hash: string
}

export interface DataPackVersionInfo {
    builtAt: string
    packageFile: string
    version: string
    notes?: string
}

export interface DataPackManifest {
    builtAt: string
    packageFile: string
    version: string
    modules: Record<string, DataPackModuleMeta>
}

export interface DataPackInstallStatus {
    ready: boolean
    version: string | null
    manifest: DataPackManifest | null
    remote: DataPackVersionInfo | null
    versions: DataPackVersionInfo[]
}

export interface DataPackSourceInfo {
    versionsUrl: string
    baseUrl: string
    sourceKind: "official" | "custom"
}

const PACK_ROOT_DIR = "dna-builder-data-pack"
const PACK_BYTES_FILE = "package.zip"
const MANIFEST_FILE = "manifest.json"
const IMGS_MANIFEST_FILE = "imgs.json"
const INSTALL_INFO_FILE = "installed.json"
const CONFIG_FILE = "config.json"
const DEV_BASE_URL = "/mock/data-pack"
const RELEASE_BASE_URL = "https://cdn.dna-builder.cn/data-pack"
const DATA_PACK_VERSIONS_FILE = "versions.json"
const DEFAULT_CUSTOM_BASE_URL = DEV_BASE_URL

type FileSystemDirectoryHandleLike = Awaited<ReturnType<NonNullable<Navigator["storage"]>["getDirectory"]>>

type DataPackState = {
    readyVersion: string | null
    manifest: DataPackManifest | null
    imgsManifest: { path: string; url?: string }[]
    moduleCache: Map<string, DataPackModuleRecord>
}

type RemoteDataPackState = {
    promise: Promise<DataPackVersionInfo[] | null> | null
    hasCached: boolean
    cached: DataPackVersionInfo[] | null
    cachedBaseUrl: string | null
}

type BootstrapDataPackState = {
    started: boolean
    promise: Promise<boolean> | null
}

type DataPackConfig = {
    baseUrl?: string
    sourceKind?: "official" | "custom"
}

const state: DataPackState = {
    readyVersion: null,
    manifest: null,
    imgsManifest: [],
    moduleCache: new Map(),
}

const remoteState: RemoteDataPackState = {
    promise: null,
    hasCached: false,
    cached: null,
    cachedBaseUrl: null,
}

const bootstrapState: BootstrapDataPackState = {
    started: false,
    promise: null,
}

/**
 * 判断当前环境是否支持 OPFS。
 * @returns 是否支持 OPFS
 */
function hasOpfs(): boolean {
    return typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory)
}

/**
 * 获取默认数据包基址。
 * @returns 基础地址
 */
function getDefaultBaseUrl(): string {
    return RELEASE_BASE_URL
}

/**
 * 读取配置。
 * @returns 配置对象
 */
async function readConfig(): Promise<DataPackConfig> {
    if (!hasOpfs()) {
        return {}
    }

    try {
        const root = await getPackRootDirectory()
        const raw = await readTextFile(root, CONFIG_FILE)
        return raw ? (JSON.parse(raw) as DataPackConfig) : {}
    } catch {
        return {}
    }
}

/**
 * 写入配置。
 * @param config 配置对象
 */
async function writeConfig(config: DataPackConfig): Promise<void> {
    const root = await getPackRootDirectory()
    await writeTextFile(root, CONFIG_FILE, JSON.stringify(config, null, 2))
}

/**
 * 获取实际使用的基址。
 * @returns 基础地址
 */
async function getBaseUrl(): Promise<string> {
    const config = await readConfig()
    if ((config.sourceKind || "official") === "custom") {
        return (config.baseUrl || DEFAULT_CUSTOM_BASE_URL).replace(/\/$/, "")
    }

    return getDefaultBaseUrl()
}

/**
 * 解析可用于 fetch 的绝对基址。
 * @param baseUrl 原始基址
 * @returns 绝对基址
 */
function resolveAbsoluteBaseUrl(baseUrl: string): string {
    if (/^https?:\/\//.test(baseUrl)) {
        return baseUrl.replace(/\/$/, "")
    }

    const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost"
    return new URL(`${baseUrl.replace(/^\//, "").replace(/\/$/, "")}/`, origin).toString().replace(/\/$/, "")
}

/**
 * 获取数据包来源信息。
 * @returns 来源信息
 */
export async function getDataPackSourceInfo(): Promise<DataPackSourceInfo> {
    const config = await readConfig()
    const sourceKind = config.sourceKind || "official"
    const baseUrl = resolveAbsoluteBaseUrl(await getBaseUrl())
    return {
        baseUrl,
        versionsUrl: new URL(DATA_PACK_VERSIONS_FILE, `${baseUrl}/`).toString(),
        sourceKind,
    }
}

/**
 * 构造指定版本的数据包地址。
 * @param baseUrl 基础地址
 * @param version 版本号
 * @returns 数据包地址
 */
export function getDataPackPackageUrl(baseUrl: string, version: string): string {
    return new URL(`${version}.zip`, `${baseUrl}/`).toString()
}

/**
 * 设置数据包来源地址。
 * @param baseUrl 新基址
 */
export async function setDataPackSourceBaseUrl(baseUrl: string): Promise<void> {
    await writeConfig({ baseUrl, sourceKind: "custom" })
    remoteState.hasCached = false
    remoteState.cached = null
    remoteState.cachedBaseUrl = null
}

/**
 * 设置数据包来源类型。
 * @param sourceKind 来源类型
 */
export async function setDataPackSourceKind(sourceKind: "official" | "custom"): Promise<void> {
    const config = await readConfig()
    await writeConfig({
        ...config,
        sourceKind,
        baseUrl: sourceKind === "custom" ? config.baseUrl || DEFAULT_CUSTOM_BASE_URL : config.baseUrl,
    })
    remoteState.hasCached = false
    remoteState.cached = null
    remoteState.cachedBaseUrl = null
}

/**
 * 获取 OPFS 根目录。
 * @returns 根目录句柄
 */
async function getRootDirectory(): Promise<FileSystemDirectoryHandleLike> {
    if (!navigator.storage?.getDirectory) {
        throw new Error("当前环境不支持 OPFS")
    }

    return navigator.storage.getDirectory()
}

/**
 * 获取数据包根目录。
 * @returns 数据包根目录句柄
 */
async function getPackRootDirectory(): Promise<FileSystemDirectoryHandleLike> {
    const root = await getRootDirectory()
    return root.getDirectoryHandle(PACK_ROOT_DIR, { create: true })
}

/**
 * 获取版本目录。
 * @param version 版本号
 * @returns 版本目录句柄
 */
async function getVersionDirectory(version: string): Promise<FileSystemDirectoryHandleLike> {
    const root = await getPackRootDirectory()
    return root.getDirectoryHandle(version, { create: true })
}

/**
 * 读取 OPFS 文件内容。
 * @param directory 目录句柄
 * @param fileName 文件名
 * @returns 文件内容；不存在时返回 null
 */
async function readFile(directory: FileSystemDirectoryHandleLike, fileName: string): Promise<Uint8Array | null> {
    try {
        const handle = await directory.getFileHandle(fileName, { create: false })
        const blob = await handle.getFile()
        return new Uint8Array(await blob.arrayBuffer())
    } catch {
        return null
    }
}

/**
 * 从响应流中读取全部字节并汇报进度。
 * @param response 响应对象
 * @param onProgress 进度回调
 * @returns 文件字节
 */
async function readResponseBytes(response: Response, onProgress?: (progress: number) => void): Promise<Uint8Array> {
    const total = Number(response.headers.get("content-length") || 0)

    if (!response.body?.getReader) {
        const bytes = new Uint8Array(await response.arrayBuffer())
        onProgress?.(1)
        return bytes
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0

    for (;;) {
        const { done, value } = await reader.read()
        if (done) {
            break
        }
        if (value) {
            chunks.push(value)
            received += value.byteLength
            if (total > 0) {
                onProgress?.(Math.min(received / total, 1))
            }
        }
    }

    if (chunks.length === 1) {
        onProgress?.(1)
        return chunks[0]
    }

    const bytes = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
    }
    onProgress?.(1)
    return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * 写入 OPFS 文件内容。
 * @param directory 目录句柄
 * @param fileName 文件名
 * @param bytes 文件内容
 */
async function writeFile(directory: FileSystemDirectoryHandleLike, fileName: string, bytes: Uint8Array): Promise<void> {
    const handle = await directory.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(toArrayBuffer(bytes))
    await writable.close()
}

/**
 * 读取 OPFS 文本内容。
 * @param directory 目录句柄
 * @param fileName 文件名
 * @returns 文本内容
 */
async function readTextFile(directory: FileSystemDirectoryHandleLike, fileName: string): Promise<string | null> {
    const bytes = await readFile(directory, fileName)
    return bytes ? new TextDecoder().decode(bytes) : null
}

/**
 * 写入 OPFS 文本内容。
 * @param directory 目录句柄
 * @param fileName 文件名
 * @param content 文本内容
 */
async function writeTextFile(directory: FileSystemDirectoryHandleLike, fileName: string, content: string): Promise<void> {
    await writeFile(directory, fileName, new TextEncoder().encode(content))
}

/**
 * 还原打包时的特殊类型。
 * @param value 打包后的值
 * @returns 还原后的值
 */
function revivePackedValue(value: unknown): unknown {
    if (!value || typeof value !== "object") {
        return value
    }

    if (Array.isArray(value)) {
        return value.map(item => revivePackedValue(item))
    }

    const record = value as Record<string, unknown>
    const kind = record.__dnaPackType

    if (kind === "Undefined") return undefined
    if (kind === "Date" && typeof record.value === "string") return new Date(record.value)
    if (kind === "Set" && Array.isArray(record.value)) return new Set(record.value.map(item => revivePackedValue(item)))
    if (kind === "Map" && Array.isArray(record.value)) {
        return new Map(
            record.value.map(item => {
                const tuple = item as [unknown, unknown]
                return [revivePackedValue(tuple[0]), revivePackedValue(tuple[1])]
            })
        )
    }

    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(record)) {
        if (key === "__dnaPackType") continue
        next[key] = revivePackedValue(item)
    }
    return next
}

/**
 * 从 zip 中提取 manifest 与模块数据。
 * @param bytes 数据包二进制
 * @returns 清单和模块缓存
 */
function decodePack(bytes: Uint8Array): { manifest: DataPackManifest; modules: Map<string, DataPackModuleRecord> } {
    const entries = unzipSync(bytes)
    const manifestBytes = entries[MANIFEST_FILE]
    if (!manifestBytes) {
        throw new Error("数据包缺少 manifest.json")
    }

    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as DataPackManifest
    const modules = new Map<string, DataPackModuleRecord>()

    for (const [entryName, entryBytes] of Object.entries(entries)) {
        if (!entryName.startsWith("modules/") || !entryName.endsWith(".msgpack")) {
            continue
        }

        const moduleKey = entryName.slice("modules/".length, -".msgpack".length)
        modules.set(moduleKey, revivePackedValue(decode(entryBytes)) as DataPackModuleRecord)
    }

    return { manifest, modules }
}

/**
 * 读取包内图片清单。
 * @param bytes 数据包二进制
 * @returns 图片清单
 */
function decodeImgsManifest(bytes: Uint8Array): { path: string; url?: string }[] {
    const entries = unzipSync(bytes)
    const manifestBytes = entries[IMGS_MANIFEST_FILE]
    if (!manifestBytes) {
        return []
    }

    const payload = JSON.parse(new TextDecoder().decode(manifestBytes)) as
        | { files?: { path: string; url?: string }[] }
        | { path: string; url?: string }[]
    return Array.isArray(payload) ? payload : (payload.files ?? [])
}

/**
 * 读取版本信息。
 * @returns 版本信息；不存在时返回 null
 */
async function readInstalledInfo(): Promise<DataPackVersionInfo | null> {
    if (!hasOpfs()) {
        return null
    }

    try {
        const root = await getPackRootDirectory()
        const raw = await readTextFile(root, INSTALL_INFO_FILE)
        return raw ? (JSON.parse(raw) as DataPackVersionInfo) : null
    } catch {
        return null
    }
}

/**
 * 读取指定版本目录下的清单信息。
 * @param version 版本号
 * @returns 版本信息；不存在时返回 null
 */
async function readInstalledVersionInfo(version: string): Promise<DataPackVersionInfo | null> {
    const manifest = await readInstalledManifest(version)
    if (!manifest) {
        return null
    }

    return {
        builtAt: manifest.builtAt,
        packageFile: manifest.packageFile,
        version: manifest.version,
    }
}

/**
 * 读取指定版本目录下的完整清单。
 * @param version 版本号
 * @returns 完整清单；不存在时返回 null
 */
async function readInstalledManifest(version: string): Promise<DataPackManifest | null> {
    try {
        const versionDir = await getVersionDirectory(version)
        const raw = await readTextFile(versionDir, MANIFEST_FILE)
        return raw ? (JSON.parse(raw) as DataPackManifest) : null
    } catch {
        return null
    }
}

/**
 * 扫描本地版本目录。
 * @returns 已安装版本信息列表
 */
async function scanInstalledDataPackVersions(): Promise<DataPackVersionInfo[]> {
    if (!hasOpfs()) {
        return []
    }

    const root = await getPackRootDirectory()
    const installedVersions: DataPackVersionInfo[] = []

    try {
        for await (const [entryName, entry] of root as unknown as AsyncIterable<[string, FileSystemHandle]>) {
            if (
                entryName === CONFIG_FILE ||
                entryName === INSTALL_INFO_FILE ||
                entryName === MANIFEST_FILE ||
                entryName === PACK_BYTES_FILE
            ) {
                continue
            }

            if (entry.kind !== "directory") {
                continue
            }

            const info = await readInstalledVersionInfo(entryName)
            if (info) {
                installedVersions.push(info)
            }
        }
    } catch {
        return []
    }

    installedVersions.sort((a, b) => b.version.localeCompare(a.version, "zh-CN", { numeric: true }))
    return installedVersions
}

/**
 * 写入版本信息。
 * @param info 版本信息
 */
async function writeInstalledInfo(info: DataPackVersionInfo): Promise<void> {
    const root = await getPackRootDirectory()
    await writeTextFile(root, INSTALL_INFO_FILE, JSON.stringify(info, null, 2))
}

/**
 * 读取指定版本的数据包字节。
 * @param version 版本号
 * @returns 包字节
 */
async function readPackBytes(version: string): Promise<Uint8Array | null> {
    const versionDir = await getVersionDirectory(version)
    return readFile(versionDir, PACK_BYTES_FILE)
}

/**
 * 写入指定版本的数据包字节。
 * @param version 版本号
 * @param bytes 包字节
 */
async function writePackBytes(version: string, bytes: Uint8Array): Promise<void> {
    const versionDir = await getVersionDirectory(version)
    await writeFile(versionDir, PACK_BYTES_FILE, bytes)
    const { manifest } = decodePack(bytes)
    await writeFile(versionDir, MANIFEST_FILE, new TextEncoder().encode(JSON.stringify(manifest, null, 2)))
    await writeFile(versionDir, IMGS_MANIFEST_FILE, new TextEncoder().encode(JSON.stringify(decodeImgsManifest(bytes), null, 2)))
}

/**
 * 清空运行时缓存。
 */
function resetState(): void {
    state.readyVersion = null
    state.manifest = null
    state.moduleCache.clear()
}

/**
 * 读取远程版本列表。
 * @param forceRefresh 是否强制刷新
 * @returns 版本列表；失败时返回 null
 */
async function fetchRemoteDataPackVersions(forceRefresh = false): Promise<DataPackVersionInfo[] | null> {
    const source = await getDataPackSourceInfo()

    if (remoteState.cachedBaseUrl !== source.baseUrl) {
        remoteState.hasCached = false
        remoteState.cached = null
        remoteState.cachedBaseUrl = source.baseUrl
    }

    if (!forceRefresh && remoteState.hasCached) {
        return remoteState.cached
    }

    if (remoteState.promise) {
        return remoteState.promise
    }

    remoteState.promise = (async () => {
        try {
            const info = await fetchDataPackVersions(source.versionsUrl)
            info.sort((a, b) => b.version.localeCompare(a.version, "zh-CN", { numeric: true }))
            remoteState.hasCached = true
            remoteState.cached = info
            return info
        } catch {
            remoteState.hasCached = true
            remoteState.cached = null
            return null
        } finally {
            remoteState.promise = null
        }
    })()

    return remoteState.promise
}

/**
 * 读取数据包版本列表，优先使用浏览器 fetch，失败时回退到 tauriFetch。
 * @param versionsUrl 版本列表地址
 * @returns 版本列表
 */
async function fetchDataPackVersions(versionsUrl: string): Promise<DataPackVersionInfo[]> {
    try {
        const response = await fetch(versionsUrl, { cache: "no-store" })
        if (response.ok) {
            return (await response.json()) as DataPackVersionInfo[]
        }
    } catch {}

    const fallbackResponse = await tauriFetch(versionsUrl, { cache: "no-store" })
    if (!fallbackResponse.ok) {
        return []
    }

    return (await fallbackResponse.json()) as DataPackVersionInfo[]
}

/**
 * 从本地缓存加载指定版本。
 * @param version 版本号
 * @returns 是否加载成功
 */
async function loadLocalVersion(version: string): Promise<boolean> {
    const bytes = await readPackBytes(version)
    if (!bytes) {
        return false
    }

    const { manifest, modules } = decodePack(bytes)
    state.readyVersion = version
    state.manifest = manifest
    state.imgsManifest = decodeImgsManifest(bytes)
    state.moduleCache = modules
    hydrateLoadedDataPackBindings()
    return true
}

/**
 * 回填当前已加载的数据包绑定。
 */
function hydrateLoadedDataPackBindings(): void {
    if (!state.readyVersion || !state.manifest) {
        resetRegisteredDataPackBindings()
        return
    }

    for (const [moduleKey, moduleRecord] of state.moduleCache) {
        hydrateRegisteredDataPackBindings(moduleKey, moduleRecord)
    }

    markDataPackHydrated()
}

/**
 * 同步指定模块的已加载绑定。
 * @param moduleKey 模块键
 */
export function syncDataPackModuleBindings(moduleKey: string): void {
    if (!state.readyVersion) {
        return
    }

    const moduleRecord = state.moduleCache.get(moduleKey)
    if (!moduleRecord) {
        return
    }

    hydrateRegisteredDataPackBindings(moduleKey, moduleRecord)
}

/**
 * 确保数据包已准备好。
 * @returns 是否准备成功
 */
export async function ensureDataPackReady(): Promise<boolean> {
    if (!bootstrapState.started) {
        return false
    }

    if (!hasOpfs()) {
        return false
    }

    try {
        const installed = await readInstalledInfo()
        if (!installed?.version) {
            return false
        }

        if (installed.version === state.readyVersion && state.manifest) {
            return true
        }

        return await loadLocalVersion(installed.version)
    } catch (error) {
        console.error("初始化数据包失败:", error)
        return false
    }
}

/**
 * 获取当前安装状态。
 * @param forceRefresh 是否强制刷新远程版本列表
 * @returns 安装状态
 */
export async function getDataPackInstallStatus(forceRefresh = false): Promise<DataPackInstallStatus> {
    const remoteVersions = (await fetchRemoteDataPackVersions(forceRefresh)) ?? []
    const versions = await getMergedDataPackVersions(remoteVersions)
    const installed = await readInstalledInfo()
    const manifest =
        installed?.version && installed.version === state.readyVersion && state.manifest
            ? state.manifest
            : installed?.version
              ? await readInstalledManifest(installed.version)
              : null

    return {
        ready: Boolean(installed && manifest),
        version: installed?.version || null,
        manifest,
        remote: remoteVersions[0] ?? null,
        versions,
    }
}

/**
 * 读取本地已安装数据包版本列表。
 * @param remoteVersions 远端版本列表；用于补充扫描本地文件
 * @returns 已安装版本列表
 */
export async function getInstalledDataPackVersions(remoteVersions: DataPackVersionInfo[] = []): Promise<DataPackVersionInfo[]> {
    const installedVersions = await scanInstalledDataPackVersions()
    const versionMap = new Map(installedVersions.map(version => [version.version, version]))

    for (const remoteVersion of remoteVersions) {
        if (versionMap.has(remoteVersion.version)) {
            versionMap.set(remoteVersion.version, remoteVersion)
        }
    }

    return [...versionMap.values()].sort((a, b) => b.version.localeCompare(a.version, "zh-CN", { numeric: true }))
}

/**
 * 合并远端版本与本地已安装版本，远端信息优先。
 * @param remoteVersions 远端版本列表
 * @returns 合并后的版本列表
 */
export async function getMergedDataPackVersions(remoteVersions: DataPackVersionInfo[] = []): Promise<DataPackVersionInfo[]> {
    const installedVersions = await getInstalledDataPackVersions(remoteVersions)
    const remoteVersionMap = new Map(remoteVersions.map(version => [version.version, version]))
    const mergedVersionMap = new Map<string, DataPackVersionInfo>()

    for (const version of installedVersions) {
        mergedVersionMap.set(version.version, version)
    }

    for (const version of remoteVersions) {
        mergedVersionMap.set(version.version, version)
    }

    const mergedVersions = [...mergedVersionMap.values()]
    mergedVersions.sort((a, b) => b.version.localeCompare(a.version, "zh-CN", { numeric: true }))

    for (const version of mergedVersions) {
        const remote = remoteVersionMap.get(version.version)
        if (remote) {
            version.builtAt = remote.builtAt
            version.packageFile = remote.packageFile
            version.notes = remote.notes
        }
    }

    return mergedVersions
}

/**
 * 切换当前激活的数据包版本。
 * @param version 目标版本
 * @returns 当前安装状态
 */
export async function setActiveDataPackVersion(version: string): Promise<DataPackInstallStatus> {
    const installedVersions = await getInstalledDataPackVersions()
    const active = installedVersions.find(item => item.version === version)
    if (!active) {
        throw new Error(`未找到已安装的数据包版本: ${version}`)
    }

    await writeInstalledInfo(active)
    await loadLocalVersion(version)
    return getDataPackInstallStatus()
}

/**
 * 卸载指定数据包版本。
 * @param version 目标版本
 */
export async function removeInstalledDataPackVersion(version: string): Promise<void> {
    if (!hasOpfs()) {
        return
    }

    const root = await getPackRootDirectory()
    try {
        await root.removeEntry(version, { recursive: true })
    } catch {}

    const installed = await readInstalledInfo()
    if (installed?.version === version) {
        const remainingVersions = await getInstalledDataPackVersions()
        if (remainingVersions[0]) {
            await writeInstalledInfo(remainingVersions[0])
            await loadLocalVersion(remainingVersions[0].version)
        } else {
            try {
                await root.removeEntry(INSTALL_INFO_FILE)
            } catch {}
            resetState()
        }
    }
}

/**
 * 下载并安装数据包。
 * @param version 目标版本；不传时下载远端列表中的最新版本
 * @returns 安装状态
 */
export async function downloadDataPack(version?: string, onProgress?: (progress: number) => void): Promise<DataPackInstallStatus> {
    const remoteVersions = (await fetchRemoteDataPackVersions(true)) ?? []
    const remote = version
        ? (remoteVersions.find(item => item.version === version) ?? {
              builtAt: new Date().toISOString(),
              packageFile: `${version}.zip`,
              version,
          })
        : remoteVersions[0]
    if (!remote) {
        throw new Error("无法获取数据包版本信息")
    }

    const source = await getDataPackSourceInfo()
    const response = await fetch(getDataPackPackageUrl(source.baseUrl, remote.version), { cache: "no-store" })
    if (!response.ok) {
        throw new Error(`下载数据包失败: ${response.status} ${response.statusText}`)
    }

    const bytes = await readResponseBytes(response, onProgress)
    await writePackBytes(remote.version, bytes)
    await writeInstalledInfo(remote)
    await loadLocalVersion(remote.version)
    const versions = await getMergedDataPackVersions(remoteVersions)
    if (state.imgsManifest.length) {
        void mountImgsToVirtualPath({
            manifest: state.imgsManifest,
        }).catch(error => {
            console.error("下载数据包后预热图片失败", error)
        })
    }
    return {
        ready: true,
        version: remote.version,
        manifest: state.manifest,
        remote,
        versions,
    }
}

/**
 * 导入本地数据包文件。
 * @param file 数据包文件
 * @returns 安装状态
 */
export async function importDataPackFile(file: File): Promise<DataPackInstallStatus> {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { manifest } = decodePack(bytes)
    await writePackBytes(manifest.version, bytes)
    await writeInstalledInfo({
        builtAt: manifest.builtAt,
        packageFile: manifest.packageFile,
        version: manifest.version,
    })
    await loadLocalVersion(manifest.version)
    const remoteVersions = (await fetchRemoteDataPackVersions(true)) ?? []
    const versions = await getMergedDataPackVersions(remoteVersions)
    return {
        ready: true,
        version: manifest.version,
        manifest,
        remote: {
            builtAt: manifest.builtAt,
            packageFile: manifest.packageFile,
            version: manifest.version,
        },
        versions,
    }
}

/**
 * 删除当前安装的数据包。
 */
export async function deleteDataPack(): Promise<void> {
    if (!hasOpfs()) {
        return
    }

    const root = await getRootDirectory()
    try {
        await root.removeEntry(PACK_ROOT_DIR, { recursive: true })
    } catch {}

    resetState()
}

/**
 * 清空所有数据包相关 OPFS 数据。
 */
export async function clearAllDataPackOpfs(): Promise<void> {
    await deleteDataPack()
}

/**
 * 读取指定版本的数据包文件字节。
 * @param version 版本号
 * @returns 数据包字节
 */
export async function exportDataPackVersionFile(version: string): Promise<Uint8Array> {
    const bytes = await readPackBytes(version)
    if (!bytes) {
        throw new Error(`当前版本文件缺失: ${version}`)
    }

    return bytes
}

/**
 * 获取当前已加载清单。
 * @returns 清单
 */
export function getLoadedDataPackManifest(): DataPackManifest | null {
    return state.manifest
}

/**
 * 获取当前已加载的图片清单。
 * @returns 图片清单
 */
export function getLoadedDataPackImgsManifest(): { path: string; url?: string }[] {
    return state.imgsManifest
}

/**
 * 读取指定模块。
 * @param moduleKey 模块键
 * @returns 模块导出记录
 */
export async function loadDataPackModule(moduleKey: string): Promise<DataPackModuleRecord> {
    if (!state.readyVersion) {
        await ensureDataPackReady()
    }

    if (!state.readyVersion) {
        return {}
    }

    const cached = state.moduleCache.get(moduleKey)
    if (cached) {
        return cached
    }

    const bytes = await readPackBytes(state.readyVersion)
    if (!bytes) {
        return {}
    }

    const { modules } = decodePack(bytes)
    const moduleRecord = modules.get(moduleKey)
    if (!moduleRecord) {
        return {}
    }

    state.moduleCache.set(moduleKey, moduleRecord)
    return moduleRecord
}

/**
 * 读取指定模块导出。
 * @param moduleKey 模块键
 * @param exportName 导出名
 * @returns 导出值
 */
export async function loadDataPackExport<T>(moduleKey: string, exportName: string): Promise<T> {
    const moduleRecord = await loadDataPackModule(moduleKey)
    return moduleRecord[exportName] as T
}

/**
 * 初始化数据包。
 * @returns 初始化结果
 */
export async function bootstrapDataPack(): Promise<{ ready: boolean; manifest: DataPackManifest | null }> {
    bootstrapState.started = true

    if (bootstrapState.promise) {
        const ready = await bootstrapState.promise
        return {
            ready,
            manifest: getLoadedDataPackManifest(),
        }
    }

    bootstrapState.promise = ensureDataPackReady()
    const ready = await bootstrapState.promise
    bootstrapState.promise = null
    return {
        ready,
        manifest: getLoadedDataPackManifest(),
    }
}
