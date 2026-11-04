/**
 * @file 上下文用量估算与窗口解析。
 * 口径对齐 apps/web/src/api/agent/context-usage.ts：CJK 权重 2、其余 1，除以 3 向上取整。
 */

import type { AgentToolDefinition, AgentWireMessage } from "./wire.ts"

const TOKEN_CHAR_DIVISOR = 3
const CJK_WEIGHT = 2

/** 模型名 → 上下文窗口（首次命中生效），与 Web 端同一张表 */
const MODEL_CONTEXT_WINDOW_RULES: ReadonlyArray<readonly [RegExp, number]> = [
    [/deepseek-v4|deepseek-flash/, 1_000_000],
    [/deepseek/, 131_072],
    [/claude/, 200_000],
    [/gpt-5|gpt-4\.1/, 400_000],
    [/gpt|qwen|glm/, 131_072],
]

export const DEFAULT_MODEL_CONTEXT_WINDOW = 131_072

export function resolveModelContextWindow(model: string): number {
    const id = model.toLowerCase()
    for (const [pattern, window] of MODEL_CONTEXT_WINDOW_RULES) {
        if (pattern.test(id)) return window
    }
    return DEFAULT_MODEL_CONTEXT_WINDOW
}

export function estimateTextTokens(text: string): number {
    if (!text) return 0
    const cjk = (text.match(/[一-鿿]/g) ?? []).length
    return Math.ceil((cjk * CJK_WEIGHT + (text.length - cjk)) / TOKEN_CHAR_DIVISOR)
}

function estimateJsonTokens(value: unknown): number {
    return estimateTextTokens(JSON.stringify(value ?? "") ?? "")
}

export function estimateMessageTokens(message: AgentWireMessage): number {
    if (message.role === "assistant") {
        return estimateJsonTokens({ role: "assistant", text: message.text, toolCalls: message.toolCalls })
    }
    return estimateJsonTokens({ role: "user", text: message.text, toolResults: message.toolResults ?? [] })
}

export function estimateMessagesTokens(messages: readonly AgentWireMessage[]): number {
    return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0)
}

export function estimateToolTokens(tools: readonly AgentToolDefinition[]): number {
    return tools.reduce((sum, tool) => sum + estimateJsonTokens(tool), 0)
}
