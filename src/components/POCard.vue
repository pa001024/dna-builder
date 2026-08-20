<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue"
import { RouterLink } from "vue-router"
import type { IconTypes } from "@/components/Icon.vue"

/** Win10 磁贴尺寸：small=1x1，large=2x2，wide=2x1。 */
export type POCardSize = "small" | "large" | "wide"

/** 指针跟随 3D 旋转的最大角度（度）：原版约 ±14°，此处降为 ±8°。 */
const MAX_TILT = 8
/** 悬停缩放幅度：原版可达 1.1+，此处保持轻量。 */
const HOVER_SCALE = 1.04

const props = withDefaults(
    defineProps<{
        /** 磁贴尺寸（决定宽高比：小/大 1:1，宽 2:1） */
        size?: POCardSize
        /** 内部路由跳转目标（提供后根元素渲染为 RouterLink） */
        to?: string
        /** 外部链接地址（提供后根元素渲染为 a 标签） */
        href?: string
        /** 磁贴标题 */
        title?: string
        /** 磁贴描述（small 尺寸不展示） */
        description?: string
        /** 图标名 */
        icon?: IconTypes
        /** 纯色渐变背景（CSS background 简写，替换原版的卡图/全息底） */
        gradient?: string
        /** 辉光强调色（悬停光晕与描边） */
        glow?: string
        /** 是否启用 3D 倾斜跟随（默认开启，prefers-reduced-motion 时自动关闭） */
        tilt?: boolean
    }>(),
    {
        size: "small",
        gradient: "linear-gradient(135deg, #2b6cb0, #6b46c1)",
        glow: "rgba(255, 255, 255, 0.55)",
        tilt: true,
    }
)

/** 指针采样得到的目标状态（与磁贴内容无关，纯视觉跟随）。 */
const target = { rx: 0, ry: 0, px: 50, py: 50, o: 0, s: 1 }
/** 当前渲染状态：rAF 每帧以插值逼近 target。 */
const state = reactive({ ...target })

let rafId = 0
let hovering = false
let reducedMotion = false

/**
 * 将数值收敛到 [min, max]。
 * @param v 原始值
 * @param min 下界
 * @param max 上界
 * @returns 收敛后的值
 */
function clamp(v: number, min: number, max: number) {
    return Math.min(max, Math.max(min, v))
}

/**
 * 指针移动：采样磁贴内坐标，换算为降低幅度后的目标旋转/辉光状态。
 * @param event 指针事件
 */
function onPointerMove(event: PointerEvent) {
    if (!props.tilt || reducedMotion) return
    const el = event.currentTarget as HTMLElement | null
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100)
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
    const dx = x - 50
    const dy = y - 50
    const fromCenter = clamp(Math.hypot(dx, dy) / 50, 0, 1)
    // 旋转方向与原版一致：左右偏移驱动 rotateY，上下偏移驱动 rotateX，幅度减半左右
    target.ry = (-dx / 50) * MAX_TILT
    target.rx = (dy / 50) * MAX_TILT
    target.px = x
    target.py = y
    target.o = fromCenter
    target.s = HOVER_SCALE
    hovering = true
    startLoop()
}

/** 指针离开：所有状态回归中性（0 旋转 / 1 缩放 / 居中辉光）。 */
function onPointerLeave() {
    hovering = false
    target.rx = 0
    target.ry = 0
    target.px = 50
    target.py = 50
    target.o = 0
    target.s = 1
}

/** 启动 rAF 缓动循环（幂等，避免重复调度）。 */
function startLoop() {
    if (!rafId) rafId = requestAnimationFrame(tick)
}

/**
 * 每帧以轻弹簧式插值逼近目标状态，稳定且未悬停时停止循环。
 */
function tick() {
    state.rx += (target.rx - state.rx) * 0.14
    state.ry += (target.ry - state.ry) * 0.14
    state.px += (target.px - state.px) * 0.25
    state.py += (target.py - state.py) * 0.25
    state.o += (target.o - state.o) * 0.18
    state.s += (target.s - state.s) * 0.18
    const settled =
        Math.abs(target.rx - state.rx) < 0.01 &&
        Math.abs(target.ry - state.ry) < 0.01 &&
        Math.abs(target.o - state.o) < 0.01 &&
        Math.abs(target.s - state.s) < 0.01
    if (settled && !hovering) {
        rafId = 0
        return
    }
    rafId = requestAnimationFrame(tick)
}

onMounted(() => {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
})

