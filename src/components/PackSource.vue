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
        <div class="grid grid-cols-[repeat(auto-fill,minmax(560px,1fr))] gap-2">
            <div
                v-for="source in displayPackSources"
                :key="source.key"
                class="group flex w-full items-center gap-2.5 border border-base-content/15 bg-base-100 p-2 transition-colors duration-200 hover:border-primary/60"
            >
                <div
                    class="relative size-11 shrink-0 overflow-hidden rounded bg-linear-to-b"
                    :class="getRarityGradientClass(source.resource?.rarity || source.resourceRarity || 1)"
                >
                    <img
                        :src="getResourceIconUrl(source.resource?.icon || source.resourceIcon)"
                        :alt="source.resource?.name || source.resourceName"
                        class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                    />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4
                            class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary"
                        >
                            <SRouterLink :to="`/db/resource/${source.resourceId}`" class="hover:underline">
                                {{ source.resource?.name || source.resourceName }}
                            </SRouterLink>
                        </h4>
                        <span
                            v-if="typeof source.pp === 'number'"
                            class="ml-auto shrink-0 border border-base-content/25 px-1 py-px font-mono text-[9px] tracking-[0.12em] text-base-content/70"
                        >
                            {{ +(source.pp * 100).toFixed(2) }}%
                        </span>
                        <span
                            v-else-if="typeof source.times === 'number'"
                            class="ml-auto shrink-0 border border-base-content/25 px-1 py-px font-mono text-[9px] tracking-[0.12em] text-base-content/70"
                        >
                            x{{ +source.times.toFixed(2) }}
                        </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[10px] text-base-content/45">
                        <span
                            class="shrink-0 bg-purple-500 px-1 py-px font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-white"
                        >
                            PACK
                        </span>
                        <span class="truncate">
                            <template v-if="typeof source.pp === 'number'">概率: {{ +(source.pp * 100).toFixed(2) }}%</template>
                            <template v-else-if="typeof source.times === 'number'">期望: {{ +source.times.toFixed(2) }}次</template>
                        </span>
                    </div>
                    <div class="mt-1 border-t border-base-content/10 pt-1">
                        <RewardItem :reward="source.reward" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
