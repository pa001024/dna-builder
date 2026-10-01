/**
 * 通用 Agent 主循环。
 *
 * 「跑一轮 → 拿到工具调用 → 执行 → 回灌」这条循环与具体业务无关：资料检索与配装助手
 * 共用同一份实现，差异全在注入的工具集与提示词上。
 *
 * 循环内置四件事，缺一不可：
 *
 * 1. **工具声明全程在场**。轮次预算用尽也不撤 `tools`——未声明工具 + 思考模式下，
 *    上游会把 `<||DSML|| calls>` 标记当正文下发给用户（对 `api.deepseek.com/anthropic/v1/messages`
 *    A/B 实测：声明 tools 时无论是否开思考都正常返回 tool_use；不声明且开思考则 100% 吐标记）。
 *    超预算的调用改成「额度已用尽」的工具结果回灌，让模型看到明确信号后收尾。
 * 2. **思考按段切分**。每段思考记录它后续发起了哪些工具调用，界面才能按真实顺序还原
 *    「思考 → 工具 → 再思考」。
 * 3. **挂起可恢复**。工具返回 `suspend` 时整个循环状态封存，外部把用户输入喂回来继续。
 * 4. **输出上限续写**。`finishReason === "length"` 时补一段续写，避免用户看到半句话。
 */

import { type AgentUpstreamConfig, createAgentTransport, normalizeAgentUpstreamConfig } from "./config"
import { type AgentTool, type AgentToolOutput, readToolSummary, readToolText } from "./tool"
import {
    type AgentImageAttachment,
    type AgentRoundResult,
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
}

