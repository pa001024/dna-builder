<script lang="ts">
/** 同页所有浮动窗共享的层级计数器，保证后触碰的窗口压在最上层。 */
let floatingZCounter = 0

/**
 * 取下一个层级值：不低于 `zIndexBase`，且严格大于当前全局最大值。
 * @param base 宿主指定的起始层级
 * @returns 本窗口的新 z-index
 */
function acquireZIndex(base: number): number {
    floatingZCounter = Math.max(floatingZCounter + 1, base)
    return floatingZCounter
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import {
    clampWindowRect,
    DEFAULT_FLOATING_HEADER_HEIGHT,
    DEFAULT_FLOATING_MAX_WIDTH,
    DEFAULT_FLOATING_MIN_WIDTH,
    FLOATING_VIEWPORT_MARGIN,
    type FloatingViewport,
    resolveInitialWindowRect,
    type WindowRect,
} from "@/utils/floating-window"

/**
 * 通用浮动窗口：header 拖动 / 视口钳制 / Teleport 到 body / 模块级层级置顶。
 * 与业务无关，宿主通过插槽与 `move-end`、`restore`、`close` 事件自行接线。
 */
defineOptions({ inheritAttrs: false })

const props = withDefaults(
    defineProps<{
        open: boolean
        title?: string
        initialRect?: WindowRect | null
        minWidth?: number
        maxWidth?: number
        zIndexBase?: number
    }>(),
    { minWidth: DEFAULT_FLOATING_MIN_WIDTH, zIndexBase: 40 }
)

const emit = defineEmits<{
    "move-end": [rect: WindowRect]
    restore: []
    close: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const headerRef = ref<HTMLElement | null>(null)

const viewport = ref<FloatingViewport>({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
})

const rect = ref<WindowRect | null>(null)
const zIndex = ref(props.zIndexBase)
const headerHeight = ref(DEFAULT_FLOATING_HEADER_HEIGHT)
const dragging = ref(false)

const displayRect = computed<WindowRect>(() => rect.value ?? { left: 0, top: 0, width: props.minWidth, height: 0 })

const rootStyle = computed(() => ({
    left: `${displayRect.value.left}px`,
    top: `${displayRect.value.top}px`,
    width: `${displayRect.value.width}px`,
    maxHeight: `calc(100vh - ${FLOATING_VIEWPORT_MARGIN}px)`,
    zIndex: zIndex.value,
}))

interface DragState {
    pointerId: number
    startX: number
    startY: number
    startLeft: number
    startTop: number
    /** 是否已越过位移阈值；零位移（单击 / 抖动）不派发 `move-end`。 */
    moved: boolean
}

let dragState: DragState | null = null

/** 判定为“拖动”而非“点击”的最小位移（px）。 */
const DRAG_MOVE_THRESHOLD = 3

/** 同步读一次视口尺寸；SSG / 非浏览器环境跳过。 */
function syncViewport(): void {
    if (typeof window === "undefined") return
    viewport.value = { width: window.innerWidth, height: window.innerHeight }
}

/**
 * 测量真实 header 高度并回写；测量后补一次钳制，避免底部越界。
 */
function measureHeaderHeight(): void {
    const measured = headerRef.value?.getBoundingClientRect().height
    if (!measured || measured <= 0) return
    headerHeight.value = Math.round(measured)
    if (rect.value) rect.value = clampWindowRect(rect.value, viewport.value, headerHeight.value)
}

let resizeBound = false

function onWindowResize(): void {
    syncViewport()
    measureHeaderHeight()
    if (rect.value) rect.value = clampWindowRect(rect.value, viewport.value, headerHeight.value)
}

function bindResize(): void {
    if (resizeBound || typeof window === "undefined") return
    window.addEventListener("resize", onWindowResize)
    resizeBound = true
}

function unbindResize(): void {
    if (!resizeBound || typeof window === "undefined") return
    window.removeEventListener("resize", onWindowResize)
    resizeBound = false
}

function onRootPointerDown(): void {
    zIndex.value = acquireZIndex(props.zIndexBase)
}

/**
 * 判断按下 / 按键目标是否为可交互控件；命中则不启动拖动，保证其 click / 键盘行为不被指针捕获吞掉。
 * 非标准控件（自定义 div 按钮等）可用 `data-floating-window-no-drag` 显式退出拖动。
 * @param event 指针 / 键盘事件
 * @returns 是否落在交互控件上
 */
function isInteractiveTarget(event: Event): boolean {
    const target = event.target
    if (!(target instanceof Element)) return false
    const selector = [
        "button",
        "a",
        "input",
        "select",
        "textarea",
        "label",
        "summary",
        "[contenteditable]",
        '[role="button"]',
        '[role="switch"]',
        "[data-floating-window-no-drag]",
    ].join(", ")
    return !!target.closest(selector)
}

function onHeaderPointerDown(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (dragState || isInteractiveTarget(event)) return
    const current = rect.value
    if (!current) return
    dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: current.left,
        startTop: current.top,
        moved: false,
    }
    dragging.value = true
    const header = headerRef.value
    try {
        header?.setPointerCapture(event.pointerId)
    } catch {
        // 合成指针事件无法捕获，window 监听仍然可用
    }
    header?.addEventListener("lostpointercapture", onDragLostPointerCapture)
    window.addEventListener("pointermove", onDragPointerMove)
    window.addEventListener("pointerup", onDragPointerUp)
    window.addEventListener("pointercancel", onDragPointerCancel)
    window.addEventListener("blur", onWindowBlur)
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange)
}

