<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from "vue"
import {
    type BackpackPuzzleItem,
    type BackpackPuzzleLevel,
    backpackPuzzleItems,
    backpackPuzzleLevels,
    backpackPuzzleSolutionPresets,
} from "@/data/d"
import { getRewardDetails } from "@/utils/reward-utils"

const props = defineProps<{
    eventId: number
}>()

type GridPoint = -1 | 0 | 1 | 2
type Cell = {
    x: number
    y: number
    type: GridPoint
}
type Placement = {
    item: BackpackPuzzleItem
    x: number
    y: number
    rotationIndex: number
    rotation: number[][]
    score: number
    covered: number
    cellCount: number
    cells: Cell[]
    source: "manual" | "solver"
    itemIndex: number
    representedItemIndexes: number[]
    stackCount: number
    attachedAmmoCount: number
}
type SolverResult = {
    placements: Placement[]
    score: number
}
type ManualPlacement = {
    itemIndex: number
    x: number
    y: number
    rotationIndex: number
}
type ManualAmmoAssignment = {
    ammoItemIndex: number
    gunItemIndex: number
}
type WorkerPlacement = {
    itemIndex: number
    x: number
    y: number
    rotationIndex: number
    score: number
    covered: number
    cellCount: number
    representedItemIndexes: number[]
    stackCount: number
    attachedAmmoCount: number
}
type WorkerRequest = {
    id: number
    level: BackpackPuzzleLevel
    items: BackpackPuzzleItem[]
    lockedPlacements: ManualPlacement[]
    excludedItemIndexes: number[]
}
type WorkerResponse = {
    id: number
    placements: WorkerPlacement[]
    score: number
}
type NormalizedItemEntry = {
    key: string
    item: BackpackPuzzleItem
    itemIndexes: number[]
    quantity: number
    stackable: boolean
}
type DraggingState = {
    itemIndex: number
    pointerId: number
    rotationIndex: number
    pointerOffsetX: number
    pointerOffsetY: number
    previewX: number
    previewY: number
    boardX: number | null
    boardY: number | null
    source: "pool" | "manual" | "solver"
    originX?: number
    originY?: number
    boardWidth: number
    boardHeight: number
    previewCellSize: number
    valid: boolean
    hiddenSolverPlacement?: Placement | null
}

const PREVIEW_ITEM_CELL_PX = 32

const cellClassMap: Record<GridPoint, string> = {
    [-1]: "bg-base-300/30",
    0: "bg-base-200/20",
    1: "bg-base-200",
    2: "bg-primary/20",
}

const levels = computed(() => backpackPuzzleLevels.filter(level => level.eventId === props.eventId))
const selectedLevelId = ref(levels.value[0]?.id ?? 0)
const selectedLevel = computed(() => levels.value.find(level => level.id === selectedLevelId.value) || null)
const levelItems = computed(() =>
    (selectedLevel.value?.levelInitialItem ?? [])
        .map(id => backpackPuzzleItems.find(item => item.id === id))
        .filter((item): item is BackpackPuzzleItem => Boolean(item))
)
const normalizedItems = computed<NormalizedItemEntry[]>(() => {
    const map = new Map<string, NormalizedItemEntry>()
    levelItems.value.forEach((item, itemIndex) => {
        const stackable = (item.maxStack ?? 1) > 1
        const key = stackable ? `stack:${item.id}` : `single:${itemIndex}`
        const existing = map.get(key)
        if (existing) {
            existing.itemIndexes.push(itemIndex)
            existing.quantity += 1
        } else {
            map.set(key, {
                key,
                item,
                itemIndexes: [itemIndex],
                quantity: 1,
                stackable,
            })
        }
    })
    return [...map.values()]
})
const selectedLevelBoard = computed(() =>
    (selectedLevel.value?.gridDistribute ?? []).map(row =>
        row.map(cell => {
            if (cell === 2) {
                return 2 as GridPoint
            }
            if (cell === 1) {
                return 1 as GridPoint
            }
            if (cell === -1) {
                return -1 as GridPoint
            }
            return 0 as GridPoint
        })
    )
)
const boardWidth = computed(() => selectedLevelBoard.value[0]?.length ?? 0)
const boardHeight = computed(() => selectedLevelBoard.value.length)
const rewardRows = computed(() =>
    (selectedLevel.value?.targetReward ?? []).map((rewardId, index) => ({
        rewardId,
        score: selectedLevel.value?.targetScore?.[index] ?? 0,
        reward: getRewardDetails(rewardId),
    }))
)

const boardRef = ref<HTMLElement | null>(null)
const manualPlacements = ref<ManualPlacement[]>([])
const manualAmmoAssignments = ref<ManualAmmoAssignment[]>([])
const solverPlacements = ref<Placement[]>([])
const solverScore = ref(0)
const isSolving = ref(false)
const needsSolve = ref(true)
const draggingState = ref<DraggingState | null>(null)
const itemRotationDrafts = ref<Record<number, number>>({})
const hoveredPlacementKey = ref<string | null>(null)
const selectedPlacementKey = ref<string | null>(null)
const selectedItemIndex = ref<number | null>(null)
const excludedSolverItemIndexes = ref<number[]>([])

let worker: Worker | null = null
let workerRequestId = 0

const hasManualOverrides = computed(
    () => manualPlacements.value.length > 0 || manualAmmoAssignments.value.length > 0 || excludedSolverItemIndexes.value.length > 0
)

const itemUsageState = computed(() => {
    const usageSet = new Set<number>()
    bestSolution.value.placements.forEach(placement => {
        placement.representedItemIndexes.forEach(itemIndex => {
            usageSet.add(itemIndex)
        })
    })
    const manualSet = new Set(getBoardPlacementList().flatMap(placement => placement.representedItemIndexes))
    return normalizedItems.value.map(entry => ({
        ...entry,
        usedCount: entry.itemIndexes.filter(itemIndex => usageSet.has(itemIndex)).length,
        usedByManual: entry.itemIndexes.some(itemIndex => manualSet.has(itemIndex)),
        usedBySolver: entry.itemIndexes.some(itemIndex => usageSet.has(itemIndex) && !manualSet.has(itemIndex)),
        available:
            entry.itemIndexes.some(itemIndex => !usageSet.has(itemIndex)) || entry.itemIndexes.some(itemIndex => manualSet.has(itemIndex)),
    }))
})

const combinedPlacements = computed(() => {
    const manual = getBoardPlacementList()
    return [...solverPlacements.value, ...manual]
})

const combinedScore = computed(() => computeBoardScore(combinedPlacements.value))

const bestSolution = computed<SolverResult>(() => ({
    placements: combinedPlacements.value,
    score: combinedScore.value,
}))

watch(
    levels,
    nextLevels => {
        if (!nextLevels.length) {
            selectedLevelId.value = 0
            return
        }

        if (!nextLevels.some(level => level.id === selectedLevelId.value)) {
            selectedLevelId.value = nextLevels[0]?.id ?? 0
        }
    },
    { immediate: true }
)

watch(
    () => selectedLevelId.value,
    () => {
        manualPlacements.value = []
        manualAmmoAssignments.value = []
        solverPlacements.value = []
        solverScore.value = 0
        needsSolve.value = true
        draggingState.value = null
        itemRotationDrafts.value = {}
        excludedSolverItemIndexes.value = []
        hoveredPlacementKey.value = null
        selectedPlacementKey.value = null
        selectedItemIndex.value = null
    }
)

/**
 * 手动触发一次自动求解。
 */
async function solveCurrentBoard() {
    const level = selectedLevel.value
    const items = levelItems.value
    if (!level) {
        solverPlacements.value = []
        solverScore.value = 0
        needsSolve.value = false
        return
    }

    if (!hasManualOverrides.value) {
        const preset = backpackPuzzleSolutionPresets[level.id]
        if (preset) {
            solverPlacements.value = hydrateWorkerPlacements(buildWorkerPlacementsFromPreset(preset.placements))
            solverScore.value = preset.score
            needsSolve.value = false
            return
        }
    }

    const requestId = ++workerRequestId
    isSolving.value = true
    try {
        const result = await solveBestSolutionByWorker({
            id: requestId,
            level,
            items,
            lockedPlacements: manualPlacements.value.map(placement => ({ ...placement })),
            excludedItemIndexes: [...excludedSolverItemIndexes.value, ...manualAmmoAssignments.value.map(entry => entry.ammoItemIndex)],
        })
        if (requestId !== workerRequestId) {
            return
        }
        solverPlacements.value = result.placements
        solverScore.value = result.score
        needsSolve.value = false
    } catch (error) {
        if (requestId !== workerRequestId) {
            return
        }
        solverPlacements.value = []
        solverScore.value = 0
        console.error("背包拼图求解失败", error)
    } finally {
        if (requestId === workerRequestId) {
            isSolving.value = false
        }
    }
}

