/**
 * @file 卡片 agent 主循环。形态对齐 apps/web/src/api/agent/kernel.ts：
 * 工具声明全程在场、轮次预算、输出上限续写、上下文自适应压缩、并发调度。
 */

import { COMPACT_SUMMARY_MAX_OUTPUT_TOKENS, compactWireMessages, resolveAutoCompactThreshold } from "./compact.ts"
import { estimateMessagesTokens, estimateTextTokens, estimateToolTokens, resolveModelContextWindow } from "./context.ts"
import { type AgentTool, type AgentToolOutput, readToolText, scheduleToolCalls } from "./tool.ts"
import type { AgentRoundUsage, AgentToolCall, AgentToolDefinition, AgentTransport, AgentWireMessage } from "./wire.ts"

/** 工具轮次上限：够读完关键实现，又不至于无限检索 */
export const MAX_TOOL_ROUNDS = 30
/** 输出上限后的自动续写次数 */
export const MAX_CONTINUATIONS = 3
/** 单轮输出上限：整页 HTML 常达数千 token，给足预算避免 JSON 被截断 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 16_000
/** 工具结果落进上下文前的截断长度，避免一次大文件撑爆窗口 */
const MAX_TOOL_RESULT_CHARS = 12_000
/** 预算耗尽后要求收尾的提示 */
const FINAL_ANSWER_PROMPT = "工具轮次已用尽。请基于已经掌握的信息直接调用 finish 提交结果，不要再调用其他工具。"
const CONTINUATION_PROMPT = "上一条回复因长度上限被截断。请紧接着未完成处继续，不要重复已输出的内容。"
/** finish 参数无效时允许重发的次数 */
const MAX_FINISH_RETRIES = 2
const RESUBMIT_FINISH_PROMPT =
    "finish 的 arguments 不是合法 JSON（通常是输出被截断）。请重新调用 finish，并让 html 更精简（例如减少重复样式、合并选择器），确保完整闭合。"

export interface CardAgentOptions {
    name: string
    transport: AgentTransport
    model: string
    tools: AgentTool[]
    systemPrompt: string
    /** 技能清单等前缀内容，作为置于最前的 user 消息下发 */
    metaUserPrefix?: string
    maxToolRounds?: number
    maxContinuations?: number
    maxOutputTokens?: number
    contextWindow?: number
    temperature?: number
    maxToolConcurrency?: number
    onLog?: (line: string) => void
    onUsage?: (usage: AgentRoundUsage) => void
}

export interface CardAgentResult {
    /** finish 工具提交的参数 */
    output: Record<string, unknown>
    /** 工具轮次 */
    rounds: number
    /** 累计真实用量 */
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number }
    /** 上下文压缩次数 */
    compactions: number
    /** 执行过的工具名序列（便于排查） */
    toolSequence: string[]
}

/** 模型未调用 finish 时的兜底提示 */
const MUST_FINISH_PROMPT = "请调用 finish 工具提交 html、body 与 title。"

export class CardAgent {
    private readonly options: CardAgentOptions
    private readonly tools: Map<string, AgentTool>
    private interrupted = false

    constructor(options: CardAgentOptions) {
        this.options = options
        this.tools = new Map(options.tools.map(tool => [tool.definition.name, tool]))
    }

    interrupt(): void {
        this.interrupted = true
    }

    private log(line: string): void {
        this.options.onLog?.(line)
    }

    private get toolDefinitions(): AgentToolDefinition[] {
        return this.options.tools.map(tool => tool.definition)
    }

    private get maxTokens(): number {
        return this.options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
    }

    private get contextWindow(): number {
        return this.options.contextWindow ?? resolveModelContextWindow(this.options.model)
    }

    /**
     * @description 跑完一次卡片生成：调研 → 生成 HTML → 提交 finish。
     * @param task 交给 agent 的任务描述
     * @returns finish 参数与运行统计
     */
    async run(task: string): Promise<CardAgentResult> {
        const messages: AgentWireMessage[] = [{ role: "user", text: this.buildTaskText(task) }]
        const toolSequence: string[] = []
        const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
        const maxToolRounds = this.options.maxToolRounds ?? MAX_TOOL_ROUNDS
        const maxContinuations = this.options.maxContinuations ?? MAX_CONTINUATIONS
        let rounds = 0
        let compactions = 0
        let continuations = 0
        let finishRetries = 0
        let budgetWarned = false

        while (true) {
            if (this.interrupted) throw new Error("agent 已被中断")
            rounds += 1

            await this.maybeCompact(messages, () => compactions++)

            const round = await this.options.transport.runRound({
                model: this.options.model,
                system: this.options.systemPrompt,
                messages,
                tools: this.toolDefinitions,
                temperature: this.options.temperature ?? 0.5,
                maxTokens: this.maxTokens,
            })

            if (round.usage) {
                usage.inputTokens += round.usage.inputTokens
                usage.outputTokens += round.usage.outputTokens
                usage.cacheReadTokens += round.usage.cacheReadTokens
                this.options.onUsage?.(round.usage)
            }

            const calls = round.toolCalls
            messages.push({ role: "assistant", text: round.text, toolCalls: calls })

            if (calls.length === 0) {
                if (round.finishReason === "length" && continuations < maxContinuations) {
                    continuations += 1
                    this.log(`  ! 输出触达上限，续写第 ${continuations} 次`)
                    messages.push({ role: "user", text: CONTINUATION_PROMPT })
                    continue
                }
                this.log(`  ! 模型未调用工具，提示收尾（第 ${rounds} 轮）`)
                messages.push({ role: "user", text: MUST_FINISH_PROMPT })
                if (rounds > maxToolRounds + maxContinuations) throw new Error("agent 多次被要求调用 finish 仍未提交")
                continue
            }

            const finishCall = calls.find(call => call.name === "finish")
            if (finishCall) {
                toolSequence.push("finish")
                try {
                    const output = parseFinishArguments(finishCall.arguments)
                    return { output, rounds, usage, compactions, toolSequence }
                } catch (error) {
                    // 参数被截断是常态：让模型自己精简后重发，而不是直接判定失败
                    finishRetries += 1
                    this.log(
                        `  ! finish 参数无效（${error instanceof Error ? error.message : error}），要求重发（${finishRetries}/${MAX_FINISH_RETRIES}）`
                    )
                    if (finishRetries > MAX_FINISH_RETRIES) throw error
                    messages.push({
                        role: "user",
                        text: "",
                        toolResults: calls.map(call => ({
                            toolCallId: call.id,
                            content: call.name === "finish" ? RESUBMIT_FINISH_PROMPT : "未执行：本次已提交 finish。",
                            isError: call.name === "finish",
                        })),
                    })
                    continue
                }
            }

            const overBudget = rounds > maxToolRounds
            if (overBudget && !budgetWarned) {
                budgetWarned = true
                this.log(`  ! 工具轮次预算已用尽（${maxToolRounds}），要求收尾`)
            }
            // 预算用尽后模型若仍反复调用非 finish 工具，这里必须硬停，否则会一直烧 token 到 CI 超时
            if (rounds > maxToolRounds + maxContinuations) throw new Error("agent 超出轮次预算仍未调用 finish")

            const results = await this.executeCalls(calls, rounds, overBudget, toolSequence)
            messages.push({ role: "user", text: "", toolResults: results })
        }
    }

