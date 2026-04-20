/**
 * 本地地图最短遍历与 TP 中转工具。
 */
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
 * 计算点位的最短遍历顺序。
 * 点位较少时使用精确动态规划，点位较多时回退最近邻贪心。
 */
export function computeShortestTraversalPath(points: TraversalPointLike[]): TraversalPointLike[] {
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
            let nearestDistance = Number.POSITIVE_INFINITY
            for (let i = 0; i < remaining.length; i += 1) {
                const distance = measureTraversalDistance(remaining[i], current)
                if (distance < nearestDistance) {
                    nearestDistance = distance
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
            const distance = measureTraversalDistance(orderedPoints[i], orderedPoints[j])
            distanceMatrix[i][j] = distance
            distanceMatrix[j][i] = distance
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
