<script setup lang="ts">
import * as echarts from "echarts"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import type { IconTypes } from "@/components/Icon.vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { formatBigNumber, formatExpressionValue } from "@/util"
import { type LabeledVector } from "@/utils/nodeEditorBuild"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const element = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let observer: ResizeObserver | null = null

const CHART_TYPES: { type: "line" | "bar"; label: string; icon: IconTypes }[] = [
    { type: "line", label: "折线", icon: "ri:line-chart-line" },
    { type: "bar", label: "柱状", icon: "ri:bar-chart-line" },
]

const vector = computed<LabeledVector | undefined>(() => props.data.chartVector)
const chartType = computed<"line" | "bar">(() => (props.data.chartType === "bar" ? "bar" : "line"))

/** 图表数值展示：大数走紧凑单位，小数保留有效位 */
function formatValue(value: number) {
    return Math.abs(value) >= 1e5 ? formatBigNumber(value, 4) : formatExpressionValue(value)
}

const option = computed<echarts.EChartsOption>(() => {
    const source = vector.value
    const labels = source?.labels ?? []
    const values = source?.values ?? []
    const type = chartType.value
    return {
        animation: false,
        grid: { left: 6, right: 10, top: 12, bottom: 4, containLabel: true },
        tooltip: {
            trigger: "axis",
            confine: true,
            backgroundColor: "rgba(24, 24, 27, 0.92)",
            borderWidth: 0,
            padding: [6, 8],
            textStyle: { color: "#f4f4f5", fontSize: 11 },
            formatter: (params: unknown) => {
                const first = (Array.isArray(params) ? params[0] : params) as { axisValueLabel?: string; value?: number } | undefined
                const value = typeof first?.value === "number" ? first.value : 0
                return `${first?.axisValueLabel ?? ""}<br/>${source?.valueLabel ?? "值"}: ${formatValue(value)}`
            },
        },
        xAxis: {
            type: "category",
            data: labels,
            boundaryGap: type === "bar",
            axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.35)" } },
            axisTick: { show: false },
            axisLabel: {
                color: "#a1a1aa",
                fontSize: 9,
                hideOverlap: true,
                rotate: labels.length > 6 ? 30 : 0,
            },
        },
        yAxis: {
            type: "value",
            scale: type === "line" && values.length > 1,
            axisLabel: { color: "#a1a1aa", fontSize: 9, formatter: (value: number) => formatValue(value) },
            splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.14)" } },
        },
        series: [
            {
                name: source?.title ?? "数值",
                type,
                data: values,
                smooth: type === "line",
                showSymbol: type === "line" && values.length <= 24,
                symbolSize: 4,
                lineStyle: { width: 1.5, color: "#60a5fa" },
                itemStyle: { color: "#60a5fa" },
                areaStyle: type === "line" ? { color: "rgba(96, 165, 250, 0.12)" } : undefined,
                barMaxWidth: 18,
            },
        ],
    }
})

function disposeChart() {
    observer?.disconnect()
    observer = null
    chart?.dispose()
    chart = null
}

/** 初始化画布；节点折叠后元素被移除，展开时需要重新挂载 */
function mountChart() {
    disposeChart()
    if (!element.value) return
    chart = echarts.init(element.value)
    chart.setOption(option.value, { notMerge: true })
    observer = new ResizeObserver(() => chart?.resize())
    observer.observe(element.value)
}

function setChartType(type: "line" | "bar") {
    if (type === chartType.value) return
    store.updateNodeData(props.id, { chartType: type })
}

// 元素随节点折叠/展开出现或消失，统一由 watch 负责挂载与销毁
watch(element, mountChart, { flush: "post" })
watch(option, value => chart?.setOption(value, { notMerge: true }))
onBeforeUnmount(disposeChart)
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-88 max-w-full space-y-1.5">
            <div class="flex items-center gap-1.5">
                <span class="min-w-0 flex-1 truncate text-[11px] font-semibold text-base-content/70" :title="vector?.title">
                    {{ vector?.title || data.label || "图表" }}
                </span>
                <span v-if="vector?.valueLabel" class="shrink-0 text-[10px] text-base-content/40">{{ vector.valueLabel }}</span>
                <div class="flex shrink-0 items-center gap-0.5">
                    <button
                        v-for="item in CHART_TYPES"
                        :key="item.type"
                        type="button"
                        class="flex h-5 cursor-pointer items-center gap-0.5 border px-1 text-[10px] transition-colors duration-150"
                        :class="
                            chartType === item.type
                                ? 'border-primary/50 bg-primary/10 text-primary'
                                : 'border-base-content/10 text-base-content/45 hover:border-base-content/25 hover:text-base-content/70'
                        "
                        @click="setChartType(item.type)"
                    >
                        <Icon :icon="item.icon" class="size-3" />
                        {{ item.label }}
                    </button>
                </div>
            </div>
            <div class="relative">
                <div ref="element" class="nodrag nowheel w-full" style="height: 170px" />
                <div
                    v-if="!vector"
                    class="pointer-events-none absolute inset-0 grid place-items-center text-[10px] text-base-content/40"
                >
                    连接向量输入以绘制图表
                </div>
            </div>
        </div>
    </BaseNode>
</template>
