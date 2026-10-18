/**
 * 本地地图最短遍历与 TP 中转工具。
 *
 * 障碍物只参与「走法决策」（直连 / 传送中转 / 不可达），地图上始终只画直线段。
 */
import type { NavConnectivity } from "./map-local-nav"

export interface TraversalPointLike {
    x: number
    y: number
    subRegionId?: number
    worldX?: number
    worldY?: number
}

export interface TraversalTeleportPoint extends TraversalPointLike {
    subRegionId: number
    tpId: number
}

export interface TraversalSegment {
    from: TraversalPointLike
    to: TraversalPointLike
    isDashed: boolean
}

/** 规划后的遍历腿。绘制一律是直线段，障碍物只用于决定走法。 */
export interface TraversalLeg {
    from: TraversalPointLike
    to: TraversalPointLike
    /** 该段直线是否撞上障碍（绕行或降级传送的依据） */
    blocked: boolean
    /** 是否为传送中转段（虚线绘制） */
    isDashed: boolean
    /** 直连撞障碍且找不到可用传送点，只能以直线示意 */
    unreachable: boolean
}

/**
 * 判定两点可通行性的回调。障碍物只用于决策，不参与绘制。
 * @param from 段起点
 * @param to 段终点
 * @returns 可通行性
 */
export type TraversalRouteResolver = (from: TraversalPointLike, to: TraversalPointLike) => NavConnectivity

/**
 * 直连可接受的最长世界距离（游戏单位）。
 * 超过该阈值时，即使直线不撞障碍也优先改用传送中转，避免画出横穿半张地图的长直线。
 */
export const TRAVERSAL_WALK_DISTANCE_LIMIT = 2e4

/**
 * 把最短遍历顺序规划成腿序列。障碍物只参与决策：
 *
 * 1. 直连不撞障碍且距离在 {@link TRAVERSAL_WALK_DISTANCE_LIMIT} 内 → 连直线；
 * 2. 直连撞障碍，或距离超过阈值 → 降级为「起点 → 传送点 → 终点」。
 *    玩家可以从任意位置传送到任意传送点，第一段是瞬移、不需要连通判定（虚线绘制）；
 *    真正要走的是第二段，因此按「传送点 → 终点」的距离取最近且该段不撞墙的传送点；
 *    若传送方案并不比直接走更省，则仍保留直线；
 * 3. 直线撞障碍且没有任何传送点能走到终点 → 标记为受阻，仍以直线示意并给出提示。
 *
 * 无论走哪种方案，输出都只有段的两端端点，地图上画直线。
 * @param path 遍历顺序
 * @param teleportPoints 候选传送点
 * @param threshold 直连距离阈值（世界单位）
 * @param route 可通行性回调，`null` 表示不做障碍物判定
 * @returns 规划后的腿序列
 */
