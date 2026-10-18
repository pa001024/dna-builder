import { env } from "../env"

/**
 * AI 调用日志的 REST 接口封装（服务端见 `server/src/api/ai-log.ts`）。
 *
 * 日志含完整对话内容，服务端只对 `admin` 角色开放，因此所有请求都带登录令牌；
 * 非管理员拿到 403、会话不存在拿到 404，这里统一抛错由调用方提示。
 * 检索走 REST 而不是 GraphQL：日志按日期分片存在 JSONL 里，与 GraphQL 的数据表无关。
 */

/** 日志里的 token 用量（prompt / completion 为输入输出总量，cache 两档为输入拆分）。 */
export interface AiLogUsage {
    prompt: number
    completion: number
    total: number
    cacheHit: number
    cacheMiss: number
    output: number
}

/** 错误信息（代理层错误或上游错误）。 */
export interface AiLogError {
    code: string
    type: string
    message: string
    /** 上游原始错误正文（可能为 null）。 */
    raw: string | null
}

/** 客户端标识。 */
export interface AiLogClient {
    userId: string | null
    userName: string | null
    ip: string | null
    userAgent: string | null
}

/** 请求摘要（完整消息在轮次记录里）。 */
export interface AiLogRequestSummary {
    messageCount: number
    roles: { system: number; user: number; assistant: number; tool: number; other: number }
    lastUserMessage: string | null
    temperature: number | null
    maxTokensRequested: number | null
    maxTokensResolved: number | null
    peak: boolean
    toolNames: string[]
}

/** 索引记录：一次请求的元数据。 */
export interface AiLogRequestMeta {
    requestId: string
    /** 会话 id：服务端按「账号 + 会话首条 user 消息」推导的指纹（`fp-` 前缀）。 */
    sessionId: string
    /** 上游追踪 id（响应头 `x-ds-trace-id`），请求级，用于向 DeepSeek 对账；未调通上游时为 null。 */
    upstreamTraceId: string | null
    /** 上游补全 id（响应体 `id`），请求级；未调通上游或上游未返回时为 null。 */
    upstreamCompletionId: string | null
    /** 请求开始时间（ISO 8601，UTC）。 */
    time: string
    /** 归档用的北京自然日。 */
    day: string
    client: AiLogClient
    model: string
    stream: boolean
    /** 返回给客户端的 HTTP 状态码。 */
    status: number
    ok: boolean
    upstreamStatus: number | null
    durationMs: number
    ttftMs: number | null
    usage: AiLogUsage | null
    costMicros: number
    error: AiLogError | null
    request: AiLogRequestSummary
    /** 对应轮次记录的位置（相对日志根目录）。 */
    turnRef: string
}

/** 一次工具调用。 */
export interface AiLogToolCall {
    id: string | null
    type: string
    name: string
    arguments: string
}

/** 助手回复（流式由增量拼装而成）。 */
export interface AiLogAssistantMessage {
    role: "assistant"
    content: string
    reasoningContent: string | null
    toolCalls: AiLogToolCall[]
}

/** 轮次记录：一轮对话的完整输入输出。 */
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
    request: {
        messages: AiLogMessage[]
        /** 内容是否因超过服务端上限被截断。 */
        truncated: boolean
        tools: string[]
        temperature: number | null
        maxTokens: number | null
    }
    response: {
        message: AiLogAssistantMessage | null
        finishReason: string | null
    }
    error: AiLogError | null
    usage: AiLogUsage | null
    costMicros: number
}

/** 轮次记录里的对话消息（字段与 OpenAI 兼容格式一致）。 */
export interface AiLogMessage {
    role?: string
    content?: unknown
    tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>
    tool_call_id?: unknown
    name?: unknown
}

/** `/logs/stats` 的返回。 */
export interface AiLogStats {
    enabled: boolean
    dir: string
    days: string[]
    firstDay: string | null
    lastDay: string | null
    sessionCount: number
}

