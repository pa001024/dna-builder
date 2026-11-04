/**
 * @file Agent 线协议中立层：工具定义、消息、单轮结果与用量。
 * 形态对齐 apps/web/src/api/agent/wire.ts，只保留卡片 agent 用得到的部分。
 */

export interface AgentToolDefinition {
    name: string
    description: string
    parameters: Record<string, unknown>
}

export interface AgentToolCall {
    id: string
    name: string
    /** 模型给出的原始 JSON 字符串 */
    arguments: string
}

export interface AgentToolResult {
    toolCallId: string
    content: string
    isError?: boolean
}

export type AgentWireMessage =
    | { role: "user"; text: string; toolResults?: AgentToolResult[] }
    | { role: "assistant"; text: string; toolCalls: AgentToolCall[] }

export type AgentFinishReason = "stop" | "tool_calls" | "length" | null

export interface AgentRoundUsage {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
}

export interface AgentRoundResult {
    text: string
    toolCalls: AgentToolCall[]
    finishReason: AgentFinishReason
    usage?: AgentRoundUsage
}

export interface AgentRoundRequest {
    model: string
    system: string
    messages: readonly AgentWireMessage[]
    tools: readonly AgentToolDefinition[]
    temperature: number
    maxTokens: number
}

export interface AgentTransport {
    runRound(request: AgentRoundRequest): Promise<AgentRoundResult>
}
