<script setup lang="ts">
import { computed, ref } from "vue"

// 组件属性定义
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
        width: 800,
        height: 400,
    }
)

// 计算SVG画布尺寸
const padding = 50
const chartWidth = props.width - 2 * padding
const chartHeight = props.height - 2 * padding

// 响应式数据
const isHovering = ref(false)
const hoverX = ref(0)
const hoverY = ref(0)
const hoverHpPercent = ref(0)
const hoverDesperateValue = ref(0)
const hoverBoostValue = ref(0)
const hoverTotalValue = ref(0)
const tooltipX = ref(0)
const tooltipY = ref(0)

/**
 * 处理鼠标移动事件
 * @param event 鼠标事件
 */
const handleMouseMove = (event: MouseEvent) => {
    const svgElement = event.currentTarget as SVGElement
    // 处理缩放
    const parentRect = svgElement.parentElement!.getBoundingClientRect()
    const x = ((event.clientX - parentRect.left) / parentRect.width) * props.width
    const y = ((event.clientY - parentRect.top) / parentRect.height) * props.height

    // 计算鼠标位置对应的血量百分比
    const hpPercent = Math.max(0, Math.min(1, (x - padding) / chartWidth))

    // 计算对应的收益值
    const desperateValue = calculateDesperateMultiplier(hpPercent)
    const boostValue = calculateBoostMultiplier(hpPercent)
    const totalValue = calculateTotalMultiplier(hpPercent)

    // 计算工具提示的位置，确保不会超出图表的有效区域边界
    // 图表的有效区域是从 padding 到 padding + chartWidth（水平方向）和从 padding 到 padding + chartHeight（垂直方向）
    let calculatedTooltipX = x + 10
    if (calculatedTooltipX + 150 > padding + chartWidth) {
        calculatedTooltipX = x - 160
    }
    // 确保工具提示不会超出左侧边界
    calculatedTooltipX = Math.max(padding, calculatedTooltipX)

    let calculatedTooltipY = padding + 20
    if (calculatedTooltipY + 80 > padding + chartHeight) {
        calculatedTooltipY = padding + chartHeight - 90
    }
    // 确保工具提示不会超出顶部边界
    calculatedTooltipY = Math.max(padding, calculatedTooltipY)

    // 确保 hoverX 值被限制在图表的有效区域内
    const boundedHoverX = Math.max(padding, Math.min(padding + chartWidth, x))

    // 更新响应式数据
    isHovering.value = true
    hoverX.value = boundedHoverX
    hoverY.value = y
    hoverHpPercent.value = hpPercent
    hoverDesperateValue.value = desperateValue
    hoverBoostValue.value = boostValue
    hoverTotalValue.value = totalValue
    tooltipX.value = calculatedTooltipX
    tooltipY.value = calculatedTooltipY
}

/**
 * 处理鼠标离开事件
 */
const handleMouseLeave = () => {
    isHovering.value = false
}

/**
 * 计算总计收益
 * @param hpPercent 血量百分比 (0-1)
 * @returns 总计收益倍数（背水 × 昂扬）
 */
const calculateTotalMultiplier = (hpPercent: number): number => {
    return calculateDesperateMultiplier(hpPercent) * calculateBoostMultiplier(hpPercent)
}

/**
 * 计算最大收益倍数，用于动态调整y轴范围
 */
const maxMultiplier = computed(() => {
    let maxValue = 1.0
    const steps = 100

    // 计算背水的最大收益
    {
        const multiplier = calculateDesperateMultiplier(0)
        if (multiplier > maxValue) {
            maxValue = multiplier
        }
    }

    // 计算昂扬的最大收益
    {
        const multiplier = calculateBoostMultiplier(1)
        if (multiplier > maxValue) {
            maxValue = multiplier
        }
    }

    // 计算总计的最大收益
    for (let i = 0; i <= steps; i++) {
        const hpPercent = i / steps
        const multiplier = calculateTotalMultiplier(hpPercent)
        if (multiplier > maxValue) {
            maxValue = multiplier
        }
    }

    // 向上取整到最近的0.2，确保有足够的空间
    return Math.ceil(maxValue * 5) / 5
})

/**
 * 生成y轴标签数据
 */
const yAxisLabels = computed(() => {
    const labels = []
    const step = (maxMultiplier.value - 1) / 6 // 生成6个标签

    for (let i = 0; i <= 6; i++) {
        const value = 1 + i * step
        labels.push(value.toFixed(1))
    }

    return labels
})

