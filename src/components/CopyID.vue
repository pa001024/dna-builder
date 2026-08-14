<script setup lang="ts">
import { copyText } from "@/util"

defineProps<{
    id: string | number
    name?: string
    /** 紧凑模式：仅显示 ID 数字，配合父级 group 在 hover 时展开 */
    compact?: boolean
}>()
</script>
<template>
    <button
        v-if="compact"
        type="button"
        class="flex h-5 max-w-8 cursor-pointer items-center gap-0.5 overflow-hidden whitespace-nowrap rounded bg-base-300/80 px-1.5 text-[10px] leading-none text-base-content/60 opacity-60 transition-all duration-200 hover:bg-primary/20 hover:text-primary hover:opacity-100 group-hover:max-w-24 group-hover:opacity-100"
        title="点击复制ID"
        @click.stop="copyText(`${id}`)"
    >
        <span class="shrink-0 opacity-60">#</span>{{ id }}
    </button>
    <button
        v-else
        type="button"
        class="px-1.5 py-0.5 cursor-pointer rounded bg-base-200/50 text-xs hover:bg-primary/20 transition-colors duration-200 whitespace-nowrap"
        :title="`点击复制${name ?? 'ID'}`"
        @click.stop="copyText(`${id}`)"
    >
        {{ name ?? "ID" }} {{ id }}
    </button>
</template>
