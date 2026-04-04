<script lang="ts" setup>
import { t } from "i18next"
import { computed } from "vue"
import { cutoffMap, resourceMap } from "@/data"
import { formatDateTime, formatTimeRange } from "@/utils/time"
import type { ShopSourceInfo } from "@/utils/weapon-source"

const props = defineProps<{
    shopSources: ShopSourceInfo[]
}>()

/**
 * 反查折扣配置。
 * @param source 商店来源
 * @returns 折扣配置
 */
function getCutoffInfo(source: ShopSourceInfo) {
    return cutoffMap.get(source.itemId) ?? null
}

const displayShopSources = computed(() => {
    return props.shopSources.map(source => ({
        ...source,
        cutoffInfo: getCutoffInfo(source),
    }))
})

/**
 * 获取商店价格图标。
 * @param name 价格名称
 * @returns 图标路径
 */
function getPriceIcon(name?: string) {
    const res = resourceMap.get(name ?? "")
    return res?.icon ? `/imgs/res/${res.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 格式化折扣时间。
 * @param timestamp 秒级时间戳
 * @returns 本地化时间文本
 */
function formatCutoffTime(timestamp: number) {
    return formatDateTime(timestamp)
}
</script>

<template>
    <div v-if="displayShopSources.length > 0" class="space-y-2">
        <div class="text-xs text-base-content/60">商店购买</div>
        <div v-for="source in displayShopSources" :key="source.key">
            <div class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors duration-200 flex items-center gap-4">
                <div class="flex-1">
                    <div class="flex justify-between items-center gap-2 mb-2">
                        <div class="flex items-center gap-2 min-w-0">
                            <SRouterLink
                                v-if="source.shopId && source.subTabId"
                                :to="`/db/shop/${source.shopId}/${source.subTabId}`"
                                class="hover:underline min-w-0 truncate"
                            >
                                {{ source.detail }}
                            </SRouterLink>
                            <span v-else class="min-w-0 truncate">{{ source.detail }}</span>
                            <span v-if="source.shopName" class="text-xs text-base-content/70">({{ source.shopName }})</span>
                        </div>
                        <div v-if="source.priceName" class="flex items-center gap-1">
                            <img :src="getPriceIcon(source.priceName)" class="w-4 h-4 object-cover rounded" :alt="source.priceName" />
                            <span class="text-xs text-base-content/70">{{ source.priceName }}</span>
                            <template v-if="source.cutoffInfo">
                                <FullTooltip side="top">
                                    <template #tooltip>
                                        <div class="flex flex-col gap-2 max-w-75 min-w-28">
                                            <div class="text-sm font-bold">{{ $t("shop-detail.discountInfo") }}</div>
                                            <div class="flex justify-between items-center gap-2 text-sm">
                                                <div class="text-xs text-neutral-500 whitespace-nowrap">
                                                    {{ $t("shop-detail.discount") }}
                                                </div>
                                                <div class="font-medium text-primary">{{ +(source.cutoffInfo.discount / 10).toFixed(1) }}折</div>
                                            </div>
                                            <div class="flex justify-between items-center gap-2 text-sm">
                                                <div class="text-xs text-neutral-500 whitespace-nowrap">
                                                    {{ $t("shop-detail.originalPrice") }}
                                                </div>
                                                <div class="font-medium text-primary line-through">
                                                    {{ source.cutoffInfo.originalPrice }}
                                                </div>
                                            </div>
                                            <div class="flex justify-between items-center gap-2 text-sm">
                                                <div class="text-xs text-neutral-500 whitespace-nowrap">
                                                    {{ $t("shop-detail.currentPrice") }}
                                                </div>
                                                <div class="font-medium text-primary">{{ source.cutoffInfo.price }}</div>
                                            </div>
                                            <div class="text-xs text-neutral-500">
                                                <div>
                                                    {{ $t("shop-detail.startTime") }}：{{ formatCutoffTime(source.cutoffInfo.startTime) }}
                                                </div>
                                                <div v-if="typeof source.cutoffInfo.endTime === 'number'">
                                                    {{ $t("shop-detail.endTime") }}：{{ formatCutoffTime(source.cutoffInfo.endTime) }}
                                                </div>
                                            </div>
                                        </div>
                                    </template>
                                    <span class="text-sm font-medium">{{ source.cutoffInfo.price }}</span>
                                </FullTooltip>
                                <span class="text-xs text-base-content/40 line-through">{{ source.cutoffInfo.originalPrice }}</span>
                            </template>
                            <span v-else class="text-sm font-medium">{{ source.price }}</span>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-base-content/70">
                        <div>{{ formatTimeRange(source.timeStart, source.timeEnd, t("database.until_now")) }}</div>
                        <div class="shrink-0 whitespace-nowrap">限购: {{ source.limit || "∞" }} 数量: x{{ source.num }}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
