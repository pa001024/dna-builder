<script setup lang="ts">
import { ref, watch } from "vue"
import Icon from "./Icon.vue"

interface Props {
    min?: number
    max?: number
    step?: number
    disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    min: 1,
    max: 90,
    step: 1,
    disabled: false,
})

const emit = defineEmits<{
    change: [from: number, to: number]
}>()

// 使用 defineModel 定义双向绑定的值
const fromValue = defineModel<number>("from", {
    default: 1,
})
const toValue = defineModel<number>("to", {
    default: 10,
})

// 内部状态
const open = ref(false)
const tempFrom = ref(fromValue.value)
const tempTo = ref(toValue.value)

// 监听外部值变化
watch([fromValue, toValue], ([newFrom, newTo]) => {
    tempFrom.value = newFrom
    tempTo.value = newTo
})

// 确认选择
const confirmSelection = () => {
    fromValue.value = tempFrom.value
    toValue.value = tempTo.value
    emit("change", tempFrom.value, tempTo.value)
    open.value = false
}

// 取消选择
const cancelSelection = () => {
    // 重置为原始值
    tempFrom.value = fromValue.value
    tempTo.value = toValue.value
    open.value = false
}

// 输入验证
const handleMinInput = (event: Event) => {
    const input = event.target as HTMLInputElement
    let value = parseInt(input.value) || props.min
    value = Math.max(props.min, Math.min(value, tempTo.value - props.step))
    tempFrom.value = value
}

const handleMaxInput = (event: Event) => {
    const input = event.target as HTMLInputElement
    let value = parseInt(input.value) || props.min
    value = Math.max(tempFrom.value + props.step, Math.min(value, props.max))
    tempTo.value = value
}
</script>

<template>
    <button @click="open = !open" :disabled="disabled" class="input input-sm flex gap-4">
        <span>{{ fromValue }}</span>
        <span>-</span>
        <span>{{ toValue }}</span>
        <Icon icon="radix-icons:chevron-down" class="ml-auto" />
        <Teleport v-if="open" to="body">
            <!-- 选择面板 -->
            <div class="fixed inset-0 z-50">
                <!-- 背景遮罩 -->
                <div @click="open = false" class="absolute inset-0 bg-black/50"></div>

                <!-- 选择面板 - 使用 Tailwind 媒体查询实现响应式 -->
                <!-- PC 端：居中显示 -->
                <div
                    class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-base-100 rounded-lg shadow-xl border border-base-200 animate-slideDownAndFade lg:block hidden"
                >
                    <div class="p-4">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-semibold">选择等级范围</h3>
                            <button @click="open = false" class="text-base-content/70 hover:text-base-content">
                                <Icon icon="radix-icons:cross2" class="w-5 h-5" />
                            </button>
                        </div>

                        <!-- 范围显示 -->
                        <div class="flex justify-center items-center gap-4 mb-4">
                            <input
                                v-model.number="tempFrom"
                                @input="handleMinInput"
                                type="number"
                                :min="props.min"
                                :max="tempTo - props.step"
                                :step="props.step"
                                class="w-20 text-center font-bold bg-base-200 rounded-lg p-2"
                            />
                            <span class="text-lg font-medium">-</span>
                            <input
                                v-model.number="tempTo"
                                @input="handleMaxInput"
                                type="number"
                                :min="tempFrom + props.step"
                                :max="props.max"
                                :step="props.step"
                                class="w-20 text-center font-bold bg-base-200 rounded-lg p-2"
                            />
                        </div>

                        <!-- 确认按钮 -->
                        <div class="flex gap-2">
                            <button @click="cancelSelection" class="flex-1 btn btn-outline">取消</button>
                            <button @click="confirmSelection" class="flex-1 btn btn-primary">确认</button>
                        </div>
                    </div>
                </div>

                <!-- 移动端：底部弹出 -->
                <div
                    class="absolute bottom-0 left-0 right-0 bg-base-100 rounded-t-2xl shadow-2xl animate-slideUpAndFade pointer-events-auto lg:hidden block"
                >
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-semibold">选择等级范围</h3>
                            <button @click="open = false" class="text-base-content/70 hover:text-base-content">
                                <Icon icon="radix-icons:cross2" class="w-6 h-6" />
                            </button>
                        </div>

                        <!-- 范围显示 -->
                        <div class="flex justify-center items-center gap-4 mb-6">
                            <input
                                v-model.number="tempFrom"
                                @input="handleMinInput"
                                type="number"
                                :min="props.min"
                                :max="tempTo - props.step"
                                :step="props.step"
                                class="w-24 text-center text-2xl font-bold bg-base-200 rounded-lg p-2"
                            />
                            <span class="text-lg font-medium">-</span>
                            <input
                                v-model.number="tempTo"
                                @input="handleMaxInput"
                                type="number"
                                :min="tempFrom + props.step"
                                :max="props.max"
                                :step="props.step"
                                class="w-24 text-center text-2xl font-bold bg-base-200 rounded-lg p-2"
                            />
                        </div>

                        <!-- 确认按钮 -->
                        <button
                            @click="confirmSelection"
                            class="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 rounded-lg transition-colors"
                        >
                            确认
                        </button>
                    </div>
                </div>
            </div>
        </Teleport>
    </button>
</template>
