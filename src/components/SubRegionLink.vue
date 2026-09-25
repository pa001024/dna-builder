<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import type { RouteLocationRaw } from "vue-router"
import { useGameText } from "@/composables/useGameText"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"

const props = defineProps<{
    subRegionId: number
}>()

/** 游戏原文取词（子区域名）与界面文案取词（数据缺失时的兜底名称）。 */
const { gt } = useGameText()
const { t } = useTranslation()

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
        name: "map-tool",
        query: {
            regionId: String(subRegionInfo.value.regionId),
            subRegionId: String(props.subRegionId),
        },
    }
})

/**
 * 子区域展示名。
 * 数据缺失时回退到带 ID 的界面文案，避免把拼出来的中文当成翻译键去查表。
 */
const subRegionLabel = computed(() =>
    subRegionInfo.value ? gt(subRegionInfo.value.subRegionName) : t("map-tool.sub_region_unknown", { id: props.subRegionId })
)
</script>

<template>
    <span class="inline-flex items-center gap-1 wrap-break-word">
        <SRouterLink v-if="mapLocalLink" :to="mapLocalLink" class="hover:underline">
            {{ subRegionLabel }}
        </SRouterLink>
        <span v-else>{{ subRegionLabel }}</span>
        <CopyID :id="subRegionId" />
    </span>
</template>
