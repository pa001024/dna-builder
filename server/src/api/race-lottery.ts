import { appendFile, mkdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import Elysia, { t } from "elysia"
import jwt from "jsonwebtoken"
import { nanoid } from "nanoid"
import { type JWTUser, jwtToken } from "../db/yoga"

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type RaceLotteryBuffIds = [number, number, number]

type StoredEntry = {
    id: string
    playerId: number
    buffIds: RaceLotteryBuffIds
    userId: string
    userName: string
    createdAt: number
    updatedAt: number
}

type DailyCache = {
    entries: Map<string, StoredEntry>
    entriesByPlayer: Map<number, Map<string, StoredEntry>>
    aggregatedEntries: Map<number, AggregatedEntry>
}

type AggregatedEntry = {
    playerId: number
    buffIds: RaceLotteryBuffIds
    submissionCount: number
    lastUpdatedBy: string
}

type PublicAggregatedEntry = AggregatedEntry & {
    isMine: boolean
    myBuffIds: RaceLotteryBuffIds | null
}

type BuffStat = {
    weight: number
    firstSeen: number
}

type AggregatedPlayer = {
    playerId: number
    submissionCount: number
    stats: Map<number, BuffStat>
    lastUpdatedBy: string
    lastUpdatedAt: number
}

const writeLocks = new Map<string, Promise<void>>()

/**
 * 获取 RaceLottery 日期文件目录。
 * @returns 日期 JSONL 文件目录。
 */
function getDataDir(): string {
    return process.env.RACE_LOTTERY_DATA_DIR || resolve(import.meta.dir, "../../data/race-lottery")
}

/**
 * 校验日期字符串并返回安全的文件名。
 * @param date 日期字符串。
 * @returns 合法日期或 null。
 */
function normalizeDate(date: string): string | null {
    if (!DATE_PATTERN.test(date)) return null
    const parsed = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null
    return date
}

/**
 * 获取日期 JSONL 文件路径。
 * @param date 合法日期。
 * @param dataDir 数据目录。
 * @returns 日期数据文件路径。
 */
function getDataFile(date: string, dataDir: string): string {
    return resolve(dataDir, `${date}.jsonl`)
}

/**
 * 校验并规范化三个位置的 buff ID。
 * @param value 请求或文件中的原始值。
 * @returns 固定长度的 buff ID 元组或 null。
 */
function normalizeBuffIds(value: unknown): RaceLotteryBuffIds | null {
    if (!Array.isArray(value) || value.length !== 3 || value.some(id => !Number.isInteger(id) || id < 0)) return null
    return [value[0], value[1], value[2]]
}

/**
 * 将用户和选手组合为缓存键。
 * @param userId 用户 ID。
 * @param playerId 选手 ID。
 * @returns 唯一缓存键。
 */
function getEntryKey(userId: string, playerId: number): string {
    return `${userId}:${playerId}`
}

/**
 * 解析 JSONL 中的一条结构化提交记录。
 * @param value JSON 值。
 * @returns 有效记录或 null。
 */
function parseStoredEntry(value: unknown): StoredEntry | null {
    if (!value || typeof value !== "object") return null
    const item = value as Partial<StoredEntry>
    const playerId = item.playerId
    const createdAt = item.createdAt
    const updatedAt = item.updatedAt
    const buffIds = normalizeBuffIds(item.buffIds)
    if (
        typeof item.id !== "string" ||
        typeof playerId !== "number" ||
        !Number.isInteger(playerId) ||
        !buffIds ||
        typeof item.userId !== "string" ||
        typeof item.userName !== "string" ||
        typeof createdAt !== "number" ||
        !Number.isFinite(createdAt) ||
        typeof updatedAt !== "number" ||
        !Number.isFinite(updatedAt)
    ) {
        return null
    }
    return {
        id: item.id,
        playerId,
        buffIds,
        userId: item.userId,
        userName: item.userName,
        createdAt,
        updatedAt,
    }
}

/**
 * 读取单日 JSONL 并保留每个用户与选手的最新记录。
 * @param date 日期。
 * @param dataDir 数据目录。
 * @returns 单日最新记录。
 */
async function readDailyEntries(date: string, dataDir: string): Promise<StoredEntry[]> {
    let raw: string
    try {
        raw = await readFile(getDataFile(date, dataDir), "utf8")
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
        throw error
    }

    const latestEntries = new Map<string, StoredEntry>()
    for (const line of raw.split(/\r?\n/u)) {
        if (!line.trim()) continue
        const entry = parseStoredEntry(JSON.parse(line))
        if (entry) latestEntries.set(getEntryKey(entry.userId, entry.playerId), entry)
    }
    return Array.from(latestEntries.values())
}

/**
 * 获取日期缓存，首次访问时读取一次 JSONL，后续 API 调用只读内存。
 * @param date 日期。
 * @param dataDir 数据目录。
 * @param cacheByDate 日期缓存表。
 * @returns 日期缓存。
 */
async function getDailyCache(date: string, dataDir: string, cacheByDate: Map<string, Promise<DailyCache>>): Promise<DailyCache> {
    const cached = cacheByDate.get(date)
    if (cached) return cached

    const loading = readDailyEntries(date, dataDir).then(entries => createDailyCache(entries))
    cacheByDate.set(date, loading)
    try {
        return await loading
    } catch (error) {
        if (cacheByDate.get(date) === loading) cacheByDate.delete(date)
        throw error
    }
}

/**
 * 追加一条 JSONL 记录，不重写整日文件。
 * @param date 日期。
 * @param entry 要追加的最新记录。
 * @param dataDir 数据目录。
 */
async function appendDailyEntry(date: string, entry: StoredEntry, dataDir: string): Promise<void> {
    await mkdir(dataDir, { recursive: true })
    await appendFile(getDataFile(date, dataDir), `${JSON.stringify(entry)}\n`, "utf8")
}

/**
 * 按社区提交频次统计每个选手的前三个词条。
 * @param entries 当前日期的最新提交记录。
 * @returns 每个选手一条统计后的公开记录。
 */
function aggregateEntries(entries: Iterable<StoredEntry>): AggregatedEntry[] {
    const players = new Map<number, AggregatedPlayer>()
    let firstSeen = 0

    for (const entry of entries) {
        let player = players.get(entry.playerId)
        if (!player) {
            player = {
                playerId: entry.playerId,
                submissionCount: 0,
                stats: new Map(),
                lastUpdatedBy: entry.userName,
                lastUpdatedAt: entry.updatedAt,
            }
            players.set(entry.playerId, player)
        }

        player.submissionCount += 1
        if (entry.updatedAt >= player.lastUpdatedAt) {
            player.lastUpdatedBy = entry.userName
            player.lastUpdatedAt = entry.updatedAt
        }

        for (const buffId of new Set(entry.buffIds.filter(id => id > 0))) {
            const stat = player.stats.get(buffId)
            if (stat) stat.weight += 1
            else {
                player.stats.set(buffId, { weight: 1, firstSeen })
                firstSeen += 1
            }
        }
    }

    return Array.from(players.values()).map(player => {
        const topBuffIds = Array.from(player.stats.entries())
            .sort(([, left], [, right]) => right.weight - left.weight || left.firstSeen - right.firstSeen)
            .slice(0, 3)
            .map(([buffId]) => buffId)

        return {
            playerId: player.playerId,
            buffIds: [topBuffIds[0] || 0, topBuffIds[1] || 0, topBuffIds[2] || 0],
            submissionCount: player.submissionCount,
            lastUpdatedBy: player.lastUpdatedBy,
        }
    })
}

/**
 * 只重算一个选手的聚合结果，用于提交写入后的增量更新。
 * @param playerId 选手 ID。
 * @param entries 该选手的最新用户记录。
 * @returns 选手聚合结果。
 */
function aggregatePlayerEntry(playerId: number, entries: Iterable<StoredEntry>): AggregatedEntry {
    return (
        aggregateEntries(entries).find(entry => entry.playerId === playerId) || {
            playerId,
            buffIds: [0, 0, 0],
            submissionCount: 0,
            lastUpdatedBy: "",
        }
    )
}

/**
 * 创建日期内存缓存，并在首次读取 JSONL 时完成一次全量统计。
 * @param entries 日期内每个用户与选手的最新记录。
 * @returns 日期缓存。
 */
function createDailyCache(entries: StoredEntry[]): DailyCache {
    const entryMap = new Map<string, StoredEntry>()
    const entriesByPlayer = new Map<number, Map<string, StoredEntry>>()
    for (const entry of entries) {
        entryMap.set(getEntryKey(entry.userId, entry.playerId), entry)
        let playerEntries = entriesByPlayer.get(entry.playerId)
        if (!playerEntries) {
            playerEntries = new Map<string, StoredEntry>()
            entriesByPlayer.set(entry.playerId, playerEntries)
        }
        playerEntries.set(entry.userId, entry)
    }

    const aggregatedEntries = new Map(aggregateEntries(entries).map(entry => [entry.playerId, entry]))
    return { entries: entryMap, entriesByPlayer, aggregatedEntries }
}

/**
 * 将一条聚合结果补充为当前用户可见的公开响应。
 * @param entry 缓存中的聚合结果。
 * @param cache 日期缓存。
 * @param currentUserId 当前用户 ID。
 * @returns 公开聚合结果。
 */
function toPublicAggregatedEntry(entry: AggregatedEntry, cache: DailyCache, currentUserId?: string): PublicAggregatedEntry {
    const mine = currentUserId ? cache.entriesByPlayer.get(entry.playerId)?.get(currentUserId) : undefined
    return {
        ...entry,
        isMine: mine !== undefined,
        myBuffIds: mine?.buffIds || null,
    }
}

/**
 * 读取缓存中的聚合结果，不重新计算权重。
 * @param cache 日期缓存。
 * @param currentUserId 当前用户 ID。
 * @returns 公开聚合结果。
 */
function getPublicAggregatedEntries(cache: DailyCache, currentUserId?: string): PublicAggregatedEntry[] {
    return Array.from(cache.aggregatedEntries.values()).map(entry => toPublicAggregatedEntry(entry, cache, currentUserId))
}

/**
 * 写入一条最新记录并增量更新对应选手的缓存。
 * @param cache 日期缓存。
 * @param entry 最新提交记录。
 */
function updateDailyCacheEntry(cache: DailyCache, entry: StoredEntry): void {
    const key = getEntryKey(entry.userId, entry.playerId)
    cache.entries.set(key, entry)

    let playerEntries = cache.entriesByPlayer.get(entry.playerId)
    if (!playerEntries) {
        playerEntries = new Map<string, StoredEntry>()
        cache.entriesByPlayer.set(entry.playerId, playerEntries)
    }
    playerEntries.set(entry.userId, entry)
    cache.aggregatedEntries.set(entry.playerId, aggregatePlayerEntry(entry.playerId, playerEntries.values()))
}

/**
 * 串行化同一日期的追加操作，避免并发写入交错。
 * @param date 日期。
 * @param action 写入操作。
 * @returns 写入操作结果。
 */
async function withDateLock<T>(date: string, action: () => Promise<T>): Promise<T> {
    const previous = writeLocks.get(date) || Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolvePromise => {
        release = resolvePromise
    })
    writeLocks.set(date, current)
    await previous
    try {
        return await action()
    } finally {
        release()
        if (writeLocks.get(date) === current) writeLocks.delete(date)
    }
}

