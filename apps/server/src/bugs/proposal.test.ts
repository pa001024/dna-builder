import { describe, expect, it } from "bun:test"
import { eq } from "drizzle-orm"
import * as schema from "../db/schema"
import { claimJob, completeJob } from "./jobs"
import { applyProposal } from "./proposal"
import { createSubmission } from "./submission"
import { anonymousActor, createTestDb, GAME_ID, seedBug, workerActor } from "./test-helpers"
import { BugDomainError, type BugProposal } from "./types"

const TEXT = "结算页面卡住，无法继续。重启后仍然卡住。"
const QUOTE = "结算页面卡住"

function setup(
    db: ReturnType<typeof createTestDb>["db"],
    publicationPolicy: "internal_only" | "catalog_safe" | "github_safe" = "github_safe"
) {
    const receipt = createSubmission(db, { gameId: GAME_ID, rawTextPrivate: TEXT, publicationPolicy }, anonymousActor, { now: 1_000 })
    const job = claimJob(db, "worker-1", { now: 1_000 })[0]!
    return { receipt, job }
}

function proposal(submissionId: string, inputHash: string, overrides: Partial<BugProposal> = {}): BugProposal {
    return {
        schemaVersion: 1,
        submissionVersionId: `${submissionId}:1`,
        inputHash,
        disposition: "game_bug",
        parts: [
            {
                partId: "p1",
                title: "结算页面卡住",
                summary: "通关后停在结算页，无法继续",
                primaryCategory: "ui",
                tags: ["category.ui"],
                actual: "停在结算页",
                expected: "进入下一关",
                steps: ["完成关卡"],
                environment: { platform: "pc", region: null, gameVersion: "1.0.0" },
                suggestedSeverity: "S2",
                severityReason: "主流程受阻，但可重进",
                evidenceRefs: [{ type: "text", versionId: `${submissionId}:1`, start: 0, end: QUOTE.length, quote: QUOTE }],
                duplicate: { decision: "unknown", candidateBugId: null, reasons: [], contradictions: [] },
                missingInformation: [],
            },
        ],
        clarificationQuestions: [],
        ...overrides,
    }
}

