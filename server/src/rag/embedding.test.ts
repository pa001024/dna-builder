/**
 * embeddings 客户端的契约测试（stub 掉 fetch，不依赖任何真实渠道）。
 *
 * 覆盖四件会「静默算错」的事：
 * 1. 是否按 `AI_EMBEDDING_DIM` 透传 dimensions（MRL 模型可选维度）；
 * 2. 返回值是否统一 L2 归一化（下游的检索打分都以单位向量为前提）；
 * 3. 上游忽略 dimensions / 维度不一致 / 条数不符 / index 越界时是否直接失败；
 * 4. 契约类与 4xx 错误是否「不重试」立刻抛出（否则一次配错要白等 4 次退避）。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { type EmbeddingConfig, embedAll, embedBatch, resolveEmbeddingConfig } from "./embedding"

/** 一份最小可用配置：url 由 stub 的 fetch 忽略 */
const config: EmbeddingConfig = {
    model: "test/model",
    url: "https://example.test/v1/embeddings",
    apiKey: "sk-test",
}

/** 记录最后一次请求体与总调用次数，便于断言透传参数与重试行为 */
let lastBody: Record<string, unknown> = {}
let callCount = 0

/**
 * 把 fetch stub 成返回给定向量行的实现。
 * @param rows 上游返回的 data 数组（可为任意形状，用于构造异常用例）
 * @param status HTTP 状态码
 */
function stubFetch(rows: unknown[], status = 200): void {
    lastBody = {}
    callCount = 0
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
        callCount++
        lastBody = JSON.parse(`${init.body}`) as Record<string, unknown>

        return new Response(JSON.stringify(status === 200 ? { data: rows } : { message: "boom" }), { status })
    }) as typeof fetch
}

/** 原 fetch 备份，用例结束后恢复 */
const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe("embedBatch", () => {
    test("不配置 dimensions 时不发该参数（老渠道行为不变）", async () => {
        stubFetch([{ index: 0, embedding: [1, 0] }])

        const vectors = await embedBatch(["文本"], { ...config })

        expect("dimensions" in lastBody).toBe(false)
        expect(vectors[0]).toEqual([1, 0])
    })

    test("配置 dimensions 时透传到请求体", async () => {
        stubFetch([
            { index: 0, embedding: [1, 0] },
            { index: 1, embedding: [0, 1] },
        ])

        await embedBatch(["甲", "乙"], { ...config, dimensions: 2 })

        expect(lastBody.dimensions).toBe(2)
    })

    test("返回值一律 L2 归一化成单位向量", async () => {
        stubFetch([{ index: 0, embedding: [3, 4] }])

        const [vector] = await embedBatch(["文本"], { ...config })

        expect(vector).toEqual([0.6, 0.8])
    })

    test("上游忽略 dimensions（返回维度不符）时报错且不重试", async () => {
        stubFetch([{ index: 0, embedding: [1, 0, 0, 0] }])

        await expect(embedBatch(["文本"], { ...config, dimensions: 2 })).rejects.toThrow(/维度/)
        expect(callCount).toBe(1)
    })

    test("同一批内维度不一致时报错", async () => {
        stubFetch([
            { index: 0, embedding: [1, 0] },
            { index: 1, embedding: [1, 0, 0] },
        ])

        await expect(embedBatch(["甲", "乙"], { ...config })).rejects.toThrow(/维度/)
    })

    test("零向量（无法归一化）时报错", async () => {
        stubFetch([{ index: 0, embedding: [0, 0] }])

        await expect(embedBatch(["文本"], { ...config })).rejects.toThrow(/零向量/)
    })

    test("index 越界或条数不符时报错", async () => {
        stubFetch([{ index: 5, embedding: [1, 0] }])
        await expect(embedBatch(["文本"], { ...config })).rejects.toThrow(/越界/)

        stubFetch([{ index: 0, embedding: [1, 0] }])
        await expect(embedBatch(["甲", "乙"], { ...config })).rejects.toThrow(/条数不匹配/)
    })

    test("4xx（模型名 / 维度写错）不重试，5xx 才退避重试", async () => {
        stubFetch([], 400)
        await expect(embedBatch(["文本"], { ...config })).rejects.toThrow(/400/)
        expect(callCount).toBe(1)

        stubFetch([{ index: 0, embedding: [1, 0] }], 500)
        // 5xx 会重试到上限后抛出：这里只断言「重试过不止一次」
        await expect(embedBatch(["文本"], { ...config })).rejects.toThrow(/500/)
        expect(callCount).toBeGreaterThan(1)
    }, 30_000)

    test("index 乱序返回时按 index 重排", async () => {
        stubFetch([
            { index: 1, embedding: [0, 5] },
            { index: 0, embedding: [5, 0] },
        ])

        const vectors = await embedBatch(["甲", "乙"], { ...config })

        expect(vectors[0]).toEqual([1, 0])
        expect(vectors[1]).toEqual([0, 1])
    })

    test("单批超过配置的 batchSize 时报错", async () => {
        stubFetch([{ index: 0, embedding: [1, 0] }])

        await expect(embedBatch(["甲", "乙"], { ...config, batchSize: 1 })).rejects.toThrow(/单批最多 1 条/)
    })
})

