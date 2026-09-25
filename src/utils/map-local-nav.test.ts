import { describe, expect, it } from "vitest"
import { buildNavWalls, queryNavConnectivity } from "./map-local-nav"

describe("buildNavWalls", () => {
    it("把世界坐标线段投影成地图空间线段并算出包围盒", () => {
        const walls = buildNavWalls(
            [
                { from: [0, 0], to: [100, 200] },
                { from: [50, 20], to: [10, 5] },
            ],
            (x, y) => ({ x: x + 1000, y: y + 2000 })
        )
        expect(walls).toHaveLength(2)
        expect(walls[0]).toMatchObject({ ax: 1000, ay: 2000, bx: 1100, by: 2200, minX: 1000, minY: 2000, maxX: 1100, maxY: 2200 })
        // 第二段终点在起点左上方，包围盒需按 min/max 归一
        expect(walls[1]).toMatchObject({ minX: 1010, minY: 2005, maxX: 1050, maxY: 2020 })
    })

    it("投影结果非法（NaN）的线段被跳过", () => {
        const walls = buildNavWalls([{ from: [0, 0], to: [1, 1] }], () => ({ x: Number.NaN, y: 0 }))
        expect(walls).toHaveLength(0)
    })

    it("空输入返回空数组", () => {
        expect(buildNavWalls([], (x, y) => ({ x, y }))).toHaveLength(0)
    })
})

describe("queryNavConnectivity", () => {
    /**
     * 构造一条竖墙（x = 50，y 从 0 到 100）。
     * @returns 障碍线段列表
     */
    function verticalWall() {
        return buildNavWalls([{ from: [50, 0], to: [50, 100] }], (x, y) => ({ x, y }))
    }

    it("没有障碍时一律视为可通行", () => {
        expect(queryNavConnectivity([], { x: 0, y: 50 }, { x: 100, y: 50 })).toEqual({ direct: true, hits: 0 })
    })

    it("不与墙相交的路径判定为可通行", () => {
        // 墙在 y = 0~100，路径走 y = -50 不会碰到
        expect(queryNavConnectivity(verticalWall(), { x: 0, y: -50 }, { x: 100, y: -50 })).toEqual({ direct: true, hits: 0 })
    })

    it("横穿墙的路径判定为受阻并给出撞墙次数", () => {
        const result = queryNavConnectivity(verticalWall(), { x: 0, y: 50 }, { x: 100, y: 50 })
        expect(result.direct).toBe(false)
        expect(result.hits).toBe(1)
    })

    it("绕开墙端点的路径判定为可通行", () => {
        // 墙在 y = 0~100，从 y = 200 横穿不会碰到
        expect(queryNavConnectivity(verticalWall(), { x: 0, y: 200 }, { x: 100, y: 200 }).direct).toBe(true)
    })

    it("路径终点正好落在墙上端点时判定为受阻（共线端点算相交）", () => {
        const result = queryNavConnectivity(verticalWall(), { x: 0, y: -50 }, { x: 50, y: 0 })
        expect(result.direct).toBe(false)
    })

    it("路径撞上多条墙时累计次数", () => {
        const walls = buildNavWalls(
            [
                { from: [30, 0], to: [30, 100] },
                { from: [60, 0], to: [60, 100] },
            ],
            (x, y) => ({ x, y })
        )
        const result = queryNavConnectivity(walls, { x: 0, y: 50 }, { x: 100, y: 50 })
        expect(result.direct).toBe(false)
        expect(result.hits).toBe(2)
    })

    it("路径完全在包围盒之外时不做精确检测", () => {
        const walls = buildNavWalls([{ from: [1000, 1000], to: [1100, 1100] }], (x, y) => ({ x, y }))
        expect(queryNavConnectivity(walls, { x: 0, y: 0 }, { x: 100, y: 100 }).direct).toBe(true)
    })
})
