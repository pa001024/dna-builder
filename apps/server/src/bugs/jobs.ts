import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm"
import * as schema from "../db/schema"
import { BUG_JOB_KINDS, type BugDb, BugDomainError, type BugJobPriority, type BugJobRow, type BugJobState } from "./types"

/** 租约时长与心跳间隔（spec §13.1 建议值）。 */
export const DEFAULT_LEASE_MS = 90_000
export const DEFAULT_HEARTBEAT_MS = 15_000
export const DEFAULT_MAX_ATTEMPTS = 5
export const DEFAULT_BACKOFF_BASE_MS = 1_000
export const DEFAULT_BACKOFF_MAX_MS = 60_000

export type EnqueueJobInput = {
    kind: string
    idempotencyKey: string
    inputRevision?: number
    inputHash?: string | null
    priorityClass?: BugJobPriority
    eligibleAt?: number
    now?: number
}

export type ClaimJobOptions = {
    kinds?: string[]
    limit?: number
    leaseMs?: number
    now?: number
}

export type FailJobInput = {
    jobId: string
    workerId: string
    fencingToken: number
    error: string
    retry?: boolean
    maxAttempts?: number
    backoffBaseMs?: number
    backoffMaxMs?: number
    jitterMs?: number
    now?: number
}

/** 优先级排序：critical → high → normal → low。 */
const priorityRank = sql`case ${schema.bugJobs.priorityClass} when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`

/**
 * @description 幂等入队：同一 `idempotencyKey` 只存在一个 Job，重复调用返回既有任务。
 * @param db 数据库
 * @param input 任务参数
 * @returns Job 行
 */
export function enqueueJob(db: BugDb, input: EnqueueJobInput): BugJobRow {
    const now = input.now ?? Date.now()
    const inserted = db
        .insert(schema.bugJobs)
        .values({
            kind: input.kind,
            idempotencyKey: input.idempotencyKey,
            inputRevision: input.inputRevision ?? 0,
            inputHash: input.inputHash ?? null,
            priorityClass: input.priorityClass ?? "normal",
            eligibleAt: input.eligibleAt ?? now,
        })
        .onConflictDoNothing({ target: schema.bugJobs.idempotencyKey })
        .returning()
        .all()
    if (inserted.length) return inserted[0]!

    const existing = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.idempotencyKey, input.idempotencyKey)).get()
    if (!existing) throw new BugDomainError("CONFLICT", "任务入队冲突且无法读取既有记录")
    return existing
}

/**
 * @description 领取任务：在事务内挑出 eligible 的排队任务与租约已过期的运行任务，
 * 用条件更新保证同一任务只有一个 worker 领到，并递增 fencingToken。
 * @param db 数据库
 * @param workerId worker 标识
 * @param options 任务类型过滤、批量大小、租约时长
 * @returns 被领取的 Job 行
 */
export function claimJob(db: BugDb, workerId: string, options: ClaimJobOptions = {}): BugJobRow[] {
    const now = options.now ?? Date.now()
    const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
    const limit = Math.max(1, Math.min(options.limit ?? 1, 8))

    return db.transaction(tx => {
        const eligible = or(
            and(inArray(schema.bugJobs.state, ["queued", "retry_wait"]), lte(schema.bugJobs.eligibleAt, now)),
            and(eq(schema.bugJobs.state, "running"), lte(schema.bugJobs.leaseUntil, now))
        )
        const where = options.kinds?.length ? and(eligible, inArray(schema.bugJobs.kind, options.kinds)) : eligible

        const candidates = tx
            .select()
            .from(schema.bugJobs)
            .where(where)
            .orderBy(asc(priorityRank), asc(schema.bugJobs.eligibleAt), asc(schema.bugJobs.createdAt))
            .limit(limit)
            .all()

        const claimed: BugJobRow[] = []
        for (const candidate of candidates) {
            const updated = tx
                .update(schema.bugJobs)
                .set({
                    state: "running",
                    leaseOwner: workerId,
                    leaseUntil: now + leaseMs,
                    fencingToken: candidate.fencingToken + 1,
                    attempt: candidate.attempt + 1,
                })
                .where(
                    and(
                        eq(schema.bugJobs.id, candidate.id),
                        eq(schema.bugJobs.fencingToken, candidate.fencingToken),
                        inArray(schema.bugJobs.state, ["queued", "retry_wait", "running"])
                    )
                )
                .returning()
                .all()
            if (updated.length) claimed.push(updated[0]!)
        }
        return claimed
    })
}

/**
 * @description 续租：只有当前 owner + fencingToken + running 状态同时匹配才延长租约。
 * @returns 是否续租成功
 */
