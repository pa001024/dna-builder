<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { type AiLogTurnRecord, readAiLogSession } from "@/api/aiLog"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { turnsToChatMessages } from "@/utils/ai-log-replay"

/**
 * AI 会话回放弹窗：按会话 id 拉取全部轮次，用前端对话流组件（`AgentChatMessages`）回放。
 *
 * 轮次记录由 {@link turnsToChatMessages} 转成前端消息结构：每轮取最后一条 user 提问
 * 加助手回复，system 提示词与历史消息不再重复展示；工具调用折叠成前端同款过程行，
 * 点击可展开完整参数与结果原文。token 数 / 费用等元信息附在每轮回复下方的小字里。
 *
 * 用自绘遮罩而不是通用 Dialog：后台既有 Dialog 宽 450px，装不下完整对话。
 * 助手正文走前端同款 markdown 渲染（`html: false`，模型输出里的标签一律转义）。
 */

const open = defineModel<boolean>("open", { default: false })

const props = defineProps<{
    /** 待回放的会话 id。 */
    sessionId: string
}>()

const ui = useUIStore()
const user = useUserStore()

const loading = ref(false)
const error = ref("")
const turns = ref<AiLogTurnRecord[]>([])
const days = ref<string[]>([])

/** 转换后的前端消息列表（user 提问 + assistant 回复，含工具调用与元信息）。 */
const chatMessages = computed(() => turnsToChatMessages(turns.value))

const summary = computed(() => `共 ${turns.value.length} 轮 · 归档日期 ${days.value.join("、") || "-"}`)

/**
 * @description 复制文本到剪贴板，便于贴进工单或向模型服务商反馈。
 * @param text 要复制的内容。
 * @param label 提示文案里用的名称。
 */
async function copyText(text: string, label: string) {
    try {
        await navigator.clipboard.writeText(text)
        ui.showSuccessMessage(`已复制${label}`)
    } catch {
        ui.showErrorMessage("复制失败，请手动选中复制")
    }
}

/**
 * @description 拉取会话的全部轮次。
 * @param sessionId 会话 id。
 */
async function load(sessionId: string) {
    loading.value = true
    error.value = ""
    turns.value = []
    days.value = []

    try {
        const result = await readAiLogSession(sessionId, user.jwtToken)
        turns.value = result.turns
        days.value = result.days
    } catch (e) {
        error.value = e instanceof Error ? e.message : "加载会话失败"
    } finally {
        loading.value = false
    }
}

watch(
    () => [open.value, props.sessionId] as const,
    ([isOpen, sessionId]) => {
        if (!isOpen || !sessionId) return
        void load(sessionId)
    },
    { immediate: true }
)
</script>

<template>
    <div v-if="open" class="fixed inset-0 z-100 flex items-center justify-center bg-gray-900/50 p-4" @click.self="open = false">
        <div class="card w-full max-w-6xl max-h-[88vh] flex flex-col overflow-hidden bg-base-100 shadow-lg">
            <header class="shrink-0 flex items-start justify-between gap-4 border-b border-base-300 px-6 py-4">
                <div class="min-w-0">
                    <h3 class="text-lg font-semibold text-base-content">会话回放</h3>
                    <p class="mt-1 font-mono text-xs text-base-content/60 break-all">{{ sessionId }}</p>
                    <p class="mt-1 text-xs text-base-content/50">{{ summary }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                    <button class="btn btn-sm btn-ghost" @click="copyText(sessionId, '会话 ID')">
                        <Icon icon="ri:file-copy-line" />
                        <span>复制 ID</span>
                    </button>
                    <button class="btn btn-sm btn-ghost" aria-label="关闭" @click="open = false">
                        <Icon icon="ri:close-line" class="text-lg" />
                    </button>
                </div>
            </header>

            <div class="flex min-h-0 flex-1 flex-col">
                <div v-if="loading" class="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-base-content/70">
                    <span class="loading loading-spinner loading-md"></span>
                    <span>加载会话…</span>
                </div>

                <div v-else-if="error" class="flex-1 overflow-y-auto p-6">
                    <div class="alert alert-error text-sm">
                        <Icon icon="ri:error-warning-line" class="text-lg" />
                        <span>{{ error }}</span>
                    </div>
                </div>

                <!-- 前端同款对话流：user 提问右对齐气泡、assistant markdown 正文、过程折叠、meta 小字 -->
                <AgentChatMessages v-else class="px-4 py-2" :messages="chatMessages" :busy="false" reasoning="" />
            </div>
        </div>
    </div>
</template>
