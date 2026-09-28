import { afterEach, describe, expect, it, vi } from "vitest"
import { registerDataPackBinding, registerDataPackHydrationCallback, replaceRegisteredDataPackBindings } from "../data-pack-bridge"
import { getCurrentVersionLimit, setCurrentVersionLimit } from "../versionGate"

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

describe("数据包水合版本门限", () => {
    const previousLimit = getCurrentVersionLimit()

    afterEach(() => {
        setCurrentVersionLimit(previousLimit)
    })

    it("水合数组导出时按版本门限过滤条目（无版本字段/门限内保留，超门限剔除）", () => {
        setCurrentVersionLimit(1.6)
        let value: unknown
        registerDataPackBinding("gated.data", "default", "array", v => {
            value = v
        })

        replaceRegisteredDataPackBindings(
            new Map([["gated.data", { default: [{ id: 1, 版本: "1.0" }, { id: 2, 版本: "1.7" }, { id: 3 }] }]])
        )

        expect(value).toEqual([{ id: 1, 版本: "1.0" }, { id: 3 }])
    })

    it("安全模式关闭（门限 Infinity）时水合不裁剪数据", () => {
        setCurrentVersionLimit(Number.POSITIVE_INFINITY)
        let value: unknown
        registerDataPackBinding("gated.data", "default", "array", v => {
            value = v
        })

        replaceRegisteredDataPackBindings(new Map([["gated.data", { default: [{ id: 1, 版本: "1.7" }] }]]))

        expect(value).toEqual([{ id: 1, 版本: "1.7" }])
    })
})
