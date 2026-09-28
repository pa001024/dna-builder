import { beforeEach, describe, expect, it } from "vitest"
import { buildDBMapRoute, normalizeDBMapKind, normalizeDBMapPart, resolveDBMapGroups } from "@/utils/db-map-utils"

/**
 * DBMapLink（AI 地图跳转中间件）的位置解析用例。
 *
 * 关注的是「模型只给类型 + id 或名称时能不能补齐成可跳转的位置」：
 * 读物按页展开、资源按子区域聚合（同一子区域的多条 source 必须并成一行）、
 * 名称容错、part 严格筛选，以及区域没有本地地图时不给出死链。
 */

/** 让 localStorage 在测试环境里报「中文」，名称解析按原文匹配 */
function stubChineseLocale(): void {
    const store = new Map<string, string>([["setting_lang", "zh-CN"]])

    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => store.set(key, value),
            removeItem: (key: string) => store.delete(key),
            clear: () => store.clear(),
        },
    })
}

beforeEach(() => {
    stubChineseLocale()
})

describe("normalizeDBMapKind / normalizeDBMapPart", () => {
    it("接受英文与中文写法", () => {
        expect(normalizeDBMapKind("book")).toBe("book")
        expect(normalizeDBMapKind(" 读物 ")).toBe("book")
        expect(normalizeDBMapKind("Resource")).toBe("resource")
        expect(normalizeDBMapKind("道具")).toBe("resource")
        expect(normalizeDBMapPart("treasure")).toBe("treasure")
        expect(normalizeDBMapPart("藏宝点")).toBe("treasure")
        expect(normalizeDBMapPart("page")).toBe("page")
    })

    it("无法识别时返回 undefined", () => {
        expect(normalizeDBMapKind("")).toBeUndefined()
        expect(normalizeDBMapKind("pet")).toBeUndefined()
        expect(normalizeDBMapPart(undefined)).toBeUndefined()
    })
})

describe("读物位置", () => {
    it("按读物 id 展开成「书页 + 藏宝点」两类位置", () => {
        const groups = resolveDBMapGroups({ kind: "book", id: 1001 })

        expect(groups.length).toBeGreaterThan(0)
        expect(groups.every(group => group.pointType === "page" || group.pointType === "treasure")).toBe(true)
        // 区域与子区域名来自地图数据，坐标取自 BookResource.pos / treasurePos
        expect(groups[0]?.regionName).toBeTruthy()
        expect(groups[0]?.subRegionName).toBeTruthy()
        expect(groups[0]?.points[0]).toHaveLength(2)
    })

    it("按收录内容的页 id 也能定位（模型拿到的是页 id）", () => {
        const byBook = resolveDBMapGroups({ kind: "book", id: 1001 })
        const byPage = resolveDBMapGroups({ kind: "book", id: 20602 })

        expect(byPage.length).toBe(2)
        expect(byPage[0]?.entryId).toBe(1001)
        expect(byPage[0]?.label).toBe("净界岛·其一")
        expect(byBook.some(group => group.label === "净界岛·其一")).toBe(true)
    })

    it("按名称定位，中文类型写法也认", () => {
        const groups = resolveDBMapGroups({ kind: "读物", name: "遗落的纸张·冰湖城" })

        expect(groups.length).toBeGreaterThan(0)
        expect(groups[0]?.entryName).toBe("遗落的纸张·冰湖城")
    })

    it("part 是严格筛选：只要藏宝点时不会混进书页", () => {
        const groups = resolveDBMapGroups({ kind: "book", id: 1001, part: "treasure" })

        expect(groups.length).toBeGreaterThan(0)
        expect(groups.every(group => group.pointType === "treasure")).toBe(true)
    })
})

describe("资源位置", () => {
    it("按子区域聚合，同一子区域的多条 source 并成一行", () => {
        const groups = resolveDBMapGroups({ kind: "resource", id: 101 })

        expect(groups.length).toBeGreaterThan(0)
        expect(groups.every(group => group.pointType === "source")).toBe(true)
        // 子区域不重复，且采集点数被合并统计
        expect(new Set(groups.map(group => group.subRegionId)).size).toBe(groups.length)
        expect(groups.every(group => group.points.length > 0)).toBe(true)
    })

    it("按名称定位", () => {
        const groups = resolveDBMapGroups({ kind: "resource", name: "铜币" })

        expect(groups[0]?.entryId).toBe(101)
    })

    it("没有采集点数据的资源返回空数组（不是抛错）", () => {
        expect(resolveDBMapGroups({ kind: "resource", id: 99 })).toEqual([])
    })
})

