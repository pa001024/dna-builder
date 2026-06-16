<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { useTranslation } from "i18next-vue"
import { nextTick, ref, watch } from "vue"
import { BuildAgent } from "../api/buildAgent"
import { useCharSettings } from "../composables/useCharSettings"
import type { CharBuild } from "../data"
import { env } from "../env"
import { type BuildAgentChatMessage, db } from "../store/db"
import { useInvStore } from "../store/inv"
import { useSettingStore } from "../store/setting"

const props = defineProps<{
    charBuild: CharBuild
}>()
const inv = useInvStore()
const selectedChar = useLocalStorage("selectedChar", "赛琪")
const charSettings = useCharSettings(selectedChar)
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
const AUTOMATION_DONE_TAG = "[[AUTOMATION_DONE]]"
const AUTOMATION_CONTINUE_TAG = "[[AUTOMATION_CONTINUE]]"
const RETRY_TAG = "[[RETRY]]"
const MAX_AUTOMATION_ROUNDS = 4
const BUILD_AGENT_CHAT_ID_PREFIX = "build-agent-chat:"

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
            if (message.role === "assistant" && message.reasoning) {
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
 * 构建自动化执行模式的首轮提示词
 * @param userMessage 用户输入
 * @returns 自动化提示词
 */
function createAutomationPrompt(userMessage: string): string {
    return t("ai-chat.automationPrompt", {
        doneTag: AUTOMATION_DONE_TAG,
        continueTag: AUTOMATION_CONTINUE_TAG,
        userMessage,
    })
}

/**
 * 构建自动化执行模式的续跑提示词
 * @param round 当前轮次
 * @returns 续跑提示词
 */
function createAutomationContinuePrompt(round: number): string {
    return t("ai-chat.automationContinuePrompt", {
        round,
        doneTag: AUTOMATION_DONE_TAG,
        continueTag: AUTOMATION_CONTINUE_TAG,
    })
}

/**
 * 检查自动化流程标记
 * @param content 当前轮次响应文本
 * @returns 自动化状态
 */
function detectAutomationStatus(content: string): "done" | "continue" | "unknown" {
    if (content.includes(AUTOMATION_DONE_TAG)) {
        return "done"
    }
    if (content.includes(AUTOMATION_CONTINUE_TAG)) {
        return "continue"
    }
    return "unknown"
}

/**
 * 清理自动化状态标记，避免展示给用户
 * @param content 原始文本
 * @returns 清理后的文本
 */
function sanitizeAutomationTags(content: string): string {
    return content.replaceAll(AUTOMATION_DONE_TAG, "").replaceAll(AUTOMATION_CONTINUE_TAG, "").trim()
}

/**
 * 兜底判断自动化是否可能已经完成
 * @param content 当前轮次响应文本
 * @returns 是否可能完成
 */
function isAutomationLikelyDone(content: string): boolean {
    return /已(完成|应用|设置|切换)/.test(content) || content.includes("自动构建参数")
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
        // 如果角色切换，更新系统提示词
        agent.updateSystemPrompt(charSettings.value, selectedChar.value)
        return
    }

    // 优先使用setting store中的API密钥配置
    const userApiKey = settingStore.aiApiKey
    const hasUserConfig = userApiKey && userApiKey.trim() !== ""

    if (hasUserConfig) {
        try {
            const config = settingStore.getOpenAIConfig()
            // 补充缺失的字段
            const fullConfig = {
                ...config,
                timeout: 30000,
                max_retries: 3,
                system_prompt: "", // BuildAgent会设置
                mcp_server_url: "",
                mcp_server_port: 0,
            }
            agent = new BuildAgent(fullConfig, charSettings, selectedChar, inv)
            console.log("使用用户配置的API密钥初始化AI Agent")
            return
        } catch (error) {
            console.error("使用用户配置初始化AI Agent失败:", error)
        }
    }

    // 如果用户没有配置API密钥，尝试使用服务端代理
    try {
        const proxyConfig = {
            base_url: env.apiEndpoint + "/api/v1",
            api_key: "proxy",
            default_model: settingStore.aiModelName || "glm-4.6v-flash",
            default_temperature: settingStore.aiTemperature || 0.6,
            default_max_tokens: settingStore.aiMaxTokens || 1024,
            timeout: 30000,
            max_retries: 3,
            system_prompt: "", // BuildAgent会设置
            mcp_server_url: "",
            mcp_server_port: 0,
        }
        agent = new BuildAgent(proxyConfig, charSettings, selectedChar, inv)
        console.log("使用服务端代理初始化AI Agent")
        return
    } catch (error) {
        console.error("使用代理初始化AI Agent失败:", error)
    }

    // 都没有配置
    messages.value.push({
        role: "assistant",
        content: t("ai-chat.noConfigMessage", {
            hasUserConfig,
        }),
    })
}

