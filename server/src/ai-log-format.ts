import { createHash } from "node:crypto"
import { beijingDayKey, computeCostMicros, createMessagesUsageAccumulator, normalizeUsage, type UpstreamUsage } from "./ai-pricing"

/**
 * AI 调用日志的记录格式与纯逻辑（不碰数据库、不碰文件系统，可直接单测）。
 *
 * 与 `ai-pricing.ts` 的拆分理由一致：落盘 IO 交给 `ai-log-store.ts`，
 * 「怎么归并会话、怎么聚合流式回复、怎么裁剪超长内容」放在这里。
 *
 * 一次请求产生两类记录：
 * - **索引记录**（`index/<日期>.jsonl`）：一行一次请求的元数据，用于按时间 / 会话 / 状态码检索；
 * - **轮次记录**（`sessions/<会话 id>/<日期>.jsonl`）：一行一轮对话，保留完整的请求 messages 与助手回复正文。
 *
 * 只记对话内容与工具名，不记 `tools` 的函数 schema：schema 由客户端固定且每轮重复下发，
 * 逐轮落盘只会把日志撑大几十倍，排查价值却为零。
 *
 * 会话归并由服务端自己推导（`resolveSessionId`）：上游是无状态的，不返回任何会话级标识。
 * 上游返回的两个 id 都是**请求级**的，只作对账用，不能拿来分会话——
 * `x-ds-trace-id` 每次请求都不同，补全 `id` 连同一请求重发也不同。
 */

/** 上游追踪 id 响应头：DeepSeek 用它串联一次调用链，找客服排查时要的就是这个值。 */
export const AI_LOG_UPSTREAM_TRACE_HEADER = "x-ds-trace-id"

/** 会话指纹 id 的前缀，用于与上游的各类 id 区分开。 */
const FINGERPRINT_PREFIX = "fp-"

/** 会话指纹取 SHA-256 十六进制的前若干位。 */
const FINGERPRINT_HEX_LENGTH = 16

/**
 * 会话 id 允许的字符集与长度上限：必须以字母或数字开头。
 * 会话 id 会直接作为日志目录名，因此字符集必须收紧到无法表达路径。
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/** 单条日志记录的大小上限（字符数），超长内容按此截断，避免单条消息把磁盘写穿。 */
export const DEFAULT_MAX_CONTENT_CHARS = 100_000

/**
 * 日志里图片内容的占位标记。
 *
 * 用户附图是整张图的 Base64，单张就有几十万字符；按正文那样「截一段」毫无意义
 * （截断的 Base64 既看不出内容，又照样占地方），所以整块换成这个标记，
 * 只保留「这里有一张图」这个事实。
 */
export const AI_LOG_IMAGE_PLACEHOLDER = "[image omitted]"

/** 日志记录里保留的对话消息（字段与 OpenAI 兼容格式一致，不做语义裁剪）。 */
export interface AiLogMessage {
    role: string
    content?: unknown
    tool_calls?: unknown
    tool_call_id?: unknown
    name?: unknown
}

/** 客户端标识：登录账号 + 网络来源。 */
export interface AiLogClient {
    /** 登录账号 id；未登录或被拒的请求为 null。 */
    userId: string | null
    /** 登录账号名。 */
    userName: string | null
    /** 客户端 IP（优先取反向代理写入的转发头）。 */
    ip: string | null
    /** User-Agent。 */
    userAgent: string | null
}

/** 归一化后的 token 消耗（含 DeepSeek 的缓存命中明细）。 */
export interface AiLogUsage {
    /** 输入 tokens 总量。 */
    prompt: number
    /** 输出 tokens。 */
    completion: number
    /** 输入 + 输出。 */
    total: number
    /** 输入中命中上下文缓存的部分。 */
    cacheHit: number
    /** 输入中未命中缓存的部分。 */
    cacheMiss: number
    /** 输出（与 completion 同义，保留计费口径的三档命名）。 */
    output: number
}

