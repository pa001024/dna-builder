/**
 * 向量化客户端（OpenAI 兼容 `/embeddings` 协议，如 SiliconFlow / Nebius）。
 *
 * 配置来自环境变量（见 `server/.env`）：
 * - `AI_EMBEDDING_MODEL`：模型名，如 `BAAI/bge-m3`（1024 维）、`Qwen/Qwen3-Embedding-8B`（原生 4096 维，支持 MRL 截断）；
 * - `AI_EMBEDDING_BASE_URL`：**完整**端点（必填，含 `/embeddings` 路径）；
 * - `AI_EMBEDDING_API_KEY`：密钥；
 * - `AI_EMBEDDING_DIM`：可选，指定输出维度（MRL 截断）。支持该参数的服务
 *   可以借此把索引体积与检索延迟压回 bge-m3 的量级（4096 维向量的落盘与索引开销约 4 倍于 1024 维）；
 *   不配则用模型原生维度。**要求显式指定维度的渠道必须配它**，否则上游直接报错。
 * - `AI_EMBEDDING_BATCH_SIZE`：可选，单请求条数（默认 256）。
 *
 * 实测（硅基流动 bge-m3，免费档）：批量 256 条每请求可用，真实剧情正文 1.21 字/token，
 * 并发 4 时约 144 条/秒——单语言剧情两万余行约 2.2 分钟。
 *
 * 归一化：上游是否已归一化各不相同（同一模型换渠道就可能变），而下游的检索打分
 （本地 HNSW 的 cosine 度量、远端可能的内积类度量）都**以单位向量为前提**才口径一致。
 * 因此这里统一做一次 L2 归一化，让整条链路与模型无关。
 */

/** 向量化配置 */
export interface EmbeddingConfig {
    /** 模型名 */
    model: string
    /** 完整端点 */
    url: string
    /** 密钥 */
    apiKey: string
    /** 指定的输出维度（MRL 截断）；不配置则用模型原生维度 */
    dimensions?: number
    /** 单请求条数上限；不配置则用默认值 */
    batchSize?: number
}

/** OpenAI 兼容响应体里用到的字段 */
interface OpenAiEmbeddingResponse {
    data?: Array<{ embedding?: number[]; index?: number }>
    usage?: { total_tokens?: number }
    message?: string
}

/** 单请求的默认条数：实测 OpenAI 兼容渠道每请求固定开销占主导（64 条/批 12 条/秒、256 条/批 75 条/秒），取大值 */
const DEFAULT_BATCH_SIZE = 256

/** 单请求条数上限（上游可能限制 input 数组长度，`AI_EMBEDDING_BATCH_SIZE` 只能在此范围内调） */
const MAX_BATCH_SIZE_LIMIT = 1024

/** 并发请求数：实测并发 4 即可打满免费档吞吐 */
const CONCURRENCY = 4

/** 单请求超时（毫秒） */
const REQUEST_TIMEOUT = 60_000

/** 失败重试次数与退避基数 */
const MAX_RETRIES = 4
const RETRY_BASE_DELAY = 800

/**
 * 契约类错误：上游没按约定返回（维度 / 条数 / index / 空向量）。
 *
 * 与网络抖动区分开：同样的请求重试只会得到同样的结果，重试 4 次白等十几秒还掩盖了真正的原因，
 * 因此这类错误立刻抛出。
 */
class EmbeddingContractError extends Error {}

/**
 * HTTP 层错误：4xx（除 429 限流）多为配置问题——模型名写错、维度不被支持、密钥无效，
 * 重试同样没有意义；5xx 与 429 才值得退避重试。
 */
class EmbeddingHttpError extends Error {
    constructor(
        message: string,
        readonly retryable: boolean
    ) {
        super(message)
    }
}

/**
 * 读取向量化配置。
 * @returns 配置；缺少任一必需环境变量时返回 null
 */
export function resolveEmbeddingConfig(): EmbeddingConfig | null {
    const model = process.env.AI_EMBEDDING_MODEL?.trim() ?? ""
    const apiKey = (process.env.AI_EMBEDDING_API_KEY ?? "").trim()
    const url = process.env.AI_EMBEDDING_BASE_URL?.trim() ?? ""

    if (!model || !url || !apiKey) {
        return null
    }

    const rawDimensions = process.env.AI_EMBEDDING_DIM?.trim() ?? ""
    const dimensions = rawDimensions ? Number(rawDimensions) : undefined
    const validDimensions = dimensions !== undefined && Number.isInteger(dimensions) && dimensions > 0 ? dimensions : undefined

    // 配置写坏时只忽略这一项而不是让整个通道不可用：向量维度最终由索引自身的 meta 校验，
    // 这里悄悄用回原生维度只会让构建结果与预期不符，因此要留下明确的告警
    if (dimensions !== validDimensions) {
        console.warn(`[rag] AI_EMBEDDING_DIM="${rawDimensions}" 不是正整数，已忽略（改用模型原生维度）`)
    }

    const rawBatchSize = process.env.AI_EMBEDDING_BATCH_SIZE?.trim() ?? ""
    const batchSize = rawBatchSize ? Number(rawBatchSize) : DEFAULT_BATCH_SIZE
    const validBatchSize = Number.isInteger(batchSize) && batchSize > 0 ? Math.min(batchSize, MAX_BATCH_SIZE_LIMIT) : DEFAULT_BATCH_SIZE

    if (validBatchSize !== batchSize) {
        console.warn(`[rag] AI_EMBEDDING_BATCH_SIZE="${rawBatchSize}" 不是 1~${MAX_BATCH_SIZE_LIMIT} 的整数，已改用 ${validBatchSize}`)
    }

    return { model, url, apiKey, dimensions: validDimensions, batchSize: validBatchSize }
}

