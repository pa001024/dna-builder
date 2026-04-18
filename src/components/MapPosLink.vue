<script lang="ts" setup>
import { computed } from "vue"
import type { RouteLocationRaw } from "vue-router"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"

const props = defineProps<{
    subRegionId: number
    point: [number, number] | null | undefined
    pointName: string
    pointIcon: string
}>()

/**
 * 生成本地地图跳转路由。
 */
const mapLocalLink = computed<RouteLocationRaw | null>(() => {
    if (!props.point) {
        return null
    }

    const subRegion = subRegionMap.get(props.subRegionId)
    const region = subRegion ? regionMap.get(subRegion.rid) : undefined
    if (!subRegion || !region?.mapMapping?.length) {
        return null
    }

    return {
        name: "map-local",
        query: {
            regionId: String(subRegion.rid),
            subRegionId: String(props.subRegionId),
            pointName: props.pointName,
            pointX: String(props.point[0]),
            pointY: String(props.point[1]),
            pointIcon: props.pointIcon,
        },
    }
})

/**
 * 默认显示的坐标文本。
 */
const displayPointText = computed(() => {
    if (!props.point) {
        return ""
    }

    return `(${props.point[0].toFixed(0)}, ${props.point[1].toFixed(0)})`
})
</script>

<template>
    <span class="inline-flex flex-wrap items-center justify-end gap-2">
        <span class="text-right wrap-break-word">
            <slot>{{ displayPointText }}</slot>
        </span>
        <SRouterLink v-if="mapLocalLink" :to="mapLocalLink" class="link link-primary"> 跳转 </SRouterLink>
    </span>
</template>
