import { beforeEach, describe, expect, it, vi } from "vitest"
import { listModuleFilters, listModules, queryModule, searchStory } from "@/utils/db-search"

/**
 * 资料库检索层「按列表页筛选规则过滤」的用例。
 *
 * 覆盖两条链路：
 * - queryModule：按模块 facet 过滤（枚举 / 数值区间 / 多值命中）；
 * - searchStory：按剧情列表页口径过滤（任务类型分组、篇章、印象标记），含无关键词的纯筛选列举。
 *
 * 剧情正文索引依赖 `getLocalizedQuestDataByLanguage` 异步取数据，测试里把它打桩成
 * 「直接返回中文原始数据」，避免依赖本地存储的语言设置与数据包加载。
 */

vi.mock("@/data/d/story-locale", async () => {
    const actual = await vi.importActual<typeof import("@/data/d/story-locale")>("@/data/d/story-locale")

    return {
        ...actual,
        resolveStoryLocaleBySetting: () => "zh",
        getLocalizedQuestDataByLanguage: async () => (await import("@/data/d/quest.data")).default,
    }
})

/** 让 localStorage 在测试环境里报「中文」，与打桩的剧情语言一致 */
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

describe("listModuleFilters", () => {
    it("剧情模块返回任务类型 / 篇章 / 印象检定 / 印象增加四组筛选项", async () => {
        const { module, facets } = await listModuleFilters("questchain")

        expect(module?.id).toBe("questchain")

        const facetIds = facets.map(facet => facet.id)
        expect(facetIds).toEqual(["type", "chapter", "imprCheck", "imprIncrease"])

        const typeFacet = facets.find(facet => facet.id === "type")
        expect(typeFacet?.kind).toBe("enum")

        // 类型只按分组口径给出：主线 / 支线 / 限时 / 活动
        expect(typeFacet?.values.map(value => value.label)).toEqual(["主线任务", "支线任务", "限时任务", "活动任务"])
    })

    it("印象检定 / 印象增加是布尔筛选项，且带命中条数说明", async () => {
        const { facets } = await listModuleFilters("questchain")

        const imprCheck = facets.find(facet => facet.id === "imprCheck")
        const imprIncrease = facets.find(facet => facet.id === "imprIncrease")

        expect(imprCheck?.kind).toBe("boolean")
        expect(imprIncrease?.kind).toBe("boolean")
        expect(imprCheck?.description).toMatch(/印象检定/)
        expect(imprIncrease?.description).toMatch(/印象增加/)
    })

    it("成就是枚举分类 + 数值品质", async () => {
        const { facets } = await listModuleFilters("achievement")

        const category = facets.find(facet => facet.id === "category")
        const quality = facets.find(facet => facet.id === "quality")

        expect(category?.kind).toBe("enum")
        expect(category?.values.length).toBeGreaterThan(0)
        expect(quality?.kind).toBe("range")
    })

    it("不支持的模块返回空筛选项", async () => {
        const { module, facets } = await listModuleFilters("not-exist")

        expect(module).toBeUndefined()
        expect(facets).toEqual([])
    })
})

