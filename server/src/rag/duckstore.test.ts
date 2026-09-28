/**
 * DuckDB 索引存储的测试。
 *
 * 重点验证四件事：
 * 1. 「写入与读取」——meta 往返、按语言统计、按锚点比对正文指纹、覆盖写（INSERT OR REPLACE）；
 * 2. 「向量索引」——HNSW 索引随构建创建（持久化）、检索按余弦相似度排序、指纹过滤下推；
 * 3. 「远端模式的元数据行」——空向量写成 NULL vec，本地没有向量可检索；
 * 4. 「事务与垃圾回收」——commit 后数据可见、abort 回滚不污染线上数据、改标与回收按种类判定。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { RAG_CHUNK_SCHEMA_VERSION } from "../../../src/data/rag/types"
import {
    LOCAL_VECTOR_STORE_TAG,
    openIndexForBuild,
    RAG_INDEX_SCHEMA_VERSION,
    type RagIndexMeta,
    readExistingHashesAt,
    readMetaAt,
    resolveIndexPath,
    searchDuckVectors,
    validateIndex,
} from "./duckstore"
import { clearVectorCache } from "./search"

/** 测试用的临时索引库路径 */
const TEMP_DIR = resolve(import.meta.dir, "../../data/test-rag-duckstore")
const INDEX_PATH = resolve(TEMP_DIR, "rag-index.duckdb")

/** 构造一份元信息 */
function createMeta(overrides: Partial<RagIndexMeta> = {}): RagIndexMeta {
    return {
        schemaVersion: RAG_INDEX_SCHEMA_VERSION,
        chunkSchemaVersion: RAG_CHUNK_SCHEMA_VERSION,
        model: "BAAI/bge-m3",
        dims: 4,
        fingerprints: { zh: { story: "fp-zh-story" } },
        builtAt: new Date().toISOString(),
        vectorStore: LOCAL_VECTOR_STORE_TAG,
        state: "ready",
        chunkCount: 0,
        ...overrides,
    }
}

/** 测试用的 4 维单位向量（手工构造，便于断言精确余弦相似度） */
const VECTOR_A = [1, 0, 0, 0]
const VECTOR_B = [0.6, 0.8, 0, 0]
const VECTOR_C = [0, 1, 0, 0]

/** 校验用的期望值 */
const EXPECTED = { model: "BAAI/bge-m3", dims: 4, chunkSchemaVersion: RAG_CHUNK_SCHEMA_VERSION }

beforeEach(() => {
    process.env.RAG_INDEX_DB = INDEX_PATH
    rmSync(TEMP_DIR, { recursive: true, force: true })
    mkdirSync(TEMP_DIR, { recursive: true })
})

afterEach(() => {
    // 先关掉缓存实例再删目录：Windows 上打开中的文件删不掉
    clearVectorCache()
    delete process.env.RAG_INDEX_DB
    rmSync(TEMP_DIR, { recursive: true, force: true })
})

describe("索引库路径", () => {
    test("默认路径与 data.db 分离，且可被环境变量覆盖", () => {
        delete process.env.RAG_INDEX_DB

        const fallback = resolveIndexPath()
        expect(fallback.endsWith("rag-index.duckdb")).toBe(true)
        expect(fallback).not.toContain("data.db")

        process.env.RAG_INDEX_DB = INDEX_PATH
        expect(resolveIndexPath()).toBe(INDEX_PATH)
    })
})

