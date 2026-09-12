<script lang="ts" setup>
import { computed } from "vue"
import type { ExtractionTreasureContainer } from "@/data/d/solotreasure.data"
import { format100 } from "@/util"
import { getRarityBadgeClass, getRarityName } from "@/utils/rarity-utils"

const props = defineProps<{
    container: ExtractionTreasureContainer
}>()

/** 容器格位边长（px），按 shape 画出容器占格 */
const CONTAINER_CELL_PX = 40

/** 掉落权重条目：稀有度等级 + 权重百分比 + 条形宽度，按等级升序 */
const levelWeights = computed(() =>
    Object.entries(props.container.itemLevelWeight)
        .map(([level, weight]) => ({
            level: Number(level),
            percent: format100(weight, 1),
            width: `${Math.min(100, Math.max(0, weight * 100))}%`,
        }))
        .sort((left, right) => left.level - right.level)
)

/** 等级数量条目：稀有度等级 + 掉落上限，按等级升序 */
const levelLimits = computed(() =>
    Object.entries(props.container.itemLevelLimit)
        .map(([level, count]) => ({ level: Number(level), count }))
        .sort((left, right) => left.level - right.level)
)

/** 容器格位列数（shape[0]） */
const shapeColumns = computed(() => props.container.shape[0] || 0)
/** 容器格位行数（shape[1]） */
const shapeRows = computed(() => props.container.shape[1] || 0)

/** 爆率文本：未被 SoloTreasureDrop 引用的容器没有爆率字段 */
const dropRateText = computed(() => (props.container.dropRate === undefined ? "—" : format100(props.container.dropRate, 1)))
</script>

<template>
    <div class="stagger-rise space-y-3">
        <!-- 容器档案头：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                Container File
            </p>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 class="truncate text-xl font-bold leading-tight tracking-tight">{{ container.name }}</h2>
                <CopyID :id="container.id" />
            </div>
            <p class="mt-2 font-mono text-[11px] tracking-wide text-base-content/45">{{ container.bp }}</p>
        </header>

        <!-- 基础信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="OVERVIEW" title="基础信息" />
            <div class="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
                <div
                    v-for="stat in [
                        { label: '爆率', value: dropRateText },
                        { label: '形状', value: `${shapeColumns}x${shapeRows}` },
                        { label: '掉落数量', value: container.itemNumRange.join('~') },
                    ]"
                    :key="stat.label"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="shrink-0 text-xs text-base-content/60">{{ stat.label }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ stat.value }}</span>
                </div>
            </div>
        </section>

        <!-- 掉落权重 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DROP WEIGHT" title="掉落权重" :count="levelWeights.length" />
            <div v-if="levelWeights.length" class="space-y-1.5">
                <div v-for="entry in levelWeights" :key="entry.level" class="flex items-center gap-2">
                    <span :class="getRarityBadgeClass(entry.level)">{{ getRarityName(entry.level) }}</span>
                    <span class="h-1.5 min-w-0 flex-1 bg-base-content/10">
                        <span class="block h-full bg-primary" :style="{ width: entry.width }" />
                    </span>
                    <span class="w-11 shrink-0 text-right font-orbitron text-[12px] font-semibold tabular-nums text-primary">
                        {{ entry.percent }}
                    </span>
                </div>
            </div>
            <div v-else class="text-sm text-base-content/70">暂无掉落权重</div>
        </section>

        <!-- 等级数量 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LEVEL LIMIT" title="等级数量" :count="levelLimits.length" />
            <div v-if="levelLimits.length" class="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
                <div
                    v-for="entry in levelLimits"
                    :key="entry.level"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span :class="getRarityBadgeClass(entry.level)">{{ getRarityName(entry.level) }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        x{{ entry.count }}
                    </span>
                </div>
            </div>
            <div v-else class="text-sm text-base-content/70">暂无等级数量限制</div>
        </section>

        <!-- 容器格位 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SHAPE" title="容器格位" />
            <div class="flex justify-center items-center py-2">
                <div
                    v-if="shapeColumns && shapeRows"
                    class="grid w-fit gap-0.5"
                    :style="{
                        gridTemplateColumns: `repeat(${shapeColumns}, ${CONTAINER_CELL_PX}px)`,
                        gridTemplateRows: `repeat(${shapeRows}, ${CONTAINER_CELL_PX}px)`,
                    }"
                >
                    <div
                        v-for="cell in shapeColumns * shapeRows"
                        :key="cell"
                        class="rounded-xs border border-primary/40 bg-primary/25"
                        :style="{
                            width: `${CONTAINER_CELL_PX}px`,
                            height: `${CONTAINER_CELL_PX}px`,
                        }"
                    />
                </div>
                <div v-else class="text-sm text-base-content/70">暂无格位数据</div>
            </div>
        </section>
    </div>
</template>
