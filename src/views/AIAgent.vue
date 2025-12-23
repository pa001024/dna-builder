<script setup lang="ts">
import { AIClient } from "../api/openai"
import { useSettingStore } from "../store/setting"
import { ref, onMounted, watch } from "vue"
import { db } from "../store/db"
import type { Conversation, Message, UMessage, UConversation } from "../store/db"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import MarkdownIt from "markdown-it"
// @ts-ignore - 未类型化模块
import mdKatex from "markdown-it-katex"
import mdHighlightjs from "markdown-it-highlightjs"
import "highlight.js/styles/github.css"
import { env } from "../env"
import { launchExe } from "../api/app"

// 创建markdown-it实例，支持latex和代码高亮
const md = MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: true,
})
    .use(mdKatex, {
        throwOnError: false,
    })
    .use(mdHighlightjs)

// 渲染markdown，支持latex和代码高亮
function renderMarkdown(text: string): string {
    return md.render(text)
}

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

// MCP 服务器状态
const isMCPRunning = ref<boolean>(false)
const mcpStatus = ref<string>("未启动")
const mcpProcess = ref<any>(null)

// 初始化
async function init() {
    await loadConversations()
    if (conversations.value.length === 0) {
        await createNewConversation()
    } else {
        selectedConversationId.value = conversations.value[0].id
        await loadMessages(selectedConversationId.value)
    }

    // 检查 MCP 服务器状态
    await checkMCPServerStatus()
}

// 启动 MCP 服务器
async function startMCPServer() {
    if (isMCPRunning.value) {
        mcpStatus.value = "MCP 服务器已在运行"
        return
    }

    try {
        mcpStatus.value = "正在启动 MCP 服务器..."

        // 检查是否为桌面应用环境
        if (!env.isTauri) {
            mcpStatus.value = "MCP 服务器只能在桌面应用环境中启动"
            return
        }

        // 使用 launchExe 启动 MCP 服务器
        // sidecar/dna_mcp_server.exe 已经在 Tauri 配置中定义为外部二进制文件
        const success = await launchExe("dna_mcp_server.exe", "")

        if (!success) {
            mcpStatus.value = "启动失败"
            return
        }

        // 等待进程启动
        await new Promise((resolve) => setTimeout(resolve, 2000))

        // 检查服务器是否运行
        await checkMCPServerStatus()

        if (isMCPRunning.value) {
            mcpStatus.value = "运行中 (端口: 3000)"
            console.log("MCP 服务器已启动")
        } else {
            mcpStatus.value = "已启动但未响应，请检查端口 3000"
        }
    } catch (error: any) {
        console.error("启动 MCP 服务器失败:", error)
        mcpStatus.value = `启动失败: ${error.message}`
        isMCPRunning.value = false
        mcpProcess.value = null
    }
}

// 停止 MCP 服务器
async function stopMCPServer() {
    if (!isMCPRunning.value) {
        return
    }

    try {
        mcpStatus.value = "正在停止 MCP 服务器..."

        // 注意：使用 launchExe 启动的进程无法直接停止
        // 这里我们只是更新状态，实际需要用户手动结束进程
        isMCPRunning.value = false
        mcpStatus.value = "已标记为停止（需要手动结束进程）"
        mcpProcess.value = null
        console.log("MCP 服务器已标记为停止")

        // 提示用户如何手动停止
        setTimeout(() => {
            if (confirm("MCP 服务器需要手动结束进程。\n\n在任务管理器中结束 'dna_mcp_server.exe' 进程。\n\n是否打开任务管理器？")) {
                if (env.isTauri) {
                    launchExe("taskmgr.exe", "")
                }
            }
        }, 1000)
    } catch (error: any) {
        console.error("停止 MCP 服务器失败:", error)
        mcpStatus.value = `停止失败: ${error.message}`
    }
}

