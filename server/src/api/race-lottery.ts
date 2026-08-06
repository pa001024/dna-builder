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

    const loading = readDailyEntries(date, dataDir).then(entries => ({
        entries: new Map(entries.map(entry => [getEntryKey(entry.userId, entry.playerId), entry])),
    }))
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
 * 将内部记录转换为公开响应，避免暴露用户 ID。
 * @param entry 内部记录。
 * @param currentUserId 当前用户 ID。
 * @returns 公开记录。
 */
function toPublicEntry(entry: StoredEntry, currentUserId?: string) {
    return {
        id: entry.id,
        playerId: entry.playerId,
        buffIds: entry.buffIds,
        submittedBy: entry.userName,
        isMine: entry.userId === currentUserId,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
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
                    entries: Array.from(cache.entries.values())
                        .sort((left, right) => left.playerId - right.playerId)
                        .map(entry => toPublicEntry(entry, user?.id)),
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
                let savedEntry: StoredEntry | undefined
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
                    cache.entries.set(key, nextEntry)
                    savedEntry = nextEntry
                })

                return { success: true, entry: toPublicEntry(savedEntry!, user.id) }
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
