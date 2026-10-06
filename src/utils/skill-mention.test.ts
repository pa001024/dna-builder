import { describe, expect, it } from "vitest"
import {
    buildSkillMentionMarkdown,
    collectSkillMentionNames,
    extractActiveSkillTrigger,
    filterSkillMentions,
    isSkillMentionTrigger,
    normalizeSkillTrigger,
    parseSkillMentions,
    skillMentionPath,
    stripSkillMentions,
} from "./skill-mention"

describe("skill-mention 触发符", () => {
    it("`$` 唤起面板，全角货币符归一到 `$`", () => {
        expect(isSkillMentionTrigger("$")).toBe(true)
        expect(isSkillMentionTrigger("¥")).toBe(true)
        expect(isSkillMentionTrigger("￥")).toBe(true)
        expect(isSkillMentionTrigger("@")).toBe(false)
        expect(normalizeSkillTrigger("￥")).toBe("$")
        expect(normalizeSkillTrigger("$")).toBe("$")
    })

    it("取光标前的活动提及（含空白边界）", () => {
        expect(extractActiveSkillTrigger("帮我用 $falu")).toEqual({ trigger: "$", query: "falu", start: 4 })
        expect(extractActiveSkillTrigger("$")).toEqual({ trigger: "$", query: "", start: 0 })
        expect(extractActiveSkillTrigger("看这个 ￥abc")).toEqual({ trigger: "￥", query: "abc", start: 4 })
    })

    it("不在提及语境时返回 null", () => {
        expect(extractActiveSkillTrigger("普通文本")).toBeNull()
        expect(extractActiveSkillTrigger("text$notatstart")).toBeNull()
        // `@` 之后的 `$` 不算：触发必须落在行首或空白之后
        expect(extractActiveSkillTrigger("a@$b")).toBeNull()
    })

    it("提及语境中再键入第二个触发符就退出（交给新的触发符接管）", () => {
        expect(extractActiveSkillTrigger("$a$")).toBeNull()
        expect(extractActiveSkillTrigger("$a@")).toBeNull()
    })
})

describe("skill-mention canonical 形态", () => {
    it("markdown 是 `[$名称](/名称/SKILL.md)`（对齐 ZCode）", () => {
        expect(buildSkillMentionMarkdown("falu-dps")).toBe("[$falu-dps](/falu-dps/SKILL.md)")
        expect(skillMentionPath("falu-dps")).toBe("/falu-dps/SKILL.md")
    })
})

describe("parseSkillMentions", () => {
    it("解析链接形态的提及", () => {
        expect(parseSkillMentions("用 [$falu-dps](/falu-dps/SKILL.md) 算一下")).toEqual([
            { type: "text", text: "用 " },
            { type: "skill", name: "falu-dps" },
            { type: "text", text: " 算一下" },
        ])
    })

    it("裸文本短写不再视为提及（提及只来自编辑器的 chip）", () => {
        expect(parseSkillMentions("$falu 算伤害")).toEqual([{ type: "text", text: "$falu 算伤害" }])
        expect(parseSkillMentions("$falu算一下")).toEqual([{ type: "text", text: "$falu算一下" }])
    })

    it("label 不以 `$` 开头的普通链接原样当文本", () => {
        const text = "[文档](https://example.com/a.md)"
        expect(parseSkillMentions(text)).toEqual([{ type: "text", text }])
    })

    it("label 是 `$` 但名称非法的链接不当技能", () => {
        const text = "[$Bad Name](/x/SKILL.md)"
        expect(parseSkillMentions(text)).toEqual([{ type: "text", text }])
    })
})

describe("collectSkillMentionNames", () => {
    it("收 canonical 链接形态，按首次出现顺序去重", () => {
        const names = collectSkillMentionNames("[$a](/a/SKILL.md) 与 [$b](/b/SKILL.md) 再来一次 [$a](/a/SKILL.md)")

        expect(names).toEqual(["a", "b"])
    })

    it("没有提及返回空数组（裸短写不算提及）", () => {
        expect(collectSkillMentionNames("普通提问")).toEqual([])
        expect(collectSkillMentionNames("用 $falu-dps 算一下")).toEqual([])
    })
})

describe("stripSkillMentions", () => {
    it("提及降级为裸技能名（用于会话命名与本地检索）", () => {
        expect(stripSkillMentions("用 [$falu](/falu/SKILL.md) 算伤害")).toBe("用 falu 算伤害")
    })

    it("纯提及剥离后只剩技能名", () => {
        expect(stripSkillMentions("[$falu](/falu/SKILL.md)").trim()).toBe("falu")
    })

    it("裸短写原样保留", () => {
        expect(stripSkillMentions("$falu 算伤害")).toBe("$falu 算伤害")
    })
})

describe("filterSkillMentions", () => {
    const skills = [
        { name: "falu-dps", description: "法露茜伤害", whenToUse: "算 DPS 时" },
        { name: "db-style", description: "资料库风格", whenToUse: "改 UI 时" },
        { name: "i18n", description: "翻译管理" },
    ]

    it("空查询返回全部", () => {
        expect(filterSkillMentions(skills, "")).toHaveLength(3)
    })

    it("名称前缀命中排在前", () => {
        const result = filterSkillMentions(skills, "db")

        expect(result[0]?.name).toBe("db-style")
    })

    it("描述命中也能召回", () => {
        const result = filterSkillMentions(skills, "翻译")

        expect(result.map(skill => skill.name)).toEqual(["i18n"])
    })

    it("无命中返回空数组", () => {
        expect(filterSkillMentions(skills, "zzzz-nothing")).toEqual([])
    })
})
