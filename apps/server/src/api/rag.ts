/**
 * RAG 向量检索接口。
 *
 * - `POST /api/v1/rag/search`：登录后调用，把查询文本向量化并在服务端索引里召回锚点。
 *   返回的是「锚点 + 相似度」，正文由客户端用本地数据还原（客户端不下载向量）。
 * - `GET /api/v1/rag/status`：公开只读，供运维与客户端判断向量通道是否可用。
 *
 * 校验按**内容指纹**：请求必须带上数据包清单里的 RAG 内容指纹（打包时用与服务端同一套切块器算出）。
 * 服务端在启动时把「当前数据指纹」算好缓存，请求路径只做比较，因此客户端怎么刷都不会引起重复计算；
 * 只有「索引确实落后于当前数据」时才在后台构建（启动预热与状态接口都能看到）。
 * 指纹不一致时客户端退回纯词法检索——绝不让上一版数据的向量去匹配当前正文。
 *
 * 计费口径：查询向量化一次约 20 tokens（免费档为 0），因此不占 AI 额度，只做每分钟限流。
 */

import { Elysia, t } from "elysia"
import { resolveUser } from "../ai"
import {
    areFingerprintsReady,
    getBuildState,
    isLangAllowed,
    peekCurrentFingerprint,
    requestIndexBuild,
    resolveIndexFingerprint,
    SUPPORTED_LANGS,
} from "../rag/build"
import { describeCollection, resolveDashVectorConfig } from "../rag/dashvector"
import { resolveEmbeddingConfig } from "../rag/embedding"
import { getVectorIndexStatus, RagQueryTimeoutError, searchVectors } from "../rag/search"

/** 每账号每分钟允许的检索次数（向量化成本极低，限流只是为了挡住脚本刷接口）；压测时可用 RAG_SEARCH_RATE_LIMIT 调高 */
const RATE_LIMIT_PER_MINUTE = Number(process.env.RAG_SEARCH_RATE_LIMIT ?? "") || 60

/** 限流窗口（毫秒） */
const RATE_WINDOW = 60_000

/** 每账号的调用时间戳队列 */
const rateBuckets = new Map<string, number[]>()

/**
 * 记账一次调用并判定是否超限。
 * @param userId 账号 id
 * @returns 是否允许本次调用
 */
function allowRequest(userId: string): boolean {
    const now = Date.now()
    const recent = (rateBuckets.get(userId) ?? []).filter(timestamp => now - timestamp < RATE_WINDOW)

    if (recent.length >= RATE_LIMIT_PER_MINUTE) {
        rateBuckets.set(userId, recent)

        return false
    }

    recent.push(now)
    rateBuckets.set(userId, recent)

    // 桶数量随账号增长，定期丢弃已经空掉的桶，避免长期运行内存只增不减
    if (rateBuckets.size > 5000) {
        for (const [key, timestamps] of rateBuckets) {
            if (!timestamps.some(timestamp => now - timestamp < RATE_WINDOW)) {
                rateBuckets.delete(key)
            }
        }
    }

    return true
}

/** 支持的数据语言（与索引/指纹的语言口径一致） */
const LANGS = SUPPORTED_LANGS

/** 远端向量库信息的缓存（状态接口每次最多隔 60 秒打一次远端，避免状态查询把远端当心跳打） */
let remoteStatusCache: { at: number; payload: Record<string, unknown> } | null = null

/**
 * 取向量库后端的概览（本地 / 远端），供状态接口展示。
 * @returns 后端信息
 */
async function describeVectorStore(): Promise<Record<string, unknown>> {
    const config = resolveDashVectorConfig()

    if (!config) {
        return { kind: "local", note: "向量存在本地 DuckDB 索引库（HNSW 向量索引），检索走本地向量检索" }
    }

    if (remoteStatusCache && Date.now() - remoteStatusCache.at < 60_000) {
        return remoteStatusCache.payload
    }

    try {
        const info = await describeCollection(config)
        const payload = {
            kind: "remote",
            collection: info.name,
            dimension: info.dimension,
            metric: info.metric,
            status: info.status,
            doc_count: info.docCount,
            note: "向量存远端（DashVector），本地只留元数据；检索直接走远端",
        }

        remoteStatusCache = { at: Date.now(), payload }

        return payload
    } catch (error) {
        return { kind: "remote", collection: config.collection, error: error instanceof Error ? error.message : String(error) }
    }
}

/**
 * RAG 检索路由。
 */
