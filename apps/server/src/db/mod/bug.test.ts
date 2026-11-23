import { beforeEach, describe, expect, it } from "bun:test"
import { and, eq } from "drizzle-orm"
import { parse } from "graphql"
import { receiptDigest } from "../../bugs/submission"
import { createTestDb, GAME_ID, seedBug, seedSubmission, seedUser, type TestDb } from "../../bugs/test-helpers"
import * as schema from "../schema"
import type { Context } from "../yoga"
import { resolvers, typeDefs } from "./bug"

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

const query = bind(resolvers.Query)
const mutation = bind(resolvers.Mutation)

function makeContext(database: TestDb, options: { user?: Context["user"]; authorization?: string } = {}): Context {
    const headers = options.authorization ? { authorization: options.authorization } : undefined
    return {
        db: database,
        user: options.user,
        request: new Request("http://localhost/graphql", { headers }),
    } as unknown as Context
}

/** 断言 Promise 以指定 GraphQL 错误码失败。 */
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

/** 插入匿名 Submission，并返回可用的回执 token 与版本标识。 */
function seedReceiptSubmission(database: TestDb, token: string, text = "停在结算页"): { submissionId: string; versionId: string } {
    const submissionId = schema.id()
    database
        .insert(schema.bugSubmissions)
        .values({
            id: submissionId,
            gameId: GAME_ID,
            anonActorId: `anon_${submissionId}`,
            receiptDigest: receiptDigest(token),
            state: "processed",
            currentRevision: 1,
        })
        .run()
    database
        .insert(schema.bugSubmissionVersions)
        .values({
            submissionId,
            revision: 1,
            rawTextPrivate: text,
            contentSha256: "seed-content-sha",
            publicationPolicy: "github_safe",
        })
        .run()
    return { submissionId, versionId: `${submissionId}:1` }
}

/** 把证据关联到 Bug，使回执身份通过范围校验。 */
function linkOccurrence(database: TestDb, bugId: string, versionId: string, partId = "part-1"): void {
    database
        .insert(schema.bugOccurrences)
        .values({
            bugId,
            submissionVersionId: versionId,
            partId,
            evidenceRefs: [{ type: "text", versionId, start: 0, end: 3, quote: "停在结算页" }],
            sourceActor: { kind: "anonymous", id: `anon_${versionId}` },
        })
        .run()
}

const RECEIPT_TOKEN = `receipt_${"a".repeat(36)}`

describe("bug GraphQL typeDefs", () => {
    it("可被 graphql.parse 解析", () => {
        expect(() => parse(typeDefs)).not.toThrow()
        expect(typeDefs).toContain("deleteBugComment")
    })
})

