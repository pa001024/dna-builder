<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import regionData, { regionMap, type Region } from "@/data/d/region.data"
import { subRegionData, type SubRegion } from "@/data/d/subregion.data"

type LayerSelectMode = "single" | "multi"

interface CanvasPanelSlotRect {
    x: number
    y: number
    w: number
    h: number
    zOrder: number
    opacity: number
}

interface LocalMapLayerSlot {
    id: string
    name: string
    fileName: string
    slot: CanvasPanelSlotRect
}

interface LocalMapProfile {
    regionId: number
    key: string
    name: string
    layers: LocalMapLayerSlot[]
}

interface LocalLayerGroup {
    id: string
    name: string
    selectMode: LayerSelectMode
    layers: LocalMapLayerSlot[]
}

interface LayerDrawRect {
    layer: LocalMapLayerSlot
    x: number
    y: number
    w: number
    h: number
}

interface MapBounds {
    minX: number
    minY: number
    width: number
    height: number
}

interface ProjectedSubRegionPoint {
    id: number
    name: string
    worldX: number
    worldY: number
    mapX: number
    mapY: number
}

interface HoverCoordinateInfo {
    mapX: number
    mapY: number
    worldX: number
    worldY: number
}

interface RegionProjectionRuntimeConfig {
    center: [number, number]
    mapRotationDeg: number
    pointRotationDeg: number
    unitsPerPixel: number
    invertY: boolean
    renderMapRotation: boolean
}

interface DrawLayerItem {
    layer: LocalMapLayerSlot
    effectiveOpacity: number
    isFocused: boolean
    isBaseLayer: boolean
    originalIndex: number
}

const containerRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()

/**
 * 基于 region.data 生成本地分层地图配置。
 */
const mapLocalProfiles: LocalMapProfile[] = regionData
    .filter(region => Array.isArray(region.mapMapping) && region.mapMapping.length > 0)
    .map(region => ({
        regionId: region.id,
        key: region.mapImage || `region-${region.id}`,
        name: region.name,
        layers: (region.mapMapping || []).map((mapping, index) => ({
            id: `${mapping.name}-${index}`,
            name: mapping.name,
            fileName: `${mapping.name}.webp`,
            slot: {
                x: Number(mapping.pos[0] || 0),
                y: Number(mapping.pos[1] || 0),
                w: Number(mapping.pos[2] || 0),
                h: Number(mapping.pos[3] || 0),
                zOrder: Number(mapping.zOrder || 0),
                opacity: Number(mapping.opacity ?? 1),
            },
        })),
    }))

const firstProfile = mapLocalProfiles[0]
if (!firstProfile) {
    throw new Error("mapLocalProfiles 不能为空")
}

const selectedRegionId = ref<number>(firstProfile.regionId)
const activeLayerIds = ref<Set<string>>(new Set())
const selectedSingleLayerByGroup = ref<Map<string, string>>(new Map())
const focusedLayerId = ref<string | null>(null)
const layerImageMap = ref<Map<string, HTMLImageElement>>(new Map())
const isImageLoading = ref(false)
const loadError = ref("")

const zoom = ref(1)
const minZoom = 0.12
const maxZoom = 6
const panOffset = ref({ x: 0, y: 0 })

const isDragging = ref(false)
const dragDistance = ref(0)
const lastPointerPosition = ref({ x: 0, y: 0 })

const selectedSubRegionId = ref<number | null>(null)
const hoverCoordinateInfo = ref<HoverCoordinateInfo | null>(null)

let resizeObserver: ResizeObserver | null = null
let drawRaf = 0

/**
 * 判断子区域是否包含有效中心坐标。
 */
function hasSubRegionPos(subRegion: SubRegion): subRegion is SubRegion & { pos: [number, number] } {
    return (
        Array.isArray(subRegion.pos) && subRegion.pos.length >= 2 && Number.isFinite(subRegion.pos[0]) && Number.isFinite(subRegion.pos[1])
    )
}

/**
 * 识别图层分组标识，便于做层级切换。
 */
function detectLayerGroupId(layer: LocalMapLayerSlot): string {
    if (layer.fileName.includes("_Bg")) return "base"
    if (/_L-?\d+/.test(layer.fileName)) return "floor"
    if (/_\d{6}\./.test(layer.fileName)) return "subregion"
    return "misc"
}

