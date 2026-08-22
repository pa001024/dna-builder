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

// 获取当前设计稿的掉落来源
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
 * 收集当前设计稿的商店来源信息。
 * @param draft 设计稿数据
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
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 设计稿档案头：纸面 + primary 强调线 -->
        <header class="border-b-2 border-primary pb-4">
            <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                Blueprint File
            </p>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <SRouterLink
                    :to="`/db/draft/${draft.id}`"
                    class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                    >{{ $t("UI_FORGING_BLUEPRINT") }}{{ $t(draft.n) }}</SRouterLink
                >
                <CopyID :id="draft.id" />
            </div>
        </header>

        <!-- 基本信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="INFO" :title="$t('draft-detail.basicInfo')" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("draft-detail.rarity") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        <Icon v-for="i in draft.r" :key="i" class="mr-1 inline-block" icon="ri:star-fill" />
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("draft-detail.version") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ draft.v }}
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("draft-detail.type") }}</span>
                    <span class="shrink-0 text-[13px] font-semibold text-primary">
                        {{ $t(getRewardTypeText(draft.t)) }}
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("draft-detail.craftDuration") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ formatDuration(draft.d) }}
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("draft-detail.batchCrafting") }}</span>
                    <span class="shrink-0 text-[13px] font-semibold text-primary">
                        <Icon v-if="draft.b" class="mr-1 inline-block" icon="ri:checkbox-circle-fill" />
                        <Icon v-else class="mr-1 inline-block" icon="ri:close-line" />
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("draft-detail.unlimitedCrafting") }}</span>
                    <span class="shrink-0 text-[13px] font-semibold text-primary">
                        <Icon v-if="draft.i" class="mr-1 inline-block" icon="ri:checkbox-circle-fill" />
                        <Icon v-else class="mr-1 inline-block" icon="ri:close-line" />
                    </span>
                </div>
            </div>
        </section>

        <!-- 产物信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="PRODUCT" :title="$t('draft-detail.product')" />
            <ResourceCostItem :name="productDisplay.name" :value="productDisplay.value" />
        </section>

        <!-- 消耗资源 -->
        <section v-if="draft.x && draft.x.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="MATERIALS" :title="$t('draft-detail.materials')" />
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                <ResourceCostItem name="铜币" :value="draft.m" />
                <template v-for="item in draft.x" :key="item.id">
                    <ResourceCostItem :name="item.n" :value="item.t === 'Resource' ? item.c : [item.c, item.id, item.t]" />
                </template>
            </div>
        </section>

        <!-- 获取途径 -->
        <section v-if="draftShopSources.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ACQUISITION" :title="$t('draft-detail.acquisition')" />
            <ShopSource :shop-sources="draftShopSources" />
        </section>

        <!-- 掉落来源 -->
        <section v-if="draftDungeons.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DROP SOURCES" :title="$t('draft-detail.dropSources')" />
            <DungeonSource :dungeon-sources="draftDungeons" />
        </section>
    </div>
</template>
