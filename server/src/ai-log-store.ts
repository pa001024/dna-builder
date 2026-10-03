import { randomUUID } from "node:crypto"
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
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
 * 请求索引按日期分片；会话日志按会话 id 合并为单个文件：
 * - `index/<YYYY-MM-DD>.jsonl`：一行一次请求元数据（时间戳、客户端、模型、tokens、耗时、状态码、错误）；
 * - `sessions/<会话 id>/session.jsonl`：一行一条会话记录，保留逐请求的元数据与回复，重复上下文只记一次。
 *
 * 日期一律取北京自然日，与计费口径的日界保持一致。每轮只存相较于已有对话新增的 messages；
 * 读取时仍展开为逐请求记录，便于保留耗时、tokens、trace id 等单次调用信息。
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

/** 合并后的会话文件结构版本。 */
const SESSION_RECORD_VERSION = 1

/** 一条会话文件包含多个请求轮次，request.messages 已去除已记录的上下文前缀。 */
interface AiLogSessionRecord {
    format: "ai-log-session"
    version: number
    sessionId: string
    updatedAt: string
    turns: AiLogTurnRecord[]
}

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
 * @description 取合并后的会话文件路径。
 * @param sessionId 会话 id（已校验）。
 * @param dataDir 日志根目录。
 * @returns 会话 JSONL 文件绝对路径。
 */
function getSessionFile(sessionId: string, dataDir: string): string {
    return resolve(dataDir, SESSIONS_DIR_NAME, sessionId, "session.jsonl")
}

/**
 * @description 生成索引里指向合并会话记录的相对路径。
 * @param sessionId 会话 id。
 * @returns 相对日志根目录的路径，如 `sessions/fp-xxx/session.jsonl`。
 */
function getTurnRef(sessionId: string): string {
    return `${SESSIONS_DIR_NAME}/${sessionId}/session.jsonl`
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
 * @description 把需返回结果的文件操作排进写入队列，错误仍交给调用方处理。
 * @param task 队列任务。
 * @returns 任务结果；失败时拒绝。
 */
function enqueueExclusive<T>(task: () => Promise<T>): Promise<T> {
    const operation = writeQueue.then(task)
    writeQueue = operation.then(
        () => undefined,
        () => undefined
    )
    return operation
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
 * @description 原子替换文件内容，避免进程中断时损坏原文件。
 * @param file 目标文件。
 * @param content 新文件内容。
 * @returns 无返回值。
 * @throws 临时文件写入或替换失败时抛出原始错误。
 */
async function replaceFileAtomically(file: string, content: string): Promise<void> {
    await ensureDir(dirname(file))
    const temporaryFile = `${file}.${randomUUID()}.tmp`
    try {
        await writeFile(temporaryFile, content, "utf8")
        await rename(temporaryFile, file)
    } catch (error) {
        await rm(temporaryFile, { force: true })
        throw error
    }
}

/**
 * @description 原子覆盖一条 JSONL 记录，避免进程中断时损坏原会话文件。
 * @param file 目标文件。
 * @param record 记录对象。
 * @returns 无返回值。
 * @throws 临时文件写入或替换失败时抛出原始错误。
 */
async function replaceJsonLine(file: string, record: unknown): Promise<void> {
    await replaceFileAtomically(file, `${toJsonLine(record)}\n`)
}

/**
 * @description 把未知值收敛成普通对象。
 * @param value 待转换的值。
 * @returns 普通对象或 null。
 */
function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * @description 判断值是否为当前版本的合并会话记录。
 * @param value 待检查的 JSON 值。
 * @returns 是否为可读取的会话记录。
 */
function isAiLogSessionRecord(value: unknown): value is AiLogSessionRecord {
    const record = asRecord(value)
    return (
        record?.format === "ai-log-session" &&
        record.version === SESSION_RECORD_VERSION &&
        typeof record.sessionId === "string" &&
        Array.isArray(record.turns)
    )
}

/**
 * @description 判断值是否为可读取的轮次记录。
 * @param value 待检查的 JSON 值。
 * @returns 是否为合法轮次结构。
 */
function isAiLogTurnRecord(value: unknown): value is AiLogTurnRecord {
    const record = asRecord(value)
    const request = asRecord(record?.request)
    return (
        typeof record?.requestId === "string" &&
        typeof record.sessionId === "string" &&
        typeof record.time === "string" &&
        typeof record.day === "string" &&
        Array.isArray(request?.messages)
    )
}

/**
 * @description 递归按键排序序列化，供消息去重时稳定比较对象内容。
 * @param value 待序列化的值。
 * @returns 稳定的 JSON 文本。
 */
function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>
        return `{${Object.keys(record)
            .filter(key => record[key] !== undefined)
            .sort()
            .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
            .join(",")}}`
    }
    const serialized = JSON.stringify(value)
    return serialized === undefined ? "undefined" : serialized
}

