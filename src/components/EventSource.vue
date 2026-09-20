<script lang="ts" setup>
import { t } from "i18next"
import { computed } from "vue"
import type { ResourceEventSourceInfo } from "@/utils/resource-source"
import { formatTimeRange } from "@/utils/time"

const props = defineProps<{
    eventSources: ResourceEventSourceInfo[]
}>()

/** 来源类型 → 图标名 */
const KIND_ICONS = {
    "photo-task": "ri:camera-lens-line",
    "sign-in": "ri:calendar-check-line",
    "online-time": "ri:time-line",
    "box-drop": "ri:gift-line",
    "box-coin": "ri:copper-coin-line",
    "top-up": "ri:trophy-line",
} as const satisfies Record<ResourceEventSourceInfo["kind"], string>

/** 来源类型 → 中间行描述文本 */
const kindDescriptions = computed(() =>
    props.eventSources.map(source => ({
        ...source,
        icon: KIND_ICONS[source.kind],
        desc:
            source.kind === "photo-task"
                ? `${t("event.photo_task_index")} ${source.index}`
                : source.kind === "sign-in"
                    ? t("event.sign_in_day", { day: source.index })
                    : source.kind === "online-time"
                        ? t("event.online_time_target", { target: source.target ?? source.index })
                        : source.kind === "box-drop"
                            ? t("event.box_drop_index", { index: source.index })
                            : source.kind === "box-coin"
                                ? t("event.box_coin")
                                : t("event.top_up_score", { score: source.index }),
    }))
)
</script>

<template>
    <div v-if="kindDescriptions.length > 0" class="space-y-2">
        <div class="text-[11px] tracking-wide text-base-content/55">{{ $t("resource.eventReward") }}</div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            <div
                v-for="source in kindDescriptions"
                :key="source.key"
                class="group flex w-full items-center gap-2.5 rounded-xs border border-base-content/15 bg-base-content/4 p-2 transition-colors duration-200 hover:border-primary/50 hover:bg-base-content/6"
            >
                <div class="relative size-11 shrink-0 overflow-hidden rounded-xs bg-linear-to-b from-primary/25 to-primary/5">
                    <Icon :icon="source.icon" class="h-full w-full p-2.5 text-primary" />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4 class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary">
                            <SRouterLink :to="`/db/event/${source.eventId}`" class="hover:underline">
                                {{ $t(source.eventName) }}
                            </SRouterLink>
                        </h4>
                        <span
                            v-if="source.num"
                            class="ml-auto shrink-0 border border-base-content/25 px-1 py-px font-orbitron text-[9px] font-semibold tabular-nums text-base-content/70"
                        >
                            x{{ source.num }}
                        </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[10px] text-base-content/45">
                        <span
                            class="shrink-0 rounded-xs bg-primary/15 px-1 py-px font-mono text-[8px] font-semibold tracking-[0.15em] uppercase text-primary"
                        >
                            EVENT
                        </span>
                        <span class="truncate">{{ source.desc }}</span>
                    </div>
                    <div class="mt-0.5 truncate text-[10px] text-base-content/45">
                        {{ formatTimeRange(source.startTime, source.endTime, $t("database.until_now")) }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
