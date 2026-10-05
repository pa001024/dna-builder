import i18next from "i18next"
import { computed, type Ref, ref, watch } from "vue"
import type { AgentCompactionOutcome } from "@/api/agent/compact"
import { createBuildAgent } from "@/api/buildAgent"
import { useAgentChatCore } from "@/composables/useAgentChatCore"
import {
    type BuildAgentChatMessage,
    db,
    type MessageCompaction,
    type MessageReasoning,
    type MessageTokenUsage,
    type MessageToolTrace,
    type UBuildAgentChat,
} from "@/store/db"
import type { useSettingStore } from "@/store/setting"
import { lastCompactionIndex } from "@/utils/agent-chat"
import { resolveSharedAgentUpstream } from "@/utils/agent-upstream"
import { DEFAULT_AI_MAX_TOKENS } from "@/utils/ai-config"
import { type ChatImage, MAX_CHAT_IMAGES } from "@/utils/chat-image"

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
    // system 角色只用于上下文压缩边界；旧数据没有该角色，保持 user/assistant 的二分兜底
    const role = source.role === "user" ? "user" : source.role === "system" ? "system" : "assistant"
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

    if (source.tokenUsage && typeof source.tokenUsage === "object") {
        message.tokenUsage = source.tokenUsage as MessageTokenUsage
    }

    if (source.compaction && typeof source.compaction === "object") {
        message.compaction = source.compaction as MessageCompaction
    }

    return message
}

/**
 * 配装助手对话状态：消息流 + 配装 Agent 调用。
 *
 * 与资料检索的 {@link useDBChat} 共用同一个公共核（{@link useAgentChatCore}：
 * 回调构建 / 耗时累加 / 挂起续跑 / 错误兜底），差别只在会话按角色一条存档、
 * 没有会话列表，且失败提问可重试。
 * @param selectedChar 当前角色名
 * @param settingStore 设置 store（取 AI 输出上限）
 * @returns 对话状态与操作方法
 */
