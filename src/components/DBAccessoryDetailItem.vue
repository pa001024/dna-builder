<script lang="ts" setup>
import { computed } from "vue"
import { resourceMap } from "@/data"
import type { Accessory } from "@/data/d/accessory.data"
import draftData, { type Draft } from "@/data/d/draft.data"
import shopData from "@/data/d/shop.data"

type AccessoryType = "char" | "weapon" | "skin"

interface AccessoryItem extends Accessory {
    accessoryType: AccessoryType
}

interface AccessoryShopSource {
    key: string
    shopId: string
    shopName: string
    mainTabName: string
    subTabName: string
    subTabId: number
    price: number
    priceName: string
    limit?: number
    draftId?: number
    draftName?: string
}

interface AccessoryDraftSource {
    draft: Draft
    shopSources: AccessoryShopSource[]
}

const props = defineProps<{
    accessory: AccessoryItem
}>()

/**
 * 将饰品图标名转换为可访问的图片地址。
 * @param icon 图标资源名
 * @returns 图标 URL
 */
function getAccessoryIcon(icon: string): string {
    return icon ? `/imgs/fashion/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 根据稀有度返回背景渐变色，和资源品质颜色保持一致。
 * @param rarity 稀有度（1~5）
 * @returns Tailwind 渐变类名
 */
function getRarityGradientClass(rarity: number): string {
    const rarityMap: Record<number, string> = {
        1: "from-gray-900/80 to-gray-100/80",
        2: "from-green-900/80 to-green-100/80",
        3: "from-blue-900/80 to-blue-100/80",
        4: "from-purple-900/80 to-purple-100/80",
        5: "from-yellow-900/80 to-yellow-100/80",
    }

    return rarityMap[rarity] || rarityMap[1]
}

/**
 * 根据稀有度返回徽章颜色。
 * @param rarity 稀有度（1~5）
 * @returns Tailwind 颜色类名
 */
function getRarityBadgeClass(rarity: number): string {
    const rarityMap: Record<number, string> = {
        1: "bg-gray-500 text-white",
        2: "bg-green-600 text-white",
        3: "bg-blue-600 text-white",
        4: "bg-purple-600 text-white",
        5: "bg-yellow-500 text-black",
    }

    return rarityMap[rarity] || rarityMap[1]
}

/**
 * 根据稀有度返回文本标签。
 * @param rarity 稀有度（1~5）
 * @returns 稀有度文本
 */
function getRarityText(rarity: number): string {
    return ["白", "绿", "蓝", "紫", "金"][rarity - 1] || "白"
}

/**
 * 根据饰品类型返回对应的国际化键。
 * @param accessoryType 饰品类型
 * @returns 国际化键
 */
function getAccessoryTypeLabelKey(accessoryType: AccessoryType): string {
    if (accessoryType === "char") {
        return "accessory.typeChar"
    }
    return accessoryType === "weapon" ? "accessory.typeWeapon" : "accessory.typeSkin"
}

/**
 * 收集满足条件的商店来源信息。
 * @param matcher 条目匹配函数
 * @param draft 关联的图纸信息（可选）
 * @returns 商店来源列表
 */
function collectShopSources(
    matcher: (item: { itemType: string; typeId: number }) => boolean,
    draft?: Pick<Draft, "id" | "n">
): AccessoryShopSource[] {
    const result: AccessoryShopSource[] = []

    shopData.forEach(shop => {
        shop.mainTabs.forEach(mainTab => {
            mainTab.subTabs.forEach(subTab => {
                subTab.items.forEach(item => {
                    if (!matcher(item)) {
                        return
                    }

                    result.push({
                        key: `${shop.id}:${mainTab.id}:${subTab.id}:${item.id}:${draft?.id || 0}`,
                        shopId: shop.id,
                        shopName: shop.name,
                        mainTabName: mainTab.name,
                        subTabName: subTab.name,
                        subTabId: subTab.id,
                        price: item.price,
                        priceName: item.priceName,
                        limit: item.limit,
                        draftId: draft?.id,
                        draftName: draft?.n,
                    })
                })
            })
        })
    })

    return result
}

/**
 * 将分钟数转换为 HH:MM 形式的铸造时长。
 * @param minutes 铸造分钟数
 * @returns 格式化后的时间文本
 */
function formatDraftDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}

/**
 * 根据价格名称获取资源图标。
 * @param priceName 价格资源名称
 * @returns 资源图标 URL
 */
function getPriceIcon(priceName: string): string {
    const priceResource = resourceMap.get(priceName)
    return priceResource?.icon ? `/imgs/res/${priceResource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 反查当前饰品对应的商店来源信息。
 */
const relatedShopSources = computed<AccessoryShopSource[]>(() => {
    const itemTypeMap = {
        char: "CharAccessory",
        weapon: "WeaponAccessory",
        skin: "WeaponSkin",
    } as const
    const targetItemType = itemTypeMap[props.accessory.accessoryType]
    return collectShopSources(item => item.itemType === targetItemType && item.typeId === props.accessory.id)
})

/**
 * 当饰品本体没有商店来源时，通过图纸反查商店来源。
 */
const relatedDraftSources = computed<AccessoryDraftSource[]>(() => {
    if (relatedShopSources.value.length > 0 || props.accessory.accessoryType !== "char") {
        return []
    }

    const accessoryDrafts = draftData.filter(draft => draft.t === "CharAccessory" && draft.p === props.accessory.id)

    return accessoryDrafts.map(draft => ({
        draft,
        shopSources: collectShopSources(item => item.itemType === "Draft" && item.typeId === draft.id, { id: draft.id, n: draft.n }),
    }))
})

/**
 * 供页面最终展示的商店来源（优先饰品本体，找不到时使用图纸来源）。
 */
const displayShopSources = computed<AccessoryShopSource[]>(() => {
    if (relatedShopSources.value.length > 0) {
        return relatedShopSources.value
    }
    return relatedDraftSources.value.flatMap(source => source.shopSources)
})
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
                <img
                    :src="getAccessoryIcon(accessory.icon)"
                    :alt="accessory.name"
                    class="size-12 rounded-lg bg-linear-15 object-cover"
                    :class="getRarityGradientClass(accessory.rarity)"
                />
                <div class="min-w-0">
                    <SRouterLink
                        :to="`/db/accessory/${accessory.accessoryType}/${accessory.id}`"
                        class="text-lg font-bold link link-primary"
                    >
                        {{ $t(accessory.name) }}
                    </SRouterLink>
                    <div class="text-xs text-base-content/70 mt-1">ID: {{ accessory.id }}</div>
                </div>
            </div>
            <span class="text-xs px-2 py-1 rounded" :class="getRarityBadgeClass(accessory.rarity)">
                {{ getRarityText(accessory.rarity) }}
            </span>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded-lg p-3 space-y-2">
            <h3 class="font-bold">{{ $t("accessory.info") }}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">{{ $t("accessory.type") }}</span>
                    <span>{{ $t(getAccessoryTypeLabelKey(accessory.accessoryType)) }}</span>
                </div>
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">{{ $t("accessory.rarity") }}</span>
                    <span>{{ getRarityText(accessory.rarity) }}</span>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded-lg p-3 space-y-2">
            <h3 class="font-bold">{{ $t("accessory.description") }}</h3>
            <div class="text-sm text-base-content/80 wrap-break-word">
                {{ $t(accessory.desc) }}
            </div>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded-lg p-3 space-y-2">
            <h3 class="font-bold">{{ $t("accessory.unlock") }}</h3>
            <div class="text-sm text-base-content/80 wrap-break-word">
                {{ accessory.unlock ? $t(accessory.unlock) : "-" }}
            </div>

            <div v-if="relatedDraftSources.length" class="pt-1 border-t border-base-200/70">
                <div class="text-sm text-base-content/70 mb-2">{{ $t("accessory.draftInfo") }}</div>
                <div class="space-y-2">
                    <div
                        v-for="source in relatedDraftSources"
                        :key="source.draft.id"
                        class="rounded bg-base-200 p-2 text-xs opacity-80 space-y-2"
                    >
                        <div class="flex items-center justify-between gap-2">
                            <SRouterLink :to="`/db/draft/${source.draft.id}`" class="link link-primary text-sm">
                                {{ source.draft.n }}
                            </SRouterLink>
                            <span class="opacity-70">ID: {{ source.draft.id }}</span>
                        </div>
                        <div>{{ $t("accessory.draftDuration") }}: {{ formatDraftDuration(source.draft.d) }}</div>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2 text-sm opacity-100">
                            <ResourceCostItem name="铜币" :value="source.draft.m" />
                            <template v-for="material in source.draft.x" :key="`${source.draft.id}:${material.t}:${material.id}`">
                                <ResourceCostItem
                                    :name="material.n"
                                    :value="material.t === 'Mod' ? [material.c, material.id, material.t] : material.c"
                                />
                            </template>
                        </div>
                    </div>
                </div>
            </div>

            <div class="pt-1 border-t border-base-200/70">
                <div class="text-sm text-base-content/70 mb-2">{{ $t("accessory.shopSources") }}</div>
                <div v-if="displayShopSources.length" class="space-y-2">
                    <div v-for="source in displayShopSources" :key="source.key" class="rounded bg-base-200 p-2">
                        <div class="flex items-center justify-between gap-2">
                            <SRouterLink :to="`/db/shop/${source.shopId}/${source.subTabId}`" class="link link-primary text-sm">
                                {{ source.shopName }}
                            </SRouterLink>
                            <span class="text-xs opacity-70">{{ source.shopId }}</span>
                        </div>
                        <div class="text-xs opacity-70 mt-1">{{ source.mainTabName }} / {{ source.subTabName }}</div>
                        <div v-if="source.draftId" class="text-xs opacity-70 mt-1">
                            {{ $t("accessory.draftInfo") }}:
                            <SRouterLink :to="`/db/draft/${source.draftId}`" class="link link-primary">
                                {{ source.draftName || source.draftId }}
                            </SRouterLink>
                        </div>
                        <div class="text-xs opacity-70 mt-1 flex items-center gap-1">
                            <span>{{ $t("accessory.shopPrice") }}:</span>
                            <img :src="getPriceIcon(source.priceName)" :alt="source.priceName" class="size-4 rounded object-cover" />
                            <span>{{ source.price }}</span>
                            <span>{{ source.priceName }}</span>
                        </div>
                        <div v-if="source.limit !== undefined" class="text-xs opacity-70 mt-1">
                            {{ $t("accessory.shopLimit") }}: {{ source.limit }}
                        </div>
                    </div>
                </div>
                <div v-else class="text-sm text-base-content/60">{{ $t("accessory.shopSourcesEmpty") }}</div>
            </div>
        </div>
    </div>
</template>