describe("公开查询", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("bugs 只返回公开且未结束的规范 BUG", async () => {
        seedBug(database, { id: "pub", displayKey: "BUG-1", title: "公开", summary: "公开摘要" })
        seedBug(database, { id: "secret", displayKey: "BUG-2", title: "私有", summary: "私有摘要", visibility: "private" })
        seedBug(database, { id: "dup", displayKey: "BUG-3", title: "重复", summary: "重复摘要", status: "duplicate" })
        seedBug(database, { id: "closed", displayKey: "BUG-4", title: "关闭", summary: "关闭摘要", status: "closed" })

        const page = await query.bugs!({}, makeContext(database))
        expect(page.total).toBe(1)
        expect(page.items.map((item: { id: string }) => item.id)).toEqual(["pub"])
    })

    it("显式筛选可以取到已关闭 / 重复项", async () => {
        seedBug(database, { id: "dup", displayKey: "BUG-3", title: "重复", summary: "重复摘要", status: "duplicate" })
        seedBug(database, { id: "pub", displayKey: "BUG-1", title: "公开", summary: "公开摘要" })
        const page = await query.bugs!({ filter: { status: ["duplicate"] } }, makeContext(database))
        expect(page.items.map((item: { id: string }) => item.id)).toEqual(["dup"])
    })

    it("bug(id) 对私有记录返回 null", async () => {
        seedBug(database, { id: "secret", displayKey: "BUG-2", title: "私有", summary: "私有摘要", visibility: "private" })
        expect(await query.bug!({ id: "secret" }, makeContext(database))).toBeNull()
        expect(await query.bug!({ id: "missing" }, makeContext(database))).toBeNull()
    })

    it("bug(id) 返回公开证据，并过滤内部私有来源", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        const { versionId } = seedReceiptSubmission(database, RECEIPT_TOKEN)
        linkOccurrence(database, "bug-1", versionId)
        const other = seedSubmission(database, { text: "内部原文" })
        database
            .update(schema.bugSubmissionVersions)
            .set({ publicationPolicy: "internal_only" })
            .where(and(eq(schema.bugSubmissionVersions.submissionId, other.submissionId)))
            .run()
        linkOccurrence(database, "bug-1", other.versionId, "part-2")

        const detail = await query.bug!({ id: "bug-1" }, makeContext(database))
        expect(detail.evidence).toHaveLength(1)
        expect(detail.evidence[0]!.evidenceRefs[0]!.quote).toBe("停在结算页")
    })

    it("rawSubmissions 只暴露 github_safe 原文", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        const github = seedReceiptSubmission(database, RECEIPT_TOKEN, "公开原文")
        const catalog = seedSubmission(database, { text: "含隐私原文" })
        database
            .update(schema.bugSubmissionVersions)
            .set({ publicationPolicy: "catalog_safe" })
            .where(eq(schema.bugSubmissionVersions.submissionId, catalog.submissionId))
            .run()
        linkOccurrence(database, "bug-1", github.versionId, "part-1")
        linkOccurrence(database, "bug-1", catalog.versionId, "part-2")

        const detail = await query.bug!({ id: "bug-1" }, makeContext(database))
        expect(detail.rawSubmissionCount).toBe(1)
        const raw = await query.rawSubmissions!({ bugId: "bug-1" }, makeContext(database))
        expect(raw).toHaveLength(1)
        expect(raw[0].text).toBe("公开原文")
    })

    it("rawSubmissions 对私有 Bug 返回空", async () => {
        seedBug(database, { id: "secret", displayKey: "BUG-2", title: "私有", summary: "私有摘要", visibility: "private" })
        const { versionId } = seedReceiptSubmission(database, RECEIPT_TOKEN)
        linkOccurrence(database, "secret", versionId)
        expect(await query.rawSubmissions!({ bugId: "secret" }, makeContext(database))).toEqual([])
    })

    it("bugTagRegistry 返回字典与互斥组", async () => {
        const registry = await query.bugTagRegistry!({}, makeContext(database))
        const keys = registry.tags.map((tag: { tagKey: string }) => tag.tagKey)
        expect(keys).toContain("fix.confirmed")
        expect(keys).toContain("category.login")
        const fixGroup = registry.exclusiveGroups.find((group: { group: string }) => group.group === "fix_stage")
        expect(fixGroup?.tagKeys).toContain("fix.unconfirmed")
    })

    it("myBugs 需要登录", async () => {
        await expectCode(query.myBugs!({}, makeContext(database)), "UNAUTHORIZED")
    })
})

describe("submitBug", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    const input = {
        text: "打完关卡后停在结算页",
        assetIds: [],
        context: { gameId: GAME_ID, platform: "pc" },
        publicationPolicy: "GITHUB_SAFE",
    }

    it("匿名提交返回一次性回执 token 并持久化任务", async () => {
        const receipt = await mutation.submitBug!({ input, idempotencyKey: "k-1" }, makeContext(database))
        expect(receipt.state).toBe("queued")
        expect(receipt.receiptToken).toBeString()
        expect(receipt.receiptToken.length).toBeGreaterThanOrEqual(32)

        const submissions = database.select().from(schema.bugSubmissions).all()
        expect(submissions).toHaveLength(1)
        expect(submissions[0]!.receiptDigest).toBe(receiptDigest(receipt.receiptToken))
        expect(database.select().from(schema.bugJobs).all()).toHaveLength(1)
    })

    it("登录用户不返回回执 token", async () => {
        seedUser(database, "u1")
        const receipt = await mutation.submitBug!(
            { input, idempotencyKey: "k-2" },
            makeContext(database, { user: { id: "u1", name: "u1" } })
        )
        expect(receipt.receiptToken).toBeNull()
    })

    it("同键重试返回同一回执（token 不可重现）", async () => {
        const first = await mutation.submitBug!({ input, idempotencyKey: "k-3" }, makeContext(database))
        const second = await mutation.submitBug!({ input, idempotencyKey: "k-3" }, makeContext(database))
        expect(second.submissionId).toBe(first.submissionId)
        expect(second.receiptToken).toBeNull()
        expect(database.select().from(schema.bugSubmissions).all()).toHaveLength(1)
    })

    it("同键不同内容返回 CONFLICT", async () => {
        await mutation.submitBug!({ input, idempotencyKey: "k-4" }, makeContext(database))
        await expectCode(
            mutation.submitBug!({ input: { ...input, text: "不同内容" }, idempotencyKey: "k-4" }, makeContext(database)),
            "CONFLICT"
        )
    })

    it("缺少游戏 id 时拒绝", async () => {
        await expectCode(
            mutation.submitBug!({ input: { ...input, context: null }, idempotencyKey: "k-5" }, makeContext(database)),
            "VALIDATION_FAILED"
        )
    })
})

