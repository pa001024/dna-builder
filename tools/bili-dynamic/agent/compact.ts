/**
 * @file 上下文压缩：历史过长时用一次摘要请求替换旧消息，最近一轮原样保留。
 * 口径对齐 apps/web/src/api/agent/compact.ts（绝对阈值 + 按助手轮切分 + 失败逐级多保留近轮重试）。
 */

import { estimateMessagesTokens } from "./context.ts"
import type { AgentRoundRequest, AgentRoundResult, AgentRoundUsage, AgentToolDefinition, AgentTransport, AgentWireMessage } from "./wire.ts"

/** 输出预留：阈值触发后仍要留出一轮完整作答空间 */
export const AUTOCOMPACT_OUTPUT_RESERVE_TOKENS = 21_000
/** 安全缓冲：吸收估算误差 */
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000
export const COMPACT_SUMMARY_MAX_OUTPUT_TOKENS = 4_096
export const MIN_ROUNDS_FOR_COMPACT = 2

const DEFAULT_MAX_OUTPUT_TOKENS = 32_768
const RETRY_KEEP_ROUND_STEPS = [1, 2, 4]

export function resolveAutoCompactThreshold(contextWindow: number, maxOutputTokens: number): number {
    const outputCap = maxOutputTokens > 0 ? maxOutputTokens : DEFAULT_MAX_OUTPUT_TOKENS
    const reserve = Math.min(outputCap, AUTOCOMPACT_OUTPUT_RESERVE_TOKENS)
    return Math.max(0, contextWindow - reserve - AUTOCOMPACT_BUFFER_TOKENS)
}

/** 每条助手消息开启新的一轮 */
export function groupRoundStartIndexes(messages: readonly AgentWireMessage[]): number[] {
    const starts = [0]
    for (let index = 1; index < messages.length; index++) {
        if (messages[index].role === "assistant") starts.push(index)
    }
    return starts
}

const COMPACT_PROMPT = `以上是即将被压缩的对话历史。请把它浓缩成一份结构化摘要，后续只能看到这份摘要。
不要调用任何工具。用 Markdown 分节：
1. 任务与意图：这次要产出什么
2. 已确认的事实：读过的文件、确认过的实现、关键数据
3. 已完成与未完成：已经生成的产物、还差什么
4. 下一步：接下来最合理的动作
宁多勿少，遗漏的细节找不回来。`

export function formatCompactSummary(raw: string): string {
    const text = raw.trim()
    if (!text) return ""
    const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/i)
    if (summaryMatch) return summaryMatch[1].trim()
    return text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, "").trim()
}

const COMPACTED_PREFIX = "本任务由更早的历史压缩延续而来，此前消息已并入下方摘要；最近几轮原样保留在摘要之后。"
const COMPACTED_SUFFIX = "如需更早的具体细节（读过的文件原文、搜索结果等），可以重新调用工具获取。"

export function buildCompactedMessageText(summary: string): string {
    return `${COMPACTED_PREFIX}\n\n<summary>\n${summary}\n</summary>\n\n${COMPACTED_SUFFIX}`
}

export interface CompactionOutcome {
    compactedText: string
    preTokens: number
    postTokens: number
    summarizedCount: number
    keptCount: number
    messages: AgentWireMessage[]
    usages: AgentRoundUsage[]
}

export interface CompactionInput {
    transport: AgentTransport
    model: string
    system: string
    tools: readonly AgentToolDefinition[]
    temperature: number
    messages: readonly AgentWireMessage[]
}

export async function compactWireMessages(input: CompactionInput): Promise<CompactionOutcome | null> {
    const starts = groupRoundStartIndexes(input.messages)
    const assistantRounds = Math.max(0, starts.length - (input.messages[0]?.role === "assistant" ? 0 : 1))
    if (assistantRounds < MIN_ROUNDS_FOR_COMPACT) return null

    let lastError: Error | null = null
    const usages: AgentRoundUsage[] = []

    for (const keepRounds of RETRY_KEEP_ROUND_STEPS) {
        const kept = Math.min(keepRounds, starts.length - 1)
        const summarizeFrom = starts[starts.length - kept] ?? 0
        const summarized = input.messages.slice(0, summarizeFrom)
        const keptMessages = input.messages.slice(summarizeFrom)
        if (!summarized.length) return null

        try {
            const request: AgentRoundRequest = {
                model: input.model,
                system: input.system,
                messages: [...summarized, { role: "user", text: COMPACT_PROMPT }],
                tools: input.tools,
                temperature: input.temperature,
                maxTokens: COMPACT_SUMMARY_MAX_OUTPUT_TOKENS,
            }
            const result: AgentRoundResult = await input.transport.runRound(request)
            if (result.usage) usages.push(result.usage)
            const summary = formatCompactSummary(result.text)
            if (!summary) throw new Error("模型未返回摘要文本")

            const compactedText = buildCompactedMessageText(summary)
            const compactedMessages: AgentWireMessage[] = [{ role: "user", text: compactedText }, ...keptMessages]
            return {
                compactedText,
                preTokens: estimateMessagesTokens(input.messages),
                postTokens: estimateMessagesTokens(compactedMessages),
                summarizedCount: summarized.length,
                keptCount: keptMessages.length,
                messages: compactedMessages,
                usages,
            }
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))
        }
    }

    throw new Error(`上下文压缩失败：${lastError?.message ?? "未知原因"}`)
}
