<script lang="ts" setup>
import { computed, ref } from "vue"

/**
 * 双端滑块组件：单轨 + 两个可拖拽滑块头，支持鼠标 / 触摸（Pointer Events）与键盘操作。
 * 约束：起始值不超过「结束值 - minGap」，结束值不小于「起始值 + minGap」（minGap > 0 时对应 [start, end) 半开区间）。
 */
const props = withDefaults(
    defineProps<{
        min?: number
        max?: number
        step?: number
        /** 两端最小间距（结束端至少比起始端大 minGap） */
        minGap?: number
        /** 起始端值（v-model:start） */
        start: number
        /** 结束端值（v-model:end） */
        end: number
        /** 起始端无障碍标签 */
        startLabel?: string
        /** 结束端无障碍标签 */
        endLabel?: string
    }>(),
    {
        min: 0,
        max: 100,
        step: 1,
        minGap: 0,
        startLabel: "起始值",
        endLabel: "结束值",
    }
)

const emit = defineEmits<{
    "update:start": [value: number]
    "update:end": [value: number]
}>()

const trackRef = ref<HTMLElement | null>(null)
const dragging = ref<"start" | "end" | null>(null)

/**
 * 将原始数值按 min/max/step 收敛到合法刻度。
 * @param value 原始数值
 * @returns 收敛后的数值
 */
function snapValue(value: number): number {
    const stepped = Math.round((value - props.min) / props.step) * props.step + props.min
    return Math.max(props.min, Math.min(props.max, stepped))
}

/**
 * 根据指针横坐标换算轨道上的数值。
 * @param clientX 指针相对视口的横坐标
 * @returns 对应数值（已按 step 收敛）
 */
function valueFromClientX(clientX: number): number {
    const track = trackRef.value
    if (!track) {
        return props.min
    }

    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) {
        return props.min
    }

    const ratio = (clientX - rect.left) / rect.width
    return snapValue(props.min + ratio * (props.max - props.min))
}

/**
 * 数值在轨道上的百分比位置。
 * @param value 数值
 * @returns 0~100 的百分比
 */
function toPercent(value: number): number {
    if (props.max <= props.min) {
        return 0
    }
    return ((value - props.min) / (props.max - props.min)) * 100
}

const startPercent = computed(() => toPercent(props.start))
const endPercent = computed(() => toPercent(props.end))

/**
 * 滑块头的水平定位：所有取值共用同一公式——以值百分比为基准，两端按滑块头一半宽度内缩，
 * 保证滑块头始终完整可见、不被容器裁剪，端点不落在 0% / 100%。
 * @param percent 值在轨道上的百分比
 * @returns left 样式值
 */
function thumbLeftStyle(percent: number): string {
    return `clamp(calc(var(--range-thumb-size) / 2), ${percent}%, calc(100% - var(--range-thumb-size) / 2))`
}

/**
 * 更新某一端数值，并保证与另一端保持 minGap 间距。
 * @param which 滑块端
 * @param value 目标数值
 */
function updateValue(which: "start" | "end", value: number): void {
    if (which === "start") {
        const next = Math.min(value, props.end - props.minGap)
        if (next !== props.start) {
            emit("update:start", next)
        }
        return
    }

    const next = Math.max(value, props.start + props.minGap)
    if (next !== props.end) {
        emit("update:end", next)
    }
}

/**
 * 滑块头按下：捕获指针，开始拖拽。
 * @param event 指针事件
 * @param which 滑块端
 */
function onThumbPointerDown(event: PointerEvent, which: "start" | "end"): void {
    dragging.value = which
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

/**
 * 拖拽中：按指针位置更新所在端数值。
 * @param event 指针事件
 */
function onThumbPointerMove(event: PointerEvent): void {
    if (!dragging.value) {
        return
    }
    updateValue(dragging.value, valueFromClientX(event.clientX))
}

/**
 * 拖拽结束：释放状态。
 */
function onThumbPointerUp(): void {
    dragging.value = null
}

/**
 * 点击轨道：就近移动滑块头。
 * @param event 指针事件
 */
function onTrackPointerDown(event: PointerEvent): void {
    if (dragging.value) {
        return
    }

    const value = valueFromClientX(event.clientX)
    updateValue(Math.abs(value - props.start) <= Math.abs(value - props.end) ? "start" : "end", value)
}

/**
 * 键盘操作滑块头：方向键步进，Home/End 跳到端点。
 * @param event 键盘事件
 * @param which 滑块端
 */
function onThumbKeydown(event: KeyboardEvent, which: "start" | "end"): void {
    if (event.key === "Home") {
        event.preventDefault()
        updateValue(which, props.min)
        return
    }

    if (event.key === "End") {
        event.preventDefault()
        updateValue(which, props.max)
        return
    }

    let delta = 0
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        delta = -props.step
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        delta = props.step
    } else {
        return
    }

    event.preventDefault()
    updateValue(which, snapValue(props[which] + delta))
}
</script>

