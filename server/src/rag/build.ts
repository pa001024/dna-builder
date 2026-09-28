/**
 * 服务端 RAG 索引的自动构建。
 *
 * 分工：
 * 1. 启动：warmCurrentFingerprints 装配一次各语言语料、算出「当前数据指纹」并缓存，索引落后的语言排队重建；
 * 2. 请求：只做内存里的指纹比较（resolveIndexFingerprint），不装配语料；
 * 3. 构建：单飞后台任务（失败冷却 5 分钟），只处理「确实落后于当前数据」的语言。
 *
 * 构建在线上库的单个事务里进行（BEGIN → 写入 → 自检 → COMMIT）：
 * - 增量：按「锚点 + 正文指纹」比对，未变化的向量直接复用，同文语料经嵌入缓存只向量化一次；
 * - 回收：按种类指纹 GC，同一语言只留最新一代；全量重建时清空全部语言表；
 * - 并发：跨进程锁文件互斥（DuckDB 单写者，并发构建会损坏库文件）。
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { buildRagChunks, type RagFingerprintInfo } from "../../../src/data/rag/corpus"
import { RAG_CHUNK_SCHEMA_VERSION, type RagChunk, type RagKindFingerprintMap, ragKindFingerprints } from "../../../src/data/rag/types"
import { deleteDocuments, insertDocuments, resolveDashVectorConfig } from "./dashvector"
import {
    LOCAL_VECTOR_STORE_TAG,
    openIndexForBuild,
    RAG_INDEX_SCHEMA_VERSION,
    type RagIndexMeta,
    type RagVectorRow,
    readExistingHashesAt,
    readMetaAt,
    resolveIndexPath,
    validateIndex,
} from "./duckstore"
import { embedAll, resolveEmbeddingConfig } from "./embedding"
import { clearVectorCache } from "./search"

/** 支持的数据语言（索引与指纹都按语言各算一份） */
export const SUPPORTED_LANGS = ["zh", "en", "jp", "kr", "fr", "tc"] as const

/** 常见的语言代码别名（配置里更惯用的写法） */
const LANG_ALIASES: Record<string, string> = { ja: "jp", ko: "kr" }

/**
 * 读取语言白名单（`AI_EMBEDDING_LANG`，如 `zh,en,ja`；留空 = 全部支持的语言）。
 * 只为白名单内的语言构建向量索引；无法解析出任何支持语言时按全部处理。
 */
export function resolveAllowedLangs(): string[] {
    const raw = process.env.AI_EMBEDDING_LANG?.trim() ?? ""

    if (!raw) {
        return [...SUPPORTED_LANGS]
    }

    const picked = new Set<string>()

    for (const item of raw
        .split(",")
        .map(part => part.trim().toLowerCase())
        .filter(Boolean)) {
        const code = LANG_ALIASES[item] ?? item

        if ((SUPPORTED_LANGS as readonly string[]).includes(code)) {
            picked.add(code)
        } else {
            console.warn(`[rag] AI_EMBEDDING_LANG 中的 "${item}" 不是支持的语言（${SUPPORTED_LANGS.join(" / ")}），已忽略`)
        }
    }

    if (!picked.size) {
        console.warn("[rag] AI_EMBEDDING_LANG 未解析出任何支持的语言，按全部语言处理")

        return [...SUPPORTED_LANGS]
    }

    return SUPPORTED_LANGS.filter(lang => picked.has(lang))
}

/** 判断某语言是否在白名单内（决定能否触发向量索引构建） */
export function isLangAllowed(lang: string): boolean {
    return resolveAllowedLangs().includes(lang)
}

/** 一次构建的结果 */
export interface RagBuildResult {
    /** 数据语言 */
    lang: string
    /** 本次语料按种类分别的内容指纹 */
    fingerprints: RagKindFingerprintMap
    /** 语料条数 */
    chunkCount: number
    /** 新增 / 变更 / 删除 与复用条数 */
    added: number
    changed: number
    removed: number
    reused: number
    /** 实际调用向量化接口的条数 */
    embedded: number
    /** 构建方式 */
    mode: "up-to-date" | "incremental" | "full"
    /** 向量维度 */
    dims: number
    /** 耗时（毫秒） */
    elapsedMs: number
}

