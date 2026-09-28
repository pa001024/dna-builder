/**
 * RAG 检索接口的鉴权、内容指纹校验与后台构建触发测试。
 *
 * 用 Elysia 的 `handle()` 在进程内直接打请求，不占端口；
 * embeddings 接口用桩替换，测试不产生任何外网调用。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { Elysia } from "elysia"
import jwt from "jsonwebtoken"
import { RAG_CHUNK_SCHEMA_VERSION } from "../../../src/data/rag/types"
import { ragPlugin } from "../api/rag"
import { jwtToken } from "../db/yoga"
import { waitForBuildIdle, warmCurrentFingerprints } from "./build"
import { LOCAL_VECTOR_STORE_TAG, openIndexForBuild, RAG_INDEX_SCHEMA_VERSION } from "./duckstore"
import { clearVectorCache } from "./search"

/** 测试索引位置与固定内容指纹 */
const TEMP_DIR = resolve(import.meta.dir, "../../data/test-rag-api")
const INDEX_PATH = resolve(TEMP_DIR, "rag-index.duckdb")
/** 服务端当前数据的种类指纹（beforeEach 预热后填充：索引里就写它，客户端也发它） */
let currentFingerprints: Record<string, string> = {}

/** 维度取小值，便于手写向量与断言 */
const DIMS = 4

/** 原始的 fetch：测试结束后还原，避免影响同进程其它用例 */
const originalFetch = globalThis.fetch

/** 已记录的 embeddings 请求次数，用于确认「指纹不符时根本不调用向量化」 */
let embeddingCalls = 0

/**
 * 造一个索引库并换到线上位置。
 * @param options.model 写入 meta 的模型名
 * @param options.lang 向量所属语言
 * @param options.fingerprint 该语言的内容指纹
 */
async function buildIndex(options: { model: string; lang: string; fingerprints?: Record<string, string> }): Promise<void> {
    const db = await openIndexForBuild(INDEX_PATH)

    await db.writeMeta({
        schemaVersion: RAG_INDEX_SCHEMA_VERSION,
        chunkSchemaVersion: RAG_CHUNK_SCHEMA_VERSION,
        model: options.model,
        dims: DIMS,
        fingerprints: { [options.lang]: options.fingerprints ?? currentFingerprints },
        builtAt: new Date().toISOString(),
        vectorStore: LOCAL_VECTOR_STORE_TAG,
        state: "ready",
        chunkCount: 2,
    })

    await db.insertVectors(
        [
            {
                anchor: "story:1:2:d3",
                lang: options.lang,
                fingerprint: (options.fingerprints ?? currentFingerprints).story!,
                kind: "story",
                hash: "h1",
                vector: [1, 0, 0, 0],
            },
            {
                anchor: "story:1:2:d4",
                lang: options.lang,
                fingerprint: (options.fingerprints ?? currentFingerprints).story!,
                kind: "story",
                hash: "h2",
                vector: [0, 1, 0, 0],
            },
        ],
        DIMS
    )

    await db.commit()
}

/** 与向量化 / 远端向量库相关的环境变量：用例前后整体快照并清空，避免被 .env 或其它用例影响 */
const EMBEDDING_ENV_KEYS = [
    "AI_EMBEDDING_MODEL",
    "AI_EMBEDDING_BASE_URL",
    "AI_EMBEDDING_API_KEY",
    "AI_EMBEDDING_DIM",
    "AI_EMBEDDING_BATCH_SIZE",
    "AI_EMBEDDING_LANG",
    "AI_EMBEDDING_SERVER_ENDPOINT",
    "AI_EMBEDDING_SERVER_API_KEY",
    "AI_EMBEDDING_SERVER_COLLECTION",
] as const

/** 清空向量化相关环境变量前的快照 */
const embeddingEnvSnapshot: Record<string, string | undefined> = {}

/** 清空向量化相关环境变量（用例自己设置所需的值） */
function clearEmbeddingEnv(): void {
    for (const key of EMBEDDING_ENV_KEYS) {
        embeddingEnvSnapshot[key] = process.env[key]
        delete process.env[key]
    }
}

/** 还原向量化相关环境变量 */
function restoreEmbeddingEnv(): void {
    for (const key of EMBEDDING_ENV_KEYS) {
        const value = embeddingEnvSnapshot[key]

        if (value === undefined) {
            delete process.env[key]
        } else {
            process.env[key] = value
        }
    }
}

/** 测试用令牌 */
const token = jwt.sign({ id: "test-user", name: "测试账号", roles: ["user"] }, jwtToken)

/** 测试用应用实例 */
const app = new Elysia().use(ragPlugin())

/**
 * 发起一次请求。
 * @param path 路径
 * @param init 请求初始化
 * @returns 状态码与响应体
 */
async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await app.handle(new Request(`http://localhost${path}`, init))

    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

