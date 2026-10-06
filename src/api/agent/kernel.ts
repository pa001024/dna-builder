/**
 * 通用 Agent 主循环。
 *
 * 「跑一轮 → 拿到工具调用 → 执行 → 回灌」这条循环与具体业务无关：资料检索与配装助手
 * 共用同一份实现，差异全在注入的工具集与提示词上。
 *
 * 循环内置五件事，缺一不可：
 *
 * 1. **工具声明全程在场**。轮次预算用尽也不撤 `tools`——未声明工具 + 思考模式下，
 *    上游会把 `<||DSML|| calls>` 标记当正文下发给用户（对 `api.deepseek.com/anthropic/v1/messages`
 *    A/B 实测：声明 tools 时无论是否开思考都正常返回 tool_use；不声明且开思考则 100% 吐标记）。
 *    超预算的调用改成「额度已用尽」的工具结果回灌，让模型看到明确信号后收尾。
 *    上下文压缩的摘要请求同样遵守这一条（见 `compact.ts`）。
 * 2. **思考按段切分**。每段思考记录它后续发起了哪些工具调用，界面才能按真实顺序还原
 *    「思考 → 工具 → 再思考」。
 * 3. **挂起可恢复**。工具返回 `suspend` 时整个循环状态封存，外部把用户输入喂回来继续。
 * 4. **输出上限续写**。`finishReason === "length"` 时补一段续写，避免用户看到半句话。
 * 5. **上下文自适应**。每轮请求前估算上下文规模，逼近模型窗口时就地压缩历史
 *    （摘要替换旧消息，最近一轮原样保留）；真实用量随每轮回传（`AgentRoundUsage`），
 *    供容量面板与压缩阈值校准。跨轮的压缩与落库由组合式函数负责。
 */

import { agentI18nText } from "@/utils/agent-chat"
import { type AgentCompactionOutcome, COMPACT_SUMMARY_MAX_OUTPUT_TOKENS, compactWireMessages, resolveAutoCompactThreshold } from "./compact"
import { type AgentUpstreamConfig, createAgentTransport, normalizeAgentUpstreamConfig } from "./config"
import { estimateMessagesTokens, estimateTextTokens, estimateToolTokens, resolveModelContextWindow } from "./context-usage"
import { type AgentTool, type AgentToolOutput, readToolSummary, readToolText } from "./tool"
import { DEFAULT_MAX_TOOL_CONCURRENCY, scheduleToolCalls, validateToolConcurrency } from "./tool-scheduler"
import {
    type AgentImageAttachment,
    type AgentRoundResult,
    type AgentRoundUsage,
    type AgentToolCall,
    type AgentToolDefinition,
    type AgentToolResult,
    type AgentTransport,
    type AgentWireMessage,
    parseToolArguments,
} from "./wire"

/** 工具调用记录：供对话界面展示执行过程 */
export interface AgentToolTrace {
    /** 工具调用 ID */
    id: string
    /** 工具名（英文，模型可见） */
    name: string
    /** 工具展示名（界面展示，随界面语言切换） */
    label: string
    /** 调用参数 */
    args: Record<string, unknown>
    /** 结果摘要（界面展示用，非完整结果） */
    summary: string
    /** 结果原文（截断保存，供界面点击展开；只进展示与落库，不参与模型回灌） */
    result?: string
    /** 执行状态 */
    status: "running" | "done" | "error"
}

/** Agent 回调 */
export interface AgentCallbacks {
    /** 流式增量：reasoning 为思考内容（部分模型返回），content 为正文 */
    onDelta?: (text: string, type: "reasoning" | "content") => void
    /** 工具调用状态变化 */
    onToolTrace?: (trace: AgentToolTrace) => void
    /**
     * 某一轮的思考结束（该轮开始调用工具，或模型已给出最终回答）。
     * @param toolCallIds 该段思考之后发起的工具调用 id 列表（用于把「思考 → 工具」
     *   按真实顺序串联；最终回答前的最后一段思考传空数组）
     */
    onReasoningEnd?: (toolCallIds: string[]) => void
    /** 单轮真实用量（上游回传时每次模型请求一次；容量面板与缓存命中率据此统计） */
    onUsage?: (usage: AgentRoundUsage) => void
    /**
     * 运行中发生了一次就地上下文压缩（内核替换了消息现场）。
     * 只播报运行内的压缩；跨轮压缩与落库由组合式函数编排。
     */
    onCompaction?: (info: { preTokens: number; postTokens: number; summarizedCount: number; keptCount: number }) => void
}

/** Agent 侧的历史消息（来自 Dexie 的会话记录） */
export interface AgentHistoryMessage {
    role: "user" | "assistant"
    content: string
    /**
     * 这一轮用户附带的图片（仅 user 轮有意义）。
     *
     * 体积由调用方负责收敛（`useDBChat` 只回灌最近若干轮），这里不做裁剪：
     * 内核只管把拿到的图片放进上下文。
     */
    images?: readonly AgentImageAttachment[]
}

