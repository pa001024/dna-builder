import i18next from "i18next"
import { computed, ref } from "vue"
import type { AgentCompactionOutcome } from "@/api/agent/compact"
import type { AgentHistoryMessage } from "@/api/agent/kernel"
import { createDbAgent } from "@/api/dbAgent"
import { useAgentChatCore } from "@/composables/useAgentChatCore"
import { type Conversation, db, type Message, type MessageCompaction, type UConversation, type UMessage } from "@/store/db"
import { lastCompactionIndex } from "@/utils/agent-chat"
import { resolveSharedAgentUpstream } from "@/utils/agent-upstream"
import { type ChatImage, MAX_CHAT_IMAGES } from "@/utils/chat-image"
import { htmlToText } from "@/utils/html"
import { isHashRouterMode, renderMarkdown } from "@/utils/markdown"
import { parseRichComponents } from "@/utils/rich-component"

/**
 * 资料库对话状态：会话列表 + 消息流 + 资料检索 Agent 调用。
 *
 * 会话与消息沿用项目既有的 Dexie 表（conversations / messages），
 * 因此历史对话与其它 AI 功能共享同一份本地数据。
 * 对话流的公共部分（回调构建 / 耗时累加 / 挂起续跑 / 错误兜底）在
 * {@link useAgentChatCore}，这里只保留会话管理与本入口的发送编排。
 */

/** 会话名称取用户首条提问的前若干字符 */
const CONVERSATION_NAME_LENGTH = 18

/**
 * 上下文中允许带图的用户轮数上限（含本轮）。
 *
 * 图片是 Base64 内联的，每发一轮整段上下文都会重传一遍；不限轮数的话请求体会随
 * 对话长度线性膨胀，很快撞上上游的体积限制。只保留最近两轮，既能接住
 * 「先发图提问 → 再追问这张图里的另一样东西」，也把体积封在常数级。
 */
const MAX_IMAGE_HISTORY_TURNS = 2

/**
 * 资料库对话组合式函数。
 * @returns 会话状态与操作方法
 */
