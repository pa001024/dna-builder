import { createHmac, timingSafeEqual } from "node:crypto"
import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm"
import { Elysia } from "elysia"
import {
    applyProposal,
    type BugDb,
    BugDomainError,
    type BugJobRow,
    type BugOutboxState,
    type BugProposal,
    claimJob,
    completeJob,
    DEFAULT_LEASE_MS,
    failJob,
    heartbeatJob,
} from "../bugs"
import { db, schema } from "../db"

/**
 * BUG 收集的 GitHub 集成入口。
 *
 * `POST /api/v1/integrations/github/bug-webhook`：先用原始字节验签，再把 delivery 原样落进
 * `github_webhook_inbox`；落库成功才 ACK。重复 delivery 复用 inbox（幂等），数据库不可写时返回 503，
 * 绝不假 ACK——外部投递与内部消费解耦，消费由 worker 负责。
 *
 * `/internal/bug-pipeline/*`：内部 worker（pi Runner / GitHub Bridge）专用 REST，全部要求
 * `BUG_WORKER_TOKEN` 服务身份，不接受用户 JWT；未配置令牌时一律 503。
 */

/** GitHub 签名头（sha256=...）。 */
const SIGNATURE_HEADER = "x-hub-signature-256"

/** Webhook 正文上限：GitHub 投递远小于此值，超限直接拒绝，避免未验签就缓冲大包。 */
const MAX_WEBHOOK_BYTES = 1024 * 1024

/** 仓库白名单：优先 `GITHUB_BUG_REPOSITORY_ID`（与 u3 出站目标同一口径），兼容逗号分隔的多仓库配置。 */
function resolveRepositoryAllowlist(): Set<string> {
    const raw = process.env.GITHUB_BUG_REPOSITORY_ID?.trim() || process.env.GITHUB_BUG_REPOSITORY?.trim() || ""
    return new Set(
        raw
            .split(",")
            .map(value => value.trim())
            .filter(Boolean)
    )
}

/**
 * @description 校验 GitHub Webhook 签名：对原始字节做 HMAC-SHA256，与 `x-hub-signature-256` 恒定时间比较。
 * 不经过 JSON 解析或字符重编码，emoji 等非 ASCII 内容同样按字节比对。
 * @param secret webhook secret
 * @param rawBody 原始请求字节
 * @param signature 签名头
 * @returns 是否通过
 */
export function verifyGithubSignature(secret: string, rawBody: Uint8Array, signature: string | null | undefined): boolean {
    if (!secret || !signature) return false
    const value = signature.trim()
    if (!value.toLowerCase().startsWith("sha256=")) return false
    const hex = value.slice("sha256=".length).trim()
    if (!/^[0-9a-f]{64}$/i.test(hex)) return false

    const expected = createHmac("sha256", secret).update(rawBody).digest()
    const received = Buffer.from(hex, "hex")
    return received.length === expected.length && timingSafeEqual(received, expected)
}

/** 从 payload 里取字符串或数字 id；其他形态一律忽略。 */
function idOf(value: unknown): string | null {
    if (typeof value === "string" && value) return value
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
    return null
}

function toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** Worker 接口统一错误码 → HTTP 状态。 */
const WORKER_STATUS_BY_CODE: Record<string, number> = {
    VALIDATION_FAILED: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    UNAVAILABLE: 503,
}

type StatusSetter = { status?: number | string }

/** 内部接口的可写出的 outbox 终态（不接受 `sending`）。 */
const OUTBOX_RESULT_STATES = new Set<BugOutboxState>(["delivered", "retry_wait", "failed", "blocked", "conflict", "unknown_effect"])

const MAX_WORKER_BODY_BYTES = 512 * 1024

/** 恒定时间字符串比较：长度不同直接拒绝，避免早退泄漏令牌长度以外的信息。 */
function tokenEquals(supplied: string, expected: string): boolean {
    const a = Buffer.from(supplied)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
}

type WorkerAuth = { ok: true } | { ok: false; status: number; body: { ok: false; reason: string } }