function onDragPointerMove(event: PointerEvent): void {
    const drag = dragState
    if (!drag || event.pointerId !== drag.pointerId) return
    if (event.buttons === 0) {
        cancelDrag()
        return
    }
    if (!rect.value) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (!drag.moved) {
        if (Math.abs(deltaX) < DRAG_MOVE_THRESHOLD && Math.abs(deltaY) < DRAG_MOVE_THRESHOLD) return
        drag.moved = true
    }
    rect.value = clampWindowRect(
        { ...rect.value, left: drag.startLeft + deltaX, top: drag.startTop + deltaY },
        viewport.value,
        headerHeight.value
    )
}

function onWindowBlur(): void {
    if (dragState) cancelDrag()
}

function onVisibilityChange(): void {
    if (dragState && typeof document !== "undefined" && document.visibilityState === "hidden") cancelDrag()
}

function removeDragListeners(): void {
    headerRef.value?.removeEventListener("lostpointercapture", onDragLostPointerCapture)
    if (typeof window === "undefined") return
    window.removeEventListener("pointermove", onDragPointerMove)
    window.removeEventListener("pointerup", onDragPointerUp)
    window.removeEventListener("pointercancel", onDragPointerCancel)
    window.removeEventListener("blur", onWindowBlur)
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange)
}

function releasePointerCapture(pointerId: number): void {
    const header = headerRef.value
    if (!header?.hasPointerCapture?.(pointerId)) return
    try {
        header.releasePointerCapture(pointerId)
    } catch {
        // 指针可能已失效，忽略
    }
}

function finishDrag(event: PointerEvent, cancelled: boolean): void {
    const drag = dragState
    if (!drag || event.pointerId !== drag.pointerId) return
    dragState = null
    dragging.value = false
    removeDragListeners()
    releasePointerCapture(drag.pointerId)
    if (cancelled || !drag.moved || !rect.value) return
    const measuredHeight = rootRef.value?.getBoundingClientRect().height
    emit("move-end", {
        ...rect.value,
        height: typeof measuredHeight === "number" && measuredHeight > 0 ? measuredHeight : rect.value.height,
    })
}

function onDragPointerUp(event: PointerEvent): void {
    finishDrag(event, false)
}

function onDragPointerCancel(event: PointerEvent): void {
    finishDrag(event, true)
}

/** 指针捕获被浏览器回收（未走 pointerup / pointercancel）时终止拖动，避免拖动态卡死。 */
function onDragLostPointerCapture(event: PointerEvent): void {
    if (!dragState || event.pointerId !== dragState.pointerId) return
    cancelDrag()
}