beforeEach(async () => {
    // 启动预热的等价物：算一次「当前数据指纹」并缓存（请求路径只做比较，不再装配语料）
    process.env.RAG_INDEX_DB = INDEX_PATH
    // 隔离 .env 里的真实配置：用例自带模型名、4 维索引与本地向量库，
    // 尤其不能被 AI_EMBEDDING_SERVER_* 带进真实远端向量库
    clearEmbeddingEnv()
    rmSync(TEMP_DIR, { recursive: true, force: true })
    mkdirSync(TEMP_DIR, { recursive: true })
    clearVectorCache()
    embeddingCalls = 0
    process.env.AI_EMBEDDING_MODEL = "test-model"
    process.env.AI_EMBEDDING_BASE_URL = "https://example.test/v1/embeddings"
    // 预热拿到的就是「服务端当前数据」的指纹：用真实值当索引里的指纹，才能覆盖「一致 → 服务」这条路径
    currentFingerprints = (await warmCurrentFingerprints(["zh"])).find(item => item.lang === "zh")!.kinds

    // 桩：把查询文本映射成 [1,0,0,0]，于是「story:1:2:d3」应当排第一
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).includes("embeddings")) {
            throw new Error(`测试不应请求 ${String(input)}`)
        }

        embeddingCalls++

        // 按输入条数返回等长向量：指纹不符时后台会真的跑一次构建，条数不符会让它白跑
        const body = JSON.parse(`${init?.body ?? "{}"}`) as { input?: string[] }
        const rows = (body.input ?? []).map((_text, index) => ({ index, embedding: [1, 0, 0, 0] }))

        return new Response(JSON.stringify({ data: rows }), { status: 200 })
    }) as typeof fetch
})

afterEach(async () => {
    // 指纹不符会真的排队一个后台构建：先等它跑完，否则它会带着「下一个测试的索引路径」继续写库
    await waitForBuildIdle()
    globalThis.fetch = originalFetch
    delete process.env.RAG_INDEX_DB
    restoreEmbeddingEnv()
    clearVectorCache()
    rmSync(TEMP_DIR, { recursive: true, force: true })
})

describe("GET /api/v1/rag/status", () => {
    test("索引就绪时报告可用、指纹与构建状态", async () => {
        process.env.AI_EMBEDDING_MODEL = "test-model"
        process.env.AI_EMBEDDING_BASE_URL = "https://example.test/v1/embeddings"
        process.env.AI_EMBEDDING_API_KEY = "sk-test"
        await buildIndex({ model: "test-model", lang: "zh" })

        const { status, body } = await call("/api/v1/rag/status")

        expect(status).toBe(200)
        expect(body.available).toBe(true)
        expect(body.fingerprints).toEqual({ zh: currentFingerprints })
        expect(body.dims).toBe(DIMS)
        expect(body.chunk_count).toBe(2)
        expect((body.build as { running: boolean }).running).toBe(false)
        // 向量库后端在状态里可见（本地模式 / 远端 DashVector 模式）
        expect((body.vector_store as { kind: string }).kind).toBe("local")
        expect(body.current_fingerprints).toBeDefined()
    })

    test("模型变化导致索引失效时报告不可用并给出原因", async () => {
        process.env.AI_EMBEDDING_MODEL = "test-model"
        process.env.AI_EMBEDDING_BASE_URL = "https://example.test/v1/embeddings"
        process.env.AI_EMBEDDING_API_KEY = "sk-test"
        await buildIndex({ model: "另一个模型", lang: "zh" })

        const { body } = await call("/api/v1/rag/status")

        expect(body.available).toBe(false)
        expect(String(body.reason)).toContain("向量模型不符")
    })
})

