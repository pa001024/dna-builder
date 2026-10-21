<script setup lang="ts">
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { Resource } from "@/data/d/resource.data"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { getRewardIconUrl } from "@/utils/reward-icon"

const props = defineProps<{
    resource: Resource
    link?: string
    /** 无边框版本：内嵌进 FullTooltip 时顶边渲染，不与 tooltip 描边叠框 */
    bare?: boolean
}>()

const { gt } = useGameText()
const link = computed(() => props.link ?? `/db/resource/${props.resource.id}`)
const iconUrl = computed(() => getRewardIconUrl("Resource", props.resource.id))
</script>
<template>
    <div class="w-72 overflow-hidden rounded-xs bg-base-100 text-left" :class="bare ? '' : 'border border-base-content/10'">
        <div
            class="relative flex h-20 w-full items-center justify-center overflow-hidden bg-linear-15"
            :class="getRarityGradientClass(resource.rarity)"
        >
            <img :src="iconUrl" :alt="resource.name" class="size-12 object-contain" />
            <span
                class="absolute left-2 top-2 bg-base-content px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-base-100"
            >
                RESOURCE
            </span>
        </div>
        <div class="flex flex-col gap-2 p-3">
            <div class="truncate text-sm font-bold">
                <SRouterLink :to="link" class="cursor-pointer hover:underline">{{ gt(resource.name) }}</SRouterLink>
            </div>
            <div v-if="resource.desc" class="text-xs leading-relaxed text-base-content/70">{{ gt(resource.desc) }}</div>
            <div v-if="resource.desc2" class="text-[11px] leading-relaxed whitespace-pre-wrap text-base-content/45">
                {{ gt(resource.desc2) }}
            </div>
            <div v-if="resource.access?.length">
                <div class="mb-1 text-[11px] text-base-content/45">{{ $t("resource.source") }}</div>
                <div class="flex flex-wrap gap-1">
                    <span
                        v-for="item in resource.access"
                        :key="item"
                        class="rounded-xs bg-base-content/8 px-1.5 py-0.5 text-[11px] text-base-content/70"
                    >
                        {{ gt(item) }}
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>
