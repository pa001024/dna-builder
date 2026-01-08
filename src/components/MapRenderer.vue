<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue"
import type { DBMapMarker } from "../data/d/map.data"
import type { DNAMapMatterCategorizeOption, DNAMapSiteDetailRes } from "dna-api"
import { db, type UserMapMarker } from "../store/db"
import { getMapAPI } from "../api/app"
import Select from "./select/Select.vue"
import SelectItem from "./select/SelectItem.vue"
const dnaApi = getMapAPI()

interface Props {
    mapUrl: string
    mapId: number
    markers: DBMapMarker[]
    categories?: DNAMapMatterCategorizeOption[]
    floors?: { id: number; name: string; pic: string }[]
    currentFloorIndex?: number
    mapWidth?: number
    mapHeight?: number
    tileSize?: number
    editable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    mapWidth: 4096,
    mapHeight: 4096,
    tileSize: 256,
    editable: false,
})

const emit = defineEmits<{
    markerClick: [marker: DBMapMarker]
    markerAdd: [marker: DBMapMarker]
    markerDelete: [id: number]
    floorChange: [index: number]
}>()

const containerRef = ref<HTMLElement>()
const selectedMarkerId = ref<number | null>(null)
const selectedCategory = ref<number | null>(null)
const isEditMode = ref(false)
const pendingMarker = ref<Omit<DBMapMarker, "id"> | null>(null)
const selectedFloorIndex = ref(props.currentFloorIndex || 0)
const markerDetail = ref<DNAMapSiteDetailRes | null>(null)
const markerDetailLoading = ref(false)
const selectedMarker = ref<DBMapMarker | null>(null)

const zoom = ref(1)
const minZoom = 0.25
const maxZoom = 4

const isDragging = ref(false)
const lastMousePos = ref({ x: 0, y: 0 })
const panOffset = ref({ x: 0, y: 0 })

const visibleTiles = ref<Map<string, { x: number; y: number; url: string }>>(new Map())
const loadedTiles = ref<Set<string>>(new Set())
const userMarkersList = ref<UserMapMarker[]>([])

const allMarkers = computed(() => {
    const apiMarkers = props.markers.map((m) => ({ ...m, isUserMarker: false }))
    const userMarkers = userMarkersList.value.map((m) => ({
        ...m,
        isUserMarker: true,
    }))
    return [...apiMarkers, ...userMarkers]
})

const filteredMarkers = computed(() => {
    let markers = allMarkers.value
    if (selectedCategory.value !== null) {
        markers = markers.filter((m) => m.categoryId === selectedCategory.value)
    }
    return markers
})

const transformStyle = computed(() => {
    return {
        transform: `translate(${panOffset.value.x}px, ${panOffset.value.y}px) scale(${zoom.value})`,
        transformOrigin: "0 0",
    }
})

function generateTileUrl(tileX: number, tileY: number): string {
    const x = tileX * props.tileSize
    const y = tileY * props.tileSize
    const baseUrl = props.mapUrl
    const cropParams = `?x-oss-process=image/crop,x_${x},y_${y},w_${props.tileSize},h_${props.tileSize}/format,webp`
    return baseUrl + cropParams
}

function getTileKey(tileX: number, tileY: number): string {
    return `${tileX}_${tileY}`
}

function calculateVisibleTiles() {
    const container = containerRef.value
    if (!container) return

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    // 计算地图在屏幕上的实际显示区域（考虑缩放和平移）
    const mapLeft = -panOffset.value.x / zoom.value
    const mapTop = -panOffset.value.y / zoom.value
    const mapRight = mapLeft + containerWidth / zoom.value
    const mapBottom = mapTop + containerHeight / zoom.value

    // 计算需要的瓦片范围
    const startTileX = Math.floor(mapLeft / props.tileSize)
    const startTileY = Math.floor(mapTop / props.tileSize)
    const endTileX = Math.ceil(mapRight / props.tileSize)
    const endTileY = Math.ceil(mapBottom / props.tileSize)

    const totalTilesX = Math.ceil(props.mapWidth / props.tileSize)
    const totalTilesY = Math.ceil(props.mapHeight / props.tileSize)

    const newTiles = new Map<string, { x: number; y: number; url: string }>()

    for (let y = Math.max(0, startTileY); y < Math.min(totalTilesY, endTileY); y++) {
        for (let x = Math.max(0, startTileX); x < Math.min(totalTilesX, endTileX); x++) {
            const key = getTileKey(x, y)
            newTiles.set(key, {
                x: x * props.tileSize,
                y: y * props.tileSize,
                url: generateTileUrl(x, y),
            })
        }
    }

    visibleTiles.value = newTiles
}