/** 错误信息（代理层错误或上游错误）。 */
export interface AiLogError {
    /** 机器可读的短代码，如 `login_required`、`upstream_error`。 */
    code: string
    /** 错误类型，如 `authentication_error`、`api_error`。 */
    type: string
    /** 面向人的错误消息。 */
    message: string
    /** 上游原始错误正文（JSON 序列化后截断），无则为 null。 */
    raw: string | null
}

/** 请求参数摘要（完整 messages 存在轮次记录里，索引只留可检索的字段）。 */
export interface AiLogRequestSummary {
    /** 本次请求携带的消息条数。 */
    messageCount: number
    /** 各角色的消息条数。 */
    roles: { system: number; user: number; assistant: number; tool: number; other: number }
    /** 本次请求最后一条 user 消息的纯文本（会话摘要用，可能被截断）。 */
    lastUserMessage: string | null
    /** 客户端请求的 temperature。 */
    temperature: number | null
    /** 客户端请求的 max_tokens。 */
    maxTokensRequested: number | null
    /** 实际下发给上游的 max_tokens（可能被额度收紧）。 */
    maxTokensResolved: number | null
    /** 是否处于高峰计费时段。 */
    peak: boolean
    /** 请求里声明的工具名列表。 */
    toolNames: string[]
}

/** 索引记录：一行一次请求的元数据。 */
export interface AiLogRequestMeta {
    /** 本次请求的唯一 id（服务端生成）。 */
    requestId: string
    /** 会话 id：服务端按「账号 + 会话首条 user 消息」推导出的指纹（`fp-` 前缀）。 */
    sessionId: string
    /** 上游追踪 id（响应头 `x-ds-trace-id`），请求级；未调通上游时为 null。 */
    upstreamTraceId: string | null
    /** 上游补全 id（响应体 `id`），请求级；未调通上游或上游未返回时为 null。 */
    upstreamCompletionId: string | null
    /** 请求开始时间（ISO 8601，UTC）。 */
    time: string
    /** 北京时间自然日，日志按此归档。 */
    day: string
    client: AiLogClient
    model: string
    stream: boolean
    /** 返回给客户端的 HTTP 状态码（流式错误按 OpenAI 兼容约定仍是 200，靠 error 字段区分）。 */
    status: number
    ok: boolean
    /** 上游 HTTP 状态码；未调通上游时为 null。 */
    upstreamStatus: number | null
    /** 从收到请求到响应结束的耗时（毫秒）；流式为整条流放完的时刻。 */
    durationMs: number
    /** 首个内容增量的耗时（毫秒），仅流式请求有值。 */
    ttftMs: number | null
    usage: AiLogUsage | null
    /** 本次费用（微元）。 */
    costMicros: number
    error: AiLogError | null
    request: AiLogRequestSummary
    /** 对应轮次记录的位置（相对日志根目录），便于从索引跳转到全文。 */
    turnRef: string
}

/** 助手回复（流式由增量拼装而成）。 */
export interface AiLogAssistantMessage {
    role: "assistant"
    /** 正文。 */
    content: string
    /** 思维链正文（DeepSeek 的 reasoning_content），无则为 null。 */
    reasoningContent: string | null
    toolCalls: AiLogToolCall[]
}

/** 一次工具调用的完整内容（流式下参数是分片下发的，这里拼成完整 JSON 字符串）。 */
export interface AiLogToolCall {
    id: string | null
    type: string
    name: string
    arguments: string
}