export function useBuildChat(selectedChar: Ref<string>, settingStore: ReturnType<typeof useSettingStore>) {
    const agent = createBuildAgent({
        ...(resolveSharedAgentUpstream() ?? { api_key: "" }),
        timeout: 30000,
        max_retries: 3,
        default_max_tokens: settingStore.aiMaxTokens || DEFAULT_AI_MAX_TOKENS,
    })

    /** 当前角色的消息列表 */
    const messages = ref<BuildAgentChatMessage[]>([])
    /** 上一轮失败的提问原文；非空时界面提供「重试」入口 */
    const failedPrompt = ref("")
    /** 显式 AI 会话 id：随请求头发给服务端代理用于日志归会话；随会话落库，清空对话后重新生成 */
    let aiSessionId = ""

    const core = useAgentChatCore<BuildAgentChatMessage>({
        agent,
        // 落库整份会话存档（消息里可能带响应式代理，persistMessages 内部会深拷贝）
        persist: () => persistMessages(),
        errorKeys: {
            noConfig: "ai-chat.error.noConfig",
            unknown: "ai-chat.error.unknown",
            requestFailed: "ai-chat.error.requestFailed",
        },
    })

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
            aiSessionId = chat?.aiSessionId ?? ""
            const list = Array.isArray(chat?.messages) ? chat.messages : []
            messages.value = list
                .map((message, index) => normalizeStoredMessage(message, index))
                .filter((message): message is BuildAgentChatMessage => message !== null)

            // 用量面板跟着会话走：先清掉上一个角色的真实用量，再从落库用量恢复命中率与锚点
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
        const plain = JSON.parse(JSON.stringify(messages.value)) as BuildAgentChatMessage[]
        const record: UBuildAgentChat = {
            id: chatId(selectedChar.value),
            charName: selectedChar.value,
            messages: plain,
            ...(aiSessionId ? { aiSessionId } : {}),
            updatedAt: Date.now(),
        }

        try {
            await db.buildAgentChats.put(record)
        } catch (error) {
            console.error(i18next.t("ai-chat.saveChatFailed"), error)
        }
    }

    /**
     * 取显式 AI 会话 id：没有就生成一个（下次 persistMessages 时落库）。
     * @returns 会话 id。
     */
    function ensureAiSessionId(): string {
        if (!aiSessionId) {
            aiSessionId = `s-${crypto.randomUUID()}`
        }
        return aiSessionId
    }

    /**
     * 清空当前角色的对话，并落一条空的会话记录（保证刷新后仍是空对话）。
     */
    async function clearChat(): Promise<void> {
        messages.value = []
        core.liveReasoning.value = ""
        failedPrompt.value = ""
        aiSessionId = ""
        core.clearPendingAsk()
        core.resetContextUsage()
        await db.buildAgentChats.delete(chatId(selectedChar.value)).catch(() => undefined)
        await persistMessages()
    }

    /**
     * 构建发给模型的会话历史（感知压缩边界）。
     *
     * 最后一条压缩边界之前的消息已并入边界摘要，全部丢弃、以边界摘要作为首条用户消息替代。
     * @param excludeId 需要排除的消息 id（发送时排除本轮占位的助手消息）
     * @returns 回灌历史
     */
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

    /**
     * 落库一条压缩边界消息（system 角色，content 为回灌给模型的摘要全文）。
     * @param outcome 压缩结果
     */
    async function persistCompactionMarker(outcome: AgentCompactionOutcome): Promise<void> {
        const compaction: MessageCompaction = {
            preTokens: outcome.preTokens,
            postTokens: outcome.postTokens,
            summarizedCount: outcome.summarizedCount,
            keptCount: outcome.keptCount,
        }
        const marker: BuildAgentChatMessage = {
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

    /**
     * 发送前压缩预检：估算当前会话上下文，逼近阈值时生成摘要并落库压缩边界。
     *
     * 必须在写入本轮提问**之前**执行：边界要排在本轮消息之前，后续构建历史时
     * 「边界之后的照常回灌」才包含本轮提问。
     */
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

    /**
     * 跑一轮助手回复：调用 Agent 并流式写回消息。
     *
     * 用户消息此刻已在消息列表里，这里只负责助手侧；失败时把错误写进助手消息
     * 正文并记下失败的提问，供界面提供「重试」。
     * @param message 本轮的助手消息（必须已在列表里）
     * @param prompt 本轮的提问原文（失败重试用）
     */
    async function runTurn(message: BuildAgentChatMessage, prompt: string): Promise<void> {
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

    /**
     * 发送提问：压缩预检 → 写入用户消息 → 调用配装 Agent → 流式写入回复。
     * @param rawText 用户输入
     * @param rawImages 本次附带的图片；只取前 MAX_CHAT_IMAGES 张
     */
    async function send(rawText: string, rawImages: ChatImage[] = []) {
        const text = rawText.trim()
        const images = rawImages.slice(0, MAX_CHAT_IMAGES)

        // 只有图没有文字也是一次完整提问（「这个面板怎么改」由模型自己理解图片）
        if ((!text && !images.length) || core.isBusy.value) {
            return
        }

        // 挂起期间输入框的提交被路由成「用这段文字回答当前提问」
        if (core.pendingAsk.value) {
            await core.answerPendingAsText(text)
            return
        }

        // 压缩预检：边界必须排在本轮消息之前，所以放在写入提问之前
        await runAutoCompaction()
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
     * 手动触发上下文压缩（容量面板的「压缩历史」）：无视阈值直接压缩当前会话历史。
     * @returns compacted 已压缩；noNeed 无需压缩（会话太短）；failed 压缩失败
     */
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

    /**
     * 重试上一轮失败的提问：丢掉失败留下的助手消息，用原提问重跑同一轮。
     */
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

    // 角色切换：清掉挂起态并重新载入该角色的历史对话
    // （沙箱接口里的构筑状态由 AIChatDialog 的 buildApi 直接持有，无需在此换绑）
    watch(selectedChar, async () => {
        core.clearPendingAsk()
        core.liveReasoning.value = ""
        failedPrompt.value = ""
        await loadMessages()
    })

    // 挂起回退（把回答当新提问发出）需要能调到本入口的 send，组装完成后注入
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
