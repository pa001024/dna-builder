/**
 * 技能模块纯逻辑的单测：frontmatter 解析、虚拟文件系统切片语义、zip 解包过滤。
 * 注册表（registry）与落盘层（skill-store）依赖网络与 OPFS，不在单测覆盖面内。
 */

import { strToU8, zipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { stripSkillFrontmatter } from "@/api/agent/skills/frontmatter"
import { grepSkillFiles, listVfsChildren, normalizeVfsPath, renderReadFile, vfsRelativePath, vfsSkillName } from "@/api/agent/skills/vfs"
import { sha256Hex, unpackSkillPackage } from "@/api/agent/skills/zip"
import { renderSkillPromptSection } from "@/shared/skill-prompt"

describe("stripSkillFrontmatter", () => {
    it("没有 frontmatter 时原文返回", () => {
        expect(stripSkillFrontmatter("# 正文\n内容")).toBe("# 正文\n内容")
    })

    it("剥离扁平 frontmatter 块", () => {
        expect(stripSkillFrontmatter('---\nname: demo-skill\ndescription: "测试技能"\nversion: 1.0.0\n---\n\n# 正文')).toBe("\n# 正文")
    })

    it("frontmatter 里有多行块标量时只按结束标记剥离", () => {
        expect(stripSkillFrontmatter("---\nname: a\nwhen_to_use: >-\n  需要算伤害\n  的时候\n---\n正文")).toBe("正文")
    })

    it("没有结束标记时原样返回", () => {
        expect(stripSkillFrontmatter("---\nname: a\n没有结束\n正文")).toBe("---\nname: a\n没有结束\n正文")
    })
})

describe("renderSkillPromptSection", () => {
    it("首行固定提示 + 一行一个技能（按名称排序）", () => {
        const section = renderSkillPromptSection([
            { name: "b-skill", description: "B" },
            { name: "a-skill", description: "A", whenToUse: "当 A 时" },
        ])
        const lines = section.split("\n")

        expect(lines[0]).toBe("The following skills are available for use with the Skill tool:")
        expect(lines[2]).toBe("- a-skill: A - 当 A 时 (file: /a-skill/SKILL.md)")
        expect(lines[3]).toBe("- b-skill: B (file: /b-skill/SKILL.md)")
    })

    it("清单为空返回空串（整段省略）", () => {
        expect(renderSkillPromptSection([])).toBe("")
        expect(renderSkillPromptSection()).toBe("")
    })

    it("超长描述截断为 249 字 + ...", () => {
        const section = renderSkillPromptSection([{ name: "x", description: "长".repeat(300) }])

        expect(section).toContain(`- x: ${"长".repeat(249)}... (file: /x/SKILL.md)`)
        expect(section).not.toContain("长".repeat(250))
    })

    it("整段超 20k 字符降级为只列名字与路径", () => {
        const skills = Array.from({ length: 100 }, (_, index) => ({ name: `skill-${index}`, description: "描".repeat(250) }))
        const section = renderSkillPromptSection(skills)

        expect(section).toContain("- skill-0 (file: /skill-0/SKILL.md)")
        expect(section).not.toContain("描")
    })
})

describe("normalizeVfsPath", () => {
    it("归一化首尾斜杠与根目录", () => {
        expect(normalizeVfsPath("/")).toBe("")
        expect(normalizeVfsPath(undefined)).toBe("")
        expect(normalizeVfsPath("/my-skill/")).toBe("my-skill")
        expect(normalizeVfsPath("a//b/./c/")).toBe("a/b/c")
    })

    it("拒绝 ..、反斜杠", () => {
        expect(normalizeVfsPath("/a/../b")).toBeNull()
        expect(normalizeVfsPath("a\\b")).toBeNull()
    })

    it("vfsSkillName / vfsRelativePath 取路径分段", () => {
        expect(vfsSkillName("my-skill/SKILL.md")).toBe("my-skill")
        expect(vfsSkillName("my-skill")).toBe("my-skill")
        expect(vfsSkillName("")).toBe("")
        expect(vfsRelativePath("my-skill/refs/a.md")).toBe("refs/a.md")
        expect(vfsRelativePath("my-skill")).toBe("")
    })
})

describe("listVfsChildren", () => {
    const files = ["SKILL.md", "refs/damage.md", "refs/deep/nested.md", "assets/a.txt"]

    it("根目录列出直接子项，目录带斜杠", () => {
        expect(listVfsChildren(files, "")).toEqual(["assets/", "refs/", "SKILL.md"])
    })

    it("子目录只列下一层", () => {
        expect(listVfsChildren(files, "refs")).toEqual(["damage.md", "deep/"])
        expect(listVfsChildren(files, "refs/deep")).toEqual(["nested.md"])
    })

    it("不存在的目录返回空", () => {
        expect(listVfsChildren(files, "nope")).toEqual([])
    })
})

describe("renderReadFile", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i + 1}`)
    const content = lines.join("\n")

    it("整读带表头与全部行号", () => {
        const result = renderReadFile(content, {})
        expect(result.totalLines).toBe(50)
        expect(result.content).toContain("[共 50 行]")
        expect(result.content).toContain("1\tline-1")
        expect(result.content).toContain("50\tline-50")
    })

    it("slice 正数取开头 N 行", () => {
        const result = renderReadFile(content, { slice: 2 })
        expect(result.content).toContain("1\tline-1")
        expect(result.content).toContain("2\tline-2")
        expect(result.content).not.toContain("3\tline-3")
    })

    it("slice 负数取末尾 N 行（-2 = 末尾 2 行）", () => {
        const result = renderReadFile(content, { slice: -2 })
        expect(result.content).toContain("49\tline-49")
        expect(result.content).toContain("50\tline-50")
        expect(result.content).not.toContain("48\tline-48")
    })

    it("line 返回该行附近上下各 3 行", () => {
        const result = renderReadFile(content, { line: 20 })
        expect(result.content).toContain("17\tline-17")
        expect(result.content).toContain("20\tline-20")
        expect(result.content).toContain("23\tline-23")
        expect(result.content).not.toContain("16\tline-16")
        expect(result.content).not.toContain("24\tline-24")
    })

    it("range 扩大 / 收窄上下文窗口", () => {
        expect(renderReadFile(content, { line: 20, range: 5 }).content).toContain("15\tline-15")
        const narrow = renderReadFile(content, { line: 20, range: 0 })
        expect(narrow.content).toContain("20\tline-20")
        expect(narrow.content).not.toContain("19\tline-19")
    })

    it("line 越界给提示", () => {
        const result = renderReadFile(content, { line: 999 })
        expect(result.notice).toContain("超出范围")
    })

    it("search 返回命中行及上下文，多命中合并窗口", () => {
        const result = renderReadFile(content, { search: "line-30" })
        expect(result.content).toContain("命中 1 处")
        expect(result.content).toContain("30\tline-30")
        expect(result.content).toContain("27\tline-27")
    })

    it("search 忽略大小写；无命中给提示", () => {
        expect(renderReadFile(content, { search: "LINE-10" }).content).toContain("10\tline-10")
        expect(renderReadFile("abc", { search: "xyz" }).content).toContain("未找到")
    })

    it("整读超出行数上限时截断并提示", () => {
        const big = Array.from({ length: 3000 }, (_, i) => `row-${i + 1}`).join("\n")
        const result = renderReadFile(big, {})
        expect(result.notice).toContain("2000")
        expect(result.content).not.toContain("2001\t")
    })
})

describe("grepSkillFiles", () => {
    const files = [
        { path: "a-skill/SKILL.md", content: "alpha\nBeta gamma\nalpha again" },
        { path: "a-skill/refs/x.md", content: "nothing here" },
        { path: "b-skill/SKILL.md", content: "alpha in b" },
    ]

    it("按正则跨文件搜索并统计", () => {
        const result = grepSkillFiles(files, { pattern: "alpha" })
        expect(result.matchCount).toBe(3)
        expect(result.fileCount).toBe(2)
        expect(result.content).toContain("/a-skill/SKILL.md:1:alpha")
        expect(result.content).toContain("/b-skill/SKILL.md:1:alpha in b")
    })

    it("ignoreCase 默认 true", () => {
        const result = grepSkillFiles(files, { pattern: "beta gamma" })
        expect(result.matchCount).toBe(1)
        expect(result.content).toContain("/a-skill/SKILL.md:2:Beta gamma")
    })

    it("path 限定技能范围；glob 过滤文件", () => {
        expect(grepSkillFiles(files, { pattern: "alpha", path: "b-skill" }).fileCount).toBe(1)
        expect(grepSkillFiles(files, { pattern: "alpha", glob: "*.md" }).fileCount).toBe(2)
    })

    it("非法正则按普通文本兜底（不抛错、按字面量匹配）", () => {
        // "a(lpha" 不是合法正则：不应抛错，按字面量匹配不到即 0 命中
        expect(grepSkillFiles(files, { pattern: "a(lpha" }).matchCount).toBe(0)

        // 字面量本身出现在文件里时要能命中
        const literalFiles = [{ path: "l/SKILL.md", content: "包含 a(lpha 字面量" }]
        expect(grepSkillFiles(literalFiles, { pattern: "a(lpha" }).matchCount).toBe(1)
    })

    it("context 控制上下文行数，非相邻命中间有分隔", () => {
        const result = grepSkillFiles(files, { pattern: "alpha", context: 1 })
        // 命中行 1 的上下文是行 2（Beta gamma），用 `-` 连接
        expect(result.content).toContain("/a-skill/SKILL.md-2:Beta gamma")

        // context=0 时行 1 与行 3 之间出现 rg 风格的 `--` 分隔
        const noContext = grepSkillFiles(files, { pattern: "alpha", context: 0 })
        expect(noContext.content).toContain("--")
        expect(noContext.content).not.toContain("-2:")
    })

    it("无命中时只给统计行", () => {
        const result = grepSkillFiles(files, { pattern: "不存在的词" })
        expect(result.matchCount).toBe(0)
        expect(result.content).toContain("0 处命中")
    })
})

describe("unpackSkillPackage / sha256Hex", () => {
    it("解包文本、剔除目录与 __MACOSX", async () => {
        const zip = zipSync({
            "SKILL.md": strToU8("# 正文"),
            refs: null,
            "refs/a.md": strToU8("A"),
            "__MACOSX/x": strToU8("junk"),
        } as never)
        const files = await unpackSkillPackage(zip)

        expect(files.get("SKILL.md")).toBe("# 正文")
        expect(files.get("refs/a.md")).toBe("A")
        expect(files.has("refs/")).toBe(false)
        expect([...files.keys()].every(path => !path.startsWith("__MACOSX"))).toBe(true)
    })

    it("sha256 是 64 位 hex 且结果稳定", async () => {
        const zip = zipSync({ "SKILL.md": strToU8("x") })
        const [first, second] = await Promise.all([sha256Hex(zip), sha256Hex(zip)])

        expect(first).toMatch(/^[0-9a-f]{64}$/)
        expect(first).toBe(second)
    })
})