watch(
    [selectedLevel, levelItems, manualPlacements, manualAmmoAssignments, excludedSolverItemIndexes],
    () => {
        needsSolve.value = true
    },
    { deep: true }
)

watch(
    [selectedLevelId, hasManualOverrides],
    () => {
        if (!selectedLevel.value || hasManualOverrides.value) {
            return
        }
        void solveCurrentBoard()
    },
    { immediate: true }
)

onBeforeUnmount(() => {
    worker?.terminate()
    worker = null
    detachPointerListeners()
})

/**
 * 初始化求解 Worker。
 * @returns Worker 实例
 */
function initWorker() {
    if (!worker) {
        worker = new Worker(new URL("./BackpackPuzzle.worker.ts", import.meta.url), {
            type: "module",
        })
    }
    return worker
}

/**
 * 使用 Worker 异步求解自动摆放结果。
 * @param request 求解请求
 * @returns 自动摆放结果
 */
function solveBestSolutionByWorker(request: WorkerRequest): Promise<SolverResult> {
    const currentWorker = initWorker()
    return new Promise((resolve, reject) => {
        /**
         * 处理 Worker 返回结果。
         * @param event 消息事件
         */
        const handleMessage = (event: MessageEvent<WorkerResponse>) => {
            if (event.data.id !== request.id) {
                return
            }
            cleanup()
            const placements = hydrateWorkerPlacements(event.data.placements)
            resolve({
                placements,
                score: event.data.score,
            })
        }

        /**
         * 处理 Worker 失败。
         * @param error 错误事件
         */
        const handleError = (error: ErrorEvent) => {
            cleanup()
            reject(error)
        }

        /**
         * 清理本次监听器。
         */
        const cleanup = () => {
            currentWorker.removeEventListener("message", handleMessage)
            currentWorker.removeEventListener("error", handleError)
        }

        currentWorker.addEventListener("message", handleMessage)
        currentWorker.addEventListener("error", handleError)
        currentWorker.postMessage(request)
    })
}

/**
 * 将预设摆放转换为可水合的 worker 摆放结构。
 * @param placements 预设摆放
 * @returns worker 摆放
 */
function buildWorkerPlacementsFromPreset(
    placements: Array<{
        itemIndex: number
        x: number
        y: number
        rotationIndex: number
        representedItemIndexes: number[]
        stackCount: number
        attachedAmmoCount: number
    }>
): WorkerPlacement[] {
    return placements
        .map(placement => {
            const hydrated = hydratePlacement(
                {
                    ...placement,
                    score: 0,
                    covered: 0,
                    cellCount: 0,
                },
                "solver"
            )
            if (!hydrated) {
                return null
            }
            return {
                itemIndex: placement.itemIndex,
                x: placement.x,
                y: placement.y,
                rotationIndex: placement.rotationIndex,
                score: hydrated.score,
                covered: hydrated.covered,
                cellCount: hydrated.cellCount,
                representedItemIndexes: [...placement.representedItemIndexes],
                stackCount: placement.stackCount,
                attachedAmmoCount: placement.attachedAmmoCount,
            }
        })
        .filter((placement): placement is WorkerPlacement => Boolean(placement))
}

/**
 * 将 worker 摆放结果转换为前端摆放列表。
 * @param placements worker 返回结果
 * @returns 前端摆放列表
 */
function hydrateWorkerPlacements(placements: WorkerPlacement[]): Placement[] {
    const result: Placement[] = []
    for (const placement of placements) {
        const representedItemIndexes = placement.representedItemIndexes.filter(itemIndex => levelItems.value[itemIndex]?.type !== "Ammo")
        const basePlacement = hydratePlacement(
            {
                ...placement,
                representedItemIndexes,
                stackCount: representedItemIndexes.length || 1,
                attachedAmmoCount: placement.attachedAmmoCount,
            },
            "solver"
        )
        if (basePlacement) {
            result.push(basePlacement)
        }
    }
    return result
}

/**
 * 生成指定道具的摆放结果。
 * @param placement 原始摆放
 * @param source 摆放来源
 * @returns 完整摆放数据
 */
function hydratePlacement(
    placement: ManualPlacement | WorkerPlacement,
    source: "manual" | "solver",
    existingPlacements: Placement[] = getExistingBoardPlacements(placement.itemIndex)
): Placement | null {
    const item = levelItems.value[placement.itemIndex]
    const board = selectedLevelBoard.value
    if (!item || !board.length) {
        return null
    }
    const rotation = buildRotations(item)[placement.rotationIndex]
    if (!rotation) {
        return null
    }
    return evaluatePlacement(
        board,
        buildBaseOccupied(board),
        item,
        rotation,
        placement.rotationIndex,
        placement.x,
        placement.y,
        source,
        placement.itemIndex,
        "representedItemIndexes" in placement ? placement.representedItemIndexes : [placement.itemIndex],
        "stackCount" in placement ? placement.stackCount : 1,
        "attachedAmmoCount" in placement ? placement.attachedAmmoCount : 0,
        existingPlacements
    )
}

/**
 * 在枪械真实占格中搜索可放置子弹的位置。
 * @param gunPlacement 枪械摆放
 * @param ammoRotation 子弹旋转矩阵
 * @returns 可附着坐标
 */
function findAmmoAttachmentPosition(gunPlacement: Placement, ammoRotation: number[][]): { x: number; y: number } | null {
    const ammoWidth = ammoRotation[0]?.length ?? 0
    const ammoHeight = ammoRotation.length
    const gunCells = new Set(gunPlacement.cells.map(cell => `${cell.x},${cell.y}`))
    const minX = Math.min(...gunPlacement.cells.map(cell => cell.x))
    const maxX = Math.max(...gunPlacement.cells.map(cell => cell.x))
    const minY = Math.min(...gunPlacement.cells.map(cell => cell.y))
    const maxY = Math.max(...gunPlacement.cells.map(cell => cell.y))

    for (let y = minY; y <= maxY - ammoHeight + 1; y++) {
        for (let x = minX; x <= maxX - ammoWidth + 1; x++) {
            let fits = true
            for (let cellY = 0; cellY < ammoHeight && fits; cellY++) {
                for (let cellX = 0; cellX < ammoWidth; cellX++) {
                    if (!ammoRotation[cellY]?.[cellX]) {
                        continue
                    }
                    if (!gunCells.has(`${x + cellX},${y + cellY}`)) {
                        fits = false
                        break
                    }
                }
            }
            if (fits) {
                return { x, y }
            }
        }
    }

    return null
}

/**
 * 构建基础占用矩阵。
 * @param board 棋盘
 * @returns 占用矩阵
 */
function buildBaseOccupied(board: GridPoint[][]): boolean[][] {
    return board.map(row => row.map(() => false))
}

/**
 * 构建当前棋盘摆放后的占用矩阵。
 * @param ignoreItemIndex 忽略的道具索引
 * @returns 占用矩阵
 */
function buildOccupiedWithBoardPlacements(ignoreItemIndex?: number, ignorePlacementItemIndexes: number[] = []): boolean[][] {
    const board = selectedLevelBoard.value
    const occupied = buildBaseOccupied(board)
    const ignoredItemIndexSet = new Set(ignorePlacementItemIndexes)
    for (const placement of getExistingBoardPlacements(ignoreItemIndex)) {
        if (placement.representedItemIndexes.some(itemIndex => ignoredItemIndexSet.has(itemIndex))) {
            continue
        }
        for (const cell of placement.cells) {
            occupied[cell.y][cell.x] = true
        }
    }
    return occupied
}

/**
 * 获取当前棋盘上已存在的摆放列表。
 * 仅返回已完成水合的解算结果与其他手动摆放，避免在水合当前摆放时递归调用自身。
 * @param ignoreItemIndex 忽略的道具索引
 * @returns 已存在摆放列表
 */
