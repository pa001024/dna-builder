/**
 * 本地 → 远端（DashVector）向量迁移脚本。
 *
 * 把本地 DuckDB 索引里已构建的向量原样推送到远端集合（不重新调 embeddings），
 * 全部成功后把本地 meta 的 vectorStore 改写为 `remote:<集合名>`——.env 已配好 DashVector
 * 三件套时即完成接管，重启服务即可，不会触发全量重新嵌入。
 *
 * 前置：.env 配置 AI_EMBEDDING_SERVER_ENDPOINT / _API_KEY / _COLLECTION；
 * 本地已构建索引；远端集合维度与本地一致（建议空集合）；建议停服或低峰执行（最后要改写本地 meta）。
 * 推送按锚点 upsert，失败可直接重跑续传。
 *
 * 用法：
 *   bun run rag:migrate                     # 全部语言迁移并切换标记
 *   bun run rag:migrate --lang=zh,en        # 指定语言
 *   bun run rag:migrate --dry-run           # 只分析本地，不连远端、不写入
 *   bun run rag:migrate --no-switch         # 只推送，不改写本地标记
 */

import type { DuckDBConnection } from "@duckdb/node-api"
import { SUPPORTED_LANGS } from "./build"
import { type DashVectorConfig, describeCollection, insertDocuments } from "./dashvector"
import { openIndexForBuild, openReadonlyConnection, readMetaAt, resolveIndexPath } from "./duckstore"

/** 每次从本地读取并推送的行数（512 × 1024 维 ≈ 4MB JS 数组，远端侧再按 100 条/请求分批） */
const READ_PAGE_SIZE = 512

/** 启动参数：--lang=zh,en */
let langs: readonly string[] = SUPPORTED_LANGS
/** 启动参数：--dry-run（只分析本地，不连远端、不写入） */
let dryRun = false
/** 启动参数：--no-switch（推送但不改写本地 meta 标记） */
let noSwitch = false

/**
 * 解析命令行参数。
 * @param argv 命令行参数（process.argv.slice(2)）
 */
function parseArgs(argv: readonly string[]): void {
    for (const arg of argv) {
        if (arg.startsWith("--lang=")) {
            const parsed = arg
                .slice("--lang=".length)
                .split(",")
                .map(item => item.trim().toLowerCase())
                .filter(Boolean)

            if (!parsed.length) {
                fail("--lang= 参数为空")
            }

            const unknown = parsed.filter(lang => !(SUPPORTED_LANGS as readonly string[]).includes(lang))

            if (unknown.length) {
                fail(`--lang= 包含不支持的语言：${unknown.join(" / ")}（支持 ${SUPPORTED_LANGS.join(" / ")}）`)
            }

            langs = parsed

            continue
        }

        if (arg === "--dry-run") {
            dryRun = true

            continue
        }

        if (arg === "--no-switch") {
            noSwitch = true

            continue
        }

        fail(`不认识的参数：${arg}`)
    }
}

/**
 * 打印错误并退出（退出码 1）。
 * @param message 错误信息
 */
function fail(message: string): never {
    console.error(`[rag-migrate] ${message}`)

    process.exit(1)
}

/**
 * 把 DuckDB 读回的向量转成 number 数组（node-api 的 ARRAY 列返回 JS 数组；兜底兼容 JSON 字符串）。
 * @param value 列值
 * @param dims 期望维度
 * @param anchor 所属行（报错定位用）
 * @returns 向量
 */
function vecToNumbers(value: unknown, dims: number, anchor: string): number[] {
    const vector = typeof value === "string" ? JSON.parse(value) : value

    if (!Array.isArray(vector) || vector.length !== dims || vector.some(item => !Number.isFinite(Number(item)))) {
        throw new Error(`向量读取异常（anchor=${anchor}，期望 ${dims} 维）：${String(value).slice(0, 80)}`)
    }

    return vector.map(Number)
}

/**
 * 统计某个语言本地已构建的向量行数与各指纹分布。
 * @param conn 只读连接
 * @param lang 数据语言
 * @returns 向量行数与指纹 → 行数映射
 */
