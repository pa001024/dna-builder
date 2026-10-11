<script setup lang="ts">
import { nextTick, ref, watch } from "vue"
import type { IconTypes } from "@/components/Icon.vue"

/** 滚动目录项：key 同时是内容区区块的 data-scroll-section 值 */
export interface ScrollSpyNavItem {
    /** 区块键名 */
    key: string
    /** 目录文案，与对应区块的标题保持一致 */
    title: string
    /** remixicon 图标名，缺省时只显示文字 */
    icon?: IconTypes
}

const props = defineProps<{
    /** 目录项，顺序需与内容区区块顺序一致 */
    items: ScrollSpyNavItem[]
    /** 当前高亮的区块键名 */
    activeKey: string
    /** 目录顶部的大写英文小标，如 "SETTINGS"；缺省时不渲染头部区 */
    kicker?: string
    /** 小标下的说明文字；缺省时不渲染 */
    description?: string
}>()

const emit = defineEmits<{
    /** 点击目录项 */
    select: [key: string]
}>()

const navRef = ref<HTMLElement | null>(null)

/**
 * 把高亮项滚进可视野内：窄屏横排时目录本身可横向滚动，
 * 由内容区滚动带动的高亮切换需要目录跟随，否则选中项会滑出屏幕。
 */
async function revealActive() {
    await nextTick()
    // key 可能含中文 / 空格等特殊字符，拼属性选择器前先转义
    const el = navRef.value?.querySelector<HTMLElement>(`[data-nav-key="${CSS.escape(props.activeKey)}"]`)
    el?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" })
}

watch(() => props.activeKey, revealActive)
</script>

<template>
    <!-- 窄屏：内容区上方的横向标签条；md 起收成左侧竖排目录 -->
    <nav
        ref="navRef"
        class="scrollbar-hide flex shrink-0 gap-1 overflow-x-auto bg-base-300/50 backdrop-blur-sm border-b border-base-content/10 p-2 md:h-full md:w-56 md:flex-col md:gap-0.5 md:overflow-x-hidden md:overflow-y-auto md:border-r md:border-b-0 md:p-3"
    >
        <div v-if="kicker || description" class="hidden px-1.5 pb-2 md:block">
            <div v-if="kicker" class="text-[11px] font-semibold tracking-[0.3em] text-base-content/45 uppercase">{{ kicker }}</div>
            <div v-if="description" class="mt-1 text-xs text-base-content/50">{{ description }}</div>
        </div>
        <button
            v-for="item in items"
            :key="item.key"
            :data-nav-key="item.key"
            type="button"
            :aria-current="item.key === activeKey ? 'true' : undefined"
            class="relative flex shrink-0 cursor-pointer items-center gap-2 rounded-xs px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 md:w-full md:py-2 md:text-sm"
            :class="
                item.key === activeKey
                    ? 'bg-primary/10 text-primary'
                    : 'text-base-content/60 hover:bg-base-content/5 hover:text-base-content'
            "
            @click="emit('select', item.key)"
        >
            <!-- 高亮条只在竖排形态出现：横排靠底色区分，加条会让标签显得很重 -->
            <span
                v-if="item.key === activeKey"
                class="absolute top-1/2 left-0 hidden h-4 w-0.5 -translate-y-1/2 rounded-xs bg-primary md:block"
            />
            <Icon v-if="item.icon" :icon="item.icon" class="size-3.5 shrink-0 md:size-4" />
            <span class="truncate">{{ item.title }}</span>
        </button>
    </nav>
</template>
