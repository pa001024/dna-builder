<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { useTranslation } from "i18next-vue"
import { computed, nextTick, ref, watch } from "vue"
import type { AgentToolTrace } from "@/api/agent/kernel"
import { BuildAgent } from "@/api/buildAgent"
import { useCharSettings } from "@/composables/useCharSettings"
import type { CharBuild } from "@/data"
import { type BuildAgentChatMessage, db } from "@/store/db"
import { useInvStore } from "@/store/inv"
import { useSettingStore } from "@/store/setting"
import { resolveSharedAgentUpstream, watchAgentUpstream } from "@/utils/agent-upstream"
import { DEFAULT_AI_MAX_TOKENS } from "@/utils/ai-config"
import type { AskUserRequest, AskUserResponse } from "@/utils/db-ask-user"

const props = defineProps<{
    charBuild: CharBuild
}>()
const inv = useInvStore()
const selectedChar = useLocalStorage("selectedChar", "赛琪")
const selectedCharId = computed(() => props.charBuild?.char?.id || 0)
const charSettings = useCharSettings(selectedCharId)
const settingStore = useSettingStore()
const { t } = useTranslation()

const isOpen = ref(false)
const messages = ref<BuildAgentChatMessage[]>([])
const inputMessage = ref("")
const isLoading = ref(false)
const chatContainer = ref<HTMLElement>()
let agent: BuildAgent | null = null
const lastFailedMessage = ref<string>("") // 保存最后一次失败的消息
const collapsedReasoning = ref<Set<number>>(new Set()) // 跟踪哪些消息的思考过程被折叠
/** 当前等待用户作答的 ask_user 提问；非空时输入框的提交被路由成「回答这道题」 */
const pendingAsk = ref<AskUserRequest | null>(null)
const BUILD_AGENT_CHAT_ID_PREFIX = "build-agent-chat:"
/** 挂起等待的唤醒回调：由 runAgentTurn 在需要等待时写入 */
let pendingResolver: (() => void) | null = null
/** 待回填的用户回答 */
let pendingAnswer: AskUserResponse = { requestId: "", answers: [], skipped: false }

/**
 * 获取当前角色对应的配装助手对话主键
 * @param charName 角色名
 * @returns 对话主键
 */
function getBuildAgentChatId(charName: string): string {
    return `${BUILD_AGENT_CHAT_ID_PREFIX}${charName}`
}

/**
 * 构建欢迎语
 * @returns 欢迎语文本
 */
function getWelcomeMessageContent(): string {
    const charElm = props.charBuild?.char?.属性 || ""
    return t("ai-chat.welcome", {
        charName: selectedChar.value,
        charElm,
    })
}

/**
 * 将消息列表转换为可持久化的纯对象，避免Dexie克隆响应式对象失败
 * @param chatMessages 当前消息
 * @returns 可持久化消息
 */
function normalizePersistMessages(chatMessages: BuildAgentChatMessage[]): BuildAgentChatMessage[] {
    return chatMessages.map(message => ({
        role: message.role,
        content: typeof message.content === "string" ? message.content : String(message.content ?? ""),
        reasoning: typeof message.reasoning === "string" ? message.reasoning : undefined,
        traces: Array.isArray(message.traces) ? [...message.traces] : undefined,
    }))
}

/**
 * 从Dexie加载当前角色的历史对话
 */
async function loadPersistedChat(): Promise<void> {
    try {
        const chat = await db.buildAgentChats.get(getBuildAgentChatId(selectedChar.value))
        messages.value = normalizePersistMessages(chat?.messages ?? [])
        const collapsed = new Set<number>()
        messages.value.forEach((message, index) => {
            if (message.role === "assistant" && (message.reasoning || message.traces?.length)) {
                collapsed.add(index)
            }
        })
        collapsedReasoning.value = collapsed
    } catch (error) {
        console.error("加载配装助手历史对话失败", error)
        messages.value = []
        collapsedReasoning.value = new Set()
    }
}

/**
 * 将当前对话写入Dexie
 */
