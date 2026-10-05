<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import { useBuildChat } from "@/composables/useBuildChat"
import { useCharSettings } from "@/composables/useCharSettings"
import type { CharBuild } from "@/data"
import { useInvStore } from "@/store/inv"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { resolveSharedAgentUpstream } from "@/utils/agent-upstream"
import { createBuildApi, setBuildApi } from "@/utils/build-api"
import type { ChatSubmitPayload } from "@/utils/chat-image"
import type { AskUserResponse } from "@/utils/db-ask-user"

/**
 * 配装助手悬浮对话窗。
 *
 * 呈现层与资料检索共用 {@link AgentChatMessages}（思考分段、工具调用分组、
 * 过程耗时、markdown 与富组件），状态层交给 {@link useBuildChat}；
 * 本组件只负责窗口形态、头部工具栏与输入框接线。
 */
const props = defineProps<{
    charBuild: CharBuild
}>()

const inv = useInvStore()
const settingStore = useSettingStore()
const ui = useUIStore()
const { t } = useTranslation()

/** 数据包未就绪时的角色名兜底（与页面其它部分共用同一个本地键） */
const fallbackChar = useLocalStorage("selectedChar", "赛琪")

/**
 * 当前角色名与构筑设置：Agent 的直接工具据此读写配置。
 *
 * 优先取构筑对象上的角色（与路由一致），数据包未就绪时退回本地记录的选中角色。
 */
const selectedChar = computed(() => props.charBuild?.char?.名称 || fallbackChar.value)
const selectedCharId = computed(() => props.charBuild?.char?.id || 0)
const charSettings = useCharSettings(selectedCharId)

// 沙箱接口层：把当前角色的设置、库存与构筑对象包成 build 对象，run_code 工具据此执行代码。
// 角色切换走同一个本地键，页面与这里共用一份选中状态。
const buildApi = createBuildApi({
    charSettings,
    selectedChar,
    charBuild: computed(() => props.charBuild),
    inv,
    setChar: name => {
        fallbackChar.value = name
    },
})

setBuildApi(buildApi)

const {
    messages,
    hasMessages,
    isBusy,
    liveReasoning,
    pendingAsk,
    failedPrompt,
    isCompacting,
    contextUsage,
    loadMessages,
    clearChat,
    send,
    retry,
    compactNow,
    answerAsk,
    skipAsk,
    interrupt,
} = useBuildChat(selectedChar, settingStore)

/** 窗口是否展开 */
const isOpen = ref(false)
/** 输入框内容 */
const inputText = ref("")
/** 输入框实例（打开窗口时自动聚焦） */
const askBoxRef = ref<{ focus: () => void } | null>(null)

/**
 * 是否已具备可用的上游配置：没有密钥又未登录时给出可操作提示，不打无谓的请求。
 */
const hasUpstream = computed(() => Boolean(resolveSharedAgentUpstream()))

/**
 * 输入框占位文案：等待作答 > 已有对话 > 全新对话。
 */
const placeholder = computed(() => {
    if (pendingAsk.value) {
        return t("ai-chat.askInputPlaceholder")
    }

    return hasMessages.value ? t("ai-chat.continuePlaceholder") : t("ai-chat.inputPlaceholder")
})

/**
 * 输入框下方的快捷键提示：等待作答时说明可以直接打字作答。
 */
const hint = computed(() => (pendingAsk.value ? t("ai-chat.askHint") : t("ai-chat.tip")))

/**
 * 打开窗口：载入该角色的历史对话并聚焦输入框。
 */
async function open() {
    isOpen.value = true
    await loadMessages()
    await nextTick()
    askBoxRef.value?.focus()
}

/**
 * 关闭窗口（不打断正在进行的运行，回来时内容仍在）。
 */
function close() {
    isOpen.value = false
}

/**
 * 提交一次提问：正文与附图都交给会话中枢（配装面板截图直接粘贴即可）。
 * @param payload 输入框提交的正文与附图
 */
function handleSubmit(payload: ChatSubmitPayload) {
    void send(payload.text, payload.images)
}

/**
 * 回答挂起的提问并继续运行。
 * @param response 用户回答
 */
function handleAnswer(response: AskUserResponse) {
    void answerAsk(response)
}

/** 跳过挂起的提问。 */
function handleSkip() {
    void skipAsk()
}

/** 清空当前角色的对话（清空后窗口保持打开）。 */
function handleClear() {
    void clearChat()
}

/** 重试上一轮失败的提问。 */
function handleRetry() {
    void retry()
}

/**
 * 手动压缩当前对话上下文（容量面板入口）：按结果给出轻量反馈。
 * 文案直接走 dbAgent.ui.contextUsage.*：两个 Agent 共用同一套压缩反馈，不重复维护。
 */
