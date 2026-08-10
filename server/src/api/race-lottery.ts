import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
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
 * 静态词条倍率，与前端 src/data/d/race-lottery.data.ts 保持一致。
 * 服务端独立部署，无法共享前端数据文件，因此在此维护一份用于自动计算。
 */
const OUTSIDE_BUFF_EFFECT: Record<number, number> = {
    1001: 1.05,
    1002: 1.1,
    1003: 1.15,
    1004: 1.2,
    1005: 1.3,
    1006: 2,
    2001: 0.95,
    2002: 0.91,
    2003: 0.87,
    2004: 0.83,
    2005: 0.77,
    2006: 0.5,
}

/** 基础速度兜底值，与前端静态 defaultSpeed 一致。 */
const DEFAULT_BASE_SPEED = 1

/** 支持的服务器。 */
const RACE_LOTTERY_SERVERS = ["CN", "ASIA", "US", "EU"] as const
type RaceLotteryServer = (typeof RACE_LOTTERY_SERVERS)[number]

/** 默认服务器。 */
const DEFAULT_SERVER: RaceLotteryServer = "CN"

/** 单日各选手的最终速度，按 playerId 索引。 */
export type RaceLotteryFinalSpeeds = Record<string, number>

/** 日期最终速度文件内容。 */
type StoredFinalSpeeds = {
    date: string
    updatedAt: number
    updatedBy: string
    finalSpeeds: RaceLotteryFinalSpeeds
}

/** 单日有效的最终速度结果。 */
type EffectiveFinalSpeeds = {
    finalSpeeds: RaceLotteryFinalSpeeds
    isAuto: boolean
    updatedAt: number
    updatedBy: string
}

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
 * 校验并规范化服务器名；非法或未提供时回退为默认服务器 CN。
 * @param server 服务器字符串。
 * @returns 合法服务器或 CN。
 */
function normalizeServer(server: unknown): RaceLotteryServer {
    if (typeof server === "string") {
        const upper = server.toUpperCase() as RaceLotteryServer
        if ((RACE_LOTTERY_SERVERS as readonly string[]).includes(upper)) return upper
    }
    return DEFAULT_SERVER
}

/**
 * 计算给定日期的前一天。
 * @param date 合法日期。
 * @returns 前一天的 YYYY-MM-DD。
 */
