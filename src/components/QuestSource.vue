<script lang="ts" setup>
import { computed } from "vue"
import { modMap, resourceMap } from "@/data"
import { iconticketMap } from "@/data/d/iconticket.data"
import { LeveledMod } from "@/data/leveled/LeveledMod"
import type { ResourceQuestSourceInfo } from "@/utils/resource-source"
import { formatTimeRange } from "@/utils/time"

const props = defineProps<{
    questSources: ResourceQuestSourceInfo[]
    resourceId?: number
    modId?: number
    ironTicketId?: number
}>()

const displayQuestSources = computed(() => props.questSources)
/**
 * 统计任务来源的合计数量。
 * @returns 任务来源数量总和
 */
const totalQuestSourceNum = computed(() => {
    return displayQuestSources.value.reduce((total, source) => total + (source.num ?? 0), 0)
})

const resourceTarget = computed(() => (props.resourceId ? resourceMap.get(props.resourceId) || null : null))
const modTarget = computed(() => (props.modId ? modMap.get(props.modId) || null : null))
const ironTicketTarget = computed(() => (props.ironTicketId ? iconticketMap.get(props.ironTicketId) || null : null))
const sourceName = computed(
    () =>
        resourceTarget.value?.name ||
        modTarget.value?.名称 ||
        ironTicketTarget.value?.name ||
        String(props.resourceId ?? props.modId ?? props.ironTicketId ?? "")
)
const sourceIconUrl = computed(() => {
    if (resourceTarget.value?.icon) {
        return `/imgs/res/${resourceTarget.value.icon}.webp`
    }

    if (modTarget.value) {
        return LeveledMod.url(modTarget.value.icon)
    }

    return ironTicketTarget.value?.icon ? `/imgs/res/${ironTicketTarget.value.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
})
</script>

<template>
    <div v-if="displayQuestSources.length > 0" class="space-y-2">
        <div class="text-xs text-base-content/60">{{ $t("database.questchain") }}</div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            <div
                v-for="source in displayQuestSources"
                :key="source.key"
                class="group flex w-full items-center gap-2.5 border border-base-content/15 bg-base-100 p-2 transition-colors duration-200 hover:border-primary/60"
            >
                <div class="relative size-11 shrink-0 overflow-hidden rounded bg-linear-to-b from-blue-500/25 to-blue-100/10">
                    <img
                        :src="sourceIconUrl"
                        :alt="sourceName"
                        class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                    />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4
                            class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary"
                        >
                            <SRouterLink :to="`/db/questchain/${source.questChainId}`" class="hover:underline">
                                {{ source.questChainName }}
                            </SRouterLink>
                        </h4>
                        <span
                            class="ml-auto shrink-0 border border-base-content/25 px-1 py-px font-mono text-[9px] tracking-[0.12em] text-base-content/70"
                        >
                            x{{ source.num ?? 1 }}
                        </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[10px] text-base-content/45">
                        <span
                            class="shrink-0 bg-blue-500 px-1 py-px font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-white"
                        >
                            QUEST
                        </span>
                        <span class="truncate"
                            >{{ source.d ? `${$t("UI_FORGING_BLUEPRINT")} · ` : "" }}{{ source.chapterName }} - {{ source.episode }}</span
                        >
                    </div>
                    <div class="mt-0.5 truncate text-[10px] text-base-content/45">
                        {{ formatTimeRange(source.timeStart, source.timeEnd, $t("database.until_now")) }}
                    </div>
                </div>
            </div>
        </div>
        <div class="flex items-center justify-end gap-3">
            <div class="text-xs text-base-content/60">合计</div>
            <div class="flex items-center gap-1 shrink-0">
                <img :src="sourceIconUrl" class="w-4 h-4 object-cover rounded" :alt="sourceName" />
                <span class="text-xs text-base-content/70">{{ sourceName }}</span>
                <span class="text-sm text-base-content/70">{{ totalQuestSourceNum }}</span>
            </div>
        </div>
    </div>
</template>
