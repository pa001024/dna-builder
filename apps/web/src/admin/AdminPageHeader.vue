<script setup lang="ts">
/**
 * 后台管理页共用的头部组件：kicker + 标题 + 说明 + 右侧操作区。
 * 结构对齐 Home.vue 的主视觉（主色强调线 + 斜切楔形 + 导线网格），但只保留一条底线，避免每页都变成大 hero。
 */
defineProps<{
    /** 装饰性英文小标（纯英文，大写） */
    kicker: string
    /** 页面标题 */
    title: string
    /** 一句话说明（可选） */
    description?: string
}>()
</script>

<template>
    <header class="relative overflow-hidden border-b-2 border-primary">
        <div
            class="pointer-events-none absolute inset-0"
            style="
                background-image:
                    linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                    linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                background-size: 52px 52px;
                mask-image: linear-gradient(to bottom, black, transparent 85%);
            "
            aria-hidden="true"
        />
        <span
            class="pointer-events-none absolute top-0 right-0 h-9 w-9 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
            aria-hidden="true"
        />
        <div class="relative flex flex-wrap items-end gap-x-4 gap-y-2 pt-5 pb-3.5">
            <div class="min-w-0 flex-1">
                <p class="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                    <span class="h-px w-5 bg-primary" aria-hidden="true" />
                    {{ kicker }}
                </p>
                <h1 class="text-[26px] font-semibold leading-tight tracking-tight text-base-content">
                    {{ title }}
                </h1>
                <p v-if="description" class="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-base-content/55">
                    {{ description }}
                </p>
            </div>
            <div class="flex shrink-0 items-center gap-2 pb-0.5">
                <slot name="actions" />
            </div>
        </div>
    </header>
</template>
