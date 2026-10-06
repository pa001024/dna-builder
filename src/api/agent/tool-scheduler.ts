import type { AgentTool } from "./tool"
import type { AgentToolCall } from "./wire"

/** 与 ZCode 的工具调度默认上限一致；未声明并发安全的工具不受此值影响。 */
export const DEFAULT_MAX_TOOL_CONCURRENCY = 10

/** 校验并发上限，避免无效分组或意外无限并发。 */
export function validateToolConcurrency(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error("工具并发上限必须是正安全整数")
    }

    return value
}

/** 连续安全调用按上限分组；串行工具是屏障，任何调用都不能越过它。 */
export function scheduleToolCalls<TPayload>(
    calls: readonly AgentToolCall[],
    tools: ReadonlyMap<string, AgentTool<TPayload>>,
    maxConcurrency = DEFAULT_MAX_TOOL_CONCURRENCY
): AgentToolCall[][] {
    validateToolConcurrency(maxConcurrency)
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