async function analyzeLang(conn: DuckDBConnection, lang: string): Promise<{ vectors: number; fingerprints: Record<string, number> }> {
    const table = `chunks_${lang}`
    const total = await conn.runAndReadAll(`SELECT COUNT(*) AS count FROM ${table} WHERE vec IS NOT NULL`)
    const rows = await conn.runAndReadAll(`SELECT fingerprint, COUNT(*) AS count FROM ${table} WHERE vec IS NOT NULL GROUP BY fingerprint`)
    const fingerprints: Record<string, number> = {}

    for (const row of rows.getRowObjectsJson()) {
        fingerprints[String(row.fingerprint)] = Number(row.count)
    }

    return { vectors: Number((total.getRowObjectsJson()[0] as { count?: string | number } | undefined)?.count ?? 0), fingerprints }
}

/**
 * 按行分页读取某语言的全部向量并推送到远端。
 *
 * 用 rowid 键集分页（主键 anchor 之上的辅助序，避免 OFFSET 重复扫描）；
 * insertDocuments 内部按 100 条/请求分批并逐条校验结果码，任何失败都会抛出。
 * @param config 远端配置
 * @param conn 只读连接
 * @param lang 数据语言
 * @param dims 向量维度
 * @returns 成功推送的条数
 */
async function pushLang(config: DashVectorConfig, conn: DuckDBConnection, lang: string, dims: number): Promise<number> {
    const table = `chunks_${lang}`
    let lastRowid = -1
    let pushed = 0

    for (;;) {
        const rows = await conn.runAndReadAll(
            `SELECT rowid, anchor, kind, hash, fingerprint, vec FROM ${table} WHERE vec IS NOT NULL AND rowid > ? ORDER BY rowid LIMIT ${READ_PAGE_SIZE}`,
            [lastRowid]
        )
        const records = rows.getRowObjectsJson()

        if (!records.length) {
            return pushed
        }

        const docs = records.map(row => {
            const anchor = String(row.anchor)

            return {
                anchor,
                vector: vecToNumbers(row.vec, dims, anchor),
                fields: { anchor, lang, kind: String(row.kind), hash: String(row.hash), fingerprint: String(row.fingerprint) },
            }
        })

        // 任何一批失败都会抛出：已推送的行按锚点 upsert，重跑脚本即可续传
        pushed += await insertDocuments(config, docs)

        const last = Number(records[records.length - 1]!.rowid)

        if (!Number.isFinite(last)) {
            throw new Error(`rowid 读取异常（${lang}）：${String(records[records.length - 1]!.rowid)}`)
        }

        lastRowid = last
        console.log(`[rag-migrate] ${lang} 已推送 ${pushed} 条`)
    }
}