describe("Proposal 校验与应用", () => {
    it("事务内创建 Bug / Occurrence / 事件 / outbox 并推进 Submission", () => {
        const { db, sqlite } = createTestDb()
        try {
            const { receipt, job } = setup(db)
            const result = applyProposal(db, proposal(receipt.submissionId, job.inputHash!), job, workerActor)

            expect(result.createdBugIds).toHaveLength(1)
            expect(result.linkedBugIds).toEqual([])
            expect(result.submissionState).toBe("processed")

            const bug = db.select().from(schema.bugs).where(eq(schema.bugs.id, result.createdBugIds[0]!)).get()!
            expect(bug.displayKey).toBe("BUG-1")
            expect(bug.status).toBe("untriaged")
            expect(bug.primaryCategory).toBe("ui")
            expect(bug.suggestedSeverity).toBe("S2")
            expect(bug.severitySource).toBe("ai")
            expect(bug.tags).toContain("category.ui")
            expect(bug.tags).toContain("severity.s2")
            expect(bug.tags).toContain("fix.unconfirmed")
            expect(bug.tags).toContain("type.game_bug")
            expect(bug.steps).toEqual(["完成关卡"])

            const occurrence = db.select().from(schema.bugOccurrences).all()
            expect(occurrence).toHaveLength(1)
            expect(occurrence[0]!.bugId).toBe(bug.id)
            expect(occurrence[0]!.partId).toBe("p1")
            expect(occurrence[0]!.submissionVersionId).toBe(`${receipt.submissionId}:1`)
            expect(occurrence[0]!.evidenceRefs).toHaveLength(1)
            expect(occurrence[0]!.sourceActor.kind).toBe("anonymous")

            const kinds = db
                .select()
                .from(schema.bugEvents)
                .all()
                .map(event => event.kind)
            expect(kinds).toContain("bug_created")
            expect(kinds).toContain("occurrence_created")
            expect(kinds).toContain("submission_processed")

            const outbox = db.select().from(schema.bugOutbox).all()
            expect(outbox).toHaveLength(1)
            expect(outbox[0]!.operation).toBe("create_issue")
            expect(outbox[0]!.payloadHash).toBeTruthy()

            const submission = db.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, receipt.submissionId)).get()!
            expect(submission.state).toBe("processed")
        } finally {
            sqlite.close()
        }
    })

    it("敏感提交只进内部库：Bug 私有且不产出 GitHub 任务", () => {
        const { db, sqlite } = createTestDb()
        try {
            const { receipt, job } = setup(db, "internal_only")
            const result = applyProposal(db, proposal(receipt.submissionId, job.inputHash!), job, workerActor)

            const bug = db.select().from(schema.bugs).where(eq(schema.bugs.id, result.createdBugIds[0]!)).get()!
            expect(bug.visibility).toBe("private")
            expect(db.select().from(schema.bugOutbox).all()).toHaveLength(0)
        } finally {
            sqlite.close()
        }
    })

    it("含隐私提交脱敏后仍公开并同步 GitHub", () => {
        const { db, sqlite } = createTestDb()
        try {
            const { receipt, job } = setup(db, "catalog_safe")
            const result = applyProposal(db, proposal(receipt.submissionId, job.inputHash!), job, workerActor)

            const bug = db.select().from(schema.bugs).where(eq(schema.bugs.id, result.createdBugIds[0]!)).get()!
            expect(bug.visibility).toBe("public")
            const outbox = db.select().from(schema.bugOutbox).all()
            expect(outbox).toHaveLength(1)
            expect(outbox[0]!.operation).toBe("create_issue")
        } finally {
            sqlite.close()
        }
    })

    it("同一 Proposal 重放不会重复创建 Bug", () => {
        const { db, sqlite } = createTestDb()
        try {
            const { receipt, job } = setup(db)
            const value = proposal(receipt.submissionId, job.inputHash!)
            const first = applyProposal(db, value, job, workerActor)
            const second = applyProposal(db, value, job, workerActor)

            expect(second.createdBugIds).toEqual([])
            expect(second.linkedBugIds).toEqual(first.createdBugIds)
            expect(db.select().from(schema.bugs).all()).toHaveLength(1)
            expect(db.select().from(schema.bugOccurrences).all()).toHaveLength(1)
        } finally {
            sqlite.close()
        }
    })

    it("needs_info 创建待补充 Bug 并同步 Submission 状态", () => {
        const { db, sqlite } = createTestDb()
        try {
            const { receipt, job } = setup(db)
            const result = applyProposal(
                db,
                proposal(receipt.submissionId, job.inputHash!, { disposition: "needs_info" }),
                job,
                workerActor
            )

            expect(result.submissionState).toBe("needs_info")
            const bug = db.select().from(schema.bugs).all()[0]!
            expect(bug.status).toBe("needs_info")
            expect(bug.fixStage).toBe("fix.needs_info")
            expect(bug.tags).toContain("fix.needs_info")
        } finally {
            sqlite.close()
        }
    })

    it("decision=same 只追加证据关联，不创建第二个 Bug", () => {
        const { db, sqlite } = createTestDb()
        try {
            const existing = seedBug(db, { id: "existing-1", displayKey: "BUG-9", title: "结算页面卡住" })
            const { receipt, job } = setup(db)
            const value = proposal(receipt.submissionId, job.inputHash!)
            value.parts[0]!.duplicate = {
                decision: "same",
                candidateBugId: existing.id,
                reasons: ["同一页面与操作"],
                contradictions: [],
            }

            const result = applyProposal(db, value, job, workerActor)
            expect(result.createdBugIds).toEqual([])
            expect(result.linkedBugIds).toEqual([existing.id])
            expect(db.select().from(schema.bugs).all()).toHaveLength(1)

            const occurrence = db.select().from(schema.bugOccurrences).all()[0]!
            expect(occurrence.bugId).toBe(existing.id)
            const updated = db.select().from(schema.bugs).where(eq(schema.bugs.id, existing.id)).get()!
            expect(updated.version).toBe(2)
            expect(
                db
                    .select()
                    .from(schema.bugEvents)
                    .all()
                    .map(event => event.kind)
            ).toContain("occurrence_linked")
            expect(db.select().from(schema.bugOutbox).all()).toHaveLength(0)
        } finally {
            sqlite.close()
        }
    })

    it("filtered / privacy_blocked 不建档", () => {
        const { db, sqlite } = createTestDb()
        try {
            const { receipt, job } = setup(db)
            const filtered = proposal(receipt.submissionId, job.inputHash!, { disposition: "filtered", parts: [] })
            const result = applyProposal(db, filtered, job, workerActor)

            expect(result.createdBugIds).toEqual([])
            expect(result.submissionState).toBe("filtered")
            expect(db.select().from(schema.bugs).all()).toHaveLength(0)
        } finally {
            sqlite.close()
        }
    })

    it("拒绝无效 schemaVersion / inputHash / 证据切片 / 标签 / 过期 revision", () => {
        const { db, sqlite } = createTestDb()
        try {
            const { receipt, job } = setup(db)
            const hash = job.inputHash!
            const valid = proposal(receipt.submissionId, hash)

            expect(() => applyProposal(db, { ...valid, schemaVersion: 2 as 1 }, job, workerActor)).toThrow(/schemaVersion/)
            expect(() => applyProposal(db, { ...valid, inputHash: "wrong" }, job, workerActor)).toThrow(/inputHash/)

            const badQuote = proposal(receipt.submissionId, hash)
            badQuote.parts[0]!.evidenceRefs = [
                { type: "text", versionId: `${receipt.submissionId}:1`, start: 0, end: 6, quote: "结算页面" },
            ]
            expect(() => applyProposal(db, badQuote, job, workerActor)).toThrow(/quote/)

            const badTag = proposal(receipt.submissionId, hash)
            badTag.parts[0]!.tags = ["fix.released"]
            expect(() => applyProposal(db, badTag, job, workerActor)).toThrow(BugDomainError)

            db.update(schema.bugSubmissions).set({ currentRevision: 2 }).where(eq(schema.bugSubmissions.id, receipt.submissionId)).run()
            expect(() => applyProposal(db, valid, job, workerActor)).toThrow(/过期结果/)
        } finally {
            sqlite.close()
        }
    })

    it("fencing 失效后拒绝提交", () => {
        const { db, sqlite } = createTestDb()
        try {
            const { receipt, job } = setup(db)
            expect(completeJob(db, job.id, "worker-1", job.fencingToken, "done")).toBe(true)
            expect(() => applyProposal(db, proposal(receipt.submissionId, job.inputHash!), job, workerActor)).toThrow(/租约已失效/)
        } finally {
            sqlite.close()
        }
    })
})
