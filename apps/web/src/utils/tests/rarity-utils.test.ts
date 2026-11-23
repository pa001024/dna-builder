import { describe, expect, it } from "vitest"
import { getRarityColor, getRarityGradientClass, getRarityName, getRaritySwatchClass, getRarityValue } from "@/utils/rarity-utils"

describe("rarity-utils：rarity 10 与 6 同样式（U80 / §97）", () => {
    it("getRarityName(10) 与 6 一致，均为「红」", () => {
        expect(getRarityName(10)).toBe(getRarityName(6))
        expect(getRarityName(10)).toBe("红")
    })

    it("getRarityColor(10) 与 6 一致，均为 #ff5c5c", () => {
        expect(getRarityColor(10)).toBe(getRarityColor(6))
        expect(getRarityColor(10)).toBe("#ff5c5c")
    })

    it("getRarityGradientClass(10) 与 6 严格相等", () => {
        expect(getRarityGradientClass(10)).toBe(getRarityGradientClass(6))
        expect(getRarityGradientClass(10)).toBe("bg-linear-15 from-red-900/80 to-red-100/80")
    })

    it("getRaritySwatchClass(10) 与 6 严格相等", () => {
        expect(getRaritySwatchClass(10)).toBe(getRaritySwatchClass(6))
        expect(getRaritySwatchClass(10)).toBe("inline-block size-2.5 shrink-0 rounded-xs border border-red-500/50 bg-red-500/80")
    })
})

describe("rarity-utils：1~6 既有行为不变", () => {
    const NAMES: Record<number, string> = { 1: "白", 2: "绿", 3: "蓝", 4: "紫", 5: "金", 6: "红" }
    const COLORS: Record<number, string> = { 1: "#c3ccd9", 2: "#4bd07a", 3: "#4a9bff", 4: "#b06bff", 5: "#f2c14e", 6: "#ff5c5c" }

    it("getRarityName / getRarityColor 逐档锁死", () => {
        for (const [rarity, name] of Object.entries(NAMES)) {
            expect(getRarityName(Number(rarity))).toBe(name)
            expect(getRarityColor(Number(rarity))).toBe(COLORS[Number(rarity)])
        }
    })

    it("中文名输入与数字输入等价（红 = 6，非 10）", () => {
        for (const [rarity, name] of Object.entries(NAMES)) {
            expect(getRarityColor(name)).toBe(getRarityColor(Number(rarity)))
            expect(getRarityGradientClass(name)).toBe(getRarityGradientClass(Number(rarity)))
            expect(getRaritySwatchClass(name)).toBe(getRaritySwatchClass(Number(rarity)))
        }
    })

    it("getRarityValue 保持 1~6，不加「暗金」等展示名映射", () => {
        for (const [rarity, name] of Object.entries(NAMES)) {
            expect(getRarityValue(name)).toBe(Number(rarity))
        }
        expect(getRarityValue("暗金")).toBe(0)
        expect(getRarityValue("10")).toBe(0)
    })
})

describe("rarity-utils：未收录值回退 1", () => {
    it("0 / 7 / 99 的名称、颜色、渐变、色块均回退到稀有度 1", () => {
        for (const rarity of [0, 7, 99]) {
            expect(getRarityName(rarity)).toBe(getRarityName(1))
            expect(getRarityColor(rarity)).toBe(getRarityColor(1))
            expect(getRarityGradientClass(rarity)).toBe(getRarityGradientClass(1))
            expect(getRaritySwatchClass(rarity)).toBe(getRaritySwatchClass(1))
        }
    })
})
