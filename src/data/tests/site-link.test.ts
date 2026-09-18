import { describe, expect, it } from "vitest"
import { isHashHistory, isInternalSitePath, parseSiteRoute, toRouterHref } from "@/utils/site-link"

describe("isInternalSitePath", () => {
    it("应识别资料库路径", () => {
        expect(isInternalSitePath("/db/map-local")).toBe(true)
        expect(isInternalSitePath("/db/char/1001")).toBe(true)
        expect(isInternalSitePath("/db")).toBe(true)
    })

    it("应识别其它站内功能页", () => {
        expect(isInternalSitePath("/setting")).toBe(true)
        expect(isInternalSitePath("/points-mall")).toBe(true)
    })

    it("应拒绝外链与协议相对地址", () => {
        expect(isInternalSitePath("https://example.com/db/char")).toBe(false)
        expect(isInternalSitePath("//evil.com/db")).toBe(false)
        expect(isInternalSitePath("mailto:a@b.com")).toBe(false)
    })

    it("应拒绝非站内路径", () => {
        expect(isInternalSitePath("/unknown-page")).toBe(false)
        expect(isInternalSitePath("db/char")).toBe(false)
        expect(isInternalSitePath("")).toBe(false)
    })

    it("带 query 或 hash 时仍应正确识别", () => {
        expect(isInternalSitePath("/db/char?id=1")).toBe(true)
        expect(isInternalSitePath("/db/char#top")).toBe(true)
    })

    it("不应把前缀相似的路径误判为站内", () => {
        // /database 不是 /db 的子路径
        expect(isInternalSitePath("/database")).toBe(false)
    })
})

describe("isHashHistory", () => {
    it("hash 模式的 base 以 # 结尾", () => {
        // createWebHashHistory 内部会做 normalizeBase：
        // 未带 # 时补 #，尾部的 `/` 被 removeTrailingSlash 去掉，
        // 所以真实 base 形如 `#` 或 `/#`，不会是 `/#/`。
        expect(isHashHistory({ base: "#" })).toBe(true)
        expect(isHashHistory({ base: "/#" })).toBe(true)
    })

    it("history 模式的 base 不以 # 结尾", () => {
        expect(isHashHistory({ base: "/" })).toBe(false)
        expect(isHashHistory({ base: "/app" })).toBe(false)
    })

    it("history 缺失时不应误判为 hash 模式", () => {
        expect(isHashHistory(undefined)).toBe(false)
        expect(isHashHistory(null)).toBe(false)
        expect(isHashHistory({})).toBe(false)
    })
})

describe("toRouterHref", () => {
    it("hash 模式下应补上 # 前缀", () => {
        expect(toRouterHref("/db/map-local", true)).toBe("#/db/map-local")
    })

    it("history 模式下应保持原样", () => {
        expect(toRouterHref("/db/map-local", false)).toBe("/db/map-local")
    })

    it("外链不应被改写", () => {
        expect(toRouterHref("https://example.com", true)).toBe("https://example.com")
    })

    it("锚点不应被改写", () => {
        expect(toRouterHref("#section", true)).toBe("#section")
    })
})

describe("parseSiteRoute", () => {
    it("应解析出站内路由路径", () => {
        expect(parseSiteRoute("/db/map-local")).toBe("/db/map-local")
        expect(parseSiteRoute("/db/char/1001")).toBe("/db/char/1001")
    })

    it("应容错模型多写的 # 前缀", () => {
        expect(parseSiteRoute("#/db/map-local")).toBe("/db/map-local")
    })

    it("非站内链接应返回 null", () => {
        expect(parseSiteRoute("https://example.com")).toBeNull()
        expect(parseSiteRoute("/unknown")).toBeNull()
        expect(parseSiteRoute("")).toBeNull()
    })
})
