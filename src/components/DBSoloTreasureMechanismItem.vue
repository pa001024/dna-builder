<script lang="ts" setup>
import type { ExtractionTreasureMechanism } from "@/data/d/solotreasure.data"
import { getRarityName } from "@/utils/rarity-utils"

defineProps<{
    mechanism: ExtractionTreasureMechanism
}>()
</script>

<template>
    <div class="space-y-3">
        <div class="flex items-start justify-between gap-3">
            <div class="font-medium text-sm">{{ mechanism.name }}</div>
            <CopyID :id="mechanism.id" />
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs text-base-content/70">
            <div>形状: {{ mechanism.shape.join("x") }}</div>
            <div>数量区间: {{ mechanism.itemNumRange.join("~") }}</div>
        </div>
        <div class="text-xs text-base-content/70">
            权重:
            {{
                Object.entries(mechanism.itemLevelWeight)
                    .map(([lv, weight]) => `${getRarityName(+lv)}:${weight * 100}%`)
                    .join(" / ")
            }}
        </div>
        <div class="text-xs text-base-content/70">
            数量:
            {{
                Object.entries(mechanism.itemLevelLimit)
                    .map(([lv, count]) => `${getRarityName(+lv)}x${count}`)
                    .join(" / ")
            }}
        </div>
    </div>
</template>
