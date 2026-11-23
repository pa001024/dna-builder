<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { fmtInt, fmtNum, fmtRel } from "@/components/log-analysis/format"
import type { AnalysisSession } from "@/utils/log-analysis/types"

const props = defineProps<{ session: AnalysisSession }>()
const { t } = useTranslation()

const gapPoints = computed(() => props.session.gapSeries.map(point => ({ t: point.t, v: point.v })))
const alivePoints = computed(() => props.session.aliveSeries.map(point => ({ t: point.t, v: point.alive })))
const hasAny = computed(() => gapPoints.value.length > 0 || alivePoints.value.length > 0)

const gapMeta = computed(() => {
    const session = props.session
    if (!session.gapSeries.length) return t("log-analysis.supply_no_samples")
    if (session.gapMax.gap <= 0) return t("log-analysis.overview_no_backlog")
    return t("log-analysis.supply_gap_max", { gap: fmtInt(session.gapMax.gap), time: fmtNum(session.gapMax.t, 1) })
})

const alivePeak = computed(() => alivePoints.value.reduce((max, point) => Math.max(max, point.v), 0))
const aliveMeta = computed(() =>
    alivePoints.value.length ? t("log-analysis.supply_alive_peak", { count: fmtInt(alivePeak.value) }) : t("log-analysis.supply_no_samples")
)
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="SUPPLY" :title="$t('log-analysis.supply_title')" />
        <p class="mb-2 text-xs text-base-content/55">{{ $t("log-analysis.supply_desc") }}</p>

        <div v-if="hasAny" class="grid gap-2 sm:grid-cols-2">
            <div class="min-w-0 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] tracking-wide text-base-content/50">{{ $t("log-analysis.supply_gap") }}</span>
                    <span class="truncate text-[10px] text-base-content/45" :title="gapMeta">{{ gapMeta }}</span>
                </div>
                <template v-if="gapPoints.length">
                    <LogLineChart :points="gapPoints" stroke-class="stroke-primary" fill-class="fill-primary/10" />
                    <div class="flex items-center justify-between text-[10px] text-base-content/40">
                        <span class="font-orbitron tabular-nums">{{ fmtRel(gapPoints[0]?.t) }}</span>
                        <span class="font-orbitron tabular-nums">{{ fmtRel(gapPoints[gapPoints.length - 1]?.t) }}</span>
                    </div>
                </template>
                <p v-else class="py-8 text-center text-[11px] text-base-content/40">{{ $t("log-analysis.supply_no_samples") }}</p>
            </div>

            <div class="min-w-0 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] tracking-wide text-base-content/50">{{ $t("log-analysis.supply_alive") }}</span>
                    <span class="truncate text-[10px] text-base-content/45" :title="aliveMeta">{{ aliveMeta }}</span>
                </div>
                <template v-if="alivePoints.length">
                    <LogLineChart :points="alivePoints" stroke-class="stroke-success" fill-class="fill-success/10" />
                    <div class="flex items-center justify-between text-[10px] text-base-content/40">
                        <span class="font-orbitron tabular-nums">{{ fmtRel(alivePoints[0]?.t) }}</span>
                        <span class="font-orbitron tabular-nums">{{ fmtRel(alivePoints[alivePoints.length - 1]?.t) }}</span>
                    </div>
                </template>
                <p v-else class="py-8 text-center text-[11px] text-base-content/40">{{ $t("log-analysis.supply_no_samples") }}</p>
            </div>
        </div>

        <div v-else class="flex flex-col items-center justify-center py-8 text-center text-base-content/40">
            <Icon icon="ri:line-chart-line" class="mb-2 size-8 opacity-50" />
            <p class="text-xs font-medium">{{ $t("log-analysis.supply_empty_title") }}</p>
            <p class="mt-1 max-w-md text-[11px] text-base-content/45">{{ $t("log-analysis.supply_empty") }}</p>
        </div>
    </section>
</template>