onBeforeUnmount(() => {
    if (rafId) cancelAnimationFrame(rafId)
})

/** 根元素类型：按目标类型渲染为 RouterLink / a / 普通块。 */
const tag = computed(() => (props.to ? RouterLink : props.href ? "a" : "div"))

/** 按目标类型绑定的链接属性（避免向无关元素注入多余属性）。 */
const linkAttrs = computed(() => {
    if (props.to) return { to: props.to }
    if (props.href) return { href: props.href }
    return {}
})

/** 根节点样式：注入渐变与辉光 CSS 变量，供内部各层使用。 */
const rootStyle = computed(() => ({
    "--po-grad": props.gradient,
    "--po-glow": props.glow,
}))

/** 旋转层样式：降低幅度的 3D 变换（rotateY/rotateX + 轻量缩放）。 */
const rotatorStyle = computed(() => ({
    transform: `rotateY(${state.ry.toFixed(2)}deg) rotateX(${state.rx.toFixed(2)}deg) scale(${state.s.toFixed(3)})`,
}))

/** 辉光层样式：复刻原版 rare holo 的 glare（白→灰→黑径向，overlay 混合），悬停时显现。 */
const glareStyle = computed(() => ({
    backgroundImage: `radial-gradient(circle at ${state.px.toFixed(1)}% ${state.py.toFixed(1)}%, rgba(255, 255, 255, 0.8) 10%, rgba(255, 255, 255, 0.65) 20%, rgba(0, 0, 0, 0.5) 90%)`,
    opacity: String(state.o * 0.8),
}))

/** 图标组件实例引用：用于读取其暴露的 path 数据，生成图标真实轮廓的反向 mask。 */
const iconEl = ref<{ getIconPath?: (name: string) => { d: string; size: number } | null } | null>(null)

/**
 * 图标轮廓 mask 数据 URI：黑色图标 path 的 SVG（透明背景）。
 * 作为 mask 第二层与全黑层 exclude 合成，即图标区域不应用全息特效（反向 mask）。
 */
const iconMask = computed(() => {
    if (!props.icon) return ""
    const path = iconEl.value?.getIconPath?.(props.icon)
    if (!path) return ""
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${path.size} ${path.size}"><path fill="#000" d="${path.d}"/></svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
})

/** 图标反向 mask 的内联样式：全黑层 + 图标层（exclude 挖洞），图标按内层高度 75% 居中。 */
const iconMaskStyle = computed(() => {
    const uri = iconMask.value
    if (!uri) return {}
    return {
        maskImage: `linear-gradient(#000, #000), ${uri}`,
        maskSize: "100% 100%, auto 75%",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskComposite: "exclude",
        WebkitMaskImage: `linear-gradient(#000, #000), ${uri}`,
        WebkitMaskSize: "100% 100%, auto 75%",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskComposite: "xor",
    }
})

/** 稀有全息层样式：复刻原站 Holofoil Rare 的 110deg 彩虹斜纹（color-dodge），随指针平移与增亮。可见性由 CSS :hover 控制。 */
const holoStyle = computed(() => ({
    "--po-x": `${state.px.toFixed(1)}%`,
    "--po-y": `${state.py.toFixed(1)}%`,
    ...iconMaskStyle.value,
}))

/** 大卡全息箔层样式：Trainer Gallery Holofoil 斜向彩虹箔，随指针平移。可见性由 CSS :hover 控制。 */
const foilStyle = computed(() => ({
    "--po-fx": `${state.px.toFixed(1)}%`,
    "--po-fy": `${state.py.toFixed(1)}%`,
    ...iconMaskStyle.value,
}))
</script>

<template>
    <component
        :is="tag"
        v-bind="linkAttrs"
        :style="rootStyle"
        class="po-card rounded-sm"
        :class="[`po-card--${size}`, { 'po-card--link': to || href }]"
        draggable="false"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
        @pointercancel="onPointerLeave"
    >
        <span class="po-card__rotator" :style="rotatorStyle">
            <span class="po-card__bg">
                <!-- 中心内框：留边距 rounded-sm p-3，承载内容与全息特效（非全卡） -->
                <span class="po-card__panel">
                    <span class="po-card__holo" :style="holoStyle" aria-hidden="true" />
                    <span v-if="size === 'large'" class="po-card__foil" :style="foilStyle" aria-hidden="true" />
                    <span class="po-card__panel-content">
                        <slot :title="title" :description="description">
                            <span v-if="icon" class="po-card__icon"><Icon ref="iconEl" :icon="icon" /></span>
                            <span v-if="title" class="po-card__text">
                                <span class="po-card__title">{{ title }}</span>
                                <span v-if="description && size !== 'small'" class="po-card__desc">{{ description }}</span>
                            </span>
                        </slot>
                    </span>
                </span>
            </span>
            <span class="po-card__glare" :style="glareStyle" aria-hidden="true" />
        </span>
    </component>