/**
 * 生成水平网格线的y坐标
 */
const gridLinesY = computed(() => {
    const lines = []
    const step = (maxMultiplier.value - 1) / 6 // 生成6条网格线

    for (let i = 0; i <= 6; i++) {
        const value = 1 + i * step
        const y = padding + chartHeight - (value - 1) * (chartHeight / (maxMultiplier.value - 1))
        lines.push(y)
    }

    return lines
})

/**
 * 计算背水收益
 * @param hpPercent 血量百分比 (0-1)
 * @returns 背水收益倍数
 */
const calculateDesperateMultiplier = (hpPercent: number): number => {
    const desperate = props.desperate
    const clampedHpPercent = Math.max(0.25, Math.min(1, hpPercent))
    return 1 + 4 * desperate * (1 - clampedHpPercent) * (1.5 - clampedHpPercent)
}

/**
 * 计算昂扬收益
 * @param hpPercent 血量百分比 (0-1)
 * @returns 昂扬收益倍数
 */
const calculateBoostMultiplier = (hpPercent: number): number => {
    const boost = props.boost
    const clampedHpPercent = Math.max(0, Math.min(1, hpPercent))
    return 1 + boost * clampedHpPercent
}

/**
 * 生成背水曲线路径
 */
const desperatePath = computed(() => {
    let path = ""
    const steps = 100
    if (maxMultiplier.value === 1) return ""

    for (let i = 0; i <= steps; i++) {
        const hpPercent = i / steps
        const multiplier = calculateDesperateMultiplier(hpPercent)
        const x = padding + hpPercent * 100 * (chartWidth / 100) // 100% 是因为血量从0到100%显示
        const y = padding + chartHeight - (multiplier - 1) * (chartHeight / (maxMultiplier.value - 1)) // 使用动态计算的最大收益倍数

        if (i === 0) {
            path += `M ${x} ${y}`
        } else {
            path += ` L ${x} ${y}`
        }
    }

    return path
})

/**
 * 生成昂扬曲线路径
 */
const boostPath = computed(() => {
    let path = ""
    const steps = 100
    if (maxMultiplier.value === 1) return ""

    for (let i = 0; i <= steps; i++) {
        const hpPercent = i / steps
        const multiplier = calculateBoostMultiplier(hpPercent)
        const x = padding + hpPercent * 100 * (chartWidth / 100) // 100% 是因为血量从0到100%显示
        const y = padding + chartHeight - (multiplier - 1) * (chartHeight / (maxMultiplier.value - 1)) // 使用动态计算的最大收益倍数

        if (i === 0) {
            path += `M ${x} ${y}`
        } else {
            path += ` L ${x} ${y}`
        }
    }

    return path
})

/**
 * 生成总计曲线路径
 */
