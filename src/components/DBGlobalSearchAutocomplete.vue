<script setup lang="ts">
import { computed, ref } from "vue"

export interface DBGlobalSearchOption {
    id: string
    title: string
    subtitle?: string
    typeLabel: string
    path: string
}

const props = withDefaults(
    defineProps<{
        modelValue: string
        options: DBGlobalSearchOption[]
        placeholder?: string
        emptyText?: string
        maxVisible?: number
        inputClass?: string
        panelClass?: string
        optionClass?: string
    }>(),
    {
        placeholder: "搜索资料库内容...",
        emptyText: "没有匹配结果",
        maxVisible: 12,
        inputClass: "",
        panelClass: "",
        optionClass: "",
    }
)

const emit = defineEmits<{
    "update:modelValue": [value: string]
    select: [value: DBGlobalSearchOption]
}>()

const isOpen = ref(false)
const activeIndex = ref(0)

const visibleOptions = computed(() => props.options.slice(0, props.maxVisible))

/**
 * 处理输入框键盘操作（上下选择、回车确认、ESC关闭）
 */
function handleInputKeydown(event: KeyboardEvent) {
    if (!visibleOptions.value.length) {
        return
    }

    if (event.key === "ArrowDown") {
        event.preventDefault()
        isOpen.value = true
        activeIndex.value = Math.min(activeIndex.value + 1, visibleOptions.value.length - 1)
        return
    }

    if (event.key === "ArrowUp") {
        event.preventDefault()
        activeIndex.value = Math.max(activeIndex.value - 1, 0)
        return
    }

    if (event.key === "Enter") {
        event.preventDefault()
        selectOption(visibleOptions.value[activeIndex.value])
        return
    }

    if (event.key === "Escape") {
        isOpen.value = false
    }
}

/**
 * 选择候选项并通知父组件处理路由跳转
 */
function selectOption(option: DBGlobalSearchOption) {
    emit("select", option)
    isOpen.value = false
}

/**
 * 输入变化时同步值并重置高亮索引
 */
function handleInput(event: Event) {
    const target = event.target as HTMLInputElement
    emit("update:modelValue", target.value)
    activeIndex.value = 0
    isOpen.value = true
}

/**
 * 聚焦输入框时展示下拉候选
 */
function handleFocus() {
    isOpen.value = true
}

/**
 * 失焦后延迟收起，确保点击候选项可正常触发
 */
function handleBlur() {
    setTimeout(() => {
        isOpen.value = false
    }, 120)
}
</script>

<template>
    <div class="relative w-full">
        <!-- 下划线式输入框 -->
        <div class="relative">
            <input
                :value="modelValue"
                type="text"
                :placeholder="placeholder"
                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-2 pl-7 pr-3 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                :class="props.inputClass"
                @input="handleInput"
                @keydown="handleInputKeydown"
                @focus="handleFocus"
                @blur="handleBlur"
            />
            <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
        </div>

        <!-- 候选面板：直角细边框 + backdrop-blur -->
        <div
            v-if="isOpen && modelValue.trim()"
            class="absolute top-[calc(100%+8px)] left-0 right-0 z-50 overflow-hidden rounded-xs border border-base-content/10 bg-base-100/80 shadow-lg backdrop-blur-md"
            :class="props.panelClass"
        >
            <div v-if="!visibleOptions.length" class="px-3 py-4 text-sm text-base-content/60 text-center">
                {{ emptyText }}
            </div>

            <div v-else class="max-h-96 overflow-y-auto">
                <button
                    v-for="(option, index) in visibleOptions"
                    :key="option.id"
                    type="button"
                    class="w-full cursor-pointer border-b border-base-content/10 px-3 py-2.5 text-left transition-colors duration-200 last:border-b-0 hover:bg-base-content/5"
                    :class="[props.optionClass, { 'bg-base-content/5': index === activeIndex }]"
                    @mousedown.prevent="selectOption(option)"
                    :data-active="index === activeIndex"
                >
                    <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                            <div class="truncate text-sm font-medium">{{ option.title }}</div>
                            <div v-if="option.subtitle" class="mt-0.5 truncate text-xs text-base-content/60">{{ option.subtitle }}</div>
                        </div>
                        <!-- 类型徽章：方角等宽小标 -->
                        <span
                            class="shrink-0 rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] text-base-content/55"
                        >
                            {{ option.typeLabel }}
                        </span>
                    </div>
                </button>
            </div>
        </div>
    </div>
</template>