async function savePersistedChat(): Promise<void> {
    try {
        const persistMessages = normalizePersistMessages(messages.value)
        await db.buildAgentChats.put({
            id: getBuildAgentChatId(selectedChar.value),
            charName: selectedChar.value,
            messages: persistMessages,
            updatedAt: Date.now(),
        })
    } catch (error) {
        /**
         * 针对DataCloneError做一次兜底序列化，避免被不可克隆对象阻断持久化
         */
        if (error instanceof Error && error.name === "DataCloneError") {
            try {
                const fallbackMessages = JSON.parse(JSON.stringify(normalizePersistMessages(messages.value))) as BuildAgentChatMessage[]
                await db.buildAgentChats.put({
                    id: getBuildAgentChatId(selectedChar.value),
                    charName: selectedChar.value,
                    messages: fallbackMessages,
                    updatedAt: Date.now(),
                })
                return
            } catch (fallbackError) {
                console.error("保存配装助手历史对话失败(兜底后)", fallbackError)
                return
            }
        }
        console.error("保存配装助手历史对话失败", error)
    }
}

/**
 * 确保会话存在欢迎语
 */
async function ensureWelcomeMessage(): Promise<void> {
    if (messages.value.length > 0) {
        return
    }
    messages.value.push({
        role: "assistant",
        content: getWelcomeMessageContent(),
    })
    await savePersistedChat()
}

/**
 * 清除当前角色的历史对话
 */
async function clearPersistedChat(): Promise<void> {
    try {
        await db.buildAgentChats.delete(getBuildAgentChatId(selectedChar.value))
    } catch (error) {
        console.error("清除配装助手历史对话失败", error)
    }
}

/**
 * 将指定消息的思考过程设为折叠状态
 * @param index 消息索引
 */
function collapseReasoning(index: number): void {
    if (index < 0) {
        return
    }
    const nextCollapsed = new Set(collapsedReasoning.value)
    nextCollapsed.add(index)
    collapsedReasoning.value = nextCollapsed
}

// 初始化AI Agent
async function initAgent() {
    if (agent) {
        return
    }

    const config = resolveSharedAgentUpstream()

    if (!config) {
        messages.value.push({
            role: "assistant",
            content: t("ai-chat.noConfigMessage", {
                hasUserConfig: false,
            }),
        })
        return
    }

    agent = new BuildAgent(
        {
            ...config,
            timeout: config.timeout ?? 30000,
            max_retries: config.max_retries ?? 3,
            default_max_tokens: config.default_max_tokens ?? (settingStore.aiMaxTokens || DEFAULT_AI_MAX_TOKENS),
        },
        charSettings,
        selectedChar,
        inv
    )
}

// 设置或登录状态变化时同步上游配置（换密钥 / 登录 / 退出都要重建传输）
watchAgentUpstream(config => agent?.updateConfig(config))

// 监听角色切换
watch(selectedChar, async () => {
    if (agent && isOpen.value) {
        agent.updateHost(charSettings, selectedChar)
    }
    if (isOpen.value) {
        await loadPersistedChat()
        await ensureWelcomeMessage()
        scrollToBottom()
    }
})

// 打开对话
async function openChat() {
    isOpen.value = true
    if (!agent) {
        await initAgent()
    }
    await loadPersistedChat()
    await ensureWelcomeMessage()
    scrollToBottom()
}

// 关闭对话
function closeChat() {
    isOpen.value = false
}

/**
 * 把一条工具痕迹渲染成一行过程说明
 * @param trace 工具痕迹
 * @returns 展示文本
 */
function describeTrace(trace: { label: string; summary?: string; status: string }): string {
    return trace.summary ? `${trace.label} · ${trace.summary}` : trace.label
}

/**
 * 组装 Agent 回调：把流式增量、工具痕迹与思考写进当前助手消息
 * @param messageIndex 目标消息下标
 * @returns Agent 回调集合
 */
