import i18next from "i18next"
import { beforeAll, describe, expect, it } from "vitest"
import { queryModule } from "@/utils/db-search"
import { getGlobalSearchService } from "@/utils/global-search"

/**
 * U35-fix：effect-only 专属词条的检索回归。
 *
 * 这两层都只把 desc 当展示标题，手写建模名（如 2008 的「火属性弱点」）不在任何可见字段里，
 * 必须显式进检索词，否则按建模名搜索会召回不到。
 */

/** 让检索层认为界面是中文：条目名与原文一致，关键词不做反查 */
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

beforeAll(async () => {
    if (!i18next.isInitialized) {
        await i18next.init({
            lng: "zh-CN",
            resources: { "zh-CN": { translation: { common: { effect_label: "效果:" } } } },
        })
    }
    stubChineseLocale()
})

describe("db-search 升华词缀", () => {
    it("效果词条按建模名召回（火属性弱点 → 2008）", () => {
        const { entries } = queryModule("transcendence-affix", { keyword: "火属性弱点", limit: 80, lang: "zh" })

        expect(entries.some(entry => String(entry.id) === "2008")).toBe(true)
    })

    it("效果词条名是清理后的描述原文，不泄漏 <H> 标签", () => {
        const { entries } = queryModule("transcendence-affix", { keyword: "240101", limit: 80, lang: "zh" })
        const entry = entries.find(item => String(item.id) === "240101")

        expect(entry).toBeDefined()
        expect(entry?.name).toContain("扶疏终结技等级+10，[九针治未]提供的技能威力提高移除上限。")
        expect(entry?.name).not.toContain("<H>")
    })
})

describe("global-search 升华词缀", () => {
    it("效果词条标题带「效果:」前缀", () => {
        const entry = getGlobalSearchService()
            .listEntries()
            .find(item => item.id === "transcendence-affix:2008")

        expect(entry).toBeDefined()
        expect(entry?.title.startsWith("效果:")).toBe(true)
        expect(entry?.title).toContain("火属性弱点")
    })

    it("效果词条按建模名召回（火属性弱点）", () => {
        const options = getGlobalSearchService().search("火属性弱点", 200)

        expect(options.some(option => option.id === "transcendence-affix:2008")).toBe(true)
    })

    it("检索词含建模名（2008）", () => {
        const entry = getGlobalSearchService()
            .listEntries()
            .find(item => item.id === "transcendence-affix:2008")

        expect(entry?.searchText).toContain("火属性弱点")
        expect(entry?.searchText).not.toContain("火属性增伤")
    })
})