/**
 * 从请求头解析现有登录态 JWT。
 * @param request 当前请求。
 * @returns 登录用户或 null。
 */
function getUser(request: Request): JWTUser | null {
    const token = request.headers.get("token")
    if (!token) return null
    try {
        return jwt.verify(token, jwtToken) as JWTUser
    } catch {
        return null
    }
}

/**
 * 创建 RaceLottery JSONL 存储 API。
 * @param dataDir 可选的数据目录，测试时可传入临时目录。
 * @returns Elysia 插件实例。
 */
export function raceLotteryPlugin(dataDir = getDataDir()) {
    const cacheByDate = new Map<string, Promise<DailyCache>>()

    return new Elysia({ prefix: "/api/race-lottery" })
        .get(
            "/:date",
            async ({ params, request, set }) => {
                const date = normalizeDate(params.date)
                if (!date) {
                    set.status = 400
                    return { success: false, error: "日期格式无效" }
                }

                const cache = await getDailyCache(date, dataDir, cacheByDate)
                const user = getUser(request)
                return {
                    date,
                    entries: getPublicAggregatedEntries(cache, user?.id).sort((left, right) => left.playerId - right.playerId),
                }
            },
            {
                params: t.Object({ date: t.String() }),
            }
        )
        .post(
            "/:date/entries",
            async ({ params, body, request, set }) => {
                const date = normalizeDate(params.date)
                if (!date) {
                    set.status = 400
                    return { success: false, error: "日期格式无效" }
                }

                const user = getUser(request)
                if (!user) {
                    set.status = 401
                    return { success: false, error: "请先登录" }
                }

                const buffIds = normalizeBuffIds(body.buffIds)
                if (!Number.isInteger(body.playerId) || body.playerId <= 0 || !buffIds) {
                    set.status = 400
                    return { success: false, error: "选手或词条 ID 无效" }
                }

                const now = Date.now()
                let aggregatedEntry: AggregatedEntry | undefined
                await withDateLock(date, async () => {
                    const cache = await getDailyCache(date, dataDir, cacheByDate)
                    const key = getEntryKey(user.id, body.playerId)
                    const existingEntry = cache.entries.get(key)
                    const nextEntry: StoredEntry = existingEntry
                        ? {
                              ...existingEntry,
                              buffIds,
                              userName: user.name,
                              updatedAt: now,
                          }
                        : {
                              id: nanoid(10),
                              playerId: body.playerId,
                              buffIds,
                              userId: user.id,
                              userName: user.name,
                              createdAt: now,
                              updatedAt: now,
                          }

                    await appendDailyEntry(date, nextEntry, dataDir)
                    updateDailyCacheEntry(cache, nextEntry)
                    const cachedEntry = cache.aggregatedEntries.get(body.playerId)
                    if (cachedEntry) aggregatedEntry = toPublicAggregatedEntry(cachedEntry, cache, user.id)
                })

                return { success: true, entry: aggregatedEntry }
            },
            {
                params: t.Object({ date: t.String() }),
                body: t.Object({
                    playerId: t.Number(),
                    buffIds: t.Array(t.Number(), { minItems: 3, maxItems: 3 }),
                }),
            }
        )
}