describe("写入与读取", () => {
    test("写入 meta 与向量后可按语言统计、按锚点比对正文指纹", async () => {
        const db = await openIndexForBuild(INDEX_PATH)

        await db.writeMeta(createMeta({ chunkCount: 2, fingerprints: { zh: { story: "fp-zh-story" }, en: { voice: "fp-en-voice" } } }))
        await db.insertVectors(
            [
                { anchor: "story:1:2:d3", lang: "zh", fingerprint: "fp-zh-story", kind: "story", hash: "aaaa", vector: VECTOR_A },
                { anchor: "story:1:2:d4", lang: "zh", fingerprint: "fp-zh-story", kind: "story", hash: "bbbb", vector: VECTOR_C },
            ],
            4
        )
        await db.commit()

        const meta = await readMetaAt(INDEX_PATH)
        expect(meta?.fingerprints).toEqual({ zh: { story: "fp-zh-story" }, en: { voice: "fp-en-voice" } })
        expect(meta?.vectorStore).toBe(LOCAL_VECTOR_STORE_TAG)
        expect(meta?.dims).toBe(4)
        expect(meta?.state).toBe("ready")

        // 指纹按「语言 + 语料种类」分开记录，靠 `fingerprint:<lang>:<kind>` 前缀存
        expect(await readExistingHashesAt(INDEX_PATH, "zh")).toEqual(
            new Map([
                ["story:1:2:d3", "aaaa"],
                ["story:1:2:d4", "bbbb"],
            ])
        )
        // 没建过的语言为空映射，不抛错
        expect((await readExistingHashesAt(INDEX_PATH, "en")).size).toBe(0)
    })

    test("覆盖写（INSERT OR REPLACE）：同锚点再写会替换旧行", async () => {
        const db = await openIndexForBuild(INDEX_PATH)

        await db.insertVectors([{ anchor: "a", lang: "zh", fingerprint: "fp", kind: "story", hash: "1", vector: VECTOR_A }], 4)
        // 同锚点、新指纹：增量构建「内容变更」走的正是这条路径
        await db.insertVectors([{ anchor: "a", lang: "zh", fingerprint: "fp-new", kind: "story", hash: "2", vector: VECTOR_B }], 4)

        expect(await db.countVectors("zh")).toBe(1)
        expect(await db.countVectorsByFingerprint("zh", "fp")).toBe(0)
        expect(await db.countVectorsByFingerprint("zh", "fp-new")).toBe(1)
        await db.abort()
    })

    test("远端模式的元数据行：空向量写成 NULL vec，本地没有向量", async () => {
        const db = await openIndexForBuild(INDEX_PATH)

        // vector 为空数组 = 向量在远端，本地只记元数据
        await db.insertVectors(
            [
                { anchor: "story:1:2:d3", lang: "zh", fingerprint: "fp", kind: "story", hash: "1", vector: [] },
                { anchor: "story:1:2:d4", lang: "zh", fingerprint: "fp", kind: "story", hash: "2", vector: [] },
            ],
            4
        )

        expect(await db.countVectors("zh")).toBe(2)
        expect(await db.hasLocalVectors("zh")).toBe(false)
        await db.abort()
    })
})

