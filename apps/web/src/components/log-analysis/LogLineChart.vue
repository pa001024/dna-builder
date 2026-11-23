<script lang="ts" setup>
import { computed } from "vue"

/** 轻量 SVG 折线图：输入按时间升序的 {t, v} 序列，统一缩放到 100×40 视图。 */
const props = defineProps<{
    points: Array<{ t: number; v: number }>
    /** 折线颜色工具类，如 stroke-primary */
    strokeClass?: string
    /** 面积填充工具类，如 fill-primary/10 */
    fillClass?: string
}>()

const chart = computed(() => {
    const points = props.points.filter(point => Number.isFinite(point.t) && Number.isFinite(point.v))
    if (!points.length) {
        return { line: "", area: "", dot: null as null | { x: number; y: number }, baseline: null as null | number }
    }
    const tMin = points[0].t
    const tMax = points[points.length - 1].t
    const vMin = Math.min(0, ...points.map(point => point.v))
    const vMax = Math.max(1, ...points.map(point => point.v))
    const x = (t: number) => (tMax - tMin > 0 ? 2 + ((t - tMin) / (tMax - tMin)) * 96 : 50)
    const y = (v: number) => 2 + (1 - (v - vMin) / (vMax - vMin)) * 32
    const coords = points.map(point => ({ x: x(point.t), y: y(point.v) }))
    const line = coords.map(coord => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(" ")
    const area = `2,38 ${line} 98,38`
    return {
        line,
        area,
        dot: coords.length === 1 ? coords[0] : null,
        baseline: vMin < 0 && vMax > 0 ? y(0) : null,
    }
})
</script>

<template>
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" class="h-24 w-full" aria-hidden="true">
        <line
            v-if="chart.baseline != null"
            x1="2"
            :y1="chart.baseline"
            x2="98"
            :y2="chart.baseline"
            class="stroke-base-content/15"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
        />
        <polygon v-if="chart.line" :points="chart.area" :class="fillClass ?? 'fill-primary/10'" />
        <polyline
            v-if="chart.line"
            :points="chart.line"
            fill="none"
            :class="strokeClass ?? 'stroke-primary'"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
        />
        <circle v-if="chart.dot" :cx="chart.dot.x" :cy="chart.dot.y" r="1.5" :class="strokeClass ?? 'stroke-primary'" fill="none" />
    </svg>
</template>
