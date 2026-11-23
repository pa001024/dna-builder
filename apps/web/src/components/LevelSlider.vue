<script setup lang="ts">
import { computed } from "vue"

const props = withDefaults(
    defineProps<{
        min?: number
        max?: number
        step?: number
        /** 常用等级上限，超过后高等级段压缩到轨道尾部 */
        fineMax?: number
    }>(),
    { min: 1, max: 80, step: 20, fineMax: 240 }
)

const model = defineModel<number>()

/** 常用等级段至少占用的轨道比例 */
const FINE_TRACK_RATIO = 0.75
/** 虚拟轨道坐标总量 */
const TRACK_UNITS = 1000
/** 相邻刻度标签的最小间距（轨道百分比），避免数字重叠 */
const MIN_TICK_GAP = 5
/** 线性模式下最多允许的刻度区间数 */
const MAX_LINEAR_TICK_INTERVALS = 12

const upperBound = computed(() => Math.max(props.min, props.max))

/** 上限超过常用上限时，常用段占满大部分轨道，高等级段压缩到尾部 */
const isCompressed = computed(() => props.fineMax > props.min && upperBound.value > props.fineMax)

/** 常用段在虚拟轨道上的终点坐标 */
const fineTrackEnd = computed(() => {
    const linearShare = (props.fineMax - props.min) / (upperBound.value - props.min)
    return Math.round(TRACK_UNITS * Math.max(linearShare, FINE_TRACK_RATIO))
})

const sliderMin = computed(() => (isCompressed.value ? 0 : props.min))
const sliderMax = computed(() => (isCompressed.value ? TRACK_UNITS : upperBound.value))

/**
 * 将等级夹取取整到合法区间。
 */
function clampLevel(value: number): number {
    return Math.min(upperBound.value, Math.max(props.min, Math.round(value)))
}

/**
 * 等级换算为滑块坐标：压缩模式按两段线性映射，常用段占用更多轨道。
 */
function levelToSlider(level: number): number {
    if (!isCompressed.value) return level
    if (level <= props.fineMax) {
        return ((level - props.min) / (props.fineMax - props.min)) * fineTrackEnd.value
    }
    return (
        fineTrackEnd.value +
        ((level - props.fineMax) / (upperBound.value - props.fineMax)) * (TRACK_UNITS - fineTrackEnd.value)
    )
}

/**
 * 滑块坐标换算回等级。
 */
function sliderToLevel(position: number): number {
    if (!isCompressed.value) return clampLevel(position)
    const level =
        position <= fineTrackEnd.value
            ? props.min + (position / Math.max(1, fineTrackEnd.value)) * (props.fineMax - props.min)
            : props.fineMax +
              ((position - fineTrackEnd.value) / Math.max(1, TRACK_UNITS - fineTrackEnd.value)) *
                  (upperBound.value - props.fineMax)
    return clampLevel(level)
}

const sliderValue = computed({
    get: () => {
        const level = Number(model.value)
        return Number.isFinite(level) ? levelToSlider(clampLevel(level)) : sliderMin.value
    },
    set: value => {
        model.value = sliderToLevel(Number(value))
    },
})

/**
 * 输入框失焦或回车时，把内容夹取到合法等级。
 * 直接读输入框值，避免 defineModel 的 prop 回写尚未同步时读到旧值。
 */
function commitLevelInput(event: Event) {
    const input = event.target as HTMLInputElement
    const level = Number(input.value)
    model.value = Number.isFinite(level) ? clampLevel(level) : props.min
}

/**
 * 方向键按等级逐级调整；压缩模式下轨道坐标与等级不是一比一，交给浏览器会跳格。
 */
function handleSliderKeydown(event: KeyboardEvent) {
    const delta = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0
    const current = Number(model.value)
    if (delta === 0 || !Number.isFinite(current)) return
    event.preventDefault()
    model.value = clampLevel(current + delta)
}

/**
 * 取不小于期望密度的“整”步长（1/2/5 × 10ⁿ），且不小于给定的基础步长。
 */
function pickTickStep(range: number, intervals: number, baseStep: number): number {
    const minimum = Math.max(1, baseStep)
    const raw = Math.max(minimum, range / Math.max(1, intervals))
    const magnitude = 10 ** Math.floor(Math.log10(raw))
    const normalized = raw / magnitude
    const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
    return Math.max(minimum, multiplier * magnitude)
}

/**
 * 按起点、终点、步长生成刻度，起点与终点始终包含。
 */
function buildTicks(start: number, end: number, step: number): number[] {
    const values = [start]
    for (let value = Math.ceil((start + 1) / step) * step; value < end; value += step) {
        values.push(value)
    }
    if (values[values.length - 1] !== end) values.push(end)
    return values
}

/**
 * 刻度在轨道上的水平位置（百分比）。
 */
function tickPercent(tick: number): number {
    if (isCompressed.value) return (levelToSlider(tick) / TRACK_UNITS) * 100
    const span = upperBound.value - props.min
    return span > 0 ? ((tick - props.min) / span) * 100 : 0
}

/**
 * 丢弃间距过近的刻度，保证数字不会叠在一起。
 */
function dropCrowdedTicks(ticks: number[]): number[] {
    if (ticks.length <= 2) return ticks
    const kept = [ticks[0]]
    for (let index = 1; index < ticks.length - 1; index++) {
        if (tickPercent(ticks[index]) - tickPercent(kept[kept.length - 1]) >= MIN_TICK_GAP) {
            kept.push(ticks[index])
        }
    }
    const last = ticks[ticks.length - 1]
    while (kept.length > 1 && tickPercent(last) - tickPercent(kept[kept.length - 1]) < MIN_TICK_GAP) {
        kept.pop()
    }
    kept.push(last)
    return kept
}

/**
 * 刻度值：线性模式按基础步长均分；压缩模式常用段与高等级段分别取密度。
 */
const tickValues = computed(() => {
    const raw = isCompressed.value
        ? [
              ...buildTicks(props.min, props.fineMax, pickTickStep(props.fineMax - props.min, 5, props.step)),
              ...buildTicks(props.fineMax, upperBound.value, pickTickStep(upperBound.value - props.fineMax, 3, 1)).slice(1),
          ]
        : buildTicks(props.min, upperBound.value, pickTickStep(upperBound.value - props.min, MAX_LINEAR_TICK_INTERVALS, props.step))

    return dropCrowdedTicks(raw)
})
</script>

<template>
    <div class="flex items-center gap-4">
        <span class="mr-1 shrink-0 text-xs text-base-content/55 min-w-20"
            >Lv.
            <input v-model.number="model" type="text" class="w-12 text-center" @change="commitLevelInput" />
        </span>
        <div class="grow">
            <input
                v-model.number="sliderValue"
                type="range"
                class="range range-primary range-xs w-full"
                :min="sliderMin"
                :max="sliderMax"
                step="1"
                @keydown="handleSliderKeydown"
            />
            <div class="relative h-4 text-xs mx-2">
                <span
                    v-for="tick in tickValues"
                    :key="tick"
                    class="cursor-pointer absolute top-0 -translate-x-1/2 tabular-nums"
                    :style="{ left: `${tickPercent(tick)}%` }"
                    @click="model = tick"
                    :class="{ 'text-secondary': model === tick }"
                >
                    {{ tick }}
                </span>
            </div>
        </div>
    </div>
</template>
