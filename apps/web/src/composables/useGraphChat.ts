import i18next from "i18next"
import { computed, type Ref, ref, watch } from "vue"
import type { AgentCompactionOutcome } from "@/api/agent/compact"
import { ensureAgentSkillsReady } from "@/api/agent/skills/registry"
import { createGraphAgent } from "@/api/graphAgent"
import { useAgentChatCore } from "@/composables/useAgentChatCore"
import {
    db,
    type GraphAgentChatMessage,
    type MessageCompaction,
    type MessageReasoning,
    type MessageTokenUsage,
    type MessageToolTrace,
    type UGraphAgentChat,
} from "@/store/db"
import { lastCompactionIndex } from "@/utils/agent-chat"
import { resolveSharedAgentUpstream } from "@/utils/agent-upstream"
import { type ChatImage, MAX_CHAT_IMAGES } from "@/utils/chat-image"

/** 节点图助手会话主键前缀（与配装助手的 build-agent-chat: 同构，按图键一条存档） */
const GRAPH_AGENT_CHAT_ID_PREFIX = "graph-agent-chat:"

/** 旧存档补齐：旧版 string[] 痕迹无法还原过程流，直接丢弃，单段思考收成一段保留 */
function normalizeStoredMessage(raw: unknown, index: number): GraphAgentChatMessage | null {
    if (!raw || typeof raw !== "object") {
        return null
    }

    const source = raw as Record<string, unknown>
    // system 角色只用于上下文压缩边界；旧数据没有该角色，保持 user/assistant 的二分兜底
    const role = source.role === "user" ? "user" : source.role === "system" ? "system" : "assistant"
    const content = typeof source.content === "string" ? source.content : String(source.content ?? "")
    const legacyReasoning = typeof source.reasoning === "string" && source.reasoning.trim() ? source.reasoning : ""

    const message: GraphAgentChatMessage = {
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
        message.pendingAsk = source.pendingAsk as GraphAgentChatMessage["pendingAsk"]
    }

    if (source.tokenUsage && typeof source.tokenUsage === "object") {
        message.tokenUsage = source.tokenUsage as MessageTokenUsage
    }

    if (typeof source.costMicros === "number" && Number.isFinite(source.costMicros)) {
        message.costMicros = source.costMicros
    }

    if (source.compaction && typeof source.compaction === "object") {
        message.compaction = source.compaction as MessageCompaction
    }

    return message
}

