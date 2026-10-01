/**
 * 资料检索 Agent。
 *
 * 检索工具集（见 `src/api/agent/tools/db-retrieval.ts`）与循环机制
 * （见 `src/api/agent/kernel.ts`）各自独立，本文件只做三件事：
 * 组装全量工具、给出提示词、把主循环的运行结果按原结构交出去。
 *
 * 线协议由 `agent/config.ts` 的 `createAgentTransport` 按端点能力选择：
 * DeepSeek 官方与服务端反代走 Messages（工具调用是协议级字段，不受上游文本解析器可靠性影响），
 * 只有 OpenAI 兼容入口的网关走 Chat Completions。
 */

import i18next from "i18next"
import type { AgentUpstreamConfig } from "@/api/agent/config"
import {
    type AgentCallbacks,
    type AgentHistoryMessage,
    AgentKernel,
    type AgentReasoningSegment,
    type AgentRunResult,
    type AgentToolTrace,
} from "@/api/agent/kernel"
import type { AgentTool } from "@/api/agent/tool"
import { createDbRetrievalTools } from "@/api/agent/tools/db-retrieval"
import type { OpenAIConfig } from "@/api/openai"
import { renderDBAgentSystemPrompt } from "@/shared/dbAgentSystemPrompt"
import type { AskUserRequest, AskUserResponse } from "@/utils/db-ask-user"
import { formatAskUserResponse, hasAskAnswer } from "@/utils/db-ask-user"
import { isRagEnabled } from "@/utils/rag/enabled"

/** 工具展示名映射（界面用中文标注检索动作） */
const TOOL_LABELS: Record<string, string> = {
    list_data_modules: "dbAgent.tool.list_data_modules",
    list_filter_options: "dbAgent.tool.list_filter_options",
    search_data: "dbAgent.tool.search_data",
    rag_search: "dbAgent.tool.rag_search",
    query_module_entries: "dbAgent.tool.query_module_entries",
    read_entry: "dbAgent.tool.read_entry",
    list_version_additions: "dbAgent.tool.list_version_additions",
    search_story: "dbAgent.tool.search_story",
    read_story: "dbAgent.tool.read_story",
    explain_damage: "dbAgent.tool.explain_damage",
    ask_user: "dbAgent.tool.ask_user",
}

/**
 * 允许的最大工具调用轮数，防止模型陷入无休止检索。
 *
 * `ask_user` 挂起会占用一轮（回答后从下一轮继续）：这样循环必然推进，
 * 不会出现「模型一直提问、轮次永不前进」的死循环。
 */
const MAX_TOOL_ROUNDS = 30

/**
 * 单次回答触达输出上限后允许自动续写的次数。
 *
 * 上游在触达 max_tokens 时会以 `finish_reason === "length"` 收流，正文停在半句上；
 * 续写把这半句当作助手消息回灌，再要一段后续。3 次约等于三倍输出长度，
 * 既足够收尾一份结果清单，也能在模型反复话痨时及时收敛。
 */
const MAX_CONTINUATIONS = 3

/**
 * @description 取工具的展示名。
 *
 * 已登记的工具走 i18n（带中文 defaultValue 兜底，保证 i18next 未初始化的环境如单测
 * 也能拿到可读文案），未登记的工具直接展示原始名。
 * @param name 工具名（模型可见的英文 id）
 * @returns 界面展示名
 */
function toolLabel(name: string): string {
    const key = TOOL_LABELS[name]

    return key ? i18next.t(key, { defaultValue: name }) : name
}

/**
 * 资料检索 Agent 客户端。
 */
export class DBAgent {
    private readonly kernel: AgentKernel<AskUserRequest>

