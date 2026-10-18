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
 * 计算背水收益系数。
 * @param hpPercent 血量百分比
 * @returns 背水收益系数
 */
function calculateDesperateCoefficient(hpPercent: number): number {
    const clampedHpPercent = Math.max(0.25, Math.min(1, hpPercent))
    return 4 * (1 - clampedHpPercent) * (1.5 - clampedHpPercent)
}

/**
 * 计算昂扬收益系数。
 * @param hpPercent 血量百分比
 * @returns 昂扬收益系数
 */
function calculateBoostCoefficient(hpPercent: number): number {
    const clampedHpPercent = Math.max(0, Math.min(1, hpPercent))
    return clampedHpPercent
}

/**
 * 计算当前输入对应的总权重。
 * @returns 总权重
 */
const totalWeight = computed(() => Math.max(0, props.desperate * 3 + props.boost))

const chartPointCount = 100

/**
 * 计算某个转换比下的最高收益倍率与最高点血量百分比。
 * @param conversionRatio 转换比，0 表示全昂扬，1 表示全背水
 * @returns 最高收益倍率与最高点血量百分比
 */
function calculateHighestPointByRatio(conversionRatio: number): { value: number; hpPercent: number } {
    const weight = totalWeight.value
    const desperateWeight = (weight / 3) * conversionRatio
    const boostWeight = weight * (1 - conversionRatio)
    let maxValue = 1
    let maxHpPercent = 100

    for (let i = 0; i <= 100; i++) {
        const hpPercent = i / 100
        const desperateCoefficient = calculateDesperateCoefficient(hpPercent)
        const boostCoefficient = calculateBoostCoefficient(hpPercent)
        const value = (1 + desperateCoefficient * desperateWeight) * (1 + boostCoefficient * boostWeight)

        if (value > maxValue || (Math.abs(value - maxValue) < 1e-9 && hpPercent * 100 > maxHpPercent)) {
            maxValue = value
            maxHpPercent = hpPercent * 100
        }
    }

    return {
        value: maxValue,
        hpPercent: maxHpPercent,
    }
}

const chartData = computed(() => {
    const conversionValues: number[] = []
    const highestValues: number[] = []
    const highestHpPercents: number[] = []
    let maxValue = 1

    for (let index = 0; index <= chartPointCount; index++) {
        const conversionRatio = index / chartPointCount
        const highestPoint = calculateHighestPointByRatio(conversionRatio)

        conversionValues.push(Number(conversionRatio.toFixed(4)))
        highestValues.push(Number(highestPoint.value.toFixed(4)))
        highestHpPercents.push(Number(highestPoint.hpPercent.toFixed(2)))
        maxValue = Math.max(maxValue, highestPoint.value)
    }

    return {
        conversionValues,
        highestValues,
        highestHpPercents,
        maxValue: Math.ceil(maxValue * 5) / 5,
    }
})

/**
 * 计算当前输入对应的转换比。
 * @returns 当前转换比
 */
const currentConversionRatio = computed(() => {
    if (totalWeight.value <= 0) {
        return 0
    }

    return Math.max(0, Math.min(1, (props.desperate * 3) / totalWeight.value))
})

/**
 * 计算当前输入在曲线上的标记点。
 * @returns 当前点位
 */
const currentPoint = computed(() => calculateHighestPointByRatio(currentConversionRatio.value))

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
            data: ["最高收益曲线", "最高点血量"],
        },
        tooltip: {
            trigger: "axis",
            axisPointer: {
                type: "line",
            },
            formatter: params => {
                const pointList = Array.isArray(params) ? params : [params]
                const point = pointList[0]

                if (!point || !Array.isArray(point.value)) {
                    return ""
                }

                const conversionRatio = Number(point.value[0])
                const desperateValue = (totalWeight.value / 3) * conversionRatio
                const boostValue = totalWeight.value * (1 - conversionRatio)
                const highestHpPoint = pointList.find(item => item.seriesName === "最高点血量")
                const highestHpText =
                    highestHpPoint && Array.isArray(highestHpPoint.value) ? `${Number(highestHpPoint.value[1]).toFixed(2)}%` : "--"

                return [
                    `转换比: ${conversionRatio.toFixed(2)}`,
                    `背水: ${(desperateValue * 100).toFixed(1)}%`,
                    `昂扬: ${(boostValue * 100).toFixed(1)}%`,
                    `收益倍数: ${Number(point.value[1]).toFixed(3)}`,
                    `最高点血量: ${highestHpText}`,
                ].join("<br/>")
            },
        },
        xAxis: {
            type: "value",
            name: "转换比",
            nameLocation: "center",
            nameGap: 18,
            min: 0,
            max: 1,
            splitNumber: 5,
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
        yAxis: [
            {
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
            {
                type: "value",
                name: "最高点血量 (%)",
                nameLocation: "middle",
                nameRotate: 90,
                nameGap: 18,
                min: 0,
                max: 100,
                scale: true,
                position: "right",
                axisLabel: {
                    margin: 6,
                    hideOverlap: false,
                    showMinLabel: true,
                    showMaxLabel: true,
                    formatter: value => Number(value).toFixed(0),
                },
                splitLine: {
                    show: false,
                },
            },
        ],
        series: [
            {
                name: "最高收益曲线",
                type: "line",
                showSymbol: false,
                smooth: true,
                data: chartData.value.conversionValues.map((conversion, index) => [conversion, chartData.value.highestValues[index]]),
                lineStyle: {
                    width: 2,
                    color: "#2ed573",
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
                            name: "当前",
                            value: Number(currentPoint.value.value.toFixed(3)),
                            xAxis: currentConversionRatio.value,
                            yAxis: currentPoint.value.value,
                        },
                    ],
                },
                emphasis: {
                    focus: "series",
                },
            },
            {
                name: "最高点血量",
                type: "line",
                yAxisIndex: 1,
                showSymbol: false,
                smooth: true,
                data: chartData.value.conversionValues.map((conversion, index) => [conversion, chartData.value.highestHpPercents[index]]),
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
