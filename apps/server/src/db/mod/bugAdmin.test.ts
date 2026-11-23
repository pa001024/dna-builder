import { beforeEach, describe, expect, it } from "bun:test"
import { eq } from "drizzle-orm"
import { enqueueJob, mergeBugs } from "../../bugs"
import { createTestDb, seedBug, type TestDb, userActor } from "../../bugs/test-helpers"
import * as schema from "../schema"
import type { Context } from "../yoga"
import { resolvers } from "./bugAdmin"

type Call = (args: unknown, context: Context) => Promise<any>

/** 把 resolver 表包成「args, context」两参调用，省去 parent / info。 */
function bind(table: Record<string, unknown>): Record<string, Call> {
    const bound: Record<string, Call> = {}
    for (const [key, fn] of Object.entries(table)) {
        bound[key] = (args, context) =>
            (fn as Call & ((parent: unknown, args: unknown, context: Context, info: unknown) => Promise<any>))({}, args, context, {})
    }
    return bound
}

const mutation = bind(resolvers.Mutation)
const query = bind(resolvers.Query)

function makeContext(database: TestDb, roles: string[] = ["admin"]): Context {
    return {
        db: database,
        user: roles.length ? { id: "admin-1", name: "admin", roles } : undefined,
        request: new Request("http://localhost/graphql"),
    } as unknown as Context
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    let captured: unknown = null
    try {
        await promise
    } catch (error) {
        captured = error
    }
    expect(captured).not.toBeNull()
    expect((captured as { extensions?: { code?: string } }).extensions?.code).toBe(code)
}

function seedIssueLink(database: TestDb, bugId: string, id = "link-1"): string {
    database
        .insert(schema.githubIssueLinks)
        .values({
            id,
            bugId,
            repositoryId: "repo-1",
            issueId: "issue-1",
            issueNumber: 12,
            htmlUrl: "https://github.com/o/r/issues/12",
        })
        .run()
    return id
}

describe("admin 权限", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("非管理员被拒绝", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        const context = makeContext(database, [])
        await expectCode(mutation.adminUpdateBug!({ bugId: "bug-1", fields: {}, reason: "x", expectedVersion: 1 }, context), "FORBIDDEN")
        await expectCode(mutation.adminRetryJob!({ jobId: "job", step: "process_submission" }, context), "FORBIDDEN")
        await expectCode(
            mutation.adminSetGithubBinding!(
                { tagKey: "fix.confirmed", repositoryId: "repo-1", labelName: "fix:confirmed", expectedRegistryVersion: 1 },
                context
            ),
            "FORBIDDEN"
        )
    })

    it("普通用户角色同样被拒绝", async () => {
        const context = makeContext(database, ["user"])
        await expectCode(mutation.adminReconcile!({ syncId: "x" }, context), "FORBIDDEN")
    })
})

describe("adminUpdateBug", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("按期望版本更新并记录事件", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "旧标题", summary: "摘要" })
        const result = await mutation.adminUpdateBug!(
            {
                bugId: "bug-1",
                fields: { title: "新标题", severity: "S1", status: "confirmed" },
                reason: "纠错",
                expectedVersion: 1,
            },
            makeContext(database)
        )
        expect(result.version).toBe(2)
        expect(result.changed).toEqual(["title", "severity", "status"])
        expect(result.bug.title).toBe("新标题")
        expect(result.bug.severity).toBe("S1")
        expect(result.bug.severitySource).toBe("maintainer")

        const events = database.select().from(schema.bugEvents).where(eq(schema.bugEvents.kind, "bug_admin_updated")).all()
        expect(events).toHaveLength(1)
        expect(events[0]!.bugId).toBe("bug-1")
    })

    it("版本不匹配返回 CONFLICT", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        await expectCode(
            mutation.adminUpdateBug!({ bugId: "bug-1", fields: { title: "x" }, reason: "r", expectedVersion: 9 }, makeContext(database)),
            "CONFLICT"
        )
    })

    it("空标题被拒绝", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        await expectCode(
            mutation.adminUpdateBug!({ bugId: "bug-1", fields: { title: "   " }, reason: "r", expectedVersion: 1 }, makeContext(database)),
            "VALIDATION_FAILED"
        )
    })

    it("不存在的 BUG 返回 NOT_FOUND", async () => {
        await expectCode(
            mutation.adminUpdateBug!({ bugId: "missing", fields: { title: "x" }, reason: "r", expectedVersion: 1 }, makeContext(database)),
            "NOT_FOUND"
        )
    })
})

