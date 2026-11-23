import { describe, expect, it } from "bun:test"
import { eq } from "drizzle-orm"
import * as schema from "../db/schema"
import { cancelStaleLease, claimJob, completeJob, enqueueJob, failJob, heartbeatJob } from "./jobs"
import { createTestDb } from "./test-helpers"

describe("bug jobs", () => {
    it("enqueueJob 对同一 idempotencyKey 幂等", () => {
        const { db, sqlite } = createTestDb()
        try {
            const first = enqueueJob(db, { kind: "process_submission", idempotencyKey: "job-key-1", inputHash: "h1", now: 1000 })
            const second = enqueueJob(db, { kind: "process_submission", idempotencyKey: "job-key-1", inputHash: "h2", now: 2000 })

            expect(second.id).toBe(first.id)
            expect(db.select().from(schema.bugJobs).all()).toHaveLength(1)
            expect(first.state).toBe("queued")
        } finally {
            sqlite.close()
        }
    })

    it("claimJob 设置租约、递增 fencingToken 并阻止并发领取", () => {
        const { db, sqlite } = createTestDb()
        try {
            enqueueJob(db, { kind: "process_submission", idempotencyKey: "job-key-1", now: 1_000 })

            const claimed = claimJob(db, "worker-a", { now: 1_000, leaseMs: 500 })
            expect(claimed).toHaveLength(1)
            expect(claimed[0]!.state).toBe("running")
            expect(claimed[0]!.leaseOwner).toBe("worker-a")
            expect(claimed[0]!.leaseUntil).toBe(1_500)
            expect(claimed[0]!.fencingToken).toBe(1)
            expect(claimed[0]!.attempt).toBe(1)

            expect(claimJob(db, "worker-b", { now: 1_200, leaseMs: 500 })).toHaveLength(0)
        } finally {
            sqlite.close()
        }
    })

    it("claimJob 遵守 kind 过滤、eligibleAt 与优先级", () => {
        const { db, sqlite } = createTestDb()
        try {
            enqueueJob(db, { kind: "rebuild_dedup_index", idempotencyKey: "job-low", now: 1_000, priorityClass: "low" })
            enqueueJob(db, { kind: "process_submission", idempotencyKey: "job-normal", now: 1_000, priorityClass: "normal" })
            enqueueJob(db, { kind: "process_submission", idempotencyKey: "job-critical", now: 1_000, priorityClass: "critical" })
            enqueueJob(db, { kind: "process_submission", idempotencyKey: "job-future", eligibleAt: 5_000, now: 1_000 })

            expect(claimJob(db, "w", { kinds: ["rebuild_dedup_index"], now: 1_000 })).toHaveLength(1)

            const claimed = claimJob(db, "w", { kinds: ["process_submission"], limit: 3, now: 1_000 })
            expect(claimed.map(job => job.idempotencyKey)).toEqual(["job-critical", "job-normal"])
        } finally {
            sqlite.close()
        }
    })

    it("heartbeat 与 complete 只接受当前 owner + fencingToken", () => {
        const { db, sqlite } = createTestDb()
        try {
            enqueueJob(db, { kind: "process_submission", idempotencyKey: "job-key-1", now: 1_000 })
            const job = claimJob(db, "worker-a", { now: 1_000, leaseMs: 500 })[0]!

            expect(heartbeatJob(db, job.id, "worker-a", job.fencingToken, 500, 1_200)).toBe(true)
            expect(heartbeatJob(db, job.id, "worker-b", job.fencingToken, 500, 1_200)).toBe(false)
            expect(heartbeatJob(db, job.id, "worker-a", job.fencingToken + 1, 500, 1_200)).toBe(false)

            const heartbeat = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, job.id)).get()
            expect(heartbeat?.leaseUntil).toBe(1_700)

            expect(completeJob(db, job.id, "worker-a", job.fencingToken + 1)).toBe(false)
            expect(completeJob(db, job.id, "worker-a", job.fencingToken, "proposal-1")).toBe(true)

            const completed = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, job.id)).get()
            expect(completed?.state).toBe("completed")
            expect(completed?.resultRef).toBe("proposal-1")
            expect(completed?.leaseOwner).toBeNull()
            expect(completed?.leaseUntil).toBeNull()
        } finally {
            sqlite.close()
        }
    })

    it("failJob 指数退避重试，超过尝试上限进 failed", () => {
        const { db, sqlite } = createTestDb()
        try {
            enqueueJob(db, { kind: "process_submission", idempotencyKey: "job-key-1", now: 1_000 })
            let job = claimJob(db, "worker-a", { now: 1_000 })[0]!

            const firstFailure = failJob(db, {
                jobId: job.id,
                workerId: "worker-a",
                fencingToken: job.fencingToken,
                error: "transient",
                backoffBaseMs: 1_000,
                jitterMs: 0,
                now: 2_000,
            })
            expect(firstFailure).toEqual({ state: "retry_wait", retryAt: 3_000 })
            expect(claimJob(db, "worker-a", { now: 2_999 })).toHaveLength(0)

            for (let attempt = 2; attempt <= 5; attempt++) {
                const at = attempt * 1_000_000
                const claimed = claimJob(db, "worker-a", { now: at, leaseMs: 90_000 })
                expect(claimed).toHaveLength(1)
                job = claimed[0]!
                expect(job.attempt).toBe(attempt)
                const outcome = failJob(db, {
                    jobId: job.id,
                    workerId: "worker-a",
                    fencingToken: job.fencingToken,
                    error: "transient",
                    backoffBaseMs: 1_000,
                    jitterMs: 0,
                    now: at,
                })
                expect(outcome.state).toBe(attempt < 5 ? "retry_wait" : "failed")
            }

            const failed = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, job.id)).get()
            expect(failed?.state).toBe("failed")
            expect(failed?.lastError).toBe("transient")
        } finally {
            sqlite.close()
        }
    })

    it("failJob 拒绝过期 fencingToken", () => {
        const { db, sqlite } = createTestDb()
        try {
            enqueueJob(db, { kind: "process_submission", idempotencyKey: "job-key-1", now: 1_000 })
            const job = claimJob(db, "worker-a", { now: 1_000 })[0]!

            expect(() =>
                failJob(db, {
                    jobId: job.id,
                    workerId: "worker-a",
                    fencingToken: job.fencingToken + 1,
                    error: "stale",
                })
            ).toThrow(/租约已失效/)
        } finally {
            sqlite.close()
        }
    })

    it("过期租约可被回收并重新领取", () => {
        const { db, sqlite } = createTestDb()
        try {
            enqueueJob(db, { kind: "process_submission", idempotencyKey: "job-key-1", now: 1_000 })
            claimJob(db, "worker-a", { now: 1_000, leaseMs: 100 })

            expect(cancelStaleLease(db, 1_100)).toBe(1)
            const recovered = claimJob(db, "worker-b", { now: 1_101, leaseMs: 100 })
            expect(recovered).toHaveLength(1)
            expect(recovered[0]!.fencingToken).toBe(2)
            expect(recovered[0]!.leaseOwner).toBe("worker-b")
        } finally {
            sqlite.close()
        }
    })

    it("未调用回收时 claimJob 也能接管过期租约", () => {
        const { db, sqlite } = createTestDb()
        try {
            enqueueJob(db, { kind: "process_submission", idempotencyKey: "job-key-1", now: 1_000 })
            claimJob(db, "worker-a", { now: 1_000, leaseMs: 100 })

            const recovered = claimJob(db, "worker-b", { now: 2_000, leaseMs: 100 })
            expect(recovered).toHaveLength(1)
            expect(recovered[0]!.fencingToken).toBe(2)
        } finally {
            sqlite.close()
        }
    })
})