/**
 * 拼 OpenAI 兼容请求体。
 * @param config 配置
 * @param texts 文本列表
 * @returns 请求体
 */
function buildRequestBody(config: EmbeddingConfig, texts: readonly string[]): unknown {
    const body: Record<string, unknown> = { model: config.model, input: [...texts], encoding_format: "float" }

    if (config.dimensions !== undefined) {
        body.dimensions = config.dimensions
    }

    return body
}

/**
 * 解析返回体，统一成「下标 + 向量」列表。
 * @param payload 上游返回体
 * @returns 下标与向量（下标缺失时按出现顺序兜底）
 */
function parseResponse(payload: unknown): Array<{ index: number; embedding: number[] }> {
    const response = (payload ?? {}) as OpenAiEmbeddingResponse

    return (response.data ?? []).map((row, position) => ({
        index: typeof row.index === "number" ? row.index : position,
        embedding: (row.embedding ?? []) as number[],
    }))
}

/**
 * 从错误响应体里抠出可读信息。
 * @param body 响应正文（可能是 JSON，也可能是纯文本）
 * @returns 便于排查的一行文本
 */
function describeErrorBody(body: string): string {
    try {
        const parsed = JSON.parse(body) as { message?: string; error?: { message?: string } }

        if (parsed.error?.message) {
            return `${parsed.error.message}`
        }

        if (parsed.message) {
            return `${parsed.message}`
        }
    } catch {
        // 非 JSON 就原样截断
    }

    return body.slice(0, 300)
}

/**
 * L2 归一化成单位向量（就地修改并返回）。
 *
 * 归一化放在这一层而不是检索层：构建与查询都走 {@link embedBatch}，
 * 一处生效即可保证「存进索引的」与「查询时算的」是同一套度量。
 * @param vector 原始向量
 * @returns 单位向量（同一引用）
 */
function normalizeVector(vector: number[]): number[] {
    let sum = 0

    for (const value of vector) {
        sum += value * value
    }

    const norm = Math.sqrt(sum)

    if (!Number.isFinite(norm) || norm <= 0) {
        throw new EmbeddingContractError("embeddings 返回了零向量（模长为 0，无法归一化）")
    }

    for (let i = 0; i < vector.length; i++) {
        vector[i] = vector[i]! / norm
    }

    return vector
}

/**
 * 向量化一批文本。
 *
 * 输入顺序与返回顺序一一对应：接口按 `index` 字段回填，这里按它重排，
 * 避免上游乱序返回时把向量与锚点错配（错配的索引不会被任何校验发现，是最危险的一类错误）。
 * @param texts 文本列表（长度不得超过配置的 batchSize）
 * @param config 配置；不传时读环境变量
 * @param options.signal 取消信号（检索路径用它给上游推理设上限，超时即放弃本次向量化）
 * @returns 与输入等长的向量列表（每条都是单位向量）
 */
