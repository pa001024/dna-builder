import { describe, expect, it } from "vitest"
import { skinColorizeSwatches } from "@/data/d/skin-colorize.data"
import { swatchTable } from "./skin-model"

/** 数据包 → 渲染器色板表的转换结果，供渲染器在 GLB 不带色板时补上。 */
describe("data-pack dye swatches", () => {
    it("carries linear values for every swatch", () => {
        const table = swatchTable(skinColorizeSwatches)
        expect(Object.keys(table).length).toBe(skinColorizeSwatches.length)
        for (const swatch of skinColorizeSwatches) {
            const entry = table[String(swatch.id)]
            expect(entry, `missing swatch ${swatch.id}`).toBeTruthy()
            expect(entry.linear).toHaveLength(3)
            for (const channel of entry.linear) expect(channel).toBeGreaterThanOrEqual(0)
            for (const channel of entry.linear) expect(channel).toBeLessThanOrEqual(1)
        }
    })

    it("keeps the special stocking swatches inside the linear range", () => {
        const table = swatchTable(skinColorizeSwatches)
        // 纯白色板是 1，纯黑接近 0：换算错成 sRGB 0–255 时这两个会明显越界
        expect(table["1022"].linear[0]).toBeCloseTo(1)
        expect(table["1027"].linear[0]).toBeCloseTo(0.0203)
        expect(table["1027"].fresnel).toBeCloseTo(0.06)
    })

    it("falls back to sRGB conversion when the pack has no linear field", () => {
        const table = swatchTable([{ id: 1, rgb: [183, 221, 232] }])
        expect(table["1"].linear[0]).toBeCloseTo(0.4735)
        expect(table["1"].linear[2]).toBeCloseTo(0.807)
    })
})