/** Agent 单条思考片段（一次运行可能有多段，对应多轮工具调用之间的思考） */
export interface AgentReasoningSegment {
    /** 思考内容 */
    text: string
    /** 该段思考后续发起了哪些工具调用（按 id 关联 traces） */
    toolCallIds: string[]
}

/**
 * 挂起中的一次提问。
 *
 * 携带续跑所需的工具调用 id，外部回答案时会把它回填成一条工具结果。
 */
export interface AgentPendingAsk<TPayload> {
    /** 该次工具调用的 id（回填回答时需要） */
    toolCallId: string
    /** 工具给出的挂起载荷 */
    payload: TPayload
}

/** Agent 单轮运行选项。 */
export interface AgentRunOptions {
    /**
     * 显式会话 id：随请求头发给自家代理，服务端日志按它归会话。
     * 缺省时服务端退回「账号 + 首条 user 消息」的指纹推导（连续相同提问会被并进同一会话）。
     */
    sessionId?: string
}

/** Agent 单轮运行结果 */
export interface AgentRunResult<TPayload> {
    /** 最终回复正文（挂起时为空串） */
    reply: string
    /** 本轮的工具调用记录 */
    traces: AgentToolTrace[]
    /** 本轮的各段思考内容 */
    reasonings: AgentReasoningSegment[]
    /**
     * 本轮挂起时等待用户回答的提问。
     *
     * 非 null 表示这条回复还没结束：工具请求了外部输入，
     * 循环已停在等待这一步，需要外部调用 answerPending() 或 skipPending() 继续。
     */
    pendingAsk?: AgentPendingAsk<TPayload>
}

/** 上下文体检信息：容量面板与压缩决策共用的装配数据 */
export interface AgentContextInfo {
    /** 模型 id */
    model: string
    /** 上下文窗口（tokens，按模型名启发式解析） */
    contextWindow: number
    /** 请求的输出上限（tokens） */
    maxTokens: number
    /** 当前系统提示词 */
    system: string
    /** meta_user 前缀内容（未包裹 system-reminder 标签；空串表示没有） */
    metaUser: string
    /** 当前工具定义 */
    tools: AgentToolDefinition[]
}

/** 主循环的运行态 */
interface AgentLoopState {
    /** 完整消息序列（含助手轮的工具调用与已回灌的工具结果） */
    messages: AgentWireMessage[]
    /** 已产出的正文 */
    reply: string
    /** 已累积的工具调用痕迹 */
    traces: AgentToolTrace[]
    /** 已累积的思考分段 */
    reasonings: AgentReasoningSegment[]
    /** 尚未收尾的实时思考文本 */
    reasoningText: string
    /** 当前轮次号 */
    round: number
    /**
     * 真实用量锚点：最近一次带 usage 的请求（tokens = 输入 + 输出）与它发出时的消息条数。
     * 之后的上下文规模 = 锚点值 + 增量消息的估算；就地压缩后失效（消息序列被整体替换）。
     */
    usageAnchor: { tokens: number; messageCount: number } | null
}

/** 挂起态：运行态 + 待回答的提问 */
interface AgentPendingState<TPayload> extends AgentLoopState {
    /** 对外暴露的提问信息 */
    ask: AgentPendingAsk<TPayload>
}

/** 挂起结果按调用顺序归并，避免较快完成的调用抢占 pending。 */
type AgentToolExecution<TPayload> =
    | { result: AgentToolResult }
    | { suspended: { call: AgentToolCall; payload: TPayload; summary: string }; trace: AgentToolTrace }