function getExistingBoardPlacements(ignoreItemIndex?: number): Placement[] {
    const solverPlacementsList = solverPlacements.value.filter(placement => placement.itemIndex !== ignoreItemIndex)
    return [...solverPlacementsList, ...getManualPlacementList(ignoreItemIndex, solverPlacementsList)]
}

/**
 * 获取当前手动摆放列表。
 * @param ignoreItemIndex 忽略的道具索引
 * @returns 摆放列表
 */
function getBoardPlacementList(ignoreItemIndex?: number): Placement[] {
    const solverPlacementsList = solverPlacements.value.filter(placement => placement.itemIndex !== ignoreItemIndex)
    return getManualPlacementList(ignoreItemIndex, solverPlacementsList)
}

/**
 * 获取当前手动摆放列表，并对同格同向的可堆叠物品做聚合。
 * @param ignoreItemIndex 忽略的道具索引
 * @param basePlacements 已存在的外部摆放
 * @returns 手动摆放列表
 */
function getManualPlacementList(ignoreItemIndex?: number, basePlacements: Placement[] = []): Placement[] {
    const manualPlacementEntries = manualPlacements.value.filter(placement => placement.itemIndex !== ignoreItemIndex)
    const groupedPlacements = new Map<string, ManualPlacement[]>()
    const orderedGroups: ManualPlacement[][] = []

    for (const placement of manualPlacementEntries) {
        const item = levelItems.value[placement.itemIndex]
        const canStack = (item?.maxStack ?? 1) > 1 && item?.type !== "Ammo"
        const groupKey = canStack ? `${item?.id}-${placement.rotationIndex}-${placement.x}-${placement.y}` : `single-${placement.itemIndex}`
        const existingGroup = groupedPlacements.get(groupKey)
        if (existingGroup) {
            existingGroup.push(placement)
            continue
        }
        const nextGroup = [placement]
        groupedPlacements.set(groupKey, nextGroup)
        orderedGroups.push(nextGroup)
    }

    const manualPlacementList: Placement[] = []
    const regularGroups: ManualPlacement[][] = []

    for (const group of orderedGroups) {
        const item = levelItems.value[group[0]?.itemIndex ?? -1]
        if (item?.type !== "Ammo") {
            regularGroups.push(group)
        }
    }

    const buildGroupedPlacement = (group: ManualPlacement[], existingPlacements: Placement[]) => {
        const [firstPlacement, ...restPlacements] = group
        if (!firstPlacement) {
            return null
        }
        const representedItemIndexes = [firstPlacement.itemIndex, ...restPlacements.map(placement => placement.itemIndex)]
        return hydratePlacement(
            {
                ...firstPlacement,
                representedItemIndexes,
                stackCount: representedItemIndexes.length,
                attachedAmmoCount: getManualAttachedAmmoCount(firstPlacement.itemIndex),
            },
            "manual",
            [...basePlacements, ...manualPlacementList, ...existingPlacements]
        )
    }

    for (const group of regularGroups) {
        const hydratedPlacement = buildGroupedPlacement(group, [])
        if (hydratedPlacement) {
            manualPlacementList.push(hydratedPlacement)
        }
    }

    return manualPlacementList
}

/**
 * 获取当前已被占用的物品索引集合。
 * @returns 已占用索引集合
 */
function getUsedItemIndexSet(): Set<number> {
    return new Set([
        ...bestSolution.value.placements.flatMap(placement => placement.representedItemIndexes),
        ...manualAmmoAssignments.value.map(entry => entry.ammoItemIndex),
    ])
}

/**
 * 获取指定枪械的手动装弹数量。
 * @param gunItemIndex 枪械索引
 * @returns 已装弹数
 */
function getManualAttachedAmmoCount(gunItemIndex: number): number {
    return manualAmmoAssignments.value.reduce((sum, entry) => {
        if (entry.gunItemIndex !== gunItemIndex) {
            return sum
        }
        const ammoItem = levelItems.value[entry.ammoItemIndex]
        return sum + Math.max(0, ammoItem?.currentStack ?? 0)
    }, 0)
}

/**
 * 获取指定枪械当前剩余可装弹容量。
 * @param gunItemIndex 枪械索引
 * @returns 剩余容量
 */
function getRemainingAmmoCapacity(gunItemIndex: number): number {
    const gunItem = levelItems.value[gunItemIndex]
    if (!gunItem || gunItem.type !== "Gun") {
        return 0
    }
    return Math.max(0, (gunItem.maxAmmo ?? 0) - (gunItem.currentAmmo ?? 0) - getManualAttachedAmmoCount(gunItemIndex))
}

/**
 * 为物品栏选择一个可新增拖拽的物品索引。
 * @param itemIndexes 同组物品索引
 * @returns 可用物品索引
 */
function getNextPoolItemIndex(itemIndexes: number[]): number | null {
    const usedSet = getUsedItemIndexSet()
    return itemIndexes.find(itemIndex => !usedSet.has(itemIndex)) ?? null
}

/**
 * 查找当前落点是否可并入已有手动堆叠。
 * 仅普通可堆叠道具允许合并，弹药仍走附着枪械规则。
 * @param itemIndex 当前道具索引
 * @param rotationIndex 旋转索引
 * @param x 目标 x
 * @param y 目标 y
 * @param source 拖拽来源
 * @returns 可合并的手动摆放
 */
function findStackMergePlacement(
    itemIndex: number,
    rotationIndex: number,
    x: number,
    y: number,
    source: "pool" | "manual" | "solver" = "pool"
): Placement | null {
    const item = levelItems.value[itemIndex]
    if (!item || item.type === "Ammo" || (item.maxStack ?? 1) <= 1) {
        return null
    }

    const placementList = getBoardPlacementList(source === "pool" ? undefined : itemIndex)
    return (
        placementList.find(placement => {
            if (placement.source !== "manual") {
                return false
            }
            if ((placement.item.maxStack ?? 1) <= placement.stackCount) {
                return false
            }
            return placement.item.id === item.id && placement.rotationIndex === rotationIndex && placement.x === x && placement.y === y
        }) ?? null
    )
}

/**
 * 按下道具后进入手动拖动态。
 * @param itemIndex 道具索引
 * @param event 指针事件
 * @param source 来源
 */
function startDraggingFromItem(
    itemIndex: number,
    event: PointerEvent,
    source: "pool" | "manual" | "solver",
    placementOverride?: Pick<Placement, "x" | "y" | "rotationIndex">
) {
    if (event.button !== 0 || !selectedLevel.value) {
        return
    }
    const item = levelItems.value[itemIndex]
    if (!item) {
        return
    }

    const manualPlacement = source === "manual" ? manualPlacements.value.find(placement => placement.itemIndex === itemIndex) : undefined
    const solverPlacement = source === "solver" ? solverPlacements.value.find(placement => placement.itemIndex === itemIndex) : undefined
    const basePlacement = source === "pool" ? placementOverride : (placementOverride ?? manualPlacement ?? solverPlacement)
    const rotationIndex = basePlacement ? basePlacement.rotationIndex : getDraftRotationIndex(itemIndex)
    const rotation = buildRotations(item)[rotationIndex]
    const width = rotation?.[0]?.length ?? 0
    const height = rotation?.length ?? 0
    if (!rotation || !width || !height) {
        return
    }

    const target = event.currentTarget as HTMLElement | null
    const rect = target?.getBoundingClientRect()
    const boardRect = boardRef.value?.getBoundingClientRect()
    const previewCellSize = boardRect
        ? boardRect.width / Math.max(boardWidth.value, 1)
        : rect
          ? rect.width / Math.max(width, 1)
          : PREVIEW_ITEM_CELL_PX
    const pointerOffsetX =
        basePlacement && boardRect
            ? event.clientX - (boardRect.left + basePlacement.x * previewCellSize)
            : rect
              ? event.clientX - rect.left
              : (width * previewCellSize) / 2
    const pointerOffsetY =
        basePlacement && boardRect
            ? event.clientY - (boardRect.top + basePlacement.y * previewCellSize)
            : rect
              ? event.clientY - rect.top
              : (height * previewCellSize) / 2

    const hiddenSolverPlacement =
        source === "solver" ? (solverPlacements.value.find(placement => placement.itemIndex === itemIndex) ?? null) : null

    draggingState.value = {
        itemIndex,
        pointerId: event.pointerId,
        rotationIndex,
        pointerOffsetX,
        pointerOffsetY,
        previewX: event.clientX - pointerOffsetX,
        previewY: event.clientY - pointerOffsetY,
        boardX: basePlacement?.x ?? null,
        boardY: basePlacement?.y ?? null,
        source,
        originX: basePlacement?.x,
        originY: basePlacement?.y,
        boardWidth: width,
        boardHeight: height,
        previewCellSize,
        valid: false,
        hiddenSolverPlacement,
    }

    if (source === "solver") {
        solverPlacements.value = solverPlacements.value.filter(placement => placement.itemIndex !== itemIndex)
    }

    target?.setPointerCapture?.(event.pointerId)
    attachPointerListeners()
    updateDraggingPreview(event.clientX, event.clientY)
}