/**
 * @description 把工具参数归一化成可比较的 JSON，兼容 Messages 对象与 Chat Completions 字符串两种形态。
 * @param value Messages 对象或 Chat Completions JSON 字符串。
 * @returns 稳定的参数签名。
 */
function normalizeToolArguments(value: unknown): string {
    if (typeof value === "string") {
        try {
            return stableJson(JSON.parse(value))
        } catch {
            return stableJson(value)
        }
    }
    return stableJson(value)
}

/**
 * @description 生成助手消息的协议无关签名，用于识别下一次请求中回传的上一轮回复。
 * Chat Completions 的 `tool_calls` 与 Messages 的 `tool_use` 会归一到相同形态。
 * @param value 请求消息或日志里的助手回复。
 * @returns 助手消息签名；非助手消息返回 null。
 */
function assistantMessageSignature(value: unknown): string | null {
    const record = asRecord(value)
    if (record?.role !== "assistant") return null

    let content = ""
    let reasoning = ""
    const toolCalls: Array<{ id: string | null; type: string; name: string; arguments: string }> = []
    const unknownBlocks: unknown[] = []

    if (typeof record.content === "string") {
        content = record.content
    } else if (Array.isArray(record.content)) {
        for (const value of record.content) {
            const block = asRecord(value)
            if (!block) {
                unknownBlocks.push(value)
                continue
            }
            if (block.type === "text" && typeof block.text === "string") {
                content += block.text
            } else if (block.type === "thinking" || block.type === "redacted_thinking") {
                const text = typeof block.thinking === "string" ? block.thinking : typeof block.text === "string" ? block.text : ""
                reasoning += text
            } else if (block.type === "tool_use") {
                toolCalls.push({
                    id: typeof block.id === "string" ? block.id : null,
                    type: "function",
                    name: typeof block.name === "string" ? block.name : "",
                    arguments: normalizeToolArguments(block.input),
                })
            } else {
                unknownBlocks.push(value)
            }
        }
    }

    const rawReasoning = record.reasoningContent ?? record.reasoning_content ?? record.reasoning
    if (typeof rawReasoning === "string") reasoning = rawReasoning

    const rawToolCalls = Array.isArray(record.tool_calls) ? record.tool_calls : Array.isArray(record.toolCalls) ? record.toolCalls : []
    for (const value of rawToolCalls) {
        const call = asRecord(value)
        if (!call) continue
        const fn = asRecord(call.function)
        toolCalls.push({
            id: typeof call.id === "string" ? call.id : null,
            type: typeof call.type === "string" ? call.type : "function",
            name: typeof fn?.name === "string" ? fn.name : typeof call.name === "string" ? call.name : "",
            arguments: normalizeToolArguments(fn?.arguments ?? call.arguments ?? call.input),
        })
    }

    return stableJson({
        role: "assistant",
        content: toolCalls.length > 0 && content === "" ? null : content,
        reasoning: reasoning || null,
        toolCalls,
        unknownBlocks,
    })
}

/**
 * @description 对比两条消息；助手消息会忽略两种上游协议间的字段形态差异。
 * @param left 已记录消息或助手回复。
 * @param right 本次请求中的消息。
 * @returns 消息内容等价时为 true。
 */
function messagesMatch(left: unknown, right: unknown): boolean {
    const leftAssistant = assistantMessageSignature(left)
    const rightAssistant = assistantMessageSignature(right)
    if (leftAssistant !== null || rightAssistant !== null) return leftAssistant !== null && leftAssistant === rightAssistant
    return stableJson(left) === stableJson(right)
}