/** 主循环的注入项。 */
export interface AgentKernelOptions<TPayload> {
    /** Agent 名，日志前缀 */
    name: string
    /** 初始上游配置 */
    config: Partial<AgentUpstreamConfig>
    /**
     * 工具清单，或者直接给一个取值函数。
     *
     * 给函数的场合用于「工具面会随运行时开关变化」——例如上下文检索增强被关闭后
     * rag_search 要从工具清单里消失，等到重新打开又要回来；每轮开始时重取一次即可。
     */
    tools: readonly AgentTool<TPayload>[] | (() => readonly AgentTool<TPayload>[])
    /** 系统提示词（每次运行取一次，允许随上下文变化） */
    systemPrompt: () => string
    /**
     * meta_user 前缀内容（每次运行取一次；空串不下发）：内核用 `<system-reminder>` 包裹后
     * 作为置于对话最前的 user 消息随每轮请求下发，不进系统提示词本体。
     */
    metaUserPrefix?: () => string
    /**
     * 允许的最大工具轮数。
     *
     * 挂起会占用一轮（回答后从下一轮继续），保证循环必然推进，不会出现
     * 「工具一直提问、轮次永不前进」的死循环。默认 30。
     */
    maxToolRounds?: number
    /** 安全工具每组的最大并发数，默认 10；设为 1 可完全串行执行。 */
    maxToolConcurrency?: number
    /** 单次回答触达输出上限后允许自动续写的次数，默认 3 */
    maxContinuations?: number
    /** 传输实现覆盖项，仅供单测注入假传输；不传时按端点能力创建 */
    transport?: AgentTransport
    /** 取工具展示名，缺省直接用工具名 */
    label?: (name: string) => string
    /**
     * 生成痕迹摘要。
     * @param name 工具名
     * @param args 调用参数
     * @param payload 工具返回值里解析出的 JSON 对象；非 JSON 时为 null
     * @param fallback 工具未给出摘要时的兜底文案
     * @returns 界面展示摘要
     */
    summarize?: (input: { name: string; args: Record<string, unknown>; payload: unknown; raw: string }) => string
    /**
     * 把外部输入格式化成回灌给模型的文本。
     * 挂起发生时必填，缺失会在恢复时报「无法格式化回答」。
     */
    formatAnswer?: (payload: TPayload, answer: unknown) => string
    /**
     * 判断外部输入是否算有效回答；无效时不推进循环，界面继续等待。
     * 缺省时任何输入都算有效。
     */
    hasAnswer?: (payload: TPayload, answer: unknown) => boolean
}

/**
 * 单条回复触达输出上限后的续写提示词。
 *
 * 必须显式要求「不重复、不重开头」：只给「继续」两字时，模型常常把已输出的段落再讲一遍。
 */
const CONTINUATION_PROMPT = "上一条回复因长度上限被截断。请紧接着未完成处继续输出剩余内容，不要重复已经输出过的部分，也不要重新开头。"

/** 轮次预算耗尽时回灌给模型的错误文案（提示词侧也有同样要求，双保险）。 */
const TOOL_BUDGET_EXHAUSTED_HINT = "检索轮次已用尽，请基于已有结果直接作答"

/** 落进工具记录的结果原文上限（字符数）：结果可能很大，全量落库会撑爆 IndexedDB。 */
const MAX_TRACE_RESULT_CHARS = 4000

/**
 * 截断工具结果原文到可落库的长度。
 * @param content 结果原文。
 * @returns 截断后的文本，超限时以「…（已截断）」结尾。
 */
function clampTraceResult(content: string): string {
    return content.length > MAX_TRACE_RESULT_CHARS ? `${content.slice(0, MAX_TRACE_RESULT_CHARS)}…（已截断）` : content
}

/**
 * 预算耗尽后追加的收尾提示。
 *
 * 只回灌一条错误结果不够：模型刚刚还在「调用工具」这个语境里，很可能再来一次调用；
 * 再给一轮并明确要求「直接作答」，才拿得到最终答案——否则用户看到的是一条空回复。
 */
const FINAL_ANSWER_PROMPT = "工具调用额度已用尽。请基于已经拿到的结果直接给出完整回答，不要再调用任何工具。"

/**
 * @description 把会话历史转成协议中立的对话消息。
 *
 * 历史只带正文：Dexie 里的助手消息虽然存了思考分段，但分段是按「段 → 工具调用 id」
 * 记录的，无法还原回线与线之间精确的交错顺序；凭这样的记录重建 thinking 块会把顺序猜错，
 * 反而比不带更糟。**一次运行内部**的多轮（同一轮问答里的工具循环）不走这里，那段上下文的思考是原样回灌的。
 * @param history 会话历史
 * @returns 协议中立的对话消息
 */
export function toWireMessages(history: readonly AgentHistoryMessage[]): AgentWireMessage[] {
    return history.map(message =>
        message.role === "assistant"
            ? { role: "assistant" as const, text: message.content, thinking: "", toolCalls: [] }
            : {
                  role: "user" as const,
                  text: message.content,
                  ...(message.images?.length ? { images: message.images } : {}),
              }
    )
}

/**
 * @description 把工具返回文本解析成 JSON 对象，供摘要器取字段。
 * @param raw 工具返回文本
 * @returns 解析结果；非 JSON 时返回 null
 */