export async function embedBatch(
    texts: readonly string[],
    config: EmbeddingConfig = resolveEmbeddingConfig()!,
    options: { signal?: AbortSignal } = {}
): Promise<number[][]> {
    if (!config) {
        throw new Error("缺少 embeddings 配置（AI_EMBEDDING_MODEL / AI_EMBEDDING_BASE_URL / AI_EMBEDDING_API_KEY）")
    }

    if (!texts.length) {
        return []
    }

    const batchLimit = config.batchSize ?? DEFAULT_BATCH_SIZE

    if (texts.length > batchLimit) {
        throw new Error(`单批最多 ${batchLimit} 条，实际 ${texts.length} 条`)
    }

    const body = buildRequestBody(config, texts)

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (options.signal?.aborted) {
            throw new Error("向量化已被调用方取消（超过本次检索的时间预算）")
        }

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
        // 调用方取消时连带中止本次在飞请求：不中止的话上游会继续算一个没人等的结果
        const onAbort = () => controller.abort()

        options.signal?.addEventListener("abort", onAbort, { once: true })

        try {
            const response = await fetch(config.url, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
                body: JSON.stringify(body),
                signal: controller.signal,
            })

            if (!response.ok) {
                const detail = describeErrorBody(await response.text())
                throw new EmbeddingHttpError(
                    `embeddings 请求失败 ${response.status}: ${detail}`,
                    response.status === 429 || response.status >= 500
                )
            }

            const rows = parseResponse(await response.json())

            if (rows.length !== texts.length) {
                throw new EmbeddingContractError(`embeddings 返回条数不匹配：期望 ${texts.length}，实际 ${rows.length}`)
            }

            const ordered = new Array<number[] | undefined>(texts.length)

            rows.forEach((row, position) => {
                if (!Array.isArray(row.embedding) || !row.embedding.length) {
                    throw new EmbeddingContractError("embeddings 返回了空向量")
                }

                const target = row.index ?? position

                // index 越界或重复都会留下空洞 / 覆盖：这类错配没有任何下游校验能发现，必须在这里拦住
                if (!Number.isInteger(target) || target < 0 || target >= texts.length) {
                    throw new EmbeddingContractError(`embeddings 返回的 index 越界：${target}（本批共 ${texts.length} 条）`)
                }

                if (ordered[target]) {
                    throw new EmbeddingContractError(`embeddings 返回了重复的 index：${target}`)
                }

                ordered[target] = row.embedding
            })

            const vectors: number[][] = []
            let dims = 0

            for (let index = 0; index < ordered.length; index++) {
                const vector = ordered[index]

                if (!vector) {
                    throw new EmbeddingContractError(`embeddings 缺少第 ${index} 条的向量（本批共 ${texts.length} 条）`)
                }

                // 同一批内维度必须一致：不一致说明上游行为异常，混进索引就会写出错配的向量
                if (!dims) {
                    dims = vector.length
                } else if (vector.length !== dims) {
                    throw new EmbeddingContractError(`embeddings 同一批返回了不一致的维度：${dims} 与 ${vector.length}`)
                }

                vectors.push(normalizeVector(vector))
            }

            // 上游可能不认识维度参数而按原生维度返回：此刻就要失败，而不是等查询时才发现维度不符
            if (config.dimensions !== undefined && dims !== config.dimensions) {
                throw new EmbeddingContractError(`上游忽略了维度参数：期望 ${config.dimensions} 维，实际返回 ${dims} 维`)
            }

            return vectors
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))

            // 契约类与不可重试的 HTTP 错误立刻抛出：重试只会白等，还会把真实原因埋进最后一次报错里
            if (error instanceof EmbeddingContractError || (error instanceof EmbeddingHttpError && !error.retryable)) {
                throw error
            }

            // 调用方取消（超时）不重试：等下去也没有人接结果
            if (options.signal?.aborted) {
                throw new Error("向量化已被调用方取消（超过本次检索的时间预算）")
            }

            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RETRY_BASE_DELAY * 2 ** attempt))
            }
        } finally {
            clearTimeout(timer)
            options.signal?.removeEventListener("abort", onAbort)
        }
    }

    throw lastError ?? new Error("embeddings 请求失败")
}

/** 向量化进度回调入参 */
export interface EmbedProgress {
    /** 已完成条数 */
    done: number
    /** 总条数 */
    total: number
}

/**
 * 并发向量化整份文本列表（按 `config.batchSize` 分批、{@link CONCURRENCY} 并发）。
 * @param texts 文本列表
 * @param options.onProgress 进度回调
 * @param options.config 配置
 * @returns 与输入等长的向量列表
 */
export async function embedAll(
    texts: readonly string[],
    options: { onProgress?: (progress: EmbedProgress) => void; config?: EmbeddingConfig } = {}
): Promise<number[][]> {
    const config = options.config ?? resolveEmbeddingConfig()

    if (!config) {
        throw new Error("缺少 embeddings 配置（AI_EMBEDDING_MODEL / AI_EMBEDDING_BASE_URL / AI_EMBEDDING_API_KEY）")
    }

    const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE
    const batches: Array<{ start: number; texts: string[] }> = []

    for (let start = 0; start < texts.length; start += batchSize) {
        batches.push({ start, texts: texts.slice(start, start + batchSize) })
    }

    const vectors = new Array<number[]>(texts.length)
    let done = 0
    let cursor = 0

    const workers = Array.from({ length: Math.min(CONCURRENCY, batches.length) }, async () => {
        while (cursor < batches.length) {
            const batch = batches[cursor++]!

            const result = await embedBatch(batch.texts, config)

            result.forEach((vector, offset) => {
                vectors[batch.start + offset] = vector
            })

            done += batch.texts.length
            options.onProgress?.({ done, total: texts.length })
        }
    })

    await Promise.all(workers)

    return vectors
}
