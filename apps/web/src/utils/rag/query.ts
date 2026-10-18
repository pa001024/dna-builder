/**
 * 召回执行核心（Worker 与进程内两条路径共用）。
 *
 * ⚠️ 本文件**必须保持 Worker 安全**：只依赖纯函数与词法索引，
 * 不得 import 数据模块（`@/data/d/**`）——生产构建里数据模块被改写成
 * 「空 fallback + 主线程水合回填」的活绑定，在 Worker 的独立模块图里永远是空的。
 * 语料（chunk）由主线程切好后传进来。同样原因，{@link ./lexical} 与 {@link ./tokenize}
 * 也遵循这条约束。
 */

import type { RagChunk, RagChunkKind } from "@/data/rag/types"
import { buildLexicalIndex, type RagLexicalIndex, searchLexical } from "./lexical"

/** 单次检索的默认返回条数 */
export const RAG_SEARCH_DEFAULT_LIMIT = 8

/** 单次检索允许的最大条数 */
export const RAG_SEARCH_MAX_LIMIT = 30

/** 每个查询变体保留的候选数：融合前先各自多召回一些，避免融合后候选过窄 */
const RECALL_PER_VARIANT = 60

/** 上下文片段的默认前后行数 */
const DEFAULT_CONTEXT_LINES = 2

/** 片段文本上限（超出截断，避免一条结果吃掉整个上下文窗口） */
const SNIPPET_LIMIT = 600

/** 命中行正文上限 */
const TEXT_LIMIT = 320

/**
 * 长文类正文（剧情 AI 总结 / 剧情回顾 / 游戏内百科）的正文上限。
 *
 * 这类 chunk 本身就是「一段完整的梗概 / 词条正文」（总结实测 139 条：中位 212 字、最长 297 字；
 * 剧情回顾同理是一段段剧情梗概，百科正文段亦为成段说明），按台词行的 320 字口径截断会把它拦腰砍断，
 * 反而失去「一次看懂整段剧情 / 词条」的价值。
 */
const SUMMARY_TEXT_LIMIT = 400

/**
 * 同一标题在结果里的出现上限。
 *
 * 剧情里同一个说话人可能命中几百条台词，若不加约束，一次检索会整屏都是同一个人的短台词，
 * 模型既看不到条目也看不到别的证据。这里做一次多样性约束（超出上限的先跳过），
 * 结果不足时再回填，保证条数不受影响。
 */
const MAX_HITS_PER_TITLE = 2

/** 一次召回请求的参数（变体已由主线程做完跨语言扩展） */
export interface RagQueryOptions {
    /** 限定语料种类；缺省为全部语料 */
    kinds?: RagChunkKind[]
    /** 限定条目模块（char / weapon / mod / charprofile…） */
    modules?: string[]
    /** 限定版本号（剧情任务链与可版本化条目） */
    version?: string
    /** 返回条数上限 */
    limit?: number
    /** 上下文片段的前后行数 */
    contextLines?: number
}

/** 一条召回结果 */
export interface RagSearchHit {
    /** 锚点（双端一致的语料标识，也用于向量通道对齐） */
    anchor: string
    /** 语料种类 */
    kind: RagChunkKind
    /** 条目模块（仅 entry） */
    module?: string
    /** 条目 id（仅 entry） */
    entityId?: string
    /** 标题：说话人 / 语音名 / 条目名 / 任务链名（summary） */
    title: string
    /** 命中行正文（截断后；summary 为整链梗概） */
    text: string
    /** 带上下文的片段（剧情为同任务内前后若干行；条目与总结为副信息 + 正文） */
    snippet: string
    /** 结构化伴随信息：任务名 / 篇章 / 章节 / 类别 */
    meta: string
    /** 跳转路径 */
    path: string
    /** 版本号 */
    version?: string
    /** 融合后的得分（跨语言多路召回时是 RRF 分，否则是 BM25 分） */
    score: number
    /** 命中原因：整串短语 / 标题 / 词袋（多路召回时可能同时命中多种） */
    matchedBy: string[]
}

/** 一次召回的返回 */
export interface RagQueryResult {
    hits: RagSearchHit[]
    /** 命中该查询的候选数（融合去重后） */
    total: number
}

/** 已建好索引的语料 */
export interface RagIndexedCorpus {
    /** 语料 chunk（顺序即剧情顺序，用于上下文扩展） */
    chunks: readonly RagChunk[]
    /** 词法索引 */
    index: RagLexicalIndex
    /** 锚点 → chunk 下标（命中后取邻居拼片段用；建索引时一次性建好，避免每次查询都重建） */
    positions: ReadonlyMap<string, number>
}

