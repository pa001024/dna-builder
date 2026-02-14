<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import dynQuestData, { DynQuest } from "@/data/d/dynquest.data"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("dynquest.searchKeyword", "")
const selectedQuestId = useSearchParam<number>("dynquest.selectedQuest", 0)
const selectedRegion = useSearchParam<string>("dynquest.selectedRegion", "")
const selectedSubRegion = useSearchParam<string>("dynquest.selectedSubRegion", "")

// 根据 ID 获取选中的委托
const selectedQuest = computed(() => {
    return selectedQuestId.value ? dynQuestData.find(quest => quest.id === selectedQuestId.value) || null : null
})

// 获取区域名称
const getRegionName = (regionId: number) => {
    const region = regionMap.get(regionId)
    return region ? region.name : `区域${regionId}`
}

// 获取子区域名称
const getSubRegionName = (subRegionId: number) => {
    const subRegion = subRegionMap.get(subRegionId)
    return subRegion ? subRegion.name : `子区域${subRegionId}`
}

// 获取所有区域
const allRegions = computed(() => {
    const regions = new Set(dynQuestData.map(q => q.regionId))
    return Array.from(regions).sort((a, b) => a - b)
})

// 获取当前选中区域的所有子区域
const subRegions = computed(() => {
    if (!selectedRegion.value) return []
    const subRegionIds = new Set(dynQuestData.filter(q => q.regionId === Number(selectedRegion.value)).map(q => q.subRegionId))
    return Array.from(subRegionIds)
        .map(id => subRegionMap.get(id))
        .filter(r => !!r)
        .sort((a, b) => a.id - b.id)
})

// 按关键词和区域筛选委托
const filteredQuests = computed(() => {
    return dynQuestData.filter(quest => {
        const matchesRegion = selectedRegion.value === "" || quest.regionId === Number(selectedRegion.value)
        const matchesSubRegion = selectedSubRegion.value === "" || quest.subRegionId === Number(selectedSubRegion.value)
        if (!matchesRegion || !matchesSubRegion) {
            return false
        }

        if (searchKeyword.value === "") {
            return true
        } else {
            const q = searchKeyword.value
            // 直接匹配（ID、名称）
            if (`${quest.id}`.includes(q) || quest.name.includes(q)) {
                return true
            } else {
                // 拼音匹配（名称）
                const nameMatch = matchPinyin(quest.name, q).match
                if (nameMatch) {
                    return true
                }
            }
        }
        return false
    })
})

function selectQuest(quest: DynQuest | null) {
    selectedQuestId.value = quest?.id || 0
}

function selectRegion(regionId: string) {
    selectedRegion.value = regionId
    selectedSubRegion.value = ""
}

function selectSubRegion(subRegionId: string) {
    selectedSubRegion.value = subRegionId
}

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedQuest }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input v-model="searchKeyword" type="text" placeholder="搜索委托 ID/名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all" />
                </div>

                <!-- 区域筛选 -->
                <div class="p-2 border-b border-base-200">
                    <div class="flex flex-wrap gap-1 pb-1">
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedRegion === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectRegion('')">
                            全部区域
                        </button>
                        <button v-for="regionId in allRegions.map(r => String(r))" :key="regionId"
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all" :class="selectedRegion === regionId ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                " @click="selectRegion(regionId)">
                            {{ getRegionName(Number(regionId)) }}
                        </button>
                    </div>
                </div>

                <!-- 子区域筛选 -->
                <div v-if="selectedRegion" class="p-2 border-b border-base-200">
                    <div class="flex flex-wrap gap-1 pb-1">
                        <button class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedSubRegion === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectSubRegion('')">
                            全部子区域
                        </button>
                        <button v-for="subRegion in subRegions" :key="subRegion.id"
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all" :class="selectedSubRegion === String(subRegion.id)
                                ? 'bg-primary text-white'
                                : 'bg-base-200 text-base-content hover:bg-base-300'
                                " @click="selectSubRegion(String(subRegion.id))">
                            {{ subRegion.name }}
                        </button>
                    </div>
                </div>

                <!-- 委托列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div v-for="quest in filteredQuests" :key="quest.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedQuestId === quest.id }"
                            @click="selectQuest(quest)">
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <div class="font-medium">{{ quest.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">
                                        <span>等级: {{ quest.level[0] }} - {{ quest.level[1] || "?" }}</span>
                                        <span v-if="quest.dayLimit"
                                            class="ml-2 px-1.5 py-0.5 rounded bg-warning text-warning-content">每日限制</span>
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span class="text-xs px-2 py-0.5 rounded bg-primary text-white">
                                        {{ getRegionName(quest.regionId) }}
                                    </span>
                                    <span class="text-xs opacity-70">ID: {{ quest.id }}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70">
                                <span>{{ getSubRegionName(quest.subRegionId) }}</span>
                                <span>概率: {{ quest.chance }}%</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredQuests.length }} 个委托
                </div>
            </div>
            <div v-if="selectedQuest"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectQuest(null)">
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedQuest" class="flex-1">
                <DBDynQuestDetailItem :quest="selectedQuest" />
            </ScrollArea>
        </div>
    </div>
</template>
