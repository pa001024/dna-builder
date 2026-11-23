<script lang="ts" setup>
import { computed } from "vue"
import type { IconTypes } from "@/components/Icon.vue"
import { fmtClock } from "@/components/log-analysis/format"
import type { AnalysisSession, EventRow } from "@/utils/log-analysis/types"

const props = defineProps<{ session: AnalysisSession }>()

interface TimelineRow {
    key: string
    time: string
    icon: IconTypes
    tone: string
    title: string
    detail: string
}

const KIND_STYLES: Record<string, { icon: IconTypes; tone: string }> = {
    enter: { icon: "ri:login-box-line", tone: "text-primary" },
    boss: { icon: "ri:skull-line", tone: "text-error" },
    team: { icon: "ri:team-line", tone: "text-base-content/55" },
    settle: { icon: "ri:trophy-line", tone: "text-success" },
}

/** 事件 kind → 图标与颜色；Rift 系列统一使用秘境图标。 */
function kindStyle(kind: string): { icon: IconTypes; tone: string } {
    if (kind.startsWith("rift-")) return { icon: "ri:magic-line", tone: "text-secondary" }
    return KIND_STYLES[kind] ?? { icon: "ri:information-line", tone: "text-base-content/50" }
}

function toTimeline(event: EventRow, index: number): TimelineRow {
    const style = kindStyle(event.kind)
    return {
        key: `${event.t}-${index}`,
        time: fmtClock(event.t),
        icon: style.icon,
        tone: style.tone,
        title: event.title,
        detail: event.detail ?? "",
    }
}

const tasks = computed(() => props.session.events.filter(event => event.kind === "taskbar").map(toTimeline))
const regions = computed(() => props.session.events.filter(event => event.kind === "region").map(toTimeline))
const timeline = computed(() =>
    props.session.events.filter(event => event.kind !== "taskbar" && event.kind !== "region" && event.kind !== "reward").map(toTimeline)
)
const preloads = computed(() => props.session.preloads.slice(0, 10))
const quotas = computed(() => props.session.quotas)
const loot = computed(() => props.session.loot)
const rates = computed(() => props.session.rewardRate)
const total = computed(
    () => tasks.value.length + regions.value.length + timeline.value.length + preloads.value.length + quotas.value.length + loot.value.length
)