/**
 * 图层分组名称。
 */
function getLayerGroupName(groupId: string): string {
    if (groupId === "base") return "基础图层"
    if (groupId === "floor") return "楼层图层"
    if (groupId === "subregion") return "子区域图层"
    return "其它图层"
}

/**
 * 图层分组选择模式。
 */
function getLayerGroupSelectMode(groupId: string): LayerSelectMode {
    if (groupId === "floor") return "single"
    return "multi"
}

const currentProfile = computed<LocalMapProfile>(() => mapLocalProfiles.find(v => v.regionId === selectedRegionId.value) ?? firstProfile)
const currentRegion = computed<Region | undefined>(() => regionMap.get(currentProfile.value.regionId))

const regionOptions = computed(() => {
    return mapLocalProfiles.map(profile => {
        const region = regionMap.get(profile.regionId)
        return { id: profile.regionId, name: region?.name || profile.name }
    })
})

const layerGroups = computed<LocalLayerGroup[]>(() => {
    const grouped = new Map<string, LocalMapLayerSlot[]>()
    currentProfile.value.layers.forEach(layer => {
        const id = detectLayerGroupId(layer)
        const list = grouped.get(id) || []
        list.push(layer)
        grouped.set(id, list)
    })

    const order = ["base", "floor", "subregion", "misc"]
    return order
        .map(id => {
            const layers = grouped.get(id)
            if (!layers || layers.length === 0) return null
            return {
                id,
                name: getLayerGroupName(id),
                selectMode: getLayerGroupSelectMode(id),
                layers: [...layers].sort((a, b) => a.slot.zOrder - b.slot.zOrder || a.name.localeCompare(b.name)),
            }
        })
        .filter((v): v is LocalLayerGroup => Boolean(v))
})

const activeLayers = computed(() =>
    currentProfile.value.layers.filter(layer => activeLayerIds.value.has(layer.id)).sort((a, b) => a.slot.zOrder - b.slot.zOrder)
)
const drawLayers = computed<DrawLayerItem[]>(() => {
    const focusEnabled = layerGroups.value.some(group => group.selectMode === "single")
    const focused = focusEnabled ? focusedLayerId.value : null
    const dimFactor = 0.28
    const layers = activeLayers.value.map((layer, originalIndex) => ({
        isBaseLayer: detectLayerGroupId(layer) === "base",
        layer,
        effectiveOpacity: Math.max(
            0,
            Math.min(1, layer.slot.opacity * (focused && layer.id !== focused && detectLayerGroupId(layer) !== "base" ? dimFactor : 1))
        ),
        isFocused: focused === layer.id,
        originalIndex,
    }))

    layers.sort((a, b) => {
        if (a.isBaseLayer !== b.isBaseLayer) {
            return a.isBaseLayer ? -1 : 1
        }
        if (!a.isBaseLayer && !b.isBaseLayer && a.isFocused !== b.isFocused) {
            return a.isFocused ? 1 : -1
        }
        if (a.layer.slot.zOrder !== b.layer.slot.zOrder) {
            return a.layer.slot.zOrder - b.layer.slot.zOrder
        }
        return a.originalIndex - b.originalIndex
    })

    return layers
})
const currentSubRegions = computed(() => subRegionData.filter(v => v.rid === currentProfile.value.regionId).filter(hasSubRegionPos))

/**
 * 读取当前区域投影配置。
 * 约束：投影参数统一取 region.data。
 */
const regionProjectionConfig = computed<RegionProjectionRuntimeConfig>(() => {
    const region = currentRegion.value

    const center =
        region?.mapCenter && region.mapCenter.length >= 2
            ? [Number(region.mapCenter[0]), Number(region.mapCenter[1])]
            : (() => {
                  if (currentSubRegions.value.length === 0) return [0, 0]
                  const total = currentSubRegions.value.reduce(
                      (acc, cur) => {
                          acc.x += cur.pos[0]
                          acc.y += cur.pos[1]
                          return acc
                      },
                      { x: 0, y: 0 }
                  )
                  return [total.x / currentSubRegions.value.length, total.y / currentSubRegions.value.length]
              })()

    const mapRotationDeg = Number(region?.mapRotation || 0)
    const pointRotationDeg = mapRotationDeg
    const unitsPerPixel = 30

    return {
        center: [center[0], center[1]],
        mapRotationDeg,
        pointRotationDeg,
        unitsPerPixel,
        invertY: false,
        renderMapRotation: true,
    }
})

