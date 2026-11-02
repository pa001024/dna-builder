import i18next from "i18next"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { listEntryFields, parseDBSelect, readEntry } from "@/utils/db-search"

/**
 * `read_entry` 的 GraphQL 风格 select 投影。
 *
 * 覆盖两条独立职责：`parseDBSelect` 的语法容错（模型自填的选择串不能抛异常），
 * 以及投影本身——包括数组按元素展开、点号路径等价写法、体积护栏与多语言透传。
 */

/** 读取 readEntry 返回的投影数据并断言其结构，避免测试里到处写类型断言 */
function selectOf(moduleId: string, options: { id?: string | number; name?: string; select: string }): Record<string, unknown> {
    const { data, error } = readEntry(moduleId, { ...options })

    expect(error).toBeUndefined()

    return data as Record<string, unknown>
}

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
    // 与 db-search-entry 同口径：投影里的文案要过 i18next，空资源即回落原文
    if (!i18next.isInitialized) {
        await i18next.init({ lng: "zh-CN", resources: {} })
    }
})

beforeEach(() => {
    stubChineseLocale()
})

describe("select 语法解析（模型自填，错了不能抛异常）", () => {
    it("空选择串等于不投影", () => {
        expect(parseDBSelect(undefined)).toBeUndefined()
        expect(parseDBSelect("")).toBeUndefined()
        expect(parseDBSelect("   ")).toBeUndefined()
    })

    it("最外层花括号可省，逗号可省略，尾随逗号合法", () => {
        expect(parseDBSelect("id 名称")?.tree).toEqual({ id: true, 名称: true })
        expect(parseDBSelect("{ id, 名称 }")?.tree).toEqual({ id: true, 名称: true })
        expect(parseDBSelect("{ id, 名称, }")?.tree).toEqual({ id: true, 名称: true })
    })

    it("点号路径与逐层花括号等价", () => {
        expect(parseDBSelect("{ 技能.字段.值 }")?.tree).toEqual(parseDBSelect("{ 技能 { 字段 { 值 } } }")?.tree)
    })

    it("括号不闭合时给出错误原文与正确写法", () => {
        const result = parseDBSelect("{ id 名称 技能 { 名称 ")

        expect(result?.tree).toBeUndefined()
        expect(result?.error).toContain("select 语法无法解析")
        expect(result?.error).toContain("不需要冒号")
    })

    it("尾部有多余内容时不静默忽略", () => {
        const result = parseDBSelect("{ id } 垃圾")

        expect(result?.tree).toBeUndefined()
        expect(result?.error).toContain("多余内容")
    })
})

