import { readFileSync } from "node:fs"
import i18next from "i18next"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import charData from "@/data/d/char.data"
import { charExtData } from "@/data/d/charext.data"
import { charExtData_en } from "@/data/d/charext.en.data"
import { ensureDBAgentLangReady } from "@/utils/db-locale"
import { listModuleFilters, queryModule, readEntry, searchAll } from "@/utils/db-search"

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

beforeAll(async () => {
    // 数据语言非 zh 时，db-locale 的反查索引要读 i18next 资源包；测试里初始化一个空资源实例，
    // `t()` 与译文反查都会回落原文（与线上「未收录译文」时同口径）
    if (!i18next.isInitialized) {
        await i18next.init({ lng: "zh-CN", resources: {} })
    }
})

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

describe("获取来源（readEntry 的 来源 / 获取途径 字段）", () => {
    it("魔之楔给出任务链来源", () => {
        const { entry } = readEntry("mod", { name: "统御穿刺" })
        const lines = entry?.fields.来源 as string[]

        expect(Array.isArray(lines)).toBe(true)
        expect(lines.some(line => line.includes("任务链：生存之道"))).toBe(true)
    })

    it("魔之楔给出商店来源（含价格与限购）", () => {
        const { entry } = readEntry("mod", { name: "刀尖把戏" })
        const lines = entry?.fields.来源 as string[]

        expect(lines.some(line => line.includes("商店："))).toBe(true)
    })

    it("武器给出商店来源", () => {
        const { entry } = readEntry("weapon", { id: "10101" })
        const lines = entry?.fields.来源 as string[]

        expect(entry?.name).toBe("辉珀刃")
        expect(lines.some(line => line.includes("商店："))).toBe(true)
    })

    it("资源给出获取途径（副本 / 商店 / 任务链）", () => {
        const { entry } = readEntry("resource", { id: "15002" })
        const lines = entry?.fields.获取途径 as string[]

        expect(lines.some(line => line.startsWith("副本："))).toBe(true)
        expect(lines.some(line => line.startsWith("商店："))).toBe(true)
        expect(lines.some(line => line.startsWith("任务链："))).toBe(true)
    })

    it("来源极多时去重并封顶，带省略提示", () => {
        const { entry } = readEntry("resource", { id: "101" })
        const lines = entry?.fields.获取途径 as string[]

        expect(lines.length).toBeLessThanOrEqual(31)
        expect(lines[lines.length - 1]).toContain("另有")
    })

    it("没有来源记录的条目不产出该字段", () => {
        const { entry } = readEntry("weapon", { id: "20298" })

        expect(entry?.name).toBe("血染织羽")
        expect(entry?.fields.来源).toBeUndefined()
    })
})

