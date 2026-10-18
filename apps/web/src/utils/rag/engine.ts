/**
 * RAG 检索引擎：把「索引构建 + 召回」放到 Worker，主线程只负责读数据与切块。
 *
 * 为什么必须是 Worker：中文全量语料（剧情 19k 行 + 条目 7.6k + 语音 1.2k）的
 * 切词与倒排构建实测约 0.7~1.0s，放在主线程就是一次可见的掉帧/卡顿。
 * 主线程侧的固定成本只有切块（实测约 60ms）与分批传参（每批十几毫秒），
 * 两者都夹在空闲回调之间执行。
 *
 * 双路径：无 Worker 环境（vitest、SSG 预渲染、老浏览器）自动退回进程内引擎，
 * 行为与 Worker 路径完全一致——两边共用 `query.ts` 的实现。
 */

import type { RagChunk } from "@/data/rag/types"
import type { DBAgentLang } from "@/utils/db-locale"
import {
    createIndexedCorpus,
    type RagIndexedCorpus,
    type RagQueryOptions,
    type RagQueryResult,
    type RagVectorChannelHit,
    runRagQuery,
} from "./query"
import type { RagWorkerRequest, RagWorkerResponse } from "./rag.worker"

/** 主线程可用的检索引擎 */
export interface RagEngine {
    /**
     * 确保某个语言的索引就绪（幂等：已就绪或正在构建时复用同一次构建）。
     * @param lang 数据语言
     * @param chunks 语料（主线程切好）
     */
    ready(lang: DBAgentLang, chunks: readonly RagChunk[]): Promise<void>
    /**
     * 执行召回。
     * @param lang 数据语言
     * @param variants 查询变体（首个为原查询，其余为跨语言扩展结果）
     * @param options 检索参数
     * @param vectorHits 服务端向量通道命中的锚点（可选，参与 RRF 融合）
     */
    search(
        lang: DBAgentLang,
        variants: readonly string[],
        options: RagQueryOptions,
        vectorHits?: readonly RagVectorChannelHit[]
    ): Promise<RagQueryResult>
    /** 释放全部缓存（数据包换版时调用） */
    reset(): void
}

/** 传给 Worker 的单批 chunk 数：每批约 4k 条，序列化耗时十几毫秒 */
const CHUNK_BATCH_SIZE = 4000

/**
 * Worker 引擎。
 */
class WorkerRagEngine implements RagEngine {
    private worker: Worker | null = null
    /** 已就绪（或构建中）的语言 */
    private readonly languages = new Map<DBAgentLang, Promise<void>>()
    /** 等待回包的请求：请求 id → 回调 */
    private readonly pending = new Map<number, { resolve: (result: RagQueryResult) => void; reject: (error: Error) => void }>()
    /** 请求 id 分配器 */
    private nextId = 1

    /**
     * 懒创建 Worker 并挂上消息处理。
     * @returns Worker 实例
     */
    private ensureWorker(): Worker {
        if (this.worker) {
            return this.worker
        }

        const worker = new Worker(new URL("./rag.worker.ts", import.meta.url), { type: "module" })

        worker.onmessage = (event: MessageEvent<RagWorkerResponse>) => {
            const message = event.data

            if (message.type === "result" || (message.type === "error" && message.id !== undefined)) {
                const waiter = this.pending.get(message.id!)

                if (!waiter) {
                    return
                }

                this.pending.delete(message.id!)

                if (message.type === "result") {
                    waiter.resolve(message.result)
                } else {
                    waiter.reject(new Error(message.message))
                }
            }
        }

        this.worker = worker

        return worker
    }

    /**
     * 分批把语料推给 Worker 并在最后建索引。
     * @param lang 数据语言
     * @param chunks 语料
     */
    private async build(lang: DBAgentLang, chunks: readonly RagChunk[]): Promise<void> {
        const worker = this.ensureWorker()

        for (let start = 0; start < chunks.length; start += CHUNK_BATCH_SIZE) {
            const batch = chunks.slice(start, start + CHUNK_BATCH_SIZE)
            // 分批 + 每批让出一次事件循环：单次序列化阻塞控制在十几毫秒
            worker.postMessage({ type: "append", lang, chunks: batch } satisfies RagWorkerRequest)
            await yieldToBrowser()
        }

        await new Promise<void>(resolve => {
            const onBuilt = (event: MessageEvent<RagWorkerResponse>) => {
                if (event.data.type === "built" && event.data.lang === lang) {
                    worker.removeEventListener("message", onBuilt)
                    resolve()
                }
            }

            worker.addEventListener("message", onBuilt)
            worker.postMessage({ type: "finalize", lang } satisfies RagWorkerRequest)
        })
    }

