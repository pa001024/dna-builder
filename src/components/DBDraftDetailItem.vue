<script lang="ts" setup>
import { computed } from "vue"
import { charAccessoryData } from "@/data/d/accessory.data"
import { iconticketMap } from "@/data/d/iconticket.data"
import { draftDungeonMap, modMap, weaponMap } from "@/data/d/index"
import shopData from "@/data/d/shop.data"
import type { Draft } from "@/data/data-types"
import { getRewardTypeText } from "@/utils/i18n-utils"
import { type ResourceDungeonSourceInfo } from "@/utils/resource-source"
import { getDraftDropInfo } from "@/utils/reward-utils"
import type { ShopSourceInfo } from "@/utils/weapon-source"

const props = defineProps<{
    draft: Draft
}>()

// 将分钟数转换为00:00格式
function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}

// 获取产物信息
const product = computed(() => {
    if (props.draft.t === "Mod") {
        return modMap.get(props.draft.p)
    } else if (props.draft.t === "Weapon") {
        return weaponMap.get(props.draft.p)
    } else if (props.draft.t === "IronTicket") {
        return iconticketMap.get(props.draft.p)
    } else if (props.draft.t === "CharAccessory") {
        return charAccessoryData.find(item => item.id === props.draft.p)
    }
    return null
})

// 获取当前图纸的掉落来源
const draftDungeons = computed(() => {
    return (draftDungeonMap.get(props.draft.p) || []).map(dungeon => {
        const dropInfo = getDraftDropInfo(dungeon, props.draft.p)

        return {
            key: `draft-dungeon-${props.draft.p}-${dungeon.id}`,
            dungeonId: dungeon.id,
            dungeonName: dungeon.n,
            dungeonType: dungeon.t,
            dungeonLv: dungeon.lv,
            rewardId: props.draft.p,
            ...dropInfo,
        } satisfies ResourceDungeonSourceInfo
    })
})

/**
 * 收集当前图纸的商店来源信息。
 * @param draft 图纸数据
 * @returns 商店来源列表
 */
function collectDraftShopSources(draft: Draft): ShopSourceInfo[] {
    const result: ShopSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    shopData.forEach(shop => {
        shop.mainTabs.forEach(mainTab => {
            mainTab.subTabs.forEach(subTab => {
                subTab.items.forEach(item => {
                    if (item.itemType !== "Draft" || item.typeId !== draft.id) {
                        return
                    }

                    const key = `shop-${shop.id}-${mainTab.id}-${subTab.id}-${item.id}-${draft.id}`
                    if (sourceKeySet.has(key)) {
                        return
                    }

                    sourceKeySet.add(key)
                    result.push({
                        key,
                        timeStart: item.startTime,
                        timeEnd: item.endTime,
                        detail: `${mainTab.name} -> ${subTab.name}`,
                        itemId: item.id,
                        shopId: shop.id,
                        shopName: shop.name,
                        subTabId: subTab.id,
                        price: item.price,
                        priceName: item.priceName,
                        num: item.num,
                        limit: item.limit,
                    })
                })
            })
        })
    })

    return result
}

const draftShopSources = computed<ShopSourceInfo[]>(() => collectDraftShopSources(props.draft))

/**
 * 获取产物展示项的 ResourceCostItem 入参。
 * @returns 产物名称与值
 */
const productDisplay = computed(() => {
    const productName = product.value && ("名称" in product.value ? product.value.名称 : product.value.name)

    if (["Mod", "Weapon", "IronTicket", "CharAccessory"].includes(props.draft.t)) {
        return {
            name: productName || props.draft.n,
            value: [props.draft.c, props.draft.p, props.draft.t] as [number, number, "Mod" | "Weapon" | "IronTicket" | "CharAccessory"],
        }
    }

    return {
        name: productName || props.draft.n,
        value: props.draft.c,
    }
})
</script>

<template>
    <div class="space-y-3">
        <div class="p-3 flex items-center gap-3">
            <SRouterLink :to="`/db/draft/${draft.id}`" class="text-lg font-bold link link-primary"
                >{{ $t("draft-detail.title") }}: {{ $t(draft.n) }}</SRouterLink
            >
            <CopyID :id="draft.id" />
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("draft-detail.basicInfo") }}</div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">{{ $t("draft-detail.rarity") }}</span>
                    <span class="font-medium text-primary">
                        <Icon v-for="i in draft.r" :key="i" class="inline-block mr-1" icon="ri:star-fill" />
                    </span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">{{ $t("draft-detail.version") }}</span>
                    <span class="font-medium text-primary">
                        {{ draft.v }}
                    </span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">{{ $t("draft-detail.type") }}</span>
                    <span class="font-medium text-primary">
                        {{ $t(getRewardTypeText(draft.t)) }}
                    </span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">{{ $t("draft-detail.craftDuration") }}</span>
                    <span class="font-medium text-primary">
                        {{ formatDuration(draft.d) }}
                    </span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">{{ $t("draft-detail.batchCrafting") }}</span>
                    <span class="font-medium text-primary">
                        <Icon v-if="draft.b" class="inline-block mr-1" icon="ri:checkbox-circle-fill" />
                        <Icon v-else class="inline-block mr-1" icon="ri:close-line" />
                    </span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">{{ $t("draft-detail.unlimitedCrafting") }}</span>
                    <span class="font-medium text-primary">
                        <Icon v-if="draft.i" class="inline-block mr-1" icon="ri:checkbox-circle-fill" />
                        <Icon v-else class="inline-block mr-1" icon="ri:close-line" />
                    </span>
                </div>
            </div>
        </div>

        <!-- 产物信息 -->
        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("draft-detail.product") }}</div>
            <ResourceCostItem :name="productDisplay.name" :value="productDisplay.value" />
        </div>

        <!-- 消耗资源 -->
        <div v-if="draft.x && draft.x.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("draft-detail.materials") }}</div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                <ResourceCostItem name="铜币" :value="draft.m" />
                <template v-for="item in draft.x" :key="item.id">
                    <ResourceCostItem :name="item.n" :value="item.t === 'Resource' ? item.c : [item.c, item.id, item.t]" />
                </template>
            </div>
        </div>

        <!-- 获取途径 -->
        <div v-if="draftShopSources.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("draft-detail.acquisition") }}</div>
            <ShopSource :shop-sources="draftShopSources" />
        </div>

        <!-- 掉落来源 -->
        <div v-if="draftDungeons.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("draft-detail.dropSources") }}</div>
            <DungeonSource :dungeon-sources="draftDungeons" />
        </div>
    </div>
</template>
