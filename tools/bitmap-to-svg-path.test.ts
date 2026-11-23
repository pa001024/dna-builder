import { describe, expect, it } from "vitest"
import { rgbaToSvgPath } from "./bitmap-to-svg-path"
import { fitSvgContour, type Point } from "./fit-svg-contour"

function trace(rows: string[], palette: Record<string, number[]>): string {
    return rgbaToSvgPath(new Uint8Array(rows.flatMap(row => Array.from(row).flatMap(pixel => palette[pixel]))), rows[0].length, rows.length)
}

const transparent = { "#": [0, 0, 0, 255], ".": [255, 255, 255, 0] }

function isFilled(path: string, x: number, y: number): boolean {
    let filled = false
    for (const match of path.matchAll(/M([^Z]+)Z/g)) {
        const points: Point[] = []
        for (const [, command, coordinates] of `M${match[1]}`.matchAll(/([MLC])([^MLC]+)/g)) {
            const values = coordinates.split(" ").map(Number)
            if (command === "C") {
                const start = points.at(-1)!
                for (let i = 1; i <= 24; i++) {
                    const t = i / 24
                    const s = 1 - t
                    points.push([
                        s ** 3 * start[0] + 3 * s * s * t * values[0] + 3 * s * t * t * values[2] + t ** 3 * values[4],
                        s ** 3 * start[1] + 3 * s * s * t * values[1] + 3 * s * t * t * values[3] + t ** 3 * values[5],
                    ])
                }
            } else points.push([values[0], values[1]])
        }
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const [ax, ay] = points[i]
            const [bx, by] = points[j]
            if (ay > y !== by > y && x < ax + ((bx - ax) * (y - ay)) / (by - ay)) filled = !filled
        }
    }
    return filled
}

describe("位图描摹 SVG path", () => {
    it("把抗锯齿圆环拟合成少量非退化三次曲线，并保持内孔", () => {
        const size = 64
        const rgba = new Uint8Array(size * size * 4)
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2)
                rgba[(y * size + x) * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, 24.5 - distance, distance - 13.5)))
            }
        }
        const path = rgbaToSvgPath(rgba, size, size)
        expect(path.match(/M/g)).toHaveLength(2)
        expect(path).not.toContain("L")
        expect(path.match(/C/g)?.length).toBeLessThanOrEqual(12)
        for (const match of path.matchAll(/([MC])([^MCZ]+)(?=C)/g)) {
            const start = match[2].split(" ").map(Number).slice(-2)
            const [bx, by, , , dx, dy] = path
                .slice(match.index + match[0].length + 1)
                .split(/[CZ]/)[0]
                .split(" ")
                .map(Number)
            expect(Math.abs((bx - start[0]) * (dy - start[1]) - (by - start[1]) * (dx - start[0]))).toBeGreaterThan(0.1)
        }
        expect(isFilled(path, 12, 12)).toBe(false)
        expect(isFilled(path, 12, 5)).toBe(true)
        expect(isFilled(path, 3, 3)).toBe(false)
    })

    it("不把矩形的四条直边和尖角拟合成圆弧", () => {
        const points: Point[] = [
            [0, 0],
            [5, 0],
            [10, 0],
            [10, 5],
            [10, 10],
            [5, 10],
            [0, 10],
            [0, 5],
        ]
        expect(fitSvgContour(points, ([x, y]) => `${x} ${y}`)).toBe("M0 0L10 0L10 10L0 10L0 0Z")
    })

    it("从两侧直边还原被采样削平的箭尖", () => {
        const outline: Point[] = [
            [9.6, 0.4],
            [10.4, 0.4],
            [13, 3],
            [16, 6],
            [20, 10],
            [13, 10],
            [7, 10],
            [0, 10],
            [4, 6],
            [7, 3],
        ]
        const path = fitSvgContour(outline, point => point.map(value => value.toFixed(3)).join(" "))
        expect(path.match(/[ML]10\.000 -?0\.000/g)).not.toBeNull()
        expect(path).not.toContain("C")
    })

    it("按 alpha 描摹黑色轮廓，保留孔洞与分离的图形", () => {
        const path = trace(["........", ".####.#.", ".#..#.#.", ".#..#...", ".####...", "........"], transparent)
        expect(path.match(/M/g)).toHaveLength(3)
        expect(isFilled(path, 4.5, 10.5)).toBe(true)
        expect(isFilled(path, 7.5, 10.5)).toBe(false)
        expect(isFilled(path, 19.5, 10.5)).toBe(true)
    })

    it.each([0, 255])("在不透明的 %i 背景上按亮度描摹", background => {
        const foreground = 255 - background
        const path = trace(["....", ".##.", ".##.", "...."], {
            ".": [background, background, background, 255],
            "#": [foreground, foreground, foreground, 255],
        })
        expect(path.match(/M/g)).toHaveLength(1)
        expect(isFilled(path, 12, 12)).toBe(true)
        expect(isFilled(path, 3, 3)).toBe(false)
    })

    it("保持非方形画布的比例并垂直居中，不拉伸图形", () => {
        const path = trace(["####", "####"], transparent)
        // 全不透明时使用明暗；加一圈透明像素来验证 alpha 画布。
        const centered = trace(["......", ".####.", ".####.", "......"], transparent)
        expect(path).toBe("")
        expect(isFilled(centered, 5, 12)).toBe(true)
        expect(isFilled(centered, 12, 5)).toBe(false)
        expect(isFilled(centered, 12, 19)).toBe(false)
    })

    it("平局时不把对角相接的像素合并，空白图没有轮廓", () => {
        expect(trace(["#.", ".#"], transparent).match(/M/g)).toHaveLength(2)
        expect(trace(["..", ".."], transparent)).toBe("")
    })
})
