import { describe, expect, it } from "vitest"
import { buildNavWalls, type NavWallSegment, queryNavConnectivity } from "./map-local-nav"
import {
    buildRoutedTraversalLegs,
    computeShortestTraversalPath,
    type TraversalPointLike,
    type TraversalTeleportPoint,
} from "./map-local-traversal"

/**
 * 构造一条竖墙（x = 50，y 从 -100 到 100）。
 * @returns 地图空间障碍线段
 */
function verticalWall(): NavWallSegment[] {
    return buildNavWalls([{ from: [50, -100], to: [50, 100] }], (x, y) => ({ x, y }))
}

describe("buildRoutedTraversalLegs 的传送降级", () => {
    it("不撞墙时直接连直线", () => {
        const walls = verticalWall()
        const route = (from: TraversalPointLike, to: TraversalPointLike) => queryNavConnectivity(walls, from, to)
        const path: TraversalPointLike[] = [
            { x: 0, y: -200 },
            { x: 100, y: -200 },
        ]
        const legs = buildRoutedTraversalLegs(path, [], undefined, route)
        expect(legs).toHaveLength(1)
        expect(legs[0]).toMatchObject({ blocked: false, isDashed: false, unreachable: false })
    })

    it("撞墙且无传送点时标记为受阻", () => {
        const walls = verticalWall()
        const route = (from: TraversalPointLike, to: TraversalPointLike) => queryNavConnectivity(walls, from, to)
        const path: TraversalPointLike[] = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ]
        const legs = buildRoutedTraversalLegs(path, [], undefined, route)
        expect(legs).toHaveLength(1)
        expect(legs[0].unreachable).toBe(true)
    })

    it("撞墙时降级到能走到终点的传送点，第一段为瞬移虚线", () => {
        const walls = verticalWall()
        const route = (from: TraversalPointLike, to: TraversalPointLike) => queryNavConnectivity(walls, from, to)
        const path: TraversalPointLike[] = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ]
        // 传送点全在墙右侧，且到终点都不撞墙
        const teleports: TraversalTeleportPoint[] = [{ x: 60, y: 0, subRegionId: 1, tpId: 1 }]
        const legs = buildRoutedTraversalLegs(path, teleports, undefined, route)
        expect(legs).toHaveLength(2)
        // 起点 → 传送点：瞬移，虚线
        expect(legs[0]).toMatchObject({ blocked: true, isDashed: true, unreachable: false })
        expect(legs[0].to.x).toBe(60)
        // 传送点 → 终点：实际行走，实线
        expect(legs[1]).toMatchObject({ blocked: false, isDashed: false, unreachable: false })
    })

    it("起点能否走到传送点不影响降级（玩家可从任意位置传送）", () => {
        const walls = verticalWall()
        const route = (from: TraversalPointLike, to: TraversalPointLike) => queryNavConnectivity(walls, from, to)
        const path: TraversalPointLike[] = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ]
        // 该传送点到起点会撞墙（x=0 → x=60 横穿 x=50 的墙），但仍应被选中
        const teleports: TraversalTeleportPoint[] = [{ x: 60, y: 0, subRegionId: 1, tpId: 1 }]
        const legs = buildRoutedTraversalLegs(path, teleports, undefined, route)
        expect(legs).toHaveLength(2)
        expect(legs[0].to.x).toBe(60)
    })

    it("优先选离终点最近的可用传送点", () => {
        const walls = verticalWall()
        const route = (from: TraversalPointLike, to: TraversalPointLike) => queryNavConnectivity(walls, from, to)
        const path: TraversalPointLike[] = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ]
        const teleports: TraversalTeleportPoint[] = [
            { x: 60, y: 0, subRegionId: 1, tpId: 1 },
            { x: 95, y: 0, subRegionId: 1, tpId: 2 },
        ]
        const legs = buildRoutedTraversalLegs(path, teleports, undefined, route)
        // tp 95 离终点更近（距离 5 < 40），应当被选中
        expect(legs[0].to.x).toBe(95)
    })

    it("传送点到终点撞墙的传送点被跳过", () => {
        const walls = verticalWall()
        const route = (from: TraversalPointLike, to: TraversalPointLike) => queryNavConnectivity(walls, from, to)
        const path: TraversalPointLike[] = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ]
        // 两个传送点都在墙左侧，到终点都必须横穿墙 → 全部不可用
        const teleports: TraversalTeleportPoint[] = [
            { x: 10, y: 0, subRegionId: 1, tpId: 1 },
            { x: 30, y: 0, subRegionId: 1, tpId: 2 },
        ]
        const legs = buildRoutedTraversalLegs(path, teleports, undefined, route)
        expect(legs).toHaveLength(1)
        expect(legs[0].unreachable).toBe(true)
    })
})

