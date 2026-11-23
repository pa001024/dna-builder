import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { createHmac } from "node:crypto"
import { eq } from "drizzle-orm"
import { createSubmission } from "../bugs"
import { anonymousActor, createTestDb, GAME_ID, seedBug } from "../bugs/test-helpers"
import * as realSchema from "../db/schema"

const { db: testDb } = createTestDb()

/** 测试可切换的落库失败注入。 */
const dbState = { failInsert: false }

const dbProxy = new Proxy({} as typeof testDb, {
    get(_target, prop) {
        if (dbState.failInsert && prop === "insert") {
            return () => {
                throw new Error("db unavailable")
            }
        }
        const value = (testDb as unknown as Record<string | symbol, unknown>)[prop]
        return typeof value === "function" ? value.bind(testDb) : value
    },
})

mock.module("../db", () => ({ db: dbProxy, schema: realSchema }))

const { bugsPlugin, verifyGithubSignature } = await import("./bugs")

const SECRET = "test-webhook-secret"
const REPOSITORY_ID = "123456789"
const WORKER_TOKEN = "test-token"

process.env.BUG_GITHUB_WEBHOOK_SECRET = SECRET
process.env.GITHUB_BUG_REPOSITORY_ID = REPOSITORY_ID
process.env.BUG_WORKER_TOKEN = WORKER_TOKEN

const app = bugsPlugin()

/** 计算 GitHub 签名（对原始字节）。 */
function sign(bytes: Uint8Array, secret = SECRET): string {
    return `sha256=${createHmac("sha256", secret).update(bytes).digest("hex")}`
}

type DeliveryOptions = {
    payload?: string
    event?: string | null
    delivery?: string | null
    signature?: string | null
}

/**
 * @description 投递一个 GitHub webhook。
 */
function deliver(options: DeliveryOptions = {}) {
    const payload =
        options.payload ?? JSON.stringify({ action: "labeled", repository: { id: Number(REPOSITORY_ID) }, installation: { id: 77 } })
    const bytes = new TextEncoder().encode(payload)

    const headers: Record<string, string> = { "content-type": "application/json" }
    const event = options.event === undefined ? "issues" : options.event
    const delivery = options.delivery === undefined ? `delivery-${Math.floor(Math.random() * 1e9)}` : options.delivery
    if (event) headers["x-github-event"] = event
    if (delivery) headers["x-github-delivery"] = delivery
    const signature = options.signature === undefined ? sign(bytes) : options.signature
    if (signature) headers["x-hub-signature-256"] = signature

    return app.handle(new Request("http://localhost/api/v1/integrations/github/bug-webhook", { method: "POST", headers, body: bytes }))
}

beforeEach(() => {
    dbState.failInsert = false
    process.env.BUG_GITHUB_WEBHOOK_SECRET = SECRET
    process.env.GITHUB_BUG_REPOSITORY_ID = REPOSITORY_ID
    process.env.BUG_WORKER_TOKEN = WORKER_TOKEN
})

afterEach(() => {
    dbState.failInsert = false
})

describe("verifyGithubSignature", () => {
    const body = new TextEncoder().encode(`{"text":"结算 😀 卡住"}`)

    it("接受正确签名", () => {
        expect(verifyGithubSignature(SECRET, body, sign(body))).toBe(true)
    })

    it("拒绝错误签名、缺失签名与非 sha256 方案", () => {
        expect(verifyGithubSignature(SECRET, body, sign(body, "other"))).toBe(false)
        expect(verifyGithubSignature(SECRET, body, null)).toBe(false)
        expect(verifyGithubSignature(SECRET, body, "sha1=abc")).toBe(false)
        expect(verifyGithubSignature(SECRET, body, "sha256=not-hex")).toBe(false)
    })

    it("emoji 按原始 UTF-8 字节比对", () => {
        // 与 GitHub 相同的字节级 HMAC：不同编码（如 UTF-16）得到不同签名
        const utf16 = new Uint8Array(Buffer.from(new TextDecoder().decode(body), "utf16le"))
        expect(verifyGithubSignature(SECRET, body, sign(body))).toBe(true)
        expect(verifyGithubSignature(SECRET, utf16, sign(body))).toBe(false)
    })
})

