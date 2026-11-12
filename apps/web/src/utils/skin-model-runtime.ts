import { ref } from "vue"
import { buildCdnUrl, getOtherCdnBase, readResponseBytesWithProgress } from "./cdn"

/**
 * 3D 皮肤模型运行时：按皮肤清单下载**部件**，在浏览器里拼成完整模型。
 *
 * 游戏里的皮肤是「公共体型 + 角色头发/脸」拼出来的，同一个体型被几十个皮肤复用。
 * 因此发布侧按网格拆成部件去重，这里按清单只下载该皮肤缺的那几个部件，再按顺序合并。
 * 部件缓存在内存与 Cache Storage，第二个共用同一体型的皮肤不会再下载体型。
 */

const REMOTE_PREFIX = "models"
const MANIFEST_FILE = "manifest.json"
/** 开发环境由 vite 把 `mock/models` 挂到该路径 */
const DEV_BASE_URL = "/mock/models"
const CACHE_NAME = "dna-builder-models"
/**
 * 进度条最短展示时长。
 * 本地 mock 与 Cache Storage 命中时数据瞬间到齐，不铺一段节奏的话进度条
 * 会在同一帧内从 0 跳到 100%，用户只能看到画面突然出现。
 */
const MIN_PROGRESS_MS = 900

/** 部件条目：一个网格一份文件，多个皮肤共用 */
export type ModelPartEntry = {
    /** 部件名（网格名，例如 `QNF00_TP01_SM`），也是文件名 */
    name: string
    /** 远端对象 key，相对 `models/` 前缀 */
    file: string
    /** 压缩后字节数 */
    bytes: number
    /** 压缩后内容哈希：变了才需要重新下载 */
    hash: string
    builtAt: string
}

/** 皮肤条目：按顺序引用部件名，并携带皮肤级染色元数据与展示动画 */
export type SkinEntry = {
    /** 皮肤 id */
    id: string
    /** 组成该皮肤的部件名，顺序与游戏里的 `PartModelsId` 一致（体型在前、脸在后） */
    parts: string[]
    /**
     * 皮肤级染色元数据（部件名、丝袜白名单…）。
     * 每个部件都带着同一份，若留在部件里会被重复打包 N 次，这里提到清单只存一份。
     * 色板表不在这里：它来自数据包（`skin-colorize.data.ts`），各皮肤完全一致。
     */
    meta?: Record<string, unknown>
    /** 展示待机动画文件名；动画绑定骨骼名，合并完成后再绑回节点 */
    animation?: string
    /** 动画文件字节数 */
    animationBytes?: number
    /** 动画内容哈希：与部件同口径，变了才需要重新下载 */
    animationHash?: string
}

export type ModelManifest = {
    builtAt: string
    /** 部件表：按名字索引，多个皮肤共用 */
    parts: ModelPartEntry[]
    /** 皮肤 → 部件组合 */
    skins: SkinEntry[]
}

/** 下载阶段：查清单 / 下部件 / 合并 / 完成 */
export type ModelDownloadStage = "manifest" | "model" | "ready" | "error"
export type ModelDownloadState = {
    stage: ModelDownloadStage
    /** 已下载字节 */
    loaded: number
    /** 总字节；清单还没拿到时为 0 */
    total: number
    /** 实时速度（字节/秒） */
    speedBps: number
}

export const modelDownloadState = ref<ModelDownloadState>({
    stage: "manifest",
    loaded: 0,
    total: 0,
    speedBps: 0,
})

/** 已解析的清单缓存（按基址） */
const manifestCache = new Map<string, ModelManifest>()
/** 已下载部件的字节，按 `<部件名>@<哈希>` 索引；多个皮肤共用同一体型时只下一次 */
const partCache = new Map<string, Uint8Array>()
/** 已拼好的完整模型对象 URL，避免重复解析；LRU 上限防止逐皮肤累积 Blob */
const MODEL_CACHE_LIMIT = 8
const modelCache = new Map<string, string>()

function modelCacheSet(key: string, url: string): void {
    if (modelCache.has(key)) modelCache.delete(key)
    modelCache.set(key, url)
    while (modelCache.size > MODEL_CACHE_LIMIT) {
        const oldest = modelCache.keys().next().value!
        URL.revokeObjectURL(modelCache.get(oldest)!)
        modelCache.delete(oldest)
    }
}

/** 命中即提升到最新位，让淘汰落在真正的最久未用项上（get 不会改顺序的话只是 FIFO）。 */
function modelCacheGet(key: string): string | undefined {
    const url = modelCache.get(key)
    if (url !== undefined) modelCacheSet(key, url)
    return url
}

function isDev(): boolean {
    return Boolean(import.meta.env.DEV)
}

