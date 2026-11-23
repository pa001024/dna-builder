<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { fmtInt, fmtPct, mobKindKey } from "@/components/log-analysis/format"
import type { AnalysisSession, MobKind } from "@/utils/log-analysis/types"

const props = defineProps<{ session: AnalysisSession }>()
const { t } = useTranslation()

/** 怪物类别方章的配色（BOSS/精英/普通/召唤物）。 */
function kindClass(kind: MobKind): string {
    switch (kind) {
        case 2:
            return "border-error/40 bg-error/10 text-error"
        case 1:
            return "border-warning/40 bg-warning/10 text-warning"
        case 3:
            return "border-info/40 bg-info/10 text-info"
        default:
            return "border-base-content/15 bg-base-content/5 text-base-content/55"
    }
}

const rows = computed(() => {
    const max = Math.max(1, ...props.session.composition.map(row => row.count))
    return props.session.composition.map((row, index) => ({
        key: `${row.name}-${index}`,
        name: row.name,
        kindLabel: t(mobKindKey(row.kind)),
        kindClass: kindClass(row.kind),
        count: fmtInt(row.count),
        pct: fmtPct(row.pct),
        width: Math.max(2, (row.count / max) * 100),
    }))
})
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="COMPOSITION" :title="$t('log-analysis.composition_title')">
            <template #trailing>
                <span class="font-orbitron text-sm font-semibold text-primary">{{ fmtInt(session.kills.length) }}</span>
            </template>
        </SectionHeader>

        <div v-if="rows.length" class="space-y-2.5">
            <div v-for="row in rows" :key="row.key" class="min-w-0">
                <div class="flex items-center gap-2 text-xs">
                    <span class="shrink-0 border px-1 text-[10px] leading-4" :class="row.kindClass">{{ row.kindLabel }}</span>
                    <span class="min-w-0 flex-1 truncate font-medium">{{ row.name }}</span>
                    <span class="shrink-0 font-orbitron text-[11px] text-primary">{{ row.pct }}</span>
                    <span class="w-12 shrink-0 text-right font-orbitron text-[11px] text-base-content/55">×{{ row.count }}</span>
                </div>
                <div class="mt-1 h-1 w-full bg-base-content/8">
                    <div class="h-full bg-primary/60" :style="{ width: `${row.width}%` }" />
                </div>
            </div>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-10 text-base-content/40">
            <Icon icon="ri:skull-line" class="mb-2 size-8 opacity-50" />
            <p class="text-xs">{{ $t("log-analysis.composition_empty") }}</p>
        </div>
    </section>
</template>
