<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { deathReasonKey, fmtDuration, fmtInt } from "@/components/log-analysis/format"
import type { AnalysisSession } from "@/utils/log-analysis/types"

const props = defineProps<{ session: AnalysisSession }>()
const { t } = useTranslation()

const stats = computed(() => [
    { key: "combat", label: t("log-analysis.stats_combat_duration"), value: fmtDuration(props.session.combatDur) },
    { key: "player", label: t("log-analysis.stats_player_time"), value: fmtDuration(props.session.playerTime) },
    { key: "damage", label: t("log-analysis.stats_total_damage"), value: fmtInt(props.session.totalDamage) },
    { key: "kills", label: t("log-analysis.stats_kills"), value: fmtInt(props.session.kills.length) },
])

const deaths = computed(() => {
    const max = Math.max(1, ...props.session.deathsByReason.map(row => row.count))
    return props.session.deathsByReason.map((row, index) => {
        const key = deathReasonKey(row.reason)
        return {
            key: `${row.reason}-${index}`,
            label: key ? t(key) : row.reason,
            raw: key ? row.reason : null,
            count: fmtInt(row.count),
            width: Math.max(4, (row.count / max) * 100),
        }
    })
})
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="SETTLEMENT" :title="$t('log-analysis.stats_title')" />

        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div
                v-for="stat in stats"
                :key="stat.key"
                class="flex min-w-0 flex-col rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
            >
                <span class="truncate text-[10px] text-base-content/45">{{ stat.label }}</span>
                <span class="mt-0.5 truncate font-orbitron text-[13px] font-semibold text-primary">{{ stat.value }}</span>
            </div>
        </div>

        <div class="mt-3 border-t border-base-content/10 pt-2">
            <p class="mb-1.5 text-[11px] tracking-wide text-base-content/50">{{ $t("log-analysis.stats_deaths") }}</p>
            <div v-if="deaths.length" class="space-y-1.5">
                <div v-for="row in deaths" :key="row.key" class="min-w-0">
                    <div class="flex items-center justify-between gap-2 text-xs">
                        <span class="min-w-0 truncate">
                            {{ row.label }}
                            <span v-if="row.raw" class="ml-1 text-[10px] text-base-content/40">({{ row.raw }})</span>
                        </span>
                        <span class="shrink-0 font-orbitron text-[11px] text-primary">{{ row.count }}</span>
                    </div>
                    <div class="mt-1 h-1 w-full bg-base-content/8">
                        <div class="h-full bg-error/50" :style="{ width: `${row.width}%` }" />
                    </div>
                </div>
            </div>
            <p v-else class="py-3 text-center text-[11px] text-base-content/40">{{ $t("log-analysis.stats_deaths_empty") }}</p>
        </div>
    </section>
</template>
