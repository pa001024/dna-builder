<script setup lang="ts" generic="T">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue"

/**
 * 等高条目虚拟滚动列表。
 *
 * 只渲染可视窗口（外加 overscan 行）内的条目，DOM 节点数与数据总量无关，
 * 因此上千条的列表也能保持与几十条时相同的进入与滚动开销。
 *
 * 约束：同一列表内每张卡片的**主轴尺寸必须一致**（高度参差会让后面的卡片错位）。
 * 传入的 itemHeight 是估算值，首帧后会按实测卡高校正，取较大者作为行高——
 * 因此它应取卡片自然高度的下界，写大了就会成为行高下限，实测值再也回不落。
 * 卡片自然高度随窗口宽度变化（文本换行）时无需改这里：视口宽度一变会自动重量。
 */

/** 可视窗口上下各多渲染的行数：抵消快速滚动时新行尚未渲染造成的空白。 */
const OVERSCAN_ROWS = 4

/** 首屏参与入场动画的条目数下限；实际取「一屏能显示的条目数」与它的较大者。 */
const ENTER_ANIMATION_MIN_ITEMS = 12

/**
 * 初始选中项的等待窗口（ms）。
 * 选中项可能来自 URL 参数或随数据包水合稍后到位，窗口期内持续尝试滚入视口；
 * 窗口关闭后即使用户改选也不自动滚动，避免点击列表时页面自己跳走。
 */
const ACTIVE_SCROLL_WINDOW_MS = 3000

/** 窗口尺寸变化后重新量取行高的防抖时长（ms）。 */
const REMEASURE_DEBOUNCE_MS = 120

const props = withDefaults(
    defineProps<{
        /** 列表数据源。 */
        items: readonly T[]
        /** 单行主轴尺寸（px）的估算值，取卡片自然高度的下界；首帧后按实测卡高校正。 */
        itemHeight: number
        /** 行间距（px）。 */
        gap?: number
        /** 内容区内边距（px）。 */
        padding?: number
        /** 列数；传 "auto" 时按 minColumnWidth 自适应容器宽度。 */
        columns?: number | "auto"
        /** columns 为 "auto" 时的最小列宽（px），与 grid 的 minmax 下限一致。 */
        minColumnWidth?: number
        /** 条目 key；缺省用条目在主数据源中的下标。 */
        itemKey?: (item: T, index: number) => string | number
        /** 进入页面时已选中的条目下标；只用于首次滚入视口，之后不再跟随。 */
        activeIndex?: number | null
    }>(),
    { gap: 8, padding: 12, columns: 1, minColumnWidth: 120, activeIndex: null },
)

defineSlots<{
    /**
     * @param props.item 当前条目
     * @param props.index 条目在主数据源中的下标（不是窗口内下标）
     * @param props.animate 是否播放交错入场动画：仅首屏、且未滚动时为 true
     * @param props.rowHeight 当前行高（px）；卡片用它做 minHeight 即可与同行等高
     */
    default: (props: { item: T; index: number; animate: boolean; rowHeight: number }) => unknown
}>()

/** 滚动宿主元素（reka-ui ScrollArea 的 viewport）。 */
const viewport = ref<HTMLElement | null>(null)
const sizerRef = useTemplateRef<HTMLElement>("sizer")

/** 可视窗口高度（px）。 */
const viewportHeight = ref(0)
/** 可视窗口宽度（px），仅 columns="auto" 时用于推算列数。 */
const viewportWidth = ref(0)
/** 窗口顶部所在行号（按行高量化，避免每个滚动事件都触发重渲染）。 */
const scrollRow = ref(0)
/** 用户是否滚动过：滚动过就不再重放入场动画，否则新挂载的卡片会边滚边淡入。 */
const hasScrolled = ref(false)
/** 实测行高（px），首帧后用于校正传入的估算值。 */
const measuredHeight = ref(0)

let viewportObserver: ResizeObserver | null = null
let activeScrollTimer: ReturnType<typeof setTimeout> | null = null
let remeasureTimer: ReturnType<typeof setTimeout> | null = null
let lastScrollRow = -1
/** 初始选中项是否已处理完；处理完（或错过窗口期）后不再自动滚动。 */
let activeScrollSettled = false

/** 行高：取传入估值与实测值中的较大者，实测偏大时不会重叠。 */
const rowHeight = computed(() => Math.max(props.itemHeight, measuredHeight.value))
/** 行高 + 行间距。 */
const rowStride = computed(() => rowHeight.value + props.gap)