describe("queryModule filters", () => {
    it("按分类枚举过滤成就", async () => {
        const { facets } = await listModuleFilters("achievement")
        const category = facets.find(facet => facet.id === "category")
        const target = category?.values[0]

        expect(target).toBeTruthy()

        const result = queryModule("achievement", { filters: { category: target!.value } })

        expect(result.total).toBeGreaterThan(0)
        expect(result.entries.every(entry => entry.subtitle?.includes(target!.label))).toBe(true)
        expect(result.total).toBe(target!.count)
    })

    it("数值筛选项支持按品质过滤", async () => {
        const { facets } = await listModuleFilters("achievement")
        const quality = facets.find(facet => facet.id === "quality")
        const target = quality?.values[0]

        expect(target).toBeTruthy()

        const result = queryModule("achievement", { filters: { quality: target!.value } })

        expect(result.total).toBe(target!.count)
        expect(result.total).toBeGreaterThan(0)
    })

    it("多个筛选项之间是与的关系", async () => {
        const { facets } = await listModuleFilters("weapon")
        const category = facets.find(facet => facet.id === "category")
        const damageType = facets.find(facet => facet.id === "damageType")

        const categoryValue = category!.values[0]!
        const damageValue = damageType!.values[0]!

        const single = queryModule("weapon", { filters: { category: categoryValue.value } })
        const both = queryModule("weapon", { filters: { category: categoryValue.value, damageType: damageValue.value } })

        expect(both.total).toBeLessThanOrEqual(single.total)
        expect(both.total).toBeGreaterThan(0)
    })

    it("数组型取值可以按其中任意一项命中（武器类型「近战 / 单手剑」）", async () => {
        const { facets } = await listModuleFilters("weapon")
        const category = facets.find(facet => facet.id === "category")
        const broadCategory = category!.values.find(value => /近战|远程/.test(value.label))

        expect(broadCategory).toBeTruthy()

        const result = queryModule("weapon", { filters: { category: broadCategory!.value } })

        expect(result.total).toBeGreaterThan(0)
    })

    it("筛选项与关键词可以叠加", async () => {
        const all = queryModule("char", { filters: { element: "f:暗" } })
        expect(all.total).toBeGreaterThan(0)

        const first = all.entries[0]!
        const narrowed = queryModule("char", { filters: { element: "f:暗" }, keyword: first.name })

        expect(narrowed.total).toBeGreaterThan(0)
    })

    it("未知筛选项取值不命中任何条目", async () => {
        const result = queryModule("achievement", { filters: { category: "f:根本不存在的分类" } })

        expect(result.total).toBe(0)
        expect(result.entries).toEqual([])
    })

    it("筛选项条件会被回显，便于模型确认口径", async () => {
        const result = queryModule("achievement", { filters: { quality: 3 } })

        expect(result.appliedFilters).toEqual({ quality: 3 })
    })
})

