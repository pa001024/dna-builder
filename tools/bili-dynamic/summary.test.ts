import { describe, expect, it } from "vitest"
import { finalizeBody } from "./fallback.ts"
import { buildDynamicText, parseCommitSubject, summarizeCommits } from "./summary.ts"

const META = { version: "1.6.0", previousVersion: "1.5.2", tag: "v1.6.0", previousTag: "v1.5.2", repo: "pa001024/dna-builder" }

describe("parseCommitSubject", () => {
    it("解析 conventional commit 的 type / scope / 描述", () => {
        expect(parseCommitSubject("feat(updater): 桌面端改为 exe 差量自动更新")).toEqual({
            type: "feat",
            scope: "updater",
            description: "桌面端改为 exe 差量自动更新",
            breaking: false,
        })
    })

    it("识别破坏性变更标记", () => {
        expect(parseCommitSubject("feat(core)!: 重写计算核心")?.breaking).toBe(true)
    })

    it("丢弃 merge 提交", () => {
        expect(parseCommitSubject("Merge pull request #12 from dev")).toBeNull()
    })

    it("无前缀的提交归入 other", () => {
        expect(parseCommitSubject("限制测试并发 worker 以降低内存占用")).toMatchObject({ type: "other", scope: "" })
    })
})

describe("summarizeCommits", () => {
    it("过滤内部改动并按类型分组", () => {
        const summary = summarizeCommits([
            "feat(updater): 桌面端改为 exe 差量自动更新",
            "fix(dob-calc-core): 修复变体 B/C 下槽位读写逻辑错误",
            "docs: 补充更新说明",
            "chore: 升级依赖",
            "perf: 限制测试并发 worker",
        ])
        expect(summary.groups.map(group => group.key)).toEqual(["feat", "fix", "perf"])
        expect(summary.totalCount).toBe(3)
    })

    it("相同 scope 与描述只保留一条", () => {
        const summary = summarizeCommits(["fix(web): 修复黑屏", "fix(web): 修复黑屏"])
        expect(summary.totalCount).toBe(1)
    })

    it("全部是内部改动时给出兜底条目", () => {
        const summary = summarizeCommits(["docs: 更新文档", "ci: 调整流水线"])
        expect(summary.groups).toHaveLength(1)
        expect(summary.groups[0].items[0].description).toContain("稳定性")
    })

    it("总条数不超过上限并记录隐藏数量", () => {
        const subjects = Array.from({ length: 20 }, (_, index) => `feat(mod${index}): 新增功能 ${index}`)
        const summary = summarizeCommits(subjects, { maxItems: 6, maxPerGroup: 6 })
        const shown = summary.groups.reduce((sum, group) => sum + group.items.length, 0)
        expect(shown).toBeLessThanOrEqual(6)
        expect(summary.hiddenCount).toBe(20 - shown)
    })
})

describe("buildDynamicText", () => {
    it("包含版本、分点与 release 链接", () => {
        const summary = summarizeCommits(["feat(updater): 桌面端改为 exe 差量自动更新", "fix: 修复槽位读写"])
        const text = buildDynamicText(summary, META)
        expect(text).toContain("DNA Builder v1.6.0 更新啦！")
        expect(text).toContain("· [updater] 桌面端改为 exe 差量自动更新")
        expect(text).toContain("https://github.com/pa001024/dna-builder/releases/tag/v1.6.0")
    })

    it("超长时丢弃尾部条目并标注剩余数量", () => {
        const subjects = Array.from({ length: 40 }, (_, index) => `feat(mod${index}): ${"很长的功能描述".repeat(4)}`)
        const summary = summarizeCommits(subjects, { maxItems: 40, maxPerGroup: 40 })
        const text = buildDynamicText(summary, META, 600)
        expect(Array.from(text).length).toBeLessThanOrEqual(600)
        expect(text).toContain("另有")
    })
})

describe("finalizeBody", () => {
    it("补上开头点题与 release 链接", () => {
        const text = finalizeBody("这期主要修了几处计算问题。", META)
        expect(text.startsWith("DNA Builder v1.6.0 更新啦！")).toBe(true)
        expect(text.endsWith("https://github.com/pa001024/dna-builder/releases/tag/v1.6.0")).toBe(true)
    })

    it("已有点题与链接时不重复追加", () => {
        const body = "DNA Builder v1.6.0 更新啦！\n\n完整更新：https://github.com/pa001024/dna-builder/releases/tag/v1.6.0"
        expect(finalizeBody(body, META)).toBe(body)
    })

    it("超长正文压到上限内且保留链接", () => {
        const text = finalizeBody("长".repeat(3000), META, 400)
        expect(Array.from(text).length).toBeLessThanOrEqual(400)
        expect(text).toContain("releases/tag/v1.6.0")
    })

    it("按码点截断，不切坏 emoji", () => {
        const text = finalizeBody(`🎉${"长".repeat(3000)}`, META, 400)
        expect(text).not.toContain("�")
        expect(Array.from(text).length).toBeLessThanOrEqual(400)
    })
})
