<script setup lang="ts">
import { computed } from "vue"

// 组件属性
const props = withDefaults(
    defineProps<{
        title: string
        badge?: string | number
        isOpen?: boolean
    }>(),
    {
        isOpen: false,
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
        class="collapse bg-base-100/50 backdrop-blur-sm rounded-md shadow-lg overflow-hidden border border-base-200"
        :class="collapseClass"
    >
        <div
            class="flex items-center justify-between p-4 cursor-pointer bg-linear-to-r from-primary/5 to-transparent hover:from-primary/10 transition-colors"
            @click="toggle"
        >
            <div class="flex items-center gap-2">
                <SectionMarker />
                <h2 class="text-lg font-bold">
                    {{ title }}
                    <span v-if="badge" class="badge badge-ghost badge-sm">{{ badge }}</span>
                </h2>
                <slot name="title-append" />
            </div>
            <span
                class="flex-none size-8 items-center justify-center text-lg text-base-content/50 swap swap-flip -rotate-90"
                :class="{ 'swap-active': isOpen }"
            >
                <Icon icon="tabler:arrow-bar-to-left" class="swap-on" />
                <Icon icon="tabler:arrow-bar-to-right" class="swap-off" />
            </span>
        </div>
        <div class="collapse-content">
            <slot />
        </div>
    </div>
</template>
