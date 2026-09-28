/**
 * 服务端向量召回。
 *
 * 本地模式（默认）：查询向量化后在本地 DuckDB 索引里检索（HNSW，cosine；2.8 万条 × 1024 维约 100ms，
 * 远小于一次 embedding 网络往返）。全部种类指纹可服务时不带过滤（可走索引），
 * 部分可服务时下推 `WHERE fingerprint IN (...)`（退化为精确扫描）。
 * 远端模式（DashVector 三件套配齐）：不加载本地向量，门禁下推成过滤表达式直接查 DashVector。
 */

import { RAG_CHUNK_SCHEMA_VERSION } from "../../../src/data/rag/types"
import { describeCollection, queryVectors, resolveDashVectorConfig, toSimilarity } from "./dashvector"
import { closeDuckInstances, type RagIndexMeta, readMetaAt, resolveIndexPath, searchDuckVectors, validateIndex } from "./duckstore"
import { embedBatch, resolveEmbeddingConfig } from "./embedding"

/** 一条向量召回结果 */
export interface RagVectorHit {
    /** 语料锚点（客户端据此还原正文） */
    anchor: string
    /** 余弦相似度（本地为 float32 精确余弦；远端为 DashVector 距离换算值） */
    score: number
}

/** 单次查询返回的候选数上限 */
export const MAX_VECTOR_HITS = 100

/** 远端单次查询的 topk 上限（DashVector 限制，超过会被拒） */
const MAX_REMOTE_TOPK = 100

/** 查询向量缓存（同一问题在一次会话里会被重复检索），只留原始浮点一份 */
const queryCache = new Map<string, { raw: number[]; dims: number }>()

/** 查询缓存条数上限 */
const MAX_QUERY_CACHE = 500

/**
 * 单次查询向量化的时间预算（毫秒）。
 *
 * 上游是大模型推理，实测单次 0.9~3.8s，而客户端最多等 4s：等下去必然被客户端丢弃、白烧一次上游调用。
 * 因此这里主动设上限，超时就让本次退回词法检索。
 */
const QUERY_EMBED_TIMEOUT_MS = Number(process.env.RAG_EMBED_TIMEOUT_MS ?? "") || 2500

/** 查询向量化超时（供接口层区分「上游慢」与「上游错」） */
export class RagQueryTimeoutError extends Error {
    constructor() {
        super(`查询向量化超过 ${QUERY_EMBED_TIMEOUT_MS}ms，本次已放弃向量通道`)
    }
}

/**
 * 归一化查询文本（缓存键用）。
 *
 * 同一个问题换个标点、多个空格、全角半角就会导致缓存未命中，而未命中意味着再等一次上游推理，
 * 因此这里按 NFKC + 空白折叠 + 小写归一（检索模型对大小写与空白不敏感）。
 * @param query 查询文本
 * @returns 归一化后的文本
 */
function normalizeQuery(query: string): string {
    return query.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
}

/** 索引整体状态 */
export interface RagVectorStatus {
    /** 是否可用于服务（模型 / 维度 / 切块规则 / 表结构 / 状态全部相符） */
    available: boolean
    /** 不可用原因 */
    reason?: string
    /** 索引元信息 */
    meta: RagIndexMeta | null
    /** 各语言、各语料种类已索引的内容指纹（语言 → 种类 → 指纹） */
    fingerprints: Record<string, Record<string, string>>
}

/**
 * 检查向量索引是否可用于服务：模型 / 维度 / 切块规则 / 表结构 / 状态任一不符即不可用，
 * 调用方退回纯词法检索。「本次请求的指纹是否相符」是另一层判断，见 isKindServable。
 */
export async function getVectorIndexStatus(): Promise<RagVectorStatus> {
    const config = resolveEmbeddingConfig()

    if (!config) {
        return {
            available: false,
            reason: "未配置 embeddings（AI_EMBEDDING_MODEL / AI_EMBEDDING_BASE_URL / AI_EMBEDDING_API_KEY）",
            meta: null,
            fingerprints: {},
        }
    }

    const meta = await readMetaAt()

    if (!meta) {
        return { available: false, reason: "索引库不存在（服务端尚未构建过向量索引）", meta: null, fingerprints: {} }
    }

    // 维度的期望值优先取配置里指定的输出维度（MRL 截断），否则取索引自身
    const expectedDims = config.dimensions ?? meta.dims
    const verdict = validateIndex(meta, { model: config.model, dims: expectedDims, chunkSchemaVersion: RAG_CHUNK_SCHEMA_VERSION })

    return { available: verdict.ok, reason: verdict.reason, meta, fingerprints: meta.fingerprints }
}

