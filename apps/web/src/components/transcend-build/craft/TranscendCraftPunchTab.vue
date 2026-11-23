<script setup lang="ts">
import type { TranscendGearItemConfig } from "@/data"
import TranscendGearSocketEditor from "../TranscendGearSocketEditor.vue"

/**
 * 镶嵌 tab：直接呈现与孔位弹窗共用的编辑器（添加镶孔 → 镶嵌 / 替换 → 拆取），
 * 不再使用子模式切换；craft 5/6/7 的成本、空孔限制与重复宝石规则由编辑器统一处理。
 */
const props = defineProps<{
    item: TranscendGearItemConfig
    slotId: number
    preserveUnknown: boolean
}>()

const emit = defineEmits<{
    (event: "apply", item: TranscendGearItemConfig): void
}>()
</script>

<template>
    <div class="space-y-2" data-craft-panel="punch">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-[11px] font-medium text-base-content/75">{{ $t("transcend-build.craft_tab_punch") }}</span>
            <span class="text-[10px] leading-relaxed text-base-content/40">{{ $t("transcend-build.craft_punch_desc") }}</span>
        </div>
        <TranscendGearSocketEditor
            :item="props.item"
            :slot-id="props.slotId"
            :preserve-unknown="props.preserveUnknown"
            @apply="emit('apply', $event)"
        />
    </div>
</template>
