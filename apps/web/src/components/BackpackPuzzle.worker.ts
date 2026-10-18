import type { BackpackPuzzleItem, BackpackPuzzleLevel } from "@/data/d/backpackpuzzle.data"

type GridPoint = -1 | 0 | 1 | 2
type ManualPlacement = {
    itemIndex: number
    x: number
    y: number
    rotationIndex: number
}
type WorkerRequest = {
    id: number
    level: BackpackPuzzleLevel
    items: BackpackPuzzleItem[]
    lockedPlacements: ManualPlacement[]
    excludedItemIndexes: number[]
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
type CandidatePlacement = WorkerPlacement & {
    bitmask: bigint
    cellIndexes: number[]
    estimatedScore: number
}
type PlacementGroup = {
    key: string
    item: BackpackPuzzleItem
    itemIndexes: number[]
    stackCount: number
    candidates: CandidatePlacement[]
    bestScore: number
    ammoRounds: number
}
type AmmoGroup = {
    itemIndexes: number[]
    ammoBasePoint: number
    ammoRoundsByItemIndex: Map<number, number>
    totalRounds: number
}
type SolverState = {
    score: number
    placements: WorkerPlacement[]
}
type SearchContext = {
    items: BackpackPuzzleItem[]
    placementGroups: PlacementGroup[]
    targetScore: number
    suffixBestScores: number[]
    maxPerRoundGain: number
    bestScore: number
    deadline: number
    nodeCount: number
}

class TargetReachedSignal extends Error {
    state: SolverState

    constructor(state: SolverState) {
        super("TARGET_REACHED")
        this.state = state
    }
}

class BudgetExhaustedSignal extends Error {
    constructor() {
        super("BUDGET_EXHAUSTED")
    }
}

/**
 * Worker 消息入口。
 * 在测试环境中没有 Worker 全局对象，因此需要显式保护。
 */
if (typeof self !== "undefined") {
    self.onmessage = (event: MessageEvent<WorkerRequest>) => {
        const result = solveBestSolution(event.data.level, event.data.items, event.data.lockedPlacements, event.data.excludedItemIndexes)
        self.postMessage({
            id: event.data.id,
            score: result.score,
            placements: result.placements,
        })
    }
}

/**
 * 求解剩余道具的最优自动摆放。
 * @param level 关卡
 * @param items 道具
 * @param lockedPlacements 已手动锁定的摆放
 * @param excludedItemIndexes 已排除的自动结果
 * @param timeBudgetMs 搜索时间预算（毫秒），0 表示不限制；超时后返回已找到的最优解
 * @returns 自动摆放结果
 */
export function solveBestSolution(
    level: BackpackPuzzleLevel,
    items: BackpackPuzzleItem[],
    lockedPlacements: ManualPlacement[],
    excludedItemIndexes: number[],
    timeBudgetMs = 0
): SolverState {
    const board = level.gridDistribute.map(row =>
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
    const boardWidth = board[0]?.length ?? 0
    const targetScore = Math.max(...(level.targetScore ?? [0]))
    const lockedMask = buildLockedMask(board, items, lockedPlacements, boardWidth)
    const usedItemSet = new Set([...lockedPlacements.map(placement => placement.itemIndex), ...excludedItemIndexes])
    const availableEntries = items.map((item, itemIndex) => ({ item, itemIndex })).filter(entry => !usedItemSet.has(entry.itemIndex))
    const ammoGroup = buildAmmoGroup(availableEntries)
    // 弹药也参与独立摆放搜索；未被独立放置的弹药在搜索后按剩余容量装载进枪械
    const placementGroups = buildPlacementGroups(board, availableEntries, boardWidth)
    // 每发弹药装载收益上界 = 统一弹药基础分 × 双倍档
    const maxPerRoundGain = ammoGroup ? ammoGroup.ammoBasePoint * 2 : 0
    const context: SearchContext = {
        items,
        placementGroups,
        targetScore,
        suffixBestScores: buildSuffixBestScores(placementGroups, maxPerRoundGain),
        maxPerRoundGain,
        bestScore: 0,
        deadline: timeBudgetMs > 0 ? Date.now() + timeBudgetMs : 0,
        nodeCount: 0,
    }
    const greedyState = buildGreedyState(context, lockedMask)
    let bestOptimizedState = attachAmmoToPlacements(greedyState, ammoGroup, items)
    context.bestScore = bestOptimizedState.score
    if (bestOptimizedState.score >= targetScore) {
        return bestOptimizedState
    }

    try {
        search(context, 0, lockedMask, [], 0, 0, nextBestState => {
            // 每个完整状态都先计算弹药装载收益再比较，
            // 否则“优先装填腾出格子”的分支会因主分偏低被淘汰（如 10303209 的双枪装填解）
            const optimizedState = attachAmmoToPlacements(nextBestState, ammoGroup, items)
            if (
                optimizedState.score > context.bestScore ||
                (optimizedState.score === context.bestScore && optimizedState.placements.length > bestOptimizedState.placements.length)
            ) {
                bestOptimizedState = optimizedState
                context.bestScore = optimizedState.score
            }
            if (context.bestScore >= context.targetScore) {
                throw new TargetReachedSignal(bestOptimizedState)
            }
        })
    } catch (error) {
        if (error instanceof TargetReachedSignal) {
            return error.state
        }
        if (error instanceof BudgetExhaustedSignal) {
            return bestOptimizedState
        }
        throw error
    }
    return bestOptimizedState
}

/**
 * 深搜求最优摆放。
 * 叶子状态统一交给 updateBest 回调，由回调结合弹药装载收益比较优劣。
 * @param context 搜索上下文
 * @param groupIndex 当前组索引
 * @param occupiedMask 当前占用
 * @param placements 当前摆放
 * @param score 当前主分
 * @param skippedAmmoRounds 已跳过（未独立摆放）弹药的轮数，其装载收益在下界中单独计
 * @param updateBest 完整状态回调
 */
function search(
    context: SearchContext,
    groupIndex: number,
    occupiedMask: bigint,
    placements: WorkerPlacement[],
    score: number,
    skippedAmmoRounds: number,
    updateBest: (state: SolverState) => void
) {
    // 上界 = 主分 + 已跳过弹药的装载收益上界 + 后续组最优收益上界（含未决弹药的装载/摆放较大值）
    const optimisticScore = score + skippedAmmoRounds * context.maxPerRoundGain + (context.suffixBestScores[groupIndex] ?? 0)
    if (optimisticScore < context.bestScore) {
        return
    }

    // 时间预算兜底：定期检查，超时后终止搜索并返回已有最优解
    if (context.deadline > 0 && ++context.nodeCount % 4096 === 0 && Date.now() > context.deadline) {
        throw new BudgetExhaustedSignal()
    }

    if (groupIndex >= context.placementGroups.length) {
        updateBest({ score, placements: clonePlacements(placements) })
        return
    }

    const group = context.placementGroups[groupIndex]
    for (const candidate of group.candidates) {
        if ((candidate.bitmask & occupiedMask) !== 0n) {
            continue
        }
        placements.push(assignPlacement(candidate, group))
        search(
            context,
            groupIndex + 1,
            occupiedMask | candidate.bitmask,
            placements,
            score + candidate.score,
            skippedAmmoRounds,
            updateBest
        )
        placements.pop()
    }

    search(context, groupIndex + 1, occupiedMask, placements, score, skippedAmmoRounds + group.ammoRounds, updateBest)
}

/**
 * 构建一个快速贪心初始解，用于提高搜索下界。
 * @param context 搜索上下文
 * @param lockedMask 手动锁定占用
 * @returns 初始状态
 */
function buildGreedyState(context: SearchContext, lockedMask: bigint): SolverState {
    const placements: WorkerPlacement[] = []
    let occupiedMask = lockedMask
    let score = 0

    for (const group of context.placementGroups) {
        const bestCandidate = group.candidates.find(candidate => (candidate.bitmask & occupiedMask) === 0n)
        if (!bestCandidate) {
            continue
        }
        occupiedMask |= bestCandidate.bitmask
        score += bestCandidate.score
        placements.push(assignPlacement(bestCandidate, group))
    }

    return {
        score,
        placements,
    }
}

/**
 * 构建后缀最优上界。
 * 弹药组取“独立摆放收益”与“装载进枪械收益”的较大值而非两者叠加，避免上界过松导致剪枝失效。
 * @param groups 摆放组
 * @param maxPerRoundGain 每发弹药的装载收益上界
 * @returns 后缀分数
 */
function buildSuffixBestScores(groups: PlacementGroup[], maxPerRoundGain: number): number[] {
    const suffix = Array<number>(groups.length + 1).fill(0)
    for (let index = groups.length - 1; index >= 0; index--) {
        const group = groups[index]
        const attachBound = group.ammoRounds > 0 ? group.ammoRounds * maxPerRoundGain : 0
        suffix[index] = suffix[index + 1] + Math.max(group.bestScore, attachBound)
    }
    return suffix
}

/**
 * 构建弹药组。
 * @param entries 可用物品
 * @returns 弹药组
 */
function buildAmmoGroup(entries: Array<{ item: BackpackPuzzleItem; itemIndex: number }>): AmmoGroup | null {
    const ammoEntries = entries.filter(entry => entry.item.type === "Ammo")
    if (!ammoEntries.length) {
        return null
    }
    const ammoBasePoint = ammoEntries[0]?.item.basicPoint ?? 10
    return {
        itemIndexes: ammoEntries.map(entry => entry.itemIndex),
        ammoBasePoint,
        ammoRoundsByItemIndex: new Map(ammoEntries.map(entry => [entry.itemIndex, Math.max(0, entry.item.currentStack ?? 1)])),
        totalRounds: ammoEntries.reduce((sum, entry) => sum + Math.max(0, entry.item.currentStack ?? 1), 0),
    }
}

/**
 * 构建占格道具分组。
 * @param board 棋盘
 * @param entries 可用物品
 * @param boardWidth 棋盘宽度
 * @returns 分组
 */
function buildPlacementGroups(
    board: GridPoint[][],
    entries: Array<{ item: BackpackPuzzleItem; itemIndex: number }>,
    boardWidth: number
): PlacementGroup[] {
    const groupMap = new Map<string, { item: BackpackPuzzleItem; itemIndexes: number[] }>()

    for (const entry of entries) {
        // 弹药不参与同格堆叠，每个弹药独立占格
        const canStack = (entry.item.maxStack ?? 1) > 1 && entry.item.type !== "Ammo"
        const key = canStack ? `stack:${entry.item.id}` : `single:${entry.item.id}`
        const group = groupMap.get(key)
        if (group) {
            group.itemIndexes.push(entry.itemIndex)
        } else {
            groupMap.set(key, {
                item: entry.item,
                itemIndexes: [entry.itemIndex],
            })
        }
    }

    const result: PlacementGroup[] = []
    for (const [key, group] of groupMap.entries()) {
        // 弹药即使 maxStack 较大也按单件拆分成组，与其他道具的同格堆叠规则保持一致
        const stackLimit = group.item.type === "Ammo" ? 1 : Math.max(1, group.item.maxStack ?? 1)
        const chunkCount = Math.ceil(group.itemIndexes.length / stackLimit)
        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
            const chunkItemIndexes = group.itemIndexes.slice(chunkIndex * stackLimit, (chunkIndex + 1) * stackLimit)
            const anchorItemIndex = chunkItemIndexes[0]
            const candidates = getAllPlacements(
                board,
                group.item,
                anchorItemIndex,
                boardWidth,
                chunkItemIndexes,
                chunkItemIndexes.length,
                0
            )
            const bestScore = Math.max(0, ...candidates.map(candidate => candidate.score))
            result.push({
                key: `${key}:${chunkIndex}`,
                item: group.item,
                itemIndexes: chunkItemIndexes,
                stackCount: chunkItemIndexes.length,
                candidates,
                bestScore,
                // 该组未被独立摆放时可用于装载的弹数（非弹药组为 0）
                ammoRounds: group.item.type === "Ammo" ? chunkItemIndexes.length * Math.max(0, group.item.currentStack ?? 1) : 0,
            })
        }
    }

    return result.sort((left, right) => right.bestScore - left.bestScore)
}

/**
 * 把弹药装载到枪械摆放里。
 * @param state 当前求解状态
 * @param ammoGroup 弹药组
 * @param items 全部道具
 * @returns 附加弹药后的结果
 */
function attachAmmoToPlacements(state: SolverState, ammoGroup: AmmoGroup | null, items: BackpackPuzzleItem[]): SolverState {
    if (!ammoGroup) {
        return {
            score: state.score,
            placements: state.placements,
        }
    }

    const nextPlacements = state.placements.map(placement => ({
        ...placement,
        representedItemIndexes: [...placement.representedItemIndexes],
        attachedAmmoCount: 0,
    }))
    let totalScore = state.score

    const usedAmmoItemIndexes = new Set(
        nextPlacements.flatMap(placement => placement.representedItemIndexes.filter(itemIndex => items[itemIndex]?.type === "Ammo"))
    )
    let remainingRounds = ammoGroup.itemIndexes.reduce((sum, itemIndex) => {
        if (usedAmmoItemIndexes.has(itemIndex)) {
            return sum
        }
        return sum + (ammoGroup.ammoRoundsByItemIndex.get(itemIndex) ?? 0)
    }, 0)
    const ammoBasePoint = ammoGroup.ammoBasePoint
    const candidatePlacements = nextPlacements
        .map(placement => {
            const gunItem = items[placement.itemIndex]
            if (gunItem?.type !== "Gun") {
                return null
            }
            const scoreTier = getPlacementScoreTier(placement)
            if (scoreTier === 0) {
                return null
            }
            const perRoundGain = ammoBasePoint * (scoreTier === 2 ? 2 : 1)
            return {
                placement,
                perRoundGain,
            }
        })
        .filter((entry): entry is { placement: WorkerPlacement; perRoundGain: number } => Boolean(entry))
        .sort((left, right) => right.perRoundGain - left.perRoundGain)

    for (const { placement, perRoundGain } of candidatePlacements) {
        const gunItem = items[placement.itemIndex]
        if (gunItem.type !== "Gun") {
            continue
        }
        const remainingCapacity = Math.max(0, (gunItem.maxAmmo ?? 0) - (gunItem.currentAmmo ?? 0))
        const attachedRounds = Math.min(remainingCapacity, remainingRounds)
        if (attachedRounds <= 0) {
            continue
        }
        placement.attachedAmmoCount = attachedRounds
        remainingRounds -= attachedRounds
        totalScore += attachedRounds * perRoundGain
    }

    return {
        score: totalScore,
        placements: nextPlacements,
    }
}

/**
 * 为候选摆放绑定具体物品索引。
 * @param candidate 候选
 * @param group 分组
 * @returns 具体摆放
 */
function assignPlacement(candidate: CandidatePlacement, group: PlacementGroup): WorkerPlacement {
    const representedItemIndexes = [...group.itemIndexes]
    return {
        itemIndex: representedItemIndexes[0],
        x: candidate.x,
        y: candidate.y,
        rotationIndex: candidate.rotationIndex,
        score: candidate.score,
        covered: candidate.covered,
        cellCount: candidate.cellIndexes.length,
        representedItemIndexes,
        stackCount: representedItemIndexes.length,
        attachedAmmoCount: 0,
    }
}

/**
 * 复制摆放列表，避免回溯污染。
 * @param placements 摆放列表
 * @returns 深拷贝结果
 */
function clonePlacements(placements: WorkerPlacement[]): WorkerPlacement[] {
    return placements.map(placement => ({
        ...placement,
        representedItemIndexes: [...placement.representedItemIndexes],
    }))
}

/**
 * 计算手动摆放占用。
 * @param board 棋盘
 * @param items 全部道具
 * @param lockedPlacements 手动摆放
 * @param boardWidth 棋盘宽度
 * @returns mask
 */
function buildLockedMask(
    board: GridPoint[][],
    items: BackpackPuzzleItem[],
    lockedPlacements: ManualPlacement[],
    boardWidth: number
): bigint {
    let mask = 0n
    for (const placement of lockedPlacements) {
        const item = items[placement.itemIndex]
        // 弹药独立摆放同样需要锁定占格，避免求解结果与其重叠
        if (!item) {
            continue
        }
        const rotation = buildRotations(item)[placement.rotationIndex]
        if (!rotation) {
            continue
        }
        const candidate = evaluatePlacement(
            board,
            item,
            placement.itemIndex,
            rotation,
            placement.rotationIndex,
            placement.x,
            placement.y,
            boardWidth,
            [placement.itemIndex],
            1,
            0
        )
        if (candidate) {
            mask |= candidate.bitmask
        }
    }
    return mask
}

/**
 * 生成某类道具的全部合法摆放。
 * @param board 棋盘
 * @param item 道具
 * @param itemIndex 道具索引
 * @param boardWidth 棋盘宽度
 * @param representedItemIndexes 代表的物品索引
 * @param stackCount 堆叠数量
 * @param attachedAmmoCount 附带弹药数量
 * @returns 候选列表
 */
function getAllPlacements(
    board: GridPoint[][],
    item: BackpackPuzzleItem,
    itemIndex: number,
    boardWidth: number,
    representedItemIndexes: number[],
    stackCount: number,
    attachedAmmoCount: number
): CandidatePlacement[] {
    const placements: CandidatePlacement[] = []
    const rotations = buildRotations(item)

    for (const [rotationIndex, rotation] of rotations.entries()) {
        const height = rotation.length
        const width = rotation[0]?.length ?? 0
        for (let y = 0; y <= board.length - height; y++) {
            for (let x = 0; x <= boardWidth - width; x++) {
                const candidate = evaluatePlacement(
                    board,
                    item,
                    itemIndex,
                    rotation,
                    rotationIndex,
                    x,
                    y,
                    boardWidth,
                    representedItemIndexes,
                    stackCount,
                    attachedAmmoCount
                )
                if (candidate && candidate.score > 0) {
                    placements.push(candidate)
                }
            }
        }
    }

    return placements.sort((a, b) => {
        if (b.estimatedScore !== a.estimatedScore) {
            return b.estimatedScore - a.estimatedScore
        }
        if (b.score !== a.score) {
            return b.score - a.score
        }
        return b.covered - a.covered
    })
}

/**
 * 评估候选摆放。
 * @param board 棋盘
 * @param item 道具
 * @param itemIndex 道具索引
 * @param rotation 旋转形状
 * @param rotationIndex 旋转索引
 * @param offsetX 偏移 x
 * @param offsetY 偏移 y
 * @param boardWidth 棋盘宽度
 * @param representedItemIndexes 代表的物品索引
 * @param stackCount 堆叠数量
 * @param attachedAmmoCount 装载弹药数量
 * @returns 候选摆放
 */
function evaluatePlacement(
    board: GridPoint[][],
    item: BackpackPuzzleItem,
    itemIndex: number,
    rotation: number[][],
    rotationIndex: number,
    offsetX: number,
    offsetY: number,
    boardWidth: number,
    representedItemIndexes: number[],
    stackCount: number,
    attachedAmmoCount: number
): CandidatePlacement | null {
    let covered = 0
    let scoreTier: 0 | 1 | 2 = 2
    let bitmask = 0n
    const cellIndexes: number[] = []

    for (let y = 0; y < rotation.length; y++) {
        for (let x = 0; x < rotation[y].length; x++) {
            if (!rotation[y][x]) continue
            const targetX = offsetX + x
            const targetY = offsetY + y
            const cellType = board[targetY]?.[targetX]
            if (board[targetY]?.[targetX] === undefined) {
                return null
            }
            if (cellType === 2) {
                covered++
            }
            if (cellType === 1) {
                scoreTier = scoreTier === 2 ? 1 : scoreTier
            } else if (cellType === 0 || cellType === -1) {
                scoreTier = 0
            }
            const cellIndex = targetY * boardWidth + targetX
            cellIndexes.push(cellIndex)
            bitmask |= 1n << BigInt(cellIndex)
        }
    }

    const baseScore = getBasePlacementScore(item, representedItemIndexes)
    const score = scoreTier === 2 ? baseScore * 2 : scoreTier === 1 ? baseScore : 0
    const estimatedScore = item.type === "Gun" ? estimateGunPlacementScore(item, score, scoreTier) : score
    return {
        itemIndex,
        x: offsetX,
        y: offsetY,
        rotationIndex,
        score,
        estimatedScore,
        covered,
        cellCount: cellIndexes.length,
        representedItemIndexes,
        stackCount,
        attachedAmmoCount,
        bitmask,
        cellIndexes,
    }
}

/**
 * 估算枪械摆放在装弹后的潜在收益，用于优先搜索高价值分支。
 * @param item 枪械
 * @param score 当前主分
 * @param scoreTier 当前计分档位
 * @returns 估算分
 */
function estimateGunPlacementScore(item: BackpackPuzzleItem, score: number, scoreTier: 0 | 1 | 2): number {
    if (item.type !== "Gun" || scoreTier === 0) {
        return score
    }
    const ammoBasePoint = 50
    const ammoCapacity = Math.max(0, (item.maxAmmo ?? 0) - (item.currentAmmo ?? 0))
    return score + ammoCapacity * ammoBasePoint * (scoreTier === 2 ? 2 : 1)
}

/**
 * 计算单个物品基础分。
 * @param item 道具
 * @param ammoBasePoint 统一弹药基础分
 * @param currentAmmo 当前枪内弹药数
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
 * 计算一个摆放内主物品基础分。
 * @param item 主物品
 * @param representedItemIndexes 代表物品索引
 * @returns 基础分
 */
function getBasePlacementScore(item: BackpackPuzzleItem, representedItemIndexes: number[]): number {
    if (item.type === "Gun") {
        return getSingleItemBaseScore(item, 0)
    }
    return representedItemIndexes.length * getSingleItemBaseScore(item, 0)
}

/**
 * 获取摆放的计分档位。
 * @param placement 摆放
 * @returns 0 不计分 1 普通 2 双倍
 */
function getPlacementScoreTier(placement: WorkerPlacement): 0 | 1 | 2 {
    if (placement.cellCount === 0) {
        return 0
    }
    if (placement.covered === placement.cellCount) {
        return 2
    }
    return placement.score > 0 ? 1 : 0
}

/**
 * 获取所有旋转。
 * @param item 道具
 * @returns 旋转结果
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
 * @returns 规整后
 */
function normalizeShape(shape: number[][]): number[][] {
    const rows = shape.filter(row => row.some(Boolean))
    const cols = rows[0]?.map((_, index) => rows.some(row => Boolean(row[index]))) ?? []
    return rows.map(row => row.filter((_, index) => cols[index]))
}

/**
 * 顺时针旋转矩阵。
 * @param shape 形状
 * @returns 旋转后
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