export function heartbeatJob(
    db: BugDb,
    jobId: string,
    workerId: string,
    fencingToken: number,
    leaseMs = DEFAULT_LEASE_MS,
    now = Date.now()
): boolean {
    const updated = db
        .update(schema.bugJobs)
        .set({ leaseUntil: now + leaseMs })
        .where(
            and(
                eq(schema.bugJobs.id, jobId),
                eq(schema.bugJobs.leaseOwner, workerId),
                eq(schema.bugJobs.fencingToken, fencingToken),
                eq(schema.bugJobs.state, "running")
            )
        )
        .returning({ id: schema.bugJobs.id })
        .all()
    return updated.length > 0
}

/**
 * @description 完成提交：校验 fencingToken 后写入结果引用并清除租约；过期 worker 的提交被拒绝。
 * @returns 是否接受提交
 */
export function completeJob(db: BugDb, jobId: string, workerId: string, fencingToken: number, resultRef?: string | null): boolean {
    const updated = db
        .update(schema.bugJobs)
        .set({
            state: "completed",
            resultRef: resultRef ?? null,
            leaseOwner: null,
            leaseUntil: null,
            lastError: null,
        })
        .where(
            and(
                eq(schema.bugJobs.id, jobId),
                eq(schema.bugJobs.leaseOwner, workerId),
                eq(schema.bugJobs.fencingToken, fencingToken),
                eq(schema.bugJobs.state, "running")
            )
        )
        .returning({ id: schema.bugJobs.id })
        .all()
    return updated.length > 0
}

/**
 * @description 失败处理：可重试错误回 `retry_wait` 并做指数退避 + jitter，超过次数或永久错误进 `failed`。
 * @returns 落库后的状态
 */
export function failJob(db: BugDb, input: FailJobInput): { state: BugJobState; retryAt: number | null } {
    const now = input.now ?? Date.now()
    const job = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, input.jobId)).get()
    if (!job) throw new BugDomainError("NOT_FOUND", "任务不存在")
    if (job.leaseOwner !== input.workerId || job.fencingToken !== input.fencingToken || job.state !== "running") {
        throw new BugDomainError("CONFLICT", "任务租约已失效，拒绝写入失败结果")
    }

    const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    const shouldRetry = input.retry !== false && job.attempt < maxAttempts

    if (!shouldRetry) {
        db.update(schema.bugJobs)
            .set({ state: "failed", leaseOwner: null, leaseUntil: null, lastError: input.error })
            .where(and(eq(schema.bugJobs.id, job.id), eq(schema.bugJobs.fencingToken, input.fencingToken)))
            .run()
        return { state: "failed", retryAt: null }
    }

    const base = input.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS
    const max = input.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS
    const jitter = input.jitterMs ?? Math.floor(Math.random() * base)
    const delay = Math.min(max, base * 2 ** Math.max(0, job.attempt - 1)) + jitter
    const retryAt = now + delay

    db.update(schema.bugJobs)
        .set({ state: "retry_wait", eligibleAt: retryAt, leaseOwner: null, leaseUntil: null, lastError: input.error })
        .where(and(eq(schema.bugJobs.id, job.id), eq(schema.bugJobs.fencingToken, input.fencingToken)))
        .run()
    return { state: "retry_wait", retryAt }
}

/**
 * @description 回收过期租约：把租约到期的运行任务放回 `retry_wait`，供 crash 恢复后重新领取。
 * @returns 回收数量
 */
export function cancelStaleLease(db: BugDb, now = Date.now()): number {
    const recovered = db
        .update(schema.bugJobs)
        .set({ state: "retry_wait", eligibleAt: now, leaseOwner: null, leaseUntil: null, lastError: "lease expired" })
        .where(and(eq(schema.bugJobs.state, "running"), lte(schema.bugJobs.leaseUntil, now)))
        .returning({ id: schema.bugJobs.id })
        .all()
    return recovered.length
}

/** 取消某次 submission revision 尚未开始的处理任务（撤回 / 新版本覆盖）。 */
export function cancelProcessJobs(db: BugDb, submissionId: string): number {
    const cancelled = db
        .update(schema.bugJobs)
        .set({ state: "cancelled", leaseOwner: null, leaseUntil: null })
        .where(
            and(
                eq(schema.bugJobs.kind, BUG_JOB_KINDS.processSubmission),
                inArray(schema.bugJobs.state, ["queued", "retry_wait"]),
                sql`${schema.bugJobs.idempotencyKey} like ${`${BUG_JOB_KINDS.processSubmission}:${submissionId}:%`}`
            )
        )
        .returning({ id: schema.bugJobs.id })
        .all()
    return cancelled.length
}
