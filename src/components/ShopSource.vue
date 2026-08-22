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
        <div class="text-[11px] tracking-wide text-base-content/55">商店购买</div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            <div
                v-for="source in displayShopSources"
                :key="source.key"
                class="group flex w-full items-center gap-2.5 rounded-xs border border-base-content/15 bg-base-content/[0.04] p-2 transition-colors duration-200 hover:border-primary/50 hover:bg-base-content/[0.06]"
            >
                <div class="relative size-11 shrink-0 overflow-hidden rounded-xs bg-linear-to-b from-emerald-500/25 to-emerald-100/10">
                    <img
                        :src="getPriceIcon(source.priceName)"
                        :alt="source.priceName"
                        class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                    />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4 class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary">
                            <SRouterLink
                                v-if="source.shopId && source.subTabId"
                                :to="`/db/shop/${source.shopId}/${source.subTabId}`"
                                class="hover:underline"
                            >
                                {{ source.detail }}
                            </SRouterLink>
                            <span v-else>{{ source.detail }}</span>
                        </h4>
                        <span
                            v-if="source.cutoffInfo"
                            class="ml-auto shrink-0 border border-base-content/25 px-1 py-px font-mono text-[9px] tracking-[0.12em] text-base-content/70"
                        >
                            <FullTooltip side="top">
                                <template #tooltip>
                                    <div class="flex flex-col gap-2 max-w-75 min-w-28">
                                        <div class="text-sm font-bold">{{ $t("shop-detail.discountInfo") }}</div>
                                        <div class="flex justify-between items-center gap-2 text-sm">
                                            <div class="text-xs text-neutral-500 whitespace-nowrap">
                                                {{ $t("shop-detail.discount") }}
                                            </div>
                                            <div class="font-medium text-primary">
                                                {{ +(source.cutoffInfo.discount / 10).toFixed(1) }}折
                                            </div>
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
                                <span class="text-primary line-through">{{ source.cutoffInfo.originalPrice }}</span>
                            </FullTooltip>
                        </span>
                        <span
                            v-else
                            class="ml-auto shrink-0 border border-base-content/25 px-1 py-px font-mono text-[9px] tracking-[0.12em] text-base-content/70"
                        >
                            {{ source.price }}
                        </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[10px] text-base-content/45">
                        <span class="shrink-0 rounded-xs bg-emerald-500/15 px-1 py-px font-mono text-[8px] font-semibold tracking-[0.15em] uppercase text-emerald-400">
                            SHOP
                        </span>
                        <span class="truncate">{{ source.shopName }} · 限购: {{ source.limit || "∞" }} 数量: x{{ source.num }}</span>
                    </div>
                    <div class="mt-0.5 truncate text-[10px] text-base-content/45">
                        {{ formatTimeRange(source.timeStart, source.timeEnd, t("database.until_now")) }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
