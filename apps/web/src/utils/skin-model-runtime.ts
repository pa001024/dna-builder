import { ref } from "vue"
import { buildCdnUrl, getOtherCdnBase } from "./cdn"

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
    name: string
    file: string
    bytes: number
    hash: string
    builtAt: string
}

/** 皮肤条目：按顺序引用部件名，并携带皮肤级染色元数据与展示动画 */
export type SkinEntry = {
    id: string
    parts: string[]
    meta?: Record<string, any>
    /** 展示动画文件名（绑定骨骼名，合并后再绑回节点） */
    animation?: string
    animationBytes?: number
}

export type ModelManifest = {
    builtAt: string
    parts: ModelPartEntry[]
    skins: SkinEntry[]
}

/** 下载阶段：查清单 / 下部件 / 合并 / 完成 */
export type ModelDownloadStage = "manifest" | "model" | "ready" | "error"
export type ModelDownloadState = {
    active: boolean
    stage: ModelDownloadStage
    /** 当前皮肤 id */
    id: string
    /** 已下载字节 */
    loaded: number
    /** 总字节；清单还没拿到时为 0 */
    total: number
    /** 实时速度（字节/秒） */
    speedBps: number
    /** 失败原因 */
    error: string
}

export const modelDownloadState = ref<ModelDownloadState>({
    active: false,
    stage: "manifest",
    id: "",
    loaded: 0,
    total: 0,
    speedBps: 0,
    error: "",
})

/** 已解析的清单缓存（按基址） */
const manifestCache = new Map<string, ModelManifest>()
/** 已下载部件的字节，按 `<部件名>@<哈希>` 索引；多个皮肤共用同一体型时只下一次 */
const partCache = new Map<string, Uint8Array>()
/** 已拼好的完整模型对象 URL，避免重复解析 */
const modelCache = new Map<string, string>()

/**
 * @description 判断是否走本地 mock（开发服务器）。
 * @returns 是否使用开发基址
 */
function isDev(): boolean {
    return Boolean(import.meta.env.DEV)
}

/**
 * @description 取兜底基址：开发环境走 vite 的 mock 中间件，线上是主 CDN 加另一侧 CDN。
 * @returns 基址列表（无尾斜杠）
 */
function fallbackBases(): string[] {
    if (isDev()) return [DEV_BASE_URL]
    const primary = buildCdnUrl(REMOTE_PREFIX).replace(/\/$/, "")
    const alternate = `${getOtherCdnBase()}/${REMOTE_PREFIX}`.replace(/\/$/, "")
    return alternate === primary ? [primary] : [primary, alternate]
}

/**
 * @description 更新下载状态。
 * @param patch 增量
 */
function patch(patch: Partial<ModelDownloadState>): void {
    modelDownloadState.value = { ...modelDownloadState.value, ...patch }
}

/**
 * @description 重置下载状态。
 */
export function resetModelDownloadState(): void {
    modelDownloadState.value = { active: false, stage: "manifest", id: "", loaded: 0, total: 0, speedBps: 0, error: "" }
}

/**
 * @description 标记为「正在解析」：打开本地 GLB 时没有下载阶段，
 * 进度条应直接显示解析态而不是停在「正在下载」。
 */
export function markModelParsing(): void {
    patch({ active: true, stage: "ready", loaded: 0, total: 0, speedBps: 0, error: "" })
}

/**
 * @description 拉取模型清单；开发与线上都先读清单才知道该下哪个文件、多大。
 * @returns 清单
 * @throws 所有源都失败时抛错
 */
export async function fetchModelManifest(): Promise<ModelManifest> {
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
        } catch {
            // 换下一个源
        }
    }
    throw new Error("无法获取模型清单")
}

/**
 * @description 在清单里按皮肤 id 找部件组合。
 * @param manifest 清单
 * @param id 皮肤 id
 * @returns 皮肤条目；不存在时 undefined
 */
export function findSkin(manifest: ModelManifest, id: number | string): SkinEntry | undefined {
    return manifest.skins.find(entry => entry.id === String(id))
}

/**
 * @description 在清单里按名字找部件。
 * @param manifest 清单
 * @param name 部件名
 * @returns 部件条目；不存在时 undefined
 */
export function findPart(manifest: ModelManifest, name: string): ModelPartEntry | undefined {
    return manifest.parts.find(entry => entry.name === name)
}

/**
 * @description 读取带进度的响应体。
 * @param response 响应
 * @param onProgress 进度回调
 * @returns 完整字节
 */
