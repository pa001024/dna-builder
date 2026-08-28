<script lang="ts" setup>
import { t } from "i18next"
import { computed } from "vue"
import { charData } from "@/data"
import type { Accessory, HairItem, HeadFrameItem, HeadSculptureItem, SkinItem } from "@/data/d/accessory.data"
import draftData, { type Draft } from "@/data/d/draft.data"
import shopData from "@/data/d/shop.data"
import { getWanhuaSkinUnlock, resolveSkinIconUrl } from "@/utils/accessory-utils"
import type { ResourceDraftSourceInfo } from "@/utils/draft-source"
import { getRarityBadgeClass, getRarityName } from "@/utils/rarity-utils"
import type { ShopSourceInfo } from "@/utils/weapon-source"

type AccessoryType = "char" | "weapon" | "skin" | "weaponskin" | "hair" | "headframe" | "head"

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

type HairAccessoryItem = HairItem & {
    accessoryType: "hair"
}

type HeadFrameAccessoryItem = HeadFrameItem & {
    accessoryType: "headframe"
}

type HeadAccessoryItem = HeadSculptureItem & {
    accessoryType: "head"
}

type DetailAccessoryItem =
    | CharAccessoryItem
    | WeaponAccessoryItem
    | SkinAccessoryItem
    | WeaponSkinAccessoryItem
    | HairAccessoryItem
    | HeadFrameAccessoryItem
    | HeadAccessoryItem

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
 * 判断是否为发型。
 * @param accessory 详情数据
 * @returns 是否为发型
 */
