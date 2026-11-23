<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { fmtDuration, fmtInt, fmtNum } from "@/components/log-analysis/format"
import type { AnalysisSession } from "@/utils/log-analysis/types"

const props = defineProps<{ session: AnalysisSession }>()
const { t } = useTranslation()

const cells = computed(() => {
    const session = props.session
    const maxBurst = session.bursts.reduce((max, burst) => Math.max(max, burst.count), 0)
    return [
        {
            key: "kills",
            label: t("log-analysis.kpi_kills"),
            value: fmtInt(session.kills.length),
            unit: "",
            sub: session.bossKills.length
                ? t("log-analysis.kpi_boss_sub", { count: session.bossKills.length })
                : t("log-analysis.kpi_no_boss"),
        },
        {
            key: "rate",
            label: t("log-analysis.kpi_rate"),
            value: fmtNum(session.rate, 1),
            unit: t("log-analysis.unit_per_min"),
            sub: "",
        },
        {
            key: "bursts",
            label: t("log-analysis.kpi_bursts"),
            value: fmtInt(session.bursts.length),
            unit: "",
            sub: session.bursts.length ? t("log-analysis.kpi_burst_max", { count: maxBurst }) : "",
        },
        {
            key: "lifetime",
            label: session.lifetime ? t("log-analysis.kpi_lifetime") : t("log-analysis.kpi_monsters"),
            value: session.lifetime ? fmtDuration(session.lifetime.med) : fmtInt(session.composition.length),
            unit: "",
            sub: session.lifetime
                ? t("log-analysis.kpi_lifetime_p90", { value: fmtDuration(session.lifetime.p90) })
                : t("log-analysis.kpi_monsters_sub", { count: session.composition.length }),
        },
        {
            key: "peak",
            label: t("log-analysis.kpi_peak3"),
            value: fmtInt(session.peak3s),
            unit: "",
            sub: "",
        },
    ]
})
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="KPI" :title="$t('log-analysis.kpi_title')" />
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <div
                v-for="cell in cells"
                :key="cell.key"
                class="flex min-w-0 flex-col rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
            >
                <span class="text-[11px] tracking-wide text-base-content/50">{{ cell.label }}</span>
                <span class="mt-1 flex min-w-0 items-baseline gap-1">
                    <span class="truncate font-orbitron text-lg font-semibold leading-tight text-primary">{{ cell.value }}</span>
                    <span v-if="cell.unit" class="shrink-0 text-[10px] text-base-content/45">{{ cell.unit }}</span>
                </span>
                <span v-if="cell.sub" class="mt-0.5 truncate text-[10px] text-base-content/45">{{ cell.sub }}</span>
            </div>
        </div>
    </section>
</template>
