import { describe, expect, it } from "bun:test"
import { and, eq } from "drizzle-orm"
import * as schema from "../db/schema"
import { searchBugCandidates } from "./dedup"
import { mergeBugs, revertMergeBugs } from "./merge"
import { createTestDb, GAME_ID, seedBug, seedUser } from "./test-helpers"

function seedOccurrence(db: ReturnType<typeof createTestDb>["db"], bugId: string, partId: string): void {
    db.insert(schema.bugOccurrences)
        .values({
            bugId,
            submissionVersionId: `sub-${partId}:1`,
            partId,
            sourceActor: { kind: "anonymous", id: `anon-${partId}` },
        })
        .run()
}

describe("合并与解除合并", () => {
    it("迁移证据、去重投票、写归并日志与关闭遗留 Issue 的 outbox", () => {
        const { db, sqlite } = createTestDb()
        try {
            const admin = seedUser(db, "admin-1", ["admin"])
            seedUser(db, "u1")
            seedUser(db, "u2")
            seedBug(db, { id: "src-1", title: "重复记录 A" })
            seedBug(db, { id: "src-2", title: "重复记录 B" })
            seedBug(db, { id: "target-1", title: "规范记录" })
            seedOccurrence(db, "src-1", "p1")
            seedOccurrence(db, "src-2", "p2")

            db.insert(schema.bugVoteIntents)
                .values([
                    { userId: "u1", originalBugId: "src-1", active: true, updatedAt: 1_000 },
                    { userId: "u1", originalBugId: "target-1", active: true, updatedAt: 2_000 },
                    { userId: "u2", originalBugId: "src-1", active: true, updatedAt: 1_000 },
                ])
                .run()
            db.insert(schema.githubIssueLinks)
                .values({
                    bugId: "src-1",
                    repositoryId: "repo-1",
                    issueId: "11",
                    issueNumber: 11,
                    htmlUrl: "https://example.com/issues/11",
                })
                .run()

            const result = mergeBugs(db, ["src-1", "src-2"], "target-1", admin, { reason: "同一问题" })
            expect(result.movedOccurrenceIds).toHaveLength(2)

            const sources = db
                .select()
                .from(schema.bugs)
                .all()
                .filter(bug => bug.id.startsWith("src-"))
            for (const source of sources) {
                expect(source.status).toBe("duplicate")
                expect(source.duplicateOf).toBe("target-1")
                expect(source.version).toBe(2)
            }

            const occurrences = db.select().from(schema.bugOccurrences).all()
            expect(occurrences.every(occurrence => occurrence.bugId === "target-1")).toBe(true)
            expect(occurrences.every(occurrence => occurrence.relation === "merged")).toBe(true)

            const u1SourceVote = db
                .select()
                .from(schema.bugVoteIntents)
                .where(and(eq(schema.bugVoteIntents.userId, "u1"), eq(schema.bugVoteIntents.originalBugId, "src-1")))
                .get()!
            expect(u1SourceVote.active).toBe(false)
            const u1TargetVote = db
                .select()
                .from(schema.bugVoteIntents)
                .where(and(eq(schema.bugVoteIntents.userId, "u1"), eq(schema.bugVoteIntents.originalBugId, "target-1")))
                .get()!
            expect(u1TargetVote.active).toBe(true)

            const activeVoters = new Set(
                db
                    .select()
                    .from(schema.bugVoteIntents)
                    .all()
                    .filter(vote => vote.active)
                    .map(vote => vote.userId)
            )
            expect(activeVoters.size).toBe(2)

            const journal = db.select().from(schema.bugMergeEvents).all()
            expect(journal).toHaveLength(1)
            expect(journal[0]!.sourceBugIds.sort()).toEqual(["src-1", "src-2"])
            expect(journal[0]!.targetBugId).toBe("target-1")
            expect(journal[0]!.movedOccurrenceIds).toHaveLength(2)

            expect(
                db
                    .select()
                    .from(schema.bugEvents)
                    .all()
                    .map(event => event.kind)
            ).toContain("bugs_merged")

            const outbox = db.select().from(schema.bugOutbox).all()
            expect(outbox).toHaveLength(1)
            expect(outbox[0]!.operation).toBe("close_duplicate_issue")
            expect(outbox[0]!.targetMapping).toBe("repo:repo-1:issue:11")
        } finally {
            sqlite.close()
        }
    })

    it("拒绝成环、自合并与重复合并", () => {
        const { db, sqlite } = createTestDb()
        try {
            const admin = seedUser(db, "admin-1", ["admin"])
            seedBug(db, { id: "bug-a", title: "A" })
            seedBug(db, { id: "bug-b", title: "B" })
            seedBug(db, { id: "bug-c", title: "C", duplicateOf: "bug-a" })

            expect(() => mergeBugs(db, ["bug-a"], "bug-a", admin)).toThrow(/至少需要一个/)
            expect(() => mergeBugs(db, ["bug-a"], "bug-c", admin)).toThrow(/环/)

            seedBug(db, { id: "bug-d", title: "D", status: "duplicate", duplicateOf: "bug-a" })
            expect(() => mergeBugs(db, ["bug-d"], "bug-a", admin)).toThrow(/已经归并/)
        } finally {
            sqlite.close()
        }
    })

    it("非维护者不能合并", () => {
        const { db, sqlite } = createTestDb()
        try {
            const user = seedUser(db, "user-1")
            seedBug(db, { id: "bug-a", title: "A" })
            seedBug(db, { id: "bug-b", title: "B" })
            expect(() => mergeBugs(db, ["bug-b"], "bug-a", user)).toThrow(/维护者/)
        } finally {
            sqlite.close()
        }
    })

    it("解除误合并按日志恢复证据、状态与投票，且不能重复解除", () => {
        const { db, sqlite } = createTestDb()
        try {
            const admin = seedUser(db, "admin-1", ["admin"])
            seedUser(db, "u1")
            seedBug(db, { id: "src-1", title: "A" })
            seedBug(db, { id: "target-1", title: "B" })
            seedOccurrence(db, "src-1", "p1")
            db.insert(schema.bugVoteIntents)
                .values([
                    { userId: "u1", originalBugId: "src-1", active: true, updatedAt: 1_000 },
                    { userId: "u1", originalBugId: "target-1", active: true, updatedAt: 2_000 },
                ])
                .run()

            const merged = mergeBugs(db, ["src-1"], "target-1", admin, { reason: "误判" })
            const reverted = revertMergeBugs(db, merged.mergeEventId, admin, { reason: "不是同一问题" })

            expect(reverted.restoredOccurrenceIds).toHaveLength(1)
            expect(reverted.sourceBugIds).toEqual(["src-1"])

            const occurrence = db.select().from(schema.bugOccurrences).all()[0]!
            expect(occurrence.bugId).toBe("src-1")
            expect(occurrence.relation).toBe("original")

            const source = db.select().from(schema.bugs).where(eq(schema.bugs.id, "src-1")).get()!
            expect(source.status).toBe("untriaged")
            expect(source.duplicateOf).toBeNull()
            expect(source.version).toBe(3)

            const vote = db
                .select()
                .from(schema.bugVoteIntents)
                .where(and(eq(schema.bugVoteIntents.userId, "u1"), eq(schema.bugVoteIntents.originalBugId, "src-1")))
                .get()!
            expect(vote.active).toBe(true)

            const journal = db.select().from(schema.bugMergeEvents).all()[0]!
            expect(journal.revertedAt).toBeNumber()
            expect(
                db
                    .select()
                    .from(schema.bugEvents)
                    .all()
                    .map(event => event.kind)
            ).toContain("merge_reverted")

            expect(() => revertMergeBugs(db, merged.mergeEventId, admin)).toThrow(/已解除/)
        } finally {
            sqlite.close()
        }
    })

    it("合并后判重索引失效，源记录不再作为候选", () => {
        const { db, sqlite } = createTestDb()
        try {
            const admin = seedUser(db, "admin-1", ["admin"])
            seedBug(db, { id: "src-1", gameId: GAME_ID, title: "结算页面卡住" })
            seedBug(db, { id: "target-1", gameId: GAME_ID, title: "结算页面卡死" })

            expect(searchBugCandidates(db, "结算页面卡住", GAME_ID).map(result => result.bugId)).toContain("src-1")

            mergeBugs(db, ["src-1"], "target-1", admin)
            expect(searchBugCandidates(db, "结算页面卡住", GAME_ID).map(result => result.bugId)).not.toContain("src-1")
        } finally {
            sqlite.close()
        }
    })
})
