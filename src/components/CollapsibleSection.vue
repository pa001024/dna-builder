<script setup lang="ts">
// 可折叠章节容器：采用首页(Home.vue)的视觉语言 —— 主色序号块 + 英文小标 + 标题 + 分隔线
import { computed } from "vue"

// 组件属性
const props = withDefaults(
    defineProps<{
        title: string
        badge?: string | number
        isOpen?: boolean
        lazy?: boolean
        /** 主色序号块，如 "01"；缺省时不渲染序号块 */
        number?: string
        /** 英文小标（大写字距），如 "MODS"；缺省时不渲染 */
        kicker?: string
        /** 禁用上浮入场动画 */
        noAnimate?: boolean
    }>(),
    {
        isOpen: false,
        lazy: false,
    }
)

// 组件事件
const emit = defineEmits<{
    toggle: []
}>()

// 计算折叠状态类名
const collapseClass = computed(() => ({
    "collapse-open": props.isOpen,
}))

// 切换折叠状态
function toggle() {
    emit("toggle")
}
</script>

<template>
    <div
        class="collapse overflow-hidden rounded-xs border border-base-content/10 bg-base-100/50 shadow-sm backdrop-blur-sm"
        :class="collapseClass"
    >
        <div class="flex cursor-pointer items-center gap-3.5 px-4 py-3 transition-colors duration-200 hover:bg-primary/5" @click="toggle">
            <span
                v-if="number"
                class="inline-flex h-9 min-w-9 items-center justify-center rounded-xs bg-primary px-2 font-orbitron text-sm font-semibold tracking-wide text-primary-content tabular-nums"
            >
                {{ number }}
            </span>
            <span v-if="kicker" class="hidden text-[11px] font-semibold tracking-[0.3em] text-base-content/55 uppercase sm:inline">
                {{ kicker }}
            </span>
            <h2 class="text-[17px] font-semibold text-base-content">
                {{ title }}
                <span v-if="badge !== undefined && badge !== ''" class="badge badge-ghost badge-sm ml-1">{{ badge }}</span>
            </h2>
            <slot name="title-append" />
            <span class="h-px min-w-8 flex-1 bg-base-content/10" aria-hidden="true" />
            <span class="flex-none text-base-content/50 transition-transform duration-200" :class="{ 'rotate-180': isOpen }">
                <Icon icon="ri:arrow-down-s-line" class="size-6" />
            </span>
        </div>
        <div v-if="!lazy || isOpen" class="collapse-content">
            <slot />
        </div>
    </div>
</template>