/**
 * 拖动中更新预览和落点。
 * @param clientX 指针 x
 * @param clientY 指针 y
 */
function updateDraggingPreview(clientX: number, clientY: number) {
    const drag = draggingState.value
    const boardElement = boardRef.value
    const level = selectedLevel.value
    if (!drag || !boardElement || !level) {
        return
    }

    drag.previewX = clientX - drag.pointerOffsetX
    drag.previewY = clientY - drag.pointerOffsetY

    const rect = boardElement.getBoundingClientRect()
    const cellWidth = rect.width / (boardWidth.value || 1)
    const cellHeight = rect.height / (boardHeight.value || 1)
    const left = clientX - rect.left - drag.pointerOffsetX
    const top = clientY - rect.top - drag.pointerOffsetY
    const boardX = Math.round(left / cellWidth)
    const boardY = Math.round(top / cellHeight)

    drag.boardX = boardX
    drag.boardY = boardY
    drag.valid = canPlaceDraggedItem(boardX, boardY, drag.rotationIndex, drag.itemIndex, drag.source)
}

/**
 * 判定当前拖动态是否可落位。
 * @param x 目标 x
 * @param y 目标 y
 * @param rotationIndex 旋转索引
 * @param itemIndex 道具索引
 * @param source 判定来源
 * @returns 是否合法
 */
function canPlaceDraggedItem(
    x: number,
    y: number,
    rotationIndex: number,
    itemIndex: number,
    source: "pool" | "manual" | "solver" = "pool"
): boolean {
    return Boolean(resolvePlacementAt(x, y, rotationIndex, itemIndex, source))
}

/**
 * 计算指定位置的合法摆放结果。
 * 用于统一预览判定、提交落位与旋转避让，避免不同路径结果不一致。
 * @param x 目标 x
 * @param y 目标 y
 * @param rotationIndex 旋转索引
 * @param itemIndex 道具索引
 * @param source 判定来源
 * @returns 合法摆放结果
 */
function resolvePlacementAt(
    x: number,
    y: number,
    rotationIndex: number,
    itemIndex: number,
    source: "pool" | "manual" | "solver" = "pool"
): Placement | null {
    const item = levelItems.value[itemIndex]
    const board = selectedLevelBoard.value
    if (!item || !board.length) {
        return null
    }
    const rotation = buildRotations(item)[rotationIndex]
    if (!rotation) {
        return null
    }
    const stackMergePlacement = findStackMergePlacement(itemIndex, rotationIndex, x, y, source)
    const existingPlacements = getExistingBoardPlacements(source === "pool" ? undefined : itemIndex)
    const occupied = buildOccupiedWithBoardPlacements(
        source === "pool" ? undefined : itemIndex,
        stackMergePlacement?.representedItemIndexes ?? []
    )
    const placement = evaluatePlacement(
        board,
        occupied,
        item,
        rotation,
        rotationIndex,
        x,
        y,
        "manual",
        itemIndex,
        [itemIndex],
        1,
        0,
        existingPlacements
    )
    if (!placement) {
        return null
    }
    if (item.type === "Ammo" && !placement.representedItemIndexes.some(index => levelItems.value[index]?.type === "Gun")) {
        return null
    }
    if (item.type === "Ammo") {
        const gunItemIndex = placement.representedItemIndexes.find(index => levelItems.value[index]?.type === "Gun")
        if (gunItemIndex === undefined || getRemainingAmmoCapacity(gunItemIndex) <= 0) {
            return null
        }
    }
    return placement
}

/**
 * 围绕起点搜索最近的合法摆放位置。
 * 旋转按钮使用该逻辑实现自动避让，而不是原地失败。
 * @param itemIndex 道具索引
 * @param rotationIndex 旋转索引
 * @param originX 起点 x
 * @param originY 起点 y
 * @param source 判定来源
 * @returns 最近合法摆放
 */
function findNearestPlacement(
    itemIndex: number,
    rotationIndex: number,
    originX: number,
    originY: number,
    source: "pool" | "manual" | "solver" = "pool"
): Placement | null {
    const board = selectedLevelBoard.value
    const height = board.length
    const width = board[0]?.length ?? 0
    if (!width || !height) {
        return null
    }

    let bestPlacement: Placement | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const placement = resolvePlacementAt(x, y, rotationIndex, itemIndex, source)
            if (!placement) {
                continue
            }
            const distance = Math.abs(x - originX) + Math.abs(y - originY)
            if (distance < bestDistance) {
                bestPlacement = placement
                bestDistance = distance
            }
        }
    }

    return bestPlacement
}

/**
 * 旋转当前拖动中的道具。
 */
function rotateDraggingItem() {
    const drag = draggingState.value
    const item = drag ? levelItems.value[drag.itemIndex] : null
    if (!drag || !item) {
        return
    }
    const rotations = buildRotations(item)
    drag.rotationIndex = (drag.rotationIndex + 1) % rotations.length
    const rotation = rotations[drag.rotationIndex]
    drag.boardWidth = rotation?.[0]?.length ?? 0
    drag.boardHeight = rotation?.length ?? 0
    if (drag.boardX !== null && drag.boardY !== null) {
        drag.valid = canPlaceDraggedItem(drag.boardX, drag.boardY, drag.rotationIndex, drag.itemIndex, drag.source)
    }
}

/**
 * 提交当前拖动结果。
 */
function commitDraggingPlacement() {
    const drag = draggingState.value
    if (!drag) {
        return
    }

    if (drag.boardX !== null && drag.boardY !== null && drag.valid) {
        const evaluatedPlacement = resolvePlacementAt(drag.boardX, drag.boardY, drag.rotationIndex, drag.itemIndex, drag.source)
        if (!evaluatedPlacement) {
            draggingState.value = null
            detachPointerListeners()
            return
        }
        const draggedItem = levelItems.value[drag.itemIndex]
        if (draggedItem?.type === "Ammo") {
            const gunItemIndex =
                evaluatedPlacement.representedItemIndexes.find(index => levelItems.value[index]?.type === "Gun") ??
                evaluatedPlacement.itemIndex
            if (levelItems.value[gunItemIndex]?.type === "Gun") {
                manualAmmoAssignments.value = [...manualAmmoAssignments.value, { ammoItemIndex: drag.itemIndex, gunItemIndex }]
                selectedItemIndex.value = gunItemIndex
            }
        } else {
            const nextPlacement: ManualPlacement = {
                itemIndex: drag.itemIndex,
                x: evaluatedPlacement.x,
                y: evaluatedPlacement.y,
                rotationIndex: evaluatedPlacement.rotationIndex,
            }
            manualPlacements.value =
                drag.source === "pool"
                    ? [...manualPlacements.value, nextPlacement]
                    : [...manualPlacements.value.filter(placement => placement.itemIndex !== drag.itemIndex), nextPlacement]
            selectedItemIndex.value = drag.itemIndex
        }
        const selectedPlacement = getExistingBoardPlacements().find(placement =>
            placement.representedItemIndexes.includes(selectedItemIndex.value ?? -1)
        )
        selectedPlacementKey.value = selectedPlacement ? getPlacementKey(selectedPlacement) : null
    } else if (drag.source === "manual") {
        manualPlacements.value = manualPlacements.value.filter(placement => placement.itemIndex !== drag.itemIndex)
        if (selectedItemIndex.value === drag.itemIndex) {
            selectedItemIndex.value = null
            selectedPlacementKey.value = null
        }
    }

    draggingState.value = null
    detachPointerListeners()
}

/**
 * 取消当前拖动。
 */
function cancelDraggingPlacement() {
    const drag = draggingState.value
    if (drag?.source === "solver" && drag.hiddenSolverPlacement) {
        solverPlacements.value = [...solverPlacements.value, drag.hiddenSolverPlacement]
    }
    draggingState.value = null
    detachPointerListeners()
}