describe("adminSetTrackingTags", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("应用标签集合并推进版本", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        const result = await mutation.adminSetTrackingTags!(
            {
                bugId: "bug-1",
                tagKeys: ["category.login", "fix.confirmed", "severity.s1"],
                expectedTagVersion: 0,
                reason: "确认修复",
                fixedVersion: "1.2.0",
            },
            makeContext(database)
        )
        expect(result.added).toHaveLength(3)
        expect(result.tagVersion).toBe(1)
        expect(result.fixStage).toBe("fix.confirmed")
        expect(result.eventId).toBeString()

        const bug = database.select().from(schema.bugs).where(eq(schema.bugs.id, "bug-1")).get()
        expect(bug?.fixedVersion).toBe("1.2.0")
        expect(bug?.fixStage).toBe("fix.confirmed")
    })

    it("互斥组冲突与版本过期被拒绝", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        await expectCode(
            mutation.adminSetTrackingTags!(
                { bugId: "bug-1", tagKeys: ["fix.confirmed", "fix.released"], expectedTagVersion: 0, reason: "x" },
                makeContext(database)
            ),
            "VALIDATION_FAILED"
        )
        await mutation.adminSetTrackingTags!(
            { bugId: "bug-1", tagKeys: ["fix.confirmed"], expectedTagVersion: 0, reason: "x" },
            makeContext(database)
        )
        await expectCode(
            mutation.adminSetTrackingTags!(
                { bugId: "bug-1", tagKeys: ["fix.planned"], expectedTagVersion: 0, reason: "x" },
                makeContext(database)
            ),
            "CONFLICT"
        )
    })
})

describe("adminMergeBugs / adminRevertMerge", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("归并后源记录标记 duplicate，解除后恢复", async () => {
        seedBug(database, { id: "target", displayKey: "BUG-1", title: "目标", summary: "目标摘要" })
        seedBug(database, { id: "source", displayKey: "BUG-2", title: "源", summary: "源摘要" })
        database
            .insert(schema.bugOccurrences)
            .values({
                bugId: "source",
                submissionVersionId: "s1:1",
                partId: "part-1",
                sourceActor: { kind: "user", id: "u1" },
            })
            .run()

        const merged = await mutation.adminMergeBugs!(
            { sourceBugIds: ["source"], targetBugId: "target", reason: "重复", expectedVersions: [1, 1] },
            makeContext(database)
        )
        expect(merged.changed).toHaveLength(1)

        const source = database.select().from(schema.bugs).where(eq(schema.bugs.id, "source")).get()
        expect(source?.status).toBe("duplicate")
        expect(source?.duplicateOf).toBe("target")

        const mergeEvent = database.select().from(schema.bugMergeEvents).all()[0]!
        const reverted = await mutation.adminRevertMerge!(
            { mergeEventId: mergeEvent.id, reason: "误合并", expectedVersions: [2, 2] },
            makeContext(database)
        )
        expect(reverted.changed).toHaveLength(1)
        const restored = database.select().from(schema.bugs).where(eq(schema.bugs.id, "source")).get()
        expect(restored?.status).toBe("untriaged")
        expect(restored?.duplicateOf).toBeNull()
    })

    it("期望版本不匹配返回 CONFLICT", async () => {
        seedBug(database, { id: "target", displayKey: "BUG-1", title: "目标", summary: "目标摘要" })
        seedBug(database, { id: "source", displayKey: "BUG-2", title: "源", summary: "源摘要" })
        await expectCode(
            mutation.adminMergeBugs!(
                { sourceBugIds: ["source"], targetBugId: "target", reason: "重复", expectedVersions: [7, 1] },
                makeContext(database)
            ),
            "CONFLICT"
        )
    })
})

