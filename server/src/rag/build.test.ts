/**
 * 自动索引构建的测试（embeddings 走桩，不产生外网调用）。
 *
 * 覆盖：真实构建落库、内容没变时「已是最新」、跨语言同文只嵌入一次、
 * 垃圾回收、单飞排队、语言白名单。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { buildRagChunks } from "../../../src/data/rag/corpus"
import { RAG_CHUNK_SCHEMA_VERSION, ragKindFingerprints } from "../../../src/data/rag/types"
import {
    buildLanguageIndex,
    getBuildSnapshot,
    isLangAllowed,
    requestIndexBuild,
    resolveAllowedLangs,
    SUPPORTED_LANGS,
    waitForBuildIdle,
} from "./build"
import { LOCAL_VECTOR_STORE_TAG, openIndexForBuild, RAG_INDEX_SCHEMA_VERSION, readMetaAt } from "./duckstore"
import { clearVectorCache, searchVectors } from "./search"

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

/** 测试索引位置 */
const TEMP_DIR = resolve(import.meta.dir, "../../data/test-rag-build")
const INDEX_PATH = resolve(TEMP_DIR, "rag-index.duckdb")

/** 原始 fetch：测试结束后还原 */
const originalFetch = globalThis.fetch

/** 已记录的 embeddings 请求次数（断言「内容没变就不重嵌」） */
let embeddingCalls = 0

/**
 * 桩：embeddings 接口按输入条数返回等长的 4 维单位向量。
 * 用维度的奇偶位区分文本，保证向量非零且维度固定。
 */
function stubEmbeddings(): void {
    embeddingCalls = 0

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).includes("embeddings")) {
            throw new Error(`测试不应请求 ${String(input)}`)
        }

        embeddingCalls++

        const body = JSON.parse(`${init?.body ?? "{}"}`) as { input?: string[] }
        const rows = (body.input ?? []).map((text, index) => ({
            index,
            embedding: [1, text.length % 7 === 0 ? 1 : 0, 0, 0],
        }))

        return new Response(JSON.stringify({ data: rows }), { status: 200 })
    }) as typeof fetch
}

beforeEach(async () => {
    // 上一个测试文件可能留下后台构建任务：先排空，避免它带着本文件的索引路径继续写库
    await waitForBuildIdle()
    process.env.RAG_INDEX_DB = INDEX_PATH
    // 测试自带 4 维索引与桩向量化：屏蔽 .env 里的真实配置（含远端向量库）
    clearEmbeddingEnv()
    process.env.AI_EMBEDDING_MODEL = "test-model"
    process.env.AI_EMBEDDING_BASE_URL = "https://example.test/v1/embeddings"
    process.env.AI_EMBEDDING_API_KEY = "sk-test"
    process.env.AI_EMBEDDING_BATCH_SIZE = "512"
    rmSync(TEMP_DIR, { recursive: true, force: true })
    mkdirSync(TEMP_DIR, { recursive: true })
    stubEmbeddings()
})

afterEach(() => {
    globalThis.fetch = originalFetch
    restoreEmbeddingEnv()
    // 先关掉 DuckDB 缓存实例再删目录：Windows 上打开中的文件删不掉
    clearVectorCache()
    rmSync(TEMP_DIR, { recursive: true, force: true })
})