    /**
     * @inheritdoc
     */
    ready(lang: DBAgentLang, chunks: readonly RagChunk[]): Promise<void> {
        const existing = this.languages.get(lang)

        if (existing) {
            return existing
        }

        const task = this.build(lang, chunks).catch(error => {
            // 构建失败要允许重试：把标记清掉，下次调用重新建
            this.languages.delete(lang)
            throw error
        })

        this.languages.set(lang, task)

        return task
    }

    /**
     * @inheritdoc
     */
    search(
        lang: DBAgentLang,
        variants: readonly string[],
        options: RagQueryOptions,
        vectorHits: readonly RagVectorChannelHit[] = []
    ): Promise<RagQueryResult> {
        const worker = this.ensureWorker()
        const id = this.nextId++

        return new Promise<RagQueryResult>((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
            worker.postMessage({
                type: "search",
                id,
                lang,
                variants: [...variants],
                options,
                vectorHits: [...vectorHits],
            } satisfies RagWorkerRequest)
        })
    }

    /**
     * @inheritdoc
     */
    reset(): void {
        this.languages.clear()

        for (const waiter of this.pending.values()) {
            waiter.reject(new Error("索引已作废"))
        }
        this.pending.clear()

        if (this.worker) {
            this.worker.postMessage({ type: "dispose" } satisfies RagWorkerRequest)
        }
    }
}

/**
 * 进程内引擎：无 Worker 环境下的等价实现（vitest / SSG / 老浏览器）。
 */
class InProcessRagEngine implements RagEngine {
    private readonly corpora = new Map<DBAgentLang, Promise<RagIndexedCorpus>>()

    /**
     * @inheritdoc
     */
    ready(lang: DBAgentLang, chunks: readonly RagChunk[]): Promise<void> {
        if (!this.corpora.has(lang)) {
            this.corpora.set(
                lang,
                Promise.resolve().then(() => {
                    const corpus = createIndexedCorpus(chunks)
                    this.trim()

                    return corpus
                })
            )
        }

        return Promise.resolve()
    }

    /**
     * @inheritdoc
     */
    async search(
        lang: DBAgentLang,
        variants: readonly string[],
        options: RagQueryOptions,
        vectorHits: readonly RagVectorChannelHit[] = []
    ): Promise<RagQueryResult> {
        const corpus = await this.corpora.get(lang)

        if (!corpus) {
            throw new Error(`语言 ${lang} 的索引尚未就绪`)
        }

        return runRagQuery(corpus, variants, options, vectorHits)
    }

    /**
     * @inheritdoc
     */
    reset(): void {
        this.corpora.clear()
    }

    /** 只保留最近两种语言，避免多语言索引同时驻留 */
    private trim(): void {
        while (this.corpora.size > 2) {
            const oldest = this.corpora.keys().next().value
            if (oldest === undefined) {
                break
            }
            this.corpora.delete(oldest)
        }
    }
}

/**
 * 让出一次事件循环（优先空闲回调，避免后台标签页被 setTimeout 钳到 1s）。
 * @returns 让出后的 Promise
 */
export function yieldToBrowser(): Promise<void> {
    if (typeof requestIdleCallback === "function") {
        return new Promise(resolve => requestIdleCallback(() => resolve(), { timeout: 200 }))
    }

    return new Promise(resolve => setTimeout(resolve, 0))
}

/** 当前引擎实例（懒创建） */
let engine: RagEngine | null = null

/**
 * 取检索引擎：浏览器环境用 Worker，其余环境退回进程内实现。
 * @returns 引擎实例
 */
export function getRagEngine(): RagEngine {
    if (engine) {
        return engine
    }

    engine = typeof Worker === "function" ? new WorkerRagEngine() : new InProcessRagEngine()

    return engine
}
