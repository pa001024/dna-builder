<script setup lang="ts">
import type { IconTypes } from "@/components/Icon.vue"

/**
 * 快捷导航条目。
 */
export interface QuickNavItem {
    path: string
    icon: IconTypes
    titleKey: string
}

defineProps<{
    items: QuickNavItem[]
    /** 布局方式：默认固定 2/4 列（首页）；autofill = auto-fill 自适应列数（More 页快捷入口） */
    autofill?: boolean
}>()
</script>

<template>
    <!-- 快捷导航网格：默认固定 2/4 列（首页）；autofill 时用 auto-fill 自适应列数（More 页） -->
    <div class="grid gap-2" :class="autofill ? 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]' : 'grid-cols-2 md:grid-cols-4'">
        <RouterLink
            v-for="(item, index) in items"
            :key="item.path"
            :to="item.path"
            class="group relative flex aspect-square flex-col items-center justify-center rounded-xs border border-base-content/10 bg-base-100/60 px-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 md:aspect-video md:items-stretch @container-size motion-reduce:animate-none motion-reduce:transition-none animate-ef-rise"
            :style="{ animationDelay: `calc(0.1s + ${index} * 40ms)` }"
        >
            <!-- 图标 + 文字：宽屏时内容左对齐、左边距固定，保证各卡片图标纵向对齐；窄屏保持居中 -->
            <span
                class="flex flex-col items-center gap-2 md:flex-row md:justify-start md:gap-2.5 md:pl-4 md:group-hover:-translate-x-3 transition-transform duration-200"
            >
                <span
                    class="flex h-[50cqh] w-[50cqh] shrink-0 items-center justify-center rounded-xs bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-content"
                >
                    <Icon :icon="item.icon" class="h-[55%] w-[55%]" />
                </span>
                <span class="text-[16cqh] font-medium leading-snug text-base-content">{{ $t(item.titleKey) }}</span>
            </span>
            <span
                class="absolute right-2 hidden h-[26cqh] w-[26cqh] translate-x-1 items-center justify-center rounded-xs bg-primary text-primary-content opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 md:flex"
                aria-hidden="true"
            >
                <Icon icon="ri:arrow-right-line" class="h-[55%] w-[55%]" />
            </span>
        </RouterLink>
    </div>
</template>