function getPreviousDate(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`)
    parsed.setUTCDate(parsed.getUTCDate() - 1)
    return parsed.toISOString().slice(0, 10)
}

/**
 * 获取日期 JSONL 文件路径。
 * CN 服务器保留原路径不变；其他服务器使用各自的子目录，便于分开统计。
 * @param date 合法日期。
 * @param server 服务器。
 * @param dataDir 数据目录。
 * @returns 日期数据文件路径。
 */
function getDataFile(date: string, server: RaceLotteryServer, dataDir: string): string {
    return server === DEFAULT_SERVER ? resolve(dataDir, `${date}.jsonl`) : resolve(dataDir, server, `${date}.jsonl`)
}

/**
 * 获取单日最终速度文件路径。
 * CN 服务器保留原路径不变；其他服务器使用各自的子目录。
 * @param date 合法日期。
 * @param server 服务器。
 * @param dataDir 数据目录。
 * @returns 最终速度文件路径。
 */
function getFinalSpeedsFile(date: string, server: RaceLotteryServer, dataDir: string): string {
    return server === DEFAULT_SERVER ? resolve(dataDir, `${date}.final-speeds.json`) : resolve(dataDir, server, `${date}.final-speeds.json`)
}

/**
 * 解析最终速度文件中的存储内容。
 * @param raw 文件原始文本。
 * @returns 有效内容或 null。
 */
function parseStoredFinalSpeeds(raw: string): StoredFinalSpeeds | null {
    try {
        const value = JSON.parse(raw) as Partial<StoredFinalSpeeds>
        if (!value || typeof value !== "object") return null
        if (typeof value.finalSpeeds !== "object" || value.finalSpeeds === null) return null
        const finalSpeeds: RaceLotteryFinalSpeeds = {}
        for (const [playerId, speed] of Object.entries(value.finalSpeeds)) {
            if (typeof speed === "number" && Number.isFinite(speed)) finalSpeeds[playerId] = speed
        }
        if (typeof value.date !== "string" || typeof value.updatedAt !== "number" || typeof value.updatedBy !== "string") {
            return null
        }
        return {
            date: value.date,
            updatedAt: value.updatedAt,
            updatedBy: value.updatedBy,
            finalSpeeds,
        }
    } catch {
        return null
    }
}

/**
 * 读取单日最终速度文件；不存在或内容无效时返回空记录。
 * @param date 日期。
 * @param server 服务器。
 * @param dataDir 数据目录。
 * @returns 最终速度记录。
 */
async function readStoredFinalSpeeds(date: string, server: RaceLotteryServer, dataDir: string): Promise<StoredFinalSpeeds | null> {
    try {
        const raw = await readFile(getFinalSpeedsFile(date, server, dataDir), "utf8")
        const stored = parseStoredFinalSpeeds(raw)
        return stored && stored.date === date ? stored : null
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
    }
}

/**
 * 覆盖写入单日最终速度文件。
 * @param date 日期。
 * @param server 服务器。
 * @param finalSpeeds 各选手最终速度。
 * @param updatedBy 修改人用户名。
 * @param dataDir 数据目录。
 */
async function writeStoredFinalSpeeds(
    date: string,
    server: RaceLotteryServer,
    finalSpeeds: RaceLotteryFinalSpeeds,
    updatedBy: string,
    dataDir: string
): Promise<void> {
    const file = getFinalSpeedsFile(date, server, dataDir)
    await mkdir(resolve(file, ".."), { recursive: true })
    const content: StoredFinalSpeeds = {
        date,
        updatedAt: Date.now(),
        updatedBy,
        finalSpeeds,
    }
    await writeFile(file, `${JSON.stringify(content)}\n`, "utf8")
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
 * @param server 服务器。
 * @param dataDir 数据目录。
 * @returns 单日最新记录。
 */
async function readDailyEntries(date: string, server: RaceLotteryServer, dataDir: string): Promise<StoredEntry[]> {
    let raw: string
    try {
        raw = await readFile(getDataFile(date, server, dataDir), "utf8")
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
 * @param server 服务器。
 * @param dataDir 数据目录。
 * @param cacheByDate 日期缓存表。
 * @returns 日期缓存。
 */
async function getDailyCache(
    date: string,
    server: RaceLotteryServer,
    dataDir: string,
    cacheByDate: Map<string, Promise<DailyCache>>
): Promise<DailyCache> {
    const cacheKey = `${server}:${date}`
    const cached = cacheByDate.get(cacheKey)
    if (cached) return cached

    const loading = readDailyEntries(date, server, dataDir).then(entries => createDailyCache(entries))
    cacheByDate.set(cacheKey, loading)
    try {
        return await loading
    } catch (error) {
        if (cacheByDate.get(cacheKey) === loading) cacheByDate.delete(cacheKey)
        throw error
    }
}

/**
 * 追加一条 JSONL 记录，不重写整日文件。
 * @param date 日期。
 * @param server 服务器。
 * @param entry 要追加的最新记录。
 * @param dataDir 数据目录。
 */
async function appendDailyEntry(date: string, server: RaceLotteryServer, entry: StoredEntry, dataDir: string): Promise<void> {
    const file = getDataFile(date, server, dataDir)
    await mkdir(resolve(file, ".."), { recursive: true })
    await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8")
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
 * 获取单日最终速度的内存缓存，首次读取一次文件。
 * @param date 日期。
 * @param server 服务器。
 * @param dataDir 数据目录。
 * @param cacheByDate 最终速度缓存表。
 * @returns 单日最终速度（无记录时为空对象）。
 */
async function getFinalSpeedsCache(
    date: string,
    server: RaceLotteryServer,
    dataDir: string,
    cacheByDate: Map<string, Promise<StoredFinalSpeeds | null>>
): Promise<StoredFinalSpeeds | null> {
    const cacheKey = `${server}:${date}`
    const cached = cacheByDate.get(cacheKey)
    if (cached) return cached

    const loading = readStoredFinalSpeeds(date, server, dataDir)
    cacheByDate.set(cacheKey, loading)
    try {
        return await loading
    } catch (error) {
        if (cacheByDate.get(cacheKey) === loading) cacheByDate.delete(cacheKey)
        throw error
    }
}

/**
 * 将聚合词条中的已知词条倍率相乘。
 * @param buffIds 聚合出的三个词条 ID。
 * @param baseSpeed 基础速度。
 * @returns 词条倍率乘积；无已知词条时不变。
 */
function multiplyBuffEffects(buffIds: readonly number[], baseSpeed: number): number {
    let speed = baseSpeed
    for (const buffId of buffIds) {
        const effect = OUTSIDE_BUFF_EFFECT[buffId]
        if (effect !== undefined) speed *= effect
    }
    return speed
}

/**
 * 按前端相同的逻辑计算某选手的最终速度：基础速度 × 已知外部词条倍率。
 * 基础速度缺失时回退为静态默认值 1（与前端 defaultSpeed 一致）。
 * @param playerId 选手 ID。
 * @param aggregatedEntries 当日各选手聚合词条。
 * @param baseSpeeds 各选手基础速度。
 * @returns 该选手最终速度。
 */
function computePlayerFinalSpeed(
    playerId: number,
    aggregatedEntries: ReadonlyMap<number, AggregatedEntry>,
    baseSpeeds: RaceLotteryFinalSpeeds
): number {
    const baseSpeed = baseSpeeds[String(playerId)] ?? DEFAULT_BASE_SPEED
    const entry = aggregatedEntries.get(playerId)
    if (!entry) return baseSpeed
    return multiplyBuffEffects(entry.buffIds, baseSpeed)
}

/**
 * 获取某日期的有效最终速度：管理员手动记录优先，否则由当日提交数据自动计算。
 * 自动计算与前端一致：基础速度取前一天的有效最终速度（缺失回退 1），再乘以当日已知词条倍率；
 * 若前一天无任何有效速度，则基础速度整体回退为默认值 1。当日无提交数据时不自动计算。
 * @param date 日期。
 * @param dataDir 数据目录。
 * @param cacheByDate 最终速度缓存表。
 * @param cacheByDaily 每日缓存表。
 * @param effectiveCache 有效最终速度缓存表。
 * @returns 有效最终速度结果。
 */
async function getEffectiveFinalSpeeds(
    date: string,
    server: RaceLotteryServer,
    dataDir: string,
    cacheByDate: Map<string, Promise<StoredFinalSpeeds | null>>,
    cacheByDaily: Map<string, Promise<DailyCache>>,
    effectiveCache: Map<string, Promise<EffectiveFinalSpeeds>>
): Promise<EffectiveFinalSpeeds> {
    const cacheKey = `${server}:${date}`
    const cached = effectiveCache.get(cacheKey)
    if (cached) return cached

    const loading = (async (): Promise<EffectiveFinalSpeeds> => {
        const stored = await getFinalSpeedsCache(date, server, dataDir, cacheByDate)
        if (stored) {
            return {
                finalSpeeds: stored.finalSpeeds,
                isAuto: false,
                updatedAt: stored.updatedAt,
                updatedBy: stored.updatedBy,
            }
        }

        const daily = await getDailyCache(date, server, dataDir, cacheByDaily)
        if (daily.aggregatedEntries.size === 0) {
            return { finalSpeeds: {}, isAuto: true, updatedAt: 0, updatedBy: "" }
        }

        const previousDate = getPreviousDate(date)
        const previous = await getEffectiveFinalSpeeds(previousDate, server, dataDir, cacheByDate, cacheByDaily, effectiveCache)
        const finalSpeeds: RaceLotteryFinalSpeeds = {}
        for (const [playerId] of daily.aggregatedEntries) {
            finalSpeeds[playerId] = computePlayerFinalSpeed(Number(playerId), daily.aggregatedEntries, previous.finalSpeeds)
        }
        return { finalSpeeds, isAuto: true, updatedAt: 0, updatedBy: "" }
    })()

    effectiveCache.set(cacheKey, loading)
    try {
        return await loading
    } catch (error) {
        if (effectiveCache.get(cacheKey) === loading) effectiveCache.delete(cacheKey)
        throw error
    }
}

/**
 * 使受影响的有效最终速度缓存失效。
 * 自动计算会逐日递推，某天数据变化会影响该日及之后所有日期的结果，
 * 日期为 YYYY-MM-DD 字符串，可按字典序比较，因此删除该服务器所有 ≥ date 的缓存。
 * @param date 变更日期。
 * @param server 服务器。
 * @param effectiveCache 有效最终速度缓存表。
 */
function invalidateEffectiveFinalSpeedsCache(
    date: string,
    server: RaceLotteryServer,
    effectiveCache: Map<string, Promise<EffectiveFinalSpeeds>>
): void {
    const prefix = `${server}:`
    for (const cacheKey of effectiveCache.keys()) {
        if (cacheKey.startsWith(prefix) && cacheKey.slice(prefix.length) >= date) effectiveCache.delete(cacheKey)
    }
}

/** RaceLottery 插件选项，便于测试注入。 */
type RaceLotteryPluginOptions = {
    isAdmin?: (user: JWTUser) => boolean
}

/**
 * 创建 RaceLottery JSONL 存储 API。
 * @param dataDir 可选的数据目录，测试时可传入临时目录。
 * @param options 可选的插件选项。
 * @returns Elysia 插件实例。
 */
export function raceLotteryPlugin(dataDir = getDataDir(), options: RaceLotteryPluginOptions = {}) {
    const cacheByDate = new Map<string, Promise<DailyCache>>()
    const finalSpeedsCacheByDate = new Map<string, Promise<StoredFinalSpeeds | null>>()
    const effectiveFinalSpeedsCache = new Map<string, Promise<EffectiveFinalSpeeds>>()
    const isAdmin = options.isAdmin || ((user: JWTUser) => user.roles?.includes("admin"))

    return new Elysia({ prefix: "/api/race-lottery" })
        .get(
            "/:date",
            async ({ params, request, set, query }) => {
                const date = normalizeDate(params.date)
                if (!date) {
                    set.status = 400
                    return { success: false, error: "日期格式无效" }
                }
                const server = normalizeServer(query.server)

                const cache = await getDailyCache(date, server, dataDir, cacheByDate)
                const user = getUser(request)

                // 当日基础速度取自前一天的有效最终速度（手动记录或自动计算）。
                const previousDate = getPreviousDate(date)
                const previousEffective = await getEffectiveFinalSpeeds(
                    previousDate,
                    server,
                    dataDir,
                    finalSpeedsCacheByDate,
                    cacheByDate,
                    effectiveFinalSpeedsCache
                )
                return {
                    date,
                    server,
                    baseSpeeds: previousEffective.finalSpeeds,
                    entries: getPublicAggregatedEntries(cache, user?.id).sort((left, right) => left.playerId - right.playerId),
                }
            },
            {
                params: t.Object({ date: t.String() }),
                query: t.Object({ server: t.Optional(t.String()) }),
            }
        )
        .get(
            "/:date/final-speeds",
            async ({ params, set, query }) => {
                const date = normalizeDate(params.date)
                if (!date) {
                    set.status = 400
                    return { success: false, error: "日期格式无效" }
                }
                const server = normalizeServer(query.server)

                const effective = await getEffectiveFinalSpeeds(
                    date,
                    server,
                    dataDir,
                    finalSpeedsCacheByDate,
                    cacheByDate,
                    effectiveFinalSpeedsCache
                )
                return {
                    date,
                    server,
                    isAuto: effective.isAuto,
                    updatedAt: effective.updatedAt,
                    updatedBy: effective.updatedBy,
                    finalSpeeds: effective.finalSpeeds,
                }
            },
            {
                params: t.Object({ date: t.String() }),
                query: t.Object({ server: t.Optional(t.String()) }),
            }
        )
        .put(
            "/:date/final-speeds",
            async ({ params, body, request, set, query }) => {
                const date = normalizeDate(params.date)
                if (!date) {
                    set.status = 400
                    return { success: false, error: "日期格式无效" }
                }
                const server = normalizeServer(query.server)

                const user = getUser(request)
                if (!user) {
                    set.status = 401
                    return { success: false, error: "请先登录" }
                }
                if (!isAdmin(user)) {
                    set.status = 403
                    return { success: false, error: "仅管理员可修改最终速度" }
                }

                const finalSpeeds: RaceLotteryFinalSpeeds = {}
                for (const [playerId, speed] of Object.entries(body.finalSpeeds)) {
                    const playerIdNum = Number(playerId)
                    if (!Number.isInteger(playerIdNum) || playerIdNum <= 0) {
                        set.status = 400
                        return { success: false, error: "选手 ID 无效" }
                    }
                    if (typeof speed !== "number" || !Number.isFinite(speed) || speed < 0) {
                        set.status = 400
                        return { success: false, error: "速度值无效" }
                    }
                    finalSpeeds[String(playerIdNum)] = speed
                }

                const stored = await withDateLock(`${server}:final-speeds:${date}`, async () => {
                    await writeStoredFinalSpeeds(date, server, finalSpeeds, user.name, dataDir)
                    const next: StoredFinalSpeeds = {
                        date,
                        updatedAt: Date.now(),
                        updatedBy: user.name,
                        finalSpeeds,
                    }
                    finalSpeedsCacheByDate.set(`${server}:${date}`, Promise.resolve(next))
                    invalidateEffectiveFinalSpeedsCache(date, server, effectiveFinalSpeedsCache)
                    return next
                })

                return {
                    success: true,
                    date: stored.date,
                    server,
                    isAuto: false,
                    updatedAt: stored.updatedAt,
                    updatedBy: stored.updatedBy,
                    finalSpeeds: stored.finalSpeeds,
                }
            },
            {
                params: t.Object({ date: t.String() }),
                query: t.Object({ server: t.Optional(t.String()) }),
                body: t.Object({
                    finalSpeeds: t.Record(t.String(), t.Number()),
                }),
            }
        )
        .post(
            "/:date/entries",
            async ({ params, body, request, set, query }) => {
                const date = normalizeDate(params.date)
                if (!date) {
                    set.status = 400
                    return { success: false, error: "日期格式无效" }
                }
                const server = normalizeServer(query.server)

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
                await withDateLock(`${server}:${date}`, async () => {
                    const cache = await getDailyCache(date, server, dataDir, cacheByDate)
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

                    await appendDailyEntry(date, server, nextEntry, dataDir)
                    updateDailyCacheEntry(cache, nextEntry)
                    invalidateEffectiveFinalSpeedsCache(date, server, effectiveFinalSpeedsCache)
                    const cachedEntry = cache.aggregatedEntries.get(body.playerId)
                    if (cachedEntry) aggregatedEntry = toPublicAggregatedEntry(cachedEntry, cache, user.id)
                })

                return { success: true, entry: aggregatedEntry }
            },
            {
                params: t.Object({ date: t.String() }),
                query: t.Object({ server: t.Optional(t.String()) }),
                body: t.Object({
                    playerId: t.Number(),
                    buffIds: t.Array(t.Number(), { minItems: 3, maxItems: 3 }),
                }),
            }
        )
}
