import { describe, expect, it } from "bun:test"
import { invalidateDedupIndex, searchBugCandidates } from "./dedup"
import { createTestDb, GAME_ID, seedBug, seedVisibilityBug } from "./test-helpers"

describe("词法候选召回", () => {
    it("中文查询命中同游戏公开 Bug，并排除私有 / 跨游戏 / 已归并", () => {
        const { db, sqlite } = createTestDb()
        try {
            seedVisibilityBug(db, "bug-1", "结算页面卡住无法继续", "public")
            seedBug(db, { id: "bug-2", title: "登录后闪退", summary: "输入账号后立刻闪退，无法进入游戏" })
            seedVisibilityBug(db, "bug-3", "结算页面卡住", "private")
            seedBug(db, { id: "bug-4", gameId: "other-game", title: "结算页面卡住" })
            seedVisibilityBug(db, "bug-5", "结算页面黑屏", "public", "duplicate")
            seedVisibilityBug(db, "bug-6", "音频丢失", "public", "resolved")

            const results = searchBugCandidates(db, "结算页面卡住", GAME_ID)
            expect(results[0]?.bugId).toBe("bug-1")

            const ids = results.map(result => result.bugId)
            expect(ids).not.toContain("bug-3")
            expect(ids).not.toContain("bug-4")
            expect(ids).not.toContain("bug-5")

            const audio = searchBugCandidates(db, "音频丢失", GAME_ID)
            expect(audio.map(result => result.bugId)).toContain("bug-6")
        } finally {
            sqlite.close()
        }
    })

    it("短查询与不同措辞仍能召回相关记录", () => {
        const { db, sqlite } = createTestDb()
        try {
            seedBug(db, { id: "bug-1", title: "结算页面卡住", summary: "打完关卡后停在结算界面" })
            seedBug(db, { id: "bug-2", title: "登录后闪退", summary: "输入账号后立刻闪退" })

            expect(searchBugCandidates(db, "结算", GAME_ID)[0]?.bugId).toBe("bug-1")
            expect(searchBugCandidates(db, "输入账号后闪退", GAME_ID)[0]?.bugId).toBe("bug-2")
            expect(searchBugCandidates(db, "", GAME_ID)).toEqual([])
        } finally {
            sqlite.close()
        }
    })

    it("新建 Bug 后需显式失效索引才会进入候选", () => {
        const { db, sqlite } = createTestDb()
        try {
            seedBug(db, { id: "bug-1", title: "结算页面卡住" })
            expect(searchBugCandidates(db, "充值失败", GAME_ID)).toEqual([])

            seedBug(db, { id: "bug-2", title: "充值失败无法到账", summary: "付款成功后点券没有增加" })
            expect(searchBugCandidates(db, "充值失败", GAME_ID)).toEqual([])

            invalidateDedupIndex(db, GAME_ID)
            expect(searchBugCandidates(db, "充值失败", GAME_ID)[0]?.bugId).toBe("bug-2")
        } finally {
            sqlite.close()
        }
    })

    it("limit 限制候选数量并按相关度降序", () => {
        const { db, sqlite } = createTestDb()
        try {
            for (let index = 0; index < 5; index++) {
                seedBug(db, { id: `bug-${index}`, title: `联机匹配失败 ${index}`, summary: "匹配一直转圈" })
            }
            const results = searchBugCandidates(db, "联机匹配失败", GAME_ID, 3)
            expect(results).toHaveLength(3)
            expect(results[0]!.score).toBeGreaterThanOrEqual(results[2]!.score)
        } finally {
            sqlite.close()
        }
    })
})