/**
 * @description 去掉本次请求中已经存在于会话上下文末尾的前缀。
 * @param messages 本次完整请求消息。
 * @param history 已落盘的会话消息（请求增量与此前助手回复）。
 * @returns 仅包含尚未落盘消息的请求片段。
 */
function removeRecordedPrefix(messages: readonly unknown[], history: readonly unknown[]): unknown[] {
    let sharedPrefix = 0
    const max = Math.min(messages.length, history.length)
    while (sharedPrefix < max && messagesMatch(messages[sharedPrefix], history[sharedPrefix])) sharedPrefix += 1
    return messages.slice(sharedPrefix)
}

/**
 * @description 取轮次的助手回复，作为下一次请求历史中的已知消息。
 * @param turn 会话轮次。
 * @returns 可用于比对的助手回复；无回复时返回 null。
 */
function getTurnAssistantMessage(turn: AiLogTurnRecord): unknown | null {
    return turn.response?.message ?? null
}

/**
 * @description 将旧版逐行会话日志压缩成增量轮次，兼容已存在的重复上下文。
 * @param turns 旧版逐请求记录。
 * @returns 每条请求仅保留新增 messages 的轮次记录。
 */
function compactLegacyTurns(turns: readonly AiLogTurnRecord[]): AiLogTurnRecord[] {
    const history: unknown[] = []
    const ordered = turns
        .map((turn, index) => ({ turn, index }))
        .sort((left, right) => left.turn.time.localeCompare(right.turn.time) || left.index - right.index)

    return ordered.map(({ turn }) => {
        const messages = removeRecordedPrefix(turn.request.messages, history) as AiLogMessage[]
        history.push(...messages)
        const assistantMessage = getTurnAssistantMessage(turn)
        if (assistantMessage) history.push(assistantMessage)
        return { ...turn, request: { ...turn.request, messages } }
    })
}

/**
 * @description 把已合并轮次还原为供后续请求去重的完整消息序列。
 * @param turns 已合并会话中的轮次。
 * @returns 按对话顺序排列的消息。
 */
function buildSessionHistory(turns: readonly AiLogTurnRecord[]): unknown[] {
    const history: unknown[] = []
    for (const turn of turns) {
        history.push(...turn.request.messages)
        const assistantMessage = getTurnAssistantMessage(turn)
        if (assistantMessage) history.push(assistantMessage)
    }
    return history
}

/**
 * @description 列出旧版按日期分片的会话文件，用于读取与首次迁移。
 * @param sessionId 会话 id。
 * @param dataDir 日志根目录。
 * @returns 按日期排序的旧版文件路径。
 */
async function listLegacySessionFiles(sessionId: string, dataDir: string): Promise<Array<{ day: string; file: string }>> {
    const sessionDir = resolve(dataDir, SESSIONS_DIR_NAME, sessionId)
    try {
        const names = await readdir(sessionDir)
        return names
            .filter(name => name.endsWith(".jsonl"))
            .map(name => name.slice(0, -".jsonl".length))
            .filter(day => normalizeLogDay(day) !== null)
            .sort()
            .map(day => ({ day, file: getSessionDayFile(sessionId, day, dataDir) }))
    } catch {
        return []
    }
}

/**
 * @description 读取旧版逐行会话轮次，跳过坏行与非轮次记录。
 * @param sessionId 会话 id。
 * @param dataDir 日志根目录。
 * @returns 按时间排序的旧版轮次。
 */
async function readLegacySessionTurns(sessionId: string, dataDir: string): Promise<AiLogTurnRecord[]> {
    const turns: AiLogTurnRecord[] = []
    for (const { file } of await listLegacySessionFiles(sessionId, dataDir)) {
        for (const record of await readJsonLines<unknown>(file)) {
            if (isAiLogTurnRecord(record)) turns.push(record)
            else if (isAiLogSessionRecord(record)) turns.push(...record.turns.filter(isAiLogTurnRecord))
        }
    }
    return turns
        .map((turn, index) => ({ turn, index }))
        .sort((left, right) => left.turn.time.localeCompare(right.turn.time) || left.index - right.index)
        .map(({ turn }) => turn)
}

