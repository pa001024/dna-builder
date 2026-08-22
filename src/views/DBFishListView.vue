<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { fishingSpotMap, fishMap } from "@/data"
import { fishingSpots, fishs } from "@/data/d/fish.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedSpotId = useSearchParam<number>("sp", 0)
const selectedFishId = useSearchParam<number>("id", 0)
const selectedType = useSearchParam<number>("tp", 0)

// 根据 ID 获取选中的钓鱼点
const selectedSpot = computed(() => {
    return selectedSpotId.value ? fishingSpotMap.get(selectedSpotId.value) || null : null
})

// 根据 ID 获取选中的鱼
const selectedFish = computed(() => {
    return selectedFishId.value ? fishMap.get(selectedFishId.value) || null : null
})

const filteredSpots = computed(() => {
    return fishingSpots.filter(spot => {
        if (searchKeyword.value === "") return true
        const q = searchKeyword.value
        if (spot.name.includes(q)) return true
        if (matchPinyin(spot.name, q).match) return true
        const fishNames = spot.fishIds
            .map(id => fishMap.get(id)?.name)
            .filter(Boolean)
            .join("、")
        if (matchPinyin(fishNames, q).match) return true
        return false
    })
})

const filteredFish = computed(() => {
    return fishs.filter(fish => {
        if (searchKeyword.value === "") return true
        const q = searchKeyword.value
        if (fish.name.includes(q)) return true
        const match = matchPinyin(fish.name, q)
        return match.match
    })
})

/**
 * 获取钓鱼点图标 URL。
 * @param icon 钓鱼点图标标识。
 * @returns 钓鱼点图标 URL；若未配置则使用默认图标。
 */
function getSpotIcon(icon?: string) {
    return icon ? `/imgs/webp/${icon}.webp` : "/imgs/webp/T_Tab_Angling00.webp"
}

/**
 * 切换列表类型并清空另一侧选中项。
 * @param type 目标类型
 */
function selectFishListType(type: 0 | 1) {
    selectedType.value = type
    selectedSpotId.value = 0
    selectedFishId.value = 0
}

/**
 * 选择钓鱼点并切回钓鱼点列表。
 * @param spotId 钓鱼点 ID
 */
function selectSpot(spotId: number) {
    selectedType.value = 0
    selectedSpotId.value = spotId
    selectedFishId.value = 0
}

/**
 * 选择鱼并切回鱼列表。
 * @param fishId 鱼 ID
 */
function selectFish(fishId: number) {
    selectedType.value = 1
    selectedSpotId.value = 0
    selectedFishId.value = fishId
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbf-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedSpot || selectedFish }"
            >
                <!-- 检索带：下划线搜索 + 计数 + 列表类型方章 -->
                <div
                    class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise"
                >
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索钓鱼点/鱼名称（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ selectedType === 0 ? filteredSpots.length : filteredFish.length }}
                        </span>
                    </div>

                    <!-- 列表类型切换方章 -->
                    <div class="mt-3 flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === 0
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectFishListType(0)"
                        >
                            钓鱼点
                        </button>
                        <button
                            type="button"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === 1
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectFishListType(1)"
                        >
                            鱼
                        </button>
                    </div>
                </div>

                <!-- 钓鱼点 / 鱼列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3 space-y-2">
                        <template v-if="selectedType === 0">
                            <article
                                v-for="(spot, index) in filteredSpots"
                                :key="spot.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedSpotId === spot.id
                                        ? 'dbf-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectSpot(spot.id)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedSpotId === spot.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start gap-3 p-3">
                                    <div class="size-12 shrink-0 overflow-hidden rounded-xs">
                                        <img :src="getSpotIcon(spot.icon)" class="h-full w-full object-cover" />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <!-- 名称行：名称 + 幽灵 ID -->
                                        <div class="flex items-baseline gap-2">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedSpotId === spot.id }"
                                            >
                                                {{ spot.name }}
                                            </h3>
                                            <CopyID :id="spot.id" class="ml-auto shrink-0" />
                                        </div>
                                        <!-- 元信息行 -->
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                            <span>鱼数限制: {{ spot.fishCountLimit }}</span>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        </template>
                        <template v-else>
                            <article
                                v-for="(fish, index) in filteredFish"
                                :key="fish.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedFishId === fish.id
                                        ? 'dbf-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectFish(fish.id)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedFishId === fish.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start gap-3 p-3">
                                    <div class="size-12 shrink-0 overflow-hidden rounded-xs">
                                        <img :src="`/imgs/res/T_Fish_${fish.icon}.webp`" class="h-full w-full object-cover" />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <!-- 名称行：名称 + 幽灵 ID -->
                                        <div class="flex items-baseline gap-2">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedFishId === fish.id }"
                                            >
                                                {{ $t(fish.name) }}
                                            </h3>
                                            <CopyID :id="fish.id" class="ml-auto shrink-0" />
                                        </div>
                                        <!-- 元信息行 -->
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                            <span>Lv.: {{ fish.level }}</span>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        </template>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredSpots.length }}</b> 个钓鱼点
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedSpot"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectedSpotId = 0"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧：钓鱼池详情 -->
            <div v-if="selectedSpot" class="min-w-0 flex-2 overflow-hidden">
                <DBFishSpotDetailItem :key="selectedSpotId" :spot="selectedSpot" />
            </div>

            <!-- 右侧：鱼详情 -->
            <ScrollArea v-if="selectedFish" class="min-w-0 flex-1">
                <DBFishDetailItem :key="selectedFishId" :fish="selectedFish" />
            </ScrollArea>
        </div>
    </div>
</template>
