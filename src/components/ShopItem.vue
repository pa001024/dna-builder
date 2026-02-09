<script lang="ts" setup>
import { computed } from "vue"
import { draftMap, LeveledMod, LeveledWeapon, modMap, resourceMap, walnutMap, weaponMap } from "@/data"
import { charAccessoryData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"
import { headSculptureMap } from "@/data/d/headsculpture.data"
import type { ShopItem } from "@/data/d/shop.data"
import { getRewardDetails, getRewardTypeText } from "@/utils/reward-utils"

// 定义带有子项的商品类型
interface ShopItemWithChildren extends ShopItem {
    children?: ShopItemWithChildren[]
}

const props = defineProps<{
    item: ShopItemWithChildren
}>()

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
        case "Resource":
            const res = resourceMap.get(props.item.typeId)
            return {
                type: "Resource" as const,
                res,
                icon: `/imgs/res/${res?.icon}.webp`,
            }
        case "Draft":
            const draft = draftMap.get(props.item.typeId)
            let icon = `/imgs/webp/T_Head_Empty.webp`
            if (draft) {
                if (draft.t === "Mod" && draft.p) {
                    icon = LeveledMod.url(modMap.get(draft.p)?.icon)
                } else if (draft.t === "Weapon" && draft.p) {
                    icon = LeveledWeapon.url(weaponMap.get(draft.p)?.icon)
                } else {
                    switch (draft.t) {
                        case "CharAccessory":
                            let acc = charAccessoryData.find(item => item.id === props.item.typeId)
                            if (acc) icon = `/imgs/fashion/${acc.icon}.webp`
                    }
                }
            }
            return {
                type: "Draft" as const,
                draft,
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
                    icon: `/imgs/head/${head.icon}.webp`,
                }
            } else {
                return {
                    type: props.item.itemType,
                    icon: `/imgs/webp/T_Head_Empty.webp`,
                }
            }
        case "Title":
            return {
                type: props.item.itemType,
                icon: `/imgs/webp/T_Icon_Random_Title.webp`,
            }
        case "CharAccessory":
        case "WeaponSkin":
        case "WeaponAccessory":
            let acc = weaponAccessoryData.find(item => item.id === props.item.typeId)
            if (!acc) acc = charAccessoryData.find(item => item.id === props.item.typeId)
            if (!acc) acc = weaponSkinData.find(item => item.id === props.item.typeId)
            if (!acc)
                return {
                    type: props.item.itemType,
                    icon: `/imgs/webp/T_Head_Empty.webp`,
                }
            return {
                type: props.item.itemType,
                icon: `/imgs/fashion/${acc.icon}.webp`,
            }
        case "TitleFrame":
            return {
                type: props.item.itemType,
                icon: `/imgs/webp/T_Icon_Random_TitleFrame.webp`,
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
        <div class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6">
                        <img :src="itemDetail?.icon" class="w-full h-full object-cover rounded" :alt="item.typeName" />
                    </div>
                    <div>
                        <SRouterLink v-if="itemDetail?.link" :to="itemDetail?.link" class="hover:underline">
                            {{ item.typeName }}
                        </SRouterLink>
                        <span v-else>{{ item.typeName }}</span>
                        <span class="ml-1 text-xs text-base-content/70">({{ $t(getRewardTypeText(item.itemType)) }})</span>
                        <span class="text-xs px-1.5 py-0.5 rounded bg-base-300">x{{ item.num }}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex items-center gap-1">
                        <img :src="getPriceIcon(item.priceName)" class="w-4 h-4 object-cover rounded" :alt="item.priceName" />
                        <span class="text-xs text-base-content/70">{{ item.priceName }}</span>
                        <span class="text-sm font-medium">{{ item.price }}</span>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-4 gap-2 text-xs">
                <div><span class="text-base-content/70">ID:</span> {{ item.id }}</div>
                <div><span class="text-base-content/70">物品ID:</span> {{ item.typeId }}</div>
                <div><span class="text-base-content/70">限购:</span> {{ item.limit || "∞" }}</div>
            </div>
            <div v-if="item.startTime" class="mt-1 text-xs text-base-content/70">
                <span>开始时间:</span> {{ new Date(item.startTime * 1000).toLocaleString() }}
                <span v-if="item.endTime" class="ml-2">结束时间:</span>
                {{ item.endTime ? new Date(item.endTime * 1000).toLocaleString() : "" }}
            </div>
            <div v-if="item.itemType === 'Reward'" class="mt-1">
                <RewardItem :reward="getRewardDetails(item.typeId)!" />
            </div>
        </div>

        <!-- 递归渲染子项 -->
        <div v-if="item.children && item.children.length" class="ml-6 pl-3">
            <ShopItem v-for="child in item.children" :key="child.id" :item="child" />
        </div>
    </div>
</template>
