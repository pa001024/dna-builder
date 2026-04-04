import { describe, expect, it } from "vitest"
import { weaponMap } from "../data/d"
import type { Weapon } from "../data/data-types"
import { collectWeaponSources, formatWeaponSourceTimeRange } from "./weapon-source"

describe("weapon-source", () => {
    it("应该为真实武器收集商店来源并归一到密函", () => {
        const weapon = weaponMap.get(10101)
        expect(weapon).toBeTruthy()

        const sources = collectWeaponSources(weapon!)
        const shopSources = sources.filter(source => source.type === "shop")

        expect(sources.length).toBeGreaterThan(0)
        expect(shopSources.length).toBeGreaterThan(0)
        expect(shopSources.some(source => source.key.includes("152001"))).toBe(true)
        expect(shopSources.some(source => source.key.includes("159101"))).toBe(true)
        expect(shopSources.find(source => source.key.includes("152001"))?.detail).toBe("委托密函 -> 武器")
        expect(shopSources.find(source => source.key.includes("152001"))?.walnutId).toBe(2001)
        expect(shopSources.find(source => source.key.includes("152001"))?.price).toBe(10)
        expect(shopSources.find(source => source.key.includes("152001"))?.priceName).toBe("委托密函线索")
        expect(shopSources.find(source => source.key.includes("152001"))?.shopIcon).toContain("/imgs/")
        expect(shopSources.find(source => source.key.includes("152001"))?.shopId).toBe("Shop")
        expect(shopSources.find(source => source.key.includes("152001"))?.subTabId).toBe(1802)
        expect(shopSources.find(source => source.key.includes("152001"))?.timeStart).toBe(1672545600)
        expect(shopSources.find(source => source.key.includes("152001"))?.timeEnd).toBeUndefined()
        expect(shopSources.find(source => source.key.includes("159101"))?.price).toBe(3280)
        expect(shopSources.find(source => source.key.includes("159101"))?.priceName).toBe("月石晶胚")
        expect(shopSources.find(source => source.key.includes("159101"))?.shopIcon).toContain("/imgs/")
    })

    it("应该让实际10305武器输出hardboss来源", () => {
        const weapon = { id: 10305, 名称: "鸣金遥" } as Weapon

        const sources = collectWeaponSources(weapon)
        const hardbossSources = sources.filter(source => source.type === "hardboss")

        expect(hardbossSources.length).toBeGreaterThan(0)
        expect(hardbossSources.every(source => source.walnutId === 2057)).toBe(true)
        expect(hardbossSources.every(source => source.hardbossName === "羽化者")).toBe(true)
        expect(hardbossSources.every(source => source.hardbossLv === 40)).toBe(true)
        expect(hardbossSources.some(source => source.key.includes("2057"))).toBe(true)
    })

    it("应该把链式商店商品归并到根节点", () => {
        const weapon = weaponMap.get(10204)
        expect(weapon).toBeTruthy()

        const sources = collectWeaponSources(weapon!)
        const abyssSources = sources.filter(source => source.type === "shop" && source.shopId === "AbyssShop")

        expect(abyssSources.length).toBe(1)
        expect(abyssSources[0].key).toContain("10000108")
        expect(abyssSources[0].walnutId).toBe(2029)
    })

    it("应该把没有结束时间的来源格式化为至今", () => {
        const text = formatWeaponSourceTimeRange({
            key: "shop-test",
            type: "shop",
            itemId: 1,
            timeStart: 1672545600,
            detail: "商店购买",
            shopId: "Shop",
            subTabId: 1802,
            shopName: "商店",
            price: 10,
            priceName: "铜币",
            num: 1,
        })

        expect(text).toContain("至今")
    })
})
