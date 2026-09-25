/**
 * Messages 协议传输（DeepSeek Anthropic 兼容入口）。
 *
 * 与 DSH（DeepSeek Harness）的 `llm-deepseek` 适配器保持同一套调用姿势：
 * 顶层 `system` 字段、content block 数组、工具声明用 `input_schema`、
 * 工具调用与工具结果分别是 `tool_use` / `tool_result` 块。
 *
 * ⚠️ 为什么不用 OpenAI 兼容的 `/chat/completions`：
 * 那条路上，上游要靠「在生成文本里匹配 DSML 标记」的解析器把工具调用还原成结构化字段；
 * 该解析器在长上下文、思考块内联、streaming + 自动工具选择等场景下会漏判，
 * 于是整段 `<||DSML|||tool_calls>` 标记被当作**正文**下发（即 DSML 泄露），
 * 工具调用数量为零，Agent 会误判「模型已给出最终回答」而提前结束检索。
 * Messages 协议下工具调用是协议级一等字段，不存在这条文本解析路径。
 *
 * 本文件只做「序列化 + 流式翻译」，工具执行与多轮循环在 `dbAgent.ts`。
 */

import {
    type AgentFinishReason,
    type AgentRoundRequest,
    type AgentRoundResult,
    type AgentStreamHandlers,
    type AgentToolCall,
    type AgentTransport,
    type AgentTransportOptions,
    type AgentWireMessage,
    resolveMessagesEndpoint,
} from "./agent-wire"

/** Messages 用户轮的写入块。 */
type MessagesInputBlock =
    | { type: "text"; text: string }
    | { type: "tool_result"; tool_use_id: string; content: Array<{ type: "text"; text: string }>; is_error?: boolean }

/** Messages 助手轮的写入块。 */
type MessagesAssistantBlock =
    | { type: "thinking"; thinking: string }
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }

/** Messages 一条对话轮。 */
interface MessagesWireMessage {
    role: "user" | "assistant"
    content: Array<MessagesInputBlock | MessagesAssistantBlock>
}

/** 流式过程中正在累积的一个内容块。 */
interface StreamingBlock {
    /** 块类型 */
    kind: "text" | "thinking" | "tool_use"
    /** 正文或思考文本（tool_use 不使用） */
    text: string
    /** 工具调用 id（tool_use 使用） */
    id: string
    /** 工具名（tool_use 使用） */
    name: string
    /** 工具参数的 JSON 分片缓冲（tool_use 使用） */
    json: string
}

/** 一次流式读取的运行态。 */
interface StreamContext {
    /** 空闲计时器句柄 */
    idleTimer: ReturnType<typeof setTimeout> | null
    /** 是否因空闲超时而中断 */
    idleTimedOut: boolean
}

/**
 * @description 把协议中立的对话消息序列化成 Messages 的 content block 数组。
 *
 * 两个由协议强制的顺序约束在这里落实：
 * 1. Messages 没有独立的 `tool` 角色，工具结果要作为 `tool_result` 块出现在 user 轮里，且必须排在文本之前；
 * 2. 助手轮里 `thinking` 块必须排在 `text` / `tool_use` 之前。
 *
 * 相邻的同角色轮会合并成一条消息——主循环为了「发起调用的助手轮后立刻跟上结果」
 * 可能连续压入多条 user 轮，拆开会让上游报「tool_use 缺少对应结果」。
 * @param messages 协议中立的对话消息
 * @returns Messages 的 messages 数组
 */
