<script setup lang="ts">
import { AIClient } from "../api/openai"
import { useSettingStore } from "../store/setting"
import { ref, onMounted, watch } from "vue"
import { db, type Conversation, type Message, type UMessage, type UConversation } from "../store/db"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"

const setting = useSettingStore()

const client = new AIClient({
    api_key: setting.aiApiKey,
    base_url: setting.aiBaseUrl,
    default_temperature: setting.aiTemperature,
    default_max_tokens: setting.aiMaxTokens,
    default_model: setting.aiModelName,
})

// 状态管理
const selectedConversationId = ref<number>(0)
const conversations = ref<Conversation[]>([])
const messages = ref<Message[]>([])
const inputText = ref<string>("")
const isLoading = ref<boolean>(false)
const isStream = ref<boolean>(false)
const scrollAreaRef = ref<HTMLElement | null>(null)
const isUserAtBottom = ref<boolean>(true)
const messageInputRef = ref<HTMLDivElement | null>(null)

// 初始化
async function init() {
    await loadConversations()
    if (conversations.value.length === 0) {
        await createNewConversation()
    } else {
        selectedConversationId.value = conversations.value[0].id
        await loadMessages(selectedConversationId.value)
    }
}

// 加载对话列表
async function loadConversations() {
    try {
        conversations.value = await db.conversations.toArray()
        // 手动排序
        conversations.value.sort((a, b) => b.updatedAt - a.updatedAt)
    } catch (error) {
        console.error("加载对话列表失败:", error)
    }
}

// 加载消息
async function loadMessages(conversationId: number) {
    try {
        // 使用Dexie的查询API在数据库层面过滤和排序，提高效率
        messages.value = await db.messages.where("conversationId").equals(conversationId).toArray()
        scrollToBottom()
    } catch (error) {
        console.error("加载消息失败:", error)
    }
}

// 创建新对话
async function createNewConversation() {
    try {
        const now = Date.now()
        const newConv: UConversation = {
            name: "新对话",
            createdAt: now,
            updatedAt: now,
        }
        const id = await db.conversations.add(newConv)
        await loadConversations()
        selectedConversationId.value = id
        messages.value = []
    } catch (error) {
        console.error("创建新对话失败:", error)
    }
}

// 切换对话
async function switchConversation(conv: Conversation) {
    selectedConversationId.value = conv.id
    await loadMessages(conv.id)
}

// 发送消息
async function sendMessage() {
    if (!inputText.value.trim() || isLoading.value) return

    const text = inputText.value.trim()
    clearInput()

    // 创建用户消息
    const userMessage: UMessage = {
        conversationId: selectedConversationId.value,
        role: "user",
        content: text,
        createdAt: Date.now(),
    }

    // 添加到消息列表并保存到数据库
    const messageId = await db.messages.add(userMessage)
    const newMessage: Message = {
        ...userMessage,
        id: messageId,
    }
    messages.value.push(newMessage)

    // 更新对话时间
    await updateConversationTimestamp(selectedConversationId.value)

    // 滚动到底部
    scrollToBottom()

    // 开始AI回复
    await generateAIResponse()
}

// 更新对话时间戳
async function updateConversationTimestamp(conversationId: number) {
    try {
        await db.conversations.update(conversationId, {
            updatedAt: Date.now(),
        })
        await loadConversations()
    } catch (error) {
        console.error("更新对话时间戳失败:", error)
    }
}