/**
 * 判断某种类指纹是否可服务（客户端指纹与索引逐字相同即同源，与「服务端当前数据是否更新」无关）。
 */
export function isKindServable(status: RagVectorStatus, lang: string, kind: string, fingerprint: string | undefined): boolean {
    return Boolean(fingerprint) && status.fingerprints[lang]?.[kind] === fingerprint
}

/**
 * 取查询向量（带缓存）。缓存键带模型与维度，换模型不会命中旧向量。
 *
 * 缓存键带模型与维度：换了模型（哪怕维度相同）旧查询向量就与索引里的文档向量不在同一空间，
 * 命中它会得到一批看起来正常、实际毫不相干的结果。
 * @param query 查询文本（已 trim）
 * @param dims 期望维度；0 表示不校验
 */
async function getQueryVector(query: string, dims: number): Promise<{ raw: number[]; dims: number }> {
    const config = resolveEmbeddingConfig()
    const key = `${config?.model ?? ""}|${dims}|${normalizeQuery(query)}`
    const cached = queryCache.get(key)

    if (cached && (dims === 0 || cached.dims === dims)) {
        return cached
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), QUERY_EMBED_TIMEOUT_MS)

    let vector: number[] | undefined

    try {
        ;[vector] = await embedBatch([query], config ?? undefined, { signal: controller.signal })
    } catch (error) {
        if (controller.signal.aborted) {
            throw new RagQueryTimeoutError()
        }

        throw error
    } finally {
        clearTimeout(timer)
    }

    if (!vector?.length) {
        throw new Error("查询向量为空")
    }

    if (dims !== 0 && vector.length !== dims) {
        throw new Error(`查询向量维度不符：期望 ${dims}，实际 ${vector.length}`)
    }

    const entry = { raw: vector, dims: vector.length }

    if (queryCache.size >= MAX_QUERY_CACHE) {
        const oldest = queryCache.keys().next().value

        if (oldest !== undefined) {
            queryCache.delete(oldest)
        }
    }

    queryCache.set(key, entry)

    return entry
}

/**
 * 向量召回：把查询向量化后做相似度检索，返回相似度最高的若干锚点。
 * @param query 查询文本
 * @param options.lang 数据语言
 * @param options.serveFingerprints 本次可服务的语料内容指纹（只在这些指纹的向量上检索）
 * @param options.limit 返回条数上限
 * @param options.status 已经算好的索引状态（接口层先判过一次，传进来可省一次读库）
 * @returns 命中的锚点与相似度（按相似度降序）
 */
export async function searchVectors(
    query: string,
    options: { lang: string; serveFingerprints: readonly string[]; limit?: number; status?: RagVectorStatus }
): Promise<RagVectorHit[]> {
    const trimmed = query.trim()

    if (!trimmed) {
        return []
    }

    const status = options.status ?? (await getVectorIndexStatus())

    if (!status.available) {
        throw new Error(`向量索引不可用：${status.reason}`)
    }

    const servable = new Set(options.serveFingerprints)

    if (!servable.size) {
        return []
    }

    const limit = Math.min(Math.max(options.limit ?? 40, 1), MAX_VECTOR_HITS)

    // 远端向量库（DashVector 三件套配齐即启用）：检索直接走远端，本地元数据不参与打分
    const remote = resolveDashVectorConfig()

    if (remote) {
        const dims = status.meta?.dims ?? 0

        if (!dims) {
            return []
        }

        // 查询向量化放在远端 try 之外：嵌入通道坏了要如实报错（上层 502 / 503），
        // 而不是被下面的兜底当成「远端不可用」吞成空结果，让客户端永远查不到东西还不自知
        const queryVector = await getQueryVector(trimmed, dims)

        try {
            return await searchRemote(remote, options.lang, [...servable], queryVector.raw, limit)
        } catch (error) {
            // 远端不可用时没有本地向量可退（本地只存元数据）：如实记日志并让上层退回纯词法
            console.warn(`[rag] 远端向量库检索失败，本次退回关键词检索：${error instanceof Error ? error.message : String(error)}`)

            return []
        }
    }

    // 本地模式：DuckDB 向量索引（HNSW），维度取自索引元信息（构建时写入）。
    const meta = status.meta
    const dims = meta?.dims ?? 0

    if (!meta || !dims) {
        return []
    }

    const queryVector = await getQueryVector(trimmed, dims)

    // 全部种类指纹可服务时不带过滤（可走 HNSW）；部分可服务时下推指纹过滤（退化为精确扫描）
    const langFingerprints = meta.fingerprints[options.lang]
    const fullCover = Boolean(langFingerprints && Object.values(langFingerprints).every(fingerprint => servable.has(fingerprint)))

    return searchDuckVectors(resolveIndexPath(), options.lang, {
        fingerprints: fullCover ? null : [...servable],
        vector: queryVector.raw,
        limit,
    })
}