/**
 * 解析图层绘制矩形。
 * 当 slot 的 w/h 为 0 时，回退到图片原始尺寸。
 */
function resolveLayerDrawRect(layer: LocalMapLayerSlot): LayerDrawRect {
    const image = layerImageMap.value.get(layer.id)
    const naturalWidth = image?.naturalWidth || image?.width || 0
    const naturalHeight = image?.naturalHeight || image?.height || 0
    const w = layer.slot.w > 0 ? layer.slot.w : naturalWidth
    const h = layer.slot.h > 0 ? layer.slot.h : naturalHeight
    return { layer, x: layer.slot.x, y: layer.slot.y, w, h }
}

const allLayerDrawRects = computed(() => currentProfile.value.layers.map(resolveLayerDrawRect))

/**
 * 根据图层槽位求合成边界，和 export_region_maps.py 的 min/max 逻辑一致。
 */
const composedBounds = computed<MapBounds>(() => {
    const valid = allLayerDrawRects.value.filter(rect => rect.w > 0 && rect.h > 0)
    if (valid.length === 0) return { minX: 0, minY: 0, width: 4096, height: 4096 }

    const minX = Math.min(...valid.map(rect => rect.x))
    const minY = Math.min(...valid.map(rect => rect.y))
    const maxX = Math.max(...valid.map(rect => rect.x + rect.w))
    const maxY = Math.max(...valid.map(rect => rect.y + rect.h))

    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
})

const sourceSize = computed(() => ({ width: composedBounds.value.width, height: composedBounds.value.height }))

/**
 * 计算旋转后扩展画布尺寸（与 PIL rotate(expand=True) 的几何边界一致）。
 */
function computeRotatedSize(width: number, height: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180
    const absCos = Math.abs(Math.cos(rad))
    const absSin = Math.abs(Math.sin(rad))
    return {
        width: Math.max(1, Math.ceil(width * absCos + height * absSin)),
        height: Math.max(1, Math.ceil(width * absSin + height * absCos)),
    }
}

const renderSize = computed(() => {
    if (!regionProjectionConfig.value.renderMapRotation || Math.abs(regionProjectionConfig.value.mapRotationDeg) <= 1e-6)
        return sourceSize.value
    return computeRotatedSize(sourceSize.value.width, sourceSize.value.height, regionProjectionConfig.value.mapRotationDeg)
})

/**
 * 二维点旋转，完全对齐参考脚本 _rotate_xy。
 */
function rotateXY(x: number, y: number, deg: number): [number, number] {
    const rad = (deg * Math.PI) / 180
    const cs = Math.cos(rad)
    const sn = Math.sin(rad)
    return [cs * x - sn * y, sn * x + cs * y]
}

/**
 * 在图片坐标系内做中心旋转并从 src 尺寸映射到 dst 尺寸。
 */
function rotatePointInImageSpace(
    pointX: number,
    pointY: number,
    src: { width: number; height: number },
    dst: { width: number; height: number },
    angleDeg: number
) {
    const srcCx = src.width / 2
    const srcCy = src.height / 2
    const dstCx = dst.width / 2
    const dstCy = dst.height / 2
    const [rx, ry] = rotateXY(pointX - srcCx, pointY - srcCy, angleDeg)
    return { x: dstCx + rx, y: dstCy + ry }
}

/**
 * 世界坐标投影到当前地图画布坐标。
 * 完全对应 plot_region_point_boxes.py 中 _project_points + _rotate_points_in_image_space。
 */
function projectWorldToMap(worldX: number, worldY: number) {
    const [centerX, centerY] = regionProjectionConfig.value.center
    const [rx, ry] = rotateXY(worldX - centerX, worldY - centerY, regionProjectionConfig.value.pointRotationDeg)

    const sourceX = sourceSize.value.width / 2 + rx / regionProjectionConfig.value.unitsPerPixel
    const sourceY = regionProjectionConfig.value.invertY
        ? sourceSize.value.height / 2 - ry / regionProjectionConfig.value.unitsPerPixel
        : sourceSize.value.height / 2 + ry / regionProjectionConfig.value.unitsPerPixel

    if (regionProjectionConfig.value.renderMapRotation && Math.abs(regionProjectionConfig.value.mapRotationDeg) > 1e-6) {
        return rotatePointInImageSpace(
            sourceX,
            sourceY,
            sourceSize.value,
            renderSize.value,
            regionProjectionConfig.value.mapRotationDeg - regionProjectionConfig.value.pointRotationDeg
        )
    }

    return { x: sourceX, y: sourceY }
}