const totalPath = computed(() => {
    let path = ""
    const steps = 100
    if (maxMultiplier.value === 1) return ""

    for (let i = 0; i <= steps; i++) {
        const hpPercent = i / steps
        const multiplier = calculateTotalMultiplier(hpPercent)
        const x = padding + hpPercent * 100 * (chartWidth / 100) // 100% 是因为血量从0到100%显示
        // 防止0除错误
        const ratio = multiplier === maxMultiplier.value ? 1 : (multiplier - 1) / (maxMultiplier.value - 1)
        const y = padding + chartHeight - ratio * chartHeight // 使用动态计算的最大收益倍数

        if (i === 0) {
            path += `M ${x} ${y}`
        } else {
            path += ` L ${x} ${y}`
        }
    }

    return path
})
</script>
<template>
    <div class="w-full h-full overflow-hidden" id="char-hp-curve">
        <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" xmlns="http://www.w3.org/2000/svg"
            class="w-full h-full" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
            <!-- 网格线 -->
            <g class="grid">
                <!-- 水平网格线 -->
                <template v-for="(y, index) in gridLinesY" :key="`horizontal-${index}`">
                    <line :x1="padding" :y1="y" :x2="padding + chartWidth" :y2="y" stroke="#e0e0e0" stroke-width="1" />
                </template>

                <!-- 垂直网格线 -->
                <template v-for="(percent, index) in [0, 20, 40, 60, 80, 100]" :key="`vertical-${index}`">
                    <line :x1="padding + (percent / 100) * chartWidth" :y1="padding"
                        :x2="padding + (percent / 100) * chartWidth" :y2="padding + chartHeight" stroke="#e0e0e0"
                        stroke-width="1" />
                </template>
            </g>

            <!-- 坐标轴标签 -->
            <g class="axis-labels">
                <text :x="props.width / 2" :y="props.height - 10" text-anchor="middle" font-size="12" fill="#666">血量百分比
                    (%)</text>
                <text x="16" y="200" text-anchor="middle" font-size="12" fill="#666"
                    transform="rotate(-90, 20, 200)">收益倍数</text>
                <template v-for="(percent, index) in [0, 20, 40, 60, 80, 100]" :key="`label-${index}`">
                    <text :x="padding + (percent / 100) * chartWidth" :y="padding + chartHeight + 20"
                        text-anchor="middle" font-size="10" fill="#999">
                        {{ percent }}
                    </text>
                </template>
                <template v-for="(label, index) in yAxisLabels" :key="index">
                    <text :x="30"
                        :y="padding + chartHeight - (parseFloat(label) - 1) * (chartHeight / (maxMultiplier - 1))"
                        text-anchor="end" font-size="10" fill="#999">
                        {{ label }}
                    </text>
                </template>
            </g>

            <!-- 背水曲线 -->
            <path :d="desperatePath" fill="none" stroke="#ff4757" stroke-width="2" stroke-linecap="round" />

            <!-- 昂扬曲线 -->
            <path :d="boostPath" fill="none" stroke="#3742fa" stroke-width="2" stroke-linecap="round" />

            <!-- 总计曲线 -->
            <path :d="totalPath" fill="none" stroke="#2ed573" stroke-width="2" stroke-linecap="round"
                stroke-dasharray="5,5" />

            <!-- 鼠标悬停垂直线 -->
            <line v-if="isHovering" :x1="hoverX" :y1="padding" :x2="hoverX" :y2="padding + chartHeight" stroke="#3498db"
                stroke-width="1" stroke-dasharray="2,2" />

            <!-- 工具提示 -->
            <g v-if="isHovering">
                <!-- 工具提示背景 -->
                <rect :x="tooltipX - 10" :y="tooltipY - 20" width="150" height="90" rx="4" ry="4"
                    fill="rgba(255, 255, 255, 0.5)" stroke="#e0e0e0" stroke-width="1" />
                <!-- 背水数值 -->
                <text :x="tooltipX" :y="tooltipY" font-size="12" fill="#ff4757">背水: {{ hoverDesperateValue.toFixed(3)
                }}</text>
                <!-- 昂扬数值 -->
                <text :x="tooltipX" :y="tooltipY + 20" font-size="12" fill="#3742fa">昂扬: {{ hoverBoostValue.toFixed(3)
                }}</text>
                <!-- 总计数值 -->
                <text :x="tooltipX" :y="tooltipY + 40" font-size="12" fill="#2ed573">总计: {{ hoverTotalValue.toFixed(3)
                }}</text>
                <!-- 血量百分比 -->
                <text :x="tooltipX" :y="tooltipY + 60" font-size="12" fill="#333">血量: {{ (hoverHpPercent *
                    100).toFixed(1)
                }}%</text>
            </g>

            <!-- 图例 -->
            <g class="legend">
                <!-- 动态计算图例位置，确保在不同宽度的图表中都能正确显示 -->
                <line :x1="padding + chartWidth - 150" :y1="padding + 10" :x2="padding + chartWidth - 120"
                    :y2="padding + 10" stroke="#ff4757" stroke-width="2" />
                <text :x="padding + chartWidth - 110" :y="padding + 15" font-size="12" fill="#333">背水</text>
                <line :x1="padding + chartWidth - 150" :y1="padding + 30" :x2="padding + chartWidth - 120"
                    :y2="padding + 30" stroke="#3742fa" stroke-width="2" />
                <text :x="padding + chartWidth - 110" :y="padding + 35" font-size="12" fill="#333">昂扬</text>
                <line :x1="padding + chartWidth - 150" :y1="padding + 50" :x2="padding + chartWidth - 120"
                    :y2="padding + 50" stroke="#2ed573" stroke-width="2" />
                <text :x="padding + chartWidth - 110" :y="padding + 55" font-size="12" fill="#333">总计</text>
            </g>
        </svg>
    </div>
</template>