/**
 * @description Worker 身份鉴权：`BUG_WORKER_TOKEN` 未配置时视为服务不可用（503），
 * 令牌来自 `x-worker-token` 或 `Authorization: Worker <token>`，与用户 JWT 完全隔离。
 * @param request 请求
 * @returns 通过或带状态码的拒绝体
 */
function authorizeWorker(request: Request): WorkerAuth {
    const expected = process.env.BUG_WORKER_TOKEN?.trim()
    if (!expected) return { ok: false, status: 503, body: { ok: false, reason: "worker_unavailable" } }

    const authorization = request.headers.get("authorization")?.trim()
    const supplied = request.headers.get("x-worker-token")?.trim() ?? authorization?.replace(/^Worker\s+/i, "") ?? ""
    if (!supplied || !tokenEquals(supplied, expected)) {
        return { ok: false, status: 401, body: { ok: false, reason: "unauthorized" } }
    }
    return { ok: true }
}

function workerFail(set: StatusSetter, status: number, reason: string) {
    set.status = status
    return { ok: false as const, reason }
}

/** 领域错误映射为稳定的 HTTP 响应，不向 worker 暴露内部异常细节。 */
function respondDomainError(set: StatusSetter, error: unknown) {
    if (error instanceof BugDomainError) {
        set.status = WORKER_STATUS_BY_CODE[error.code] ?? 400
        return { ok: false as const, code: error.code, error: error.message }
    }
    console.error("BUG worker 接口异常", error)
    set.status = 500
    return { ok: false as const, code: "UNAVAILABLE", error: "内部错误" }
}

function requiredString(body: Record<string, unknown>, key: string, maxLength = 200): string | null {
    const value = body[key]
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > maxLength) return null
    return trimmed
}

function optionalStringArray(body: Record<string, unknown>, key: string): string[] | undefined {
    const value = body[key]
    if (value === undefined || value === null) return undefined
    if (!Array.isArray(value)) return undefined
    return value.filter((item): item is string => typeof item === "string" && Boolean(item))
}

function optionalNumber(body: Record<string, unknown>, key: string): number | undefined {
    const value = body[key]
    return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function optionalInteger(body: Record<string, unknown>, key: string): number | undefined {
    const value = optionalNumber(body, key)
    return value !== undefined && Number.isInteger(value) ? value : undefined
}

function clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(Math.trunc(value), max))
}

/** 领取任务下发给 worker 的投影：包含提交 Proposal 所需的幂等键与 inputHash。 */
function toClaimedJob(job: BugJobRow) {
    return {
        id: job.id,
        kind: job.kind,
        idempotencyKey: job.idempotencyKey,
        inputRevision: job.inputRevision,
        inputHash: job.inputHash,
        attempt: job.attempt,
        priorityClass: job.priorityClass,
        fencingToken: job.fencingToken,
        leaseUntil: job.leaseUntil,
    }
}

type OutboxLinkResult = {
    issue?: {
        repositoryId: string
        issueId: string
        issueNodeId?: string | null
        issueNumber: number
        htmlUrl: string
        remoteState?: string | null
    }
    comment?: {
        discussionEntryId: string
        repositoryId: string
        issueId: string
        commentId: string
        sourceOrigin?: string
        lastRemoteHash?: string | null
    }
}

/**
 * @description 出站完成回调的附带效果：把远端 Issue / 评论 id 写回映射表。
 * 同一 Bug × 仓库只保留一条 primary 映射，重复回调按覆盖处理。
 */