/** 列数：固定值原样使用，auto 按容器宽度与最小列宽推算。 */
const columns = computed(() => {
    if (props.columns !== "auto") return Math.max(1, props.columns)
    const usable = viewportWidth.value - props.padding * 2
    if (usable <= 0) return 1
    return Math.max(1, Math.floor((usable + props.gap) / (props.minColumnWidth + props.gap)))
})

/** 总行数。 */
const rowCount = computed(() => Math.ceil(props.items.length / columns.value))

/** 内容高度（不含内边距）。 */
const contentHeight = computed(() => Math.max(0, rowCount.value * rowStride.value - props.gap))

/** 一屏能容纳的行数（至少一行）。 */
const visibleRowCount = computed(() => Math.max(1, Math.ceil(viewportHeight.value / rowStride.value) + 1))

/**
 * 窗口首行下标。
 * 上界按「最后一屏刚好铺满」钳制，数据变少（筛选）时不会停在空窗口上。
 */
const startRow = computed(() => {
    const maxStart = Math.max(0, rowCount.value - visibleRowCount.value)
    return Math.min(Math.max(0, scrollRow.value - OVERSCAN_ROWS), maxStart)
})

/** 窗口末行下标（开区间）。 */
const endRow = computed(() => {
    const maxStart = Math.max(0, rowCount.value - visibleRowCount.value)
    const anchor = Math.min(Math.max(0, scrollRow.value - OVERSCAN_ROWS), maxStart)
    return Math.min(rowCount.value, anchor + visibleRowCount.value + OVERSCAN_ROWS * 2)
})

/**
 * 首屏能容纳的条目数：多列网格下按列数放大，否则只有第一行播动画、
 * 同屏其余卡片直接落位（看起来的效果是「后面的比前面的更快出来」）。
 * 低于下限（极窄容器）时按下限给，保证单列列表的错峰效果。
 */
const enterAnimationLimit = computed(() => Math.max(ENTER_ANIMATION_MIN_ITEMS, visibleRowCount.value * columns.value))

/** 窗口内条目：切片后带上在主数据源中的绝对下标。 */
const windowEntries = computed(() => {
    const first = startRow.value * columns.value
    const last = Math.min(props.items.length, endRow.value * columns.value)
    const entries: { item: T; index: number; key: string | number; animate: boolean }[] = []
    for (let index = first; index < last; index++) {
        const item = props.items[index]
        if (item === undefined) continue
        entries.push({
            item,
            index,
            key: props.itemKey ? props.itemKey(item, index) : index,
            animate: !hasScrolled.value && index < enterAnimationLimit.value,
        })
    }
    return entries
})

/** 窗口整体的垂直位移：把窗口首行顶到它在完整列表中的真实位置。 */
const windowOffset = computed(() => startRow.value * rowStride.value)

