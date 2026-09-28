/**
 * 阿里云 DashVector（向量检索服务）客户端。
 *
 * 契约按真机验证（在 `dbagent` 集合上实测过插入 / 检索 / 删除 / 统计与过滤语法）：
 * - 鉴权用 **`dashvector-auth-token`** 头（不是 `Authorization: Bearer`，用错头网关会报 apikey 为空）；
 * - 写：`POST /v1/collections/{集合}/docs`，体 `{ docs: [{ id, vector, fields }] }`；
 * - 查：`POST /v1/collections/{集合}/query`，体 `{ vector, topk, filter, output_fields, include_vector }`
 *   → `output: [{ id, fields, score }]`（**无命中时没有 `output` 字段**）。
 *   注意 `score` 是**距离**不是相似度：cosine 度量下同向 = 0、正交 = 1（真机实测：拿 unit(0) 查
 *   以 unit(0) 存的那条得 0.0、正交的那条得 1.0），换算见 {@link toSimilarity}；
 * - 删：`DELETE /v1/collections/{集合}/docs`，体 `{ ids: [...] }`（不存在的 id 会在每条的 code 里报 -2024）；
 * - 统计：`GET /v1/collections/{集合}/stats` → `output.total_doc_count`（字符串）。
 *
 * 两个硬约束来自真机报错：
 * 1. **文档 id 只允许 `[a-zA-Z0-9_-!@#$%+=.]` 且长度 1~64**，而我们的锚点长这样
 *    `story:100101:100102:d5001`——冒号非法。因此 id 用 {@link anchorToDocId} 转写（`:` → `.`），
 *    真实锚点放进 `anchor` 字段，检索时以字段为准（回退才用 id 反解）。
 * 2. 过滤表达式支持 `字段 = "值"` 与 `字段 in ("a","b")`（实测），因此「按语料种类指纹放行」
 *    可以整条下推给远端，不需要在本地再筛一遍。
 * 3. **单请求体 ≤ 2MB**（超了报 413）：1024 维向量的分量化开很长，写入按「条数 × 请求体字节」
 *    双上限装箱，见 {@link insertDocuments}。
 */

/** 远端向量库配置 */
export interface DashVectorConfig {
    /** 控制台给的集群 endpoint（不带协议头，例如 `vrs-xxx.dashvector.cn-beijing.aliyuncs.com`） */
    endpoint: string
    /** API Key（DASHSCOPE_API_KEY / 集群专用 key） */
    apiKey: string
    /** 集合名 */
    collection: string
}

/** 写入/检索时用的远端文档 */
export interface DashVectorDoc {
    /** 锚点（内部会转写成合法 id） */
    anchor: string
    /** 向量（单位向量，维度必须与集合一致） */
    vector: number[]
    /** 随向量一起存的字段（检索时可按它过滤、也可回给调用方） */
    fields: Record<string, string | number>
}

/** 一条检索命中 */
export interface DashVectorHit {
    /** 锚点（优先取 `anchor` 字段，缺失时用 id 反解） */
    anchor: string
    /** 远端给的**距离**（越小越近；换算成相似度用 {@link toSimilarity}） */
    distance: number
    /** 返回的字段 */
    fields: Record<string, unknown>
}

/** 集合信息 */
export interface DashVectorCollectionInfo {
    name: string
    dimension: number
    metric: string
    status: string
    docCount: number
}

/**
 * 序列化向量为**浮点字面量**数组。
 *
 * 真机实测：向量的整数字面量（`1`）会被拒为 `Mismatched Data Type`，必须写成 `1.0`。
 * JavaScript 的 `JSON.stringify` 不会给整数补小数点，所以这里手工拼这一小段。
 *
 * 分量统一取 1e-6 精度（与本地索引的存储精度一致）：float32 本就只有约 7 位有效数字，
 * 而不取整的话 float32 转成 double 的十进制展开（如 0.031250001192092896）会把请求体撑到 2 倍，
 * 100 条 × 1024 维就超过远端 2MB 的请求体上限（真机 413）。
 * @param vector 向量
 * @returns JSON 数组文本（如 `[1.0,0.0,-0.5]`）
 */
function serializeVector(vector: readonly number[]): string {
    const parts = vector.map(value => {
        if (!Number.isFinite(value)) {
            throw new Error("向量里出现非有限数值（NaN / Infinity），已拒绝写入远端")
        }

        const rounded = Math.round(value * 1e6) / 1e6

        return Number.isInteger(rounded) ? `${rounded}.0` : `${rounded}`
    })

    return `[${parts.join(",")}]`
}

