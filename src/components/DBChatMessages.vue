<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, createApp, h, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { useRouter } from "vue-router"
import type { Message, MessageReasoning, MessageToolTrace } from "@/store/db"
import { useUIStore } from "@/store/ui"
import { copyText } from "@/util"
import { chatImageDataUrl } from "@/utils/chat-image"
import type { AskUserRequest, AskUserResponse } from "@/utils/db-ask-user"
import { isHashRouterMode, renderMarkdown } from "@/utils/markdown"
import { type ParsedRichComponent, parseRichComponents } from "@/utils/rich-component"
import { parseSiteRoute } from "@/utils/site-link"

/**
 * 资料库对话消息流。
 *
 * 只负责渲染：用户提问、助手回复（markdown）与检索过程（思考片段 + 工具调用痕迹）。
 * 数据来自 useDBChat，本组件不直接读写数据库。
 *
 * 助手回复除 markdown 外还会渲染两类增强内容：
 * - 站内链接：拦截点击走 SPA 跳转（href 已由 markdown 层按路由模式适配）；
 * - 特殊组件：AI 输出的白名单组件标签会被替换成真实业务组件，
 *   渲染位置由 `renderMarkdown` 留下的 `<!--rich:N-->` 注释占位符决定。
 */
const props = defineProps<{
    /** 当前会话的消息列表 */
    messages: Message[]
    /** 是否正在检索 */
    busy: boolean
    /** 流式思考内容（部分模型返回，不落库） */
    reasoning: string
    /**
     * 当前等待用户回答的提问（由 ask_user 触发）。
     * 挂在最后一条助手消息上渲染；为空表示没有挂起的提问。
     */
    pendingAsk?: AskUserRequest | null
}>()

/**
 * 事件：把挂载在本组件内的提问交互冒泡给页面。
 * - answer：用户作答（选项与自由文本都在这里）；
 * - skip：用户跳过，让模型基于已有信息继续检索。
 */
const emit = defineEmits<{
    answer: [response: AskUserResponse]
    skip: []
}>()

const ui = useUIStore()
const router = useRouter()
const { t } = useTranslation()

/** 消息滚动容器 */
const scrollerRef = ref<HTMLElement | null>(null)
/** 用户是否停留在底部（停留时才自动跟随新内容） */
const isAtBottom = ref(true)
/** 展开检索详情的消息 id 集合 */
const expandedIds = ref<number[]>([])
/** 展开思考内容的键集合：`${消息 id}:${段落序号}`，每条思考各自独立折叠 */
const expandedReasoningKeys = ref<string[]>([])
/** 刚刚复制成功的消息 id（用于把复制图标临时换成对勾做反馈） */
const copiedId = ref(0)
/** 复制反馈的复位定时器 */
let copiedTimer: number | undefined
/**
 * 助手消息渲染体元素（消息 id → 元素）。
 * 复制助手回复时取它的 textContent，避免把 markdown 渲染出的标签也复制进去。
 */
const assistantBodies = new Map<number, HTMLElement>()

/**
 * 每条助手消息解析出的特殊组件（消息 id → 组件列表）。
 * 渲染体挂载后再按 `<!--rich:N-->` 占位符把组件逐个插入对应位置。
 */
const richComponents = new Map<number, ParsedRichComponent[]>()
/** 已由本组件插入的组件宿主元素，卸载时需要清理 */
const richMounts: HTMLElement[] = []

/** 当前是否为 hash 路由模式（决定 markdown 里站内链接的 href 形态） */
const hashMode = isHashRouterMode()

/** 已挂载组件的 Vue 应用实例（卸载时需要一并销毁，避免内存泄漏） */
const richApps: Array<{ unmount: () => void }> = []

/** 需要在 DOM 更新后挂载特殊组件的消息 id */
const pendingRichMounts = new Set<number>()

/**
 * 渲染助手回复（markdown + 特殊组件解析，带缓存，避免流式过程中反复解析）。
 *
 * 内容变化时重新解析并清掉该消息的旧组件缓存；组件实际挂载推迟到
 * DOM 更新之后（`mountRichComponents`），因为此时占位符才存在于 DOM 中。
 * @param message 消息
 * @returns 渲染后的 HTML
 */
