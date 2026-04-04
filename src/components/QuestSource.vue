<script lang="ts" setup>
import { computed } from "vue"
import { resourceMap } from "@/data"
import type { ResourceQuestSourceInfo } from "@/utils/resource-source"
import { formatTimeRange } from "@/utils/time"

const props = defineProps<{
    questSources: ResourceQuestSourceInfo[]
    resourceId: number
}>()

const displayQuestSources = computed(() => props.questSources)

const resourceTarget = computed(() => resourceMap.get(props.resourceId) || null)
const resourceName = computed(() => resourceTarget.value?.name || String(props.resourceId))
const resourceIconUrl = computed(() =>
    resourceTarget.value?.icon ? `/imgs/res/${resourceTarget.value.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
)
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
                            <img :src="resourceIconUrl" class="w-4 h-4 object-cover rounded" :alt="resourceName" />
                            <span class="text-xs text-base-content/70 truncate max-w-24">{{ resourceName }}</span>
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