/** 单请求写入的文档条数上限（小维度向量时只看字节数会一次塞太多，条数仍封顶） */
const WRITE_BATCH_DOCS = 100

/** 单请求体的字节预算：远端硬上限 2MB（超了报 413），留余量给 fields 与 JSON 结构 */
const WRITE_BODY_BUDGET_BYTES = 1_500_000

/** 单请求删除的 id 条数 */
const DELETE_BATCH_SIZE = 100

/** 写 / 删的并发批数：单批往返在百毫秒量级，串行会把 2 万条拖到分钟级；并发 4 是实测不触发限流的档位 */
const WRITE_CONCURRENCY = 4

/** 单请求超时（毫秒） */
const REQUEST_TIMEOUT = 30_000

/** 重试次数与退避基数（只重试可重试的错误） */
const MAX_RETRIES = 3
const RETRY_BASE_DELAY = 600

/** 远端返回体 */
interface DashVectorResponse<T> {
    code?: number
    message?: string
    request_id?: string
    output?: T
}

/**
 * 转写锚点为远端文档 id。
 *
 * 远端只接受 `[a-zA-Z0-9_-!@#$%+=.]` 且长度 ≤ 64；锚点里的非法字符（冒号）统一换成点号，
 * 真实锚点另有 `anchor` 字段承载，因此这一步是单向的、可逆只是兜底。
 * @param anchor 语料锚点
 * @returns 合法 doc id
 */
export function anchorToDocId(anchor: string): string {
    const id = anchor.replace(/[^a-zA-Z0-9_\-!@#$%+=.]/g, ".")

    if (id.length > 64) {
        throw new Error(`锚点转写后超过远端 id 长度上限（64）：${anchor}`)
    }

    return id
}

/**
 * 从远端文档 id 反解锚点（兜底：正常路径以 `anchor` 字段为准）。
 * @param docId 远端 id
 * @returns 锚点
 */
export function docIdToAnchor(docId: string): string {
    return docId.replace(/\./g, ":")
}

/**
 * 读取远端向量库配置。
 *
 * DashVector 三件套（endpoint / key / 集合名）**配置齐全即启用**远端向量库——三件套本身就是
 * 「我要用这个集合存向量」的明确声明，与嵌入通道（恒为 OpenAI 兼容协议）无关。
 * @returns 配置；三件套缺一时返回 null（走本地向量库）
 */
export function resolveDashVectorConfig(): DashVectorConfig | null {
    const endpoint = process.env.AI_EMBEDDING_SERVER_ENDPOINT?.trim() ?? ""
    const apiKey = process.env.AI_EMBEDDING_SERVER_API_KEY?.trim() ?? ""
    const collection = process.env.AI_EMBEDDING_SERVER_COLLECTION?.trim() ?? ""

    if (!endpoint || !apiKey || !collection) {
        return null
    }

    return { endpoint, apiKey, collection }
}

/**
 * 发一次远端请求（带超时与退避重试）。
 *
 * 只重试「值得重试」的错误：网络异常、429、5xx。其余（4xx 参数错、code 非 0 的业务错）
 * 直接抛出——重试只会重复同样的失败，还会掩盖真正的原因。
 * @param config 配置
 * @param options.path 集合下的路径（如 `/docs`、`/query`）
 * @param options.method HTTP 方法
 * @param options.body 请求体（GET 时省略）
 * @returns 返回体
 */
async function request<T>(
    config: DashVectorConfig,
    options: { path: string; method: string; body?: unknown; bodyText?: string }
): Promise<DashVectorResponse<T>> {
    const url = `https://${config.endpoint}/v1/collections/${config.collection}${options.path}`
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

        try {
            const response = await fetch(url, {
                method: options.method,
                headers: { "Content-Type": "application/json", "dashvector-auth-token": config.apiKey },
                body: options.bodyText ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
                signal: controller.signal,
            })

            const text = await response.text()

            if (!response.ok) {
                const retryable = response.status === 429 || response.status >= 500

                if (retryable && attempt < MAX_RETRIES) {
                    lastError = new Error(`DashVector ${options.method} ${options.path} 失败 ${response.status}: ${text.slice(0, 200)}`)
                    await new Promise(resolve => setTimeout(resolve, RETRY_BASE_DELAY * 2 ** attempt))
                    continue
                }

                throw new Error(`DashVector ${options.method} ${options.path} 失败 ${response.status}: ${text.slice(0, 200)}`)
            }

            const payload = JSON.parse(text) as DashVectorResponse<T>

            // 业务错误：code 非 0（写/删的批量结果里每条的 code 另行判断）
            if (typeof payload.code === "number" && payload.code !== 0) {
                throw new Error(`DashVector ${options.method} ${options.path} 返回错误 ${payload.code}: ${payload.message ?? ""}`)
            }

            return payload
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))

            // 已经在上面的分支里抛出的业务错不再重试
            if (attempt >= MAX_RETRIES) {
                throw lastError
            }

            // 网络异常（fetch 抛错 / 超时）值得重试
            const retryable = error instanceof TypeError || (error as Error).name === "AbortError"

            if (!retryable) {
                throw lastError
            }

            await new Promise(resolve => setTimeout(resolve, RETRY_BASE_DELAY * 2 ** attempt))
        } finally {
            clearTimeout(timer)
        }
    }

    throw lastError ?? new Error("DashVector 请求失败")
}

