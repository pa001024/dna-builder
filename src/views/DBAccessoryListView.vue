<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { charMap } from "@/data"
import {
    type Accessory,
    charAccessoryData,
    type HairItem,
    type HeadFrameItem,
    type HeadSculptureItem,
    hairData,
    headFrameData,
    type SkinItem,
    skinData,
    weaponAccessoryData,
    weaponSkinData,
} from "@/data/d/accessory.data"
import { headSculptureData } from "@/data/d/headsculpture.data"
import { getAccessoryUnlockLabelKey, normalizeAccessoryUnlock, resolveSkinIconUrl } from "@/utils/accessory-utils"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityBadgeClass, getRarityGradientClass, getRarityName } from "@/utils/rarity-utils"

type AccessoryType = "char" | "weapon" | "skin" | "weaponskin" | "hair" | "headframe" | "head"

type CharAccessoryItem = Accessory & { accessoryType: "char" }
type WeaponAccessoryItem = Accessory & { accessoryType: "weapon" }
type WeaponSkinAccessoryItem = Accessory & { accessoryType: "weaponskin" }
type SkinAccessoryItem = SkinItem & { accessoryType: "skin" }
type HairAccessoryItem = HairItem & { accessoryType: "hair" }
type HeadFrameAccessoryItem = HeadFrameItem & { accessoryType: "headframe" }
type HeadAccessoryItem = HeadSculptureItem & { accessoryType: "head" }
type AccessoryItem =
    | CharAccessoryItem
    | WeaponAccessoryItem
    | SkinAccessoryItem
    | WeaponSkinAccessoryItem
    | HairAccessoryItem
    | HeadFrameAccessoryItem
    | HeadAccessoryItem

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
function hasAccessoryRarity(
    accessory: AccessoryItem
): accessory is CharAccessoryItem | WeaponAccessoryItem | SkinAccessoryItem | WeaponSkinAccessoryItem {
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
    const hairItems: HairAccessoryItem[] = hairData.map(item => ({ ...item, accessoryType: "hair" }))
    const headFrameItems: HeadFrameAccessoryItem[] = headFrameData.map(item => ({ ...item, accessoryType: "headframe" }))
    const headItems: HeadAccessoryItem[] = headSculptureData.map(item => ({ ...item, accessoryType: "head" }))
    return [...charItems, ...weaponItems, ...skinItems, ...weaponSkinItems, ...hairItems, ...headFrameItems, ...headItems]
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

/** 类型筛选方章的展示顺序。 */
const accessoryTypes = ["char", "weapon", "skin", "weaponskin", "hair", "headframe", "head"] as const

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
        const descText = item.desc ?? ""
        if (
            `${item.id}`.includes(query) ||
            item.name.includes(query) ||
            descText.includes(query) ||
            unlockText.includes(query) ||
            `${rarity}`.includes(query)
        ) {
            return true
        }

        return matchPinyin(item.name, query).match || matchPinyin(descText, query).match || matchPinyin(unlockText, query).match
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
    if (accessoryType === "hair") {
        return "accessory.typeHair"
    }
    if (accessoryType === "headframe") {
        return "accessory.typeHeadFrame"
    }
    if (accessoryType === "head") {
        return "accessory.typeAvatar"
    }
    return "accessory.typeSkin"
}