describe("embedAll", () => {
    test("按配置的 batchSize 分批（每批一次请求）", async () => {
        // 每批按条数返回等长向量：index 从 0 开始，适配任意批大小
        stubFetch([])
        globalThis.fetch = (async (_url: string, init: RequestInit) => {
            callCount++
            const body = JSON.parse(`${init.body}`) as { input: string[] }
            lastBody = body

            return new Response(JSON.stringify({ data: body.input.map((_text, index) => ({ index, embedding: [1, 0] })) }), { status: 200 })
        }) as typeof fetch

        const vectors = await embedAll(["1", "2", "3", "4", "5"], { config: { ...config, batchSize: 2 } })

        // 5 条按 2 条一批 → 3 次请求，结果顺序与输入一致
        expect(callCount).toBe(3)
        expect(vectors).toHaveLength(5)
        expect(vectors[0]).toEqual([1, 0])
    })
})

describe("resolveEmbeddingConfig", () => {
    /** 与向量化相关的环境变量：用例前后整体快照 / 还原，避免被 .env 或其它用例影响 */
    const ENV_KEYS = [
        "AI_EMBEDDING_MODEL",
        "AI_EMBEDDING_BASE_URL",
        "AI_EMBEDDING_API_KEY",
        "AI_EMBEDDING_DIM",
        "AI_EMBEDDING_BATCH_SIZE",
    ] as const

    const snapshot: Record<string, string | undefined> = {}

    beforeEach(() => {
        for (const key of ENV_KEYS) {
            snapshot[key] = process.env[key]
            delete process.env[key]
        }
    })

    afterEach(() => {
        for (const key of ENV_KEYS) {
            const value = snapshot[key]

            if (value === undefined) {
                delete process.env[key]
            } else {
                process.env[key] = value
            }
        }
    })

    test("三要素缺一不可（端点必填）", () => {
        process.env.AI_EMBEDDING_MODEL = "m"
        process.env.AI_EMBEDDING_API_KEY = "k"
        expect(resolveEmbeddingConfig()).toBeNull()

        process.env.AI_EMBEDDING_BASE_URL = "https://example.test/v1/embeddings"
        expect(resolveEmbeddingConfig()?.batchSize).toBe(256)
    })

    test("dimensions 留空 / 非法时不启用，且不影响其余配置", () => {
        process.env.AI_EMBEDDING_MODEL = "m"
        process.env.AI_EMBEDDING_BASE_URL = "u"
        process.env.AI_EMBEDDING_API_KEY = "k"

        expect(resolveEmbeddingConfig()?.dimensions).toBeUndefined()

        process.env.AI_EMBEDDING_DIM = "abc"
        expect(resolveEmbeddingConfig()?.dimensions).toBeUndefined()

        process.env.AI_EMBEDDING_DIM = "-8"
        expect(resolveEmbeddingConfig()?.dimensions).toBeUndefined()

        expect(resolveEmbeddingConfig()?.model).toBe("m")
    })

    test("dimensions 为合法正整数时生效", () => {
        process.env.AI_EMBEDDING_MODEL = "m"
        process.env.AI_EMBEDDING_BASE_URL = "u"
        process.env.AI_EMBEDDING_API_KEY = "k"
        process.env.AI_EMBEDDING_DIM = "1024"

        expect(resolveEmbeddingConfig()?.dimensions).toBe(1024)
    })

    test("batchSize 默认 256，可配置并在上限内收敛", () => {
        process.env.AI_EMBEDDING_MODEL = "m"
        process.env.AI_EMBEDDING_BASE_URL = "u"
        process.env.AI_EMBEDDING_API_KEY = "k"

        expect(resolveEmbeddingConfig()?.batchSize).toBe(256)

        process.env.AI_EMBEDDING_BATCH_SIZE = "32"
        expect(resolveEmbeddingConfig()?.batchSize).toBe(32)

        // 非法值与超上限都回落到安全值（上游可能限制 input 数组长度）
        process.env.AI_EMBEDDING_BATCH_SIZE = "abc"
        expect(resolveEmbeddingConfig()?.batchSize).toBe(256)

        process.env.AI_EMBEDDING_BATCH_SIZE = "5000"
        expect(resolveEmbeddingConfig()?.batchSize).toBe(1024)
    })
})