export const ragPlugin = () =>
    new Elysia({ prefix: "/api/v1" })
        .get("/rag/status", async () => {
            const status = await getVectorIndexStatus()
            const config = resolveEmbeddingConfig()

            return {
                available: status.available,
                reason: status.reason,
                embedding_configured: Boolean(config),
                model: status.meta?.model ?? null,
                dims: status.meta?.dims ?? null,
                /** 各语言已索引的内容指纹 */
                fingerprints: status.fingerprints,
                /** 各语言服务端当前数据按种类分别的指纹（启动时算好；客户端可据此判断自己是否最新） */
                current_fingerprints: Object.fromEntries(SUPPORTED_LANGS.map(lang => [lang, peekCurrentFingerprint(lang)?.kinds ?? null])),
                fingerprints_ready: areFingerprintsReady(),
                built_at: status.meta?.builtAt ?? null,
                chunk_count: status.meta?.chunkCount ?? 0,
                /** 服务端进程常驻内存（字节），供运维观察 */
                memory_rss: process.memoryUsage().rss,
                /** 后台构建任务状态（启动预热与检索请求触发，无需人工运维） */
                build: getBuildState(),
                /** 向量库后端：本地索引库（默认）或远端 DashVector */
                vector_store: await describeVectorStore(),
            }
        })
        .post(
            "/rag/search",
            async ({ body, headers, set }) => {
                const user = resolveUser(headers as Record<string, string | undefined>)

                if (!user) {
                    set.status = 401

                    return { error: "unauthorized", message: "需要登录令牌（token 或 Authorization: Bearer）" }
                }

                if (!allowRequest(user.id)) {
                    set.status = 429

                    return { error: "rate_limited", message: `每分钟最多 ${RATE_LIMIT_PER_MINUTE} 次检索` }
                }

                const status = await getVectorIndexStatus()

                if (!status.available || !status.meta) {
                    // 索引本身不可用（模型 / 维度 / 切块规则 / 表结构变了，或库被删、从未建过）：
                    // 本次让客户端退回纯词法检索，同时在后台按当前配置重建——这类变化只有重建才能修好，
                    // 而没有构建任务时索引会一直卡在不可用状态（已删掉手工 CLI，必须由请求顶上）
                    // 只有配了向量化渠道才可能重建（没配置时构建必然立刻失败，不必排队等冷却）
                    const building = resolveEmbeddingConfig()
                        ? requestIndexBuild(body.lang, `索引不可用：${status.reason ?? "未知"}`)
                        : false
                    set.status = 503

                    return {
                        error: "index_unavailable",
                        message: status.reason ?? "向量索引不可用",
                        building: building || getBuildState().running,
                    }
                }

                // 只做指纹比较（当前数据指纹在启动时算好并缓存，请求路径不装配语料）。
                // 按种类分别判：客户端指纹与索引里该种类的指纹逐字相同的种类才提供向量，
                // 因此「只有部分模块变化」时其余模块照常命中，不会被一起判死。
                const { serveKinds, staleKinds } = await resolveIndexFingerprint(
                    body.lang,
                    body.fingerprints,
                    status.fingerprints[body.lang] ?? null
                )

                // 一个种类都对不上：本次退回纯词法检索；若索引确实落后于当前数据（或有种类还没建），
                // 顺手排一次后台构建——这是唯一会触发构建的地方，且只在真的该建时发生
                if (!serveKinds.length) {
                    const needsBuild = staleKinds.length > 0
                    // 白名单外的语言永远不会构建：明确告知，而不是让客户端等一个不会发生的索引
                    const langAllowed = isLangAllowed(body.lang)
                    const building =
                        needsBuild && langAllowed ? requestIndexBuild(body.lang, `索引待建的种类：${staleKinds.join(" / ")}`) : false
                    set.status = 409

                    return {
                        error: needsBuild ? (langAllowed ? "index_building" : "lang_not_allowed") : "stale_pack",
                        message: needsBuild
                            ? langAllowed
                                ? "服务端正在按当前数据构建该语言的向量索引，本次请退回纯词法检索"
                                : "该语言不在服务端的向量检索白名单（AI_EMBEDDING_LANG）内，本次请退回纯词法检索"
                            : "本机数据包的语料与服务端索引不一致，请更新数据包；本次请退回纯词法检索",
                        stale_kinds: staleKinds,
                        client_fingerprints: body.fingerprints,
                        building: building || getBuildState().running,
                    }
                }

                // 部分种类过期时也提示构建，但不影响本次已经可用的那些种类
                if (staleKinds.length) {
                    requestIndexBuild(body.lang, `索引待建的种类：${staleKinds.join(" / ")}`)
                }

                try {
                    const results = await searchVectors(body.query, {
                        lang: body.lang,
                        serveFingerprints: serveKinds.map(kind => body.fingerprints[kind]!),
                        limit: body.limit ?? undefined,
                        status,
                    })

                    return {
                        model: status.meta.model,
                        served_kinds: serveKinds,
                        pending_kinds: staleKinds,
                        results,
                    }
                } catch (error) {
                    // 上游推理超过时间预算：本次明确放弃向量通道，让客户端立刻退回词法检索，
                    // 而不是让它等到自己的超时、再白烧一次上游调用
                    if (error instanceof RagQueryTimeoutError) {
                        set.status = 503

                        return { error: "embedding_timeout", message: error.message }
                    }

                    console.error("[rag] 向量检索失败", error)
                    set.status = 502

                    return { error: "embedding_failed", message: error instanceof Error ? error.message : String(error) }
                }
            },
            {
                body: t.Object({
                    /** 查询文本（用户问题的关键词，不是整段对话） */
                    query: t.String({ minLength: 1, maxLength: 500 }),
                    /** 数据语言 */
                    lang: t.Union(LANGS.map(lang => t.Literal(lang)) as never),
                    /** 数据包清单里的 RAG 内容指纹：**按语料种类分别**给出（内容校验用） */
                    fingerprints: t.Record(t.String({ minLength: 1, maxLength: 32 }), t.String({ minLength: 1, maxLength: 64 })),
                    /** 返回条数上限 */
                    limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
                }),
            }
        )