/** 关闭 / 卸载时终止拖动，不触发 `move-end`。 */
function cancelDrag(): void {
    const drag = dragState
    dragState = null
    dragging.value = false
    removeDragListeners()
    if (drag) releasePointerCapture(drag.pointerId)
}

const KEYBOARD_MOVE_STEP = 16

/**
 * handle 键盘微调：方向键移动 16px 并同样钳制；不派发 `move-end`，不改变业务状态。
 * @param event 键盘事件
 */
function onHeaderKeydown(event: KeyboardEvent): void {
    if (isInteractiveTarget(event)) return
    let deltaX = 0
    let deltaY = 0
    switch (event.key) {
        case "ArrowLeft":
            deltaX = -KEYBOARD_MOVE_STEP
            break
        case "ArrowRight":
            deltaX = KEYBOARD_MOVE_STEP
            break
        case "ArrowUp":
            deltaY = -KEYBOARD_MOVE_STEP
            break
        case "ArrowDown":
            deltaY = KEYBOARD_MOVE_STEP
            break
        default:
            return
    }
    event.preventDefault()
    const current = rect.value
    if (!current) return
    rect.value = clampWindowRect(
        { ...current, left: current.left + deltaX, top: current.top + deltaY },
        viewport.value,
        headerHeight.value
    )
}

function onHeaderDblClick(event: MouseEvent): void {
    if (isInteractiveTarget(event)) return
    emit("restore")
}

function requestClose(): void {
    emit("close")
}

function requestRestore(): void {
    emit("restore")
}

watch(
    () => props.open,
    open => {
        if (!open) {
            cancelDrag()
            unbindResize()
            return
        }
        if (typeof window === "undefined") return
        syncViewport()
        zIndex.value = acquireZIndex(props.zIndexBase)
        rect.value = resolveInitialWindowRect(props.initialRect, viewport.value, {
            minWidth: props.minWidth,
            maxWidth: props.maxWidth ?? Math.min(DEFAULT_FLOATING_MAX_WIDTH, viewport.value.width - FLOATING_VIEWPORT_MARGIN),
            headerHeight: headerHeight.value,
        })
        bindResize()
        nextTick(measureHeaderHeight)
    },
    { immediate: true }
)

onBeforeUnmount(() => {
    cancelDrag()
    unbindResize()
})

/**
 * 读取当前实际生效矩形（已按视口与宽度上下限钳制），供宿主做吸附基准等判断。
 * @returns 窗口矩形副本；尚未初始化时为空
 */
function getRect(): WindowRect | null {
    return rect.value ? { ...rect.value } : null
}

defineExpose({ close: requestClose, restore: requestRestore, getRect })
</script>

<template>
    <Teleport v-if="open" to="body">
        <div
            ref="rootRef"
            data-floating-window
            role="dialog"
            aria-modal="false"
            :aria-label="title"
            :data-floating-window-dragging="dragging ? '' : undefined"
            class="fixed flex flex-col overflow-hidden rounded-xs border border-base-content/15 bg-base-100/90 shadow-lg backdrop-blur-md"
            :class="dragging ? 'cursor-grabbing select-none' : ''"
            :style="rootStyle"
            v-bind="$attrs"
            @pointerdown.capture="onRootPointerDown"
        >
            <div
                ref="headerRef"
                data-floating-window-handle
                tabindex="0"
                class="flex shrink-0 cursor-grab touch-none select-none items-center gap-2 border-b border-base-content/10 px-3 py-2 text-sm text-base-content"
                :class="dragging ? 'cursor-grabbing' : ''"
                @pointerdown="onHeaderPointerDown"
                @keydown="onHeaderKeydown"
                @dblclick="onHeaderDblClick"
            >
                <slot name="header">
                    <span class="truncate font-semibold">{{ title }}</span>
                </slot>
                <div class="ml-auto flex shrink-0 items-center gap-1">
                    <slot name="header-actions" :close="requestClose" :restore="requestRestore" />
                </div>
            </div>
            <div class="min-h-0 flex-1 overflow-auto">
                <slot />
            </div>
        </div>
    </Teleport>
</template>