/** 挂起态：运行态 + 待回答的提问 */
interface AgentPendingState<TPayload> extends AgentLoopState {
    /** 对外暴露的提问信息 */
    ask: AgentPendingAsk<TPayload>
}

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
     * 允许的最大工具轮数。
     *
     * 挂起会占用一轮（回答后从下一轮继续），保证循环必然推进，不会出现
     * 「工具一直提问、轮次永不前进」的死循环。默认 30。
     */
    maxToolRounds?: number
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
function toWireMessages(history: readonly AgentHistoryMessage[]): AgentWireMessage[] {
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
    /** 中断标记：置位后当前这一轮会在下一个数据块处停止 */
    private interrupted = false
    /**
     * 挂起现场。
     *
     * 非 null 表示这一轮问答停在「等外部输入」：消息序列、已累积的思考与痕迹都在里面，
     * answerPending() / skipPending() 据此续跑。同一时刻最多一个。
     */
    private pending: AgentPendingState<TPayload> | null = null

    /**
     * 创建主循环。
     * @param options 注入的工具集、提示词与限额
     */
    constructor(options: AgentKernelOptions<TPayload>) {
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

    /** 中断当前流式输出。 */
    public interrupt(): void {
        this.interrupted = true
    }

    /**
     * 运行一轮问答：流式输出 + 多轮工具调用。
     *
     * 若工具请求了挂起（如 ask_user），本方法会在等待处返回（结果带 `pendingAsk`），
     * 之后由 answerPending() / skipPending() 从断点继续同一轮问答。
     * @param history 会话历史（不含本轮回复）
     * @param callbacks 流式与工具回调
     * @returns 最终回复与工具调用记录；挂起时附带 pendingAsk
     */
    public async run(history: readonly AgentHistoryMessage[], callbacks: AgentCallbacks = {}): Promise<AgentRunResult<TPayload>> {
        if (!this.config.api_key) {
            throw new Error(this.describe("缺少 API Key：请在设置页填写密钥，或登录以使用服务端反代"))
        }

        this.interrupted = false
        this.pending = null

        return this.runLoop(
            { messages: toWireMessages(history), reply: "", traces: [], reasonings: [], reasoningText: "", round: 0 },
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
     * @description 取本轮使用的工具清单。
     * @returns 工具清单
     */
    private resolveTools(): readonly AgentTool<TPayload>[] {
        return typeof this.options.tools === "function" ? this.options.tools() : this.options.tools
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
            throw new Error(this.describe("当前没有等待中的提问"))
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
            throw new Error(this.describe("需要先给出回答才能继续"))
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

            let result: AgentRoundResult

            try {
                result = await this.transport.runRound({
                    model: this.config.default_model,
                    system,
                    messages,
                    // tools 全程声明，绝不按轮次撤掉（撤掉会触发上游的文本工具语法泄露，见文件头说明）
                    tools: toolDefinitions,
                    temperature: this.config.default_temperature,
                    maxTokens: this.config.default_max_tokens,
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

            for (const call of calls) {
                const args = parseToolArguments(call.arguments)
                const tool = toolMap.get(call.name)

                const label = this.options.label ? this.options.label(call.name) : call.name

                if (!tool) {
                    toolResults.push({ toolCallId: call.id, content: JSON.stringify({ error: `未知工具 ${call.name}` }), isError: true })
                    continue
                }

                // 工具轮用尽后模型仍发起了调用：不执行，改成一条工具结果告诉它「额度已用尽」。
                // 这样既保留了「工具声明始终在场」这个防泄露前提，又能让模型看到明确信号后收尾。
                if (outOfToolRounds) {
                    const summary = TOOL_BUDGET_EXHAUSTED_HINT

                    traces.push({ id: call.id, name: call.name, label, args, summary, status: "error" })
                    callbacks.onToolTrace?.({ id: call.id, name: call.name, label, args, summary, status: "error" })
                    toolResults.push({ toolCallId: call.id, content: JSON.stringify({ error: summary }), isError: true })
                    continue
                }

                const trace: AgentToolTrace = { id: call.id, name: call.name, label, args, summary: "", status: "running" }

                traces.push(trace)
                callbacks.onToolTrace?.({ ...trace })

                let output: AgentToolOutput<TPayload>

                try {
                    output = await tool.execute(args, { isInterrupted: () => this.interrupted })
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    trace.status = "error"
                    trace.summary = message
                    callbacks.onToolTrace?.({ ...trace })
                    toolResults.push({ toolCallId: call.id, content: JSON.stringify({ error: message }), isError: true })
                    continue
                }

                // 工具自带的摘要覆盖项优先级最高，其次走注入的摘要器（它能看到结果正文）
                const summaryOverride = readToolSummary(output as AgentToolOutput<never>)

                if (output && typeof output === "object" && "suspend" in output) {
                    trace.summary = this.summarizeTool(call.name, args, "", summaryOverride)
                    // 停在 running：这一步的完成与否取决于外部输入，不取决于模型
                    trace.status = "running"
                    callbacks.onToolTrace?.({ ...trace })
                    suspended = { call, payload: (output as { suspend: TPayload }).suspend, summary: trace.summary }
                    continue
                }

                const text = readToolText(output as AgentToolOutput<never>)

                if (!text) {
                    trace.status = "error"
                    trace.summary = this.summarizeTool(call.name, args, "", summaryOverride) || "工具未返回结果"
                    callbacks.onToolTrace?.({ ...trace })
                    toolResults.push({ toolCallId: call.id, content: JSON.stringify({ error: trace.summary }), isError: true })
                    continue
                }

                trace.summary = this.summarizeTool(call.name, args, text.content, summaryOverride)
                trace.status = text.isError ? "error" : "done"
                callbacks.onToolTrace?.({ ...trace })

                toolResults.push({
                    toolCallId: call.id,
                    content: text.content,
                    ...(text.isError ? { isError: true } : {}),
                })
            }

            if (toolResults.length) {
                messages.push({ role: "user", text: "", toolResults })
            }

            if (suspended) {
                // 挂起：保存完整现场，等外部把输入喂回来
                this.pending = {
                    messages,
                    reply: state.reply,
                    traces,
                    reasonings,
                    reasoningText: state.reasoningText,
                    round,
                    ask: { toolCallId: suspended.call.id, payload: suspended.payload },
                }

                state.round = round
                flushReasoning()
                callbacks.onReasoningEnd?.([])

                return { reply: state.reply, traces, reasonings, pendingAsk: this.pending.ask }
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
