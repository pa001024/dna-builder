import { describe, expect, it } from "vitest"
import { findPreviousTag, type PreviousTagDeps, resolvePreviousTag } from "./previous-tag.ts"

/** 造一个假的 git：tags 指向提交，commits 记录祖先链 */
function fakeGit(tags: Record<string, string>, ancestry: Record<string, string[]> = {}): PreviousTagDeps {
    return {
        tryGit(args) {
            if (args[0] === "rev-parse") {
                const ref = args[1].replace("^{commit}", "")
                return tags[ref] ?? ""
            }
            if (args[0] === "describe") return tags.__describe ?? ""
            if (args[0] === "tag") {
                // 模拟 --sort=-creatordate：新的在前
                return Object.keys(tags)
                    .filter(tag => tag !== "__describe")
                    .reverse()
                    .join("\n")
            }
            return ""
        },
        isAncestor(tag, revision) {
            const tagCommit = tags[tag]
            if (!tagCommit) return false
            const chain = ancestry[revision] ?? []
            return chain.includes(tagCommit) || tagCommit === tags[revision]
        },
    }
}

const TAGS = { "v1.3.0": "c3", "v1.4.0": "c4", "v1.5.0": "c5", "v1.6.0": "c6" }
const CHAIN: Record<string, string[]> = { "v1.6.0": ["c5", "c4", "c3"], "v1.4.0": ["c3"] }

describe("resolvePreviousTag", () => {
    it("没有传入时用 describe 定位最近的上一个 tag", () => {
        expect(resolvePreviousTag("", "v1.6.0", "v1.6.0", fakeGit({ ...TAGS, __describe: "v1.5.0" }))).toBe("v1.5.0")
    })

    it("传入最近的上一个 tag 时原样采用", () => {
        expect(resolvePreviousTag("v1.5.0", "v1.6.0", "v1.6.0", fakeGit(TAGS, CHAIN))).toBe("v1.5.0")
    })

    it("传入更早的祖先 tag 时改回最近的上一个 tag", () => {
        // v1.4.0 也是 v1.6.0 的祖先，但区间会连带 v1.5.0 的提交
        const deps = fakeGit({ ...TAGS, __describe: "v1.5.0" }, CHAIN)
        expect(resolvePreviousTag("v1.4.0", "v1.6.0", "v1.6.0", deps)).toBe("v1.5.0")
    })

    it("传入不存在的 tag 时回退自动查找", () => {
        expect(resolvePreviousTag("v9.9.9", "v1.6.0", "v1.6.0", fakeGit({ ...TAGS, __describe: "v1.5.0" }, CHAIN))).toBe("v1.5.0")
    })

    it("传入不是祖先的 tag 时回退自动查找", () => {
        // 重跑旧版本时工作流按创建时间给出的 tag 往往晚于本次发布
        expect(resolvePreviousTag("v1.6.0", "v1.4.0", "v1.4.0", fakeGit({ ...TAGS, __describe: "v1.3.0" }, CHAIN))).toBe("v1.3.0")
    })

    it("传入指向本次发布自身的 tag 时回退自动查找", () => {
        expect(resolvePreviousTag("v1.6.0", "v1.6.0", "v1.6.0", fakeGit({ ...TAGS, __describe: "v1.5.0" }))).toBe("v1.5.0")
    })
})

describe("findPreviousTag", () => {
    it("describe 不可用时按创建时间倒序过滤自身与祖先", () => {
        const deps = fakeGit(TAGS, CHAIN)
        expect(findPreviousTag("v1.6.0", "v1.6.0", deps)).toBe("v1.5.0")
    })

    it("不是祖先的 tag 被排除", () => {
        const deps = fakeGit({ ...TAGS, "v2.0.0": "c9" }, CHAIN)
        expect(findPreviousTag("v1.6.0", "v1.6.0", deps)).toBe("v1.5.0")
    })
})