/**
 * 地图画布坐标反投影到世界坐标，用于鼠标坐标显示与点击定位。
 */
function projectMapToWorld(mapX: number, mapY: number) {
    let sourceX = mapX
    let sourceY = mapY

    if (regionProjectionConfig.value.renderMapRotation && Math.abs(regionProjectionConfig.value.mapRotationDeg) > 1e-6) {
        const restored = rotatePointInImageSpace(
            mapX,
            mapY,
            renderSize.value,
            sourceSize.value,
            -(regionProjectionConfig.value.mapRotationDeg - regionProjectionConfig.value.pointRotationDeg)
        )
        sourceX = restored.x
        sourceY = restored.y
    }

    const rx = (sourceX - sourceSize.value.width / 2) * regionProjectionConfig.value.unitsPerPixel
    const ry = regionProjectionConfig.value.invertY
        ? -(sourceY - sourceSize.value.height / 2) * regionProjectionConfig.value.unitsPerPixel
        : (sourceY - sourceSize.value.height / 2) * regionProjectionConfig.value.unitsPerPixel

    const [dx, dy] = rotateXY(rx, ry, -regionProjectionConfig.value.pointRotationDeg)

    return {
        x: regionProjectionConfig.value.center[0] + dx,
        y: regionProjectionConfig.value.center[1] + dy,
    }
}

const projectedSubRegions = computed<ProjectedSubRegionPoint[]>(() => {
    return currentSubRegions.value.map(subRegion => {
        const [worldX, worldY] = subRegion.pos
        const mapped = projectWorldToMap(worldX, worldY)
        return { id: subRegion.id, name: subRegion.name, worldX, worldY, mapX: mapped.x, mapY: mapped.y }
    })
})

const selectedSubRegion = computed(() => {
    if (selectedSubRegionId.value === null) return null
    return projectedSubRegions.value.find(item => item.id === selectedSubRegionId.value) ?? null
})

/**
 * 异步加载单个图层图片（带全局 Promise 缓存，避免重复下载）。
 */
const imagePromiseCache = new Map<string, Promise<HTMLImageElement>>()
function loadLayerImage(fileName: string): Promise<HTMLImageElement> {
    const cacheKey = `/imgs/world/${fileName}`
    const cached = imagePromiseCache.get(cacheKey)
    if (cached) return cached

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error(`加载地图图层失败: ${fileName}`))
        image.src = cacheKey
    })

    imagePromiseCache.set(cacheKey, promise)
    return promise
}

/**
 * 加载当前区域的所有图层。
 */
async function loadCurrentProfileImages() {
    isImageLoading.value = true
    loadError.value = ""
    try {
        const loadedEntries = await Promise.all(
            currentProfile.value.layers.map(async layer => {
                const image = await loadLayerImage(layer.fileName)
                return [layer.id, image] as const
            })
        )
        const nextMap = new Map(layerImageMap.value)
        loadedEntries.forEach(([layerId, image]) => nextMap.set(layerId, image))
        layerImageMap.value = nextMap
    } catch (error) {
        loadError.value = error instanceof Error ? error.message : "加载本地地图图片失败"
    } finally {
        isImageLoading.value = false
        requestDraw()
    }
}

/**
 * 初始化默认可见图层。
 */
function initializeActiveLayers(profile: LocalMapProfile) {
    const next = new Set<string>()
    const nextSingleSelected = new Map<string, string>()
    let firstFocusedLayerId: string | null = null
    const grouped = new Map<string, LocalMapLayerSlot[]>()

    profile.layers.forEach(layer => {
        const groupId = detectLayerGroupId(layer)
        const list = grouped.get(groupId) || []
        list.push(layer)
        grouped.set(groupId, list)
    })

    grouped.forEach((layers, groupId) => {
        const mode = getLayerGroupSelectMode(groupId)
        const sorted = [...layers].sort((a, b) => a.slot.zOrder - b.slot.zOrder || a.name.localeCompare(b.name))
        if (mode === "multi") {
            sorted.forEach(layer => next.add(layer.id))
            return
        }
        sorted.forEach(layer => next.add(layer.id))
        const preferred = sorted.find(layer => layer.fileName.includes("_L0")) || sorted[0]
        if (preferred) {
            nextSingleSelected.set(groupId, preferred.id)
            if (firstFocusedLayerId === null) {
                firstFocusedLayerId = preferred.id
            }
        }
    })

    activeLayerIds.value = next
    selectedSingleLayerByGroup.value = nextSingleSelected
    focusedLayerId.value = firstFocusedLayerId
}