function isHairAccessory(accessory: DetailAccessoryItem): accessory is HairAccessoryItem {
    return accessory.accessoryType === "hair"
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
 * 判断是否为头像。
 * @param accessory 详情数据
 * @returns 是否为头像
 */
function isHeadAccessory(accessory: DetailAccessoryItem): accessory is HeadAccessoryItem {
    return accessory.accessoryType === "head"
}

/**
 * 判断是否为不显示稀有度的饰品。
 * @param accessory 详情数据
 * @returns 是否为不显示稀有度的饰品
 */
function isNoRarityAccessory(accessory: DetailAccessoryItem): accessory is HeadFrameAccessoryItem | HeadAccessoryItem {
    return accessory.accessoryType === "headframe" || accessory.accessoryType === "head"
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
 * 获取头像图标地址。
 * @param icon 图标资源名
 * @returns 图标 URL
 */
function getHeadIcon(icon: string): string {
    return icon ? `/imgs/webp/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
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
    if (accessoryType === "head") {
        return "accessory.typeAvatar"
    }
    if (accessoryType === "weaponskin") {
        return "accessory.typeWeaponSkin"
    }
    if (accessoryType === "hair") {
        return "accessory.typeHair"
    }
    return "accessory.typeSkin"
}

/**
 * 获取角色皮肤版本文本。
 * @param skin 角色皮肤数据
 * @returns 版本文本
 */
function getSkinReleaseText(skin: SkinItem): string {
    return skin.release ? `v${skin.release}` : "-"
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
 * @param draft 关联的设计稿信息（可选）
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
        hair: "Hair",
        headframe: "HeadFrame",
        head: "HeadSculpture",
    } as const
    const targetItemType = itemTypeMap[props.accessory.accessoryType]
    if (!targetItemType) {
        return []
    }
    return collectShopSources(item => item.itemType === targetItemType && item.typeId === props.accessory.id)
})

/**
 * 当饰品本体没有商店来源时，通过设计稿反查商店来源。
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
 * 当饰品本体没有商店来源时，通过设计稿反查商店来源。
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
    if (isSkinAccessory(props.accessory)) {
        const skin = props.accessory as SkinAccessoryItem
        const charInfo = charData.find(char => char.id === skin.charId)
        if (!charInfo) {
            return skin.tag || skin.release || "-"
        }
        return `${charInfo.名称}${skin.tag ? ` · ${skin.tag}` : ""}`
    }
    if (props.accessory.accessoryType === "weaponskin") {
        return "武器"
    }
    if (props.accessory.accessoryType === "headframe") {
        return getHeadFrameCategoryText(props.accessory)
    }
    if (props.accessory.accessoryType === "head") {
        return "-"
    }
    return "-"
})

/**
 * 供页面最终展示的商店来源（优先饰品本体，找不到时使用设计稿来源）。
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
    if (isHeadAccessory(props.accessory)) {
        return getHeadIcon(props.accessory.icon)
    }
    if (isWeaponSkinAccessory(props.accessory)) {
        return getWeaponSkinIcon(props.accessory.icon)
    }
    if (isHairAccessory(props.accessory)) {
        return getAccessoryIcon(props.accessory.icon)
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
const accessoryVersionText = computed(() => (isSkinAccessory(props.accessory) ? getSkinReleaseText(props.accessory) : ""))
const accessoryDetailLink = computed(() => {
    if (props.accessory.accessoryType === "char") {
        return `/db/accessory/char/${props.accessory.id}`
    }
    if (props.accessory.accessoryType === "weapon") {
        return `/db/accessory/weapon/${props.accessory.id}`
    }
    if (props.accessory.accessoryType === "skin") {
        return `/db/accessory/skin/${props.accessory.id}`
    }
    if (props.accessory.accessoryType === "weaponskin") {
        return `/db/accessory/weaponskin/${props.accessory.id}`
    }
    if (props.accessory.accessoryType === "hair") {
        return `/db/accessory/hair/${props.accessory.id}`
    }
    if (props.accessory.accessoryType === "headframe") {
        return `/db/accessory/headframe/${props.accessory.id}`
    }
    if (props.accessory.accessoryType === "head") {
        return `/db/accessory/head/${props.accessory.id}`
    }
    return ""
})

/**
 * 详情页描述文本。
 */
const accessoryDesc = computed(() => props.accessory.desc ?? "")

/**
 * 详情页稀有度文本。
 */
const accessoryRarityValue = computed(() => {
    if (isNoRarityAccessory(props.accessory)) {
        return 1
    }
    return props.accessory.rarity
})

/**
 * 详情页获取方式文本。
 * 角色皮肤根据 SkinGacha 中的引用自动填充万华来源。
 */
const accessoryUnlock = computed(() => {
    if (isHeadFrameAccessory(props.accessory)) {
        return props.accessory.access || "-"
    }
    if (isHeadAccessory(props.accessory)) {
        return "-"
    }
    if (isSkinAccessory(props.accessory)) {
        return getWanhuaSkinUnlock(props.accessory.id) || "-"
    }
    if (isWeaponSkinAccessory(props.accessory)) {
        return "-"
    }
    if (isHairAccessory(props.accessory)) {
        return "-"
    }
    return props.accessory.unlock ? t(props.accessory.unlock) : "-"
})
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 饰品档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative flex items-start gap-3.5">
                <img :src="accessoryIcon" :alt="accessoryName" class="size-14 shrink-0 rounded-xs bg-base-content/6 object-cover" />
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Accessory File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            v-if="accessoryDetailLink"
                            :to="accessoryDetailLink"
                            class="truncate font-orbitron text-xl leading-none font-bold tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(accessoryName) }}
                        </SRouterLink>
                        <div
                            v-else
                            class="truncate font-orbitron text-xl leading-none font-bold tracking-tight text-base-content sm:text-2xl"
                        >
                            {{ $t(accessoryName) }}
                        </div>
                        <span
                            v-if="accessoryVersionText"
                            class="shrink-0 rounded-xs border border-base-content/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-base-content/50"
                        >
                            {{ accessoryVersionText }}
                        </span>
                        <span
                            v-if="!isHeadFrameAccessory(accessory) && !isHeadAccessory(accessory)"
                            :class="getRarityBadgeClass(accessoryRarityValue)"
                        >
                            {{ getRarityName(accessoryRarityValue) }}
                        </span>
                    </div>
                    <div class="mt-2">
                        <CopyID :id="accessory.id" />
                    </div>
                </div>
            </div>
        </header>

        <!-- 基本信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="INFO" :title="$t('accessory.info')" />
            <div class="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">{{ $t("accessory.type") }}</span>
                    <span class="truncate text-sm text-base-content/85">{{ $t(getAccessoryTypeLabelKey(accessory.accessoryType)) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="shrink-0 text-xs text-base-content/60">{{
                        isSkinAccessory(accessory) ? $t("角色") : $t("accessory.category")
                    }}</span>
                    <span class="truncate text-sm text-base-content/85">{{ accessoryCategoryText }}</span>
                </div>
            </div>
        </section>

        <!-- 描述 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('accessory.description')" />
            <div class="wrap-break-word text-sm text-base-content/90">
                {{ $t(accessoryDesc) }}
            </div>
        </section>

        <!-- 获取方式 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="UNLOCK" :title="$t('accessory.unlock')" />
            <div class="wrap-break-word text-sm text-base-content/90">
                {{ accessoryUnlock }}
            </div>

            <div v-if="relatedDraftSources.length" class="mt-2.5 border-t border-base-content/10 pt-2.5">
                <DraftSource :draft-sources="relatedDraftSources" />
            </div>

            <div class="mt-2.5 border-t border-base-content/10 pt-2.5">
                <div v-if="displayShopSources.length" class="space-y-2">
                    <ShopSource :shop-sources="displayShopSources" />
                </div>
                <div v-else class="text-sm text-base-content/60">{{ $t("accessory.shopSourcesEmpty") }}</div>
            </div>
        </section>
    </div>
</template>
