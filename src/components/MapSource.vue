<script lang="ts" setup>
import { computed } from "vue"
import type { RouteLocationRaw } from "vue-router"
import { regionMap } from "@/data/d/region.data"
import type { Resource } from "@/data/d/resource.data"
import { subRegionMap } from "@/data/d/subregion.data"

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

/** 按子区域聚合资源点位，并统计各区域点位数量。 */
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
</script>

<template>
    <div v-if="mapSources.length" class="space-y-2">
        <div class="text-[11px] tracking-wide text-base-content/55">{{ $t("database.overworld") }}</div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            <div
                v-for="source in mapSources"
                :key="source.srId"
                class="group flex w-full items-center gap-2.5 rounded-xs border border-base-content/15 bg-base-content/4 p-2 transition-colors duration-200 hover:border-primary/50 hover:bg-base-content/6"
            >
                <div class="relative size-11 shrink-0 overflow-hidden rounded-xs bg-linear-to-b from-teal-500/25 to-teal-100/10">
                    <Icon
                        icon="ri:pushpin-2-fill"
                        class="absolute inset-0 m-auto size-5 text-base-content/50 transition-transform duration-300 ease-out group-hover:scale-110"
                    />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4
                            class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary"
                        >
                            <SRouterLink :to="getMapLocalLink(source.regionId)" class="hover:underline">
                                {{ source.subRegionName }}
                            </SRouterLink>
                        </h4>
                        <span class="ml-auto shrink-0 border border-base-content/25 px-1 py-px text-[9px] text-base-content/70">
                            {{ source.count }} {{ $t("resource.mapPointCount") }}
                        </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[10px] text-base-content/45">
                        <span
                            class="shrink-0 rounded-xs bg-teal-500/15 px-1 py-px font-mono text-[8px] font-semibold tracking-[0.15em] uppercase text-teal-400"
                        >
                            MAP
                        </span>
                        <span class="truncate">{{ source.regionName }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
