<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { type Accessory, charAccessoryData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"
import { getAccessoryUnlockLabelKey, normalizeAccessoryUnlock } from "@/utils/accessory-utils"
import { matchPinyin } from "@/utils/pinyin-utils"

type AccessoryType = "char" | "weapon" | "skin"

interface AccessoryItem extends Accessory {
    accessoryType: AccessoryType
}

const searchKeyword = useSearchParam<string>("accessory.searchKeyword", "")
const selectedAccessoryKey = useSearchParam<string>("accessory.selectedAccessory", "")
const selectedType = useSearchParam<"all" | AccessoryType>("accessory.selectedType", "all")
const selectedRarity = useSearchParam<number | 0>("accessory.selectedRarity", 0)
const selectedUnlock = useSearchParam<string>("accessory.selectedUnlock", "all")

/**
 * 合并角色饰品与武器饰品数据，并标记来源类型。
 */
const allAccessories = computed<AccessoryItem[]>(() => {
    const charItems = charAccessoryData.map(item => ({ ...item, accessoryType: "char" as const }))
    const weaponItems = weaponAccessoryData.map(item => ({ ...item, accessoryType: "weapon" as const }))
    const skinItems = weaponSkinData.map(item => ({ ...item, accessoryType: "skin" as const }))
    return [...charItems, ...weaponItems, ...skinItems]
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
        const normalizedUnlock = normalizeAccessoryUnlock(accessory.unlock)
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
        raritySet.add(accessory.rarity)
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

        if (selectedRarity.value !== 0 && item.rarity !== selectedRarity.value) {
            return false
        }

        if (selectedUnlock.value !== "all" && normalizeAccessoryUnlock(item.unlock) !== selectedUnlock.value) {
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
            item.unlock.includes(query) ||
            `${item.rarity}`.includes(query)
        ) {
            return true
        }

        return matchPinyin(item.name, query).match || matchPinyin(item.desc, query).match || matchPinyin(item.unlock, query).match
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
 * 获取饰品类型标签的国际化键。
 * @param accessoryType 饰品类型
 * @returns 国际化键
 */
function getAccessoryTypeLabelKey(accessoryType: AccessoryType): string {
    if (accessoryType === "char") {
        return "accessory.typeChar"
    }
    return accessoryType === "weapon" ? "accessory.typeWeapon" : "accessory.typeSkin"
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
                    </div>

                    <div class="flex flex-wrap gap-1 pb-1">
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedRarity === 0 ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                            @click="selectedRarity = 0">
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
                                    <img :src="getAccessoryIcon(accessory.icon)" :alt="accessory.name"
                                        class="size-10 rounded bg-linear-15 object-cover"
                                        :class="getRarityGradientClass(accessory.rarity)" />
                                    <div class="min-w-0">
                                        <div class="font-medium break-words">{{ $t(accessory.name) }}</div>
                                        <div class="text-xs opacity-70 mt-1 line-clamp-1">
                                            {{ $t(accessory.unlock || "") || "-" }}
                                        </div>
                                    </div>
                                </div>

                                <div class="flex flex-col items-end gap-1 shrink-0">
                                    <span class="text-xs px-2 py-0.5 rounded"
                                        :class="getRarityBadgeClass(accessory.rarity)">
                                        {{ getRarityText(accessory.rarity) }}
                                    </span>
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
