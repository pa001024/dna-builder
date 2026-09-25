<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue"
import { type ChatImage, type ChatSubmitPayload, chatImageDataUrl, fileToChatImage, isImageFile, MAX_CHAT_IMAGES } from "@/utils/chat-image"

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
    /** 提交一次提问：正文 + 本次附带的图片（图片为空数组表示纯文本提问） */
    submit: [payload: ChatSubmitPayload]
    /** 点击中断按钮：请求停止当前检索 */
    stop: []
    /**
     * 无输入时点击发送按钮：进入对话模式。
     * 输入框为空说明用户还没想好问什么，直接切到对话态（含历史会话列表）比什么都不发生更有用。
     */
    "enter-chat": []
}>()

const { t } = useTranslation()

/** 文本域自适应高度的上限（px），约 6 行；超出后由文本域内部滚动 */
const MAX_TEXTAREA_HEIGHT = 168

const textareaRef = ref<HTMLTextAreaElement | null>(null)
/** 隐藏的图片选择器 */
const fileInputRef = ref<HTMLInputElement | null>(null)
/** 输入法组合输入中：此时的 Enter 用于上屏候选，不应触发提交 */
const isImeComposing = ref(false)
/**
 * 已附带、尚未发送的图片。
 *
 * 用 `shallowRef`：图片是纯数据，`ref` 会把每个元素包成 Proxy，而 IndexedDB 的
 * 结构化克隆**不认 Proxy**（`DataCloneError`），消息带着图片落库时会直接失败。
 * 代价是数组内部的变化不再自动触发，增删都要整体重新赋值。
 */
const pendingImages = shallowRef<ChatImage[]>([])
/** 是否有文件正拖在输入框上（仅用于高亮边框） */
const isDragOver = ref(false)

const canSubmit = computed(() => props.modelValue.trim().length > 0 || pendingImages.value.length > 0)

/** 还能再附几张图 */
const remainingSlots = computed(() => Math.max(MAX_CHAT_IMAGES - pendingImages.value.length, 0))

/** 「添加图片」按钮的悬浮提示：带上限说明，满额时提示已用完 */
const attachTitle = computed(() =>
    remainingSlots.value ? t("dbAgent.ui.attachImage", { count: MAX_CHAT_IMAGES }) : t("dbAgent.ui.attachImageFull", { count: MAX_CHAT_IMAGES })
)

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
 * 把若干文件里图片的部分读成附图并附上（超出张数上限的部分丢弃）。
 * @param files 待处理的文件列表
 */
async function appendFiles(files: readonly File[]) {
    const added: ChatImage[] = []

    for (const file of files.filter(isImageFile).slice(0, remainingSlots.value)) {
        try {
            added.push(await fileToChatImage(file))
        } catch (error) {
            console.warn("读取图片失败:", error)
        }
    }

    // shallowRef 不追踪数组内部变化：整体重新赋值才会刷新预览
    if (added.length) {
        pendingImages.value = [...pendingImages.value, ...added]
    }
}

/**
 * 粘贴事件：剪贴板里带图片时就地附上，文本粘贴保持浏览器默认行为。
 *
 * 只有确认含图片才 `preventDefault`——否则会把普通文本粘贴也拦下来，
 * 破坏输入法与富文本的粘贴路径。
 * @param event 粘贴事件
 */
function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? [])

    if (!files.some(isImageFile)) {
        return
    }

    event.preventDefault()
    void appendFiles(files)
}

/**
 * 拖放事件：与粘贴走同一条附图路径。
 * @param event 拖放事件
 */
function handleDrop(event: DragEvent) {
    isDragOver.value = false
    void appendFiles(Array.from(event.dataTransfer?.files ?? []))
}

/**
 * 图片选择器选中后的处理。
 * @param event 选择事件
 */
function handleFilePick(event: Event) {
    const input = event.target as HTMLInputElement
    void appendFiles(Array.from(input.files ?? []))
    // 清空 value，否则连续选同一个文件不会再触发 change
    input.value = ""
}

/**
 * 打开图片选择器。
 */
function openFilePicker() {
    fileInputRef.value?.click()
}

/**
 * 移除一张已附带的图片。
 * @param index 图片下标
 */
function removeImage(index: number) {
    pendingImages.value = pendingImages.value.filter((_, item) => item !== index)
}

/**
 * 发送按钮的主行为。
 *
 * - 检索进行中：中断当前检索；
 * - 有输入或有附图：提交提问；
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
        return t("dbAgent.ui.stopSearch")
    }

    return canSubmit.value ? props.submitLabel : t("dbAgent.ui.enterChat")
})

/**
 * 发出提交事件（内容与附图都为空时不提交，检索进行中也不重复提交）。
 */
function submit() {
    const value = props.modelValue.trim()

    if ((!value && !pendingImages.value.length) || props.busy) {
        return
    }

    const images = [...pendingImages.value]
    pendingImages.value = []
    emit("submit", { text: value, images })
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
    <div
        class="db-ask-box border border-base-content/15 transition-colors duration-200 focus-within:border-primary/55 backdrop-blur-sm"
        :class="isDragOver ? 'border-primary/60' : ''"
        @dragover.prevent="isDragOver = true"
        @dragleave="isDragOver = false"
        @drop.prevent="handleDrop"
    >
        <!-- 待发送的附图：缩略图 + 移除按钮，与正文并列构成一条提问 -->
        <ul v-if="pendingImages.length" class="flex flex-wrap gap-2 px-4 pt-3">
            <li v-for="(image, index) in pendingImages" :key="index" class="relative">
                <img :src="chatImageDataUrl(image)" class="h-16 w-16 border border-base-content/15 object-cover" alt="" />
                <button
                    type="button"
                    class="absolute -top-1.5 -right-1.5 grid size-4 cursor-pointer place-items-center border border-base-content/25 bg-base-100 text-base-content/60 transition-colors duration-200 hover:border-error hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    :title="$t('dbAgent.ui.removeImage')"
                    :aria-label="$t('dbAgent.ui.removeImage')"
                    @click="removeImage(index)"
                >
                    <Icon icon="ri:close-line" class="h-2.5 w-2.5" />
                </button>
            </li>
        </ul>

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
            @paste="handlePaste"
            @compositionstart="isImeComposing = true"
            @compositionend="isImeComposing = false"
        />

        <!-- 工具行：左侧快捷键提示，右侧添加图片与发送 -->
        <div class="flex items-center justify-between gap-3 border-t border-base-content/10 px-3 py-2">
            <p class="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-base-content/40">{{ hint }}</p>

            <div class="flex shrink-0 items-center gap-3">
                <button
                    type="button"
                    class="flex h-8 w-8 cursor-pointer items-center justify-center border border-base-content/25 text-base-content/55 transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-base-content/25 disabled:hover:text-base-content/55"
                    :title="attachTitle"
                    :aria-label="attachTitle"
                    :disabled="!remainingSlots"
                    @click="openFilePicker"
                >
                    <Icon icon="ri:image-add-line" class="h-4 w-4" />
                </button>

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

        <input ref="fileInputRef" type="file" accept="image/*" multiple class="hidden" @change="handleFilePick" />
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