function fallbackBases(): string[] {
    if (isDev()) return [DEV_BASE_URL]
    const primary = buildCdnUrl(REMOTE_PREFIX).replace(/\/$/, "")
    const alternate = `${getOtherCdnBase()}/${REMOTE_PREFIX}`.replace(/\/$/, "")
    return alternate === primary ? [primary] : [primary, alternate]
}

function patch(patch: Partial<ModelDownloadState>): void {
    modelDownloadState.value = { ...modelDownloadState.value, ...patch }
}

export function resetModelDownloadState(): void {
    modelDownloadState.value = { stage: "manifest", loaded: 0, total: 0, speedBps: 0 }
}

export function markModelParsing(): void {
    patch({ stage: "ready", loaded: 0, total: 0, speedBps: 0 })
}

/** 拉取模型清单：先读清单才知道该下哪个文件、多大；所有源都失败时抛错。 */
async function fetchModelManifest(): Promise<ModelManifest> {
    const bases = fallbackBases()
    for (const base of bases) {
        const cached = manifestCache.get(base)
        if (cached) return cached
        try {
            const response = await fetch(`${base}/${MANIFEST_FILE}`, { cache: "no-store" })
            if (!response.ok) continue
            const manifest = (await response.json()) as ModelManifest
            if (!Array.isArray(manifest?.parts) || !Array.isArray(manifest?.skins)) continue
            manifestCache.set(base, manifest)
            return manifest
        } catch (error) {
            console.warn(`模型清单源失败，换下一个源: ${base}`, error)
        }
    }
    throw new Error("无法获取模型清单")
}

function findSkin(manifest: ModelManifest, id: number | string): SkinEntry | undefined {
    return manifest.skins.find(entry => entry.id === String(id))
}

function findPart(manifest: ModelManifest, name: string): ModelPartEntry | undefined {
    return manifest.parts.find(entry => entry.name === name)
}

async function readCache(key: string): Promise<Uint8Array | undefined> {
    if (typeof caches === "undefined") return undefined
    try {
        const cache = await caches.open(CACHE_NAME)
        const hit = await cache.match(key)
        if (!hit) return undefined
        return new Uint8Array(await hit.arrayBuffer())
    } catch (error) {
        console.warn(`模型部件缓存读取失败: ${key}`, error)
        return undefined
    }
}

async function writeCache(key: string, bytes: Uint8Array): Promise<void> {
    if (typeof caches === "undefined") return
    try {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(key, new Response(bytes.slice(), { headers: { "content-type": "model/gltf-binary" } }))
    } catch (error) {
        console.warn(`模型部件缓存写入失败（不影响本次使用）: ${key}`, error)
    }
}

/**
 * @description 校验响应确实是 GLB：开发服务器的 SPA fallback 对缺失文件也回 200 + HTML，
 * 不拦住的话整页 HTML 会被当成模型交给解析器。
 * @param response 响应
 * @param bytes 已读字节
 * @returns 是否为合法 GLB
 */
export function isGlb(response: Response, bytes: Uint8Array): boolean {
    if (bytes.byteLength < 12) return false
    if (response.headers.get("content-type")?.includes("text/html")) return false
    // GLB 魔数 "glTF"，版本号紧随其后
    return bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46
}

async function downloadFile(
    file: string,
    cacheKey: string,
    bytesHint: number,
    base: string,
    onProgress: (loaded: number) => void,
    signal?: AbortSignal
): Promise<Uint8Array> {
    const cached = partCache.get(cacheKey)
    if (cached) {
        onProgress(bytesHint)
        return cached
    }
    const fromCache = await readCache(cacheKey)
    if (fromCache) {
        partCache.set(cacheKey, fromCache)
        onProgress(bytesHint)
        return fromCache
    }
    const response = await fetch(`${base}/${file}`, { signal })
    if (!response.ok) throw new Error(`${file} 下载失败（${response.status}）`)
    const bytes = await readResponseBytesWithProgress(response, ({ bytesDownloaded }) => onProgress(bytesDownloaded))
    if (!isGlb(response, bytes)) throw new Error(`${file} 不是 GLB`)
    void writeCache(cacheKey, bytes)
    partCache.set(cacheKey, bytes)
    return bytes
}

async function downloadPart(
    manifest: ModelManifest,
    name: string,
    base: string,
    onProgress: (loaded: number) => void,
    signal?: AbortSignal
): Promise<Uint8Array> {
    const entry = findPart(manifest, name)
    if (!entry) throw new Error(`清单中没有部件 ${name}`)
    // 缓存键带上内容哈希：部件更新后旧缓存自然失效，不会被同名文件命中
    return downloadFile(entry.file, `${name}@${entry.hash}`, entry.bytes, base, onProgress, signal)
}

/**
 * 进度泵：本地 mock 与缓存命中时数据瞬间到齐，没有它进度条会一闪而过；
 * 按「最短展示时长」的缓动曲线把真实字节数摊开展示。
 */
