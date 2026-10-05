import i18next from "i18next"
import { ref } from "vue"
import { type AgentCompactionOutcome, MIN_ROUNDS_FOR_COMPACT, resolveAutoCompactThreshold } from "@/api/agent/compact"
import { buildContextEstimate } from "@/api/agent/context-usage"
import type { AgentCallbacks, AgentHistoryMessage, AgentKernel, AgentRunResult } from "@/api/agent/kernel"
import { toWireMessages } from "@/api/agent/kernel"
import type { AgentRoundUsage } from "@/api/agent/wire"
import type { MessageReasoning, MessageTokenUsage, MessageToolTrace } from "@/store/db"
import { resolveSharedAgentUpstream, watchAgentUpstream } from "@/utils/agent-upstream"
import type { AskUserRequest, AskUserResponse } from "@/utils/db-ask-user"
import { formatAskUserResponse, hasAskAnswer } from "@/utils/db-ask-user"

/**
 * 资料检索（useDBChat）与配装助手（useBuildChat）的对话状态公共核。
 *
 * 两个入口的对话流是同构的：回调构建 / 耗时累加 / 挂起续跑 / 中断清理 / 错误兜底
 * 完全一致，差别只在会话的存取方式（Dexie 会话表 vs 按角色单条存档）与各自的
 * 错误文案命名空间。这些差异通过 `persist` 钩子与 `errorKeys` 注入，
 * 公共部分收敛在这里，避免两份需要同步维护的平行实现。
 *
 * 上下文用量与压缩也收敛在这里：单轮真实用量（`AgentRoundUsage`）在此聚合成
 * 容量面板快照（used / 窗口 / 分类占比 / 平均缓存命中率）；跨轮压缩由
 * {@link useAgentChatCore.maybeCompactHistory} 编排，压缩边界的落库由宿主的持久化差异决定。
 */

/** 错误兜底文案键：两个 Agent 的 i18n 命名空间不同，由宿主各自指定 */
export interface AgentChatErrorKeys {
    /** 未配置上游（无密钥且未登录） */
    noConfig: string
    /** 非 Error 对象的未知失败 */
    unknown: string
    /** 请求失败的兜底模板（插值 `message`） */
    requestFailed: string
}

/** 公共核要求会话消息满足的最小结构（资料库 Message 与配装 BuildAgentChatMessage 均满足） */
export interface AgentChatCoreMessage {
    id: number
    role: "user" | "assistant" | "system"
    content: string
    toolTraces?: MessageToolTrace[]
    reasonings?: MessageReasoning[]
    processMs?: number
    pendingAsk?: AskUserRequest
    tokenUsage?: MessageTokenUsage
}

/** 容量面板分类的 key（本项目的对话没有 MCP 工具与技能注入，分类收敛为三种） */
export type AgentContextUsageCategoryKey = "messages" | "systemTools" | "systemPrompt"

/** 容量面板的用量快照 */
export interface AgentContextUsageSnapshot {
    /** 已用 tokens：有真实用量时为末次请求的输入 + 输出，否则为本地估算 */
    used: number
    /** 模型上下文窗口（tokens） */
    size: number
    /** used 是否为本地估算值（还没有任何真实用量回传） */
    isEstimate: boolean
    /** 分类占比（0-1，按估算值的相对占比；分类 token 数会误读，因此只给占比） */
    breakdown: Array<{ key: AgentContextUsageCategoryKey; percent: number }>
    /** 平均缓存命中率（0-1）；没有真实用量时为 null */
    cacheHitRate: number | null
    /** 参与命中率统计的请求数 */
    cacheHitRequests: number
}

/** 公共核的注入项 */
export interface AgentChatCoreOptions<M extends AgentChatCoreMessage> {
    /** 底层 Agent 内核（由 createDbAgent / createBuildAgent 创建） */
    agent: AgentKernel<AskUserRequest>
    /**
     * 落库一条助手消息的最终状态。
     * 收尾、挂起、失败兜底与中断清理都会调用；资料库侧顺带刷新会话时间戳，
     * 配装侧落整份会话存档，差异全部收在这一个钩子里。
     */
    persist: (message: M) => Promise<void>
    /** 错误兜底文案键 */
    errorKeys: AgentChatErrorKeys
}

