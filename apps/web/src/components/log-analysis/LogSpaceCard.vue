<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, reactive } from "vue"
import { fmtInt, fmtPct } from "@/components/log-analysis/format"
import type { AnalysisSession } from "@/utils/log-analysis/types"

const props = defineProps<{ session: AnalysisSession }>()
const { t } = useTranslation()

/** 命中点最多绘制数量，避免大日志一次渲染数十万 SVG 节点。 */
const MAX_HIT_POINTS = 1200

const layers = reactive({ kills: true, hits: true, bossSpawns: true })
type LayerKey = keyof typeof layers

const bounds = computed(() => props.session.space.bounds)

const bossSpawnPoints = computed(() =>
    props.session.bossSpawns.flatMap(spawn =>
        spawn && spawn.x != null && spawn.y != null ? [{ x: spawn.x, y: spawn.y, t: spawn.t }] : []
    )
)

/** 等比投影：取 XY 跨度较大的一方铺满 96×96，Y 轴翻转，四周留 2 单位边距。 */
const projection = computed(() => {
    const box = bounds.value
    if (!box) return null
    const spanX = Math.max(1e-6, box.maxX - box.minX)
    const spanY = Math.max(1e-6, box.maxY - box.minY)
    const scale = 96 / Math.max(spanX, spanY)
    const offsetX = (100 - spanX * scale) / 2
    const offsetY = (100 - spanY * scale) / 2
    return {
        x: (value: number) => Math.min(99, Math.max(1, offsetX + (value - box.minX) * scale)),
        y: (value: number) => Math.min(99, Math.max(1, offsetY + (box.maxY - value) * scale)),
    }
})

const killPoints = computed(() => {
    const project = projection.value
    if (!project) return []
    return props.session.space.kills.map((point, index) => ({
        key: `${point.t}-${index}`,
        cx: project.x(point.x),
        cy: project.y(point.y),
        boss: point.boss,
    }))
})

const hitMarks = computed(() => {
    const project = projection.value
    if (!project) return []
    const hits = props.session.space.hits
    const stride = Math.max(1, Math.ceil(hits.length / MAX_HIT_POINTS))
    const marks: Array<{ key: string; d: string }> = []
    for (let index = 0; index < hits.length; index += stride) {
        const hit = hits[index]
        const cx = project.x(hit.x)
        const cy = project.y(hit.y)
        const half = 0.55
        marks.push({
            key: `${index}`,
            d: `M${(cx - half).toFixed(2)} ${cy.toFixed(2)}H${(cx + half).toFixed(2)}M${cx.toFixed(2)} ${(cy - half).toFixed(2)}V${(cy + half).toFixed(2)}`,
        })
    }
    return marks
})

const bossMarks = computed(() => {
    const project = projection.value
    if (!project) return []
    return bossSpawnPoints.value.map((point, index) => ({
        key: `${point.t}-${index}`,
        cx: project.x(point.x),
        cy: project.y(point.y),
    }))
})

const hasSpace = computed(
    () => !!projection.value && (killPoints.value.length > 0 || hitMarks.value.length > 0 || bossMarks.value.length > 0)
)

const bossKillCount = computed(() => props.session.space.kills.filter(point => point.boss).length)
const normalKillCount = computed(() => props.session.space.kills.length - bossKillCount.value)

const concentrationText = computed(() => {
    const concentration = props.session.concentration
    if (!concentration) return t("log-analysis.space_no_concentration")
    return t("log-analysis.space_concentration", {
        pct: fmtPct(concentration.share * 100),
        cells: fmtInt(concentration.cells),
    })
})

