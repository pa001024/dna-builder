import { computed, ref, watch } from "vue"
import { DBAgent, type DBAgentCallbacks, type DBAgentHistoryMessage, type DBAgentRunResult, type DBAgentToolTrace } from "@/api/dbAgent"
import type { OpenAIConfig } from "@/api/openai"
import { env } from "@/env"
import { type Conversation, db, type Message, type MessageReasoning, type UConversation, type UMessage } from "@/store/db"
import { useSettingStore } from "@/store/setting"
import { useUserStore } from "@/store/user"
import type { AskUserRequest, AskUserResponse } from "@/utils/db-ask-user"
import { formatAskUserResponse, hasAskAnswer } from "@/utils/db-ask-user"
import { htmlToText } from "@/utils/html"
import { isHashRouterMode, renderMarkdown } from "@/utils/markdown"
import { parseRichComponents } from "@/utils/rich-component"

/**
 * 资料库对话状态：会话列表 + 消息流 + 资料检索 Agent 调用。
 *
 * 会话与消息沿用项目既有的 Dexie 表（conversations / messages），
 * 因此历史对话与其它 AI 功能共享同一份本地数据。
 */

/** 新会话的默认名称 */
const DEFAULT_CONVERSATION_NAME = "新对话"

/** 会话名称取用户首条提问的前若干字符 */
const CONVERSATION_NAME_LENGTH = 18

/** 服务端代理使用的模型（服务端也会强制覆盖成同一个，这里只是让请求体看起来一致） */
const PROXY_MODEL = "deepseek-flash"

/**
 * 资料库对话组合式函数。
 * @returns 会话状态与操作方法
 */
