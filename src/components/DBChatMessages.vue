<script lang="ts" setup>
import { computed, nextTick, ref, watch } from "vue"
import type { Message } from "@/store/db"
import { renderMarkdown } from "@/utils/markdown"

/**
 * 资料库对话消息流。
 *
 * 只负责渲染：用户提问、助手回复（markdown）与检索过程（工具调用痕迹）。
 * 数据来自 useDBChat，本组件不直接读写数据库。
 */
const props = defineProps<{
    /** 当前会话的消息列表 */
    messages: Message[]
    /** 是否正在检索 */
    busy: boolean
    /** 流式思考内容（部分模型返回，不落库） */
    reasoning: string
}>()

/** 消息滚动容器 */
const scrollerRef = ref<HTMLElement | null>(null)
/** 用户是否停留在底部（停留时才自动跟随新内容） */
const isAtBottom = ref(true)
/** 展开检索详情的消息 id 集合 */
const expandedIds = ref<number[]>([])

/**
 * 渲染助手回复（带缓存，避免流式过程中反复解析）。
 * @param message 消息
 * @returns 渲染后的 HTML
 */
function renderAssistant(message: Message): string {
    if (!message.renderedContent) {
        message.renderedContent = renderMarkdown(message.content)
    }

    return message.renderedContent
}

/**
 * 滚动到底部。
 */
async function scrollToBottom() {
    await nextTick()
    const el = scrollerRef.value

    if (el) {
        el.scrollTop = el.scrollHeight
    }
}

/**
 * 记录用户是否仍在底部（用于决定是否自动跟随）。
 */
function handleScroll() {
    const el = scrollerRef.value

    if (!el) {
        return
    }

    isAtBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 24
}

/**
 * 展开/收起某条回复的检索详情。
 * @param messageId 消息 id
 */
function toggleTrace(messageId: number) {
    expandedIds.value = expandedIds.value.includes(messageId)
        ? expandedIds.value.filter(id => id !== messageId)
        : [...expandedIds.value, messageId]
}

/** 空状态下的示例提问：直接点出两类高频检索场景 */
const exampleQuestions = ["黎瑟在剧情里做了什么？", "1.6 版本新增了哪些成就？", "魔之楔「充盈·巧力」是什么效果？"]

/**
 * 跟随信号：消息条数或最后一条内容长度变化时触发滚动。
 */
const followSignal = computed(() => `${props.messages.length}:${props.messages.at(-1)?.content.length ?? 0}:${props.reasoning.length}`)

watch(followSignal, () => {
    if (isAtBottom.value) {
        void scrollToBottom()
    }
})

watch(
    () => props.messages.length,
    () => {
        isAtBottom.value = true
        void scrollToBottom()
    }
)
</script>

<template>
    <!-- 消息滚动区：无背景；内容贴底（靠下显示），消息变多后自然向上滚动 -->
    <div ref="scrollerRef" class="db-chat-scroll min-h-0 flex-1 overflow-y-auto" @scroll="handleScroll">
        <div class="flex min-h-full flex-col justify-end">
            <div class="mx-auto w-full max-w-3xl px-1 pb-1">
                <!-- 空状态：给出可直接照抄的检索示例 -->
                <div v-if="!props.messages.length" class="py-2">
                    <p class="text-[11px] uppercase tracking-[0.28em] text-base-content/35">Data Retrieval</p>
                    <p class="mt-2 text-sm text-base-content/60">把问题交给资料检索，试试这些：</p>
                    <ul class="mt-3 flex flex-col gap-1.5">
                        <li v-for="question in exampleQuestions" :key="question" class="text-xs text-base-content/45">
                            · {{ question }}
                        </li>
                    </ul>
                </div>

                <ul v-else class="flex flex-col gap-5">
                    <li v-for="message in props.messages" :key="message.id">
                        <!-- 用户提问：右对齐，hairline 边框区分 -->
                        <div v-if="message.role === 'user'" class="flex justify-end">
                            <p
                                class="max-w-[80%] border border-base-content/15 bg-base-content/5 px-3 py-2 text-sm leading-6 whitespace-pre-wrap"
                            >
                                {{ message.content }}
                            </p>
                        </div>

                        <!-- 助手回复：检索痕迹 + markdown 正文 -->
                        <div v-else class="flex flex-col gap-2">
                            <div v-if="message.toolTraces?.length" class="flex flex-wrap items-center gap-1.5">
                                <span
                                    v-for="trace in message.toolTraces"
                                    :key="trace.id"
                                    class="inline-flex items-center gap-1 border border-base-content/12 px-1.5 py-0.5 font-mono text-[10px] text-base-content/45"
                                >
                                    <Icon
                                        :icon="trace.status === 'running' ? 'ri:refresh-line' : 'ri:search-line'"
                                        class="h-3 w-3"
                                        :class="trace.status === 'running' ? 'animate-spin text-primary' : ''"
                                    />
                                    {{ trace.label }}
                                    <span v-if="trace.summary" class="text-base-content/35">{{ trace.summary }}</span>
                                </span>

                                <button
                                    type="button"
                                    class="cursor-pointer font-mono text-[10px] text-base-content/35 transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                    @click="toggleTrace(message.id)"
                                >
                                    {{ expandedIds.includes(message.id) ? "收起检索详情" : "检索详情" }}
                                </button>
                            </div>

                            <pre
                                v-if="expandedIds.includes(message.id) && message.toolTraces?.length"
                                class="db-chat-scroll max-h-48 overflow-auto border border-base-content/12 p-2 font-mono text-[10px] leading-4 text-base-content/50"
                                >{{ JSON.stringify(message.toolTraces, null, 2) }}</pre
                            >

                            <!-- 思考内容（仅流式过程中展示） -->
                            <p
                                v-if="props.busy && message.id === props.messages.at(-1)?.id && props.reasoning"
                                class="border-l border-primary/40 pl-2 text-[11px] leading-5 text-base-content/35 whitespace-pre-wrap"
                            >
                                {{ props.reasoning }}
                            </p>

                            <div
                                v-if="message.content"
                                class="db-md text-sm leading-6 text-base-content/85"
                                v-html="renderAssistant(message)"
                            />

                            <p
                                v-else-if="props.busy && message.id === props.messages.at(-1)?.id"
                                class="flex items-center gap-1.5 text-xs text-base-content/40"
                            >
                                <Icon icon="ri:refresh-line" class="h-3.5 w-3.5 animate-spin" />
                                正在检索资料库…
                            </p>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 消息区滚动条：细、无轨道 */
