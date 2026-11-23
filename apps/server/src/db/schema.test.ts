import type { Database } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { resolve } from "node:path"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import * as schema from "./schema"
import { openSqlite } from "./sqlite"

/** 迁移目录用 import.meta.dir 定位，避免相对路径跟随 cwd 变化。 */
const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle")

const BUG_TABLES = [
    "bug_idempotency_keys",
    "bug_submissions",
    "bug_submission_versions",
    "bug_assets",
    "bugs",
    "bug_occurrences",
    "bug_feedback",
    "bug_discussion_entries",
    "bug_vote_intents",
    "bug_subscriptions",
    "bug_ai_runs",
    "bug_jobs",
    "bug_events",
    "bug_merge_events",
    "bug_relations",
    "bug_tag_definitions",
    "bug_tag_assignments",
    "github_issue_links",
    "github_comment_links",
    "github_label_bindings",
    "github_tag_sync_state",
    "github_webhook_inbox",
    "bug_outbox",
]

/**
 * @description 在内存库跑完整迁移并保留底层连接，用于内省建表结果。
 * @returns drizzle 实例与原始连接。
 */
function createTestDb() {
    const sqlite = openSqlite(":memory:")
    const db = drizzle(sqlite, { schema })
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    return { db, sqlite }
}

/** 列出当前库里的用户表名。 */
function tableNames(sqlite: Database): string[] {
    const rows = sqlite.query("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all() as Array<{
        name: string
    }>
    return rows.map(row => row.name)
}

/**
 * @description 断言写入违反约束。drizzle 的 insert builder 是 thenable 而非原生 Promise，需要包一层。
 * @param query 待执行的写入
 */
async function expectRejects(query: PromiseLike<unknown>) {
    await expect(Promise.resolve(query)).rejects.toThrow()
}

