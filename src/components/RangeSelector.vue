<script setup lang="ts">
import { computed, ref, useAttrs, watch } from "vue"
import Icon from "./Icon.vue"

defineOptions({ inheritAttrs: false })

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

const attrs = useAttrs()

/**
 * 按调用方是否传入 daisyUI `btn` 类，决定触发器基础样式。
 * 传 `btn` 时交给调用方控制内边距与边框，避免内部下划线配方破坏居中；
 * 未传 `btn` 时使用默认下划线输入框配方。
 */
const rootClass = computed(() => {
    const external = String(attrs.class ?? "")
    const hasBtn = /\bbtn\b/.test(external)
    const base = hasBtn
        ? "inline-flex items-center justify-between gap-2 text-[13px] text-base-content outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50"
        : "inline-flex items-center justify-between gap-2 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
    return `${base} ${external}`
})

/** 过滤掉 class，避免与 rootClass 重复绑定。 */
const otherAttrs = computed(() => {
    const { class: _, ...rest } = attrs
    return rest
})

/**
 * 确认当前选择并同步到外部绑定值。
 */
const confirmSelection = () => {
    fromValue.value = tempFrom.value
    toValue.value = tempTo.value
    emit("change", tempFrom.value, tempTo.value)
    open.value = false
}

/**
 * 取消本次编辑，恢复打开面板前的范围。
 */
const cancelSelection = () => {
    // 重置为原始值
    tempFrom.value = fromValue.value
    tempTo.value = toValue.value
    open.value = false
}

/**
 * 校验起始值，允许起止值相同。
 * @param event 输入事件
 */
const handleMinInput = (event: Event) => {
    const input = event.target as HTMLInputElement
    let value = parseInt(input.value) || props.min
    value = Math.max(props.min, Math.min(value, tempTo.value))
    tempFrom.value = value
}

/**
 * 校验结束值，允许起止值相同。
 * @param event 输入事件
 */
const handleMaxInput = (event: Event) => {
    const input = event.target as HTMLInputElement
    let value = parseInt(input.value) || props.min
    value = Math.max(tempFrom.value, Math.min(value, props.max))
    tempTo.value = value
}
</script>

<template>
    <button
        type="button"
        @click="open = !open"
        :disabled="disabled"
        :class="rootClass"
        v-bind="otherAttrs"
    >
        <span class="flex items-center gap-2">
            <span class="font-orbitron tabular-nums">{{ fromValue }}</span>
            <span class="text-base-content/55">-</span>
            <span class="font-orbitron tabular-nums">{{ toValue }}</span>
        </span>
        <Icon icon="radix-icons:chevron-down" class="size-4 shrink-0 text-base-content/60" />
        <Teleport v-if="open" to="body">
            <!-- 选择面板 -->
            <div class="fixed inset-0 z-50">
                <!-- 背景遮罩 -->
                <div @click="open = false" class="absolute inset-0 bg-black/50"></div>

                <!-- 选择面板 - 使用 Tailwind 媒体查询实现响应式 -->
                <!-- PC 端：居中显示 -->
                <div
                    class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xs border border-base-content/15 bg-base-100/85 shadow-lg backdrop-blur-md animate-slideDownAndFade lg:block hidden"
                >
                    <div class="p-4">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-semibold">{{ $t('common.select_level_range') }}</h3>
                            <button type="button" @click="open = false" class="text-base-content/70 hover:text-base-content">
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
                                :max="tempTo"
                                :step="props.step"
                                class="w-20 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-center font-orbitron text-[13px] tabular-nums text-base-content outline-none transition-colors duration-150 focus:border-primary"
                            />
                            <span class="text-lg font-medium">-</span>
                            <input
                                v-model.number="tempTo"
                                @input="handleMaxInput"
                                type="number"
                                :min="tempFrom"
                                :max="props.max"
                                :step="props.step"
                                class="w-20 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-center font-orbitron text-[13px] tabular-nums text-base-content outline-none transition-colors duration-150 focus:border-primary"
                            />
                        </div>

                        <!-- 确认按钮 -->
                        <div class="flex gap-2">
                            <button
                                type="button"
                                @click="cancelSelection"
                                class="flex-1 rounded-xs border border-base-content/20 px-3 py-1.5 text-[13px] text-base-content/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary"
                            >
                                {{ $t('取消') }}
                            </button>
                            <button
                                type="button"
                                @click="confirmSelection"
                                class="flex-1 rounded-xs border border-primary bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90"
                            >
                                {{ $t('common.confirm') }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 移动端：底部弹出 -->
                <div
                    class="absolute bottom-0 left-0 right-0 rounded-t-xs border border-base-content/15 bg-base-100/85 shadow-lg backdrop-blur-md animate-slideUpAndFade pointer-events-auto lg:hidden block"
                >
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-semibold">{{ $t('common.select_level_range') }}</h3>
                            <button type="button" @click="open = false" class="text-base-content/70 hover:text-base-content">
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
                                :max="tempTo"
                                :step="props.step"
                                class="w-24 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-center font-orbitron text-2xl tabular-nums text-base-content outline-none transition-colors duration-150 focus:border-primary"
                            />
                            <span class="text-lg font-medium">-</span>
                            <input
                                v-model.number="tempTo"
                                @input="handleMaxInput"
                                type="number"
                                :min="tempFrom"
                                :max="props.max"
                                :step="props.step"
                                class="w-24 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-center font-orbitron text-2xl tabular-nums text-base-content outline-none transition-colors duration-150 focus:border-primary"
                            />
                        </div>

                        <!-- 确认按钮 -->
                        <button
                            type="button"
                            @click="confirmSelection"
                            class="w-full rounded-xs border border-primary bg-primary px-3 py-3 text-[13px] font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90"
                        >
                            {{ $t('common.confirm') }}
                        </button>
                    </div>
                </div>
            </div>
        </Teleport>
    </button>
</template>
