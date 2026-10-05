/**
 * 上下文压缩：把过长的对话历史浓缩成一份结构化摘要，接续对话。
 *
 * 触发口径与压缩形态对齐 ZCode 的 compact 模块：
 * - 阈值是「绝对 tokens」：窗口 − 输出预留 − 安全缓冲，而不是窗口的固定百分比；
 * - 历史按「助手轮开始的分组」切轮，压缩时**原样保留最近一轮**（工具调用与结果成对保留，
 *   不会出现孤儿 tool_result），其余部分整体交给模型生成摘要；
 * - 摘要请求与普通请求同一形态（工具声明全程在场、思考开启）：DeepSeek 的 Messages 入口
 *   在「不声明工具 + 开思考」时会往正文里吐 DSML 标记，摘要请求不能走「零工具」的捷径。
 *
 * 压缩分两个层级使用：
 * - 跨轮压缩：会话历史在两次提问之间超出阈值，由组合式函数调用并落库压缩边界；
 * - 运行内压缩：主循环多轮工具调用期间上下文膨胀，内核就地压缩 `state.messages`（不落库）。
 *   两层共用 {@link compactWireMessages}。
 */

import { estimateMessagesTokens } from "./context-usage"
import type { AgentRoundResult, AgentToolDefinition, AgentTransport, AgentWireMessage } from "./wire"

/** 自动压缩的输出预留（tokens）：与输出上限取较小值，保证阈值触发后仍有一轮完整的作答空间 */
export const AUTOCOMPACT_OUTPUT_RESERVE_TOKENS = 21_000

/** 自动压缩的安全缓冲（tokens）：阈值再往下让一让，吸收估算误差 */
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000

/** 摘要生成的输出上限（tokens）：摘要远短于原历史，不需要整份输出预算 */
export const COMPACT_SUMMARY_MAX_OUTPUT_TOKENS = 8_192

/** 触发压缩所需的最少助手轮数：少于这个量级时摘要换不回多少空间，不值得一次额外请求 */
export const MIN_ROUNDS_FOR_COMPACT = 2

/** 输出上限缺省时的兜底值（与 config 的 DEFAULT_AGENT_UPSTREAM 一致） */
const DEFAULT_MAX_OUTPUT_TOKENS = 32_768

/**
 * @description 计算自动压缩阈值：窗口 − 输出预留 − 安全缓冲。
 * @param contextWindow 模型上下文窗口（tokens）
 * @param maxOutputTokens 请求的输出上限（tokens）
 * @returns 触发阈值（tokens）
 */
export function resolveAutoCompactThreshold(contextWindow: number, maxOutputTokens: number): number {
    const outputCap = maxOutputTokens > 0 ? maxOutputTokens : DEFAULT_MAX_OUTPUT_TOKENS
    const reserve = Math.min(outputCap, AUTOCOMPACT_OUTPUT_RESERVE_TOKENS)

    return Math.max(0, contextWindow - reserve - AUTOCOMPACT_BUFFER_TOKENS)
}

/**
 * @description 把消息序列切成「轮」：每条助手消息开启新的一轮，首轮可能以用户消息开头。
 * @param messages 协议中立的对话消息
 * @returns 每一轮的起始下标（首项恒为 0）
 */
export function groupRoundStartIndexes(messages: readonly AgentWireMessage[]): number[] {
    const starts = [0]

    for (let index = 1; index < messages.length; index++) {
        if (messages[index].role === "assistant") {
            starts.push(index)
        }
    }

    return starts
}

/**
 * 交给模型的压缩指令：要求输出 `<analysis>` + `<summary>` 两段，按固定小节组织，
 * 宁多勿少——摘要会完全替代被压缩的历史，漏掉的细节找不回来。
 */
const COMPACT_PROMPT = `以上是即将被压缩的对话历史。请把这段历史完整浓缩成一份结构化摘要，后续对话将只能看到这份摘要，看不到原始消息。

输出要求：
- 先用 <analysis> 标签输出简要分析，再用 <summary> 标签输出摘要正文；除此之外不要输出任何内容。
- 不要调用任何工具。
- 摘要用 Markdown 分节，依次包含：
  1. 任务与意图：用户的核心诉求、明确给出的约束与偏好
  2. 关键概念：涉及的游戏机制、数值口径、专有名词及其含义
  3. 数据与结论：已查明的重要数据、计算结果、代码或配置片段（保留关键数值）
  4. 错误与修复：出现过的问题、原因与解决办法
  5. 待办与进度：哪些已完成、哪些尚未完成
  6. 用户消息全集：按顺序逐条列出用户发言的要点，尽量保留原措辞
  7. 当前工作与下一步：对话最近在做什么、接下来合理的行动
- 宁多勿少：遗漏的细节无法从其它途径找回。`

/**
 * @description 整理模型返回的摘要文本：剥掉 `<analysis>` 段，优先取 `<summary>` 标签内文。
 * @param raw 模型原始输出
 * @returns 可直接使用的摘要正文
 */
export function formatCompactSummary(raw: string): string {
    const text = raw.trim()

    if (!text) {
        return ""
    }

    const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/i)

    if (summaryMatch) {
        return summaryMatch[1].trim()
    }

    // 没有 summary 标签时剥掉分析段，剩余部分当摘要（模型不守格式时的兜底）
    return text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, "").trim()
}