describe("投票与订阅", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("匿名与回执身份不能投票", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        await expectCode(mutation.setVote!({ bugId: "bug-1", active: true }, makeContext(database)), "UNAUTHORIZED")
        await expectCode(
            mutation.setVote!({ bugId: "bug-1", active: true }, makeContext(database, { authorization: `Receipt ${RECEIPT_TOKEN}` })),
            "UNAUTHORIZED"
        )
    })

    it("登录用户可投票与撤票", async () => {
        seedUser(database, "u1")
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        const context = makeContext(database, { user: { id: "u1", name: "u1" } })
        const voted = await mutation.setVote!({ bugId: "bug-1", active: true }, context)
        expect(voted.votes).toBe(1)
        const unvoted = await mutation.setVote!({ bugId: "bug-1", active: false }, context)
        expect(unvoted.votes).toBe(0)
    })

    it("回执只能订阅其关联的 BUG", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        seedBug(database, { id: "bug-2", displayKey: "BUG-2", title: "另一个", summary: "另一个摘要" })
        const { versionId } = seedReceiptSubmission(database, RECEIPT_TOKEN)
        linkOccurrence(database, "bug-1", versionId)
        const context = makeContext(database, { authorization: `Receipt ${RECEIPT_TOKEN}` })

        expect(await mutation.setSubscription!({ bugId: "bug-1", channels: ["in_app"] }, context)).toBeTrue()
        await expectCode(mutation.setSubscription!({ bugId: "bug-2", channels: ["in_app"] }, context), "FORBIDDEN")
    })
})

describe("讨论与再次反馈", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("登录用户评论后可编辑与删除", async () => {
        seedUser(database, "u1")
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        const context = makeContext(database, { user: { id: "u1", name: "u1" } })
        const created = await mutation.addComment!({ bugId: "bug-1", body: "我也遇到" }, context)
        expect(created.ok).toBeTrue()
        expect(created.comment.body).toBe("我也遇到")

        const edited = await mutation.editComment!({ commentId: created.comment.id, body: "补充一下", expectedRevision: 1 }, context)
        expect(edited.comment.revision).toBe(2)
        await expectCode(mutation.editComment!({ commentId: created.comment.id, body: "越界", expectedRevision: 1 }, context), "CONFLICT")

        const deleted = await mutation.deleteBugComment!({ commentId: created.comment.id }, context)
        expect(deleted.comment.deleted).toBeTrue()
        expect(deleted.comment.body).toBe("")
    })

    it("他人不能编辑评论", async () => {
        seedUser(database, "u1")
        seedUser(database, "u2")
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        const created = await mutation.addComment!(
            { bugId: "bug-1", body: "我也遇到" },
            makeContext(database, { user: { id: "u1", name: "u1" } })
        )
        await expectCode(
            mutation.editComment!(
                { commentId: created.comment.id, body: "改掉", expectedRevision: 1 },
                makeContext(database, { user: { id: "u2", name: "u2" } })
            ),
            "FORBIDDEN"
        )
    })

    it("讨论列表不暴露他人的私密评论", async () => {
        seedUser(database, "u1")
        seedUser(database, "u2")
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        await mutation.addComment!(
            { bugId: "bug-1", body: "私密补充", visibility: "private" },
            makeContext(database, { user: { id: "u1", name: "u1" } })
        )
        const anonymousPage = await query.bugDiscussion!({ bugId: "bug-1" }, makeContext(database))
        expect(anonymousPage.total).toBe(0)
        const ownerPage = await query.bugDiscussion!({ bugId: "bug-1" }, makeContext(database, { user: { id: "u1", name: "u1" } }))
        expect(ownerPage.total).toBe(1)
    })

    it("回执持有者可在关联 BUG 下评论", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        const { versionId } = seedReceiptSubmission(database, RECEIPT_TOKEN)
        linkOccurrence(database, "bug-1", versionId)
        const context = makeContext(database, { authorization: `Receipt ${RECEIPT_TOKEN}` })
        const created = await mutation.addComment!({ bugId: "bug-1", body: "补一张图" }, context)
        expect(created.comment.body).toBe("补一张图")
    })

    it("匿名再次反馈会创建反馈与回执", async () => {
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        const receipt = await mutation.addFeedback!(
            { bugId: "bug-1", input: { text: "pc 上也能复现", reproductionResult: "reproduced" } },
            makeContext(database)
        )
        expect(receipt.bugId).toBe("bug-1")
        expect(receipt.receiptToken).toBeString()
        expect(database.select().from(schema.bugFeedback).all()).toHaveLength(1)
        expect(database.select().from(schema.bugDiscussionEntries).all()).toHaveLength(1)
    })

    it("requestReopen 把状态切到 reopen_requested", async () => {
        seedUser(database, "u1")
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要", status: "closed" })
        const feedbackId = schema.id()
        database
            .insert(schema.bugFeedback)
            .values({
                id: feedbackId,
                bugId: "bug-1",
                submissionVersionId: "s:1",
                feedbackKind: "reproduction",
                sourceActor: { kind: "user", id: "u1" },
            })
            .run()
        const result = await mutation.requestReopen!(
            { bugId: "bug-1", feedbackId },
            makeContext(database, { user: { id: "u1", name: "u1" } })
        )
        expect(result.status).toBe("reopen_requested")
        const bug = database.select().from(schema.bugs).where(eq(schema.bugs.id, "bug-1")).get()
        expect(bug?.status).toBe("reopen_requested")
    })
})

