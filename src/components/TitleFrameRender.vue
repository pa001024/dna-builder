<script lang="ts" setup>
import { type CSSProperties, computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
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
    10022: "07_1",
    10021: "07_2",
    10023: "07_3",
    10024: "07_4",
    10025: "07_5",
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
let rafId = 0
let startTime = 0

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

onMounted(() => {
    if (props.playing) {
        startClock()
    }
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
    if (props.playing) {
        startClock()
    }
})

onBeforeUnmount(() => {
    stopClock()
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
 * 给每个图层生成运行时样式。
 */
function layerStyle(layer: FrameLayer): CSSProperties {
    const animation = props.playing
        ? (layer.animations.loop ?? layer.animations.normal)
        : (layer.animations.normal ?? layer.animations.loop)
    const style: CSSProperties = {
        zIndex: layer.zIndex,
    }

    if (animation?.opacity?.length) {
        style.opacity = String(sampleCurve(animation.opacity, currentMs.value, frame.value.loopMs, 1))
    }

    if (animation?.transform) {
        style.transform = buildTransform(animation, currentMs.value, frame.value.loopMs)
    }

    return style
}

/**
 * 解析当前图层实际使用的贴图路径。
 */
function layerSrc(layer: FrameLayer) {
    return layer.resourceSrc || "/imgs/rank/T_PersonalInfo_Title_03.webp"
}
</script>

<template>
    <div class="title-frame-render" :style="{ '--title-frame-intro-ms': `${frame.introMs}ms` }">
        <div class="title-frame-render__stage" :class="{ 'is-paused': !playing }">
            <img
                v-for="layer in layers"
                :key="layer.key"
                :src="layerSrc(layer)"
                :alt="layer.key"
                class="title-frame-render__layer"
                :style="layerStyle(layer)"
                draggable="false"
            />
        </div>
    </div>
</template>

<style scoped>
.title-frame-render {
    position: relative;
    overflow: visible;
}

.title-frame-render__stage {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform-origin: center center;
    animation: title-frame-intro var(--title-frame-intro-ms) ease-out both;
}

.title-frame-render__stage.is-paused *,
.title-frame-render__stage.is-paused::before,
.title-frame-render__stage.is-paused::after {
    animation-play-state: paused !important;
}

.title-frame-render__layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    user-select: none;
    pointer-events: none;
    transform-origin: center center;
    will-change: transform, opacity;
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