describe("技能字段（倍率 / 标签 / 属性影响，算伤害的唯一数据源）", () => {
    it("武器技能给出逐条倍率与标签，且带充盈标签", () => {
        const { entry } = readEntry("weapon", { id: "20298" })
        const lines = entry?.fields.技能字段 as string[]

        expect(entry?.name).toBe("血染织羽")
        expect(Array.isArray(lines)).toBe(true)

        // 面板与描述都不含这两条倍率，只能靠字段拿到
        expect(lines.some(line => line.includes("[羽化]伤害") && line.includes("500%"))).toBe(true)
        // 标签决定结算模式（充盈 / 远程 / 武器），少一条模型就会算错乘区
        expect(lines.some(line => line.includes("[羽化]伤害") && line.includes("标签：远程/武器/充盈"))).toBe(true)
        // 格式后缀是结算口径的一部分，不能只给裸百分比
        expect(lines.some(line => line.includes("[羽化]额外伤害") && line.includes("80%最大生命"))).toBe(true)
        // 动作节奏字段（每段的取消 / 连段秒数）
        expect(lines.some(line => line.includes("子弹伤害 47%") && line.includes("连段：0.5667秒"))).toBe(true)
    })

    it("角色技能的数组型倍率给首尾两档并标明等级区间", () => {
        const { entry } = readEntry("char", { name: "法露茜" })
        const lines = entry?.fields.技能字段 as string[]

        // 满级值（右端）必须与游戏面板一致：坠入黑渊「伤害」373%、充盈伤害 49%
        expect(lines.some(line => line.includes("坠入黑渊 · 伤害 109%最大生命 → 373%最大生命（技能等级 1 → 12）"))).toBe(true)
        expect(lines.some(line => line.includes("充盈伤害 16%最大生命 → 49%最大生命"))).toBe(true)
        // 属性影响决定这条字段吃哪个面板
        expect(lines.some(line => line.includes("属性影响：技能威力"))).toBe(true)
    })

    it("每行都带技能名，便于模型把字段归位到具体技能", () => {
        const { entry } = readEntry("char", { name: "煜明" })
        const lines = entry?.fields.技能字段 as string[]

        expect(lines.length).toBeGreaterThan(0)
        expect(lines.every(line => line.includes(" · "))).toBe(true)
    })

    it("魔之楔的招式替换给出替换后招式的倍率（只给名字等于没给）", () => {
        const { entry } = readEntry("mod", { name: "幻光闪烁" })
        const lines = entry?.fields.技能替换字段 as string[]

        expect(entry?.fields.技能替换).toBeInstanceOf(Array)
        expect(lines.some(line => line.includes("一段伤害 195%"))).toBe(true)
        // 带格式表达式的字段按表达式求值（165%×4），不是裸值
        expect(lines.some(line => line.includes("三段伤害 165%×4"))).toBe(true)
    })

    it("投影里自造的连接词不残留中文（其他语言提问时会出现 undefined 或中文标签）", async () => {
        // 真实环境会挂上 public/i18n 的语言包；这里手动挂一份，验证连接词确实被翻译
        const enBundle = JSON.parse(readFileSync("public/i18n/en/translation.json", "utf8"))
        i18next.addResourceBundle("en", "translation", enBundle, true, true)
        await ensureDBAgentLangReady("en")

        const { entry } = readEntry("weapon", { id: "20298", lang: "en" })
        const lines = entry?.fields.技能字段 as string[]

        expect(lines.length).toBeGreaterThan(0)
        expect(lines.join("\n")).not.toMatch(/undefined/)
        // 标签 / 秒 这类连接词走 dbAgent.skill.*，属性影响走语言包
        expect(lines.some(line => line.includes("Tag："))).toBe(true)
        expect(lines.some(line => line.includes("Toughness Damage："))).toBe(true)
        expect(lines.some(line => /[0-9]s(；|$)/.test(line))).toBe(true)
    })

    it("语言包缺失时退回中文兜底，而不是拼出 undefined", () => {
        // 空资源实例（单测环境）：连接词必须有中文兜底，否则行里会出现字面量 undefined
        const { entry } = readEntry("char", { name: "法露茜" })
        const lines = entry?.fields.技能字段 as string[]

        expect(lines.join("\n")).not.toMatch(/undefined/)
        expect(lines.some(line => line.includes("标签：") || line.includes("技能等级"))).toBe(true)
    })
})

describe("技能术语解释（机制名词的官方定义）", () => {
    it("给出处决目标 / 执行者 这类名词的判定规则", () => {
        const { entry } = readEntry("char", { name: "法露茜" })
        const lines = entry?.fields.技能术语解释 as string[]

        expect(lines.some(line => line.includes("处决目标："))).toBe(true)
        expect(lines.some(line => line.includes("执行者：") && line.includes("30%"))).toBe(true)
    })

    it("没有术语解释的角色不产出该字段（而不是给空数组）", () => {
        const withTerms = charData.filter(char => (char.技能 ?? []).some(skill => skill.术语解释))
        const without = charData.filter(char => !(char.技能 ?? []).some(skill => skill.术语解释))

        expect(withTerms.length).toBeGreaterThan(0)
        expect(without.length).toBeGreaterThan(0)
        expect(readEntry("char", { name: withTerms[0]!.名称 }).entry?.fields.技能术语解释).toBeInstanceOf(Array)
        expect(readEntry("char", { name: without[0]!.名称 }).entry?.fields.技能术语解释).toBeUndefined()
    })
})

