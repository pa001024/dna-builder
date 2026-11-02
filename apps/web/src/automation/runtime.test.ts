import { describe, expect, it } from "vitest"
import { getRuntime } from "./runtime"

describe("getRuntime", () => {
    it("浏览器环境用全局 fetch，磁盘操作报桌面端限定", async () => {
        const runtime = getRuntime()
        expect(runtime.fetch).toBe(fetch)
        expect(getRuntime()).toBe(runtime)
        await expect(runtime.readTextFile("x")).rejects.toThrow("仅桌面端可用")
        await expect(runtime.pathExists("x")).rejects.toThrow("仅桌面端可用")
    })
})