/** 索引检索参数。 */
export interface AiLogQueryParams {
    from?: string
    to?: string
    sessionId?: string
    ok?: boolean
    status?: number
    limit?: number
}

/** 索引检索结果。 */
export interface AiLogListResult {
    enabled: boolean
    count: number
    /** 结果是否被 limit 截断（还有更早的命中记录未返回）。 */
    truncated: boolean
    /** 实际扫描的日期文件数。 */
    scannedDays: number
    logs: AiLogRequestMeta[]
}

/** 服务端返回的错误结构。 */
interface AiLogFailure {
    success: false
    error: string
}

/**
 * @description 发起一次日志接口请求并统一处理错误。
 * @param path 相对 `/api/v1/ai/logs` 的路径（以 `/` 开头，根路径用空串）。
 * @param token 登录令牌。
 * @param params 查询参数（空值会被丢弃）。
 * @param init 额外的 fetch 配置。
 * @returns 服务端返回的 JSON。
 */
async function request<T>(path: string, token: string, params?: Record<string, unknown>, init?: RequestInit): Promise<T> {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params || {})) {
        if (value === undefined || value === null || value === "") continue
        query.set(key, String(value))
    }

    const search = query.toString()
    const response = await fetch(`${env.apiEndpoint.replace(/\/$/, "")}/api/v1/ai/logs${path}${search ? `?${search}` : ""}`, {
        ...init,
        headers: { ...((init?.headers as Record<string, string> | undefined) || {}), token },
    })

    let payload: unknown = null
    try {
        payload = await response.json()
    } catch {
        // 网关返回的非 JSON 错误体，交给下面的状态码分支
    }

    const failure = payload as AiLogFailure | null
    if (!response.ok || failure?.success === false) {
        throw new Error(failure?.error || `请求失败（HTTP ${response.status}）`)
    }
    return payload as T
}

/**
 * @description 按时间段 / 会话 / 状态检索请求元数据（时间倒序）。
 * @param params 检索条件。
 * @param token 登录令牌。
 * @returns 命中的请求记录。
 */
export function listAiLogs(params: AiLogQueryParams, token: string): Promise<AiLogListResult> {
    return request<AiLogListResult>("", token, {
        from: params.from,
        to: params.to,
        sessionId: params.sessionId,
        ok: params.ok === undefined ? undefined : params.ok,
        status: params.status,
        limit: params.limit,
    })
}

/**
 * @description 取某个会话的完整轮次记录（时间正序，可直接回放整段对话）。
 * @param sessionId 会话 id。
 * @param token 登录令牌。
 * @param params 可选的日期范围。
 * @returns 会话的轮次与涉及日期。
 */
export function readAiLogSession(
    sessionId: string,
    token: string,
    params?: { from?: string; to?: string }
): Promise<{ sessionId: string; days: string[]; count: number; turns: AiLogTurnRecord[] }> {
    return request(`/sessions/${encodeURIComponent(sessionId)}`, token, params)
}

/**
 * @description 列出有日志的会话与日期。
 * @param token 登录令牌。
 * @returns 会话 id 列表与日期列表。
 */
export function listAiLogSessions(token: string): Promise<{ count: number; sessions: string[]; days: string[] }> {
    return request("/sessions", token)
}

/**
 * @description 取日志目录概况（开关状态、目录、覆盖日期、会话数）。
 * @param token 登录令牌。
 * @returns 日志概况。
 */
export function readAiLogStats(token: string): Promise<AiLogStats> {
    return request<AiLogStats>("/stats", token)
}

/**
 * @description 清理指定日期之前的日志（含索引与全部会话轮次）。
 * @param before 截止日期（不含该日，YYYY-MM-DD）。
 * @param token 登录令牌。
 * @returns 删除的文件数。
 */
export function pruneAiLogs(before: string, token: string): Promise<{ before: string; removed: number }> {
    return request("/", token, { before }, { method: "DELETE" })
}