/**
 * 获取单选分组当前选中层。
 */
function isSingleLayerSelected(groupId: string, layerId: string) {
    return selectedSingleLayerByGroup.value.get(groupId) === layerId
}

/**
 * 单选图层组切换。
 */
function selectSingleLayer(layerGroupId: string, layerId: string) {
    const nextSingleSelected = new Map(selectedSingleLayerByGroup.value)
    nextSingleSelected.set(layerGroupId, layerId)
    selectedSingleLayerByGroup.value = nextSingleSelected

    const next = new Set(activeLayerIds.value)
    currentProfile.value.layers.filter(layer => detectLayerGroupId(layer) === layerGroupId).forEach(layer => next.add(layer.id))
    activeLayerIds.value = next
    focusedLayerId.value = layerId
    requestDraw()
}

/**
 * 多选图层组切换。
 */
function toggleMultiLayer(layerId: string, checked: boolean) {
    const next = new Set(activeLayerIds.value)
    if (checked) next.add(layerId)
    else next.delete(layerId)
    activeLayerIds.value = next

    requestDraw()
}

/**
 * 判断图层是否激活。
 */
function isLayerActive(layerId: string) {
    return activeLayerIds.value.has(layerId)
}

/**
 * 将屏幕坐标转换为地图坐标。
 */
function screenToMap(screenX: number, screenY: number) {
    return { x: (screenX - panOffset.value.x) / zoom.value, y: (screenY - panOffset.value.y) / zoom.value }
}

/**
 * 重置视图到居中适配状态。
 */
function resetView() {
    const container = containerRef.value
    if (!container) return
    const fitZoom = Math.min(container.clientWidth / renderSize.value.width, container.clientHeight / renderSize.value.height)
    zoom.value = Math.max(minZoom, Math.min(maxZoom, fitZoom))
    panOffset.value = {
        x: (container.clientWidth - renderSize.value.width * zoom.value) / 2,
        y: (container.clientHeight - renderSize.value.height * zoom.value) / 2,
    }
    requestDraw()
}

/**
 * 聚焦到指定子区域点。
 */
function focusSubRegion(subRegionId: number) {
    selectedSubRegionId.value = subRegionId
    const target = projectedSubRegions.value.find(item => item.id === subRegionId)
    const container = containerRef.value
    if (!target || !container) {
        requestDraw()
        return
    }
    panOffset.value = { x: container.clientWidth / 2 - target.mapX * zoom.value, y: container.clientHeight / 2 - target.mapY * zoom.value }
    requestDraw()
}

/**
 * 按点击位置命中最近 subregion 点位。
 */
function pickSubRegionByScreenPosition(screenX: number, screenY: number): ProjectedSubRegionPoint | null {
    const mapPoint = screenToMap(screenX, screenY)
    const threshold = 14 / zoom.value
    let nearest: ProjectedSubRegionPoint | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const item of projectedSubRegions.value) {
        const distance = Math.hypot(item.mapX - mapPoint.x, item.mapY - mapPoint.y)
        if (distance <= threshold && distance < nearestDistance) {
            nearest = item
            nearestDistance = distance
        }
    }
    return nearest
}

/**
 * 请求下一帧重绘。
 */
function requestDraw() {
    if (drawRaf) return
    drawRaf = requestAnimationFrame(() => {
        drawRaf = 0
        drawScene()
    })
}

/**
 * 绘制单个地图图层。
 */
