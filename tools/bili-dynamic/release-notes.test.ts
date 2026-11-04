import { describe, expect, it } from "vitest"
import { buildReleaseNotes } from "./release-notes.ts"

const BASE = {
    tag: "v1.6.0",
    previousTag: "v1.5.2",
    repo: "pa001024/dna-builder",
    commitSubjects: ["feat(updater): 桌面端改为 exe 差量自动更新", "fix(dob-calc-core): 修复变体 B/C 下槽位读写逻辑错误"],
}

describe("buildReleaseNotes", () => {
    it("没有 agent 产出时退回原版标题，提交折叠在末尾", () => {
        const notes = buildReleaseNotes({ ...BASE, generated: "" })
        expect(notes.startsWith("## 本次更新内容 (v1.5.2 → v1.6.0)")).toBe(true)
        expect(notes).toContain("<details>")
        expect(notes).toContain("<summary>原始提交记录（2 条）</summary>")
    })

    it("有 agent 产出时以它为主，且不再重复原版标题", () => {
        const notes = buildReleaseNotes({ ...BASE, generated: "## 差量更新上线\n\n本次桌面端更新包体积明显下降。" })
        expect(notes.startsWith("## 差量更新上线")).toBe(true)
        expect(notes).not.toContain("## 本次更新内容 (v1.5.2 → v1.6.0)")
        expect(notes).toContain("<details>")
    })

    it("原始提交只出现一次（折叠区内）", () => {
        const notes = buildReleaseNotes({ ...BASE, generated: "## 更新" })
        const occurrences = notes.split("feat(updater)").length - 1
        expect(occurrences).toBe(1)
    })

    it("提交标题里的括号与冒号不被转义", () => {
        const notes = buildReleaseNotes({ ...BASE, generated: "" })
        expect(notes).toContain("- feat(updater): 桌面端改为 exe 差量自动更新")
        expect(notes).not.toContain("\\(")
    })

    it("delta_line 自带引用前缀时不重复", () => {
        const notes = buildReleaseNotes({ ...BASE, generated: "## 更新", deltaLine: "> 差量更新包（仅 exe）: link" })
        expect(notes).toContain("> 差量更新包（仅 exe）: link")
        expect(notes).not.toContain("> > ")
    })

    it("包含下载入口与 Full Changelog", () => {
        const notes = buildReleaseNotes({
            ...BASE,
            generated: "## 更新",
            installerUrl: "https://cdn.example/msi",
        })
        expect(notes).toContain("> 直接下载：[v1.6.0](https://cdn.example/msi)")
        expect(notes).toContain("**Full Changelog**: https://github.com/pa001024/dna-builder/compare/v1.5.2...v1.6.0")
    })

    it("没有提交时给出兜底条目", () => {
        const notes = buildReleaseNotes({ ...BASE, generated: "", commitSubjects: [] })
        expect(notes).toContain("- 无提交记录")
    })
})