</template>

<style scoped>
/*
 * POCard：仿宝可梦全息卡片的通用 Win10 磁贴组件。
 * 相比 poke-holo.simey.me 原版：宽高比 1:1、圆角 rounded-sm（0.25rem）、
 * 3D 旋转幅度降低、背景改为纯色渐变，并支持 小/大/宽 三种磁贴尺寸。
 */
.po-card {
    position: relative;
    display: block;
    border-radius: var(--radius-sm); /* 与 Tailwind rounded-sm 一致：0.25rem */
    outline: none;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
    perspective: 800px; /* 更平的透视 → 3D 深度更弱 */
    cursor: pointer;
    user-select: none;
}

/* 纯展示（无链接）不给手型 */
.po-card:not(.po-card--link) {
    cursor: default;
}

/* 旋转层：承载渐变背景 + 流光 + 辉光，随指针做低幅度 3D 旋转 */
.po-card__rotator {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    will-change: transform;
    transform-style: preserve-3d;
    box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.55);
    transition: box-shadow 0.35s ease;
}

/* 悬停/聚焦：辉光描边 + 光晕，呼应全息卡的发光感 */
.po-card--link:hover .po-card__rotator,
.po-card--link:focus-visible .po-card__rotator {
    box-shadow:
        0 0 0 1px color-mix(in srgb, var(--po-glow) 60%, transparent),
        0 0 20px -4px var(--po-glow),
        0 12px 26px -10px rgba(0, 0, 0, 0.6);
}

