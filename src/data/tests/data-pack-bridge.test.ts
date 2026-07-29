import { describe, expect, it, vi } from "vitest"
import { registerDataPackBinding, registerDataPackHydrationCallback, replaceRegisteredDataPackBindings } from "../data-pack-bridge"

describe("数据包绑定替换", () => {
    it("切换数据包时应该清空旧导出并再次触发初始化", () => {
        let legacyValue: unknown
        registerDataPackBinding("legacy.data", "default", "array", value => {
            legacyValue = value
        })

        replaceRegisteredDataPackBindings(new Map([["legacy.data", { default: [1] }]]))
        expect(legacyValue).toEqual([1])

        const rebuild = vi.fn()
        registerDataPackHydrationCallback(rebuild)
        expect(rebuild).toHaveBeenCalledTimes(1)

        replaceRegisteredDataPackBindings(new Map([["current.data", { default: [2] }]]))
        expect(legacyValue).toEqual([])
        expect(rebuild).toHaveBeenCalledTimes(2)
    })
})