function serializeMessages(messages: readonly AgentWireMessage[]): MessagesWireMessage[] {
    const result: MessagesWireMessage[] = []

    for (const message of messages) {
        const blocks: Array<MessagesInputBlock | MessagesAssistantBlock> =
            message.role === "assistant"
                ? [
                      ...(message.thinking ? [{ type: "thinking" as const, thinking: message.thinking }] : []),
                      ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
                      ...message.toolCalls.map(
                          (call): MessagesAssistantBlock => ({
                              type: "tool_use",
                              id: call.id,
                              name: call.name,
                              input: toToolInput(call.arguments),
                          })
                      ),
                  ]
                : [
                      ...(message.toolResults ?? []).map(
                          (item): MessagesInputBlock => ({
                              type: "tool_result",
                              tool_use_id: item.toolCallId,
                              content: [{ type: "text", text: item.content }],
                              ...(item.isError ? { is_error: true } : {}),
                          })
                      ),
                      ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
                  ]

        if (!blocks.length) {
            continue
        }

        const previous = result.at(-1)

        if (previous?.role === message.role) {
            previous.content.push(...blocks)
        } else {
            result.push({ role: message.role, content: blocks })
        }
    }

    return result
}

/**
 * @description 把工具参数的 JSON 字符串还原成 Messages 要求的对象。
 *
 * 工具**参数**在 Messages 线上是对象而不是字符串，本地上下文里存的却是字符串；
 * 解析失败时退回空对象，保留调用 id 与工具名，让模型看到「这次调用没有参数」，
 * 而不是让整轮请求因为一段历史参数被上游拒绝。
 * @param rawArguments 原始参数串
 * @returns 参数对象
 */
function toToolInput(rawArguments: string): Record<string, unknown> {
    try {
        const parsed: unknown = JSON.parse(rawArguments)
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
    } catch {
        return {}
    }
}

/**
 * @description 把 Messages 的 `stop_reason` 归一化成中立的收流原因。
 * @param raw 上游 stop_reason
 * @returns 归一化后的收流原因
 */
function normalizeFinishReason(raw: unknown): AgentFinishReason {
    switch (raw) {
        case "end_turn":
        case "stop_sequence":
            return "stop"
        case "tool_use":
            return "tool_calls"
        case "max_tokens":
            return "length"
        default:
            return null
    }
}

/**
 * @description 构造 Messages 请求体。
 * @param request 单轮请求
 * @returns 请求体对象
 */
function buildRequestBody(request: AgentRoundRequest): Record<string, unknown> {
    return {
        model: request.model,
        stream: true,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: serializeMessages(request.messages),
        // 显式开启思考：不传时由上游默认值决定，界面上的思考分段会出现时有时无的情况
        thinking: { type: "enabled" },
        ...(Number.isFinite(request.temperature) ? { temperature: request.temperature } : {}),
        ...(request.tools?.length
            ? {
                  tools: request.tools.map(tool => ({
                      name: tool.name,
                      description: tool.description,
                      input_schema: tool.parameters,
                  })),
              }
            : {}),
    }
}

/**
 * @description 判断一次失败是否值得重试。
 * 只重试网络错误与上游临时性故障（429 / 5xx）；4xx（鉴权、参数、额度）重试也不会变好。
 * @param status 上游状态码；网络错误时传 null
 * @returns 是否重试
 */
function isRetryable(status: number): boolean {
    return status === 429 || status >= 500
}

/**
 * @description 从错误响应体里取可读的错误消息。
 * Messages 的错误体是 `{type:"error", error:{type,message}}`；部分网关沿用 OpenAI 的 `{error:{message}}`。
 * @param body 已解析的响应体
 * @param status HTTP 状态码
 * @returns 错误消息
 */
function resolveErrorMessage(body: unknown, status: number): string {
    const record = body as { error?: { message?: unknown } } | null | undefined
    const message = record?.error?.message

    return typeof message === "string" && message.trim() ? message : `上游请求失败（HTTP ${status}）`
}

/**
 * @description 组装本轮结果：把累积的内容块整理成正文、思考与工具调用。
 *
 * 工具参数是分片下发的 JSON 字符串，解析失败时**丢弃该次调用**——半截参数交给工具执行
 * 只会得到一次注定失败的检索，还会让模型以为自己已经查过。这与 DSH 在输出上限处
 * 剪掉不完整工具调用的处理一致。
 * @param blocks 按索引累积的内容块
 * @param finishReason 收流原因
 * @returns 本轮汇总
 */
