import { describe, expect, it } from "vitest"
import { resourceMap } from "@/data/d"
import { collectResourceHardbossSources, collectResourceQuestSources } from "./resource-source"
import { getRewardDetails } from "./reward-utils"

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

    it("应该从任务奖励组中反查资源来源", () => {
        const resource = resourceMap.get(120002)
        expect(resource).toBeTruthy()

        const sources = collectResourceQuestSources(resource!)

        const matchedSource = sources.find(source => source.questChainId === 400123 && source.rewardId === 50616)
        expect(matchedSource).toBeTruthy()
        expect(matchedSource?.num).toBe(1)
        expect(matchedSource?.timeStart).toBe(1775854800)
        expect(matchedSource?.timeEnd).toBe(1776718800)
    })
})
