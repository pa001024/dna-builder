<script lang="ts" setup>
import type { ExtractionTreasureMechanism } from "@/data/d/solotreasure.data"
import { getRarityName } from "@/utils/rarity-utils"

defineProps<{
    mechanism: ExtractionTreasureMechanism
}>()
</script>

<template>
    <div class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
        <!-- 机关头部：名称 + ID -->
        <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 truncate text-sm font-medium">{{ mechanism.name }}</div>
            <CopyID :id="mechanism.id" />
        </div>

        <!-- 形状 / 数量区间 -->
        <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-xs text-base-content/60">形状</span>
                <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                    {{ mechanism.shape.join("x") }}
                </span>
            </div>
            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-xs text-base-content/60">数量区间</span>
                <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                    {{ mechanism.itemNumRange.join("~") }}
                </span>
            </div>
        </div>

        <!-- 权重 -->
        <div>
            <div class="text-[11px] tracking-wide text-base-content/55">权重</div>
            <p class="mt-1 text-[11px] tabular-nums leading-relaxed text-base-content/70">
                {{
                    Object.entries(mechanism.itemLevelWeight)
                        .map(([lv, weight]) => `${getRarityName(+lv)}:${weight * 100}%`)
                        .join(" / ")
                }}
            </p>
        </div>

        <!-- 数量 -->
        <div>
            <div class="text-[11px] tracking-wide text-base-content/55">数量</div>
            <p class="mt-1 text-[11px] tabular-nums leading-relaxed text-base-content/70">
                {{
                    Object.entries(mechanism.itemLevelLimit)
                        .map(([lv, count]) => `${getRarityName(+lv)}x${count}`)
                        .join(" / ")
                }}
            </p>
        </div>
    </div>
</template>
