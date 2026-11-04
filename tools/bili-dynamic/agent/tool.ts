/**
 * @file 工具契约与并发调度。
 * 对齐 apps/web/src/api/agent/tool.ts 与 tool-scheduler.ts：工具只负责「参数进、字符串出」。
 */

import type { AgentToolCall, AgentToolDefinition } from "./wire.ts"

export interface AgentToolContext {
    isInterrupted(): boolean
    /** 当前所在工具轮次（从 1 开始） */
    round: number
}

export interface AgentToolTextOutput {
    content: string
    isError?: boolean
}

export type AgentToolOutput = string | AgentToolTextOutput

export interface AgentTool {
    definition: AgentToolDefinition
    /** 仅声明并发安全的工具会并行执行 */
    concurrentSafe?: boolean
    execute(args: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolOutput> | AgentToolOutput
}

export function readToolText(output: AgentToolOutput): { content: string; isError: boolean } {
    if (typeof output === "string") return { content: output, isError: false }
    return { content: output.content, isError: output.isError === true }
}

export const DEFAULT_MAX_TOOL_CONCURRENCY = 8

/** 连续的安全调用按上限分组；串行工具是屏障 */
export function scheduleToolCalls(
    calls: readonly AgentToolCall[],
    tools: ReadonlyMap<string, AgentTool>,
    maxConcurrency = DEFAULT_MAX_TOOL_CONCURRENCY
): AgentToolCall[][] {
    const groups: AgentToolCall[][] = []
    let parallelGroup: AgentToolCall[] = []
    for (const call of calls) {
        if (tools.get(call.name)?.concurrentSafe !== true) {
            groups.push([call])
            parallelGroup = []
            continue
        }
        if (!parallelGroup.length || parallelGroup.length >= maxConcurrency) {
            parallelGroup = []
            groups.push(parallelGroup)
        }
        parallelGroup.push(call)
    }
    return groups
}

export function parseToolArguments(raw: string): Record<string, unknown> {
    try {
        const value = JSON.parse(raw || "{}")
        return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
    } catch {
        return {}
    }
}
