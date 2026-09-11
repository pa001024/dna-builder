<script lang="ts" setup>
import { type CSSProperties, computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { titleFrameIdToKey, titleFrames } from "@/data/generated/title-frame.generated"
import {
    computeLayerRect,
    resolveAnimation,
    sampleCurve,
    type TitleFrameDef,
    type TitleFrameLayer,
    type TitleFrameLayerTrack,
} from "@/data/title-frame"
import { createFrameRenderer, type FrameRenderer } from "@/data/title-frame-webgl"

const props = withDefaults(
    defineProps<{
        /** 称号框 ID（对应 TitleFrame.lua），优先于 `frame` */
        titleFrameId?: number
        /** 直接指定称号框 key（如 "07_2"）或完整定义；仅在没有 titleFrameId 时使用 */
        frame?: string | TitleFrameDef
        /** 框内文字；不传时渲染默认插槽 */
        title?: string
        /** 是否播放动画 */
        playing?: boolean
        /** 是否循环播放 In 之后的 Loop 动画 */
        loop?: boolean
        /** 固定到指定播放时间（毫秒）；提供时忽略 `playing`，用于静态快照与测试 */
        timeMs?: number
        /**
         * 设计单位 → 像素的固定比例。
         *
         * 默认（不传）时组件铺满容器宽度；传入后按可见包围盒自撑尺寸、不随容器变化。
         * 游戏里所有称号框共用同一个 UI 缩放，所以需要「各框按真实比例、文字像素大小一致」
         * 时应当传这个值（例如 `1` 表示 15 单位文字渲染成 15px）。
         */
        scale?: number
        /**
         * 渲染后端。
         *
         * `dom`（默认）走 CSS 合成；`webgl` 走移植后的材质着色器；`auto` 优先 WebGL，
         * 环境不支持时自动回退到 DOM。WebGL 路径仍在完善中，故未设为默认。
         */
        renderer?: "auto" | "webgl" | "dom"
    }>(),
    {
        playing: true,
        loop: true,
        // 默认走 CSS 合成：WebGL 材质路径还在收尾（部分赛季的框面对不上），
        // 需要时显式传 renderer="webgl" 打开。
        renderer: "dom",
    }
)

/** 数据里第一个称号框：仅在调用方给了未知 key / ID 时兜底，避免整块区域空白 */
const fallbackKey = Object.keys(titleFrames)[0]

/**
 * 解析当前应渲染的称号框。
 * @returns 称号框定义，未匹配时回退到数据里的第一个框
 */
const frame = computed<TitleFrameDef>(() => {
    if (props.frame && typeof props.frame === "object") return props.frame
    const byId = props.titleFrameId === undefined ? undefined : titleFrameIdToKey[props.titleFrameId]
    const key = byId ?? props.frame
    return (key ? titleFrames[key] : undefined) ?? titleFrames[fallbackKey]
})

const rootRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const renderer = ref<FrameRenderer | null>(null)
const useWebGL = ref(false)
/**
 * 舞台缩放系数：设计单位 → 像素的固定比例。
 *
 * 基准必须是称号框的**设计画布**（SizeBox 的 236×34），它在所有称号框之间是同一个值，
 * 所以同一段 15 单位的文字在任何框里都渲染成同样多的像素。若改用各框的美术包围盒做基准，
 * 底图是 512 宽的框就会整体缩一半，文字跟着变小——这正是之前 1.3/1.6 不一致的原因。
 */
const scale = ref(1)
const boxWidth = ref(0)
const boxHeight = ref(0)
const elapsedMs = ref(0)

let rafId = 0
let clockStart = 0
let resizeObserver: ResizeObserver | null = null

/**
 * 量取容器尺寸并更新舞台缩放。
 *
 * 缩放只由「容器宽度 ÷ 设计画布宽度」决定，与具体贴图尺寸无关；容器高度只用于把
 * 设计画布垂直居中，美术按 UMG 的规则照常向外溢出（overflow: visible）。
 */
function updateScale() {
    const root = rootRef.value
    if (!root) return
    boxWidth.value = root.clientWidth
    boxHeight.value = root.clientHeight
    const designWidth = frame.value.width
    const fit = boxWidth.value > 0 && designWidth > 0 ? boxWidth.value / designWidth : 1
    scale.value = props.scale ?? fit
}

/**
 * 把当前帧交给 WebGL 渲染器。
 *
 * 画布像素尺寸含 devicePixelRatio；设计画布在容器里水平铺满、垂直居中，与 DOM 路径一致。
 */
function draw() {
    const instance = renderer.value
    const canvas = canvasRef.value
    if (!instance || !canvas || boxWidth.value <= 0 || boxHeight.value <= 0) return

    const dpr = window.devicePixelRatio || 1
    // 画布正好覆盖组件自身的盒子，和 DOM 路径的舞台范围一致。
    // 之前把画布放大到「美术包围盒」会让画布比盒子大两三倍，卡片再一裁，
    // 露出来的就是一大块模糊的中间区域。
    const cssWidth = Math.max(1, boxWidth.value)
    const cssHeight = Math.max(1, boxHeight.value)
    const width = Math.max(1, Math.round(cssWidth * dpr))
    const height = Math.max(1, Math.round(cssHeight * dpr))
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
    }
    canvas.style.left = "0px"
    canvas.style.top = "0px"
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`

    const stageLeft = (boxWidth.value - frame.value.width * scale.value) / 2
    const stageTop = (boxHeight.value - frame.value.height * scale.value) / 2
    instance.render({
        frame: frame.value,
        canvasWidth: width,
        canvasHeight: height,
        stageScale: scale.value * dpr,
        stageOrigin: [stageLeft * dpr, stageTop * dpr],
        elapsedMs: props.timeMs ?? elapsedMs.value,
        loop: props.loop,
    })
}

/**
 * 启动播放时钟。
 */
function startClock() {
    if (rafId) return
    clockStart = performance.now() - elapsedMs.value
    const tick = (now: number) => {
        elapsedMs.value = now - clockStart
        draw()
        rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
}

/**
 * 停止播放时钟并保留当前位置。
 */
function stopClock() {
    if (!rafId) return
    cancelAnimationFrame(rafId)
    rafId = 0
}

/** 用户是否开启了「减少动态效果」。 */
function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

onMounted(() => {
    void nextTick(() => {
        updateScale()
        if (props.renderer !== "dom" && canvasRef.value) {
            const instance = createFrameRenderer(canvasRef.value)
            if (instance) {
                // 贴图是异步加载的，加载完成后补一帧；静态快照（timeMs）模式下没有时钟驱动
                instance.onTextureLoad = draw
                renderer.value = instance
                useWebGL.value = true
            }
        }
        draw()
        resizeObserver = new ResizeObserver(() => {
            updateScale()
            draw()
        })
        if (rootRef.value) resizeObserver.observe(rootRef.value)
        // 尊重「减少动态效果」：停在起始帧（In 的第 0 毫秒，即完整静态构图）
        if (props.playing && props.timeMs === undefined && !prefersReducedMotion()) startClock()
    })
})

onBeforeUnmount(() => {
    stopClock()
    resizeObserver?.disconnect()
    resizeObserver = null
    renderer.value?.dispose()
    renderer.value = null
})

watch(
    () => props.playing,
    playing => {
        if (props.timeMs !== undefined) return
        if (playing) startClock()
        else stopClock()
    }
)

watch(
    () => props.timeMs,
    () => draw()
)

watch(frame, () => {
    elapsedMs.value = 0
    void nextTick(() => {
        updateScale()
        draw()
    })
})

/** 当前动画与其中的时间。 */
const sample = computed(() => {
    const fixed = props.timeMs
    if (fixed !== undefined) return resolveAnimation(frame.value, fixed, props.loop)
    return resolveAnimation(frame.value, elapsedMs.value, props.loop)
})

/**
 * 舞台样式：保持 UMG 的布局尺寸，按固定比例缩放后在容器内居中。
 *
 * 图层坐标以设计画布左上角为原点，画布在容器里水平铺满、垂直居中；比画布大的美术
 * 会照常溢出到容器外，不做任何裁切。
 */
const stageStyle = computed(() => ({
    left: `${(boxWidth.value - frame.value.width * scale.value) / 2}px`,
    top: `${(boxHeight.value - frame.value.height * scale.value) / 2}px`,
    width: `${frame.value.width}px`,
    height: `${frame.value.height}px`,
    transform: `scale(${scale.value})`,
}))

/**
 * 容器样式：默认按设计画布的宽高比撑开；调用方给出固定高度时会覆盖它，
 * 组件尺寸因此与贴图实际大小无关。
 */
const rootStyle = computed(() => ({ aspectRatio: `${frame.value.width} / ${frame.value.height}` }))

watch(
    () => props.scale,
    () => updateScale()
)

/**
 * 取图层在当前动画里的轨道。
 * @param layer 图层
 * @returns 轨道数据，无动画时 undefined
 */
function trackOf(layer: TitleFrameLayer): TitleFrameLayerTrack | undefined {
    return sample.value.animation?.tracks[layer.key]
}

/**
 * 合成图层变换。
 *
 * UMG 的 RenderTransform 与 2D Transform Track 都是「平移 → 旋转 → 切变 → 缩放」，
 * 以控件中心为轴心，与 CSS 的书写顺序一致。
 *
 * @param layer 图层
 * @returns CSS transform 字符串
 */
function layerTransform(layer: TitleFrameLayer): string {
    const track = trackOf(layer)
    const time = sample.value.timeMs
    const transform = track?.transform

    const translateX = transform?.translateX ? sampleCurve(transform.translateX, time, layer.translation[0]) : layer.translation[0]
    const translateY = transform?.translateY ? sampleCurve(transform.translateY, time, layer.translation[1]) : layer.translation[1]
    const rotation = transform?.rotation ? sampleCurve(transform.rotation, time, layer.rotation) : layer.rotation
    const scaleX = transform?.scaleX ? sampleCurve(transform.scaleX, time, layer.scale[0]) : layer.scale[0]
    const scaleY = transform?.scaleY ? sampleCurve(transform.scaleY, time, layer.scale[1]) : layer.scale[1]
    const shearX = transform?.shearX ? sampleCurve(transform.shearX, time, layer.shear[0]) : layer.shear[0]
    const shearY = transform?.shearY ? sampleCurve(transform.shearY, time, layer.shear[1]) : layer.shear[1]

    const parts: string[] = []
    if (translateX || translateY) parts.push(`translate(${translateX}px, ${translateY}px)`)
    if (rotation) parts.push(`rotate(${rotation}deg)`)
    if (shearX || shearY) parts.push(`skew(${shearX}deg, ${shearY}deg)`)
    if (scaleX !== 1 || scaleY !== 1) parts.push(`scale(${scaleX}, ${scaleY})`)
    return parts.join(" ")
}

/**
 * 合成图层不透明度。
 * @param layer 图层
 * @returns 0~1 的不透明度
 */
function layerOpacity(layer: TitleFrameLayer): number {
    const curve = trackOf(layer)?.opacity
    return Math.max(0, Math.min(1, layer.opacity * sampleCurve(curve, sample.value.timeMs, 1)))
}

/** 图层色调分解结果。 */
interface LayerTint {
    /** 是否为「纯白着色」：只需按 alpha 渲染原图 */
    readonly plain: boolean
    readonly color: string
    readonly alpha: number
}

/**
 * 分解图层色调。
 *
 * 白色色调（含透明度）直接按 alpha 渲染贴图；带颜色的色调用「纯色 + 贴图遮罩」渲染，
 * 与 UMG 中材质把着色乘到 Mask 贴图上的效果一致。
 *
 * @param layer 图层
 * @returns 色调分解结果
 */
function layerTint(layer: TitleFrameLayer): LayerTint {
    const tint = layer.tint
    if (!tint) return { plain: true, color: "#ffffff", alpha: 1 }
    const [r, g, b, a] = tint
    const toByte = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255)
    const isWhite = r > 0.99 && g > 0.99 && b > 0.99
    return {
        plain: isWhite,
        color: `rgb(${toByte(r)}, ${toByte(g)}, ${toByte(b)})`,
        alpha: Math.max(0, Math.min(1, a)),
    }
}

/**
 * 生成图层的定位与混色样式。
 * @param layer 图层
 * @returns CSS 样式
 */
function layerStyle(layer: TitleFrameLayer): CSSProperties {
    const rect = computeLayerRect(layer, frame.value.width, frame.value.height)
    const tint = layerTint(layer)
    return {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        transform: layerTransform(layer),
        opacity: String(layerOpacity(layer) * tint.alpha),
        mixBlendMode: layer.blend === "add" ? "plus-lighter" : layer.blend === "multiply" ? "multiply" : "normal",
    }
}

/**
 * 生成元素上的遮罩样式。
 *
 * 材质里 `MainTex` 只提供颜色、真正的形状来自 `Mask` / `Mask2`，因此把主贴图
 * （纯色着色时）和各个遮罩贴图都挂到同一个元素的 `mask-image` 上，用
 * `mask-composite: intersect` 逐层相乘，等价于 UE 材质里连乘 alpha。
 *
 * @param layer 图层
 * @param includeSource 是否把主贴图本身也当作遮罩（纯色着色时使用）
 * @returns CSS 样式
 */
function layerMaskStyle(layer: TitleFrameLayer, includeSource: boolean): CSSProperties {
    const urls = [...(includeSource ? [layer.src] : []), ...layer.masks].map(src => `url("${src}")`)
    if (urls.length === 0) return {}
    return {
        maskImage: urls.join(", "),
        WebkitMaskImage: urls.join(", "),
        maskSize: urls.map(() => "100% 100%").join(", "),
        WebkitMaskSize: urls.map(() => "100% 100%").join(", "),
        maskRepeat: urls.map(() => "no-repeat").join(", "),
        WebkitMaskRepeat: urls.map(() => "no-repeat").join(", "),
        // UE 里遮罩是按 R 通道（或灰度）取的，而 CSS 默认按 alpha 通道取。
        // VX_T_Mask_* 这类遮罩是不透明的灰度图，按 alpha 取等于「全通过」——
        // 效果层于是铺满整块框面，把主体糊掉。改成按亮度取才与着色器一致。
        maskMode: urls.map(() => "luminance").join(", "),
        // 只写标准属性：`-webkit-mask-composite` 不接受列表，写成
        // "source-in, source-in" 会让整条声明失效，多张遮罩就退化成并集（union），
        // 效果层的可见范围被放大一大圈，主体被糊住。
        maskComposite: urls.map(() => "intersect").join(", "),
    }
}

/**
 * 文字材质 MI_Word_Wavenew 的 MainColor 折算到显示色。
 *
 * 该材质父级是 M_BasicVX01，MainColor = (2.0, 1.74, 1.40)。超过 1 的高光在实机里被
 * 泛光晕开，所以实际看到的不是 (1, 0.87, 0.70) 这么黄，而是更接近白。这里按实机截图
 * 取样标定：截图里文字亮部均值 (233,233,195)，三个通道比例是 (1, 1, 0.837)。
 */
const TEXT_MATERIAL_TINT = [1, 1, 0.84] as const

/**
 * 把 WBP 里的文字颜色与材质色相乘。
 * @param color WBP 的 ColorAndOpacity（#rrggbb）
 * @returns 最终 #rrggbb
 */
function tintTextColor(color: string): string {
    const match = /^#?([0-9a-f]{6})$/i.exec(color.trim())
    if (!match) return color
    const value = Number.parseInt(match[1], 16)
    const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
    const tinted = channels.map((channel, index) => Math.round(channel * TEXT_MATERIAL_TINT[index]))
    return "#" + tinted.map(channel => channel.toString(16).padStart(2, "0")).join("")
}

/** 文字样式。 */
const textStyle = computed(() => {
    const text = frame.value.text
    if (!text) return null
    const maxWidth = text.wrapAt > 0 ? Math.min(text.wrapAt, text.width) : text.width
    return {
        left: `${text.x + (text.width - maxWidth) / 2}px`,
        top: `${text.y}px`,
        width: `${maxWidth}px`,
        height: `${text.height}px`,
        fontSize: `${text.fontSize}px`,
        lineHeight: "1",
        // UE 里 TextBlock 的 Margin.Bottom 为负值，等价于把整块文字向上顶一点点
        transform: text.marginBottom ? `translateY(${text.marginBottom / 2}px)` : undefined,
        color: tintTextColor(text.color),
        textAlign: text.justify,
    }
})
</script>

<template>
    <div ref="rootRef" class="title-frame" :style="rootStyle">
        <!--
            画布要无条件渲染出来，ref 才能在 onMounted 里拿到；WebGL 初始化失败时用
            v-show 收起，DOM 图层继续渲染，等价于自动回退。
        -->
        <canvas v-if="props.renderer !== 'dom'" v-show="useWebGL" ref="canvasRef" class="title-frame__canvas" />
        <div class="title-frame__stage" :style="stageStyle">
            <template v-if="!useWebGL">
            <div
                v-for="(layer, index) in frame.layers"
                :key="layer.key"
                class="title-frame__layer"
                :style="{ ...layerStyle(layer), zIndex: index + 1 }"
            >
                <img
                    v-if="layerTint(layer).plain"
                    class="title-frame__image"
                    :src="layer.src"
                    :style="layerMaskStyle(layer, false)"
                    alt=""
                    draggable="false"
                />
                <span
                    v-else
                    class="title-frame__mask"
                    :style="{ backgroundColor: layerTint(layer).color, ...layerMaskStyle(layer, true) }"
                />
            </div>
            </template>
            <div v-if="textStyle" class="title-frame__text" :style="textStyle">
                <span class="title-frame__text-inner">
                    <slot>{{ title }}</slot>
                </span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.title-frame {
    position: relative;
    width: 100%;
    /* 环境光效（辉光、星点）会按 UMG 的规则溢出到框外，这里必须放行，不能裁切 */
    overflow: visible;
}

.title-frame__canvas {
    /* 位置与尺寸由脚本按可见包围盒设置（见 draw） */
    position: absolute;
    pointer-events: none;
}

.title-frame__stage {
    position: absolute;
    transform-origin: 0 0;
}

.title-frame__layer {
    position: absolute;
    transform-origin: center center;
    pointer-events: none;
    will-change: transform, opacity;
}

.title-frame__image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: fill;
    user-select: none;
}

.title-frame__mask {
    display: block;
    width: 100%;
    height: 100%;
}

.title-frame__text {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    /* 游戏内 TextBlock 指定的是 Blod_Font，用同一个字体面才能对上字宽/字重 */
    font-family: "TitleBlod", "Microsoft YaHei", sans-serif;
    font-weight: 700;
    /* 颜色由脚本按材质算出（见 TEXT_MATERIAL_TINT），这里只负责外发光 */
    text-shadow:
        0 0 5px rgba(255, 226, 150, 0.55),
        0 0 14px rgba(255, 196, 110, 0.3),
        0 1px 1px rgba(0, 0, 0, 0.6);
    pointer-events: none;
}

.title-frame__text-inner {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
</style>
