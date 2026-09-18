<script lang="ts" setup>
import { type CSSProperties, computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { titleFrameIdToKey, titleFrames } from "@/data/generated/title-frame.generated"
import {
    computeLayerRect,
    flipBookCellAt,
    flipBookFpsCurve,
    resolveAnimation,
    resolveFlipBook,
    sampleCurve,
    TITLE_FONT_LINE_RATIO,
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
        // 文字自适应缩放要量字宽，字体是异步加载的，加载完成后需要重新量一次
        updateTextScale()
        void document.fonts?.ready.then(() => updateTextScale())
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
        updateTextScale()
    })
})

watch(
    () => props.title,
    () => void nextTick(() => updateTextScale())
)

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
 * 序列帧图层当前格的裁剪参数。
 *
 * 图集按 rows×columns 铺满控件后，只需把「图片的 p% 点」对齐到「容器的 p% 点」即可
 * 正好露出第 n 格（CSS 的背景/遮罩定位就是这个语义），所以百分比按格数取等分点。
 *
 * @param layer 图层
 * @returns 裁剪参数，非序列帧图层返回 null
 */
function flipBookCrop(layer: TitleFrameLayer): { size: string; position: string } | null {
    const book = resolveFlipBook(layer)
    if (!book) return null
    const state = sample.value
    const { row, column } = flipBookCellAt(book, state.timeMs, flipBookFpsCurve(state.animation, layer.key))
    const at = (value: number, count: number) => (count <= 1 ? 0 : (value / (count - 1)) * 100)
    return {
        size: `${book.columns * 100}% ${book.rows * 100}%`,
        position: `${at(column, book.columns)}% ${at(row, book.rows)}%`,
    }
}

/**
 * 序列帧图层的主贴图样式。
 *
 * 纯色着色时主贴图要当背景画出来（等价于普通图层的 `<img>`），这里把裁好的那一格
 * 作为背景图放进去；遮罩仍然挂在 mask-image 上。
 *
 * @param layer 图层
 * @returns CSS 样式
 */
function layerFlipBookStyle(layer: TitleFrameLayer): CSSProperties {
    const crop = flipBookCrop(layer)
    return {
        ...(crop
            ? {
                  backgroundImage: `url("${layer.src}")`,
                  backgroundSize: crop.size,
                  backgroundPosition: crop.position,
                  backgroundRepeat: "no-repeat",
              }
            : {}),
        ...layerMaskStyle(layer, false),
    }
}

/**
 * 图层是否走序列帧裁剪（模板里分流用）。
 * @param layer 图层
 * @returns 是否为序列帧图集图层
 */
function isFlipBook(layer: TitleFrameLayer): boolean {
    return resolveFlipBook(layer) !== null
}

/**
 * 生成元素上的遮罩样式。
 *
 * 材质里 `MainTex` 只提供颜色、真正的形状来自 `Mask` / `Mask2`，因此把主贴图
 * （纯色着色时）和各个遮罩贴图都挂到同一个元素的 `mask-image` 上，用
 * `mask-composite: intersect` 逐层相乘，等价于 UE 材质里连乘 alpha。
 *
 * 主贴图若是序列帧图集，遮罩层也要裁到同一格，否则遮罩位置与画出来的那一格对不上。
 *
 * @param layer 图层
 * @param includeSource 是否把主贴图本身也当作遮罩（纯色着色时使用）
 * @returns CSS 样式
 */
