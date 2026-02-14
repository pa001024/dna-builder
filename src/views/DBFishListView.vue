<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { fishingSpotMap, fishMap } from "@/data"
import { fishingSpots, fishs } from "@/data/d/fish.data"
import { matchPinyin } from "../utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("fish.searchKeyword", "")
const selectedSpotId = useSearchParam<number>("fish.selectedSpot", 0)
const selectedFishId = useSearchParam<number>("fish.selectedFish", 0)
const selectedType = useSearchParam<number>("fish.selectedType", 0)

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

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedSpot }">
                <div class="p-3 border-b border-base-200">
                    <input v-model="searchKeyword" type="text" placeholder="搜索钓鱼点/鱼名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all" />
                </div>

                <!-- 筛选条件 -->
                <div class="p-2 border-b border-base-200 space-y-2">
                    <!-- 类型筛选 -->
                    <div>
                        <div class="text-xs text-base-content/70 mb-1">类型</div>
                        <div class="flex flex-wrap gap-1 pb-1">
                            <button class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                                :class="selectedType === 0 ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                                @click="selectedType = 0">
                                钓鱼点
                            </button>
                            <button class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                                :class="selectedType === 1 ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                                @click="selectedType = 1">
                                鱼
                            </button>
                        </div>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div v-for="spot in filteredSpots" v-if="selectedType === 0" :key="spot.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedSpotId === spot.id }"
                            @click="((selectedSpotId = spot.id), (selectedFishId = 0))">
                            <div class="flex items-start gap-2">
                                <div class="w-12 h-12 overflow-hidden rounded-full">
                                    <img :src="`/imgs/webp/${spot.icon}.webp`" class="w-full h-full object-cover" />
                                </div>
                                <div>
                                    <div class="font-medium">{{ spot.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">
                                        <span>ID: {{ spot.id }}</span>
                                        <span class="ml-2">鱼数限制: {{ spot.fishCountLimit }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-for="fish in filteredFish" v-else :key="fish.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedFishId === fish.id }"
                            @click="((selectedFishId = fish.id), (selectedSpotId = 0))">
                            <div class="flex items-start gap-2">
                                <div class="w-12 h-12 overflow-hidden rounded-full">
                                    <img :src="`/imgs/webp/T_Fish_${fish.icon}.webp`"
                                        class="w-full h-full object-cover" />
                                </div>
                                <div>
                                    <div class="font-medium">{{ fish.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">
                                        <span>ID: {{ fish.id }}</span>
                                        <span class="ml-2">Lv.: {{ fish.level }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredSpots.length }} 个钓鱼点
                </div>
            </div>

            <div v-if="selectedSpot"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedSpotId = 0">
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <div v-if="selectedSpot" class="flex-2 overflow-hidden">
                <DBFishSpotDetailItem :spot="selectedSpot" />
            </div>

            <ScrollArea v-if="selectedFish" class="flex-1">
                <DBFishDetailItem :fish="selectedFish" />
            </ScrollArea>
        </div>
    </div>
</template>