function createCallbacks(messageIndex: number) {
    return {
        onDelta: (text: string, type: "reasoning" | "content") => {
            const message = messages.value[messageIndex]

            if (type === "reasoning") {
                message.reasoning = `${message.reasoning ?? ""}${text}`
            } else {
                message.content += text
            }
            scrollToBottom()
        },
        onToolTrace: (trace: AgentToolTrace) => {
            const message = messages.value[messageIndex]

            if (!Array.isArray(message.traces)) {
                message.traces = []
            }
            const line = describeTrace(trace)
            const exists = message.traces.findIndex(item => item.startsWith(trace.label))

            if (exists >= 0) {
                message.traces[exists] = line
            } else {
                message.traces.push(line)
            }
            scrollToBottom()
        },
    }
}

/**
 * 运行一轮问答（含工具单轮的多次挂起续跑）
 * @param userMessage 用户输入
 */
async function runAgentTurn(runner: BuildAgent, userMessage: string): Promise<void> {
    lastFailedMessage.value = ""

    const assistantIndex = messages.value.length
    messages.value.push({ role: "assistant", content: "", reasoning: "", traces: [] })
    await savePersistedChat()

    const callbacks = createCallbacks(assistantIndex)
    const history = messages.value
        .slice(0, assistantIndex)
        .filter(message => message.role === "user" || message.role === "assistant")
        .map(message => ({ role: message.role, content: message.content }))

    try {
        // ask_user 会让一轮问答多次挂起：每次拿到提问就停下来等用户作答，答完再续跑
        let result = await runner.run([...history, { role: "user", content: userMessage }], callbacks)

        while (result.pendingAsk) {
            pendingAsk.value = result.pendingAsk.payload
            await savePersistedChat()
            await new Promise<void>(resolve => {
                pendingResolver = resolve
            })
            result = pendingAnswer.skipped ? await runner.skipAsk(callbacks) : await runner.answerAsk(pendingAnswer, callbacks)
        }

        messages.value[assistantIndex].content = result.reply || messages.value[assistantIndex].content
        collapseReasoning(assistantIndex)
        await savePersistedChat()
    } finally {
        pendingAsk.value = null
        pendingResolver = null
    }
}

/**
 * 挂起中的ask_user作答：选了某个选项即用该选项作答
 * @param questionId 题号
 * @param optionId 选项 id
 */
function answerAskOption(questionId: string, optionId: string): void {
    submitAskAnswer([{ questionId, optionIds: [optionId], custom: "" }])
}

/**
 * 挂起中的ask_user作答：自由输入
 * @param text 用户输入的文本
 */
function answerAskCustom(text: string): void {
    const first = pendingAsk.value?.questions[0]

    if (!first) {
        return
    }
    submitAskAnswer([{ questionId: first.id, optionIds: [], custom: text }])
}

/**
 * 提交ask_user回答并唤醒挂起中的循环
 * @param answers 逐题回答
 */
function submitAskAnswer(answers: AskUserResponse["answers"]): void {
    const request = pendingAsk.value

    if (!request) {
        return
    }

    pendingAnswer = { requestId: request.id, answers }
    pendingAsk.value = null
    pendingResolver?.()
}

/**
 * 发送一条消息（或重试上一条失败的消息）
 * @param retryMessage 重试时的原始消息；为空表示正常输入
 */