// 监听角色切换
watch(selectedChar, async () => {
    if (agent && isOpen.value) {
        agent.updateSystemPrompt(charSettings.value, selectedChar.value)
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

// 发送消息
async function sendMessage(retryMessage = "") {
    if (!inputMessage.value.trim() && !retryMessage) return
    if (isLoading.value) return

    const userMessage = retryMessage || inputMessage.value.trim()

    if (!retryMessage) {
        messages.value.push({
            role: "user",
            content: userMessage,
        })
        inputMessage.value = ""
        await savePersistedChat()
    }

    lastFailedMessage.value = "" // 清除之前的失败消息
    isLoading.value = true

    try {
        if (!agent) {
            await initAgent()
        }

        if (!agent) {
            throw new Error(t("ai-chat.assistantNotInitialized"))
        }

        // 流式响应
        let assistantMessage = ""
        let reasoningMessage = ""
        messages.value.push({
            role: "assistant",
            content: "",
            reasoning: "",
        })
        await savePersistedChat()

        const messageIndex = messages.value.length - 1
        let nextPrompt = createAutomationPrompt(userMessage)
        let automationDone = false

        for (let round = 1; round <= MAX_AUTOMATION_ROUNDS; round++) {
            let roundContent = ""

            if (round > 1) {
                assistantMessage += `\n\n${t("ai-chat.automationRoundTag", { round })}\n`
                messages.value[messageIndex].content = sanitizeAutomationTags(assistantMessage)
            }

            await agent.streamChat([{ role: "user", content: nextPrompt }], (chunk, type) => {
                if (type === "reasoning") {
                    // 思考过程
                    reasoningMessage += chunk
                    messages.value[messageIndex].reasoning = reasoningMessage
                } else if (type === "tool") {
                    // 工具调用过程
                    reasoningMessage += `${chunk}\n`
                    messages.value[messageIndex].reasoning = reasoningMessage
                } else {
                    // 正常回复
                    assistantMessage += chunk
                    roundContent += chunk
                    messages.value[messageIndex].content = sanitizeAutomationTags(assistantMessage)
                }
                scrollToBottom()
            })
            await savePersistedChat()

            const status = detectAutomationStatus(roundContent)
            if (status === "done" || (status === "unknown" && isAutomationLikelyDone(roundContent))) {
                automationDone = true
                break
            }

            if (round < MAX_AUTOMATION_ROUNDS) {
                nextPrompt = createAutomationContinuePrompt(round + 1)
            }
        }

        messages.value[messageIndex].content = sanitizeAutomationTags(assistantMessage)

        if (!automationDone) {
            const warning = t("ai-chat.automationIncompleteWarning")
            messages.value[messageIndex].content = messages.value[messageIndex].content
                ? `${messages.value[messageIndex].content}\n\n${warning}`
                : warning
        }

        // 生成完成后，默认折叠思考过程
        if (reasoningMessage) {
            collapseReasoning(messageIndex)
        }
        await savePersistedChat()
    } catch (error) {
        console.error("发送消息失败", error)
        lastFailedMessage.value = userMessage // 保存失败的消息

        // 生成友好的错误消息
        let errorMessage = t("ai-chat.error.generic")

        if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase()

            // 根据错误类型提供具体的解决方案
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
            } else if (errorMsg.includes("private member")) {
                errorMessage = t("ai-chat.error.sdk")
            } else {
                // 显示原始错误消息（但简化）
                errorMessage = t("ai-chat.error.requestFailed", { message: error.message })
            }
        } else {
            errorMessage = t("ai-chat.error.unknown")
        }

        // 添加重试提示
        errorMessage += `\n\n${RETRY_TAG}`

        // 更新现有的空消息或添加新错误消息
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

// 重试发送消息
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
    await clearPersistedChat()
    await ensureWelcomeMessage()
    if (agent) {
        // 重新初始化agent以清除上下文
        agent = null
    }
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

                            <!-- 显示错误消息和重试按钮 -->
                            <template v-if="message.content.includes(RETRY_TAG) && message.role === 'assistant'">
                                <div>{{ message.content.replace(RETRY_TAG, "") }}</div>
                                <button class="btn btn-sm btn-primary mt-2" :disabled="isLoading" @click="retryMessage">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-4 w-4 mr-1"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                        />
                                    </svg>
                                    {{ $t("ai-chat.retry") }}
                                </button>
                            </template>
                            <!-- 普通消息 -->
                            <template v-else>
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
            </div>

            <!-- 输入区域 -->
            <div class="p-4 border-t border-base-content/20 bg-base-200">
                <div class="flex gap-2">
                        <input
                            v-model="inputMessage"
                            type="text"
                            :placeholder="$t('ai-chat.inputPlaceholder')"
                            class="input input-bordered input-sm flex-1"
                            :disabled="isLoading"
                            @keyup.enter="handleKeyPress"
                    />
                    <button class="btn btn-primary btn-sm" :disabled="isLoading || !inputMessage.trim()" @click="handleKeyPress">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </div>
                <div class="text-xs text-base-content/60 mt-2">{{ $t("ai-chat.tip") }}</div>
            </div>
        </div>
    </div>
</template>
