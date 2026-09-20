import { appendFile, mkdir, readdir, readFile, rm } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
    type AiLogAssistantMessage,
    type AiLogClient,
    type AiLogError,
    type AiLogMessage,
    type AiLogRequestMeta,
    type AiLogRequestSummary,
    type AiLogTurnRecord,
    DEFAULT_MAX_CONTENT_CHARS,
    logDayKey,
    normalizeLogUsage,
    normalizeSessionId,
    resolveLogCostMicros,
    summarizeMessages,
    toJsonLine,
    truncateMessages,
} from "./ai-log-format"
import type { UpstreamUsage } from "./ai-pricing"

/**
 * AI 调用日志的文件存储与检索。
 *
 * 日志按日期分片落到 `<日志根目录>/` 下，两类记录各占一侧：
 * - `index/<YYYY-MM-DD>.jsonl`：一行一次请求的元数据（时间戳、客户端、模型、tokens、耗时、状态码、错误）；
 * - `sessions/<会话 id>/<YYYY-MM-DD>.jsonl`：一行一轮对话，保留完整的请求 messages 与助手回复。
 *
 * 日期一律取北京自然日，与计费口径的日界保持一致。
 * 会话按 id 建目录（而不是按日期散开），因此「按 session 取整段对话」只需读一个目录；
 * 「按时间段检索」只读落在区间内的日期文件，且从新到旧扫描、凑满条数即停。
 */

/** 索引记录子目录。 */
const INDEX_DIR_NAME = "index"

/** 轮次记录子目录。 */
const SESSIONS_DIR_NAME = "sessions"

/** 日期文件名 / 检索参数允许的格式。 */
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** 单次检索返回的最大条数。 */
const MAX_QUERY_LIMIT = 2000

/** 默认返回条数。 */
const DEFAULT_QUERY_LIMIT = 200

/** 已确认存在的目录（避免每次写日志都做一次 mkdir 系统调用）。 */
const ensuredDirs = new Set<string>()

/** 全局写入队列：JSONL 追加必须串行，否则并发请求的日志行会互相交错。 */
let writeQueue: Promise<void> = Promise.resolve()

/**
 * @description 取 AI 调用日志根目录。
 * @returns 日志根目录绝对路径（默认 `server/data/ai-logs`）。
 */
export function getAiLogDir(): string {
    return process.env.AI_LOG_DIR || resolve(import.meta.dir, "../data/ai-logs")
}

/**
 * @description 判断是否开启 AI 调用日志（`AI_LOG_ENABLED=0/false` 时关闭）。
 * @returns 是否记录日志。
 */
export function isAiLogEnabled(): boolean {
    const flag = process.env.AI_LOG_ENABLED?.trim().toLowerCase()
    return flag !== "0" && flag !== "false" && flag !== "off"
}

/**
 * @description 取单条内容的截断上限（字符）。
 * @returns 上限值，非正数表示不截断。
 */
function getMaxContentChars(): number {
    const raw = Number(process.env.AI_LOG_MAX_CONTENT_CHARS)
    return Number.isFinite(raw) && raw !== 0 ? raw : DEFAULT_MAX_CONTENT_CHARS
}

/**
 * @description 校验日期字符串（同时用于阻断路径穿越）。
 * @param day 日期字符串。
 * @returns 合法日期或 null。
 */
export function normalizeLogDay(day: unknown): string | null {
    if (typeof day !== "string" || !DAY_PATTERN.test(day)) return null
    const parsed = new Date(`${day}T00:00:00Z`)
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ? null : day
}

/**
 * @description 取索引文件路径。
 * @param day 北京自然日。
 * @param dataDir 日志根目录。
 * @returns 索引文件绝对路径。
 */
function getIndexFile(day: string, dataDir: string): string {
    return resolve(dataDir, INDEX_DIR_NAME, `${day}.jsonl`)
}

/**
 * @description 取某会话某日的轮次文件路径。
 * @param sessionId 会话 id（已校验）。
 * @param day 北京自然日。
 * @param dataDir 日志根目录。
 * @returns 轮次文件绝对路径。
 */
