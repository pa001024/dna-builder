/**
 * Chat Completions 协议传输（OpenAI 兼容）。
 *
 * 给只有 OpenAI 兼容入口的网关用（例如智谱）。DeepSeek 官方与自家代理都走
 * `messages-transport.ts`：那条路上的工具调用是协议级字段，不像这里要靠上游
 * 在生成文本里还原工具语法（还原失败即 DSML 泄露）。
 *
 * 上下文里的思考内容在这条协议上**不回灌**：OpenAI 兼容格式没有承载思维链的字段，
 * 塞进 `content` 会污染模型看到的正文。这是协议的固有限制，不是可以靠参数绕开的。
 */

import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import type {
    AgentFinishReason,
    AgentRoundRequest,
    AgentRoundResult,
    AgentStreamHandlers,
    AgentToolCall,
    AgentTransport,
    AgentTransportOptions,
    AgentWireMessage,
} from "./agent-wire"

/** 流式增量里工具调用的分片形态。 */
interface ChatToolCallDelta {
    index?: number
    id?: string
    function?: { name?: string; arguments?: string }
}

/** 流式增量形态（含 DeepSeek 专有的 `reasoning_content`）。 */
interface ChatDelta {
    content?: string | null
    reasoning_content?: string | null
    tool_calls?: ChatToolCallDelta[]
}

/** 用户轮的多模态内容分片（图片 + 文本）。 */
type ChatCompletionContentPart = { type: "image_url"; image_url: { url: string } } | { type: "text"; text: string }

/**
 * @description 把协议中立的对话消息序列化成 Chat Completions 的 messages。
 * @param messages 协议中立的对话消息
 * @returns OpenAI 兼容格式的消息数组
 */
function serializeChatMessages(messages: readonly AgentWireMessage[]): ChatCompletionMessageParam[] {
    const result: ChatCompletionMessageParam[] = []

    for (const message of messages) {
        if (message.role === "assistant") {
            const calls = message.toolCalls

            if (!message.text && !calls.length) {
                continue
            }

            result.push({
                role: "assistant",
                // 只发起工具调用而没有正文时 content 必须是 null：
                // 部分上游只在 content 为 null 时才把它识别成函数调用消息
                content: message.text || (calls.length ? null : ""),
                ...(calls.length
                    ? {
                          tool_calls: calls.map(call => ({
                              id: call.id,
                              type: "function" as const,
                              function: { name: call.name, arguments: call.arguments },
                          })),
                      }
                    : {}),
            })

            continue
        }

        for (const item of message.toolResults ?? []) {
            result.push({ role: "tool", tool_call_id: item.toolCallId, content: item.content })
        }

        // 没有图片时保持纯文本 content：多数网关对字符串 content 的兼容性最好，
        // 只有真的带图才退化成内容分片数组
        if (!message.images?.length) {
            if (message.text) {
                result.push({ role: "user", content: message.text })
            }

            continue
        }

        const parts: ChatCompletionContentPart[] = message.images.map(image => ({
            type: "image_url",
            image_url: { url: `data:${image.mimeType};base64,${image.data}` },
        }))

        if (message.text) {
            parts.push({ type: "text", text: message.text })
        }

        result.push({ role: "user", content: parts })
    }

    return result
}

/**
 * @description 合并流式下发的工具名分片。
 * 部分网关一次性给出完整名称，部分拆成多片，这里按前缀关系合并避免重复拼接。
 * @param current 已累积的名称
 * @param incoming 本次分片
 * @returns 合并后的名称
 */
function mergeToolName(current: string, incoming: string): string {
    if (!current) {
        return incoming
    }

    if (!incoming || incoming === current || current.endsWith(incoming)) {
        return current
    }

    if (incoming.startsWith(current)) {
        return incoming
    }

    if (current.startsWith(incoming)) {
        return current
    }

    return current + incoming
}

/**
 * @description 把 OpenAI 的 `finish_reason` 归一化成中立的收流原因。
 * @param raw 上游 finish_reason
 * @returns 归一化后的收流原因
 */
function normalizeFinishReason(raw: string | null | undefined): AgentFinishReason {
    switch (raw) {
        case "stop":
            return "stop"
        case "tool_calls":
        case "function_call":
            return "tool_calls"
        case "length":
            return "length"
        default:
            return null
    }
}

/**
 * @description 创建 Chat Completions 协议传输。
 *
 * 重试交给 SDK 自身的 `maxRetries`（与改动前一致），因此这里不再自行退避。
 * @param options 上游连接参数
 * @returns 传输实现
 */
export function createChatTransport(options: AgentTransportOptions): AgentTransport {
    const client = new OpenAI({
        apiKey: options.apiKey || "missing-api-key",
        baseURL: options.baseUrl,
        timeout: options.timeout,
        maxRetries: options.maxRetries,
        dangerouslyAllowBrowser: true,
    })

    /**
     * @description 读取一次流式响应并汇总本轮结果。
     * @param request 单轮请求
     * @param handlers 流式增量回调
     * @param isInterrupted 中断判据
     * @returns 本轮汇总
     */
    async function readStream(
        request: AgentRoundRequest,
        handlers: AgentStreamHandlers,
        isInterrupted: () => boolean
    ): Promise<AgentRoundResult> {
        const slots = new Map<number, { id: string; name: string; args: string }>()

        let text = ""
        let thinking = ""
        let finishReason: AgentFinishReason = null

        const stream = await client.chat.completions.create({
            model: request.model,
            messages: [{ role: "system", content: request.system }, ...serializeChatMessages(request.messages)],
            temperature: request.temperature,
            max_tokens: request.maxTokens,
            stream: true,
            ...(request.tools?.length
                ? {
                      tools: request.tools.map(tool => ({
                          type: "function" as const,
                          function: { name: tool.name, description: tool.description, parameters: tool.parameters },
                      })),
                  }
                : {}),
        })

        for await (const chunk of stream) {
            if (isInterrupted()) {
                break
            }

            const choice = chunk.choices[0]
            const delta = choice?.delta as ChatDelta | undefined

            if (choice?.finish_reason) {
                finishReason = normalizeFinishReason(choice.finish_reason)
            }

            if (delta?.reasoning_content) {
                thinking += delta.reasoning_content
                handlers.onThinking?.(delta.reasoning_content)
            }

            if (delta?.content) {
                text += delta.content
                handlers.onText?.(delta.content)
            }

            for (const piece of delta?.tool_calls ?? []) {
                const index = piece.index ?? 0
                const slot = slots.get(index) ?? { id: "", name: "", args: "" }

                if (piece.id) {
                    slot.id = piece.id
                }

                if (piece.function?.name) {
                    slot.name = mergeToolName(slot.name, piece.function.name)
                }

                if (piece.function?.arguments) {
                    slot.args += piece.function.arguments
                }

                slots.set(index, slot)
            }
        }

        const toolCalls: AgentToolCall[] = [...slots.entries()]
            .sort(([left], [right]) => left - right)
            .map(([, slot]) => slot)
            .filter(slot => slot.name)
            .map(slot => ({
                id: slot.id || `call_${slot.name}_${Date.now()}`,
                name: slot.name,
                arguments: slot.args || "{}",
            }))

        return { text, thinking, toolCalls, finishReason }
    }

    return {
        protocol: "chat",

        async runRound(request: AgentRoundRequest): Promise<AgentRoundResult> {
            if (!options.apiKey) {
                throw new Error("缺少 API Key")
            }

            return readStream(request, request.handlers ?? {}, request.isInterrupted ?? (() => false))
        },
    }
}