/**
 * 清空全部手动摆放。
 */
function clearAllManualPlacements() {
    manualPlacements.value = []
    manualAmmoAssignments.value = []
    selectedItemIndex.value = null
    selectedPlacementKey.value = null
}

/**
 * 删除棋盘上的摆放项。
 * 自动解结果会进入排除列表，手动摆放则直接删除。
 * @param placement 摆放结果
 */
function removePlacement(placement: Placement) {
    if (placement.source === "manual") {
        manualPlacements.value = manualPlacements.value.filter(entry => !placement.representedItemIndexes.includes(entry.itemIndex))
        manualAmmoAssignments.value = manualAmmoAssignments.value.filter(entry => entry.gunItemIndex !== placement.itemIndex)
        return
    }
    manualAmmoAssignments.value = manualAmmoAssignments.value.filter(entry => entry.gunItemIndex !== placement.itemIndex)
    excludedSolverItemIndexes.value = [...new Set([...excludedSolverItemIndexes.value, ...placement.representedItemIndexes])]
    if (selectedItemIndex.value !== null && placement.representedItemIndexes.includes(selectedItemIndex.value)) {
        selectedItemIndex.value = null
        selectedPlacementKey.value = null
    }
}

/**
 * 获取道具当前草稿旋转。
 * @param itemIndex 道具索引
 * @returns 旋转索引
 */
function getDraftRotationIndex(itemIndex: number): number {
    return itemRotationDrafts.value[itemIndex] ?? 0
}

/**
 * 旋转列表中的道具草稿朝向。
 * @param itemIndex 道具索引
 */
function rotateItemDraft(itemIndex: number) {
    const item = levelItems.value[itemIndex]
    if (!item) {
        return
    }
    const rotations = buildRotations(item)
    itemRotationDrafts.value = {
        ...itemRotationDrafts.value,
        [itemIndex]: (getDraftRotationIndex(itemIndex) + 1) % rotations.length,
    }
}

/**
 * 选中棋盘上的摆放项。
 * @param placement 摆放结果
 */
function selectPlacement(placement: Placement) {
    selectedPlacementKey.value = getPlacementKey(placement)
    selectedItemIndex.value = placement.representedItemIndexes[0] ?? placement.itemIndex
}

/**
 * 旋转棋盘上已手动放置的道具。
 * @param placement 摆放结果
 */
function rotatePlacedItem(placement: Placement) {
    const item = levelItems.value[placement.itemIndex]
    if (!item) {
        return
    }
    const rotations = buildRotations(item)
    const nextRotationIndex = (placement.rotationIndex + 1) % rotations.length
    const nextPlacement = findNearestPlacement(placement.itemIndex, nextRotationIndex, placement.x, placement.y, placement.source)
    if (!nextPlacement) {
        return
    }
    manualPlacements.value = manualPlacements.value.map(entry =>
        entry.itemIndex === placement.itemIndex
            ? {
                  ...entry,
                  x: nextPlacement.x,
                  y: nextPlacement.y,
                  rotationIndex: nextPlacement.rotationIndex,
              }
            : entry
    )
    if (!manualPlacements.value.some(entry => entry.itemIndex === placement.itemIndex)) {
        manualPlacements.value = [
            ...manualPlacements.value,
            {
                itemIndex: placement.itemIndex,
                x: nextPlacement.x,
                y: nextPlacement.y,
                rotationIndex: nextPlacement.rotationIndex,
            },
        ]
    }
    excludedSolverItemIndexes.value = excludedSolverItemIndexes.value.filter(itemIndex => itemIndex !== placement.itemIndex)
    const selectedPlacement = getBoardPlacementList().find(nextItem => nextItem.representedItemIndexes.includes(placement.itemIndex))
    if (selectedPlacement) {
        selectPlacement(selectedPlacement)
    }
}

/**
 * 判断当前摆放是否高亮。
 * @param placement 摆放结果
 * @returns 是否高亮
 */
function isPlacementHighlighted(placement: Placement): boolean {
    return hoveredPlacementKey.value === getPlacementKey(placement) || selectedPlacementKey.value === getPlacementKey(placement)
}

/**
 * 获取物品栏预览格子的样式类。
 * @param filled 当前格是否被物品占用
 * @returns 样式类
 */
function getItemPreviewCellClass(filled: number): string {
    if (!filled) {
        return "bg-base-300/20"
    }
    return "bg-primary/35 border-primary/60"
}

/**
 * 获取摆放格子的样式。
 * @param x 格子 x
 * @param y 格子 y
 * @returns 样式
 */
function getPlacementCellStyle(x: number, y: number): Record<string, string> {
    const width = boardWidth.value || 1
    const height = boardHeight.value || 1
    return {
        left: `${(x / width) * 100}%`,
        top: `${(y / height) * 100}%`,
        width: `${(1 / width) * 100}%`,
        height: `${(1 / height) * 100}%`,
    }
}

/**
 * 判断当前格子是否为堆叠数量角标的挂载点。
 * 角标固定显示在最靠右下的占格右下角，避免在不规则形状上漂移。
 * @param placement 摆放结果
 * @param cell 当前格子
 * @returns 是否为角标挂载点
 */
function isStackCountAnchorCell(placement: Placement, cell: Cell): boolean {
    if (!placement.cells.length) {
        return false
    }
    const anchorCell = placement.cells.reduce((currentAnchor, currentCell) => {
        if (currentCell.y > currentAnchor.y) {
            return currentCell
        }
        if (currentCell.y === currentAnchor.y && currentCell.x > currentAnchor.x) {
            return currentCell
        }
        return currentAnchor
    })
    return anchorCell.x === cell.x && anchorCell.y === cell.y
}

/**
 * 获取摆放右下角角标文本。
 * @param placement 摆放
 * @returns 文本
 */
function getPlacementBadgeText(placement: Placement): string {
    const parts: string[] = []
    if (placement.stackCount > 1) {
        parts.push(`x${placement.stackCount}`)
    }
    if (placement.item.type === "Gun" && placement.item.maxAmmo) {
        const currentAmmo = Math.max(0, (placement.item.currentAmmo ?? 0) + placement.attachedAmmoCount)
        parts.push(`${currentAmmo}/${placement.item.maxAmmo}`)
    }
    return parts.join(" ")
}

/**
 * 获取棋盘上的图层样式。
 * @param placement 摆放结果
 * @returns 样式
 */
function getPlacementImageLayerStyle(placement: Placement): Record<string, string> {
    return {
        left: `${(placement.x / (boardWidth.value || 1)) * 100}%`,
        top: `${(placement.y / (boardHeight.value || 1)) * 100}%`,
        width: `${((placement.rotation[0]?.length ?? 1) / (boardWidth.value || 1)) * 100}%`,
        height: `${(placement.rotation.length / (boardHeight.value || 1)) * 100}%`,
    }
}

/**
 * 获取摆放项的悬停 key。
 * @param placement 摆放结果
 * @returns 唯一 key
 */
function getPlacementKey(placement: Placement): string {
    return `${placement.source}-${placement.itemIndex}-${placement.rotationIndex}-${placement.x}-${placement.y}`
}

/**
 * 获取棋盘贴图包裹层样式。
 * 奇数旋转时先交换绘制盒子的宽高，再对图片旋转，避免横图直接塞进竖盒导致显示错误。
 * @param placement 摆放结果
 * @returns 样式
 */
function getPlacementImageWrapperStyle(placement: Placement): Record<string, string> {
    return getImageWrapperStyle(placement.rotation[0]?.length ?? 1, placement.rotation.length || 1, placement.rotationIndex)
}

/**
 * 获取通用贴图包裹层样式。
 * @param width 当前占用宽度
 * @param height 当前占用高度
 * @param rotationIndex 旋转索引
 * @returns 样式
 */
function getImageWrapperStyle(width: number, height: number, rotationIndex: number): Record<string, string> {
    if (rotationIndex % 2 === 0) {
        return {
            inset: "0",
        }
    }

    const wrapperWidth = (height / width) * 100
    const wrapperHeight = (width / height) * 100
    return {
        width: `${wrapperWidth}%`,
        height: `${wrapperHeight}%`,
        left: `${(100 - wrapperWidth) / 2}%`,
        top: `${(100 - wrapperHeight) / 2}%`,
    }
}

/**
 * 绑定全局拖动事件。
 */