/**
 * 把若干批任务按有限并发跑完。
 *
 * 单批在百毫秒量级，2 万条 = 200 批串行要几十秒；并发跑满又容易触发网关限流，故固定并发度。
 * 任一批失败就让整体失败（其余在飞的批会在检查到失败后提前收手）。
 * @param batches 各批的任务（按下标取任务）
 * @param concurrency 并发度
 * @returns 各批的返回值（顺序与 batches 一致）
 */
async function runBatches<T>(batches: ReadonlyArray<() => Promise<T>>, concurrency: number): Promise<T[]> {
    const results = new Array<T>(batches.length)
    let next = 0
    let failed = false

    const worker = async (): Promise<void> => {
        while (!failed) {
            const index = next++

            if (index >= batches.length) {
                return
            }

            results[index] = await batches[index]!()
        }
    }

    try {
        await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker))
    } catch (error) {
        failed = true

        throw error
    }

    return results
}

/**
 * 写入（或覆盖）一批文档。
 *
 * 先序列化每条文档，再按「条数 ≤ {@link WRITE_BATCH_DOCS}、请求体 ≤ {@link WRITE_BODY_BUDGET_BYTES}」装箱，
 * {@link WRITE_CONCURRENCY} 路并发；每批里逐条判断结果码——远端对「部分失败」也返回 HTTP 200，
 * 不看每条的 code 就会把没写进去的向量当成写好了。
 * @param config 配置
 * @param docs 文档列表
 * @returns 成功写入的条数
 */
export async function insertDocuments(config: DashVectorConfig, docs: readonly DashVectorDoc[]): Promise<number> {
    // 单条文档的 JSON 文本先拼好：装箱预算按真实字节数算，而不是按条数估
    const texts = docs.map(
        doc =>
            `{"id":${JSON.stringify(anchorToDocId(doc.anchor))},"vector":${serializeVector(doc.vector)},"fields":${JSON.stringify(doc.fields)}}`
    )
    const batches: Array<() => Promise<number>> = []
    let start = 0

    while (start < texts.length) {
        // 贪心装箱：至少装一条（单条超预算也照发，让远端给出明确报错），之后字节超预算或条数到顶就封批
        let end = start + 1
        let bytes = texts[start]!.length + 11

        while (end < texts.length && end - start < WRITE_BATCH_DOCS) {
            const cost = texts[end]!.length + 1

            if (bytes + cost > WRITE_BODY_BUDGET_BYTES) {
                break
            }

            bytes += cost
            end++
        }

        const sliceTexts = texts.slice(start, end)

        start = end

        batches.push(async () => {
            const payload = await request<Array<{ doc_op?: string; id?: string; code?: number; message?: string }>>(config, {
                path: "/docs",
                method: "POST",
                bodyText: `{"docs":[${sliceTexts.join(",")}]}`,
            })

            const results = payload.output ?? []
            const failed = results.filter(item => typeof item.code === "number" && item.code !== 0)

            if (failed.length) {
                throw new Error(
                    `DashVector 写入部分失败（${failed.length}/${sliceTexts.length}）：${failed[0]?.id ?? ""} ${failed[0]?.message ?? ""}`.trim()
                )
            }

            return sliceTexts.length
        })
    }

    const written = await runBatches(batches, WRITE_CONCURRENCY)

    return written.reduce((sum, count) => sum + count, 0)
}

