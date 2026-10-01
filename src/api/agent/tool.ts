/**
 * Agent 框架里的工具契约。
 *
 * 工具实现只管「参数进、字符串出」，循环、回灌、痕迹、挂起都由 {@link AgentKernel} 负责。
 * 工具与传输解耦：同一个工具集可以挂到 Messages 或 Chat Completions 任一条线上。
 */

import type { AgentToolDefinition } from "./wire"

/** 工具执行期间的上下文。 */
export interface AgentToolContext {
    /** 当前是否已请求中断（长耗时工具应在分段里轮询它） */
    isInterrupted(): boolean
}

/** 普通结果：把这段文本回灌给模型。 */
export interface AgentToolTextOutput {
    /** 结果正文 */
    content: string
    /** 覆盖默认的痕迹摘要 */
    summary?: string
    /** 是否算执行失败 */
    isError?: boolean
}

/**
 * 挂起结果：工具需要外部（通常是用户）给出输入才能完成。
 *
 * `suspend` 载荷对内核不透明，原样交回 {@link AgentKernelOptions.formatAnswer} 等待格式化。
 */
export interface AgentToolSuspendOutput<TPayload> {
    /** 挂起载荷 */
    suspend: TPayload
    /** 覆盖默认的痕迹摘要 */
    summary?: string
}

/** 工具返回值：字符串视为普通结果，对象按有无 `suspend` 分流。 */
export type AgentToolOutput<TPayload = never> = string | AgentToolTextOutput | AgentToolSuspendOutput<TPayload>

/** 一个 Agent 工具。 */
export interface AgentTool<TPayload = never> {
    /** 工具定义（模型可见的名字、说明与 JSON Schema） */
    definition: AgentToolDefinition
    /**
     * 执行工具。
     * @param args 模型给出的参数（已过 `parseToolArguments`，非法 JSON 得到空对象）
     * @param context 执行上下文
     * @returns 结果文本或挂起载荷
     */
    execute(args: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolOutput<TPayload>> | AgentToolOutput<TPayload>
}

/**
 * @description 把工具执行结果收敛成「正文 + 是否失败」。
 *
 * 挂起结果没有正文，返回 null 让调用方按挂起分支处理。
 * @param output 工具返回值
 * @returns 正文与失败标记；挂起时返回 null
 */
export function readToolText(output: AgentToolOutput<never>): { content: string; isError: boolean } | null {
    if (typeof output === "string") {
        return { content: output, isError: false }
    }

    if (output && typeof output === "object" && "suspend" in output) {
        return null
    }

    const text = output as AgentToolTextOutput

    return { content: text.content, isError: text.isError === true }
}

/**
 * @description 读取工具自带的摘要覆盖项。
 * @param output 工具返回值
 * @returns 摘要；未设置时为空串
 */
export function readToolSummary(output: AgentToolOutput<never>): string {
    if (typeof output === "string") {
        return ""
    }

    return (output as { summary?: string }).summary ?? ""
}