/** 构建任务的对外状态（供状态接口展示） */
export interface RagBuildState {
    /** 是否有构建在跑 */
    running: boolean
    /** 正在构建的语言 */
    lang: string | null
    /** 本次构建开始时间（ISO） */
    startedAt: string | null
    /** 向量化进度 */
    progress: { done: number; total: number } | null
    /** 排队等待构建的语言 */
    pendingLangs: string[]
    /** 最近一次完成的结果 */
    lastResult: RagBuildResult | null
    /** 最近一次失败原因 */
    lastError: string | null
}

/**
 * 每批「嵌入 + 落库」的条数：一次性把全部向量留在内存非常夸张（4096 维 × 2 万条 ≈ 600MB+）。
 */
const EMBED_WRITE_BATCH = 2048

/**
 * 内容寻址的嵌入缓存（进程内，跨语言/跨构建复用）：同文语料（summary、fr/tc 的回退语音等）
 * 只向量化一次。key 为完整嵌入文本，value 为归一化后的向量；按 FIFO 截断。
 */
const embeddingCache = new Map<string, Float32Array>()

/** 嵌入缓存的总字节预算（1024 维约 2.4 万条，够放下一个语言的全部语料） */
const EMBEDDING_CACHE_MAX_BYTES = 96 * 1024 * 1024

/** 缓存当前占用的字节数（用于按预算淘汰） */
let embeddingCacheBytes = 0

/** 写入嵌入缓存（LRU：重复写入刷新位置；超预算从最旧条目淘汰） */
function cacheEmbedding(text: string, vector: Float32Array): void {
    const existing = embeddingCache.get(text)

    if (existing) {
        embeddingCacheBytes -= existing.byteLength
        embeddingCache.delete(text)
    }

    embeddingCache.set(text, vector)
    embeddingCacheBytes += vector.byteLength

    while (embeddingCacheBytes > EMBEDDING_CACHE_MAX_BYTES && embeddingCache.size > 1) {
        const oldest = embeddingCache.keys().next().value!

        embeddingCacheBytes -= embeddingCache.get(oldest)!.byteLength
        embeddingCache.delete(oldest)
    }
}

/** 读取嵌入缓存（命中即刷新位置） */
function cachedEmbedding(text: string): Float32Array | undefined {
    const cached = embeddingCache.get(text)

    if (!cached) {
        return undefined
    }

    embeddingCache.delete(text)
    embeddingCache.set(text, cached)

    return cached
}

/**
 * 释放嵌入缓存（构建队列排空后调用）。
 *
 * 缓存按 96MB 预算常驻，里面是全部语料的向量（1024 维 × 2 万条 ≈ 80MB）；构建结束后
 * 只有「下一个语言的构建」才可能再命中，而服务通常只构建一两种语言，留着就是纯占用。
 */
export function clearEmbeddingCache(): void {
    embeddingCache.clear()
    embeddingCacheBytes = 0
}

/** 拼装送入向量化的文本（同时作为嵌入缓存的键：文本逐字一致，向量才可复用） */
function embedText(chunk: RagChunk): string {
    return `${chunk.title}\n${chunk.text}\n${chunk.meta}`
}

/**
 * 构建失败后的冷却时间：上游挂掉时不要被请求反复触发。
 *
 * 只需要防失败重试——「内容没变」这种情况在请求路径上就被指纹比较挡掉了，
 * 根本不会跑到构建（也就没有「反复装配语料」的开销）。
 */
const FAILURE_COOLDOWN_MS = 5 * 60_000

/** 语言 → 下次允许触发构建的时间戳（仅失败后设置） */
const nextCheckAt = new Map<string, number>()

/**
 * 各语言「当前数据」的内容指纹（启动时算一次，之后只读；请求路径只与它做字符串比较）。
 */
const currentFingerprints = new Map<string, RagFingerprintInfo>()

/** 启动时是否已经把当前数据指纹算好（供请求路径区分「还没算完」与「算过但不是这个值」） */
let fingerprintsReady = false

/** 进度日志按「每 10% 或每 30 秒」节流，实时进度由常驻的进度 UI 负责 */
const PROGRESS_LOG_MIN_INTERVAL = 30_000
const PROGRESS_LOG_MIN_STEP = 0.1