async function sendMessage(retryMessage = "") {
    if (!inputMessage.value.trim() && !retryMessage) return
    if (isLoading.value) return

    const userMessage = retryMessage || inputMessage.value.trim()

    // 有挂起提问时，输入框的内容按「自由作答」提交，而不是当成新一轮提问
    if (pendingAsk.value) {
        answerAskCustom(userMessage)
        inputMessage.value = ""
        return
    }

    messages.value.push({
        role: "user",
        content: userMessage,
    })
    inputMessage.value = ""

    isLoading.value = true

    try {
        if (!agent) {
            await initAgent()
        }

        if (!agent) {
            throw new Error(t("ai-chat.assistantNotInitialized"))
        }

        await runAgentTurn(agent, userMessage)
    } catch (error) {
        console.error("发送消息失败", error)
        lastFailedMessage.value = userMessage // 保存失败的消息

        let errorMessage = t("ai-chat.error.generic")

        if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase()

            if (errorMsg.includes("api密钥") || errorMsg.includes("api key") || errorMsg.includes("401")) {
                errorMessage = t("ai-chat.error.apiKey")
            } else if (
                errorMsg.includes("网络") ||
                errorMsg.includes("network") ||
                errorMsg.includes("fetch") ||
                errorMsg.includes("econnrefused")
            ) {
                errorMessage = t("ai-chat.error.network")
            } else if (errorMsg.includes("timeout") || errorMsg.includes("超时")) {
                errorMessage = t("ai-chat.error.timeout")
            } else if (errorMsg.includes("rate limit") || errorMsg.includes("请求过多") || errorMsg.includes("429")) {
                errorMessage = t("ai-chat.error.rateLimit")
            } else {
                errorMessage = t("ai-chat.error.requestFailed", { message: error.message })
            }
        } else {
            errorMessage = t("ai-chat.error.unknown")
        }

        const lastMessage = messages.value[messages.value.length - 1]
        if (lastMessage && lastMessage.role === "assistant" && lastMessage.content === "") {
            lastMessage.content = errorMessage
        } else {
            messages.value.push({
                role: "assistant",
                content: errorMessage,
            })
        }
        await savePersistedChat()
    } finally {
        isLoading.value = false
        scrollToBottom()
    }
}

// 滚动到底部
function scrollToBottom() {
    nextTick(() => {
        if (chatContainer.value) {
            chatContainer.value.scrollTop = chatContainer.value.scrollHeight
        }
    })
}

// 切换思考过程的折叠状态
function toggleReasoning(index: number) {
    if (collapsedReasoning.value.has(index)) {
        collapsedReasoning.value.delete(index)
    } else {
        collapsedReasoning.value.add(index)
    }
    // 强制更新视图
    collapsedReasoning.value = new Set(collapsedReasoning.value)
}

// 重试发送消息（错误气泡上的「重试」按钮）
async function retryMessage() {
    if (lastFailedMessage.value) {
        await sendMessage(lastFailedMessage.value)
    }
}

// 处理回车键发送消息
function handleKeyPress() {
    sendMessage()
}

// 清空对话
async function clearChat() {
    messages.value = []
    collapsedReasoning.value = new Set()
    pendingAsk.value = null

    // 有挂起的 ask_user 时先把循环唤醒：否则等待中的那一轮会永远停在 await 上
    if (pendingResolver) {
        pendingAnswer = { requestId: pendingAnswer.requestId, answers: [], skipped: true }
        pendingResolver()
        pendingResolver = null
    }

    if (agent) {
        agent.clearPending()
    }

    await clearPersistedChat()
    await ensureWelcomeMessage()
}
</script>