/**
 * @description 创建两个 Agent 对话入口共用的状态与操作。
 * @param options 内核、落库钩子与错误文案键
 * @returns 对话状态（isBusy / liveReasoning / pendingAsk / pendingAskLive）
 *   与公共操作；`send` 由宿主实现后用 bindSend 注入
 */
export function useAgentChatCore<M extends AgentChatCoreMessage>(options: AgentChatCoreOptions<M>) {
    const { agent, persist, errorKeys } = options

    /** 是否正在流式输出 */
    const isBusy = ref(false)
    /** 流式过程中的思考内容（部分模型返回，不落库） */
    const liveReasoning = ref("")
    /**
     * 当前等待用户回答的提问（由 ask_user 触发）。
     *
     * 非 null 时界面展示提问卡片，输入框的提交会被路由成「回答这道题」。
     */
    const pendingAsk = ref<AskUserRequest | null>(null)
    /**
     * 该提问能否续跑原循环。
     *
     * 只有本轮刚挂起（Agent 内存上下文还在）时为 true；从历史消息恢复出来的
     * 提问只能把回答当新一轮提问发出去，因此为 false。
     */
    const pendingAskLive = ref(false)
    /** 挂起期间正在流式的那条助手消息（续跑时继续往它上面追加） */
    let pendingAssistant: M | null = null
    /** 发送一条新提问；宿主组合式函数组装完成后注入，挂起回退要把回答当新提问发出 */
    let sendNew: (text: string) => Promise<void> = () => Promise.resolve()

    /** 是否正在生成压缩摘要（压缩请求不走对话流，用独立标记驱动面板状态） */
    const isCompacting = ref(false)
    /** 容量面板快照；null 表示当前会话还没有可展示的用量 */
    const contextUsage = ref<AgentContextUsageSnapshot | null>(null)
    /**
     * 主回合请求的缓存命中聚合：命中率 = ΣcacheRead / Σinput（分母是含缓存的输入总量），
     * 与 ZCode 的口径一致。跨会话切换由 resetContextUsage 清零、seedContextCacheFromMessages 恢复。
     */
    const cacheAggregate = { input: 0, cacheRead: 0, count: 0 }
    /** 最近一次真实请求的上下文占用（输入 + 输出）；null 表示尚无真实用量 */
    let lastProviderUsed: number | null = null

    /**
     * 注入「发送新提问」的实现（宿主的 send）。
     * @param send 宿主的发送函数
     */
    function bindSend(send: (text: string) => Promise<void>): void {
        sendNew = send
    }

    /**
     * 清掉挂起态（切换会话 / 新建会话时调用）。
     *
     * 挂起的提问只在它产生的那次运行里有意义：换会话后 Agent 上下文不在了，
     * 留着只会让界面出现一张点了没反应的卡片。
     */
    function clearPendingAsk(): void {
        pendingAsk.value = null
        pendingAskLive.value = false
        pendingAssistant = null
        agent.clearPending()
    }

    /**
     * 构造一轮运行需要的回调集合。
     *
     * 思考分段的约定：`liveReasoning` 承载正在流式的那一段，只有收尾时才固化进
     * `reasonings`，保证渲染层「历史段 + 实时段」不重叠。
     *
     * 用量收集约定：`onUsage` 每次模型请求触发一次，输出累加、输入与缓存取末次请求
     * （输入是上下文规模的口径，不是各轮之和），同时更新容量面板的缓存命中率。
     * @param message 本轮的助手消息（流式内容直接追加到它上面）
     * @param reasonings 本轮已固化的思考分段
     * @returns Agent 回调与「收取本次运行用量」的收集器
     */
    function buildCallbacks(
        message: M,
        reasonings: MessageReasoning[]
    ): { callbacks: AgentCallbacks; collectTokenUsage: () => MessageTokenUsage | null } {
        /** 本次运行累计的输出 tokens（多轮工具调用求和） */
        let outputTokens = 0
        /** 末次真实用量（输入与缓存命中取末次口径） */
        let lastUsage: AgentRoundUsage | null = null

        const callbacks: AgentCallbacks = {
            onDelta: (chunk, type) => {
                if (type === "reasoning") {
                    // 实时段只更新 liveReasoning，不进 reasonings（避免与流式展示重复）
                    liveReasoning.value += chunk
                    return
                }

                message.content += chunk
            },
            onToolTrace: (trace: MessageToolTrace) => {
                const traces = message.toolTraces ?? (message.toolTraces = [])
                const index = traces.findIndex(item => item.id === trace.id)

                if (index >= 0) {
                    traces[index] = trace
                } else {
                    traces.push(trace)
                }
            },
            onReasoningEnd: toolCallIds => {
                const text = liveReasoning.value

                if (text.trim()) {
                    reasonings.push({ text, toolCallIds })
                }

                liveReasoning.value = ""
            },
            onUsage: usage => {
                outputTokens += usage.outputTokens
                lastUsage = usage

                cacheAggregate.input += usage.inputTokens
                cacheAggregate.cacheRead += usage.cacheReadTokens
                cacheAggregate.count += 1
                lastProviderUsed = usage.inputTokens + usage.outputTokens
                publishUsageUpdate()
            },
        }

        return {
            callbacks,
            collectTokenUsage: () => {
                if (!lastUsage && outputTokens <= 0) {
                    return null
                }

                return {
                    input: lastUsage?.inputTokens ?? 0,
                    output: outputTokens,
                    ...(lastUsage?.cacheReadTokens ? { cacheRead: lastUsage.cacheReadTokens } : {}),
                }
            },
        }
    }

    /**
     * 把本次运行收集到的真实用量合并到消息上（挂起续跑时输出累加、输入以末次为准）。
     * @param message 助手消息
     * @param collect 用量收集器（回调构建失败等场景下可能为 null，此时保持原值）
     */
    function recordTokenUsage(message: M, collect: (() => MessageTokenUsage | null) | null): void {
        const usage = collect?.()

        if (usage) {
            message.tokenUsage = mergeTokenUsage(message.tokenUsage, usage)
        }
    }

    /**
     * 合并两份消息用量：输出求和，输入与缓存命中取「本次优先」的末次口径。
     * @param previous 消息上已有的用量（挂起续跑前可能已落库一次）
     * @param incoming 本次运行的用量
     * @returns 合并后的用量
     */
    function mergeTokenUsage(previous: MessageTokenUsage | undefined, incoming: MessageTokenUsage): MessageTokenUsage {
        const input = incoming.input || previous?.input || 0
        const output = (previous?.output ?? 0) + incoming.output
        const cacheRead = incoming.cacheRead || previous?.cacheRead || 0

        return { input, output, ...(cacheRead > 0 ? { cacheRead } : {}) }
    }

    /**
     * 把一次运行的总耗时记到消息上。
     *
     * 分多次运行（ask_user 挂起后继续）时累加，且只在模型真正在工作的区间累加，
     * 用户作答的等待时间不计入。
     * @param message 助手消息
     * @param startedAt 本次运行开始的毫秒时间戳
     */
    function addProcessMs(message: M, startedAt: number) {
        message.processMs = (message.processMs ?? 0) + (Date.now() - startedAt)
    }

    /**
     * 处理一轮运行结果：写入回复与思考分段，并根据是否挂起更新提问态，最后落库。
     * @param message 本轮的助手消息
     * @param result Agent 运行结果
     */
    async function consumeResult(message: M, result: AgentRunResult<AskUserRequest>): Promise<void> {
        message.content = result.reply || message.content

        // 收尾后以内核返回的分段结果为准（含每段思考关联的工具调用）；
        // 内核返回为空（异常/中断）时退回本地累积的段落，保证思考内容不丢
        if (result.reasonings?.length) {
            message.reasonings = result.reasonings
        }

        if (result.pendingAsk) {
            // 挂起：记下提问与续跑所需的现场，界面据此展示提问卡片
            pendingAsk.value = result.pendingAsk.payload
            pendingAskLive.value = true
            message.pendingAsk = result.pendingAsk.payload
            pendingAssistant = message
            liveReasoning.value = ""
            await persist(message)
            return
        }

        pendingAsk.value = null
        pendingAskLive.value = false
        pendingAssistant = null
        message.pendingAsk = undefined

        await persist(message)
    }

    /**
     * 跑一轮问答的统一外壳：上游预检 → 运行 → 耗时累加 → 收尾落库；失败时把错误
     * 写进助手消息正文并落库，供界面展示。
     *
     * 思考分段数组在这里创建并挂到消息上，回调经 buildCallbacks 交给 `run`。
     * @param message 本轮的助手消息（必须已在消息列表里）
     * @param startedAt 本次运行开始的毫秒时间戳
     * @param run 真正调用内核的动作，拿到组装好的回调
     * @param hooks 宿主侧的收尾钩子（成功清标记 / 失败记重试 / 结束后刷会话）
     */
    async function runAgentTurn(
        message: M,
        startedAt: number,
        run: (callbacks: AgentCallbacks) => Promise<AgentRunResult<AskUserRequest>>,
        hooks?: {
            /** 运行成功后的宿主收尾（如清除重试标记） */
            onSuccess?: () => void
            /** 失败时的宿主收尾（如记录失败提问供重试） */
            onFail?: () => void
            /** 无论成败的宿主收尾（如更新会话时间戳与名称） */
            onSettled?: () => Promise<void> | void
        }
    ): Promise<void> {
        isBusy.value = true
        liveReasoning.value = ""

        // 本轮的各段思考：正在流式的那段不入数组（由 liveReasoning 承载），
        // 只有收尾（onReasoningEnd / 该段后跟了工具调用）时才落进 reasonings，
        // 这样渲染层「历史段 + 实时段」天然不重叠，不会出现两个思考块
        const reasonings: MessageReasoning[] = []
        message.reasonings = reasonings

        /** 用量收集器：回调构建后才可用；失败路径也要能收取已到达的真实用量 */
        let collectTokenUsage: (() => MessageTokenUsage | null) | null = null

        try {
            // 既没有自己的密钥又未登录时服务端代理不可用，直接给出可操作提示，不打无谓的请求
            if (!resolveSharedAgentUpstream()) {
                throw new Error(i18next.t(errorKeys.noConfig))
            }

            const built = buildCallbacks(message, reasonings)
            collectTokenUsage = built.collectTokenUsage
            const result = await run(built.callbacks)
            recordTokenUsage(message, collectTokenUsage)
            addProcessMs(message, startedAt)
            hooks?.onSuccess?.()
            await consumeResult(message, result)
        } catch (error) {
            const reason = error instanceof Error ? error.message : i18next.t(errorKeys.unknown)
            message.content = message.content || i18next.t(errorKeys.requestFailed, { message: reason })

            // 失败前可能已经收到过真实用量（流式中途断开等），照常合并
            recordTokenUsage(message, collectTokenUsage)
            addProcessMs(message, startedAt)
            hooks?.onFail?.()
            await persist(message)
        } finally {
            isBusy.value = false
            liveReasoning.value = ""
            await hooks?.onSettled?.()
        }
    }

    /**
     * 用一段自由文本回答当前挂起的提问（输入框提交时走这里）。
     *
     * 文本挂到第一道允许自由输入的题上；一道都没有时退回「当作新一轮提问发出去」，
     * 保证输入框永远有出路，不会把用户卡死。
     * @param text 用户输入的文本
     */
    async function answerPendingAsText(text: string): Promise<void> {
        const request = pendingAsk.value

        if (!request) {
            return
        }

        const question = request.questions.find(item => item.allowCustom) ?? request.questions[0]

        if (!question?.allowCustom) {
            // 没有任何题接受自由输入：清掉挂起态，把这段文字当新一轮提问
            pendingAsk.value = null
            pendingAskLive.value = false
            pendingAssistant = null
            await sendNew(text)
            return
        }

        await answerAsk({ requestId: request.id, answers: [{ questionId: question.id, optionIds: [], custom: text }] })
    }

    /**
     * 回答当前挂起的提问并继续运行。
     *
     * 能续跑时（本轮刚挂起）直接回到原循环继续；从历史恢复出来的提问
     * 没有 Agent 上下文，退化为把回答拼成一句自然语言当新一轮提问发出去。
     * @param response 用户回答
     */
    async function answerAsk(response: AskUserResponse): Promise<void> {
        const request = pendingAsk.value
        const target = pendingAssistant

        if (!request) {
            return
        }

        // 防御：既没选也没填（界面已禁用提交，这里兜住异常输入）
        if (!response.skipped && !hasAskAnswer(request, response)) {
            return
        }

        if (!pendingAskLive.value || !target) {
            // 历史恢复的提问：Agent 上下文已丢失，把回答作为新一轮提问发出
            pendingAsk.value = null
            pendingAskLive.value = false
            pendingAssistant = null

            if (target) {
                target.pendingAsk = undefined
                await persist(target)
            }

            await sendNew(formatAskUserResponse(request, response))
            return
        }

        isBusy.value = true
        liveReasoning.value = ""
        pendingAsk.value = null

        const reasonings: MessageReasoning[] = target.reasonings ?? []
        target.reasonings = reasonings

        const built = buildCallbacks(target, reasonings)
        const startedAt = Date.now()

        try {
            if (!resolveSharedAgentUpstream()) {
                throw new Error(i18next.t(errorKeys.noConfig))
            }

            const result = await agent.answerPending(response, built.callbacks)
            recordTokenUsage(target, built.collectTokenUsage)
            addProcessMs(target, startedAt)
            await consumeResult(target, result)
        } catch (error) {
            const reason = error instanceof Error ? error.message : i18next.t(errorKeys.unknown)
            target.content = target.content || i18next.t(errorKeys.requestFailed, { message: reason })

            recordTokenUsage(target, built.collectTokenUsage)
            addProcessMs(target, startedAt)
            await persist(target)
        } finally {
            isBusy.value = false
            liveReasoning.value = ""
        }
    }

    /**
     * 跳过当前挂起的提问，让模型基于已有信息继续。
     */
    async function skipAsk(): Promise<void> {
        const request = pendingAsk.value

        if (!request) {
            return
        }

        await answerAsk({ requestId: request.id, answers: [], skipped: true })
    }

    /**
     * 中断当前输出。
     *
     * 挂起等答时中断等于放弃这次提问：清掉挂起态，避免界面上留一张点不动的卡片。
     */
    function interrupt() {
        agent.interrupt()

        if (pendingAsk.value) {
            pendingAsk.value = null
            pendingAskLive.value = false

            if (pendingAssistant) {
                pendingAssistant.pendingAsk = undefined
                void persist(pendingAssistant)
            }

            pendingAssistant = null
        }
    }

    // 设置或登录状态变化时同步 Agent 配置（换账号 / 登录 / 退出都要重新解析代理凭证）
    watchAgentUpstream(config => agent.updateConfig(config))

    /**
     * 把最新的真实用量（若有）合并进当前快照：更新 used 与缓存命中率，分类占比保持不变
     * （分类占比来自估算，只有重建历史时才有意义重算）。
     */
    function publishUsageUpdate(): void {
        const snapshot = contextUsage.value

        if (!snapshot) {
            return
        }

        const rate = cacheAggregate.input > 0 ? cacheAggregate.cacheRead / cacheAggregate.input : null

        contextUsage.value = {
            ...snapshot,
            ...(lastProviderUsed !== null ? { used: lastProviderUsed, isEstimate: false } : {}),
            cacheHitRate: rate,
            cacheHitRequests: cacheAggregate.count,
        }
    }

    /**
     * 依据当前历史重建用量快照（分类占比按本地估算；used 优先用真实用量锚点）。
     * @param history 当前会话的回灌历史（不含本轮提问）
     * @param options.dropProviderAnchor true 时丢弃真实用量锚点（压缩后上下文骤降，
     *   旧锚点不再代表当前水位；缓存命中率的累计不受影响，继续保留）
     */
    function refreshContextUsage(history: readonly AgentHistoryMessage[], options: { dropProviderAnchor?: boolean } = {}): void {
        if (options.dropProviderAnchor) {
            lastProviderUsed = null
        }

        const info = agent.getContextInfo()
        const estimate = buildContextEstimate({ system: info.system, tools: info.tools, messages: toWireMessages(history) })
        const categories = estimate.categories
        const total = categories.messages + categories.systemTools + categories.systemPrompt

        const rate = cacheAggregate.input > 0 ? cacheAggregate.cacheRead / cacheAggregate.input : null

        contextUsage.value = {
            used: lastProviderUsed ?? estimate.total,
            size: info.contextWindow,
            isEstimate: lastProviderUsed === null,
            breakdown: (["messages", "systemTools", "systemPrompt"] as const).map(key => ({
                key,
                percent: total > 0 ? categories[key] / total : 0,
            })),
            cacheHitRate: rate,
            cacheHitRequests: cacheAggregate.count,
        }
    }

    /**
     * 重置用量状态（切换会话 / 新建会话时调用）。
     *
     * 真实用量锚点与缓存聚合都要清零：它们只对产生它们的会话有意义。
     */
    function resetContextUsage(): void {
        lastProviderUsed = null
        cacheAggregate.input = 0
        cacheAggregate.cacheRead = 0
        cacheAggregate.count = 0
        contextUsage.value = null
    }

    /**
     * 从落库的 tokenUsage 恢复真实用量锚点与缓存聚合（刷新 / 切换会话后调用）。
     *
     * 必须在 resetContextUsage 之后调用，否则会重复累计；每条带用量的助手消息
     * 记录的是「该轮收尾时的上下文规模」，逐条回放后末条即当前锚点。
     * @param messages 已加载的消息列表
     */
    function seedContextCacheFromMessages(messages: ReadonlyArray<{ tokenUsage?: MessageTokenUsage | null }>): void {
        for (const message of messages) {
            const usage = message.tokenUsage

            if (!usage || !(usage.input > 0 || usage.output > 0)) {
                continue
            }

            cacheAggregate.input += usage.input
            cacheAggregate.cacheRead += usage.cacheRead ?? 0
            cacheAggregate.count += 1
            lastProviderUsed = usage.input + usage.output
        }

        if (contextUsage.value && lastProviderUsed !== null) {
            publishUsageUpdate()
        }
    }

    /**
     * 跨轮上下文压缩编排：估算当前历史，达到压缩阈值（或 force）时生成摘要。
     *
     * 摘要请求与普通请求同一形态（工具声明在场 + 思考开启，见 compact.ts 文件头），
     * 由内核的 compactHistory 执行；压缩边界如何落库由宿主决定（两边存取结构不同）。
     * @param history 当前会话的回灌历史（不含本轮提问）
     * @param options.force true 时无视阈值强制压缩（面板「压缩历史」按钮）
     * @returns 压缩结果；无需压缩 / 忙碌 / 压缩失败时 null
     */
    async function maybeCompactHistory(
        history: readonly AgentHistoryMessage[],
        options: { force?: boolean } = {}
    ): Promise<AgentCompactionOutcome | null> {
        if (isBusy.value || isCompacting.value) {
            return null
        }

        refreshContextUsage(history)

        const snapshot = contextUsage.value
        const info = agent.getContextInfo()
        const threshold = resolveAutoCompactThreshold(info.contextWindow, info.maxTokens)
        const assistantCount = history.filter(message => message.role === "assistant").length

        if (!snapshot || (!options.force && (snapshot.used < threshold || assistantCount < MIN_ROUNDS_FOR_COMPACT))) {
            return null
        }

        isCompacting.value = true

        try {
            // 压缩失败向上抛出：发送路径的预检会兜住并降级为「本次不压缩」，
            // 手动压缩路径据此给用户失败反馈
            return await agent.compactHistory(history)
        } finally {
            isCompacting.value = false
        }
    }

    return {
        isBusy,
        liveReasoning,
        pendingAsk,
        pendingAskLive,
        isCompacting,
        contextUsage,
        bindSend,
        clearPendingAsk,
        addProcessMs,
        runAgentTurn,
        answerPendingAsText,
        answerAsk,
        skipAsk,
        interrupt,
        refreshContextUsage,
        resetContextUsage,
        seedContextCacheFromMessages,
        maybeCompactHistory,
    }
}