function attachPointerListeners() {
    window.addEventListener("pointermove", handleGlobalPointerMove)
    window.addEventListener("pointerup", handleGlobalPointerUp)
    window.addEventListener("pointercancel", handleGlobalPointerCancel)
    window.addEventListener("keydown", handleGlobalKeyDown)
}

/**
 * 解绑全局拖动事件。
 */
function detachPointerListeners() {
    window.removeEventListener("pointermove", handleGlobalPointerMove)
    window.removeEventListener("pointerup", handleGlobalPointerUp)
    window.removeEventListener("pointercancel", handleGlobalPointerCancel)
    window.removeEventListener("keydown", handleGlobalKeyDown)
}

/**
 * 全局指针移动。
 * @param event 指针事件
 */
function handleGlobalPointerMove(event: PointerEvent) {
    if (draggingState.value?.pointerId !== event.pointerId) {
        return
    }
    updateDraggingPreview(event.clientX, event.clientY)
}

/**
 * 全局指针抬起。
 * @param event 指针事件
 */
function handleGlobalPointerUp(event: PointerEvent) {
    if (draggingState.value?.pointerId !== event.pointerId) {
        return
    }
    commitDraggingPlacement()
}

/**
 * 全局指针取消。
 * @param event 指针事件
 */
function handleGlobalPointerCancel(event: PointerEvent) {
    if (draggingState.value?.pointerId !== event.pointerId) {
        return
    }
    cancelDraggingPlacement()
}

/**
 * 全局键盘处理，支持旋转和取消。
 * @param event 键盘事件
 */
function handleGlobalKeyDown(event: KeyboardEvent) {
    if (!draggingState.value) {
        return
    }
    if (event.key.toLowerCase() === "r") {
        event.preventDefault()
        rotateDraggingItem()
        return
    }
    if (event.key === "Escape") {
        event.preventDefault()
        cancelDraggingPlacement()
    }
}

/**
 * 评估放置方案。
 * @param board 背包格子
 * @param occupied 已占用格子
 * @param item 道具
 * @param rotation 形状
 * @param rotationIndex 旋转索引
 * @param offsetX 偏移 x
 * @param offsetY 偏移 y
 * @param source 摆放来源
 * @param itemIndex 道具索引
 * @returns 放置结果
 */
function evaluatePlacement(
    board: GridPoint[][],
    occupied: boolean[][],
    item: BackpackPuzzleItem,
    rotation: number[][],
    rotationIndex: number,
    offsetX: number,
    offsetY: number,
    source: "manual" | "solver",
    itemIndex: number,
    representedItemIndexes: number[] = [itemIndex],
    stackCount = 1,
    attachedAmmoCount = 0,
    existingPlacements: Placement[] = []
): Placement | null {
    const cells: Cell[] = []
    let covered = 0
    let attachedGunPlacement: Placement | null = null
    let ammoTouchesGun = false
    let ammoFullyAttachedToSingleGun = true
    let ammoNeedsSnap = false

    for (let y = 0; y < rotation.length; y++) {
        for (let x = 0; x < rotation[y].length; x++) {
            if (!rotation[y][x]) continue

            const targetX = offsetX + x
            const targetY = offsetY + y
            const cellType = board[targetY]?.[targetX] ?? 0
            const overlappedPlacement = existingPlacements.find(placement =>
                placement.cells.some(cell => cell.x === targetX && cell.y === targetY)
            )
            const isAmmo = item.type === "Ammo"
            const overlappedGunPlacement = isAmmo && overlappedPlacement?.item.type === "Gun" ? overlappedPlacement : null
            const canOverlapGunAmmo =
                Boolean(overlappedGunPlacement) &&
                (attachedGunPlacement === null || attachedGunPlacement.itemIndex === overlappedGunPlacement?.itemIndex)

            if (board[targetY]?.[targetX] === undefined || occupied[targetY]?.[targetX] === undefined) {
                return null
            }
            if (occupied[targetY]?.[targetX] && !canOverlapGunAmmo) {
                return null
            }
            if (isAmmo) {
                if (canOverlapGunAmmo && overlappedGunPlacement) {
                    attachedGunPlacement = overlappedGunPlacement
                    ammoTouchesGun = true
                } else {
                    ammoFullyAttachedToSingleGun = false
                    ammoNeedsSnap = ammoTouchesGun || Boolean(attachedGunPlacement)
                }
            }

            cells.push({ x: targetX, y: targetY, type: cellType as GridPoint })
            if (cellType === 2) {
                covered++
            }
        }
    }

    if (item.type === "Ammo" && attachedGunPlacement && ammoNeedsSnap && !ammoFullyAttachedToSingleGun) {
        const anchor = findAmmoAttachmentPosition(attachedGunPlacement, rotation)
        if (anchor && (anchor.x !== offsetX || anchor.y !== offsetY)) {
            return evaluatePlacement(
                board,
                occupied,
                item,
                rotation,
                rotationIndex,
                anchor.x,
                anchor.y,
                source,
                itemIndex,
                representedItemIndexes,
                stackCount,
                attachedAmmoCount,
                existingPlacements
            )
        }
    }

    const scoreTier = getPlacementScoreTier(cells)
    const baseScore = representedItemIndexes.reduce((sum, representedItemIndex) => {
        const representedItem = levelItems.value[representedItemIndex]
        if (!representedItem) {
            return sum
        }
        if (item.type !== "Ammo" && representedItem.type === "Ammo") {
            return sum
        }
        return sum + getSingleItemBaseScore(representedItem, 0)
    }, 0)
    const score = scoreTier === 2 ? baseScore * 2 : scoreTier === 1 ? baseScore : 0

    const nextRepresentedItemIndexes =
        item.type === "Ammo" && ammoFullyAttachedToSingleGun && attachedGunPlacement
            ? [attachedGunPlacement.itemIndex, ...representedItemIndexes]
            : representedItemIndexes

    return {
        item,
        x: offsetX,
        y: offsetY,
        rotationIndex,
        rotation,
        score,
        covered,
        cellCount: cells.length,
        cells,
        source,
        itemIndex,
        representedItemIndexes: nextRepresentedItemIndexes,
        stackCount,
        attachedAmmoCount,
    }
}

/**
 * 计算统一弹药基础分。
 * @returns 弹药基础分
 */
function getAmmoBasePoint(): number {
    return levelItems.value.find(item => item.type === "Ammo")?.basicPoint ?? 10
}

/**
 * 计算单个物品基础分。
 * @param item 物品
 * @param ammoBasePoint 统一弹药基础分
 * @param currentAmmo 当前枪内弹药
 * @returns 基础分
 */
function getSingleItemBaseScore(item: BackpackPuzzleItem, ammoBasePoint: number, currentAmmo = item.currentAmmo ?? 0): number {
    if (item.type === "Gun") {
        return item.basicPoint + Math.max(0, currentAmmo) * ammoBasePoint
    }
    if (item.type === "Ammo" || item.type === "Other") {
        return item.basicPoint * Math.max(1, item.currentStack ?? 1)
    }
    return item.basicPoint
}

/**
 * 判断一个摆放的计分档位。
 * @param cells 占用格子
 * @returns 0 不计分 1 普通 2 双倍
 */
function getPlacementScoreTier(cells: Cell[]): 0 | 1 | 2 {
    if (!cells.length) {
        return 0
    }
    if (cells.some(cell => cell.type === 0 || cell.type === -1)) {
        return 0
    }
    return cells.every(cell => cell.type === 2) ? 2 : 1
}

/**
 * 按当前规则重算整盘总分。
 * @param placements 当前全部摆放
 * @returns 总分
 */
function computeBoardScore(placements: Placement[]): number {
    const ammoBasePoint = getAmmoBasePoint()
    return placements.reduce((sum, placement) => {
        const scoreTier = getPlacementScoreTier(placement.cells)
        if (scoreTier === 0) {
            return sum
        }
        const baseScore =
            placement.item.type === "Gun"
                ? getSingleItemBaseScore(
                      placement.item,
                      ammoBasePoint,
                      Math.max(
                          0,
                          (placement.item.currentAmmo ?? 0) + placement.attachedAmmoCount + getManualAttachedAmmoCount(placement.itemIndex)
                      )
                  )
                : placement.representedItemIndexes.reduce((itemSum, itemIndex) => {
                      const representedItem = levelItems.value[itemIndex]
                      if (!representedItem) {
                          return itemSum
                      }
                      return itemSum + getSingleItemBaseScore(representedItem, ammoBasePoint)
                  }, 0)
        return sum + (scoreTier === 2 ? baseScore * 2 : baseScore)
    }, 0)
}