async function handleCompactContext() {
    const result = await compactNow()

    if (result === "compacted") {
        ui.showSuccessMessage(t("dbAgent.ui.contextUsage.compactDone"))
        return
    }

    if (result === "noNeed") {
        ui.showSuccessMessage(t("dbAgent.ui.contextUsage.compactNothing"))
        return
    }

    ui.showErrorMessage(t("dbAgent.ui.contextUsage.compactFailed"))
}

onMounted(() => {
    // 未配置上游时直接展开窗口，把「请先登录 / 填密钥」的提示摆到用户面前
    if (!hasUpstream.value) {
        void open()
    }
})

onBeforeUnmount(() => {
    setBuildApi(null)
})
</script>

<template>
    <div>
        <!-- 悬浮唤起按钮：方章风格，直角 hairline，不用 daisyUI 圆形 btn -->
        <button
            v-if="!isOpen"
            type="button"
            class="fixed right-6 bottom-6 z-50 inline-flex h-10 cursor-pointer items-center gap-2 border border-primary/60 bg-base-100/85 px-3 text-xs text-primary shadow-lg backdrop-blur-md transition-colors duration-200 hover:bg-primary hover:text-primary-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97]"
            :title="t('ai-chat.title')"
            @click="open"
        >
            <Icon icon="ri:chat-3-line" class="h-4 w-4" />
            <span>{{ t("ai-chat.title") }}</span>
        </button>

        <!--
          对话窗：保留原来的右下角悬浮形态（位置与交互习惯不变），
          仅把宽度与高度放大，使 markdown 表格与工具过程有足够空间。
        -->
        <section
            v-if="isOpen"
            class="fixed right-4 bottom-4 z-50 flex h-[min(46rem,84vh)] w-[min(30rem,calc(100vw-2rem))] flex-col border border-base-content/15 bg-base-100/85 shadow-2xl backdrop-blur-md"
        >
            <!-- 头部：等宽小标 + hairline 分隔，右侧为清空与关闭 -->
            <header class="flex shrink-0 items-center justify-between gap-3 border-b border-base-content/12 px-4 py-3">
                <div class="flex min-w-0 items-baseline gap-2">
                    <p class="shrink-0 font-mono text-[10px] tracking-[0.28em] text-base-content/40 uppercase">Build Agent</p>
                    <p class="min-w-0 truncate text-xs text-base-content/55">{{ selectedChar }}</p>
                </div>

                <div class="flex shrink-0 items-center gap-1.5">
                    <button
                        type="button"
                        class="grid size-6 cursor-pointer place-items-center text-base-content/45 transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                        :title="t('ai-chat.clear')"
                        :aria-label="t('ai-chat.clear')"
                        :disabled="isBusy || !hasMessages"
                        @click="handleClear"
                    >
                        <Icon icon="ri:delete-bin-line" class="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        class="grid size-6 cursor-pointer place-items-center text-base-content/45 transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        :title="t('ai-chat.close')"
                        :aria-label="t('ai-chat.close')"
                        @click="close"
                    >
                        <Icon icon="ri:close-line" class="h-3.5 w-3.5" />
                    </button>
                </div>
            </header>

            <!-- 消息流：与资料库同一套渲染 -->
            <AgentChatMessages
                :messages="messages"
                :busy="isBusy"
                :reasoning="liveReasoning"
                :pending-ask="pendingAsk"
                i18n-prefix="ai-chat.ui"
                empty-kicker="Build Agent"
                class="px-4"
                @answer="handleAnswer"
                @skip="handleSkip"
            />

            <!-- 输入区：与资料库同一个输入框组件，配装助手没有检索增强开关；容量面板入口在工具行左侧 -->
            <div class="shrink-0 border-t border-base-content/12 px-4 py-3">
                <div v-if="failedPrompt" class="mb-2 flex items-center gap-2">
                    <button
                        type="button"
                        class="cursor-pointer border border-base-content/20 px-2 py-0.5 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                        :disabled="isBusy"
                        @click="handleRetry"
                    >
                        {{ t("ai-chat.retry") }}
                    </button>
                </div>

                <DBAskBox
                    ref="askBoxRef"
                    v-model="inputText"
                    :show-rag="false"
                    i18n-prefix="ai-chat.ui"
                    :busy="isBusy"
                    :placeholder="placeholder"
                    :hint="hint"
                    :submit-label="t('ai-chat.send')"
                    :context-usage="contextUsage"
                    :compacting="isCompacting"
                    :can-compact="hasMessages && !isBusy"
                    @compact="handleCompactContext"
                    @submit="handleSubmit"
                    @stop="interrupt"
                />
            </div>
        </section>
    </div>
</template>
