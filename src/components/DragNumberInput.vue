<script setup lang="ts">
import { computed, ref } from "vue"

/**
 * 可拖拽调整数值的数字输入框。
 *
 * 交互:指针在输入框上横向(或纵向)拖动即连续改数值 —— 移动超过阈值才进入"拖拽调值"模式,
 * 未移动则聚焦进入文本编辑;拖动过程中实时 `update:modelValue`,松手时额外抛 `change`
 * 供调用方提交(配合防抖即可做到所见即所得)。
 *
 * 显示值分两种来源:编辑态显示本地 `draft` 原文,非编辑态才按精度格式化 `modelValue`。
 * 这样外部把值规整回去(如补全 `.0`)不会打断正在输入的字符。输入用 `type="text"`,
 * 中间态("1."、"-"、空串)得以保留,方向键步进由 `handleKeydown` 自行实现。
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
/** 编辑态下可接受的部分数字文本;-、.、空串作为中间态一并放行。 */
const PARTIAL_NUMBER = /^-?\d*\.?\d*$/

/** 是否正在拖拽调值(用于切换光标与高亮)。 */
const dragging = ref(false)
/** 是否处于文本编辑态;编辑期间显示 `draft`,不受外部值回写影响。 */
const editing = ref(false)
/** 编辑态下的输入原文,保持用户敲进去的样子。 */
const draft = ref("")
/** 原生输入元素,用于拒绝输入时回退 DOM、以及进入拖拽时主动失焦。 */
const inputRef = ref<HTMLInputElement | null>(null)
/** 拖拽起始指针位置与起始值。 */
let dragOrigin: { x: number; y: number; value: number } | null = null

/** 按精度与区间规整数值。 */
const decimals = computed(() => Math.max(0, Math.min(6, Math.trunc(props.precision))))

/** 非编辑态的展示文本:补齐到固定小数位。 */
function formatDisplay(value: number): string {
    if (!Number.isFinite(value)) return ""
    return decimals.value > 0 ? value.toFixed(decimals.value) : String(Math.round(value))
}

/** 进入编辑态的起始文本:去掉尾随零,避免"1.0"后面接数字要先把 0 删掉。 */
function formatEditable(value: number): string {
    if (!Number.isFinite(value)) return ""
    const fixed = value.toFixed(decimals.value)
    return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed
}

/** 输入框显示文本:编辑态取用户原文,否则取格式化后的外部值。 */
const displayValue = computed(() => (editing.value ? draft.value : formatDisplay(props.modelValue)))

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
 * 仅按 [min, max] 钳制、不做精度取整 —— 编辑过程中用它上报,保留用户的输入进度。
 * @param value 候选值
 * @returns 钳制后的数值
 */
function clampRange(value: number): number {
    return Math.min(Math.max(value, props.min), props.max)
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
    if (!dragging.value) {
        dragging.value = true
        // 拖拽改值期间显示外部值,先把编辑态提交掉,免得屏幕上留着半截输入
        if (editing.value) inputRef.value?.blur()
    }
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

/** 聚焦即进入编辑态,以当前值的可编辑文本作为起点。 */
function handleFocus() {
    if (props.disabled) return
    editing.value = true
    draft.value = formatEditable(props.modelValue)
}

/**
 * 文本输入:只更新本地 draft,不重排显示 —— 这是"输入不被打断"的关键。
 * @param event 输入事件
 */
function handleInput(event: Event) {
    if (!editing.value || props.disabled) return
    const target = event.currentTarget as HTMLInputElement
    const raw = target.value
    if (!PARTIAL_NUMBER.test(raw)) {
        // 拒绝非法字符:把 DOM 回退到上次接受的文本,防止视图与 draft 脱节
        target.value = draft.value
        return
    }
    draft.value = raw
    const parsed = Number(raw)
    if (raw.trim() === "" || !Number.isFinite(parsed)) return
    emit("update:modelValue", clampRange(parsed))
}

/** 结束编辑并提交:空串或非法文本退回当前值。 */
function commitEdit() {
    if (!editing.value) return
    editing.value = false
    const raw = draft.value.trim()
    draft.value = ""
    const parsed = Number(raw)
    const next = raw !== "" && Number.isFinite(parsed) ? normalize(parsed) : props.modelValue
    if (next !== props.modelValue) emit("update:modelValue", next)
    emit("change", next)
}

/** 放弃编辑(ESC):不提交,显示回到格式化后的当前值。 */
function cancelEdit() {
    editing.value = false
    draft.value = ""
}

/**
 * 键盘:ESC 取消、回车提交、上下方向键按 step 步进。
 * @param event 键盘事件
 */
function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        cancelEdit()
        return
    }
    if (event.key === "Enter") {
        event.preventDefault()
        commitEdit()
        return
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    const base = Number(draft.value)
    const origin = draft.value.trim() !== "" && Number.isFinite(base) ? base : props.modelValue
    const next = normalize(origin + (event.key === "ArrowUp" ? props.step : -props.step))
    draft.value = formatEditable(next)
    if (next !== props.modelValue) emit("update:modelValue", next)
}

/** 提交当前值(失焦)。 */
function handleBlur() {
    commitEdit()
}
</script>

<template>
    <label
        class="flex items-center gap-1 rounded-none border-b border-base-content/20 px-0.5 pb-1 transition-colors duration-150"
        :class="[widthClass, dragging ? 'border-primary' : '', editing ? 'cursor-text select-text' : 'cursor-ew-resize select-none']"
        :title="'左右拖拽可直接调整数值'"
    >
        <input
            ref="inputRef"
            :value="displayValue"
            type="text"
            inputmode="decimal"
            class="w-full min-w-0 grow bg-transparent text-right font-orbitron text-[13px] tabular-nums outline-none"
            :class="editing ? 'cursor-text' : 'cursor-ew-resize'"
            :disabled="disabled"
            :aria-label="ariaLabel"
            @pointerdown="handlePointerDown"
            @pointermove="handlePointerMove"
            @pointerup="handlePointerUp"
            @pointercancel="handlePointerUp"
            @focus="handleFocus"
            @input="handleInput"
            @keydown="handleKeydown"
            @blur="handleBlur"
        />
        <span v-if="suffix" class="shrink-0 text-[11px] text-base-content/50">{{ suffix }}</span>
    </label>
</template>