/** 脚本入口 */
async function main(): Promise<void> {
    parseArgs(process.argv.slice(2))

    const indexPath = resolveIndexPath()
    const meta = await readMetaAt(indexPath)

    if (meta?.state !== "ready" || !meta.dims) {
        fail(`本地索引不存在或未构建完成（${indexPath}）。先执行 \`bun sv -- --index-all\`（或等请求自然触发）构建索引。`)
    }

    console.log(`[rag-migrate] 本地索引：${indexPath}`)
    console.log(`[rag-migrate] 模型 ${meta.model}，维度 ${meta.dims}，后端标记 ${meta.vectorStore}，构建于 ${meta.builtAt}`)

    // 本地分析：各语言可迁移的向量数与指纹分布。语言白名单下本地只会有部分语言的表，
    // 先列出真实存在的 chunks_% 表再逐个分析，缺表的跳过（按固定清单硬查会报 Catalog Error）
    const listConnection = await openReadonlyConnection(indexPath)
    let localTables: string[]

    try {
        const rows = await listConnection.conn.runAndReadAll(
            "SELECT table_name FROM duckdb_tables() WHERE schema_name = 'main' AND table_name LIKE 'chunks_%'"
        )
        localTables = rows.getRowObjectsJson().map(row => String(row.table_name))
    } finally {
        listConnection.close()
    }

    const analysis = new Map<string, { vectors: number; fingerprints: Record<string, number> }>()
    let totalVectors = 0

    for (const lang of langs) {
        if (!localTables.includes(`chunks_${lang}`)) {
            console.log(`[rag-migrate] ${lang}：本地没有该语言的索引表，跳过`)

            continue
        }

        const connection = await openReadonlyConnection(indexPath)
        let result: { vectors: number; fingerprints: Record<string, number> }

        try {
            result = await analyzeLang(connection.conn, lang)
        } finally {
            connection.close()
        }

        analysis.set(lang, result)
        totalVectors += result.vectors

        const stale = Object.keys(result.fingerprints).filter(
            fingerprint => !Object.values(meta.fingerprints[lang] ?? {}).includes(fingerprint)
        )

        console.log(
            `[rag-migrate] ${lang}：向量 ${result.vectors} 条` +
                (stale.length ? `（⚠️ 含 ${stale.length} 个 meta 之外的旧代指纹，远端会按指纹过滤它们）` : "")
        )
    }

    if (!totalVectors) {
        fail("本地没有任何可迁移的向量（全部语言的行都是元数据）。请先以本地模式构建索引。")
    }

    if (dryRun) {
        console.log(`[rag-migrate] --dry-run：共 ${totalVectors} 条向量待推送。未连接远端、未做任何写入。`)

        return
    }

    // 远端配置：三项缺一不可（三件套本身即远端向量库的启用开关）
    const endpoint = process.env.AI_EMBEDDING_SERVER_ENDPOINT?.trim() ?? ""
    const apiKey = process.env.AI_EMBEDDING_SERVER_API_KEY?.trim() ?? ""
    const collection = process.env.AI_EMBEDDING_SERVER_COLLECTION?.trim() ?? ""

    if (!endpoint || !apiKey || !collection) {
        fail("缺少远端向量库配置（AI_EMBEDDING_SERVER_ENDPOINT / _API_KEY / _COLLECTION）")
    }

    const config: DashVectorConfig = { endpoint, apiKey, collection }

    // 集合维度必须与本地索引一致，度量应为 cosine（否则相似度换算口径不对）
    const info = await describeCollection(config)

    if (info.dimension && info.dimension !== meta.dims) {
        fail(`远端集合维度不符：集合 ${info.dimension}，本地索引 ${meta.dims}。请新建集合或调整 AI_EMBEDDING_DIM 后重建本地索引。`)
    }

    if (info.metric && info.metric !== "cosine") {
        console.warn(`[rag-migrate] ⚠️ 远端集合度量是 ${info.metric}（期望 cosine）：相似度换算口径会与本地不一致，建议重建集合。`)
    }

    console.log(
        `[rag-migrate] 远端集合 ${info.name || collection}：维度 ${info.dimension}，度量 ${info.metric}，现有文档 ${info.docCount} 条`
    )

    // 逐语言推送（向量按锚点 upsert，任何失败可整体重跑）
    let pushedTotal = 0

    for (const [lang, { vectors }] of analysis) {
        if (!vectors) {
            console.log(`[rag-migrate] ${lang}：本地没有向量，跳过`)

            continue
        }

        const connection = await openReadonlyConnection(indexPath)

        try {
            pushedTotal += await pushLang(config, connection.conn, lang, meta.dims)
        } finally {
            connection.close()
        }
    }

    console.log(`[rag-migrate] 推送完成：共 ${pushedTotal} 条（远端集合现有文档 ${info.docCount + pushedTotal} 条左右，以控制台为准）`)

    // 改写本地标记：让远端模式下的第一次构建判定「已是最新」，不重新嵌入。
    // 必须放在全部推送成功之后：半写状态绝不能被当成迁移完成
    if (noSwitch) {
        console.log("[rag-migrate] --no-switch：保留本地 local:duckdb 标记，未改写 meta。")

        return
    }

    const remoteTag = `remote:${collection}`
    const db = await openIndexForBuild(indexPath)

    try {
        await db.writeMeta({ ...meta, vectorStore: remoteTag })
        await db.commit()
    } catch (error) {
        await db.abort()

        throw error
    }

    console.log(`[rag-migrate] 本地 meta.vectorStore → ${remoteTag}`)
    console.log("[rag-migrate] 后续步骤：重启服务即可（.env 已配 DashVector 三件套，重启后检索直接走远端），向量不会被重新嵌入。")
    console.log("[rag-migrate] 注意：本地 DuckDB 里保留的向量不再被使用（仅占磁盘），切回本地模式会自动全量重建。")
}

try {
    await main()
} catch (error) {
    console.error(`[rag-migrate] 迁移失败：${error instanceof Error ? error.message : String(error)}`)
    console.error("[rag-migrate] 已推送的向量按锚点 upsert，排除问题后重跑脚本即可续传。")

    process.exit(1)
}