describe("灾厄熔炼（灾厄武器的机制来源）", () => {
    it("逐档给出潜能效果与加成，Lv.0 是基础潜能", () => {
        const { entry } = readEntry("weapon", { id: "20298" })
        const lines = entry?.fields.灾厄熔炼 as string[]

        expect(entry?.name).toBe("血染织羽")
        expect(lines.some(line => line.startsWith("Lv.0 血染·蜕变：") && line.includes("500.0%灾厄伤害"))).toBe(true)
        // 只有加成的潜能也要给出来（Lv.2 血染·触发 = 触发 +180%）
        expect(lines.some(line => line.includes("血染·触发：加成：触发 +180%"))).toBe(true)
        expect(lines.some(line => line.includes("织羽·剥茧") && line.includes("80.0%"))).toBe(true)
    })

    it("非灾厄武器不产出该字段", () => {
        const { entry } = readEntry("weapon", { name: "辉珀刃" })

        expect(entry?.fields.灾厄熔炼).toBeUndefined()
    })
})

describe("readEntry 的位置字段（回答「XX 在哪」的唯一数据来源）", () => {
    it("读物给出每一页的书页坐标与藏宝点坐标", () => {
        const { entry } = readEntry("book", { id: 1001 })
        const pages = entry?.fields.书页位置 as string[]
        const treasures = entry?.fields.宝藏位置 as string[]

        expect(Array.isArray(pages)).toBe(true)
        expect(Array.isArray(treasures)).toBe(true)
        // 行格式：`页名：区域·子区域 (x, y)`
        expect(pages[0]).toMatch(/^净界岛·其一：.+ \(-?\d+, -?\d+\)$/)
        expect(treasures[0]).toMatch(/^净界岛·其一：.+ \(-?\d+, -?\d+\)$/)
        // 书页与藏宝点是两个不同的坐标
        expect(pages[0]).not.toBe(treasures[0])
    })

    it("资源给出按子区域聚合的采集位置与处数", () => {
        const { entry } = readEntry("resource", { id: 101 })
        const locations = entry?.fields.采集位置 as string[]

        expect(Array.isArray(locations)).toBe(true)
        expect(locations[0]).toMatch(/^.+ \(-?\d+, -?\d+\)/)
        // 合并后的子区域不重复
        expect(new Set(locations.map(line => line.split(" (")[0])).size).toBe(locations.length)
    })

    it("没有采集点数据的资源不产出位置字段（而不是给出空数组）", () => {
        const { entry } = readEntry("resource", { id: 99 })

        expect(entry?.fields.采集位置).toBeUndefined()
        // 位置字段缺席，但「获取途径」与采集点无关，仍应由资源来源逻辑产出
        expect(entry?.fields.获取途径).toBeInstanceOf(Array)
        expect(Object.keys(entry?.fields ?? {})).toEqual(["稀有度", "描述", "描述2", "获取途径"])
    })

    it("条目摘要里不含坐标（只能靠 read_entry 拿）", () => {
        const { entries } = queryModule("resource", { keyword: "铜币", limit: 5 })
        const summary = entries.find(entry => entry.name === "铜币")

        expect(summary).toBeTruthy()
        expect(JSON.stringify(summary)).not.toMatch(/\(\d+, \d+\)/)
    })
})

