<script lang="ts" setup>
import { computed } from "vue"
import type { RouteLocationRaw } from "vue-router"
import { fishMap } from "@/data"
import { booksData } from "@/data/d/book.data"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"
import { collectResourceDraftSources } from "@/utils/draft-source"
import { getRarityBadgeClass } from "@/utils/rarity-utils"
import {
    collectResourceDungeonSources,
    collectResourceHardbossSources,
    collectResourceQuestSources,
    collectResourceShopSources,
} from "@/utils/resource-source"
import type { Resource } from "../data/d/resource.data"

interface ResourceSourceGroup {
    srId: number
    regionId: number
    subRegionName: string
    regionName: string
    count: number
}

const props = defineProps<{
    resource: Resource
}>()

const rarityText = computed(() => ["白", "绿", "蓝", "紫", "金"][props.resource.rarity - 1] || "白")
const draftSources = computed(() => collectResourceDraftSources(props.resource))
const dungeonSources = computed(() => collectResourceDungeonSources(props.resource))
const hardbossSources = computed(() => collectResourceHardbossSources(props.resource))
const questSources = computed(() => collectResourceQuestSources(props.resource))
const shopSources = computed(() => collectResourceShopSources(props.resource))
const bookTarget = computed(() => {
    for (const book of booksData) {
        if (!book.res.some(resource => resource.id === props.resource.id)) {
            continue
        }

        return book
    }

    return null
})
const bookLink = computed<RouteLocationRaw | null>(() => {
    if (!bookTarget.value) {
        return null
    }

    return {
        name: "book-detail",
        params: {
            id: String(bookTarget.value.id),
        },
        query: {
            resId: String(props.resource.id),
        },
    }
})
const fishTarget = computed(() => {
    for (const fish of fishMap.values()) {
        if (fish.rid !== props.resource.id) {
            continue
        }

        return fish
    }

    return null
})
const fishLink = computed<RouteLocationRaw | null>(() => {
    if (!fishTarget.value) {
        return null
    }

    return {
        name: "fish-detail",
        params: {
            id: String(fishTarget.value.id),
        },
    }
})
const mapSources = computed<ResourceSourceGroup[]>(() => {
    const grouped = new Map<number, ResourceSourceGroup>()

    for (const source of props.resource.source || []) {
        const subRegion = subRegionMap.get(source.srId)
        if (!subRegion) continue
        const region = regionMap.get(subRegion.rid)
        if (!region) continue
        const current = grouped.get(source.srId)
        const nextCount = (current?.count || 0) + (source.pos?.length || 0)
        grouped.set(source.srId, {
            srId: source.srId,
            regionId: subRegion.rid,
            subRegionName: subRegion.name,
            regionName: region.name,
            count: nextCount,
        })
    }

    return [...grouped.values()].sort((a, b) => b.count - a.count || a.srId - b.srId)
})

/**
 * 生成跳转到本地地图的资源点位链接。
 * @param regionId 地区 ID
 * @returns 路由对象
 */
function getMapLocalLink(regionId: number): RouteLocationRaw {
    return {
        name: "map-local",
        query: {
            regionId: String(regionId),
            rid: String(props.resource.id),
        },
    }
}

function getResourceIconUrl(icon: string): string {
    return icon ? `/imgs/res/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}
</script>

<template>
    <div class="p-3 space-y-3">
        <div>
            <div class="flex items-center gap-3 mb-3">
                <SRouterLink :to="`/db/resource/${resource.id}`" class="text-lg font-bold link link-primary">
                    {{ resource.name }}
                </SRouterLink>
                <span class="text-xs text-base-content/70">{{ $t("resource.id") }}: {{ resource.id }}</span>
                <div class="flex-1"></div>
                <div class="text-xs px-2 py-0.5 rounded" :class="getRarityBadgeClass(resource.rarity)">{{ rarityText }}</div>
            </div>

            <div class="flex justify-center items-center mb-3">
                <ImageFallback :src="getResourceIconUrl(resource.icon)" :alt="resource.name" class="w-24 object-cover rounded">
                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="resource.name" class="w-24 object-cover rounded" />
                </ImageFallback>
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

        <div v-if="bookLink" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">所属读物</div>
            <div class="flex items-center gap-2">
                <SRouterLink :to="bookLink" class="link link-primary wrap-break-word">
                    {{ bookTarget?.name }}
                </SRouterLink>
                <span class="text-xs text-base-content/70">ID: {{ bookTarget?.id }}</span>
            </div>
        </div>

        <div v-if="fishLink" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">所属鱼类</div>
            <div class="flex items-center gap-2">
                <SRouterLink :to="fishLink" class="link link-primary wrap-break-word">
                    {{ fishTarget?.name }}
                </SRouterLink>
                <span class="text-xs text-base-content/70">ID: {{ fishTarget?.id }}</span>
            </div>
        </div>

        <div
            class="p-3 bg-base-200 rounded"
            v-if="draftSources.length || dungeonSources.length || hardbossSources.length || questSources.length || shopSources.length"
        >
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.source") }}</div>
            <div class="space-y-3">
                <DraftSource :draft-sources="draftSources" />
                <DungeonSource :dungeon-sources="dungeonSources" />
                <BossSource :boss-sources="hardbossSources" />
                <QuestSource :quest-sources="questSources" :resource-id="resource.id" />
                <ShopSource :shop-sources="shopSources" />
            </div>
        </div>

        <div v-if="mapSources.length" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">地图点位</div>
            <div class="space-y-2">
                <div v-for="source in mapSources" :key="source.srId" class="p-2 bg-base-100 rounded border border-base-200">
                    <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                            <SRouterLink :to="getMapLocalLink(source.regionId)" class="hover:underline min-w-0 wrap-break-word">
                                {{ source.subRegionName }}
                            </SRouterLink>
                            <div class="text-xs text-base-content/60 mt-1">{{ source.regionName }}</div>
                        </div>
                        <span class="text-xs text-base-content/70 shrink-0">{{ source.count }} 个点位</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