// 生成AI回复
async function generateAIResponse() {
    isLoading.value = true
    isStream.value = true

    try {
        // 创建AI消息占位符
        const aiMessage: UMessage = {
            conversationId: selectedConversationId.value,
            role: "assistant",
            content: "",
            createdAt: Date.now(),
        }
        const messageId = await db.messages.add(aiMessage)
        const newAiMessage: Message = {
            ...aiMessage,
            id: messageId,
        }
        messages.value.push(newAiMessage)

        // 准备对话历史，包含图片消息
        const chatHistory = messages.value
            .filter((msg) => msg.conversationId === selectedConversationId.value)
            .map((msg) => {
                if (msg.imageUrl) {
                    // 构建图片消息格式
                    return {
                        role: msg.role,
                        content: [
                            {
                                type: "text",
                                text: msg.content,
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: msg.imageUrl,
                                },
                            },
                        ],
                    } as ChatCompletionMessageParam
                }
                return {
                    role: msg.role,
                    content: msg.content,
                }
            })

        // 使用流式对话
        let fullResponse = ""
        await client.streamChat(
            chatHistory,
            (chunk: string) => {
                fullResponse += chunk
                // 更新消息内容 - 使用messages数组直接更新，确保响应式生效
                const lastIndex = messages.value.length - 1
                if (lastIndex >= 0) {
                    messages.value[lastIndex].content = fullResponse
                }
                // 如果用户在底部，自动滚动
                if (isUserAtBottom.value) {
                    scrollToBottom()
                }
            },
            {
                model: setting.aiModelName,
                temperature: setting.aiTemperature,
                max_tokens: setting.aiMaxTokens,
            },
        )

        // 保存完整的AI回复到数据库
        await db.messages.update(messageId, {
            content: fullResponse,
        })

        // 更新对话时间
        await updateConversationTimestamp(selectedConversationId.value)
    } catch (error) {
        console.error("AI回复生成失败:", error)
        // 添加错误消息
        const errorMessage: UMessage = {
            conversationId: selectedConversationId.value,
            role: "assistant",
            content: "抱歉，我暂时无法回复，请稍后重试。",
            createdAt: Date.now(),
        }
        await db.messages.add(errorMessage)
        await loadMessages(selectedConversationId.value)
    } finally {
        isLoading.value = false
        isStream.value = false
        scrollToBottom()
    }
}

// 滚动到底部
function scrollToBottom() {
    setTimeout(() => {
        if (scrollAreaRef.value) {
            scrollAreaRef.value.scrollTop = scrollAreaRef.value.scrollHeight
        }
    }, 100)
}

// 监听滚动事件
function handleScroll(e: Event) {
    const target = e.target as HTMLElement
    const { scrollTop, scrollHeight, clientHeight } = target
    isUserAtBottom.value = scrollTop + clientHeight >= scrollHeight - 20
}

// 监听输入框回车事件
function handleEnter(e: KeyboardEvent) {
    if (!e.shiftKey) {
        e.preventDefault()
        sendMessage()
    }
}

// 监听输入事件，手动更新inputText
function handleInput(e: Event) {
    const target = e.target as HTMLDivElement
    inputText.value = target.innerText
}

// 监听inputText变化，同步到DOM
watch(inputText, (newValue) => {
    if (messageInputRef.value && messageInputRef.value.innerText !== newValue) {
        messageInputRef.value.innerText = newValue
    }
})

// 清空输入框
function clearInput() {
    inputText.value = ""
    if (messageInputRef.value) {
        messageInputRef.value.innerText = ""
    }
}

// 处理粘贴图片
function handlePaste(e: ClipboardEvent) {
    const clipboardData = e.clipboardData
    if (!clipboardData) return

    const files = clipboardData.files
    if (files.length > 0) {
        const file = files[0]
        if (file.type.startsWith("image/")) {
            e.preventDefault()
            handleImageUpload(file)
        }
    }
}

// 处理拖拽图片
function handleDragOver(e: DragEvent) {
    e.preventDefault()
}

function handleDrop(e: DragEvent) {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
        const file = files[0]
        if (file.type.startsWith("image/")) {
            handleImageUpload(file)
        }
    }
}

// 处理图片上传
async function handleImageUpload(file: File) {
    try {
        const reader = new FileReader()
        reader.readAsDataURL(file)

        reader.onload = async (event) => {
            const imageUrl = event.target?.result as string

            // 创建包含图片的用户消息
            const userMessage: UMessage = {
                conversationId: selectedConversationId.value,
                role: "user",
                content: "",
                imageUrl: imageUrl,
                createdAt: Date.now(),
            }

            // 添加到消息列表并保存到数据库
            const messageId = await db.messages.add(userMessage)
            const newMessage: Message = {
                ...userMessage,
                id: messageId,
            }
            messages.value.push(newMessage)

            // 更新对话时间
            await updateConversationTimestamp(selectedConversationId.value)

            // 滚动到底部
            scrollToBottom()

            // 开始AI回复（处理图片）
            await generateAIResponseFromImage()
        }
    } catch (error) {
        console.error("图片上传失败:", error)
    }
}

