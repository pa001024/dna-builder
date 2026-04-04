<script lang="ts" setup>
import { computed } from "vue"
import { modMap, resourceMap } from "@/data"
import { LeveledMod } from "@/data/leveled/LeveledMod"
import type { ResourceQuestSourceInfo } from "@/utils/resource-source"
import { formatTimeRange } from "@/utils/time"

const props = defineProps<{
    questSources: ResourceQuestSourceInfo[]
    resourceId?: number
    modId?: number
}>()

const displayQuestSources = computed(() => props.questSources)

const resourceTarget = computed(() => (props.resourceId ? resourceMap.get(props.resourceId) || null : null))
const modTarget = computed(() => (props.modId ? modMap.get(props.modId) || null : null))
const sourceName = computed(() => resourceTarget.value?.name || modTarget.value?.名称 || String(props.resourceId ?? props.modId ?? ""))
const sourceIconUrl = computed(() => {
    if (resourceTarget.value?.icon) {
        return `/imgs/res/${resourceTarget.value.icon}.webp`
    }

    return modTarget.value ? LeveledMod.url(modTarget.value.icon) : "/imgs/webp/T_Head_Empty.webp"
})
</script>

<template>
    <div v-if="displayQuestSources.length > 0" class="space-y-2">
        <div class="text-xs text-base-content/60">{{ $t("database.questchain") }}</div>
        <div v-for="source in displayQuestSources" :key="source.key">
            <div class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors duration-200 flex items-center gap-4">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2 min-w-0">
                        <div class="min-w-0">
                            <SRouterLink :to="`/db/questchain/${source.questChainId}`" class="hover:underline min-w-0 truncate">
                                {{ source.questChainName }}
                            </SRouterLink>
                            <div class="text-xs text-base-content/70 mt-1">{{ source.chapterName }} - {{ source.episode }}</div>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                            <img :src="sourceIconUrl" class="w-4 h-4 object-cover rounded" :alt="sourceName" />
                            <span class="text-xs text-base-content/70 truncate max-w-24">{{ sourceName }}</span>
                            <span class="text-sm text-base-content/70">{{ source.num ?? 1 }}</span>
                        </div>
                    </div>
                    <div class="mt-1 text-xs text-base-content/70">
                        {{ formatTimeRange(source.timeStart, source.timeEnd, $t("database.until_now")) }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