export function useGraphChat(chatKey: Ref<string>) {
    const agent = createGraphAgent({
        ...(resolveSharedAgentUpstream() ?? { api_key: "" }),
        timeout: 30000,
        max_retries: 3,
    })

    /** 当前图的消息列表 */
    const messages = ref<GraphAgentChatMessage[]>([])
    /** 上一轮失败的提问原文；非空时界面提供「重试」入口 */
    const failedPrompt = ref("")
    /** 显式 AI 会话 id：随请求头发给服务端代理用于日志归会话；随会话落库，清空对话后重新生成 */
    let aiSessionId = ""

    const core = useAgentChatCore<GraphAgentChatMessage>({
        agent,
        // 落库整份会话存档（消息里可能带响应式代理，persistMessages 内部深拷贝）
        persist: () => persistMessages(),
        errorKeys: {
            noConfig: "ai-chat.error.noConfig",
            unknown: "ai-chat.error.unknown",
            requestFailed: "ai-chat.error.requestFailed",
        },
    })

    const hasMessages = computed(() => messages.value.length > 0)

    function chatId(key: string): string {
        return `${GRAPH_AGENT_CHAT_ID_PREFIX}${key}`
    }

    function nextMessageId(): number {
        return messages.value.reduce((max, message) => Math.max(max, message.id), 0) + 1
    }

    async function loadMessages(): Promise<void> {
        try {
            const chat = await db.graphAgentChats.get(chatId(chatKey.value))
            aiSessionId = chat?.aiSessionId ?? ""
            const list = Array.isArray(chat?.messages) ? chat.messages : []
            messages.value = list
                .map((message, index) => normalizeStoredMessage(message, index))
                .filter((message): message is GraphAgentChatMessage => message !== null)

            // 用量面板跟着会话走：先清掉上一张图的真实用量，再从落库用量恢复命中率与锚点
            core.resetContextUsage()
            core.seedContextCacheFromMessages(messages.value)
            core.refreshContextUsage(buildHistory())
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
        const plain = JSON.parse(JSON.stringify(messages.value)) as GraphAgentChatMessage[]
        const record: UGraphAgentChat = {
            id: chatId(chatKey.value),
            graphKey: chatKey.value,
            messages: plain,
            ...(aiSessionId ? { aiSessionId } : {}),
            updatedAt: Date.now(),
        }

        try {
            await db.graphAgentChats.put(record)
        } catch (error) {
            console.error(i18next.t("ai-chat.saveChatFailed"), error)
        }
    }

    function ensureAiSessionId(): string {
        if (!aiSessionId) {
            aiSessionId = `s-${crypto.randomUUID()}`
        }
        return aiSessionId
    }

    /** 清空对话并落空记录，保证刷新后仍是空对话 */
    async function clearChat(): Promise<void> {
        messages.value = []
        core.liveReasoning.value = ""
        failedPrompt.value = ""
        aiSessionId = ""
        core.clearPendingAsk()
        core.resetContextUsage()
        await db.graphAgentChats.delete(chatId(chatKey.value)).catch(() => undefined)
        await persistMessages()
    }

    /** 边界之前的消息已并入摘要并丢弃，以摘要作为首条用户消息替代 */
    function buildHistory(excludeId?: number) {
        const markerIndex = lastCompactionIndex(messages.value)
        const history: Array<{ role: "user" | "assistant"; content: string; images?: ChatImage[] }> = []

        // 有压缩边界时，边界摘要作为首条用户消息回灌（替代被压缩的历史）
        if (markerIndex >= 0) {
            const marker = messages.value[markerIndex]

            if (marker?.content.trim()) {
                history.push({ role: "user", content: marker.content })
            }
        }

        // 只发图没打字的那一轮也要保留，它是图片唯一的载体
        history.push(
            ...messages.value
                .slice(markerIndex + 1)
                .filter(item => item.id !== excludeId && item.role !== "system" && (item.content.trim() || item.images?.length))
                .map(item => ({
                    role: item.role === "assistant" ? ("assistant" as const) : ("user" as const),
                    content: item.content,
                    ...(item.role === "user" && item.images?.length ? { images: item.images } : {}),
                }))
        )

        return history
    }

    async function persistCompactionMarker(outcome: AgentCompactionOutcome): Promise<void> {
        const compaction: MessageCompaction = {
            preTokens: outcome.preTokens,
            postTokens: outcome.postTokens,
            summarizedCount: outcome.summarizedCount,
            keptCount: outcome.keptCount,
        }
        const marker: GraphAgentChatMessage = {
            id: nextMessageId(),
            role: "system",
            content: outcome.compactedText,
            compaction,
            createdAt: Date.now(),
        }
        messages.value.push(marker)
        await persistMessages()

        // 压缩后的上下文规模立刻反映到面板：丢弃压缩前的真实用量锚点（缓存命中率累计保留）
        core.refreshContextUsage(buildHistory(), { dropProviderAnchor: true })
    }

    /** 边界必须排在本轮消息之前，所以在写入提问之前执行 */
    async function runAutoCompaction(): Promise<void> {
        try {
            const outcome = await core.maybeCompactHistory(buildHistory())

            if (outcome) {
                await persistCompactionMarker(outcome)
            }
        } catch (error) {
            console.warn("上下文压缩预检失败:", error)
        }
    }

    async function runTurn(message: GraphAgentChatMessage, prompt: string): Promise<void> {
        // 历史消息（不含本轮占位；感知压缩边界，见 buildHistory）
        const history = buildHistory(message.id)

        const startedAt = Date.now()

        await core.runAgentTurn(message, startedAt, callbacks => agent.run(history, callbacks, { sessionId: ensureAiSessionId() }), {
            onSuccess: () => {
                failedPrompt.value = ""
            },
            onFail: () => {
                failedPrompt.value = prompt
            },
        })
    }

    async function send(rawText: string, rawImages: ChatImage[] = []) {
        const text = rawText.trim()
        const images = rawImages.slice(0, MAX_CHAT_IMAGES)

        // 只有图没有文字也是一次完整提问（「这张图怎么连」由模型自己理解图片）
        if ((!text && !images.length) || core.isBusy.value) {
            return
        }

        // 挂起期间输入框的提交被路由成「用这段文字回答当前提问」
        if (core.pendingAsk.value) {
            await core.answerPendingAsText(text)
            return
        }

        // 技能清单就绪后再装配本轮的工具面与提示词；失败静默降级为无技能
        await ensureAgentSkillsReady()

        // 输入框（Lexical 富文本）的 chip 直接序列化成 canonical markdown，这里原样落盘与发送
        const content = text

        // 压缩预检：边界必须排在本轮消息之前，所以放在写入提问之前
        await runAutoCompaction()
        failedPrompt.value = ""

        const assistantMessage: GraphAgentChatMessage = {
            id: nextMessageId() + 1,
            role: "assistant",
            content: "",
            toolTraces: [],
            createdAt: Date.now(),
        }
        const userMessage: GraphAgentChatMessage = {
            id: assistantMessage.id - 1,
            role: "user",
            content,
            ...(images.length ? { images } : {}),
            createdAt: Date.now(),
        }

        messages.value.push(userMessage, assistantMessage)
        await runTurn(assistantMessage, text)
    }

    async function compactNow(): Promise<"compacted" | "noNeed" | "failed"> {
        if (!hasMessages.value || core.isBusy.value) {
            return "noNeed"
        }

        try {
            const outcome = await core.maybeCompactHistory(buildHistory(), { force: true })

            if (!outcome) {
                return "noNeed"
            }

            await persistCompactionMarker(outcome)
            return "compacted"
        } catch (error) {
            console.warn("手动压缩失败:", error)
            return "failed"
        }
    }

    async function retry() {
        const prompt = failedPrompt.value

        if (!prompt || core.isBusy.value || core.pendingAsk.value) {
            return
        }

        failedPrompt.value = ""

        const last = messages.value.at(-1)

        if (last?.role === "assistant") {
            messages.value.pop()
        }

        const assistantMessage: GraphAgentChatMessage = {
            id: nextMessageId(),
            role: "assistant",
            content: "",
            toolTraces: [],
            createdAt: Date.now(),
        }
        messages.value.push(assistantMessage)
        await runTurn(assistantMessage, prompt)
    }

    // 切图：清掉挂起态并重新载入该图的历史对话
    watch(chatKey, async () => {
        core.clearPendingAsk()
        core.liveReasoning.value = ""
        failedPrompt.value = ""
        await loadMessages()
    })

    // 挂起回退（把回答当新提问发出）需要调到本入口的 send，组装完成后注入
    core.bindSend(send)

    return {
        messages,
        hasMessages,
        isBusy: core.isBusy,
        liveReasoning: core.liveReasoning,
        pendingAsk: core.pendingAsk,
        pendingAskLive: core.pendingAskLive,
        isCompacting: core.isCompacting,
        contextUsage: core.contextUsage,
        failedPrompt,
        loadMessages,
        clearChat,
        send,
        retry,
        compactNow,
        answerAsk: core.answerAsk,
        skipAsk: core.skipAsk,
        interrupt: core.interrupt,
    }
}
