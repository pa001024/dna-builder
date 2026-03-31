<script lang="ts" setup>
import { computed } from "vue"
import { collectResourceDraftSources } from "@/utils/draft-source"
import { collectResourceDungeonSources, collectResourceShopSources } from "@/utils/resource-source"
import type { Resource } from "../data/d/resource.data"

const props = defineProps<{
    resource: Resource
}>()

const rarityText = computed(() => ["白", "绿", "蓝", "紫", "金"][props.resource.rarity - 1] || "白")
const draftSources = computed(() => collectResourceDraftSources(props.resource))
const dungeonSources = computed(() => collectResourceDungeonSources(props.resource))
const shopSources = computed(() => collectResourceShopSources(props.resource))

function getResourceIconUrl(icon: string): string {
    return icon ? `/imgs/res/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

function getRarityColor(rarity: number): string {
    const rarityMap: Record<number, string> = {
        1: "from-gray-900/80 to-gray-100/80",
        2: "from-green-900/80 to-green-100/80",
        3: "from-blue-900/80 to-blue-100/80",
        4: "from-purple-900/80 to-purple-100/80",
        5: "from-yellow-900/80 to-yellow-100/80",
    }

    return rarityMap[rarity] || rarityMap[1]
}
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="p-3">
            <div class="flex items-center gap-3 mb-3">
                <SRouterLink :to="`/db/resource/${resource.id}`" class="text-lg font-bold link link-primary">
                    {{ resource.name }}
                </SRouterLink>
                <span class="text-xs text-base-content/70">{{ $t("resource.id") }}: {{ resource.id }}</span>
            </div>

            <div class="flex justify-center items-center mb-3">
                <ImageFallback :src="getResourceIconUrl(resource.icon)" :alt="resource.name" class="w-24 object-cover rounded" :class="getRarityColor(resource.rarity)">
                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="resource.name" class="w-24 object-cover rounded" :class="getRarityColor(resource.rarity)" />
                </ImageFallback>
            </div>

            <div class="flex flex-wrap gap-2 text-sm opacity-70 mb-3">
                <span>{{ $t("resource.rarity") }}：{{ rarityText }}</span>
            </div>

            <div v-if="resource.desc" class="p-3 bg-base-200 rounded mb-3">
                <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.description") }}</div>
                <div class="text-sm leading-6 whitespace-pre-wrap">{{ resource.desc }}</div>
            </div>

            <div v-if="resource.desc2" class="p-3 bg-base-200 rounded mb-3">
                <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.background") }}</div>
                <div class="text-sm leading-6 whitespace-pre-wrap">{{ resource.desc2 }}</div>
            </div>
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.source") }}</div>
            <div class="space-y-3">
                <DraftSource :draft-sources="draftSources" />
                <DungeonSource :dungeon-sources="dungeonSources" />
                <ShopSource :shop-sources="shopSources" />
            </div>
        </div>
    </div>
</template>
