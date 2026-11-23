import { describe, expect, it } from "vitest"
import { resolveLegacyTranscendenceRoute } from "@/utils/transcendence-routes"

/**
 * 调用旧 tab 入口解析。
 * @param query 旧入口 query
 * @param hash URL hash
 * @returns 重定向目标；无需转换时为 null
 */
function resolve(query: Record<string, string>, hash = "") {
    return resolveLegacyTranscendenceRoute({ query, hash })
}

describe("resolveLegacyTranscendenceRoute：旧 tab 直达", () => {
    it("无 tab 参数时不转换", () => {
        expect(resolve({ id: "1030" })).toBeNull()
    })

    it("tab=rift&id= 直达页内 ?id=", () => {
        expect(resolve({ tab: "rift", id: "1030" })).toEqual({ path: "/db/transcendence/rift", query: { id: "1030" }, hash: "" })
    })

    it("tab=rift 保留 ft 等白名单参数", () => {
        expect(resolve({ tab: "rift", id: "1030", ft: "2" })).toEqual({
            path: "/db/transcendence/rift",
            query: { ft: "2", id: "1030" },
            hash: "",
        })
    })

    it("非法 id 不写入 query", () => {
        expect(resolve({ tab: "rift", id: "abc" })).toEqual({ path: "/db/transcendence/rift", query: {}, hash: "" })
    })

    it("journeysub=commissions 直达委托新页并保留 kw", () => {
        expect(resolve({ tab: "journey", journeysub: "commissions", kw: "1" })).toEqual({
            path: "/db/transcendence/commission",
            query: { kw: "1" },
            hash: "",
        })
    })

    it("journeysub=buffs 保持旅程增益路径", () => {
        expect(resolve({ tab: "journey", journeysub: "buffs" })).toEqual({
            path: "/db/transcendence/journey/buffs",
            query: {},
            hash: "",
        })
    })

    it("hash 原样保留", () => {
        expect(resolve({ tab: "rift", id: "1030" }, "#x")).toEqual({
            path: "/db/transcendence/rift",
            query: { id: "1030" },
            hash: "#x",
        })
    })

    it("未知 tab 回总览并保留白名单参数", () => {
        expect(resolve({ tab: "unknown", kw: "1" })).toEqual({ path: "/db/transcendence", query: { kw: "1" }, hash: "" })
    })
})
