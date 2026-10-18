import type { AiLogMessage, AiLogToolCall, AiLogTurnRecord } from "@/api/aiLog"
import type { AgentChatMessage, AgentChatToolTrace } from "@/utils/agent-chat"
import { formatCost, formatCount, formatDuration } from "@/utils/ai-log-format"

/**
 * AI 日志轮次记录 → 前端对话流消息的转换（供后台会话回放弹窗复用 `AgentChatMessages`）。
 *
 * 日志每轮的 request 是发给上游的完整消息历史，直接平铺会大量重复：
 * - system 提示词每轮都在且非对话内容，丢弃；
 * - 历史轮次的 user / assistant / tool 消息与已展示的轮次重复，只取每轮的**最后一条 user 消息**；
 * - tool 消息按 `tool_call_id` 配对成上一轮回复里的工具结果，跟着工具调用一起展示。
 *
 * 兼容两种线上格式：OpenAI 兼容格式（独立的 `role:"tool"` 消息）与
 * Anthropic Messages 格式（工具结果是 user 消息 content 里的 `tool_result` 块——
 * 不识别的话整块 JSON 会被当成用户提问渲染出来）。
 */

/** 结果摘要的最大长度（与前端 trace 行的摘要口径一致）。 */
const SUMMARY_CHARS = 80

/** 日志消息 content 里的单个分块（Anthropic Messages 与多模态数组的块结构）。 */
interface WireContentBlock {
    type?: string
    text?: string
    tool_use_id?: string
    content?: unknown
}

/**
 * @description 解析模型生成的工具参数 JSON；解析失败时保留原文，避免信息凭空丢失。
 * @param raw 参数原文。
 * @returns 参数对象。
 */
function parseToolArgs(raw: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(raw || "{}")
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : { raw: parsed }
    } catch {
        return { raw }
    }
}

/**
 * @description 抽取 content 的对话文本（兼容字符串与分块数组）。
 *
 * `tool_result` 块不是对话文本（结果原文归并到工具调用上），这里跳过；
 * 跳过之后整条消息一个字都不剩时，调用方就知道它只是工具结果的载体。
 * @param content 消息 content 字段。
 * @returns 纯文本。
 */
function extractTextContent(content: unknown): string {
    if (typeof content === "string") return content
    if (content === null || content === undefined) return ""
    if (!Array.isArray(content)) return String(content)

    return content
        .map(part => {
            if (typeof part === "string") return part
            const block = part as WireContentBlock | null
            if (typeof block?.text === "string") return block.text
            if (block?.type === "image_url" || block?.type === "image") return "[图片]"
            if (block?.type === "tool_result") return ""
            return JSON.stringify(part)
        })
        .filter(Boolean)
        .join("\n")
}

/**
 * @description 从 content 分块里抽工具结果块（Anthropic Messages 格式）。
 * @param content 消息 content 字段。
 * @returns 调用 id → 结果原文 的条目列表。
 */
function extractToolResultBlocks(content: unknown): Array<{ id: string; result: string }> {
    if (!Array.isArray(content)) return []

    return content.flatMap(part => {
        const block = part as WireContentBlock | null
        if (block?.type !== "tool_result" || typeof block.tool_use_id !== "string") {
            return []
        }

        // 结果正文可能在 content 字段：字符串或「文本块数组」，与消息 content 同构
        return [{ id: block.tool_use_id, result: extractTextContent(block.content) }]
    })
}

/**
 * @description 取结果的首行作为摘要（过长截断），与前端工具行的展示粒度一致。
 * @param result 结果原文。
 * @returns 摘要文本；空结果返回空字符串。
 */
function summarizeResult(result: string): string {
    const line = result
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean)
        .at(-1)

    if (!line) return ""
    return line.length > SUMMARY_CHARS ? `${line.slice(0, SUMMARY_CHARS)}…` : line
}

/**
 * @description 收集全部轮次请求里的工具结果，按 `tool_call_id` 索引。
 *
 * 工具结果出现在**发起调用的下一轮**请求里，调用 id 全程唯一，
 * 因此全量扫描取首次出现即可，不必关心轮次边界。
 * 两种格式的载体都收：OpenAI 兼容格式的独立 `role:"tool"` 消息，
 * 以及 Anthropic Messages 格式挂在 user 消息 content 里的 `tool_result` 块。
 * @param turns 全部轮次记录。
 * @returns 调用 id → 结果原文。
 */