<template>
    <div ref="trackRef" class="dual-range relative cursor-pointer touch-none select-none" @pointerdown="onTrackPointerDown">
        <!-- 轨道（复刻 daisyUI range 轨道：currentColor 10% 混合） -->
        <div class="dual-range-track"></div>
        <!-- 已选区间高亮（复刻 daisyUI range 进度填充：currentColor 整条高度） -->
        <div
            class="dual-range-fill"
            :style="{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }"
        ></div>
        <!-- 起始端滑块头 -->
        <div
            role="slider"
            tabindex="0"
            class="dual-range-thumb"
            :class="{ 'cursor-grabbing': dragging === 'start' }"
            :style="{ left: thumbLeftStyle(startPercent) }"
            :aria-label="startLabel"
            :aria-valuemin="min"
            :aria-valuemax="max"
            :aria-valuenow="start"
            @pointerdown="event => onThumbPointerDown(event, 'start')"
            @pointermove="onThumbPointerMove"
            @pointerup="onThumbPointerUp"
            @pointercancel="onThumbPointerUp"
            @keydown="event => onThumbKeydown(event, 'start')"
        ></div>
        <!-- 结束端滑块头 -->
        <div
            role="slider"
            tabindex="0"
            class="dual-range-thumb"
            :class="{ 'cursor-grabbing': dragging === 'end' }"
            :style="{ left: thumbLeftStyle(endPercent) }"
            :aria-label="endLabel"
            :aria-valuemin="min"
            :aria-valuemax="max"
            :aria-valuenow="end"
            @pointerdown="event => onThumbPointerDown(event, 'end')"
            @pointermove="onThumbPointerMove"
            @pointerup="onThumbPointerUp"
            @pointercancel="onThumbPointerUp"
            @keydown="event => onThumbKeydown(event, 'end')"
        ></div>
    </div>
</template>

<style scoped>
/* 复刻 daisyUI range range-primary range-xs 的视觉：主题变量驱动，跟随当前主题切换 */
.dual-range {
    --range-thumb-size: calc(var(--size-selector, 0.25rem) * 4);
    --range-p: 0.25rem;
    --range-thumb: var(--color-primary-content);
    --radius-selector-max: calc(var(--radius-selector) + var(--radius-selector) + var(--radius-selector));
    color: var(--color-primary);
    box-sizing: border-box;
    width: 100%;
    height: var(--range-thumb-size);
    border: none;
    border-radius: calc(var(--radius-selector) + min(var(--range-p), var(--radius-selector-max)));
    background-color: #0000;
    overflow: hidden;
}

/* 轨道：currentColor 10% 混合、轨道高度为滑块头一半 */
.dual-range-track {
    position: absolute;
    inset-inline: 0;
    top: 50%;
    transform: translateY(-50%);
    height: calc(var(--range-thumb-size) * 0.5);
    border-radius: var(--radius-selector);
    background-color: color-mix(in oklab, currentColor 10%, #0000);
}

/* 已选区间高亮：复刻 range 的进度填充（currentColor、与滑块头同高、被容器圆角裁剪） */
.dual-range-fill {
    position: absolute;
    top: 0;
    bottom: 0;
    background-color: currentColor;
}

/* 滑块头：复刻 daisyUI 滑块头的圆角、描边与深度阴影 */
.dual-range-thumb {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    width: var(--range-thumb-size);
    height: var(--range-thumb-size);
    border-radius: calc(var(--radius-selector) + min(var(--range-p), var(--radius-selector-max)));
    background-color: var(--range-thumb);
    border: var(--range-p) solid;
    cursor: grab;
    touch-action: none;
    box-shadow:
        0 -1px oklch(0% 0 0 / calc(var(--depth) * 0.1)) inset,
        0 8px 0 -4px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset,
        0 1px color-mix(in oklab, currentColor calc(var(--depth) * 10%), #0000),
        0 0 0 2rem var(--range-thumb) inset;
}

.dual-range-thumb:focus-visible {
    outline-offset: 2px;
    outline: 2px solid;
}
</style>