/**
 * 为语料建词法索引。
 * @param chunks 语料 chunk
 * @returns 可检索的语料
 */
export function createIndexedCorpus(chunks: readonly RagChunk[]): RagIndexedCorpus {
    return {
        chunks,
        index: buildLexicalIndex(chunks),
        positions: new Map(chunks.map((chunk, position) => [chunk.anchor, position])),
    }
}

/**
 * 截断文本。
 * @param text 原始文本
 * @param limit 长度上限
 * @returns 截断后的文本
 */
function truncate(text: string, limit: number): string {
    return text.length > limit ? `${text.slice(0, limit)}…` : text
}

/**
 * 判断 chunk 是否符合本次检索的范围条件。
 * @param chunk 语料 chunk
 * @param kinds 允许的种类集合（null 表示不限）
 * @param modules 允许的条目模块集合（null 表示不限）
 * @param version 版本号（空表示不限）
 * @returns 是否符合
 */
function matchScope(
    chunk: RagChunk,
    kinds: ReadonlySet<RagChunkKind> | null,
    modules: ReadonlySet<string> | null,
    version: string
): boolean {
    if (kinds && !kinds.has(chunk.kind)) {
        return false
    }

    // 模块条件只作用于带模块归属的语料（条目与角色档案）：剧情、总结与语音没有模块，不该被它排除掉
    if (modules && (chunk.kind === "entry" || chunk.kind === "profile") && chunk.module !== undefined && !modules.has(chunk.module)) {
        return false
    }

    if (version && chunk.version !== version) {
        return false
    }

    return true
}

/**
 * 为剧情命中扩展上下文：取同一任务内的前后若干行拼成片段。
 * @param corpus 语料
 * @param position 命中 chunk 的下标
 * @param contextLines 前后行数
 * @returns 片段文本
 */
function buildStorySnippet(corpus: RagIndexedCorpus, position: number, contextLines: number): string {
    const hit = corpus.chunks[position]!
    const lines: string[] = []

    for (let offset = -contextLines; offset <= contextLines; offset++) {
        const neighbor = corpus.chunks[position + offset]

        // 同一任务（path 相同）才纳入上下文：跨任务拼接会把不相干的台词混进来
        if (neighbor?.kind !== "story" || neighbor.path !== hit.path) {
            continue
        }

        const prefix = offset === 0 ? "> " : "  "
        const speaker = neighbor.title ? `${neighbor.title}：` : ""

        lines.push(`${prefix}${speaker}${neighbor.text}`)
    }

    return truncate(lines.join("\n"), SNIPPET_LIMIT)
}

/**
 * 对已排序的候选做标题多样性约束。
 * @param ordered 已按得分排序的候选
 * @param limit 需要返回的条数
 * @returns 约束后的候选（不足 limit 时用被跳过的候选取前补足）
 */
function diversifyByTitle<T extends { chunk: RagChunk }>(ordered: T[], limit: number): T[] {
    const counts = new Map<string, number>()
    const picked: T[] = []
    const skipped: T[] = []

    for (const item of ordered) {
        // 没有说话人的行（旁白）没有「同一主体刷屏」的问题，按锚点算唯一键即不参与约束
        const key = item.chunk.title ? `${item.chunk.kind}:${item.chunk.title}` : item.chunk.anchor
        const used = counts.get(key) ?? 0

        if (used >= MAX_HITS_PER_TITLE) {
            skipped.push(item)
            continue
        }

        counts.set(key, used + 1)
        picked.push(item)
    }

    const result = picked.slice(0, limit)

    // 被多样性约束跳过的候选在结果不足时回填，避免「因为约束而少给结果」
    if (result.length < limit) {
        result.push(...skipped.slice(0, limit - result.length))
    }

    return result
}

/** 一条向量召回结果（与 `vector.ts` 的服务端返回一致） */
export interface RagVectorChannelHit {
    /** 语料锚点 */
    anchor: string
    /** 余弦相似度 */
    score: number
}

/** 向量通道在 RRF 融合里的权重：与单个词法变体同权 */
const VECTOR_CHANNEL_WEIGHT = 1.0

/**
 * 在已建索引的语料上执行一次召回。
 *
 * 召回过程：
 * 1. 每个查询变体各跑一次 BM25（变体由主线程做跨语言扩展后传入）；
 * 2. 服务端向量通道（可选）的锚点也作为一路召回并入；
 * 3. 只有「单变体且无向量」时才直接按 BM25 分数排序；其余情况用 RRF 按名次融合
 *    （BM25 与余弦相似度不可比，跨语言各路召回力度也不同，按名次融合最稳）；
 * 4. 剧情命中补上前后若干行作为片段，条目命中给出副信息。
 * @param corpus 已建索引的语料
 * @param variants 查询变体（首个为原查询）
 * @param options 检索参数
 * @param vectorHits 向量通道命中的锚点（可为空）
 * @returns 命中与候选数
 */