.db-chat-scroll {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--color-base-content) 22%, transparent) transparent;
}

.db-chat-scroll::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

.db-chat-scroll::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--color-base-content) 20%, transparent);
}

.db-chat-scroll::-webkit-scrollbar-track {
    background: transparent;
}

/* markdown 正文排版：直角、无背景、以间距与 hairline 区分层级 */
.db-md :deep(p) {
    margin: 0.35em 0;
}

.db-md :deep(h1),
.db-md :deep(h2),
.db-md :deep(h3),
.db-md :deep(h4) {
    margin: 0.6em 0 0.3em;
    font-weight: 600;
    color: var(--color-base-content);
}

.db-md :deep(h1) {
    font-size: 1.05rem;
}

.db-md :deep(h2) {
    font-size: 1rem;
}

.db-md :deep(h3),
.db-md :deep(h4) {
    font-size: 0.9rem;
}

.db-md :deep(ul),
.db-md :deep(ol) {
    margin: 0.35em 0;
    padding-left: 1.2em;
}

.db-md :deep(li) {
    margin: 0.15em 0;
}

.db-md :deep(blockquote) {
    margin: 0.4em 0;
    padding-left: 0.75em;
    border-left: 2px solid color-mix(in srgb, var(--color-primary) 45%, transparent);
    color: color-mix(in srgb, var(--color-base-content) 60%, transparent);
}

.db-md :deep(code) {
    padding: 0.1em 0.3em;
    background: color-mix(in srgb, var(--color-base-content) 8%, transparent);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.82em;
}

.db-md :deep(pre) {
    margin: 0.5em 0;
    padding: 0.6em 0.75em;
    overflow-x: auto;
    border: 1px solid color-mix(in srgb, var(--color-base-content) 12%, transparent);
}

.db-md :deep(pre code) {
    background: transparent;
    padding: 0;
}

.db-md :deep(table) {
    width: 100%;
    margin: 0.5em 0;
    border-collapse: collapse;
    font-size: 0.8rem;
}

.db-md :deep(th),
.db-md :deep(td) {
    padding: 0.35em 0.6em;
    border-bottom: 1px solid color-mix(in srgb, var(--color-base-content) 12%, transparent);
    text-align: left;
}

.db-md :deep(th) {
    font-weight: 600;
    color: color-mix(in srgb, var(--color-base-content) 70%, transparent);
}

.db-md :deep(a) {
    color: var(--color-primary);
    text-decoration: underline;
}

.db-md :deep(hr) {
    margin: 0.8em 0;
    border: 0;
    border-top: 1px solid color-mix(in srgb, var(--color-base-content) 12%, transparent);
}

.db-md :deep(strong) {
    font-weight: 600;
    color: var(--color-base-content);
}
</style>