useInitialScrollToSelectedItem({ selectedSelector: ".dba-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedAccessory }">
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            :placeholder="$t('accessory.searchPlaceholder')"
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredAccessories.length }}
                        </span>
                    </div>
                </div>

                <!-- 筛选条件：类型 / 稀有度 / 获取方式（方章 chip） -->
                <div
                    class="flex-none space-y-3 border-b border-base-content/15 px-4 py-3 stagger-rise"
                    style="animation-delay: 0.05s"
                >
                    <!-- 类型筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">TYPE</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === 'all'
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = 'all'"
                        >
                            {{ $t("accessory.typeAll") }}
                        </button>
                        <button
                            v-for="accessoryType in accessoryTypes"
                            :key="accessoryType"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === accessoryType
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = accessoryType"
                        >
                            {{ $t(getAccessoryTypeLabelKey(accessoryType)) }}
                        </button>
                    </div>

                    <!-- 稀有度筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">RARITY</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedRarity === -1
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedRarity = -1"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="rarity in allRarities"
                            :key="rarity"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedRarity === rarity
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedRarity = rarity"
                        >
                            {{ getRarityName(rarity) }}
                        </button>
                    </div>

                    <!-- 获取方式筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">UNLOCK</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedUnlock === 'all'
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedUnlock = 'all'"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="unlockMethod in allUnlockMethods"
                            :key="unlockMethod"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedUnlock === unlockMethod
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedUnlock = unlockMethod"
                        >
                            {{ $t(getAccessoryUnlockLabelKey(unlockMethod)) }}
                        </button>
                    </div>
                </div>

                <!-- 饰品列表 -->
                <ScrollArea class="flex-1">
                    <div class="space-y-2 p-3">
                        <article
                            v-for="(accessory, index) in filteredAccessories"
                            :key="`${accessory.accessoryType}:${accessory.id}`"
                            class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                            :class="
                                selectedAccessoryKey === `${accessory.accessoryType}:${accessory.id}`
                                    ? 'dba-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                            "
                            :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectAccessory(accessory)"
                        >
                            <!-- 左侧主色强调条：选中时显现 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="selectedAccessoryKey === `${accessory.accessoryType}:${accessory.id}` ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="p-3">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="flex min-w-0 items-start gap-2.5">
                                        <img
                                            :src="getAccessoryIcon(accessory)"
                                            :alt="accessory.name"
                                            class="size-10 shrink-0 rounded-xs object-cover"
                                            :class="
                                                accessory.accessoryType === 'headframe' || accessory.accessoryType === 'head'
                                                    ? 'bg-base-content/6'
                                                    : `bg-linear-15 ${getRarityGradientClass(getAccessoryRarity(accessory))}`
                                            "
                                        />
                                        <div class="min-w-0">
                                            <div
                                                class="text-sm font-medium wrap-break-word transition-colors duration-200 group-hover:text-primary"
                                                :class="{
                                                    'text-primary': selectedAccessoryKey === `${accessory.accessoryType}:${accessory.id}`,
                                                }"
                                            >
                                                {{ $t(accessory.name) }}
                                            </div>
                                            <div class="mt-1 line-clamp-1 text-[11px] text-base-content/50">
                                                <span v-if="accessory.accessoryType === 'skin'">{{
                                                    $t(charMap.get(accessory.charId)?.名称 ?? "")
                                                }}</span>
                                                <span v-else>
                                                    {{ getAccessoryUnlockText(accessory) ? $t(getAccessoryUnlockText(accessory)) : "-" }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        v-if="accessory.accessoryType !== 'headframe' && accessory.accessoryType !== 'head'"
                                        class="flex flex-col items-end gap-1 shrink-0"
                                    >
                                        <span :class="getRarityBadgeClass(getAccessoryRarity(accessory))">
                                            {{ getRarityName(getAccessoryRarity(accessory)) }}
                                        </span>
                                        <span class="font-mono text-[10px] tabular-nums text-base-content/35">ID: {{ accessory.id }}</span>
                                    </div>
                                    <div v-else class="flex flex-col items-end gap-1 shrink-0">
                                        <span class="font-mono text-[10px] tabular-nums text-base-content/35">ID: {{ accessory.id }}</span>
                                    </div>
                                </div>

                                <!-- 元信息行：饰品类型 -->
                                <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                    <span>{{ $t("accessory.type") }}: {{ $t(getAccessoryTypeLabelKey(accessory.accessoryType)) }}</span>
                                </div>
                            </div>
                        </article>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5 text-center">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        {{ $t("accessory.totalCount", { count: filteredAccessories.length }) }}
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedAccessory"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectAccessory(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedAccessory" class="min-w-0 flex-1">
                <DBAccessoryDetailItem :key="selectedAccessoryKey" :accessory="selectedAccessory" />
            </ScrollArea>
        </div>
    </div>
</template>
