<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"

/**
 * 移动端（竖排）下列表面板的默认占比：列表 : 详情 = 1 : 2。
 */
const MOBILE_MASTER_SHARE = 1 / 3

/** 指针位移超过该距离才算“拖动”，否则视为点击（保留原“点击收起详情”交互）。 */
const DRAG_THRESHOLD = 5

/** 拖动时列表/详情面板允许的最小主轴尺寸（px）。 */
const MASTER_MIN_PX = 180
const DETAIL_MIN_PX = 220

const props = withDefaults(
    defineProps<{
        /** 详情面板是否展开；展开时才渲染分隔条与详情区。 */
        detailOpen: boolean
        /** 桌面端（横排）默认的列表面板占比（0~1）；移动端固定为 列表:详情 = 1:2。 */
        desktopRatio?: number
    }>(),
    { desktopRatio: 0.5 },
)

const emit = defineEmits<{
    /** 点击分隔条（未拖动）时触发，由页面收起详情。 */
    collapse: []
}>()

/** 列表面板主轴像素尺寸（展开详情时生效；拖动直接修改它，右侧内容不影响布局）。 */
const masterPx = ref(0)

const rootRef = ref<HTMLElement | null>(null)
const gutterRef = ref<HTMLElement | null>(null)

let activePointerId: number | null = null
let startCoord = 0
let startPx = 0
let dragMoved = false

/**
 * 当前实际布局方向：以容器的真实 flex-direction 为准（与 CSS 断点同源），
 * row = 桌面横排（水平拖动改宽度），col = 移动竖排（竖直拖动改高度）。
 * @returns "row" | "col"
 */
function axis(): "row" | "col" {
    const root = rootRef.value
    if (!root) return "row"
    return getComputedStyle(root).flexDirection === "row" ? "row" : "col"
}

/** 是否横排。 */
function isRow(): boolean {
    return axis() === "row"
}

/**
 * 当前方向下的默认占比：桌面取 desktopRatio，移动端取 1/3（列表:详情=1:2）。
 * @returns 默认列表面板占比
 */
function defaultMasterShare(): number {
    return isRow() ? props.desktopRatio : MOBILE_MASTER_SHARE
}

/** 最近一次实测到的容器主轴尺寸；测量失败时用其兜底，避免面板首帧为 0。 */
let lastMain = 0

/**
 * 取容器的当前主轴长度；失败时回退最近一次实测值，再回退兜底值 700。
 * @returns 主轴像素
 */
function mainSize(): number {
    const root = rootRef.value
    let main = 0
    if (root) {
        main = isRow() ? root.clientWidth : root.clientHeight
    }
    if (main > 0) {
        lastMain = main
        return main
    }
    return lastMain > 0 ? lastMain : 700
}

/**
 * 依据容器尺寸把占比换算成列表面板的主轴像素。
 * @param share 占比（0~1）
 * @param main 容器主轴长度
 * @returns 钳制后的像素
 */
function shareToPx(share: number, main: number): number {
    return Math.min(Math.max(share * main, MASTER_MIN_PX), Math.max(main - DETAIL_MIN_PX, MASTER_MIN_PX))
}

/**
 * 依据方向默认占比把列表面板换算成主轴像素；展开详情或方向切换时同步调用。
 * 同步执行且带兜底尺寸，保证展开首帧列表面板即为正确像素、绝不隐形。
 */
function applyShareToPx(): void {
    if (!props.detailOpen) return
    const main = mainSize()
    if (main <= 0) return
    masterPx.value = shareToPx(defaultMasterShare(), main)
}

/** 展开详情时（首次或数据源变化）重算列表面板默认像素。 */
watch(
    () => props.detailOpen,
    open => {
        if (open) {
            applyShareToPx()
        }
    },
    { immediate: true },
)

