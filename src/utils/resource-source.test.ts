import { describe, expect, it } from "vitest"
import { resourceMap } from "@/data/d"
import { collectResourceHardbossSources } from "./resource-source"

describe("resource-source", () => {
    it("应该为梦魇残声材料收集 walnut 归一来源", () => {
        const resource = resourceMap.get(12150)
        expect(resource).toBeTruthy()

        const sources = collectResourceHardbossSources(resource!)

        expect(sources.length).toBeGreaterThan(0)
        expect(sources.every(source => source.type === "hardboss")).toBe(true)
        expect(sources.some(source => source.walnutId === 2057)).toBe(true)
    })

    it("应该为直接 Resource 命中收集 hardboss 来源", () => {
        const resource = resourceMap.get(10101)
        expect(resource).toBeTruthy()

        const sources = collectResourceHardbossSources(resource!)

        expect(sources.length).toBeGreaterThan(0)
        expect(sources.every(source => source.type === "hardboss")).toBe(true)
        expect(sources.some(source => source.walnutId === undefined)).toBe(true)
    })
})