/** 轮次记录：一行一轮对话，含请求输入与响应输出全文。 */
export interface AiLogTurnRecord {
    requestId: string
    sessionId: string
    /** 上游追踪 id（响应头 `x-ds-trace-id`），请求级；未调通上游时为 null。 */
    upstreamTraceId: string | null
    /** 上游补全 id（响应体 `id`），请求级；未调通上游或上游未返回时为 null。 */
    upstreamCompletionId: string | null
    time: string
    day: string
    model: string
    stream: boolean
    status: number
    ok: boolean
    durationMs: number
    /** 本次发给上游的请求内容（messages 为规范化后的版本）。 */
    request: {
        messages: unknown[]
        /** 是否因超过单条内容上限而被截断。 */
        truncated: boolean
        /** 请求声明的工具名（不含 schema）。 */
        tools: string[]
        temperature: number | null
        maxTokens: number | null
    }
    /** 助手回复；未产出任何内容（失败或空回复）时 message 为 null。 */
    response: {
        message: AiLogAssistantMessage | null
        finishReason: string | null
    }
    error: AiLogError | null
    usage: AiLogUsage | null
    costMicros: number
}

/** 流式聚合的中间状态。 */
export interface AiLogStreamState {
    /** 拼装出的助手消息；整条流里没有任何内容增量时为 null。 */
    message: AiLogAssistantMessage | null
    /** 结束原因（stop / length / tool_calls 等）。 */
    finishReason: string | null
    /** 首个内容增量的到达时间（毫秒时间戳）；未产出内容时为 null。 */
    firstTokenAt: number | null
    /** 上游补全 id：整条流的所有 chunk 共用同一个值，取首个出现的。 */
    completionId: string | null
}

/** 流式增量聚合器。 */
export interface AiLogStreamAggregator {
    /** 喂入一个 SSE 数据块（已 JSON.parse 的 payload）。 */
    push(payload: unknown): void
    /** 取当前聚合结果。 */
    snapshot(): AiLogStreamState
}

/**
 * @description 校验并规范化会话 id。
 * 首字符限定为字母或数字已经排除了 `.` 与 `..`；再显式挡掉中间出现 `..` 与结尾带点的情况
 * （结尾的点会被 Windows 的文件名归一化吃掉，造成两个 id 落到同一个目录）。
 * @param raw 待校验的会话 id。
 * @returns 合法会话 id；为空、超长或含非法字符时返回 null。
 */
export function normalizeSessionId(raw: unknown): string | null {
    if (typeof raw !== "string") return null
    const id = raw.trim()
    if (!SESSION_ID_PATTERN.test(id)) return null
    if (id.includes("..") || id.endsWith(".")) return null
    return id
}

/** 把未知值收敛成普通对象。 */
function toRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * @description 抽取消息 content 的纯文本（兼容字符串与多模态数组两种写法）。
 * @param content 消息 content 字段。
 * @returns 拼接后的纯文本；无法识别时返回空字符串。
 */
export function extractContentText(content: unknown): string {
    if (typeof content === "string") return content
    if (!Array.isArray(content)) return ""
    return content
        .map(part => {
            if (typeof part === "string") return part
            const record = toRecord(part)
            return typeof record?.text === "string" ? record.text : ""
        })
        .filter(Boolean)
        .join("\n")
}

/**
 * @description 判断某个 content 是否承载工具结果。
 *
 * Chat Completions 用独立的 `tool` 角色承载，Messages 则把 `tool_result` 块放进 user 轮里，
 * 日志的角色分布与会话锚点都要按同一口径把后者识别出来。
 * @param content 消息 content 字段
 * @returns 是否含工具结果块
 */
function hasToolResultBlock(content: unknown): boolean {
    if (!Array.isArray(content)) return false
    return content.some(part => toRecord(part)?.type === "tool_result")
}

/**
 * @description 把多模态内容块里的图片数据换成占位标记。
 *
 * 两种协议的图片形态都在这里收敛：Messages 是 `{type:"image", source:{data}}`，
 * Chat Completions 是 `{type:"image_url", image_url:{url}}`（内联图是 `data:` 开头）。
 * 外链 URL 保留原样——它只是一行文本，排查时要靠它定位图片。
 * @param content 消息的 content 数组
 * @returns 脱敏后的 content 数组
 */
