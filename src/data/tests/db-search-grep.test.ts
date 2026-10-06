import i18next from "i18next"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import modData from "@/data/d/mod.data"
import { queryModule } from "@/utils/db-search"

/**
 * 资料库检索层的「字段级搜索」（`mode=grep`）。
 *
 * 回归的是 fuzzy 的固有空缺：关键词默认只匹配名称、副信息与隐藏检索词，
 * 条目内部字段（魔之楔的 `技能威力` 词条、数值型 `护盾`、`效果` 文案里的术语）
 * 一律搜不到。「哪些魔之楔带技能威力」这类按字段找条目的提问必须靠 grep 下钻原始数据。
 */

/** 让 localStorage 在测试环境里报「中文」，检索层才会取中文原文而不是界面语言 */
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
        await i18next.init({ lng: "zh-CN", resources: {} })
    }
})

beforeEach(() => {
    stubChineseLocale()
})

/** 数据里确实存在该数值词条的条目 id 集合，作为字段级命中的期望值 */
const skillPowerIds = new Set(
    modData.filter(item => typeof (item as unknown as Record<string, unknown>).技能威力 === "number").map(item => `${item.id}`)
)

describe("queryModule 的检索模式开关", () => {
    it("默认模式是 fuzzy，返回值回显 appliedMode", () => {
        const result = queryModule("mod", { keyword: "炽灼", limit: 5 })

        expect(result.appliedMode).toBe("fuzzy")
    })

    it("显式 fuzzy 与默认行为一致", () => {
        const byDefault = queryModule("mod", { keyword: "炽灼", limit: 5 })
        const byExplicit = queryModule("mod", { keyword: "炽灼", limit: 5, mode: "fuzzy" })

        expect(byExplicit.total).toBe(byDefault.total)
        expect(byExplicit.appliedMode).toBe("fuzzy")
    })

    it("请求 grep 时 appliedMode 变为 grep", () => {
        const result = queryModule("mod", { keyword: "技能威力", mode: "grep", limit: 80 })

        expect(result.appliedMode).toBe("grep")
    })

    it("模块没有可下钻的原始字段时 grep 退回 fuzzy 并说明原因", () => {
        // 伤害机制是派生模块（无 MODULE_RAW_LISTS），grep 无从下钻
        const result = queryModule("damage", { keyword: "暴击", mode: "grep", limit: 5 })

        expect(result.appliedMode).toBe("fuzzy")
        expect(result.note).toMatch(/没有可下钻的原始字段/)
    })
})

describe("grep：按字段名找条目（fuzzy 的空缺）", () => {
    it("搜「技能威力」能命中全部带该词条的魔之楔，而 fuzzy 一条都没有", () => {
        const fuzzy = queryModule("mod", { keyword: "技能威力", limit: 80 })
        const grep = queryModule("mod", { keyword: "技能威力", mode: "grep", limit: 80 })

        // fuzzy 只看标题与描述：这个词只存在于数据字段里，命中为 0
        expect(fuzzy.total).toBe(0)

        // 顶层字段 `技能威力` 的命中都落在数据里带该数值词条的条目集合内
        // （另有少量条目是在嵌套结构 `生效.技能威力` 或 `生效.条件` 的字面量里出现，属 grep 的正确行为；
        //   limit 上限 80 会让尾部条目被截断，因此这里断言子集而非全等）
        const byTopField = grep.entries.filter(entry => entry.matches?.some(match => match.path === "技能威力"))

        expect(byTopField.length).toBeGreaterThan(0)
        expect(byTopField.every(entry => skillPowerIds.has(`${entry.id}`))).toBe(true)

        expect(grep.total).toBeGreaterThanOrEqual(skillPowerIds.size)
        expect(grep.entries.every(entry => entry.matches?.length)).toBe(true)
    })

    it("命中条目带 matches，标注字段路径与命中类型", () => {
        const { entries } = queryModule("mod", { keyword: "技能威力", mode: "grep", limit: 5 })
        const first = entries[0]!

        expect(first.matches?.length).toBeGreaterThan(0)
        expect(first.matches![0]!.path).toBe("技能威力")
        // 命中字段名（词条存在）而非字段值
        expect(first.matches![0]!.kind).toBe("name")
    })

    it("数值型词条（护盾）同样按字段名命中", () => {
        const shieldIds = new Set(
            modData.filter(item => typeof (item as unknown as Record<string, unknown>).护盾 === "number").map(item => `${item.id}`)
        )
        const result = queryModule("mod", { keyword: "护盾", mode: "grep", limit: 80 })

        expect(shieldIds.size).toBeGreaterThan(0)
        expect(result.total).toBe(shieldIds.size)
        expect(result.entries.every(entry => shieldIds.has(`${entry.id}`))).toBe(true)
    })
})

describe("grep：按字段值找条目", () => {
    it("搜「风属性」能命中效果文案里出现该词、但标题不含它的魔之楔", () => {
        const grep = queryModule("mod", { keyword: "风属性", mode: "grep", limit: 80 })

        expect(grep.total).toBeGreaterThan(0)

        // 命中是值级命中：路径指向「效果」，而不是条目名
        const byValue = grep.entries.filter(entry => entry.matches?.some(match => match.kind === "value"))
        expect(byValue.length).toBeGreaterThan(0)
        expect(byValue.some(entry => entry.matches!.some(match => match.path.startsWith("效果")))).toBe(true)
    })

    it("命中字段值会带上取值文本", () => {
        const { entries } = queryModule("mod", { keyword: "风属性", mode: "grep", limit: 5 })
        const matched = entries.find(entry => entry.matches?.some(match => match.kind === "value"))!

        expect(matched).toBeTruthy()

        const valueMatch = matched.matches!.find(match => match.kind === "value")!
        expect(valueMatch.value).toContain("风属性")
    })
})

describe("grep 与 fuzzy / filters / version 的组合", () => {
    it("grep 结果里不再出现 matches（fuzzy 模式下无此字段）", () => {
        const { entries } = queryModule("mod", { keyword: "炽灼", limit: 5 })

        expect(entries.every(entry => entry.matches === undefined)).toBe(true)
    })

    it("grep 与 filters 叠加时先按分类收窄再按字段搜索", () => {
        const all = queryModule("mod", { keyword: "技能威力", mode: "grep", limit: 80 })
        const scoped = queryModule("mod", { keyword: "技能威力", mode: "grep", filters: { type: "f:角色" }, limit: 80 })

        expect(scoped.total).toBeGreaterThan(0)
        expect(scoped.total).toBeLessThanOrEqual(all.total)
        expect(scoped.entries.every(entry => entry.subtitle?.includes("角色"))).toBe(true)
    })

    it("grep 模式下没有关键词时不返回 matches（只是普通列举）", () => {
        const { entries, appliedMode } = queryModule("mod", { mode: "grep", limit: 5 })

        expect(appliedMode).toBe("grep")
        expect(entries.every(entry => entry.matches === undefined)).toBe(true)
    })
})
