<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import { type AiLogMessage, type AiLogToolCall, type AiLogTurnRecord, readAiLogSession } from "@/api/aiLog"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { formatCost, formatCount, formatDuration, formatJsonText, formatLogTime, formatMessageContent } from "@/utils/ai-log-format"

/**
 * AI 会话回放弹窗：按会话 id 拉取全部轮次，展示每轮的完整请求消息与助手回复。
 *
 * 用自绘遮罩而不是通用 Dialog：后台既有 Dialog 宽 450px，装不下完整对话与工具参数。
 * 所有内容都是纯文本插值（不渲染 markdown/HTML），避免模型输出里的标签被执行。
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

/** 默认折叠的阈值（字符数）：超过后折叠成固定高度，点「展开全文」看完整内容。 */
const CLAMP_CHARS = 600

/** 已展开的内容键（`<轮次序号>:<消息序号|reasoning|tool:<序号>>`）。 */
const expanded = reactive(new Set<string>())

const summary = computed(() => `共 ${turns.value.length} 轮 · 归档日期 ${days.value.join("、") || "-"}`)

/**
 * @description 判断文本是否需要折叠。
 * @param text 文本内容。
 * @returns 是否超过折叠阈值。
 */
function needsClamp(text: string): boolean {
    return text.length > CLAMP_CHARS
}

/**
 * @description 取内容容器的类名（折叠时限制高度）。
 * @param key 内容键。
 * @param text 文本内容。
 * @returns 类名。
 */
function contentClass(key: string, text: string): string {
    return needsClamp(text) && !expanded.has(key) ? "max-h-40 overflow-hidden" : ""
}

/**
 * @description 切换某段内容的展开状态。
 * @param key 内容键。
 */
function toggleContent(key: string) {
    if (expanded.has(key)) {
        expanded.delete(key)
    } else {
        expanded.add(key)
    }
}

/**
 * @description 取消息角色对应的徽标样式。
 * @param role 角色名。
 * @returns 徽标类名。
 */
function roleBadgeClass(role: string | undefined): string {
    switch (role) {
        case "system":
            return "badge-ghost"
        case "user":
            return "badge-info"
        case "assistant":
            return "badge-primary"
        case "tool":
            return "badge-warning"
        default:
            return "badge-ghost"
    }
}

/**
 * @description 取单条请求消息的纯文本。
 * @param message 日志消息。
 * @returns 展示文本。
 */
function messageText(message: AiLogMessage): string {
    const text = formatMessageContent(message.content)
    return text || (message.tool_calls?.length ? "（仅工具调用，无正文）" : "（空）")
}

/**
 * @description 取某轮的回复文本（模板里不做深层可空访问，避免类型收窄问题）。
 * @param turn 轮次记录。
 * @param field 取正文还是思维链。
 * @returns 文本内容，缺失时为空字符串。
 */
function replyText(turn: AiLogTurnRecord, field: "content" | "reasoningContent"): string {
    return turn.response.message?.[field] || ""
}

/**
 * @description 取某轮回复里的工具调用列表。
 * @param turn 轮次记录。
 * @returns 工具调用数组（无则空数组）。
 */
function replyToolCalls(turn: AiLogTurnRecord): AiLogToolCall[] {
    return turn.response.message?.toolCalls || []
}

/**
 * @description 判断某轮是否产出了内容（正文 / 思维链 / 工具调用任一）。
 * @param turn 轮次记录。
 * @returns 是否有内容。
 */
function hasReplyContent(turn: AiLogTurnRecord): boolean {
    return Boolean(replyText(turn, "content") || replyText(turn, "reasoningContent") || replyToolCalls(turn).length)
}

/**
 * @description 复制文本到剪贴板，便于贴进工单或向 DeepSeek 反馈。
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
 * @description 缩略展示上游标识（完整值挂 title，点一下复制完整值）。
 * @param value 上游标识。
 * @returns 前 10 位加省略号。
 */