export function redactImageBlocks(content: readonly unknown[]): unknown[] {
    return content.map(part => {
        const record = toRecord(part)

        if (!record) {
            return part
        }

        if (record.type === "image") {
            const source = toRecord(record.source)

            return {
                type: "image",
                source: {
                    type: typeof source?.type === "string" ? source.type : "base64",
                    media_type: typeof source?.media_type === "string" ? source.media_type : "unknown",
                    data: AI_LOG_IMAGE_PLACEHOLDER,
                },
            }
        }

        if (record.type === "image_url") {
            const imageUrl = toRecord(record.image_url)
            const url = typeof imageUrl?.url === "string" ? imageUrl.url : ""

            return { type: "image_url", image_url: { url: url.startsWith("data:") ? AI_LOG_IMAGE_PLACEHOLDER : url } }
        }

        return part
    })
}

/**
 * @description 取会话锚点：第一条**真实用户输入**的纯文本。
 * 客户端每轮都会把完整历史回传，因此同一次对话的每轮请求都以同一条 user 消息开头。
 * Messages 协议下工具结果也写在 user 轮里，这类轮不算用户输入，必须跳过。
 * @param messages 请求消息数组。
 * @returns 锚点文本；没有 user 消息时返回空字符串。
 */
export function resolveSessionAnchor(messages: readonly unknown[]): string {
    for (const message of messages) {
        const record = toRecord(message)
        if (record?.role !== "user" || hasToolResultBlock(record.content)) continue
        const text = extractContentText(record.content)
        if (text) return text
    }
    return ""
}

/**
 * @description 解析本次请求归属的会话 id。
 * 上游是无状态的、不返回会话级标识，所以会话完全由服务端推导：取「登录账号 + 会话首条 user 消息」的哈希。
 * 客户端每轮都会回传完整历史，首条 user 消息即稳定锚点，多轮请求会自动归并到同一个会话。
 * @param params.userId 登录账号 id。
 * @param params.messages 请求消息数组。
 * @returns 会话 id（`fp-` 前缀 + SHA-256 前 16 位十六进制）。
 */
export function resolveSessionId(params: { userId?: string | null; messages: readonly unknown[] }): string {
    const anchor = resolveSessionAnchor(params.messages)
    const digest = createHash("sha256")
        .update(`${params.userId ?? "anonymous"}\u0000${anchor}`)
        .digest("hex")
    return `${FINGERPRINT_PREFIX}${digest.slice(0, FINGERPRINT_HEX_LENGTH)}`
}

/**
 * @description 从上游响应体或单个 SSE chunk 里取补全 id。
 * @param payload 上游 JSON 响应体，或一个 SSE chunk 已解析的 payload。
 * @returns 补全 id；字段缺失或类型不符时为 null。
 */
export function extractUpstreamCompletionId(payload: unknown): string | null {
    const id = toRecord(payload)?.id
    return typeof id === "string" && id ? id : null
}

/**
 * @description 解析客户端 IP：优先取反向代理写入的转发头，其次真实 IP 头，最后回退到直连地址。
 * @param headers 请求头集合。
 * @param socketAddress 直连地址（无反向代理时的兜底）。
 * @returns 客户端 IP；三者都取不到时为 null。
 */
export function resolveClientIp(headers: { get(name: string): string | null }, socketAddress?: string | null): string | null {
    const forwarded = headers.get("x-forwarded-for")
    if (forwarded) {
        const first = forwarded.split(",")[0]?.trim()
        if (first) return first
    }
    const realIp = headers.get("x-real-ip")?.trim()
    if (realIp) return realIp
    return socketAddress?.trim() || null
}

/**
 * @description 统计请求消息的角色分布与最后一条 user 消息。
 * @param messages 请求消息数组。
 * @param maxContentChars 单条内容上限（字符）。
 * @returns 消息总数、角色分布与最后一条 user 消息（可能被截断）。
 */
