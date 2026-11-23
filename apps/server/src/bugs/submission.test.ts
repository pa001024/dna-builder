import { describe, expect, it } from "bun:test"
import { eq } from "drizzle-orm"
import * as schema from "../db/schema"
import {
    actorKeyOf,
    addRevision,
    createSubmission,
    getSubmission,
    resolveReceiptActor,
    submissionContentHash,
    withdrawSubmission,
} from "./submission"
import { anonymousActor, createTestDb, GAME_ID, receiptActor, seedUnattachedAsset, seedUser } from "./test-helpers"
import { BugDomainError } from "./types"

describe("submission", () => {
    it("匿名提交持久化 Submission / 版本 / 处理 Job，并返回一次性回执", () => {
        const { db, sqlite } = createTestDb()
        try {
            const receipt = createSubmission(db, { gameId: GAME_ID, rawTextPrivate: "结算页卡住" }, anonymousActor, { now: 1_000 })

            expect(receipt.receiptToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
            expect(receipt.state).toBe("queued")
            expect(receipt.revision).toBe(1)

            const submission = db.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, receipt.submissionId)).get()!
            expect(submission.userId).toBeNull()
            expect(submission.anonActorId).toBeTruthy()
            expect(submission.receiptDigest).toBeTruthy()
            expect(submission.receiptDigest).not.toBe(receipt.receiptToken)
            expect(submission.currentRevision).toBe(1)
            expect(submission.retentionUntil).toBeNumber()

            const version = db.select().from(schema.bugSubmissionVersions).all()
            expect(version).toHaveLength(1)
            expect(version[0]!.revision).toBe(1)
            expect(version[0]!.contentSha256).toBe(submissionContentHash("结算页卡住"))

            const job = db.select().from(schema.bugJobs).all()
            expect(job).toHaveLength(1)
            expect(job[0]!.idempotencyKey).toBe(`process_submission:${receipt.submissionId}:1`)
            expect(job[0]!.inputHash).toBe(submissionContentHash("结算页卡住"))
            expect(job[0]!.state).toBe("queued")
        } finally {
            sqlite.close()
        }
    })

    it("resolveReceiptActor 能解析回执，错误 token 与非法格式返回 null", () => {
        const { db, sqlite } = createTestDb()
        try {
            const receipt = createSubmission(db, { gameId: GAME_ID, rawTextPrivate: "结算页卡住" }, anonymousActor)
            const resolved = resolveReceiptActor(db, receipt.receiptToken!)
            expect(resolved?.submissionId).toBe(receipt.submissionId)
            expect(resolved?.actorKey).toBe(`anon:${resolved?.anonActorId}`)

            expect(resolveReceiptActor(db, "b".repeat(43))).toBeNull()
            expect(resolveReceiptActor(db, "short")).toBeNull()
        } finally {
            sqlite.close()
        }
    })

    it("登录用户提交不返回回执", () => {
        const { db, sqlite } = createTestDb()
        try {
            const user = seedUser(db, "user-1")
            const receipt = createSubmission(db, { gameId: GAME_ID, rawTextPrivate: "闪退" }, user)

            expect(receipt.receiptToken).toBeNull()
            const submission = db.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, receipt.submissionId)).get()!
            expect(submission.userId).toBe("user-1")
            expect(submission.receiptDigest).toBeNull()
            expect(actorKeyOf(user)).toBe("user:user-1")
        } finally {
            sqlite.close()
        }
    })

    it("回执持有者可追加版本，旧 revision 的处理任务被取消", () => {
        const { db, sqlite } = createTestDb()
        try {
            const receipt = createSubmission(db, { gameId: GAME_ID, rawTextPrivate: "结算页卡住" }, anonymousActor)
            const revision = addRevision(
                db,
                receipt.submissionId,
                { rawTextPrivate: "补充：重启后仍然卡住", context: { platform: "pc" } },
                receiptActor(receipt.receiptToken!)
            )

            expect(revision.revision).toBe(2)
            const submission = db.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, receipt.submissionId)).get()!
            expect(submission.currentRevision).toBe(2)
            expect(submission.state).toBe("queued")

            const jobs = db.select().from(schema.bugJobs).all()
            expect(jobs).toHaveLength(2)
            expect(jobs.find(job => job.inputRevision === 1)?.state).toBe("cancelled")
            expect(jobs.find(job => job.inputRevision === 2)?.state).toBe("queued")
            expect(db.select().from(schema.bugSubmissionVersions).all()).toHaveLength(2)
        } finally {
            sqlite.close()
        }
    })

    it("非作者不能追加或撤回", () => {
        const { db, sqlite } = createTestDb()
        try {
            seedUser(db, "owner")
            seedUser(db, "other")
            const receipt = createSubmission(db, { gameId: GAME_ID, rawTextPrivate: "闪退" }, { kind: "user", userId: "owner", roles: [] })

            expect(() =>
                addRevision(db, receipt.submissionId, { rawTextPrivate: "补充" }, { kind: "user", userId: "other", roles: [] })
            ).toThrow(BugDomainError)
            expect(() => withdrawSubmission(db, receipt.submissionId, { kind: "user", userId: "other", roles: [] })).toThrow(BugDomainError)
        } finally {
            sqlite.close()
        }
    })

    it("撤回只允许未完成状态并取消排队任务", () => {
        const { db, sqlite } = createTestDb()
        try {
            const receipt = createSubmission(db, { gameId: GAME_ID, rawTextPrivate: "闪退" }, anonymousActor)
            expect(withdrawSubmission(db, receipt.submissionId, receiptActor(receipt.receiptToken!))).toBe(true)

            const submission = db.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, receipt.submissionId)).get()!
            expect(submission.state).toBe("withdrawn")
            expect(db.select().from(schema.bugJobs).all()[0]!.state).toBe("cancelled")

            expect(() => withdrawSubmission(db, receipt.submissionId, receiptActor(receipt.receiptToken!))).toThrow(/不允许撤回/)
        } finally {
            sqlite.close()
        }
    })

    it("getSubmission 只对作者 / 有效回执可见", () => {
        const { db, sqlite } = createTestDb()
        try {
            const receipt = createSubmission(db, { gameId: GAME_ID, rawTextPrivate: "闪退" }, anonymousActor)

            const detail = getSubmission(db, receipt.submissionId, receiptActor(receipt.receiptToken!))
            expect(detail?.submission.id).toBe(receipt.submissionId)
            expect(detail?.versions).toHaveLength(1)

            expect(getSubmission(db, receipt.submissionId, receiptActor(generateOtherToken()))).toBeNull()
            expect(getSubmission(db, receipt.submissionId, anonymousActor)).toBeNull()
            expect(getSubmission(db, "missing", anonymousActor)).toBeNull()
        } finally {
            sqlite.close()
        }
    })

    it("空内容与超限内容被拒绝", () => {
        const { db, sqlite } = createTestDb()
        try {
            expect(() => createSubmission(db, { gameId: GAME_ID, rawTextPrivate: "   " }, anonymousActor)).toThrow(BugDomainError)
            expect(() => createSubmission(db, { gameId: GAME_ID, rawTextPrivate: "x".repeat(50_001) }, anonymousActor)).toThrow(
                BugDomainError
            )
            expect(() => createSubmission(db, { gameId: "", rawTextPrivate: "x" }, anonymousActor)).toThrow(BugDomainError)
        } finally {
            sqlite.close()
        }
    })

    it("图片资产绑定到首个版本", () => {
        const { db, sqlite } = createTestDb()
        try {
            seedUnattachedAsset(db, "asset-1")
            const receipt = createSubmission(db, { gameId: GAME_ID, assetIds: ["asset-1"] }, anonymousActor)

            const asset = db.select().from(schema.bugAssets).where(eq(schema.bugAssets.id, "asset-1")).get()!
            expect(asset.submissionVersionId).toBe(`${receipt.submissionId}:1`)
        } finally {
            sqlite.close()
        }
    })
})

function generateOtherToken(): string {
    return "c".repeat(43)
}