/** 窗口容器：单列纵向排布，多列网格。 */
const windowStyle = computed(() => ({
    gap: `${props.gap}px`,
    transform: `translateY(${windowOffset.value}px)`,
    ...(columns.value > 1 ? { gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))` } : {}),
}))

/**
 * 把指定下标的条目滚入视口中心。
 * @param index 条目在主数据源中的下标
 * @param behavior 滚动行为，默认瞬时定位
 */
function scrollToIndex(index: number, behavior: ScrollBehavior = "auto"): void {
    const el = viewport.value
    if (!el || index < 0) return
    const row = Math.floor(index / columns.value)
    const centered = props.padding + row * rowStride.value - (el.clientHeight - rowHeight.value) / 2
    const maxTop = Math.max(0, contentHeight.value + props.padding * 2 - el.clientHeight)
    el.scrollTo({ top: Math.min(Math.max(centered, 0), maxTop), behavior })
    // 滚动事件是异步派发的，这里先同步一次窗口，保证目标条目当帧就已渲染
    handleScroll()
}

/**
 * 记录滚动位置；行号未变化时不写入响应式状态。
 */
function handleScroll(): void {
    const el = viewport.value
    if (!el) return
    if (el.scrollTop > 0) hasScrolled.value = true
    const row = Math.floor(Math.max(0, el.scrollTop - props.padding) / rowStride.value)
    if (row === lastScrollRow) return
    lastScrollRow = row
    scrollRow.value = row
}

/**
 * 首次进入时把初始选中项滚入视口。
 * 虚拟化后选中项不一定在 DOM 中，靠 DOM 查询定位的旧做法会失效。
 */
function scrollToActiveIndex(): void {
    if (activeScrollSettled) return
    const index = props.activeIndex
    if (index === null || index === undefined || index < 0 || index >= props.items.length) return
    const el = viewport.value
    if (!el) return
    activeScrollSettled = true
    // 与视口有交集就不动：否则用户点选列表项（常是贴边那张）时页面会自己跳一下。
    // 判定不能只看渲染窗口，窗口上下还挂着 overscan 行，落在其中的条目其实在视口外。
    const row = Math.floor(index / columns.value)
    const rowTop = props.padding + row * rowStride.value
    const overflowsViewport = rowTop < el.scrollTop + el.clientHeight && rowTop + rowHeight.value > el.scrollTop
    if (overflowsViewport) return
    scrollToIndex(index)
}

/**
 * 按已渲染卡片的实际高度校正行高。
 *
 * 必须读 getBoundingClientRect 的小数高度：卡片实际高度常带亚像素（实测 102.5px），
 * offsetHeight 会取整成 103，再乘上条目数就是几百像素的误差（585 条已达 292px），
 * 末尾会多出一段滚不完的空白。
 *
 * 取窗口内**最大值**而非均值：估值偏大只是末尾多留白，偏小会让最后几张卡滚不进视口。
 * 只在数据源变化后执行一次，滚动过程中不做测量，因此不会引入滚动期布局读取。
 */
function measureRowHeight(): void {
    const rows = sizerRef.value?.firstElementChild
    if (!rows) return
    let max = 0
    for (const child of Array.from(rows.children)) {
        max = Math.max(max, (child as HTMLElement).getBoundingClientRect().height)
    }
    if (max > measuredHeight.value) measuredHeight.value = max
}

/**
 * 重新量取行高：先清空实测值让卡片回落，再量真实高度。
 *
 * 卡片自然高度会随窗口宽度（文本换行）与列表形态（例如切换卡片样式）变化，必须允许比上次更小；
 * 上面的累积式测量只增不减，因此这里复位后重量，而不是沿用旧值。
 */
async function remeasureRowHeight(): Promise<void> {
    measuredHeight.value = 0
    await nextTick()
    measureRowHeight()
}

/** 防抖地重新量取行高：面板拖动/窗口缩放会连续触发尺寸变化，只在停下后量一次。 */
function scheduleRemeasure(): void {
    if (remeasureTimer) clearTimeout(remeasureTimer)
    remeasureTimer = setTimeout(() => void remeasureRowHeight(), REMEASURE_DEBOUNCE_MS)
}

/**
 * 接管 ScrollArea 暴露的 viewport：同步尺寸、监听滚动与尺寸变化。
 * @param el 滚动宿主元素
 */
function onViewportRef(el: HTMLElement): void {
    viewport.value = el
    viewportHeight.value = el.clientHeight
    viewportWidth.value = el.clientWidth
    el.addEventListener("scroll", handleScroll, { passive: true })
    if (typeof ResizeObserver !== "undefined") {
        viewportObserver = new ResizeObserver(() => {
            const widthChanged = el.clientWidth !== viewportWidth.value
            viewportHeight.value = el.clientHeight
            viewportWidth.value = el.clientWidth
            // 行高只跟宽度有关（换行与列数都随宽度变）；高度变化不必重量
            if (widthChanged) scheduleRemeasure()
        })
        viewportObserver.observe(el)
    }
    void nextTick(() => {
        measureRowHeight()
        scrollToActiveIndex()
    })
}

watch(
    () => props.items,
    () => void nextTick(measureRowHeight),
)

watch(
    () => props.itemHeight,
    () => {
        // 估值变化意味着列表形态换了（例如切到另一种卡片高度），旧实测值不再适用
        void remeasureRowHeight()
    },
)

watch(
    () => props.activeIndex,
    () => void nextTick(scrollToActiveIndex),
)

onMounted(() => {
    activeScrollTimer = setTimeout(() => {
        activeScrollSettled = true
    }, ACTIVE_SCROLL_WINDOW_MS)
})

onBeforeUnmount(() => {
    viewportObserver?.disconnect()
    viewport.value?.removeEventListener("scroll", handleScroll)
    if (activeScrollTimer) clearTimeout(activeScrollTimer)
    if (remeasureTimer) clearTimeout(remeasureTimer)
})

defineExpose({ scrollToIndex })
</script>

<template>
    <ScrollArea @loadref="onViewportRef">
        <!--
            高度承载层：撑出与完整列表一致的滚动高度。
            内边距写在这里，且 height 需按 border-box 连同内边距一起算进去。
        -->
        <div
            ref="sizer"
            class="relative"
            :style="{ height: `${contentHeight + padding * 2}px`, padding: `${padding}px` }"
        >
            <div :class="columns > 1 ? 'grid' : 'flex flex-col'" :style="windowStyle">
                <template v-for="entry in windowEntries" :key="entry.key">
                    <slot :item="entry.item" :index="entry.index" :animate="entry.animate" :row-height="rowHeight" />
                </template>
            </div>
        </div>
    </ScrollArea>
</template>
