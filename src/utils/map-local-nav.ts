/**
 * 地图路径的障碍线段碰撞检测。
 *
 * 障碍以「静态标注的世界坐标线段」形式给出（见 `map-wall.data.ts`），
 * 规划时把候选直线投影到地图空间后与这些线段做相交检测：
 * 相交说明该路径不可通行，交由调用方决定绕行或降级到传送点。
 */

/** 一条障碍线段（地图空间）。 */
export interface NavWallSegment {
    ax: number
    ay: number
    bx: number
    by: number
    /** 轴对齐包围盒，用于相交前的快速排除 */
    minX: number
    minY: number
    maxX: number
    maxY: number
}

/**
 * 把世界坐标线段批量投影成地图空间线段。
 * @param segments 世界坐标线段列表
 * @param project 世界坐标 → 地图空间坐标的投影函数
 * @returns 地图空间障碍线段集合
 */
export function buildNavWalls(
    segments: { from: [number, number]; to: [number, number] }[],
    project: (worldX: number, worldY: number) => { x: number; y: number }
): NavWallSegment[] {
    const walls: NavWallSegment[] = []
    for (const segment of segments) {
        const from = project(segment.from[0], segment.from[1])
        const to = project(segment.to[0], segment.to[1])
        if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) continue
        walls.push({
            ax: from.x,
            ay: from.y,
            bx: to.x,
            by: to.y,
            minX: Math.min(from.x, to.x),
            minY: Math.min(from.y, to.y),
            maxX: Math.max(from.x, to.x),
            maxY: Math.max(from.y, to.y),
        })
    }
    return walls
}

/**
 * 判定两条线段是否相交（含共线重叠）。
 * @param a 线段 A
 * @param b 线段 B
 * @returns 相交返回 `true`
 */
function segmentsIntersect(a: NavWallSegment, b: NavWallSegment): boolean {
    const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number) => (px - ox) * (qy - oy) - (py - oy) * (qx - ox)

    const d1 = cross(a.ax, a.ay, a.bx, a.by, b.ax, b.ay)
    const d2 = cross(a.ax, a.ay, a.bx, a.by, b.bx, b.by)
    const d3 = cross(b.ax, b.ay, b.bx, b.by, a.ax, a.ay)
    const d4 = cross(b.ax, b.ay, b.bx, b.by, a.bx, a.by)

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true

    // 共线情形：端点落在另一条线段的包围盒内
    const onSegment = (ox: number, oy: number, px: number, py: number, qx: number, qy: number) =>
        Math.min(ox, px) - 1e-9 <= qx && qx <= Math.max(ox, px) + 1e-9 && Math.min(oy, py) - 1e-9 <= qy && qy <= Math.max(oy, py) + 1e-9
    if (d1 === 0 && onSegment(a.ax, a.ay, a.bx, a.by, b.ax, b.ay)) return true
    if (d2 === 0 && onSegment(a.ax, a.ay, a.bx, a.by, b.bx, b.by)) return true
    if (d3 === 0 && onSegment(b.ax, b.ay, b.bx, b.by, a.ax, a.ay)) return true
    if (d4 === 0 && onSegment(b.ax, b.ay, b.bx, b.by, a.bx, a.by)) return true
    return false
}

/** 两点间的可通行性判定结果。只回答「能不能走通」，不产出用于绘制的折线。 */
export interface NavConnectivity {
    /** 直线不撞任何障碍 */
    direct: boolean
    /** 撞上的障碍线段数量，`0` 表示畅通 */
    hits: number
}

/** 直线畅通时的连通性结果（常量复用）。 */
const NAV_CONNECTIVITY_DIRECT: NavConnectivity = { direct: true, hits: 0 }

/**
 * 判定两点之间的直线能否通行。
 * @param walls 障碍线段（地图空间）；为空时一律视为可通行
 * @param from 起点（地图空间）
 * @param to 终点（地图空间）
 * @returns 可通行性
 */
export function queryNavConnectivity(
    walls: NavWallSegment[],
    from: { x: number; y: number },
    to: { x: number; y: number }
): NavConnectivity {
    if (walls.length === 0) return NAV_CONNECTIVITY_DIRECT

    const minX = Math.min(from.x, to.x)
    const minY = Math.min(from.y, to.y)
    const maxX = Math.max(from.x, to.x)
    const maxY = Math.max(from.y, to.y)
    const probe: NavWallSegment = { ax: from.x, ay: from.y, bx: to.x, by: to.y, minX, minY, maxX, maxY }

    let hits = 0
    for (const wall of walls) {
        if (wall.maxX < minX || wall.minX > maxX || wall.maxY < minY || wall.minY > maxY) continue
        if (segmentsIntersect(probe, wall)) hits += 1
    }
    return hits === 0 ? NAV_CONNECTIVITY_DIRECT : { direct: false, hits }
}