describe("远端向量库（DashVector）", () => {
    /** 远端收到的文档与查询次数 */
    let remoteDocs = 0
    let remoteQueries = 0

    beforeEach(() => {
        process.env.AI_EMBEDDING_SERVER_ENDPOINT = "dv.example.test"
        process.env.AI_EMBEDDING_SERVER_API_KEY = "sk-dv"
        process.env.AI_EMBEDDING_SERVER_COLLECTION = "dbagent"
        remoteDocs = 0
        remoteQueries = 0

        // 按 URL 分流：embeddings 走桩向量，DashVector 的 /docs 与 /query 各自应答
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)

            if (url.includes("dashvector") || url.includes("dv.example.test")) {
                const method = init?.method ?? "GET"

                if (url.endsWith("/query")) {
                    remoteQueries++

                    // 远端给的是距离（cosine：同向 0、正交 1），这里给 0.1 → 相似度 0.9
                    return new Response(
                        JSON.stringify({ code: 0, output: [{ id: "story.1.2.d3", score: 0.1, fields: { anchor: "story:1:2:d3" } }] }),
                        { status: 200 }
                    )
                }

                if (url.endsWith(`/collections/dbagent`)) {
                    return new Response(
                        JSON.stringify({ code: 0, output: { name: "dbagent", dimension: 4, metric: "cosine", status: "SERVING" } }),
                        { status: 200 }
                    )
                }

                if (url.endsWith("/stats")) {
                    return new Response(JSON.stringify({ code: 0, output: { total_doc_count: String(remoteDocs) } }), { status: 200 })
                }

                if (method === "POST") {
                    const body = JSON.parse(`${init?.body ?? "{}"}`) as { docs?: unknown[] }
                    remoteDocs += body.docs?.length ?? 0

                    return new Response(JSON.stringify({ code: 0, message: "Success", output: [] }), { status: 200 })
                }

                return new Response(JSON.stringify({ code: 0, message: "Success", output: [] }), { status: 200 })
            }

            const body = JSON.parse(`${init?.body ?? "{}"}`) as { input?: string[] | { texts?: string[] } }
            const texts = Array.isArray(body.input) ? body.input : (body.input?.texts ?? [])
            const rows = texts.map((_text, index) => ({ index, text_index: index, embedding: [1, 0, 0, 0] }))

            return new Response(JSON.stringify({ data: rows, output: { embeddings: rows } }), { status: 200 })
        }) as typeof fetch
    })

    test("全量构建：向量只写远端，本地只留元数据（不存向量）", async () => {
        const result = await buildLanguageIndex("zh")

        expect(result.mode).toBe("full")
        expect(result.embedded).toBe(result.chunkCount)
        // 每一条都推给了远端
        expect(remoteDocs).toBe(result.chunkCount)

        const db = await openIndexForBuild(INDEX_PATH)

        try {
            // 本地只有元数据行（锚点 / 种类 / 指纹），没有任何向量——这就是省下来的内存
            expect(await db.countVectors("zh")).toBe(result.chunkCount)
            expect(await db.hasLocalVectors("zh")).toBe(false)
            expect((await readMetaAt(INDEX_PATH))?.fingerprints.zh).toEqual(result.fingerprints)
        } finally {
            await db.abort()
        }
    }, 120_000)

    test("后端从本地切到远端时整体重建（不复用没有的远端向量）", async () => {
        // 先按本地模式建一次（向量在本地）：清掉 DashVector 三件套 = 走本地向量库
        delete process.env.AI_EMBEDDING_SERVER_ENDPOINT
        delete process.env.AI_EMBEDDING_SERVER_API_KEY
        delete process.env.AI_EMBEDDING_SERVER_COLLECTION
        const local = await buildLanguageIndex("zh")
        expect(local.mode).toBe("full")

        // 再切到远端：内容没变，但后端变了，必须重新向量化并推给远端
        process.env.AI_EMBEDDING_SERVER_ENDPOINT = "dv.example.test"
        process.env.AI_EMBEDDING_SERVER_API_KEY = "sk-dv"
        process.env.AI_EMBEDDING_SERVER_COLLECTION = "dbagent"
        const remote = await buildLanguageIndex("zh")

        expect(remote.mode).toBe("full")
        expect(remote.embedded).toBe(remote.chunkCount)
        expect(remoteDocs).toBe(remote.chunkCount)

        const db = await openIndexForBuild(INDEX_PATH)

        try {
            expect(await db.hasLocalVectors("zh")).toBe(false)
            expect((await readMetaAt(INDEX_PATH))?.vectorStore).toBe("remote:dbagent")
        } finally {
            await db.abort()
        }
    }, 180_000)

    test("换模型时同样整体重建（内容没变也不能复用旧向量）", async () => {
        const first = await buildLanguageIndex("zh")
        expect(first.mode).toBe("full")

        // 同一份数据、同一个后端，只换模型：必须重新向量化，而不是判定「已是最新」
        process.env.AI_EMBEDDING_MODEL = "another-model"
        const second = await buildLanguageIndex("zh")

        expect(second.mode).toBe("full")
        expect(second.embedded).toBe(second.chunkCount)
    }, 180_000)

    test("检索直接走远端，不读本地向量库", async () => {
        const result = await buildLanguageIndex("zh")
        const served = Object.values(result.fingerprints)

        const hits = await searchVectors("问句", { lang: "zh", serveFingerprints: served, limit: 5 })

        expect(remoteQueries).toBe(1)
        // 距离 0.1 → 相似度 0.9（口径与本地检索一致）
        expect(hits).toEqual([{ anchor: "story:1:2:d3", score: 0.9 }])
    }, 120_000)
})