function shortUpstreamId(value: string): string {
    return `${value.slice(0, 10)}…`
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
    expanded.clear()

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

            <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div v-if="loading" class="flex items-center justify-center gap-2 py-16 text-sm text-base-content/70">
                    <span class="loading loading-spinner loading-md"></span>
                    <span>加载会话…</span>
                </div>

                <div v-else-if="error" class="alert alert-error text-sm">
                    <Icon icon="ri:error-warning-line" class="text-lg" />
                    <span>{{ error }}</span>
                </div>

                <div v-else class="space-y-4">
                    <article
                        v-for="(turn, turnIndex) in turns"
                        :key="turn.requestId"
                        class="overflow-hidden rounded-box border border-base-300"
                    >
                        <header class="flex flex-wrap items-center gap-x-3 gap-y-1 bg-base-200/60 px-4 py-2 text-xs">
                            <span class="badge badge-sm badge-ghost">#{{ turnIndex + 1 }}</span>
                            <span class="font-mono text-base-content/80">{{ formatLogTime(turn.time) }}</span>
                            <span class="badge badge-sm" :class="turn.ok ? 'badge-success' : 'badge-error'">
                                {{ turn.ok ? "成功" : "失败" }} {{ turn.status }}
                            </span>
                            <span v-if="turn.stream" class="badge badge-xs badge-ghost">流式</span>
                            <span class="text-base-content/70">耗时 {{ formatDuration(turn.durationMs) }}</span>
                            <span v-if="turn.usage" class="font-mono text-base-content/70">
                                输入 {{ formatCount(turn.usage.prompt) }} / 输出 {{ formatCount(turn.usage.completion) }}
                            </span>
                            <span class="font-mono text-base-content/70">{{ formatCost(turn.costMicros) }}</span>
                            <span v-if="turn.response.finishReason" class="text-base-content/50">
                                finish_reason: {{ turn.response.finishReason }}
                            </span>
                            <!-- 上游请求级标识：只出现在响应侧，用于跟 DeepSeek 官方对账 -->
                            <button
                                v-if="turn.upstreamTraceId"
                                class="flex items-center gap-1 font-mono text-base-content/60 hover:text-primary hover:underline"
                                :title="`x-ds-trace-id: ${turn.upstreamTraceId}`"
                                @click="copyText(turn.upstreamTraceId, '上游 trace id')"
                            >
                                <Icon icon="ri:file-copy-line" />
                                <span>trace {{ shortUpstreamId(turn.upstreamTraceId) }}</span>
                            </button>
                            <button
                                v-if="turn.upstreamCompletionId"
                                class="flex items-center gap-1 font-mono text-base-content/60 hover:text-primary hover:underline"
                                :title="`上游补全 id: ${turn.upstreamCompletionId}`"
                                @click="copyText(turn.upstreamCompletionId, '上游补全 id')"
                            >
                                <Icon icon="ri:file-copy-line" />
                                <span>id {{ shortUpstreamId(turn.upstreamCompletionId) }}</span>
                            </button>
                        </header>

                        <div v-if="turn.error" class="border-t border-base-300 bg-error/5 px-4 py-2 text-xs">
                            <span class="font-medium text-error">[{{ turn.error.code }}] {{ turn.error.message }}</span>
                            <pre v-if="turn.error.raw" class="mt-1 max-h-32 overflow-auto font-mono text-base-content/70">{{
                                formatJsonText(turn.error.raw)
                            }}</pre>
                        </div>

                        <div class="divide-y divide-base-300 border-t border-base-300">
                            <!-- 请求：本次发给上游的完整消息 -->
                            <section class="px-4 py-3">
                                <h4 class="flex items-center gap-2 text-xs font-semibold tracking-wider text-base-content/60 uppercase">
                                    <Icon icon="ri:arrow-up-line" />
                                    <span>请求（{{ turn.request.messages.length }} 条消息）</span>
                                    <span v-if="turn.request.truncated" class="badge badge-xs badge-warning">已截断</span>
                                </h4>

                                <dl class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60">
                                    <div v-if="turn.request.tools.length" class="flex gap-1">
                                        <dt>工具：</dt>
                                        <dd class="font-mono">{{ turn.request.tools.join(", ") }}</dd>
                                    </div>
                                    <div v-if="turn.request.temperature !== null" class="flex gap-1">
                                        <dt>temperature：</dt>
                                        <dd class="font-mono">{{ turn.request.temperature }}</dd>
                                    </div>
                                    <div v-if="turn.request.maxTokens !== null" class="flex gap-1">
                                        <dt>max_tokens：</dt>
                                        <dd class="font-mono">{{ turn.request.maxTokens }}</dd>
                                    </div>
                                </dl>

                                <div class="mt-3 space-y-3">
                                    <div v-for="(message, messageIndex) in turn.request.messages" :key="messageIndex">
                                        <div class="flex flex-wrap items-center gap-2 text-xs">
                                            <span class="badge badge-xs" :class="roleBadgeClass(message.role)">
                                                {{ message.role || "unknown" }}
                                            </span>
                                            <span v-if="typeof message.tool_call_id === 'string'" class="font-mono text-base-content/50">
                                                {{ message.tool_call_id }}
                                            </span>
                                        </div>

                                        <div :class="contentClass(`${turnIndex}:${messageIndex}`, messageText(message))">
                                            <pre class="mt-1 font-sans text-xs whitespace-pre-wrap wrap-break-word text-base-content/85">{{
                                                messageText(message)
                                            }}</pre>
                                        </div>
                                        <button
                                            v-if="needsClamp(messageText(message))"
                                            class="mt-1 text-xs text-primary hover:underline"
                                            @click="toggleContent(`${turnIndex}:${messageIndex}`)"
                                        >
                                            {{ expanded.has(`${turnIndex}:${messageIndex}`) ? "收起" : "展开全文" }}
                                        </button>

                                        <div v-for="(call, callIndex) in message.tool_calls || []" :key="callIndex" class="mt-2">
                                            <p class="text-xs text-base-content/60">
                                                调用 <span class="font-mono text-base-content/80">{{ call.function?.name }}</span>
                                            </p>
                                            <pre
                                                class="mt-1 max-h-40 overflow-auto rounded-xs bg-base-200/60 p-2 font-mono text-xs whitespace-pre-wrap wrap-break-word text-base-content/80"
                                                >{{ formatJsonText(call.function?.arguments) }}</pre
                                            >
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <!-- 响应：助手回复正文与工具调用 -->
                            <section class="px-4 py-3">
                                <h4 class="flex items-center gap-2 text-xs font-semibold tracking-wider text-base-content/60 uppercase">
                                    <Icon icon="ri:arrow-down-line" />
                                    <span>响应</span>
                                </h4>

                                <div v-if="!hasReplyContent(turn)" class="mt-2 text-xs text-base-content/60">
                                    （本轮未产出内容）
                                </div>

                                <template v-else>
                                    <div v-if="replyText(turn, 'reasoningContent')" class="mt-2">
                                        <p class="text-xs text-base-content/60">思维链</p>
                                        <div :class="contentClass(`${turnIndex}:reasoning`, replyText(turn, 'reasoningContent'))">
                                            <pre
                                                class="mt-1 font-sans text-xs whitespace-pre-wrap wrap-break-word text-base-content/70"
                                                >{{ replyText(turn, "reasoningContent") }}</pre
                                            >
                                        </div>
                                        <button
                                            v-if="needsClamp(replyText(turn, 'reasoningContent'))"
                                            class="mt-1 text-xs text-primary hover:underline"
                                            @click="toggleContent(`${turnIndex}:reasoning`)"
                                        >
                                            {{ expanded.has(`${turnIndex}:reasoning`) ? "收起" : "展开全文" }}
                                        </button>
                                    </div>

                                    <div v-if="replyText(turn, 'content')" class="mt-2">
                                        <div :class="contentClass(`${turnIndex}:reply`, replyText(turn, 'content'))">
                                            <pre
                                                class="font-sans text-xs whitespace-pre-wrap wrap-break-word text-base-content/85"
                                                >{{ replyText(turn, "content") }}</pre
                                            >
                                        </div>
                                        <button
                                            v-if="needsClamp(replyText(turn, 'content'))"
                                            class="mt-1 text-xs text-primary hover:underline"
                                            @click="toggleContent(`${turnIndex}:reply`)"
                                        >
                                            {{ expanded.has(`${turnIndex}:reply`) ? "收起" : "展开全文" }}
                                        </button>
                                    </div>

                                    <div v-for="(call, callIndex) in replyToolCalls(turn)" :key="callIndex" class="mt-3">
                                        <p class="text-xs text-base-content/60">
                                            <span class="badge badge-xs badge-primary">{{ call.name || "unknown" }}</span>
                                            <span v-if="call.id" class="ml-2 font-mono text-base-content/50">{{ call.id }}</span>
                                        </p>
                                        <pre
                                            class="mt-1 max-h-40 overflow-auto rounded-xs bg-base-200/60 p-2 font-mono text-xs whitespace-pre-wrap wrap-break-word text-base-content/80"
                                            >{{ formatJsonText(call.arguments) }}</pre
                                        >
                                    </div>
                                </template>
                            </section>
                        </div>
                    </article>
                </div>
            </div>
        </div>
    </div>
</template>