/** 正在跑的构建任务（单飞） */
let runningTask: Promise<void> | null = null

/** 等待构建的语言（去重，按请求顺序） */
const pendingLangs: string[] = []

/** 最近一次构建状态 */
const state: RagBuildState = {
    running: false,
    lang: null,
    startedAt: null,
    progress: null,
    pendingLangs,
    lastResult: null,
    lastError: null,
}

/**
 * 状态订阅者与对外快照。
 *
 * 进度 UI（ink / React）用 `useSyncExternalStore` 订阅：React 要求 getSnapshot 在两次通知之间
 * 返回同一个引用，因此这里只在变更时重建一次快照，而不是把可变的内部 state 直接暴露出去。
 */
const listeners = new Set<() => void>()
let snapshot: RagBuildState = { ...state, pendingLangs: [] }

/**
 * 发布一次状态变更：重建快照并通知订阅者。
 */
function publish(): void {
    snapshot = {
        ...state,
        pendingLangs: [...pendingLangs],
        progress: state.progress ? { ...state.progress } : null,
    }

    for (const listener of listeners) {
        listener()
    }
}

/**
 * 订阅构建状态变更（进度 UI 用）。
 * @param listener 变更回调
 * @returns 取消订阅
 */
export function subscribeBuildState(listener: () => void): () => void {
    listeners.add(listener)

    return () => {
        listeners.delete(listener)
    }
}

/**
 * 取最近一次发布的构建状态快照（引用稳定，可安全用于 `useSyncExternalStore`）。
 * @returns 状态快照
 */
export function getBuildSnapshot(): RagBuildState {
    return snapshot
}

/**
 * 计算需要向量化的 chunk（增量：内容指纹变化的 + 新增的）。
 * @param chunks 目标语料
 * @param existing 现有「锚点 → 正文指纹」
 * @returns 待向量化列表与分类统计
 */
function diffChunks(
    chunks: readonly RagChunk[],
    existing: ReadonlyMap<string, string>
): { pending: RagChunk[]; reused: number; added: number; changed: number; removed: number } {
    const pending: RagChunk[] = []
    let reused = 0
    let added = 0
    let changed = 0

    for (const chunk of chunks) {
        const previous = existing.get(chunk.anchor)

        if (previous === chunk.hash) {
            reused++
            continue
        }

        if (previous === undefined) {
            added++
        } else {
            changed++
        }

        pending.push(chunk)
    }

    const anchors = new Set(chunks.map(chunk => chunk.anchor))
    let removed = 0

    for (const anchor of existing.keys()) {
        if (!anchors.has(anchor)) {
            removed++
        }
    }

    return { pending, reused, added, changed, removed }
}

/**
 * 判断现有索引能否作为增量基础。
 *
 * 模型 / 维度 / 切块规则 / 表结构 / 向量库后端任一不符就不能复用（旧向量无效或不在同一空间），
 * 只按内容比对会「复用」出错的向量；不能复用时按全量处理，旧指纹一律作废。
 */
function canReuseVectors(meta: RagIndexMeta | null, config: { model: string; dimensions?: number }, vectorStore: string): boolean {
    return Boolean(
        meta &&
            meta.state === "ready" &&
            // 后端切换（本地 ↔ 远端）必须整体重建：旧索引里没有新后端要的向量
            meta.vectorStore === vectorStore &&
            meta.model === config.model &&
            (config.dimensions === undefined || meta.dims === config.dimensions) &&
            meta.chunkSchemaVersion === RAG_CHUNK_SCHEMA_VERSION &&
            meta.schemaVersion === RAG_INDEX_SCHEMA_VERSION
    )
}

/**
 * 装配某个语言的语料、算出内容指纹并缓存（每个语言只算一次）。
 *
 * 这是唯一需要装配语料的地方（除构建本身）；请求路径只用缓存值做比较。
 * @param lang 数据语言
 * @returns 当前数据的内容指纹
 */
export async function resolveCurrentFingerprint(lang: string): Promise<RagFingerprintInfo> {
    const cached = currentFingerprints.get(lang)

    if (cached) {
        return cached
    }

    const chunks = await buildRagChunks(lang)
    const info: RagFingerprintInfo = { kinds: ragKindFingerprints(chunks), count: chunks.length }
    currentFingerprints.set(lang, info)

    return info
}