/**
 * @description 写入时清除迁移前按日期保存的重复文件。
 * @param sessionId 会话 id。
 * @param dataDir 日志根目录。
 * @returns 无返回值。
 */
async function removeLegacySessionFiles(sessionId: string, dataDir: string): Promise<void> {
    for (const { file } of await listLegacySessionFiles(sessionId, dataDir)) {
        await rm(file, { force: true })
    }
}

/**
 * @description 迁移旧会话文件时，将索引中的轮次引用同步到新的合并文件。
 * @param sessionId 会话 id。
 * @param days 旧轮次所属的日期。
 * @param dataDir 日志根目录。
 * @returns 无返回值。
 */
async function updateSessionTurnRefs(sessionId: string, days: readonly string[], dataDir: string): Promise<void> {
    const turnRef = getTurnRef(sessionId)
    for (const day of new Set(days)) {
        if (!normalizeLogDay(day)) continue
        const file = getIndexFile(day, dataDir)
        let raw: string
        try {
            raw = await readFile(file, "utf8")
        } catch {
            continue
        }

        let changed = false
        const lines = raw.split("\n").map(line => {
            if (!line.trim()) return line
            try {
                const record = asRecord(JSON.parse(line))
                if (record?.sessionId !== sessionId || record.turnRef === turnRef) return line
                changed = true
                return toJsonLine({ ...record, turnRef })
            } catch {
                return line
            }
        })

        if (changed) await replaceFileAtomically(file, lines.join("\n"))
    }
}

/**
 * @description 在新会话记录安全落盘后更新索引引用并移除旧分片。
 * @param sessionId 会话 id。
 * @param legacyFiles 旧版日期分片文件。
 * @param dataDir 日志根目录。
 * @returns 无返回值。
 */
