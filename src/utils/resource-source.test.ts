import { describe, expect, it } from "vitest"
import { resourceMap } from "@/data/d"
import {
    collectIronTicketShopSources,
    collectModCharBreakthroughSources,
    collectModPackSources,
    collectModQuestSources,
    collectModWalnutSources,
    collectResourceDungeonSources,
    collectResourceEventSources,
    collectResourceHardbossSources,
    collectResourcePackSources,
    collectResourceQuestSources,
} from "./resource-source"

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
        const resource = resourceMap.get(10012)
        expect(resource).toBeTruthy()

        const sources = collectResourceQuestSources(resource!)

        const matchedSource = sources.find(source => source.rewardId === 4000022)
        expect(matchedSource).toBeTruthy()
        expect(matchedSource?.num).toBe(1)
        expect(matchedSource?.d).toBe(1)
    })

    it("应该保留任务奖励中的设计稿标记", () => {
        const resource = resourceMap.get(10012)
        expect(resource).toBeTruthy()

        const sources = collectResourceQuestSources(resource!)
        const matchedSource = sources.find(source => source.rewardId === 4000022)

        expect(matchedSource?.d).toBe(1)
    })

    it("应该从道具箱奖励中反查资源来源", () => {
        const resource = resourceMap.get(226)
        expect(resource).toBeTruthy()

        const sources = collectResourcePackSources(resource!)

        expect(sources.some(source => source.resourceId === 110038 && source.rewardId === 351010)).toBe(true)
        expect(sources.some(source => source.resourceId === 110039 && source.rewardId === 351000)).toBe(true)
    })

    it("应该从任务奖励组中反查魔之楔来源", () => {
        const sources = collectModQuestSources(11001)

        expect(sources.length).toBeGreaterThan(0)
        expect(sources.every(source => typeof source.num === "number")).toBe(true)
    })

    it("应该为150401应用角色突破特殊来源规则", () => {
        const sources = collectModCharBreakthroughSources(150401)
        const matchedSource = sources.find(source => source.charId === 1504)

        expect(matchedSource).toBeTruthy()
        expect(matchedSource?.sourceTypeLabel).toBe("角色突破")
        expect(matchedSource?.detail).toBe("20级突破奖励")
        expect(matchedSource?.title).toBe("苏乙")
    })

    it("应该从密函奖励中反查魔之楔来源", () => {
        const sources = collectModWalnutSources(51735)

        expect(sources).toHaveLength(2)
        const product = sources.find(source => source.rewardIndex === 0)
        expect(product?.walnutId).toBe(151735)
        expect(product?.tierKey).toBe("walnut-source.tier_gold")
        expect(product?.isDraft).toBe(false)
        expect(product?.expectedOpens).toBeCloseTo(25.5, 10)
        const draft = sources.find(source => source.rewardIndex === 1)
        expect(draft?.walnutId).toBe(151735)
        expect(draft?.tierKey).toBe("walnut-source.tier_big_silver")
        expect(draft?.isDraft).toBe(true)
        expect(draft?.expectedOpens).toBeCloseTo(10.2, 10)
    })

    it("未知魔之楔没有密函来源", () => {
        expect(collectModWalnutSources(999999999)).toEqual([])
    })

    it("应该从道具箱中反查魔之楔来源", () => {
        const sources = collectModPackSources(32004)

        const matchedSource = sources.find(source => source.resourceId === 110019)
        expect(matchedSource).toBeTruthy()
        expect(matchedSource?.rewardId).toBe(350000)
        expect(matchedSource?.resourceName).toContain("道具箱")
    })

    it("应该从商店设计稿反查深境罗盘来源", () => {
        const sources = collectIronTicketShopSources(1002)

        expect(sources.some(source => source.itemId === 10013116)).toBe(true)
        expect(sources.some(source => source.itemId === 10013117)).toBe(true)
    })

    it("应该把深境探险强敌掉落中的灾厄原型反查到副本来源", () => {
        const resource = resourceMap.get(15002)
        expect(resource).toBeTruthy()

        const sources = collectResourceDungeonSources(resource!)

        const matchedSource = sources.find(source => source.dungeonId === 91604)
        expect(matchedSource).toBeTruthy()
        expect(matchedSource?.rewardId).toBe(303002)
        // 强敌掉落属于条件掉落，不携带奖励树换算出的概率
        expect(matchedSource?.pp).toBeUndefined()
        expect(matchedSource?.times).toBeUndefined()
    })

    it("应该把深境委托奖励表中的元素晶块反查到对应元素副本来源", () => {
        // 91604 / 91704 为“风”副本，掉风之晶块 (15033)
        const wind = resourceMap.get(15033)
        expect(wind).toBeTruthy()

        const windSources = collectResourceDungeonSources(wind!)
        expect(windSources.some(source => source.dungeonId === 91604)).toBe(true)
        expect(windSources.some(source => source.dungeonId === 91704)).toBe(true)

        // 雷之晶块 (15034) 由“雷”副本 91603 / 91703 掉落
        const thunder = resourceMap.get(15034)
        expect(thunder).toBeTruthy()

        const thunderSources = collectResourceDungeonSources(thunder!)
        expect(thunderSources.some(source => source.dungeonId === 91603)).toBe(true)
        expect(thunderSources.some(source => source.dungeonId === 91703)).toBe(true)
    })

    it("应该从永恒梦魇固定掉落和首次奖励中反查资源来源", () => {
        const resource = resourceMap.get(100)
        expect(resource).toBeTruthy()

        const sources = collectResourceEventSources(resource!).filter(source => source.kind === "hardboss")
        expect(sources.length).toBeGreaterThan(0)

        const first = sources.find(source => source.eventId === 103036 && source.index === 2 && source.mode === "eternal")
        expect(first?.first).toBe(true)
        expect(first?.title).toBe("羽化者")
        expect(first?.rewardId).toBe(2800302)
    })

    it("应该从永恒梦魇高难固定掉落中反查资源来源", () => {
        const resource = resourceMap.get(101)
        expect(resource).toBeTruthy()

        const sources = collectResourceEventSources(resource!).filter(source => source.kind === "hardboss")
        const fixed = sources.find(source => source.eventId === 103036 && source.index === 1 && source.mode === "challenge")
        expect(fixed?.first).toBe(false)
        expect(fixed?.title).toBe("西比尔")
        expect(fixed?.rewardId).toBe(2800202)
    })

    it("应该从背包解谜关卡奖励中反查资源来源", () => {
        const resource = resourceMap.get(100)
        expect(resource).toBeTruthy()

        const sources = collectResourceEventSources(resource!).filter(source => source.kind === "puzzle")
        const matched = sources.find(source => source.eventId === 103015 && source.index === 10301501)
        expect(matched?.title).toBe("披沙捡金Ⅰ")
        expect(matched?.rewardId).toBe(113001)
        expect(matched?.num).toBe(10)
    })

    it("应该从且试锋芒星数奖励中反查资源来源", () => {
        const resource = resourceMap.get(100)
        expect(resource).toBeTruthy()

        const sources = collectResourceEventSources(resource!).filter(source => source.kind === "verify")
        const matched = sources.find(source => source.eventId === 103026 && source.index === 3)
        expect(matched?.rewardId).toBe(10302601)
        expect(matched?.num).toBe(60)
    })

    it("应该从忘川夜话奖池中反查资源来源", () => {
        const resource = resourceMap.get(208)
        expect(resource).toBeTruthy()

        const sources = collectResourceEventSources(resource!).filter(source => source.kind === "prize")
        const matched = sources.find(source => source.eventId === 103021 && source.poolId === 1001)
        expect(matched?.index).toBe(8)
        expect(matched?.num).toBe(6)
    })
})