function getSessionDayFile(sessionId: string, day: string, dataDir: string): string {
    return resolve(dataDir, SESSIONS_DIR_NAME, sessionId, `${day}.jsonl`)
}

/**
 * @description 生成索引里指向轮次记录的相对路径。
 * @param sessionId 会话 id。
 * @param day 北京自然日。
 * @returns 相对日志根目录的路径，如 `sessions/fp-xxx/2026-09-20.jsonl`。
 */
function getTurnRef(sessionId: string, day: string): string {
    return `${SESSIONS_DIR_NAME}/${sessionId}/${day}.jsonl`
}

/**
 * @description 确保目录存在（带进程内缓存）。
 * @param dir 目录路径。
 */
async function ensureDir(dir: string): Promise<void> {
    if (ensuredDirs.has(dir)) return
    await mkdir(dir, { recursive: true })
    ensuredDirs.add(dir)
}

/**
 * @description 把一次写入排入全局串行队列；失败只记日志，不影响请求本身。
 * @param task 实际写入逻辑。
 * @returns 队列任务完成后的 Promise。
 */
function enqueueWrite(task: () => Promise<void>): Promise<void> {
    const settled = writeQueue.then(task).catch(error => {
        console.error("[ai-log] 写入 AI 调用日志失败：", error)
    })
    writeQueue = settled
    return settled
}

/**
 * @description 追加一行 JSONL。
 * @param file 目标文件路径。
 * @param record 记录对象。
 */
async function appendJsonLine(file: string, record: unknown): Promise<void> {
    await ensureDir(dirname(file))
    await appendFile(file, `${toJsonLine(record)}\n`, "utf8")
}

/**
 * @description 写入一条索引记录（请求元数据）。
 * @param meta 索引记录。
 * @param dataDir 日志根目录。
 */
export function appendAiLogRequest(meta: AiLogRequestMeta, dataDir: string = getAiLogDir()): Promise<void> {
    return enqueueWrite(() => appendJsonLine(getIndexFile(meta.day, dataDir), meta))
}

/**
 * @description 写入一条轮次记录（请求输入 + 响应输出全文）。
 * @param turn 轮次记录。
 * @param dataDir 日志根目录。
 */
export function appendAiLogTurn(turn: AiLogTurnRecord, dataDir: string = getAiLogDir()): Promise<void> {
    return enqueueWrite(() => appendJsonLine(getSessionDayFile(turn.sessionId, turn.day, dataDir), turn))
}

/** 等待队列中所有写入完成（供测试与优雅退出使用）。 */
export function flushAiLogWrites(): Promise<void> {
    return writeQueue
}

/**
 * @description 列出索引目录里存在的日期。
 * @param dataDir 日志根目录。
 * @returns 日期数组（升序）。
 */
export async function listAiLogDays(dataDir: string = getAiLogDir()): Promise<string[]> {
    try {
        const entries = await readdir(resolve(dataDir, INDEX_DIR_NAME))
        return entries
            .filter(name => name.endsWith(".jsonl"))
            .map(name => name.slice(0, -".jsonl".length))
            .filter(day => normalizeLogDay(day) !== null)
            .sort()
    } catch {
        return []
    }
}

/**
 * @description 逐行解析 JSONL 文件，坏行直接跳过（日志不完整时不能拖垮检索）。
 * @param file 文件路径。
 * @returns 解析出的记录数组。
 */
async function readJsonLines<T>(file: string): Promise<T[]> {
    let raw: string
    try {
        raw = await readFile(file, "utf8")
    } catch {
        return []
    }

    const records: T[] = []
    for (const line of raw.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
            records.push(JSON.parse(trimmed) as T)
        } catch {
            // 进程被强杀可能留下半行，跳过即可
        }
    }
    return records
}

/** 索引检索条件。 */
export interface AiLogQuery {
    /** 起始日期（含）。 */
    from?: string | null
    /** 结束日期（含）。 */
    to?: string | null
    /** 只看某个会话。 */
    sessionId?: string | null
    /** 只看成功 / 失败。 */
    ok?: boolean | null
    /** 只看某个返回状态码。 */
    status?: number | null
    /** 返回条数上限。 */
    limit?: number | null
}

