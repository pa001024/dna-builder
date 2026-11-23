<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { fmtClock, fmtDuration } from "@/components/log-analysis/format"
import type { AnalysisSession } from "@/utils/log-analysis/types"

const props = defineProps<{ session: AnalysisSession }>()
const { t } = useTranslation()

const rows = computed(() =>
    props.session.bossKills.map((kill, index) => {
        const spawn = props.session.bossSpawns[index] ?? null
        const hasCoords = spawn != null && spawn.x != null && spawn.y != null
        return {
            key: `${kill.t}-${index}`,
            name: kill.name,
            spawnTime: spawn ? fmtClock(spawn.t) : "—",
            spawnMeta: spawn
                ? t(hasCoords ? "log-analysis.boss_coords_yes" : "log-analysis.boss_coords_no")
                : t("log-analysis.boss_spawn_missing"),
            spawnMetaClass: hasCoords ? "text-success/80" : "text-base-content/45",
            killTime: fmtClock(kill.t),
            lifetime: spawn ? fmtDuration(Math.max(0, kill.t - spawn.t)) : "—",
        }
    })
)
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="BOSSES" :title="$t('log-analysis.boss_title')">
            <template #trailing>
                <span class="font-orbitron text-sm font-semibold text-primary">{{ session.bossKills.length }}</span>
            </template>
        </SectionHeader>

        <div v-if="rows.length" class="overflow-x-auto">
            <table class="w-full min-w-136 text-left text-xs">
                <thead>
                    <tr class="border-b border-base-content/10 text-[11px] tracking-wide text-base-content/45">
                        <th class="py-1.5 pr-3 font-medium">{{ $t("log-analysis.boss_col_name") }}</th>
                        <th class="py-1.5 pr-3 font-medium">{{ $t("log-analysis.boss_col_spawn") }}</th>
                        <th class="py-1.5 pr-3 font-medium">{{ $t("log-analysis.boss_col_kill") }}</th>
                        <th class="py-1.5 pr-3 font-medium">{{ $t("log-analysis.boss_col_lifetime") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in rows" :key="row.key" class="border-b border-base-content/8 last:border-b-0">
                        <td class="py-2 pr-3">
                            <span class="inline-flex max-w-64 items-center gap-1.5 font-medium">
                                <Icon icon="ri:skull-line" class="size-3.5 shrink-0 text-error/70" />
                                <span class="truncate">{{ row.name }}</span>
                            </span>
                        </td>
                        <td class="py-2 pr-3">
                            <span class="block font-orbitron text-[12px] tabular-nums text-base-content/80">{{ row.spawnTime }}</span>
                            <span class="block text-[10px]" :class="row.spawnMetaClass">{{ row.spawnMeta }}</span>
                        </td>
                        <td class="py-2 pr-3 font-orbitron text-[12px] tabular-nums text-base-content/80">{{ row.killTime }}</td>
                        <td class="py-2 pr-3 font-orbitron text-[12px] tabular-nums text-primary">{{ row.lifetime }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-10 text-base-content/40">
            <Icon icon="ri:skull-line" class="mb-2 size-8 opacity-50" />
            <p class="text-xs">{{ $t("log-analysis.boss_empty") }}</p>
        </div>
    </section>
</template>