// 从图片生成AI回复
async function generateAIResponseFromImage() {
    isLoading.value = true
    isStream.value = true

    try {
        // 创建AI消息占位符
        const aiMessage: UMessage = {
            conversationId: selectedConversationId.value,
            role: "assistant",
            content: "",
            createdAt: Date.now(),
        }
        const messageId = await db.messages.add(aiMessage)
        const newAiMessage: Message = {
            ...aiMessage,
            id: messageId,
        }
        messages.value.push(newAiMessage)

        // 准备对话历史，包含图片消息
        const chatHistory = messages.value
            .filter((msg) => msg.conversationId === selectedConversationId.value)
            .map((msg) => {
                if (msg.imageUrl) {
                    // 构建图片消息格式
                    return {
                        role: msg.role,
                        content: [
                            {
                                type: "text",
                                text: msg.content,
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: msg.imageUrl,
                                },
                            },
                        ],
                    } as ChatCompletionMessageParam
                }
                return {
                    role: msg.role,
                    content: msg.content,
                }
            })

        // 使用流式对话
        let fullResponse = ""
        await client.streamChat(
            chatHistory,
            (chunk: string) => {
                fullResponse += chunk
                // 更新消息内容 - 使用messages数组直接更新，确保响应式生效
                const lastIndex = messages.value.length - 1
                if (lastIndex >= 0) {
                    messages.value[lastIndex].content = fullResponse
                }
                // 如果用户在底部，自动滚动
                if (isUserAtBottom.value) {
                    scrollToBottom()
                }
            },
            {
                model: setting.aiModelName,
                temperature: setting.aiTemperature,
                max_tokens: setting.aiMaxTokens,
            },
        )

        // 保存完整的AI回复到数据库
        await db.messages.update(messageId, {
            content: fullResponse,
        })

        // 更新对话时间
        await updateConversationTimestamp(selectedConversationId.value)
    } catch (error) {
        console.error("AI图片回复生成失败:", error)
        // 添加错误消息
        const errorMessage: UMessage = {
            conversationId: selectedConversationId.value,
            role: "assistant",
            content: "抱歉，我暂时无法处理图片，请稍后重试。",
            createdAt: Date.now(),
        }
        await db.messages.add(errorMessage)
        await loadMessages(selectedConversationId.value)
    } finally {
        isLoading.value = false
        isStream.value = false
        scrollToBottom()
    }
}

// 中断流式输出
function interruptStream() {
    client.interruptStream()
    isStream.value = false
    isLoading.value = false
}

// 监听设置变化，重新创建客户端
watch(
    () => [setting.aiApiKey, setting.aiBaseUrl, setting.aiTemperature, setting.aiMaxTokens, setting.aiModelName],
    () => {
        client.updateConfig({
            api_key: setting.aiApiKey,
            base_url: setting.aiBaseUrl,
            default_temperature: setting.aiTemperature,
            default_max_tokens: setting.aiMaxTokens,
            default_model: setting.aiModelName,
        })
    },
    { deep: true },
)