/**
 * 取已缓存的当前数据指纹（不装配语料）。
 * @param lang 数据语言
 * @returns 指纹信息；尚未算过时返回 undefined
 */
export function peekCurrentFingerprint(lang: string): RagFingerprintInfo | undefined {
    return currentFingerprints.get(lang)
}

/**
 * 启动预热：算出各语言的当前数据指纹并缓存；已建过索引但内容已变的语言排队重建（无需手工命令）。
 */
export async function warmCurrentFingerprints(langs: readonly string[] = resolveAllowedLangs()): Promise<RagWarmReport[]> {
    const started = Date.now()
    const reports: RagWarmReport[] = []

    for (const lang of langs) {
        try {
            const info = await resolveCurrentFingerprint(lang)
            const indexed = await readIndexedFingerprint(lang)
            // 只有「索引里已有的种类」与当前数据不一致才算过期：没建过的种类由请求路径按需触发
            const staleKinds = Object.keys(info.kinds).filter(kind => indexed?.[kind] !== info.kinds[kind])

            reports.push({ lang, kinds: info.kinds, count: info.count, indexed, staleKinds })

            // 已经建过索引、但内容变了 → 自动补建（没建过的语言留给「第一个来问的客户端」触发，
            // 免得六种语言一起向量化；毕竟服务器通常只服务其中一两种）
            if (indexed && staleKinds.length) {
                requestIndexBuild(lang, `启动时发现索引内容已过期（${staleKinds.join(" / ")}）`)
            }
        } catch (error) {
            console.warn(`[rag] ${lang} 语料指纹计算失败：${error instanceof Error ? error.message : String(error)}`)
        }
    }

    fingerprintsReady = true
    console.log(
        `[rag] 当前数据指纹就绪（${Date.now() - started}ms）：${reports
            .map(
                item =>
                    `${item.lang}[${Object.entries(item.kinds)
                        .map(([kind, fingerprint]) => `${kind}=${fingerprint}`)
                        .join(" ")}]`
            )
            .join(" ")}`
    )

    return reports
}

/** 启动预热的单语言报告 */
export interface RagWarmReport {
    /** 数据语言 */
    lang: string
    /** 当前数据按种类分别的指纹 */
    kinds: RagKindFingerprintMap
    /** 语料条数 */
    count: number
    /** 索引里已有的各类型指纹（没建过时为 null） */
    indexed: Record<string, string> | null
    /** 索引过期（或缺失）的种类 */
    staleKinds: string[]
}

/**
 * 读取索引里记录的内容指纹。
 */
async function readIndexedFingerprint(lang: string): Promise<Record<string, string> | null> {
    return (await readMetaAt())?.fingerprints[lang] ?? null
}

/**
 * 判断本次请求能否命中索引（接口层做「只比较、不装配」的判定）：
 * serveKinds = 客户端指纹与索引逐字相同的种类（可服务）；staleKinds = 索引落后于当前数据的种类（需重建）。
 * @param lang 数据语言
 * @param clientFingerprints 客户端数据包里各语料种类的内容指纹
 * @param indexedFingerprints 索引里该语言已有的指纹；不传时自己读一次库（接口层通常已经读过，直接传入可省一次读库）
 */
export async function resolveIndexFingerprint(
    lang: string,
    clientFingerprints: Record<string, string>,
    indexedFingerprints?: Record<string, string> | null
): Promise<{ serveKinds: string[]; indexed: Record<string, string> | null; staleKinds: string[] }> {
    const indexed = indexedFingerprints ?? (await readIndexedFingerprint(lang)) ?? {}
    const current = currentFingerprints.get(lang)

    // 可服务 = 客户端那份数据的种类指纹与索引里该种类的指纹逐字相同：
    // 此时索引里的向量对应的正文与客户端本地完全同源，跨种类互不影响（只有部分模块变化时其余照常可用）
    const serveKinds = Object.keys(clientFingerprints).filter(kind => indexed[kind] === clientFingerprints[kind])

    // 索引落后于当前数据的种类（或当前数据有、索引没有）：这些需要（重新）构建
    const staleKinds = current ? Object.keys(current.kinds).filter(kind => indexed[kind] !== current.kinds[kind]) : []

    return { serveKinds, indexed: Object.keys(indexed).length ? indexed : null, staleKinds }
}