describe("POST /api/v1/integrations/github/bug-webhook", () => {
    it("签名正确时持久化 Inbox 并 ACK", async () => {
        const delivery = `valid-${Date.now()}`
        const response = await deliver({ delivery })
        expect(response.status).toBe(200)

        const body = (await response.json()) as Record<string, unknown>
        expect(body.accepted).toBe(true)

        const row = testDb.select().from(realSchema.githubWebhookInbox).where(eq(realSchema.githubWebhookInbox.deliveryId, delivery)).get()
        expect(row?.event).toBe("issues")
        expect(row?.action).toBe("labeled")
        expect(row?.repositoryId).toBe(REPOSITORY_ID)
        expect(row?.installationId).toBe("77")
        expect(row?.processingState).toBe("pending")
        expect(row?.payloadPrivate).toContain("labeled")
    })

    it("错误签名返回 401 且不落库", async () => {
        const delivery = `bad-${Date.now()}`
        const response = await deliver({ delivery, signature: sign(new TextEncoder().encode("{}"), "wrong-secret") })
        expect(response.status).toBe(401)

        const row = testDb.select().from(realSchema.githubWebhookInbox).where(eq(realSchema.githubWebhookInbox.deliveryId, delivery)).get()
        expect(row).toBeUndefined()
    })

    it("缺少签名头返回 401", async () => {
        expect((await deliver({ signature: null })).status).toBe(401)
    })

    it("重复 deliveryId 幂等：返回 200 且只落一条", async () => {
        const delivery = `dup-${Date.now()}`
        const first = await deliver({ delivery })
        const second = await deliver({ delivery })
        expect(first.status).toBe(200)
        expect(second.status).toBe(200)

        const secondBody = (await second.json()) as Record<string, unknown>
        expect(secondBody.duplicate).toBe(true)

        const rows = testDb.select().from(realSchema.githubWebhookInbox).where(eq(realSchema.githubWebhookInbox.deliveryId, delivery)).all()
        expect(rows).toHaveLength(1)
    })

    it("数据库不可写时返回 503，不做假 ACK", async () => {
        dbState.failInsert = true
        const response = await deliver({ delivery: `db-${Date.now()}` })
        expect(response.status).toBe(503)
        const body = (await response.json()) as Record<string, unknown>
        expect(body.success).toBe(false)
    })

    it("非白名单仓库返回 200 但明确忽略", async () => {
        const payload = JSON.stringify({ action: "opened", repository: { id: 999 } })
        const response = await deliver({ payload, delivery: `other-${Date.now()}` })
        expect(response.status).toBe(200)

        const body = (await response.json()) as Record<string, unknown>
        expect(body.accepted).toBe(false)
        expect(body.reason).toBe("repository_not_allowed")
    })

    it("缺少事件或投递标识返回 400", async () => {
        expect((await deliver({ event: null })).status).toBe(400)
        expect((await deliver({ delivery: null })).status).toBe(400)
    })

    it("签名正确但内容不是 JSON 时返回 400", async () => {
        expect((await deliver({ payload: "not-json" })).status).toBe(400)
    })

    it("正文超过 1 MiB 时先拒绝，不缓冲超大包", async () => {
        const payload = "x".repeat(1024 * 1024 + 1)
        expect((await deliver({ payload })).status).toBe(413)
    })

    it("未配置 secret 时返回 503", async () => {
        delete process.env.BUG_GITHUB_WEBHOOK_SECRET
        expect((await deliver()).status).toBe(503)
    })

    it("未配置仓库白名单时返回 503", async () => {
        delete process.env.GITHUB_BUG_REPOSITORY_ID
        expect((await deliver()).status).toBe(503)
    })
})