    /**
     * 创建资料检索 Agent。
     * @param config AI 配置（来自设置页，可缺省）
     */
    constructor(config: Partial<OpenAIConfig> = {}) {
        /** 上一次装配工具时的开关取值：开关没变就不重建，避免每轮都造一遍工具对象 */
        let cachedRag: boolean | null = null
        let cachedTools: AgentTool<AskUserRequest>[] = []

        /**
         * @description 按当前的上下文检索增强开关取工具清单。
         * @returns 本次运行的工具清单
         */
        const resolveTools = (): AgentTool<AskUserRequest>[] => {
            const ragEnabled = isRagEnabled()

            if (cachedRag !== ragEnabled) {
                cachedRag = ragEnabled
                cachedTools = createDbRetrievalTools<AskUserRequest>({ ragEnabled, story: true, askUser: true })
            }

            return cachedTools
        }

        this.kernel = new AgentKernel<AskUserRequest>({
            name: "DBAgent",
            config: config as Partial<AgentUpstreamConfig>,
            tools: resolveTools,
            systemPrompt: () => renderDBAgentSystemPrompt({ ragEnabled: isRagEnabled() }),
            maxToolRounds: MAX_TOOL_ROUNDS,
            maxContinuations: MAX_CONTINUATIONS,
            label: toolLabel,
            formatAnswer: formatAskUserResponse as (request: AskUserRequest, answer: unknown) => string,
            hasAnswer: hasAskAnswer as (request: AskUserRequest, answer: unknown) => boolean,
        })
    }

    /**
     * 更新配置（设置页改动后调用）。
     * @param config 新的 AI 配置
     */
    public updateConfig(config: Partial<OpenAIConfig>): void {
        this.kernel.updateConfig(config as Partial<AgentUpstreamConfig>)
    }

    /** 中断当前流式输出。 */
    public interrupt(): void {
        this.kernel.interrupt()
    }

    /**
     * 运行一轮问答：流式输出 + 多轮工具调用。
     *
     * 若模型发起了 `ask_user`，本方法会在「等用户作答」处返回（结果带 `pendingAsk`），
     * 之后由 answerAsk() / skipAsk() 从断点继续同一轮问答。
     * @param history 会话历史（不含本轮回复）
     * @param callbacks 流式与工具回调
     * @returns 最终回复与工具调用记录；挂起时附带 pendingAsk
     */
    public async run(history: readonly DBAgentHistoryMessage[], callbacks: DBAgentCallbacks = {}): Promise<DBAgentRunResult> {
        return this.kernel.run(history, callbacks)
    }

    /**
     * 用户作答后从挂起点继续。
     * @param response 用户回答（题目 id 与选项 id 来自挂起时的 pendingAsk）
     * @param callbacks 续跑过程的回调（与 run 一致）
     * @returns 最终回复与工具调用记录
     */
    public async answerAsk(response: AskUserResponse, callbacks: DBAgentCallbacks = {}): Promise<DBAgentRunResult> {
        return this.kernel.answerPending(response, callbacks)
    }

    /**
     * 跳过当前提问：回填给模型的是「用户未提供信息」。
     * @param callbacks 续跑过程的回调
     * @returns 最终回复与工具调用记录
     */
    public async skipAsk(callbacks: DBAgentCallbacks = {}): Promise<DBAgentRunResult> {
        return this.kernel.skipPending(callbacks)
    }

    /**
     * 当前是否有挂起中的提问。
     * @returns 挂起的提问信息；无则 null
     */
    public getPendingAsk(): DBAgentPendingAsk | null {
        const pending = this.kernel.getPendingAsk()

        if (!pending) {
            return null
        }

        return { requestId: pending.payload.id, request: pending.payload, toolCallId: pending.toolCallId }
    }

    /**
     * 丢弃挂起的提问现场（切换会话 / 用户放弃作答时调用）。
     */
    public clearPending(): void {
        this.kernel.clearPending()
    }
}

/**
 * 资料检索 Agent 的运行结果类型（结构与 {@link AgentRunResult} 一致）。
 */
export type DBAgentRunResult = AgentRunResult<AskUserRequest>

/** 单轮运行的回调集合 */
export type DBAgentCallbacks = AgentCallbacks

/** Agent 侧的历史消息 */
export type DBAgentHistoryMessage = AgentHistoryMessage

/** 工具调用痕迹 */
export type DBAgentToolTrace = AgentToolTrace

/** 思考分段 */
export type DBAgentReasoningSegment = AgentReasoningSegment

/**
 * 挂起中的一次提问。
 *
 * `requestId` 取自题面 id，`toolCallId` 用于把用户回答回填到正确的工具调用上。
 */
export interface DBAgentPendingAsk {
    /** 提问 id */
    requestId: string
    /** 归一化后的提问请求（界面据此渲染选项） */
    request: AskUserRequest
    /** 该次 ask_user 工具调用的 id（回填回答时需要） */
    toolCallId: string
}