export function buildRoutedTraversalLegs(
    path: TraversalPointLike[],
    teleportPoints: TraversalTeleportPoint[],
    threshold = 2e4,
    route: TraversalRouteResolver | null = null
): TraversalLeg[] {
    if (path.length < 2) return []

    if (!route) {
        return buildTraversalSegments(path, teleportPoints, threshold).map(segment => ({
            from: segment.from,
            to: segment.to,
            blocked: false,
            isDashed: segment.isDashed,
            unreachable: false,
        }))
    }

    const legs: TraversalLeg[] = []
    for (let i = 0; i < path.length - 1; i += 1) {
        const from = path[i]
        const to = path[i + 1]

        const direct = route(from, to)
        const walkDistance = measureTraversalDistance(from, to)
        // 直连畅行且距离在阈值内：直接连直线
        if (direct.direct && walkDistance <= threshold) {
            legs.push({ from, to, blocked: false, isDashed: false, unreachable: false })
            continue
        }

        // 需要降级传送的两种情况：直线撞障碍，或路程超过阈值（走太远不如传送）。
        // 玩家可以从任意位置传送到任意传送点，所以第一段是瞬移、不需要连通判定；
        // 真正要走的是第二段（传送点 → 终点），因此按该段距离排序，取最近且该段不撞墙的传送点。
        const preferred = to.subRegionId === undefined ? [] : teleportPoints.filter(tp => tp.subRegionId === to.subRegionId)
        const candidates =
            preferred.length > 0 ? [...preferred, ...teleportPoints.filter(tp => tp.subRegionId !== to.subRegionId)] : teleportPoints
        let best: { tp: TraversalTeleportPoint; length: number } | null = null
        for (const tp of candidates) {
            if (!route(tp, to).direct) continue
            const length = measureTraversalDistance(tp, to)
            if (!best || length < best.length) best = { tp, length }
        }

        if (best) {
            // 传送方案必须确实比走路省，否则不如直接走过去
            if (direct.direct && best.length >= walkDistance) {
                legs.push({ from, to, blocked: false, isDashed: false, unreachable: false })
                continue
            }
            legs.push({ from, to: best.tp, blocked: !direct.direct, isDashed: true, unreachable: false })
            legs.push({ from: best.tp, to, blocked: false, isDashed: false, unreachable: false })
            continue
        }

        if (direct.direct) {
            legs.push({ from, to, blocked: false, isDashed: false, unreachable: false })
            continue
        }

        // 直线撞障碍且没有任何传送点能走到终点：标记为受阻，仍以直线示意
        legs.push({ from, to, blocked: true, isDashed: true, unreachable: true })
    }

    return legs
}

/**
 * 计算两个遍历点之间的距离。
 * 优先使用 world 坐标，缺失时回退到 map 坐标。
 */
export function measureTraversalDistance(a: TraversalPointLike, b: TraversalPointLike): number {
    if (Number.isFinite(a.worldX) && Number.isFinite(a.worldY) && Number.isFinite(b.worldX) && Number.isFinite(b.worldY)) {
        return Math.hypot((a.worldX || 0) - (b.worldX || 0), (a.worldY || 0) - (b.worldY || 0))
    }
    return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * 撞上障碍的段在顺序规划里的代价放大系数。
 *
 * 顺序规划不能简单地把撞墙的段设为不可用（那会让很多点排不出顺序），
 * 而是把它当成「代价很高的边」：既保留可行性，又让 DP 优先选择不需要穿墙的走法，
 * 从而在加入障碍后自动重排出更合理的访问顺序。
 */
const TRAVERSAL_BLOCKED_EDGE_PENALTY = 4

/**
 * 计算两个遍历点之间的规划代价。
 *
 * 基础代价是两点距离；若该段直线撞上障碍，则乘上 {@link TRAVERSAL_BLOCKED_EDGE_PENALTY}，
 * 让顺序规划倾向于避开障碍，从而在障碍物变化后重新排出更优路径。
 * @param a 起点
 * @param b 终点
 * @param route 可通行性回调，`null` 表示不做障碍物判定
 * @returns 规划代价
 */
function measurePlanningCost(a: TraversalPointLike, b: TraversalPointLike, route: TraversalRouteResolver | null): number {
    const distance = measureTraversalDistance(a, b)
    if (!route || route(a, b).direct) return distance
    return distance * TRAVERSAL_BLOCKED_EDGE_PENALTY
}

/**
 * 计算点位的最短遍历顺序。
 *
 * 点位较少时使用精确动态规划，点位较多时回退最近邻贪心。
 * 提供可通行性回调时，撞障碍的段代价会被放大，使顺序规划能避开障碍重新排序。
 * @param points 待遍历点位
 * @param route 可通行性回调，`null` 表示按纯距离规划
 * @returns 遍历顺序
 */
export function computeShortestTraversalPath(
    points: TraversalPointLike[],
    route: TraversalRouteResolver | null = null
): TraversalPointLike[] {
    if (points.length <= 1) return points

    if (points.length > 12) {
        const orderedPoints = points.map(point => point)
        const remaining = orderedPoints.map(point => point)
        const path: TraversalPointLike[] = []
        let current = remaining.shift() || null
        if (!current) return []
        path.push(current)

        while (remaining.length > 0) {
            let nearestIndex = 0
            let nearestCost = Number.POSITIVE_INFINITY
            for (let i = 0; i < remaining.length; i += 1) {
                const cost = measurePlanningCost(remaining[i], current, route)
                if (cost < nearestCost) {
                    nearestCost = cost
                    nearestIndex = i
                }
            }
            current = remaining.splice(nearestIndex, 1)[0] || null
            if (!current) break
            path.push(current)
        }

        return path
    }

    const orderedPoints = points.map(point => point)
    const count = orderedPoints.length
    const fullMask = 1 << count
    const distanceMatrix = Array.from({ length: count }, () => Array.from({ length: count }, () => 0))
    for (let i = 0; i < count; i += 1) {
        for (let j = i + 1; j < count; j += 1) {
            const cost = measurePlanningCost(orderedPoints[i], orderedPoints[j], route)
            distanceMatrix[i][j] = cost
            distanceMatrix[j][i] = cost
        }
    }

    const dp = Array.from({ length: fullMask }, () => Array.from({ length: count }, () => Number.POSITIVE_INFINITY))
    const parent = Array.from({ length: fullMask }, () => Array.from({ length: count }, () => -1))

    dp[1][0] = 0

    for (let mask = 1; mask < fullMask; mask += 1) {
        for (let last = 0; last < count; last += 1) {
            const currentDistance = dp[mask][last]
            if (!Number.isFinite(currentDistance)) continue
            for (let next = 0; next < count; next += 1) {
                if (mask & (1 << next)) continue
                const nextMask = mask | (1 << next)
                const candidate = currentDistance + distanceMatrix[last][next]
                if (candidate < dp[nextMask][next]) {
                    dp[nextMask][next] = candidate
                    parent[nextMask][next] = last
                }
            }
        }
    }

    let bestLast = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let last = 0; last < count; last += 1) {
        if (dp[fullMask - 1][last] < bestDistance) {
            bestDistance = dp[fullMask - 1][last]
            bestLast = last
        }
    }

    const orderedIndices: number[] = []
    let mask = fullMask - 1
    let last = bestLast
    while (last !== -1) {
        orderedIndices.push(last)
        const prev = parent[mask][last]
        mask &= ~(1 << last)
        last = prev
    }

    orderedIndices.reverse()
    return orderedIndices.map(index => orderedPoints[index]).filter((point): point is TraversalPointLike => Boolean(point))
}