/** 指纹预热是否已完成（启动日志与状态接口用） */
export function areFingerprintsReady(): boolean {
    return fingerprintsReady
}

/**
 * 构建（或确认）某个语言的索引；内容没变时不做任何写入（`mode: "up-to-date"`）。
 */
export async function buildLanguageIndex(lang: string): Promise<RagBuildResult> {
    const started = Date.now()
    const config = resolveEmbeddingConfig()

    if (!config) {
        throw new Error("缺少 embeddings 配置（AI_EMBEDDING_MODEL / AI_EMBEDDING_BASE_URL / AI_EMBEDDING_API_KEY）")
    }

    // 向量存哪里：DashVector 三件套配齐就存远端（本地只留元数据），否则存本地 DuckDB——这个选择会写进 meta，
    // 后端一换就必须整体重建（见 canReuseVectors）
    const remote = resolveDashVectorConfig()
    const vectorStore = remote ? `remote:${remote.collection}` : LOCAL_VECTOR_STORE_TAG

    const chunks = await buildRagChunks(lang)
    const fingerprints = ragKindFingerprints(chunks)

    // 与启动时缓存的「当前数据指纹」对齐：运行期数据不会变，不一致只可能来自热重载，
    // 这时以本次实际装配的结果为准并更新缓存（否则请求路径会一直按旧指纹判定）
    const cached = currentFingerprints.get(lang)
    const drifted = cached && Object.keys(fingerprints).some(kind => cached.kinds[kind] !== fingerprints[kind])

    if (drifted) {
        console.warn(`[rag] ${lang} 语料指纹发生变化（${Object.keys(fingerprints).join(" / ")}），以本次装配结果为准`)
    }

    if (!cached || drifted) {
        currentFingerprints.set(lang, { kinds: fingerprints, count: chunks.length })
    }

    const targetPath = resolveIndexPath()

    // 现有索引：决定「复用向量」还是「全量重嵌」，以及要保留哪些其它语言的指纹
    const currentMeta: RagIndexMeta | null = await readMetaAt()

    // 能不能复用旧向量，由「模型 / 维度 / 切块规则 / 表结构 / 向量库后端」是否一致决定。
    // 不能复用时**必须按全量处理**（旧指纹一律作废）：模型换了、维度改了、向量库换到远端了，
    // 旧索引里的向量在新后端下要么不存在、要么不在同一向量空间，只按内容比对会「复用」出错的向量——
    // 极端情况下内容没变，就会一路走到「已是最新」，索引永远修不回来。
    const reusable = canReuseVectors(currentMeta, config, vectorStore) && existsSync(targetPath)
    const existing = reusable ? await readExistingHashesAt(targetPath, lang) : new Map<string, string>()

    const { pending, reused, added, changed, removed } = diffChunks(chunks, existing)
    const indexedKinds = currentMeta?.fingerprints[lang] ?? {}
    const staleKinds = Object.keys(fingerprints).filter(kind => indexedKinds[kind] !== fingerprints[kind])
    const upToDate = reusable && !staleKinds.length && pending.length === 0 && removed === 0

    if (upToDate) {
        return {
            lang,
            fingerprints,
            chunkCount: chunks.length,
            added,
            changed,
            removed,
            reused,
            embedded: 0,
            mode: "up-to-date",
            dims: currentMeta?.dims ?? 0,
            elapsedMs: Date.now() - started,
        }
    }

    const incremental = reusable

    // 直接在线上库的单个事务里构建：COMMIT 前其他连接看到的一直是上一次成功构建的状态，
    // 校验不过或中途崩溃就整体回滚（由 WAL 恢复），不需要临时文件与换名
    const db = await openIndexForBuild()
    let embedded = 0
    let dims = incremental ? (currentMeta?.dims ?? 0) : 0

    try {
        // 全量重建：旧模型的向量整体作废，清空全部语言表，其它语言由请求按需重建
        if (!incremental) {
            await db.dropAllChunkTables()
        }

        // 增量：行还带着上一代指纹，先按种类统一改标，避免收尾回收时把复用的行误删
        if (incremental) {
            await db.retagFingerprints(lang, fingerprints)
        }

        if (pending.length) {
            console.log(
                `[rag] ${lang} 开始向量化 ${pending.length} 条（新增 ${added}、变更 ${changed}、删除 ${removed}、复用 ${reused}）；` +
                    `过期种类：${staleKinds.join(" / ") || "（仅锚点增删）"}；` +
                    (remote ? `远端向量库 ${remote.collection}` : "本地 DuckDB 向量库")
            )

            /** 上一次打点的时间与进度比例（节流用） */
            let lastLoggedAt = Date.now()
            let lastLoggedRatio = 0

            // 分批「嵌入 → 落库」，内存里只常驻一批的量级（见 EMBED_WRITE_BATCH）
            for (let start = 0; start < pending.length; start += EMBED_WRITE_BATCH) {
                const slice = pending.slice(start, start + EMBED_WRITE_BATCH)

                // 内容寻址去重：同文语料（summary、fr/tc 的回退语音等）只向量化一次；
                // 命中缓存的直接复用，未命中的按文本去重后合成一次 embedAll 请求
                const vectorByIndex = new Map<number, number[]>()
                const textsToEmbed = new Map<string, number[]>()

                slice.forEach((chunk, index) => {
                    const text = embedText(chunk)
                    const cached = cachedEmbedding(text)

                    if (cached) {
                        vectorByIndex.set(index, Array.from(cached))

                        return
                    }

                    const group = textsToEmbed.get(text)

                    if (group) {
                        group.push(index)
                    } else {
                        textsToEmbed.set(text, [index])
                    }
                })

                const texts = [...textsToEmbed.keys()]
                const vectors = texts.length
                    ? await embedAll(texts, {
                          config,
                          onProgress: ({ done }) => {
                              // 进度按整份 pending 报：缓存命中的部分视作已完成，done 只覆盖本批真正嵌入的文本
                              const overall = start + vectorByIndex.size + done
                              state.progress = { done: overall, total: pending.length }
                              publish()

                              // 节流打点：每 10% 或每 30 秒留一行，便于在服务端日志里盯长期构建
                              const ratio = overall / pending.length
                              const now = Date.now()

                              if (ratio - lastLoggedRatio < PROGRESS_LOG_MIN_STEP && now - lastLoggedAt < PROGRESS_LOG_MIN_INTERVAL) {
                                  return
                              }

                              const elapsed = Math.max((now - started) / 1000, 1)
                              const speed = overall / elapsed
                              const eta = (pending.length - overall) / Math.max(speed, 0.01)

                              console.log(
                                  `[rag] ${lang} 向量化 ${overall}/${pending.length}（${Math.round(ratio * 100)}%，${speed.toFixed(1)} 条/秒，剩余约 ${Math.round(eta)}s）`
                              )

                              lastLoggedAt = now
                              lastLoggedRatio = ratio
                          },
                      })
                    : []

                // 回填缓存与索引映射：同一文本的多个行共享同一份向量
                texts.forEach((text, position) => {
                    const vector = vectors[position]!

                    cacheEmbedding(text, Float32Array.from(vector))

                    for (const index of textsToEmbed.get(text)!) {
                        vectorByIndex.set(index, vector)
                    }
                })

                // 维度：优先取本批新嵌入的向量；全部命中缓存时取任意一条缓存向量
                const anyVector = vectors[0] ?? vectorByIndex.values().next().value

                if (anyVector) {
                    dims = anyVector.length
                }

                // 远端模式：向量只推远端，本地行只记元数据；本地模式：向量按 float32 写进 DuckDB
                const rows: RagVectorRow[] = slice.map((chunk, index) => ({
                    anchor: chunk.anchor,
                    lang,
                    // 行携带它所属种类的指纹：按种类回收、按种类判定可服务范围都靠它
                    fingerprint: fingerprints[chunk.kind] ?? "",
                    kind: chunk.kind,
                    hash: chunk.hash,
                    vector: remote ? [] : vectorByIndex.get(index)!,
                }))

                await db.insertVectors(rows, dims)

                // 远端写入在同一批里做；写失败让整个构建失败，下一轮构建会按锚点重新补齐
                if (remote) {
                    await insertDocuments(
                        remote,
                        slice.map((chunk, index) => ({
                            anchor: chunk.anchor,
                            vector: vectorByIndex.get(index)!,
                            fields: {
                                anchor: chunk.anchor,
                                lang,
                                kind: chunk.kind,
                                hash: chunk.hash,
                                fingerprint: fingerprints[chunk.kind] ?? "",
                            },
                        }))
                    )
                }

                embedded += rows.length
            }

            // 内容已消失的锚点统一删一次（放在写入之后：按批边写边删会把别的批次的行误删）
            const disappeared = await db.deleteAnchorsExcept(lang, new Set(chunks.map(chunk => chunk.anchor)))

            if (remote && disappeared.length) {
                const deleted = await deleteDocuments(remote, disappeared)

                console.log(`[rag] ${lang} 远端向量库删除了 ${deleted}/${disappeared.length} 条已消失的语料`)
            }
        }

        // 垃圾回收：每个种类只留本次指纹的行（新指纹覆盖老指纹）
        const dropped = await db.deleteOtherFingerprints(lang, fingerprints)

        if (dropped > 0) {
            console.log(`[rag] ${lang} 索引回收了 ${dropped} 条旧指纹向量`)
        }

        // HNSW 索引由 DuckDB 随写入自动维护，只在缺失时创建（首次构建 / 全量重建后）
        await db.ensureVectorIndex(lang)

        const total = await db.countVectors()

        await db.writeMeta({
            schemaVersion: RAG_INDEX_SCHEMA_VERSION,
            chunkSchemaVersion: RAG_CHUNK_SCHEMA_VERSION,
            model: config.model,
            dims,
            fingerprints: incremental ? { ...(currentMeta?.fingerprints ?? {}), [lang]: fingerprints } : { [lang]: fingerprints },
            builtAt: new Date().toISOString(),
            vectorStore,
            state: "ready",
            chunkCount: total,
        })

        // 上线前自检：读的是本连接事务内的数据；校验不过就整体回滚，宁可退回纯词法也不上线坏索引
        const builtMeta = await db.readMeta()
        const verdict = validateIndex(builtMeta, {
            model: config.model,
            dims: config.dimensions ?? builtMeta?.dims ?? 0,
            chunkSchemaVersion: RAG_CHUNK_SCHEMA_VERSION,
        })

        if (!verdict.ok) {
            throw new Error(`新索引未通过校验（${verdict.reason}），本次构建已整体回滚`)
        }

        await db.commit()
    } catch (error) {
        // 回滚放弃本次全部写入：线上库保持构建前的状态（事务已结束的重复调用是幂等 no-op）
        await db.abort()

        throw error
    }

    // 换名后旧的内存缓存（按语言 + 指纹）不能再用：指纹变了，缓存键也就变了，但旧的仍占内存
    clearVectorCache()

    state.progress = null
    publish()

    return {
        lang,
        fingerprints,
        chunkCount: chunks.length,
        added,
        changed,
        removed,
        reused,
        embedded,
        mode: incremental ? "incremental" : "full",
        dims,
        elapsedMs: Date.now() - started,
    }
}

