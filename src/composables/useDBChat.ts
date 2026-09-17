import { computed, ref, watch } from "vue"
import { DBAgent, type DBAgentHistoryMessage, type DBAgentToolTrace } from "@/api/dbAgent"
import type { OpenAIConfig } from "@/api/openai"
import { env } from "@/env"
import { type Conversation, db, type Message, type UConversation, type UMessage } from "@/store/db"
import { useSettingStore } from "@/store/setting"
import { useUserStore } from "@/store/user"
import { renderMarkdown } from "@/utils/markdown"

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
    /** 当前会话 id，0 表示尚未建立会话 */
    const activeConversationId = ref(0)
    /** 当前会话的消息列表 */
    const messages = ref<Message[]>([])
    /** 是否正在检索（流式输出中） */
    const isBusy = ref(false)
    /** 流式过程中的思考内容（部分模型返回，不落库） */
    const liveReasoning = ref("")

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
        }
    }

    /**
     * 加载指定会话的消息。
     * @param conversationId 会话 id
     */
    async function loadMessages(conversationId: number) {
        try {
            const list = await db.messages.where("conversationId").equals(conversationId).toArray()
            messages.value = list
                .sort((a, b) => a.id - b.id)
                .map(message => ({ ...message, renderedContent: renderMarkdown(message.content) }))
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
        await loadMessages(conversation.id)
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
     * 发送提问：写入用户消息 → 调用资料检索 Agent → 流式写入回复。
     * @param rawText 用户输入
     */
    async function send(rawText: string) {
        const text = rawText.trim()

        if (!text || isBusy.value) {
            return
        }

        // 首次提问时按提问内容命名会话
        const conversationId = activeConversationId.value || (await createConversation(text.slice(0, CONVERSATION_NAME_LENGTH)))
        const isFirstMessage = !messages.value.some(message => message.role === "user")

        const userMessage: UMessage = { conversationId, role: "user", content: text, createdAt: Date.now() }
        const userId = await db.messages.add(userMessage)
        messages.value.push({ ...userMessage, id: userId, renderedContent: renderMarkdown(text) })

        const assistantRecord: UMessage = { conversationId, role: "assistant", content: "", createdAt: Date.now() }
        const assistantId = await db.messages.add(assistantRecord)
        const assistantMessage: Message = { ...assistantRecord, id: assistantId, toolTraces: [] }
        messages.value.push(assistantMessage)

        isBusy.value = true
        liveReasoning.value = ""

        // 历史消息（不含本轮占位的助手消息）
        const history: DBAgentHistoryMessage[] = messages.value
            .filter(message => message.id !== assistantId && message.role !== "system" && message.content.trim())
            .map(message => ({ role: message.role === "user" ? "user" : "assistant", content: message.content }))

        try {
            // 既没有自己的密钥又未登录时服务端代理不可用，直接给出可操作提示，不打无谓的请求
            if (!resolveAgentConfig()) {
                throw new Error("请先登录后再使用资料检索，或在设置中填写自己的 AI 密钥")
            }

            const result = await agent.run(history, {
                onDelta: (chunk, type) => {
                    if (type === "reasoning") {
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
            })

            assistantMessage.content = result.reply || assistantMessage.content
        } catch (error) {
            const message = error instanceof Error ? error.message : "未知错误"
            assistantMessage.content = assistantMessage.content || `检索失败：${message}`
        } finally {
            assistantMessage.renderedContent = renderMarkdown(assistantMessage.content)

            await db.messages.update(assistantId, {
                content: assistantMessage.content,
                toolTraces: assistantMessage.toolTraces,
            })

            isBusy.value = false
            liveReasoning.value = ""
            await touchConversation(conversationId, isFirstMessage ? text.slice(0, CONVERSATION_NAME_LENGTH) : undefined)
        }
    }

    /**
     * 中断当前检索。
     */
    function interrupt() {
        agent.interrupt()
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
        activeConversationId,
        activeConversation,
        messages,
        hasMessages,
        isBusy,
        liveReasoning,
        loadConversations,
        loadMessages,
        createConversation,
        startNewConversation,
        selectConversation,
        removeConversation,
        touchConversation,
        send,
        interrupt,
    }
}
