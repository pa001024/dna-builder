<script lang="ts" setup>
import { t } from "i18next"
import { computed } from "vue"
import { charData } from "@/data"
import type { Accessory, HeadFrameItem, SkinItem } from "@/data/d/accessory.data"
import draftData, { type Draft } from "@/data/d/draft.data"
import shopData from "@/data/d/shop.data"
import { resolveSkinIconUrl } from "@/utils/accessory-utils"
import type { ResourceDraftSourceInfo } from "@/utils/draft-source"
import type { ShopSourceInfo } from "@/utils/weapon-source"

type AccessoryType = "char" | "weapon" | "skin" | "weaponskin" | "headframe"

type CharAccessoryItem = Accessory & {
    accessoryType: "char"
}

type WeaponAccessoryItem = Accessory & {
    accessoryType: "weapon"
}

type WeaponSkinAccessoryItem = Accessory & {
    accessoryType: "weaponskin"
}

type SkinAccessoryItem = SkinItem & {
    accessoryType: "skin"
}

type HeadFrameAccessoryItem = HeadFrameItem & {
    accessoryType: "headframe"
}

type DetailAccessoryItem = CharAccessoryItem | WeaponAccessoryItem | SkinAccessoryItem | WeaponSkinAccessoryItem | HeadFrameAccessoryItem

const props = defineProps<{
    accessory: DetailAccessoryItem
}>()

/**
 * 判断是否为角色皮肤。
 * @param accessory 详情数据
 * @returns 是否为角色皮肤
 */
function isSkinAccessory(accessory: DetailAccessoryItem): accessory is SkinAccessoryItem {
    return accessory.accessoryType === "skin"
}

/**
 * 判断是否为武器皮肤。
 * @param accessory 详情数据
 * @returns 是否为武器皮肤
 */
function isWeaponSkinAccessory(accessory: DetailAccessoryItem): accessory is WeaponSkinAccessoryItem {
    return accessory.accessoryType === "weaponskin"
}

/**
 * 判断是否为头像框。
 * @param accessory 详情数据
 * @returns 是否为头像框
 */
function isHeadFrameAccessory(accessory: DetailAccessoryItem): accessory is HeadFrameAccessoryItem {
    return accessory.accessoryType === "headframe"
}

/**
 * 将饰品图标名转换为可访问的图片地址。
 * @param icon 图标资源名
 * @returns 图标 URL
 */
function getAccessoryIcon(icon: string): string {
    return resolveSkinIconUrl(icon)
}

/**
 * 获取武器皮肤图标地址。
 * @param icon 图标资源名
 * @returns 图标 URL
 */
function getWeaponSkinIcon(icon: string): string {
    return resolveSkinIconUrl(icon)
}

/**
 * 获取头像框图标地址。
 * @param icon 图标资源名
 * @returns 图标 URL
 */