describe("POST /api/v1/rag/search", () => {
    beforeEach(() => {
        process.env.AI_EMBEDDING_MODEL = "test-model"
        process.env.AI_EMBEDDING_BASE_URL = "https://example.test/v1/embeddings"
        process.env.AI_EMBEDDING_API_KEY = "sk-test"
    })

    test("未登录返回 401，且不触发向量化", async () => {
        await buildIndex({ model: "test-model", lang: "zh" })

        const { status, body } = await call("/api/v1/rag/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: "黎瑟", lang: "zh", fingerprints: currentFingerprints }),
        })

        expect(status).toBe(401)
        expect(body.error).toBe("unauthorized")
        expect(embeddingCalls).toBe(0)
    })

    test("客户端数据包不是最新（指纹 ≠ 当前数据）返回 409 stale_pack，且不触发构建", async () => {
        await buildIndex({ model: "test-model", lang: "zh" })

        const { status, body } = await call("/api/v1/rag/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({ query: "黎瑟", lang: "zh", fingerprints: { story: "旧指纹", voice: "旧指纹" } }),
        })

        expect(status).toBe(409)
        expect(body.error).toBe("stale_pack")
        expect(body.stale_kinds).toEqual([])
        // 关键：客户端拿的是旧数据包，服务端没有对应内容可建——不触发任何构建
        expect(body.building).toBe(false)
        expect(embeddingCalls).toBe(0)
    })

    test("索引落后于当前数据时返回 409 index_building 并排队后台构建", async () => {
        // 索引里记的是上一代指纹（客户端发的才是当前数据指纹）
        await buildIndex({ model: "test-model", lang: "zh", fingerprints: { story: "old-story", voice: "old-voice" } })

        const { status, body } = await call("/api/v1/rag/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({ query: "黎瑟", lang: "zh", fingerprints: currentFingerprints }),
        })

        expect(status).toBe(409)
        expect(body.error).toBe("index_building")
        expect((body.stale_kinds as string[]).length).toBeGreaterThan(0)
        expect(body.building).toBe(true)
        // 本次不做向量检索（构建在后台跑，下一次请求就能命中）
        expect(embeddingCalls).toBe(0)
    }, 30_000)

    test("索引不可用（模型换了）返回 503，并排队后台重建", async () => {
        await buildIndex({ model: "另一个模型", lang: "zh" })

        const { status, body } = await call("/api/v1/rag/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({ query: "黎瑟", lang: "zh", fingerprints: currentFingerprints }),
        })

        expect(status).toBe(503)
        expect(body.error).toBe("index_unavailable")
        // 模型 / 维度 / 表结构这类变化只能靠重建修好：请求路径要把构建顶起来（手工 CLI 已删除）
        expect(body.building).toBe(true)
        // 本次不做检索
        expect(embeddingCalls).toBe(0)
    }, 60_000)

    test("指纹一致时返回按相似度排序的锚点", async () => {
        await buildIndex({ model: "test-model", lang: "zh" })

        const { status, body } = await call("/api/v1/rag/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({ query: "黎瑟", lang: "zh", fingerprints: currentFingerprints }),
        })

        expect(status).toBe(200)
        expect(body.served_kinds).toEqual(Object.keys(currentFingerprints))

        const results = body.results as Array<{ anchor: string; score: number }>
        expect(results.length).toBe(2)
        // 查询向量是 [1,0,0,0]，只有 d3 的向量与它同向
        expect(results[0]!.anchor).toBe("story:1:2:d3")
        expect(results[0]!.score).toBeGreaterThan(results[1]!.score)
        expect(embeddingCalls).toBe(1)
    })

    test("只有部分种类过期时，指纹相符的种类照常提供向量", async () => {
        // 索引里 story 是上一代（已过期），voice 与当前一致：客户端发的都是当前指纹
        const db = await openIndexForBuild(INDEX_PATH)

        await db.writeMeta({
            schemaVersion: RAG_INDEX_SCHEMA_VERSION,
            chunkSchemaVersion: RAG_CHUNK_SCHEMA_VERSION,
            model: "test-model",
            dims: DIMS,
            fingerprints: { zh: { story: "old-story", voice: currentFingerprints.voice! } },
            builtAt: new Date().toISOString(),
            vectorStore: LOCAL_VECTOR_STORE_TAG,
            state: "ready",
            chunkCount: 1,
        })
        await db.insertVectors(
            [
                {
                    anchor: "voice:1001:7",
                    lang: "zh",
                    fingerprint: currentFingerprints.voice!,
                    kind: "voice",
                    hash: "v1",
                    vector: [1, 0, 0, 0],
                },
                { anchor: "story:1:2:d3", lang: "zh", fingerprint: "old-story", kind: "story", hash: "h1", vector: [1, 0, 0, 0] },
            ],
            DIMS
        )
        await db.commit()
        clearVectorCache()

        const { status, body } = await call("/api/v1/rag/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({ query: "黎瑟", lang: "zh", fingerprints: currentFingerprints }),
        })

        expect(status).toBe(200)
        // 只有指纹相符的种类参与检索：story 已过期，它的向量不返回
        expect(body.served_kinds).toEqual(["voice"])
        expect((body.pending_kinds as string[]).includes("story")).toBe(true)

        const results = body.results as Array<{ anchor: string }>
        expect(results.map(item => item.anchor)).toEqual(["voice:1001:7"])
    }, 60_000)

    test("该语言尚未建过索引时排队构建，本次退回词法", async () => {
        await buildIndex({ model: "test-model", lang: "zh" })
        const english = (await warmCurrentFingerprints(["en"])).find(item => item.lang === "en")!.kinds

        const { status, body } = await call("/api/v1/rag/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({ query: "Rhythm", lang: "en", fingerprints: english }),
        })

        expect(status).toBe(409)
        expect(body.error).toBe("index_building")
        expect((body.stale_kinds as string[]).length).toBeGreaterThan(0)
        expect(body.building).toBe(true)
        expect(embeddingCalls).toBe(0)
    }, 120_000)
})
