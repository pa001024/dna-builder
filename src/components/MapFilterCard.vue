<script lang="ts" setup>
/**
 * 通用筛选卡片（魔灵 / 传送点 / 资源共用）。
 * - 标题行整行可点击折叠（含标题文字与折叠箭头），点击 → toggle-collapse
 * - 「全部」图标按钮（位于眼睛左侧），点击 → toggle-all（@click.stop 避免触发折叠）
 * - 眼睛按钮控制整体显隐，点击 → toggle-visibility（@click.stop 避免触发折叠）
 */
defineProps<{
    title: string
    collapsed?: boolean
    visible?: boolean
    allActive?: boolean
    showAllToggle?: boolean
}>()

const emit = defineEmits<{
    (e: "toggle-collapse"): void
    (e: "toggle-all"): void
    (e: "toggle-visibility"): void
}>()
</script>

<template>
    <div
        class="flex w-full flex-col gap-1 rounded-xs border border-base-content/12 bg-base-100/88 p-1.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.08)] backdrop-blur-xs"
    >
        <div
            role="button"
            tabindex="0"
            class="flex w-full cursor-pointer items-center gap-1 px-1 pt-0.5 pb-1 text-[10px] font-semibold tracking-[0.2em] text-base-content/45 uppercase select-none"
            :aria-expanded="!collapsed"
            @click="emit('toggle-collapse')"
            @keydown.enter="emit('toggle-collapse')"
            @keydown.space.prevent="emit('toggle-collapse')"
        >
            <span class="min-w-0 flex-1 truncate text-left">{{ title }}</span>
            <button
                v-if="showAllToggle"
                type="button"
                class="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-xs border transition-colors duration-150"
                :class="allActive
                    ? 'border-primary/60 bg-primary/10 text-primary hover:border-primary/60'
                    : 'border-transparent text-base-content/50 hover:border-primary/40 hover:text-primary'"
                :title="allActive ? '已选中全部（点击取消全选）' : '选中全部'"
                @click.stop="emit('toggle-all')"
            >
                <Icon icon="ri:list-check-2" class="size-3.5" />
            </button>
            <button
                v-if="visible !== undefined"
                type="button"
                class="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-transparent text-base-content/50 transition-colors duration-150 hover:border-primary/40 hover:text-primary"
                :title="visible ? '当前显示（点击隐藏）' : '当前隐藏（点击显示）'"
                @click.stop="emit('toggle-visibility')"
            >
                <Icon :icon="visible ? 'ri:eye-line' : 'ri:eye-off-line'" class="size-3.5" />
            </button>
            <Icon
                :icon="collapsed ? 'ri:arrow-down-s-line' : 'ri:arrow-up-s-line'"
                class="size-3.5 shrink-0 text-base-content/40"
            />
        </div>
        <template v-if="!collapsed">
            <slot />
        </template>
    </div>
</template>