describe("NPC 模块（npc）", () => {
    it("按 id 取详情：阵营 / 类型 / 分支对话数与坐标", () => {
        const { module, entry } = readEntry("npc", { id: 701313 })

        expect(module?.id).toBe("npc")
        expect(module?.path).toBe("/db/npc")
        expect(module?.count).toBeGreaterThan(0)
        expect(entry?.name).toBe("鹿")
        expect(entry?.path).toBe("/db/npc/701313")
        expect(entry?.fields.阵营).toBe("NPC")
        expect(entry?.fields.坐标).toEqual(["鹿：百花车站·站前穹顶 (-47633, 11163)"])
    })

    it("没有坐标的 NPC 不产出坐标字段", () => {
        const { entry } = readEntry("npc", { id: 1001 })

        expect(entry?.fields.坐标).toBeUndefined()
    })

    it("副信息标注「有坐标」，可用关键词筛出可跳转地图的 NPC", () => {
        const located = queryModule("npc", { keyword: "有坐标", limit: 5 })

        expect(located.total).toBeGreaterThan(0)
        expect(located.entries.every(entry => entry.subtitle?.includes("有坐标"))).toBe(true)
        expect(located.entries.some(entry => entry.name === "莉兹贝尔")).toBe(true)
    })

    it("布尔筛选项按列表页开关口径生效（印象检定 / 印象增加 / 有对话）", () => {
        const total = queryModule("npc", {}).total
        const dialogue = queryModule("npc", { filters: { dialogue: true } }).total
        const imprCheck = queryModule("npc", { filters: { imprCheck: true } }).total
        const imprIncrease = queryModule("npc", { filters: { imprIncrease: true } }).total

        expect(total).toBeGreaterThan(dialogue)
        expect(dialogue).toBeGreaterThan(0)
        expect(imprCheck).toBeGreaterThan(0)
        expect(imprIncrease).toBeGreaterThan(0)
        // 印象检定必定出现在分支对话里，是「有对话」的子集
        expect(imprCheck).toBeLessThanOrEqual(dialogue)
    })

    it("筛选项清单里带出三个布尔开关", async () => {
        const { facets } = await listModuleFilters("npc", "zh")

        expect(facets.map(facet => `${facet.id}:${facet.kind}`)).toEqual(["imprCheck:boolean", "imprIncrease:boolean", "dialogue:boolean"])
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

describe("角色档案模块（charprofile）", () => {
    it("档案条目按角色筛选，副信息带角色名与解锁条件", () => {
        const { module, entries } = queryModule("charprofile", { filters: { char: "贝蕾妮卡" } })

        expect(module?.id).toBe("charprofile")
        expect(module?.path).toBe("/db/char")
        expect(entries.length).toBeGreaterThan(0)
        expect(entries.every(entry => entry.path === "/db/char/1101")).toBe(true)
        expect(entries[0]?.subtitle).toContain("贝蕾妮卡")
        expect(entries[0]?.subtitle).toContain("角色等级")
    })

    it("关键词能命中档案正文（正文只进隐藏检索词，不进摘要）", () => {
        const { entries } = queryModule("charprofile", { keyword: "雪地", limit: 20 })

        expect(entries.length).toBeGreaterThan(0)
        expect(entries.every(entry => entry.path.startsWith("/db/char/"))).toBe(true)
        // 档案正文很长，只参与匹配、不随条目返回（否则摘要会被正文撑爆）
        expect(entries[0]?.subtitle?.length).toBeLessThan(200)
        expect(JSON.stringify(entries[0])).not.toContain("雪地")
    })

    it("read_entry 取档案全文，且不按长文本口径截断", () => {
        // 取该角色最长的一条档案：其他长文本字段按 600 字截断，档案正文必须整篇返回
        const longest = charExtData.filter(item => item.charId === 1101).sort((left, right) => right.text.length - left.text.length)[0]!
        const { entry } = readEntry("charprofile", { id: longest.id })

        expect(entry?.fields.角色).toContain("贝蕾妮卡")
        expect(entry?.fields.档案).toBe(longest.name)

        const text = `${entry?.fields.正文 ?? ""}`
        expect(text.length).toBeGreaterThan(600)
        // 档案正文与角色详情页同口径：样式标签已剥离、昵称占位符已替换
        expect(text).not.toContain("<H>")
        expect(text).not.toContain("{nickname")
    })

    it("lang=en 时档案来自英文数据集", async () => {
        // 与 Agent 的检索路径一致：先把该语言的「按语言切分数据集」预热好，同步读取才能拿到英文那套
        await ensureDBAgentLangReady("en")

        const { entries } = queryModule("charprofile", { filters: { char: "贝蕾妮卡" }, lang: "en" })

        expect(entries.length).toBeGreaterThan(0)
        expect(entries[0]?.name).toMatch(/[A-Za-z]/)

        const longest = charExtData_en.filter(item => item.charId === 1101).sort((left, right) => right.text.length - left.text.length)[0]!
        const { entry } = readEntry("charprofile", { id: longest.id, lang: "en" })

        const text = `${entry?.fields.正文 ?? ""}`
        expect(text.length).toBeGreaterThan(600)
        expect(text).toMatch(/[A-Za-z]{4}/)
        expect(text).not.toMatch(/[\u4e00-\u9fff]/)
    })

    it("角色详情里给出档案清单（名称 + id），便于接着取正文", () => {
        const { entry } = readEntry("char", { name: "贝蕾妮卡" })
        const archiveList = entry?.fields.档案条目

        expect(Array.isArray(archiveList)).toBe(true)
        expect((archiveList as string[]).length).toBeGreaterThan(0)
        expect((archiveList as string[])[0]).toContain("见证·其一")
    })
})
