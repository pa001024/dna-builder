<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { fmtClock, fmtNum } from "@/components/log-analysis/format"
import type { AnalysisSession } from "@/utils/log-analysis/types"

const props = defineProps<{ session: AnalysisSession }>()
const { t } = useTranslation()

const bars = computed(() => {
    const session = props.session
    const max = Math.max(1, ...session.rhythm.map(point => point.v))
    const step = session.rhythmBucket
    return session.rhythm.map((point, index) => ({
        key: `${point.t}-${index}`,
        height: point.v > 0 ? Math.max(3, (point.v / max) * 100) : 0,
        title: t("log-analysis.rhythm_tooltip", {
            start: fmtNum(point.t, 1),
            end: fmtNum(point.t + step, 1),
            count: point.v,
        }),
    }))
})

const axisEnd = computed(() => {
    const rhythm = props.session.rhythm
    const last = rhythm[rhythm.length - 1]
    return last ? props.session.start + last.t + props.session.rhythmBucket : props.session.end
})

const bossMarks = computed(() => {
    const session = props.session
    const span = Math.max(0.001, axisEnd.value - session.start)
    return session.bossKills.map((kill, index) => ({
        key: `${kill.t}-${index}`,
        left: `${Math.min(100, Math.max(0, ((kill.t - session.start) / span) * 100))}%`,
        title: `${kill.name} · ${fmtClock(kill.t)}`,
    }))
})
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="RHYTHM" :title="$t('log-analysis.rhythm_title')">
            <template #trailing>
                <span class="font-orbitron text-sm font-semibold text-primary">{{ session.kills.length }}</span>
            </template>
        </SectionHeader>
        <p class="mb-2 text-xs text-base-content/55">
            {{ $t("log-analysis.rhythm_desc", { bucket: fmtNum(session.rhythmBucket, 0) }) }}
        </p>

        <div v-if="bars.length" class="relative h-32 border-b border-base-content/15">
            <div class="flex h-full items-end gap-px">
                <div v-for="bar in bars" :key="bar.key" class="group relative min-w-0 flex-1" :title="bar.title">
                    <div
                        class="absolute inset-x-0 bottom-0 bg-primary/65 transition-colors duration-150 group-hover:bg-primary"
                        :style="{ height: `${bar.height}%` }"
                    />
                </div>
            </div>
            <span
                v-for="mark in bossMarks"
                :key="mark.key"
                class="pointer-events-none absolute inset-y-0 w-px bg-error/80"
                :title="mark.title"
                :style="{ left: mark.left }"
            />
        </div>
        <div v-else class="flex flex-col items-center justify-center py-10 text-base-content/40">
            <Icon icon="ri:bar-chart-line" class="mb-2 size-8 opacity-50" />
            <p class="text-xs">{{ $t("log-analysis.rhythm_empty") }}</p>
        </div>

        <div class="mt-1 flex items-center justify-between gap-2 text-[10px] text-base-content/45">
            <span class="font-orbitron tabular-nums">{{ fmtClock(session.start) }}</span>
            <span v-if="bossMarks.length" class="inline-flex items-center gap-1">
                <span class="h-2.5 w-px bg-error/80" aria-hidden="true" />
                {{ $t("log-analysis.rhythm_boss_mark") }}
            </span>
            <span class="font-orbitron tabular-nums">{{ fmtClock(axisEnd) }}</span>
        </div>
    </section>
</template>