function createProgressPump(total: number): { report: (loaded: number) => void; finish: () => Promise<void>; stop: () => void } {
    const startedAt = performance.now()
    let real = 0
    const tick = () => {
        const elapsed = performance.now() - startedAt
        // 缓动曲线：前段快、尾段慢，观感接近真实下载
        const ratio = Math.min(1, elapsed / MIN_PROGRESS_MS)
        const eased = 1 - (1 - ratio) ** 2
        // 取小值：显示进度既不超前于真实字节，也不快于缓动曲线。
        // 本地 mock 会在 50ms 内下完，取大值会让进度条瞬间跳到 100% 再干等，等于没有动画。
        const shown = Math.min(real, total * eased)
        patch({ loaded: Math.round(shown), speedBps: elapsed > 0 ? Math.round(shown / (elapsed / 1000)) : 0 })
    }
    const timer = setInterval(tick, 50)
    tick()
    return {
        report(loaded: number) {
            real = Math.max(real, Math.min(loaded, total))
            tick()
        },
        async finish() {
            const remaining = MIN_PROGRESS_MS - (performance.now() - startedAt)
            if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining))
            clearInterval(timer)
            patch({ loaded: total, total })
        },
        stop() {
            clearInterval(timer)
        },
    }
}

/** 下载指定皮肤的部件并拼成完整模型，返回可直接交给 GLTFLoader 的 URL（blob:）。 */
export async function downloadModel(id: number | string, signal?: AbortSignal): Promise<string> {
    const key = String(id)
    const manifest = await fetchModelManifest()
    const skin = findSkin(manifest, key)
    if (!skin) throw new Error(`清单中没有模型 ${key}`)
    const entries = skin.parts.map(name => findPart(manifest, name)).filter((entry): entry is ModelPartEntry => Boolean(entry))
    if (!entries.length) throw new Error(`模型 ${key} 没有可用部件`)
    const total = entries.reduce((sum, entry) => sum + entry.bytes, 0) + (skin.animationBytes ?? 0)
    // 合并结果按「皮肤 id + 全部部件哈希」缓存：任一部件变了都要重新合并
    const cacheKey = `${key}@${entries.map(entry => entry.hash).join(".")}`
    const cached = modelCacheGet(cacheKey)

    patch({ stage: "model", loaded: 0, total, speedBps: 0 })
    const pump = createProgressPump(total)
    if (cached) {
        // 已合并过也要走一遍下载进度：命中缓存时切到解析态，用户看到的是「正在解析」而不是画面突然出现
        await pump.finish()
        patch({ stage: "ready", loaded: total, total })
        return cached
    }

    const bases = fallbackBases()
    const loaded = new Map<string, number>()
    const report = (name: string, value: number) => {
        loaded.set(name, value)
        let sum = 0
        for (const value of loaded.values()) sum += value
        pump.report(sum)
    }

    try {
        let parts: Uint8Array[] | undefined
        let animationBytes: Uint8Array | undefined
        let lastError: unknown
        for (const base of bases) {
            try {
                // 动画与部件同批下载：单独一个文件，绑定的是骨骼名，合并完成后再绑回节点。
                // 缓存键必须带上字节数，否则更新后仍命中旧缓存。
                const [downloaded, animation] = await Promise.all([
                    Promise.all(skin.parts.map(name => downloadPart(manifest, name, base, value => report(name, value), signal))),
                    skin.animation
                        ? downloadFile(
                              skin.animation,
                              `anim:${skin.animation}@${skin.animationHash ?? skin.animationBytes ?? 0}`,
                              skin.animationBytes ?? 0,
                              base,
                              value => report("animation", value),
                              signal
                          )
                        : Promise.resolve(undefined),
                ])
                animationBytes = animation
                parts = downloaded
                break
            } catch (error) {
                if (signal?.aborted) throw error
                lastError = error
                // 换下一个源重试整组部件（已缓存的部件不会重复下载）
            }
        }
        if (!parts) throw lastError ?? new Error("模型下载失败")

        await pump.finish()
        patch({ stage: "ready", loaded: total, total })
        const { mergeGlbs, readGlb, writeGlb } = await import("@/utils/skin-model-glb")
        const documents = parts.map(bytes => readGlb(bytes))
        const merged = mergeGlbs(documents)
        // 皮肤级元数据只存在清单里（每个部件带一份会重复打包 N 次），拼好后再挂回去。
        // 色板表不在这里：它是全局数据，渲染器从数据包补。
        if (skin.meta) merged.json.extras = { dnaColorize: skin.meta }
        if (animationBytes) {
            const { rebindAnimation } = await import("@/utils/skin-model-parts")
            rebindAnimation(merged, readGlb(animationBytes))
        }
        const bytes = writeGlb(merged)
        const blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "model/gltf-binary" }))
        modelCacheSet(cacheKey, blobUrl)
        return blobUrl
    } catch (error) {
        pump.stop()
        patch({ stage: "error" })
        throw error
    }
}
