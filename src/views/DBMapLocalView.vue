<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { petMap } from "@/data/d"
import regionData, { mapOffsets, type Region, regionMap } from "@/data/d/region.data"
import { type SubRegion, subRegionData, type TeleportPoint } from "@/data/d/subregion.data"
import { LeveledPet } from "@/data/leveled/LeveledPet"

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
    offset: [number, number]
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

interface MapPoint {
    x: number
    y: number
}

interface RcPetRate {
    petId: number
    petName: string
    petQuality: number
    petIconUrl: string
    weight: number
    totalWeight: number
    ratio: number
}

interface RcUnknownRate {
    entityId: number
    weight: number
    totalWeight: number
    ratio: number
}

interface ProjectedRcPoint extends MapPoint {
    rcId: number
    rcIndex: number
    pointIndex: number
    worldX: number
    worldY: number
}

interface ProjectedTeleportPoint extends TeleportPoint, MapPoint {
    worldX: number
    worldY: number
}

interface ProjectedRcInfo {
    rcId: number
    rcIndex: number
    count: number
    totalWeight: number
    points: ProjectedRcPoint[]
    petRates: RcPetRate[]
    unknownRates: RcUnknownRate[]
    rarestPet: RcPetRate | null
}

interface ProjectedSubRegionPoint {
    id: number
    name: string
    worldX: number
    worldY: number
    mapX: number
    mapY: number
    centerSource: "pos" | "range.center"
    rangeExtentX: number
    rangeExtentY: number
    rangeOutline: MapPoint[]
    rcInfos: ProjectedRcInfo[]
    rcPointCount: number
    tpPoints: ProjectedTeleportPoint[]
    tpPointCount: number
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

interface MapLocalRouteTarget {
    regionId: number | null
    subRegionId: number | null
    rcId: number | null
    rcIndex: number | null
}

/**
 * 解析 mapMapping 的槽位偏移。
 * @param mapping 原始图层映射
 * @returns 前两个坐标的偏移量
 */
function resolveMapMappingOffset(mapping: { name: string; pos: number[] }): [number, number] {
    const offset = mapOffsets[mapping.name]
    if (!offset) return [0, 0]
    return [Number(offset[0] || 0), Number(offset[1] || 0)]
}

const containerRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
const route = useRoute()

/**
 * 基于 region.data 生成本地分层地图配置。
 */
const mapLocalProfiles: LocalMapProfile[] = regionData
    .filter(region => Array.isArray(region.mapMapping) && region.mapMapping.length > 0)
    .map(region => ({
        regionId: region.id,
        key: region.mapImage || `region-${region.id}`,
        name: region.name,
        layers: (region.mapMapping || []).map((mapping, index) => {
            const offset = resolveMapMappingOffset(mapping)
            return {
                id: `${mapping.name}-${index}`,
                name: mapping.name,
                fileName: `${mapping.name}.webp`,
                // 仅对 mapMapping 的前两个坐标应用偏移，保持宽高和其它坐标不变。
                slot: {
                    x: Number(mapping.pos[0] || 0),
                    y: Number(mapping.pos[1] || 0),
                    w: Number(mapping.pos[2] || 0),
                    h: Number(mapping.pos[3] || 0),
                    zOrder: Number(mapping.zOrder || 0),
                    opacity: Number(mapping.opacity ?? 1),
                },
                offset,
            }
        }),
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
const hoveredSubRegionId = ref<number | null>(null)
const selectedRcState = ref<{ subRegionId: number; rcId: number; rcIndex: number } | null>(null)
const hoverCoordinateInfo = ref<HoverCoordinateInfo | null>(null)
const showTeleportPoints = ref(true)

let resizeObserver: ResizeObserver | null = null
let drawRaf = 0

/**
 * 规范化二维坐标，确保前两个值为有限数值。
 */
function normalizeCoordinatePair(value: unknown): [number, number] | null {
    if (!Array.isArray(value) || value.length < 2) return null
    const x = Number(value[0])
    const y = Number(value[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return [x, y]
}

/**
 * 解析路由 query 数值，兼容 string / string[] / number。
 */
function parseRouteQueryNumber(value: unknown): number | null {
    const raw = Array.isArray(value) ? value[0] : value
    if (raw === undefined || raw === null || raw === "") return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * 解析子区域中心点：优先 pos，缺失时回退 range.center。
 */
function resolveSubRegionCenter(subRegion: SubRegion): { point: [number, number]; source: "pos" | "range.center" } | null {
    const pos = normalizeCoordinatePair(subRegion.pos)
    if (pos) return { point: pos, source: "pos" }

    const rangeCenter = normalizeCoordinatePair(subRegion.range?.center)
    if (rangeCenter) return { point: rangeCenter, source: "range.center" }

    return null
}

/**
 * 解析子区域范围大小（extent）。
 */
function resolveSubRegionExtent(subRegion: SubRegion): [number, number] | null {
    const extent = normalizeCoordinatePair(subRegion.range?.extent)
    if (!extent) return null
    return [Math.abs(extent[0]), Math.abs(extent[1])]
}

/**
 * 将原始权重条目按实体 id 聚合，避免重复 id 被拆分显示。
 */
function groupRcWeightsByEntityId(rcInfo: { id: number; w: number }[]): Map<number, number> {
    const grouped = new Map<number, number>()
    for (const info of rcInfo) {
        const entityId = Number(info.id)
        const weight = Number(info.w)
        if (!Number.isFinite(entityId) || !Number.isFinite(weight) || weight <= 0) continue
        grouped.set(entityId, (grouped.get(entityId) || 0) + weight)
    }
    return grouped
}

/**
 * 构建单个 RC 的魔灵概率信息（仅 pet.data 中存在的实体归类为魔灵）。
 */
function buildRcPetRates(
    groupedWeights: Map<number, number>,
    totalWeight: number
): { petRates: RcPetRate[]; unknownRates: RcUnknownRate[] } {
    const entries = [...groupedWeights.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])
    const petRates: RcPetRate[] = []
    const unknownRates: RcUnknownRate[] = []

    for (const [entityId, weight] of entries) {
        const ratio = totalWeight > 0 ? weight / totalWeight : 0
        const pet = petMap.get(entityId)
        if (pet) {
            petRates.push({
                petId: entityId,
                petName: pet.名称,
                petQuality: Number(pet.品质 || 0),
                petIconUrl: LeveledPet.url(pet.icon),
                weight,
                totalWeight,
                ratio,
            })
            continue
        }

        unknownRates.push({
            entityId,
            weight,
            totalWeight,
            ratio,
        })
    }

    return { petRates, unknownRates }
}

/**
 * 选出 RC 中“最稀有”的魔灵：优先概率更低，概率相同则品质更高，再按 id 升序稳定排序。
 */
function pickRarestPetRate(petRates: RcPetRate[]): RcPetRate | null {
    if (petRates.length === 0) return null
    return [...petRates].sort((a, b) => a.ratio - b.ratio || b.petQuality - a.petQuality || a.petId - b.petId)[0] || null
}

/**
 * 将子区域 rc 配置投影到地图坐标，并保留点位归属（rcId/pointIndex）。
 */
function buildProjectedRcInfos(subRegion: SubRegion): ProjectedRcInfo[] {
    if (!subRegion.rc?.length) return []

    const result: ProjectedRcInfo[] = []
    subRegion.rc.forEach((randomCreator, rcIndex) => {
        const points = (randomCreator.pos || [])
            .map((rawPos, pointIndex) => {
                const normalized = normalizeCoordinatePair(rawPos)
                if (!normalized) return null
                const mapped = projectWorldToMap(normalized[0], normalized[1])
                return {
                    rcId: randomCreator.id,
                    rcIndex,
                    pointIndex,
                    worldX: normalized[0],
                    worldY: normalized[1],
                    x: mapped.x,
                    y: mapped.y,
                } satisfies ProjectedRcPoint
            })
            .filter((value): value is ProjectedRcPoint => value !== null)

        const groupedWeights = groupRcWeightsByEntityId(randomCreator.info || [])
        const totalWeight = [...groupedWeights.values()].reduce((sum, weight) => sum + weight, 0)
        const { petRates, unknownRates } = buildRcPetRates(groupedWeights, totalWeight)
        const rarestPet = pickRarestPetRate(petRates)

        result.push({
            rcId: randomCreator.id,
            rcIndex,
            count: Number(randomCreator.count || 0),
            totalWeight,
            points,
            petRates,
            unknownRates,
            rarestPet,
        })
    })

    return result
}

/**
 * 构建单个子区域的传送点，并映射到当前地图坐标。
 */
function buildProjectedTeleportPoints(subRegion: SubRegion): ProjectedTeleportPoint[] {
    if (!subRegion.tp?.length) return []

    return subRegion.tp
        .map(tp => {
            const normalized = normalizeCoordinatePair(tp.pos)
            if (!normalized) return null

            const mapped = projectWorldToMap(normalized[0], normalized[1])
            return {
                ...tp,
                worldX: normalized[0],
                worldY: normalized[1],
                x: mapped.x,
                y: mapped.y,
            } satisfies ProjectedTeleportPoint
        })
        .filter((value): value is ProjectedTeleportPoint => value !== null)
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
const currentSubRegions = computed(() => subRegionData.filter(v => v.rid === currentProfile.value.regionId))
const currentSubRegionCenters = computed(() =>
    currentSubRegions.value
        .map(resolveSubRegionCenter)
        .filter((value): value is { point: [number, number]; source: "pos" | "range.center" } => value !== null)
)

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
                  if (currentSubRegionCenters.value.length === 0) return [0, 0]
                  const total = currentSubRegionCenters.value.reduce(
                      (acc, cur) => {
                          acc.x += cur.point[0]
                          acc.y += cur.point[1]
                          return acc
                      },
                      { x: 0, y: 0 }
                  )
                  return [total.x / currentSubRegionCenters.value.length, total.y / currentSubRegionCenters.value.length]
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
 * base 图层包围盒。
 * 说明：像净界岛这类把子区域贴到主底图上的地图，点位投影应以主底图尺寸为准，不能把子区域 overlay 一起并入投影尺寸。
 */
const baseProjectionBounds = computed<MapBounds | null>(() => {
    const baseRects = allLayerDrawRects.value.filter(rect => detectLayerGroupId(rect.layer) === "base" && rect.w > 0 && rect.h > 0)
    if (baseRects.length === 0) return null

    const minX = Math.min(...baseRects.map(rect => rect.x))
    const minY = Math.min(...baseRects.map(rect => rect.y))
    const maxX = Math.max(...baseRects.map(rect => rect.x + rect.w))
    const maxY = Math.max(...baseRects.map(rect => rect.y + rect.h))
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
})

/**
 * floor 图层包围盒。仅在 floor 与完整合成边界中心发生偏移时用于投影修正。
 * 说明：龙莎要塞底图(Bg)有明显偏移，若直接用 composedBounds 会导致点位整体错位。
 */
const floorProjectionBounds = computed<MapBounds | null>(() => {
    const floorRects = allLayerDrawRects.value.filter(rect => detectLayerGroupId(rect.layer) === "floor" && rect.w > 0 && rect.h > 0)
    if (floorRects.length === 0) return null

    const minX = Math.min(...floorRects.map(rect => rect.x))
    const minY = Math.min(...floorRects.map(rect => rect.y))
    const maxX = Math.max(...floorRects.map(rect => rect.x + rect.w))
    const maxY = Math.max(...floorRects.map(rect => rect.y + rect.h))
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
})

/**
 * 是否启用 floor 投影修正。
 * 只在 “存在 Bg + floor，且二者中心明显偏离” 时启用，避免影响其它已正常的区域。
 */
const shouldUseFloorProjectionBounds = computed(() => {
    const floorBounds = floorProjectionBounds.value
    if (!floorBounds) return false

    const hasBaseLayer = allLayerDrawRects.value.some(rect => detectLayerGroupId(rect.layer) === "base" && rect.w > 0 && rect.h > 0)
    if (!hasBaseLayer) return false

    const floorCenterX = floorBounds.minX + floorBounds.width / 2
    const floorCenterY = floorBounds.minY + floorBounds.height / 2
    const composedCenterX = composedBounds.value.minX + composedBounds.value.width / 2
    const composedCenterY = composedBounds.value.minY + composedBounds.value.height / 2

    return Math.abs(floorCenterX - composedCenterX) > 1 || Math.abs(floorCenterY - composedCenterY) > 1
})

/**
 * 计算用于世界坐标投影的参考边界。
 */
const projectionBounds = computed<MapBounds>(() => {
    if (shouldUseFloorProjectionBounds.value && floorProjectionBounds.value) {
        return floorProjectionBounds.value
    }
    if (baseProjectionBounds.value) {
        return baseProjectionBounds.value
    }
    return composedBounds.value
})

/**
 * 投影参考尺寸（世界坐标 -> 贴图坐标），与 projectionBounds 对齐。
 */
const projectionSourceSize = computed(() => ({ width: projectionBounds.value.width, height: projectionBounds.value.height }))

/**
 * 把 projectionBounds 坐标映射回合成画布坐标时的偏移量。
 */
const projectionOffsetInSource = computed(() => ({
    x: projectionBounds.value.minX - composedBounds.value.minX,
    y: projectionBounds.value.minY - composedBounds.value.minY,
}))

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

    const projectionX = projectionSourceSize.value.width / 2 + rx / regionProjectionConfig.value.unitsPerPixel
    const projectionY = regionProjectionConfig.value.invertY
        ? projectionSourceSize.value.height / 2 - ry / regionProjectionConfig.value.unitsPerPixel
        : projectionSourceSize.value.height / 2 + ry / regionProjectionConfig.value.unitsPerPixel

    const sourceX = projectionX + projectionOffsetInSource.value.x
    const sourceY = projectionY + projectionOffsetInSource.value.y

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

    const projectionX = sourceX - projectionOffsetInSource.value.x
    const projectionY = sourceY - projectionOffsetInSource.value.y

    const rx = (projectionX - projectionSourceSize.value.width / 2) * regionProjectionConfig.value.unitsPerPixel
    const ry = regionProjectionConfig.value.invertY
        ? -(projectionY - projectionSourceSize.value.height / 2) * regionProjectionConfig.value.unitsPerPixel
        : (projectionY - projectionSourceSize.value.height / 2) * regionProjectionConfig.value.unitsPerPixel

    const [dx, dy] = rotateXY(rx, ry, -regionProjectionConfig.value.pointRotationDeg)

    return {
        x: regionProjectionConfig.value.center[0] + dx,
        y: regionProjectionConfig.value.center[1] + dy,
    }
}

/**
 * 根据 range.center + extent 生成世界坐标范围框，并投影到地图坐标。
 */
function buildProjectedRangeOutline(center: [number, number], extent: [number, number]): MapPoint[] {
    if (extent[0] <= 0 || extent[1] <= 0) return []

    const corners: [number, number][] = [
        [center[0] - extent[0], center[1] - extent[1]],
        [center[0] + extent[0], center[1] - extent[1]],
        [center[0] + extent[0], center[1] + extent[1]],
        [center[0] - extent[0], center[1] + extent[1]],
    ]

    return corners.map(([worldX, worldY]) => {
        const projected = projectWorldToMap(worldX, worldY)
        return { x: projected.x, y: projected.y }
    })
}

const projectedSubRegions = computed<ProjectedSubRegionPoint[]>(() => {
    const result: ProjectedSubRegionPoint[] = []

    for (const subRegion of currentSubRegions.value) {
        const center = resolveSubRegionCenter(subRegion)
        if (!center) continue

        const [worldX, worldY] = center.point
        const mapped = projectWorldToMap(worldX, worldY)
        const extent = resolveSubRegionExtent(subRegion) || [0, 0]
        const rangeCenter = normalizeCoordinatePair(subRegion.range?.center)
        const rangeOutline = rangeCenter ? buildProjectedRangeOutline(rangeCenter, extent) : []
        const rcInfos = buildProjectedRcInfos(subRegion)
        const rcPointCount = rcInfos.reduce((sum, rcInfo) => sum + rcInfo.points.length, 0)
        const tpPoints = buildProjectedTeleportPoints(subRegion)

        result.push({
            id: subRegion.id,
            name: subRegion.name,
            worldX,
            worldY,
            mapX: mapped.x,
            mapY: mapped.y,
            centerSource: center.source,
            rangeExtentX: extent[0],
            rangeExtentY: extent[1],
            rangeOutline,
            rcInfos,
            rcPointCount,
            tpPoints,
            tpPointCount: tpPoints.length,
        })
    }

    return result
})
const totalTeleportPointCount = computed(() => projectedSubRegions.value.reduce((sum, subRegion) => sum + subRegion.tpPointCount, 0))

const selectedSubRegion = computed(() => {
    if (selectedSubRegionId.value === null) return null
    return projectedSubRegions.value.find(item => item.id === selectedSubRegionId.value) ?? null
})
const hoveredSubRegion = computed(() => {
    if (hoveredSubRegionId.value === null) return null
    return projectedSubRegions.value.find(item => item.id === hoveredSubRegionId.value) ?? null
})
const selectedRcInfo = computed(() => {
    const state = selectedRcState.value
    if (!state) return null
    const targetSubRegion = projectedSubRegions.value.find(item => item.id === state.subRegionId)
    if (!targetSubRegion) return null
    return targetSubRegion.rcInfos.find(rc => rc.rcId === state.rcId && rc.rcIndex === state.rcIndex) || null
})
const mapLocalRouteTarget = computed<MapLocalRouteTarget>(() => ({
    regionId: parseRouteQueryNumber(route.query.regionId),
    subRegionId: parseRouteQueryNumber(route.query.subRegionId),
    rcId: parseRouteQueryNumber(route.query.rcId),
    rcIndex: parseRouteQueryNumber(route.query.rcIndex),
}))
const mapLocalRouteTargetToken = computed(() =>
    [mapLocalRouteTarget.value.regionId, mapLocalRouteTarget.value.subRegionId, mapLocalRouteTarget.value.rcId, mapLocalRouteTarget.value.rcIndex]
        .map(value => (value === null ? "" : String(value)))
        .join("|")
)
const consumedRouteTargetToken = ref("")

/**
 * 异步加载单个图层图片（带全局 Promise 缓存，避免重复下载）。
 */
const imagePromiseCache = new Map<string, Promise<HTMLImageElement>>()
const rcIconImageCache = new Map<string, HTMLImageElement>()
const rcIconPromiseCache = new Map<string, Promise<HTMLImageElement>>()
const tpIconImageCache = new Map<string, HTMLImageElement>()
const tpIconPromiseCache = new Map<string, Promise<HTMLImageElement>>()
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
 * 确保 RC 头像已开始加载，若已就绪则返回图像对象，否则返回 null 并等待下一帧重绘。
 */
function ensureRcIconImageLoaded(iconUrl: string): HTMLImageElement | null {
    if (!iconUrl) return null
    const cached = rcIconImageCache.get(iconUrl)
    if (cached) return cached

    if (!rcIconPromiseCache.has(iconUrl)) {
        const promise = new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image()
            image.onload = () => resolve(image)
            image.onerror = () => reject(new Error(`加载 RC 头像失败: ${iconUrl}`))
            image.src = iconUrl
        })
        rcIconPromiseCache.set(iconUrl, promise)
        promise
            .then(image => {
                rcIconImageCache.set(iconUrl, image)
                requestDraw()
            })
            .catch(() => {
                rcIconPromiseCache.delete(iconUrl)
            })
    }

    return null
}

/**
 * 加载传送点图标，若已就绪则返回图像对象，否则返回 null 并等待下一帧重绘。
 */
function ensureTpIconImageLoaded(iconUrl: string): HTMLImageElement | null {
    if (!iconUrl) return null
    const cached = tpIconImageCache.get(iconUrl)
    if (cached) return cached

    if (!tpIconPromiseCache.has(iconUrl)) {
        const promise = new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image()
            image.onload = () => resolve(image)
            image.onerror = () => reject(new Error(`加载 TP 图标失败: ${iconUrl}`))
            image.src = iconUrl
        })
        tpIconPromiseCache.set(iconUrl, promise)
        promise
            .then(image => {
                tpIconImageCache.set(iconUrl, image)
                requestDraw()
            })
            .catch(() => {
                tpIconPromiseCache.delete(iconUrl)
            })
    }

    return null
}

/**
 * 将传送点 icon 映射到本地静态资源路径。
 */
function resolveTeleportPointIconUrl(icon: string): string {
    return icon ? `/imgs/tp/${icon}.webp` : ""
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
    selectedRcState.value = null
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
 * 选中指定子区域内的 RC，用于展示详细权重与点位归属。
 */
function selectRc(subRegionId: number, rcId: number, rcIndex: number) {
    selectedSubRegionId.value = subRegionId
    selectedRcState.value = { subRegionId, rcId, rcIndex }
    requestDraw()
}

/**
 * 按路由 query 自动定位到区域/子区域/RC。
 */
function applyRouteTargetSelection() {
    const target = mapLocalRouteTarget.value
    if (target.regionId === null && target.subRegionId === null && target.rcId === null) return
    const token = mapLocalRouteTargetToken.value
    if (consumedRouteTargetToken.value === token) return

    if (target.regionId !== null && target.regionId !== selectedRegionId.value) {
        const hasRegion = mapLocalProfiles.some(profile => profile.regionId === target.regionId)
        if (hasRegion) {
            selectedRegionId.value = target.regionId
        } else {
            consumedRouteTargetToken.value = token
        }
        return
    }

    if (target.subRegionId === null) {
        consumedRouteTargetToken.value = token
        return
    }
    const subRegion = projectedSubRegions.value.find(item => item.id === target.subRegionId)
    if (!subRegion) {
        consumedRouteTargetToken.value = token
        return
    }

    if (selectedSubRegionId.value !== subRegion.id) {
        focusSubRegion(subRegion.id)
    }

    if (target.rcId === null) {
        consumedRouteTargetToken.value = token
        return
    }
    const targetRc =
        subRegion.rcInfos.find(rc => rc.rcId === target.rcId && (target.rcIndex === null || rc.rcIndex === target.rcIndex)) || null
    if (!targetRc) {
        consumedRouteTargetToken.value = token
        return
    }

    const current = selectedRcState.value
    if (!current || current.subRegionId !== subRegion.id || current.rcId !== targetRc.rcId || current.rcIndex !== targetRc.rcIndex) {
        selectedRcState.value = { subRegionId: subRegion.id, rcId: targetRc.rcId, rcIndex: targetRc.rcIndex }
        requestDraw()
    }
    consumedRouteTargetToken.value = token
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
 * 按点击位置命中当前高亮子区域中的 RC 点位。
 */
function pickRcPointByScreenPosition(screenX: number, screenY: number): { subRegionId: number; rcInfo: ProjectedRcInfo } | null {
    const mapPoint = screenToMap(screenX, screenY)
    const threshold = 16 / zoom.value

    let nearest: { subRegionId: number; rcInfo: ProjectedRcInfo } | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const subRegion of projectedSubRegions.value) {
        for (const rcInfo of subRegion.rcInfos) {
            for (const point of rcInfo.points) {
                const distance = Math.hypot(point.x - mapPoint.x, point.y - mapPoint.y)
                if (distance <= threshold && distance < nearestDistance) {
                    nearestDistance = distance
                    nearest = { subRegionId: subRegion.id, rcInfo }
                }
            }
        }
    }

    return nearest
}

/**
 * 按点击位置命中传送点，并返回其所属子区域。
 */
function pickTeleportPointByScreenPosition(screenX: number, screenY: number): { subRegionId: number; tpPoint: ProjectedTeleportPoint } | null {
    const mapPoint = screenToMap(screenX, screenY)
    const threshold = 18 / zoom.value

    let nearest: { subRegionId: number; tpPoint: ProjectedTeleportPoint } | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const subRegion of projectedSubRegions.value) {
        for (const tpPoint of subRegion.tpPoints) {
            const distance = Math.hypot(tpPoint.x - mapPoint.x, tpPoint.y - mapPoint.y)
            if (distance <= threshold && distance < nearestDistance) {
                nearestDistance = distance
                nearest = { subRegionId: subRegion.id, tpPoint }
            }
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

    const drawX = rect.x + (layer.offset[0] || 0) - composedBounds.value.minX
    const drawY = rect.y + (layer.offset[1] || 0) - composedBounds.value.minY
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
 * 绘制 hover 子区域的范围框（虚线）。
 */
function drawHoveredRangeOutline(ctx: CanvasRenderingContext2D) {
    const hovered = hoveredSubRegion.value
    if (!hovered || hovered.rangeOutline.length < 4) return

    ctx.save()
    ctx.beginPath()
    hovered.rangeOutline.forEach((point, index) => {
        if (index === 0) {
            ctx.moveTo(point.x, point.y)
            return
        }
        ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
    ctx.lineWidth = 2 / zoom.value
    ctx.strokeStyle = "rgba(255, 214, 102, 0.95)"
    ctx.fillStyle = "rgba(255, 214, 102, 0.12)"
    ctx.setLineDash([8 / zoom.value, 6 / zoom.value])
    ctx.fill()
    ctx.stroke()
    ctx.restore()
}

/**
 * 绘制高亮子区域（hover 优先，其次 selected）的 rc 刷新点。
 */
function drawHighlightedRcPoints(ctx: CanvasRenderingContext2D) {
    const highlightedSubRegionId = hoveredSubRegion.value?.id ?? selectedSubRegion.value?.id ?? null
    if (projectedSubRegions.value.length === 0) return

    ctx.save()
    const normalRadius = 3 / zoom.value
    const baseFontPx = 10 / zoom.value
    const labelPaddingX = 2 / zoom.value
    const labelPaddingY = 1 / zoom.value
    const labelHeight = 13 / zoom.value
    const labelOffsetX = 3 / zoom.value
    const labelOffsetY = 2 / zoom.value

    ctx.textBaseline = "top"
    ctx.font = `${baseFontPx}px sans-serif`

    for (const subRegion of projectedSubRegions.value) {
        if (subRegion.rcInfos.length === 0) continue
        const isSubRegionHighlighted = highlightedSubRegionId !== null && subRegion.id === highlightedSubRegionId
        const unselectedSubRegionAlpha = highlightedSubRegionId === null ? 0.55 : 0.28

        for (const rcInfo of subRegion.rcInfos) {
            const isActiveRc =
                selectedRcState.value?.subRegionId === subRegion.id &&
                selectedRcState.value?.rcId === rcInfo.rcId &&
                selectedRcState.value?.rcIndex === rcInfo.rcIndex
            const displayAlpha = isSubRegionHighlighted ? 1 : isActiveRc ? 1 : unselectedSubRegionAlpha
            const showLabel = isActiveRc || isSubRegionHighlighted

            const fillColor = isActiveRc ? "rgba(255, 90, 90, 0.96)" : "rgba(255, 178, 41, 0.95)"
            const strokeColor = isActiveRc ? "rgba(255, 255, 255, 0.96)" : "rgba(0, 0, 0, 0.72)"
            const radius = normalRadius
            const iconSize = 21 / zoom.value
            const iconImage = rcInfo.rarestPet ? ensureRcIconImageLoaded(rcInfo.rarestPet.petIconUrl) : null

            for (const point of rcInfo.points) {
                ctx.save()
                ctx.globalAlpha = displayAlpha
                if (iconImage) {
                    ctx.save()
                    ctx.beginPath()
                    ctx.arc(point.x, point.y, iconSize / 2, 0, Math.PI * 2)
                    ctx.clip()
                    ctx.drawImage(iconImage, point.x - iconSize / 2, point.y - iconSize / 2, iconSize, iconSize)
                    ctx.restore()
                } else {
                    ctx.beginPath()
                    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
                    ctx.fillStyle = fillColor
                    ctx.fill()
                }

                ctx.beginPath()
                ctx.arc(point.x, point.y, iconImage ? iconSize / 2 : radius, 0, Math.PI * 2)
                ctx.lineWidth = (isActiveRc ? 1.6 : 1.1) / zoom.value
                ctx.strokeStyle = strokeColor
                ctx.stroke()

                if (showLabel) {
                    const tag = formatRcLabel(getRcDisplayName(rcInfo))
                    const textWidth = ctx.measureText(tag).width
                    const labelX = point.x + radius + labelOffsetX
                    const labelY = point.y - radius - labelOffsetY
                    ctx.fillStyle = "rgba(0, 0, 0, 0.66)"
                    ctx.fillRect(labelX - labelPaddingX, labelY - labelPaddingY, textWidth + labelPaddingX * 2, labelHeight)
                    ctx.fillStyle = "rgba(255, 255, 255, 0.95)"
                    ctx.fillText(tag, labelX, labelY)
                }
                ctx.restore()
            }
        }
    }
    ctx.restore()
}

/**
 * 绘制子区域中的传送点。
 */
function drawTeleportPoints(ctx: CanvasRenderingContext2D) {
    if (projectedSubRegions.value.length === 0) return

    ctx.save()
    const normalRadius = 5 / zoom.value
    const iconSize = 28 / zoom.value
    const labelPaddingX = 2 / zoom.value
    const labelPaddingY = 1 / zoom.value
    const labelHeight = 13 / zoom.value
    const labelOffsetX = 3 / zoom.value
    const labelOffsetY = 2 / zoom.value

    ctx.textBaseline = "top"
    ctx.font = `${10 / zoom.value}px sans-serif`

    for (const subRegion of projectedSubRegions.value) {
        if (subRegion.tpPoints.length === 0) continue

        for (const tpPoint of subRegion.tpPoints) {
            const iconUrl = resolveTeleportPointIconUrl(tpPoint.icon)
            const iconImage = ensureTpIconImageLoaded(iconUrl)

            ctx.save()
            ctx.globalAlpha = 1
            if (iconImage) {
                ctx.drawImage(iconImage, tpPoint.x - iconSize / 2, tpPoint.y - iconSize / 2, iconSize, iconSize)
            } else {
                ctx.beginPath()
                ctx.arc(tpPoint.x, tpPoint.y, normalRadius, 0, Math.PI * 2)
                ctx.fillStyle = "rgba(45, 212, 191, 0.95)"
                ctx.fill()
            }

            const tag = formatSubRegionLabel(tpPoint.name)
            const textWidth = ctx.measureText(tag).width
            const labelX = tpPoint.x + normalRadius + labelOffsetX
            const labelY = tpPoint.y - normalRadius - labelOffsetY
            ctx.fillStyle = "rgba(0, 0, 0, 0.66)"
            ctx.fillRect(labelX - labelPaddingX, labelY - labelPaddingY, textWidth + labelPaddingX * 2, labelHeight)
            ctx.fillStyle = "rgba(255, 255, 255, 0.95)"
            ctx.fillText(tag, labelX, labelY)
            ctx.restore()
        }
    }
    ctx.restore()
}

/**
 * 地图标签名称截断，避免长名称遮挡大量区域。
 */
function formatSubRegionLabel(name: string): string {
    const maxLength = 10
    return name.length > maxLength ? `${name.slice(0, maxLength)}…` : name
}

/**
 * RC 显示名称：优先最稀有魔灵名，缺失时回退 RC 编号。
 */
function getRcDisplayName(rcInfo: ProjectedRcInfo): string {
    return rcInfo.rarestPet?.petName || `RC${rcInfo.rcId}`
}

/**
 * RC 地图标签截断，避免长名称遮挡。
 */
function formatRcLabel(name: string): string {
    const maxLength = 8
    return name.length > maxLength ? `${name.slice(0, maxLength)}…` : name
}

/**
 * 绘制 subregion 中心点位与标签。
 */
function drawSubRegionPoints(ctx: CanvasRenderingContext2D) {
    drawHoveredRangeOutline(ctx)
    drawHighlightedRcPoints(ctx)
    if (showTeleportPoints.value) {
        drawTeleportPoints(ctx)
    }

    const baseFontPx = 12 / zoom.value
    const labelPaddingX = 3 / zoom.value
    const labelPaddingY = 1 / zoom.value
    const labelHeight = 16 / zoom.value
    const labelOffsetX = 4 / zoom.value
    const labelOffsetY = 2 / zoom.value

    ctx.font = `${baseFontPx}px sans-serif`
    ctx.textBaseline = "top"
    projectedSubRegions.value.forEach(point => {
        const isSelected = point.id === selectedSubRegionId.value
        const isHovered = point.id === hoveredSubRegionId.value
        const radius = (isSelected ? 7 : isHovered ? 6 : 5) / zoom.value

        ctx.beginPath()
        ctx.arc(point.mapX, point.mapY, radius, 0, Math.PI * 2)
        ctx.fillStyle = isSelected ? "rgba(255, 70, 70, 0.95)" : isHovered ? "rgba(255, 214, 102, 0.95)" : "rgba(53, 132, 255, 0.92)"
        ctx.fill()

        ctx.lineWidth = (isSelected || isHovered ? 2 : 1) / zoom.value
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)"
        ctx.stroke()

        const text = formatSubRegionLabel(point.name)
        const textWidth = ctx.measureText(text).width
        const labelX = point.mapX + radius + labelOffsetX
        const labelY = point.mapY - radius - labelOffsetY
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)"
        ctx.fillRect(labelX - labelPaddingX, labelY - labelPaddingY, textWidth + labelPaddingX * 2, labelHeight)
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)"
        ctx.fillText(text, labelX, labelY + 1 / zoom.value)
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
 * 根据鼠标位置更新当前 hover 的子区域点位。
 */
function updateHoveredSubRegionByPointerEvent(event: PointerEvent) {
    const canvas = canvasRef.value
    if (!canvas) return
    if (isDragging.value) {
        hoveredSubRegionId.value = null
        return
    }

    const rect = canvas.getBoundingClientRect()
    const rcHit = pickRcPointByScreenPosition(event.clientX - rect.left, event.clientY - rect.top)
    if (rcHit) {
        hoveredSubRegionId.value = rcHit.subRegionId
        return
    }
    const tpHit = pickTeleportPointByScreenPosition(event.clientX - rect.left, event.clientY - rect.top)
    if (tpHit) {
        hoveredSubRegionId.value = tpHit.subRegionId
        return
    }
    const hit = pickSubRegionByScreenPosition(event.clientX - rect.left, event.clientY - rect.top)
    hoveredSubRegionId.value = hit ? hit.id : null
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
    updateHoveredSubRegionByPointerEvent(event)
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
 * 鼠标离开画布时清理 hover 状态。
 */
function handlePointerLeave() {
    hoverCoordinateInfo.value = null
    hoveredSubRegionId.value = null
    requestDraw()
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
    const rcHit = pickRcPointByScreenPosition(event.clientX - rect.left, event.clientY - rect.top)
    if (rcHit) {
        selectRc(rcHit.subRegionId, rcHit.rcInfo.rcId, rcHit.rcInfo.rcIndex)
        return
    }
    const tpHit = pickTeleportPointByScreenPosition(event.clientX - rect.left, event.clientY - rect.top)
    if (tpHit) {
        selectedSubRegionId.value = tpHit.subRegionId
        selectedRcState.value = null
        requestDraw()
        return
    }
    const hit = pickSubRegionByScreenPosition(event.clientX - rect.left, event.clientY - rect.top)
    selectedSubRegionId.value = hit ? hit.id : null
    selectedRcState.value = null
    requestDraw()
}

watch(
    () => currentProfile.value.regionId,
    async () => {
        initializeActiveLayers(currentProfile.value)
        selectedSubRegionId.value = null
        hoveredSubRegionId.value = null
        selectedRcState.value = null
        hoverCoordinateInfo.value = null
        await loadCurrentProfileImages()
        await nextTick()
        resetView()
        applyRouteTargetSelection()
    },
    { immediate: true }
)

watch(
    () => [
        mapLocalRouteTarget.value.regionId ?? -1,
        mapLocalRouteTarget.value.subRegionId ?? -1,
        mapLocalRouteTarget.value.rcId ?? -1,
        mapLocalRouteTarget.value.rcIndex ?? -1,
        currentProfile.value.regionId,
        projectedSubRegions.value.length,
    ],
    () => applyRouteTargetSelection(),
    { immediate: true }
)

watch(
    () => [
        activeLayers.value.map(layer => layer.id).join("|"),
        showTeleportPoints.value ? 1 : 0,
        projectedSubRegions.value.length,
        selectedSubRegionId.value ?? -1,
        hoveredSubRegionId.value ?? -1,
        selectedRcState.value?.subRegionId ?? -1,
        selectedRcState.value?.rcId ?? -1,
        selectedRcState.value?.rcIndex ?? -1,
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
                <label class="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-0.5 hover:bg-base-200">
                    <input v-model="showTeleportPoints" type="checkbox" class="checkbox checkbox-xs" />
                    <span>显示TP点</span>
                </label>
            </div>

            <div class="space-y-2">
                <div class="text-xs opacity-70">子区域</div>
                <div class="rounded-md border border-base-300 bg-base-100/70 max-h-[40vh] overflow-y-auto">
                    <button
                        v-for="point in projectedSubRegions"
                        :key="point.id"
                        class="w-full text-left p-2 border-b last:border-b-0 border-base-300 hover:bg-base-200 transition-colors"
                        :class="{ 'bg-primary/15': selectedSubRegionId === point.id, 'bg-warning/15': hoveredSubRegionId === point.id }"
                        @mouseenter="hoveredSubRegionId = point.id"
                        @mouseleave="hoveredSubRegionId = null"
                        @click="focusSubRegion(point.id)"
                    >
                        <div class="font-medium text-sm">{{ point.name }}</div>
                    </button>
                    <div v-if="projectedSubRegions.length === 0" class="p-3 text-sm opacity-70">当前区域没有可显示的 subregion 坐标</div>
                </div>
            </div>

            <div v-if="selectedSubRegion" class="mt-auto rounded-md border border-base-300 bg-base-100/92 p-3 text-sm shadow">
                <div class="font-medium">{{ selectedSubRegion.name }}</div>

                <div class="mt-2 border-t border-base-300/80 pt-2">
                    <div class="text-xs opacity-70 mb-1">RC 列表（点击可查看详情）</div>
                    <div class="max-h-28 overflow-y-auto flex flex-wrap gap-1">
                        <button
                            v-for="rcInfo in selectedSubRegion.rcInfos"
                            :key="`${selectedSubRegion.id}-${rcInfo.rcId}-${rcInfo.rcIndex}`"
                            class="rounded border border-base-300 px-2 py-1 text-xs hover:bg-base-200 transition-colors"
                            :class="{
                                'border-primary/70 bg-primary/10':
                                    selectedRcState?.subRegionId === selectedSubRegion.id &&
                                    selectedRcState?.rcId === rcInfo.rcId &&
                                    selectedRcState?.rcIndex === rcInfo.rcIndex,
                            }"
                            @click="selectRc(selectedSubRegion.id, rcInfo.rcId, rcInfo.rcIndex)"
                        >
                            RC {{ rcInfo.rcId }}
                        </button>
                        <div v-if="selectedSubRegion.rcInfos.length === 0" class="text-xs opacity-70 w-full">当前子区域无 RC 配置</div>
                    </div>
                </div>

                <div v-if="selectedRcInfo" class="mt-2 rounded border border-base-300 bg-base-100/85 p-2 text-xs space-y-1">
                    <div class="font-medium">RC {{ selectedRcInfo.rcId }} 详情</div>
                    <div class="opacity-70">
                        刷新数量 {{ selectedRcInfo.count }} | 总权重 {{ selectedRcInfo.totalWeight }} | 点位
                        {{ selectedRcInfo.points.length }}
                    </div>
                    <div v-if="selectedRcInfo.rarestPet" class="opacity-70">
                        最稀有魔灵: {{ selectedRcInfo.rarestPet.petName }} ({{ (selectedRcInfo.rarestPet.ratio * 100).toFixed(2) }}%)
                    </div>
                    <div class="opacity-70 pt-1">魔灵概率：</div>
                    <div class="space-y-0.5">
                        <div v-for="petRate in selectedRcInfo.petRates" :key="`${selectedRcInfo.rcId}-${petRate.petId}`" class="opacity-90">
                            {{ petRate.petName }}: {{ petRate.weight }}/{{ petRate.totalWeight }} ({{ (petRate.ratio * 100).toFixed(2) }}%)
                        </div>
                        <div v-if="selectedRcInfo.petRates.length === 0" class="opacity-70">无 pet.data 可识别魔灵</div>
                    </div>
                    <div v-if="selectedRcInfo.unknownRates.length > 0" class="pt-1">
                        <div class="opacity-70">未识别实体：</div>
                        <div
                            v-for="unknownRate in selectedRcInfo.unknownRates"
                            :key="`${selectedRcInfo.rcId}-${unknownRate.entityId}`"
                            class="opacity-80"
                        >
                            ID {{ unknownRate.entityId }}: {{ unknownRate.weight }}/{{ unknownRate.totalWeight }} ({{
                                (unknownRate.ratio * 100).toFixed(2)
                            }}%)
                        </div>
                    </div>
                </div>

                <div v-if="selectedSubRegion.tpPoints.length > 0" class="mt-2 rounded border border-base-300 bg-base-100/85 p-2 text-xs space-y-1">
                    <div class="font-medium">TP 点位</div>
                    <div class="grid gap-1">
                        <div v-for="tpPoint in selectedSubRegion.tpPoints" :key="tpPoint.id" class="flex items-center gap-2 opacity-90">
                            <img :src="resolveTeleportPointIconUrl(tpPoint.icon)" :alt="tpPoint.name" class="size-4 shrink-0" />
                            <span class="min-w-0 truncate">{{ tpPoint.name }}</span>
                        </div>
                    </div>
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
                @pointerleave="handlePointerLeave"
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
                    缩放 {{ (zoom * 100).toFixed(0) }}% | 图层 {{ activeLayers.length }} | 点位 {{ projectedSubRegions.length }} | TP
                    {{ totalTeleportPointCount }}
                </div>
                <div v-if="hoverCoordinateInfo" class="rounded-md border border-base-300 bg-base-100/90 px-3 py-2 text-xs leading-5 shadow">
                    <div>Map: {{ hoverCoordinateInfo.mapX.toFixed(2) }}, {{ hoverCoordinateInfo.mapY.toFixed(2) }}</div>
                    <div>World: {{ hoverCoordinateInfo.worldX.toFixed(2) }}, {{ hoverCoordinateInfo.worldY.toFixed(2) }}</div>
                </div>
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