function assembleRound(blocks: Map<number, StreamingBlock>, finishReason: AgentFinishReason): AgentRoundResult {
    const ordered = [...blocks.entries()].sort(([left], [right]) => left - right).map(([, block]) => block)

    let text = ""
    let thinking = ""
    const toolCalls: AgentToolCall[] = []

    for (const block of ordered) {
        if (block.kind === "text") {
            text += block.text
            continue
        }

        if (block.kind === "thinking") {
            thinking += block.text
            continue
        }

        if (!block.name) {
            continue
        }

        let usable = false

        try {
            const parsed: unknown = JSON.parse(block.json || "{}")
            usable = !!parsed && typeof parsed === "object" && !Array.isArray(parsed)
        } catch {
            usable = false
        }

        if (!usable) {
            console.warn("[DBAgent] 工具参数不是合法 JSON，已丢弃该次调用", { tool: block.name })
            continue
        }

        toolCalls.push({ id: block.id || `call_${toolCalls.length}_${Date.now()}`, name: block.name, arguments: block.json || "{}" })
    }

    return { text, thinking, toolCalls, finishReason }
}

/**
 * @description 重试前的退避等待（线性递增，上限 2 秒）。
 * @param attempt 已失败次数（从 0 开始）
 * @returns 等待完成的 Promise
 */
function delay(attempt: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, Math.min(2000, 400 * (attempt + 1)))
    })
}

/** 单次尝试的结果。 */
type AttemptOutcome = { ok: true; result: AgentRoundResult } | { ok: false; error: Error; retryable: boolean }

/**
 * @description 创建 Messages 协议传输。
 * @param options 上游连接参数
 * @returns 传输实现
 */
