<script lang="ts" setup>
import { computed } from "vue"
import {
    cutoffMap,
    draftMap,
    LeveledMod,
    LeveledPet,
    LeveledWeapon,
    modMap,
    petMap,
    resourceMap,
    rewardMap,
    walnutMap,
    weaponMap,
} from "@/data"
import { skinMap } from "@/data/d"
import { charAccessoryData, hairData, headFrameData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"
import type { Cutoff } from "@/data/d/cutoff.data"
import { headSculptureMap } from "@/data/d/headsculpture.data"
import { iconticketMap } from "@/data/d/iconticket.data"
import { mountData } from "@/data/d/mount.data"
import type { ShopItem } from "@/data/d/shop.data"
import { resolveSkinIconUrl } from "@/utils/accessory-utils"
import { getRewardTypeText } from "@/utils/i18n-utils"
import { getImprType, getRegionType } from "@/utils/quest-utils"
import { getRewardDetails } from "@/utils/reward-utils"
import { formatDateTime } from "@/utils/time"

// 定义带有子项的商品类型
interface ShopItemWithChildren extends ShopItem {
    children?: ShopItemWithChildren[]
    diffState?: "added" | "removed"
}

const props = defineProps<{
    item: ShopItemWithChildren
}>()

/**
 * 反查当前商品对应的折扣配置。
 */
const cutoffInfo = computed<Cutoff | null>(() => cutoffMap.get(props.item.id) ?? null)

/**
 * 当前商品的实际展示价格。
 * 有折扣时显示折后价，否则显示商品原价。
 */
const currentPrice = computed(() => cutoffInfo.value?.price ?? props.item.price)

/**
 * 获取现实货币支付信息。
 * @returns 支付货币与金额；未配置时返回空
 */
const payInfo = computed(() => {
    const pay = props.item.pay
    if (!pay) {
        return null
    }

    const currency = pay.CNY != null ? "CNY" : Object.keys(pay)[0]
    const amount = currency ? pay[currency as keyof NonNullable<typeof pay>] : undefined
    if (typeof amount !== "number") {
        return null
    }

    const currencies = Object.entries(pay)
        .filter(([, value]) => typeof value === "number")
        .sort(([a], [b]) => {
            if (a === "CNY") return -1
            if (b === "CNY") return 1
            return a.localeCompare(b)
        })
        .map(([code, value]) => ({ code, value: value as number }))

    return {
        currency,
        amount,
        currencies,
    }
})

/**
 * 格式化时间戳，便于 tooltip 展示。
 * @param timestamp 秒级时间戳
 * @returns 本地化时间文本
 */
function formatCutoffTime(timestamp: number) {
    return formatDateTime(timestamp)
}

/**
 * 格式化印象检定标签。
 * @param imprCheck 印象检定原始数据
 * @returns 印象检定文本
 */
function formatImpressionCheck(imprCheck: NonNullable<ShopItem["imprCheck"]>): string {
    const [regionId, imprType, threshold] = imprCheck
    return `印象检定 ${getRegionType(regionId)}·${getImprType(imprType as Parameters<typeof getImprType>[0])} ≥ ${threshold}`
}

const itemDetail = computed(() => {
    switch (props.item.itemType) {
        case "Mod":
            const mod = modMap.get(props.item.typeId)
            return {
                type: "Mod" as const,
                mod,
                icon: LeveledMod.url(mod?.icon),
                link: `/db/mod/${mod?.id}`,
            }
        case "Weapon":
            const weapon = weaponMap.get(props.item.typeId)
            return {
                type: "Weapon" as const,
                weapon,
                icon: LeveledWeapon.url(weapon?.icon),
                link: `/db/weapon/${weapon?.id}`,
            }
        case "Pet":
            const pet = petMap.get(props.item.typeId)
            return {
                type: "Pet" as const,
                pet,
                icon: pet?.icon ? LeveledPet.url(pet.icon) : "/imgs/webp/T_Head_Empty.webp",
                link: `/db/pet/${pet?.id}`,
            }
        case "Hair":
            const hair = hairData.find(item => item.id === props.item.typeId)
            return {
                type: "Hair" as const,
                hair,
                icon: hair?.icon ? resolveSkinIconUrl(hair.icon) : "/imgs/webp/T_Head_Empty.webp",
                link: `/db/accessory/hair/${hair?.id}`,
            }
        case "Resource":
            const res = resourceMap.get(props.item.typeId)
            return {
                type: "Resource" as const,
                res,
                icon: `/imgs/res/${res?.icon}.webp`,
                link: res?.id ? `/db/resource/${res.id}` : "",
            }
        case "Draft":
            const draft = draftMap.get(props.item.typeId)
            let icon = `/imgs/webp/T_Head_Empty.webp`
            if (draft?.t === "IronTicket") {
                const ticket = iconticketMap.get(draft.p)
                return {
                    type: "IronTicket" as const,
                    draft,
                    ticket,
                    name: ticket?.name || draft.n,
                    icon: ticket?.icon ? `/imgs/res/${ticket.icon}.webp` : icon,
                    link: ticket ? `/db/iron-ticket/${ticket.id}` : `/db/draft/${draft.id}`,
                }
            }
            if (draft) {
                if (draft.t === "Mod" && draft.p) {
                    icon = LeveledMod.url(modMap.get(draft.p)?.icon)
                } else if (draft.t === "Weapon" && draft.p) {
                    icon = LeveledWeapon.url(weaponMap.get(draft.p)?.icon)
                } else {
                    switch (draft.t) {
                        case "CharAccessory":
                            let acc = charAccessoryData.find(item => item.id === props.item.typeId)
                            if (acc) icon = resolveSkinIconUrl(acc.icon)
                    }
                }
            }
            return {
                type: "Draft" as const,
                draft,
                name: draft?.n,
                icon,
                link: `/db/draft/${draft?.id}`,
            }
        case "Walnut":
            const walnut = walnutMap.get(props.item.typeId)
            const reward = walnut?.奖励?.[0]
            let icon2 = `/imgs/webp/T_Head_Empty.webp`
            if (reward) {
                if (reward.type === "Mod") {
                    icon2 = LeveledMod.url(modMap.get(reward.id)?.icon)
                } else if (reward.type === "Weapon") {
                    icon2 = LeveledWeapon.url(weaponMap.get(reward.id)?.icon)
                } else if (reward.type === "Resource") {
                    icon2 = `/imgs/res/${resourceMap.get(reward.id)?.icon}.webp`
                }
            }
            return {
                type: "Walnut" as const,
                walnut,
                icon: icon2,
                link: `/db/walnut/${walnut?.id}`,
            }
        case "HeadSculpture":
            let head = headSculptureMap.get(props.item.typeId)
            if (head) {
                return {
                    type: props.item.itemType,
                    icon: `/imgs/webp/${head.icon}.webp`,
                    link: `/db/accessory/head/${head.id}`,
                }
            } else {
                return {
                    type: props.item.itemType,
                    icon: `/imgs/webp/T_Head_Empty.webp`,
                }
            }
        case "HeadFrame":
            const headFrame = headFrameData.find(item => item.id === props.item.typeId)
            if (headFrame) {
                return {
                    type: props.item.itemType,
                    icon: `/imgs/headframe/${headFrame.icon}.webp`,
                    link: `/db/accessory/headframe/${headFrame.id}`,
                }
            }
            return {
                type: props.item.itemType,
                icon: `/imgs/webp/T_Head_Empty.webp`,
            }
        case "Skin":
            const skin = skinMap.get(props.item.typeId)
            if (!skin) {
                return {
                    type: props.item.itemType,
                    icon: `/imgs/webp/T_Head_Empty.webp`,
                }
            }
            return {
                type: props.item.itemType,
                icon: resolveSkinIconUrl(skin.icon),
                link: `/db/accessory/skin/${skin.id}`,
            }
        case "Title":
            return {
                type: props.item.itemType,
                icon: `/imgs/webp/T_Icon_Random_Title.webp`,
            }
        case "Mount":
            let mount = mountData.find(item => item.id === props.item.typeId)
            if (mount) {
                return {
                    type: props.item.itemType,
                    icon: `/imgs/res/T_Icon_${mount.icon}.webp`,
                }
            } else {
                return {
                    type: props.item.itemType,
                    icon: `/imgs/webp/T_Head_Empty.webp`,
                }
            }
        case "CharAccessory":
        case "WeaponSkin":
        case "WeaponAccessory":
            let acc = weaponAccessoryData.find(item => item.id === props.item.typeId)
            if (!acc) acc = charAccessoryData.find(item => item.id === props.item.typeId)
            if (!acc) acc = weaponSkinData.find(item => item.id === props.item.typeId)
            if (!acc || !acc.icon)
                return {
                    type: props.item.itemType,
                    icon: `/imgs/webp/T_Head_Empty.webp`,
                }
            return {
                type: props.item.itemType,
                icon: resolveSkinIconUrl(acc.icon),
                link:
                    props.item.itemType === "CharAccessory"
                        ? `/db/accessory/char/${acc.id}`
                        : props.item.itemType === "WeaponAccessory"
                          ? `/db/accessory/weapon/${acc.id}`
                          : `/db/accessory/weaponskin/${acc.id}`,
            }
        case "TitleFrame":
            return {
                type: props.item.itemType,
                icon: `/imgs/webp/T_Icon_Random_TitleFrame.webp`,
            }
        case "Reward":
            const rewardDetail = rewardMap.get(props.item.typeId)
            return {
                type: props.item.itemType,
                icon: rewardDetail?.icon ? `/imgs/res/${rewardDetail.icon}.webp` : `/imgs/webp/T_Head_Empty.webp`,
            }
        default:
            return {
                type: props.item.itemType,
                icon: `/imgs/webp/T_Head_Empty.webp`,
            }
    }
})
function getPriceIcon(name: string) {
    const res = resourceMap.get(name)
    return res?.icon ? `/imgs/res/${res.icon}.webp` : `/imgs/webp/T_Head_Empty.webp`
}
</script>

<template>
    <div class="space-y-3">
        <!-- 商品项内容 -->
        <div
            class="group flex w-full items-center gap-2.5 border border-base-content/15 bg-base-content/3 p-2 transition-colors duration-200 hover:border-primary/60"
        >
            <div class="relative size-11 shrink-0 overflow-hidden rounded bg-base-200/40">
                <img
                    :src="itemDetail?.icon"
                    class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                    :alt="item.typeName"
                />
            </div>
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                    <span
                        v-if="item.diffState"
                        class="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded text-xs font-bold"
                        :class="item.diffState === 'added' ? 'bg-success text-success-content' : 'bg-error text-error-content'"
                    >
                        {{ item.diffState === "added" ? "+" : "-" }}
                    </span>
                    <h4
                        class="min-w-0 flex-1 truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary"
                    >
                        <SRouterLink
                            v-if="itemDetail?.link"
                            :to="itemDetail?.link"
                            class="hover:underline"
                            :title="itemDetail?.name || item.typeName"
                        >
                            {{ itemDetail?.name || item.typeName }}
                        </SRouterLink>
                        <span v-else>{{ itemDetail?.name || item.typeName }}</span>
                    </h4>
                    <span class="shrink-0 bg-base-content px-1 py-px text-[10px] uppercase text-base-100">
                        {{ $t(getRewardTypeText(item.itemType)) }}
                    </span>
                    <span class="shrink-0 text-[10px] text-base-content/60">x{{ item.num }}</span>
                    <span class="shrink-0 text-[10px] text-base-content/60">限购 {{ item.limit || "∞" }}</span>
                    <FullTooltip v-if="payInfo" side="top">
                        <template #tooltip>
                            <div class="flex flex-col gap-2 min-w-28">
                                <div class="text-sm font-bold">现实货币</div>
                                <div
                                    v-for="currency in payInfo.currencies"
                                    :key="currency.code"
                                    class="flex items-center justify-between gap-3 text-sm"
                                >
                                    <span class="text-xs text-neutral-500 whitespace-nowrap">{{ currency.code }}</span>
                                    <span class="font-medium text-primary">{{ currency.value }}</span>
                                </div>
                            </div>
                        </template>
                        <span class="ml-auto shrink-0 border border-base-content/25 bg-base-100/60 px-1 py-px text-[10px]">
                            {{ payInfo.currency }} {{ payInfo.amount }}
                        </span>
                    </FullTooltip>
                    <FullTooltip v-else-if="cutoffInfo" side="top">
                        <template #tooltip>
                            <div class="flex flex-col gap-2 max-w-75 min-w-28">
                                <div class="text-sm font-bold">{{ $t("shop-detail.discountInfo") }}</div>
                                <div class="flex justify-between items-center gap-2 text-sm">
                                    <div class="text-xs text-neutral-500 whitespace-nowrap">{{ $t("shop-detail.discount") }}</div>
                                    <div class="font-medium text-primary">{{ +(cutoffInfo.discount / 10).toFixed(1) }}折</div>
                                </div>
                                <div class="flex justify-between items-center gap-2 text-sm">
                                    <div class="text-xs text-neutral-500 whitespace-nowrap">{{ $t("shop-detail.originalPrice") }}</div>
                                    <div class="font-medium text-primary line-through">{{ cutoffInfo.originalPrice }}</div>
                                </div>
                                <div class="flex justify-between items-center gap-2 text-sm">
                                    <div class="text-xs text-neutral-500 whitespace-nowrap">{{ $t("shop-detail.currentPrice") }}</div>
                                    <div class="font-medium text-primary">{{ cutoffInfo.price }}</div>
                                </div>
                                <div class="text-xs text-neutral-500">
                                    <div>{{ $t("shop-detail.startTime") }}：{{ formatCutoffTime(cutoffInfo.startTime) }}</div>
                                    <div v-if="typeof cutoffInfo.endTime === 'number'">
                                        {{ $t("shop-detail.endTime") }}：{{ formatCutoffTime(cutoffInfo.endTime) }}
                                    </div>
                                </div>
                            </div>
                        </template>
                        <span
                            class="ml-auto flex shrink-0 items-center gap-1 border border-base-content/25 bg-base-100/60 px-1 py-px text-xs"
                        >
                            <img :src="getPriceIcon(item.priceName)" class="size-3 object-cover rounded" :alt="item.priceName" />
                            {{ currentPrice }}
                            <span class="font-normal text-base-content/40 line-through">{{ cutoffInfo.originalPrice }}</span>
                        </span>
                    </FullTooltip>
                    <span
                        v-else
                        class="ml-auto flex shrink-0 items-center gap-1 border border-base-content/25 bg-base-100/60 px-1 py-px text-xs"
                    >
                        <img :src="getPriceIcon(item.priceName)" class="size-3 object-cover rounded" :alt="item.priceName" />
                        {{ item.priceName }} {{ currentPrice }}
                    </span>
                </div>
                <div class="flex gap-2 items-center mt-1">
                    <div v-if="item.lv || item.cond" class="flex gap-2 text-xs text-base-content/45">
                        <span v-if="item.lv">Lv.{{ item.lv }}</span>
                        <span v-if="item.cond">解锁条件: {{ item.cond }}</span>
                    </div>
                    <div v-if="item.imprCheck">
                        <span class="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-xs leading-none text-info">
                            {{ formatImpressionCheck(item.imprCheck) }}
                        </span>
                    </div>
                    <div v-if="item.startTime || item.endTime" class="text-xs text-base-content/45 flex gap-2">
                        <span v-if="item.startTime">{{ formatDateTime(item.startTime) }}</span>
                        <span class="text-primary">~</span>
                        <span v-if="item.endTime">{{ formatDateTime(item.endTime) }}</span>
                        <span v-else>{{ $t("database.until_now") }}</span>
                    </div>
                </div>
                <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-base-content/45">
                    <CopyID :id="item.id" />
                    <CopyID :id="item.typeId" name="物品ID" />
                </div>
                <div v-if="item.itemType === 'Reward'" class="mt-1">
                    <RewardItem :reward="getRewardDetails(item.typeId)!" />
                </div>
            </div>
        </div>

        <!-- 递归渲染子项（同层子卡 grid autofill 并排） -->
        <div
            v-if="item.children && item.children.length"
            class="ml-6 grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-2 border-l border-base-content/10 pl-3"
        >
            <ShopItem v-for="child in item.children" :key="child.id" :item="child" />
        </div>
    </div>
</template>
