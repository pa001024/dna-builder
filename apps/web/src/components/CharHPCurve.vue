<script setup lang="ts">
import * as echarts from "echarts"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"

const props = withDefaults(
    defineProps<{
        /** 背水值 */
        desperate: number
        /** 昂扬值 */
        boost: number
        /** 图表宽度 */
        width?: number
        /** 图表高度 */
        height?: number
    }>(),
    {
        height: 400,
    }
)

const chartRef = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

/**
 * 计算背水收益倍率。
 * @param hpPercent 血量百分比
 * @returns 背水收益倍率
 */
function calculateDesperateMultiplier(hpPercent: number): number {
    const clampedHpPercent = Math.max(0.25, Math.min(1, hpPercent))
    return 1 + 4 * props.desperate * (1 - clampedHpPercent) * (1.5 - clampedHpPercent)
}

/**
 * 计算昂扬收益倍率。
 * @param hpPercent 血量百分比
 * @returns 昂扬收益倍率
 */
function calculateBoostMultiplier(hpPercent: number): number {
    const clampedHpPercent = Math.max(0, Math.min(1, hpPercent))
    return 1 + props.boost * clampedHpPercent
}

/**
 * 计算总计收益倍率。
 * @param hpPercent 血量百分比
 * @returns 总计收益倍率
 */
function calculateTotalMultiplier(hpPercent: number): number {
    return calculateDesperateMultiplier(hpPercent) * calculateBoostMultiplier(hpPercent)
}

const chartData = computed(() => {
    const hpValues: number[] = []
    const desperateValues: number[] = []
    const boostValues: number[] = []
    const totalValues: number[] = []
    let maxValue = 1

    for (let i = 0; i <= 100; i++) {
        const hpPercent = i / 100
        const desperate = calculateDesperateMultiplier(hpPercent)
        const boost = calculateBoostMultiplier(hpPercent)
        const total = calculateTotalMultiplier(hpPercent)

        hpValues.push(i)
        desperateValues.push(Number(desperate.toFixed(4)))
        boostValues.push(Number(boost.toFixed(4)))
        totalValues.push(Number(total.toFixed(4)))
        maxValue = Math.max(maxValue, desperate, boost, total)
    }

    return {
        hpValues,
        desperateValues,
        boostValues,
        totalValues,
        maxValue: Math.ceil(maxValue * 5) / 5,
    }
})

const totalExtremePoint = computed(() => {
    let maxIndex = 0
    let maxValue = chartData.value.totalValues[0] ?? 0

    chartData.value.totalValues.forEach((value, index) => {
        if (value > maxValue) {
            maxValue = value
            maxIndex = index
        }
    })

    return {
        hp: chartData.value.hpValues[maxIndex] ?? 0,
        value: maxValue,
    }
})

const chartOption = computed<echarts.EChartsOption>(() => {
    return {
        animation: false,
        grid: {
            left: 44,
            right: 20,
            top: 24,
            bottom: 40,
            containLabel: true,
        },
        legend: {
            top: 4,
            data: ["背水", "昂扬", "总计"],
        },
        tooltip: {
            trigger: "axis",
            axisPointer: {
                type: "line",
            },
            valueFormatter: value => (typeof value === "number" ? value.toFixed(3) : String(value)),
        },
        xAxis: {
            type: "value",
            name: "血量百分比 (%)",
            nameLocation: "center",
            nameGap: 18,
            min: 0,
            max: 100,
            interval: 20,
            axisLabel: {
                margin: 6,
                hideOverlap: false,
                showMinLabel: true,
                showMaxLabel: true,
                formatter: value => `${Number(value)}`,
            },
            splitLine: {
                show: true,
                lineStyle: {
                    color: "#e0e0e0",
                },
            },
        },
        yAxis: {
            type: "value",
            name: "收益倍数",
            nameLocation: "middle",
            nameRotate: 90,
            nameGap: 18,
            min: 1,
            max: chartData.value.maxValue + 0.2,
            scale: true,
            axisLabel: {
                margin: 6,
                hideOverlap: false,
                showMinLabel: true,
                showMaxLabel: true,
                formatter: value => Number(value).toFixed(1),
            },
            splitLine: {
                show: true,
                lineStyle: {
                    color: "#e0e0e0",
                },
            },
        },
        series: [
            {
                name: "背水",
                type: "line",
                showSymbol: false,
                smooth: true,
                data: chartData.value.hpValues.map((hp, index) => [hp, chartData.value.desperateValues[index]]),
                lineStyle: {
                    width: 2,
                    color: "#ff4757",
                },
                itemStyle: {
                    color: "#ff4757",
                },
                emphasis: {
                    focus: "series",
                },
            },
            {
                name: "昂扬",
                type: "line",
                showSymbol: false,
                smooth: true,
                data: chartData.value.hpValues.map((hp, index) => [hp, chartData.value.boostValues[index]]),
                lineStyle: {
                    width: 2,
                    color: "#3742fa",
                },
                itemStyle: {
                    color: "#3742fa",
                },
                emphasis: {
                    focus: "series",
                },
            },
            {
                name: "总计",
                type: "line",
                showSymbol: false,
                smooth: true,
                data: chartData.value.hpValues.map((hp, index) => [hp, chartData.value.totalValues[index]]),
                lineStyle: {
                    width: 2,
                    color: "#2ed573",
                    type: "dashed",
                },
                itemStyle: {
                    color: "#2ed573",
                },
                markPoint: {
                    symbol: "pin",
                    symbolSize: 52,
                    label: {
                        formatter: "{b}\n{c}",
                        color: "#fff",
                    },
                    itemStyle: {
                        color: "#16a34a",
                    },
                    data: [
                        {
                            name: "极值点",
                            value: Number(totalExtremePoint.value.value.toFixed(3)),
                            xAxis: totalExtremePoint.value.hp,
                            yAxis: totalExtremePoint.value.value,
                        },
                    ],
                },
                emphasis: {
                    focus: "series",
                },
            },
        ],
    }
})

/**
 * 重绘图表。
 */
function renderChart(): void {
    if (!chartRef.value) {
        return
    }

    if (!chartInstance) {
        chartInstance = echarts.init(chartRef.value)
    }

    chartInstance.setOption(chartOption.value, { notMerge: true })
    chartInstance.resize()
}

/**
 * 处理图表尺寸变化。
 */
function handleResize(): void {
    chartInstance?.resize()
}

watch(
    chartOption,
    async () => {
        await nextTick()
        renderChart()
    },
    { immediate: true }
)

onMounted(() => {
    window.addEventListener("resize", handleResize)

    if (chartRef.value && "ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(() => {
            chartInstance?.resize()
        })
        resizeObserver.observe(chartRef.value)
    }

    renderChart()
})

onUnmounted(() => {
    window.removeEventListener("resize", handleResize)
    resizeObserver?.disconnect()
    resizeObserver = null
    chartInstance?.dispose()
    chartInstance = null
})
</script>

<template>
    <div class="w-full overflow-hidden">
        <div ref="chartRef" :style="{ height: `${props.height}px` }" class="w-full"></div>
    </div>
</template>
