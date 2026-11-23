<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { fmtInt, fmtNum, fmtPct } from "@/components/log-analysis/format"
import type { AnalysisSession } from "@/utils/log-analysis/types"

const props = defineProps<{ session: AnalysisSession }>()
const { t } = useTranslation()

const rows = computed(() => {
    const maxDamage = Math.max(1, ...props.session.board.map(row => row.damage))
    return props.session.board.map((row, index) => ({
        key: `${row.name}-${index}`,
        rank: String(index + 1).padStart(2, "0"),
        name: row.name,
        damage: fmtInt(row.damage),
        pct: fmtPct(row.pct),
        dps: fmtInt(row.dps),
        mvp: row.mvp,
        width: Math.max(2, (row.damage / maxDamage) * 100),
    }))
})

const summary = computed(() => [
    { key: "score", label: t("log-analysis.board_score"), value: fmtNum(props.session.mvpScore, 3) },
    { key: "factor", label: t("log-analysis.board_factor"), value: fmtNum(props.session.mvpFactor, 3) },
    { key: "total", label: t("log-analysis.board_total"), value: fmtInt(props.session.totalDamage) },
])
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="DAMAGE" :title="$t('log-analysis.board_title')" />

        <div v-if="rows.length" class="space-y-1.5">
            <div class="flex items-center gap-2 px-1 text-[10px] text-base-content/40">
                <span class="w-5 shrink-0">#</span>
                <span class="min-w-0 flex-1" />
                <span class="shrink-0">{{ $t("log-analysis.board_damage") }}</span>
                <span class="w-14 shrink-0 text-right">{{ $t("log-analysis.board_share") }}</span>
            </div>
            <div
                v-for="row in rows"
                :key="row.key"
                class="min-w-0 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
            >
                <div class="flex items-center gap-2 text-xs">
                    <span class="shrink-0 font-orbitron text-[11px] text-base-content/45">{{ row.rank }}</span>
                    <span class="min-w-0 flex-1 truncate font-semibold" :class="{ 'text-primary': row.mvp }">{{ row.name }}</span>
                    <span
                        v-if="row.mvp"
                        class="shrink-0 border border-primary/40 bg-primary/10 px-1 text-[10px] font-semibold leading-4 text-primary"
                    >
                        {{ $t("log-analysis.board_mvp") }}
                    </span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ row.damage }}</span>
                    <span class="w-14 shrink-0 text-right font-orbitron text-[11px] text-base-content/55">{{ row.pct }}</span>
                </div>
                <div class="mt-1 h-1 w-full bg-base-content/8">
                    <div class="h-full bg-primary/60" :style="{ width: `${row.width}%` }" />
                </div>
                <div class="mt-1 flex items-center justify-end text-[10px] text-base-content/40">
                    <span class="font-orbitron tabular-nums">{{ $t("log-analysis.board_dps") }} {{ row.dps }}</span>
                </div>
            </div>
        </div>

        <div v-else class="flex flex-col items-center justify-center py-8 text-center text-base-content/40">
            <Icon icon="ri:trophy-line" class="mb-2 size-8 opacity-50" />
            <p class="max-w-md text-xs">{{ $t("log-analysis.board_empty") }}</p>
        </div>

        <div v-if="rows.length" class="mt-2 grid grid-cols-3 gap-2">
            <div
                v-for="item in summary"
                :key="item.key"
                class="flex flex-col rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
            >
                <span class="truncate text-[10px] text-base-content/45">{{ item.label }}</span>
                <span class="mt-0.5 truncate font-orbitron text-[13px] font-semibold text-primary">{{ item.value }}</span>
            </div>
        </div>
    </section>
</template>