describe("自动索引构建", () => {
    test("全量构建：语料指纹写进 meta，向量按指纹落库", async () => {
        const chunks = await buildRagChunks("zh")
        const expectedFingerprints = ragKindFingerprints(chunks)

        const result = await buildLanguageIndex("zh")

        expect(result.mode).toBe("full")
        // 指纹按种类分别记录（story / summary / voice / profile / clue / review / wiki）
        expect(result.fingerprints).toEqual(expectedFingerprints)
        expect(Object.keys(result.fingerprints).sort()).toEqual(["clue", "profile", "review", "story", "summary", "voice", "wiki"])
        expect(result.chunkCount).toBe(chunks.length)
        expect(result.embedded).toBe(chunks.length)
        expect(result.dims).toBe(4)

        const db = await openIndexForBuild(INDEX_PATH)

        try {
            const meta = await readMetaAt(INDEX_PATH)
            expect(meta?.model).toBe("test-model")
            expect(meta?.fingerprints.zh).toEqual(expectedFingerprints)
            expect(await db.countVectors("zh")).toBe(chunks.length)
            // 每行带自己种类的指纹：按种类统计与回收都靠它
            expect(await db.countVectorsByFingerprint("zh", expectedFingerprints.story!)).toBeGreaterThan(0)
            expect(
                await Object.values(expectedFingerprints).reduce(
                    async (sum, fingerprint) => (await sum) + (await db.countVectorsByFingerprint("zh", fingerprint)),
                    Promise.resolve(0)
                )
            ).toBe(chunks.length)
        } finally {
            await db.abort()
        }
    }, 120_000)

    test("内容没变时判定「已是最新」，不再调用向量化", async () => {
        await buildLanguageIndex("zh")
        const callsAfterFirst = embeddingCalls

        const again = await buildLanguageIndex("zh")

        expect(again.mode).toBe("up-to-date")
        expect(again.embedded).toBe(0)
        expect(again.reused).toBe(again.chunkCount)
        expect(embeddingCalls).toBe(callsAfterFirst)
    }, 120_000)

    test("换指纹后按内容复用，并把旧指纹的向量回收掉", async () => {
        // 先用一份「上一代」索引打底：内容与当前语料无关，全是待删除的陈旧锚点
        const seed = await openIndexForBuild(INDEX_PATH)
        await seed.writeMeta({
            schemaVersion: RAG_INDEX_SCHEMA_VERSION,
            chunkSchemaVersion: RAG_CHUNK_SCHEMA_VERSION,
            model: "test-model",
            dims: 4,
            fingerprints: { zh: { story: "old-story", voice: "old-voice", summary: "old-summary", profile: "old-profile" } },
            builtAt: new Date().toISOString(),
            vectorStore: LOCAL_VECTOR_STORE_TAG,
            state: "ready",
            chunkCount: 1,
        })
        await seed.insertVectors(
            [
                {
                    anchor: "story:stale:1:d1",
                    lang: "zh",
                    fingerprint: "old-fingerprint",
                    kind: "story",
                    hash: "stale",
                    vector: [1, 0, 0, 0],
                },
            ],
            4
        )
        await seed.commit()

        const result = await buildLanguageIndex("zh")

        expect(result.mode).toBe("incremental")
        expect(result.removed).toBe(1)

        const db = await openIndexForBuild(INDEX_PATH)

        try {
            // 旧指纹的行被回收，库里只剩本次各类型的指纹
            expect(await db.countVectorsByFingerprint("zh", "old-story")).toBe(0)
            expect(await db.countVectors("zh")).toBe(result.chunkCount)
            expect((await readMetaAt(INDEX_PATH))?.fingerprints.zh).toEqual(result.fingerprints)
        } finally {
            await db.abort()
        }
    }, 120_000)

    test("单飞：并发触发只跑一个任务，重复请求合并", async () => {
        // 换一个本文件没碰过的语言：zh 刚做过「已是最新」的检查，处于检查冷却期
        const first = requestIndexBuild("jp", "测试触发")
        const second = requestIndexBuild("jp", "重复触发")
        const third = requestIndexBuild("jp", "再来一次")

        // 第一次触发真正入队，后两次合并
        expect(first).toBe(true)
        expect(second).toBe(false)
        expect(third).toBe(false)

        const snapshot = getBuildSnapshot()
        expect(snapshot.running || snapshot.pendingLangs.includes("jp")).toBe(true)

        await waitForBuildIdle()

        const done = getBuildSnapshot()
        expect(done.running).toBe(false)
        expect(done.pendingLangs).toEqual([])
        expect(done.lastResult?.lang).toBe("jp")
        expect(done.lastResult?.fingerprints).toEqual(ragKindFingerprints(await buildRagChunks("jp")))
    }, 180_000)

    test("跨语言同文语料只嵌入一次（summary 只有中文一份，逐字相同即复用向量）", async () => {
        // 收集桩真正向量化过的文本：zh 与 jp 的 summary 逐字相同，第二次构建必须命中缓存
        const embeddedTexts: string[] = []

        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (!String(input).includes("embeddings")) {
                throw new Error(`测试不应请求 ${String(input)}`)
            }

            const body = JSON.parse(`${init?.body ?? "{}"}`) as { input?: string[] }
            const texts = body.input ?? []

            embeddedTexts.push(...texts)

            const rows = texts.map((_text, index) => ({ index, embedding: [1, 0, 0, 0] }))

            return new Response(JSON.stringify({ data: rows }), { status: 200 })
        }) as typeof fetch

        await buildLanguageIndex("zh")
        const uniqueAfterZh = new Set(embeddedTexts).size

        await buildLanguageIndex("jp")

        // 两次构建合计：任何文本都不该被嵌入第二次（含跨语言同文的 summary）
        expect(new Set(embeddedTexts).size).toBe(embeddedTexts.length)
        // jp 的向量化请求数少于其语料条数（summary 全部命中缓存）
        expect(embeddedTexts.length - uniqueAfterZh).toBeLessThan((await buildRagChunks("jp")).length)
    }, 180_000)
})