/* 渐变背景层：纯色渐变卡面 + 顶部柔光，作为磁贴的整体表面 */
.po-card__bg {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    overflow: hidden;
    background: var(--po-grad);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

/* 中心内框：与卡缘留出边距，承载内容并裁剪全息特效 */
.po-card__panel {
    position: absolute;
    inset: 0;
    border-radius: 0.25rem; /* rounded-sm */
    padding: 0.75rem; /* p-3 */
    overflow: hidden;
    text-align: center;
    color: #fff;
    background: linear-gradient(180deg, rgba(58, 82, 128, 0.26), rgba(28, 50, 90, 0.38));
    box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.09),
        inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.po-card__panel-content {
    position: relative;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-width: 0;
    height: 100%;
}

.po-card--wide .po-card__panel-content {
    flex-direction: row;
    justify-content: flex-start;
    gap: 0.85rem;
    text-align: left;
}

/* 稀有全息层：
   随指针平移；::before 为竖条光柱（hard-light），::after 为径向亮度（luminosity）。
   默认 opacity: 0 隐藏（含伪元素），卡片悬停/聚焦时经 CSS 过渡淡入——
   可见性只由 CSS 静态 0/1 端点控制，不在混合层上逐帧改 opacity，避免过曝类合成问题。 */
.po-card__holo {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    mix-blend-mode: color-dodge;
    opacity: 0;
    transition: opacity 0.3s ease;
    background-image:
        repeating-linear-gradient(
            110deg,
            #c929f1,
            #0dbde9,
            #21e985,
            #eedf10,
            #f80e35,
            #c929f1,
            #0dbde9,
            #21e985,
            #eedf10,
            #f80e35,
            #c929f1,
            #0dbde9,
            #21e985,
            #eedf10,
            #f80e35
        ),
        repeating-linear-gradient(90deg, #000 0 2px, #666 2px 4px);
    background-size:
        400% 400%,
        cover;
    background-position:
        calc(((50% - var(--po-x, 50%)) * 2.6) + 50%) calc(((50% - var(--po-y, 50%)) * 3.5) + 50%),
        center center;
    filter: brightness(0.8) contrast(1.1) saturate(1.2);
}

/* 悬停/聚焦：全息层淡入（含 ::before/::after，随基座一起过渡） */
.po-card:hover .po-card__holo,
.po-card:focus-visible .po-card__holo {
    opacity: 0.85;
}

/* 竖条光柱：
  两层条形渐变周期不同（42% / 30%），background-position 系数相反
 （+1.65 与 -0.9），指针一动即正反向对滑。 */
.po-card__holo::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
        repeating-linear-gradient(90deg, #000 6%, #e9efff 9%, #000 10.5%, #e9efff 12%, #000 15%, #000 42%),
        repeating-linear-gradient(90deg, #000 6%, #e9efff 9%, #000 10.5%, #e9efff 12%, #000 15%, #000 30%);
    background-size:
        200% 200%,
        200% 200%;
    background-position:
        calc((((50% - var(--po-x, 50%)) * 1.65) + 50%) + (var(--po-y, 50%) * 0.5)) var(--po-x, 50%),
        calc((((50% - var(--po-x, 50%)) * -0.9) + 50%) - (var(--po-y, 50%) * 0.75)) var(--po-y, 50%);
    background-blend-mode: screen;
    mix-blend-mode: hard-light;
    filter: brightness(0.8) contrast(1.1);
}

/* 径向亮度：跟随指针的亮斑，模拟原版的 luminosity 层 */
.po-card__holo::after {
    content: "";
    position: absolute;
    inset: 0;
    background-image: radial-gradient(
        farthest-corner circle at var(--po-x, 50%) var(--po-y, 50%),
        hsla(0, 0%, 90%, 0.8) 0%,
        hsla(0, 0%, 78%, 0.1) 25%,
        #000 90%
    );
    mix-blend-mode: luminosity;
    filter: brightness(0.6) contrast(4);
}

/* 大卡 Trainer Gallery Holofoil：-22deg 七色虹彩箔（color-dodge）+ 硬光径向高光，跟随指针。
   与全息层同样默认隐藏、悬停/聚焦时淡入。 */
.po-card__foil {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    mix-blend-mode: color-dodge;
    background-image: repeating-linear-gradient(
        -22deg,
        hsla(283, 49%, 60%, 0.75) 0 5%,
        hsla(2, 74%, 59%, 0.75) 5% 10%,
        hsla(53, 67%, 53%, 0.75) 10% 15%,
        hsla(93, 56%, 52%, 0.75) 15% 20%,
        hsla(176, 38%, 50%, 0.75) 20% 25%,
        hsla(228, 100%, 77%, 0.75) 25% 30%,
        hsla(283, 49%, 61%, 0.75) 30% 35%
    );
    background-size: 300% 400%;
    background-position: var(--po-fx, 50%) calc(var(--po-fy, 50%) * 1);
    filter: brightness(1) contrast(2.3) saturate(1);
    opacity: 0;
    transition: opacity 0.3s ease;
}

.po-card:hover .po-card__foil,
.po-card:focus-visible .po-card__foil {
    opacity: 0.6;
}

.po-card__foil::after {
    content: "";
    position: absolute;
    inset: 0;
    background-image: radial-gradient(
        farthest-corner ellipse at calc((var(--po-fx, 50%) * 0.5) + 25%) calc((var(--po-fy, 50%) * 0.5) + 25%),
        hsl(0, 0%, 100%) 5%,
        hsla(300, 100%, 11%, 0.6) 40%,
        hsl(0, 0%, 22%) 120%
    );
    background-size: 400% 500%;
    mix-blend-mode: hard-light;
    filter: brightness(0.9) contrast(0.85) saturate(1.1);
}

/* 图标：以 1em 计，按尺寸缩放 */
.po-card__icon {
    line-height: 0;
    color: rgba(255, 255, 255, 0.96);
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25));
}

.po-card--small .po-card__icon {
    font-size: 1.6rem;
}

.po-card--large .po-card__icon {
    font-size: 2.7rem;
}

.po-card--wide .po-card__icon {
    font-size: 2.2rem;
}

/* 文案块 */
.po-card__text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.po-card__title {
    font-weight: 650;
    line-height: 1.2;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.po-card--small .po-card__title {
    font-size: 0.8rem;
}

.po-card--large .po-card__title {
    font-size: 1.25rem;
}

.po-card--wide .po-card__title {
    font-size: 1.15rem;
}

.po-card__desc {
    font-size: 0.8rem;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.85);
}

/* 辉光层：复刻原版 rare holo glare（overlay 混合，悬停时显现） */
.po-card__glare {
    position: absolute;
    inset: 0;
    z-index: 3;
    border-radius: inherit;
    pointer-events: none;
    mix-blend-mode: overlay;
    filter: brightness(0.8) contrast(1.5);
}

/* 减少动态偏好：关闭全息层，保持静态渐变 */
@media (prefers-reduced-motion: reduce) {
    .po-card__holo,
    .po-card__foil,
    .po-card__glare {
        display: none;
    }
}
</style>
