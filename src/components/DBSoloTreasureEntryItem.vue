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
    <div class="stagger-rise space-y-3">
        <!-- 宝物档案头：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                Treasure File
            </p>
            <div class="flex items-start gap-3.5">
                <img
                    class="size-14 shrink-0 rounded-xs bg-linear-15"
                    :class="getRarityGradientClass(soloTreasureRarityData[treasure.rarity].show)"
                    :src="getTreasureImageUrl()"
                    alt="宝物图标"
                />
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h2 class="truncate text-xl font-bold leading-tight tracking-tight">{{ treasure.name }}</h2>
                        <CopyID :id="treasure.id" />
                    </div>
                    <div class="mt-1.5 text-sm text-base-content/60">{{ $t(extractionTreasureTypeNameMap[treasure.type]) }}</div>
                </div>
            </div>
        </header>

        <!-- 基础信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="OVERVIEW" title="基础信息" />
            <div class="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
                <div
                    v-for="stat in [
                        { label: '价值', value: String(treasure.value) },
                        { label: '形状', value: treasure.shape.join('x') },
                        { label: '稀有度', value: rarity.show },
                        { label: '检视时间', value: `${rarity.time}s` },
                    ]"
                    :key="stat.label"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ stat.label }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ stat.value }}</span>
                </div>
            </div>
        </section>

        <!-- 形状占位 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SHAPE" title="形状占位" />
            <div class="flex justify-center items-center py-2">
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
                            class="rounded-xs border border-primary/40 bg-primary/25"
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
        </section>
    </div>
</template>