function layerMaskStyle(layer: TitleFrameLayer, includeSource: boolean): CSSProperties {
    const entries: { url: string; crop: { size: string; position: string } | null }[] = []
    if (includeSource) entries.push({ url: layer.src, crop: flipBookCrop(layer) })
    for (const mask of layer.masks) entries.push({ url: mask, crop: null })
    if (entries.length === 0) return {}
    return {
        maskImage: entries.map(entry => `url("${entry.url}")`).join(", "),
        WebkitMaskImage: entries.map(entry => `url("${entry.url}")`).join(", "),
        maskSize: entries.map(entry => entry.crop?.size ?? "100% 100%").join(", "),
        WebkitMaskSize: entries.map(entry => entry.crop?.size ?? "100% 100%").join(", "),
        maskPosition: entries.map(entry => entry.crop?.position ?? "0% 0%").join(", "),
        WebkitMaskPosition: entries.map(entry => entry.crop?.position ?? "0% 0%").join(", "),
        maskRepeat: entries.map(() => "no-repeat").join(", "),
        WebkitMaskRepeat: entries.map(() => "no-repeat").join(", "),
        // UE 里遮罩是按 R 通道（或灰度）取的，而 CSS 默认按 alpha 通道取。
        // VX_T_Mask_* 这类遮罩是不透明的灰度图，按 alpha 取等于「全通过」——
        // 效果层于是铺满整块框面，把主体糊掉。改成按亮度取才与着色器一致。
        maskMode: entries.map(() => "luminance").join(", "),
        // 只写标准属性：`-webkit-mask-composite` 不接受列表，写成
        // "source-in, source-in" 会让整条声明失效，多张遮罩就退化成并集（union），
        // 效果层的可见范围被放大一大圈，主体被糊住。
        maskComposite: entries.map(() => "intersect").join(", "),
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

/** 文字自适应缩放（对应 UMG ScaleBox 的 ScaleToFit + DownOnly）。 */
const textScale = ref(1)
const textInnerRef = ref<HTMLElement | null>(null)

/**
 * 量取文字自然宽度并算出缩放系数：超出布局框时整体缩小，绝不放大。
 *
 * 游戏里 TextBlock 外面套的是 ScaleBox（Stretch=ScaleToFit、StretchDirection=DownOnly），
 * 所以长标题是「整块缩小」而不是截断。用 `overflow: hidden` 截断会把文字的外发光一起
 * 切掉——被切平的那圈辉光正是看起来「边缘很硬」的原因，所以这里改成缩字号之外的缩放。
 *
 * 缩放只作用于文字本身，控件盒宽不变（盒子尺寸由 UMG 布局决定，不随文字变化）。
 */
function updateTextScale() {
    const inner = textInnerRef.value
    if (!inner) return
    const text = frame.value.text
    if (!text) return
    const maxWidth = text.wrapAt > 0 ? Math.min(text.wrapAt, text.width) : text.width
    // offsetWidth 是布局宽度，不含 transform，因此拿到的是未缩放的自然宽度
    const natural = inner.offsetWidth
    textScale.value = natural > 0 && maxWidth > 0 ? Math.min(1, maxWidth / natural) : 1
}

/**
 * 文字样式。
 *
 * 落点完全取自游戏控件（`text.x/y/width/height`）：WBP 里文字挂在 Overlay 的
 * `HAlign_Fill / VAlign_Center` 槽上，`y` 已经是「ScaleBox 期望高度在 34 高画布内居中」
 * 之后的位置，因此这里不再做任何垂直居中/位移补偿——多算一层就会让所有称号的文字整体偏
 * 1~2px。行盒高度用字体的真实行高（见 TITLE_FONT_LINE_RATIO），字形才会正好填满 TextBlock
 * 的盒子，基线与游戏一致。
 */
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
        lineHeight: `${text.fontSize * TITLE_FONT_LINE_RATIO}px`,
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
                <!-- 序列帧图集：只裁出当前那一格，整张贴图铺进去会变成一片重复的小图 -->
                <div
                    v-if="isFlipBook(layer)"
                    class="title-frame__image"
                    :style="layerFlipBookStyle(layer)"
                />
                <img
                    v-else-if="layerTint(layer).plain"
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
                <span ref="textInnerRef" class="title-frame__text-inner" :style="{ transform: `scale(${textScale})` }">
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
    /*
     * 盒子就是游戏控件给的位置与尺寸（脚本里的 left/top/width/height），这里只做两件事：
     * 1. 行盒高度 = 字体真实行高（脚本内联 line-height），字形正好填满盒子，不再有
     *    「行盒矮于字形 → 浏览器把字形上移」那 2px 的偏差；
     * 2. 居中：长标题整体缩小（transform: scale）时，缩小点是盒子中心，文字才不会跑偏。
     */
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    /* 游戏内 TextBlock 指定的是 Blod_Font，用同一个字体面才能对上字宽/字重 */
    font-family: "TitleBlod", "Microsoft YaHei", sans-serif;
    font-weight: 700;
    /* 颜色由脚本按材质算出（见 TEXT_MATERIAL_TINT），这里只负责外发光。
       材质里的文字是「自发光 + 泛光」，没有描边：单层「小半径 + 高透明度」的写法会在
       字外糊出一圈边界分明的琥珀色轮廓（边缘很硬），换成半径递增、透明度递减的几档
       叠起来，衰减才是连续的；深色投影只留一层很淡的，用来把字从亮底板上托起来。 */
    text-shadow:
        0 0 4px rgba(255, 242, 208, 0.28),
        0 0 10px rgba(255, 226, 160, 0.18),
        0 0 20px rgba(255, 198, 120, 0.1),
        0 1px 4px rgba(0, 0, 0, 0.28);
    pointer-events: none;
}

.title-frame__text-inner {
    /* 不截断：截断用的 overflow: hidden 会把外发光一起切掉，留下硬边 */
    display: inline-block;
    white-space: nowrap;
    transform-origin: center center;
}
</style>
