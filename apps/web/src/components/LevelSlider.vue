<script setup lang="ts">
import { computed } from "vue"

const props = withDefaults(
    defineProps<{
        min?: number
        max?: number
        step?: number
    }>(),
    { min: 1, max: 80, step: 20 }
)

const model = defineModel<number>()

/**
 * 根据最大值和步长生成刻度值。
 * 首个刻度固定为 1，后续按步长递增并截断到最大值。
 */
const tickValues = computed(() => {
    const max = Math.max(props.min, props.max)
    const step = Math.max(1, props.step)
    const values = [props.min]

    for (let value = step; value < max; value += step) {
        values.push(value)
    }

    if (values[values.length - 1] !== max) {
        values.push(max)
    }

    return values
})

/**
 * 刻度在滑块轨道上的水平位置（百分比）。
 * 滑块把 min 映射到左端、max 映射到右端，刻度必须按 (tick - min) / (max - min) 定位，
 * 否则 min 不为 0 时（默认 1）刻度会整体偏向 0 起点而产生偏移。
 */
const tickPosition = (tick: number) => {
    const span = props.max - props.min
    if (span <= 0) return "0%"
    return `${((tick - props.min) / span) * 100}%`
}
</script>

<template>
    <div class="flex items-center gap-4">
        <span class="mr-1 shrink-0 text-xs text-base-content/55 min-w-20"
            >Lv. <input v-model.number="model" type="text" class="w-12 text-center" />
        </span>
        <div class="grow">
            <input
                v-model.number="model"
                type="range"
                class="range range-primary range-xs w-full"
                :min="props.min"
                :max="props.max"
                step="1"
            />
            <div class="relative h-4 text-xs mx-2">
                <span
                    v-for="tick in tickValues"
                    :key="tick"
                    class="cursor-pointer absolute top-0 -translate-x-1/2"
                    :style="{ left: tickPosition(tick) }"
                    @click="model = tick"
                    :class="{ 'text-secondary': model === tick }"
                >
                    {{ tick }}
                </span>
            </div>
        </div>
    </div>
</template>
