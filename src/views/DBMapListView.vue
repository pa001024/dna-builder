<script lang="ts" setup>
import type { DNAMapMatterCategorizeOption } from "dna-api"
import { computed, onMounted, ref, watch } from "vue"
import { getMapAPI } from "@/api/app"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import {
    buildDBMapList,
    buildDBMapMarkers,
    type DBMap,
    type DBMapMarker,
    loadMapCategorizeListWithCache,
    loadMapDetailWithCache,
} from "@/data/d/map.data"
import { env } from "@/env"

const dnaApi = getMapAPI()

const searchKeyword = ref("")
const selectedMap = ref<DBMap | null>(null)
const showLeftPanel = ref(true)

const maps = ref<DBMap[]>([])
const markers = ref<DBMapMarker[]>([])
const categories = ref<DNAMapMatterCategorizeOption[]>([])
const loading = ref(false)

async function loadMapList() {
    loading.value = true
    try {
        const categorizeList = await loadMapCategorizeListWithCache(dnaApi, env.isApp)
        maps.value = buildDBMapList(categorizeList)
    } catch (error) {
        console.error("加载地图列表失败:", error)
    } finally {
        loading.value = false
    }
}

const filteredMaps = computed(() => {
    return maps.value.filter(m => {
        const matchesKeyword =
            searchKeyword.value === "" ||
            `${m.id}`.includes(searchKeyword.value) ||
            m.n.includes(searchKeyword.value) ||
            m.desc?.includes(searchKeyword.value)
        return matchesKeyword
    })
})

function selectMap(map: DBMap | null) {
    selectedMap.value = map
    if (map) {
        showLeftPanel.value = false
    } else {
        showLeftPanel.value = true
    }
}

async function loadMapData() {
    if (!selectedMap.value) return

    try {
        const mapDetail = await loadMapDetailWithCache(dnaApi, selectedMap.value.id, env.isApp)
        if (!mapDetail) {
            categories.value = []
            markers.value = []
            selectedMap.value.mapUrl = ""
            selectedMap.value.floors = []
            selectedMap.value.currentFloorIndex = 0
            return
        }

        const { matterCategorizes, floors } = mapDetail
        categories.value = matterCategorizes

        // 更新地图URL和floors
        if (floors.length > 0) {
            selectedMap.value.mapUrl = floors[0].pic
            selectedMap.value.floors = floors
            selectedMap.value.currentFloorIndex = 0
        } else {
            selectedMap.value.mapUrl = ""
            selectedMap.value.floors = []
            selectedMap.value.currentFloorIndex = 0
        }

        markers.value = buildDBMapMarkers(selectedMap.value.id, mapDetail)
    } catch (error) {
        console.error("加载地图数据失败:", error)
    }
}

watch(selectedMap, () => {
    if (selectedMap.value) {
        void loadMapData()
    }
})

function handleFloorChange(index: number) {
    if (selectedMap.value && selectedMap.value.floors) {
        selectedMap.value.currentFloorIndex = index
        selectedMap.value.mapUrl = selectedMap.value.floors[index].pic
    }
}

function handleMarkerAdd(marker: DBMapMarker) {
    markers.value.push(marker)
}

function handleMarkerDelete(id: number) {
    const index = markers.value.findIndex(m => m.id === id)
    if (index !== -1) {
        markers.value.splice(index, 1)
    }
}

onMounted(() => {
    void loadMapList()
})

useInitialScrollToSelectedItem({ selectedSelector: ".dbma-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div v-show="showLeftPanel" class="flex min-w-0 flex-col overflow-hidden" :class="selectedMap ? 'flex-1' : 'w-full'">
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索地图ID/名称/描述..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredMaps.length }}
                        </span>
                    </div>
                </div>

                <!-- 地图列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3 space-y-2">
                        <article
                            v-for="(map, index) in filteredMaps"
                            :key="map.id"
                            class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                            :class="
                                selectedMap?.id === map.id
                                    ? 'dbma-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                            "
                            :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectMap(map)"
                        >
                            <!-- 左侧主色强调条：选中时显现 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="selectedMap?.id === map.id ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="flex items-start justify-between gap-3 p-3">
                                <div class="min-w-0">
                                    <h3
                                        class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                        :class="{ 'text-primary': selectedMap?.id === map.id }"
                                    >
                                        {{ $t(map.n) }}
                                    </h3>
                                    <div class="mt-1.5 truncate text-[11px] text-base-content/55">
                                        {{ map.desc }}
                                    </div>
                                </div>
                                <CopyID :id="map.id" class="ml-auto shrink-0" />
                            </div>
                        </article>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredMaps.length }}</b> 个地图
                    </p>
                </div>
            </div>

            <!-- 右侧地图画布（地图本体逻辑不动） -->
            <div v-show="selectedMap" class="relative min-w-0 flex-1 overflow-hidden">
                <button
                    v-if="!showLeftPanel"
                    type="button"
                    class="absolute left-4 top-4 z-30 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xs border border-base-content/15 bg-base-100/80 text-base-content/60 backdrop-blur-sm transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                    title="显示地图列表"
                    @click="showLeftPanel = true"
                >
                    <Icon icon="tabler:arrow-bar-to-right" class="h-5 w-5" />
                </button>
                <div v-if="selectedMap && selectedMap.mapUrl" class="h-full">
                    <MapRenderer
                        v-if="selectedMap"
                        :key="selectedMap.mapUrl + selectedMap.currentFloorIndex"
                        :map-id="selectedMap.id"
                        :map-url="selectedMap.mapUrl"
                        :markers="markers.filter(m => m.mapId === selectedMap!.id)"
                        :categories="categories"
                        :floors="selectedMap.floors"
                        :current-floor-index="selectedMap.currentFloorIndex"
                        :map-width="selectedMap.width"
                        :map-height="selectedMap.height"
                        :tile-size="selectedMap.tileSize"
                        :editable="true"
                        @marker-add="handleMarkerAdd"
                        @marker-delete="handleMarkerDelete"
                        @floor-change="handleFloorChange"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