// 初始化
onMounted(() => {
    init()
})
</script>
<template>
    <div class="flex overflow-hidden h-full">
        <!-- 对话列表 -->
        <div class="flex-none w-60 flex flex-col items-stretch overflow-hidden p-4 bg-base-100 gap-4 border-r border-gray-200">
            <button
                @click="createNewConversation"
                class="p-2 px-4 text-md cursor-pointer btn btn-primary btn-block rounded-lg hover:bg-primary/90 transition-colors"
            >
                新对话
            </button>
            <span class="text-sm opacity-50 px-2">最近对话</span>
            <ScrollArea class="flex-1 overflow-hidden">
                <ul class="flex flex-col gap-2">
                    <li
                        v-for="conv in conversations"
                        :key="conv.id"
                        :class="[
                            'p-3 text-md cursor-pointer rounded-lg transition-colors duration-200',
                            conv.id === selectedConversationId ? 'bg-primary/10 text-primary' : 'bg-gray-100 hover:bg-gray-200',
                        ]"
                        @click="switchConversation(conv)"
                    >
                        <div class="flex items-center justify-between">
                            <span class="font-medium truncate">{{ conv.name }}</span>
                            <span class="text-xs opacity-50">{{ new Date(conv.updatedAt).toLocaleDateString() }}</span>
                        </div>
                    </li>
                </ul>
            </ScrollArea>
        </div>

        <!-- 对话内容 -->
        <div class="flex-1 flex flex-col items-center justify-center overflow-hidden">
            <!-- 消息列表 -->
            <ScrollArea class="flex-1 w-full overflow-hidden p-4" @scroll="handleScroll" ref="scrollAreaRef">
                <div class="flex flex-col gap-4 max-w-3xl mx-auto w-full">
                    <!-- 消息项 -->
                    <div
                        v-for="msg in messages"
                        :key="msg.id"
                        :class="['flex gap-3 items-start', msg.role === 'user' ? 'justify-end' : 'justify-start']"
                    >
                        <!-- 头像 -->
                        <div
                            :class="[
                                'w-8 h-8 rounded-full flex items-center justify-center',
                                msg.role === 'user' ? 'bg-primary text-white' : 'bg-gray-300 text-gray-700',
                            ]"
                        >
                            {{ msg.role === "user" ? "我" : "AI" }}
                        </div>
                        <!-- 消息内容 -->
                        <div
                            :class="[
                                'max-w-[80%] p-3 rounded-lg',
                                msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none',
                            ]"
                        >
                            <p class="text-wrap break-all">{{ msg.content }}</p>
                            <!-- 图片消息 -->
                            <img
                                v-if="msg.imageUrl"
                                :src="msg.imageUrl"
                                alt=""
                                class="mt-2 max-w-full rounded-lg"
                                style="max-height: 300px; object-fit: contain"
                            />
                            <!-- 时间戳 -->
                            <div class="text-xs mt-1 opacity-70">
                                {{ new Date(msg.createdAt).toLocaleTimeString() }}
                            </div>
                        </div>
                    </div>
                    <!-- 加载状态 -->
                    <div v-if="isLoading" class="flex justify-start gap-3 items-start">
                        <div class="w-8 h-8 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center">AI</div>
                        <div class="p-3 bg-gray-100 text-gray-800 rounded-lg rounded-tl-none">
                            <div class="flex items-center gap-1">
                                <span class="animate-pulse">●</span>
                                <span class="animate-pulse">●</span>
                                <span class="animate-pulse">●</span>
                            </div>
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <!-- 输入框 -->
            <div class="flex-none flex flex-col items-center gap-2 w-full p-4 border-t border-gray-200">
                <div class="flex w-full max-w-3xl relative">
                    <div
                        ref="messageInputRef"
                        contenteditable
                        @input="handleInput"
                        @keydown.enter="handleEnter"
                        @paste="handlePaste"
                        @dragover="handleDragOver"
                        @drop="handleDrop"
                        class="flex-1 p-3 bg-gray-100 rounded-lg focus:outline-none min-h-20 max-h-[200px] overflow-y-auto"
                        placeholder="发消息或输入/选择指令，支持粘贴或拖拽图片"
                    ></div>
                    <button
                        @click="isStream ? interruptStream() : sendMessage()"
                        :class="[
                            'btn ml-2',
                            isStream ? 'btn-warning' : 'btn-primary',
                            isLoading && !isStream ? 'btn-disabled opacity-70 cursor-not-allowed' : '',
                        ]"
                    >
                        <Icon v-if="isStream" icon="ri:stop-circle-line" />
                        <Icon v-else icon="ri:send-plane-line" />
                    </button>
                </div>
                <div class="text-xs text-gray-500 w-full max-w-3xl">{{ $t("ai.inputMessage") }}</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 自定义滚动条样式 */
:deep(.scroll-area__scrollbar) {
    background-color: rgba(0, 0, 0, 0.1);
    width: 6px;
}

:deep(.scroll-area__scrollbar:hover) {
    background-color: rgba(0, 0, 0, 0.2);
}

:deep(.scroll-area__thumb) {
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 3px;
}

:deep(.scroll-area__thumb:hover) {
    background-color: rgba(0, 0, 0, 0.4);
}

/* 输入框样式 */
[contenteditable]:empty:before {
    content: attr(placeholder);
    color: #9ca3af;
    pointer-events: none;
}

[contenteditable]:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}
</style>
