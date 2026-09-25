<script setup lang="ts">
import { computed, ref } from "vue"
import { clampAnchorInside, clampAnchorPercent } from "@/utils/skill-cd-overlay"

/**
 * 浮窗位置选择器:用"游戏窗口客户区"的等比缩略盒表示实际屏幕区域,
 * 盒内的小方块即浮窗(左上角锚点)。指针在盒内按下拖动即直接改百分比数值。
 *
 * 拖拽的百分比与后端使用同一条"浮窗完整落在客户区内"的钳制规则,保证所见即所得。
 */
const props = defineProps<{
    /** 浮窗左上角横向百分比 */
    anchorX: number
    /** 浮窗左上角纵向百分比 */
    anchorY: number
    /** 浮窗自身宽度占客户区宽度的百分比 */
    overlayWidthPercent: number
    /** 浮窗自身高度占客户区高度的百分比 */
    overlayHeightPercent: number
    /** 客户区像素尺寸(仅用于显示) */
    clientWidth: number
    clientHeight: number
    /** 浮窗内按键标签(仅用于预览) */
    labels: string[]
    /** 是否已定位到游戏窗口 */
    gameFound: boolean
    /** 是否禁用交互 */
    disabled?: boolean
}>()

const emit = defineEmits<{
    (event: "update:anchorX", value: number): void
    (event: "update:anchorY", value: number): void
    (event: "change"): void
}>()

/** 预览盒 DOM 引用(用于把指针位置换算成百分比)。 */
const boxRef = ref<HTMLElement | null>(null)
/** 是否正在拖拽。 */
const dragging = ref(false)
/** 抓住浮窗本体时的偏移量(百分比),使其不会在按下瞬间跳到指针处。 */
let grabOffset = { x: 0, y: 0 }

/** 客户区等比盒的宽高比(未知时按 16:9)。 */
const aspectRatio = computed(() => {
    const width = props.clientWidth > 0 ? props.clientWidth : 16
    const height = props.clientHeight > 0 ? props.clientHeight : 9
    return `${width} / ${height}`
})

/** 浮窗方块在盒内的位置与尺寸(百分比)。 */
const markerStyle = computed(() => ({
    left: `${clampAnchorInside(props.anchorX, props.overlayWidthPercent)}%`,
    top: `${clampAnchorInside(props.anchorY, props.overlayHeightPercent)}%`,
    width: `${Math.max(props.overlayWidthPercent, 2)}%`,
    height: `${Math.max(props.overlayHeightPercent, 3)}%`,
}))

/**
 * 把指针位置换算成盒内百分比。
 * @param event 指针事件
 * @returns 横向与纵向百分比(未夹取,交给调用方按浮窗尺寸钳制)
 */
function pointerPercent(event: PointerEvent) {
    const box = boxRef.value
    if (!box) return { x: props.anchorX, y: props.anchorY }
    const rect = box.getBoundingClientRect()
    if (!rect.width || !rect.height) return { x: props.anchorX, y: props.anchorY }
    return {
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
    }
}

/**
 * 指针按下:若按在浮窗方块上则保留抓取偏移,否则让方块左上角直接跟到指针处。
 * @param event 指针事件
 */
function handlePointerDown(event: PointerEvent) {
    if (props.disabled || event.button !== 0) return
    const box = boxRef.value
    if (!box) return
    const percent = pointerPercent(event)
    const grabbedMarker = (event.target as HTMLElement | null)?.closest("[data-overlay-marker]") != null
    grabOffset = grabbedMarker ? { x: props.anchorX - percent.x, y: props.anchorY - percent.y } : { x: 0, y: 0 }
    dragging.value = true
    box.setPointerCapture(event.pointerId)
    applyPointer(event)
}

/**
 * 指针移动:按当前指针位置实时更新锚点百分比。
 * @param event 指针事件
 */
function handlePointerMove(event: PointerEvent) {
    if (!dragging.value) return
    event.preventDefault()
    applyPointer(event)
}

/**
 * 指针抬起:结束拖拽并提交一次。
 * @param event 指针事件
 */
function handlePointerUp(event: PointerEvent) {
    const box = boxRef.value
    if (box?.hasPointerCapture(event.pointerId)) box.releasePointerCapture(event.pointerId)
    if (!dragging.value) return
    dragging.value = false
    emit("change")
}

/**
 * 依据指针位置写入锚点百分比(按浮窗尺寸钳制在客户区内)。
 *
 * 结果保留一位小数,与输入框显示精度一致,避免把浮点误差(如 30.000001988)写进本地存储。
 * @param event 指针事件
 */
function applyPointer(event: PointerEvent) {
    const percent = pointerPercent(event)
    const round = (value: number) => Math.round(value * 10) / 10
    emit("update:anchorX", round(clampAnchorInside(percent.x + grabOffset.x, props.overlayWidthPercent)))
    emit("update:anchorY", round(clampAnchorInside(percent.y + grabOffset.y, props.overlayHeightPercent)))
}
</script>

<template>
    <div
        ref="boxRef"
        class="relative w-full touch-none overflow-hidden rounded-xs border border-dashed border-base-content/25 bg-base-content/5"
        :class="disabled ? 'cursor-not-allowed opacity-60' : dragging ? 'cursor-grabbing' : 'cursor-crosshair'"
        :style="{ aspectRatio }"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
    >
        <!-- 客户区网格(25% / 50% / 75%) -->
        <div
            class="pointer-events-none absolute inset-0 opacity-50"
            style="
                background-image:
                    linear-gradient(to right, color-mix(in oklab, currentColor 18%, transparent) 1px, transparent 1px),
                    linear-gradient(to bottom, color-mix(in oklab, currentColor 18%, transparent) 1px, transparent 1px);
                background-size: 25% 25%;
            "
        />
        <!-- 浮窗缩略方块(左上角即锚点) -->
        <div
            data-overlay-marker
            class="absolute flex items-center gap-0.5 overflow-hidden rounded-xs border px-0.5"
            :class="dragging ? 'border-primary bg-primary/30' : 'border-primary/70 bg-primary/20'"
            :style="markerStyle"
        >
            <span
                v-for="label in labels.slice(0, 4)"
                :key="label"
                class="shrink-0 rounded-full border border-primary/60 text-[9px] leading-3 text-primary"
                >&nbsp;{{ label }}&nbsp;</span
            >
        </div>
        <!-- 未检测到游戏窗口提示 -->
        <div
            v-if="!gameFound"
            class="pointer-events-none absolute inset-x-0 bottom-0 bg-warning/15 px-2 py-0.5 text-[11px] text-warning"
        >
            {{ $t('skill-cd-pos-picker.no_game_window') }}
        </div>
    </div>
    <div class="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-base-content/50">
        <span>客户区 {{ clientWidth }} × {{ clientHeight }}</span>
        <span class="font-orbitron tabular-nums">
            X {{ clampAnchorPercent(anchorX).toFixed(1) }}% · Y {{ clampAnchorPercent(anchorY).toFixed(1) }}%
        </span>
    </div>
</template>