function collectToolResults(turns: AiLogTurnRecord[]): Map<string, string> {
    const results = new Map<string, string>()

    for (const turn of turns) {
        for (const message of turn.request.messages) {
            if (message.role === "tool" && typeof message.tool_call_id === "string") {
                if (!results.has(message.tool_call_id)) {
                    results.set(message.tool_call_id, extractTextContent(message.content))
                }
                continue
            }

            for (const entry of extractToolResultBlocks(message.content)) {
                if (!results.has(entry.id)) {
                    results.set(entry.id, entry.result)
                }
            }
        }
    }

    return results
}

/**
 * @description 把一轮回复里的工具调用转换成前端 trace（带配对到的结果原文）。
 * @param toolCalls 该轮回复的工具调用。
 * @param toolResults 全量工具结果索引。
 * @returns 前端工具调用记录列表。
 */
function toToolTraces(toolCalls: AiLogToolCall[], toolResults: Map<string, string>): AgentChatToolTrace[] {
    return toolCalls.map((call, index) => {
        const id = call.id || `call-${index}`
        const result = toolResults.get(id) || ""

        return {
            id,
            name: call.name || "unknown",
            label: call.name || "unknown",
            args: parseToolArgs(call.arguments),
            summary: summarizeResult(result),
            status: "done",
            result,
        }
    })
}

/**
 * @description 取一轮请求里的最后一条 user 消息（触发本轮的那条提问）。
 *
 * Anthropic 格式下工具结果也挂在 user 消息上——剥掉 `tool_result` 块后
 * 一个字都不剩的「user 消息」只是结果载体，继续往前找真正的提问。
 * @param messages 请求消息列表。
 * @returns 纯文本内容；没有 user 消息时返回 null。
 */
function lastUserContent(messages: AiLogMessage[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role !== "user") continue

        const text = extractTextContent(messages[i].content).trim()
        if (text) {
            return text
        }
    }
    return null
}

/**
 * @description 拼一条回复下方的元信息小字（token 数 / 费用 / 耗时，失败时带错误摘要）。
 * @param turn 轮次记录。
 * @returns 元信息文本；无任何可展示项时为 undefined。
 */
function metaNoteOf(turn: AiLogTurnRecord): string | undefined {
    const parts: string[] = []

    if (turn.error) {
        parts.push(`失败 [${turn.error.code}] ${turn.error.message}`)
    }
    if (turn.usage) {
        parts.push(`输入 ${formatCount(turn.usage.prompt)} / 输出 ${formatCount(turn.usage.completion)}`)
    }
    parts.push(formatCost(turn.costMicros), formatDuration(turn.durationMs))
    if (turn.upstreamTraceId) {
        parts.push(`trace ${turn.upstreamTraceId.slice(0, 10)}…`)
    }

    return parts.filter(Boolean).join(" · ")
}

/**
 * @description 把会话的全部轮次记录转换成前端对话流消息列表。
 *
 * 每轮产出「一条 user 提问 + 一条 assistant 回复」；回复的思维链、工具调用
 * （含结果原文）由 `AgentChatMessages` 的过程折叠逻辑渲染。
 * 连续重复的最后一条 user 消息（失败重试等场景）只展示一次。
 * @param turns 轮次记录（时间正序）。
 * @returns 可直接交给 `AgentChatMessages` 渲染的消息列表。
 */
export function turnsToChatMessages(turns: AiLogTurnRecord[]): AgentChatMessage[] {
    const toolResults = collectToolResults(turns)
    const messages: AgentChatMessage[] = []
    let nextId = 1
    let lastUser: string | null = null

    for (const turn of turns) {
        const time = Date.parse(turn.time) || 0

        const userContent = lastUserContent(turn.request.messages)
        if (userContent && userContent !== lastUser) {
            lastUser = userContent
            messages.push({ id: nextId++, role: "user", content: userContent, createdAt: time })
        }

        const reply = turn.response.message
        const toolTraces = toToolTraces(reply?.toolCalls || [], toolResults)
        const reasoning = reply?.reasoningContent || ""

        messages.push({
            id: nextId++,
            role: "assistant",
            content: reply?.content || "",
            toolTraces: toolTraces.length ? toolTraces : undefined,
            // 思维链整段视为一个分段，其后跟随本轮全部工具调用（与前端真实执行流一致）
            reasonings: reasoning ? [{ text: reasoning, toolCallIds: toolTraces.map(trace => trace.id) }] : undefined,
            processMs: turn.durationMs,
            metaNote: metaNoteOf(turn),
            createdAt: time + (turn.durationMs || 0),
        })
    }

    return messages
}
