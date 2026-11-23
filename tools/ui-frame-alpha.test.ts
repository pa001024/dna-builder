import { describe, expect, it } from "vitest"
import { decodePng } from "./skin-model/eye-atlas"
import { additivePng, additiveRgba } from "./ui-frame-alpha"

describe("UI 加法光效 alpha 烘焙", () => {
    it("PNG 编码保留尺寸、行边界、暗部和半透明像素", () => {
        const png = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGklEQVR4nGNgYGD43+Cg8J+BmYnx/////xsAMXgHYWh7qMsAAAAASUVORK5CYII=",
            "base64"
        )
        const result = decodePng(additivePng(png))!
        expect([result.width, result.height]).toEqual([2, 2])
        expect([...result.rgba]).toEqual([0, 0, 0, 0, 255, 128, 64, 128, 255, 170, 85, 3, 255, 255, 255, 128])
        expect(decodePng(png)!.rgba[3]).toBe(255)
    })

    it("无法解码的 PNG 明确报错，不静默导入不透明贴图", () => {
        expect(() => additivePng(new Uint8Array())).toThrow("动态框加法贴图必须是可解码的 8 位非隔行 PNG")
    })

    it("不透明黑底变为透明，发光像素与原 alpha 均参与合成", () => {
        const input = new Uint8Array([0, 0, 0, 255, 128, 64, 32, 255, 255, 255, 255, 128, 255, 128, 64, 0])
        const result = additiveRgba(input)
        expect([...result]).toEqual([0, 0, 0, 0, 255, 128, 64, 128, 255, 255, 255, 128, 255, 128, 64, 0])
        expect([...input.subarray(0, 4)]).toEqual([0, 0, 0, 255])
    })

    it("非透明像素的预乘颜色能量不变，不用抠黑阈值吞掉暗部光效", () => {
        const source = new Uint8Array([3, 2, 1, 255, 150, 50, 20, 128])
        const output = additiveRgba(source)
        expect(output[3]).toBe(3)
        for (let pixel = 0; pixel < source.length; pixel += 4) {
            for (let channel = 0; channel < 3; channel++) {
                expect(Math.abs(output[pixel + channel] * output[pixel + 3] - source[pixel + channel] * source[pixel + 3])).toBeLessThan(
                    160
                )
            }
        }
    })
})