function renderAssistant(message: Message): string {
    const source = message.content

    if (message.renderedContentSource !== source) {
        const { markdown, components } = parseRichComponents(source)
        message.renderedContent = renderMarkdown(markdown, hashMode)
        message.renderedContentSource = source

        if (components.length) {
            richComponents.set(message.id, components)
            pendingRichMounts.add(message.id)
        } else {
            richComponents.delete(message.id)
        }
    }

    return message.renderedContent ?? ""
}

/**
 * 把解析出的特殊组件插入渲染体的占位符位置。
 *
 * 做法是把 `<!--rich:N-->` 注释替换成一个宿主 `<span>`，
 * 再用 `createApp().mount()` 把真实组件渲染进这个宿主。
 * 之所以不用 `v-html` 直接渲染组件：Vue 不会在 v-html 内容里实例化组件，
 * 所以只能采用「占位符 + 手动挂载」的方案。
 * @param messageId 消息 id
 * @param element 渲染体元素
 */
function mountRichComponents(messageId: number, element: HTMLElement) {
    const components = richComponents.get(messageId)

    if (!components?.length) {
        return
    }

    // 只取注释节点里的占位符，避免误伤代码块等元素节点
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_COMMENT)
    const placeholders: Comment[] = []

    while (walker.nextNode()) {
        const node = walker.currentNode as Comment

        if (node.data.startsWith("rich:")) {
            placeholders.push(node)
        }
    }

    for (const placeholder of placeholders) {
        const index = Number(placeholder.data.slice("rich:".length))
        const component = components[index]

        if (!component) {
            continue
        }

        const host = document.createElement("span")
        host.className = "db-rich-inline"

        placeholder.parentNode?.replaceChild(host, placeholder)

        try {
            // 组件名来自白名单（rich-component.ts 校验过），属性也已过滤
            const app = createApp({
                render: () => h(component.name, component.props),
            })
            app.mount(host)
            richApps.push(app)
            richMounts.push(host)
        } catch (error) {
            // 单个组件渲染失败不应影响整条回复：退化为一段可读的占位文本
            console.error("特殊组件渲染失败:", component.name, error)
            host.textContent = `[${component.name} 渲染失败]`
            richMounts.push(host)
        }
    }
}

/**
 * 在 DOM 更新后挂载所有待处理的特殊组件。
 *
 * 流式输出期间每次内容变化都会触发一次；已处理过的消息会被移出待办集合，
 * 不会重复插入。
 */
async function flushRichMounts() {
    if (!pendingRichMounts.size) {
        return
    }

    await nextTick()

    for (const messageId of [...pendingRichMounts]) {
        const element = assistantBodies.get(messageId)

        if (!element) {
            continue
        }

        // 重新渲染会整体替换 v-html 内容，先清掉该消息上一次挂载的宿主
        clearRichMountsFor(element)
        mountRichComponents(messageId, element)
        pendingRichMounts.delete(messageId)
    }
}

/**
 * 清理某个渲染体内已挂载的特殊组件。
 * @param element 渲染体元素
 */
function clearRichMountsFor(element: HTMLElement) {
    for (const host of element.querySelectorAll(".db-rich-inline")) {
        host.remove()
    }
}

/**
 * 清理所有由本组件挂载的特殊组件宿主与应用实例。
 */
function unmountRichComponents() {
    for (const app of richApps) {
        try {
            app.unmount()
        } catch {
            // 卸载失败不影响后续清理
        }
    }

    richApps.length = 0
    richMounts.length = 0
    richComponents.clear()
    pendingRichMounts.clear()
}

/**
 * 绑定助手消息渲染体元素（模板 ref 回调）。
 * 参数类型放宽到 `unknown`：函数式 ref 的实参在模板里会被推断成
 * `Element | ComponentPublicInstance | null` 的联合类型。
 * @param messageId 消息 id
 * @param element 对应的 DOM 元素；元素卸载时为 null
 */
function bindAssistantBody(messageId: number, element: unknown) {
    if (element instanceof HTMLElement) {
        assistantBodies.set(messageId, element)
        return
    }

    assistantBodies.delete(messageId)
}