describe("adminSetRelation / adminRemoveRelation", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("创建对称关联后可以移除", async () => {
        seedBug(database, { id: "a", displayKey: "BUG-1", title: "A", summary: "A 摘要" })
        seedBug(database, { id: "b", displayKey: "BUG-2", title: "B", summary: "B 摘要" })

        const created = await mutation.adminSetRelation!(
            { bugId: "a", targetBugId: "b", relationType: "related", evidenceRefs: ["ref-1"], expectedGraphVersion: 1 },
            makeContext(database)
        )
        expect(created.changed).toHaveLength(1)
        const relationId = created.changed[0]!

        const again = await mutation.adminSetRelation!(
            { bugId: "a", targetBugId: "b", relationType: "related", evidenceRefs: [], expectedGraphVersion: 2 },
            makeContext(database)
        )
        expect(again.changed).toEqual([relationId])

        const removed = await mutation.adminRemoveRelation!(
            { relationId, reason: "无关", expectedRelationVersion: 1 },
            makeContext(database)
        )
        expect(removed.changed).toEqual([relationId])
        const relation = database.select().from(schema.bugRelations).where(eq(schema.bugRelations.id, relationId)).get()
        expect(relation?.state).toBe("removed")
    })

    it("自关联与未知类型被拒绝", async () => {
        seedBug(database, { id: "a", displayKey: "BUG-1", title: "A", summary: "A 摘要" })
        await expectCode(
            mutation.adminSetRelation!(
                { bugId: "a", targetBugId: "a", relationType: "related", expectedGraphVersion: 1 },
                makeContext(database)
            ),
            "VALIDATION_FAILED"
        )
        await expectCode(
            mutation.adminSetRelation!(
                { bugId: "a", targetBugId: "missing", relationType: "related", expectedGraphVersion: 1 },
                makeContext(database)
            ),
            "NOT_FOUND"
        )
    })
})

describe("adminSetGithubBinding", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("写入 label 绑定并校验字典版本", async () => {
        expect(
            await mutation.adminSetGithubBinding!(
                { tagKey: "fix.confirmed", repositoryId: "repo-1", labelName: "fix:confirmed", expectedRegistryVersion: 1 },
                makeContext(database)
            )
        ).toBeTrue()
        const binding = database.select().from(schema.githubLabelBindings).all()[0]!
        expect(binding.tagKey).toBe("fix.confirmed")
        expect(binding.state).toBe("active")

        await expectCode(
            mutation.adminSetGithubBinding!(
                { tagKey: "fix.confirmed", repositoryId: "repo-1", labelName: "fix:confirmed", expectedRegistryVersion: 9 },
                makeContext(database)
            ),
            "CONFLICT"
        )
        await expectCode(
            mutation.adminSetGithubBinding!(
                { tagKey: "unknown.tag", repositoryId: "repo-1", labelName: "x", expectedRegistryVersion: 1 },
                makeContext(database)
            ),
            "VALIDATION_FAILED"
        )
    })
})

describe("adminRetryJob / adminReconcile", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("重试任务要求步骤与任务类型一致", async () => {
        const job = enqueueJob(database, { kind: "process_submission", idempotencyKey: "job-1" })
        database.update(schema.bugJobs).set({ state: "failed", lastError: "boom" }).where(eq(schema.bugJobs.id, job.id)).run()

        await expectCode(mutation.adminRetryJob!({ jobId: job.id, step: "other_step" }, makeContext(database)), "VALIDATION_FAILED")
        expect(await mutation.adminRetryJob!({ jobId: job.id, step: "process_submission" }, makeContext(database))).toBeTrue()

        const retried = database.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, job.id)).get()
        expect(retried?.state).toBe("queued")
        expect(retried?.lastError).toBeNull()
        await expectCode(mutation.adminRetryJob!({ jobId: "missing", step: "process_submission" }, makeContext(database)), "NOT_FOUND")
    })

    it("对账写入 outbox", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        const linkId = seedIssueLink(database, "bug-1")
        expect(await mutation.adminReconcile!({ syncId: linkId }, makeContext(database))).toBeTrue()
        const outbox = database.select().from(schema.bugOutbox).all()
        expect(outbox).toHaveLength(1)
        expect(outbox[0]!.operation).toBe("reconcile_issue")

        await expectCode(mutation.adminReconcile!({ syncId: "missing" }, makeContext(database)), "NOT_FOUND")
    })
})

