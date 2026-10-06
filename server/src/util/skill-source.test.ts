import { describe, expect, it } from "bun:test"
import { strToU8 } from "fflate"
import { buildSkillZip, deriveSkillMeta, parseSkillFrontmatter, sha256Hex } from "./skill-source"

/** 构造一条目录条目（内容自动编码为 UTF-8 字节）。 */
function entry(path: string, content: string): { path: string; size: number; content: Uint8Array } {
    const bytes = strToU8(content)

    return { path, size: bytes.length, content: bytes }
}

/** 一份最小但合法的技能目录内容。 */
function validEntries() {
    return [entry("SKILL.md", "---\nname: demo\ndescription: 演示技能\n---\n\n# 正文"), entry("refs/a.md", "A")]
}

describe("parseSkillFrontmatter", () => {
    it("解析扁平键值并去掉引号", () => {
        const fields = parseSkillFrontmatter('---\nname: demo\ndescription: "带引号的描述"\nwhenToUse: 当 X 时\n---\n正文')

        expect(fields.name).toBe("demo")
        expect(fields.description).toBe("带引号的描述")
        expect(fields.whenToUse).toBe("当 X 时")
    })

    it("没有 frontmatter 或未闭合时返回空对象", () => {
        expect(parseSkillFrontmatter("# 没有头部")).toEqual({})
        expect(parseSkillFrontmatter("---\nname: a\n没有结束")).toEqual({})
    })
})

describe("buildSkillZip", () => {
    it("同一份内容必然产出同一份字节与 sha（mtime 固定、条目排序稳定）", () => {
        const first = buildSkillZip(
            new Map([
                ["b.md", strToU8("B")],
                ["SKILL.md", strToU8("# A")],
            ])
        )
        const second = buildSkillZip(
            new Map([
                ["SKILL.md", strToU8("# A")],
                ["b.md", strToU8("B")],
            ])
        )

        expect(sha256Hex(first)).toBe(sha256Hex(second))
        expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true)
    })

    it("内容变化时 sha 变化", () => {
        const a = buildSkillZip(new Map([["SKILL.md", strToU8("# A")]]))
        const b = buildSkillZip(new Map([["SKILL.md", strToU8("# B")]]))

        expect(sha256Hex(a)).not.toBe(sha256Hex(b))
    })
})

describe("deriveSkillMeta", () => {
    it("目录名即技能名，描述取自 frontmatter，并统计文件数与包大小", () => {
        const result = deriveSkillMeta("demo-skill", validEntries(), 1700000000000)

        expect("meta" in result).toBe(true)
        if (!("meta" in result)) return

        expect(result.meta.name).toBe("demo-skill")
        expect(result.meta.description).toBe("演示技能")
        expect(result.meta.enabled).toBe(true)
        expect(result.meta.sortOrder).toBe(0)
        expect(result.meta.fileCount).toBe(2)
        expect(result.meta.packageSha).toMatch(/^[0-9a-f]{64}$/)
        expect(result.meta.packageSize).toBeGreaterThan(0)
        expect(result.meta.updateAt).toBe(1700000000000)
    })

    it("读取 whenToUse / version / enabled / sortOrder", () => {
        const content = "---\nname: x\ndescription: D\nwhenToUse: 当 Y 时\nversion: 1.2.3\nenabled: false\nsortOrder: 5\n---\n正文"
        const result = deriveSkillMeta("demo", [entry("SKILL.md", content)], 1)

        expect("meta" in result).toBe(true)
        if (!("meta" in result)) return

        expect(result.meta.whenToUse).toBe("当 Y 时")
        expect(result.meta.version).toBe("1.2.3")
        expect(result.meta.enabled).toBe(false)
        expect(result.meta.sortOrder).toBe(5)
    })

    it("忽略隐藏文件与 __MACOSX 条目", () => {
        const entries = [...validEntries(), entry(".DS_Store", "x"), entry("__MACOSX/._x", "x"), entry("refs/.hidden", "x")]
        const result = deriveSkillMeta("demo", entries, 1)

        expect("meta" in result).toBe(true)
        if (!("meta" in result)) return

        expect(result.meta.fileCount).toBe(2)
        expect(result.files.has(".DS_Store")).toBe(false)
    })

    it("缺根级 SKILL.md / 缺描述 / 非法目录名时返回错误", () => {
        expect(deriveSkillMeta("demo", [entry("refs/a.md", "A")], 1)).toEqual({
            error: expect.stringContaining("SKILL.md"),
        })
        expect(deriveSkillMeta("demo", [entry("SKILL.md", "# 无 frontmatter")], 1)).toEqual({
            error: expect.stringContaining("description"),
        })
        expect(deriveSkillMeta("Bad Name", validEntries(), 1)).toEqual({
            error: expect.stringContaining("kebab-case"),
        })
    })
})