export function summarizeMessages(
    messages: readonly unknown[],
    maxContentChars = DEFAULT_MAX_CONTENT_CHARS
): { messageCount: number; roles: AiLogRequestSummary["roles"]; lastUserMessage: string | null } {
    const roles = { system: 0, user: 0, assistant: 0, tool: 0, other: 0 }
    let lastUserMessage: string | null = null

    for (const message of messages) {
        const record = toRecord(message)
        const role = typeof record?.role === "string" ? record.role : ""
        // Messages 协议把工具结果放在 user 轮里，按 Chat Completions 的口径记成 tool，
        // 否则两条协议的日志角色分布对不上，按角色筛选会漏掉 Messages 的工具结果
        if (role === "user" && hasToolResultBlock(record?.content)) {
            roles.tool += 1
        } else if (role === "system" || role === "user" || role === "assistant" || role === "tool") {
            roles[role] += 1
        } else {
            roles.other += 1
        }
        if (role === "user") {
            const text = extractContentText(record?.content)
            if (text) lastUserMessage = text.length > maxContentChars ? `${text.slice(0, maxContentChars)}…[truncated]` : text
        }
    }

    return { messageCount: messages.length, roles, lastUserMessage }
}

/**
 * @description 抽取请求声明的工具名列表（只留名字，丢弃函数 schema）。
 * @param tools 请求 tools 字段。
 * @returns 工具名数组；未声明工具时为空数组。
 */
export function extractToolNames(tools: unknown): string[] {
    if (!Array.isArray(tools)) return []
    const names: string[] = []
    for (const tool of tools) {
        const record = toRecord(tool)
        const fn = toRecord(record?.function)
        const name = typeof fn?.name === "string" ? fn.name : typeof record?.name === "string" ? record.name : ""
        if (name) names.push(name)
    }
    return names
}

/**
 * @description 把消息数组裁剪到可落盘的大小：单条字符串内容超限时截断并打标记。
 * 超长内容（例如把整份资料库塞进上下文的请求）不裁剪会把单行 JSONL 写到几十 MB，检索时无法按行读。
 * @param messages 请求消息数组。
 * @param maxContentChars 单条内容上限（字符，非正数表示不限制）。
 * @returns 裁剪后的消息数组与是否发生过截断。
 */
export function truncateMessages(
    messages: readonly unknown[],
    maxContentChars = DEFAULT_MAX_CONTENT_CHARS
): { messages: unknown[]; truncated: boolean } {
    if (!Number.isFinite(maxContentChars) || maxContentChars <= 0) return { messages: [...messages], truncated: false }

    let truncated = false
    const cut = (text: string): string => {
        if (text.length <= maxContentChars) return text
        truncated = true
        return `${text.slice(0, maxContentChars)}…[truncated ${text.length - maxContentChars} chars]`
    }

    const result = messages.map(message => {
        const record = toRecord(message)
        if (!record) return message
        const next: Record<string, unknown> = { ...record }

        if (typeof record.content === "string") {
            next.content = cut(record.content)
        } else if (Array.isArray(record.content)) {
            // 图片先脱敏再判长度：整张图的 Base64 裁一段既看不出内容又照样占地方
            const redacted = redactImageBlocks(record.content)
            // 多模态内容整体序列化后判断，逐段裁剪会破坏结构
            const serialized = JSON.stringify(redacted)

            if (serialized.length > maxContentChars * 4) {
                truncated = true
                next.content = [{ type: "text", text: `${serialized.slice(0, maxContentChars * 4)}…[truncated]` }]
            } else {
                next.content = redacted
            }
        }

        if (Array.isArray(record.tool_calls)) {
            next.tool_calls = record.tool_calls.map(call => {
                const callRecord = toRecord(call)
                const fn = toRecord(callRecord?.function)
                if (!callRecord || !fn || typeof fn.arguments !== "string") return call
                return { ...callRecord, function: { ...fn, arguments: cut(fn.arguments) } }
            })
        }

        return next
    })

    return { messages: result, truncated }
}

