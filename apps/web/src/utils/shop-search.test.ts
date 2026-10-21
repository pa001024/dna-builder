import { describe, expect, it } from "vitest"
import type { Shop } from "@/data/d/shop.data"
import { searchShopData } from "./shop-search"

/** 原样返回的翻译函数 */
function identityTranslate(text: string): string {
    return text
}

function createShop(): Shop {
    return {
        id: "TestShop",
        name: "测试商店",
        mainTabs: [
            {
                id: 1,
                name: "主标签·一",
                subTabs: [
                    {
                        id: 11,
                        name: "子标签甲",
                        items: [
                            {
                                id: 1001,
                                itemType: "Resource",
                                typeId: 211,
                                typeName: "委托密函线索",
                                price: 1,
                                priceType: 3001,
                                priceName: "十面骰",
                                num: 1,
                                subTabId: 11,
                                startTime: 100,
                                endTime: 200,
                            },
                            {
                                id: 1002,
                                itemType: "Draft",
                                typeId: 330001,
                                typeName: "提灯",
                                price: 1,
                                priceType: 3001,
                                priceName: "十面骰",
                                num: 1,
                                subTabId: 11,
                                cond: "完成主线",
                            },
                        ],
                    },
                ],
            },
        ],
    }
}

function search(keyword: string, translate: (text: string) => string = identityTranslate) {
    return searchShopData([createShop()], keyword, translate)
}

describe("searchShopData", () => {
    it("空关键词与未命中时返回空结果", () => {
        expect(search("   ")).toEqual([])
        expect(search("不存在的商品")).toEqual([])
    })

    it("命中商品名称并返回高亮片段", () => {
        const [result] = search("密函")

        expect(result.shopMatched).toBe(false)
        expect(result.itemHits.size).toBe(1)
        expect(result.itemHits.get(1001)).toMatchObject({
            itemId: 1001,
            itemName: "委托密函线索",
            mainTabName: "主标签·一",
            subTabName: "子标签甲",
            field: "name",
        })
        expect(result.itemHits.get(1001)?.snippet.segments).toEqual([
            { text: "委托", highlighted: false },
            { text: "密函", highlighted: true },
            { text: "线索", highlighted: false },
        ])
    })

    it("按译文命中时在译文上生成高亮", () => {
        const translate = (text: string) => (text === "提灯" ? "Lantern" : text)
        const [result] = search("lantern", translate)

        expect(result.itemHits.get(1002)?.field).toBe("name")
        expect(result.itemHits.get(1002)?.snippet.segments).toEqual([{ text: "Lantern", highlighted: true }])
    })

    it("支持拼音兜底命中但不高亮字符", () => {
        const [result] = search("tideng")

        expect(result.itemHits.get(1002)?.field).toBe("name")
        expect(result.itemHits.get(1002)?.snippet.segments).toEqual([{ text: "提灯", highlighted: false }])
    })

    it("命中商品类型、价格与 ID 字段", () => {
        expect(search("设计稿")[0].itemHits.get(1002)?.field).toBe("type")

        const priceResult = search("十面骰")[0]
        expect(priceResult.itemHits.size).toBe(2)
        expect(priceResult.itemHits.get(1001)?.field).toBe("price")

        expect(search("1002")[0].itemHits.get(1002)?.field).toBe("id")
        expect(search("330001")[0].itemHits.get(1002)?.field).toBe("id")
    })

    it("命中解锁条件", () => {
        expect(search("完成主线")[0].itemHits.get(1002)?.field).toBe("cond")
    })

    it("商店名与标签名命中时只产出摘要", () => {
        const shopResult = search("测试商店")[0]
        expect(shopResult.shopMatched).toBe(true)
        expect(shopResult.itemHits.size).toBe(0)

        const tabResult = search("子标签甲")[0]
        expect(tabResult.shopMatched).toBe(false)
        expect(tabResult.tabSnippets).toHaveLength(1)
        expect(tabResult.itemHits.size).toBe(0)
    })
})
