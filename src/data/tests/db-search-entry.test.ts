import { beforeEach, describe, expect, it } from "vitest"
import { queryModule, readEntry, searchAll } from "@/utils/db-search"

/**
 * 资料库检索层「条目详情」（readEntry）的用例。
 *
 * 覆盖两条定位路径（id / 名称）、候选回退与详情字段的取用，并回归「角色生日」这个
 * 曾经查不到的字段：它只出现在详情字段与隐藏检索词（searchText）里，
 * 条目摘要（query_module_entries 的返回结构）里没有，因此必须靠 read_entry 取。
 */

/** 让 localStorage 在测试环境里报「中文」，与数据语言的中文原文一致 */
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

describe("readEntry 定位", () => {
    it("按名称取角色详情，返回生日等档案字段", () => {
        const { module, entry } = readEntry("char", { name: "煜明" })

        expect(module?.id).toBe("char")
        expect(entry?.name).toBe("煜明")
        expect(entry?.fields.生日).toBe("11-11")
        expect(entry?.fields.出生地).toBe("华胥")
        expect(entry?.fields.势力).toBe("应天尉")
        expect(entry?.path).toBe(`/db/char/${entry?.id}`)
    })

    it("按 id 取到的详情与按名称一致", () => {
        const byName = readEntry("char", { name: "煜明" })
        const byId = readEntry("char", { id: byName.entry!.id })

        expect(byId.entry?.name).toBe("煜明")
        expect(byId.entry?.fields.生日).toBe("11-11")
    })

    it("名称只命中唯一候选时直接返回详情（别名也能命中）", () => {
        const { entry } = readEntry("char", { name: "无罪囚徒" })

        expect(entry?.name).toBe("煜明")
        expect(entry?.fields.生日).toBe("11-11")
    })

    it("未命中时返回错误而不是抛错", () => {
        const { entry, error } = readEntry("char", { name: "绝不可能存在的角色名" })

        expect(entry).toBeUndefined()
        expect(error).toMatch(/未找到条目/)
    })

    it("候选不唯一时给出候选列表", () => {
        const { entry, candidates, error } = readEntry("char", { name: "卡" })

        expect(entry).toBeUndefined()
        expect(candidates?.length).toBeGreaterThan(1)
        expect(error).toMatch(/候选条目/)
    })

    it("缺少 id 与名称时提示需要先定位条目", () => {
        const { entry, error } = readEntry("char", {})

        expect(entry).toBeUndefined()
        expect(error).toMatch(/id 或名称/)
    })

    it("不支持的模块返回空结果", () => {
        expect(readEntry("not-exist", { id: 1 }).module).toBeUndefined()
    })
})

describe("readEntry 详情字段", () => {
    it("角色详情包含四国 CV 与基础属性", () => {
        const { entry } = readEntry("char", { name: "煜明" })

        expect(entry?.fields.日文CV).toBe("細谷佳正")
        expect(typeof entry?.fields.基础攻击).toBe("number")
        expect(entry?.fields.技能).toBeInstanceOf(Array)
    })

    it("武器的暴击 / 暴伤 / 触发折算成百分比", () => {
        const weapon = queryModule("weapon", { keyword: "辉珀刃", limit: 1 }).entries[0]!
        const { entry } = readEntry("weapon", { id: weapon.id })

        expect(entry?.name).toBe("辉珀刃")
        expect(entry?.fields.攻击).toBe(19)
        expect(entry?.fields.暴击).toBe("25%")
        expect(entry?.fields.暴伤).toBe("200%")
        expect(entry?.fields.触发).toBe("15%")
        expect(entry?.fields.突破材料).toBeInstanceOf(Array)
    })

    it("魔之楔给出满级词条属性与效果文案", () => {
        const mod = queryModule("mod", { keyword: "炽灼", limit: 1 }).entries[0]!
        const { entry } = readEntry("mod", { id: mod.id })

        expect(entry?.name).toBe("炽灼")
        expect(entry?.fields["词条属性（满级）"]).toEqual(["攻击 +15%"])
        expect(entry?.fields.类型).toBe("角色")
    })

    it("成就给出奖励清单", () => {
        const achievement = queryModule("achievement", { keyword: "转动命运螺旋Ⅰ", limit: 1 }).entries[0]!
        const { entry } = readEntry("achievement", { id: achievement.id })

        expect(entry?.fields.描述).toBeTruthy()
        expect(entry?.fields.奖励).toBeInstanceOf(Array)
    })
})

describe("角色档案字段的检索面", () => {
    it("关键词可以直接是生日值", () => {
        const { entries } = queryModule("char", { keyword: "11-11", limit: 20 })

        expect(entries.some(entry => entry.name === "煜明")).toBe(true)
    })

    it("关键词可以是 CV 名", () => {
        const { entries } = queryModule("char", { keyword: "卢力峰DK", limit: 20 })

        expect(entries.some(entry => entry.name === "煜明")).toBe(true)
    })

    it("条目摘要里不含生日（详情字段只能靠 read_entry 拿）", () => {
        const { entries } = queryModule("char", { keyword: "煜明", limit: 5 })
        const summary = entries.find(entry => entry.name === "煜明")

        expect(summary).toBeTruthy()
        expect(summary?.subtitle).not.toMatch(/11-11/)
        expect(JSON.stringify(summary)).not.toMatch(/11-11/)
    })

    it("全库检索（search_data 的底层）同样能用生日值定位角色", () => {
        const char = queryModule("char", { keyword: "煜明", limit: 1 }).entries[0]!
        const hits = searchAll("11-11", { limit: 20 })

        expect(hits.some(hit => hit.path === char.path)).toBe(true)
    })
})