/**
 * 获取跨进程的索引构建锁（独占创建锁文件 + PID 存活检测；持有者已死则接管陈旧锁）。
 */
function acquireIndexBuildLock(): () => void {
    const lockPath = `${resolveIndexPath()}.lock`

    mkdirSync(dirname(lockPath), { recursive: true })

    for (let attempt = 0; ; attempt++) {
        try {
            writeFileSync(lockPath, String(process.pid), { flag: "wx" })

            return () => rmSync(lockPath, { force: true })
        } catch {
            // 锁文件已存在：检查持有者进程是否还活着，活着就报错，已死则清掉陈旧锁重试一次
            let holderPid = 0

            try {
                holderPid = Number(readFileSync(lockPath, "utf-8").trim())
            } catch {
                holderPid = 0
            }

            let holderAlive = false

            if (holderPid > 0) {
                try {
                    process.kill(holderPid, 0)
                    holderAlive = true
                } catch (error) {
                    holderAlive = (error as NodeJS.ErrnoException).code === "EPERM"
                }
            }

            if (holderAlive) {
                throw new Error(
                    `另一个进程（PID ${holderPid}）正在构建索引：同一索引路径（${resolveIndexPath()}）不允许并发构建` +
                        "（DuckDB 单写者，并发会损坏库文件）。请确认没有第二个服务实例共用该路径。"
                )
            }

            if (attempt > 0) {
                throw new Error(`索引构建锁获取失败（${lockPath}）`)
            }

            rmSync(lockPath, { force: true })
        }
    }
}