/** 列表面板主轴样式：展开时固定 px（内容不影响分隔位置），收起时占满整个容器。 */
const masterStyle = computed(() => (props.detailOpen ? { flex: `0 0 ${Math.max(masterPx.value, MASTER_MIN_PX)}px` } : { flex: "1 1 0%" }))

/** 详情面板始终吸收分隔条外的全部剩余空间。 */
const detailStyle = computed(() => ({ flex: "1 1 0%" }))

/** 当前是否横排（桌面，水平拖动调宽度）。随容器实际布局方向响应式更新。 */
const rowLayout = ref(true)

/**
 * 依据容器真实 flex-direction 刷新横排/竖排标记（与 CSS 断点同源）。
 */
function refreshDirection(): void {
    rowLayout.value = axis() === "row"
}

/** 用于无障碍展示的当前列表占比（百分比取整）。 */
const masterPercent = computed(() => {
    const main = mainSize()
    return main > 0 ? Math.round((masterPx.value / main) * 100) : 50
})

let lastAxis: "row" | "col" | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 容器尺寸变化处理：
 * - 布局方向切换（row ↔ col）时按该方向默认占比重算 px；
 * - 同一方向内保持当前 px（与 v-h-resize-for 语义一致，不写任何持久化存储）。
 */
function handleResize(): void {
    refreshDirection()
    if (!props.detailOpen) return
    const nowAxis = axis()
    if (lastAxis !== null && nowAxis !== lastAxis) {
        lastAxis = nowAxis
        void applyShareToPx()
        return
    }
    lastAxis = nowAxis
}

let rootObserver: ResizeObserver | null = null

onMounted(() => {
    refreshDirection()
    lastAxis = axis()
    if (typeof ResizeObserver !== "undefined" && rootRef.value) {
        rootObserver = new ResizeObserver(handleResize)
        rootObserver.observe(rootRef.value)
    }
})

onBeforeUnmount(() => {
    if (resizeTimer) clearTimeout(resizeTimer)
    rootObserver?.disconnect()
})

/**
 * 清理拖拽相关监听。
 */
function cleanupDragListeners(): void {
    window.removeEventListener("pointermove", onWindowPointerMove)
    window.removeEventListener("pointerup", onWindowPointerUp)
    window.removeEventListener("pointercancel", onWindowPointerCancel)
}

/**
 * 收起详情后拦截紧随其后的浏览器 click，避免其命中折叠后恰好位于指针下的列表项（自动重开详情）。
 */
function suppressNextClick(): void {
    const handler = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        window.removeEventListener("click", handler, true)
    }
    window.addEventListener("click", handler, true)
}

/**
 * 分隔条按下：记录起点并接管指针事件（window 级监听兜底，防止指针移出元素后丢事件）。
 * @param event 指针按下事件
 */
function onGutterPointerDown(event: PointerEvent): void {
    const gutter = gutterRef.value
    if (!gutter || activePointerId !== null) return
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.preventDefault()
    activePointerId = event.pointerId
    startCoord = isRow() ? event.clientX : event.clientY
    startPx = masterPx.value
    dragMoved = false
    try {
        gutter.setPointerCapture(event.pointerId)
    } catch {
        // 个别环境下合成指针无法捕获，window 监听仍然可用
    }
    window.addEventListener("pointermove", onWindowPointerMove)
    window.addEventListener("pointerup", onWindowPointerUp)
    window.addEventListener("pointercancel", onWindowPointerCancel)
}

/**
 * 拖动中：沿当前主轴（row=横向，col=竖向）按指针位移增减列表面板像素。
 * @param event 指针移动事件
 */
function onWindowPointerMove(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return
    const coord = isRow() ? event.clientX : event.clientY
    const delta = coord - startCoord
    if (Math.abs(delta) > DRAG_THRESHOLD) {
        dragMoved = true
    }
    const main = mainSize()
    if (main <= 0) return
    masterPx.value = Math.min(Math.max(startPx + delta, MASTER_MIN_PX), Math.max(main - DETAIL_MIN_PX, MASTER_MIN_PX))
}