describe("searchStory filters", () => {
    it("按任务类型列出全部主线任务（无关键词）", async () => {
        const result = await searchStory("", { filters: { type: "主线任务" }, limit: 12 })

        expect(result.total).toBeGreaterThan(0)
        expect(result.hits.length).toBeGreaterThan(0)
        expect(result.hits.every(hit => hit.questType === "主线任务")).toBe(true)
        // 纯筛选列举不返回台词片段
        expect(result.hits.every(hit => hit.snippets.length === 0)).toBe(true)
    })

    it("主线任务总数等于主线的两条原始类型之和（type 1 与 2 并组）", async () => {
        const { facets } = await listModuleFilters("questchain")
        const typeFacet = facets.find(facet => facet.id === "type")
        const mainLabel = typeFacet?.values.find(value => value.label === "主线任务")

        const result = await searchStory("", { filters: { type: "主线任务" }, limit: 12 })

        expect(mainLabel?.count).toBe(result.total)
    })

    it("支线任务筛选项同样按并组口径统计", async () => {
        const { facets } = await listModuleFilters("questchain")
        const typeFacet = facets.find(facet => facet.id === "type")
        const sideLabel = typeFacet?.values.find(value => value.label === "支线任务")

        const result = await searchStory("", { filters: { type: "支线任务" }, limit: 12 })

        expect(sideLabel?.count).toBe(result.total)
        expect(result.hits.every(hit => hit.questType === "支线任务")).toBe(true)
    })

    it("四类任务类型互不重叠，总数不超过全量", async () => {
        const [main, side, limited, event] = await Promise.all([
            searchStory("", { filters: { type: "主线任务" }, limit: 12 }),
            searchStory("", { filters: { type: "支线任务" }, limit: 12 }),
            searchStory("", { filters: { type: "限时任务" }, limit: 12 }),
            searchStory("", { filters: { type: "活动任务" }, limit: 12 }),
        ])

        const mainIds = new Set(main.hits.map(hit => hit.chainId))
        const sideIds = new Set(side.hits.map(hit => hit.chainId))

        for (const id of sideIds) {
            expect(mainIds.has(id)).toBe(false)
        }

        // 「全量」以模块清单里的任务链条目数为准（searchStory 传空 filters 会被当作「没有筛选条件」直接拒绝）
        const total = listModules().find(module => module.id === "questchain")!.count

        expect(main.total + side.total + limited.total + event.total).toBeLessThanOrEqual(total)
    })

    it("接受原始类型数字（1 / 2 都等价于主线任务）", async () => {
        const byName = await searchStory("", { filters: { type: "主线任务" }, limit: 12 })
        const byTypeOne = await searchStory("", { filters: { type: 1 }, limit: 12 })
        const byTypeTwo = await searchStory("", { filters: { type: 2 }, limit: 12 })

        expect(byTypeOne.total).toBeGreaterThan(0)
        expect(byTypeTwo.total).toBeGreaterThan(0)
        expect(byTypeOne.total).toBe(byName.total)
        expect(byTypeTwo.total).toBe(byName.total)
    })

    it("按篇章过滤", async () => {
        const { facets } = await listModuleFilters("questchain")
        const chapterFacet = facets.find(facet => facet.id === "chapter")
        const target = chapterFacet?.values.find(value => value.label === "夜航篇")

        expect(target).toBeTruthy()

        const result = await searchStory("", { filters: { chapter: "夜航篇" }, limit: 12 })

        expect(result.total).toBe(target!.count)
        expect(result.hits.every(hit => hit.chapter.startsWith("夜航篇"))).toBe(true)
    })

    it("按印象检定过滤时，命中项都被标记为含印象检定", async () => {
        const result = await searchStory("", { filters: { imprCheck: true }, limit: 12 })

        expect(result.total).toBeGreaterThan(0)
        expect(result.hits.every(hit => hit.imprCheck === true)).toBe(true)
    })

    it("按印象增加过滤时，命中项都被标记为含印象增加", async () => {
        const result = await searchStory("", { filters: { imprIncrease: true }, limit: 12 })

        expect(result.total).toBeGreaterThan(0)
        expect(result.hits.every(hit => hit.imprIncrease === true)).toBe(true)
    })

    it("筛选项与关键词叠加时，结果仍落在筛选范围内", async () => {
        // 拿一条主线任务的名字作为关键词，验证筛选不会被关键词检索绕过
        const scope = await searchStory("", { filters: { type: "主线任务" }, limit: 12 })
        const keyword = scope.hits[0]!.chainName

        const result = await searchStory(keyword, { filters: { type: "主线任务" }, limit: 12 })

        expect(result.hits.length).toBeGreaterThan(0)
        expect(result.hits.every(hit => hit.questType === "主线任务")).toBe(true)
    })

    it("关键词检索时返回台词片段", async () => {
        const result = await searchStory("主人", { limit: 5 })

        const withSnippets = result.hits.filter(hit => hit.snippets.length > 0)
        expect(withSnippets.length).toBeGreaterThan(0)
    })

    it("关键词与筛选条件都为空时给出提示而不是抛错", async () => {
        const result = await searchStory("", {})

        expect(result.hits).toEqual([])
        expect(result.note).toMatch(/至少给出关键词或一个筛选项/)
    })

    it("筛选后无命中时返回空列表且 total 为 0", async () => {
        const result = await searchStory("某个绝不可能出现的词", { filters: { type: "活动任务" }, limit: 12 })

        expect(result.hits).toEqual([])
        expect(result.total).toBe(0)
    })

    it("筛选条件会写进 note，便于模型向用户说明口径", async () => {
        const result = await searchStory("", { filters: { type: "限时任务" }, limit: 12 })

        expect(result.note).toMatch(/已按筛选条件收窄/)
        expect(result.note).toMatch(/候选任务链/)
    })
})

describe("listModules", () => {
    it("模块清单仍然可用（facet 改造没有破坏原有导出）", () => {
        const modules = listModules()

        expect(modules.length).toBeGreaterThan(10)
        expect(modules.some(module => module.id === "questchain")).toBe(true)
    })
})
