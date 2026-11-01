<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core"
import { computed, nextTick, ref, watch } from "vue"
import { PORT_META, PortType } from "@/utils/nodeEditorPorts"

const props = withDefaults(
    defineProps<{
        label?: string
        min?: number
        max?: number
        step?: number
        /** 小数位数：拖动与按钮按此取整，手动输入也收敛到该精度 */
        precision?: number
        disabled?: boolean
        /** 行首输入端口 id；传入后在行左侧渲染连接点 */
        handleId?: string
        portType?: PortType
        /** 标签后的提示文字（如「连线」） */
        hint?: string
    }>(),
    {
        step: 1,
        portType: PortType.VECTOR,
    }
)

const value = defineModel<number>({ required: true })

/** 拖动时只更新本地值，松开后再提交，避免整图连续重算 */
const current = ref(Number.isFinite(value.value) ? value.value : 0)
const editing = ref(false)
const scrubbing = ref(false)
const draft = ref("")
const inputEl = ref<HTMLInputElement | null>(null)
let pointerId = 0
let pointerStartX = 0
let pointerStartValue = 0
let pointerMoved = false

watch(
    () => value.value,
    next => {
        if (editing.value || scrubbing.value) return
        current.value = Number.isFinite(next) ? next : 0
    }
)

const portColor = computed(() => PORT_META[props.portType].color)

/** 展示值：指定精度时固定小数位，否则保留原值 */
const displayValue = computed(() => {
    if (!Number.isFinite(current.value)) return "0"
    return props.precision === undefined ? String(current.value) : current.value.toFixed(props.precision)
})

/** 收敛到端口范围与精度；拖动取整，手动输入按声明的精度保留 */
function normalize(value: number, round: boolean): number | undefined {
    if (!Number.isFinite(value)) return undefined
    let next = value
    if (props.min !== undefined) next = Math.max(props.min, next)
    if (props.max !== undefined) next = Math.min(props.max, next)
    if (round) next = Number(next.toFixed(props.precision ?? 3))
    else if (props.precision !== undefined) next = Number(next.toFixed(props.precision))
    return next
}

/** 提交数值到父组件；值未变化时不重复通知 */
function commit(next: number) {
    current.value = next
    if (next !== value.value) value.value = next
}

/** 按步长增减 */
function adjust(delta: number) {
    if (props.disabled) return
    const next = normalize(current.value + delta, true)
    if (next !== undefined && next !== current.value) commit(next)
}

/** 进入手动输入 */
function startEditing() {
    if (props.disabled) return
    draft.value = displayValue.value
    editing.value = true
    nextTick(() => {
        inputEl.value?.focus()
        inputEl.value?.select()
    })
}

/** 提交手动输入；空值或无效内容保持原值 */
function commitEdit() {
    if (!editing.value) return
    editing.value = false
    const text = draft.value.trim()
    if (!text) return
    const next = normalize(Number(text), false)
    if (next !== undefined) commit(next)
}

/** Esc 取消手动输入 */
function cancelEdit() {
    editing.value = false
}

/** 按下数值区：准备拖动或点击输入 */
function onPointerDown(event: PointerEvent) {
    if (props.disabled || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    pointerId = event.pointerId
    pointerStartX = event.clientX
    pointerStartValue = current.value
    pointerMoved = false
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

/** 左右拖动按步长改变数值 */
function onPointerMove(event: PointerEvent) {
    if (!pointerId || pointerId !== event.pointerId) return
    const deltaX = event.clientX - pointerStartX
    if (!pointerMoved && Math.abs(deltaX) < 3) return
    pointerMoved = true
    scrubbing.value = true
    const steps = Math.round(deltaX / 5)
    const next = normalize(pointerStartValue + steps * props.step, true)
    if (next !== undefined) current.value = next
}

/** 松开：拖动则提交，原地点击则进入输入 */
function onPointerUp(event: PointerEvent) {
    if (!pointerId || pointerId !== event.pointerId) return
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(pointerId)
    pointerId = 0
    scrubbing.value = false
    if (!pointerMoved) {
        startEditing()
        return
    }
    const next = normalize(current.value, true)
    if (next !== undefined) commit(next)
    pointerMoved = false
}

/** 拖动被取消时恢复原值 */
function onPointerCancel(event: PointerEvent) {
    if (!pointerId || pointerId !== event.pointerId) return
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(pointerId)
    pointerId = 0
    scrubbing.value = false
    pointerMoved = false
    current.value = Number.isFinite(value.value) ? value.value : 0
}
</script>

<template>
    <div class="relative flex h-6 items-center gap-1.5">
        <Handle
            v-if="handleId"
            :id="handleId"
            type="target"
            :position="Position.Left"
            class="border! border-base-100!"
            :style="{ left: '-12px', top: '50%', transform: 'translateY(-50%)', background: portColor }"
        />
        <span
            v-if="label"
            class="w-16 shrink-0 truncate text-[10px] leading-none text-base-content/45"
            :class="{ 'opacity-50': disabled }"
            :title="label"
        >
            {{ label }}
        </span>
        <span v-if="hint" class="shrink-0 text-[9px] leading-none text-primary/70">{{ hint }}</span>
        <div
            class="ml-auto flex h-5 min-w-0 flex-1 items-stretch border border-base-content/10 bg-base-content/4 transition-colors duration-150"
            :class="disabled ? 'opacity-50' : 'hover:border-base-content/20'"
        >
            <button
                type="button"
                class="nodrag grid w-5 shrink-0 cursor-pointer place-items-center text-base-content/40 transition-colors duration-150 hover:bg-base-content/10 hover:text-primary active:scale-[0.95] disabled:cursor-not-allowed disabled:text-base-content/25"
                :disabled="disabled"
                title="减少"
                @click.stop="adjust(-step)"
            >
                <Icon icon="ri:subtract-line" class="size-3" />
            </button>
            <input
                v-if="editing"
                ref="inputEl"
                v-model="draft"
                type="text"
                inputmode="decimal"
                class="nodrag nowheel min-w-0 flex-1 border-0 bg-transparent px-1 text-center font-mono text-[11px] tabular-nums text-base-content outline-none"
                @keydown.enter.prevent="commitEdit"
                @keydown.esc.prevent="cancelEdit"
                @blur="commitEdit"
                @pointerdown.stop
                @mousedown.stop
                @click.stop
            />
            <div
                v-else
                class="nodrag flex min-w-0 flex-1 touch-none select-none items-center justify-center px-1 font-mono text-[11px] tabular-nums text-base-content/85"
                :class="disabled ? 'cursor-not-allowed' : 'cursor-ew-resize'"
                :title="disabled ? '该参数已由连线输入驱动' : '拖动调整，点击输入'"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerCancel"
            >
                {{ displayValue }}
            </div>
            <button
                type="button"
                class="nodrag grid w-5 shrink-0 cursor-pointer place-items-center text-base-content/40 transition-colors duration-150 hover:bg-base-content/10 hover:text-primary active:scale-[0.95] disabled:cursor-not-allowed disabled:text-base-content/25"
                :disabled="disabled"
                title="增加"
                @click.stop="adjust(step)"
            >
                <Icon icon="ri:add-line" class="size-3" />
            </button>
        </div>
    </div>
</template>