/**
 * 跑一个语言，并把结果 / 失败原因记进状态。
 * @param lang 数据语言
 */
async function runBuild(lang: string): Promise<void> {
    state.running = true
    state.lang = lang
    state.startedAt = new Date().toISOString()
    state.progress = null
    publish()

    try {
        // 跨进程互斥：DuckDB 单写者，并发构建同一索引路径会交错写入、损坏库文件
        const release = acquireIndexBuildLock()

        try {
            const result = await buildLanguageIndex(lang)

            state.lastResult = result
            state.lastError = null

            // 构建成功即视为「索引与当前数据一致」：清掉失败冷却，后续请求只做指纹比较
            nextCheckAt.delete(lang)

            console.log(
                `[rag] ${lang} 索引${result.mode === "up-to-date" ? "已是最新" : "构建完成"}：` +
                    `语料 ${result.chunkCount} 条（新增 ${result.added}、变更 ${result.changed}、删除 ${result.removed}、复用 ${result.reused}），` +
                    `向量化 ${result.embedded} 条，指纹 ${Object.entries(result.fingerprints)
                        .map(([kind, fingerprint]) => `${kind}=${fingerprint}`)
                        .join(" ")}，` +
                    `耗时 ${Math.round(result.elapsedMs / 1000)}s`
            )
        } finally {
            release()
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        state.lastError = message
        publish()
        // 失败后冷却：上游不可用时不要被请求反复触发
        nextCheckAt.set(lang, Date.now() + FAILURE_COOLDOWN_MS)
        console.error(`[rag] ${lang} 索引构建失败：${message}`)
    } finally {
        state.running = false
        state.lang = null
        state.startedAt = null
        state.progress = null
        publish()
    }
}

/**
 * 构建循环：串行处理排队中的语言，直到队列空。
 */
async function drainQueue(): Promise<void> {
    while (pendingLangs.length) {
        const lang = pendingLangs.shift()!
        publish()

        await runBuild(lang)
    }

    // 队列排空后释放嵌入缓存：下一轮构建要等数据变化才发生，常驻八十多 MB 没有意义
    clearEmbeddingCache()
    runningTask = null
}

/**
 * 请求（必要时）在后台构建某个语言的索引；同一时刻一个任务，重复请求去重排队。
 * @param lang 数据语言
 * @param reason 触发原因（日志用）
 * @returns 是否真的入队（冷却中 / 已在队列 / 白名单外为 false）
 */
export function requestIndexBuild(lang: string, reason: string): boolean {
    // 白名单外的语言永远不会有向量索引：直接拒绝，让客户端退回纯词法检索
    if (!isLangAllowed(lang)) {
        console.log(`[rag] ${lang} 不在语言白名单（AI_EMBEDDING_LANG）内，跳过构建：${reason}`)

        return false
    }

    const cooldownUntil = nextCheckAt.get(lang) ?? 0

    if (Date.now() < cooldownUntil) {
        console.log(`[rag] ${lang} 索引构建冷却中（${Math.ceil((cooldownUntil - Date.now()) / 1000)}s 后可再触发），跳过：${reason}`)

        return false
    }

    if (state.lang === lang || pendingLangs.includes(lang)) {
        console.log(`[rag] ${lang} 索引已在构建队列中，合并本次请求：${reason}`)

        return false
    }

    console.log(`[rag] 触发 ${lang} 索引构建：${reason}`)
    pendingLangs.push(lang)
    publish()

    if (!runningTask) {
        runningTask = drainQueue()
    }

    return true
}

/**
 * 取构建状态（供状态接口展示）。
 * @returns 状态快照
 */
export function getBuildState(): RagBuildState {
    return getBuildSnapshot()
}

/**
 * 等待正在进行的构建结束（测试与优雅退出用）。
 * @returns 当前构建任务的完成
 */
export async function waitForBuildIdle(): Promise<void> {
    while (runningTask) {
        await runningTask
    }
}
