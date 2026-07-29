import { describe, expect, it } from "vitest"
import { revivePackedValue } from "../data-pack"

describe("revivePackedValue", () => {
    it("原地还原普通对象和数组", () => {
        const nested = { value: 1 }
        const input = { list: [nested, { __dnaPackType: "Undefined" }] }

        const result = revivePackedValue(input)

        expect(result).toBe(input)
        expect(input.list[0]).toBe(nested)
        expect(input.list[1]).toBeUndefined()
    })

    it("仅为特殊类型创建对应实例", () => {
        const input = {
            map: { __dnaPackType: "Map", value: [["key", { value: 2 }]] },
            set: { __dnaPackType: "Set", value: [1, 2] },
        }

        const result = revivePackedValue(input) as { map: Map<string, { value: number }>; set: Set<number> }

        expect(result).toBe(input)
        expect(result.map).toBeInstanceOf(Map)
        expect(result.map.get("key")).toEqual({ value: 2 })
        expect(result.set).toEqual(new Set([1, 2]))
    })
})
