<script lang="ts" setup>
import { ref, computed, onMounted, watch } from "vue"
import type { DBMapMarker, DBMap } from "../data/d/map.data"
import type { DNAMapMatterCategorizeOption, DNAMatterCategorizeList } from "dna-api"
import { getMapAPI } from "../api/app"

const searchKeyword = ref("")
const selectedMap = ref<DBMap | null>(null)
const showLeftPanel = ref(true)

const maps = ref<DBMap[]>([])
const markers = ref<DBMapMarker[]>([])
const categories = ref<DNAMapMatterCategorizeOption[]>([])
const loading = ref(false)
const dnaApi = getMapAPI()

async function loadMapList() {
    loading.value = true
    try {
        const res = await dnaApi.getMapCategorizeList()
        if (res.is_success && res.data) {
            const MAP_SIZE = 4096
            const TILE_SIZE = 256

            const allMaps: DBMap[] = []
            res.data.list.forEach((category: DNAMatterCategorizeList) => {
                category.maps.forEach((map: any) => {
                    allMaps.push({
                        id: map.id,
                        n: map.name,
                        name: map.name,
                        desc: category.name,
                        mapUrl: "", // 需要从 getMatterDetail 获取
                        width: MAP_SIZE,
                        height: MAP_SIZE,
                        tileSize: TILE_SIZE,
                    })
                })
            })

            maps.value = allMaps
        }
    } catch (error) {
        console.error("加载地图列表失败:", error)
    } finally {
        loading.value = false
    }
}

const filteredMaps = computed(() => {
    return maps.value.filter((m) => {
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
        const res = await dnaApi.getMapDetail(selectedMap.value.id)
        if (res.is_success && res.data) {
            const { matterCategorizes, floors } = res.data

            categories.value = matterCategorizes

            // 更新地图URL和floors
            if (floors.length > 0) {
                selectedMap.value.mapUrl = floors[0].pic
                selectedMap.value.floors = floors
                selectedMap.value.currentFloorIndex = 0
            }

            markers.value = []
            matterCategorizes.forEach((category) => {
                category.matters.forEach((matter) => {
                    matter.sites.forEach((site: any) => {
                        if (site.mapId === selectedMap.value!.id) {
                            markers.value.push({
                                id: site.id,
                                mapId: site.mapId,
                                x: site.x,
                                y: site.y,
                                name: matter.name,
                                desc: site.isHide ? "隐藏点" : undefined,
                                icon: matter.icon,
                                categoryId: category.id,
                                isUserMarker: false,
                            })
                        }
                    })
                })
            })
        }
    } catch (error) {
        console.error("加载地图数据失败:", error)
    }
}

watch(selectedMap, () => {
    if (selectedMap.value) {
        loadMapData()
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
    const index = markers.value.findIndex((m) => m.id === id)
    if (index !== -1) {
        markers.value.splice(index, 1)
    }
}

onMounted(() => {
    loadMapList()
})
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div v-show="showLeftPanel" class="flex flex-col overflow-hidden" :class="selectedMap ? 'flex-1' : 'w-full'">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索地图ID/名称/描述..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="map in filteredMaps"
                            :key="map.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedMap?.id === map.id }"
                            @click="selectMap(map)"
                        >
                            <div class="flex items-start justify-between">
                                <div>
                                    <div class="font-medium">{{ map.n }}</div>
                                    <div class="text-xs opacity-70 mt-1">{{ map.desc }}</div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span class="text-xs opacity-70">ID: {{ map.id }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">共 {{ filteredMaps.length }} 个地图</div>
            </div>

            <div v-show="selectedMap" class="relative flex-1 overflow-hidden">
                <button
                    v-if="!showLeftPanel"
                    @click="showLeftPanel = true"
                    class="absolute left-4 top-4 z-30 btn btn-circle btn-sm"
                    title="显示地图列表"
                >
                    <Icon icon="tabler:arrow-bar-to-right" />
                </button>
                <div v-if="selectedMap && selectedMap.mapUrl" class="h-full">
                    <MapRenderer
                        v-if="selectedMap"
                        :key="selectedMap.mapUrl + selectedMap.currentFloorIndex"
                        :map-id="selectedMap.id"
                        :map-url="selectedMap.mapUrl"
                        :markers="markers.filter((m) => m.mapId === selectedMap!.id)"
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