describe("向量索引与检索", () => {
    test("HNSW 索引随构建创建（持久化），提交后检索按余弦相似度排序", async () => {
        const db = await openIndexForBuild(INDEX_PATH)

        await db.insertVectors(
            [
                { anchor: "a", lang: "zh", fingerprint: "fp", kind: "story", hash: "1", vector: VECTOR_A },
                { anchor: "b", lang: "zh", fingerprint: "fp", kind: "story", hash: "2", vector: VECTOR_B },
                { anchor: "c", lang: "zh", fingerprint: "fp", kind: "story", hash: "3", vector: VECTOR_C },
            ],
            4
        )
        await db.ensureVectorIndex("zh")
        await db.commit()

        // 查询向量 = VECTOR_A：a 同向（相似度 1）、b 余弦 0.6、c 正交（0）
        const hits = await searchDuckVectors(INDEX_PATH, "zh", { fingerprints: null, vector: VECTOR_A, limit: 3 })

        expect(hits.map(hit => hit.anchor)).toEqual(["a", "b", "c"])
        expect(hits[0]!.score).toBe(1)
        expect(hits[1]!.score).toBeCloseTo(0.6, 6)
        expect(hits[2]!.score).toBe(0)
    })

    test("索引随写入自动维护：增量插入不重建也能召回，删掉的行不再返回", async () => {
        const first = await openIndexForBuild(INDEX_PATH)

        await first.insertVectors(
            [
                { anchor: "a", lang: "zh", fingerprint: "fp", kind: "story", hash: "1", vector: VECTOR_A },
                { anchor: "b", lang: "zh", fingerprint: "fp", kind: "story", hash: "2", vector: VECTOR_B },
            ],
            4
        )
        await first.ensureVectorIndex("zh")
        await first.commit()

        // 增量构建：插入与查询同向的 c，索引不再重建（幂等 no-op）
        const second = await openIndexForBuild(INDEX_PATH)
        await second.insertVectors([{ anchor: "c", lang: "zh", fingerprint: "fp", kind: "story", hash: "3", vector: VECTOR_A }], 4)
        await second.ensureVectorIndex("zh")
        await second.commit()

        const hits = await searchDuckVectors(INDEX_PATH, "zh", { fingerprints: null, vector: VECTOR_A, limit: 3 })

        expect(hits.map(hit => hit.anchor)).toContain("c")
        expect(hits[0]!.score).toBe(1)

        // 删掉 c 之后索引不应再把它返回（幽灵行会污染召回）
        const third = await openIndexForBuild(INDEX_PATH)
        expect(await third.deleteAnchorsExcept("zh", new Set(["a", "b"]))).toEqual(["c"])
        await third.commit()

        const afterDelete = await searchDuckVectors(INDEX_PATH, "zh", { fingerprints: null, vector: VECTOR_A, limit: 5 })

        expect(afterDelete.map(hit => hit.anchor)).not.toContain("c")
        expect(afterDelete.map(hit => hit.anchor)).toContain("a")
    })

    test("指纹过滤下推：不符的种类的向量不会被返回", async () => {
        const db = await openIndexForBuild(INDEX_PATH)

        await db.insertVectors(
            [
                { anchor: "voice:1", lang: "zh", fingerprint: "fp-voice", kind: "voice", hash: "1", vector: VECTOR_A },
                { anchor: "story:1", lang: "zh", fingerprint: "fp-story-old", kind: "story", hash: "2", vector: VECTOR_B },
            ],
            4
        )
        await db.ensureVectorIndex("zh")
        await db.commit()

        const hits = await searchDuckVectors(INDEX_PATH, "zh", { fingerprints: ["fp-voice"], vector: VECTOR_A, limit: 10 })

        expect(hits.map(hit => hit.anchor)).toEqual(["voice:1"])
    })

    test("没建过的语言 / 不存在的索引返回空结果", async () => {
        const db = await openIndexForBuild(INDEX_PATH)
        await db.insertVectors([{ anchor: "a", lang: "zh", fingerprint: "fp", kind: "story", hash: "1", vector: VECTOR_A }], 4)
        await db.ensureVectorIndex("zh")
        await db.commit()

        expect((await searchDuckVectors(INDEX_PATH, "en", { fingerprints: null, vector: VECTOR_A, limit: 5 })).length).toBe(0)
        expect(
            (await searchDuckVectors(resolve(TEMP_DIR, "missing.duckdb"), "zh", { fingerprints: null, vector: VECTOR_A, limit: 5 })).length
        ).toBe(0)
    })
})

