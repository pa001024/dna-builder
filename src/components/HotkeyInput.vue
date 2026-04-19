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
let pendingTimer: number | null = null

/**
 * 生成 kbd 尺寸类。
 */
const previewSizeClass = computed(() => (props.size === "md" ? "" : `kbd-${props.size}`))

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
 * 生成预览片段。
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
    window.removeEventListener("blur", stopRecording)
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

    const button = normalizeRecordedMouseButton(event.button)
    if (!button) {
        return
    }

    event.preventDefault()
    event.stopPropagation()

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
    window.addEventListener("blur", stopRecording)
}

/**
 * 清除当前热键。
 */
function clearHotkey() {
    model.value = ""
}

onBeforeUnmount(() => {
    stopRecording()
})
</script>

<template>
    <div class="input input-bordered flex w-full items-center px-0 py-0" :class="[inputSizeClass, recording ? 'input-primary' : '']">
        <div
            class="flex min-h-full flex-1 items-center gap-1 px-3"
            role="button"
            tabindex="0"
            :aria-disabled="disabled ? 'true' : 'false'"
            :aria-label="placeholder"
            @click="startRecording"
            @keydown.enter.prevent="startRecording"
            @keydown.space.prevent="startRecording"
        >
            <template v-if="previewTokens.length">
                <template v-for="(token, index) in previewTokens" :key="`${token.type}-${index}-${token.text}`">
                    <kbd v-if="token.type === 'key'" class="kbd" :class="previewSizeClass">{{ token.text }}</kbd>
                    <span v-else class="px-0.5 text-base-content/50">{{ token.text }}</span>
                </template>
            </template>
            <span v-else class="text-sm text-base-content/50">{{ statusText }}</span>
        </div>
        <button
            v-if="model"
            type="button"
            class="mr-2 inline-flex shrink-0 items-center justify-center rounded text-error/80 cursor-pointer transition-colors hover:bg-error/20 hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
            :class="{
                'size-5': props.size === 'xs',
                'size-6': props.size === 'sm',
                'size-8': props.size === 'md',
                'size-9': props.size === 'lg',
                'size-10': props.size === 'xl',
            }"
            :disabled="disabled"
            aria-label="清除热键"
            @click.stop="clearHotkey"
        >
            <Icon
                icon="radix-icons:cross2"
                :class="{
                    'w-3 h-3': props.size === 'xs',
                    'w-3.5 h-3.5': props.size === 'sm',
                    'w-4 h-4': props.size === 'md',
                    'w-4.5 h-4.5': props.size === 'lg',
                    'w-5 h-5': props.size === 'xl',
                }"
            />
        </button>
    </div>
</template>