function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return
    isDragging.value = true
    lastMousePos.value = { x: e.clientX, y: e.clientY }

    document.addEventListener("mousemove", handleDocumentMouseMove)
    document.addEventListener("mouseup", handleDocumentMouseUp)
}

function handleDocumentMouseMove(e: MouseEvent) {
    if (!isDragging.value) return
    const dx = e.clientX - lastMousePos.value.x
    const dy = e.clientY - lastMousePos.value.y
    panOffset.value = {
        x: panOffset.value.x + dx,
        y: panOffset.value.y + dy,
    }
    lastMousePos.value = { x: e.clientX, y: e.clientY }
    requestAnimationFrame(calculateVisibleTiles)
}

function handleDocumentMouseUp() {
    isDragging.value = false
    document.removeEventListener("mousemove", handleDocumentMouseMove)
    document.removeEventListener("mouseup", handleDocumentMouseUp)
}

function handleWheel(e: WheelEvent) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom.value + delta))

    // 获取鼠标在容器中的位置
    const container = containerRef.value
    if (!container) return

    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // 计算鼠标在地图坐标系中的位置（缩放前）
    const mapMouseX = (mouseX - panOffset.value.x) / zoom.value
    const mapMouseY = (mouseY - panOffset.value.y) / zoom.value

    // 更新缩放
    zoom.value = newZoom

    // 计算新的平移偏移量，使地图上的同一点仍然在鼠标位置
    panOffset.value = {
        x: mouseX - mapMouseX * newZoom,
        y: mouseY - mapMouseY * newZoom,
    }

    requestAnimationFrame(calculateVisibleTiles)
}

function handleMarkerClick(marker: DBMapMarker, e: MouseEvent) {
    e.stopPropagation()

    if (selectedMarkerId.value === marker.id) {
        selectedMarkerId.value = null
        markerDetail.value = null
        selectedMarker.value = null
        return
    }

    selectedMarkerId.value = marker.id
    selectedMarker.value = marker
    markerDetail.value = null

    if (!marker.isUserMarker) {
        loadMarkerDetail(marker)
    }
}

async function loadMarkerDetail(marker: DBMapMarker) {
    if (marker.isUserMarker) return

    markerDetailLoading.value = true
    try {
        const res = await dnaApi.getMapSiteDetail(marker.id)
        if (res.is_success && res.data) {
            markerDetail.value = res.data
        }
    } catch (error) {
        console.error("加载标点详情失败:", error)
    } finally {
        markerDetailLoading.value = false
    }
}

function selectCategory(categoryId: number | null) {
    selectedCategory.value = categoryId
}

function zoomIn() {
    zoom.value = Math.min(maxZoom, zoom.value + 0.2)
    requestAnimationFrame(calculateVisibleTiles)
}

function zoomOut() {
    zoom.value = Math.max(minZoom, zoom.value - 0.2)
    requestAnimationFrame(calculateVisibleTiles)
}

function resetZoom() {
    const container = containerRef.value
    if (!container) return

    const initialScale = 1

    zoom.value = Math.max(0.25, Math.min(4, initialScale))

    // 居中地图
    panOffset.value = {
        x: (container.clientWidth - props.mapWidth * zoom.value) / 2,
        y: (container.clientHeight - props.mapHeight * zoom.value) / 2,
    }

    requestAnimationFrame(calculateVisibleTiles)
}

function getMarkerStyle(marker: DBMapMarker) {
    // 计算标点在容器中的屏幕位置
    const scaledX = marker.x * zoom.value + panOffset.value.x
    const scaledY = marker.y * zoom.value + panOffset.value.y

    return {
        left: `${scaledX}px`,
        top: `${scaledY}px`,
        transform: "translate(-50%, -50%)",
    }
}

