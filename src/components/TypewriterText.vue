<script lang="ts" setup>
import { type LayoutLine, layoutWithLines, type PreparedTextWithSegments, prepareWithSegments } from "@chenglou/pretext"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useSettingStore } from "@/store/setting"
import {
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

interface LineSegmentSlice {
    text: string
    tone: StoryTextSegment["tone"]
}

interface RenderedStoryLine {
    text: string
    renderLength: number
    separatorLength: number
    segments: LineSegmentSlice[]
}

interface StoryCursor {
    segmentIndex: number
    segmentOffset: number
    sourceOffset: number
}

const displayedLength = ref(0)
const isTyping = ref(false)
const rootElement = ref<HTMLElement | null>(null)
const isInViewport = ref(true)
const isMounted = ref(false)
const measuredFont = ref("")
const measuredWidth = ref(0)
const measuredLineHeight = ref(0)
let timerHandle: ReturnType<typeof setTimeout> | null = null
let intersectionObserver: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
let resizeFallbackHandler: (() => void) | null = null

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
 * 合并后的纯文本内容（用于 pretext 布局与逐行切片）。
 */
const plainText = computed(() => {
    return fullSegments.value.map(segment => segment.text).join("")
})

/**
 * 片段总字符数（不含标签）。
 */
const totalVisibleChars = computed(() => {
    return fullSegments.value.reduce((count, segment) => count + segment.text.length, 0)
})

/**
 * 生成 canvas 可识别的字体简写。
 * @param style 计算后的样式
 * @returns 字体简写
 */
function buildCanvasFont(style: CSSStyleDeclaration): string {
    if (style.font) {
        return style.font
    }

    const fontParts = [
        style.fontStyle && style.fontStyle !== "normal" ? style.fontStyle : "",
        style.fontVariant && style.fontVariant !== "normal" ? style.fontVariant : "",
        style.fontWeight && style.fontWeight !== "400" ? style.fontWeight : "",
        style.fontStretch && style.fontStretch !== "100%" ? style.fontStretch : "",
        style.fontSize || "16px",
        style.fontFamily || "sans-serif",
    ].filter(Boolean)

    return fontParts.join(" ")
}

/**
 * 解析计算后的行高。
 * @param style 计算后的样式
 * @returns 行高像素值
 */
function resolveLineHeight(style: CSSStyleDeclaration): number {
    const parsedLineHeight = Number.parseFloat(style.lineHeight)
    if (Number.isFinite(parsedLineHeight) && parsedLineHeight > 0) {
        return parsedLineHeight
    }

    const parsedFontSize = Number.parseFloat(style.fontSize)
    if (Number.isFinite(parsedFontSize) && parsedFontSize > 0) {
        return parsedFontSize * 1.5
    }

    return 24
}

/**
 * 解析计算后的可用宽度。
 * @param element 当前根元素
 * @returns 可用宽度
 */
function resolveAvailableWidth(element: HTMLElement | null): number {
    const container = element?.parentElement
    if (!container) {
        return 0
    }

    const width = container.clientWidth || container.getBoundingClientRect().width
    return Math.max(Math.floor(width), 0)
}

/**
 * 同步字体、行高和可用宽度，用于 pretext 布局。
 */
function syncLayoutMetrics() {
    if (!rootElement.value || typeof window === "undefined") {
        return
    }

    const style = window.getComputedStyle(rootElement.value)
    measuredFont.value = buildCanvasFont(style)
    measuredLineHeight.value = resolveLineHeight(style)
    measuredWidth.value = resolveAvailableWidth(rootElement.value)
}

/**
 * 获取相邻源文本中的换行分隔长度。
 * @param sourceText 源文本
 * @param sourceOffset 当前偏移量
 * @returns 分隔长度
 */
function getLineSeparatorLength(sourceText: string, sourceOffset: number): number {
    if (sourceOffset >= sourceText.length) {
        return 0
    }

    if (sourceText[sourceOffset] === "\r" && sourceText[sourceOffset + 1] === "\n") {
        return 2
    }

    if (sourceText[sourceOffset] === "\r" || sourceText[sourceOffset] === "\n") {
        return 1
    }

    return 0
}

/**
 * 按 pretext 的行布局，把原始片段切成可渲染的逐行数据。
 * @param lines pretext 行数据
 * @param segments 原始剧情片段
 * @param sourceText 合并后的纯文本
 * @returns 行渲染数据
 */
function buildRenderedStoryLines(lines: LayoutLine[], segments: StoryTextSegment[], sourceText: string): RenderedStoryLine[] {
    const renderedLines: RenderedStoryLine[] = []
    const cursor: StoryCursor = {
        segmentIndex: 0,
        segmentOffset: 0,
        sourceOffset: 0,
    }

    for (const line of lines) {
        const renderLength = line.text.length
        const renderEnd = Math.min(sourceText.length, cursor.sourceOffset + renderLength)
        const lineSegments: LineSegmentSlice[] = []

        while (cursor.sourceOffset < renderEnd && cursor.segmentIndex < segments.length) {
            const sourceSegment = segments[cursor.segmentIndex]
            const remainingInSegment = sourceSegment.text.length - cursor.segmentOffset
            const remainingInLine = renderEnd - cursor.sourceOffset
            const takeLength = Math.min(remainingInSegment, remainingInLine)

            if (takeLength <= 0) {
                break
            }

            lineSegments.push({
                text: sourceSegment.text.slice(cursor.segmentOffset, cursor.segmentOffset + takeLength),
                tone: sourceSegment.tone,
            })

            cursor.sourceOffset += takeLength
            cursor.segmentOffset += takeLength

            if (cursor.segmentOffset >= sourceSegment.text.length) {
                cursor.segmentIndex += 1
                cursor.segmentOffset = 0
            }
        }

        const separatorLength = getLineSeparatorLength(sourceText, cursor.sourceOffset)
        if (separatorLength > 0) {
            const separatorEnd = Math.min(sourceText.length, cursor.sourceOffset + separatorLength)
            while (cursor.sourceOffset < separatorEnd && cursor.segmentIndex < segments.length) {
                const sourceSegment = segments[cursor.segmentIndex]
                const remainingInSegment = sourceSegment.text.length - cursor.segmentOffset
                const remainingInSeparator = separatorEnd - cursor.sourceOffset
                const takeLength = Math.min(remainingInSegment, remainingInSeparator)

                if (takeLength <= 0) {
                    break
                }

                cursor.sourceOffset += takeLength
                cursor.segmentOffset += takeLength

                if (cursor.segmentOffset >= sourceSegment.text.length) {
                    cursor.segmentIndex += 1
                    cursor.segmentOffset = 0
                }
            }
        }

        renderedLines.push({
            text: line.text,
            renderLength,
            separatorLength,
            segments: lineSegments,
        })
    }

    return renderedLines
}

/**
 * 按可见字符数截断单行片段。
 * @param segments 行内片段
 * @param visibleChars 当前可见字符数
 * @returns 截断后的片段
 */
function buildVisibleLineSegments(segments: LineSegmentSlice[], visibleChars: number): LineSegmentSlice[] {
    if (visibleChars <= 0) {
        return []
    }

    const visibleSegments: LineSegmentSlice[] = []
    let remainingChars = visibleChars

    for (const segment of segments) {
        if (remainingChars <= 0) {
            break
        }

        if (segment.text.length <= remainingChars) {
            visibleSegments.push(segment)
            remainingChars -= segment.text.length
            continue
        }

        visibleSegments.push({
            text: segment.text.slice(0, remainingChars),
            tone: segment.tone,
        })
        remainingChars = 0
    }

    return visibleSegments
}

/**
 * 计算当前文本的 pretext 行布局。
 */
const preparedText = computed<PreparedTextWithSegments | null>(() => {
    if (!plainText.value || !measuredFont.value) {
        return null
    }

    return prepareWithSegments(plainText.value, measuredFont.value, { whiteSpace: "pre-wrap" })
})

/**
 * 当前行布局。
 */
const renderedStoryLines = computed<RenderedStoryLine[]>(() => {
    if (!preparedText.value || measuredWidth.value <= 0 || measuredLineHeight.value <= 0) {
        return []
    }

    const { lines } = layoutWithLines(preparedText.value, measuredWidth.value, measuredLineHeight.value)
    return buildRenderedStoryLines(lines, fullSegments.value, plainText.value)
})

/**
 * 当前已经可见的逐行文本。
 */
const visibleStoryLines = computed<RenderedStoryLine[]>(() => {
    if (!renderedStoryLines.value.length || displayedLength.value <= 0) {
        return []
    }

    const visibleLines: RenderedStoryLine[] = []
    let remainingChars = displayedLength.value

    for (const line of renderedStoryLines.value) {
        if (remainingChars <= 0) {
            break
        }

        const visibleRenderLength = Math.min(line.renderLength, remainingChars)
        visibleLines.push({
            ...line,
            segments: buildVisibleLineSegments(line.segments, visibleRenderLength),
        })

        remainingChars -= line.renderLength
        if (remainingChars <= 0) {
            break
        }

        remainingChars -= line.separatorLength
    }

    return visibleLines
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
 * 初始化布局监听。
 */
function setupLayoutObserver() {
    if (!rootElement.value) {
        return
    }

    syncLayoutMetrics()

    const container = rootElement.value.parentElement
    if (!container) {
        return
    }

    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
            syncLayoutMetrics()
        })
        resizeObserver.observe(container)
        return
    }

    resizeFallbackHandler = () => {
        syncLayoutMetrics()
    }
    window.addEventListener("resize", resizeFallbackHandler)
}