export function useDBChat() {
    // 没有可用配置时也先建一个空密钥实例，真正的拦截放在 send() 里给出可操作的提示
    const agent = createDbAgent(resolveSharedAgentUpstream() ?? { api_key: "" })

    /** 会话列表（按更新时间倒序） */
    const conversations = ref<Conversation[]>([])
    /** 会话列表是否已从 Dexie 加载完成（用于页面恢复对话态前的等待） */
    const isConversationLoading = ref(true)
    /** 当前会话 id，0 表示尚未建立会话 */
    const activeConversationId = ref(0)
    /** 当前会话的消息列表 */
    const messages = ref<Message[]>([])

    const activeConversation = computed(() => conversations.value.find(item => item.id === activeConversationId.value) ?? null)
    const hasMessages = computed(() => messages.value.length > 0)

    const core = useAgentChatCore<Message>({
        agent,
        // 落库一条助手消息的最终状态，并刷新会话时间戳（收尾 / 挂起 / 失败兜底 / 中断清理共用）
        persist: async message => {
            await persistAssistant(message.id, message)
            await touchConversation(message.conversationId)
        },
        errorKeys: {
            noConfig: "dbAgent.error.noConfig",
            unknown: "dbAgent.error.unknown",
            requestFailed: "dbAgent.error.failed",
        },
    })

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

            // 用量面板跟着会话走：先清掉上一个会话的真实用量，再从落库用量恢复命中率与锚点
            core.resetContextUsage()
            core.seedContextCacheFromMessages(messages.value)
            core.refreshContextUsage(buildHistory())
        } catch (error) {
            console.error("加载会话消息失败:", error)
        }
    }

    /**
     * 创建新会话。
     * @param name 会话名称，缺省为当前语言下的「新对话」
     * @returns 新会话 id
     */
    async function createConversation(name = i18next.t("dbAgent.conversation.defaultName")) {
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
        if (core.isBusy.value) {
            return
        }

        activeConversationId.value = 0
        messages.value = []
        core.liveReasoning.value = ""
        core.clearPendingAsk()
        core.resetContextUsage()
    }

    /**
     * 切换到指定会话。
     * @param conversation 目标会话
     */
    async function selectConversation(conversation: Conversation) {
        if (core.isBusy.value || conversation.id === activeConversationId.value) {
            return
        }

        activeConversationId.value = conversation.id
        core.liveReasoning.value = ""
        core.clearPendingAsk()
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
            // 压缩边界不是真实对话内容，不进导出
            if (message.role === "system") {
                continue
            }

            // 助手回复先剥离特殊组件标签：导出的是纯文本，不能把 `<ResourceCostItem/>` 原样带出去
            const source = message.role === "assistant" ? parseRichComponents(message.content).markdown : message.content
            const content = message.role === "assistant" ? htmlToText(renderMarkdown(source, isHashRouterMode())).trim() : source.trim()

            if (!content) {
                continue
            }

            sections.push(`${message.role === "user" ? i18next.t("dbAgent.ui.exportMe") : i18next.t("dbAgent.ui.exportAgent")}：${content}`)
        }

        return sections.length ? `${conversation.name}\n\n${sections.join("\n\n")}` : ""
    }

    /**
     * 删除会话及其消息。
     * @param conversation 目标会话
     */
    async function removeConversation(conversation: Conversation) {
        if (core.isBusy.value) {
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
     * 取会话的显式 AI 会话 id：没有就生成一个并落库。
     *
     * 服务端日志按这个 id 归会话，替代「账号 + 首条提问」的指纹推导——
     * 指纹会把连续两次相同的提问并进同一个会话，显式 id 没有这个问题。
     * @param conversationId 会话 id。
     * @returns 会话 id；会话不存在时为 undefined（服务端退回指纹推导）。
     */
    async function ensureAiSessionId(conversationId: number): Promise<string | undefined> {
        const target = conversations.value.find(item => item.id === conversationId)
        if (!target) {
            return undefined
        }

        if (target.aiSessionId) {
            return target.aiSessionId
        }

        const sessionId = `s-${crypto.randomUUID()}`
        target.aiSessionId = sessionId
        await db.conversations.update(conversationId, { aiSessionId: sessionId })
        return sessionId
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
            processMs: assistantMessage.processMs,
            pendingAsk: assistantMessage.pendingAsk,
            tokenUsage: assistantMessage.tokenUsage,
        })
    }

    /**
     * 构建发给模型的会话历史（感知压缩边界）。
     *
     * 最后一条压缩边界之前的消息已并入边界摘要，全部丢弃、以边界摘要作为首条用户消息替代；
     * 边界之后的照常回灌（含图片轮数护栏）。发送前与发送后调用的是同一份逻辑，
     * 压缩预检也用它取「当前上下文」。
     * @param excludeId 需要排除的消息 id（发送时排除本轮占位的助手消息）
     * @returns 回灌历史
     */
    function buildHistory(excludeId?: number): AgentHistoryMessage[] {
        const markerIndex = lastCompactionIndex(messages.value)
        const candidates = messages.value
            .slice(markerIndex + 1)
            .filter(
                message =>
                    message.id !== excludeId &&
                    message.role !== "system" &&
                    (message.content.trim() || (message.role === "user" && message.images?.length))
            )

        // 只有最近若干轮带图，更早的用户提问降级为纯文本（体积护栏，见 MAX_IMAGE_HISTORY_TURNS）
        const imageTurnIds = new Set(
            candidates
                .filter(message => message.role === "user" && message.images?.length)
                .slice(-MAX_IMAGE_HISTORY_TURNS)
                .map(message => message.id)
        )

        const history: AgentHistoryMessage[] = []

        // 有压缩边界时，边界摘要作为首条用户消息回灌（替代被压缩的历史）
        if (markerIndex >= 0) {
            const marker = messages.value[markerIndex]

            if (marker?.content.trim()) {
                history.push({ role: "user", content: marker.content })
            }
        }

        // 只发图没打字的那一轮也要留下来——它是图片唯一的载体，按空正文过滤会把图一起丢掉
        history.push(
            ...candidates.map(message => ({
                role: message.role === "user" ? ("user" as const) : ("assistant" as const),
                content: message.content,
                ...(message.role === "user" && imageTurnIds.has(message.id) && message.images?.length ? { images: message.images } : {}),
            }))
        )

        return history
    }

    /**
     * 落库一条压缩边界消息（system 角色，content 为回灌给模型的摘要全文）。
     * @param conversationId 会话 id
     * @param outcome 压缩结果
     */
    async function persistCompactionMarker(conversationId: number, outcome: AgentCompactionOutcome): Promise<void> {
        const compaction: MessageCompaction = {
            preTokens: outcome.preTokens,
            postTokens: outcome.postTokens,
            summarizedCount: outcome.summarizedCount,
            keptCount: outcome.keptCount,
        }
        const record: UMessage = { conversationId, role: "system", content: outcome.compactedText, compaction, createdAt: Date.now() }
        const id = await db.messages.add(record)
        messages.value.push({ ...record, id })

        // 压缩后的上下文规模立刻反映到面板：丢弃压缩前的真实用量锚点（缓存命中率累计保留）
        core.refreshContextUsage(buildHistory(), { dropProviderAnchor: true })
    }

    /**
     * 发送前压缩预检：估算当前会话上下文，逼近阈值时生成摘要并落库压缩边界。
     *
     * 必须在写入本轮提问**之前**执行：边界要排在本轮消息之前，后续构建历史时
     * 「边界之后的照常回灌」才包含本轮提问。
     * @param conversationId 会话 id
     */
    async function runAutoCompaction(conversationId: number): Promise<void> {
        try {
            const outcome = await core.maybeCompactHistory(buildHistory())

            if (outcome) {
                await persistCompactionMarker(conversationId, outcome)
            }
        } catch (error) {
            console.warn("上下文压缩预检失败:", error)
        }
    }

    /**
     * 发送提问：压缩预检 → 写入用户消息 → 调用资料检索 Agent → 流式写入回复。
     * @param rawText 用户输入
     * @param rawImages 本次附带的图片（截图 / 面板等）；只取前 MAX_CHAT_IMAGES 张
     */
    async function send(rawText: string, rawImages: ChatImage[] = []) {
        const text = rawText.trim()
        const images = rawImages.slice(0, MAX_CHAT_IMAGES)

        // 只有图没有文字也是一次完整提问（「这是什么」由模型自己理解图片）
        if ((!text && !images.length) || core.isBusy.value) {
            return
        }

        // 挂起期间输入框的提交被路由成「用这段文字回答当前提问」，
        // 这样用户既能点选项，也能直接打字作答，不必非走卡片。
        if (core.pendingAsk.value) {
            await core.answerPendingAsText(text)
            return
        }

        // 首次提问时按提问内容命名会话；只发图时没有文字可取名，用固定名称兜底
        const nameSource = text || i18next.t("dbAgent.conversation.imageName")
        const conversationId = activeConversationId.value || (await createConversation(nameSource.slice(0, CONVERSATION_NAME_LENGTH)))
        const isFirstMessage = !messages.value.some(message => message.role === "user")

        // 压缩预检：边界必须排在本轮消息之前，所以放在写入提问之前
        await runAutoCompaction(conversationId)

        const userMessage: UMessage = {
            conversationId,
            role: "user",
            content: text,
            ...(images.length ? { images } : {}),
            createdAt: Date.now(),
        }
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

        // 历史消息（不含本轮占位的助手消息；感知压缩边界，见 buildHistory）
        const history = buildHistory(assistantId)

        // 记录本轮开始时间，用于完成后展示过程耗时（见 core.addProcessMs）
        const startedAt = Date.now()

        await core.runAgentTurn(
            assistantMessage,
            startedAt,
            async callbacks => agent.run(history, callbacks, { sessionId: await ensureAiSessionId(conversationId) }),
            {
                onSettled: () =>
                    touchConversation(conversationId, isFirstMessage ? nameSource.slice(0, CONVERSATION_NAME_LENGTH) : undefined),
            }
        )
    }

    /**
     * 手动触发上下文压缩（容量面板的「压缩历史」）：无视阈值直接压缩当前会话历史。
     * @returns compacted 已压缩；noNeed 无需压缩（会话太短）；failed 压缩失败
     */
    async function compactNow(): Promise<"compacted" | "noNeed" | "failed"> {
        if (!activeConversationId.value || core.isBusy.value || !hasMessages.value) {
            return "noNeed"
        }

        try {
            const outcome = await core.maybeCompactHistory(buildHistory(), { force: true })

            if (!outcome) {
                return "noNeed"
            }

            await persistCompactionMarker(activeConversationId.value, outcome)
            return "compacted"
        } catch (error) {
            console.warn("手动压缩失败:", error)
            return "failed"
        }
    }

    // 挂起回退（把回答当新提问发出）需要能调到本入口的 send，组装完成后注入
    core.bindSend(send)

    void loadConversations()

    return {
        conversations,
        isConversationLoading,
        activeConversationId,
        activeConversation,
        messages,
        hasMessages,
        isBusy: core.isBusy,
        liveReasoning: core.liveReasoning,
        pendingAsk: core.pendingAsk,
        pendingAskLive: core.pendingAskLive,
        isCompacting: core.isCompacting,
        contextUsage: core.contextUsage,
        loadConversations,
        loadMessages,
        createConversation,
        startNewConversation,
        selectConversation,
        removeConversation,
        exportConversationText,
        touchConversation,
        send,
        compactNow,
        answerAsk: core.answerAsk,
        skipAsk: core.skipAsk,
        interrupt: core.interrupt,
    }
}