const INTERNAL_ROUTES = [
    { method: "POST" as const, path: "/internal/bug-pipeline/claim" },
    { method: "POST" as const, path: "/internal/bug-pipeline/heartbeat" },
    { method: "POST" as const, path: "/internal/bug-pipeline/complete" },
    { method: "POST" as const, path: "/internal/bug-pipeline/fail" },
    { method: "GET" as const, path: "/internal/bug-pipeline/outbox/read" },
    { method: "POST" as const, path: "/internal/bug-pipeline/outbox/complete" },
    { method: "POST" as const, path: "/internal/bug-pipeline/inbox/write" },
    { method: "GET" as const, path: "/internal/bug-pipeline/sync/active-mappings" },
    { method: "POST" as const, path: "/internal/bug-pipeline/sync/report-drift" },
]

type WorkerJob = { id: string; kind: string; idempotencyKey: string; inputHash: string; fencingToken: number }

/** 内部 worker 请求：默认可通过鉴权，传 `token: null` 表示不带令牌。 */
function workerFetch(path: string, options: { method?: "GET" | "POST"; body?: unknown; token?: string | null } = {}) {
    const headers: Record<string, string> = { "content-type": "application/json" }
    const token = options.token === undefined ? WORKER_TOKEN : options.token
    if (token) headers["x-worker-token"] = token
    const method = options.method ?? "POST"
    return app.handle(
        new Request(`http://localhost${path}`, {
            method,
            headers,
            body: method === "GET" || options.body === undefined ? undefined : JSON.stringify(options.body),
        })
    )
}

async function claimJobs(workerId: string): Promise<WorkerJob[]> {
    const response = await workerFetch("/internal/bug-pipeline/claim", {
        body: { workerId, kinds: ["process_submission"], limit: 8 },
    })
    const body = (await response.json()) as { ok: boolean; jobs: WorkerJob[] }
    return body.jobs
}

function findJob(jobs: WorkerJob[], submissionId: string): WorkerJob {
    const job = jobs.find(item => item.idempotencyKey.includes(submissionId))
    if (!job) throw new Error("未领到目标任务")
    return job
}

const PROPOSAL_TEXT = "结算页面卡住，无法继续。重启后仍然卡住。"
const PROPOSAL_QUOTE = "结算页面卡住"

function processProposal(submissionId: string, inputHash: string) {
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
                evidenceRefs: [
                    { type: "text", versionId: `${submissionId}:1`, start: 0, end: PROPOSAL_QUOTE.length, quote: PROPOSAL_QUOTE },
                ],
                duplicate: { decision: "unknown", candidateBugId: null, reasons: [], contradictions: [] },
                missingInformation: [],
            },
        ],
        clarificationQuestions: [],
    }
}

describe("/internal/bug-pipeline 鉴权", () => {
    it("每个端点都拒绝缺失或错误的 worker token", async () => {
        for (const route of INTERNAL_ROUTES) {
            const missing = await workerFetch(route.path, { method: route.method, body: {}, token: null })
            expect(missing.status).toBe(401)
            const wrong = await workerFetch(route.path, { method: route.method, body: {}, token: "wrong-token" })
            expect(wrong.status).toBe(401)
        }
    })

    it("支持 Authorization: Worker 头", async () => {
        const response = await app.handle(
            new Request("http://localhost/internal/bug-pipeline/sync/active-mappings", {
                headers: { authorization: `Worker ${WORKER_TOKEN}` },
            })
        )
        expect(response.status).toBe(200)
    })

    it("未配置 BUG_WORKER_TOKEN 时所有端点返回 503", async () => {
        delete process.env.BUG_WORKER_TOKEN
        for (const route of INTERNAL_ROUTES) {
            const response = await workerFetch(route.path, { method: route.method, body: {} })
            expect(response.status).toBe(503)
            expect(((await response.json()) as { reason: string }).reason).toBe("worker_unavailable")
        }
    })
})

