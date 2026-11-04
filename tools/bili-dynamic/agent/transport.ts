/**
 * @file Chat Completions 传输：把协议中立的轮次请求发到 DeepSeek 兼容接口。
 * 工具调用参数在线上是 JSON 字符串分片，这里负责拼装与归一化。
 */

import { ConfigError } from "../errors.ts"
import type {
    AgentFinishReason,
    AgentRoundRequest,
    AgentRoundResult,
    AgentToolCall,
    AgentToolDefinition,
    AgentTransport,
    AgentWireMessage,
} from "./wire.ts"

interface WireToolCall {
    id?: string
    function?: { name?: string; arguments?: string }
}

interface WireMessage {
    role: string
    content?: string | null
    tool_calls?: WireToolCall[]
    tool_call_id?: string
}

interface ChatPayload {
    model?: string
    choices?: Array<{ message?: { content?: string | null; tool_calls?: WireToolCall[] }; finish_reason?: string }>
    usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        prompt_cache_hit_tokens?: number
        prompt_tokens_details?: { cached_tokens?: number }
    }
}

function toolsToWire(tools: readonly AgentToolDefinition[]) {
    return tools.map(tool => ({
        type: "function" as const,
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }))
}

function messagesToWire(messages: readonly AgentWireMessage[], system: string): WireMessage[] {
    const wire: WireMessage[] = [{ role: "system", content: system }]
    for (const message of messages) {
        if (message.role === "assistant") {
            wire.push({
                role: "assistant",
                content: message.text || null,
                ...(message.toolCalls.length
                    ? {
                          tool_calls: message.toolCalls.map(call => ({
                              id: call.id,
                              type: "function",
                              function: { name: call.name, arguments: call.arguments },
                          })),
                      }
                    : {}),
            })
            continue
        }
        // 工具结果与用户正文可能同属一条 user 轮，拆成多条以符合 Chat 协议
        if (message.text) wire.push({ role: "user", content: message.text })
        for (const result of message.toolResults ?? []) {
            wire.push({ role: "tool", tool_call_id: result.toolCallId, content: result.content })
        }
    }
    return wire
}

function normalizeFinishReason(value: string | undefined, hasToolCalls: boolean): AgentFinishReason {
    if (hasToolCalls || value === "tool_calls") return "tool_calls"
    if (value === "length") return "length"
    if (value === "stop" || value === "end_turn") return "stop"
    return null
}

export function createChatTransport(options: { apiKey: string; baseUrl: string; timeoutMs?: number }): AgentTransport {
    const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`
    const timeoutMs = options.timeoutMs ?? 180_000

    return {
        async runRound(request: AgentRoundRequest): Promise<AgentRoundResult> {
            let response: Response
            try {
                response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
                    body: JSON.stringify({
                        model: request.model,
                        messages: messagesToWire(request.messages, request.system),
                        tools: toolsToWire(request.tools),
                        tool_choice: "auto",
                        temperature: request.temperature,
                        max_tokens: request.maxTokens,
                    }),
                    signal: AbortSignal.timeout(timeoutMs),
                })
            } catch (error) {
                throw new Error(`DeepSeek 请求失败：${error instanceof Error ? error.message : error}`)
            }

            if (!response.ok) {
                const detail = (await response.text()).slice(0, 300)
                if ([401, 403, 404].includes(response.status)) {
                    throw new ConfigError(`DeepSeek 配置无效（HTTP ${response.status}）：${detail}`)
                }
                throw new Error(`DeepSeek 接口 HTTP ${response.status}：${detail}`)
            }

            const payload = (await response.json()) as ChatPayload
            const message = payload.choices?.[0]?.message
            if (!message) throw new Error("DeepSeek 返回了空消息")

            const toolCalls: AgentToolCall[] = (message.tool_calls ?? []).map((call, index) => ({
                id: call.id ?? `call_${index}`,
                name: call.function?.name ?? "",
                arguments: call.function?.arguments ?? "{}",
            }))

            const usage = payload.usage
            return {
                text: message.content ?? "",
                toolCalls,
                finishReason: normalizeFinishReason(payload.choices?.[0]?.finish_reason, toolCalls.length > 0),
                ...(usage
                    ? {
                          usage: {
                              inputTokens: usage.prompt_tokens ?? 0,
                              outputTokens: usage.completion_tokens ?? 0,
                              cacheReadTokens: usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0,
                          },
                      }
                    : {}),
            }
        },
    }
}