    private buildTaskText(task: string): string {
        const meta = this.options.metaUserPrefix
        return meta ? `<system-reminder>\n${meta}\n</system-reminder>\n\n${task}` : task
    }

    /** 估算超阈值时就地压缩历史（保留最近一轮） */
    private async maybeCompact(messages: AgentWireMessage[], onCompacted: () => void): Promise<void> {
        const estimate =
            estimateMessagesTokens(messages) +
            estimateTextTokens(this.options.systemPrompt) +
            estimateTextTokens(this.options.metaUserPrefix ?? "") +
            estimateToolTokens(this.toolDefinitions)
        const threshold = resolveAutoCompactThreshold(this.contextWindow, this.maxTokens)
        if (estimate < threshold) return

        this.log(`  ~ 上下文约 ${estimate} tokens，超过阈值 ${threshold}，开始压缩`)
        const outcome = await compactWireMessages({
            transport: this.options.transport,
            model: this.options.model,
            system: this.options.systemPrompt,
            tools: this.toolDefinitions,
            temperature: this.options.temperature ?? 0.5,
            messages,
        })
        if (!outcome) return
        messages.length = 0
        messages.push(...outcome.messages)
        onCompacted()
        this.log(`  ~ 压缩完成：${outcome.preTokens} → ${outcome.postTokens} tokens，保留最近 ${outcome.keptCount} 条`)
    }

    /** 按并发调度执行工具；超预算时回灌错误让模型收尾 */
    private async executeCalls(
        calls: readonly AgentToolCall[],
        round: number,
        overBudget: boolean,
        toolSequence: string[]
    ): Promise<Array<{ toolCallId: string; content: string; isError?: boolean }>> {
        const results: Array<{ toolCallId: string; content: string; isError?: boolean }> = []
        const groups = overBudget ? calls.map(call => [call]) : scheduleToolCalls(calls, this.tools, this.options.maxToolConcurrency)

        for (const group of groups) {
            const settled = await Promise.all(
                group.map(async call => {
                    toolSequence.push(call.name)
                    if (overBudget) {
                        return { toolCallId: call.id, content: FINAL_ANSWER_PROMPT, isError: true }
                    }
                    const tool = this.tools.get(call.name)
                    if (!tool) return { toolCallId: call.id, content: `未知工具：${call.name}`, isError: true }
                    let args: Record<string, unknown>
                    try {
                        const parsed = JSON.parse(call.arguments || "{}")
                        args = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
                    } catch {
                        args = {}
                    }
                    const started = Date.now()
                    try {
                        const output: AgentToolOutput = await tool.execute(args, {
                            isInterrupted: () => this.interrupted,
                            round,
                        })
                        const { content, isError } = readToolText(output)
                        this.log(
                            `  [${round}] ${call.name} ${clipForLog(call.arguments)} → ${content.split(/\r?\n/).length} 行 (${Date.now() - started}ms)`
                        )
                        return { toolCallId: call.id, content: clampToolResult(content), ...(isError ? { isError: true } : {}) }
                    } catch (error) {
                        const message = `错误：${error instanceof Error ? error.message : error}`
                        this.log(`  [${round}] ${call.name} ${clipForLog(call.arguments)} → ${message}`)
                        return { toolCallId: call.id, content: message, isError: true }
                    }
                })
            )
            results.push(...settled)
        }

        return results
    }
}

function clipForLog(text: string): string {
    const compact = text.replace(/\s+/g, " ")
    return compact.length > 110 ? `${compact.slice(0, 110)}…` : compact
}

function clampToolResult(content: string): string {
    return content.length > MAX_TOOL_RESULT_CHARS ? `${content.slice(0, MAX_TOOL_RESULT_CHARS)}\n…（结果已截断）` : content
}

function parseFinishArguments(raw: string): Record<string, unknown> {
    try {
        const value = JSON.parse(raw || "{}")
        if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
        throw new Error("finish 参数不是对象")
    } catch (error) {
        throw new Error(`finish 参数不是合法 JSON：${error instanceof Error ? error.message : error}`)
    }
}

export { COMPACT_SUMMARY_MAX_OUTPUT_TOKENS }
