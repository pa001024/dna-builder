<script setup lang="ts">
import { useSettingStore } from "@/store/setting"
import { copyText } from "@/util"

defineProps<{
    id: string | number
    name?: string
    compact?: boolean
    border?: boolean
}>()

const setting = useSettingStore()
</script>
<template>
    <!-- 隐藏ID开启时整组件不渲染（按钮连同内容一起消失） -->
    <template v-if="!setting.hideID">
        <button
            v-if="compact"
            type="button"
            class="truncate flex h-5 cursor-pointer items-center gap-0.5 whitespace-nowrap rounded-xs border border-base-content/15 bg-base-content/4 px-1 font-mono text-[10px] leading-none tabular-nums text-base-content/45 opacity-80 transition-all duration-200 hover:border-primary/50 hover:text-primary hover:opacity-100"
            :title="$t('copy-id.click_copy_id')"
            @click.stop="copyText(`${id}`)"
        >
            <span class="shrink-0 opacity-60">#</span>{{ id }}
        </button>
        <button
            v-else
            type="button"
            class="truncate cursor-pointer whitespace-nowrap rounded-xs border px-2 py-px text-[11px] transition-colors duration-150 active:scale-[0.97] text-base-content/60 hover:border-primary/60 hover:text-primary"
            :class="[border ? 'border-base-content/20' : 'border-transparent']"
            :title="$t('copy-id.click_copy', { name: name ?? 'ID' })"
            @click.stop="copyText(`${id}`)"
        >
            {{ name ?? "ID" }} {{ id }}
        </button>
    </template>
</template>