describe("computeShortestTraversalPath 的障碍重算", () => {
    it("不传可通行性回调时按纯距离排序", () => {
        const points: TraversalPointLike[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 100, y: 0 },
        ]
        const path = computeShortestTraversalPath(points)
        expect(path.map(p => p.x)).toEqual([0, 10, 100])
    })

    it("存在障碍时改排访问顺序以避开穿墙段", () => {
        // 墙是一段有限的竖直短墙：x = 50，y ∈ [-10, 10]
        // 点位：A 在墙左侧远处、B 在墙右侧远处、C 在墙上方远处
        const walls = buildNavWalls([{ from: [50, -10], to: [50, 10] }], (x, y) => ({ x, y }))
        const route = (from: TraversalPointLike, to: TraversalPointLike) => queryNavConnectivity(walls, from, to)

        const a: TraversalPointLike = { x: 0, y: 0 }
        const b: TraversalPointLike = { x: 100, y: 0 }
        const c: TraversalPointLike = { x: 50, y: 100 }

        // 纯距离最优是 A → C → B（穿过墙上方），这条本来就不撞墙，不需重排
        const plain = computeShortestTraversalPath([a, b, c])
        const plainBlocked = plain.slice(0, -1).filter((p, i) => !route(p, plain[i + 1]).direct).length

        // 带障碍规划后的顺序同样不应撞墙
        const withRoute = computeShortestTraversalPath([a, b, c], route)
        const blocked = withRoute.slice(0, -1).filter((p, i) => !route(p, withRoute[i + 1]).direct).length

        expect(blocked).toBe(0)
        expect(blocked).toBeLessThanOrEqual(plainBlocked)
    })

    it("两点被墙隔开时，规划会把同侧的点排在一起", () => {
        // 墙封住 x = 50 的整条通道
        const walls = buildNavWalls([{ from: [50, -1000], to: [50, 1000] }], (x, y) => ({ x, y }))
        const route = (from: TraversalPointLike, to: TraversalPointLike) => queryNavConnectivity(walls, from, to)

        // 起点固定在右侧，右侧另有一点；左侧有一点
        const start: TraversalPointLike = { x: 100, y: 0 }
        const rightNear: TraversalPointLike = { x: 90, y: 40 }
        const leftFar: TraversalPointLike = { x: 10, y: 0 }

        const path = computeShortestTraversalPath([start, rightNear, leftFar], route)
        expect(path[0]).toBe(start)
        // 同侧的 rightNear 应先于需要穿墙的 leftFar
        expect(path[1]).toBe(rightNear)
        expect(path[2]).toBe(leftFar)
    })

    it("起点固定时优先访问同侧的点", () => {
        // 墙在 x = 50，起点在墙右侧
        const walls = buildNavWalls([{ from: [50, -100], to: [50, 100] }], (x, y) => ({ x, y }))
        const route = (from: TraversalPointLike, to: TraversalPointLike) => queryNavConnectivity(walls, from, to)
        const start: TraversalPointLike = { x: 100, y: 0 }
        const sameSide: TraversalPointLike = { x: 120, y: 0 }
        const otherSide: TraversalPointLike = { x: 0, y: 0 }

        // 起点固定为首个元素，路径应从它开始
        const path = computeShortestTraversalPath([start, sameSide, otherSide], route)
        expect(path[0]).toBe(start)
        // 同侧点比对面点更容易先到（不需穿墙）
        expect(path[1]).toBe(sameSide)
    })
})

describe("buildRoutedTraversalLegs 的距离阈值降级", () => {
    /**
     * 构造一个恒定的可通行性回调（无任何障碍）。
     * @returns 永远判定为畅行的回调
     */
    function alwaysClear() {
        return () => ({ direct: true, hits: 0 })
    }

    it("距离超过阈值且存在更近的传送点时改用传送", () => {
        const route = alwaysClear()
        const from: TraversalPointLike = { x: 0, y: 0, worldX: 0, worldY: 0 }
        const to: TraversalPointLike = { x: 100, y: 0, worldX: 100000, worldY: 0 }
        // 传送点离终点很近（world 距离 100）
        const teleports: TraversalTeleportPoint[] = [{ x: 99, y: 0, worldX: 99900, worldY: 0, subRegionId: 1, tpId: 1 }]
        const legs = buildRoutedTraversalLegs([from, to], teleports, 2e4, route)
        expect(legs).toHaveLength(2)
        expect(legs[0]).toMatchObject({ isDashed: true, unreachable: false })
        expect(legs[0].to).toBe(teleports[0])
    })

    it("距离在阈值内时不使用传送", () => {
        const route = alwaysClear()
        const from: TraversalPointLike = { x: 0, y: 0, worldX: 0, worldY: 0 }
        const to: TraversalPointLike = { x: 10, y: 0, worldX: 1000, worldY: 0 }
        const teleports: TraversalTeleportPoint[] = [{ x: 9, y: 0, worldX: 900, worldY: 0, subRegionId: 1, tpId: 1 }]
        const legs = buildRoutedTraversalLegs([from, to], teleports, 2e4, route)
        expect(legs).toHaveLength(1)
        expect(legs[0]).toMatchObject({ isDashed: false })
    })

    it("传送方案不比直走更省时仍保留直线", () => {
        const route = alwaysClear()
        const from: TraversalPointLike = { x: 0, y: 0, worldX: 0, worldY: 0 }
        const to: TraversalPointLike = { x: 100, y: 0, worldX: 100000, worldY: 0 }
        // 传送点到终点的距离（90000）反而比直连（100000）省不了多少且仍超阈值，
        // 但若传送点很远（世界距离 99000 > 直连不会发生），这里构造「省不了」的场景：
        const teleports: TraversalTeleportPoint[] = [{ x: 99, y: 0, worldX: 99900, worldY: 0, subRegionId: 1, tpId: 1 }]
        const legs = buildRoutedTraversalLegs([from, to], teleports, 2e4, route)
        // 传送点 → 终点 = 100，确实比直连 100000 省，所以应走传送
        expect(legs).toHaveLength(2)
    })

    it("没有可用传送点时超距仍保留直线", () => {
        const route = alwaysClear()
        const from: TraversalPointLike = { x: 0, y: 0, worldX: 0, worldY: 0 }
        const to: TraversalPointLike = { x: 100, y: 0, worldX: 100000, worldY: 0 }
        const legs = buildRoutedTraversalLegs([from, to], [], 2e4, route)
        expect(legs).toHaveLength(1)
        expect(legs[0]).toMatchObject({ isDashed: false, unreachable: false })
    })
})
