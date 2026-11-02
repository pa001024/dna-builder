<script setup lang="ts">
import { computed } from "vue"
import { useHelpText } from "../../content/locale"
import type { DashboardShot } from "../../content/types"
import { clamp01, easeOutExpo, enterStyle, progressAt } from "./motion"

const props = defineProps<{ shot: DashboardShot; time: number; duration: number }>()
const tr = useHelpText()

const maxValue = computed(() => Math.max(1, ...(props.shot.chart?.values ?? [1])))

function barHeight(value: number, index: number): string {
    const p = easeOutExpo(progressAt(props.time, 0.55 + index * 0.05, 0.7))
    return `${(value / maxValue.value) * 100 * p}%`
}

const linePoints = computed(() => {
    const values = props.shot.chart?.values ?? []
    if (!values.length) return ""
    const step = 100 / Math.max(1, values.length - 1)
    return values.map((value, index) => `${index * step},${100 - (value / maxValue.value) * 92}`).join(" ")
})
</script>

<template>
    <div class="help-center-shot">
        <div class="help-panel w-[980px] px-6 py-5">
            <div class="flex items-end justify-between">
                <div>
                    <div class="help-kicker">{{ tr(shot.kicker ?? "") }}</div>
                    <h2 class="help-display mt-1 text-3xl">{{ tr(shot.title) }}</h2>
                </div>
                <div class="flex gap-2">
                    <span class="help-chip help-chip--accent">LIVE</span>
                    <span class="help-chip">{{ tr(shot.stats[0]?.label ?? "") }}</span>
                </div>
            </div>

            <div class="mt-5 grid gap-2" :style="{ gridTemplateColumns: `repeat(${Math.min(4, shot.stats.length)}, minmax(0, 1fr))` }">
                <div v-for="(stat, index) in shot.stats" :key="index" class="help-kpi" :style="enterStyle(time, 0.25 + index * 0.1, 0.5, 12)">
                    <div class="help-kpi__value" :class="{ 'help-kpi__value--accent': stat.accent }">
                        {{ stat.value }}<span v-if="stat.unit" class="ml-1 text-[13px] text-white/40">{{ stat.unit }}</span>
                    </div>
                    <div class="help-kpi__label">{{ tr(stat.label) }}</div>
                </div>
            </div>

            <div v-if="shot.chart" class="mt-5 border border-white/10 bg-white/3 p-4">
                <div class="flex items-center justify-between">
                    <div class="help-build-panel__title">TREND</div>
                    <div class="flex gap-1">
                        <span class="help-chip h-5! px-2! text-[9px]!">{{ tr(shot.chart.labels?.[0] ?? "") }}</span>
                    </div>
                </div>

                <div v-if="shot.chart.kind === 'bars'" class="help-bars">
                    <div
                        v-for="(value, index) in shot.chart.values"
                        :key="index"
                        class="flex h-full flex-1 flex-col items-center justify-end gap-1"
                    >
                        <div class="help-bars__bar w-full" :style="{ height: barHeight(value, index) }" />
                        <span v-if="shot.chart.labels?.[index]" class="truncate text-[8px] text-white/30">{{ tr(shot.chart.labels[index]) }}</span>
                    </div>
                </div>

                <svg v-else viewBox="0 0 100 100" preserveAspectRatio="none" class="h-36 w-full">
                    <polyline :points="linePoints" fill="none" stroke="var(--accent)" stroke-width="1.1" vector-effect="non-scaling-stroke" />
                    <polyline :points="`${linePoints} 100,100 0,100`" fill="color-mix(in oklch, var(--accent) 12%, transparent)" stroke="none" />
                </svg>
            </div>

            <div v-if="shot.rows?.length" class="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
                <div v-for="(row, index) in shot.rows" :key="index" class="flex items-center justify-between border-b border-white/8 py-2" :style="enterStyle(time, 0.6 + index * 0.07, 0.4, 8)">
                    <div class="min-w-0">
                        <div class="truncate text-[12px] text-white/70">{{ tr(row.label) }}</div>
                        <div v-if="row.meta" class="truncate text-[9px] text-white/30">{{ tr(row.meta) }}</div>
                    </div>
                    <span class="ml-3 shrink-0 font-orbitron text-[12px] text-white/80">{{ tr(row.value) }}</span>
                </div>
            </div>

            <div class="mt-4 flex justify-end">
                <span class="help-chip" :style="{ opacity: clamp01(progressAt(time, 1.4, 0.5)) }">
                    {{ tr(shot.kicker ?? "") }} · DNA BUILDER
                </span>
            </div>
        </div>
    </div>
</template>
