<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue"
import {
    buildRecordedHotkey,
    normalizeRecordedKeyboardKey,
    normalizeRecordedMouseButton,
    tokenizeHotkeyDisplay,
} from "@/utils/hotkey-preview"

const model = defineModel<string>({ default: "" })

const props = withDefaults(
    defineProps<{
        disabled?: boolean
        placeholder?: string
        size?: "xs" | "sm" | "md" | "lg" | "xl"
    }>(),
    {
        disabled: false,
        placeholder: "",
        size: "md",
    }
)

const recording = ref(false)
const pendingKey = ref("")
const inputFocused = ref(false)
let pendingTimer: number | null = null

/**
 * 生成 kbd 尺寸类。
 */
const kbdSizeClass = computed(() => {
    const widthMap: Record<string, string> = {
        xs: "min-w-4",
        sm: "min-w-4",
        md: "min-w-5",
        lg: "min-w-6",
        xl: "min-w-8",
    }
    return `kbd-${props.size} ${widthMap[props.size] ?? ""}`
})

/**
 * 生成 input 容器尺寸类。
 */
const inputSizeClass = computed(() => {
    switch (props.size) {
        case "xs":
            return "input-xs"
        case "sm":
            return "input-sm"
        case "lg":
            return "input-lg"
        case "xl":
            return "input-xl"
        default:
            return ""
    }
})

/**
 * 生成快捷键预览片段。
 */
const previewTokens = computed(() => tokenizeHotkeyDisplay(recording.value && pendingKey.value ? pendingKey.value : model.value))

/**
 * 录制状态文案。
 */
const statusText = computed(() => {
    if (recording.value) {
        return pendingKey.value ? "等待下一键" : "按下快捷键"
    }
    return props.placeholder
})

/**
 * 清理延迟确认定时器。
 */
function clearPendingTimer() {
    if (pendingTimer !== null) {
        window.clearTimeout(pendingTimer)
        pendingTimer = null
    }
}

/**
 * 停止录制并移除事件监听。
 */
function stopRecording() {
    if (!recording.value) {
        return
    }
    recording.value = false
    pendingKey.value = ""
    clearPendingTimer()
    window.removeEventListener("keydown", handleKeyDown, true)
    window.removeEventListener("mousedown", handleMouseDown, true)
    window.removeEventListener("blur", finishRecordingOnBlur)
}

/**
 * 写入最终热键并退出录制。
 * @param hotkey 录制结果。
 */
function commitHotkey(hotkey: string) {
    model.value = hotkey.trim()
    stopRecording()
}

/**
 * 失焦时提交已经捕获的单键，并停止录制。
 */
function finishRecordingOnBlur() {
    if (!recording.value) {
        return
    }
    if (pendingKey.value) {
        commitHotkey(pendingKey.value)
        return
    }
    stopRecording()
}

/**
 * 处理键盘录制事件。
 * @param event 键盘事件。
 */
function handleKeyDown(event: KeyboardEvent) {
    if (!recording.value || props.disabled) {
        return
    }
    event.preventDefault()
    event.stopPropagation()

    if (event.key === "Escape") {
        stopRecording()
        return
    }
    if (event.key === "Backspace" || event.key === "Delete") {
        commitHotkey("")
        return
    }

    const key = normalizeRecordedKeyboardKey(event)
    if (!key) {
        return
    }

    const hasModifiers = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey
    if (!hasModifiers) {
        if (!pendingKey.value) {
            pendingKey.value = key
            clearPendingTimer()
            pendingTimer = window.setTimeout(() => {
                commitHotkey(pendingKey.value)
            }, 650)
            return
        }

        clearPendingTimer()
        commitHotkey(`${pendingKey.value} & ${key}`)
        return
    }

    commitHotkey(
        buildRecordedHotkey(
            {
                ctrl: event.ctrlKey,
                alt: event.altKey,
                shift: event.shiftKey,
                meta: event.metaKey,
            },
            key
        )
    )
}

/**
 * 处理鼠标录制事件。
 * @param event 鼠标事件。
 */
function handleMouseDown(event: MouseEvent) {
    if (!recording.value || props.disabled) {
        return
    }

    window.setTimeout(() => {
        if (!recording.value || props.disabled) {
            return
        }
        recordMouseButton(event)
    })
}

/**
 * 录入已通过焦点切换校验的鼠标按键。
 * @param event 鼠标事件。
 */