async function readWithProgress(
    response: Response,
    onProgress: (loaded: number, total: number, speedBps: number) => void
): Promise<Uint8Array> {
    const total = Number(response.headers.get("content-length") || 0)
    const startedAt = performance.now()
    if (!response.body?.getReader) {
        const bytes = new Uint8Array(await response.arrayBuffer())
        onProgress(bytes.byteLength, total || bytes.byteLength, 0)
        return bytes
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        chunks.push(value)
        loaded += value.byteLength
        const elapsed = (performance.now() - startedAt) / 1000
        onProgress(loaded, total, elapsed > 0 ? loaded / elapsed : 0)
    }
    const bytes = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
    }
    return bytes
}

/**
 * @description 从 Cache Storage 取已缓存部件。
 * @param key 缓存键（部件名@哈希）
 * @returns 缓存命中时的字节
 */
async function readCache(key: string): Promise<Uint8Array | undefined> {
    if (typeof caches === "undefined") return undefined
    try {
        const cache = await caches.open(CACHE_NAME)
        const hit = await cache.match(key)
        if (!hit) return undefined
        return new Uint8Array(await hit.arrayBuffer())
    } catch {
        return undefined
    }
}

/**
 * @description 写入 Cache Storage。
 * @param key 缓存键（部件名@哈希）
 * @param bytes 内容
 */
async function writeCache(key: string, bytes: Uint8Array): Promise<void> {
    if (typeof caches === "undefined") return
    try {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(key, new Response(bytes.slice(), { headers: { "content-type": "model/gltf-binary" } }))
    } catch {
        // 配额不足等失败不影响本次使用
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

/**
 * @description 下载一个文件（部件或动画），带缓存与进度。
 * @param file 文件名
 * @param cacheKey 缓存键
 * @param bytesHint 清单里的字节数
 * @param base 资源基址
 * @param onProgress 进度回调
 * @param signal 中止信号
 * @returns 文件字节
 */
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
    const bytes = await readWithProgress(response, loaded => onProgress(loaded))
    if (!isGlb(response, bytes)) throw new Error(`${file} 不是 GLB`)
    await writeCache(cacheKey, bytes)
    partCache.set(cacheKey, bytes)
    return bytes
}

/**
 * @description 下载单个部件：先查内存、再查 Cache Storage，最后才走网络。
 * @param manifest 清单
 * @param name 部件名
 * @param base 资源基址
 * @param onProgress 进度回调
 * @param signal 中止信号
 * @returns 部件字节
 */
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
 * @description 进度泵：把真实字节数按「最短展示时长」的缓动曲线摊开。
 * 本地 mock 与缓存命中时数据瞬间到齐，没有它进度条会一闪而过（甚至来不及渲染），
 * 所以即使下载已经完成，也让进度条按固定节奏走完一遍。
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

/**
 * @description 下载指定皮肤的部件并拼成完整模型，返回可直接交给 GLTFLoader 的 URL。
 * 命中内存或 Cache Storage 的部件不会产生网络请求；多个皮肤共用的体型只会下一次。
 * @param id 皮肤 id
 * @param signal 中止信号
 * @returns 模型 URL（blob:）
 */
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
    const cached = modelCache.get(cacheKey)

    patch({ active: true, stage: "model", id: key, loaded: 0, total, speedBps: 0, error: "" })
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
                const downloaded = await Promise.all(
                    skin.parts.map(name => downloadPart(manifest, name, base, value => report(name, value), signal))
                )
                // 动画单独一个文件：绑定的是骨骼名，合并完成后再绑回节点
                if (skin.animation)
                    animationBytes = await downloadFile(
                        skin.animation,
                        // 动画文件名固定为 `<id>.anim.glb`，缓存键必须带上字节数，否则更新后仍命中旧缓存
                        `anim:${skin.animation}@${skin.animationBytes ?? 0}`,
                        skin.animationBytes ?? 0,
                        base,
                        value => report("animation", value),
                        signal
                    )
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
        modelCache.set(cacheKey, blobUrl)
        return blobUrl
    } catch (error) {
        pump.stop()
        patch({ stage: "error", error: error instanceof Error ? error.message : String(error) })
        throw error
    }
}

/**
 * @description 清空模型缓存（内存与 Cache Storage）。
 */
export async function clearModelCache(): Promise<void> {
    for (const url of modelCache.values()) URL.revokeObjectURL(url)
    modelCache.clear()
    partCache.clear()
    if (typeof caches !== "undefined") {
        try {
            await caches.delete(CACHE_NAME)
        } catch {}
    }
}