function writeOutboxLinks(database: BugDb, eventId: string, result: OutboxLinkResult, now: number): void {
    if (!result.issue && !result.comment) return

    const event = database.select().from(schema.bugEvents).where(eq(schema.bugEvents.eventId, eventId)).get()
    const bugId = event?.bugId ?? null

    if (result.issue && bugId) {
        const issue = result.issue
        const existing = database
            .select()
            .from(schema.githubIssueLinks)
            .where(
                and(
                    eq(schema.githubIssueLinks.bugId, bugId),
                    eq(schema.githubIssueLinks.repositoryId, issue.repositoryId),
                    eq(schema.githubIssueLinks.role, "primary")
                )
            )
            .get()
        if (existing) {
            database
                .update(schema.githubIssueLinks)
                .set({
                    issueId: issue.issueId,
                    issueNodeId: issue.issueNodeId ?? existing.issueNodeId,
                    issueNumber: issue.issueNumber,
                    htmlUrl: issue.htmlUrl,
                    syncState: "synced",
                    remoteState: issue.remoteState ?? existing.remoteState,
                    remoteUpdatedAt: now,
                })
                .where(eq(schema.githubIssueLinks.id, existing.id))
                .run()
        } else {
            database
                .insert(schema.githubIssueLinks)
                .values({
                    id: schema.id(),
                    bugId,
                    repositoryId: issue.repositoryId,
                    issueId: issue.issueId,
                    issueNodeId: issue.issueNodeId ?? null,
                    issueNumber: issue.issueNumber,
                    htmlUrl: issue.htmlUrl,
                    role: "primary",
                    syncState: "synced",
                    remoteState: issue.remoteState ?? "open",
                    remoteUpdatedAt: now,
                    createdAt: now,
                })
                .run()
        }
    }

    if (result.comment) {
        const comment = result.comment
        const existing = database
            .select()
            .from(schema.githubCommentLinks)
            .where(
                and(
                    eq(schema.githubCommentLinks.repositoryId, comment.repositoryId),
                    eq(schema.githubCommentLinks.commentId, comment.commentId)
                )
            )
            .get()
        if (existing) {
            database
                .update(schema.githubCommentLinks)
                .set({
                    discussionEntryId: comment.discussionEntryId,
                    issueId: comment.issueId,
                    lastRemoteHash: comment.lastRemoteHash ?? existing.lastRemoteHash,
                    deletedAt: null,
                })
                .where(
                    and(
                        eq(schema.githubCommentLinks.repositoryId, comment.repositoryId),
                        eq(schema.githubCommentLinks.commentId, comment.commentId)
                    )
                )
                .run()
        } else {
            database
                .insert(schema.githubCommentLinks)
                .values({
                    discussionEntryId: comment.discussionEntryId,
                    repositoryId: comment.repositoryId,
                    issueId: comment.issueId,
                    commentId: comment.commentId,
                    sourceOrigin: comment.sourceOrigin ?? "local",
                    lastRemoteHash: comment.lastRemoteHash ?? null,
                })
                .run()
        }
    }
}

/**
 * @description GitHub Webhook 插件（公开入口 + 内部 worker REST）。
 */