async function finalizeLegacySessionMigration(
    sessionId: string,
    legacyFiles: readonly { day: string; file: string }[],
    dataDir: string
): Promise<void> {
    if (legacyFiles.length === 0) return
    await updateSessionTurnRefs(
        sessionId,
        legacyFiles.map(({ day }) => day),
        dataDir
    )
    await removeLegacySessionFiles(sessionId, dataDir)
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
 * @description 合并写入一条会话轮次，重复上下文只保留一次。
 * @param turn 轮次记录。
 * @param dataDir 日志根目录。
 * @returns 写入队列完成后的 Promise。
 */
export function appendAiLogTurn(turn: AiLogTurnRecord, dataDir: string = getAiLogDir()): Promise<void> {
    return enqueueWrite(async () => {
        const sessionId = normalizeSessionId(turn.sessionId)
        const day = normalizeLogDay(turn.day)
        if (!sessionId || !day) throw new Error("会话 id 或日志日期无效，已跳过轮次日志")

        const sessionFile = getSessionFile(sessionId, dataDir)
        const legacyFiles = await listLegacySessionFiles(sessionId, dataDir)
        const storedRecords = await readJsonLines<unknown>(sessionFile)
        const storedRecord = storedRecords.find(isAiLogSessionRecord)
        const previousTurns = storedRecord
            ? storedRecord.turns.filter(isAiLogTurnRecord)
            : compactLegacyTurns(await readLegacySessionTurns(sessionId, dataDir))

        // 请求 id 是幂等键：即使调用方重试写入，也不会重复增加会话轮次。
        if (previousTurns.some(previous => previous.requestId === turn.requestId)) {
            await finalizeLegacySessionMigration(sessionId, legacyFiles, dataDir)
            return
        }

        const history = buildSessionHistory(previousTurns)
        const messages = removeRecordedPrefix(turn.request.messages, history) as AiLogMessage[]
        const mergedTurn: AiLogTurnRecord = { ...turn, sessionId, request: { ...turn.request, messages } }
        const sessionRecord: AiLogSessionRecord = {
            format: "ai-log-session",
            version: SESSION_RECORD_VERSION,
            sessionId,
            updatedAt: new Date().toISOString(),
            turns: [...previousTurns, mergedTurn],
        }

        await replaceJsonLine(sessionFile, sessionRecord)
        await finalizeLegacySessionMigration(sessionId, legacyFiles, dataDir)
    })
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
 * @description 读取某个会话的逐请求轮次，按对话发生顺序返回；request.messages 仅含本轮新增消息。
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
    try {
        await readdir(sessionDir)
    } catch {
        return { turns: [], days: [] }
    }

    const sessionRecords = await readJsonLines<unknown>(getSessionFile(safeSessionId, dataDir))
    const mergedRecord = sessionRecords.find(isAiLogSessionRecord)
    const allTurns = mergedRecord
        ? mergedRecord.turns.filter(isAiLogTurnRecord)
        : compactLegacyTurns(await readLegacySessionTurns(safeSessionId, dataDir))
    const matchingTurns = allTurns
        .filter(turn => (!query.from || turn.day >= query.from) && (!query.to || turn.day <= query.to))
        .sort((left, right) => left.time.localeCompare(right.time))
    const days = [...new Set(matchingTurns.map(turn => turn.day))].sort()

    const limit = Math.min(Math.max(1, Math.floor(query.limit ?? MAX_QUERY_LIMIT)), MAX_QUERY_LIMIT)
    return { turns: matchingTurns.slice(-limit), days }
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
 * @returns 被删除或更新的日志文件数。
 */
async function pruneAiLogsNow(beforeDay: string, dataDir: string): Promise<number> {
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
        const sessionFile = getSessionFile(sessionId, dataDir)
        const storedRecords = await readJsonLines<unknown>(sessionFile)
        const storedRecord = storedRecords.find(isAiLogSessionRecord)

        if (storedRecord) {
            const turns = storedRecord.turns.filter(isAiLogTurnRecord)
            const remainingTurns = turns.filter(turn => {
                const turnDay = normalizeLogDay(turn.day)
                return turnDay === null || turnDay >= day
            })
            if (remainingTurns.length !== turns.length) {
                if (remainingTurns.length > 0) {
                    await replaceJsonLine(sessionFile, { ...storedRecord, updatedAt: new Date().toISOString(), turns: remainingTurns })
                } else {
                    await rm(sessionFile, { force: true })
                }
                removed += 1
            }

            // 若上次进程在合并文件落盘后退出，先修正引用再清理残留旧分片。
            const legacyFiles = await listLegacySessionFiles(sessionId, dataDir)
            await updateSessionTurnRefs(
                sessionId,
                legacyFiles.map(({ day: fileDay }) => fileDay),
                dataDir
            )
            for (const { file } of legacyFiles) {
                await rm(file, { force: true })
                removed += 1
            }
        } else {
            // 兼容尚未迁移的旧版逐日 JSONL。
            for (const { day: fileDay, file } of await listLegacySessionFiles(sessionId, dataDir)) {
                if (fileDay >= day) continue
                await rm(file, { force: true })
                removed += 1
            }
        }

        const left = await readdir(sessionDir)
        if (left.length === 0) await rm(sessionDir, { recursive: true, force: true })
    }

    // 目录可能已被删掉，清空缓存以免后续写入跳过 mkdir
    ensuredDirs.clear()
    return removed
}

/**
 * @description 串行清理指定日期之前的日志，避免与会话合并写入互相覆盖。
 * @param beforeDay 截止日期（不含该日，YYYY-MM-DD）。
 * @param dataDir 日志根目录。
 * @returns 被删除或更新的日志文件数。
 */
export function pruneAiLogs(beforeDay: string, dataDir: string = getAiLogDir()): Promise<number> {
    return enqueueExclusive(() => pruneAiLogsNow(beforeDay, dataDir))
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
                if (removed > 0) console.log(`[ai-log] 已处理 ${before} 之前的调用日志（${removed} 个文件）`)
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
    /** 记录本次请求的最终状态，写入索引并合并进会话记录。 */
    finish(params: AiCallFinishParams): void
}

/**
 * @description 创建一次代理请求的日志记录器。
 * 记录器只负责组装与投递，写入走异步队列，不阻塞请求处理；重复收尾只会处理一次。
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
                turnRef: getTurnRef(params.sessionId),
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