function recordMouseButton(event: MouseEvent) {
    const button = normalizeRecordedMouseButton(event.button)
    if (!button) {
        return
    }

    const hasModifiers = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey
    if (!hasModifiers) {
        if (!pendingKey.value) {
            pendingKey.value = button
            clearPendingTimer()
            pendingTimer = window.setTimeout(() => {
                commitHotkey(pendingKey.value)
            }, 650)
            return
        }

        clearPendingTimer()
        commitHotkey(`${pendingKey.value} & ${button}`)
        return
    }

    commitHotkey(
        buildRecordedHotkey(
            {
                ctrl: event.ctrlKey,
                alt: event.altKey,
                shift: event.shiftKey,
                meta: event.metaKey,
            },
            button
        )
    )
}

/**
 * 开始录制热键。
 */
function startRecording() {
    if (props.disabled || recording.value) {
        return
    }
    pendingKey.value = ""
    clearPendingTimer()
    recording.value = true
    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("mousedown", handleMouseDown, true)
    window.addEventListener("blur", finishRecordingOnBlur)
}

/**
 * 清除当前热键。
 */
function clearHotkey() {
    model.value = ""
}

/**
 * 清除按钮的辅助说明文案。
 */
const clearAriaLabel = computed(() => "清除热键")

/**
 * 取消录制按钮的辅助说明文案。
 */
const cancelAriaLabel = computed(() => "取消录制")

/**
 * 取消录制按钮文案。
 */
const cancelLabel = computed(() => "取消")

onBeforeUnmount(() => {
    stopRecording()
})
</script>

<template>
    <div
        class="input input-bordered relative flex w-full items-center px-0 py-0 transition-all"
        :class="[
            inputSizeClass,
            recording ? 'input-primary shadow-lg shadow-primary/20' : inputFocused ? 'shadow-sm' : 'hover:border-base-content/30',
        ]"
    >
        <div
            class="flex min-h-full flex-1 items-center gap-1 px-3 outline-none"
            role="button"
            tabindex="0"
            :aria-disabled="disabled ? 'true' : 'false'"
            :aria-label="placeholder"
            @click="startRecording"
            @focus="inputFocused = true"
            @blur="finishRecordingOnBlur"
            @keydown.enter.prevent="startRecording"
            @keydown.space.prevent="startRecording"
        >
            <span v-if="recording" class="size-1.5 shrink-0 animate-pulse rounded-full bg-primary ring-2 ring-primary/40" />
            <template v-if="previewTokens.length">
                <template v-for="(token, index) in previewTokens" :key="`${token.type}-${index}-${token.text}`">
                    <kbd
                        v-if="token.type === 'key'"
                        class="kbd justify-center border-base-300/60 bg-base-200 text-base-content"
                        :class="[kbdSizeClass, recording ? 'border-primary/50 text-primary' : '']"
                    >
                        {{ token.text }}
                    </kbd>
                    <span v-else class="px-0.5 font-bold text-base-content/40">{{ token.text }}</span>
                </template>
            </template>
            <span v-else class="text-base-content/50">
                {{ statusText }}
            </span>
        </div>
        <button
            v-if="model && !recording"
            type="button"
            class="mr-2 inline-flex shrink-0 items-center justify-center rounded-full text-error/80 opacity-70 transition-all hover:bg-error/15 hover:text-error hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
            :class="{
                'size-5': props.size === 'xs',
                'size-6': props.size === 'sm',
                'size-7': props.size === 'md',
                'size-8': props.size === 'lg',
                'size-9': props.size === 'xl',
            }"
            :disabled="disabled"
            :aria-label="clearAriaLabel"
            @click.stop="clearHotkey"
        >
            <Icon
                icon="radix-icons:cross2"
                :class="{
                    'w-3 h-3': props.size === 'xs',
                    'w-3.5 h-3.5': props.size === 'sm' || props.size === 'md',
                    'w-4 h-4': props.size === 'lg',
                    'w-5 h-5': props.size === 'xl',
                }"
            />
        </button>
        <button
            v-if="recording"
            type="button"
            class="mr-2 inline-flex shrink-0 items-center gap-1 rounded-full border border-error/30 bg-error/10 px-2.5 py-0.5 text-xs font-medium text-error transition-colors hover:bg-error/20 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="disabled"
            :aria-label="cancelAriaLabel"
            @mousedown.prevent="stopRecording"
            @click.stop
        >
            <Icon icon="radix-icons:cross2" class="h-3 w-3" />
            <span>{{ cancelLabel }}</span>
        </button>
    </div>
</template>