function drawLayer(ctx: CanvasRenderingContext2D, item: DrawLayerItem) {
    const layer = item.layer
    const image = layerImageMap.value.get(layer.id)
    if (!image) return
    const rect = resolveLayerDrawRect(layer)
    if (rect.w <= 0 || rect.h <= 0) return

    const drawX = rect.x - composedBounds.value.minX
    const drawY = rect.y - composedBounds.value.minY
    const opacity = Math.max(0, Math.min(1, item.effectiveOpacity))

    if (regionProjectionConfig.value.renderMapRotation && Math.abs(regionProjectionConfig.value.mapRotationDeg) > 1e-6) {
        ctx.save()
        ctx.translate(renderSize.value.width / 2, renderSize.value.height / 2)
        ctx.rotate((regionProjectionConfig.value.mapRotationDeg * Math.PI) / 180)
        ctx.globalAlpha = opacity
        ctx.drawImage(image, drawX - sourceSize.value.width / 2, drawY - sourceSize.value.height / 2, rect.w, rect.h)
        ctx.restore()
        return
    }

    ctx.save()
    ctx.globalAlpha = opacity
    ctx.drawImage(image, drawX, drawY, rect.w, rect.h)
    ctx.restore()
}

/**
 * 绘制 subregion 点位与标签。
 */
function drawSubRegionPoints(ctx: CanvasRenderingContext2D) {
    ctx.font = "12px sans-serif"
    ctx.textBaseline = "top"
    projectedSubRegions.value.forEach(point => {
        const isSelected = point.id === selectedSubRegionId.value
        const radius = isSelected ? 7 : 5

        ctx.beginPath()
        ctx.arc(point.mapX, point.mapY, radius, 0, Math.PI * 2)
        ctx.fillStyle = isSelected ? "rgba(255, 70, 70, 0.95)" : "rgba(53, 132, 255, 0.92)"
        ctx.fill()

        ctx.lineWidth = isSelected ? 2 : 1
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)"
        ctx.stroke()

        const text = String(point.id)
        const textWidth = ctx.measureText(text).width
        const labelX = point.mapX + radius + 4
        const labelY = point.mapY - radius - 2
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)"
        ctx.fillRect(labelX - 3, labelY - 1, textWidth + 6, 16)
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)"
        ctx.fillText(text, labelX, labelY + 1)
    })
}

/**
 * 主绘制流程：画布缩放适配 + 地图图层 + 子区域点位。
 */
function drawScene() {
    const container = containerRef.value
    const canvas = canvasRef.value
    if (!container || !canvas) return

    const width = Math.max(container.clientWidth, 1)
    const height = Math.max(container.clientHeight, 1)
    const dpr = window.devicePixelRatio || 1
    const targetWidth = Math.round(width * dpr)
    const targetHeight = Math.round(height * dpr)

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
    }

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = "#0f172a"
    ctx.fillRect(0, 0, width, height)

    ctx.save()
    ctx.translate(panOffset.value.x, panOffset.value.y)
    ctx.scale(zoom.value, zoom.value)
    drawLayers.value.forEach(layer => drawLayer(ctx, layer))
    drawSubRegionPoints(ctx)
    ctx.lineWidth = 1 / zoom.value
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"
    ctx.strokeRect(0, 0, renderSize.value.width, renderSize.value.height)
    ctx.restore()
}

/**
 * 更新鼠标悬停坐标（地图坐标 + 世界坐标）。
 */
function updateHoverCoordinateByPointerEvent(event: PointerEvent) {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mapPoint = screenToMap(event.clientX - rect.left, event.clientY - rect.top)
    const worldPoint = projectMapToWorld(mapPoint.x, mapPoint.y)
    hoverCoordinateInfo.value = { mapX: mapPoint.x, mapY: mapPoint.y, worldX: worldPoint.x, worldY: worldPoint.y }
}

/**
 * 指针按下进入拖拽状态。
 */
function handlePointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    isDragging.value = true
    dragDistance.value = 0
    lastPointerPosition.value = { x: event.clientX, y: event.clientY }
    ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
}

/**
 * 指针移动：执行平移并更新悬停坐标。
 */
function handlePointerMove(event: PointerEvent) {
    updateHoverCoordinateByPointerEvent(event)
    if (!isDragging.value) return

    const dx = event.clientX - lastPointerPosition.value.x
    const dy = event.clientY - lastPointerPosition.value.y
    dragDistance.value += Math.abs(dx) + Math.abs(dy)
    panOffset.value = { x: panOffset.value.x + dx, y: panOffset.value.y + dy }
    lastPointerPosition.value = { x: event.clientX, y: event.clientY }
    requestDraw()
}

/**
 * 指针释放：结束拖拽状态。
 */