const detailPopupStyle = computed(() => {
    if (!selectedMarker.value) return null

    // 计算详情气泡在容器中的位置
    const markerX = selectedMarker.value.x
    const markerY = selectedMarker.value.y

    // 应用与 marker-wrapper 相同的变换
    const scaledX = markerX * zoom.value + panOffset.value.x
    const scaledY = markerY * zoom.value + panOffset.value.y

    // 气泡应该在标点上方
    const bubbleOffsetY = -16

    return {
        left: `${scaledX}px`,
        top: `${scaledY + bubbleOffsetY}px`,
        transform: "translate(-50%, -100%)",
    }
})

function handleTileLoad(key: string) {
    loadedTiles.value.add(key)
}

function handleTileError(key: string) {
    console.error(`Failed to load tile: ${key}`)
    loadedTiles.value.add(key)
}

function handleMapClick(e: MouseEvent) {
    if (!isEditMode.value) return
    if (e.button !== 0) return

    const container = containerRef.value
    if (!container) return

    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const mapX = (mouseX - panOffset.value.x) / zoom.value
    const mapY = (mouseY - panOffset.value.y) / zoom.value

    pendingMarker.value = {
        mapId: props.mapId,
        x: mapX,
        y: mapY,
        name: `标点 ${filteredMarkers.value.length + 1}`,
        isUserMarker: true,
        createdAt: Date.now(),
    }
}

function saveMarker(marker: Omit<DBMapMarker, "id">) {
    let iconUrl = marker.icon
    if (marker.categoryId && props.categories) {
        const category = props.categories.find((c) => c.id === marker.categoryId)
        if (category) {
            iconUrl = category.icon
        }
    }

    const newMarker: Omit<UserMapMarker, "id"> = {
        mapId: marker.mapId,
        x: marker.x,
        y: marker.y,
        name: marker.name,
        desc: marker.desc,
        icon: iconUrl,
        categoryId: marker.categoryId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    }

    db.userMapMarkers.add(newMarker).then((id) => {
        userMarkersList.value.push({ ...newMarker, id })
        emit("markerAdd", {
            ...newMarker,
            id: id,
            isUserMarker: true,
        } as DBMapMarker)
        pendingMarker.value = null
    })
}

function deleteMarker(id: number) {
    const index = userMarkersList.value.findIndex((m) => m.id === id)
    if (index !== -1) {
        db.userMapMarkers.delete(id).then(() => {
            userMarkersList.value.splice(index, 1)
            emit("markerDelete", id)
        })
    }
}

async function loadUserMarkers() {
    const markers = await db.userMapMarkers.where({ mapId: props.mapId }).toArray()
    userMarkersList.value = markers
    markers.forEach((m) => {
        emit("markerAdd", {
            ...m,
            isUserMarker: true,
        } as DBMapMarker)
    })
}

function toggleEditMode() {
    isEditMode.value = !isEditMode.value
    if (!isEditMode.value) {
        pendingMarker.value = null
    }
}

watch([zoom, panOffset], () => {
    requestAnimationFrame(calculateVisibleTiles)
})

watch(selectedFloorIndex, (newIndex) => {
    emit("floorChange", newIndex)
})

onMounted(async () => {
    const container = containerRef.value
    if (container) {
        container.addEventListener("mousedown", handleMouseDown)
        container.addEventListener("wheel", handleWheel, { passive: false })

        if (props.editable) {
            await loadUserMarkers()
        }

        setTimeout(() => {
            resetZoom()
        }, 0)
    }
})

onUnmounted(() => {
    const container = containerRef.value
    if (container) {
        container.removeEventListener("mousedown", handleMouseDown)
        container.removeEventListener("wheel", handleWheel)
    }

    // 确保移除document上的事件监听
    document.removeEventListener("mousemove", handleDocumentMouseMove)
    document.removeEventListener("mouseup", handleDocumentMouseUp)
})
</script>

