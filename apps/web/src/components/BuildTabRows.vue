<script setup lang="ts">
import BuildTabTooltip, { type BuildTabCard } from "@/components/BuildTabTooltip.vue"
import type { IconTypes } from "@/components/Icon.vue"

/** 两行圆形页签的单项：图标、空槽与 tooltip 数据全部由调用方提供，组件不含业务状态 */
export interface BuildTabRowItem {
    key: string
    card: BuildTabCard
    /** 可访问名称（图片 alt / 容器 aria-label），缺省回退到 `key` */
    label?: string
    icon?: string | null
    /** 技能 / 类型图标（mask 上色），优先于 `icon` */
    maskUrl?: string | null
    /** 无图 / 空槽时的占位图标 */
    fallbackIcon?: IconTypes
    empty?: boolean
}

defineProps<{
    rows: BuildTabRowItem[][]
    activeKey: string
}>()

const emit = defineEmits<{
    (event: "select", key: string): void
}>()
</script>

<template>
    <div class="flex w-full flex-col gap-2">
        <div v-for="(row, rowIndex) in rows" :key="rowIndex" class="flex justify-center gap-2" data-tab-row>
            <BuildTabTooltip v-for="item in row" :key="item.key" :card="item.card">
                <div
                    class="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-base-100 aspect-square sm:size-12"
                    :class="[
                        { 'border-primary! shadow-lg shadow-primary/40': activeKey === item.key },
                        item.empty && activeKey !== item.key ? 'border-dashed opacity-80' : '',
                    ]"
                    :data-tab="item.key"
                    :aria-label="item.label ?? item.key"
                    @click="emit('select', item.key)"
                >
                    <div
                        v-if="item.maskUrl"
                        class="flex h-full w-full items-center justify-center bg-base-content"
                        :style="{ mask: `url(${item.maskUrl}) no-repeat center/68%` }"
                    />
                    <ImageFallback
                        v-else-if="!item.empty && item.icon"
                        :src="item.icon"
                        :alt="item.label ?? item.key"
                        class="h-full w-full object-cover object-top"
                    >
                        <Icon :icon="item.fallbackIcon ?? 'ri:user-line'" class="size-4 sm:size-5" />
                    </ImageFallback>
                    <div v-else class="flex h-full w-full items-center justify-center bg-base-100/50 text-base-content/40">
                        <Icon :icon="item.fallbackIcon ?? 'ri:user-line'" class="size-4 sm:size-5" />
                    </div>
                    <div class="absolute inset-0 bg-linear-to-t from-yellow-500/20 via-transparent to-transparent" />
                </div>
            </BuildTabTooltip>
        </div>
    </div>
</template>
