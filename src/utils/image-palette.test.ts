import { describe, expect, it } from "vitest"
import type { Rgb } from "./color"
import { quantizeColors } from "./image-palette"

/** 生成 count 个相同颜色。 */
function repeat(rgb: Rgb, count: number): Rgb[] {
    return Array.from({ length: count }, () => [...rgb] as Rgb)
}

describe("image-palette", () => {
    describe("quantizeColors", () => {
        it("空输入返回空数组", () => {
            expect(quantizeColors([], 8)).toEqual([])
            expect(quantizeColors(repeat([10, 20, 30], 4), 0)).toEqual([])
        })

        it("单一颜色构成的图片只返回该颜色", () => {
            expect(quantizeColors(repeat([18, 52, 86], 50), 8)).toEqual([[18, 52, 86]])
        })

        it("纯色像素不会被重复切分成多个桶", () => {
            expect(quantizeColors(repeat([255, 255, 255], 4), 5)).toHaveLength(1)
        })

        it("目标数量为 1 时返回整体均值", () => {
            expect(quantizeColors([...repeat([0, 0, 0], 5), ...repeat([100, 100, 100], 5)], 1)).toEqual([[50, 50, 50]])
        })

        it("明显分离的两个色簇会各占一个主色", () => {
            const pixels = [...repeat([0, 0, 0], 10), ...repeat([255, 255, 255], 10)]
            const palette = quantizeColors(pixels, 2)
            expect(palette).toHaveLength(2)
            expect(palette).toContainEqual([0, 0, 0])
            expect(palette).toContainEqual([255, 255, 255])
        })

        it("大面积主色排在前面", () => {
            const pixels = [...repeat([10, 10, 10], 30), ...repeat([240, 240, 240], 10)]
            const palette = quantizeColors(pixels, 3)
            expect(palette[0]).toEqual([10, 10, 10])
            expect(palette).toContainEqual([240, 240, 240])
        })

        it("结果数量不超过目标数量，且每个主色都落在输入像素的色彩范围内", () => {
            const pixels = [
                ...repeat([0, 0, 0], 10),
                ...repeat([20, 20, 20], 10),
                ...repeat([255, 0, 0], 10),
                ...repeat([0, 255, 0], 10),
                ...repeat([0, 0, 255], 10),
            ]
            const palette = quantizeColors(pixels, 3)
            expect(palette).toHaveLength(3)
            for (const color of palette) {
                color.forEach((channel, index) => {
                    const values = pixels.map(pixel => pixel[index])
                    expect(channel).toBeGreaterThanOrEqual(Math.min(...values))
                    expect(channel).toBeLessThanOrEqual(Math.max(...values))
                })
            }
        })

        it("与输入顺序无关：同样的像素集合得到同样的结果", () => {
            const pixels = [...repeat([10, 20, 30], 8), ...repeat([200, 100, 50], 6)]
            expect(quantizeColors(pixels, 2)).toEqual(quantizeColors([...pixels].reverse(), 2))
        })
    })
})