<template>
    <div ref="containerRef" class="map-renderer relative h-full w-full overflow-hidden bg-base-200">
        <div
            class="map-container h-full w-full"
            :class="isEditMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'"
            @click="handleMapClick"
        >
            <div class="map-content absolute" :style="[transformStyle, { width: mapWidth + 'px', height: mapHeight + 'px' }]">
                <div
                    v-for="[key, tile] in visibleTiles"
                    :key="key"
                    class="map-tile absolute"
                    :style="{
                        left: tile.x + 'px',
                        top: tile.y + 'px',
                        width: tileSize + 'px',
                        height: tileSize + 'px',
                    }"
                >
                    <img
                        :src="tile.url"
                        :alt="`tile-${key}`"
                        class="block w-full h-full object-cover pointer-events-none"
                        @load="handleTileLoad(key)"
                        @error="handleTileError(key)"
                    />
                </div>
            </div>
        </div>

        <div
            v-for="marker in filteredMarkers"
            :key="marker.id"
            class="marker-wrapper absolute cursor-pointer z-10"
            :style="getMarkerStyle(marker)"
            @click="handleMarkerClick(marker, $event)"
        >
            <div class="relative flex h-8 w-8 items-center justify-center">
                <div
                    class="absolute inset-0 rounded-full ring-2 ring-primary/0 transition-all"
                    :class="{ 'ring-primary ring-offset-2 ring-opacity-100': selectedMarkerId === marker.id }"
                ></div>
                <div
                    v-if="marker.icon"
                    class="h-8 w-8 transition-transform hover:scale-125 relative"
                    :class="{ 'drop-shadow-lg': marker.isUserMarker }"
                >
                    <div v-if="marker.isUserMarker" class="absolute inset-0 bg-accent rounded-full opacity-50"></div>
                    <img :src="marker.icon" class="pointer-events-none" />
                </div>
                <div
                    v-else
                    class="h-8 w-8 rounded-full bg-primary/90 text-white text-xs flex items-center justify-center shadow-lg transition-transform hover:scale-125"
                    :class="{ 'drop-shadow-lg': marker.isUserMarker }"
                >
                    {{ marker.name.charAt(0) }}
                </div>
                <div
                    class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-base-300 px-2 py-1 text-xs text-base-content opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none"
                >
                    {{ marker.name }}
                </div>
            </div>
        </div>

        <!-- 楼层切换 -->
        <div v-if="floors && floors.length > 1" class="absolute left-4 bottom-4 z-20 flex flex-col gap-2">
            <Select v-model="selectedFloorIndex" class="w-48">
                <template #trigger>
                    <SelectTrigger class="btn btn-sm btn-primary gap-1 w-48 justify-between">
                        <div class="flex items-center gap-1">
                            <Icon icon="ri:building-2-line" />
                            <SelectValue />
                        </div>
                        <Icon icon="ri:arrow-down-s-line" class="text-xs" />
                    </SelectTrigger>
                </template>
                <SelectItem v-for="(floor, index) in floors" :key="floor.id" :value="index">
                    {{ floor.name }}
                </SelectItem>
            </Select>
        </div>

        <div class="absolute left-4 top-14 z-20 flex flex-col gap-2">
            <button @click="zoomIn" class="btn btn-circle btn-sm" title="放大">
                <Icon icon="ri:add-line" />
            </button>
            <button @click="zoomOut" class="btn btn-circle btn-sm" title="缩小">
                <Icon icon="ri:subtract-line" />
            </button>
            <button @click="resetZoom" class="btn btn-circle btn-sm" title="重置">
                <Icon icon="ri:crosshair-line" />
            </button>
        </div>

        <div v-if="categories && categories.length > 0" class="absolute right-4 top-4 z-20 flex flex-col gap-2">
            <button
                @click="selectCategory(null)"
                class="btn btn-xs whitespace-nowrap"
                :class="selectedCategory === null ? 'btn-primary' : 'btn-ghost'"
            >
                全部
            </button>
            <button
                v-for="category in categories"
                :key="category.id"
                @click="selectCategory(category.id)"
                class="btn btn-xs flex items-center gap-1 whitespace-nowrap"
                :class="selectedCategory === category.id ? 'btn-primary' : 'btn-ghost'"
            >
                <img v-if="category.icon" :src="category.icon" class="h-4 w-4" />
                {{ category.name }}
            </button>
            <div v-if="editable" class="divider my-1"></div>
            <button @click="toggleEditMode" class="btn btn-xs whitespace-nowrap" :class="isEditMode ? 'btn-warning' : 'btn-ghost'">
                {{ isEditMode ? "退出编辑" : "添加标点" }}
            </button>
        </div>

        <!-- 标点编辑弹窗 -->
        <div
            v-if="pendingMarker"
            class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-base-100 shadow-lg rounded-lg p-4 min-w-50 border border-base-300"
        >
            <div class="font-medium mb-2">添加标点</div>
            <div class="space-y-2">
                <div>
                    <label class="text-xs text-base-content/70 mb-1">名称</label>
                    <input v-model="pendingMarker.name" type="text" class="w-full input input-sm" />
                </div>
                <div>
                    <label class="text-xs text-base-content/70 mb-1">分类</label>
                    <Select v-model="pendingMarker.categoryId" class="w-full input input-sm">
                        <SelectItem :value="null">无分类</SelectItem>
                        <SelectItem v-for="category in categories" :key="category.id" :value="category.id">
                            {{ category.name }}
                        </SelectItem>
                    </Select>
                </div>
                <div class="flex gap-2">
                    <button @click="pendingMarker = null" class="btn btn-xs btn-ghost flex-1">取消</button>
                    <button @click="saveMarker(pendingMarker)" class="btn btn-xs btn-primary flex-1">保存</button>
                </div>
            </div>
        </div>

        <!-- 编辑模式下的标点删除按钮 -->
        <template v-if="editable && isEditMode">
            <div
                v-for="marker in filteredMarkers.filter((m) => m.isUserMarker)"
                :key="marker.id"
                class="absolute z-20"
                :style="getMarkerStyle(marker)"
            >
                <button @click="deleteMarker(marker.id)" class="btn btn-circle btn-xs btn-error -mt-10 ml-4" title="删除标点">
                    <Icon icon="ri:delete-bin-line" />
                </button>
            </div>
        </template>

        <!-- 标点详情气泡 -->
        <div
            v-if="selectedMarker"
            class="absolute z-100 bg-base-100 shadow-lg rounded-lg p-3 min-w-50 max-w-90 border border-base-300 pointer-events-auto"
            :style="detailPopupStyle"
        >
            <div class="flex items-center justify-between mb-2">
                <div class="font-medium text-sm">{{ selectedMarker.name }}</div>
                <button
                    @click.stop="((selectedMarkerId = null), (markerDetail = null), (selectedMarker = null))"
                    class="btn btn-circle btn-xs btn-ghost h-5 w-5"
                >
                    <Icon icon="radix-icons:cross2" />
                </button>
            </div>

            <div v-if="markerDetailLoading" class="flex items-center justify-center py-2">
                <span class="loading loading-spinner loading-sm"></span>
                <span class="ml-2 text-xs">加载中...</span>
            </div>

            <div v-else-if="markerDetail" class="space-y-2 text-xs">
                <div v-if="markerDetail.pic">
                    <img :src="markerDetail.pic" class="w-full h-auto rounded" alt="标点图片" />
                </div>
                <div v-if="markerDetail.description">
                    <div class="opacity-70 mb-0.5">描述</div>
                    <div class="whitespace-pre-wrap max-w-full">{{ markerDetail.description }}</div>
                </div>
            </div>

            <div v-else-if="selectedMarker && selectedMarker.isUserMarker" class="space-y-2 text-xs">
                <div>
                    <div class="opacity-70 mb-0.5">名称</div>
                    <div>{{ selectedMarker.name }}</div>
                </div>
                <div>
                    <div class="opacity-70 mb-0.5">坐标</div>
                    <div>X: {{ selectedMarker.x.toFixed(2) }}, Y: {{ selectedMarker.y.toFixed(2) }}</div>
                </div>
            </div>

            <!-- 向下箭头 -->
            <div class="absolute -bottom-2 left-1/2 -translate-x-1/2">
                <svg width="16" height="8" viewBox="0 0 16 8" class="text-base-100 fill-current">
                    <path d="M0 0 L8 8 L16 0 Z" />
                </svg>
            </div>
            <div class="absolute -bottom-3 left-1/2 -translate-x-1/2">
                <svg width="18" height="10" viewBox="0 0 18 10" class="text-base-300 fill-current">
                    <path d="M0 0 L9 10 L18 0 Z" />
                </svg>
            </div>
        </div>

        <div class="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
            <div class="badge badge-lg badge-neutral">
                缩放: {{ (zoom * 100).toFixed(0) }}% | 标点: {{ filteredMarkers.length }} | 瓦片: {{ visibleTiles.size }}
            </div>
        </div>
    </div>
</template>

<style>
.map-renderer {
    -webkit-overflow-scrolling: touch;
}
.map-content {
    will-change: transform;
}
.map-tile {
    image-rendering: pixelated;
}
</style>
