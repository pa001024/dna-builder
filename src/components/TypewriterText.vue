<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from "vue"

const props = withDefaults(
    defineProps<{
        text: string
        speed?: number
        startDelay?: number
        animate?: boolean
        triggerKey?: string | number
    }>(),
    {
        speed: 18,
        startDelay: 80,
        animate: true,
        triggerKey: "",
    },
)

const displayedText = ref("")
const isTyping = ref(false)
let timerHandle: ReturnType<typeof setTimeout> | null = null

/**
 * 清理当前打字计时器，避免重复触发。
 */
function clearTypingTimer() {
    if (!timerHandle) {
        return
    }

    clearTimeout(timerHandle)
    timerHandle = null
}

/**
 * 启动打字效果。
 */
function startTyping() {
    clearTypingTimer()

    if (!props.animate || !props.text) {
        displayedText.value = props.text
        isTyping.value = false
        return
    }

    displayedText.value = ""
    isTyping.value = true
    let currentIndex = 0

    /**
     * 逐字推进文本显示。
     */
    const tick = () => {
        currentIndex += 1
        displayedText.value = props.text.slice(0, currentIndex)

        if (currentIndex >= props.text.length) {
            isTyping.value = false
            timerHandle = null
            return
        }

        timerHandle = setTimeout(tick, props.speed)
    }

    timerHandle = setTimeout(tick, props.startDelay)
}

watch(
    () => [props.text, props.triggerKey, props.animate],
    () => {
        startTyping()
    },
    {
        immediate: true,
    },
)

onBeforeUnmount(() => {
    clearTypingTimer()
})
</script>

<template>
    <span class="inline whitespace-pre-wrap break-words">
        {{ displayedText }}
        <span v-if="isTyping" class="typing-caret" />
    </span>
</template>

<style scoped>
.typing-caret {
    display: inline-block;
    width: 0.45em;
    height: 1em;
    margin-left: 2px;
    vertical-align: -0.15em;
    background: hsl(var(--p));
    box-shadow: 0 0 12px hsl(var(--p) / 0.6);
    animation: blink-caret 0.8s step-end infinite;
}

@keyframes blink-caret {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.15;
    }
}
</style>
