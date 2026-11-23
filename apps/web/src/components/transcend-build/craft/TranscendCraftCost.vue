<script setup lang="ts">
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { TranscendGearCraftState } from "@/data"
import { getGearCraftCostLines } from "@/utils/transcend-gear/display"

/**
 * craft 成本明细（只展示、不扣除）：材料与货币按附魔次数成长后逐行显示。
 */
const props = withDefaults(
    defineProps<{
        craftId: number
        /** craft 状态（附魔次数决定成长倍率） */
        state?: Pick<TranscendGearCraftState, "enchantCount"> | number
        /** 是否显示「消耗」前缀 */
        showLabel?: boolean
        /** 是否显示成长倍率 */
        showMultiplier?: boolean
    }>(),
    { state: undefined, showLabel: true, showMultiplier: true }
)

const costs = computed(() => getGearCraftCostLines(props.craftId, props.state))
const { gt } = useGameText()
</script>

<template>
    <span class="flex flex-wrap items-center gap-1.5 text-[10px] text-base-content/45" data-craft-cost>
        <span v-if="showLabel">{{ $t("transcend-build.craft_cost") }}</span>
        <span v-for="row in costs.rows" :key="row.id" class="inline-flex items-center gap-1" :data-cost-id="row.id">
            <ImageFallback :src="row.icon" :alt="row.name" class="size-4 shrink-0 overflow-hidden rounded-xs">
                <span class="flex size-4 items-center justify-center text-base-content/30"><Icon icon="ri:sparkling-line" /></span>
            </ImageFallback>
            <span>{{ row.name ? gt(row.name) : `#${row.id}` }}</span>
            <b class="font-orbitron text-primary">{{ row.count }}</b>
        </span>
        <span v-if="!costs.rows.length">{{ $t("transcend-build.craft_cost_none") }}</span>
        <span v-if="showMultiplier && costs.multiplier > 1" class="text-base-content/40">
            {{ $t("transcend-build.craft_enchant_multiplier", { multiplier: costs.multiplier }) }}
        </span>
    </span>
</template>
