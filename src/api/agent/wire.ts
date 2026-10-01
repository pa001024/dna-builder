/**
 * 资料检索 Agent 的线协议中立层。
 *
 * Agent 主循环（`dbAgent.ts`）只跟这一层打交道，具体走哪条协议由传输实现决定：
 *
 * - **Messages**（`messages-transport.ts`）：DeepSeek 官方给 agent 场景推荐的协议，
 *   工具调用是协议级一等字段（`tool_use` / `tool_result` 内容块），上游不会把工具语法
 *   当正文吐出来。
 * - **Chat Completions**（`chat-transport.ts`）：OpenAI 兼容格式，其余网关（如智谱）走这条。
 *
 * 两种协议对同一件事的表达差别很大——Messages 的工具参数是 JSON **对象**，
 * Chat Completions 是 JSON **字符串**分片；Messages 有顶层 `system` 字段，
 * Chat Completions 把 system 当一条普通消息。差异全部收敛在各自的传输实现里，
 * 主循环看到的永远是「文本 + 思考 + 工具调用（参数为 JSON 字符串）」这一套。
 */

/**
 * 协议中立层里的工具调用参数保持**原始 JSON 字符串**。
 *
 * 这与两种线协议的中立表示一致：Chat Completions 原生就是字符串，
 * Messages 虽然在线上是对象，但转成字符串可以让「模型给出非法参数」这一个案
 * 在解析处统一兜底，而不是让主循环去面对两种类型。
 */

/** Agent 侧的工具定义（参数用 JSON Schema 表达）。 */
export interface AgentToolDefinition {
    /** 工具名（模型可见的英文 id） */
    name: string
    /** 工具说明 */
    description: string
    /** 参数的 JSON Schema */
    parameters: Record<string, unknown>
}

/** 助手消息里的一次工具调用。 */
export interface AgentToolCall {
    /** 调用 id，回灌工具结果时用它对齐 */
    id: string
    /** 工具名 */
    name: string
    /** 参数的原始 JSON 字符串 */
    arguments: string
}

/**
 * 用户轮附带的一张图片。
 *
 * 图片按 Base64 内联进请求体，两种线协议都支持（Messages 是 `image` 内容块，
 * Chat Completions 是 `image_url` 内容分片），因此这里只保留 MIME 与裸 Base64，
 * `data:` 前缀由各自的传输实现按需拼。
 */
export interface AgentImageAttachment {
    /** 图片 MIME 类型（image/png、image/jpeg 等） */
    mimeType: string
    /** 图片内容的 Base64（不含 `data:` 前缀） */
    data: string
}

/** 一次工具调用的执行结果。 */
export interface AgentToolResult {
    /** 对应的工具调用 id */
    toolCallId: string
    /** 结果正文（序列化后的字符串） */
    content: string
    /** 该次调用是否失败 */
    isError?: boolean
}

/** 协议中立的对话消息。 */
export type AgentWireMessage =
    | {
          role: "user"
          /** 用户输入正文；只承载工具结果或图片时为空串 */
          text: string
          /** 本轮的检索工具结果 */
          toolResults?: AgentToolResult[]
          /** 本轮附带的图片（截图 / 配装面板等），模型可见 */
          images?: readonly AgentImageAttachment[]
      }
    | {
          role: "assistant"
          /** 正文 */
          text: string
          /** 思维链正文（模型未返回时为空串） */
          thinking: string
          /** 本轮发起的工具调用 */
          toolCalls: AgentToolCall[]
      }

/** 单轮收流原因（两种协议归一化后的取值）。 */
export type AgentFinishReason = "stop" | "tool_calls" | "length" | null

/** 单轮流式增量回调。 */
export interface AgentStreamHandlers {
    /** 正文增量 */
    onText?: (text: string) => void
    /** 思考增量 */
    onThinking?: (text: string) => void
}

/** 单轮请求。 */
export interface AgentRoundRequest {
    /** 模型 id */
    model: string
    /** 系统提示词 */
    system: string
    /** 完整对话上下文 */
    messages: readonly AgentWireMessage[]
    /** 本轮可用的工具；缺省表示本轮不给工具（强制模型基于已有结果作答） */
    tools?: readonly AgentToolDefinition[]
    /** 采样温度 */
    temperature: number
    /** 输出 tokens 上限 */
    maxTokens: number
    /** 流式增量回调 */
    handlers?: AgentStreamHandlers
    /** 中断判据：返回 true 时尽快停止读取流并返回已产出的内容 */
    isInterrupted?: () => boolean
}

/** 单轮结果。 */
export interface AgentRoundResult {
    /** 正文 */
    text: string
    /** 思维链正文 */
    thinking: string
    /** 本轮发起的工具调用 */
    toolCalls: AgentToolCall[]
    /** 收流原因 */
    finishReason: AgentFinishReason
}

/** 线协议名。 */
export type AgentProtocol = "messages" | "chat"

/** 传输实现：一次调用只负责「跑一轮」，工具执行与多轮循环由主循环负责。 */
export interface AgentTransport {
    /** 协议名（日志与诊断用） */
    readonly protocol: AgentProtocol
    /**
     * 跑一轮：把当前上下文发给模型，流式增量走回调，返回本轮汇总。
     * @param request 单轮请求
     * @returns 本轮正文、思考、工具调用与收流原因
     */
    runRound(request: AgentRoundRequest): Promise<AgentRoundResult>
}