/** 摘要正文的包裹文案：说明这段消息的来历，模型据此接续对话 */
const COMPACTED_MESSAGE_PREFIX = "本对话由更早的历史压缩延续而来，此前消息已并入下方摘要；最近几轮对话原样保留在本摘要之后。"

/** 摘要正文的收尾说明 */
const COMPACTED_MESSAGE_SUFFIX = "如需更早的具体细节（原始数据、报错原文等），请让用户直接翻阅聊天记录。"

/**
 * @description 把摘要正文包成回灌给模型的消息文本（跨轮压缩时也是落库的边界消息内容）。
 * @param summary 摘要正文
 * @returns 完整消息文本
 */
export function buildCompactedMessageText(summary: string): string {
    return `${COMPACTED_MESSAGE_PREFIX}\n\n<summary>\n${summary}\n</summary>\n\n${COMPACTED_MESSAGE_SUFFIX}`
}

/** 一次压缩的结果 */
export interface AgentCompactionOutcome {
    /** 包好包裹文案的摘要全文（回灌给模型 / 落库为边界消息的内容） */
    compactedText: string
    /** 压缩前的上下文估算（tokens，仅消息部分） */
    preTokens: number
    /** 压缩后的上下文估算（tokens，含原样保留的尾部） */
    postTokens: number
    /** 被摘要替代的消息条数 */
    summarizedCount: number
    /** 原样保留的消息条数 */
    keptCount: number
    /** 压缩后的完整消息序列（运行内压缩直接用它替换现场） */
    messages: AgentWireMessage[]
}

/** 执行一次压缩所需的装配 */
export interface WireCompactionInput {
    /** 传输实现（摘要由同一上游生成） */
    transport: AgentTransport
    /** 模型 id */
    model: string
    /** 系统提示词（给摘要器领域上下文） */
    system: string
    /**
     * 工具定义：**必须声明**（DeepSeek 的 Messages 入口在零工具 + 思考时会吐 DSML 标记），
     * 摘要指令里明确禁止调用。
     */
    tools: readonly AgentToolDefinition[]
    /** 采样温度 */
    temperature: number
    /** 摘要生成的输出上限（tokens） */
    maxTokens: number
    /** 待压缩的完整消息序列 */
    messages: readonly AgentWireMessage[]
    /** 显式会话 id（走自家代理时随请求头，日志按它归会话） */
    sessionId?: string
}

/** 摘要请求失败时逐级多保留的轮数序列：每次重试都把更多近轮挪出摘要范围 */
const RETRY_KEEP_ROUND_STEPS = [1, 2, 4, 8]

/**
 * @description 执行一次上下文压缩。
 *
 * 消息不足两轮、或除尾部保留轮外没有可摘要的内容时返回 null（无需压缩）；
 * 摘要请求失败（含模型不守格式只吐工具调用）时逐级多保留近轮重试，全部失败后抛出最后一个错误。
 * @param input 压缩装配
 * @returns 压缩结果；无需压缩时 null
 * @throws 摘要请求最终失败时抛出
 */
export async function compactWireMessages(input: WireCompactionInput): Promise<AgentCompactionOutcome | null> {
    const starts = groupRoundStartIndexes(input.messages)
    /** 助手轮数：首轮可能以用户消息开头，不计入 */
    const assistantRounds = Math.max(0, starts.length - (input.messages[0]?.role === "assistant" ? 0 : 1))

    if (assistantRounds < MIN_ROUNDS_FOR_COMPACT) {
        return null
    }

    let lastError: Error | null = null

    for (const keepRounds of RETRY_KEEP_ROUND_STEPS) {
        /** 原样保留的轮数（不超过总轮数，且至少给摘要留一轮） */
        const kept = Math.min(keepRounds, starts.length - 1)
        // 保留最后 kept 个完整轮（助手轮 + 其后的工具结果），其余交给摘要
        const summarizeFrom = starts[starts.length - kept] ?? 0
        const summarized = input.messages.slice(0, summarizeFrom)
        const keptMessages = input.messages.slice(summarizeFrom)

        if (!summarized.length) {
            return null
        }

        try {
            const summary = await requestCompactionSummary(input, summarized)
            const compactedText = buildCompactedMessageText(summary)
            const compactedMessages: AgentWireMessage[] = [{ role: "user", text: compactedText }, ...keptMessages]

            return {
                compactedText,
                preTokens: estimateMessagesTokens(input.messages),
                postTokens: estimateMessagesTokens(compactedMessages),
                summarizedCount: summarized.length,
                keptCount: keptMessages.length,
                messages: compactedMessages,
            }
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))
        }
    }

    throw lastError ?? new Error("上下文压缩失败")
}

/**
 * @description 就一批消息请求摘要正文。
 * @param input 压缩装配
 * @param summarized 待摘要的消息
 * @returns 整理后的摘要正文
 */
async function requestCompactionSummary(input: WireCompactionInput, summarized: readonly AgentWireMessage[]): Promise<string> {
    const result: AgentRoundResult = await input.transport.runRound({
        model: input.model,
        system: input.system,
        messages: [...summarized, { role: "user", text: COMPACT_PROMPT }],
        // 工具声明在场是防 DSML 泄露的前提，摘要指令负责禁止实际调用
        tools: input.tools,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    })

    const summary = formatCompactSummary(result.text)

    if (!summary) {
        // 模型没给正文（常见于抢着调工具）：按失败处理，交给重试梯子
        throw new Error("模型未返回摘要文本")
    }

    return summary
}
