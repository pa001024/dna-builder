/**
 * RAG 向量索引的独立存储（DuckDB），与业务库 data.db 完全分离。
 *
 * 结构：meta 表（schema 版本 / 模型 / 维度 / 按语言 × 种类的指纹 / 构建状态）+
 * 每语言一张 `chunks_<lang>` 表（锚点 / 种类 / 正文指纹 / vec FLOAT[dims]，远端模式下 vec 为 NULL）+
 * 每表一个 HNSW 索引（vss 扩展，cosine 度量，持久化）。
 *
 * 构建在单个事务里完成：BEGIN → 写入 → 自检 → COMMIT，失败回滚、崩溃由 WAL 恢复；
 * DuckDB 单写者，实例按路径缓存复用（只读/可写按需升级，同路径的创建与升级串行化），并发构建由 build.ts 的锁文件互斥。
 */

import { existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { type DuckDBConnection, type DuckDBInstance, DuckDBInstance as DuckDBInstanceCtor } from "@duckdb/node-api"

/** 表结构版本：结构或格式变更时 +1（v3 = sqlite 迁移到 DuckDB）。 */
export const RAG_INDEX_SCHEMA_VERSION = 3

/** 本地模式的 vectorStore 标记（写进 meta；远端模式为 `remote:<集合名>`，两者切换必须整体重建） */
export const LOCAL_VECTOR_STORE_TAG = "local:duckdb"

/** 索引库的构建状态 */
export type RagIndexState = "building" | "ready"

/** 索引库的元信息 */
export interface RagIndexMeta {
    /** 表结构版本 */
    schemaVersion: number
    /** 切块规则版本（来自 `src/data/rag/types.ts` 的 RAG_CHUNK_SCHEMA_VERSION） */
    chunkSchemaVersion: number
    /** 向量模型名 */
    model: string
    /** 向量维度 */
    dims: number
    /**
     * 各语言已索引的语料内容指纹（语言 → 种类 → 16 位十六进制）。
     * 按种类比对：部分模块变化时其余模块照常可用。
     */
    fingerprints: Record<string, Record<string, string>>
    /** 构建完成时间（ISO） */
    builtAt: string
    /** 向量存放位置：`local:duckdb` 或 `remote:<集合名>`；后端切换必须整体重建 */
    vectorStore: string
    /** 构建状态 */
    state: RagIndexState
    /** 已索引的 chunk 总数 */
    chunkCount: number
}

/** 一条待写入的向量记录 */
export interface RagVectorRow {
    /** 语料锚点（双端一致） */
    anchor: string
    /** 数据语言 */
    lang: string
    /** 该行所属的语料内容指纹（同一语言只保留最新一份） */
    fingerprint: string
    /** 语料种类 */
    kind: string
    /** 正文指纹（客户端校验用） */
    hash: string
    /** 向量；空数组 = 只记元数据（远端模式），落库时 vec 为 NULL */
    vector: number[]
}

/** meta 表的键（各语言内容指纹按 `fingerprint:<lang>:<kind>` 逐条写） */
const META_KEYS = {
    schemaVersion: "schema_version",
    chunkSchemaVersion: "chunk_schema_version",
    model: "model",
    dims: "dims",
    builtAt: "built_at",
    vectorStore: "vector_store",
    state: "state",
    chunkCount: "chunk_count",
} as const

/** 各语言内容指纹的键前缀（`fingerprint:zh:story` 等：语言与语料种类都不固定，故用前缀而非固定键） */
const FINGERPRINT_KEY_PREFIX = "fingerprint:"

/** 单条批量插入语句的行数上限（2048 行 ≈ 19MB 参数文本；2.8 万条 × 1024 维约 14s） */
const INSERT_BATCH = 2048

/** 单条 `IN (...)` 语句的参数条数上限：参数太多会让优化器与准备阶段变慢，512 是实测的平衡点 */
const PARAM_BATCH = 512

/**
 * HNSW 检索的候选队列宽度。
 *
 * 调大以换取接近精确扫描的召回：实测 2 万条 × 1024 维下，256 时 top40 与精确扫描重合 97.5%，
 * 耗时仍只有精确扫描的五分之一。
 */
const HNSW_EF_SEARCH = 256

/** 只服务部分种类时，先按 HNSW 过采样的倍数（再在外层按指纹过滤） */
const FILTER_OVERSAMPLE = 10

/** 过采样条数上限（超过这个量级，HNSW 相对全表扫描就没有优势了） */
const MAX_OVERSAMPLE = 1000

/** 打开 DuckDB 实例时用的只读配置 */
const READ_ONLY_CONFIG = { access_mode: "READ_ONLY" } as const

/**
 * 解析索引库路径。
 * @returns 绝对路径
 */
export function resolveIndexPath(): string {
    const configured = process.env.RAG_INDEX_DB?.trim()

    if (configured) {
        return resolve(configured)
    }

    // 与 data.db 明确分开放：向量索引是可随时重建的派生数据
    return resolve(import.meta.dir, "../../data/rag-index.duckdb")
}

/** DuckDB 实例缓存（路径 → 实例 + 打开模式）。同一文件同时只能有一个实例（DuckDB 文件锁），必须按路径复用 */
const instanceCache = new Map<string, { instance: DuckDBInstance; readOnly: boolean }>()

/** 同路径实例操作的互斥链（路径 → 最近一次排队的任务）：并发首开 / 升级时串行化，避免同时抢文件锁 */
const instanceMutexes = new Map<string, Promise<unknown>>()

/**
 * 在同路径的实例互斥链上排队执行任务（前一个任务结束——无论成败——才开始下一个）。
 * @param path 库文件路径
 * @param task 排他任务
 * @returns 任务结果
 */
async function runWithInstanceMutex<T>(path: string, task: () => Promise<T>): Promise<T> {
    const previous = instanceMutexes.get(path) ?? Promise.resolve()
    const current = previous.catch(() => {}).then(task)

    instanceMutexes.set(path, current)

    try {
        return await current
    } finally {
        // 自己仍是队尾才摘除；已有后续排队者时 Map 里已是它们的 promise
        if (instanceMutexes.get(path) === current) {
            instanceMutexes.delete(path)
        }
    }
}

/**
 * 取（或创建）某个路径的 DuckDB 实例。
 *
 * 同一文件同时只能存在一个实例；缓存里是只读实例而构建需要可写时，先关闭再以可写重开
 * （升级瞬间若有检索查询在飞会一并中断，构建是低频操作，可接受）。
 * 创建与升级在同路径上串行化：并发首开时后到的请求直接命中缓存，而不是同时抢文件锁报 Failed to connect。
 * @param path 库文件路径
 * @param readOnly 是否只读打开
 * @returns DuckDB 实例
 */
async function getDuckInstance(path: string, readOnly: boolean): Promise<DuckDBInstance> {
    return runWithInstanceMutex(path, async () => {
        const cached = instanceCache.get(path)

        if (cached) {
            if (cached.readOnly && !readOnly) {
                closeDuckInstance(path)
            } else {
                return cached.instance
            }
        }

        const instance = await DuckDBInstanceCtor.create(path, readOnly ? { ...READ_ONLY_CONFIG } : undefined)

        instanceCache.set(path, { instance, readOnly })

        return instance
    })
}

/**
 * 关闭并移除某个路径的缓存实例（换名 / 删除文件前必须调用：Windows 上打开中的文件不能动）。
 * @param path 库文件路径
 */
export function closeDuckInstance(path: string): void {
    const cached = instanceCache.get(path)

    if (!cached) {
        return
    }

    instanceCache.delete(path)

    try {
        cached.instance.closeSync()
    } catch (error) {
        console.warn(`[rag] 关闭 DuckDB 实例失败（${path}）：${error instanceof Error ? error.message : String(error)}`)
    }
}

/**
 * 关闭全部缓存实例（索引重建换名后、测试清理时用；之后会用到的实例会按需重开）。
 */
export function closeDuckInstances(): void {
    for (const path of [...instanceCache.keys()]) {
        closeDuckInstance(path)
    }
}

/** vss 扩展状态：`unknown` 还没试过 / `available` 可用 / `unavailable` 装不上（离线等），检索退化为精确扫描 */
let vssState: "unknown" | "available" | "unavailable" = "unknown"

/**
 * 在连接上加载 vss 扩展；首次失败会尝试 INSTALL（需联网，装好后走本地缓存）。
 * 彻底失败只警告一次：距离函数是核心内置的，没有 vss 只是没有索引，精确扫描仍可用。
 */
async function loadVss(conn: DuckDBConnection): Promise<boolean> {
    if (vssState === "unavailable") {
        return false
    }

    try {
        await conn.run("LOAD vss")
        vssState = "available"

        return true
    } catch {
        // 尚未安装过：先 INSTALL（幂等，已缓存时不会重新下载）再 LOAD
    }

    try {
        await conn.run("INSTALL vss")
        await conn.run("LOAD vss")
        vssState = "available"

        return true
    } catch (error) {
        vssState = "unavailable"
        console.warn(`[rag] DuckDB vss 扩展不可用，向量检索退化为精确扫描：${error instanceof Error ? error.message : String(error)}`)

        return false
    }
}

/**
 * 打开一条一次性连接（查询完必须 closeSync）。
 * @param path 库文件路径
 * @param readOnly 是否只读打开
 * @returns 连接与 vss 是否可用
 */
async function openConnection(path: string, readOnly: boolean): Promise<{ conn: DuckDBConnection; hasVss: boolean }> {
    const instance = await getDuckInstance(path, readOnly)
    const conn = await instance.connect()
    const hasVss = await loadVss(conn)

    if (hasVss) {
        // 设置是连接级的：每条新连接都要设一次（见 HNSW_EF_SEARCH）
        await conn.run(`SET hnsw_ef_search = ${HNSW_EF_SEARCH}`)
    }

    return { conn, hasVss }
}

/** 校验语言标识能否安全拼进表名 / 索引名 */
function assertSafeLang(lang: string): string {
    if (!/^[a-z0-9_-]+$/i.test(lang)) {
        throw new Error(`非法的数据语言标识：${lang}`)
    }

    return lang
}

/**
 * 某个语言的向量表名（每语言一张表，检索在单表内走 HNSW，无需跨语言过滤）。
 * @param lang 数据语言
 * @returns 表名
 */
function chunkTableName(lang: string): string {
    return `chunks_${assertSafeLang(lang)}`
}

/**
 * 某个语言的 HNSW 索引名（索引名在 schema 内全局唯一，必须带语言）。
 * @param lang 数据语言
 * @returns 索引名
 */
function vectorIndexName(lang: string): string {
    return `idx_chunks_${assertSafeLang(lang)}_vec`
}

/** 取 `SELECT COUNT(*) AS count` 这类单行查询的数值结果 */
function countOf(rows: { getRowObjectsJson(): Array<Record<string, unknown>> }): number {
    return Number((rows.getRowObjectsJson()[0] as { count?: string | number } | undefined)?.count ?? 0)
}

/**
 * 判断表是否存在。
 * @param conn DuckDB 连接
 * @param tableName 表名
 * @returns 是否存在
 */
async function hasTable(conn: DuckDBConnection, tableName: string): Promise<boolean> {
    const rows = await conn.runAndReadAll("SELECT COUNT(*) AS count FROM duckdb_tables() WHERE schema_name = 'main' AND table_name = ?", [
        tableName,
    ])

    return countOf(rows) > 0
}

/**
 * 列出库里的全部语言表。
 * @param conn DuckDB 连接
 * @returns 表名列表
 */
async function listChunkTables(conn: DuckDBConnection): Promise<string[]> {
    const rows = await conn.runAndReadAll(
        "SELECT table_name FROM duckdb_tables() WHERE schema_name = 'main' AND table_name LIKE 'chunks_%'"
    )

    return rows.getRowObjectsJson().map(row => String(row.table_name))
}

/**
 * 确保某语言表存在（幂等）；vec 的维度来自当前向量化配置，首次插入时才建表。
 */
async function ensureChunksTable(conn: DuckDBConnection, lang: string, dims: number): Promise<void> {
    await conn.run(`
        CREATE TABLE IF NOT EXISTS ${chunkTableName(lang)} (
            anchor VARCHAR PRIMARY KEY,
            fingerprint VARCHAR NOT NULL,
            kind VARCHAR NOT NULL,
            hash VARCHAR NOT NULL,
            vec FLOAT[${dims}]
        )
    `)
}

/**
 * 确保 meta 表存在（幂等）。
 * @param conn DuckDB 连接
 */
async function ensureMetaTable(conn: DuckDBConnection): Promise<void> {
    await conn.run("CREATE TABLE IF NOT EXISTS meta (key VARCHAR PRIMARY KEY, value VARCHAR NOT NULL)")
}

/**
 * 把 meta 键值行解析成元信息。
 * @param rows 键值行
 * @returns 元信息；没有任何行时返回 null
 */
function parseMetaRows(rows: ReadonlyArray<Record<string, unknown>>): RagIndexMeta | null {
    if (!rows.length) {
        return null
    }

    const map = new Map(rows.map(row => [String(row.key), String(row.value ?? "")]))
    const fingerprints: Record<string, Record<string, string>> = {}

    for (const [key, value] of map) {
        if (!key.startsWith(FINGERPRINT_KEY_PREFIX)) {
            continue
        }

        const [lang, kind] = key.slice(FINGERPRINT_KEY_PREFIX.length).split(":")

        if (lang && kind) {
            fingerprints[lang] = { ...(fingerprints[lang] ?? {}), [kind]: value }
        }
    }

    return {
        schemaVersion: Number(map.get(META_KEYS.schemaVersion) ?? 0),
        chunkSchemaVersion: Number(map.get(META_KEYS.chunkSchemaVersion) ?? 0),
        model: map.get(META_KEYS.model) ?? "",
        dims: Number(map.get(META_KEYS.dims) ?? 0),
        fingerprints,
        builtAt: map.get(META_KEYS.builtAt) ?? "",
        vectorStore: map.get(META_KEYS.vectorStore) ?? LOCAL_VECTOR_STORE_TAG,
        state: (map.get(META_KEYS.state) as RagIndexState) ?? "building",
        chunkCount: Number(map.get(META_KEYS.chunkCount) ?? 0),
    }
}

/** 序列化向量为 JSON 数组文本；分量控制到 1e-6（float32 精度之下，体积可控） */
export function serializeVectorJson(vector: readonly number[]): string {
    const parts = vector.map(value => {
        if (!Number.isFinite(value)) {
            throw new Error("向量里出现非有限数值（NaN / Infinity），已拒绝写入索引")
        }

        return Math.round(value * 1e6) / 1e6
    })

    return `[${parts.join(",")}]`
}

/** 索引元信息的进程内缓存（一次检索要读 1~3 次、每次约 2ms，内容只在构建成功后才变） */
let metaCache: { path: string; at: number; meta: RagIndexMeta | null } | null = null

/** 元信息缓存的有效期（毫秒）；构建结束会主动失效，这里只是兜底 */
const META_CACHE_TTL = 2_000

/**
 * 丢弃缓存的索引元信息（构建提交 / 回滚后必须调用：此时库内容已经变了）。
 */
export function invalidateMetaCache(): void {
    metaCache = null
}

/**
 * 读取指定路径的索引元信息（连接一次性，实例按路径缓存复用）。
 *
 * 带进程内短缓存：请求路径上会读它两三次（索引状态、指纹门禁），而元信息只在构建成功后才变化。
 */
export async function readMetaAt(path: string = resolveIndexPath()): Promise<RagIndexMeta | null> {
    if (!existsSync(path)) {
        return null
    }

    if (metaCache && metaCache.path === path && Date.now() - metaCache.at < META_CACHE_TTL) {
        return metaCache.meta
    }

    try {
        const opened = await openConnection(path, true)
        const conn = opened.conn

        try {
            if (!(await hasTable(conn, "meta"))) {
                return null
            }

            const rows = await conn.runAndReadAll("SELECT key, value FROM meta")
            const meta = parseMetaRows(rows.getRowObjectsJson())

            metaCache = { path, at: Date.now(), meta }

            return meta
        } finally {
            // 连接用完即关（连接廉价），实例保留复用：请求路径每次读 meta 都走这里，
            // 重复开关整个实例既慢，又会把别的在飞请求正用着的连接一起带走
            conn.closeSync()
        }
    } catch (error) {
        console.warn(`[rag] 读取 DuckDB 索引元信息失败（${path}）：${error instanceof Error ? error.message : String(error)}`)

        return null
    }
}

/**
 * 读取某语言已有的「锚点 → 正文指纹」（只读连接），供增量构建按内容复用。
 */
export async function readExistingHashesAt(path: string = resolveIndexPath(), lang: string): Promise<Map<string, string>> {
    if (!existsSync(path)) {
        return new Map()
    }

    const opened = await openConnection(path, true)
    const conn = opened.conn

    try {
        if (!(await hasTable(conn, chunkTableName(lang)))) {
            return new Map()
        }

        const rows = await conn.runAndReadAll(`SELECT anchor, hash FROM ${chunkTableName(lang)}`)

        return new Map(rows.getRowObjectsJson().map(row => [String(row.anchor), String(row.hash)]))
    } catch (error) {
        console.warn(`[rag] 读取 DuckDB 索引已有锚点失败（${path}）：${error instanceof Error ? error.message : String(error)}`)

        return new Map()
    } finally {
        conn.closeSync()
    }
}

/** 构建期的索引连接：线上库上一个打开事务内的全部写入操作 */
export interface RagIndexBuildConnection {
    /** 把某语言各类语料的行重新标记为本次构建的「种类指纹」，返回改标的行数 */
    retagFingerprints(lang: string, fingerprints: Record<string, string>): Promise<number>
    /**
     * 写入（或覆盖）一批向量行。
     * @param rows 向量记录（远端模式下 vector 为空数组 → vec 写 NULL）
     * @param dims 向量维度（建表需要；远端模式取自 embedding 返回值）
     */
    insertVectors(rows: readonly RagVectorRow[], dims: number): Promise<void>
    /** 删除某语言里不在给定锚点集合中的行，返回被删的锚点（远端模式要拿它们去删远端向量） */
    deleteAnchorsExcept(lang: string, keepAnchors: ReadonlySet<string>): Promise<string[]>
    /** 垃圾回收：删掉该语言下不属于本次任何种类指纹的行，返回删除条数 */
    deleteOtherFingerprints(lang: string, fingerprints: Record<string, string>): Promise<number>
    /** 统计行数；不传语言则统计全部语言表 */
    countVectors(lang?: string): Promise<number>
    /** 统计某语言指定内容指纹的行数（按种类统计与回收的口径） */
    countVectorsByFingerprint(lang: string, fingerprint: string): Promise<number>
    /** 判断某语言是否存有向量（远端模式下本地只有元数据行，vec 为 NULL） */
    hasLocalVectors(lang: string): Promise<boolean>
    /** 写入元信息（整体覆盖） */
    writeMeta(meta: RagIndexMeta): Promise<void>
    /**
     * 确保该语言的 HNSW 索引存在（已存在时不动）。
     *
     * 持久 HNSW 索引由 DuckDB 随 INSERT / DELETE 自动维护（实测插入新行后不必重建即可召回、
     * 删除的行也不会再返回），因此只在它缺失时创建：`CREATE INDEX IF NOT EXISTS` 重复执行约 1ms，
     * 而 2 万条 × 1024 维的全量重建要 20s 以上。
     */
    ensureVectorIndex(lang: string): Promise<void>
    /** 清空全部语言表（全量重建用：旧模型的向量整体作废），索引随表一起删除 */
    dropAllChunkTables(): Promise<void>
    /** 读取当前事务视角的元信息（含本连接尚未提交的写入，供提交前自检） */
    readMeta(): Promise<RagIndexMeta | null>
    /** 提交构建事务并关闭连接（之后由 DuckDB 自动把 WAL 合并进主文件） */
    commit(): Promise<void>
    /** 回滚构建事务并关闭连接（构建失败/放弃时用，线上数据保持构建前的状态；幂等） */
    abort(): Promise<void>
}

/** 构建连接实现（持有临时库路径与可写连接） */
class DuckBuildConnection implements RagIndexBuildConnection {
    /** 事务是否已经结束（commit/abort 都算；防止重复提交或提交后再回滚） */
    private finished = false

    /**
     * @param path 索引库路径
     * @param conn 可写连接（已开启构建事务）
     * @param hasVss vss 是否可用（决定能否建 HNSW 索引）
     */
    constructor(
        private readonly path: string,
        private readonly conn: DuckDBConnection,
        private readonly hasVss: boolean
    ) {}

    /** @inheritDoc */
    async retagFingerprints(lang: string, fingerprints: Record<string, string>): Promise<number> {
        const table = chunkTableName(lang)

        if (!(await hasTable(this.conn, table))) {
            return 0
        }

        let changed = 0

        // 按种类逐条改标：实测 2 万行 × 4 种只需 8ms，比拼成一条 CASE（每行要算 4 个 WHEN，21ms）更快
        for (const [kind, fingerprint] of Object.entries(fingerprints)) {
            const before = await this.conn.runAndReadAll(`SELECT COUNT(*) AS count FROM ${table} WHERE kind = ? AND fingerprint <> ?`, [
                kind,
                fingerprint,
            ])
            changed += countOf(before)
            await this.conn.run(`UPDATE ${table} SET fingerprint = ? WHERE kind = ? AND fingerprint <> ?`, [fingerprint, kind, fingerprint])
        }

        return changed
    }

    /** @inheritDoc */
    async insertVectors(rows: readonly RagVectorRow[], dims: number): Promise<void> {
        // 按语言分组（一次构建通常只有一个语言，分组只是防御）
        const byLang = new Map<string, RagVectorRow[]>()

        for (const row of rows) {
            const group = byLang.get(row.lang) ?? []
            group.push(row)
            byLang.set(row.lang, group)
        }

        for (const [lang, group] of byLang) {
            await ensureChunksTable(this.conn, lang, dims)
            const table = chunkTableName(lang)

            for (let start = 0; start < group.length; start += INSERT_BATCH) {
                const slice = group.slice(start, start + INSERT_BATCH)

                // 先按锚点整批删掉已存在的行，再纯 INSERT：`INSERT OR REPLACE` 要为每行做一次冲突检测，
                // 实测 2048 条 × 1024 维下比「删 + 插」慢约两成
                for (let offset = 0; offset < slice.length; offset += PARAM_BATCH) {
                    const part = slice.slice(offset, offset + PARAM_BATCH)

                    await this.conn.run(
                        `DELETE FROM ${table} WHERE anchor IN (${part.map(() => "?").join(", ")})`,
                        part.map(row => row.anchor)
                    )
                }

                const anchors: string[] = []
                const fingerprints: string[] = []
                const kinds: string[] = []
                const hashes: string[] = []
                const vecs: string[] = []

                for (const row of slice) {
                    anchors.push(row.anchor)
                    fingerprints.push(row.fingerprint)
                    kinds.push(row.kind)
                    hashes.push(row.hash)
                    // 空向量 = 远端模式的元数据行：vec 写 NULL
                    vecs.push(row.vector.length ? serializeVectorJson(row.vector) : "null")
                }

                await this.conn.run(
                    `INSERT INTO ${table} (anchor, fingerprint, kind, hash, vec)
                     SELECT unnest(a), unnest(b), unnest(c), unnest(d), unnest(e)
                     FROM (
                         SELECT from_json(?::JSON, '["VARCHAR"]') AS a,
                                from_json(?::JSON, '["VARCHAR"]') AS b,
                                from_json(?::JSON, '["VARCHAR"]') AS c,
                                from_json(?::JSON, '["VARCHAR"]') AS d,
                                from_json(?::JSON, '["FLOAT[${dims}]"]') AS e
                     )`,
                    [
                        JSON.stringify(anchors),
                        JSON.stringify(fingerprints),
                        JSON.stringify(kinds),
                        JSON.stringify(hashes),
                        `[${vecs.join(",")}]`,
                    ]
                )
            }
        }
    }

    /** @inheritDoc */
    async deleteAnchorsExcept(lang: string, keepAnchors: ReadonlySet<string>): Promise<string[]> {
        const table = chunkTableName(lang)

        if (!(await hasTable(this.conn, table))) {
            return []
        }

        const rows = await this.conn.runAndReadAll(`SELECT anchor FROM ${table}`)
        const removed = rows
            .getRowObjectsJson()
            .map(row => String(row.anchor))
            .filter(anchor => !keepAnchors.has(anchor))

        // 整批删：逐条 DELETE 在万行表上约 0.9ms/条（删 500 条 = 450ms），按批 IN 同样结果只要 32ms
        for (let start = 0; start < removed.length; start += PARAM_BATCH) {
            const slice = removed.slice(start, start + PARAM_BATCH)

            await this.conn.run(`DELETE FROM ${table} WHERE anchor IN (${slice.map(() => "?").join(", ")})`, slice)
        }

        return removed
    }

    /** @inheritDoc */
    async deleteOtherFingerprints(lang: string, fingerprints: Record<string, string>): Promise<number> {
        const table = chunkTableName(lang)
        const keep = Object.values(fingerprints)

        if (!(await hasTable(this.conn, table)) || !keep.length) {
            return 0
        }

        const placeholders = keep.map(() => "?").join(", ")

        // 只数一遍：要删的行数由「不属于本次指纹」这一个条件决定，删完再数一次是多余的
        const before = await this.conn.runAndReadAll(
            `SELECT COUNT(*) AS count FROM ${table} WHERE fingerprint NOT IN (${placeholders})`,
            keep
        )

        await this.conn.run(`DELETE FROM ${table} WHERE fingerprint NOT IN (${placeholders})`, keep)

        return countOf(before)
    }

    /** @inheritDoc */
    async countVectors(lang?: string): Promise<number> {
        if (lang !== undefined) {
            const table = chunkTableName(lang)

            if (!(await hasTable(this.conn, table))) {
                return 0
            }

            const rows = await this.conn.runAndReadAll(`SELECT COUNT(*) AS count FROM ${table}`)

            return Number((rows.getRowObjectsJson()[0] as { count?: string | number } | undefined)?.count ?? 0)
        }

        let total = 0

        for (const table of await listChunkTables(this.conn)) {
            const rows = await this.conn.runAndReadAll(`SELECT COUNT(*) AS count FROM ${table}`)

            total += Number((rows.getRowObjectsJson()[0] as { count?: string | number } | undefined)?.count ?? 0)
        }

        return total
    }

    /** @inheritDoc */
    async countVectorsByFingerprint(lang: string, fingerprint: string): Promise<number> {
        const table = chunkTableName(lang)

        if (!(await hasTable(this.conn, table))) {
            return 0
        }

        const rows = await this.conn.runAndReadAll(`SELECT COUNT(*) AS count FROM ${table} WHERE fingerprint = ?`, [fingerprint])

        return Number((rows.getRowObjectsJson()[0] as { count?: string | number } | undefined)?.count ?? 0)
    }

    /** @inheritDoc */
    async hasLocalVectors(lang: string): Promise<boolean> {
        const table = chunkTableName(lang)

        if (!(await hasTable(this.conn, table))) {
            return false
        }

        const rows = await this.conn.runAndReadAll(`SELECT COUNT(*) AS count FROM ${table} WHERE vec IS NOT NULL`)

        return Number((rows.getRowObjectsJson()[0] as { count?: string | number } | undefined)?.count ?? 0) > 0
    }

    /** @inheritDoc */
    async writeMeta(meta: RagIndexMeta): Promise<void> {
        await ensureMetaTable(this.conn)
        await this.conn.run("DELETE FROM meta")

        const entries: Array<[string, string]> = [
            [META_KEYS.schemaVersion, String(meta.schemaVersion)],
            [META_KEYS.chunkSchemaVersion, String(meta.chunkSchemaVersion)],
            [META_KEYS.model, meta.model],
            [META_KEYS.dims, String(meta.dims)],
            [META_KEYS.builtAt, meta.builtAt],
            [META_KEYS.vectorStore, meta.vectorStore],
            [META_KEYS.state, meta.state],
            [META_KEYS.chunkCount, String(meta.chunkCount)],
        ]

        // 语言与语料种类都不固定，指纹按 `fingerprint:<lang>:<kind>` 逐条写
        for (const [lang, kinds] of Object.entries(meta.fingerprints)) {
            for (const [kind, fingerprint] of Object.entries(kinds)) {
                entries.push([`${FINGERPRINT_KEY_PREFIX}${lang}:${kind}`, fingerprint])
            }
        }

        const placeholders = entries.map(() => "(?, ?)").join(", ")

        await this.conn.run(`INSERT INTO meta (key, value) VALUES ${placeholders}`, entries.flat())
    }

    /** @inheritDoc */
    async ensureVectorIndex(lang: string): Promise<void> {
        const table = chunkTableName(lang)

        if (!this.hasVss || !(await hasTable(this.conn, table))) {
            return
        }

        // 已存在时是 no-op（约 1ms）：索引随写入自动维护，不需要每次构建都全量重建
        await this.conn.run(`CREATE INDEX IF NOT EXISTS ${vectorIndexName(lang)} ON ${table} USING HNSW (vec) WITH (metric = 'cosine')`)
    }

    /** @inheritDoc */
    async dropAllChunkTables(): Promise<void> {
        for (const table of await listChunkTables(this.conn)) {
            await this.conn.run(`DROP TABLE IF EXISTS ${table}`)
        }
    }

    /** @inheritDoc */
    async readMeta(): Promise<RagIndexMeta | null> {
        const rows = await this.conn.runAndReadAll("SELECT key, value FROM meta")

        return parseMetaRows(rows.getRowObjectsJson())
    }

    /** @inheritDoc */
    async commit(): Promise<void> {
        if (this.finished) {
            return
        }

        this.finished = true

        try {
            await this.conn.run("COMMIT")
        } finally {
            this.closeHandle()
        }
    }

    /** @inheritDoc */
    async abort(): Promise<void> {
        if (this.finished) {
            return
        }

        this.finished = true

        try {
            await this.conn.run("ROLLBACK")
        } catch {
            // 事务已经随连接关闭/进程中断而回滚：忽略
        } finally {
            this.closeHandle()
        }
    }

    /** 关闭连接并释放缓存实例 */
    private closeHandle(): void {
        try {
            this.conn.closeSync()
        } finally {
            // 本次事务（无论提交还是回滚）之后库内容都可能变，元信息缓存必须作废
            invalidateMetaCache()
            closeDuckInstance(this.path)
        }
    }
}

/**
 * 打开索引库并开始构建事务（BEGIN）。
 * @param path 库文件路径，默认线上路径
 * @returns 构建连接
 */
export async function openIndexForBuild(path: string = resolveIndexPath()): Promise<RagIndexBuildConnection> {
    mkdirSync(dirname(path), { recursive: true })

    const { conn, hasVss } = await openConnection(path, false)

    if (hasVss) {
        // 持久化 HNSW 是 vss 的实验特性：不打开的话索引只活在内存里，重启即失
        try {
            await conn.run("SET hnsw_enable_experimental_persistence = true")
        } catch {
            // 版本间设置名可能变化：建不了持久化索引只影响重启后的检索速度，不阻塞构建
        }
    }

    await conn.run("BEGIN TRANSACTION")
    await ensureMetaTable(conn)

    return new DuckBuildConnection(path, conn, hasVss)
}

/**
 * 打开一条一次性只读连接（运维脚本的自定义只读查询用）。
 * close() 会同时关闭连接与缓存实例，必须调用——Windows 上打开中的文件不能改名/删除。
 */
export async function openReadonlyConnection(path: string = resolveIndexPath()): Promise<{ conn: DuckDBConnection; close(): void }> {
    const { conn } = await openConnection(path, true)

    return {
        conn,
        close: () => {
            conn.closeSync()
            closeDuckInstance(path)
        },
    }
}

/** 向量召回的单条命中 */
export interface DuckVectorHit {
    /** 语料锚点 */
    anchor: string
    /** 余弦相似度（DuckDB 按 float32 精确计算，未量化） */
    score: number
}

/** 本地向量检索的选项 */
export interface DuckVectorSearchOptions {
    /**
     * 可服务的种类指纹。
     *
     * `null` 表示该语言全部指纹都可服务：查询不带过滤，ORDER BY 能走 HNSW 索引；
     * 给出列表时下推为 `WHERE fingerprint IN (...)`（DuckDB 会退化为精确扫描，规模下完全可接受）。
     */
    fingerprints: readonly string[] | null
    /** 查询向量（单位向量，原始浮点） */
    vector: readonly number[]
    /** 返回条数上限 */
    limit: number
}

/**
 * 把查询结果行转成命中列表（按相似度降序）。
 * @param rows 查询结果
 * @returns 命中列表
 */
function toVectorHits(rows: { getRowObjectsJson(): Array<Record<string, unknown>> }): DuckVectorHit[] {
    return rows
        .getRowObjectsJson()
        .map(row => ({ anchor: String(row.anchor), score: Number(Number(row.score).toFixed(6)) }))
        .filter(hit => Number.isFinite(hit.score))
        .sort((a, b) => b.score - a.score)
}

/**
 * 精确扫描取 top-K（带指纹过滤）。
 *
 * 投影里同时算 `1 - 距离` 会让优化器放弃 HNSW 索引扫描（实测 2 万条下 8ms → 60ms），
 * 因此它只在「过采样捞不够」时兜底：可服务种类在库里占比很低（如只剩语音类）时，
 * 与其把过采样放大到全表量级，不如直接扫一遍拿满结果。
 * @param conn 只读连接
 * @param table 语言表
 * @param vecJson 查询向量（JSON 数组文本）
 * @param cast 向量参数的 cast 表达式
 * @param fingerprints 可服务的指纹；空则不过滤
 * @param limit 返回条数上限
 * @returns 命中列表
 */
async function scanVectors(
    conn: DuckDBConnection,
    table: string,
    vecJson: string,
    cast: string,
    fingerprints: readonly string[],
    limit: number
): Promise<DuckVectorHit[]> {
    const distance = `array_cosine_distance(vec, ${cast})`
    const where = fingerprints.length ? `WHERE fingerprint IN (${fingerprints.map(() => "?").join(", ")})` : ""
    const rows = await conn.runAndReadAll(
        `SELECT anchor, 1 - ${distance} AS score FROM ${table} ${where} ORDER BY ${distance} ASC LIMIT ${limit}`,
        [vecJson, ...fingerprints, vecJson]
    )

    return toVectorHits(rows)
}

/**
 * 本地向量检索：按余弦相似度取 top-K。
 *
 * 必须写成两层：内层只 `SELECT anchor, vec ... ORDER BY array_cosine_distance(...)`（与 HNSW 索引同度量同形状，
 * 才能走索引扫描，实测 8ms），外层再对命中的这几行算相似度。
 * 把 `1 - 距离` 写进同一个 SELECT 的投影会让优化器放弃索引、退化成全表精确扫描（同样数据实测 60ms）。
 *
 * 只服务部分种类时：先按 HNSW 过采样一批候选，再在外层按指纹过滤（下推 WHERE 同样会让索引失效）；
 * 可服务种类占比很低、过采样捞不满时才兜底精确扫描。
 */
export async function searchDuckVectors(
    path: string = resolveIndexPath(),
    lang: string,
    options: DuckVectorSearchOptions
): Promise<DuckVectorHit[]> {
    if (!existsSync(path)) {
        return []
    }

    const { conn } = await openConnection(path, true)

    try {
        const table = chunkTableName(lang)

        if (!(await hasTable(conn, table))) {
            return []
        }

        const vecJson = serializeVectorJson(options.vector)
        const cast = `?::FLOAT[${options.vector.length}]`
        const distance = `array_cosine_distance(vec, ${cast})`
        const limit = Math.max(1, Math.trunc(options.limit))
        const fingerprints = options.fingerprints ?? []

        // 全部种类可服务：内层走 HNSW，外层算分（参数按 SQL 文本顺序绑定：内层第一个、外层第二个）
        if (!fingerprints.length) {
            const rows = await conn.runAndReadAll(
                `WITH top AS (SELECT anchor, vec FROM ${table} ORDER BY ${distance} ASC LIMIT ${limit})
                 SELECT anchor, 1 - ${distance} AS score FROM top`,
                [vecJson, vecJson]
            )

            return toVectorHits(rows)
        }

        const oversample = Math.min(limit * FILTER_OVERSAMPLE, MAX_OVERSAMPLE)
        const placeholders = fingerprints.map(() => "?").join(", ")
        const rows = await conn.runAndReadAll(
            `WITH top AS (SELECT anchor, vec, fingerprint FROM ${table} ORDER BY ${distance} ASC LIMIT ${oversample})
             SELECT anchor, 1 - ${distance} AS score FROM top WHERE fingerprint IN (${placeholders}) LIMIT ${limit}`,
            [vecJson, vecJson, ...fingerprints]
        )
        const hits = toVectorHits(rows)

        return hits.length < limit ? await scanVectors(conn, table, vecJson, cast, fingerprints, limit) : hits
    } finally {
        conn.closeSync()
    }
}

/**
 * 校验索引是否可用于服务：模型 / 维度 / 切块规则 / 表结构 / 状态任一不符即拒绝。
 */
export function validateIndex(
    meta: RagIndexMeta | null,
    expected: { model: string; dims: number; chunkSchemaVersion: number }
): { ok: boolean; reason?: string } {
    if (!meta) {
        return { ok: false, reason: "尚未构建索引（未找到元信息）" }
    }

    if (meta.state !== "ready") {
        return { ok: false, reason: `索引状态为 ${meta.state}（构建未完成或已损坏）` }
    }

    if (meta.schemaVersion !== RAG_INDEX_SCHEMA_VERSION) {
        return { ok: false, reason: `表结构版本不符：索引 ${meta.schemaVersion}，当前 ${RAG_INDEX_SCHEMA_VERSION}` }
    }

    if (meta.chunkSchemaVersion !== expected.chunkSchemaVersion) {
        return {
            ok: false,
            reason: `切块规则版本不符：索引 ${meta.chunkSchemaVersion}，当前 ${expected.chunkSchemaVersion}（需重建索引）`,
        }
    }

    if (meta.model !== expected.model) {
        return { ok: false, reason: `向量模型不符：索引 ${meta.model}，当前 ${expected.model}` }
    }

    if (meta.dims !== expected.dims) {
        return { ok: false, reason: `向量维度不符：索引 ${meta.dims}，当前 ${expected.dims}` }
    }

    return { ok: true }
}