function getHeadFrameIcon(icon: string): string {
    return icon ? `/imgs/headframe/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
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
    if (accessoryType === "weapon") {
        return "accessory.typeWeapon"
    }
    if (accessoryType === "headframe") {
        return "accessory.typeHeadFrame"
    }
    if (accessoryType === "weaponskin") {
        return "accessory.typeWeaponSkin"
    }
    return "accessory.typeSkin"
}

/**
 * 获取角色皮肤分类文本。
 * @param skin 角色皮肤数据
 * @returns 分类文本
 */
function getSkinCategoryText(skin: SkinItem): string {
    const charInfo = charData.find(char => char.id === skin.charId)
    if (!charInfo) {
        return skin.tag || skin.release || "-"
    }
    return `${charInfo.名称}${skin.tag ? ` · ${skin.tag}` : ""}`
}

/**
 * 获取角色皮肤图标地址。
 * @param icon 图标资源名
 * @returns 图标 URL
 */
function getSkinIcon(icon: string): string {
    return resolveSkinIconUrl(icon)
}

/**
 * 获取头像框分类文本。
 * @param headFrame 头像框数据
 * @returns 分类文本
 */
function getHeadFrameCategoryText(headFrame: HeadFrameItem): string {
    if (headFrame.access) {
        return headFrame.access
    }
    return "-"
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
): ShopSourceInfo[] {
    const result: ShopSourceInfo[] = []

    shopData.forEach(shop => {
        shop.mainTabs.forEach(mainTab => {
            mainTab.subTabs.forEach(subTab => {
                subTab.items.forEach(item => {
                    if (!matcher(item)) {
                        return
                    }

                    result.push({
                        key: `${shop.id}:${mainTab.id}:${subTab.id}:${item.id}:${draft?.id || 0}`,
                        itemId: item.id,
                        shopId: shop.id,
                        shopName: shop.name,
                        detail: `${mainTab.name} -> ${subTab.name}`,
                        subTabId: subTab.id,
                        price: item.price,
                        priceName: item.priceName,
                        num: item.num,
                        limit: item.limit,
                        timeStart: item.startTime,
                        timeEnd: item.endTime,
                    })
                })
            })
        })
    })

    return result
}

/**
 * 根据价格名称获取资源图标。
 * @param priceName 价格资源名称
 * @returns 资源图标 URL
 */
/**
 * 反查当前饰品对应的商店来源信息。
 */
const relatedShopSources = computed<ShopSourceInfo[]>(() => {
    const itemTypeMap = {
        char: "CharAccessory",
        weapon: "WeaponAccessory",
        skin: "Skin",
        weaponskin: "WeaponSkin",
        headframe: "HeadFrame",
    } as const
    const targetItemType = itemTypeMap[props.accessory.accessoryType]
    return collectShopSources(item => item.itemType === targetItemType && item.typeId === props.accessory.id)
})

/**
 * 当饰品本体没有商店来源时，通过图纸反查商店来源。
 */
const relatedDraftSources = computed<ResourceDraftSourceInfo[]>(() => {
    if (relatedShopSources.value.length > 0 || props.accessory.accessoryType !== "char") {
        return []
    }

    const accessoryDrafts = draftData.filter(draft => draft.t === "CharAccessory" && draft.p === props.accessory.id)

    return accessoryDrafts.map(draft => ({
        key: `draft-${draft.id}-${props.accessory.id}`,
        draft,
    }))
})

/**
 * 当饰品本体没有商店来源时，通过图纸反查商店来源。
 */
const relatedDraftShopSources = computed<ShopSourceInfo[]>(() => {
    if (relatedShopSources.value.length > 0 || props.accessory.accessoryType !== "char") {
        return []
    }

    const accessoryDrafts = draftData.filter(draft => draft.t === "CharAccessory" && draft.p === props.accessory.id)
    return accessoryDrafts.flatMap(draft =>
        collectShopSources(item => item.itemType === "Draft" && item.typeId === draft.id, { id: draft.id, n: draft.n })
    )
})

/**
 * 当前详情页展示的分类文本。
 */
const accessoryCategoryText = computed(() => {
    if (props.accessory.accessoryType === "skin") {
        return getSkinCategoryText(props.accessory)
    }
    if (props.accessory.accessoryType === "weaponskin") {
        return "武器"
    }
    if (props.accessory.accessoryType === "headframe") {
        return getHeadFrameCategoryText(props.accessory)
    }
    return "-"
})

/**
 * 供页面最终展示的商店来源（优先饰品本体，找不到时使用图纸来源）。
 */
const displayShopSources = computed<ShopSourceInfo[]>(() => {
    if (relatedShopSources.value.length > 0) {
        return relatedShopSources.value
    }
    return relatedDraftShopSources.value
})

/**
 * 详情页标题图标地址。
 */
const accessoryIcon = computed(() => {
    if (isHeadFrameAccessory(props.accessory)) {
        return getHeadFrameIcon(props.accessory.icon)
    }
    if (isWeaponSkinAccessory(props.accessory)) {
        return getWeaponSkinIcon(props.accessory.icon)
    }
    if (isSkinAccessory(props.accessory)) {
        return getSkinIcon(props.accessory.icon)
    }
    return getAccessoryIcon(props.accessory.icon)
})

/**
 * 详情页标题的展示名称。
 */
const accessoryName = computed(() => props.accessory.name)

/**
 * 详情页描述文本。
 */
const accessoryDesc = computed(() => props.accessory.desc)

/**
 * 详情页稀有度文本。
 */
const accessoryRarityValue = computed(() => props.accessory.accessoryType === "headframe" ? 1 : props.accessory.rarity)

/**
 * 详情页获取方式文本。
 */
const accessoryUnlock = computed(() => {
    if (isHeadFrameAccessory(props.accessory)) {
        return props.accessory.access || "-"
    }
    if (isSkinAccessory(props.accessory)) {
        return props.accessory.release ? `v${props.accessory.release}` : "-"
    }
    if (isWeaponSkinAccessory(props.accessory)) {
        return "-"
    }
    return props.accessory.unlock ? t(props.accessory.unlock) : "-"
})
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
            <img
                    :src="accessoryIcon"
                    :alt="accessoryName"
                    class="size-12 rounded-lg bg-linear-15 object-cover"
                    :class="isHeadFrameAccessory(accessory) ? 'bg-base-200' : getRarityGradientClass(accessoryRarityValue)"
                />
                <div class="min-w-0">
                    <div class="text-lg font-bold">
                        {{ $t(accessoryName) }}
                    </div>
                    <div class="text-xs text-base-content/70 mt-1">ID: {{ accessory.id }}</div>
                </div>
            </div>
            <span class="text-xs px-2 py-1 rounded" :class="getRarityBadgeClass(accessoryRarityValue)">
                {{ getRarityText(accessoryRarityValue) }}
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
                    <span class="text-base-content/70">{{ $t("accessory.category") }}</span>
                    <span>{{ accessoryCategoryText }}</span>
                </div>
                <div class="flex justify-between gap-2">
                    <span class="text-base-content/70">{{ $t("accessory.rarity") }}</span>
                    <span>{{ getRarityText(accessoryRarityValue) }}</span>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded-lg p-3 space-y-2">
            <h3 class="font-bold">{{ $t("accessory.description") }}</h3>
            <div class="text-sm text-base-content/80 wrap-break-word">
                {{ $t(accessoryDesc) }}
            </div>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded-lg p-3 space-y-2">
            <h3 class="font-bold">{{ $t("accessory.unlock") }}</h3>
            <div class="text-sm text-base-content/80 wrap-break-word">
                {{ accessoryUnlock }}
            </div>

            <div v-if="relatedDraftSources.length" class="pt-1 border-t border-base-200/70">
                <DraftSource :draft-sources="relatedDraftSources" />
            </div>

            <div class="pt-1 border-t border-base-200/70">
                <div v-if="displayShopSources.length" class="space-y-2">
                    <ShopSource :shop-sources="displayShopSources" />
                </div>
                <div v-else class="text-sm text-base-content/60">{{ $t("accessory.shopSourcesEmpty") }}</div>
            </div>
        </div>
    </div>
</template>
