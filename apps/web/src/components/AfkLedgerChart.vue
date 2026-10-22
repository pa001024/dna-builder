<script setup lang="ts">
/**
 * 狩月账本的 ECharts 容器：负责初始化、尺寸跟随、交互状态保持与销毁。
 *
 * 数据更新走合并模式（不清空图表）：实时掉落会在悬停时不断刷新 option，
 * 若每次 notMerge 重设，tooltip 会被关掉、图例勾选会被重置，看起来像图表闪掉。
 */

import * as echarts from "echarts"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"

const props = defineProps<{
    /** 完整的 ECharts 配置 */
    option: echarts.EChartsOption
    /** 容器高度，默认 220px */
    height?: string
}>()

const emit = defineEmits<{
    /** 点击某一格数据（柱子/折线上的点），参数为类目下标 */
    select: [index: number]
}>()

const element = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let observer: ResizeObserver | null = null
/** 最近一次画布尺寸，避免重复 resize 引发无谓重绘 */
let size = { width: 0, height: 0 }
/** 鼠标当前指向的类目下标；离开图表后清空 */
let hoverIndex: number | null = null

/**
 * 取 option 里的类目数量，用于校验重放 tooltip 时的下标。
 * @param option 图表配置
 * @returns 类目数
 */
function categoryCount(option: echarts.EChartsOption) {
    const axis = option.xAxis
    const first = Array.isArray(axis) ? axis[0] : axis
    const data = first && "data" in first ? first.data : undefined
    return Array.isArray(data) ? data.length : 0
}

/**
 * 应用新配置：合并而非整图替换，并恢复悬停中的 tooltip。
 * @param option 图表配置
 */
function apply(option: echarts.EChartsOption) {
    if (!chart) return
    chart.setOption(option)
    const total = categoryCount(option)
    if (hoverIndex === null || total === 0) return
    const index = Math.min(hoverIndex, total - 1)
    chart.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: index })
}

onMounted(() => {
    if (!element.value) return
    chart = echarts.init(element.value)
    apply(props.option)

    // 记录悬停的类目：实时数据刷新后据此重新唤起 tooltip，鼠标不动也不会闪
    chart.on("updateAxisPointer", event => {
        const info = (event as { axesInfo?: { value?: unknown }[] }).axesInfo?.[0]
        hoverIndex = typeof info?.value === "number" ? info.value : null
    })
    chart.getZr().on("globalout", () => {
        hoverIndex = null
    })
    // 柱子带圆角时 zrender 的命中区域不稳，直接按像素反查类目：
    // 点在同一时段的任意高度都算命中，比只点中柱体更容易操作
    chart.getZr().on("click", event => {
        if (!chart) return
        const local = chart.convertFromPixel({ seriesIndex: 0 }, [event.offsetX, event.offsetY]) as number[]
        if (!Array.isArray(local) || !Number.isFinite(local[0])) return
        const index = Math.round(local[0])
        if (index < 0 || index >= categoryCount(props.option)) return
        emit("select", index)
    })

    observer = new ResizeObserver(entries => {
        const rect = entries[0]?.contentRect
        if (!rect) return
        const width = Math.round(rect.width)
        const height = Math.round(rect.height)
        if (width === size.width && height === size.height) return
        size = { width, height }
        chart?.resize()
    })
    observer.observe(element.value)
    const rect = element.value.getBoundingClientRect()
    size = { width: Math.round(rect.width), height: Math.round(rect.height) }
})

watch(
    () => props.option,
    option => apply(option)
)

onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    chart?.dispose()
    chart = null
    hoverIndex = null
})
</script>

<template>
    <!-- overflow-hidden：tooltip 贴边时不能把滚动容器撑出横向滚动条，否则宽度回跳会触发 resize 抖动 -->
    <div ref="element" class="overflow-hidden" :style="{ height: height ?? '220px' }" />
</template>
