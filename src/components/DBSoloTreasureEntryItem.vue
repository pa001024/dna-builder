<script lang="ts" setup>
import { computed } from "vue"
import { type ExtractionTreasure, extractionTreasureTypeNameMap, soloTreasureRarityData } from "@/data/d/solotreasure.data"
import { getRarityGradientClass } from "@/utils/rarity-utils"

const props = defineProps<{
    treasure: ExtractionTreasure
}>()

const treasureWidth = computed(() => props.treasure.shape[0] || 0)
const treasureHeight = computed(() => props.treasure.shape[1] || 0)
const TREASURE_CELL_PX = 64

/**
 * 获取宝藏图片路径。
 * @returns 图片路径。
 */
function getTreasureImageUrl(): string {
    return `/imgs/res/${props.treasure.icon}.webp`
}

const rarity = computed(() => soloTreasureRarityData[props.treasure.rarity])
</script>

<template>
    <div class="space-y-3">
        <div class="flex items-center gap-3">
            <div class="flex-none">
                <img
                    class="size-12 rounded bg-linear-15"
                    :class="getRarityGradientClass(soloTreasureRarityData[treasure.rarity].show)"
                    :src="getTreasureImageUrl()"
                    alt="宝物图标"
                />
            </div>
            <div class="flex-1">
                <div class="flex justify-between items-center gap-1">
                    <div class="font-medium">{{ treasure.name }}</div>
                    <CopyID :id="treasure.id" />
                </div>
                <div class="flex gap-4 text-xs mt-2">
                    <span>{{ $t(extractionTreasureTypeNameMap[treasure.type]) }}</span>
                    <span>价值: {{ treasure.value }}</span>
                    <span>形状: {{ treasure.shape.join("x") }}</span>
                    <span>稀有度: {{ rarity.show }}</span>
                    <span>检视时间: {{ rarity.time }}s</span>
                </div>
            </div>
        </div>
        <div class="flex justify-center items-center">
            <div
                class="relative grid w-fit gap-0.5"
                :style="{
                    gridTemplateColumns: `repeat(${treasureWidth}, ${TREASURE_CELL_PX}px)`,
                    gridTemplateRows: `repeat(${treasureHeight}, ${TREASURE_CELL_PX}px)`,
                    aspectRatio: treasureWidth && treasureHeight ? `${treasureWidth}/${treasureHeight}` : '1 / 1',
                }"
            >
                <template v-for="row in treasureHeight" :key="row">
                    <div
                        v-for="cell in treasureWidth"
                        :key="`${row}-${cell}`"
                        class="border border-base-300/50 bg-primary/30 rounded"
                        :style="{
                            width: `${TREASURE_CELL_PX}px`,
                            height: `${TREASURE_CELL_PX}px`,
                        }"
                    />
                </template>
                <div class="pointer-events-none absolute inset-0 overflow-hidden">
                    <img :src="getTreasureImageUrl()" :alt="treasure.name" class="h-full w-full select-none object-contain" />
                </div>
            </div>
        </div>
    </div>
</template>
