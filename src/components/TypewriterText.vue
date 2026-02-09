<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useSettingStore } from "@/store/setting"
import {
    buildVisibleStorySegments,
    DEFAULT_STORY_TEXT_CONFIG,
    parseStoryTextSegments,
    type StoryTextConfig,
    type StoryTextSegment,
} from "@/utils/story-text"

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
    }
)

const settingStore = useSettingStore()

const displayedLength = ref(0)
const isTyping = ref(false)
const rootElement = ref<HTMLElement | null>(null)
const isInViewport = ref(true)
const isMounted = ref(false)
let timerHandle: ReturnType<typeof setTimeout> | null = null
let intersectionObserver: IntersectionObserver | null = null

/**
 * 获取当前剧情文本替换配置。
 */
const storyTextConfig = computed<StoryTextConfig>(() => {
    return {
        nickname: settingStore.protagonistName1?.trim() || DEFAULT_STORY_TEXT_CONFIG.nickname,
        nickname2: settingStore.protagonistName2?.trim() || DEFAULT_STORY_TEXT_CONFIG.nickname2,
        gender: settingStore.protagonistGender,
        gender2: settingStore.protagonistGender2,
    }
})

/**
 * 完整文本片段（已包含占位符替换与标签解析）。
 */
const fullSegments = computed<StoryTextSegment[]>(() => {
    return parseStoryTextSegments(props.text, storyTextConfig.value)
})

/**
 * 当前可见片段（用于打字动画）。
 */
const visibleSegments = computed<StoryTextSegment[]>(() => {
    return buildVisibleStorySegments(fullSegments.value, displayedLength.value)
})

/**
 * 片段总字符数（不含标签）。
 */
const totalVisibleChars = computed(() => {
    return fullSegments.value.reduce((count, segment) => count + segment.text.length, 0)
})

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
 * 直接显示完整文本并停止打字动画。
 */
function finishTypingImmediately() {
    clearTypingTimer()
    displayedLength.value = totalVisibleChars.value
    isTyping.value = false
}

/**
 * 判断当前是否应跳过打字动画。
 * @returns 是否跳过动画
 */
function shouldSkipTypingAnimation(): boolean {
    if (!props.animate || totalVisibleChars.value === 0) {
        return true
    }

    return !isInViewport.value
}

/**
 * 初始化可视区域监听。
 */
function setupViewportObserver() {
    if (!rootElement.value || typeof IntersectionObserver === "undefined") {
        return
    }

    intersectionObserver = new IntersectionObserver(
        entries => {
            const entry = entries[0]
            const nextIsInViewport = !!entry?.isIntersecting
            isInViewport.value = nextIsInViewport

            if (!nextIsInViewport) {
                finishTypingImmediately()
            }
        },
        {
            threshold: 0,
        }
    )

    intersectionObserver.observe(rootElement.value)
}

/**
 * 销毁可视区域监听。
 */
function teardownViewportObserver() {
    if (!intersectionObserver) {
        return
    }

    intersectionObserver.disconnect()
    intersectionObserver = null
}

/**
 * 启动打字效果。
 */
function startTyping() {
    clearTypingTimer()

    if (!props.text) {
        displayedLength.value = 0
        isTyping.value = false
        return
    }

    if (shouldSkipTypingAnimation()) {
        finishTypingImmediately()
        return
    }

    displayedLength.value = 0
    isTyping.value = true
    let currentIndex = 0

    /**
     * 逐字推进文本显示。
     */
    const tick = () => {
        currentIndex += 1
        displayedLength.value = currentIndex

        if (currentIndex >= totalVisibleChars.value) {
            isTyping.value = false
            timerHandle = null
            return
        }

        timerHandle = setTimeout(tick, props.speed)
    }

    timerHandle = setTimeout(tick, props.startDelay)
}

watch(
    () => [
        props.text,
        props.triggerKey,
        props.animate,
        storyTextConfig.value.nickname,
        storyTextConfig.value.nickname2,
        storyTextConfig.value.gender,
        storyTextConfig.value.gender2,
    ],
    () => {
        if (!isMounted.value) {
            return
        }

        startTyping()
    },
    {
        immediate: false,
    }
)

onMounted(() => {
    isMounted.value = true
    setupViewportObserver()
    startTyping()
})

onBeforeUnmount(() => {
    clearTypingTimer()
    teardownViewportObserver()
})
</script>

<template>
    <span ref="rootElement" class="inline whitespace-pre-wrap wrap-break-word">
        <template v-for="(segment, index) in visibleSegments" :key="`${index}-${segment.tone}`">
            <span
                :class="{
                    'text-primary font-semibold': segment.tone === 'highlight',
                    'text-error font-semibold': segment.tone === 'warning',
                }"
            >
                {{ segment.text }}
            </span>
        </template>
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
