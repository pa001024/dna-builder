<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from "vue"

const props = withDefaults(
    defineProps<{
        modelValue: string
        placeholder?: string
        hint?: string
        submitLabel?: string
        /** 检索进行中：发送按钮变为中断按钮，提交被忽略 */
        busy?: boolean
    }>(),
    {
        placeholder: "",
        hint: "",
        submitLabel: "",
        busy: false,
    }
)

const emit = defineEmits<{
    "update:modelValue": [value: string]
    submit: [value: string]
    /** 点击中断按钮：请求停止当前检索 */
    stop: []
    /**
     * 无输入时点击发送按钮：进入对话模式。
     * 输入框为空说明用户还没想好问什么，直接切到对话态（含历史会话列表）比什么都不发生更有用。
     */
    "enter-chat": []
}>()

/** 文本域自适应高度的上限（px），约 6 行；超出后由文本域内部滚动 */
const MAX_TEXTAREA_HEIGHT = 168

const textareaRef = ref<HTMLTextAreaElement | null>(null)
/** 输入法组合输入中：此时的 Enter 用于上屏候选，不应触发提交 */
const isImeComposing = ref(false)

const canSubmit = computed(() => props.modelValue.trim().length > 0)

/**
 * 依据内容高度自适应文本域高度，超过上限后转为内部滚动。
 */
function resize() {
    const el = textareaRef.value
    if (!el) {
        return
    }

    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden"
}

/**
 * 聚焦文本域，供父组件在需要时主动唤起输入。
 */
function focus() {
    textareaRef.value?.focus()
}

/**
 * 输入内容变化时同步到父组件。
 * @param event 输入事件
 */
function handleInput(event: Event) {
    emit("update:modelValue", (event.target as HTMLTextAreaElement).value)
}

/**
 * 发送按钮的主行为。
 *
 * - 检索进行中：中断当前检索；
 * - 有输入：提交提问；
 * - 无输入：进入对话模式（用户还没想好问什么时，先把对话界面打开）。
 */
function handleAction() {
    if (props.busy) {
        emit("stop")
        return
    }

    if (canSubmit.value) {
        submit()
        return
    }

    emit("enter-chat")
}

/**
 * 发送按钮的悬浮提示：随按钮主行为变化。
 */
const actionTitle = computed(() => {
    if (props.busy) {
        return "停止检索"
    }

    return canSubmit.value ? props.submitLabel : "进入对话"
})

/**
 * 发出提交事件（内容为空时不提交，检索进行中也不重复提交）。
 */
function submit() {
    const value = props.modelValue.trim()
    if (!value || props.busy) {
        return
    }

    emit("submit", value)
}

/**
 * 键盘处理：Enter 提交、Shift + Enter 换行；输入法组合态下放行给输入法。
 * @param event 键盘事件
 */
function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.shiftKey) {
        return
    }

    // 组合输入中的 Enter 属于输入法上屏操作，不触发提交
    if (isImeComposing.value || event.isComposing) {
        return
    }

    event.preventDefault()
    submit()
}

watch(
    () => props.modelValue,
    () => {
        nextTick(resize)
    }
)

onMounted(() => {
    resize()
})

defineExpose({ focus })
</script>

<template>
    <!-- 输入框：无底色，仅保留 hairline 边框，让页面保持完全透明 -->
    <div class="db-ask-box border border-base-content/15 transition-colors duration-200 focus-within:border-primary/55 backdrop-blur-sm">
        <!-- 多行输入：随内容增高，最多 6 行 -->
        <textarea
            ref="textareaRef"
            :value="modelValue"
            rows="1"
            spellcheck="false"
            :placeholder="placeholder"
            class="db-ask-textarea block w-full resize-none border-0 bg-transparent px-4 py-3.5 text-sm leading-6 text-base-content outline-none placeholder:text-base-content/35"
            @input="handleInput"
            @keydown="handleKeydown"
            @compositionstart="isImeComposing = true"
            @compositionend="isImeComposing = false"
        />

        <!-- 工具行：左侧快捷键提示，右侧发送 -->
        <div class="flex items-center justify-between gap-3 border-t border-base-content/10 px-3 py-2">
            <p class="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-base-content/40">{{ hint }}</p>

            <div class="flex shrink-0 items-center gap-3">
                <!--
                  按钮始终可用：有输入时提交、无输入时进入对话模式、检索中时中断。
                  仅有输入为空的浏览态用弱化配色暗示「这一步只是打开对话」。
                -->
                <button
                    type="button"
                    class="flex h-8 w-8 cursor-pointer items-center justify-center border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96]"
                    :class="
                        props.busy
                            ? 'border-base-content/35 text-base-content/70 hover:border-error hover:text-error'
                            : canSubmit
                              ? 'border-primary bg-primary text-primary-content'
                              : 'border-base-content/25 text-base-content/55 hover:border-primary hover:text-primary'
                    "
                    :title="actionTitle"
                    :aria-label="actionTitle"
                    @click="handleAction"
                >
                    <Icon :icon="props.busy ? 'ri:stop-circle-line' : 'ri:arrow-up-line'" class="h-4 w-4" />
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 文本域：去掉浏览器默认的滚动条留白抖动 */
.db-ask-textarea {
    min-height: 3.25rem;
}

.db-ask-textarea::-webkit-scrollbar {
    width: 6px;
}
</style>