/**
 * @description 按上游 usage 折算成本次费用。
 * @param usage 上游 usage 字段。
 * @param peak 是否高峰时段。
 * @returns 费用（微元）；无 usage 时为 0。
 */
export function resolveLogCostMicros(usage: UpstreamUsage | undefined | null, peak: boolean): number {
    if (!usage) return 0
    return computeCostMicros(normalizeUsage(usage), peak)
}

/**
 * @description 把上游 usage 归一化成日志结构（prompt 取三档输入之和，total 为输入 + 输出）。
 * @param usage 上游 usage 字段。
 * @returns 归一化用量；无 usage 时为 null。
 */
export function normalizeLogUsage(usage: UpstreamUsage | undefined | null): AiLogUsage | null {
    if (!usage) return null
    const tokens = normalizeUsage(usage)
    const prompt = tokens.cacheHit + tokens.cacheMiss
    return { prompt, completion: tokens.output, total: prompt + tokens.output, ...tokens }
}

/**
 * @description 构造索引记录用的客户端标识。
 * @param user 登录用户（未登录传 null）。
 * @param headers 请求头集合。
 * @param socketAddress 直连地址兜底。
 * @returns 客户端标识。
 */
export function buildClientIdentity(
    user: { id: string; name: string } | null,
    headers: { get(name: string): string | null },
    socketAddress?: string | null
): AiLogClient {
    return {
        userId: user?.id ?? null,
        userName: user?.name ?? null,
        ip: resolveClientIp(headers, socketAddress),
        userAgent: headers.get("user-agent"),
    }
}

/** 把上游错误正文收敛成可落盘的字符串。 */
export function stringifyErrorRaw(raw: unknown): string | null {
    if (raw === null || raw === undefined) return null
    if (typeof raw === "string") return raw.length > 4000 ? `${raw.slice(0, 4000)}…[truncated]` : raw
    try {
        const text = JSON.stringify(raw)
        if (typeof text !== "string") return null
        return text.length > 4000 ? `${text.slice(0, 4000)}…[truncated]` : text
    } catch {
        return null
    }
}

/**
 * @description 解析上游错误响应体，取出 OpenAI 兼容格式的错误消息。
 * @param body 已解析的上游错误响应体。
 * @param fallbackMessage 无法解析时使用的兜底消息。
 * @returns 错误代码、类型与消息。
 */
export function parseUpstreamError(body: unknown, fallbackMessage: string): { message: string; type: string; code: string } {
    const error = toRecord(toRecord(body)?.error)
    return {
        message: typeof error?.message === "string" ? error.message : fallbackMessage,
        type: typeof error?.type === "string" ? error.type : "api_error",
        code: typeof error?.code === "string" || typeof error?.code === "number" ? String(error.code) : "upstream_error",
    }
}

/**
 * @description 创建流式增量聚合器，把 SSE 增量拼装成一条完整的助手消息。
 * 工具调用的参数是分片下发的，按 `index` 归并后拼接，因此必须按到达顺序累积而不能覆盖。
 * 同时记下首个 chunk 上的上游补全 id（含 usage 的收尾 chunk 没有 choices，所以取 id 必须在判 choices 之前）。
 * @param now 取当前时间的函数，便于测试注入。
 * @returns 聚合器实例。
 */