export function bugsPlugin() {
    return new Elysia()
        .post("/api/v1/integrations/github/bug-webhook", async ({ request, set }) => {
            const secret = process.env.BUG_GITHUB_WEBHOOK_SECRET?.trim()
            if (!secret) {
                set.status = 503
                return { success: false as const, code: "UNAVAILABLE", error: "Webhook 未配置" }
            }

            const allowlist = resolveRepositoryAllowlist()
            if (!allowlist.size) {
                set.status = 503
                return { success: false as const, code: "UNAVAILABLE", error: "Webhook 仓库未配置" }
            }

            const declaredLength = Number(request.headers.get("content-length") ?? "")
            if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
                set.status = 413
                return { success: false as const, code: "PAYLOAD_TOO_LARGE", error: "投递内容过大" }
            }

            const signature = request.headers.get(SIGNATURE_HEADER)
            const rawBytes = new Uint8Array(await request.arrayBuffer())
            if (rawBytes.byteLength > MAX_WEBHOOK_BYTES) {
                set.status = 413
                return { success: false as const, code: "PAYLOAD_TOO_LARGE", error: "投递内容过大" }
            }
            if (!verifyGithubSignature(secret, rawBytes, signature)) {
                set.status = 401
                return { success: false as const, code: "UNAUTHORIZED", error: "签名校验失败" }
            }

            const event = request.headers.get("x-github-event")?.trim()
            const deliveryId = request.headers.get("x-github-delivery")?.trim()
            if (!event || !deliveryId || deliveryId.length > 200) {
                set.status = 400
                return { success: false as const, code: "VALIDATION_FAILED", error: "缺少 GitHub 投递标识" }
            }

            const rawText = new TextDecoder().decode(rawBytes)
            let parsed: unknown
            try {
                parsed = JSON.parse(rawText)
            } catch {
                set.status = 400
                return { success: false as const, code: "VALIDATION_FAILED", error: "投递内容不是合法 JSON" }
            }

            const payload = toRecord(parsed)
            if (!payload) {
                set.status = 400
                return { success: false as const, code: "VALIDATION_FAILED", error: "投递内容不是合法 JSON" }
            }

            const repositoryId = idOf(toRecord(payload.repository)?.id)
            if (!repositoryId || !allowlist.has(repositoryId)) {
                // 非目标仓库：签名合法但不在白名单，明确忽略而不是按成功消费
                return { success: true as const, accepted: false, reason: "repository_not_allowed" }
            }

            const existing = db
                .select({ deliveryId: schema.githubWebhookInbox.deliveryId })
                .from(schema.githubWebhookInbox)
                .where(eq(schema.githubWebhookInbox.deliveryId, deliveryId))
                .get()
            if (existing) return { success: true as const, accepted: true, duplicate: true }

            try {
                db.insert(schema.githubWebhookInbox)
                    .values({
                        deliveryId,
                        event,
                        action: typeof payload.action === "string" ? payload.action : null,
                        repositoryId,
                        installationId: idOf(toRecord(payload.installation)?.id),
                        payloadPrivate: rawText,
                        processingState: "pending",
                    })
                    .run()
            } catch (error) {
                // 并发重投可能让主键冲突；能查到记录就按幂等成功处理，否则如实报 503
                const raced = db
                    .select({ deliveryId: schema.githubWebhookInbox.deliveryId })
                    .from(schema.githubWebhookInbox)
                    .where(eq(schema.githubWebhookInbox.deliveryId, deliveryId))
                    .get()
                if (raced) return { success: true as const, accepted: true, duplicate: true }

                console.error("GitHub webhook 落库失败", error)
                set.status = 503
                return { success: false as const, code: "UNAVAILABLE", error: "投递暂不可用" }
            }

            return { success: true as const, accepted: true }
        })
        .post("/internal/bug-pipeline/claim", ({ request, body, set }) => {
            const auth = authorizeWorker(request)
            if (!auth.ok) {
                set.status = auth.status
                return auth.body
            }
            const payload = toRecord(body)
            if (!payload) return workerFail(set, 400, "invalid_body")
            const workerId = requiredString(payload, "workerId")
            if (!workerId) return workerFail(set, 400, "missing_worker_id")

            try {
                const jobs = claimJob(db, workerId, {
                    kinds: optionalStringArray(payload, "kinds"),
                    limit: optionalInteger(payload, "limit"),
                    leaseMs: optionalInteger(payload, "leaseMs"),
                })
                return { ok: true as const, jobs: jobs.map(toClaimedJob) }
            } catch (error) {
                return respondDomainError(set, error)
            }
        })
        .post("/internal/bug-pipeline/heartbeat", ({ request, body, set }) => {
            const auth = authorizeWorker(request)
            if (!auth.ok) {
                set.status = auth.status
                return auth.body
            }
            const payload = toRecord(body)
            if (!payload) return workerFail(set, 400, "invalid_body")
            const jobId = requiredString(payload, "jobId", 64)
            const workerId = requiredString(payload, "workerId")
            const fencingToken = optionalInteger(payload, "fencingToken")
            if (!jobId || !workerId || fencingToken === undefined) return workerFail(set, 400, "invalid_body")

            try {
                const renewed = heartbeatJob(db, jobId, workerId, fencingToken, optionalInteger(payload, "leaseMs") ?? DEFAULT_LEASE_MS)
                if (!renewed) return workerFail(set, 409, "lease_lost")
                return { ok: true as const }
            } catch (error) {
                return respondDomainError(set, error)
            }
        })
        .post("/internal/bug-pipeline/complete", ({ request, body, set }) => {
            const auth = authorizeWorker(request)
            if (!auth.ok) {
                set.status = auth.status
                return auth.body
            }
            const payload = toRecord(body)
            if (!payload) return workerFail(set, 400, "invalid_body")
            const jobId = requiredString(payload, "jobId", 64)
            const workerId = requiredString(payload, "workerId")
            const fencingToken = optionalInteger(payload, "fencingToken")
            if (!jobId || !workerId || fencingToken === undefined) return workerFail(set, 400, "invalid_body")

            const job = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, jobId)).get()
            if (!job) return workerFail(set, 404, "job_not_found")
            if (job.leaseOwner !== workerId || job.fencingToken !== fencingToken || job.state !== "running") {
                return workerFail(set, 409, "lease_lost")
            }

            const result = toRecord(payload.result) ?? {}
            try {
                let applied: ReturnType<typeof applyProposal> | null = null
                let resultRef = typeof result.resultRef === "string" ? result.resultRef : null
                if (result.proposal) {
                    // applyProposal 在自己的事务内重读 fencing 并写 Bug / 事件 / outbox，再推进 Submission
                    applied = applyProposal(db, result.proposal as BugProposal, job, { kind: "worker", workerId })
                    resultRef = `submission:${applied.submissionId}`
                }
                const completed = completeJob(db, jobId, workerId, fencingToken, resultRef)
                if (!completed) return workerFail(set, 409, "lease_lost")
                return { ok: true as const, applied }
            } catch (error) {
                return respondDomainError(set, error)
            }
        })
        .post("/internal/bug-pipeline/fail", ({ request, body, set }) => {
            const auth = authorizeWorker(request)
            if (!auth.ok) {
                set.status = auth.status
                return auth.body
            }
            const payload = toRecord(body)
            if (!payload) return workerFail(set, 400, "invalid_body")
            const jobId = requiredString(payload, "jobId", 64)
            const workerId = requiredString(payload, "workerId")
            const fencingToken = optionalInteger(payload, "fencingToken")
            if (!jobId || !workerId || fencingToken === undefined) return workerFail(set, 400, "invalid_body")

            const rawError = typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error ?? "unknown")
            try {
                const result = failJob(db, {
                    jobId,
                    workerId,
                    fencingToken,
                    error: rawError.slice(0, 2000),
                    retry: payload.retry !== false,
                    maxAttempts: optionalInteger(payload, "maxAttempts"),
                })
                return { ok: true as const, state: result.state, retryAt: result.retryAt }
            } catch (error) {
                return respondDomainError(set, error)
            }
        })
        .get("/internal/bug-pipeline/outbox/read", ({ request, set }) => {
            const auth = authorizeWorker(request)
            if (!auth.ok) {
                set.status = auth.status
                return auth.body
            }
            const url = new URL(request.url)
            const requestedState = (url.searchParams.get("state") ?? "queued").trim()
            const state =
                OUTBOX_RESULT_STATES.has(requestedState as BugOutboxState) || requestedState === "queued" || requestedState === "sending"
            if (!state) return workerFail(set, 400, "invalid_state")
            const limit = clampInt(Number(url.searchParams.get("limit") ?? "10") || 10, 1, 100)

            const now = Date.now()
            const due = or(isNull(schema.bugOutbox.nextAttemptAt), lte(schema.bugOutbox.nextAttemptAt, now))
            const timed = requestedState === "queued" || requestedState === "retry_wait"
            const where = timed
                ? and(eq(schema.bugOutbox.state, requestedState as BugOutboxState), due)
                : eq(schema.bugOutbox.state, requestedState as BugOutboxState)

            const rows = db
                .select()
                .from(schema.bugOutbox)
                .where(where)
                .orderBy(asc(schema.bugOutbox.nextAttemptAt), asc(schema.bugOutbox.createdAt))
                .limit(limit)
                .all()

            const eventIds = [...new Set(rows.map(row => row.eventId))]
            const events = eventIds.length
                ? db.select().from(schema.bugEvents).where(inArray(schema.bugEvents.eventId, eventIds)).all()
                : []
            const eventById = new Map(events.map(event => [event.eventId, event]))
            const bugIds = [...new Set(events.map(event => event.bugId).filter((bugId): bugId is string => Boolean(bugId)))]
            const bugs = bugIds.length ? db.select().from(schema.bugs).where(inArray(schema.bugs.id, bugIds)).all() : []
            const bugById = new Map(bugs.map(bug => [bug.id, bug]))

            const items = rows.map(row => {
                const event = eventById.get(row.eventId)
                const bug = event?.bugId ? bugById.get(event.bugId) : undefined
                return {
                    eventId: row.eventId,
                    operation: row.operation,
                    targetMapping: row.targetMapping,
                    sourceRevision: row.sourceRevision,
                    payloadHash: row.payloadHash,
                    state: row.state,
                    attempt: row.attempt,
                    nextAttemptAt: row.nextAttemptAt,
                    lastError: row.lastError,
                    payload: {
                        eventKind: event?.kind ?? null,
                        bugId: event?.bugId ?? null,
                        submissionId: event?.submissionId ?? null,
                        eventPayload: event?.payloadSafe ?? null,
                        bug: bug ?? null,
                    },
                }
            })
            return { ok: true as const, items }
        })
        .post("/internal/bug-pipeline/outbox/complete", ({ request, body, set }) => {
            const auth = authorizeWorker(request)
            if (!auth.ok) {
                set.status = auth.status
                return auth.body
            }
            const payload = toRecord(body)
            if (!payload) return workerFail(set, 400, "invalid_body")
            const eventId = requiredString(payload, "eventId", 64)
            const operation = requiredString(payload, "operation", 100)
            if (!eventId || !operation) return workerFail(set, 400, "invalid_body")

            const targetMapping = requiredString(payload, "targetMapping", 300)
            const result = toRecord(payload.result) ?? {}
            const declared = typeof result.state === "string" ? (result.state as BugOutboxState) : "delivered"
            if (!OUTBOX_RESULT_STATES.has(declared)) return workerFail(set, 400, "invalid_state")

            const base = and(eq(schema.bugOutbox.eventId, eventId), eq(schema.bugOutbox.operation, operation))
            const where = targetMapping ? and(base, eq(schema.bugOutbox.targetMapping, targetMapping)) : base
            const rows = db.select().from(schema.bugOutbox).where(where).all()
            if (!rows.length) return workerFail(set, 404, "outbox_not_found")

            const now = Date.now()
            try {
                db.transaction(tx => {
                    writeOutboxLinks(tx, eventId, result as OutboxLinkResult, now)
                    for (const row of rows) {
                        tx.update(schema.bugOutbox)
                            .set({
                                state: declared,
                                attempt: row.attempt + 1,
                                nextAttemptAt: declared === "retry_wait" ? (optionalNumber(result, "retryAt") ?? now + 60_000) : null,
                                remoteResult: toRecord(result.remoteResult) ?? row.remoteResult ?? null,
                                lastError: typeof result.lastError === "string" ? result.lastError.slice(0, 2000) : null,
                            })
                            .where(
                                and(
                                    eq(schema.bugOutbox.eventId, eventId),
                                    eq(schema.bugOutbox.operation, operation),
                                    eq(schema.bugOutbox.targetMapping, row.targetMapping)
                                )
                            )
                            .run()
                    }
                })
                return { ok: true as const }
            } catch (error) {
                return respondDomainError(set, error)
            }
        })
        .post("/internal/bug-pipeline/inbox/write", ({ request, body, set }) => {
            const auth = authorizeWorker(request)
            if (!auth.ok) {
                set.status = auth.status
                return auth.body
            }
            const payload = toRecord(body)
            if (!payload) return workerFail(set, 400, "invalid_body")
            const deliveryId = requiredString(payload, "deliveryId", 200)
            const event = requiredString(payload, "event", 100)
            if (!deliveryId || !event || payload.payload === undefined) return workerFail(set, 400, "invalid_body")

            const raw = typeof payload.payload === "string" ? payload.payload : JSON.stringify(payload.payload)
            if (raw.length > MAX_WORKER_BODY_BYTES) return workerFail(set, 413, "payload_too_large")

            const action = requiredString(payload, "action", 100)
            const repositoryId = requiredString(payload, "repositoryId", 100)
            try {
                const inserted = db
                    .insert(schema.githubWebhookInbox)
                    .values({
                        deliveryId,
                        event,
                        action,
                        repositoryId,
                        payloadPrivate: raw,
                        processingState: "pending",
                        receivedAt: Date.now(),
                    })
                    .onConflictDoNothing({ target: schema.githubWebhookInbox.deliveryId })
                    .returning({ deliveryId: schema.githubWebhookInbox.deliveryId })
                    .all()
                return { ok: true as const, duplicate: inserted.length === 0 }
            } catch (error) {
                return respondDomainError(set, error)
            }
        })
        .get("/internal/bug-pipeline/sync/active-mappings", ({ request, set }) => {
            const auth = authorizeWorker(request)
            if (!auth.ok) {
                set.status = auth.status
                return auth.body
            }
            const url = new URL(request.url)
            const limit = clampInt(Number(url.searchParams.get("limit") ?? "200") || 200, 1, 500)

            const rows = db
                .select()
                .from(schema.githubIssueLinks)
                .where(eq(schema.githubIssueLinks.role, "primary"))
                .orderBy(desc(schema.githubIssueLinks.createdAt))
                .limit(limit)
                .all()
            return {
                ok: true as const,
                mappings: rows.map(row => ({
                    issueLinkId: row.id,
                    bugId: row.bugId,
                    repositoryId: row.repositoryId,
                    issueId: row.issueId,
                    issueNumber: row.issueNumber,
                    htmlUrl: row.htmlUrl,
                    remoteState: row.remoteState,
                    syncState: row.syncState,
                })),
            }
        })
        .post("/internal/bug-pipeline/sync/report-drift", ({ request, body, set }) => {
            const auth = authorizeWorker(request)
            if (!auth.ok) {
                set.status = auth.status
                return auth.body
            }
            const payload = toRecord(body)
            if (!payload) return workerFail(set, 400, "invalid_body")
            const issueLinkId = requiredString(payload, "issueLinkId", 64)
            const driftType = requiredString(payload, "driftType", 100)
            if (!issueLinkId || !driftType) return workerFail(set, 400, "invalid_body")

            const link = db.select().from(schema.githubIssueLinks).where(eq(schema.githubIssueLinks.id, issueLinkId)).get()
            if (!link) return workerFail(set, 404, "issue_link_not_found")

            const now = Date.now()
            try {
                db.transaction(tx => {
                    tx.insert(schema.bugEvents)
                        .values({
                            eventId: schema.id(),
                            bugId: link.bugId,
                            kind: "github_drift_detected",
                            actor: { kind: "worker", id: requiredString(payload, "workerId") ?? "github-bridge" },
                            payloadSafe: {
                                issueLinkId,
                                driftType,
                                expected: payload.expected ?? null,
                                actual: payload.actual ?? null,
                            },
                            createdAt: now,
                        })
                        .run()
                    tx.update(schema.githubIssueLinks)
                        .set({ syncState: "conflict" })
                        .where(eq(schema.githubIssueLinks.id, issueLinkId))
                        .run()
                })
                return { ok: true as const }
            } catch (error) {
                return respondDomainError(set, error)
            }
        })
}
