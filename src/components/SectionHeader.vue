<script setup lang="ts">
// 与首页(Home.vue)一致的章节头样式：主色序号块 + 英文小标 + 中文标题 + 分隔线 + 尾部计数
// 用法：<SectionHeader number="01" kicker="MODULES" title="模块" :count="8" />
defineProps<{
    /** 主色方块中的序号，如 "01"；为空则不渲染序号块 */
    number?: string
    /** 英文小标（大写字距），如 "MODULES"；为空则不渲染 */
    kicker?: string
    /** 中文标题；为空则可用 #title 插槽替代 */
    title?: string
    /** 分隔线右侧的计数/角标 */
    count?: string | number
    /** 禁用上浮入场动画（如面板内嵌重复使用时） */
    noAnimate?: boolean
    /** 紧凑模式（面板内嵌使用）：缩小底部间距 */
    compact?: boolean
}>()
</script>

<template>
    <div
        class="flex items-center gap-3.5"
        :class="[noAnimate ? '' : 'animate-ef-rise motion-reduce:animate-none', compact ? 'mb-2' : 'mb-4']"
    >
        <span
            v-if="number"
            class="inline-flex h-9 min-w-9 items-center justify-center rounded-xs bg-primary px-2 font-orbitron text-sm font-semibold tracking-wide text-primary-content tabular-nums"
        >
            {{ number }}
        </span>
        <span v-if="kicker" class="text-[11px] font-semibold tracking-[0.3em] text-base-content/55 uppercase">{{ kicker }}</span>
        <h2 v-if="title" class="text-[17px] font-semibold text-base-content">{{ title }}</h2>
        <slot name="title" />
        <span class="h-px min-w-8 flex-1 bg-base-content/10" aria-hidden="true" />
        <span v-if="count !== undefined && count !== ''" class="text-[11px] font-medium text-base-content/50 tabular-nums">
            {{ count }}
        </span>
        <slot name="trailing" />
    </div>
</template>