describe("bug-intake 数据模型", () => {
    it("迁移建出全部 23 张 BUG 相关表", () => {
        const { sqlite } = createTestDb()
        try {
            const names = tableNames(sqlite)
            for (const table of BUG_TABLES) {
                expect(names).toContain(table)
            }
        } finally {
            sqlite.close()
        }
    })

    it("关键表可写入并读回（JSON 默认值、状态默认值、时间字段）", async () => {
        const { db, sqlite } = createTestDb()
        try {
            await db.insert(schema.users).values({ id: "u1", email: "u1@example.com", name: "reporter" })
            await db
                .insert(schema.bugSubmissions)
                .values({ id: "sub1", gameId: "duet-night-abyss", anonActorId: "anon-1", receiptDigest: "digest-1" })
            await db.insert(schema.bugSubmissionVersions).values({
                submissionId: "sub1",
                revision: 1,
                rawTextPrivate: "结算页卡住",
                contentSha256: "sha-text-1",
                context: { platform: "pc", region: "cn", gameVersion: "1.0.0" },
            })
            await db.insert(schema.bugs).values({
                id: "bug1",
                displayKey: "BUG-1",
                gameId: "duet-night-abyss",
                title: "结算页卡住",
                summary: "进入结算页后无法继续",
            })
            await db
                .insert(schema.bugJobs)
                .values({ id: "job1", kind: "process_submission", idempotencyKey: "job-key-1", inputHash: "input-hash-1" })
            await db.insert(schema.bugOutbox).values({ eventId: "evt1", operation: "create_issue", targetMapping: "repo:1" })

            const submission = await db.query.bugSubmissions.findFirst({ where: (t, { eq }) => eq(t.id, "sub1") })
            expect(submission?.state).toBe("received")
            expect(submission?.currentRevision).toBe(0)
            expect(submission?.createdAt).toBeNumber()

            const version = await db.query.bugSubmissionVersions.findFirst()
            expect(version?.publicationPolicy).toBe("internal_only")
            expect(version?.context).toEqual({ platform: "pc", region: "cn", gameVersion: "1.0.0" })

            const bug = await db.query.bugs.findFirst({ where: (t, { eq }) => eq(t.id, "bug1") })
            expect(bug?.tags).toEqual([])
            expect(bug?.steps).toEqual([])
            expect(bug?.status).toBe("untriaged")
            expect(bug?.visibility).toBe("public")
            expect(bug?.version).toBe(1)
            expect(bug?.tagVersion).toBe(0)

            const job = await db.query.bugJobs.findFirst({ where: (t, { eq }) => eq(t.id, "job1") })
            expect(job?.state).toBe("queued")
            expect(job?.priorityClass).toBe("normal")
            expect(job?.fencingToken).toBe(0)
            expect(job?.eligibleAt).toBeNumber()

            const outbox = await db.query.bugOutbox.findFirst()
            expect(outbox?.state).toBe("queued")
            expect(outbox?.attempt).toBe(0)
        } finally {
            sqlite.close()
        }
    })

    it("同一 Part 只能有一个当前归属（unique submissionVersionId + partId）", async () => {
        const { db, sqlite } = createTestDb()
        try {
            await db.insert(schema.bugs).values({ id: "bug1", displayKey: "BUG-1", gameId: "g", title: "t", summary: "s" })
            const occurrence = {
                bugId: "bug1",
                submissionVersionId: "sub1:1",
                partId: "part-1",
                sourceActor: { kind: "anonymous" as const, id: "anon-1" },
            }
            await db.insert(schema.bugOccurrences).values(occurrence)
            await expectRejects(db.insert(schema.bugOccurrences).values(occurrence))
        } finally {
            sqlite.close()
        }
    })

    it("外键生效：Occurrence 不能指向不存在的 Bug", async () => {
        const { db, sqlite } = createTestDb()
        try {
            await expectRejects(
                db.insert(schema.bugOccurrences).values({
                    bugId: "missing",
                    submissionVersionId: "sub1:1",
                    partId: "part-1",
                    sourceActor: { kind: "anonymous", id: "anon-1" },
                })
            )
        } finally {
            sqlite.close()
        }
    })

    it("对称关系按 symmetryKey 去重，方向关系不受限", async () => {
        const { db, sqlite } = createTestDb()
        try {
            await db.insert(schema.bugs).values([
                { id: "bug1", displayKey: "BUG-1", gameId: "g", title: "t1", summary: "s1" },
                { id: "bug2", displayKey: "BUG-2", gameId: "g", title: "t2", summary: "s2" },
                { id: "bug3", displayKey: "BUG-3", gameId: "g", title: "t3", summary: "s3" },
            ])
            const symmetric = {
                sourceBugId: "bug1",
                targetBugId: "bug2",
                relationType: "related" as const,
                symmetryKey: "related:bug1|bug2",
            }
            await db.insert(schema.bugRelations).values(symmetric)
            await expectRejects(db.insert(schema.bugRelations).values({ ...symmetric, sourceBugId: "bug2", targetBugId: "bug1" }))

            await db.insert(schema.bugRelations).values({ sourceBugId: "bug1", targetBugId: "bug3", relationType: "regression_of" })
            await db.insert(schema.bugRelations).values({ sourceBugId: "bug2", targetBugId: "bug3", relationType: "regression_of" })
        } finally {
            sqlite.close()
        }
    })

    it("每个 Bug + 仓库最多一个 primary IssueLink，legacy_duplicate 不受限", async () => {
        const { db, sqlite } = createTestDb()
        try {
            await db.insert(schema.bugs).values({ id: "bug1", displayKey: "BUG-1", gameId: "g", title: "t", summary: "s" })
            const link = { bugId: "bug1", repositoryId: "repo-1", issueId: "11", issueNumber: 1, htmlUrl: "https://example.com/1" }
            await db.insert(schema.githubIssueLinks).values(link)
            await expectRejects(db.insert(schema.githubIssueLinks).values({ ...link, issueId: "12", issueNumber: 2 }))

            await db.insert(schema.githubIssueLinks).values({ ...link, issueId: "13", issueNumber: 3, role: "legacy_duplicate" })
            await db.insert(schema.githubIssueLinks).values({ ...link, issueId: "14", issueNumber: 4, role: "legacy_duplicate" })
        } finally {
            sqlite.close()
        }
    })

    it("幂等键、Job 幂等键与 outbox 目标各自唯一", async () => {
        const { db, sqlite } = createTestDb()
        try {
            const idem = { actorKey: "anon:anon-1", op: "submit", key: "k1", requestHash: "h1", resultId: "sub1" }
            await db.insert(schema.bugIdempotencyKeys).values(idem)
            await expectRejects(db.insert(schema.bugIdempotencyKeys).values({ ...idem, requestHash: "h2" }))

            await db.insert(schema.bugJobs).values({ id: "job1", kind: "process_submission", idempotencyKey: "job-key-1" })
            await expectRejects(db.insert(schema.bugJobs).values({ id: "job2", kind: "process_submission", idempotencyKey: "job-key-1" }))

            const outbox = { eventId: "evt1", operation: "create_issue", targetMapping: "repo:1" }
            await db.insert(schema.bugOutbox).values(outbox)
            await expectRejects(db.insert(schema.bugOutbox).values({ ...outbox, payloadHash: "h2" }))
        } finally {
            sqlite.close()
        }
    })

    it("展示编号与回执摘要唯一，登录用户可共用空回执", async () => {
        const { db, sqlite } = createTestDb()
        try {
            await db.insert(schema.bugs).values({ id: "bug1", displayKey: "BUG-1", gameId: "g", title: "t", summary: "s" })
            await expectRejects(db.insert(schema.bugs).values({ id: "bug2", displayKey: "BUG-1", gameId: "g", title: "t", summary: "s" }))

            await db.insert(schema.bugSubmissions).values({ id: "sub1", gameId: "g", receiptDigest: "digest-1" })
            await expectRejects(db.insert(schema.bugSubmissions).values({ id: "sub2", gameId: "g", receiptDigest: "digest-1" }))

            await db.insert(schema.bugSubmissions).values({ id: "sub3", gameId: "g", userId: null })
            await db.insert(schema.bugSubmissions).values({ id: "sub4", gameId: "g", userId: null })
        } finally {
            sqlite.close()
        }
    })

    it("AI run 关联 Job 可空，Job 清理后置空而不阻塞", async () => {
        const { db, sqlite } = createTestDb()
        try {
            await db.insert(schema.bugJobs).values({ id: "job1", kind: "process_submission", idempotencyKey: "job-key-1" })
            await db.insert(schema.bugAiRuns).values({ id: "run1", jobId: "job1", inputHash: "h1" })
            await db.insert(schema.bugAiRuns).values({ id: "run2", inputHash: "h2" })

            await db.delete(schema.bugJobs).where(eq(schema.bugJobs.id, "job1"))
            const run = await db.query.bugAiRuns.findFirst({ where: (t, { eq }) => eq(t.id, "run1") })
            expect(run?.jobId).toBeNull()
        } finally {
            sqlite.close()
        }
    })
})