describe("/internal/bug-pipeline claim / heartbeat / complete / fail", () => {
    it("claim 递增 fencing，活跃租约不会被重复领取，过期后可恢复", async () => {
        const receipt = createSubmission(testDb, { gameId: GAME_ID, rawTextPrivate: `结算页卡住 ${Math.random()}` }, anonymousActor, {
            now: Date.now(),
        })
        const jobs = await claimJobs("worker-claim")
        const job = findJob(jobs, receipt.submissionId)
        expect(job.fencingToken).toBe(1)
        expect(typeof job.inputHash).toBe("string")

        const second = await claimJobs("worker-claim-2")
        expect(second.some(item => item.id === job.id)).toBe(false)

        testDb
            .update(realSchema.bugJobs)
            .set({ leaseUntil: Date.now() - 1_000 })
            .where(eq(realSchema.bugJobs.id, job.id))
            .run()
        const reclaimed = findJob(await claimJobs("worker-claim-3"), receipt.submissionId)
        expect(reclaimed.id).toBe(job.id)
        expect(reclaimed.fencingToken).toBe(2)
    })

    it("heartbeat / complete 校验 fencing，完成后写入 resultRef", async () => {
        const receipt = createSubmission(testDb, { gameId: GAME_ID, rawTextPrivate: `心跳校验 ${Math.random()}` }, anonymousActor, {
            now: Date.now(),
        })
        const job = findJob(await claimJobs("worker-hb"), receipt.submissionId)

        const renewed = await workerFetch("/internal/bug-pipeline/heartbeat", {
            body: { jobId: job.id, workerId: "worker-hb", fencingToken: job.fencingToken },
        })
        expect(renewed.status).toBe(200)

        const stale = await workerFetch("/internal/bug-pipeline/heartbeat", {
            body: { jobId: job.id, workerId: "worker-hb", fencingToken: job.fencingToken - 1 },
        })
        expect(stale.status).toBe(409)
        expect(((await stale.json()) as { reason: string }).reason).toBe("lease_lost")

        const completed = await workerFetch("/internal/bug-pipeline/complete", {
            body: { jobId: job.id, workerId: "worker-hb", fencingToken: job.fencingToken, result: { resultRef: "done" } },
        })
        expect(completed.status).toBe(200)
        const row = testDb.select().from(realSchema.bugJobs).where(eq(realSchema.bugJobs.id, job.id)).get()!
        expect(row.state).toBe("completed")
        expect(row.resultRef).toBe("done")

        const again = await workerFetch("/internal/bug-pipeline/complete", {
            body: { jobId: job.id, workerId: "worker-hb", fencingToken: job.fencingToken, result: {} },
        })
        expect(again.status).toBe(409)
    })

    it("complete 携带 Proposal 时应用并推进 Submission", async () => {
        const receipt = createSubmission(testDb, { gameId: GAME_ID, rawTextPrivate: PROPOSAL_TEXT }, anonymousActor, {
            now: Date.now(),
        })
        const job = findJob(await claimJobs("worker-proposal"), receipt.submissionId)

        const response = await workerFetch("/internal/bug-pipeline/complete", {
            body: {
                jobId: job.id,
                workerId: "worker-proposal",
                fencingToken: job.fencingToken,
                result: { proposal: processProposal(receipt.submissionId, job.inputHash) },
            },
        })
        expect(response.status).toBe(200)

        const body = (await response.json()) as { ok: boolean; applied: { createdBugIds: string[]; submissionState: string } }
        expect(body.ok).toBe(true)
        expect(body.applied.createdBugIds).toHaveLength(1)
        expect(body.applied.submissionState).toBe("processed")

        const bug = testDb.select().from(realSchema.bugs).where(eq(realSchema.bugs.id, body.applied.createdBugIds[0]!)).get()!
        expect(bug.primaryCategory).toBe("ui")
        expect(bug.tags).toContain("category.ui")

        const submission = testDb
            .select()
            .from(realSchema.bugSubmissions)
            .where(eq(realSchema.bugSubmissions.id, receipt.submissionId))
            .get()!
        expect(submission.state).toBe("processed")

        const jobRow = testDb.select().from(realSchema.bugJobs).where(eq(realSchema.bugJobs.id, job.id)).get()!
        expect(jobRow.state).toBe("completed")
        expect(jobRow.resultRef).toBe(`submission:${receipt.submissionId}`)
    })

    it("Proposal 无效时返回 VALIDATION_FAILED 且任务保持运行", async () => {
        const receipt = createSubmission(testDb, { gameId: GAME_ID, rawTextPrivate: `无效建议 ${Math.random()}` }, anonymousActor, {
            now: Date.now(),
        })
        const job = findJob(await claimJobs("worker-bad-proposal"), receipt.submissionId)
        const proposal = processProposal(receipt.submissionId, "wrong-hash")

        const response = await workerFetch("/internal/bug-pipeline/complete", {
            body: { jobId: job.id, workerId: "worker-bad-proposal", fencingToken: job.fencingToken, result: { proposal } },
        })
        expect(response.status).toBe(400)
        const body = (await response.json()) as { code: string }
        expect(body.code).toBe("VALIDATION_FAILED")

        const jobRow = testDb.select().from(realSchema.bugJobs).where(eq(realSchema.bugJobs.id, job.id)).get()!
        expect(jobRow.state).toBe("running")
    })

    it("fail 按 fencing 校验并安排重试", async () => {
        const receipt = createSubmission(testDb, { gameId: GAME_ID, rawTextPrivate: `失败重试 ${Math.random()}` }, anonymousActor, {
            now: Date.now(),
        })
        const job = findJob(await claimJobs("worker-fail"), receipt.submissionId)

        const stale = await workerFetch("/internal/bug-pipeline/fail", {
            body: { jobId: job.id, workerId: "worker-fail", fencingToken: job.fencingToken - 1, error: "boom" },
        })
        expect(stale.status).toBe(409)

        const response = await workerFetch("/internal/bug-pipeline/fail", {
            body: { jobId: job.id, workerId: "worker-fail", fencingToken: job.fencingToken, error: "boom" },
        })
        expect(response.status).toBe(200)
        const body = (await response.json()) as { ok: boolean; state: string; retryAt: number }
        expect(body.state).toBe("retry_wait")
        expect(body.retryAt).toBeGreaterThan(Date.now() - 1_000)
    })
})