/** 稀有度色阶：与掉落品质一致，低稀有度保持弱化。 */
function rarityTone(rarity: number): string {
    if (rarity >= 5) return "text-warning"
    if (rarity === 4) return "text-secondary"
    if (rarity === 3) return "text-info"
    return "text-base-content/65"
}
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="EVENTS" :title="$t('log-analysis.events_title')">
            <template #trailing>
                <span class="text-[10px] text-base-content/45">{{ $t("log-analysis.events_count", { count: total }) }}</span>
            </template>
        </SectionHeader>

        <div class="mt-2 space-y-2">
            <div class="grid gap-2 lg:grid-cols-2">
                <!-- 任务栏状态流 -->
                <div class="rounded-xs border border-base-content/8 bg-base-content/2 p-2">
                    <div class="mb-1.5 flex items-center gap-1.5 text-[10px] tracking-wide text-base-content/50">
                        <Icon icon="ri:task-line" class="size-3" />
                        <span>{{ $t("log-analysis.events_tasks") }}</span>
                        <span class="ml-auto font-orbitron tabular-nums">{{ tasks.length }}</span>
                    </div>
                    <div v-if="tasks.length" class="max-h-36 space-y-1 overflow-auto pr-1">
                        <div v-for="row in tasks" :key="row.key" class="flex items-start gap-2 text-[11px]">
                            <span class="w-14 shrink-0 font-orbitron text-[10px] tabular-nums text-base-content/45">{{ row.time }}</span>
                            <span class="min-w-0 flex-1">
                                <span class="font-medium">{{ row.title }}</span>
                                <span v-if="row.detail" class="text-base-content/50"> · {{ row.detail }}</span>
                            </span>
                        </div>
                    </div>
                    <p v-else class="py-2 text-[11px] text-base-content/40">{{ $t("log-analysis.events_section_empty") }}</p>
                </div>

                <!-- 区域切换 -->
                <div class="rounded-xs border border-base-content/8 bg-base-content/2 p-2">
                    <div class="mb-1.5 flex items-center gap-1.5 text-[10px] tracking-wide text-base-content/50">
                        <Icon icon="ri:map-2-line" class="size-3" />
                        <span>{{ $t("log-analysis.events_regions") }}</span>
                        <span class="ml-auto font-orbitron tabular-nums">{{ regions.length }}</span>
                    </div>
                    <div v-if="regions.length" class="max-h-36 space-y-1 overflow-auto pr-1">
                        <div v-for="row in regions" :key="row.key" class="flex items-start gap-2 text-[11px]">
                            <span class="w-14 shrink-0 font-orbitron text-[10px] tabular-nums text-base-content/45">{{ row.time }}</span>
                            <span class="min-w-0 flex-1 truncate">{{ row.detail || row.title }}</span>
                        </div>
                    </div>
                    <p v-else class="py-2 text-[11px] text-base-content/40">{{ $t("log-analysis.events_section_empty") }}</p>
                </div>

                <!-- 预加载资源 -->
                <div class="rounded-xs border border-base-content/8 bg-base-content/2 p-2">
                    <div class="mb-1.5 flex items-center gap-1.5 text-[10px] tracking-wide text-base-content/50">
                        <Icon icon="ri:download-2-line" class="size-3" />
                        <span>{{ $t("log-analysis.events_preloads") }}</span>
                        <span class="ml-auto font-orbitron tabular-nums">{{ session.preloads.length }}</span>
                    </div>
                    <div v-if="preloads.length" class="max-h-36 space-y-1 overflow-auto pr-1">
                        <div v-for="row in preloads" :key="row.unitId" class="flex items-center gap-2 text-[11px]">
                            <span class="min-w-0 flex-1 truncate" :title="`UnitId ${row.unitId}`">
                                {{ row.name ?? $t("log-analysis.events_unit_unknown") }}
                            </span>
                            <span class="font-orbitron tabular-nums text-base-content/60">×{{ row.count }}</span>
                        </div>
                    </div>
                    <p v-else class="py-2 text-[11px] text-base-content/40">{{ $t("log-analysis.events_section_empty") }}</p>
                    <p v-if="preloads.length" class="mt-1.5 border-t border-base-content/8 pt-1.5 text-[10px] leading-relaxed text-base-content/35">
                        {{ $t("log-analysis.events_preloads_hint") }}
                    </p>
                </div>

                <!-- 刷怪配额 -->
                <div class="rounded-xs border border-base-content/8 bg-base-content/2 p-2">
                    <div class="mb-1.5 flex items-center gap-1.5 text-[10px] tracking-wide text-base-content/50">
                        <Icon icon="ri:equalizer-line" class="size-3" />
                        <span>{{ $t("log-analysis.events_quotas") }}</span>
                        <span class="ml-auto font-orbitron tabular-nums">{{ quotas.length }}</span>
                    </div>
                    <div v-if="quotas.length" class="max-h-36 space-y-1 overflow-auto pr-1">
                        <div v-for="(row, index) in quotas" :key="`${row.unitSpawnId}-${index}`" class="flex items-center gap-2 text-[11px]">
                            <span class="min-w-0 flex-1 truncate">{{ $t("log-analysis.events_spawn_group", { id: row.unitSpawnId }) }}</span>
                            <span class="font-orbitron tabular-nums text-base-content/60">
                                {{ $t("log-analysis.events_quota_remaining", { left: row.quotaLeft, total: row.totalNeed }) }}
                            </span>
                        </div>
                    </div>
                    <p v-else class="py-2 text-[11px] text-base-content/40">{{ $t("log-analysis.events_section_empty") }}</p>
                </div>
            </div>

            <!-- 战利品 -->
            <div class="rounded-xs border border-base-content/8 bg-base-content/2 p-2">
                <div class="mb-1.5 flex items-center gap-1.5 text-[10px] tracking-wide text-base-content/50">
                    <Icon icon="ri:gift-line" class="size-3" />
                    <span>{{ $t("log-analysis.events_loot") }}</span>
                    <span class="ml-auto font-orbitron tabular-nums">{{ loot.length }}</span>
                    <span v-if="rates" class="ml-3 flex items-center gap-2 text-base-content/45">
                        <span v-if="rates.bonus">{{ $t("log-analysis.events_rate_bonus", { value: rates.bonus }) }}</span>
                        <span v-if="rates.exp">{{ $t("log-analysis.events_rate_exp", { value: rates.exp }) }}</span>
                    </span>
                </div>
                <div v-if="loot.length" class="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    <div v-for="row in loot" :key="`${row.id}-${row.name}`" class="flex items-center gap-2 text-[11px]">
                        <span class="min-w-0 flex-1 truncate" :class="rarityTone(row.rarity)" :title="`ID ${row.id}`">{{ row.name }}</span>
                        <span class="font-orbitron text-[10px] text-warning/80">{{ "★".repeat(Math.max(0, row.rarity)) }}</span>
                        <span class="w-10 shrink-0 text-right font-orbitron tabular-nums text-base-content/60">×{{ row.count }}</span>
                    </div>
                </div>
                <p v-else class="py-1 text-[11px] text-base-content/40">{{ $t("log-analysis.events_section_empty") }}</p>
            </div>

            <!-- 进本 / BOSS / 刷怪组 / 秘境 / 结算时间线 -->
            <details v-if="timeline.length" class="rounded-xs border border-base-content/8 bg-base-content/2 p-2">
                <summary class="flex cursor-pointer list-none items-center gap-1.5 text-[10px] tracking-wide text-base-content/50">
                    <Icon icon="ri:history-line" class="size-3" />
                    <span>{{ $t("log-analysis.events_timeline") }}</span>
                    <span class="ml-auto font-orbitron tabular-nums">{{ timeline.length }}</span>
                </summary>
                <div class="mt-1.5 space-y-px">
                    <div v-for="row in timeline" :key="row.key" class="flex items-start gap-2 rounded-xs px-1 py-1 hover:bg-base-content/3">
                        <span class="w-14 shrink-0 font-orbitron text-[10px] tabular-nums text-base-content/50">{{ row.time }}</span>
                        <Icon :icon="row.icon" class="mt-0.5 size-3.5 shrink-0" :class="row.tone" />
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-xs font-medium">{{ row.title }}</span>
                            <span v-if="row.detail" class="block truncate text-[10px] text-base-content/45">{{ row.detail }}</span>
                        </span>
                    </div>
                </div>
            </details>
        </div>
    </section>
</template>