describe("admin 查询补充", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("adminBugJobs 分页并返回按状态计数", async () => {
        enqueueJob(database, { kind: "process_submission", idempotencyKey: "process_submission:s1:1" })
        const failed = enqueueJob(database, { kind: "sync_issue", idempotencyKey: "sync_issue:s1" })
        database.update(schema.bugJobs).set({ state: "failed", lastError: "boom" }).where(eq(schema.bugJobs.id, failed.id)).run()

        const result = await query.adminBugJobs!({ filter: {}, offset: 0 }, makeContext(database))
        expect(result.total).toBe(2)
        expect(result.items).toHaveLength(2)
        expect(result.counts).toEqual(
            expect.arrayContaining([
                { state: "queued", count: 1 },
                { state: "failed", count: 1 },
            ])
        )

        const failedItem = result.items.find((item: { kind: string }) => item.kind === "sync_issue")
        expect(failedItem.state).toBe("failed")
        expect(failedItem.priority).toBe("normal")
        expect(failedItem.lastError).toBe("boom")
        expect(failedItem.leaseOwner).toBeNull()
        expect(failedItem.attempt).toBe(0)
        expect(failedItem.createdAt).toBeGreaterThan(0)

        const filtered = await query.adminBugJobs!(
            { filter: { states: ["failed"], kinds: ["sync_issue"], limit: 10 }, offset: 0 },
            makeContext(database)
        )
        expect(filtered.total).toBe(1)
        expect(filtered.items).toHaveLength(1)

        const paged = await query.adminBugJobs!({ filter: { limit: 1 }, offset: 1 }, makeContext(database))
        expect(paged.items).toHaveLength(1)
        expect(paged.total).toBe(2)
    })

    it("adminBugJobs 需要管理员", async () => {
        await expectCode(query.adminBugJobs!({ filter: {}, offset: 0 }, makeContext(database, [])), "FORBIDDEN")
    })

    it("adminBugMergeEvents 覆盖目标与源记录", async () => {
        seedBug(database, { id: "bug-a", displayKey: "BUG-A", title: "A" })
        seedBug(database, { id: "bug-b", displayKey: "BUG-B", title: "B" })
        seedBug(database, { id: "bug-c", displayKey: "BUG-C", title: "C" })
        mergeBugs(database, ["bug-a"], "bug-b", userActor("admin-1", ["admin"]), { reason: "重复" })

        const target = await query.adminBugMergeEvents!({ bugId: "bug-b" }, makeContext(database))
        expect(target).toHaveLength(1)
        expect(target[0]!.sourceBugIds).toContain("bug-a")
        expect(target[0]!.targetBugId).toBe("bug-b")
        expect(target[0]!.revertedAt).toBeNull()
        expect(target[0]!.createdAt).toBeGreaterThan(0)

        const source = await query.adminBugMergeEvents!({ bugId: "bug-a" }, makeContext(database))
        expect(source.map((event: { id: string }) => event.id)).toContain(target[0]!.id)

        const none = await query.adminBugMergeEvents!({ bugId: "bug-c" }, makeContext(database))
        expect(none).toHaveLength(0)
    })

    it("adminBug 可读取私有 BUG，不存在返回 NOT_FOUND", async () => {
        seedBug(database, { id: "bug-private", displayKey: "BUG-P", title: "私密", visibility: "private" })

        const result = await query.adminBug!({ id: "bug-private" }, makeContext(database))
        expect(result.id).toBe("bug-private")
        expect(result.visibility).toBe("private")
        expect(result.title).toBe("私密")

        await expectCode(query.adminBug!({ id: "missing" }, makeContext(database)), "NOT_FOUND")
        await expectCode(query.adminBug!({ id: "bug-private" }, makeContext(database, [])), "FORBIDDEN")
    })
})