function handlePointerUp(event: PointerEvent) {
    isDragging.value = false
    ;(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId)
}

/**
 * 鼠标滚轮缩放，保持光标锚点不跳动。
 */
function handleWheel(event: WheelEvent) {
    event.preventDefault()
    const canvas = canvasRef.value
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top

    const mapMouse = screenToMap(mouseX, mouseY)
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1
    const nextZoom = Math.max(minZoom, Math.min(maxZoom, zoom.value * zoomFactor))
    zoom.value = nextZoom

    panOffset.value = { x: mouseX - mapMouse.x * nextZoom, y: mouseY - mapMouse.y * nextZoom }
    requestDraw()
}

/**
 * 快捷放大。
 */
function zoomIn() {
    zoom.value = Math.min(maxZoom, zoom.value + 0.2)
    requestDraw()
}

/**
 * 快捷缩小。
 */
function zoomOut() {
    zoom.value = Math.max(minZoom, zoom.value - 0.2)
    requestDraw()
}

/**
 * 点击地图选中最近点位。
 */
function handleCanvasClick(event: MouseEvent) {
    if (dragDistance.value > 4) return
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const hit = pickSubRegionByScreenPosition(event.clientX - rect.left, event.clientY - rect.top)
    selectedSubRegionId.value = hit ? hit.id : null
    requestDraw()
}

watch(
    () => currentProfile.value.regionId,
    async () => {
        initializeActiveLayers(currentProfile.value)
        selectedSubRegionId.value = null
        hoverCoordinateInfo.value = null
        await loadCurrentProfileImages()
        await nextTick()
        resetView()
    },
    { immediate: true }
)

watch(
    () => [
        activeLayers.value.map(layer => layer.id).join("|"),
        projectedSubRegions.value.length,
        selectedSubRegionId.value ?? -1,
        renderSize.value.width,
        renderSize.value.height,
        sourceSize.value.width,
        sourceSize.value.height,
    ],
    () => requestDraw()
)

onMounted(() => {
    const container = containerRef.value
    if (!container) return
    resizeObserver = new ResizeObserver(() => requestDraw())
    resizeObserver.observe(container)
    requestDraw()
})

onUnmounted(() => {
    if (drawRaf) {
        cancelAnimationFrame(drawRaf)
        drawRaf = 0
    }
    resizeObserver?.disconnect()
    resizeObserver = null
})
</script>