describe("事务与垃圾回收", () => {
    test("改标按种类覆盖上一代指纹，回收只删不属于本次任何种类指纹的行", async () => {
        const db = await openIndexForBuild(INDEX_PATH)

        await db.insertVectors(
            [
                { anchor: "a", lang: "zh", fingerprint: "fp-old", kind: "story", hash: "1", vector: VECTOR_A },
                { anchor: "b", lang: "zh", fingerprint: "fp-old", kind: "story", hash: "2", vector: VECTOR_B },
                { anchor: "voice:1", lang: "zh", fingerprint: "fp-voice-old", kind: "voice", hash: "8", vector: VECTOR_C },
            ],
            4
        )

        // 本次构建的指纹：story 变了、voice 没变
        const fingerprints = { story: "fp-story-new", voice: "fp-voice-old" }

        expect(await db.retagFingerprints("zh", fingerprints)).toBe(2)
        expect(await db.countVectorsByFingerprint("zh", "fp-story-new")).toBe(2)
        expect(await db.countVectorsByFingerprint("zh", "fp-old")).toBe(0)
        // 语音没变：指纹原样保留，回收不会动它
        expect(await db.countVectorsByFingerprint("zh", "fp-voice-old")).toBe(1)

        // 再插一条没改标的老行（模拟「上一代残留」），回收应把它删掉
        await db.insertVectors([{ anchor: "c", lang: "zh", fingerprint: "fp-stale", kind: "story", hash: "3", vector: VECTOR_A }], 4)

        expect(await db.deleteOtherFingerprints("zh", fingerprints)).toBe(1)
        expect(await db.countVectors("zh")).toBe(3)

        // 增量写入会删除已消失的锚点（事务内可见，提交后才对外可见）
        expect(await db.deleteAnchorsExcept("zh", new Set(["b", "voice:1"]))).toEqual(["a"])
        expect(await db.countVectors("zh")).toBe(2)

        await db.commit()

        expect([...(await readExistingHashesAt(INDEX_PATH, "zh")).keys()].sort()).toEqual(["b", "voice:1"])
    })

    test("commit 后数据对其他连接可见；abort 回滚不污染线上数据", async () => {
        // 先提交一版「线上数据」
        const first = await openIndexForBuild(INDEX_PATH)
        await first.writeMeta(createMeta({ fingerprints: { zh: { story: "线上指纹" } }, chunkCount: 1 }))
        await first.insertVectors([{ anchor: "a", lang: "zh", fingerprint: "fp", kind: "story", hash: "1", vector: VECTOR_A }], 4)
        await first.commit()

        // 第二次构建写了一堆新数据，最后回滚
        const second = await openIndexForBuild(INDEX_PATH)
        await second.insertVectors([{ anchor: "b", lang: "zh", fingerprint: "fp2", kind: "story", hash: "2", vector: VECTOR_B }], 4)
        await second.writeMeta(createMeta({ fingerprints: { zh: { story: "回滚掉的指纹" } }, chunkCount: 99 }))
        await second.abort()

        const meta = await readMetaAt(INDEX_PATH)
        expect(meta?.fingerprints.zh?.story).toBe("线上指纹")
        expect(meta?.chunkCount).toBe(1)
        expect((await readExistingHashesAt(INDEX_PATH, "zh")).size).toBe(1)
    })

    test("dropAllChunkTables 清空全部语言表（全量重建的前置动作）", async () => {
        const db = await openIndexForBuild(INDEX_PATH)
        await db.insertVectors(
            [
                { anchor: "a", lang: "zh", fingerprint: "fp", kind: "story", hash: "1", vector: VECTOR_A },
                { anchor: "b", lang: "en", fingerprint: "fp-en", kind: "voice", hash: "2", vector: VECTOR_B },
            ],
            4
        )
        await db.dropAllChunkTables()
        expect(await db.countVectors()).toBe(0)
        expect(await db.hasLocalVectors("zh")).toBe(false)
        await db.commit()
    })
})

describe("严格校验", () => {
    test("各项元信息一致时判定可用，任一不符即不可用", () => {
        expect(validateIndex(createMeta(), EXPECTED).ok).toBe(true)
        expect(validateIndex(null, EXPECTED).ok).toBe(false)
        expect(validateIndex(createMeta({ state: "building" }), EXPECTED)).toEqual({
            ok: false,
            reason: "索引状态为 building（构建未完成或已损坏）",
        })
        expect(validateIndex(createMeta({ model: "other-model" }), EXPECTED).reason).toContain("向量模型不符")
        expect(validateIndex(createMeta({ dims: 768 }), EXPECTED).reason).toContain("向量维度不符")
        expect(validateIndex(createMeta({ chunkSchemaVersion: 0 }), EXPECTED).reason).toContain("切块规则版本不符")
        expect(validateIndex(createMeta({ schemaVersion: 0 }), EXPECTED).reason).toContain("表结构版本不符")
    })
})
