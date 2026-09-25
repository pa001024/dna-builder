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

/** 拖动期间待写入的列表面板像素；用 rAF 合帧，一次指针移动不落一次样式写。 */
let pendingPx: number | null = null
let dragFrame = 0

/** 当前是否横排（桌面，水平拖动改宽度）。只在容器尺寸变化时读一次真实 flex-direction 刷新。 */
const rowLayout = ref(true)

/** 容器主轴尺寸（px）。只由 ResizeObserver 回调写入；渲染与拖动路径一律读缓存，避免强制同步布局。 */
const mainPx = ref(0)

/**
 * 读取容器真实布局方向：以 computed flex-direction 为准（与 CSS 断点同源），
 * row = 桌面横排（水平拖动改宽度），col = 移动竖排（竖直拖动改高度）。
 *
 * 只在 ResizeObserver 回调里调用：方向由宽度决定，宽度一变必然触发回调，
 * 因此无需（也不能）在渲染或指针移动路径上读 computed style——那会强制同步样式计算。
 * @returns "row" | "col"
 */
function axis(): "row" | "col" {
    const root = rootRef.value
    if (!root) return "row"
    return getComputedStyle(root).flexDirection === "row" ? "row" : "col"
}

/**
 * 当前方向下的默认占比：桌面取 desktopRatio，移动端取 1/3（列表:详情=1:2）。
 * @returns 默认列表面板占比
 */
function defaultMasterShare(): number {
    return rowLayout.value ? props.desktopRatio : MOBILE_MASTER_SHARE
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
 *
 * 容器尺寸来自 ResizeObserver 缓存，首帧回调到达前 mainPx 为 0，此时不写值：
 * masterStyle 退化为占满容器，等回调拿到真实尺寸再落位，
 * 否则会拿错误尺寸算出占比并一直沿用。
 */
function applyShareToPx(): void {
    if (!props.detailOpen) return
    const main = mainPx.value
    if (!(main > 0)) return
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

/** 列表面板主轴样式：展开且占比已落位时固定 px（内容不影响分隔位置），否则占满整个容器。 */
const masterStyle = computed(() => (props.detailOpen && masterPx.value > 0 ? { flex: `0 0 ${masterPx.value}px` } : { flex: "1 1 0%" }))

/** 详情面板始终吸收分隔条外的全部剩余空间。 */
const detailStyle = computed(() => ({ flex: "1 1 0%" }))

/** 用于无障碍展示的当前列表占比（百分比取整）。只读缓存尺寸，不触碰布局。 */
const masterPercent = computed(() => (mainPx.value > 0 ? Math.round((masterPx.value / mainPx.value) * 100) : 50))

/** 上一次回调观测到的横排标记；null 表示尚未收到过回调。 */
let lastRow: boolean | null = null

/**
 * 容器尺寸变化处理：先用回调自带的 contentRect 同步主轴尺寸（不读布局），再按需重算占比。
 * - 布局方向切换（row ↔ col）时按该方向默认占比重算 px；
 * - 占比尚未落位时补算一次；
 * - 同一方向内保持当前 px（与 v-h-resize-for 语义一致，不写任何持久化存储）。
 * @param entries ResizeObserver 回调条目；取最后一条（同一帧内多次变化以最新为准）
 */
function handleResize(entries: ResizeObserverEntry[]): void {
    const entry = entries[entries.length - 1]
    if (!entry) return
    rowLayout.value = axis() === "row"
    mainPx.value = rowLayout.value ? entry.contentRect.width : entry.contentRect.height

    if (!props.detailOpen) {
        lastRow = rowLayout.value
        return
    }
    if (lastRow !== null && lastRow !== rowLayout.value) {
        lastRow = rowLayout.value
        applyShareToPx()
        return
    }
    lastRow = rowLayout.value
    if (masterPx.value <= 0) {
        applyShareToPx()
    }
}

let rootObserver: ResizeObserver | null = null

onMounted(() => {
    if (typeof ResizeObserver !== "undefined" && rootRef.value) {
        rootObserver = new ResizeObserver(handleResize)
        rootObserver.observe(rootRef.value)
    }
})

onBeforeUnmount(() => {
    rootObserver?.disconnect()
    if (dragFrame) cancelAnimationFrame(dragFrame)
})

/**
 * 清理拖拽相关监听。
 */
function cleanupDragListeners(): void {
    window.removeEventListener("pointermove", onWindowPointerMove)
    window.removeEventListener("pointerup", onWindowPointerUp)
    window.removeEventListener("pointercancel", onWindowPointerCancel)
}

/** 把待写入的尺寸落到响应式状态（每帧最多一次）。 */
function flushPendingPx(): void {
    dragFrame = 0
    if (pendingPx === null) return
    masterPx.value = pendingPx
    pendingPx = null
}

/** 立即落盘待写入的尺寸并取消挂起的帧；拖动结束时调用，避免最后一帧位移丢失。 */
function commitPendingPx(): void {
    if (dragFrame) {
        cancelAnimationFrame(dragFrame)
        dragFrame = 0
    }
    flushPendingPx()
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
    startCoord = rowLayout.value ? event.clientX : event.clientY
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
 *
 * 全程只读缓存尺寸，不读任何布局；尺寸变化按帧合批写入，
 * 否则指针事件频率高于刷新率时会在一帧内反复「写样式 → 读布局」。
 * @param event 指针移动事件
 */
function onWindowPointerMove(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return
    const coord = rowLayout.value ? event.clientX : event.clientY
    const delta = coord - startCoord
    if (Math.abs(delta) > DRAG_THRESHOLD) {
        dragMoved = true
    }
    const main = mainPx.value
    if (!(main > 0)) return
    pendingPx = Math.min(Math.max(startPx + delta, MASTER_MIN_PX), Math.max(main - DETAIL_MIN_PX, MASTER_MIN_PX))
    if (!dragFrame) {
        dragFrame = requestAnimationFrame(flushPendingPx)
    }
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
    commitPendingPx()
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
    const main = mainPx.value
    if (!(main > 0)) return
    const step = event.shiftKey ? 0.1 : 0.05
    let delta = 0
    switch (event.key) {
        case "ArrowRight":
        case "ArrowLeft": {
            if (!rowLayout.value) return
            delta = (event.key === "ArrowRight" ? 1 : -1) * main * step
            break
        }
        case "ArrowDown":
        case "ArrowUp": {
            if (rowLayout.value) return
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
            :aria-label="$t('split-view.resize_hint')"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="masterPercent"
            tabindex="0"
            :title="$t('split-view.resize_tip')"
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