/**
 * 计算单段连线是否应通过最近 TP 中转。
 * 仅当 TP 到目标点距离优于直连时，才使用 TP 虚线中转。
 */
export function buildTraversalSegments(
    path: TraversalPointLike[],
    teleportPoints: TraversalTeleportPoint[],
    threshold = 2e4
): TraversalSegment[] {
    if (path.length < 2) return []

    const segments: TraversalSegment[] = []
    for (let i = 0; i < path.length - 1; i += 1) {
        const from = path[i]
        const to = path[i + 1]
        const directDistance = measureTraversalDistance(from, to)

        if (directDistance < threshold) {
            segments.push({ from, to, isDashed: false })
            continue
        }

        let nearestTp: TraversalTeleportPoint | null = null
        let bestTpDistanceToTarget = Number.POSITIVE_INFINITY
        const preferredTeleportPoints =
            to.subRegionId === undefined ? [] : teleportPoints.filter(tpPoint => tpPoint.subRegionId === to.subRegionId)
        const candidateTeleportPoints = preferredTeleportPoints.length > 0 ? preferredTeleportPoints : teleportPoints

        for (const tpPoint of candidateTeleportPoints) {
            const tpToToDistance = measureTraversalDistance(tpPoint, to)
            if (tpToToDistance < directDistance && tpToToDistance < bestTpDistanceToTarget) {
                bestTpDistanceToTarget = tpToToDistance
                nearestTp = tpPoint
            }
        }

        if (nearestTp) {
            segments.push({ from, to: nearestTp, isDashed: true })
            segments.push({ from: nearestTp, to, isDashed: false })
            continue
        }

        segments.push({ from, to, isDashed: false })
    }

    return segments
}