<template>
    <div class="h-full flex min-h-0 bg-base-100">
        <aside class="w-80 max-w-[48vw] border-r border-base-300 bg-base-200/70 p-3 flex flex-col gap-3 overflow-y-auto">
            <div class="space-y-2">
                <div class="text-xs opacity-70">区域</div>
                <select v-model.number="selectedRegionId" class="select select-bordered select-sm w-full">
                    <option v-for="region in regionOptions" :key="region.id" :value="region.id">{{ region.id }} - {{ region.name }}</option>
                </select>
            </div>

            <div class="space-y-2">
                <div class="text-xs opacity-70">图层</div>
                <div v-for="group in layerGroups" :key="group.id" class="rounded-md border border-base-300 p-2 space-y-2 bg-base-100/70">
                    <div class="font-medium text-sm">{{ group.name }}</div>
                    <div class="space-y-1">
                        <label
                            v-for="layer in group.layers"
                            :key="layer.id"
                            class="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-0.5 hover:bg-base-200"
                        >
                            <input
                                v-if="group.selectMode === 'single'"
                                :checked="isSingleLayerSelected(group.id, layer.id)"
                                type="radio"
                                :name="`layer-group-${group.id}`"
                                class="radio radio-xs"
                                @change="selectSingleLayer(group.id, layer.id)"
                            />
                            <input
                                v-else
                                :checked="isLayerActive(layer.id)"
                                type="checkbox"
                                class="checkbox checkbox-xs"
                                @change="toggleMultiLayer(layer.id, ($event.target as HTMLInputElement).checked)"
                            />
                            <span>{{ layer.name }}</span>
                            <span class="ml-auto text-xs opacity-60">z{{ layer.slot.zOrder }}</span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="space-y-2">
                <div class="text-xs opacity-70">SubRegion 坐标</div>
                <div class="rounded-md border border-base-300 bg-base-100/70 max-h-[40vh] overflow-y-auto">
                    <button
                        v-for="point in projectedSubRegions"
                        :key="point.id"
                        class="w-full text-left p-2 border-b last:border-b-0 border-base-300 hover:bg-base-200 transition-colors"
                        :class="{ 'bg-primary/15': selectedSubRegionId === point.id }"
                        @click="focusSubRegion(point.id)"
                    >
                        <div class="font-medium text-sm">{{ point.name }}</div>
                        <div class="text-xs opacity-70">ID {{ point.id }}</div>
                        <div class="text-xs opacity-70">World: {{ point.worldX.toFixed(1) }}, {{ point.worldY.toFixed(1) }}</div>
                        <div class="text-xs opacity-70">Image: {{ point.mapX.toFixed(1) }}, {{ point.mapY.toFixed(1) }}</div>
                    </button>
                    <div v-if="projectedSubRegions.length === 0" class="p-3 text-sm opacity-70">当前区域没有可显示的 subregion 坐标</div>
                </div>
            </div>
        </aside>

        <section ref="containerRef" class="relative flex-1 min-w-0 overflow-hidden bg-base-300">
            <canvas
                ref="canvasRef"
                class="absolute inset-0 h-full w-full db-map-local-canvas"
                @pointerdown="handlePointerDown"
                @pointermove="handlePointerMove"
                @pointerup="handlePointerUp"
                @pointercancel="handlePointerUp"
                @wheel="handleWheel"
                @click="handleCanvasClick"
            />

            <div class="absolute top-3 left-3 z-10 flex flex-col gap-2">
                <button class="btn btn-circle btn-sm" title="放大" @click="zoomIn"><Icon icon="ri:add-line" /></button>
                <button class="btn btn-circle btn-sm" title="缩小" @click="zoomOut"><Icon icon="ri:subtract-line" /></button>
                <button class="btn btn-circle btn-sm" title="重置视图" @click="resetView"><Icon icon="ri:crosshair-line" /></button>
            </div>

            <div class="absolute top-3 right-3 z-10 space-y-2 max-w-90">
                <div class="badge badge-neutral badge-lg">
                    缩放 {{ (zoom * 100).toFixed(0) }}% | 图层 {{ activeLayers.length }} | 点位 {{ projectedSubRegions.length }}
                </div>
                <div v-if="hoverCoordinateInfo" class="rounded-md border border-base-300 bg-base-100/90 px-3 py-2 text-xs leading-5 shadow">
                    <div>Map: {{ hoverCoordinateInfo.mapX.toFixed(2) }}, {{ hoverCoordinateInfo.mapY.toFixed(2) }}</div>
                    <div>World: {{ hoverCoordinateInfo.worldX.toFixed(2) }}, {{ hoverCoordinateInfo.worldY.toFixed(2) }}</div>
                </div>
            </div>

            <div
                v-if="selectedSubRegion"
                class="absolute bottom-3 left-3 z-10 rounded-md border border-base-300 bg-base-100/92 p-3 text-sm shadow max-w-100"
            >
                <div class="font-medium">{{ selectedSubRegion.name }}</div>
                <div class="text-xs opacity-70 mt-1">ID: {{ selectedSubRegion.id }}</div>
                <div class="text-xs mt-1">World: {{ selectedSubRegion.worldX.toFixed(2) }}, {{ selectedSubRegion.worldY.toFixed(2) }}</div>
                <div class="text-xs">Image: {{ selectedSubRegion.mapX.toFixed(2) }}, {{ selectedSubRegion.mapY.toFixed(2) }}</div>
            </div>

            <div v-if="isImageLoading" class="absolute inset-0 z-20 grid place-items-center bg-base-100/45 backdrop-blur-[1px]">
                <div class="flex items-center gap-2 rounded-md border border-base-300 bg-base-100 px-4 py-2 text-sm shadow">
                    <span class="loading loading-spinner loading-sm" />正在加载本地图层...
                </div>
            </div>

            <div
                v-if="loadError"
                class="absolute bottom-3 right-3 z-20 rounded-md border border-error/60 bg-error/10 px-3 py-2 text-sm text-error"
            >
                {{ loadError }}
            </div>
        </section>
    </div>
</template>

<style scoped>
.db-map-local-canvas {
    touch-action: none;
    cursor: grab;
}

.db-map-local-canvas:active {
    cursor: grabbing;
}
</style>
