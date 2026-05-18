<script lang="ts" setup>
import { type CSSProperties, computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { titleFrameRenderData } from "@/data/generated/title-frame-render.generated"

type TitleFrameKey = keyof typeof titleFrameRenderData

type CurvePoint = {
    readonly timeMs: number
    readonly value: number
}

type TransformCurve = {
    readonly translateX?: readonly CurvePoint[]
    readonly translateY?: readonly CurvePoint[]
    readonly rotation?: readonly CurvePoint[]
    readonly scaleX?: readonly CurvePoint[]
    readonly scaleY?: readonly CurvePoint[]
    readonly shearX?: readonly CurvePoint[]
    readonly shearY?: readonly CurvePoint[]
}

type LayerAnimation = {
    readonly guid: string
    readonly opacity?: readonly CurvePoint[]
    readonly transform?: TransformCurve | null
    readonly material?: Readonly<Record<string, readonly CurvePoint[]>> | null
}

type FrameLayer = {
    readonly key: string
    readonly resourceName: string
    readonly resourceSrc: string
    readonly zIndex: number
    readonly renderMode?: "image" | "blend"
    readonly maskColor?: string
    readonly imageWidth?: number
    readonly imageHeight?: number
    readonly baseTranslateX?: number
    readonly baseTranslateY?: number
    readonly baseScaleX?: number
    readonly baseScaleY?: number
    readonly slot?: {
        readonly horizontalAlignment?: string
        readonly verticalAlignment?: string
        readonly padding?: {
            readonly left?: number
            readonly top?: number
            readonly right?: number
            readonly bottom?: number
        }
    }
    readonly animations: {
        readonly loop?: LayerAnimation
        readonly normal?: LayerAnimation
    }
}

type FrameConfig = {
    readonly width: number
    readonly height: number
    readonly loopMs: number
    readonly introMs: number
    readonly layers: readonly FrameLayer[]
}

const frameByTitleFrameId: Record<number, TitleFrameKey> = {
    10021: "07_1",
    10022: "07_2",
    10023: "07_3",
    10024: "07_4",
    10025: "07_5",
    10028: "09_1",
    10029: "09_2",
    10030: "09_3",
    10031: "09_4",
    10032: "09_5",
}

const props = withDefaults(
    defineProps<{
        frame?: TitleFrameKey
        titleFrameId?: number
        playing?: boolean
    }>(),
    {
        playing: true,
    }
)

const frameKey = computed<TitleFrameKey>(() => {
    if (props.frame) return props.frame
    if (props.titleFrameId && frameByTitleFrameId[props.titleFrameId]) {
        return frameByTitleFrameId[props.titleFrameId]
    }
    return "07_5"
})

const frame = computed<FrameConfig>(() => titleFrameRenderData[frameKey.value] as unknown as FrameConfig)
const layers = computed(() => [...frame.value.layers].sort((a, b) => a.zIndex - b.zIndex))
const currentMs = ref(0)
const rootRef = ref<HTMLElement | null>(null)
const stageScale = ref(1)
const hiddenLayers = ref(new Set<string>())
let rafId = 0
let startTime = 0
let resizeObserver: ResizeObserver | null = null

/**
 * 启动帧钟，避免动画值依赖手写 CSS keyframes。
 */
function startClock() {
    if (rafId) cancelAnimationFrame(rafId)
    startTime = performance.now() - currentMs.value

    const tick = (now: number) => {
        currentMs.value = now - startTime
        rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
}

/**
 * 停止帧钟，保留当前播放位置。
 */
function stopClock() {
    if (!rafId) return
    cancelAnimationFrame(rafId)
    rafId = 0
}

/**
 * 根据容器与原始舞台尺寸，计算统一缩放系数。
 */
function updateStageScale() {
    const root = rootRef.value
    if (!root) return
    const rect = root.getBoundingClientRect()
    if (!rect.width || !rect.height || !frame.value.width || !frame.value.height) {
        stageScale.value = 1
        return
    }

    stageScale.value = Math.min(rect.width / frame.value.width, rect.height / frame.value.height)
}

onMounted(() => {
    void nextTick(() => {
        updateStageScale()
        if (props.playing) {
            startClock()
        }
        resizeObserver = new ResizeObserver(updateStageScale)
        if (rootRef.value) {
            resizeObserver.observe(rootRef.value)
        }
    })
})

watch(
    () => props.playing,
    playing => {
        if (playing) {
            startClock()
        } else {
            stopClock()
        }
    }
)

watch(frameKey, () => {
    currentMs.value = 0
    void nextTick(() => {
        updateStageScale()
        if (props.playing) {
            startClock()
        }
    })
})

onBeforeUnmount(() => {
    stopClock()
    resizeObserver?.disconnect()
    resizeObserver = null
})

/**
 * 取循环时间点，和 UE 里的重复播放对齐。
 */
function normalizeTime(timeMs: number, loopMs: number) {
    if (!loopMs) return timeMs
    const normalized = timeMs % loopMs
    return normalized < 0 ? normalized + loopMs : normalized
}

/**
 * 根据关键帧做线性采样。
 */
function sampleCurve(points: readonly CurvePoint[] | undefined, timeMs: number, loopMs: number, fallback = 0) {
    if (!points?.length) return fallback
    const t = normalizeTime(timeMs, loopMs)

    if (points.length === 1) {
        return points[0].value
    }

    if (t <= points[0].timeMs) {
        return points[0].value
    }

    for (let i = 1; i < points.length; i++) {
        const left = points[i - 1]
        const right = points[i]
        if (t <= right.timeMs) {
            const span = right.timeMs - left.timeMs
            if (span <= 0) return right.value
            const ratio = (t - left.timeMs) / span
            return left.value + (right.value - left.value) * ratio
        }
    }

    return points[points.length - 1].value
}

/**
 * 按真实轨道数据合成 CSS transform。
 */
function buildTransform(animation: LayerAnimation | undefined, timeMs: number, loopMs: number) {
    const transform = animation?.transform
    if (!transform) return ""

    const translateX = sampleCurve(transform.translateX, timeMs, loopMs, 0)
    const translateY = sampleCurve(transform.translateY, timeMs, loopMs, 0)
    const rotation = sampleCurve(transform.rotation, timeMs, loopMs, 0)
    const transformScaleX = sampleCurve(transform.scaleX, timeMs, loopMs, 1)
    const transformScaleY = sampleCurve(transform.scaleY, timeMs, loopMs, 1)
    const shearX = sampleCurve(transform.shearX, timeMs, loopMs, 0)
    const shearY = sampleCurve(transform.shearY, timeMs, loopMs, 0)

    return `translate3d(${translateX}px, ${translateY}px, 0) rotate(${rotation}deg) scale(${transformScaleX}, ${transformScaleY}) skew(${shearX}deg, ${shearY}deg)`
}

/**
 * 读取图层在 Overlay 里的相对偏移。
 */
function getSlotOffsets(layer: FrameLayer) {
    const padding = layer.slot?.padding || {}
    return {
        left: padding.left ?? 0,
        top: padding.top ?? 0,
        right: padding.right ?? 0,
        bottom: padding.bottom ?? 0,
    }
}

/**
 * 兜底补齐 OverlaySlot 的默认对齐方式。
 */
function resolveSlotAlignment(layer: FrameLayer) {
    const padding = getSlotOffsets(layer)
    const horizontalAlignment = layer.slot?.horizontalAlignment || (padding.left || padding.right ? "HAlign_Fill" : "HAlign_Center")
    const verticalAlignment =
        layer.slot?.verticalAlignment || (padding.bottom ? "VAlign_Bottom" : padding.top ? "VAlign_Center" : "VAlign_Center")
    return {
        horizontalAlignment,
        verticalAlignment,
    }
}

/**
 * 按 OverlaySlot 的对齐方式计算图层锚点。
 */
function applySlotLayout(style: CSSProperties, layer: FrameLayer) {
    const padding = getSlotOffsets(layer)
    const alignment = resolveSlotAlignment(layer)
    const width = layer.imageWidth || frame.value.width
    const height = layer.imageHeight || frame.value.height
    const horizontalAlignment = alignment.horizontalAlignment
    const verticalAlignment = alignment.verticalAlignment

    style.width = `${width}px`
    style.height = `${height}px`
    style.transformOrigin = "center center"

    if (horizontalAlignment === "HAlign_Fill") {
        style.left = `${padding.left}px`
    } else if (horizontalAlignment === "HAlign_Right") {
        style.right = `${padding.right}px`
    } else if (horizontalAlignment === "HAlign_Center") {
        style.left = "50%"
        style.marginLeft = `${-(width / 2) + padding.left - padding.right}px`
    } else {
        style.left = `${padding.left}px`
    }

    if (verticalAlignment === "VAlign_Fill") {
        style.top = `${padding.top}px`
    } else if (verticalAlignment === "VAlign_Bottom") {
        style.bottom = `${padding.bottom}px`
    } else if (verticalAlignment === "VAlign_Center") {
        style.top = "50%"
        style.marginTop = `${-(height / 2) + padding.top - padding.bottom}px`
    } else {
        style.top = `${padding.top}px`
    }
}

/**
 * 给每个图层生成运行时样式。
 */
function layerStyle(layer: FrameLayer): CSSProperties {
    const animation = props.playing
        ? (layer.animations.loop ?? layer.animations.normal)
        : (layer.animations.normal ?? layer.animations.loop)
    const style: CSSProperties = {
        zIndex: layer.zIndex,
    }
    applySlotLayout(style, layer)

    if (animation?.opacity?.length) {
        style.opacity = String(sampleCurve(animation.opacity, currentMs.value, frame.value.loopMs, 1))
    }

    if (animation?.transform) {
        style.transform = buildTransform(animation, currentMs.value, frame.value.loopMs)
    } else if (layer.baseTranslateX || layer.baseTranslateY || layer.baseScaleX || layer.baseScaleY) {
        style.transform = `translate3d(${layer.baseTranslateX || 0}px, ${layer.baseTranslateY || 0}px, 0) scale(${layer.baseScaleX || 1}, ${layer.baseScaleY || 1})`
    }

    return style
}

/**
 * 解析当前图层实际使用的贴图路径。
 */
function layerSrc(layer: FrameLayer) {
    return layer.resourceSrc || "/imgs/rank/T_PersonalInfo_Title_03.webp"
}

/**
 * 记录单个图层是否加载失败。
 */
function markLayerError(layerKey: string) {
    hiddenLayers.value = new Set(hiddenLayers.value).add(layerKey)
}

/**
 * 判断图层是否需要渲染。
 */
function shouldRenderLayer(layer: FrameLayer) {
    return !hiddenLayers.value.has(layer.key)
}

/**
 * 生成滤色层样式。
 */
function layerBlendStyle(layer: FrameLayer): CSSProperties {
    const style: CSSProperties = {
        zIndex: layer.zIndex,
        mixBlendMode: "screen",
    }
    applySlotLayout(style, layer)

    const animation = props.playing ? (layer.animations.loop ?? layer.animations.normal) : (layer.animations.normal ?? layer.animations.loop)
    if (animation?.opacity?.length) {
        style.opacity = String(sampleCurve(animation.opacity, currentMs.value, frame.value.loopMs, 1))
    }

    if (animation?.transform) {
        style.transform = buildTransform(animation, currentMs.value, frame.value.loopMs)
    } else if (layer.baseTranslateX || layer.baseTranslateY || layer.baseScaleX || layer.baseScaleY) {
        style.transform = `translate3d(${layer.baseTranslateX || 0}px, ${layer.baseTranslateY || 0}px, 0) scale(${layer.baseScaleX || 1}, ${layer.baseScaleY || 1})`
    }

    return style
}
</script>

<template>
    <div ref="rootRef" class="title-frame-render" :style="{ '--title-frame-intro-ms': `${frame.introMs}ms` }">
        <div class="title-frame-render__viewport" :style="{ transform: `scale(${stageScale})` }">
            <div class="title-frame-render__stage" :class="{ 'is-paused': !playing }">
                <template v-for="layer in layers" :key="layer.key">
                    <img
                        v-if="layer.renderMode !== 'blend' && shouldRenderLayer(layer)"
                        :src="layerSrc(layer)"
                        :alt="layer.key"
                        class="title-frame-render__layer"
                        :style="layerStyle(layer)"
                        @error="markLayerError(layer.key)"
                        draggable="false"
                    />
                    <img
                        v-else-if="layer.renderMode === 'blend' && shouldRenderLayer(layer)"
                        :src="layerSrc(layer)"
                        :alt="layer.key"
                        class="title-frame-render__layer title-frame-render__layer--blend"
                        :style="layerBlendStyle(layer)"
                        @error="markLayerError(layer.key)"
                        draggable="false"
                    />
                </template>
            </div>
        </div>
    </div>
</template>

<style scoped>
.title-frame-render {
    position: relative;
    overflow: visible;
}

.title-frame-render__viewport {
    position: absolute;
    left: 0;
    top: 0;
    width: v-bind("`${frame.width}px`");
    height: v-bind("`${frame.height}px`");
    transform-origin: top left;
}

.title-frame-render__stage {
    position: relative;
    width: 100%;
    height: 100%;
    animation: title-frame-intro var(--title-frame-intro-ms) ease-out both;
}

.title-frame-render__stage.is-paused *,
.title-frame-render__stage.is-paused::before,
.title-frame-render__stage.is-paused::after {
    animation-play-state: paused !important;
}

.title-frame-render__layer {
    position: absolute;
    object-fit: contain;
    user-select: none;
    pointer-events: none;
    transform-origin: center center;
    will-change: transform, opacity;
}

.title-frame-render__layer--blend {
    mix-blend-mode: screen;
}

@keyframes title-frame-intro {
    0% {
        opacity: 0;
        transform: scale(0.985);
        filter: blur(2px);
    }

    100% {
        opacity: 1;
        transform: scale(1);
        filter: blur(0);
    }
}
</style>
