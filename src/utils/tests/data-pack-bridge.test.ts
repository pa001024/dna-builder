import { afterEach, describe, expect, it, vi } from "vitest"
import { getCurrentVersionLimit, setCurrentVersionLimit } from "@/data/versionGate"
import {
    registerDataPackBinding,
    registerDataPackHydrationCallback,
    replaceRegisteredDataPackBindings,
} from "../data-pack/data-pack-bridge"

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

describe("数据可用性判定", () => {
    it("三种形态：直读源码（无绑定）可用、改写未水合不可用、水合后可用", async () => {
        vi.resetModules()
        const fresh = await import("../data-pack/data-pack-bridge")
        expect(fresh.isDataAvailable()).toBe(true)
        expect(fresh.isDataPackHydrated()).toBe(false)

        // 网页无包形态：改写已启用（有绑定）但尚未水合，数据不可用
        let value: unknown
        fresh.registerDataPackBinding("probe.data", "default", "array", v => {
            value = v
        })
        expect(fresh.isDataAvailable()).toBe(false)

        // 安装数据包后：水合完成，数据可用
        fresh.replaceRegisteredDataPackBindings(new Map([["probe.data", { default: [1] }]]))
        expect(value).toEqual([1])
        expect(fresh.isDataAvailable()).toBe(true)
        expect(fresh.isDataPackHydrated()).toBe(true)
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
