import i18next from "i18next"
import { computed, type Ref, ref, watch } from "vue"
import type { AgentToolTrace } from "@/api/agent/kernel"
import { BuildAgent } from "@/api/buildAgent"
import type { CharSettings } from "@/composables/useCharSettings"
import { type BuildAgentChatMessage, db, type MessageReasoning, type MessageToolTrace, type UBuildAgentChat } from "@/store/db"
import type { useInvStore } from "@/store/inv"
import type { useSettingStore } from "@/store/setting"
import { resolveSharedAgentUpstream, watchAgentUpstream } from "@/utils/agent-upstream"
import { DEFAULT_AI_MAX_TOKENS } from "@/utils/ai-config"
import { type ChatImage, MAX_CHAT_IMAGES } from "@/utils/chat-image"
import type { AskUserRequest, AskUserResponse } from "@/utils/db-ask-user"
import { formatAskUserResponse, hasAskAnswer } from "@/utils/db-ask-user"

/** 配装助手会话主键前缀（沿用历史存档格式，保证旧记录仍可读取） */
const BUILD_AGENT_CHAT_ID_PREFIX = "build-agent-chat:"

/**
 * 把历史存档里的消息补齐成当前结构。
 *
 * 旧版把工具痕迹存成 `string[]`、思考存成单个字符串，两者都无法还原成
 * 「思考 → 工具 → 再思考」的过程流，因此直接丢弃工具痕迹、把整段思考
 * 收成一段保留——宁可在界面上少一段过程，也不要展示残缺的错位数据。
 * @param raw 存档里的原始消息
 * @param index 消息在会话中的下标（用于补 id）
 * @returns 归一化后的消息；结构完全不可用时返回 null
 */
function normalizeStoredMessage(raw: unknown, index: number): BuildAgentChatMessage | null {
    if (!raw || typeof raw !== "object") {
        return null
    }

    const source = raw as Record<string, unknown>
    const role = source.role === "user" ? "user" : "assistant"
    const content = typeof source.content === "string" ? source.content : String(source.content ?? "")
    const legacyReasoning = typeof source.reasoning === "string" && source.reasoning.trim() ? source.reasoning : ""

    const message: BuildAgentChatMessage = {
        id: Number.isFinite(source.id) ? Number(source.id) : index,
        role,
        content,
        createdAt: Number.isFinite(source.createdAt) ? Number(source.createdAt) : Date.now(),
    }

    if (Array.isArray(source.images) && source.images.length) {
        message.images = source.images as ChatImage[]
    }

    // 新的结构化痕迹优先；旧版 `traces: string[]` 不具备还原价值，直接忽略
    if (Array.isArray(source.toolTraces)) {
        message.toolTraces = source.toolTraces as MessageToolTrace[]
    }

    if (Array.isArray(source.reasonings)) {
        message.reasonings = source.reasonings as MessageReasoning[]
    } else if (legacyReasoning) {
        message.reasonings = [{ text: legacyReasoning, toolCallIds: [] }]
    }

    if (Number.isFinite(source.processMs)) {
        message.processMs = Number(source.processMs)
    }

    if (source.pendingAsk && typeof source.pendingAsk === "object") {
        message.pendingAsk = source.pendingAsk as BuildAgentChatMessage["pendingAsk"]
    }

    return message
}

/**
 * 配装助手对话状态：消息流 + 配装 Agent 调用。
 *
 * 与资料检索的 {@link useDBChat} 同构（结构化痕迹 / 分段思考 / 耗时累加 /
 * 挂起续跑），差别只在会话按角色一条、没有会话列表。
 * @param charSettings 当前角色的构筑设置
 * @param selectedChar 当前角色名
 * @param inv 库存 store
 * @param settingStore 设置 store（取 AI 输出上限）
 * @returns 对话状态与操作方法
 */