/**
 * 获取所有旋转。
 * @param item 道具
 * @returns 旋转列表
 */
function buildRotations(item: BackpackPuzzleItem): number[][][] {
    const rotations: number[][][] = []
    const seen = new Set<string>()
    let current = item.itemGrid.map(row => [...row])

    for (let i = 0; i < 4; i++) {
        const normalized = normalizeShape(current)
        const key = normalized.map(row => row.join("")).join("|")
        if (!seen.has(key)) {
            seen.add(key)
            rotations.push(normalized)
        }
        current = rotateShape(current)
    }

    return rotations
}

/**
 * 规整形状矩阵。
 * @param shape 形状
 * @returns 规整后的形状
 */
function normalizeShape(shape: number[][]): number[][] {
    const rows = shape.filter(row => row.some(Boolean))
    const cols = rows[0]?.map((_, index) => rows.some(row => Boolean(row[index]))) ?? []
    return rows.map(row => row.filter((_, index) => cols[index]))
}

/**
 * 顺时针旋转矩阵。
 * @param shape 形状
 * @returns 旋转结果
 */
function rotateShape(shape: number[][]): number[][] {
    const height = shape.length
    const width = shape[0]?.length ?? 0
    const result: number[][] = []
    for (let x = 0; x < width; x++) {
        const row: number[] = []
        for (let y = height - 1; y >= 0; y--) {
            row.push(shape[y][x] ?? 0)
        }
        result.push(row)
    }
    return result
}

/**
 * 获取格子样式。
 * @param cell 格子类型
 * @returns class 名称
 */
function getCellClass(cell: GridPoint): string {
    return cellClassMap[cell]
}

/**
 * 获取道具图标路径。
 * @param item 道具
 * @returns 图标路径
 */
function getItemIcon(item: BackpackPuzzleItem): string {
    return `/imgs/bag/${item.icon}.webp`
}

/**
 * 获取预览形状网格列数。
 * @param item 道具
 * @param rotationIndex 旋转索引
 * @returns 列数
 */
function getItemGridColumns(item: BackpackPuzzleItem, rotationIndex = 0): number {
    return buildRotations(item)[rotationIndex]?.[0]?.length ?? 0
}

/**
 * 获取预览形状网格行数。
 * @param item 道具
 * @param rotationIndex 旋转索引
 * @returns 行数
 */
function getItemGridRows(item: BackpackPuzzleItem, rotationIndex = 0): number {
    return buildRotations(item)[rotationIndex]?.length ?? 0
}

/**
 * 获取摆放图层样式。
 * @param placement 摆放结果
 * @returns 样式
 */
function getPlacementStyle(placement: Placement): Record<string, string> {
    return {
        transform: `${placement.item.isMirror ? "rotate(" + placement.rotationIndex * 90 + "deg) scaleX(-1)" : "rotate(" + placement.rotationIndex * 90 + "deg)"}`,
        transformOrigin: "center center",
    }
}

/**
 * 获取指定朝向下的贴图样式。
 * @param item 道具
 * @param rotationIndex 旋转索引
 * @returns 样式
 */
function getRotationStyle(item: BackpackPuzzleItem, rotationIndex: number): Record<string, string> {
    return {
        transform: `${item.isMirror ? "rotate(" + rotationIndex * 90 + "deg) scaleX(-1)" : "rotate(" + rotationIndex * 90 + "deg)"}`,
        transformOrigin: "center center",
    }
}

/**
 * 获取摆放方向文案。
 * @param rotationIndex 旋转索引
 * @returns 方向文案
 */
function getRotationLabel(rotationIndex: number): string {
    return ["0°", "90°", "180°", "270°"][rotationIndex] ?? `${rotationIndex * 90}°`
}

/**
 * 获取道具旋转矩阵。
 * @param item 道具
 * @param rotationIndex 旋转索引
 * @returns 矩阵
 */
function getItemRotation(item: BackpackPuzzleItem, rotationIndex: number): number[][] {
    return buildRotations(item)[rotationIndex] ?? item.itemGrid
}
</script>

