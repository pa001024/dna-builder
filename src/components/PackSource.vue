<script lang="ts" setup>
import { computed } from "vue"
import { resourceMap } from "@/data"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import type { ModPackSourceInfo } from "@/utils/resource-source"
import { getRewardDetails } from "@/utils/reward-utils"

const props = defineProps<{
    packSources: ModPackSourceInfo[]
    sourceTitle?: string
}>()

const displayPackSources = computed(() =>
    props.packSources.map(source => ({
        ...source,
        resource: resourceMap.get(source.resourceId) || null,
        reward: getRewardDetails(source.rewardId),
    }))
)

/**
 * 获取资源图标路径。
 * @param icon 资源图标名
 * @returns 图标路径
 */
function getResourceIconUrl(icon?: string) {
    return icon ? `/imgs/res/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

const sourceTitle = computed(() => props.sourceTitle || "道具箱")
</script>

<template>
    <div v-if="displayPackSources.length > 0" class="space-y-2">
        <div class="text-xs text-base-content/60">{{ sourceTitle }}</div>
        <div v-for="source in displayPackSources" :key="source.key">
            <div class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors duration-200">
                <div class="flex items-start gap-2 text-xs">
                    <div
                        class="size-10 shrink-0 overflow-hidden rounded bg-linear-15"
                        :class="getRarityGradientClass(source.resource?.rarity || source.resourceRarity || 1)"
                    >
                        <img
                            :src="getResourceIconUrl(source.resource?.icon || source.resourceIcon)"
                            :alt="source.resource?.name || source.resourceName"
                            class="w-full h-full object-cover"
                        />
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 min-w-0">
                            <SRouterLink :to="`/db/resource/${source.resourceId}`" class="hover:underline min-w-0 truncate">
                                {{ source.resource?.name || source.resourceName }}
                            </SRouterLink>
                            <CopyID :id="source.resourceId" />
                        </div>
                        <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-content/70">
                            <span v-if="typeof source.pp === 'number'">概率: {{ +(source.pp * 100).toFixed(2) }}%</span>
                            <span v-if="typeof source.times === 'number'">期望: {{ +source.times.toFixed(2) }}次</span>
                        </div>
                    </div>
                </div>
                <div class="mt-2 pl-12">
                    <RewardItem :reward="source.reward" header />
                </div>
            </div>
        </div>
    </div>
</template>