describe("Submission 读取与撤回", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("作者可读 mySubmission，他人读不到", async () => {
        seedUser(database, "u1")
        seedUser(database, "u2")
        const { submissionId } = seedReceiptSubmission(database, RECEIPT_TOKEN)
        database
            .update(schema.bugSubmissions)
            .set({ userId: "u1", anonActorId: null })
            .where(eq(schema.bugSubmissions.id, submissionId))
            .run()

        const own = await query.mySubmission!({ id: submissionId }, makeContext(database, { user: { id: "u1", name: "u1" } }))
        expect(own.submission.submissionId).toBe(submissionId)
        expect(own.versions[0].text).toBe("停在结算页")
        expect(await query.mySubmission!({ id: submissionId }, makeContext(database, { user: { id: "u2", name: "u2" } }))).toBeNull()
    })

    it("回执可读自己的 submission，匿名读不到", async () => {
        const { submissionId } = seedReceiptSubmission(database, RECEIPT_TOKEN)
        expect(await query.submission!({ id: submissionId }, makeContext(database))).toBeNull()
        const detail = await query.submission!({ id: submissionId }, makeContext(database, { authorization: `Receipt ${RECEIPT_TOKEN}` }))
        expect(detail.submission.submissionId).toBe(submissionId)
        expect(detail.submission.anonymous).toBeTrue()
    })

    it("回执可撤回尚未处理的反馈", async () => {
        const token = `receipt_${"b".repeat(36)}`
        const { submissionId } = seedReceiptSubmission(database, token)
        database.update(schema.bugSubmissions).set({ state: "received" }).where(eq(schema.bugSubmissions.id, submissionId)).run()
        const context = makeContext(database, { authorization: `Receipt ${token}` })
        expect(await mutation.withdrawSubmission!({ submissionId }, context)).toBeTrue()
        const row = database.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, submissionId)).get()
        expect(row?.state).toBe("withdrawn")
    })
})

describe("myBugs", () => {
    let database: TestDb

    beforeEach(() => {
        database = createTestDb().db
    })

    it("返回自己的反馈、投票与订阅", async () => {
        seedUser(database, "u1")
        seedBug(database, { id: "bug-1", displayKey: "BUG-1", title: "标题", summary: "摘要" })
        const receipt = await mutation.submitBug!(
            {
                input: { text: "登录后描述", context: { gameId: GAME_ID }, publicationPolicy: "GITHUB_SAFE" },
                idempotencyKey: "mine-1",
            },
            makeContext(database, { user: { id: "u1", name: "u1" } })
        )
        const context = makeContext(database, { user: { id: "u1", name: "u1" } })
        await mutation.setVote!({ bugId: "bug-1", active: true }, context)
        await mutation.setSubscription!({ bugId: "bug-1" }, context)

        const mine = await query.myBugs!({}, context)
        expect(mine.submissions.map((item: { submissionId: string }) => item.submissionId)).toContain(receipt.submissionId)
        expect(mine.votedBugIds).toEqual(["bug-1"])
        expect(mine.subscribedBugIds).toEqual(["bug-1"])
    })
})
