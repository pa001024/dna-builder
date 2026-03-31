<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { type Accessory, charAccessoryData, type HeadFrameItem, type HeadSculptureItem, headFrameData, type SkinItem, skinData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"
import { headSculptureData } from "@/data/d/headsculpture.data"
import { getAccessoryUnlockLabelKey, normalizeAccessoryUnlock, resolveSkinIconUrl } from "@/utils/accessory-utils"
import { matchPinyin } from "@/utils/pinyin-utils"

type AccessoryType = "char" | "weapon" | "skin" | "weaponskin" | "headframe" | "head"

type CharAccessoryItem = Accessory & { accessoryType: "char" }
type WeaponAccessoryItem = Accessory & { accessoryType: "weapon" }
type WeaponSkinAccessoryItem = Accessory & { accessoryType: "weaponskin" }
type SkinAccessoryItem = SkinItem & { accessoryType: "skin" }
type HeadFrameAccessoryItem = HeadFrameItem & { accessoryType: "headframe" }
type HeadAccessoryItem = HeadSculptureItem & { accessoryType: "head" }
type AccessoryItem = CharAccessoryItem | WeaponAccessoryItem | SkinAccessoryItem | WeaponSkinAccessoryItem | HeadFrameAccessoryItem | HeadAccessoryItem

/**
 * 判断当前饰品是否包含获取方式字段。
 * @param accessory 饰品数据
 * @returns 是否包含获取方式
 */
function hasAccessoryUnlock(accessory: AccessoryItem): accessory is CharAccessoryItem | WeaponAccessoryItem | WeaponSkinAccessoryItem {
    return "unlock" in accessory && typeof accessory.unlock === "string"
}

/**
 * 判断当前饰品是否包含稀有度字段。
 * @param accessory 饰品数据
 * @returns 是否包含稀有度
 */
function hasAccessoryRarity(accessory: AccessoryItem): accessory is CharAccessoryItem | WeaponAccessoryItem | SkinAccessoryItem | WeaponSkinAccessoryItem {
    return "rarity" in accessory && typeof accessory.rarity === "number"
}

/**
 * 获取饰品的获取方式文本。
 * @param accessory 饰品数据
 * @returns 获取方式文本
 */
function getAccessoryUnlockText(accessory: AccessoryItem): string {
    return hasAccessoryUnlock(accessory) ? accessory.unlock : ""
}

/**
 * 获取饰品的稀有度数值。
 * @param accessory 饰品数据
 * @returns 稀有度，缺失时返回 1
 */
function getAccessoryRarity(accessory: AccessoryItem): number {
    return hasAccessoryRarity(accessory) ? accessory.rarity : 1
}

const searchKeyword = useSearchParam<string>("kw", "")
const selectedAccessoryKey = useSearchParam<string>("id", "")
const selectedType = useSearchParam<"all" | AccessoryType>("tp", "all")
const selectedRarity = useSearchParam<number>("rar", -1)
const selectedUnlock = useSearchParam<string>("ul", "all")

/**
 * 合并角色饰品与武器饰品数据，并标记来源类型。
 */
const allAccessories = computed<AccessoryItem[]>(() => {
    const charItems: CharAccessoryItem[] = charAccessoryData.map(item => ({ ...item, accessoryType: "char" }))
    const weaponItems: WeaponAccessoryItem[] = weaponAccessoryData.map(item => ({ ...item, accessoryType: "weapon" }))
    const skinItems: SkinAccessoryItem[] = skinData.map(item => ({ ...item, accessoryType: "skin" }))
    const weaponSkinItems: WeaponSkinAccessoryItem[] = weaponSkinData.map(item => ({ ...item, accessoryType: "weaponskin" }))
    const headFrameItems: HeadFrameAccessoryItem[] = headFrameData.map(item => ({ ...item, accessoryType: "headframe" }))
    const headItems: HeadAccessoryItem[] = headSculptureData.map(item => ({ ...item, accessoryType: "head" }))
    return [...charItems, ...weaponItems, ...skinItems, ...weaponSkinItems, ...headFrameItems, ...headItems]
})

/**
 * 根据当前选择的 Key 返回详情数据。
 */
const selectedAccessory = computed(() => {
    if (!selectedAccessoryKey.value) {
        return null
    }
    return allAccessories.value.find(item => `${item.accessoryType}:${item.id}` === selectedAccessoryKey.value) || null
})

/**
 * 汇总可用于筛选的获取方式列表（去重并移除空值）。
 */
const allUnlockMethods = computed(() => {
    const unlockMethods = new Set<string>()
    for (const accessory of allAccessories.value) {
        const normalizedUnlock = normalizeAccessoryUnlock(getAccessoryUnlockText(accessory))
        if (normalizedUnlock) {
            unlockMethods.add(normalizedUnlock)
        }
    }
    return Array.from(unlockMethods)
})

/**
 * 汇总可用于筛选的稀有度列表（去重并升序）。
 */
const allRarities = computed(() => {
    const raritySet = new Set<number>()
    for (const accessory of allAccessories.value) {
        if (accessory.accessoryType === "headframe" || accessory.accessoryType === "head") {
            continue
        }
        if (!hasAccessoryRarity(accessory)) {
            continue
        }
        const rarity = getAccessoryRarity(accessory)
        if (rarity > 0) {
            raritySet.add(rarity)
        }
    }
    return Array.from(raritySet).sort((a, b) => a - b)
})

/**
 * 过滤饰品列表，支持类型/稀有度/获取方式筛选和拼音搜索。
 */
const filteredAccessories = computed(() => {
    return allAccessories.value.filter(item => {
        if (selectedType.value !== "all" && item.accessoryType !== selectedType.value) {
            return false
        }

        if (item.accessoryType === "headframe" || item.accessoryType === "head") {
            if (selectedRarity.value !== -1) {
                return false
            }
        }

        const hasRarity = hasAccessoryRarity(item)
        const rarity = getAccessoryRarity(item)

        if (!hasRarity) {
            if (selectedRarity.value !== -1) {
                return false
            }
        } else if (selectedRarity.value !== -1 && rarity !== selectedRarity.value) {
            return false
        }

        const unlockText = getAccessoryUnlockText(item)

        if (hasAccessoryUnlock(item) && selectedUnlock.value !== "all" && normalizeAccessoryUnlock(unlockText) !== selectedUnlock.value) {
            return false
        }

        if (!hasAccessoryUnlock(item) && selectedUnlock.value !== "all") {
            return false
        }

        if (!searchKeyword.value) {
            return true
        }

        const query = searchKeyword.value
        if (
            `${item.id}`.includes(query) ||
            item.name.includes(query) ||
            item.desc.includes(query) ||
            unlockText.includes(query) ||
            `${rarity}`.includes(query)
        ) {
            return true
        }

        return matchPinyin(item.name, query).match || matchPinyin(item.desc, query).match || matchPinyin(unlockText, query).match
    })
})

/**
 * 切换当前选中的饰品。
 * @param accessory 目标饰品，传入 null 表示取消选择
 */
function selectAccessory(accessory: AccessoryItem | null) {
    selectedAccessoryKey.value = accessory ? `${accessory.accessoryType}:${accessory.id}` : ""
}

/**
 * 将饰品图标名转换为可访问的图片地址。
 * @param icon 图标资源名
 * @returns 图标 URL
 */
function getAccessoryIcon(accessory: AccessoryItem): string {
    if (accessory.accessoryType === "weaponskin") {
        return resolveSkinIconUrl(accessory.icon)
    }
    if (accessory.accessoryType === "headframe") {
        return accessory.icon ? `/imgs/headframe/${accessory.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
    }
    if (accessory.accessoryType === "head") {
        return accessory.icon ? `/imgs/webp/${accessory.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
    }
    if (accessory.accessoryType === "skin") {
        return resolveSkinIconUrl(accessory.icon)
    }
    return accessory.icon ? `/imgs/fashion/${accessory.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 根据稀有度返回背景渐变色。
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
 * 获取饰品类型标签的国际化键。
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
    if (accessoryType === "skin") {
        return "accessory.typeSkin"
    }
    if (accessoryType === "weaponskin") {
        return "accessory.typeWeaponSkin"
    }
    if (accessoryType === "headframe") {
        return "accessory.typeHeadFrame"
    }
    if (accessoryType === "head") {
        return "accessory.typeAvatar"
    }
    return "accessory.typeSkin"
}

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden"
                :class="{ 'border-r border-base-200': selectedAccessory }">
                <div class="p-3 border-b border-base-200">
                    <input v-model="searchKeyword" type="text" :placeholder="$t('accessory.searchPlaceholder')"
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all" />
                </div>

                <div class="p-2 border-b border-base-200">
                    <div class="flex flex-wrap gap-1 pb-1">
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === 'all' ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedType = 'all'">
                            {{ $t("accessory.typeAll") }}
                        </button>
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === 'char' ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedType = 'char'">
                            {{ $t("accessory.typeChar") }}
                        </button>
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === 'weapon' ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedType = 'weapon'">
                            {{ $t("accessory.typeWeapon") }}
                        </button>
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === 'skin' ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedType = 'skin'">
                            {{ $t("accessory.typeSkin") }}
                        </button>
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === 'weaponskin' ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedType = 'weaponskin'">
                            {{ $t("accessory.typeWeaponSkin") }}
                        </button>
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === 'headframe' ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedType = 'headframe'">
                            {{ $t("accessory.typeHeadFrame") }}
                        </button>
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === 'head' ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedType = 'head'">
                            {{ $t("accessory.typeAvatar") }}
                        </button>
                    </div>

                    <div class="flex flex-wrap gap-1 pb-1">
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedRarity === -1 ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedRarity = -1">
                            {{ $t("全部") }}
                        </button>
                        <button v-for="rarity in allRarities" :key="rarity"
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedRarity === rarity ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedRarity = rarity">
                            {{ getRarityText(rarity) }}
                        </button>
                    </div>

                    <div class="flex flex-wrap gap-1">
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedUnlock === 'all' ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedUnlock = 'all'">
                            {{ $t("全部") }}
                        </button>
                        <button v-for="unlockMethod in allUnlockMethods" :key="unlockMethod"
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedUnlock === unlockMethod ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedUnlock = unlockMethod">
                            {{ $t(getAccessoryUnlockLabelKey(unlockMethod)) }}
                        </button>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div v-for="accessory in filteredAccessories"
                            :key="`${accessory.accessoryType}:${accessory.id}`"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300" :class="{
                                'bg-primary/90 text-primary-content hover:bg-primary':
                                    selectedAccessoryKey === `${accessory.accessoryType}:${accessory.id}`,
                            }" @click="selectAccessory(accessory)">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0 flex items-start gap-2">
                                <img
                                    :src="getAccessoryIcon(accessory)"
                                    :alt="accessory.name"
                                        class="size-10 rounded object-cover"
                                        :class="
                                            accessory.accessoryType === 'headframe' || accessory.accessoryType === 'head'
                                                ? 'bg-base-200'
                                                : `bg-linear-15 ${getRarityGradientClass(getAccessoryRarity(accessory))}`
                                        "
                                    />
                                    <div class="min-w-0">
                                        <div class="font-medium wrap-break-word">{{ $t(accessory.name) }}</div>
                                        <div class="text-xs opacity-70 mt-1 line-clamp-1">
                                            {{ getAccessoryUnlockText(accessory) ? $t(getAccessoryUnlockText(accessory)) : "-" }}
                                        </div>
                                    </div>
                                </div>

                                <div v-if="accessory.accessoryType !== 'headframe' && accessory.accessoryType !== 'head'" class="flex flex-col items-end gap-1 shrink-0">
                                    <span class="text-xs px-2 py-0.5 rounded"
                                        :class="getRarityBadgeClass(getAccessoryRarity(accessory))">
                                        {{ getRarityText(getAccessoryRarity(accessory)) }}
                                    </span>
                                    <span class="text-xs opacity-70">ID: {{ accessory.id }}</span>
                                </div>
                                <div v-else class="flex flex-col items-end gap-1 shrink-0">
                                    <span class="text-xs opacity-70">ID: {{ accessory.id }}</span>
                                </div>
                            </div>

                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70 flex-wrap">
                                <span>{{ $t("accessory.type") }}: {{
                                    $t(getAccessoryTypeLabelKey(accessory.accessoryType)) }}</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    {{ $t("accessory.totalCount", { count: filteredAccessories.length }) }}
                </div>
            </div>

    <div v-if="selectedAccessory"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectAccessory(null)">
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedAccessory" class="flex-1">
                <DBAccessoryDetailItem :accessory="selectedAccessory" />
            </ScrollArea>
        </div>
    </div>
</template>