/**
 * @description 按时间段 / 会话 / 状态检索请求元数据，结果按时间倒序。
 * 日期从新到旧扫描，凑满 limit 即停，因此大范围查询不会把整段时间的索引全部读进内存。
 * @param query 检索条件。
 * @param dataDir 日志根目录。
 * @returns 命中的索引记录、结果是否被 limit 截断、以及实际扫描的日期数。
 */
export async function readAiLogRequests(
    query: AiLogQuery = {},
    dataDir: string = getAiLogDir()
): Promise<{ logs: AiLogRequestMeta[]; truncated: boolean; scannedDays: number }> {
    const limit = Math.min(Math.max(1, Math.floor(query.limit ?? DEFAULT_QUERY_LIMIT)), MAX_QUERY_LIMIT)
    const days = (await listAiLogDays(dataDir))
        .filter(day => (!query.from || day >= query.from) && (!query.to || day <= query.to))
        .reverse()

    const logs: AiLogRequestMeta[] = []
    let scannedDays = 0

    for (const day of days) {
        scannedDays += 1
        const records = await readJsonLines<AiLogRequestMeta>(getIndexFile(day, dataDir))

        // 同一个日期文件内按写入顺序追加，倒序读才能保证整体时间倒序
        for (let index = records.length - 1; index >= 0 && logs.length < limit; index--) {
            const record = records[index]
            if (query.sessionId && record.sessionId !== query.sessionId) continue
            if (typeof query.ok === "boolean" && record.ok !== query.ok) continue
            if (typeof query.status === "number" && record.status !== query.status) continue
            logs.push(record)
        }

        if (logs.length >= limit) break
    }

    return { logs, truncated: logs.length >= limit, scannedDays }
}

/**
 * @description 读取某个会话的完整轮次记录，按时间正序（即对话发生的顺序）。
 * @param sessionId 会话 id（此处再校验一次，避免调用方漏校验时拼出日志目录之外的路径）。
 * @param query 日期范围与条数限制。
 * @param dataDir 日志根目录。
 * @returns 轮次记录与涉及到的日期。
 */
export async function readAiLogTurns(
    sessionId: string,
    query: Pick<AiLogQuery, "from" | "to" | "limit"> = {},
    dataDir: string = getAiLogDir()
): Promise<{ turns: AiLogTurnRecord[]; days: string[] }> {
    const safeSessionId = normalizeSessionId(sessionId)
    if (!safeSessionId) return { turns: [], days: [] }

    const sessionDir = resolve(dataDir, SESSIONS_DIR_NAME, safeSessionId)
    let names: string[]
    try {
        names = await readdir(sessionDir)
    } catch {
        return { turns: [], days: [] }
    }

    const days = names
        .filter(name => name.endsWith(".jsonl"))
        .map(name => name.slice(0, -".jsonl".length))
        .filter(day => normalizeLogDay(day) !== null)
        .filter(day => (!query.from || day >= query.from) && (!query.to || day <= query.to))
        .sort()

    const turns: AiLogTurnRecord[] = []
    for (const day of days) {
        turns.push(...(await readJsonLines<AiLogTurnRecord>(getSessionDayFile(safeSessionId, day, dataDir))))
    }
    turns.sort((left, right) => left.time.localeCompare(right.time))

    const limit = Math.min(Math.max(1, Math.floor(query.limit ?? MAX_QUERY_LIMIT)), MAX_QUERY_LIMIT)
    return { turns: turns.slice(-limit), days }
}

/**
 * @description 列出所有会话 id。
 * @param dataDir 日志根目录。
 * @returns 会话 id 数组（字典序）。
 */
export async function listAiLogSessions(dataDir: string = getAiLogDir()): Promise<string[]> {
    try {
        const entries = await readdir(resolve(dataDir, SESSIONS_DIR_NAME), { withFileTypes: true })
        return entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .sort()
    } catch {
        return []
    }
}