function toggleLayer(key: LayerKey) {
    layers[key] = !layers[key]
}
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="SPATIAL" :title="$t('log-analysis.space_title')" />
        <p class="mb-2 text-xs text-base-content/55">{{ $t("log-analysis.space_desc") }}</p>

        <div class="mb-2 flex flex-wrap items-center gap-1.5">
            <button
                type="button"
                class="btn btn-xs whitespace-nowrap"
                :class="layers.kills ? 'border-primary bg-primary/10 font-semibold text-primary' : ''"
                @click="toggleLayer('kills')"
            >
                {{ $t("log-analysis.layer_kills") }}
                <span class="font-orbitron text-[11px]">{{ fmtInt(session.space.kills.length) }}</span>
            </button>
            <button
                type="button"
                class="btn btn-xs whitespace-nowrap"
                :class="layers.hits ? 'border-primary bg-primary/10 font-semibold text-primary' : ''"
                @click="toggleLayer('hits')"
            >
                {{ $t("log-analysis.layer_hits") }}
                <span class="font-orbitron text-[11px]">{{ fmtInt(session.space.hits.length) }}</span>
            </button>
            <button
                type="button"
                class="btn btn-xs whitespace-nowrap"
                :class="layers.bossSpawns ? 'border-warning bg-warning/10 font-semibold text-warning' : ''"
                @click="toggleLayer('bossSpawns')"
            >
                {{ $t("log-analysis.layer_boss_spawns") }}
                <span class="font-orbitron text-[11px]">{{ fmtInt(bossSpawnPoints.length) }}</span>
            </button>
        </div>

        <div v-if="hasSpace" class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)]">
            <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" class="mx-auto aspect-square w-full max-w-100">
                <rect x="0" y="0" width="100" height="100" class="fill-base-content/3" />
                <g class="stroke-base-content/10" stroke-width="0.2">
                    <line v-for="n in 3" :key="`v-${n}`" :x1="n * 25" y1="0" :x2="n * 25" y2="100" vector-effect="non-scaling-stroke" />
                    <line v-for="n in 3" :key="`h-${n}`" x1="0" :y1="n * 25" x2="100" :y2="n * 25" vector-effect="non-scaling-stroke" />
                </g>
                <template v-if="layers.bossSpawns">
                    <circle
                        v-for="mark in bossMarks"
                        :key="mark.key"
                        :cx="mark.cx"
                        :cy="mark.cy"
                        r="1.8"
                        fill="none"
                        class="stroke-warning"
                        stroke-width="0.7"
                        vector-effect="non-scaling-stroke"
                    />
                </template>
                <template v-if="layers.hits">
                    <path
                        v-for="mark in hitMarks"
                        :key="mark.key"
                        :d="mark.d"
                        fill="none"
                        class="stroke-base-content/35"
                        stroke-width="0.5"
                        vector-effect="non-scaling-stroke"
                    />
                </template>
                <template v-if="layers.kills">
                    <circle
                        v-for="mark in killPoints"
                        :key="mark.key"
                        :cx="mark.cx"
                        :cy="mark.cy"
                        :r="mark.boss ? 1.3 : 0.9"
                        :class="mark.boss ? 'fill-primary' : 'fill-base-content/60'"
                    />
                </template>
            </svg>

            <div class="flex min-w-0 flex-col justify-between gap-2">
                <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <p class="text-[11px] text-base-content/55">{{ concentrationText }}</p>
                </div>
                <div class="space-y-1.5">
                    <div class="flex items-center gap-2 text-[11px] text-base-content/55">
                        <span class="size-2 shrink-0 bg-primary" aria-hidden="true" />
                        {{ $t("log-analysis.space_legend_boss") }}
                        <span class="ml-auto font-orbitron">{{ fmtInt(bossKillCount) }}</span>
                    </div>
                    <div class="flex items-center gap-2 text-[11px] text-base-content/55">
                        <span class="size-2 shrink-0 bg-base-content/60" aria-hidden="true" />
                        {{ $t("log-analysis.space_legend_normal") }}
                        <span class="ml-auto font-orbitron">{{ fmtInt(normalKillCount) }}</span>
                    </div>
                    <div class="flex items-center gap-2 text-[11px] text-base-content/55">
                        <Icon icon="ri:crosshair-line" class="size-3 shrink-0" />
                        {{ $t("log-analysis.layer_hits") }}
                        <span class="ml-auto font-orbitron">{{ fmtInt(session.space.hits.length) }}</span>
                    </div>
                    <div class="flex items-center gap-2 text-[11px] text-base-content/55">
                        <span class="size-2 shrink-0 border border-warning" aria-hidden="true" />
                        {{ $t("log-analysis.layer_boss_spawns") }}
                        <span class="ml-auto font-orbitron">{{ fmtInt(bossSpawnPoints.length) }}</span>
                    </div>
                </div>
                <p class="text-[10px] text-base-content/40">{{ $t("log-analysis.space_desc") }}</p>
            </div>
        </div>

        <div v-else class="flex flex-col items-center justify-center py-10 text-base-content/40">
            <Icon icon="ri:map-2-line" class="mb-2 size-8 opacity-50" />
            <p class="text-xs">{{ $t("log-analysis.space_empty") }}</p>
        </div>
    </section>
</template>