export function createMessagesTransport(options: AgentTransportOptions): AgentTransport {
    const endpoint = resolveMessagesEndpoint(options.baseUrl)
    /** 是否直连 DeepSeek 官方入口（决定鉴权头形态：官方认 `x-api-key`，自建代理认 `Authorization`）。 */
    const isDirectUpstream = !options.baseUrl.endsWith("/api/v1")

    /**
     * 消费一段 SSE 缓冲区，逐行取出其中的事件。
     * 不完整的尾行留在缓冲区里等下一个数据块补全（SSE 事件可能被分片切断）。
     * @param buffer 待解析文本
     * @param onEvent 解析出事件时的回调
     * @returns 尚未成行的尾部文本
     */
    function consume(buffer: string, onEvent: (payload: Record<string, unknown>) => void): string {
        const lines = buffer.split("\n")
        const rest = lines.pop() ?? ""

        for (const line of lines) {
            const trimmed = line.trim()

            if (!trimmed.startsWith("data:")) {
                continue
            }

            const payload = trimmed.slice("data:".length).trim()

            if (!payload || payload === "[DONE]") {
                continue
            }

            try {
                onEvent(JSON.parse(payload) as Record<string, unknown>)
            } catch {
                // 心跳与注释块不是 JSON，忽略
            }
        }

        return rest
    }

    /**
     * 把单个事件应用到累积态上。
     * @param event 已解析的上游事件
     * @param blocks 内容块累积表
     * @param handlers 流式增量回调
     * @returns 该事件是否更新了收流原因；更新时返回归一化后的原因
     */
    function applyEvent(
        event: Record<string, unknown>,
        blocks: Map<number, StreamingBlock>,
        handlers: AgentStreamHandlers
    ): AgentFinishReason | undefined {
        if (event.type === "content_block_start") {
            const index = Number(event.index) || 0
            const block = event.content_block as { type?: string; id?: string; name?: string; text?: string; thinking?: string } | undefined

            if (block?.type === "tool_use") {
                blocks.set(index, { kind: "tool_use", text: "", id: `${block.id ?? ""}`, name: `${block.name ?? ""}`, json: "" })
                return undefined
            }

            if (block?.type === "thinking") {
                const text = `${block.thinking ?? ""}`
                blocks.set(index, { kind: "thinking", text, id: "", name: "", json: "" })

                if (text) {
                    handlers.onThinking?.(text)
                }

                return undefined
            }

            const text = `${block?.text ?? ""}`
            blocks.set(index, { kind: "text", text, id: "", name: "", json: "" })

            if (text) {
                handlers.onText?.(text)
            }

            return undefined
        }

        if (event.type === "content_block_delta") {
            const block = blocks.get(Number(event.index) || 0)
            const delta = event.delta as { type?: string; text?: string; thinking?: string; partial_json?: string } | undefined

            if (!block || !delta) {
                return undefined
            }

            if (delta.type === "text_delta") {
                const text = `${delta.text ?? ""}`
                block.text += text

                if (text) {
                    handlers.onText?.(text)
                }

                return undefined
            }

            if (delta.type === "thinking_delta") {
                const text = `${delta.thinking ?? ""}`
                block.text += text

                if (text) {
                    handlers.onThinking?.(text)
                }

                return undefined
            }

            if (delta.type === "input_json_delta") {
                block.json += `${delta.partial_json ?? ""}`
            }

            return undefined
        }

        if (event.type === "message_delta") {
            const delta = event.delta as { stop_reason?: unknown } | undefined
            return delta?.stop_reason == null ? undefined : normalizeFinishReason(delta.stop_reason)
        }

        if (event.type === "error") {
            const error = event.error as { message?: unknown } | undefined
            throw new Error(typeof error?.message === "string" ? error.message : "上游返回错误事件")
        }

        return undefined
    }

    /**
     * 读取上游流，把增量喂给回调并汇总本轮结果。
     *
     * 空闲计时**每收到一块数据就重置**：检索 Agent 的长回答可能持续数分钟，
     * 按整轮总时长设限会把正常回答掐断，把「两块增量之间的间隔」当空闲才是有意义的判据。
     * @param body 上游响应体
     * @param handlers 流式增量回调
     * @param isInterrupted 中断判据
     * @param context 流式运行态（空闲计时器与超时标记）
     * @param abort 中止底层请求（空闲超时时由计时器调用）
     * @returns 本轮汇总
     */
    async function readStream(
        body: ReadableStream<Uint8Array>,
        handlers: AgentStreamHandlers,
        isInterrupted: () => boolean,
        context: StreamContext,
        abort: () => void
    ): Promise<AgentRoundResult> {
        const reader = body.getReader()
        const decoder = new TextDecoder()
        const blocks = new Map<number, StreamingBlock>()

        let buffer = ""
        let finishReason: AgentFinishReason = null
        let interrupted = false

        /** 重置空闲计时；超时即中止请求并置位标记，由调用方决定是否重试 */
        const resetIdle = () => {
            if (options.timeout <= 0) {
                return
            }

            if (context.idleTimer) {
                clearTimeout(context.idleTimer)
            }

            context.idleTimer = setTimeout(() => {
                context.idleTimedOut = true
                abort()
            }, options.timeout)
        }

        try {
            resetIdle()

            for (;;) {
                if (isInterrupted()) {
                    interrupted = true
                    break
                }

                const { done, value } = await reader.read()

                if (done) {
                    break
                }

                resetIdle()
                buffer += decoder.decode(value, { stream: true })

                buffer = consume(buffer, event => {
                    // 中断判据同时管到块内：一块数据里可能压着多个增量，
                    // 只在块之间检查会让中断后仍然多吐一段内容
                    if (isInterrupted()) {
                        return
                    }

                    const next = applyEvent(event, blocks, handlers)

                    if (next !== undefined) {
                        finishReason = next
                    }
                })
            }
        } finally {
            if (context.idleTimer) {
                clearTimeout(context.idleTimer)
                context.idleTimer = null
            }

            if (interrupted) {
                void reader.cancel().catch(() => {})
            }

            reader.releaseLock()
        }

        // 空闲超时是「上游卡死」，此时手上只有半截内容：直接报错交给上层重试，
        // 不能当作正常收流交回去，否则主循环会把半句话当成最终答复展示给用户
        if (context.idleTimedOut) {
            throw new Error(`上游 ${options.timeout} 毫秒内没有新内容，已中断本次请求`)
        }

        return assembleRound(blocks, finishReason)
    }

    /**
     * @description 尝试跑一轮（一次网络往返 + 一次流式读取）。
     *
     * 连接阶段与流式阶段各自设限：连接用「从发出请求到收到响应头」的超时，
     * 流式阶段换成「两块增量之间」的空闲超时，两者共用一个 AbortController。
     * @param payload 已序列化的请求体
     * @param handlers 流式增量回调
     * @param isInterrupted 中断判据
     * @returns 成功结果，或带重试判定的失败
     */
    async function attemptOnce(payload: string, handlers: AgentStreamHandlers, isInterrupted: () => boolean): Promise<AttemptOutcome> {
        const controller = new AbortController()
        const context: StreamContext = { idleTimer: null, idleTimedOut: false }
        const connectTimer = options.timeout > 0 ? setTimeout(() => controller.abort(), options.timeout) : null

        try {
            const response = await fetch(endpoint!, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                    // 直连 DeepSeek 官方 Anthropic 入口用 x-api-key；
                    // 走自建代理时凭证是登录令牌，与其它接口一样放 Authorization。
                    ...(isDirectUpstream ? { "x-api-key": options.apiKey } : { Authorization: `Bearer ${options.apiKey}` }),
                },
                body: payload,
                signal: controller.signal,
            })

            if (connectTimer) {
                clearTimeout(connectTimer)
            }

            if (!response.ok) {
                const text = await response.text()
                let parsed: unknown = null

                try {
                    parsed = JSON.parse(text)
                } catch {
                    parsed = null
                }

                return {
                    ok: false,
                    error: new Error(resolveErrorMessage(parsed, response.status)),
                    retryable: isRetryable(response.status),
                }
            }

            if (!response.body) {
                return { ok: false, error: new Error("上游未返回响应体"), retryable: true }
            }

            const result = await readStream(response.body, handlers, isInterrupted, context, () => controller.abort())

            return { ok: true, result }
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error))

            if (context.idleTimedOut) {
                return { ok: false, error: new Error(`上游 ${options.timeout} 毫秒内没有新内容，已中断本次请求`), retryable: true }
            }

            // 连接超时、DNS / TLS 失败等都在这里：都属临时性，可以重试
            return { ok: false, error: failure, retryable: true }
        } finally {
            if (connectTimer) {
                clearTimeout(connectTimer)
            }

            if (context.idleTimer) {
                clearTimeout(context.idleTimer)
                context.idleTimer = null
            }
        }
    }

    return {
        protocol: "messages",

        async runRound(request: AgentRoundRequest): Promise<AgentRoundResult> {
            if (!endpoint) {
                throw new Error("AI 基址不合法，无法解析 Messages 端点")
            }

            if (!options.apiKey) {
                throw new Error("缺少 API Key")
            }

            const payload = JSON.stringify(buildRequestBody(request))
            const handlers = request.handlers ?? {}
            const isInterrupted = request.isInterrupted ?? (() => false)
            const maxAttempts = Math.max(0, options.maxRetries)

            let lastFailure: Error | null = null

            for (let attempt = 0; attempt <= maxAttempts; attempt++) {
                const outcome = await attemptOnce(payload, handlers, isInterrupted)

                if (outcome.ok) {
                    return outcome.result
                }

                lastFailure = outcome.error

                // 4xx（鉴权 / 参数 / 额度）重试也不会变好，直接失败
                if (!outcome.retryable) {
                    throw outcome.error
                }

                if (attempt < maxAttempts) {
                    console.warn(`[DBAgent] Messages 请求失败，准备重试（${attempt + 1}/${maxAttempts}）：${outcome.error.message}`)
                    await delay(attempt)
                }
            }

            throw lastFailure ?? new Error("Messages 请求失败")
        },
    }
}
