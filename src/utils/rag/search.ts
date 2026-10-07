/**
 * 统一召回（RAG 检索入口）。
 *
 * 一次调用跨语料（剧情台词 / 剧情 AI 总结 / 角色语音 / 角色档案 / 调查墙线索板 / 剧情回顾 / 游戏内百科 / 全库条目）检索，返回「可直接引用的证据」：
 * 命中行正文 + 前后几行的上下文片段 + 出处路径 + 得分与命中原因。
 * 其中剧情 AI 总结是整条任务链的梗概，回答「这条剧情讲了什么」通常一次调用就够，不必再翻台词。
 *
 * 本文件只做主线程侧的三件事：解析语言与参数、把查询扩展成多个变体（跨语言反查）、
 * 把活交给引擎（切词与索引在 Worker 里，见 `engine.ts`）。
 *
 * 与结构化工具的分工：
 * - 本入口负责**召回与排序**（关键词 → 证据），适合「谁说过什么」「哪里提到过」；
 * - `query_module_entries` / `search_story` 负责**按列表页口径穷举与筛选**（facets / 版本），
 *   适合「所有三星成就有哪些」。两者互补，不互相替代。
 */

import type { RagChunkKind } from "@/data/rag/types"
import { RAG_CN_SOURCE_LANG } from "@/data/rag/types"
import { type DBAgentLang, ensureDBAgentLangReady, expandDBAgentKeyword, resolveCurrentDBAgentLang } from "@/utils/db-locale"
import { getRagCorpus } from "./corpus"
import { getRagEngine } from "./engine"
import { RAG_SEARCH_DEFAULT_LIMIT, RAG_SEARCH_MAX_LIMIT, type RagQueryOptions, type RagSearchHit } from "./query"
import { fetchVectorRecall, type RagVectorRecall } from "./vector"

export type { RagSearchHit }
export { RAG_SEARCH_DEFAULT_LIMIT, RAG_SEARCH_MAX_LIMIT }

/** 一次检索的请求参数 */
export interface RagSearchOptions extends RagQueryOptions {
    /** 数据语言 */
    lang?: DBAgentLang
    /** 是否允许使用服务端向量通道（默认允许；不可用时自动退回纯词法） */
    vector?: boolean
}

/** 一次检索的返回 */
export interface RagSearchResult {
    hits: RagSearchHit[]
    /** 命中该查询的候选数（融合去重后） */
    total: number
    /** 提示信息：语言、语料规模、向量通道状态、无命中的建议等 */
    note?: string
}

/**
 * 统一召回：跨语料检索并返回可引用的证据片段。
 *
 * 关键词扩展与语言归一化在主线程完成（需要翻译反向索引），召回本身在引擎里执行（Worker 线程）；
 * 服务端向量通道（可选）先并行发起，拿到锚点后与词法结果一起做 RRF 融合。
 * @param query 查询文本（自然语言或关键词）
 * @param options 检索参数
 * @returns 召回结果
 */
export async function ragSearch(query: string, options: RagSearchOptions = {}): Promise<RagSearchResult> {
    const lang = options.lang ?? resolveCurrentDBAgentLang()
    const trimmed = query.trim()

    await ensureDBAgentLangReady(lang)
    const corpus = await getRagCorpus(lang)

    if (!trimmed) {
        return {
            hits: [],
            total: 0,
            note: `关键词为空。当前语料（${lang}）共 ${corpus.chunks.length} 条：剧情台词、剧情 AI 总结、角色语音、角色档案、调查墙线索板、剧情回顾、游戏内百科与全库条目。`,
        }
    }

    // 向量通道与词法召回并行：它要走一次网络，不占主线程也不该串行等待
    const vectorPromise: Promise<RagVectorRecall> =
        options.vector === false ? Promise.resolve({ hits: [] }) : fetchVectorRecall({ query: trimmed, lang })

    // 其他语言提问时，先把译文映射回游戏原文，再逐变体召回
    const variants = expandDBAgentKeyword(trimmed, lang)
    const vector = await vectorPromise
    const result = await getRagEngine().search(
        lang,
        variants,
        {
            kinds: options.kinds as RagChunkKind[] | undefined,
            modules: options.modules,
            version: options.version,
            limit: options.limit,
            contextLines: options.contextLines,
        },
        vector.hits
    )

    const notes: string[] = [`数据语言：${lang}，语料 ${corpus.chunks.length} 条`]

    if (variants.length > 1) {
        notes.push(`已按译文反查扩展出 ${variants.length - 1} 个原文写法`)
    }

    // 总结、线索板、剧情回顾与百科只有中文正文：其他语言提问时命中它会是中文原文，模型需要如实说明而不是当成该语言的原文
    if (lang !== RAG_CN_SOURCE_LANG) {
        notes.push(
            `剧情 AI 总结（summary）、调查墙线索板（clue）、剧情回顾（review）与游戏内百科（wiki）只有中文原文（${RAG_CN_SOURCE_LANG}），命中时按中文引用`
        )
    }

    if (vector.hits.length) {
        notes.push(`向量通道召回 ${vector.hits.length} 条候选（已与关键词结果融合）`)
    } else if (options.vector !== false && vector.unavailable) {
        notes.push(vector.unavailable)
    }

    if (!result.hits.length) {
        notes.push("没有命中任何语料。可换更具体的名称或术语，或改用 query_module_entries 按分类穷举。")
    }

    return { hits: result.hits, total: result.total, note: notes.join("；") }
}
