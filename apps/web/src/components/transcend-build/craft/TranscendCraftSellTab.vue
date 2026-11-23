<script setup lang="ts">
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { resourceMap } from "@/data"
import { getGearRecyclePreview } from "@/utils/transcend-gear/craft"

/**
 * 回收 tab：只读预览当前品质的出售（priceId/price）与分解（itemIds/itemCounts）产出。
 * 模拟器不持有资源账户，不执行删除、不发放货币。
 */
const props = defineProps<{
    rarityId: number
}>()

const { gt } = useGameText()
const preview = computed(() => getGearRecyclePreview(props.rarityId))

/**
 * 资源展示名（缺失时显示 #id）。
 * @param id 资源 id
 * @returns 展示名
 */
function resourceName(id: number): string {
    const resource = resourceMap.get(id)
    return resource ? gt(resource.name) : `#${id}`
}

/**
 * 资源图标地址。
 * @param id 资源 id
 * @returns 图标地址；缺失时为空串
 */
function resourceIcon(id: number): string {
    const resource = resourceMap.get(id)
    return resource ? `/imgs/res/${resource.icon}.webp` : ""
}
</script>

<template>
    <div class="space-y-2" data-create-craft="sell">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-[11px] font-medium text-base-content/75">{{ $t("transcend-build.craft_tab_sell") }}</span>
            <span class="ml-auto text-[10px] leading-relaxed text-warning/80" data-craft-sell-readonly>
                {{ $t("transcend-build.craft_sell_readonly_note") }}
            </span>
        </div>

        <div v-if="preview" class="grid gap-2 sm:grid-cols-2">
            <div class="rounded-xs border border-base-content/12 bg-base-100/50 p-2" data-craft-sell="breakdown">
                <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-[11px] font-medium text-base-content/75">{{ $t("transcend-build.craft_sell_breakdown") }}</span>
                    <span class="text-[10px] text-base-content/40">{{ $t("transcend-build.craft_sell_gain_material") }}</span>
                </div>
                <div v-if="preview.breakdown" class="mt-1.5 flex flex-wrap gap-2">
                    <span
                        v-for="(itemId, index) in preview.breakdown.itemIds"
                        :key="itemId"
                        class="inline-flex items-center gap-1 text-[10px] text-base-content/65"
                        :data-sell-item-id="itemId"
                    >
                        <ImageFallback :src="resourceIcon(itemId)" :alt="resourceName(itemId)" class="size-4 shrink-0 overflow-hidden rounded-xs">
                            <span class="flex size-4 items-center justify-center text-base-content/30"><Icon icon="ri:sparkling-line" /></span>
                        </ImageFallback>
                        <span>{{ resourceName(itemId) }}</span>
                        <b class="font-orbitron text-primary">{{ preview.breakdown.itemCounts[index] }}</b>
                    </span>
                </div>
                <p v-else class="mt-1 text-[10px] text-base-content/35">{{ $t("transcend-build.craft_sell_empty") }}</p>
            </div>

            <div class="rounded-xs border border-base-content/12 bg-base-100/50 p-2" data-craft-sell="price">
                <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-[11px] font-medium text-base-content/75">{{ $t("transcend-build.craft_sell_price") }}</span>
                    <span class="text-[10px] text-base-content/40">{{ $t("transcend-build.craft_sell_gain_resource") }}</span>
                </div>
                <div v-if="preview.sell" class="mt-1.5 flex flex-wrap gap-2">
                    <span class="inline-flex items-center gap-1 text-[10px] text-base-content/65" :data-sell-price-id="preview.sell.priceId">
                        <ImageFallback
                            :src="resourceIcon(preview.sell.priceId)"
                            :alt="resourceName(preview.sell.priceId)"
                            class="size-4 shrink-0 overflow-hidden rounded-xs"
                        >
                            <span class="flex size-4 items-center justify-center text-base-content/30"><Icon icon="ri:sparkling-line" /></span>
                        </ImageFallback>
                        <span>{{ resourceName(preview.sell.priceId) }}</span>
                        <b class="font-orbitron text-primary">{{ preview.sell.price }}</b>
                    </span>
                </div>
                <p v-else class="mt-1 text-[10px] text-base-content/35">{{ $t("transcend-build.craft_sell_empty") }}</p>
            </div>
        </div>

        <p v-else class="rounded-xs border border-base-content/12 bg-base-100/50 p-3 text-[10px] text-base-content/35" data-craft-sell-empty>
            {{ $t("transcend-build.craft_sell_empty") }}
        </p>
    </div>
</template>