export function createStreamAggregator(now: () => number = Date.now): AiLogStreamAggregator {
    let content = ""
    let reasoning = ""
    let firstTokenAt: number | null = null
    let finishReason: string | null = null
    let completionId: string | null = null
    let sawContent = false
    const toolCalls = new Map<number, AiLogToolCall>()

    const markFirstToken = (hasIncrement: boolean) => {
        if (hasIncrement && firstTokenAt === null) firstTokenAt = now()
    }

    /** 处理一个 choices 元素里的 delta 或完整 message。 */
    const consumeChoice = (choice: unknown) => {
        const choiceRecord = toRecord(choice)
        if (!choiceRecord) return

        if (typeof choiceRecord.finish_reason === "string") finishReason = choiceRecord.finish_reason

        const payload = toRecord(choiceRecord.delta) ?? toRecord(choiceRecord.message)
        if (!payload) return

        let hasIncrement = false

        if (typeof payload.content === "string" && payload.content) {
            content += payload.content
            hasIncrement = true
        }
        const reasoningPiece = typeof payload.reasoning_content === "string" ? payload.reasoning_content : payload.reasoning
        if (typeof reasoningPiece === "string" && reasoningPiece) {
            reasoning += reasoningPiece
            hasIncrement = true
        }
        if (Array.isArray(payload.tool_calls)) {
            payload.tool_calls.forEach((call, position) => {
                const callRecord = toRecord(call)
                if (!callRecord) return
                const index = typeof callRecord.index === "number" ? callRecord.index : position
                const current = toolCalls.get(index) ?? { id: null, type: "function", name: "", arguments: "" }
                if (typeof callRecord.id === "string" && callRecord.id) current.id = callRecord.id
                if (typeof callRecord.type === "string" && callRecord.type) current.type = callRecord.type
                const fn = toRecord(callRecord.function)
                if (typeof fn?.name === "string" && fn.name) current.name = fn.name
                if (typeof fn?.arguments === "string" && fn.arguments) current.arguments += fn.arguments
                toolCalls.set(index, current)
                hasIncrement = true
            })
        }

        if (hasIncrement) sawContent = true
        markFirstToken(hasIncrement)
    }

    return {
        push(payload: unknown) {
            const record = toRecord(payload)
            if (!record) return
            // 补全 id 在首个 chunk 上出现，且整条流共用一个值
            if (completionId === null) completionId = extractUpstreamCompletionId(record)
            if (!Array.isArray(record.choices)) return
            for (const choice of record.choices) consumeChoice(choice)
        },
        snapshot(): AiLogStreamState {
            const calls = [...toolCalls.entries()].sort(([left], [right]) => left - right).map(([, call]) => call)
            const hasAnything = sawContent || calls.length > 0 || finishReason !== null
            return {
                message: hasAnything
                    ? {
                          role: "assistant",
                          content,
                          reasoningContent: reasoning ? reasoning : null,
                          toolCalls: calls,
                      }
                    : null,
                finishReason,
                firstTokenAt,
                completionId,
            }
        },
    }
}

/** Messages 流式聚合的中间状态。 */
export interface AiLogMessagesStreamState extends AiLogStreamState {
    /** 累计 usage（Messages 的用量分散在 `message_start` 与 `message_delta` 两个事件里）。 */
    usage: UpstreamUsage | null
}

/** Messages 流式增量聚合器。 */
export interface AiLogMessagesStreamAggregator {
    /** 喂入一个 SSE 事件（已 JSON.parse 的 payload）。 */
    push(payload: unknown): void
    /** 取当前聚合结果。 */
    snapshot(): AiLogMessagesStreamState
}

/**
 * @description 把 Messages 的 `stop_reason` 归一化成日志里使用的结束原因。
 * @param raw 上游 stop_reason
 * @returns 结束原因；无法识别时为 null
 */
function normalizeMessagesStopReason(raw: unknown): string | null {
    switch (raw) {
        case "end_turn":
        case "stop_sequence":
            return "stop"
        case "tool_use":
            return "tool_calls"
        case "max_tokens":
            return "length"
        default:
            return typeof raw === "string" ? raw : null
    }
}