/**
 * 拦截正文里的站内链接点击，走 SPA 跳转而不刷新整页。
 *
 * 只有带 `data-site-link` 标记的链接（由 markdown 层判定为站内路径）才接管；
 * 其余链接（外链）保持浏览器默认行为。修饰键点击也放行，
 * 让「新窗口打开」等习惯操作不受影响。
 * @param event 鼠标点击事件
 */
function handleBodyClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return
    }

    const anchor = (event.target as HTMLElement | null)?.closest?.("a[data-site-link]") as HTMLAnchorElement | null

    if (!anchor) {
        return
    }

    const route = parseSiteRoute(anchor.getAttribute("href") ?? "")

    if (!route) {
        return
    }

    event.preventDefault()
    void router.push(route)
}

/**
 * 单条消息的时间戳：HH:mm，等宽数字便于纵向对齐。
 * @param timestamp 消息创建时间
 * @returns 展示文本
 */
function formatMessageTime(timestamp: number): string {
    const date = new Date(timestamp)

    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

/**
 * 复制某条消息的纯文本内容。
 * 助手回复已渲染成 HTML，这里先取 textContent，避免把标签也复制进去。
 * @param message 消息
 * @param element 承载渲染结果的元素（助手消息用）
 */
async function copyMessage(message: Message, element?: HTMLElement | null) {
    const text = message.role === "user" ? message.content : element?.textContent || message.content

    if (!text.trim()) {
        return
    }

    try {
        await copyText(text)
        copiedId.value = message.id
        window.clearTimeout(copiedTimer)
        copiedTimer = window.setTimeout(() => {
            copiedId.value = 0
        }, 1200)
    } catch (error) {
        ui.showErrorMessage(t("dbAgent.ui.copyFailed"), error instanceof Error ? error.message : "")
    }
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

/** 思考段落的折叠键：消息 id + 段落序号，保证每条思考独立展开/收起 */
function reasoningKey(messageId: number, index: number) {
    return `${messageId}:${index}`
}

/**
 * 切换某段思考的展开状态。
 * @param messageId 消息 id
 * @param index 段落序号
 */
function toggleReasoning(messageId: number, index: number) {
    const key = reasoningKey(messageId, index)

    expandedReasoningKeys.value = expandedReasoningKeys.value.includes(key)
        ? expandedReasoningKeys.value.filter(item => item !== key)
        : [...expandedReasoningKeys.value, key]
}

/**
 * 思考内容的收起态预览：取最后一个非空行并截断。
 * 收起时仍能看到模型「在想什么」，比纯粹的标题更有信息量。
 * @param text 思考文本
 * @returns 预览文本
 */
function reasoningPreview(text: string): string {
    const line = text
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean)
        .at(-1)

    if (!line) {
        return ""
    }

    return line.length > 60 ? `${line.slice(0, 60)}…` : line
}

/**
 * 消息过程流中的一段：一段思考（可折叠）或一次工具调用（始终可见） */
interface TraceItem {
    /** 稳定 key */
    key: string
    /** 类型 */
    kind: "reasoning" | "tool"
    /** 思考文本 */
    text?: string
    /** 该段思考的段落序号（用于折叠键） */
    index?: number
    /** 工具调用记录 */
    trace?: MessageToolTrace
}

/**
 * 把一条助手回复的检索过程整理成按时间顺序排列的片段列表。
 *
 * 顺序对应真实的 Agent 执行流：思考 → 工具调用 → 思考 → 工具调用 → 最终回答。
 * 思考片段可折叠，工具调用始终可见（参考 Codex 的展示方式）。
 *
 * **正在流式的那一段不在这里**：`useDBChat` 约定「未收尾的思考不进 `reasonings`」，
 * 它只由 `props.reasoning` 单独渲染成末尾的「思考中」实时行。
 * 两者天然互斥，所以不会出现两个思考块。
 *
 * 历史数据（`reasonings` 尚未落库时的旧消息）只有 toolTraces，
 * 此时退化为纯工具调用列表，不会丢失检索过程。
 * @param message 助手消息
 * @returns 过程片段列表
 */
function traceItems(message: Message): TraceItem[] {
    const reasonings: MessageReasoning[] = message.reasonings ?? []
    const pending = new Map<string, MessageToolTrace>((message.toolTraces ?? []).map(trace => [trace.id, trace]))
    const items: TraceItem[] = []

    reasonings.forEach((reasoning, index) => {
        if (!reasoning.text.trim()) {
            return
        }

        items.push({ key: `r-${index}`, kind: "reasoning", text: reasoning.text, index })

        for (const id of reasoning.toolCallIds) {
            const trace = pending.get(id)

            if (trace) {
                items.push({ key: `t-${id}`, kind: "tool", trace })
                pending.delete(id)
            }
        }
    })

    // 剩余的（未与思考关联的，例如旧数据）工具调用按原顺序收尾
    for (const [id, trace] of pending) {
        items.push({ key: `t-${id}`, kind: "tool", trace })
    }

    return items
}

/**
 * 某条消息上挂着的提问卡片。
 *
 * 只取「当前挂起」或「消息自己落库的」两种来源：
 * - 当前挂起（props.pendingAsk）：本轮刚由模型发起，能续跑原循环；
 * - 消息自带（message.pendingAsk）：刷新 / 切换会话后从库里恢复，点了只能当新一轮提问。
 *
 * 用消息自带的兜底是为了不让刷新后的界面丢掉卡片——用户看到问题还在，
 * 只是作答会走新一轮，这比整张卡片凭空消失要好。
 * @param message 助手消息
 * @returns 提问请求；没有则 null
 */
function pendingAskOf(message: Message): AskUserRequest | null {
    const isLast = message.id === props.messages.at(-1)?.id

    if (isLast && props.pendingAsk) {
        return props.pendingAsk
    }

    return message.pendingAsk ?? null
}

/**
 * 某条消息当前是否正在流式输出（只有最后一条回复可能处于进行中）。
 * @param message 助手消息
 * @returns 是否正在生成
 */
function isLiveMessage(message: Message) {
    return props.busy && message.id === props.messages.at(-1)?.id
}

/**
 * 流式进行中、尚未收尾的思考文本（由 props.reasoning 提供）。
 * 它排在过程流末尾，等引擎收尾后由 message.reasonings 接管。
 * @param message 助手消息
 * @returns 未落库的思考文本；不属于当前消息时为 undefined
 */
function liveReasoningOf(message: Message): string | undefined {
    return isLiveMessage(message) && props.reasoning ? props.reasoning : undefined
}

/** 空状态下的示例提问：直接点出两类高频检索场景（响应式随语言切换） */
const exampleQuestions = computed(() => [t("dbAgent.ui.example1"), t("dbAgent.ui.example2"), t("dbAgent.ui.example3")])

/**
 * 跟随信号：消息条数、最后一条内容长度或思考增量变化时触发滚动。
 */
const followSignal = computed(() => `${props.messages.length}:${props.messages.at(-1)?.content.length ?? 0}:${props.reasoning.length}`)

watch(followSignal, () => {
    // 特殊组件的挂载不依赖滚动，先排好再滚，避免挂载后高度变化导致位置跳动
    void flushRichMounts()

    if (isAtBottom.value) {
        void scrollToBottom()
    }
})

watch(
    () => props.messages.length,
    () => {
        isAtBottom.value = true
        void flushRichMounts()
        void scrollToBottom()
    }
)

onBeforeUnmount(() => {
    window.clearTimeout(copiedTimer)
    unmountRichComponents()
    assistantBodies.clear()
})
</script>

<template>
    <!-- 消息滚动区：无背景；内容贴底（靠下显示），消息变多后自然向上滚动 -->
    <div ref="scrollerRef" class="db-chat-scroll min-h-0 flex-1 overflow-y-auto" @scroll="handleScroll">
        <div class="flex min-h-full flex-col justify-end">
            <div class="mx-auto w-full max-w-3xl px-1 pb-1">
                <!-- 空状态：给出可直接照抄的检索示例 -->
                <div v-if="!props.messages.length" class="py-2">
                    <p class="text-[11px] uppercase tracking-[0.28em] text-base-content/35">Data Retrieval</p>
                    <p class="mt-2 text-sm text-base-content/60">{{ $t("dbAgent.ui.chatEmptyTip") }}</p>
                    <ul class="mt-3 flex flex-col gap-1.5">
                        <li v-for="question in exampleQuestions" :key="question" class="text-xs text-base-content/45">· {{ question }}</li>
                    </ul>
                </div>

                <ul v-else class="flex flex-col gap-5">
                    <li v-for="message in props.messages" :key="message.id" class="group/msg">
                        <!-- 用户提问：右对齐，hairline 边框区分 -->
                        <div v-if="message.role === 'user'" class="flex flex-col items-end gap-1.5">
                            <!-- 附图排在正文之前：与发给模型的顺序一致，也符合「先看图再看问题」 -->
                            <div v-if="message.images?.length" class="flex max-w-[80%] flex-wrap justify-end gap-2">
                                <img
                                    v-for="(image, index) in message.images"
                                    :key="index"
                                    :src="chatImageDataUrl(image)"
                                    class="max-h-48 max-w-full border border-base-content/15 object-contain"
                                    :alt="$t('dbAgent.ui.userImage')"
                                />
                            </div>

                            <p
                                v-if="message.content"
                                class="db-selectable max-w-[80%] border border-base-content/15 bg-base-content/5 px-3 py-2 text-sm leading-6 whitespace-pre-wrap"
                            >
                                {{ message.content }}
                            </p>

                            <!-- 时间戳 + 操作：均仅悬停该条消息时显示，右侧对齐与气泡对齐 -->
                            <div
                                class="mt-1 flex h-4 items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100"
                            >
                                <span class="text-[10px] tabular-nums text-base-content/35">
                                    {{ formatMessageTime(message.createdAt) }}
                                </span>
                                <button
                                    type="button"
                                    class="grid size-4 cursor-pointer place-items-center text-base-content/35 transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                    :title="$t('dbAgent.ui.copyUserTitle')"
                                    :aria-label="$t('dbAgent.ui.copyUserTitle')"
                                    @click="copyMessage(message)"
                                >
                                    <Icon :icon="copiedId === message.id ? 'ri:check-line' : 'ri:file-copy-line'" class="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>

                        <!-- 助手回复：检索过程（思考可折叠 + 工具调用常显）+ markdown 正文 -->
                        <div v-else class="flex flex-col items-start gap-2">
                            <div v-if="traceItems(message).length || liveReasoningOf(message)" class="flex w-full flex-col gap-1">
                                <template v-for="item in traceItems(message)" :key="item.key">
                                    <!-- 思考：默认折叠，标题右侧给末行预览；展开后完整显示 -->
                                    <div v-if="item.kind === 'reasoning'" class="flex flex-col gap-1">
                                        <button
                                            type="button"
                                            class="group/think flex w-full cursor-pointer items-baseline gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                            :aria-expanded="expandedReasoningKeys.includes(reasoningKey(message.id, item.index ?? 0))"
                                            @click="toggleReasoning(message.id, item.index ?? 0)"
                                        >
                                            <Icon
                                                icon="ri:arrow-right-s-line"
                                                class="h-3 w-3 shrink-0 translate-y-0.5 text-base-content/35 transition-transform duration-200"
                                                :class="
                                                    expandedReasoningKeys.includes(reasoningKey(message.id, item.index ?? 0))
                                                        ? 'rotate-90'
                                                        : ''
                                                "
                                            />
                                            <span class="shrink-0 text-[10px] uppercase tracking-[0.2em] text-base-content/40">
                                                {{ $t("dbAgent.ui.thinking") }}
                                            </span>
                                            <span
                                                v-if="!expandedReasoningKeys.includes(reasoningKey(message.id, item.index ?? 0))"
                                                class="min-w-0 flex-1 truncate text-[11px] text-base-content/35"
                                            >
                                                {{ reasoningPreview(item.text ?? "") }}
                                            </span>
                                        </button>

                                        <p
                                            v-if="expandedReasoningKeys.includes(reasoningKey(message.id, item.index ?? 0))"
                                            class="border-l border-base-content/12 pl-2 text-[11px] leading-5 text-base-content/45 whitespace-pre-wrap"
                                        >
                                            {{ item.text }}
                                        </p>
                                    </div>

                                    <!-- 工具调用：始终可见，不随思考折叠 -->
                                    <div v-else-if="item.trace" class="flex flex-wrap items-center gap-1.5">
                                        <span
                                            class="inline-flex items-center gap-1 border border-base-content/12 px-1.5 py-0.5 text-[10px] text-base-content/45"
                                        >
                                            <Icon
                                                :icon="item.trace.status === 'running' ? 'ri:refresh-line' : 'ri:search-line'"
                                                class="h-3 w-3"
                                                :class="item.trace.status === 'running' ? 'animate-spin text-primary' : ''"
                                            />
                                            {{ item.trace.label }}
                                            <span v-if="item.trace.summary" class="text-base-content/35">{{ item.trace.summary }}</span>
                                        </span>
                                    </div>
                                </template>

                                <!-- 流式过程中尚未收尾的思考段落 -->
                                <div v-if="liveReasoningOf(message)" class="flex items-baseline gap-1.5">
                                    <Icon icon="ri:refresh-line" class="h-3 w-3 shrink-0 translate-y-0.5 animate-spin text-primary" />
                                    <span class="shrink-0 text-[10px] uppercase tracking-[0.2em] text-primary/70">{{
                                        $t("dbAgent.ui.thinkingLive")
                                    }}</span>
                                    <span class="min-w-0 flex-1 truncate text-[11px] text-base-content/40">
                                        {{ reasoningPreview(liveReasoningOf(message) ?? "") }}
                                    </span>
                                </div>

                                <!-- 检索详情：完整工具调用记录（含参数），按需展开 -->
                                <div v-if="message.toolTraces?.length" class="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        class="cursor-pointer text-[10px] text-base-content/35 transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                        @click="toggleTrace(message.id)"
                                    >
                                        {{
                                            expandedIds.includes(message.id) ? $t("dbAgent.ui.traceCollapse") : $t("dbAgent.ui.traceExpand")
                                        }}
                                    </button>
                                </div>
                            </div>

                            <pre
                                v-if="expandedIds.includes(message.id) && message.toolTraces?.length"
                                class="db-chat-scroll max-h-48 overflow-auto border border-base-content/12 p-2 text-[10px] leading-4 text-base-content/50"
                                >{{ JSON.stringify(message.toolTraces, null, 2) }}</pre>

                            <div
                                v-if="message.content"
                                :ref="element => bindAssistantBody(message.id, element)"
                                class="db-md db-selectable text-sm leading-6 text-base-content/85"
                                v-html="renderAssistant(message)"
                                @click="handleBodyClick"
                            />

                            <p
                                v-else-if="props.busy && message.id === props.messages.at(-1)?.id"
                                class="flex items-center gap-1.5 text-xs text-base-content/40"
                            >
                                <Icon icon="ri:refresh-line" class="h-3.5 w-3.5 animate-spin" />
                                {{ $t("dbAgent.ui.searching") }}
                            </p>

                            <!--
                              挂起的提问卡片：模型调用了 ask_user，等用户选择或输入。
                              只在最后一条助手消息上渲染——它是这条回复的一部分，
                              历史的提问卡片（已从库里恢复）点击后只能当新一轮提问发出。
                            -->
                            <DBAskUserPanel
                                v-if="pendingAskOf(message)"
                                class="w-full max-w-xl"
                                :request="pendingAskOf(message)!"
                                :busy="props.busy"
                                @answer="emit('answer', $event)"
                                @skip="emit('skip')"
                            />

                            <!-- 时间戳 + 操作：均仅悬停该条回复时显示，左侧对齐与正文对齐 -->
                            <div
                                class="flex h-4 items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100"
                            >
                                <span class="text-[10px] tabular-nums text-base-content/35">
                                    {{ formatMessageTime(message.createdAt) }}
                                </span>
                                <button
                                    type="button"
                                    class="grid size-4 cursor-pointer place-items-center text-base-content/35 transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                    :title="$t('dbAgent.ui.copyAssistantTitle')"
                                    :aria-label="$t('dbAgent.ui.copyAssistantTitle')"
                                    @click="copyMessage(message, assistantBodies.get(message.id) ?? null)"
                                >
                                    <Icon :icon="copiedId === message.id ? 'ri:check-line' : 'ri:file-copy-line'" class="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>

<style scoped>
.db-selectable,
.db-selectable :deep(*) {
    user-select: text;
}

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