describe("语言白名单（AI_EMBEDDING_LANG）", () => {
    test("留空 = 全部语言；白名单外拒绝构建；ja/ko 别名归一；全部无法解析时按全部处理", () => {
        delete process.env.AI_EMBEDDING_LANG
        expect(resolveAllowedLangs()).toEqual([...SUPPORTED_LANGS])
        // ja 是配置别名而非语言代码：代码本身永远是 jp
        expect(isLangAllowed("ja")).toBe(false)

        process.env.AI_EMBEDDING_LANG = "zh, ja"
        // ja 归一为 jp：白名单 = zh + jp
        expect(resolveAllowedLangs()).toEqual(["zh", "jp"])
        expect(isLangAllowed("zh")).toBe(true)
        expect(isLangAllowed("kr")).toBe(false)

        // 白名单外：不排队、不占用冷却（kr 不在 zh+jp 白名单里）
        expect(requestIndexBuild("kr", "测试")).toBe(false)

        process.env.AI_EMBEDDING_LANG = "ja"
        expect(isLangAllowed("jp")).toBe(true)
        expect(isLangAllowed("kr")).toBe(false)

        process.env.AI_EMBEDDING_LANG = "xx,yy"
        expect(resolveAllowedLangs()).toEqual([...SUPPORTED_LANGS])

        delete process.env.AI_EMBEDDING_LANG
    })
})