/**
 * 结束拖动：有位移则保留新尺寸（仅本次会话，不做任何存储）；无位移视为点击，触发收起详情。
 * @param event 指针事件
 * @param cancelled 是否为 pointercancel（手势中断，不触发点击行为）
 */
function finishDrag(event: PointerEvent, cancelled: boolean): void {
    if (event.pointerId !== activePointerId) return
    cleanupDragListeners()
    const gutter = gutterRef.value
    if (gutter && gutter.hasPointerCapture?.(event.pointerId)) {
        try {
            gutter.releasePointerCapture(event.pointerId)
        } catch {
            // 指针可能已不存在，忽略
        }
    }
    activePointerId = null
    suppressNextClick()
    if (cancelled) return
    if (dragMoved) {
        return
    }
    emit("collapse")
}

/** 指针抬起：结束拖动。 */
function onWindowPointerUp(event: PointerEvent): void {
    finishDrag(event, false)
}

/** 指针取消（如触摸手势被系统接管）：只清理，不触发点击行为。 */
function onWindowPointerCancel(event: PointerEvent): void {
    finishDrag(event, true)
}

/**
 * 分隔条键盘操作：方向键沿当前主轴微调占比，回车/空格收起详情。
 * @param event 键盘事件
 */
function onGutterKeydown(event: KeyboardEvent): void {
    const main = mainSize()
    if (main <= 0) return
    const step = event.shiftKey ? 0.1 : 0.05
    let delta = 0
    switch (event.key) {
        case "ArrowRight":
        case "ArrowLeft": {
            if (!isRow()) return
            delta = (event.key === "ArrowRight" ? 1 : -1) * main * step
            break
        }
        case "ArrowDown":
        case "ArrowUp": {
            if (isRow()) return
            delta = (event.key === "ArrowDown" ? 1 : -1) * main * step
            break
        }
        case "Enter":
        case " ":
            emit("collapse")
            event.preventDefault()
            return
        default:
            return
    }
    event.preventDefault()
    masterPx.value = Math.min(Math.max(masterPx.value + delta, MASTER_MIN_PX), Math.max(main - DETAIL_MIN_PX, MASTER_MIN_PX))
}
</script>

<template>
    <div ref="rootRef" class="flex min-h-0 flex-1 flex-col sm:flex-row">
        <!-- 列表（master）面板：展开详情时为固定 px，收起时占满容器 -->
        <section class="flex min-h-0 min-w-0 flex-col overflow-hidden" :style="masterStyle">
            <slot name="master" />
        </section>

        <!--
            中间分隔条（在流内，固定 20px）：桌面端左右拖动调宽度，移动端上下拖动调高度。
            点击（未拖动）收起详情。
        -->
        <div
            v-if="detailOpen"
            ref="gutterRef"
            role="separator"
            :aria-orientation="rowLayout ? 'vertical' : 'horizontal'"
            aria-label="调整列表与详情区域大小"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="masterPercent"
            tabindex="0"
            title="拖动调整大小，单击收起详情"
            class="flex flex-none touch-none cursor-row-resize select-none items-center justify-center text-base-content/30 transition-colors duration-150 hover:bg-primary/10 hover:text-primary/70 focus-visible:bg-primary/15 active:bg-primary/20 border-y border-base-content/10 sm:cursor-col-resize sm:border-y-0 sm:border-x w-full h-5 sm:h-auto sm:w-5"
            @pointerdown="onGutterPointerDown"
            @keydown="onGutterKeydown"
        >
            <Icon icon="ri:draggable" aria-hidden="true" class="pointer-events-none h-3.5 w-3.5" />
        </div>

        <!-- 详情（detail）面板：占据分隔条外的全部剩余空间 -->
        <section v-if="detailOpen" class="flex min-h-0 min-w-0 flex-col overflow-hidden" :style="detailStyle">
            <slot name="detail" />
        </section>
    </div>
</template>
