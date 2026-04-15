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
</script>

<template>
    <div class="flex items-center gap-4">
        <span class="text-sm min-w-20">Lv. <input v-model.number="model" type="text" class="w-12 text-center" /> </span>
        <div class="grow">
            <input
                v-model.number="model"
                type="range"
                class="range range-primary range-xs w-full"
                :min="props.min"
                :max="props.max"
                step="1"
            />
            <div class="w-full flex justify-between text-xs">
                <span
                    v-for="tick in tickValues"
                    :key="tick"
                    class="cursor-pointer"
                    @click="model = tick"
                    :class="{ 'text-secondary': model === tick }"
                >
                    {{ tick }}
                </span>
            </div>
        </div>
    </div>
</template>