export function useDBChat() {
    const setting = useSettingStore()
    const user = useUserStore()

    /**
     * 解析资料检索 Agent 的运行配置。
     * 优先用设置页里用户自己的 AI 密钥；没有密钥时回退到服务端代理
     * （`/api/v1` 按登录账号计费，每人每天 0.5 元，凭证就是登录令牌）。
     * @returns 可用配置；既没有密钥又未登录时返回 null（此时无法发起检索）
     */
    function resolveAgentConfig(): Partial<OpenAIConfig> | null {
        if (setting.aiApiKey?.trim()) {
            return setting.getOpenAIConfig()
        }

        if (!user.jwtToken) {
            return null
        }

        return {
            api_key: user.jwtToken,
            base_url: `${env.apiEndpoint}/api/v1`,
            default_model: PROXY_MODEL,
            default_temperature: setting.aiTemperature,
            default_max_tokens: setting.aiMaxTokens,
        }
    }

    // 没有可用配置时也先建一个空密钥实例，真正的拦截放在 send() 里给出可操作的提示
    const agent = new DBAgent(resolveAgentConfig() ?? { api_key: "" })

    /** 会话列表（按更新时间倒序） */
    const conversations = ref<Conversation[]>([])
    /** 会话列表是否已从 Dexie 加载完成（用于页面恢复对话态前的等待） */
    const isConversationLoading = ref(true)
    /** 当前会话 id，0 表示尚未建立会话 */
    const activeConversationId = ref(0)
    /** 当前会话的消息列表 */
    const messages = ref<Message[]>([])
    /** 是否正在检索（流式输出中） */
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
    let pendingAssistant: { message: Message; id: number; conversationId: number } | null = null

    const activeConversation = computed(() => conversations.value.find(item => item.id === activeConversationId.value) ?? null)
    const hasMessages = computed(() => messages.value.length > 0)

    /**
     * 加载会话列表并按更新时间倒序排序。
     */
    async function loadConversations() {
        try {
            const list = await db.conversations.toArray()
            conversations.value = list.sort((a, b) => b.updatedAt - a.updatedAt)
        } catch (error) {
            console.error("加载会话列表失败:", error)
        } finally {
            isConversationLoading.value = false
        }
    }

    /**
     * 加载指定会话的消息。
     *
     * 助手消息会顺带解析成 HTML（含特殊组件的剥离与站内链接的模式适配），
     * 保证历史消息与实时消息的渲染结果一致。
     * @param conversationId 会话 id
     */
    async function loadMessages(conversationId: number) {
        try {
            const list = await db.messages.where("conversationId").equals(conversationId).toArray()
            messages.value = list
                .sort((a, b) => a.id - b.id)
                .map(message => ({
                    ...message,
                    // 助手消息交给组件按「内容快照」自行渲染（需要特殊组件占位）
                    renderedContent: message.role === "assistant" ? undefined : renderMarkdown(message.content, isHashRouterMode()),
                    renderedContentSource: message.role === "assistant" ? undefined : message.content,
                }))
        } catch (error) {
            console.error("加载会话消息失败:", error)
        }
    }

    /**
     * 创建新会话。
     * @param name 会话名称，缺省为「新对话」
     * @returns 新会话 id
     */
    async function createConversation(name = DEFAULT_CONVERSATION_NAME) {
        const now = Date.now()
        const record: UConversation = { name, createdAt: now, updatedAt: now }
        const id = await db.conversations.add(record)

        conversations.value = [{ ...record, id }, ...conversations.value]
        activeConversationId.value = id
        messages.value = []

        return id
    }

    /**
     * 开始一个新会话（清空当前会话视图，不删除历史）。
     */
    async function startNewConversation() {
        if (isBusy.value) {
            return
        }

        activeConversationId.value = 0
        messages.value = []
        liveReasoning.value = ""
        clearPendingAsk()
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
     * 切换到指定会话。
     * @param conversation 目标会话
     */
    async function selectConversation(conversation: Conversation) {
        if (isBusy.value || conversation.id === activeConversationId.value) {
            return
        }

        activeConversationId.value = conversation.id
        liveReasoning.value = ""
        clearPendingAsk()
        await loadMessages(conversation.id)
    }

    /**
     * 把整个会话导出成可粘贴的纯文本。
     * 用户提问按原样输出，助手回复去掉 markdown 标记后再输出，
     * 便于直接贴给别人的对话记录里不夹带 `##` / `**` 之类的语法噪声。
     * @param conversation 目标会话
     * @returns 会话纯文本；没有任何有效消息时返回空串
     */
    async function exportConversationText(conversation: Conversation): Promise<string> {
        const list = await db.messages.where("conversationId").equals(conversation.id).toArray()
        const sections: string[] = []

        for (const message of list.sort((a, b) => a.id - b.id)) {
            // 助手回复先剥离特殊组件标签：导出的是纯文本，不能把 `<ResourceCostItem/>` 原样带出去
            const source = message.role === "assistant" ? parseRichComponents(message.content).markdown : message.content
            const content = message.role === "assistant" ? htmlToText(renderMarkdown(source, isHashRouterMode())).trim() : source.trim()

            if (!content) {
                continue
            }

            sections.push(`${message.role === "user" ? "我" : "资料检索"}：${content}`)
        }

        return sections.length ? `${conversation.name}\n\n${sections.join("\n\n")}` : ""
    }

    /**
     * 删除会话及其消息。
     * @param conversation 目标会话
     */
    async function removeConversation(conversation: Conversation) {
        if (isBusy.value) {
            return
        }

        await db.messages.where("conversationId").equals(conversation.id).delete()
        await db.conversations.delete(conversation.id)

        if (activeConversationId.value === conversation.id) {
            activeConversationId.value = 0
            messages.value = []
        }

        await loadConversations()
    }

    /**
     * 更新会话时间戳与名称（首条提问自动命名）。
     * @param conversationId 会话 id
     * @param name 可选的新名称
     */
    async function touchConversation(conversationId: number, name?: string) {
        const patch: Partial<Conversation> = { updatedAt: Date.now() }

        if (name) {
            patch.name = name
        }

        await db.conversations.update(conversationId, patch)

        const target = conversations.value.find(item => item.id === conversationId)
        if (target) {
            target.updatedAt = patch.updatedAt ?? target.updatedAt
            target.name = patch.name ?? target.name
        }

        conversations.value = [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt)
    }

    /**
     * 构造一轮运行需要的回调集合。
     *
     * 思考分段的约定见 send 内的注释：`liveReasoning` 承载正在流式的那一段，
     * 只有收尾时才固化进 `reasonings`，保证渲染层「历史段 + 实时段」不重叠。
     * @param assistantMessage 本轮的助手消息（流式内容直接追加到它上面）
     * @param reasonings 本轮已固化的思考分段
     * @returns Agent 回调
     */
    function buildCallbacks(assistantMessage: Message, reasonings: MessageReasoning[]): DBAgentCallbacks {
        return {
            onDelta: (chunk, type) => {
                if (type === "reasoning") {
                    // 实时段只更新 liveReasoning，不进 reasonings（避免与流式展示重复）
                    liveReasoning.value += chunk
                    return
                }

                assistantMessage.content += chunk
            },
            onToolTrace: (trace: DBAgentToolTrace) => {
                const traces = assistantMessage.toolTraces ?? (assistantMessage.toolTraces = [])
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
        }
    }

    /**
     * 落库一条助手消息的最终状态。
     * @param assistantId 消息 id
     * @param assistantMessage 消息内容
     */
    async function persistAssistant(assistantId: number, assistantMessage: Message) {
        // 助手消息的 HTML 由 DBChatMessages 按内容快照自行渲染（要处理特殊组件占位），
        // 这里只清缓存标记，强制它用最终内容重渲染一次
        assistantMessage.renderedContent = undefined
        assistantMessage.renderedContentSource = undefined

        await db.messages.update(assistantId, {
            content: assistantMessage.content,
            toolTraces: assistantMessage.toolTraces,
            reasonings: assistantMessage.reasonings,
            pendingAsk: assistantMessage.pendingAsk,
        })
    }

    /**
     * 处理本轮运行结果：写入回复、落库，并根据是否挂起更新提问态。
     * @param target 本轮的助手消息与其 id
     * @param result Agent 运行结果
     */
    async function consumeResult(
        target: { message: Message; id: number; conversationId: number },
        result: DBAgentRunResult
    ): Promise<void> {
        const { message: assistantMessage, id: assistantId, conversationId } = target

        assistantMessage.content = result.reply || assistantMessage.content
        // 收尾后以 agent 返回的分段结果为准（含每段思考关联的工具调用）；
        // agent 返回为空（异常/中断）时退回本地累积的段落，保证思考内容不丢
        if (result.reasonings?.length) {
            assistantMessage.reasonings = result.reasonings
        }

        if (result.pendingAsk) {
            // 挂起：记下提问与续跑所需的现场，界面据此展示提问卡片
            pendingAsk.value = result.pendingAsk.request
            pendingAskLive.value = true
            assistantMessage.pendingAsk = result.pendingAsk.request
            pendingAssistant = target

            await persistAssistant(assistantId, assistantMessage)
            await touchConversation(conversationId)
            liveReasoning.value = ""
            return
        }

        pendingAsk.value = null
        pendingAskLive.value = false
        pendingAssistant = null
        assistantMessage.pendingAsk = undefined

        await persistAssistant(assistantId, assistantMessage)
        await touchConversation(conversationId)
    }

    /**
     * 发送提问：写入用户消息 → 调用资料检索 Agent → 流式写入回复。
     * @param rawText 用户输入
     */
    async function send(rawText: string) {
        const text = rawText.trim()

        if (!text || isBusy.value) {
            return
        }

        // 挂起期间输入框的提交被路由成「用这段文字回答当前提问」，
        // 这样用户既能点选项，也能直接打字作答，不必非走卡片。
        if (pendingAsk.value) {
            await answerPendingAsText(text)
            return
        }

        // 首次提问时按提问内容命名会话
        const conversationId = activeConversationId.value || (await createConversation(text.slice(0, CONVERSATION_NAME_LENGTH)))
        const isFirstMessage = !messages.value.some(message => message.role === "user")

        const userMessage: UMessage = { conversationId, role: "user", content: text, createdAt: Date.now() }
        const userId = await db.messages.add(userMessage)
        messages.value.push({
            ...userMessage,
            id: userId,
            renderedContent: renderMarkdown(text, isHashRouterMode()),
            renderedContentSource: text,
        })

        const assistantRecord: UMessage = { conversationId, role: "assistant", content: "", createdAt: Date.now() }
        const assistantId = await db.messages.add(assistantRecord)
        const assistantMessage: Message = { ...assistantRecord, id: assistantId, toolTraces: [] }
        messages.value.push(assistantMessage)

        isBusy.value = true
        liveReasoning.value = ""

        // 本轮的各段思考：一段思考结束后（onReasoningEnd），后续增量另起一段。
        // 约定：**正在流式的那一段不入数组**，它只由 liveReasoning 承载；
        // 只有收尾（onReasoningEnd / 该段后跟了工具调用）时才落进 reasonings。
        // 这样渲染层「历史段 + 实时段」天然不重叠，不会出现两个思考块。
        const reasonings: MessageReasoning[] = []
        assistantMessage.reasonings = reasonings

        // 历史消息（不含本轮占位的助手消息）
        const history: DBAgentHistoryMessage[] = messages.value
            .filter(message => message.id !== assistantId && message.role !== "system" && message.content.trim())
            .map(message => ({ role: message.role === "user" ? "user" : "assistant", content: message.content }))

        const target = { message: assistantMessage, id: assistantId, conversationId }

        try {
            // 既没有自己的密钥又未登录时服务端代理不可用，直接给出可操作提示，不打无谓的请求
            if (!resolveAgentConfig()) {
                throw new Error("请先登录后再使用资料检索，或在设置中填写自己的 AI 密钥")
            }

            const result = await agent.run(history, buildCallbacks(assistantMessage, reasonings))

            await consumeResult(target, result)
        } catch (error) {
            const message = error instanceof Error ? error.message : "未知错误"
            assistantMessage.content = assistantMessage.content || `检索失败：${message}`

            await persistAssistant(assistantId, assistantMessage)
        } finally {
            isBusy.value = false
            liveReasoning.value = ""
            await touchConversation(conversationId, isFirstMessage ? text.slice(0, CONVERSATION_NAME_LENGTH) : undefined)
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

        if (!question || !question.allowCustom) {
            // 没有任何题接受自由输入：清掉挂起态，把这段文字当新一轮提问
            pendingAsk.value = null
            pendingAskLive.value = false
            pendingAssistant = null
            await send(text)
            return
        }

        await answerAsk({ requestId: request.id, answers: [{ questionId: question.id, optionIds: [], custom: text }] })
    }

    /**
     * 回答当前挂起的提问并继续检索。
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
                target.message.pendingAsk = undefined
                await persistAssistant(target.id, target.message)
            }

            await send(formatAskUserResponse(request, response))
            return
        }

        isBusy.value = true
        liveReasoning.value = ""
        pendingAsk.value = null

        const reasonings: MessageReasoning[] = target.message.reasonings ?? []
        target.message.reasonings = reasonings

        try {
            if (!resolveAgentConfig()) {
                throw new Error("请先登录后再使用资料检索，或在设置中填写自己的 AI 密钥")
            }

            const result = await agent.answerAsk(response, buildCallbacks(target.message, reasonings))

            await consumeResult(target, result)
        } catch (error) {
            const message = error instanceof Error ? error.message : "未知错误"
            target.message.content = target.message.content || `检索失败：${message}`

            await persistAssistant(target.id, target.message)
        } finally {
            isBusy.value = false
            liveReasoning.value = ""
        }
    }

    /**
     * 跳过当前挂起的提问，让模型基于已有信息继续检索。
     */
    async function skipAsk(): Promise<void> {
        const request = pendingAsk.value

        if (!request) {
            return
        }

        await answerAsk({ requestId: request.id, answers: [], skipped: true })
    }

    /**
     * 中断当前检索。
     *
     * 挂起等答时中断等于放弃这次提问：清掉挂起态，避免界面上留一张点不动的卡片。
     */
    function interrupt() {
        agent.interrupt()

        if (pendingAsk.value) {
            pendingAsk.value = null
            pendingAskLive.value = false

            if (pendingAssistant) {
                pendingAssistant.message.pendingAsk = undefined
                void persistAssistant(pendingAssistant.id, pendingAssistant.message)
            }

            pendingAssistant = null
        }
    }

    // 设置或登录状态变化时同步 Agent 配置（换账号 / 登录 / 退出都要重新解析代理凭证）
    watch(
        () => [setting.aiApiKey, setting.aiBaseUrl, setting.aiModelName, setting.aiTemperature, setting.aiMaxTokens, user.jwtToken],
        () => {
            // 解析不出可用配置时写入空密钥，让 run() 给出「未配置」而不是继续用旧令牌
            agent.updateConfig(resolveAgentConfig() ?? { api_key: "" })
        }
    )

    void loadConversations()

    return {
        conversations,
        isConversationLoading,
        activeConversationId,
        activeConversation,
        messages,
        hasMessages,
        isBusy,
        liveReasoning,
        pendingAsk,
        pendingAskLive,
        loadConversations,
        loadMessages,
        createConversation,
        startNewConversation,
        selectConversation,
        removeConversation,
        exportConversationText,
        touchConversation,
        send,
        answerAsk,
        skipAsk,
        interrupt,
    }
}
