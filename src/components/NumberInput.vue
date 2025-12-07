<script setup lang="ts">
// 定义组件的props
const props = defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number
}>()

// 定义组件的事件
const emit = defineEmits<{
    (e: "update:modelValue", value: number): void
}>()

// 增加数值的方法
const increment = () => {
    const step = props.step || 1
    let newValue = props.modelValue + step

    // 检查最大值限制
    if (props.max !== undefined) {
        newValue = Math.min(newValue, props.max)
    }

    emit("update:modelValue", newValue)
}

// 减少数值的方法
const decrement = () => {
    const step = props.step || 1
    let newValue = props.modelValue - step

    // 检查最小值限制
    if (props.min !== undefined) {
        newValue = Math.max(newValue, props.min)
    }

    emit("update:modelValue", newValue)
}
</script>

<template>
    <div class="flex items-center border border-gray-300 rounded-md overflow-hidden w-fit">
        <button
            class="w-8 h-8 bg-gray-100 border-none cursor-pointer text-lg flex items-center justify-center transition-colors hover:bg-gray-200 active:bg-gray-300"
            @click="decrement"
        >
            -
        </button>
        <div class="min-w-10 h-8 flex items-center justify-center border-x border-gray-300 text-base px-2">
            {{ props.modelValue }}
        </div>
        <button
            class="w-8 h-8 bg-gray-100 border-none cursor-pointer text-lg flex items-center justify-center transition-colors hover:bg-gray-200 active:bg-gray-300"
            @click="increment"
        >
            +
        </button>
    </div>
</template>
