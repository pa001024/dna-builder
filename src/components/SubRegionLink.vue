<script lang="ts" setup>
import { computed } from "vue"
import type { RouteLocationRaw } from "vue-router"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"

const props = defineProps<{
    subRegionId: number
}>()

interface SubRegionLinkInfo {
    regionId: number
    subRegionName: string
}

/**
 * 解析子区域名称与所属地区 ID。
 * @returns 子区域信息或 null
 */
const subRegionInfo = computed<SubRegionLinkInfo | null>(() => {
    const subRegion = subRegionMap.get(props.subRegionId)
    if (!subRegion || !regionMap.has(subRegion.rid)) {
        return null
    }

    return {
        regionId: subRegion.rid,
        subRegionName: subRegion.name,
    }
})

/**
 * 生成跳转到本地地图的路由。
 */
const mapLocalLink = computed<RouteLocationRaw | null>(() => {
    if (!subRegionInfo.value) {
        return null
    }

    return {
        name: "map-local",
        query: {
            regionId: String(subRegionInfo.value.regionId),
            subRegionId: String(props.subRegionId),
        },
    }
})
</script>

<template>
    <span class="inline-flex items-center gap-1 wrap-break-word">
        <SRouterLink v-if="mapLocalLink" :to="mapLocalLink" class="hover:underline">
            {{ subRegionInfo?.subRegionName || `子区域${subRegionId}` }}
        </SRouterLink>
        <span v-else>{{ subRegionInfo?.subRegionName || `子区域${subRegionId}` }}</span>
        <CopyID :id="subRegionId" />
    </span>
</template>