describe("/internal/bug-pipeline outbox / inbox / sync", () => {
    it("outbox/read 下发待发送项与关联 Bug 快照", async () => {
        const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
        const bug = seedBug(testDb, { id: `bug-outbox-${stamp}`, displayKey: `BUG-O${stamp}`, title: "出站快照" })
        const eventId = `event-outbox-${stamp}`
        testDb
            .insert(realSchema.bugEvents)
            .values({ eventId, bugId: bug.id, kind: "bug_created", payloadSafe: { partId: "p1" }, createdAt: Date.now() })
            .run()
        testDb
            .insert(realSchema.bugOutbox)
            .values({
                eventId,
                operation: "create_issue",
                targetMapping: `repo:${stamp}`,
                state: "queued",
                nextAttemptAt: 0,
                createdAt: Date.now(),
            })
            .run()

        const response = await workerFetch("/internal/bug-pipeline/outbox/read?state=queued&limit=100", { method: "GET" })
        expect(response.status).toBe(200)
        const body = (await response.json()) as { items: Array<Record<string, any>> }
        const item = body.items.find(entry => entry.eventId === eventId)
        expect(item).toBeDefined()
        expect(item!.operation).toBe("create_issue")
        expect(item!.payload.bugId).toBe(bug.id)
        expect(item!.payload.bug.title).toBe("出站快照")
        expect(item!.payload.eventKind).toBe("bug_created")
    })

    it("outbox/complete 更新状态并写入 Issue 映射", async () => {
        const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
        const bug = seedBug(testDb, { id: `bug-sync-${stamp}`, displayKey: `BUG-S${stamp}`, title: "同步映射" })
        const eventId = `event-sync-${stamp}`
        const repositoryId = `repo-${stamp}`
        testDb.insert(realSchema.bugEvents).values({ eventId, bugId: bug.id, kind: "bug_created", createdAt: Date.now() }).run()
        testDb
            .insert(realSchema.bugOutbox)
            .values({
                eventId,
                operation: "create_issue",
                targetMapping: `repo:${repositoryId}`,
                state: "queued",
                nextAttemptAt: 0,
                createdAt: Date.now(),
            })
            .run()

        const response = await workerFetch("/internal/bug-pipeline/outbox/complete", {
            body: {
                eventId,
                operation: "create_issue",
                result: {
                    state: "delivered",
                    issue: {
                        repositoryId,
                        issueId: `issue-${stamp}`,
                        issueNumber: 42,
                        htmlUrl: "https://github.com/x/y/issues/42",
                    },
                },
            },
        })
        expect(response.status).toBe(200)

        const outbox = testDb.select().from(realSchema.bugOutbox).where(eq(realSchema.bugOutbox.eventId, eventId)).get()!
        expect(outbox.state).toBe("delivered")
        expect(outbox.attempt).toBe(1)

        const link = testDb.select().from(realSchema.githubIssueLinks).where(eq(realSchema.githubIssueLinks.bugId, bug.id)).get()!
        expect(link.repositoryId).toBe(repositoryId)
        expect(link.issueNumber).toBe(42)
        expect(link.syncState).toBe("synced")

        const mappings = await workerFetch("/internal/bug-pipeline/sync/active-mappings", { method: "GET" })
        const mappingBody = (await mappings.json()) as { mappings: Array<Record<string, unknown>> }
        expect(mappingBody.mappings.some(item => item.bugId === bug.id)).toBe(true)

        const drift = await workerFetch("/internal/bug-pipeline/sync/report-drift", {
            body: {
                issueLinkId: link.id,
                driftType: "state_mismatch",
                expected: "open",
                actual: "closed",
                workerId: "bridge-test",
            },
        })
        expect(drift.status).toBe(200)

        const after = testDb.select().from(realSchema.githubIssueLinks).where(eq(realSchema.githubIssueLinks.id, link.id)).get()!
        expect(after.syncState).toBe("conflict")

        const driftEvent = testDb
            .select()
            .from(realSchema.bugEvents)
            .where(eq(realSchema.bugEvents.bugId, bug.id))
            .all()
            .find(event => event.kind === "github_drift_detected")
        expect(driftEvent).toBeDefined()
        expect(driftEvent!.payloadSafe?.driftType).toBe("state_mismatch")
    })

    it("inbox/write 按 deliveryId 去重", async () => {
        const deliveryId = `worker-dup-${Date.now()}`
        const first = await workerFetch("/internal/bug-pipeline/inbox/write", {
            body: { deliveryId, event: "issues", action: "opened", repositoryId: REPOSITORY_ID, payload: { action: "opened" } },
        })
        expect(first.status).toBe(200)
        expect(((await first.json()) as { duplicate: boolean }).duplicate).toBe(false)

        const second = await workerFetch("/internal/bug-pipeline/inbox/write", {
            body: { deliveryId, event: "issues", action: "opened", repositoryId: REPOSITORY_ID, payload: { action: "opened" } },
        })
        expect(second.status).toBe(200)
        expect(((await second.json()) as { duplicate: boolean }).duplicate).toBe(true)

        const rows = testDb
            .select()
            .from(realSchema.githubWebhookInbox)
            .where(eq(realSchema.githubWebhookInbox.deliveryId, deliveryId))
            .all()
        expect(rows).toHaveLength(1)
        expect(rows[0]!.processingState).toBe("pending")
    })
})
