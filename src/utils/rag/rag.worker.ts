/**
 * RAG 索引 Worker：把切词与倒排索引构建（中文全量约 1s）从主线程挪走。
 *
 * ⚠️ Worker 有独立的模块图，**不能 import 数据模块**（`@/data/d/**`）：
 * 生产构建里数据模块被改写成「空 fallback + 主线程水合回填」的活绑定，
 * Worker 侧永远是空的。语料 chunk 由主线程切好后分批传进来（见 `corpus.ts`）。
 *
 * 协议（与 `engine.ts` 一一对应）：
 * - `append`：追加一批 chunk（分批是为了让主线程每次序列化只阻塞十几毫秒）
 * - `finalize`：建索引并回报就绪
 * - `search`：执行召回（变体已由主线程做完跨语言扩展）
 * - `dispose`：释放语料
 */

import type { RagChunk } from "@/data/rag/types"
import {
    createIndexedCorpus,
    type RagIndexedCorpus,
    type RagQueryOptions,
    type RagQueryResult,
    type RagVectorChannelHit,
    runRagQuery,
} from "./query"

/** 主线程 → Worker 的消息 */
export type RagWorkerRequest =
    | { type: "append"; lang: string; chunks: RagChunk[] }
    | { type: "finalize"; lang: string }
    | { type: "search"; id: number; lang: string; variants: string[]; options: RagQueryOptions; vectorHits: RagVectorChannelHit[] }
    | { type: "dispose" }

/** Worker → 主线程的消息 */
export type RagWorkerResponse =
    | { type: "built"; lang: string; count: number; buildMs: number }
    | { type: "result"; id: number; result: RagQueryResult }
    | { type: "error"; id?: number; message: string }

/** 已建索引的语料：按语言缓存，最多保留 {@link MAX_CACHED_LANGS} 种 */
const corpora = new Map<string, RagIndexedCorpus>()

/** 正在接收中的 chunk（收到 append 时暂存，finalize 时建索引） */
const pendingChunks = new Map<string, RagChunk[]>()

/** 最多缓存的语言数：单语言索引数十 MB，多语言全留会吃满内存 */
const MAX_CACHED_LANGS = 2

/**
 * 记录语言访问顺序并淘汰最久未用的语料。
 * @param lang 本次使用的语言
 */
function touchLang(lang: string): void {
    if (!corpora.has(lang)) {
        return
    }

    const corpus = corpora.get(lang)!
    corpora.delete(lang)
    corpora.set(lang, corpus)

    while (corpora.size > MAX_CACHED_LANGS) {
        const oldest = corpora.keys().next().value
        if (oldest === undefined) {
            break
        }
        corpora.delete(oldest)
    }
}

/** 回传消息 */
function reply(message: RagWorkerResponse, transfer?: Transferable[]): void {
    ;(self as unknown as Worker).postMessage(message, transfer ?? [])
}

self.onmessage = (event: MessageEvent<RagWorkerRequest>) => {
    const request = event.data

    try {
        switch (request.type) {
            case "append": {
                const list = pendingChunks.get(request.lang) ?? []
                list.push(...request.chunks)
                pendingChunks.set(request.lang, list)
                break
            }
            case "finalize": {
                const chunks = pendingChunks.get(request.lang) ?? []
                const start = performance.now()
                const corpus = createIndexedCorpus(chunks)

                pendingChunks.delete(request.lang)
                corpora.delete(request.lang)
                corpora.set(request.lang, corpus)
                touchLang(request.lang)

                reply({ type: "built", lang: request.lang, count: chunks.length, buildMs: Math.round(performance.now() - start) })
                break
            }
            case "search": {
                const corpus = corpora.get(request.lang)

                if (!corpus) {
                    reply({ type: "error", id: request.id, message: `语言 ${request.lang} 的索引尚未就绪` })
                    break
                }

                touchLang(request.lang)
                reply({
                    type: "result",
                    id: request.id,
                    result: runRagQuery(corpus, request.variants, request.options, request.vectorHits),
                })
                break
            }
            case "dispose": {
                corpora.clear()
                pendingChunks.clear()
                break
            }
        }
    } catch (error) {
        reply({
            type: "error",
            id: request.type === "search" ? request.id : undefined,
            message: error instanceof Error ? error.message : String(error),
        })
    }
}