export function runRagQuery(
    corpus: RagIndexedCorpus,
    variants: readonly string[],
    options: RagQueryOptions = {},
    vectorHits: readonly RagVectorChannelHit[] = []
): RagQueryResult {
    const limit = Math.min(Math.max(options.limit ?? RAG_SEARCH_DEFAULT_LIMIT, 1), RAG_SEARCH_MAX_LIMIT)
    const contextLines = Math.min(Math.max(options.contextLines ?? DEFAULT_CONTEXT_LINES, 0), 5)
    const queries = variants.map(variant => variant.trim()).filter(Boolean)

    if (!queries.length) {
        return { hits: [], total: 0 }
    }

    // 模块条件与种类条件的默认关系：只说模块就等于只说带模块归属的语料（条目 + 角色档案），
    // 否则模型按 list_data_modules 里的 charprofile 传 modules 时会一条都召不到
    const kinds = options.kinds?.length
        ? new Set(options.kinds)
        : options.modules?.length
          ? new Set<RagChunkKind>(["entry", "profile"])
          : null
    const modules = options.modules?.length ? new Set(options.modules) : null
    const version = options.version?.trim() ?? ""
    const filter = (chunk: RagChunk) => matchScope(chunk, kinds, modules, version)

    // chunk 下标表：命中结果要按下标取邻居拼片段
    const positions = corpus.positions

    /** 候选合并表：锚点 → 融合状态 */
    const merged = new Map<
        string,
        { chunk: RagChunk; position: number; rrf: number; best: number; bestVector: number; matchedBy: Set<string> }
    >()

    /** 写入或累加一条候选 */
    const accumulate = (anchor: string, rank: number, source: string, lexicalScore: number, weight: number, vectorScore = 0) => {
        const position = positions.get(anchor)

        if (position === undefined) {
            return
        }

        const chunk = corpus.chunks[position]

        if (!chunk || !filter(chunk)) {
            return
        }

        const existing = merged.get(anchor)

        if (existing) {
            existing.rrf += weight / (60 + rank)
            existing.best = Math.max(existing.best, lexicalScore)
            existing.bestVector = Math.max(existing.bestVector, vectorScore)
            existing.matchedBy.add(source)

            return
        }

        merged.set(anchor, {
            chunk,
            position,
            rrf: weight / (60 + rank),
            best: lexicalScore,
            bestVector: vectorScore,
            matchedBy: new Set([source]),
        })
    }

    for (const query of queries) {
        searchLexical(corpus.index, query, { limit: RECALL_PER_VARIANT, filter }).forEach((hit, rank) => {
            accumulate(hit.chunk.anchor, rank, hit.matchedBy, hit.score, 1)
        })
    }

    vectorHits.forEach((hit, rank) => {
        // 锚点必须能落到本地语料：服务端索引与本地数据包版本一致时才有意义
        if (positions.has(hit.anchor)) {
            accumulate(hit.anchor, rank, "vector", 0, VECTOR_CHANNEL_WEIGHT, hit.score)
        }
    })

    // 单变体且无向量命中时保留 BM25 原始分数排序（分数本身有量纲意义，便于调试与阈值判断）
    const useRrf = queries.length > 1 || vectorHits.length > 0
    const ordered = [...merged.values()]
        .map(item => ({ ...item, finalScore: useRrf ? item.rrf : item.best }))
        .sort((a, b) => b.finalScore - a.finalScore || b.best - a.best || b.bestVector - a.bestVector)

    const hits: RagSearchHit[] = diversifyByTitle(ordered, limit).map(item => {
        const chunk = item.chunk
        const snippet =
            chunk.kind === "story"
                ? buildStorySnippet(corpus, item.position, contextLines)
                : truncate([chunk.meta, chunk.text].filter(Boolean).join(" · "), SNIPPET_LIMIT)

        return {
            anchor: chunk.anchor,
            kind: chunk.kind,
            module: chunk.module,
            entityId: chunk.entityId,
            title: chunk.title,
            text: truncate(
                chunk.text,
                chunk.kind === "summary" || chunk.kind === "review" || chunk.kind === "wiki" ? SUMMARY_TEXT_LIMIT : TEXT_LIMIT
            ),
            snippet,
            meta: chunk.meta,
            path: chunk.path,
            version: chunk.version,
            score: Number(item.finalScore.toFixed(4)),
            matchedBy: [...item.matchedBy],
        }
    })

    return { hits, total: merged.size }
}