/** 上游连接参数。 */
export interface AgentTransportOptions {
    /** 上游 API Key */
    apiKey: string
    /** 上游基址 */
    baseUrl: string
    /** 单个流的空闲超时（毫秒）：两块增量之间的最大间隔，超时即视为上游卡死 */
    timeout: number
    /** 网络错误与 5xx / 429 的重试次数 */
    maxRetries: number
}

/** DeepSeek 官方 Anthropic 兼容入口的路径（官方文档给定的 base_url 是 `<origin>/anthropic`）。 */
const DEEPSEEK_ANTHROPIC_PATH = "/anthropic/v1/messages"

/** 自家代理暴露的 Messages 路径（基址以 `/api/v1` 结尾）。 */
const PROXY_MESSAGES_PATH = "/messages"

/** 自家代理的基址后缀，同时提供 `/chat/completions` 与 `/messages`。 */
const PROXY_SUFFIX = "/api/v1"

/**
 * @description 去掉基址末尾的斜杠，避免拼接端点时出现双斜杠。
 * @param baseUrl 原始基址
 * @returns 去掉末尾斜杠的基址
 */
function trimTrailingSlash(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/, "")
}

/**
 * @description 解析基址；不是合法 URL 时返回 null。
 * @param baseUrl 原始基址
 * @returns 解析后的 URL；非法时 null
 */
function parseBaseUrl(baseUrl: string): URL | null {
    try {
        return new URL(baseUrl.trim())
    } catch {
        return null
    }
}

/**
 * @description 判断基址是否指向 DeepSeek 官方（Anthropic 兼容入口与 OpenAI 兼容入口同源）。
 * @param url 已解析的基址
 * @returns 是否指向 DeepSeek 官方
 */
function isDeepSeekHost(url: URL): boolean {
    const host = url.hostname.toLowerCase()
    return host === "deepseek.com" || host.endsWith(".deepseek.com")
}

/**
 * @description 判定某个基址该走哪条协议。
 *
 * 判据是**端点能力**而不是模型名：
 * - DeepSeek 官方：Anthropic 兼容入口与 OpenAI 兼容入口同源，直接用 Messages；
 * - 自家代理（基址以 `/api/v1` 结尾）：同时提供 `/messages`，用 Messages；
 * - 其余网关（智谱等，只有 OpenAI 兼容入口）：退回 Chat Completions。
 *
 * 基址非法时按 Chat Completions 处理——这是改动前就存在的行为，保持不放大影响面。
 * @param baseUrl 上游基址
 * @returns 应使用的线协议
 */
export function resolveAgentProtocol(baseUrl: string): AgentProtocol {
    const url = parseBaseUrl(baseUrl)

    if (!url) {
        return "chat"
    }

    if (isDeepSeekHost(url)) {
        return "messages"
    }

    return trimTrailingSlash(url.pathname).endsWith(PROXY_SUFFIX) ? "messages" : "chat"
}

/**
 * @description 求 Messages 协议的实际端点。
 *
 * 与 DeepSeek 官方文档一致：base_url 是 `<origin>/anthropic`，模型请求打在 `<origin>/anthropic/v1/messages`。
 * 用户若已把 `/anthropic` 或 `/anthropic/v1` 写进基址，这里按同样的规则续接而不是重复拼接。
 * @param baseUrl 上游基址
 * @returns Messages 端点绝对 URL；基址非法时返回 null
 */
export function resolveMessagesEndpoint(baseUrl: string): string | null {
    const url = parseBaseUrl(baseUrl)

    if (!url) {
        return null
    }

    if (!isDeepSeekHost(url)) {
        return `${trimTrailingSlash(baseUrl)}${PROXY_MESSAGES_PATH}`
    }

    const path = trimTrailingSlash(url.pathname)

    if (path.endsWith("/anthropic/v1")) {
        return `${url.origin}${path}/messages`
    }

    if (path.endsWith("/anthropic")) {
        return `${url.origin}${path}/v1/messages`
    }

    return `${url.origin}${DEEPSEEK_ANTHROPIC_PATH}`
}

/**
 * @description 求 Chat Completions 协议的实际端点（OpenAI 兼容约定）。
 * @param baseUrl 上游基址，需以 `/` 结尾；未带时补上
 * @returns 完整端点 URL
 */
export function resolveChatEndpoint(baseUrl: string): string {
    return `${trimTrailingSlash(baseUrl)}/chat/completions`
}

/**
 * @description 把工具调用参数解析成对象。
 *
 * 模型偶尔返回非法 JSON；此时按空对象处理，让工具自己给出「缺少参数」的报错，
 * 而不是让整轮对话因为一次解析失败而中断。
 * @param rawArguments 原始参数串
 * @returns 解析后的参数对象；空串与非法 JSON 均得到空对象
 */
export function parseToolArguments(rawArguments: string): Record<string, unknown> {
    if (!rawArguments?.trim()) {
        return {}
    }

    try {
        const parsed = JSON.parse(rawArguments)
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
    } catch {
        return {}
    }
}