// 检查 MCP 服务器状态
async function checkMCPServerStatus() {
    if (!env.isTauri) {
        return
    }

    try {
        // 尝试连接到 MCP 服务器
        const response = await fetch("http://localhost:3000/health", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        })

        if (response.ok) {
            isMCPRunning.value = true
            mcpStatus.value = "运行中 (端口: 3000)"
        } else {
            isMCPRunning.value = false
            mcpStatus.value = "未响应"
        }
    } catch (error) {
        isMCPRunning.value = false
        mcpStatus.value = "未启动"
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

// 渲染单条消息
function renderMessage(message: Message) {
    if (!message.renderedContent) {
        try {
            const rendered = renderMarkdown(message.content)
            message.renderedContent = rendered
        } catch (error) {
            console.error("Markdown rendering failed:", error)
            // Fallback to plain text
            message.renderedContent = message.content
        }
    }
}

// 渲染所有消息
function renderAllMessages() {
    for (const message of messages.value) {
        renderMessage(message)
    }
}

// 加载消息
async function loadMessages(conversationId: number) {
    try {
        // 使用Dexie的查询API在数据库层面过滤和排序，提高效率
        messages.value = await db.messages.where("conversationId").equals(conversationId).toArray()
        // 渲染所有消息
        renderAllMessages()
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
        // Helper function for streaming updates
        function updateStreamingMessage(chunk: string) {
            const lastIndex = messages.value.length - 1
            if (lastIndex >= 0) {
                const msg = messages.value[lastIndex]
                msg.content += chunk
                msg.renderedContent = undefined
            }
        }

        async function finalizeStreamingMessage() {
            const lastIndex = messages.value.length - 1
            if (lastIndex >= 0) {
                renderMessage(messages.value[lastIndex])
            }
            // 保存完整的AI回复到数据库
            await db.messages.update(messageId, {
                content: messages.value[lastIndex].content,
            })
        }
        // 使用流式对话
        await client.streamChat(
            chatHistory,
            (chunk: string) => {
                updateStreamingMessage(chunk)
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
        await finalizeStreamingMessage()

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
            await generateAIResponse()
        }
    } catch (error) {
        console.error("图片上传失败:", error)
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

            <!-- MCP 服务器控制 -->
            <div class="mt-4 p-3 bg-base-200 rounded-lg">
                <div class="text-sm font-medium mb-2">MCP 服务器</div>
                <div class="text-xs opacity-70 mb-2">{{ mcpStatus }}</div>
                <div class="flex gap-2">
                    <button
                        @click="startMCPServer"
                        :disabled="isMCPRunning || !env.isTauri"
                        :class="[
                            'btn btn-sm flex-1',
                            isMCPRunning ? 'btn-disabled' : 'btn-success',
                            !env.isTauri ? 'btn-disabled opacity-50' : '',
                        ]"
                        title="以管理员权限启动 MCP 服务器"
                    >
                        <Icon icon="ri:play-line" class="mr-1" />
                        启动
                    </button>
                    <button
                        @click="stopMCPServer"
                        :disabled="!isMCPRunning"
                        :class="['btn btn-sm flex-1', isMCPRunning ? 'btn-error' : 'btn-disabled']"
                    >
                        <Icon icon="ri:stop-line" class="mr-1" />
                        停止
                    </button>
                </div>
                <div class="text-xs opacity-50 mt-2">
                    {{ env.isTauri ? "启动MCP服务器" : "仅限桌面应用" }}
                </div>
            </div>

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
                            <!-- 使用计算属性或异步渲染的方式处理markdown -->
                            <div v-html="msg.renderedContent || msg.content" class="markdown-content"></div>
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

/* Markdown内容样式 */
.markdown-content {
    /* 基础样式 */
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;

    /* 标题样式 */
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
        margin: 0.5em 0 0.3em 0;
        font-weight: 600;
    }

    h1 {
        font-size: 1.5em;
    }

    h2 {
        font-size: 1.3em;
    }

    h3 {
        font-size: 1.1em;
    }

    /* 段落样式 */
    p {
        margin: 0.5em 0;
    }

    /* 列表样式 */
    ul,
    ol {
        margin: 0.5em 0;
        padding-left: 1.5em;
    }

    li {
        margin: 0.2em 0;
    }

    /* 引用样式 */
    blockquote {
        margin: 0.5em 0;
        padding: 0 0 0 1em;
        border-left: 3px solid #ccc;
        opacity: 0.8;
    }

    /* 代码样式 */
    pre {
        margin: 0.5em 0;
        padding: 1em;
        background-color: rgba(0, 0, 0, 0.1);
        border-radius: 4px;
        overflow-x: auto;
    }

    code {
        padding: 0.2em 0.4em;
        background-color: rgba(0, 0, 0, 0.1);
        border-radius: 3px;
        font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
        font-size: 0.9em;
    }

    pre code {
        background-color: transparent;
        padding: 0;
        border-radius: 0;
    }

    /* 链接样式 */
    a {
        color: #3b82f6;
        text-decoration: underline;
    }

    /* 图片样式 */
    img {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
        margin: 0.5em 0;
    }

    /* 表格样式 */
    table {
        border-collapse: collapse;
        width: 100%;
        margin: 0.5em 0;
    }

    th,
    td {
        border: 1px solid #ddd;
        padding: 0.5em;
        text-align: left;
    }

    th {
        background-color: rgba(0, 0, 0, 0.05);
        font-weight: 600;
    }

    /* 水平分隔线样式 */
    hr {
        margin: 1em 0;
        border: none;
        border-top: 1px solid #ddd;
    }

    /* 粗体和斜体样式 */
    strong {
        font-weight: 600;
    }

    em {
        font-style: italic;
    }

    /* Latex公式样式 */
    .math,
    .math-block {
        margin: 1em 0;
        text-align: center;
    }

    .math-inline {
        font-size: 1.1em;
        line-height: 1.5;
    }

    /* 用户消息的markdown样式调整 */
    :deep(.bg-primary) .markdown-content {
        /* 用户消息中的链接颜色 */
        a {
            color: #93c5fd;
        }

        /* 用户消息中的代码背景色 */
        code {
            background-color: rgba(255, 255, 255, 0.2);
        }

        pre {
            background-color: rgba(255, 255, 255, 0.1);
        }
    }
}
</style>
