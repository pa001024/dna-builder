<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { fmtDuration, fmtInt, fmtPct } from "@/components/log-analysis/format"
import type { AnalysisSession } from "@/utils/log-analysis/types"

const props = defineProps<{ session: AnalysisSession }>()
const { t } = useTranslation()

const place = computed(() => {
    const info = props.session.info
    if (info.dungeonName) return info.dungeonName
    if (info.gameName) return info.gameName
    if (info.dungeonId != null) return t("log-analysis.overview_place_fallback", { id: info.dungeonId })
    return info.hardBoss?.name ?? info.mapName ?? t("log-analysis.overview_unknown_place")
})

const metaBits = computed(() => {
    const info = props.session.info
    const bits: string[] = []
    // 副本局优先显示地图 ID（如 Prologue_AsycCombat），区域名只在野外局使用
    const mapLabel = info.dungeonId != null ? (info.mapId ?? info.mapName) : info.mapName
    if (mapLabel) bits.push(t("log-analysis.overview_map", { name: mapLabel }))
    if (info.level != null && Number.isFinite(info.level)) bits.push(`Lv.${info.level}`)
    if (info.mode) bits.push(info.mode)
    if (info.floor && Number.isFinite(info.floor.floor) && Number.isFinite(info.floor.monsterLevel)) {
        bits.push(t("log-analysis.overview_floor", { floor: info.floor.floor, level: info.floor.monsterLevel }))
    }
    if (info.hardBoss) {
        bits.push(
            t("log-analysis.overview_hardboss", {
                name: info.hardBoss.name ?? `BOSS ${info.hardBoss.bossId}`,
                diff: Number.isFinite(info.hardBoss.diff) ? info.hardBoss.diff : "—",
            })
        )
    }
    return bits
})

const summary = computed(() => {
    const session = props.session
    const backlog = session.gapSeries.length
        ? session.gapMax.gap > 0
            ? t("log-analysis.overview_backlog", { gap: fmtInt(session.gapMax.gap) })
            : t("log-analysis.overview_no_backlog")
        : t("log-analysis.overview_backlog_none")
    const top = session.board.length
        ? t("log-analysis.overview_top_damage", { name: session.board[0].name })
        : t("log-analysis.overview_no_damage")
    const concentration = session.concentration
        ? t("log-analysis.overview_concentration_short", { pct: fmtPct(session.concentration.share * 100) })
        : t("log-analysis.overview_no_concentration")
    return t("log-analysis.overview_summary", {
        place: place.value,
        duration: fmtDuration(session.wallDur),
        combat: fmtDuration(session.combatDur),
        kills: fmtInt(session.kills.length),
        bosses: fmtInt(session.bossKills.length),
        bursts: fmtInt(session.bursts.length),
        backlog,
        top,
        concentration,
    })
})

const facts = computed(() => {
    const session = props.session
    return [
        {
            key: "result",
            label: t("log-analysis.fact_result"),
            value: session.win == null ? t("log-analysis.result_unsettled") : session.win ? t("log-analysis.result_win") : t("log-analysis.result_lose"),
            tone: session.win == null ? "text-base-content/70" : session.win ? "text-success" : "text-error",
        },
        {
            key: "settle",
            label: t("log-analysis.fact_settle_time"),
            value: fmtDuration(session.playerTime),
            tone: "text-primary",
        },
        {
            key: "combat",
            label: t("log-analysis.fact_combat_time"),
            value: fmtDuration(session.combatDur),
            tone: "text-primary",
        },
    ]
})
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="OVERVIEW" :title="$t('log-analysis.overview_title')">
            <template #trailing>
                <span class="truncate text-[11px] text-base-content/50">{{ place }}</span>
            </template>
        </SectionHeader>

        <div v-if="metaBits.length" class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
            <span v-for="(bit, index) in metaBits" :key="`${bit}-${index}`" class="inline-flex items-center gap-2">
                <span v-if="index > 0" class="text-base-content/20" aria-hidden="true">·</span>
                <span>{{ bit }}</span>
            </span>
        </div>

        <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-3 py-2.5">
            <p class="text-xs leading-relaxed text-base-content/75">{{ summary }}</p>
        </div>

        <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div
                v-for="fact in facts"
                :key="fact.key"
                class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
            >
                <span class="min-w-0 truncate text-[11px] text-base-content/50">{{ fact.label }}</span>
                <span class="shrink-0 font-orbitron text-[13px] font-semibold" :class="fact.tone">{{ fact.value }}</span>
            </div>
            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="min-w-0 truncate text-[11px] text-base-content/50">{{ $t("log-analysis.party_title") }}</span>
                <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ session.party.length }}</span>
            </div>
        </div>

        <div class="mt-3 border-t border-base-content/10 pt-2">
            <div v-if="session.party.length" class="flex flex-wrap gap-1.5">
                <div
                    v-for="(slot, index) in session.party"
                    :key="`${slot.slot}-${index}`"
                    class="flex min-w-0 items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5"
                >
                    <span
                        class="shrink-0 border px-1 text-[10px] leading-4"
                        :class="
                            slot.role === 'main'
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-base-content/15 bg-base-content/5 text-base-content/55'
                        "
                    >
                        {{ slot.role === "main" ? $t("log-analysis.party_main") : $t("log-analysis.party_phantom") }}
                    </span>
                    <span class="min-w-0">
                        <span class="block truncate text-xs font-semibold">
                            {{ slot.name ?? slot.slot }}
                            <span v-if="slot.en" class="ml-1 text-[10px] font-normal text-base-content/45">{{ slot.en }}</span>
                        </span>
                        <span class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-base-content/45">
                            <span v-if="slot.eid != null && Number.isFinite(slot.eid)" class="font-mono">{{ $t("log-analysis.party_eid", { eid: slot.eid }) }}</span>
                            <CopyID v-if="slot.charId != null" :id="slot.charId" />
                            <span v-if="slot.casts != null && Number.isFinite(slot.casts)">{{ $t("log-analysis.party_casts", { count: slot.casts }) }}</span>
                        </span>
                    </span>
                </div>
            </div>
            <p v-else class="text-xs text-base-content/45">{{ $t("log-analysis.party_empty") }}</p>
        </div>
    </section>
</template>