export function useBuildChat(
    charSettings: Ref<CharSettings>,
    selectedChar: Ref<string>,
    inv: ReturnType<typeof useInvStore>,
    settingStore: ReturnType<typeof useSettingStore>
) {
    const agent = new BuildAgent(
        {
            ...(resolveSharedAgentUpstream() ?? { api_key: "" }),
            timeout: 30000,
            max_retries: 3,
            default_max_tokens: settingStore.aiMaxTokens || DEFAULT_AI_MAX_TOKENS,
        },
        charSettings,
        selectedChar,
        inv
    )

    /** 当前角色的消息列表 */
    const messages = ref<BuildAgentChatMessage[]>([])
    /** 是否正在流式输出 */
    const isBusy = ref(false)
    /** 流式过程中的思考内容（部分模型返回，不落库） */
    const liveReasoning = ref("")
    /** 当前等待用户回答的提问 */
    const pendingAsk = ref<AskUserRequest | null>(null)
    /**
     * 该提问能否续跑原循环。
     *
     * 只有本轮刚挂起（Agent 内存上下文还在）时为 true；从历史消息恢复出来的
     * 提问只能把回答当新一轮提问发出去，因此为 false。
     */
    const pendingAskLive = ref(false)
    /** 上一轮失败的提问原文；非空时界面提供「重试」入口 */
    const failedPrompt = ref("")

    /** 挂起期间正在流式的那条助手消息（续跑时继续往它上面追加） */
    let pendingAssistant: BuildAgentChatMessage | null = null

    const hasMessages = computed(() => messages.value.length > 0)

    /**
     * 取当前角色对应的会话主键。
     * @param charName 角色名
     * @returns 会话主键
     */
    function chatId(charName: string): string {
        return `${BUILD_AGENT_CHAT_ID_PREFIX}${charName}`
    }

    /**
     * 会话内自增的消息 id：取现有最大值 + 1，保证同一会话内稳定且不冲突。
     * @returns 新的消息 id
     */
    function nextMessageId(): number {
        return messages.value.reduce((max, message) => Math.max(max, message.id), 0) + 1
    }

    /**
     * 从本地库加载当前角色的历史对话。
     */
    async function loadMessages(): Promise<void> {
        try {
            const chat = await db.buildAgentChats.get(chatId(selectedChar.value))
            const list = Array.isArray(chat?.messages) ? chat.messages : []
            messages.value = list
                .map((message, index) => normalizeStoredMessage(message, index))
                .filter((message): message is BuildAgentChatMessage => message !== null)
        } catch (error) {
            console.error(i18next.t("ai-chat.loadChatFailed"), error)
            messages.value = []
        }
    }

    /**
     * 把当前对话写入本地库。
     *
     * 落库前做一次深拷贝：消息里可能带响应式代理或不可结构化克隆的对象，
     * Dexie 的 `DataCloneError` 会直接让整次保存失败。
     */
    async function persistMessages(): Promise<void> {
        const plain = JSON.parse(JSON.stringify(messages.value)) as BuildAgentChatMessage[]
        const record: UBuildAgentChat = {
            id: chatId(selectedChar.value),
            charName: selectedChar.value,
            messages: plain,
            updatedAt: Date.now(),
        }

        try {
            await db.buildAgentChats.put(record)
        } catch (error) {
            console.error(i18next.t("ai-chat.saveChatFailed"), error)
        }
    }

    /**
     * 清掉挂起态（切换角色 / 清空对话时调用）。
     *
     * 挂起的提问只在它产生的那次运行里有意义：换角色后 Agent 上下文不在了，
     * 留着只会让界面出现一张点了没反应的卡片。
     */
    function clearPendingAsk(): void {
        pendingAsk.value = null
        pendingAskLive.value = false
        pendingAssistant = null
        agent.clearPending()
    }

    /**
     * 清空当前角色的对话，并落一条空的会话记录（保证刷新后仍是空对话）。
     */
    async function clearChat(): Promise<void> {
        messages.value = []
        liveReasoning.value = ""
        failedPrompt.value = ""
        clearPendingAsk()
        await db.buildAgentChats.delete(chatId(selectedChar.value)).catch(() => undefined)
        await persistMessages()
    }

    /**
     * 构造一轮运行需要的回调集合。
     *
     * 与资料检索一致：`liveReasoning` 承载正在流式的那一段，只有收尾时才
     * 固化进 `reasonings`，保证「历史段 + 实时段」在渲染层不重叠。
     * @param message 本轮的助手消息（流式内容直接追加到它上面）
     * @param reasonings 本轮已固化的思考分段
     * @returns Agent 回调
     */
    function buildCallbacks(message: BuildAgentChatMessage, reasonings: MessageReasoning[]) {
        return {
            onDelta: (chunk: string, type: "reasoning" | "content") => {
                if (type === "reasoning") {
                    liveReasoning.value += chunk
                    return
                }

                message.content += chunk
            },
            onToolTrace: (trace: AgentToolTrace) => {
                const traces = message.toolTraces ?? (message.toolTraces = [])
                const index = traces.findIndex(item => item.id === trace.id)

                if (index >= 0) {
                    traces[index] = trace
                } else {
                    traces.push(trace)
                }
            },
            onReasoningEnd: (toolCallIds: string[]) => {
                const text = liveReasoning.value

                if (text.trim()) {
                    reasonings.push({ text, toolCallIds })
                }

                liveReasoning.value = ""
            },
        }
    }

    /**
     * 把一次运行的总耗时记到消息上。
     *
     * 分多次运行（ask_user 挂起后继续）时累加，且只在模型真正在工作的区间累加，
     * 用户作答的等待时间不计入。
     * @param message 助手消息
     * @param startedAt 本次运行开始的毫秒时间戳
     */
    function addProcessMs(message: BuildAgentChatMessage, startedAt: number) {
        message.processMs = (message.processMs ?? 0) + (Date.now() - startedAt)
    }

    /**
     * 处理本轮运行结果：写入回复、落库，并根据是否挂起更新提问态。
     * @param message 本轮的助手消息
     * @param result Agent 运行结果
     */
    async function consumeResult(message: BuildAgentChatMessage, result: Awaited<ReturnType<BuildAgent["run"]>>): Promise<void> {
        message.content = result.reply || message.content

        if (result.reasonings?.length) {
            message.reasonings = result.reasonings
        }

        if (result.pendingAsk) {
            pendingAsk.value = result.pendingAsk.payload
            pendingAskLive.value = true
            message.pendingAsk = result.pendingAsk.payload
            pendingAssistant = message
            liveReasoning.value = ""
            await persistMessages()
            return
        }

        pendingAsk.value = null
        pendingAskLive.value = false
        pendingAssistant = null
        message.pendingAsk = undefined

        await persistMessages()
    }

    /**
     * 跑一轮助手回复：调用 Agent 并流式写回消息。
     *
     * 用户消息此刻已在消息列表里，这里只负责助手侧；失败时把错误写进助手消息
     * 正文并记下失败的提问，供界面提供「重试」。
     * @param message 本轮的助手消息（必须已在列表里）
     * @param prompt 本轮的提问原文（失败重试用）
     */
    async function runTurn(message: BuildAgentChatMessage, prompt: string): Promise<void> {
        const reasonings: MessageReasoning[] = []
        message.reasonings = reasonings

        // 历史消息（不含本轮占位）：只发图没打字的那一轮也要保留，它是图片唯一的载体
        const history = messages.value
            .filter(item => item.id !== message.id && (item.content.trim() || item.images?.length))
            .map(item => ({
                role: item.role,
                content: item.content,
                ...(item.role === "user" && item.images?.length ? { images: item.images } : {}),
            }))

        const startedAt = Date.now()
        isBusy.value = true
        liveReasoning.value = ""

        try {
            if (!resolveSharedAgentUpstream()) {
                throw new Error(i18next.t("ai-chat.error.noConfig"))
            }

            const result = await agent.run(history, buildCallbacks(message, reasonings))
            addProcessMs(message, startedAt)
            failedPrompt.value = ""
            await consumeResult(message, result)
        } catch (error) {
            const reason = error instanceof Error ? error.message : i18next.t("ai-chat.error.unknown")
            message.content = message.content || i18next.t("ai-chat.error.requestFailed", { message: reason })

            addProcessMs(message, startedAt)
            failedPrompt.value = prompt
            await persistMessages()
        } finally {
            isBusy.value = false
            liveReasoning.value = ""
        }
    }

    /**
     * 发送提问：写入用户消息 → 调用配装 Agent → 流式写入回复。
     * @param rawText 用户输入
     * @param rawImages 本次附带的图片；只取前 MAX_CHAT_IMAGES 张
     */
    async function send(rawText: string, rawImages: ChatImage[] = []) {
        const text = rawText.trim()
        const images = rawImages.slice(0, MAX_CHAT_IMAGES)

        // 只有图没有文字也是一次完整提问（「这个面板怎么改」由模型自己理解图片）
        if ((!text && !images.length) || isBusy.value) {
            return
        }

        // 挂起期间输入框的提交被路由成「用这段文字回答当前提问」
        if (pendingAsk.value) {
            await answerPendingAsText(text)
            return
        }

        failedPrompt.value = ""

        const assistantMessage: BuildAgentChatMessage = {
            id: nextMessageId() + 1,
            role: "assistant",
            content: "",
            toolTraces: [],
            createdAt: Date.now(),
        }
        const userMessage: BuildAgentChatMessage = {
            id: assistantMessage.id - 1,
            role: "user",
            content: text,
            ...(images.length ? { images } : {}),
            createdAt: Date.now(),
        }

        messages.value.push(userMessage, assistantMessage)
        await runTurn(assistantMessage, text)
    }

    /**
     * 重试上一轮失败的提问：丢掉失败留下的助手消息，用原提问重跑同一轮。
     */
    async function retry() {
        const prompt = failedPrompt.value

        if (!prompt || isBusy.value || pendingAsk.value) {
            return
        }

        failedPrompt.value = ""

        const last = messages.value.at(-1)

        if (last?.role === "assistant") {
            messages.value.pop()
        }

        const assistantMessage: BuildAgentChatMessage = {
            id: nextMessageId(),
            role: "assistant",
            content: "",
            toolTraces: [],
            createdAt: Date.now(),
        }
        messages.value.push(assistantMessage)
        await runTurn(assistantMessage, prompt)
    }

    /**
     * 用一段自由文本回答当前挂起的提问（输入框提交时走这里）。
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
            await send(text)
            return
        }

        await answerAsk({ requestId: request.id, answers: [{ questionId: question.id, optionIds: [], custom: text }] })
    }

    /**
     * 回答当前挂起的提问并继续运行。
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
                await persistMessages()
            }

            await send(formatAskUserResponse(request, response))
            return
        }

        isBusy.value = true
        liveReasoning.value = ""
        pendingAsk.value = null

        const reasonings: MessageReasoning[] = target.reasonings ?? []
        target.reasonings = reasonings

        const startedAt = Date.now()

        try {
            const result = await agent.answerAsk(response, buildCallbacks(target, reasonings))
            addProcessMs(target, startedAt)
            await consumeResult(target, result)
        } catch (error) {
            const reason = error instanceof Error ? error.message : i18next.t("ai-chat.error.unknown")
            target.content = target.content || i18next.t("ai-chat.error.requestFailed", { message: reason })

            addProcessMs(target, startedAt)
            await persistMessages()
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
                void persistMessages()
            }

            pendingAssistant = null
        }
    }

    // 设置或登录状态变化时同步 Agent 配置（换账号 / 登录 / 退出都要重新解析代理凭证）
    watchAgentUpstream(config => agent.updateConfig(config))

    // 角色切换：换绑宿主并重新载入该角色的历史对话
    watch(selectedChar, async () => {
        agent.updateHost(charSettings, selectedChar)
        clearPendingAsk()
        liveReasoning.value = ""
        failedPrompt.value = ""
        await loadMessages()
    })

    return {
        messages,
        hasMessages,
        isBusy,
        liveReasoning,
        pendingAsk,
        pendingAskLive,
        failedPrompt,
        loadMessages,
        clearChat,
        send,
        retry,
        answerAsk,
        skipAsk,
        interrupt,
    }
}