describe("select 投影：任意结构的原始字段", () => {
    it("只返回选中的字段，数组按元素展开", () => {
        const data = selectOf("weapon", { name: "血染织羽", select: "{ id 名称 技能 { 名称 字段 { 名称 值 } } }" })

        expect(data.名称).toBe("血染织羽")
        expect(Object.keys(data).sort()).toEqual(["id", "名称", "技能"].sort())

        const skills = data.技能 as Array<{ 名称: string; 字段: Array<{ 名称: string; 值: unknown }> }>

        expect(skills.map(skill => skill.名称)).toContain("射击")
        expect(skills.map(skill => skill.名称)).toContain("羽化")

        // 「射击」的子弹 / 弹射两条倍率都能逐条取到，这正是原先查不到的粒度
        const shooting = skills.find(skill => skill.名称 === "射击")!
        expect(shooting.字段.map(field => field.名称)).toEqual(["子弹伤害", "弹射伤害"])
        expect(shooting.字段.every(field => typeof field.值 === "number")).toBe(true)
    })

    it("点号路径写法与花括号写法结果一致", () => {
        const dotted = selectOf("char", { name: "法露茜", select: "id 名称 技能.字段.名称" })
        const nested = selectOf("char", { name: "法露茜", select: "{ id 名称 技能 { 字段 { 名称 } } }" })

        expect(dotted).toEqual(nested)
    })

    it("按等级成长的数组原样返回，不替模型选档", () => {
        const data = selectOf("char", { name: "法露茜", select: "{ 技能 { 名称 字段 { 名称 值 } } }" })
        const skills = data.技能 as Array<{ 名称: string; 字段: Array<{ 名称: string; 值: unknown }> }>
        const first = skills[0]!
        const grown = first.字段.find(field => Array.isArray(field.值))

        expect(grown).toBeDefined()
        expect((grown!.值 as number[]).length).toBe(12)
    })

    it("给了 select 就不再返回 fields 文本，避免同一份数据两套口径", () => {
        const { entry, data } = readEntry("char", { name: "法露茜", select: "{ id 名称 }" })

        expect(data).toEqual({ id: expect.anything(), 名称: "法露茜" })
        expect(entry?.fields).toEqual({})
    })

    it("select 语法错误时不返回任何字段，只把错误原文交回给模型", () => {
        const { entry, data, error } = readEntry("char", { name: "法露茜", select: "{ id 名称 技能 { 名称 " })

        expect(data).toBeUndefined()
        expect(entry).toBeUndefined()
        expect(error).toContain("select 语法无法解析")
    })

    it("不写 select 时行为不变：只给 fields，不给原始投影", () => {
        const { entry, data } = readEntry("weapon", { name: "血染织羽" })

        expect(data).toBeUndefined()
        expect(Object.keys(entry?.fields ?? {}).length).toBeGreaterThan(5)
    })

    it("模块不支持投影时明确报错，不静默返回空 fields", () => {
        const { entry, data, error } = readEntry("charprofile", { id: 1001, select: "{ id 名称 }" })

        expect(data).toBeUndefined()
        expect(entry).toBeUndefined()
        expect(error).toContain("不支持 select 原始投影")
    })

    it("节点数超上限时截断并说明，不把上下文撑爆", () => {
        // 贝蕾妮卡的原始记录（技能 12 级 × 多段 × 多字段）是全库最重的，整条 select 必然超上限
        const data = selectOf("char", { name: "贝蕾妮卡", select: "{ id 名称 技能 特质 突破 溯源 加成 }" })
        const note = data.__截断

        expect(typeof note).toBe("string")
        expect(note as string).toContain("截断")
    })
})

describe("selectableFields：告诉模型这条还能 select 什么", () => {
    it("只列 fields 没覆盖的字段（成长表 / 灾厄熔炼原始档位）", () => {
        const { entry, selectableFields } = readEntry("weapon", { name: "血染织羽" })

        // `熔炉` 是灾厄武器的真正机制来源，fields 只给了折算后的「灾厄熔炼」文本
        expect(selectableFields).toContain("熔炉")
        expect(selectableFields).toContain("突破")
        // 面板那些已经在 fields 里，不该再让模型 select 一遍
        expect(selectableFields).not.toContain("弹匣")
        expect(selectableFields).not.toContain("暴击")
        expect(Object.keys(entry?.fields ?? {})).toContain("灾厄熔炼")
    })

    it("不把 entry.name 已经承载的「名称」算成可查字段", () => {
        const { selectableFields } = readEntry("char", { name: "法露茜" })

        expect(selectableFields).not.toContain("名称")
    })

    it("已经 select 过就不再提示可选字段", () => {
        const { selectableFields } = readEntry("char", { name: "法露茜", select: "{ id 名称 }" })

        expect(selectableFields).toBeUndefined()
    })

    it("模块不支持投影时不给可选字段，也不报错", () => {
        const { entry, selectableFields, error } = readEntry("charprofile", { id: 1001 })

        expect(entry?.name).toBe("见证·其一")
        expect(selectableFields).toBeUndefined()
        expect(error).toBeUndefined()
    })
})

describe("list_entry_fields：告诉模型能选哪些字段", () => {
    it("输出点号路径，可直接照抄进 select", () => {
        const { fields } = listEntryFields("weapon")
        const paths = fields.map(field => field.path)

        expect(paths).toContain("技能")
        expect(paths).toContain("技能.名称")
        expect(paths).toContain("技能.字段.值")
        expect(paths).toContain("熔炼")
    })

    it("同名键按路径区分，不跨层级互相覆盖", () => {
        const { fields } = listEntryFields("char")
        const paths = fields.map(field => field.path)

        // 顶层有「名称」，技能元素上也有「名称」，两条路径必须都在
        expect(paths).toContain("名称")
        expect(paths).toContain("技能.名称")
    })

    it("不支持投影的模块明确说明，而不是返回空数组让模型自己猜", () => {
        const { fields, note } = listEntryFields("charprofile")

        expect(fields).toEqual([])
        expect(note).toContain("不支持 select 原始投影")
    })
})
