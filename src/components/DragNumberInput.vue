<script setup lang="ts">
import { computed, ref } from "vue"

/**
 * 可拖拽调整数值的数字输入框。
 *
 * 交互:指针在输入框上横向(或纵向)拖动即连续改数值 —— 移动超过阈值才进入"拖拽调值"模式,
 * 未移动则维持普通点击聚焦输入;拖动过程中实时 `update:modelValue`,松手时额外抛 `change`
 * 供调用方提交(配合防抖即可做到所见即所得)。
 */
const props = withDefaults(
    defineProps<{
        /** 当前值 */
        modelValue: number
        /** 最小值 */
        min?: number
        /** 最大值 */
        max?: number
        /** 步进(键盘方向键与拖拽基准步长) */
        step?: number
        /** 每像素拖拽变化量;缺省取 step */
        dragStep?: number
        /** 显示小数位 */
        precision?: number
        /** 单位后缀(仅显示) */
        suffix?: string
        /** 是否禁用 */
        disabled?: boolean
        /** 输入框宽度类名 */
        widthClass?: string
        /** 无障碍标签 */
        ariaLabel?: string
    }>(),
    {
        min: Number.NEGATIVE_INFINITY,
        max: Number.POSITIVE_INFINITY,
        step: 1,
        precision: 1,
        suffix: "",
        disabled: false,
        widthClass: "w-20",
        ariaLabel: "",
    }
)

const emit = defineEmits<{
    (event: "update:modelValue", value: number): void
    (event: "change", value: number): void
}>()

/** 拖动超过该像素阈值才视为"拖拽调值",否则按普通点击处理。 */
const DRAG_THRESHOLD_PX = 3
/** 是否正在拖拽调值(用于切换光标与高亮)。 */
const dragging = ref(false)
/** 拖拽起始指针位置与起始值。 */
let dragOrigin: { x: number; y: number; value: number } | null = null

/** 按精度与区间规整数值。 */
const decimals = computed(() => Math.max(0, Math.min(6, Math.trunc(props.precision))))
const displayValue = computed(() => {
    const value = props.modelValue
    if (!Number.isFinite(value)) return ""
    return decimals.value > 0 ? value.toFixed(decimals.value) : String(Math.round(value))
})

/**
 * 把任意输入钳制到 [min, max] 并按精度取整。
 * @param value 候选值
 * @returns 规整后的数值
 */
function normalize(value: number): number {
    if (!Number.isFinite(value)) return props.min > Number.NEGATIVE_INFINITY ? props.min : 0
    const factor = 10 ** decimals.value
    const stepped = Math.round(value * factor) / factor
    return Math.min(Math.max(stepped, props.min), props.max)
}

/**
 * 指针按下:记录起点,等移动超过阈值再进入拖拽模式。
 * @param event 指针事件
 */
function handlePointerDown(event: PointerEvent) {
    if (props.disabled || event.button !== 0) return
    dragOrigin = { x: event.clientX, y: event.clientY, value: props.modelValue }
    const target = event.currentTarget as HTMLInputElement
    target.setPointerCapture(event.pointerId)
}

/**
 * 指针移动:横向拖动改值(纵向向上为正也支持),进入拖拽模式后阻止默认行为避免选中文本。
 * @param event 指针事件
 */
function handlePointerMove(event: PointerEvent) {
    if (!dragOrigin || props.disabled) return
    const dx = event.clientX - dragOrigin.x
    const dy = event.clientY - dragOrigin.y
    if (!dragging.value && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
    if (!dragging.value) dragging.value = true
    event.preventDefault()
    const perPixel = props.dragStep ?? props.step
    // 横向右移增大;纵向拖动转成等效横向位移(更符合"拖数值"直觉)
    const delta = Math.abs(dx) >= Math.abs(dy) ? dx : -dy
    const next = normalize(dragOrigin.value + delta * perPixel)
    if (next !== props.modelValue) emit("update:modelValue", next)
}

/**
 * 指针抬起:结束拖拽并提交最终值。
 * @param event 指针事件
 */
function handlePointerUp(event: PointerEvent) {
    const target = event.currentTarget as HTMLInputElement
    if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId)
    if (dragging.value) {
        dragging.value = false
        dragOrigin = null
        emit("change", props.modelValue)
        return
    }
    dragOrigin = null
}

/**
 * 键盘/手输改值。
 * @param event 输入事件
 */
function handleInput(event: Event) {
    const next = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(next)) return
    emit("update:modelValue", normalize(next))
}

/** 提交当前值(失焦 / 回车)。 */
function commit() {
    emit("change", props.modelValue)
}
</script>

<template>
    <label
        class="input input-bordered input-sm flex cursor-ew-resize items-center gap-1 select-none"
        :class="[widthClass, dragging ? 'border-primary' : '']"
        :title="'左右拖拽可直接调整数值'"
    >
        <input
            :value="displayValue"
            type="number"
            class="w-full min-w-0 grow cursor-ew-resize bg-transparent text-right font-orbitron text-[13px] tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            :min="min"
            :max="max"
            :step="step"
            :disabled="disabled"
            :aria-label="ariaLabel"
            @pointerdown="handlePointerDown"
            @pointermove="handlePointerMove"
            @pointerup="handlePointerUp"
            @pointercancel="handlePointerUp"
            @input="handleInput"
            @change="commit"
            @blur="commit"
        />
        <span v-if="suffix" class="shrink-0 text-[11px] text-base-content/50">{{ suffix }}</span>
    </label>
</template>