describe("空参数与查不到", () => {
    it("id 与名称都不给时返回空数组", () => {
        expect(resolveDBMapGroups({})).toEqual([])
        expect(resolveDBMapGroups({ kind: "book" })).toEqual([])
    })

    it("查不到条目时返回空数组（不乱猜其它条目）", () => {
        expect(resolveDBMapGroups({ kind: "book", id: 999999 })).toEqual([])
        expect(resolveDBMapGroups({ kind: "resource", name: "绝不可能存在的道具名" })).toEqual([])
    })

    it("类型缺失时按 book → npc → resource 兜底", () => {
        expect(resolveDBMapGroups({ id: 101 })[0]?.pointType).toBe("source")
        expect(resolveDBMapGroups({ id: 701313 })[0]?.pointType).toBe("npc")
    })
})

describe("NPC 位置", () => {
    it("按 id 给出单个点位（区域 / 子区域 / 坐标）", () => {
        const groups = resolveDBMapGroups({ kind: "npc", id: 701313 })

        expect(groups).toHaveLength(1)
        expect(groups[0]?.pointType).toBe("npc")
        expect(groups[0]?.entryName).toBe("鹿")
        expect(groups[0]?.regionName).toBe("百花车站")
        expect(groups[0]?.points).toEqual([[-47633, 11163]])
        // 该 NPC 没有自带图标，用与详情页一致的兜底图标
        expect(groups[0]?.icon).toBe("T_Gp_MainMission")
        expect(groups[0]?.jumpable).toBe(true)
    })

    it("没有坐标的 NPC 返回空数组（大多数 NPC 都没有）", () => {
        expect(resolveDBMapGroups({ kind: "npc", id: 1001 })).toEqual([])
    })

    it("按名称定位（中文类型写法也认）", () => {
        const groups = resolveDBMapGroups({ kind: "NPC", name: "莉兹贝尔" })

        expect(groups.length).toBeGreaterThan(0)
        expect(groups[0]?.entryName).toBe("莉兹贝尔")
    })

    it("跳转路由带坐标，且不携带资源筛选", () => {
        const route = buildDBMapRoute(resolveDBMapGroups({ kind: "npc", id: 701313 })[0]!) as {
            name: string
            query: Record<string, string>
        }

        expect(route.name).toBe("map-tool")
        expect(route.query.regionId).toBe("1060")
        expect(route.query.subRegionId).toBe("106001")
        expect(route.query.pointX).toBe("-47633")
        expect(route.query.pointY).toBe("11163")
        expect(route.query.rid).toBeUndefined()
    })
})

describe("buildDBMapRoute", () => {
    it("读物按坐标定位，不携带资源筛选", () => {
        const group = resolveDBMapGroups({ kind: "book", id: 1001 })[0]!
        const route = buildDBMapRoute(group, "净界岛·其一") as { name: string; query: Record<string, string> }

        expect(route.name).toBe("map-tool")
        expect(route.query.regionId).toBe(String(group.regionId))
        expect(route.query.subRegionId).toBe(String(group.subRegionId))
        expect(route.query.pointName).toBe("净界岛·其一")
        expect(route.query.pointX).toBe(String(group.points[0]![0]))
        expect(route.query.pointY).toBe(String(group.points[0]![1]))
        expect(route.query.pointIcon).toBe(group.icon)
        expect(route.query.rid).toBeUndefined()
    })

    it("资源额外带上 rid，让地图高亮该资源的所有采集点", () => {
        const group = resolveDBMapGroups({ kind: "resource", id: 101 })[0]!
        const route = buildDBMapRoute(group) as { query: Record<string, string> }

        expect(route.query.rid).toBe("101")
        // 没给点位名时回落到位置归属名
        expect(route.query.pointName).toBe(group.label)
    })

    it("区域没有本地地图时不产出死链", () => {
        const groups = resolveDBMapGroups({ kind: "resource", id: 211 })
        const noMap = groups.filter(group => !group.jumpable)

        expect(noMap.length).toBeGreaterThan(0)
        expect(buildDBMapRoute(noMap[0]!)).toBeNull()
    })
})