/**
 * @description 删除指定日期之前的日志（含索引与全部会话轮次），并清掉空目录。
 * 日期参数由调用方给出，不做默认值，避免误删。
 * @param beforeDay 截止日期（不含该日，YYYY-MM-DD）。
 * @param dataDir 日志根目录。
 * @returns 删除的文件数。
 */
export async function pruneAiLogs(beforeDay: string, dataDir: string = getAiLogDir()): Promise<number> {
    const day = normalizeLogDay(beforeDay)
    if (!day) throw new Error(`日期格式无效: ${beforeDay}`)

    let removed = 0

    for (const name of await listAiLogDays(dataDir)) {
        if (name >= day) continue
        await rm(getIndexFile(name, dataDir), { force: true })
        removed += 1
    }

    for (const sessionId of await listAiLogSessions(dataDir)) {
        const sessionDir = resolve(dataDir, SESSIONS_DIR_NAME, sessionId)
        let names: string[]
        try {
            names = await readdir(sessionDir)
        } catch {
            continue
        }
        for (const name of names) {
            const fileDay = name.endsWith(".jsonl") ? name.slice(0, -".jsonl".length) : null
            if (!fileDay || normalizeLogDay(fileDay) === null || fileDay >= day) continue
            await rm(resolve(sessionDir, name), { force: true })
            removed += 1
        }
        const left = await readdir(sessionDir)
        if (left.length === 0) await rm(sessionDir, { recursive: true, force: true })
    }

    // 目录可能已被删掉，清空缓存以免后续写入跳过 mkdir
    ensuredDirs.clear()
    return removed
}

/** 保留期检查间隔（6 小时）。 */
const RETENTION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * @description 取「今天往前 n 天」的北京自然日键。
 * @param days 往前推的天数。
 * @returns YYYY-MM-DD。
 */
function dayKeyBefore(days: number): string {
    return logDayKey(new Date(Date.now() - days * 24 * 60 * 60 * 1000))
}

/**
 * @description 按 `AI_LOG_RETENTION_DAYS` 定期清理过期日志（未设置或非正数时不清理）。
 * 进程启动时先跑一次，之后每 6 小时检查一次；定时器不持有进程。
 * @param dataDir 日志根目录。
 * @returns 停止定时器的函数。
 */
export function scheduleAiLogRetention(dataDir: string = getAiLogDir()): () => void {
    const days = Number(process.env.AI_LOG_RETENTION_DAYS)
    if (!Number.isFinite(days) || days <= 0) return () => {}

    const run = () => {
        const before = dayKeyBefore(days)
        void pruneAiLogs(before, dataDir)
            .then(removed => {
                if (removed > 0) console.log(`[ai-log] 已清理 ${before} 之前的调用日志（${removed} 个文件）`)
            })
            .catch(error => console.error("[ai-log] 清理过期调用日志失败：", error))
    }

    run()
    const timer = setInterval(run, RETENTION_CHECK_INTERVAL_MS)
    if (typeof timer.unref === "function") timer.unref()

    return () => clearInterval(timer)
}

/** 一次代理请求的固定上下文（在收到请求时确定，不随处理过程变化）。 */
export interface AiCallLoggerParams {
    requestId: string
    /** 服务端推导的会话指纹（`fp-` 前缀）。 */
    sessionId: string
    /** 请求开始时间。 */
    startedAt: Date
    client: AiLogClient
    model: string
    stream: boolean
    peak: boolean
    temperature: number | null
    maxTokensRequested: number | null
    /** 客户端原始请求消息（用于统计与兜底落盘）。 */
    messages: readonly unknown[]
    toolNames: string[]
    dataDir?: string
}

