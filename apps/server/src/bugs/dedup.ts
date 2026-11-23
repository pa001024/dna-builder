import { and, eq, notInArray } from "drizzle-orm"
import * as schema from "../db/schema"
import { normalizeForIndex, tokenizeText } from "./tokenize"
import type { BugDb, BugStatus } from "./types"

/** BM25 参数：游戏 BUG 语料短、标题权重高，采用常见默认值。 */
const K1 = 1.2
const B = 0.75
const TITLE_BOOST = 3
const DEFAULT_LIMIT = 20

export type BugCandidate = {
    bugId: string
    title: string
    status: string
    score: number
}

type IndexedDoc = {
    bugId: string
    title: string
    titleNormalized: string
    status: string
    tf: Map<string, number>
    length: number
}

type GameIndex = {
    docs: IndexedDoc[]
    df: Map<string, number>
    avgdl: number
}

/** 索引挂在 db 实例上，避免多个测试库之间串数据；新建 Bug 后按 gameId 失效。 */
const indexCache = new WeakMap<object, Map<string, GameIndex>>()

/** 参与召回的 Bug：公开、同游戏，跳过已归并 / 拒绝项（关闭项仍参与，spec §12.1）。 */
const EXCLUDED_STATUSES: BugStatus[] = ["duplicate", "rejected"]

function documentText(bug: typeof schema.bugs.$inferSelect): string {
    const environment = bug.environment ? JSON.stringify(bug.environment) : ""
    return [bug.title, bug.summary, bug.actual ?? "", bug.expected ?? "", ...bug.steps, bug.primaryCategory, ...bug.tags, environment]
        .filter(Boolean)
        .join("\n")
}

function buildGameIndex(db: BugDb, gameId: string): GameIndex {
    const rows = db
        .select()
        .from(schema.bugs)
        .where(and(eq(schema.bugs.gameId, gameId), eq(schema.bugs.visibility, "public"), notInArray(schema.bugs.status, EXCLUDED_STATUSES)))
        .all()

    const docs: IndexedDoc[] = rows.map(bug => {
        const tf = tokenizeText(documentText(bug))
        let length = 0
        for (const count of tf.values()) length += count
        return { bugId: bug.id, title: bug.title, titleNormalized: normalizeForIndex(bug.title), status: bug.status, tf, length }
    })

    const df = new Map<string, number>()
    for (const doc of docs) {
        for (const token of doc.tf.keys()) df.set(token, (df.get(token) ?? 0) + 1)
    }
    const total = docs.reduce((sum, doc) => sum + doc.length, 0)

    return { docs, df, avgdl: docs.length ? total / docs.length : 0 }
}

function getGameIndex(db: BugDb, gameId: string): GameIndex {
    let perDb = indexCache.get(db)
    if (!perDb) {
        perDb = new Map()
        indexCache.set(db, perDb)
    }
    let index = perDb.get(gameId)
    if (!index) {
        index = buildGameIndex(db, gameId)
        perDb.set(gameId, index)
    }
    return index
}

/**
 * @description 让判重索引失效：Bug 新建、更新、合并后调用；不传 gameId 时清空该库全部游戏。
 * @param db 数据库
 * @param gameId 游戏 id
 */
export function invalidateDedupIndex(db: BugDb, gameId?: string): void {
    const perDb = indexCache.get(db)
    if (!perDb) return
    if (gameId) perDb.delete(gameId)
    else perDb.clear()
}

/** 强制重建某游戏的索引（测试与后台重建任务使用）。 */
export function rebuildDedupIndex(db: BugDb, gameId: string): GameIndex {
    const perDb = indexCache.get(db) ?? new Map<string, GameIndex>()
    const index = buildGameIndex(db, gameId)
    perDb.set(gameId, index)
    indexCache.set(db, perDb)
    return index
}

/**
 * @description 词法候选召回：CJK bigram + 拉丁词切分后做 BM25，限定 gameId，返回 Top N 候选。
 * 索引在内存中懒加载，Bug 变更后由调用方失效；结果不包含私有、已归并或已拒绝记录。
 * @param db 数据库
 * @param text 待判重文本
 * @param gameId 游戏 id
 * @param limit 候选数量（默认 20）
 * @returns 按相关度降序的候选
 */
export function searchBugCandidates(db: BugDb, text: string, gameId: string, limit = DEFAULT_LIMIT): BugCandidate[] {
    const queryTokens = tokenizeText(text)
    if (!queryTokens.size) return []

    const index = getGameIndex(db, gameId)
    if (!index.docs.length) return []

    const normalizedQuery = normalizeForIndex(text).trim()
    const total = index.docs.length
    const results: BugCandidate[] = []

    for (const doc of index.docs) {
        let score = 0
        for (const [token, queryFrequency] of queryTokens) {
            const frequency = doc.tf.get(token)
            if (!frequency) continue
            const documentFrequency = index.df.get(token) ?? 0
            const idf = Math.log(1 + (total - documentFrequency + 0.5) / (documentFrequency + 0.5))
            const denominator = frequency + K1 * (1 - B + (B * doc.length) / (index.avgdl || 1))
            score += queryFrequency * idf * ((frequency * (K1 + 1)) / denominator)
        }

        if (normalizedQuery && doc.titleNormalized.includes(normalizedQuery)) score += TITLE_BOOST
        if (score > 0) results.push({ bugId: doc.bugId, title: doc.title, status: doc.status, score })
    }

    results.sort((a, b) => b.score - a.score || (a.bugId < b.bugId ? -1 : a.bugId > b.bugId ? 1 : 0))
    return results.slice(0, Math.max(1, limit))
}

/** 可参与自动关联的候选：同游戏、公开、未归并、未拒绝。 */
export function isEligibleDuplicateCandidate(db: BugDb, bugId: string, gameId: string): typeof schema.bugs.$inferSelect | null {
    const bug = db.select().from(schema.bugs).where(eq(schema.bugs.id, bugId)).get()
    if (!bug || bug.gameId !== gameId || bug.visibility !== "public") return null
    if (EXCLUDED_STATUSES.includes(bug.status)) return null
    return bug
}