/**
 * 销毁布局监听。
 */
function teardownLayoutObserver() {
    if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
    }

    if (resizeFallbackHandler) {
        window.removeEventListener("resize", resizeFallbackHandler)
        resizeFallbackHandler = null
    }
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
    setupLayoutObserver()
    setupViewportObserver()
    startTyping()
})

onBeforeUnmount(() => {
    clearTypingTimer()
    teardownViewportObserver()
    teardownLayoutObserver()
})
</script>

<template>
    <span ref="rootElement" class="block w-full whitespace-pre-wrap wrap-break-word">
        <template v-if="visibleStoryLines.length">
            <span v-for="(line, lineIndex) in visibleStoryLines" :key="`${lineIndex}-${line.text}`" class="block whitespace-pre-wrap wrap-break-word">
                <template v-for="(segment, index) in line.segments" :key="`${lineIndex}-${index}-${segment.tone}`">
                    <span
                        :class="{
                            'text-primary font-semibold': segment.tone === 'highlight',
                            'text-error font-semibold': segment.tone === 'warning',
                        }"
                    >
                        {{ segment.text }}
                    </span>
                </template>
                <span v-if="lineIndex === visibleStoryLines.length - 1 && isTyping" class="typing-caret" />
            </span>
        </template>
        <span v-else-if="isTyping" class="typing-caret" />
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