/**
 * 删除若干文档（按锚点）。
 *
 * 远端对不存在的 id 返回每条 code -2024「Key Not Exist」：这不是错误（重复删除、或上一轮已删），
 * 只有其它错误码才抛出。分批与写入同样并发。
 * @param config 配置
 * @param anchors 锚点列表
 * @returns 实际删除的条数
 */
export async function deleteDocuments(config: DashVectorConfig, anchors: readonly string[]): Promise<number> {
    const batches: Array<() => Promise<number>> = []

    for (let start = 0; start < anchors.length; start += DELETE_BATCH_SIZE) {
        const slice = anchors.slice(start, start + DELETE_BATCH_SIZE)

        batches.push(async () => {
            const payload = await request<Array<{ id?: string; code?: number; message?: string }>>(config, {
                path: "/docs",
                method: "DELETE",
                body: { ids: slice.map(anchorToDocId) },
            })

            const results = payload.output ?? []
            const failed = results.filter(item => typeof item.code === "number" && item.code !== 0 && item.code !== -2024)

            if (failed.length) {
                throw new Error(
                    `DashVector 删除部分失败（${failed.length}/${slice.length}）：${failed[0]?.id ?? ""} ${failed[0]?.message ?? ""}`.trim()
                )
            }

            return results.filter(item => item.code === 0).length
        })
    }

    const deleted = await runBatches(batches, WRITE_CONCURRENCY)

    return deleted.reduce((sum, count) => sum + count, 0)
}

/**
 * 检索：返回最相似的若干锚点。
 *
 * 过滤条件在远端执行（`lang = "zh" and fingerprint in (...)`），因此「只服务指纹相符的语料种类」
 * 这一层门禁是下推的：不符的向量根本不会被取回来。
 * @param config 配置
 * @param options.vector 查询向量（单位向量）
 * @param options.topk 返回条数上限
 * @param options.filter 过滤表达式（缺省不过滤）
 * @returns 命中（按相似度降序）
 */
export async function queryVectors(
    config: DashVectorConfig,
    options: { vector: readonly number[]; topk: number; filter?: string }
): Promise<DashVectorHit[]> {
    const filterText = options.filter === undefined ? "" : `,"filter":${JSON.stringify(options.filter)}`
    const payload = await request<Array<{ id?: string; score?: number; fields?: Record<string, unknown> }>>(config, {
        path: "/query",
        method: "POST",
        bodyText: `{"vector":${serializeVector(options.vector)},"topk":${options.topk}${filterText},"output_fields":["anchor"],"include_vector":false}`,
    })

    return (payload.output ?? []).map(item => {
        const fields = item.fields ?? {}
        const anchor = typeof fields.anchor === "string" ? fields.anchor : docIdToAnchor(`${item.id ?? ""}`)

        return { anchor, distance: typeof item.score === "number" ? item.score : Number.POSITIVE_INFINITY, fields }
    })
}

/**
 * 把远端距离换算成相似度（越大越像），与本地检索的口径对齐。
 *
 * 真机实测：cosine 度量下远端返回的是 `1 - 余弦`（同向 0、正交 1），
 * 因此换算就是 `1 - distance`；其它度量按「取负」处理（保持单调性，仅用于排序）。
 * @param distance 远端得分
 * @param metric 集合度量（cosine / dotproduct / euclidean…）
 * @returns 相似度（越大越像）
 */
export function toSimilarity(distance: number, metric: string): number {
    return metric === "cosine" ? 1 - distance : -distance
}

/**
 * 读取集合信息（维度 / 度量 / 文档数），供状态接口与启动自检使用。
 * @param config 配置
 * @returns 集合信息
 */
export async function describeCollection(config: DashVectorConfig): Promise<DashVectorCollectionInfo> {
    const info = await request<{ name?: string; dimension?: number; metric?: string; status?: string }>(config, { path: "", method: "GET" })
    const stats = await request<{ total_doc_count?: string }>(config, { path: "/stats", method: "GET" })

    return {
        name: info.output?.name ?? config.collection,
        dimension: info.output?.dimension ?? 0,
        metric: info.output?.metric ?? "",
        status: info.output?.status ?? "",
        docCount: Number(stats.output?.total_doc_count ?? 0),
    }
}