/** 请求结束时的落盘内容。 */
export interface AiCallFinishParams {
    /** 返回给客户端的 HTTP 状态码。 */
    status: number
    ok: boolean
    upstreamStatus?: number | null
    /** 上游追踪 id（响应头 `x-ds-trace-id`）。 */
    upstreamTraceId?: string | null
    /** 上游补全 id（响应体 `id`；流式取首个 chunk 上的值）。 */
    upstreamCompletionId?: string | null
    error?: AiLogError | null
    usage?: UpstreamUsage | null
    /** 实际发给上游的消息（规范化后）；缺省时用客户端原始消息。 */
    messages?: readonly unknown[]
    /** 助手回复。 */
    assistant?: { message: AiLogAssistantMessage | null; finishReason: string | null } | null
    maxTokensResolved?: number | null
    /** 首个内容增量的绝对时间戳（毫秒）。 */
    firstTokenAt?: number | null
    /** 结束时间，缺省取当前时间。 */
    finishedAt?: Date
}

/** 代理请求的日志记录器。 */
export interface AiCallLogger {
    /** 记录本次请求的最终状态，落盘索引与轮次两条记录。 */
    finish(params: AiCallFinishParams): void
}

/**
 * @description 创建一次代理请求的日志记录器。
 * 记录器只负责组装与投递，写入走异步队列，不阻塞请求处理；重复收尾只会落一份记录。
 * @param params 请求上下文。
 * @returns 记录器实例。
 */
export function createAiCallLogger(params: AiCallLoggerParams): AiCallLogger {
    const dataDir = params.dataDir ?? getAiLogDir()
    const enabled = isAiLogEnabled()
    const time = params.startedAt
    const day = logDayKey(time)
    const requestTime = time.toISOString()
    let finished = false

    return {
        finish(finish: AiCallFinishParams) {
            if (!enabled || finished) return
            finished = true

            const finishedAt = finish.finishedAt ?? new Date()
            const durationMs = Math.max(0, finishedAt.getTime() - time.getTime())
            const usage = normalizeLogUsage(finish.usage)
            const costMicros = resolveLogCostMicros(finish.usage, params.peak)
            const sourceMessages = finish.messages ?? params.messages
            const maxContentChars = getMaxContentChars()
            const { messages, truncated } = truncateMessages(sourceMessages, maxContentChars)
            const summary: AiLogRequestSummary = {
                ...summarizeMessages(sourceMessages, maxContentChars),
                temperature: params.temperature,
                maxTokensRequested: params.maxTokensRequested,
                maxTokensResolved: finish.maxTokensResolved ?? null,
                peak: params.peak,
                toolNames: params.toolNames,
            }

            const meta: AiLogRequestMeta = {
                requestId: params.requestId,
                sessionId: params.sessionId,
                upstreamTraceId: finish.upstreamTraceId ?? null,
                upstreamCompletionId: finish.upstreamCompletionId ?? null,
                time: requestTime,
                day,
                client: params.client,
                model: params.model,
                stream: params.stream,
                status: finish.status,
                ok: finish.ok,
                upstreamStatus: finish.upstreamStatus ?? null,
                durationMs,
                ttftMs: params.stream && typeof finish.firstTokenAt === "number" ? Math.max(0, finish.firstTokenAt - time.getTime()) : null,
                usage,
                costMicros,
                error: finish.error ?? null,
                request: summary,
                turnRef: getTurnRef(params.sessionId, day),
            }

            const turn: AiLogTurnRecord = {
                requestId: params.requestId,
                sessionId: params.sessionId,
                upstreamTraceId: finish.upstreamTraceId ?? null,
                upstreamCompletionId: finish.upstreamCompletionId ?? null,
                time: requestTime,
                day,
                model: params.model,
                stream: params.stream,
                status: finish.status,
                ok: finish.ok,
                durationMs,
                request: {
                    messages: messages as AiLogMessage[],
                    truncated,
                    tools: params.toolNames,
                    temperature: params.temperature,
                    maxTokens: finish.maxTokensResolved ?? params.maxTokensRequested,
                },
                response: {
                    message: finish.assistant?.message ?? null,
                    finishReason: finish.assistant?.finishReason ?? null,
                },
                error: finish.error ?? null,
                usage,
                costMicros,
            }

            void appendAiLogRequest(meta, dataDir)
            void appendAiLogTurn(turn, dataDir)
        },
    }
}
