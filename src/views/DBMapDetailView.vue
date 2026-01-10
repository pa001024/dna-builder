<script lang="ts" setup>
import { ref, computed, onMounted } from "vue"
import { useRoute } from "vue-router"
import type { DBMapMarker, DBMap } from "../data/d/map.data"
import type { DNAMapMatterCategorizeOption, DNAMapSite } from "dna-api"
import { getMapAPI } from "../api/app"

const route = useRoute()

const mapId = computed(() => Number(route.params.mapId))
const map = ref<DBMap>({
    id: mapId.value,
    n: "",
    name: "",
    mapUrl: "",
    width: 4096,
    height: 4096,
    tileSize: 256,
})

const markers = ref<DBMapMarker[]>([])
const categories = ref<DNAMapMatterCategorizeOption[]>([])
const loading = ref(false)
const dnaApi = getMapAPI()

async function loadMapData() {
    loading.value = true
    try {
        const res = await dnaApi.getMapDetail(mapId.value)
        if (res.is_success && res.data) {
            const { matterCategorizes, floors, map: mapInfo } = res.data

            categories.value = matterCategorizes

            // 更新地图信息
            map.value.n = mapInfo.name
            map.value.name = mapInfo.name
            if (floors.length > 0) {
                map.value.mapUrl = floors[0].pic
                map.value.floors = floors
                map.value.currentFloorIndex = 0
            }

            markers.value = []
            matterCategorizes.forEach(category => {
                category.matters.forEach(matter => {
                    matter.sites.forEach((site: DNAMapSite) => {
                        if (site.mapId === mapId.value) {
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
                                createdAt: undefined,
                            })
                        }
                    })
                })
            })
        }
    } catch (error) {
        console.error("加载地图数据失败:", error)
    } finally {
        loading.value = false
    }
}

function handleMarkerClick(marker: DBMapMarker) {
    console.log("Marker clicked:", marker)
}

function handleFloorChange(index: number) {
    if (map.value && map.value.floors) {
        map.value.currentFloorIndex = index
        map.value.mapUrl = map.value.floors[index].pic
    }
}

onMounted(async () => {
    if (map.value) {
        await loadMapData()
    }
})
</script>

<template>
    <div class="h-full flex flex-col bg-base-300">
        <template v-if="map && map.mapUrl">
            <div class="flex-1 overflow-hidden">
                <MapRenderer
                    :map-id="mapId"
                    :map-url="map.mapUrl"
                    :markers="markers"
                    :categories="categories"
                    :floors="map.floors"
                    :current-floor-index="map.currentFloorIndex"
                    :map-width="map.width"
                    :map-height="map.height"
                    :tile-size="map.tileSize"
                    @marker-click="handleMarkerClick"
                    @floor-change="handleFloorChange"
                />
            </div>
        </template>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到地图</div>
        </div>
    </div>
</template>