/**
 * @description 创建 Messages 流的增量聚合器，把事件拼装成一条完整的助手消息。
 *
 * 与 Chat Completions 聚合器的差别全在事件形态上：正文与思维链各是一个内容块，
 * 工具参数走 `input_json_delta.partial_json` 分片，usage 要跨事件累加。
 * 输出结构与 {@link AiLogAssistantMessage} 保持同构，日志查看页无需区分协议。
 * @param now 取当前时间的函数，便于测试注入。
 * @returns 聚合器实例。
 */
export function createMessagesStreamAggregator(now: () => number = Date.now): AiLogMessagesStreamAggregator {
    const usageAccumulator = createMessagesUsageAccumulator()
    /** 按块索引累积：正文 / 思维链文本，或工具调用的名称与参数分片。 */
    const blocks = new Map<number, { kind: string; text: string; id: string; name: string; json: string }>()

    let completionId: string | null = null
    let finishReason: string | null = null

    return {
        push(payload: unknown) {
            const event = toRecord(payload)
            if (!event) return

            // 补全 id 只在 message_start 出现一次
            if (completionId === null && event.type === "message_start") {
                completionId = extractUpstreamCompletionId(toRecord(event.message))
            }

            usageAccumulator.push(event)

            if (event.type === "content_block_start") {
                const index = typeof event.index === "number" ? event.index : blocks.size
                const native = toRecord(event.content_block)
                blocks.set(index, {
                    kind: typeof native?.type === "string" ? native.type : "text",
                    text: typeof native?.text === "string" ? native.text : typeof native?.thinking === "string" ? native.thinking : "",
                    id: typeof native?.id === "string" ? native.id : "",
                    name: typeof native?.name === "string" ? native.name : "",
                    json: "",
                })
                return
            }

            if (event.type === "content_block_delta") {
                const block = blocks.get(typeof event.index === "number" ? event.index : 0)
                const delta = toRecord(event.delta)
                if (!block || !delta) return

                if (typeof delta.text === "string") block.text += delta.text
                else if (typeof delta.thinking === "string") block.text += delta.thinking
                else if (typeof delta.partial_json === "string") block.json += delta.partial_json
                return
            }

            if (event.type === "message_delta") {
                const delta = toRecord(event.delta)
                if (delta && delta.stop_reason != null) finishReason = normalizeMessagesStopReason(delta.stop_reason)
            }
        },
        snapshot(): AiLogMessagesStreamState {
            let content = ""
            let reasoning = ""
            const toolCalls: AiLogToolCall[] = []

            for (const [, block] of [...blocks.entries()].sort(([left], [right]) => left - right)) {
                if (block.kind === "text") {
                    content += block.text
                    continue
                }

                if (block.kind === "thinking") {
                    reasoning += block.text
                    continue
                }

                if (block.kind === "tool_use" && block.name) {
                    toolCalls.push({ id: block.id || null, type: "function", name: block.name, arguments: block.json })
                }
            }

            const usage = usageAccumulator.snapshot() ?? null
            const hasAnything = content.length > 0 || reasoning.length > 0 || toolCalls.length > 0 || finishReason !== null

            return {
                message: hasAnything
                    ? {
                          role: "assistant",
                          content,
                          reasoningContent: reasoning ? reasoning : null,
                          toolCalls,
                      }
                    : null,
                finishReason,
                firstTokenAt: hasAnything ? now() : null,
                completionId,
                usage,
            }
        },
    }
}

/**
 * @description 生成日志行：紧凑 JSON，一条记录一行，便于按行流式读取。
 * @param record 记录对象。
 * @returns JSONL 行（不含换行符）。
 */
export function toJsonLine(record: unknown): string {
    return JSON.stringify(record)
}

/**
 * @description 取北京时间自然日键，索引与轮次文件名都用它归档。
 * @param date 待取日期的时间点。
 * @returns YYYY-MM-DD。
 */
export function logDayKey(date: Date): string {
    return beijingDayKey(date)
}