<template>
    <div v-if="selectedLevel" class="space-y-4">
        <div class="rounded-md bg-base-200 p-3">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="text-lg font-bold">{{ selectedLevel.name }}</div>
                    <div class="text-sm text-base-content/70">{{ selectedLevel.desc }}</div>
                </div>
                <span class="text-sm text-base-content/70">ID: {{ selectedLevel.id }}</span>
            </div>
        </div>

        <div v-if="levels.length > 1" class="rounded-md bg-base-200 p-3">
            <div class="flex flex-wrap gap-2">
                <button
                    v-for="level in levels"
                    :key="level.id"
                    class="btn btn-sm"
                    :class="selectedLevelId === level.id ? 'btn-primary' : 'btn-ghost'"
                    @click="selectedLevelId = level.id"
                >
                    {{ level.name }}
                </button>
            </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div class="rounded-md bg-base-200 p-3">
                <div class="mb-2 flex items-center justify-between gap-2">
                    <div class="text-xs text-base-content/70">将道具拖到背包中</div>
                    <div class="flex items-center gap-2">
                        <button class="btn btn-xs btn-primary" :class="{ 'btn-disabled': isSolving }" @click="solveCurrentBoard">
                            {{ isSolving ? "求解中" : "求解" }}
                        </button>
                        <button v-if="manualPlacements.length" class="btn btn-xs btn-ghost" @click="clearAllManualPlacements">
                            清空手动摆放
                        </button>
                    </div>
                </div>
                <div
                    ref="boardRef"
                    class="relative mx-auto w-full max-w-full overflow-hidden rounded-lg border border-base-300/80 bg-base-100/70"
                >
                    <div
                        class="grid w-full"
                        :style="{
                            gridTemplateColumns: `repeat(${boardWidth || 0}, minmax(0, 1fr))`,
                        }"
                    >
                        <template v-for="(row, y) in selectedLevel.gridDistribute" :key="y">
                            <div
                                v-for="(cell, x) in row"
                                :key="`${y}-${x}`"
                                class="aspect-square border border-base-300/60"
                                :class="getCellClass(cell as GridPoint)"
                            />
                        </template>
                    </div>

                    <template v-for="placement in bestSolution.placements" :key="getPlacementKey(placement)">
                        <div class="absolute inset-0 pointer-events-none" :class="placement.source === 'manual' ? 'z-20' : 'z-10'">
                            <template v-for="cell in placement.cells" :key="`${placement.itemIndex}-${cell.x}-${cell.y}`">
                                <div
                                    class="absolute border transition-colors duration-100 pointer-events-auto"
                                    :class="
                                        isPlacementHighlighted(placement)
                                            ? placement.source === 'manual'
                                                ? 'border-secondary bg-secondary/55'
                                                : 'border-amber-200 bg-amber-300/55'
                                            : placement.source === 'manual'
                                              ? 'border-black/30 bg-secondary/35'
                                              : 'border-black/30 bg-amber-300/35'
                                    "
                                    :style="getPlacementCellStyle(cell.x, cell.y)"
                                    @mouseenter="hoveredPlacementKey = getPlacementKey(placement)"
                                    @mouseleave="hoveredPlacementKey = null"
                                    @click.stop="selectPlacement(placement)"
                                    @pointerdown.stop="
                                        placement.source === 'manual'
                                            ? startDraggingFromItem(placement.itemIndex, $event, 'manual', placement)
                                            : placement.source === 'solver'
                                              ? startDraggingFromItem(placement.itemIndex, $event, 'solver', placement)
                                              : selectPlacement(placement)
                                    "
                                >
                                    <div
                                        v-if="isStackCountAnchorCell(placement, cell) && getPlacementBadgeText(placement)"
                                        class="z-30 absolute bottom-2 right-2 translate-x-1/4 translate-y-1/4 rounded bg-neutral px-1 text-[10px] leading-4 text-neutral-content shadow"
                                    >
                                        {{ getPlacementBadgeText(placement) }}
                                    </div>
                                </div>
                            </template>
                            <div class="absolute pointer-events-none" :style="getPlacementImageLayerStyle(placement)">
                                <div class="absolute" :style="getPlacementImageWrapperStyle(placement)">
                                    <img
                                        :src="getItemIcon(placement.item)"
                                        :alt="placement.item.name"
                                        class="h-full w-full select-none object-fill drop-shadow-[0_0_2px_rgba(0,0,0,0.72),0_0_6px_rgba(0,0,0,0.35)]"
                                        :style="getPlacementStyle(placement)"
                                    />
                                </div>
                            </div>
                            <div
                                v-if="selectedPlacementKey === getPlacementKey(placement)"
                                class="absolute right-1 top-1 flex gap-1 pointer-events-auto"
                            >
                                <button
                                    class="btn btn-xs btn-circle btn-neutral/85 min-h-0 h-6 w-6"
                                    @click.stop="rotatePlacedItem(placement)"
                                >
                                    ↻
                                </button>
                                <button
                                    class="btn btn-xs btn-circle btn-neutral/85 min-h-0 h-6 w-6"
                                    @click.stop="removePlacement(placement)"
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                    </template>
                </div>
            </div>

            <div class="rounded-md bg-base-200 p-3 space-y-3">
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div class="rounded bg-base-100 p-2">
                        <div class="text-base-content/60">当前分数</div>
                        <div class="text-lg font-semibold">{{ bestSolution.score }}</div>
                    </div>
                    <div class="rounded bg-base-100 p-2">
                        <div class="text-base-content/60">ID</div>
                        <div class="text-lg font-semibold">{{ selectedLevel.id }}</div>
                    </div>
                    <div class="rounded bg-base-100 p-2">
                        <div class="text-base-content/60">已放置</div>
                        <div class="text-lg font-semibold">{{ bestSolution.placements.length }}</div>
                    </div>
                    <div class="rounded bg-base-100 p-2">
                        <div class="text-base-content/60">求解状态</div>
                        <div class="text-lg font-semibold">{{ isSolving ? "计算中" : needsSolve ? "待求解" : "已完成" }}</div>
                    </div>
                </div>

                <div class="space-y-2">
                    <div class="text-xs text-base-content/70">奖励分数</div>
                    <div v-for="row in rewardRows" :key="row.rewardId" class="rounded bg-base-100 p-2">
                        <div class="flex flex-col gap-2">
                            <div class="text-sm">
                                <div>目标 {{ row.score }}</div>
                                <div class="text-xs text-base-content/60">ID {{ row.rewardId }}</div>
                            </div>
                            <RewardItem :reward="row.reward" />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="rounded-md bg-base-200 p-3">
            <div class="mb-2 text-xs text-base-content/70">道具列表</div>
            <div v-if="itemUsageState.length" class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <div class="p-2" v-for="entry in itemUsageState" :key="entry.key">
                    <div
                        class="rounded transition-colors duration-100"
                        :class="entry.itemIndexes.includes(selectedItemIndex ?? -1) ? 'bg-primary/10 ring-1 ring-primary/50' : ''"
                    >
                        <div class="flex items-start justify-start gap-2">
                            <div class="text-sm font-medium">{{ entry.item.name }}</div>
                            <div class="text-xs text-base-content/60">ID {{ entry.item.id }}</div>
                            <div class="text-xs text-base-content/60">x{{ entry.quantity }}</div>
                            <div class="flex-1"></div>
                            <button class="btn btn-ghost btn-xs" @click.stop="rotateItemDraft(entry.itemIndexes[0])">
                                {{ getRotationLabel(getDraftRotationIndex(entry.itemIndexes[0])) }}
                            </button>
                            <div class="text-xs text-base-content/60">分数 {{ entry.item.basicPoint }}</div>
                        </div>
                        <div class="mt-1 flex items-center gap-2 text-xs">
                            <span class="badge badge-ghost">{{ entry.usedCount }}/{{ entry.quantity }}</span>
                        </div>
                        <div class="flex">
                            <div
                                class="mt-2 overflow-hidden rounded border border-base-300/80 bg-base-200/80"
                                :class="[
                                    entry.available ? 'cursor-grab active:cursor-grabbing' : 'opacity-60',
                                    entry.itemIndexes.includes(selectedItemIndex ?? -1) ? 'border-primary/70' : '',
                                ]"
                                @click="selectedItemIndex = entry.itemIndexes[0]"
                                @pointerdown="
                                    entry.available && getNextPoolItemIndex(entry.itemIndexes) !== null
                                        ? startDraggingFromItem(getNextPoolItemIndex(entry.itemIndexes)!, $event, 'pool')
                                        : undefined
                                "
                            >
                                <div
                                    class="relative grid w-fit"
                                    :style="{
                                        gridTemplateColumns: `repeat(${getItemGridColumns(entry.item, getDraftRotationIndex(entry.itemIndexes[0]))}, ${PREVIEW_ITEM_CELL_PX}px)`,
                                        gridTemplateRows: `repeat(${getItemGridRows(entry.item, getDraftRotationIndex(entry.itemIndexes[0]))}, ${PREVIEW_ITEM_CELL_PX}px)`,
                                    }"
                                >
                                    <template
                                        v-for="(row, y) in getItemRotation(entry.item, getDraftRotationIndex(entry.itemIndexes[0]))"
                                        :key="`${entry.item.id}-${y}`"
                                    >
                                        <div
                                            v-for="(cell, x) in row"
                                            :key="`${entry.item.id}-${y}-${x}`"
                                            class="border border-base-300/50"
                                            :style="{
                                                width: `${PREVIEW_ITEM_CELL_PX}px`,
                                                height: `${PREVIEW_ITEM_CELL_PX}px`,
                                            }"
                                            :class="getItemPreviewCellClass(cell)"
                                        />
                                    </template>
                                    <div
                                        class="pointer-events-none absolute"
                                        :style="
                                            getImageWrapperStyle(
                                                getItemGridColumns(entry.item, getDraftRotationIndex(entry.itemIndexes[0])),
                                                getItemGridRows(entry.item, getDraftRotationIndex(entry.itemIndexes[0])),
                                                getDraftRotationIndex(entry.itemIndexes[0])
                                            )
                                        "
                                    >
                                        <img
                                            :src="getItemIcon(entry.item)"
                                            :alt="entry.item.name"
                                            class="absolute inset-0 h-full w-full select-none object-fill drop-shadow-[0_0_2px_rgba(0,0,0,0.72),0_0_6px_rgba(0,0,0,0.35)]"
                                            :style="getRotationStyle(entry.item, getDraftRotationIndex(entry.itemIndexes[0]))"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div v-else class="text-sm text-base-content/60">暂无道具</div>
        </div>

        <Teleport to="body">
            <div
                v-if="draggingState"
                class="pointer-events-none fixed left-0 top-0 z-1000"
                :style="{
                    transform: `translate(${draggingState.previewX}px, ${draggingState.previewY}px)`,
                }"
            >
                <div
                    class="relative overflow-hidden rounded border bg-base-100/90 shadow-2xl"
                    :class="draggingState.valid ? 'border-success/70' : 'border-error/70'"
                >
                    <div
                        class="grid"
                        :style="{
                            gridTemplateColumns: `repeat(${draggingState.boardWidth}, ${draggingState.previewCellSize}px)`,
                            gridTemplateRows: `repeat(${draggingState.boardHeight}, ${draggingState.previewCellSize}px)`,
                        }"
                    >
                        <template
                            v-for="(row, y) in getItemRotation(levelItems[draggingState.itemIndex], draggingState.rotationIndex)"
                            :key="`drag-${draggingState.itemIndex}-${y}`"
                        >
                            <div
                                v-for="(cell, x) in row"
                                :key="`drag-${draggingState.itemIndex}-${y}-${x}`"
                                class="border border-base-300/50"
                                :style="{
                                    width: `${draggingState.previewCellSize}px`,
                                    height: `${draggingState.previewCellSize}px`,
                                }"
                                :class="cell ? 'bg-amber-300/40' : 'bg-base-300/10'"
                            />
                        </template>
                    </div>
                    <div
                        class="absolute"
                        :style="getImageWrapperStyle(draggingState.boardWidth, draggingState.boardHeight, draggingState.rotationIndex)"
                    >
                        <img
                            :src="getItemIcon(levelItems[draggingState.itemIndex])"
                            :alt="levelItems[draggingState.itemIndex].name"
                            class="absolute inset-0 h-full w-full object-fill opacity-95"
                            :style="getRotationStyle(levelItems[draggingState.itemIndex], draggingState.rotationIndex)"
                        />
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>
