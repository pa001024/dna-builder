import { describe, expect, it } from "vitest"
import { deltaE, deltaEOk, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv, rgbToOklab } from "./color"

describe("color", () => {
    describe("rgbToOklab", () => {
        it("白黑为 Lab 轴端点", () => {
            const [whiteL, whiteA, whiteB] = rgbToOklab([255, 255, 255])
            expect(whiteL).toBeCloseTo(1, 5)
            expect(whiteA).toBeCloseTo(0, 5)
            expect(whiteB).toBeCloseTo(0, 5)
            expect(rgbToOklab([0, 0, 0])).toEqual([0, 0, 0])
        })

        it("纯色与 Ottosson 公布的标准值一致", () => {
            const [redL, redA, redB] = rgbToOklab([255, 0, 0])
            expect(redL).toBeCloseTo(0.6279554, 5)
            expect(redA).toBeCloseTo(0.2248631, 5)
            expect(redB).toBeCloseTo(0.1258463, 5)

            const [greenL, greenA, greenB] = rgbToOklab([0, 255, 0])
            expect(greenL).toBeCloseTo(0.8664396, 5)
            expect(greenA).toBeCloseTo(-0.2338876, 5)
            expect(greenB).toBeCloseTo(0.1794985, 5)

            const [blueL, blueA, blueB] = rgbToOklab([0, 0, 255])
            expect(blueL).toBeCloseTo(0.4520137, 5)
            expect(blueA).toBeCloseTo(-0.032457, 5)
            expect(blueB).toBeCloseTo(-0.3115281, 5)
        })

        it("灰色只落在 L 轴上", () => {
            const [l, a, b] = rgbToOklab([119, 119, 119])
            expect(l).toBeCloseTo(0.5693, 4)
            expect(a).toBeCloseTo(0, 6)
            expect(b).toBeCloseTo(0, 6)
        })
    })

    describe("deltaEOk / deltaE", () => {
        it("同一颜色色差为 0，且满足对称性", () => {
            expect(deltaE([18, 52, 86], [18, 52, 86])).toBe(0)
            const forward = deltaE([18, 52, 86], [200, 180, 30])
            const backward = deltaE([200, 180, 30], [18, 52, 86])
            expect(forward).toBeCloseTo(backward, 10)
            expect(forward).toBeGreaterThan(0)
        })

        it("黑白色差为 100，明度差越大色差越大", () => {
            expect(deltaE([0, 0, 0], [255, 255, 255])).toBeCloseTo(100, 4)
            const near = deltaE([100, 100, 100], [130, 130, 130])
            const far = deltaE([100, 100, 100], [200, 200, 200])
            expect(near).toBeLessThan(far)
        })

        it("可直接对预计算好的 OKLab 值求色差", () => {
            expect(deltaEOk(rgbToOklab([183, 221, 232]), rgbToOklab([183, 221, 232]))).toBe(0)
            expect(deltaEOk(rgbToOklab([127, 32, 172]), rgbToOklab([8, 0, 237]))).toBeCloseTo(deltaE([127, 32, 172], [8, 0, 237]), 10)
        })

        it("蓝紫区域排序与肉眼一致：暗紫色比纯蓝更接近紫色目标", () => {
            // 回归用例：目标为紫色 #7f20ac 时，纯蓝 #0800ed 不能排到暗紫色 #482565 前面
            const target: [number, number, number] = [127, 32, 172]
            const deepPurple: [number, number, number] = [72, 37, 101]
            const pureBlue: [number, number, number] = [8, 0, 237]
            const purpleDistance = deltaE(target, deepPurple)
            const blueDistance = deltaE(target, pureBlue)
            expect(purpleDistance).toBeLessThan(blueDistance)
            expect(blueDistance).toBeGreaterThan(15)
        })
    })

    describe("hexToRgb / rgbToHex", () => {
        it("支持 3 位与 6 位写法并忽略大小写与 #", () => {
            expect(hexToRgb("#b7dde8")).toEqual([183, 221, 232])
            expect(hexToRgb("B7DDE8")).toEqual([183, 221, 232])
            expect(hexToRgb("#fff")).toEqual([255, 255, 255])
        })

        it("非法输入返回 null", () => {
            expect(hexToRgb("#12345")).toBeNull()
            expect(hexToRgb("zzzzzz")).toBeNull()
            expect(hexToRgb("")).toBeNull()
        })

        it("与 rgbToHex 互为逆运算", () => {
            expect(rgbToHex([183, 221, 232])).toBe("#b7dde8")
            expect(rgbToHex(hexToRgb("#0a1b2c")!)).toBe("#0a1b2c")
            expect(rgbToHex([-5, 300, 12.6])).toBe("#00ff0d")
        })
    })

    describe("hsvToRgb / rgbToHsv", () => {
        it("标准色相取值为纯色", () => {
            expect(hsvToRgb(0, 1, 1)).toEqual([255, 0, 0])
            expect(hsvToRgb(120, 1, 1)).toEqual([0, 255, 0])
            expect(hsvToRgb(240, 1, 1)).toEqual([0, 0, 255])
            expect(hsvToRgb(360, 1, 1)).toEqual([255, 0, 0])
            expect(hsvToRgb(0, 0, 1)).toEqual([255, 255, 255])
            expect(hsvToRgb(0, 0, 0)).toEqual([0, 0, 0])
        })

        it("与 rgbToHsv 互为逆运算", () => {
            for (const rgb of [
                [183, 221, 232],
                [255, 0, 0],
                [0, 128, 64],
                [12, 34, 56],
            ] as [number, number, number][]) {
                const [h, s, v] = rgbToHsv(rgb)
                expect(hsvToRgb(h, s, v)).toEqual(rgb)
            }
        })

        it("灰色无彩度时色相归零", () => {
            const [h, s, v] = rgbToHsv([128, 128, 128])
            expect(h).toBe(0)
            expect(s).toBe(0)
            expect(v).toBeCloseTo(128 / 255, 5)
        })
    })
})