<template>
    <div>
        <!-- 固定按钮 -->
        <button v-if="!isOpen" class="fixed bottom-8 right-8 btn btn-circle btn-md btn-primary shadow-xl z-50" @click="openChat">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
            </svg>
        </button>

        <!-- 对话框 -->
        <div
            v-if="isOpen"
            class="fixed bottom-0 right-0 w-full md:w-96 h-[80vh] bg-base-300 shadow-2xl rounded-t-xl z-50 flex flex-col transition-transform duration-200"
            :class="isOpen ? 'translate-y-0' : 'translate-y-full'"
        >
            <!-- 头部 -->
            <div class="flex items-center justify-between p-4 border-b border-base-content/20 bg-base-200 rounded-t-xl">
                <div class="flex items-center gap-2">
                    <span class="font-semibold">{{ $t("ai-chat.title") }}</span>
                </div>
                <div class="flex gap-2">
                    <button class="btn btn-ghost btn-sm" :disabled="isLoading" @click="clearChat">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                        </svg>
                    </button>
                    <button class="btn btn-ghost btn-sm" :disabled="isLoading" @click="closeChat">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            <!-- 消息区域 -->
            <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
                <div
                    v-for="(message, index) in messages"
                    :key="index"
                    class="flex"
                    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                >
                    <div
                        class="max-w-[80%] rounded-2xl px-4 py-2"
                        :class="
                            message.role === 'user'
                                ? 'bg-primary text-primary-content rounded-br-sm'
                                : 'bg-base-200 text-base-content rounded-bl-sm'
                        "
                    >
                        <div class="whitespace-pre-wrap text-sm wrap-break-word select-text!">
                            <!-- 工具调用过程 -->
                            <template v-if="message.traces?.length && message.role === 'assistant'">
                                <ul class="mb-2 space-y-0.5 text-[11px] text-base-content/60 tabular-nums">
                                    <li v-for="(trace, traceIndex) in message.traces" :key="traceIndex">· {{ trace }}</li>
                                </ul>
                            </template>

                            <!-- 显示思考过程 -->
                            <template v-if="message.reasoning && message.role === 'assistant'">
                                <div class="mb-2">
                                    <button
                                        class="btn btn-xs btn-ghost gap-1 items-center text-base-content/70 hover:text-base-content"
                                        @click="toggleReasoning(index)"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-3 w-3 transition-transform duration-200"
                                            :class="{ 'rotate-90': !collapsedReasoning.has(index) }"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                        </svg>
                                        <span class="text-xs">{{ $t("ai-chat.reasoning") }}</span>
                                    </button>
                                    <div
                                        v-if="!collapsedReasoning.has(index)"
                                        class="mt-2 p-2 bg-base-300 rounded-lg text-base-content/80 text-xs border-l-2 border-primary"
                                    >
                                        {{ message.reasoning }}
                                    </div>
                                </div>
                            </template>

                            <!-- 普通消息 -->
                            <template v-if="message.content">
                                {{ message.content }}
                            </template>
                            <!-- 加载动画 -->
                            <span
                                v-if="isLoading && index === messages.findLastIndex(msg => msg.role === 'assistant')"
                                class="loading loading-dots loading-sm"
                            />
                        </div>
                    </div>
                </div>

                <!-- 等待用户作答的提问卡片 -->
                <div v-if="pendingAsk" class="flex justify-start">
                    <div class="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 bg-base-100 border border-primary/30">
                        <div v-if="pendingAsk.title" class="text-sm font-semibold mb-2">{{ pendingAsk.title }}</div>
                        <div v-for="question in pendingAsk.questions" :key="question.id" class="mb-2">
                            <div class="text-xs text-base-content/80 mb-1">{{ question.header }}</div>
                            <div class="flex flex-wrap gap-1">
                                <button
                                    v-for="option in question.options"
                                    :key="option.id"
                                    class="btn btn-xs btn-outline"
                                    @click="answerAskOption(question.id, option.id)"
                                >
                                    {{ option.label }}
                                </button>
                            </div>
                        </div>
                        <div class="text-[11px] text-base-content/50">{{ $t("ai-chat.askHint") }}</div>
                    </div>
                </div>
            </div>

            <!-- 输入区域 -->
            <div class="p-4 border-t border-base-content/20 bg-base-200">
                <div class="flex gap-2">
                    <input
                        v-model="inputMessage"
                        type="text"
                        :placeholder="pendingAsk ? $t('ai-chat.askInputPlaceholder') : $t('ai-chat.inputPlaceholder')"
                        class="flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        :disabled="isLoading && !pendingAsk"
                        @keyup.enter="handleKeyPress"
                    />
                    <button class="btn btn-primary btn-sm" :disabled="isLoading || !inputMessage.trim()" @click="handleKeyPress">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </div>
                <div class="text-xs text-base-content/60 mt-2">{{ $t("ai-chat.tip") }}</div>
                <div v-if="lastFailedMessage" class="mt-2">
                    <button class="btn btn-xs btn-outline" :disabled="isLoading" @click="retryMessage">
                        {{ $t("ai-chat.retry") }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