function tryParseJson(raw: string): unknown {
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/**
 * 通用 Agent 主循环。
 *
 * 一个实例对应一份上游配置与工具集：配装助手在会话存续期间反复复用它，
 * 资料检索助手在上游设置变化时 {@link AgentKernel.updateConfig}。
 */
export class AgentKernel<TPayload> {
    private transport: AgentTransport
    private config: AgentUpstreamConfig
    private readonly options: AgentKernelOptions<TPayload>
    private readonly maxToolConcurrency: number
    /** 中断标记：置位后当前这一轮会在下一个数据块处停止 */
    private interrupted = false
    /**
     * 挂起现场。
     *
     * 非 null 表示这一轮问答停在「等外部输入」：消息序列、已累积的思考与痕迹都在里面，
     * answerPending() / skipPending() 据此续跑。同一时刻最多一个。
     */
    private pending: AgentPendingState<TPayload> | null = null
    /** 本次运行的显式会话 id：随请求头发给自家代理用于日志归会话；run() 时设置，挂起续跑沿用 */
    private sessionId: string | null = null

    /**
     * 创建主循环。
     * @param options 注入的工具集、提示词与限额
     */
    constructor(options: AgentKernelOptions<TPayload>) {
        this.maxToolConcurrency = validateToolConcurrency(options.maxToolConcurrency ?? DEFAULT_MAX_TOOL_CONCURRENCY)
        this.options = options
        this.config = normalizeAgentUpstreamConfig(options.config)
        this.transport = options.transport ?? createAgentTransport(this.config)
    }

    /**
     * 更新上游配置并重建传输。
     * @param config 新的配置
     */
    public updateConfig(config: Partial<AgentUpstreamConfig>): void {
        this.config = normalizeAgentUpstreamConfig({ ...this.config, ...config })

        // 注入的假传输要一直留着：单测里换掉了真传输就不该被配置更新覆盖回去
        if (!this.options.transport) {
            this.transport = createAgentTransport(this.config)
        }
    }

    /** 中断当前执行并丢弃待回答现场；已启动工具需配合上下文中断检查。 */
    public interrupt(): void {
        this.interrupted = true
        this.pending = null
    }

    /**
     * 运行一轮问答：流式输出 + 多轮工具调用。
     *
     * 若工具请求了挂起（如 ask_user），本方法会在等待处返回（结果带 `pendingAsk`），
     * 之后由 answerPending() / skipPending() 从断点继续同一轮问答。
     * @param history 会话历史（不含本轮回复）
     * @param callbacks 流式与工具回调
     * @param options 运行选项（显式会话 id 等）
     * @returns 最终回复与工具调用记录；挂起时附带 pendingAsk
     */
    public async run(
        history: readonly AgentHistoryMessage[],
        callbacks: AgentCallbacks = {},
        options: AgentRunOptions = {}
    ): Promise<AgentRunResult<TPayload>> {
        if (!this.config.api_key) {
            throw new Error(
                this.describe(agentI18nText("dbAgent.error.noApiKey", "缺少 API Key：请在设置页填写密钥，或登录以使用服务端反代"))
            )
        }

        this.interrupted = false
        this.pending = null
        this.sessionId = options.sessionId ?? null

        return this.runLoop(
            {
                messages: toWireMessages(history),
                reply: "",
                traces: [],
                reasonings: [],
                reasoningText: "",
                round: 0,
                usageAnchor: null,
            },
            callbacks
        )
    }

    /**
     * 外部输入后从挂起点继续。
     *
     * 输入会以工具结果回灌到挂起时的上下文里，因此模型看到的正是
     * 「我问了什么 → 用户答了什么」，接着的那一轮就能带着答案继续。
     * @param answer 外部输入（由 {@link AgentKernelOptions.formatAnswer} 格式化）
     * @param callbacks 续跑过程的回调（与 run 一致）
     * @returns 最终回复与工具调用记录
     */
    public async answerPending(answer: unknown, callbacks: AgentCallbacks = {}): Promise<AgentRunResult<TPayload>> {
        return this.resolvePending(this.requirePending(), answer, callbacks, false)
    }

    /**
     * 跳过当前挂起：与作答走同一条续跑路径，只是回填给模型的是未提供输入。
     * @param callbacks 续跑过程的回调
     * @returns 最终回复与工具调用记录
     */
    public async skipPending(callbacks: AgentCallbacks = {}): Promise<AgentRunResult<TPayload>> {
        return this.resolvePending(this.requirePending(), null, callbacks, true)
    }

    /**
     * 当前是否有挂起中的提问。
     * @returns 挂起信息；无则 null
     */
    public getPendingAsk(): AgentPendingAsk<TPayload> | null {
        return this.pending?.ask ?? null
    }

    /**
     * 丢弃挂起现场（切换会话 / 用户放弃时调用）。
     *
     * 清掉之后 answerPending() 会直接抛错，避免出现「回答了一个已经不在等的问题」。
     */
    public clearPending(): void {
        this.pending = null
    }

    /**
     * @description 取当前装配的上下文体检信息（模型、窗口、系统提示词、meta_user 前缀与工具定义）。
     * @returns 体检信息
     */
    public getContextInfo(): AgentContextInfo {
        return {
            model: this.config.default_model,
            contextWindow: resolveModelContextWindow(this.config.default_model),
            maxTokens: this.config.default_max_tokens,
            system: this.options.systemPrompt(),
            metaUser: this.options.metaUserPrefix?.().trim() ?? "",
            tools: this.resolveTools().map(tool => tool.definition),
        }
    }

    /**
     * @description 估算一段历史的整体上下文规模（系统提示词 + meta_user 前缀 + 工具声明 + 消息）。
     * @param history 会话历史
     * @returns 估算 tokens
     */
    public estimateHistoryContextTokens(history: readonly AgentHistoryMessage[]): number {
        const info = this.getContextInfo()

        return (
            estimateTextTokens(info.system) +
            estimateTextTokens(info.metaUser) +
            estimateToolTokens(info.tools) +
            estimateMessagesTokens(toWireMessages(history))
        )
    }

    /**
     * @description 对一段历史执行上下文压缩（生成摘要并组装压缩后的消息序列）。
     *
     * 历史不足两轮助手消息时返回 null；摘要请求失败时抛出。落库压缩边界由调用方负责。
     * @param history 会话历史
     * @returns 压缩结果；无需压缩时 null
     */
    public async compactHistory(history: readonly AgentHistoryMessage[]): Promise<AgentCompactionOutcome | null> {
        const info = this.getContextInfo()

        return compactWireMessages({
            transport: this.transport,
            model: info.model,
            system: info.system,
            tools: info.tools,
            temperature: this.config.default_temperature,
            // 摘要不需要整份输出预算，压到专用上限即可
            maxTokens: Math.min(this.config.default_max_tokens, COMPACT_SUMMARY_MAX_OUTPUT_TOKENS),
            messages: toWireMessages(history),
            sessionId: this.sessionId ?? undefined,
        })
    }

    /**
     * @description 取本轮使用的工具清单。
     * @returns 工具清单
     */
    private resolveTools(): readonly AgentTool<TPayload>[] {
        return typeof this.options.tools === "function" ? this.options.tools() : this.options.tools
    }

    /**
     * 构造 meta_user 前缀消息（system-reminder 包裹，置于对话最前）；
     * 正文里混入的同名标签会被剥掉，避免包裹结构被破坏。
     */
    private resolveMetaUserMessage(): AgentWireMessage | null {
        const content = this.options.metaUserPrefix?.().trim() ?? ""
        if (!content) {
            return null
        }

        const safe = content.replace(/<\/?system-reminder>/gi, "")

        return { role: "user", text: `<system-reminder>\n${safe}\n</system-reminder>` }
    }

    /**
     * @description 给界面用的默认摘要：工具未返回结构化数据时给出工具名。
     * @param name 工具名
     * @returns 摘要文案
     */
    private describe(name: string): string {
        return `[${this.options.name}] ${name}`
    }

    /**
     * @description 取挂起现场，不存在时抛错。
     * @returns 挂起状态
     */
    private requirePending(): AgentPendingState<TPayload> {
        const state = this.pending

        if (!state) {
            throw new Error(this.describe(agentI18nText("dbAgent.error.noPendingAsk", "当前没有等待中的提问")))
        }

        return state
    }

    /**
     * @description 生成一次工具调用的界面摘要。
     * @param name 工具名
     * @param args 调用参数
     * @param raw 工具返回文本
     * @param override 工具自带的摘要覆盖项
     * @returns 摘要文案
     */
    private summarizeTool(name: string, args: Record<string, unknown>, raw: string, override: string): string {
        if (override) {
            return override
        }

        const summarize = this.options.summarize

        if (!summarize) {
            return ""
        }

        return summarize({ name, args, payload: tryParseJson(raw), raw })
    }

    /**
     * @description 把外部输入回填成工具结果，并从挂起点继续循环。
     * @param state 挂起时的状态
     * @param answer 外部输入
     * @param callbacks 续跑回调
     * @param skipped 是否为跳过
     * @returns 最终回复与工具调用记录
     */
    private async resolvePending(
        state: AgentPendingState<TPayload>,
        answer: unknown,
        callbacks: AgentCallbacks,
        skipped: boolean
    ): Promise<AgentRunResult<TPayload>> {
        const { payload } = state.ask

        // 输入无效且不是主动跳过时，不推进循环，让界面继续等待
        if (!skipped && this.options.hasAnswer && !this.options.hasAnswer(payload, answer)) {
            throw new Error(this.describe(agentI18nText("dbAgent.error.needAnswer", "需要先给出回答才能继续")))
        }

        const formatAnswer = this.options.formatAnswer

        if (!formatAnswer) {
            throw new Error(this.describe("挂起的工具没有提供回答格式化能力"))
        }

        this.pending = null
        this.interrupted = false

        state.messages.push({
            role: "user",
            text: "",
            toolResults: [{ toolCallId: state.ask.toolCallId, content: formatAnswer(payload, answer) }],
        })

        const trace = state.traces.find(item => item.id === state.ask.toolCallId)

        if (trace) {
            trace.status = "done"
            callbacks.onToolTrace?.({ ...trace })
        }

        // 发起提问的那一轮已经结束，推进轮次（保证循环必然前进，不会无限提问）
        state.round += 1

        return this.runLoop(state, callbacks)
    }

    /**
     * @description 估算当前循环现场的上下文规模。
     *
     * 有真实用量锚点时「锚点值 + 增量消息估算」（锚点覆盖了系统提示词、工具与此前全部消息），
     * 否则退回全量本地估算。
     * @param state 循环状态
     * @param system 系统提示词
     * @param toolDefinitions 工具定义
     * @returns 估算 tokens
     */
    private estimateLoopContextTokens(state: AgentLoopState, system: string, toolDefinitions: readonly AgentToolDefinition[]): number {
        const anchor = state.usageAnchor

        if (anchor) {
            return anchor.tokens + estimateMessagesTokens(state.messages.slice(anchor.messageCount))
        }

        return estimateTextTokens(system) + estimateToolTokens(toolDefinitions) + estimateMessagesTokens(state.messages)
    }

    /**
     * @description 上下文逼近模型窗口时就地压缩循环现场（每轮请求前调用）。
     *
     * 摘要只作用于本次运行（不落库）：跨轮的压缩边界由组合式函数持久化，
     * 这里挡的是「一次问答内多轮工具调用把上下文撑爆」的情况。
     * 消息序列被整体替换后，真实用量锚点随之失效（下轮请求会重新锚定）。
     * @param state 循环状态
     * @param toolDefinitions 工具定义（摘要请求也要声明，防 DSML 泄露）
     * @param callbacks 流式与工具回调
     */
    private async maybeCompactLoopContext(
        state: AgentLoopState,
        system: string,
        toolDefinitions: readonly AgentToolDefinition[],
        callbacks: AgentCallbacks
    ): Promise<void> {
        if (this.interrupted) {
            return
        }

        const threshold = resolveAutoCompactThreshold(resolveModelContextWindow(this.config.default_model), this.config.default_max_tokens)

        if (this.estimateLoopContextTokens(state, system, toolDefinitions) < threshold) {
            return
        }

        try {
            const outcome = await compactWireMessages({
                transport: this.transport,
                model: this.config.default_model,
                system,
                tools: toolDefinitions,
                temperature: this.config.default_temperature,
                maxTokens: Math.min(this.config.default_max_tokens, COMPACT_SUMMARY_MAX_OUTPUT_TOKENS),
                messages: state.messages,
                sessionId: this.sessionId ?? undefined,
            })

            if (!outcome) {
                return
            }

            state.messages.length = 0
            state.messages.push(...outcome.messages)
            state.usageAnchor = null
            callbacks.onCompaction?.({
                preTokens: outcome.preTokens,
                postTokens: outcome.postTokens,
                summarizedCount: outcome.summarizedCount,
                keptCount: outcome.keptCount,
            })
            console.warn(this.describe(`上下文接近窗口上限，已就地压缩（约 ${outcome.preTokens} → ${outcome.postTokens} tokens）`))
        } catch (error) {
            // 压缩失败不阻断正常问答：保持原上下文继续，超限的错误由上游给出
            console.warn(this.describe(`就地压缩失败：${error instanceof Error ? error.message : String(error)}`))
        }
    }

    /** 工具失败只影响当前调用；摘要与结果规范化也属于这次调用的执行边界。 */
    private async executeToolCall(
        call: AgentToolCall,
        tool: AgentTool<TPayload> | undefined,
        traces: AgentToolTrace[],
        callbacks: AgentCallbacks,
        outOfToolRounds: boolean
    ): Promise<AgentToolExecution<TPayload>> {
        const args = parseToolArguments(call.arguments)
        const label = this.options.label ? this.options.label(call.name) : call.name
        if (!tool) {
            return { result: { toolCallId: call.id, content: JSON.stringify({ error: `未知工具 ${call.name}` }), isError: true } }
        }

        const trace: AgentToolTrace = { id: call.id, name: call.name, label, args, summary: "", status: "running" }
        traces.push(trace)

        if (outOfToolRounds || this.interrupted) {
            return { result: this.failToolCall(call, trace, outOfToolRounds ? TOOL_BUDGET_EXHAUSTED_HINT : "工具调用已中断", callbacks) }
        }
        callbacks.onToolTrace?.({ ...trace })
        if (this.interrupted) {
            return { result: this.failToolCall(call, trace, "工具调用已中断", callbacks) }
        }

        let execution: AgentToolExecution<TPayload>
        try {
            const output = await tool.execute(args, { isInterrupted: () => this.interrupted })
            const summaryOverride = readToolSummary(output as AgentToolOutput<never>)
            if (output && typeof output === "object" && "suspend" in output) {
                trace.summary = this.summarizeTool(call.name, args, "", summaryOverride)
                execution = { suspended: { call, payload: output.suspend, summary: trace.summary }, trace }
            } else {
                const text = readToolText(output as AgentToolOutput<never>)
                if (!text) {
                    throw new Error("工具未返回结果")
                }
                trace.summary = this.summarizeTool(call.name, args, text.content, summaryOverride)
                trace.result = clampTraceResult(text.content)
                trace.status = text.isError ? "error" : "done"
                execution = { result: { toolCallId: call.id, content: text.content, ...(text.isError ? { isError: true } : {}) } }
            }
        } catch (error) {
            return { result: this.failToolCall(call, trace, error instanceof Error ? error.message : String(error), callbacks) }
        }

        callbacks.onToolTrace?.({ ...trace })
        return execution
    }

    /** 错误结果与展示痕迹使用同一条消息，保证每次失败都有对应的工具回灌。 */
    private failToolCall(call: AgentToolCall, trace: AgentToolTrace, message: string, callbacks: AgentCallbacks): AgentToolResult {
        trace.status = "error"
        trace.summary = message
        trace.result = message
        callbacks.onToolTrace?.({ ...trace })
        return { toolCallId: call.id, content: JSON.stringify({ error: message }), isError: true }
    }

    /**
     * 工具调用主循环：流式请求 → 解析工具调用 → 执行 → 回灌，直到模型给出最终回答或挂起。
     *
     * 抽成独立方法的唯一目的是支持**挂起后恢复**：`state` 里带着消息序列与已累积的思考，
     * 恢复时把外部输入补进 `messages` 再调用本方法，就能从断点继续同一轮问答。
     * @param state 循环状态（新建时为初始态，恢复时为挂起时保存的态）
     * @param callbacks 流式与工具回调
     * @returns 最终回复与工具调用记录；挂起时附带 pendingAsk
     */
    private async runLoop(state: AgentLoopState, callbacks: AgentCallbacks = {}): Promise<AgentRunResult<TPayload>> {
        const { messages, traces, reasonings } = state
        const system = this.options.systemPrompt()
        /** meta_user 前缀消息：整轮恒定（技能清单等），置于对话最前 */
        const metaUserMessage = this.resolveMetaUserMessage()
        const maxToolRounds = this.options.maxToolRounds ?? 30
        const maxContinuations = this.options.maxContinuations ?? 3
        /** 本次问答声明的工具：整轮恒定（见文件头「工具声明全程在场」） */
        const toolList = this.resolveTools()
        const toolMap = new Map(toolList.map(tool => [tool.definition.name, tool]))
        const toolDefinitions: readonly AgentToolDefinition[] = toolList.map(tool => tool.definition)

        /** 把已累积的思考收束成一段，并记录它后续发起的工具调用 */
        const flushReasoning = (toolCallIds: string[] = []) => {
            if (!state.reasoningText.trim()) {
                return
            }

            reasonings.push({ text: state.reasoningText, toolCallIds })
            state.reasoningText = ""
        }

        let round = state.round
        /** 本次问答已自动续写的次数 */
        let continuations = 0
        /**
         * 是否已用完「预算耗尽后的收尾轮」。
         *
         * 收尾轮是循环条件的例外：预算耗尽那一轮模型还停在「调工具」语境里，
         * 直接结束会让它没有机会写出最终答案。这一轮用完即止，不会无限循环。
         */
        let finalTurnUsed = false

        while (round <= maxToolRounds || !finalTurnUsed) {
            /** 已用尽工具轮：只用来决定「拿到工具调用后怎么处理」，不影响工具声明 */
            const outOfToolRounds = round >= maxToolRounds

            // 上下文逼近窗口上限时就地压缩（跨轮压缩与落库由组合式函数负责，见 compact.ts 文件头）
            await this.maybeCompactLoopContext(state, system, toolDefinitions, callbacks)
            if (this.interrupted) {
                flushReasoning()
                return { reply: state.reply, traces, reasonings }
            }

            /** 本轮请求发出时的消息条数：真实用量回来后据此计算增量估算的起点 */
            const requestMessageCount = messages.length

            let result: AgentRoundResult

            try {
                result = await this.transport.runRound({
                    model: this.config.default_model,
                    system,
                    messages: metaUserMessage ? [metaUserMessage, ...messages] : messages,
                    // tools 全程声明，绝不按轮次撤掉（撤掉会触发上游的文本工具语法泄露，见文件头说明）
                    tools: toolDefinitions,
                    temperature: this.config.default_temperature,
                    maxTokens: this.config.default_max_tokens,
                    sessionId: this.sessionId ?? undefined,
                    handlers: {
                        onText: text => callbacks.onDelta?.(text, "content"),
                        onThinking: text => callbacks.onDelta?.(text, "reasoning"),
                    },
                    isInterrupted: () => this.interrupted,
                })
            } catch (error) {
                // 已经流出去的内容不能丢：先把思考收束，再交给上层报错
                flushReasoning()
                throw error
            }

            const content = result.text
            state.reasoningText += result.thinking
            state.reply += content

            // 真实用量回传：刷新锚点（下次估算从这里起算增量）并交给上层统计
            if (result.usage) {
                state.usageAnchor = {
                    tokens: result.usage.inputTokens + result.usage.outputTokens,
                    messageCount: requestMessageCount,
                }
                callbacks.onUsage?.(result.usage)
            }

            if (this.interrupted) {
                flushReasoning()
                return { reply: state.reply, traces, reasonings }
            }

            const calls = result.toolCalls

            if (!calls.length) {
                // 正文被输出上限截断时，上游以 length 收流，这里接着要一段续写，
                // 否则用户看到的就是半句话。已产出的正文先作为助手消息回灌，模型才知道从哪里接。
                if (result.finishReason === "length" && content.trim() && continuations < maxContinuations) {
                    continuations++
                    flushReasoning()
                    callbacks.onReasoningEnd?.([])
                    messages.push({ role: "assistant", text: content.trim(), thinking: result.thinking, toolCalls: [] })
                    messages.push({ role: "user", text: CONTINUATION_PROMPT })
                    console.warn(this.describe(`回复触达输出上限，已自动续写（${continuations}）`))
                    continue
                }

                // 没有工具调用说明本轮就是最终回答，收束最后一段思考
                flushReasoning()
                callbacks.onReasoningEnd?.([])
                return { reply: state.reply, traces, reasonings }
            }

            // 这一轮思考的落点就是下面这批工具调用，先把思考收束并关联起来
            const roundCallIds = calls.map(call => call.id)

            flushReasoning(roundCallIds)
            callbacks.onReasoningEnd?.(roundCallIds)

            // 回灌助手轮（携带工具调用）与工具结果，进入下一轮。
            // 注意：挂起型工具的结果**不在这里**推送，它要等外部输入由 resolvePending 补上；
            // 其余工具结果照常回灌，保证「一次提问 + 若干工具」同时发生时上下文依然完整。
            messages.push({ role: "assistant", text: content.trim(), thinking: result.thinking, toolCalls: calls })

            const toolResults: AgentToolResult[] = []
            /** 本轮第一个挂起型调用（同一轮只允许一个：它需要独占后续的用户回合） */
            let suspended: { call: (typeof calls)[number]; payload: TPayload; summary: string } | null = null
            const groups = scheduleToolCalls(calls, toolMap, this.maxToolConcurrency)

            for (const group of groups) {
                if (this.interrupted) {
                    break
                }

                const executions = await Promise.all(
                    group.map(call => this.executeToolCall(call, toolMap.get(call.name), traces, callbacks, outOfToolRounds))
                )

                for (const execution of executions) {
                    if ("suspended" in execution) {
                        if (suspended) {
                            const duplicate = this.failToolCall(
                                execution.suspended.call,
                                execution.trace,
                                "本轮已经有一个提问，不能同时挂起多个提问",
                                callbacks
                            )
                            toolResults.push(duplicate)
                        } else {
                            suspended = execution.suspended
                        }
                    } else {
                        toolResults.push(execution.result)
                    }
                }

                if (this.interrupted) {
                    break
                }
            }

            if (toolResults.length) {
                messages.push({ role: "user", text: "", toolResults })
            }

            if (suspended && !this.interrupted) {
                // 挂起：保存完整现场，等外部把输入喂回来
                this.pending = {
                    messages,
                    reply: state.reply,
                    traces,
                    reasonings,
                    reasoningText: state.reasoningText,
                    round,
                    usageAnchor: state.usageAnchor,
                    ask: { toolCallId: suspended.call.id, payload: suspended.payload },
                }

                state.round = round
                flushReasoning()
                callbacks.onReasoningEnd?.([])

                return { reply: state.reply, traces, reasonings, pendingAsk: this.pending.ask }
            }

            if (this.interrupted) {
                for (const call of calls) {
                    const trace = traces.find(item => item.id === call.id && item.status === "running")
                    if (trace) {
                        this.failToolCall(call, trace, "工具调用已中断", callbacks)
                    }
                }
                flushReasoning()
                return { reply: state.reply, traces, reasonings }
            }

            if (outOfToolRounds) {
                // 收尾轮已经用过了还在调工具：直接结束，把已产出的正文交给用户
                if (finalTurnUsed) {
                    break
                }

                finalTurnUsed = true
                messages.push({ role: "user", text: FINAL_ANSWER_PROMPT })
                continue
            }

            // 本轮已正常消费，推进轮次
            round++
        }

        return { reply: state.reply, traces, reasonings }
    }
}