/** 远端集合信息缓存（度量 / 维度；查询路径每 60 秒最多拉一次，避免每次检索都多打一个请求） */
let remoteCollectionCache: { at: number; metric: string; dimension: number } | null = null

/**
 * 取远端集合的度量与维度（带 60 秒缓存）。
 * @param config 远端配置
 * @returns 度量与维度
 */
async function resolveRemoteCollection(config: Parameters<typeof describeCollection>[0]): Promise<{ metric: string; dimension: number }> {
    if (remoteCollectionCache && Date.now() - remoteCollectionCache.at < 60_000) {
        return remoteCollectionCache
    }

    const info = await describeCollection(config)
    remoteCollectionCache = { at: Date.now(), metric: info.metric, dimension: info.dimension }

    return remoteCollectionCache
}

/**
 * 走远端向量库检索。
 *
 * 过滤表达式把「语言 + 本次可服务的种类指纹」一起下推：远端只会返回这些指纹的向量，
 * 因此不需要把整库取回本地再筛。
 * @param config 远端配置
 * @param lang 数据语言
 * @param fingerprints 可服务的种类指纹
 * @param vector 查询向量（原始浮点，与远端库里存的一致）
 * @param limit 返回条数上限
 * @returns 命中的锚点与相似度
 */
async function searchRemote(
    config: NonNullable<ReturnType<typeof resolveDashVectorConfig>>,
    lang: string,
    fingerprints: readonly string[],
    vector: readonly number[],
    limit: number
): Promise<RagVectorHit[]> {
    // 远端过滤表达式：语言 + 本次可服务的种类指纹一起下推，
    // 于是「只服务指纹相符的语料」这一层不需要在本地再筛一遍
    const filter = `lang = "${lang}" and fingerprint in (${fingerprints.map(item => `"${item}"`).join(",")})`
    const hits = await queryVectors(config, { vector, topk: Math.min(limit, MAX_REMOTE_TOPK), filter })
    const { metric } = await resolveRemoteCollection(config)

    // 远端给的是距离：换算成相似度后降序返回（口径与本地一致）
    return hits
        .map(hit => ({ anchor: hit.anchor, score: toSimilarity(hit.distance, metric) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
}

/**
 * 统计索引里的向量总数（供状态接口使用）。
 * @returns 向量条数（取自 meta 的构建统计；没有索引时为 0）
 */
export async function countIndexedVectors(): Promise<number> {
    return (await readMetaAt())?.chunkCount ?? 0
}

/**
 * 预热本地向量检索（启动时调一次）。
 *
 * HNSW 索引第一次被查询时要从磁盘载入：实测首次约 85ms、之后约 7ms。
 * 启动时空跑一次，免得第一个真实请求的延迟里混进这份冷启动开销。
 * @returns 是否真的预热了（索引不可用 / 没有任何语言的索引时为 false）
 */
export async function warmVectorIndex(): Promise<boolean> {
    const status = await getVectorIndexStatus()
    const lang = Object.keys(status.fingerprints)[0]

    if (!status.available || !lang || !status.meta?.dims) {
        return false
    }

    // 用单位向量而不是随机向量：零向量会让余弦距离无意义，单位向量即可触发一次真实的索引扫描
    const vector = new Array<number>(status.meta.dims).fill(0)

    vector[0] = 1
    await searchDuckVectors(resolveIndexPath(), lang, { fingerprints: null, vector, limit: 1 })

    return true
}

/**
 * 清空内存缓存（索引重建后调用）；连带关闭 DuckDB 实例，释放文件句柄。
 */
export function clearVectorCache(): void {
    queryCache.clear()
    closeDuckInstances()
}
