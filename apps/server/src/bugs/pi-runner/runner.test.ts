import { describe, expect, it } from "bun:test"
import { eq } from "drizzle-orm"
import * as schema from "../../db/schema"
import { claimJob, enqueueJob } from "../jobs"
import { createTestDb, seedSubmission, type TestDb } from "../test-helpers"
import {
    buildAgentOptions,
    type CreateAgentInput,
    type PiAgentLike,
    type PiAgentStateLike,
    type PiModelLike,
    type PiStreamFn,
} from "./agent"
import { type PiRunnerConfig, PiRunnerError } from "./config"
import { createInMemoryChannelPair, JsonLineChannel, type PiResultMessage, type PiRunMessage } from "./proposal-io"
import { type ChildProcessHandle, runChildSession, runJobOnce, type SpawnChildFn } from "./runner"

const MODEL: PiModelLike = { id: "claude-sonnet-4-5", provider: "anthropic", api: "anthropic-messages", input: ["text", "image"] }
const SUBMISSION_TEXT = "游戏卡在结算页，重新进入也没变化"

function testConfig(overrides: Partial<PiRunnerConfig> = {}): PiRunnerConfig {
    return {
        provider: "anthropic",
        model: MODEL.id,
        apiKey: "test-key",
        wallTimeoutMs: 2_000,
        heartbeatIntervalMs: 5_000,
        toolCallTimeoutMs: 500,
        maxToolCalls: 8,
        maxImages: 4,
        providerAllowlist: ["anthropic"],
        ...overrides,
    }
}

type MockPlan = {
    text?: string
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>
    stopReason?: string
    errorMessage?: string
    usage?: { input: number; output: number; cacheRead?: number }
    hang?: boolean
}

type Capture = {
    images: unknown[][]
    toolResults: string[]
    contexts: unknown[]
    systemPrompt: string
    tools: string[]
}

/** 测试用 streamFn：显式传入并记录调用参数，不触网。 */
function mockStreamFn(plan: MockPlan, capture: Capture): PiStreamFn {
    return async (_model, context) => {
        capture.contexts.push(context)
        return { text: plan.text ?? "", toolCalls: plan.toolCalls ?? [] }
    }
}

/** 测试用 Agent：真实执行 buildAgentOptions 的断言，再按 plan 调用 streamFn 与工具。 */
function fakeAgentFactory(plan: MockPlan, capture: Capture, streamFn: PiStreamFn) {
    return async (input: CreateAgentInput): Promise<PiAgentLike> => {
        const options = buildAgentOptions(input)
        capture.systemPrompt = options.initialState.systemPrompt
        capture.tools = options.initialState.tools.map(tool => tool.name)
        const state: PiAgentStateLike = {
            systemPrompt: options.initialState.systemPrompt,
            model: options.initialState.model,
            tools: options.initialState.tools,
            messages: [],
        }

        let rejectPrompt: ((error: Error) => void) | null = null

        return {
            get state() {
                return state
            },
            async prompt(text, images) {
                capture.images.push(images ?? [])
                state.messages!.push({ role: "user", content: text })
                if (plan.hang) {
                    await new Promise<void>((_resolve, reject) => {
                        rejectPrompt = reject
                    })
                    return
                }
                const response = (await streamFn(options.initialState.model, { messages: state.messages!.slice() })) as {
                    text: string
                    toolCalls: Array<{ name: string; args: Record<string, unknown> }>
                }
                for (const call of response.toolCalls) {
                    const tool = options.initialState.tools.find(item => item.name === call.name)
                    if (!tool) throw new Error(`tool ${call.name} not found`)
                    const result = await tool.execute(`call-${capture.toolResults.length + 1}`, call.args)
                    capture.toolResults.push((result.content[0] as { text: string }).text)
                }
                state.messages!.push({
                    role: "assistant",
                    content: [{ type: "text", text: response.text }],
                    stopReason: plan.stopReason ?? "stop",
                    errorMessage: plan.errorMessage,
                    usage: plan.usage,
                })
            },
            abort() {
                rejectPrompt?.(new Error("aborted"))
            },
            async waitForIdle() {},
            subscribe() {
                return () => {}
            },
        }
    }
}

function inMemorySpawn(setup: { plan: MockPlan; capture: Capture; sessions: number[] }): SpawnChildFn {
    return async ({ config }) => {
        const { parent, child } = createInMemoryChannelPair()
        const streamFn = mockStreamFn(setup.plan, setup.capture)
        setup.sessions.push(1)
        const done = runChildSession({
            channel: child,
            config,
            createAgent: fakeAgentFactory(setup.plan, setup.capture, streamFn),
            createStreamSetup: async () => ({ model: MODEL, streamFn, provider: config.provider, modelId: config.model }),
        })
        const handle: ChildProcessHandle = {
            channel: parent,
            kill: () => child.close(),
            waitExit: () => done.then(() => 0),
        }
        return handle
    }
}

function proposalFor(versionId: string, inputHash: string, text: string) {
    const quote = Array.from(text).slice(0, 5).join("")
    return {
        schemaVersion: 1,
        submissionVersionId: versionId,
        inputHash,
        disposition: "game_bug",
        parts: [
            {
                partId: "part-1",
                title: "结算页卡住",
                summary: "完成关卡后停在结算页",
                primaryCategory: "ui",
                tags: [],
                actual: "停在结算页",
                expected: "正常结算",
                steps: ["完成关卡"],
                environment: { platform: null, region: null, gameVersion: null },
                suggestedSeverity: "S2",
                severityReason: "阻断流程但可重进",
                evidenceRefs: [{ type: "text", versionId, start: 0, end: 5, quote }],
                duplicate: { decision: "different", candidateBugId: null, reasons: [], contradictions: [] },
                missingInformation: [],
            },
        ],
        clarificationQuestions: [],
    }
}

function seedJob(db: TestDb) {
    const seeded = seedSubmission(db, { text: SUBMISSION_TEXT })
    const job = enqueueJob(db, {
        kind: "process_submission",
        idempotencyKey: `process_submission:${seeded.submissionId}:${seeded.revision}`,
        inputHash: "seed-content-sha",
        now: 1_000,
    })
    const [claimed] = claimJob(db, "worker-1", { now: 1_000, leaseMs: 60_000 })
    if (!claimed) throw new Error("claim 失败")
    return { ...seeded, job, claimed }
}

function emptyCapture(): Capture {
    return { images: [], toolResults: [], contexts: [], systemPrompt: "", tools: [] }
}

describe("pi runner child session", () => {
    it("run 消息驱动 mock streamFn，产出可解析 Proposal 并回传用量", async () => {
        const { parent, child } = createInMemoryChannelPair()
        const capture = emptyCapture()
        const plan: MockPlan = {
            text: JSON.stringify(proposalFor("sub-1:1", "hash-1", SUBMISSION_TEXT)),
            toolCalls: [{ name: "search_bug_candidates", args: { query: "结算页" } }],
            usage: { input: 11, output: 7, cacheRead: 2 },
        }
        const streamFn = mockStreamFn(plan, capture)
        const done = runChildSession({
            channel: child,
            config: testConfig(),
            createAgent: fakeAgentFactory(plan, capture, streamFn),
            createStreamSetup: async () => ({ model: MODEL, streamFn, provider: "anthropic", modelId: MODEL.id }),
        })

        expect(await parent.next()).toEqual({ type: "ready" })
        const run: PiRunMessage = {
            type: "run",
            jobId: "job-1",
            fencingToken: 1,
            inputHash: "hash-1",
            submissionVersionId: "sub-1:1",
            prompt: "处理反馈",
            images: [{ data: "AAAA", mimeType: "image/png" }],
        }
        parent.send(run)

        const toolCall = await parent.next()
        expect(toolCall?.type).toBe("tool_call")
        parent.send({ type: "tool_result", callId: (toolCall as { callId: string }).callId, ok: true, result: { candidates: [] } })

        const result = (await parent.next()) as PiResultMessage
        expect(result).toEqual({
            type: "result",
            ok: true,
            proposal: expect.objectContaining({ schemaVersion: 1, submissionVersionId: "sub-1:1" }),
            tokenUsage: { input: 11, output: 7, cachedInput: 2 },
        })
        expect(capture.systemPrompt).toContain("submissionVersionId")
        expect(capture.tools).toEqual(["get_submission_evidence", "search_bug_candidates", "get_bug_public_context"])
        expect(capture.images[0]).toEqual([{ type: "image", data: "AAAA", mimeType: "image/png" }])
        expect(await done).toEqual({ ok: true })
    })

    it("stopReason=error 时不假报成功", async () => {
        const { parent, child } = createInMemoryChannelPair()
        const capture = emptyCapture()
        const plan: MockPlan = { text: "{}", stopReason: "error", errorMessage: "provider 500" }
        const streamFn = mockStreamFn(plan, capture)
        const done = runChildSession({
            channel: child,
            config: testConfig(),
            createAgent: fakeAgentFactory(plan, capture, streamFn),
            createStreamSetup: async () => ({ model: MODEL, streamFn, provider: "anthropic", modelId: MODEL.id }),
        })

        await parent.next()
        parent.send({
            type: "run",
            jobId: "job-1",
            fencingToken: 1,
            inputHash: "h",
            submissionVersionId: "sub-1:1",
            prompt: "p",
            images: [],
        })
        const result = (await parent.next()) as PiResultMessage
        expect(result).toEqual({ type: "result", ok: false, error: "agent_failed", detail: "provider 500" })
        expect(await done).toEqual({ ok: false, error: "agent_failed" })
    })

    it("墙钟超时会 abort 并返回 timeout", async () => {
        const { parent, child } = createInMemoryChannelPair()
        const capture = emptyCapture()
        const plan: MockPlan = { hang: true }
        const streamFn = mockStreamFn(plan, capture)
        const done = runChildSession({
            channel: child,
            config: testConfig({ wallTimeoutMs: 25 }),
            createAgent: fakeAgentFactory(plan, capture, streamFn),
            createStreamSetup: async () => ({ model: MODEL, streamFn, provider: "anthropic", modelId: MODEL.id }),
        })

        await parent.next()
        parent.send({
            type: "run",
            jobId: "job-1",
            fencingToken: 1,
            inputHash: "h",
            submissionVersionId: "sub-1:1",
            prompt: "p",
            images: [],
        })
        const result = (await parent.next()) as PiResultMessage
        expect(result.type).toBe("result")
        expect((result as { ok: boolean }).ok).toBe(false)
        expect((result as { error: string }).error).toBe("timeout")
        await done
    })
})

describe("pi runner parent", () => {
    it("完整链路：工具经 IPC 执行 → Proposal 校验 → 事务应用 → 任务完成", async () => {
        const { db, sqlite } = createTestDb()
        try {
            const { versionId, claimed } = seedJob(db)
            const capture = emptyCapture()
            const sessions: number[] = []
            const outcome = await runJobOnce(
                {
                    db,
                    config: testConfig(),
                    workerId: "worker-1",
                    spawnChild: inMemorySpawn({
                        plan: {
                            text: JSON.stringify(proposalFor(versionId, "seed-content-sha", SUBMISSION_TEXT)),
                            toolCalls: [{ name: "search_bug_candidates", args: { query: "结算页" } }],
                            usage: { input: 100, output: 50 },
                        },
                        capture,
                        sessions,
                    }),
                },
                claimed
            )

            expect(outcome.ok).toBe(true)
            expect(outcome.jobCompleted).toBe(true)
            expect(sessions).toHaveLength(1)
            expect(capture.toolResults).toHaveLength(1)
            expect(capture.toolResults[0]).toContain("candidates")

            const bugs = db.select().from(schema.bugs).all()
            expect(bugs).toHaveLength(1)
            expect(bugs[0]!.displayKey).toBe("BUG-1")
            expect(bugs[0]!.primaryCategory).toBe("ui")

            const job = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, claimed.id)).get()!
            expect(job.state).toBe("completed")
            expect(job.resultRef).toBe(outcome.runId)

            const runs = db.select().from(schema.bugAiRuns).all()
            expect(runs).toHaveLength(1)
            expect(runs[0]!.modelProvider).toBe("anthropic/claude-sonnet-4-5")
            expect(runs[0]!.tokenUsage).toEqual({ inputTokens: 100, outputTokens: 50 })
            expect(runs[0]!.error).toBeNull()
        } finally {
            sqlite.close()
        }
    })

    it("授权图片随 prompt 发送，并生成可解析 Proposal", async () => {
        const { db, sqlite } = createTestDb()
        try {
            const { versionId, claimed } = seedJob(db)
            const capture = emptyCapture()
            const outcome = await runJobOnce(
                {
                    db,
                    config: testConfig(),
                    workerId: "worker-1",
                    spawnChild: inMemorySpawn({
                        plan: { text: JSON.stringify(proposalFor(versionId, "seed-content-sha", SUBMISSION_TEXT)) },
                        capture,
                        sessions: [],
                    }),
                    loadImages: async () => [{ type: "image", data: "aW1n", mimeType: "image/png" }],
                },
                claimed
            )

            expect(outcome.ok).toBe(true)
            expect(capture.images).toEqual([[{ type: "image", data: "aW1n", mimeType: "image/png" }]])
        } finally {
            sqlite.close()
        }
    })

    it("模型运行失败时任务进入 retry_wait 且不创建 Bug", async () => {
        const { db, sqlite } = createTestDb()
        try {
            const { claimed } = seedJob(db)
            const outcome = await runJobOnce(
                {
                    db,
                    config: testConfig(),
                    workerId: "worker-1",
                    spawnChild: inMemorySpawn({
                        plan: { text: "{}", stopReason: "error", errorMessage: "provider 429" },
                        capture: emptyCapture(),
                        sessions: [],
                    }),
                },
                claimed
            )

            expect(outcome.ok).toBe(false)
            expect(outcome.retry).toBe(true)
            expect(db.select().from(schema.bugs).all()).toHaveLength(0)
            const job = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, claimed.id)).get()!
            expect(job.state).toBe("retry_wait")
            expect(job.lastError).toContain("agent_failed")
        } finally {
            sqlite.close()
        }
    })

    it("Proposal Schema 无效时允许一次修复重试，且不创建 Bug", async () => {
        const { db, sqlite } = createTestDb()
        try {
            const { claimed } = seedJob(db)
            const outcome = await runJobOnce(
                {
                    db,
                    config: testConfig(),
                    workerId: "worker-1",
                    spawnChild: inMemorySpawn({
                        plan: { text: JSON.stringify({ schemaVersion: 1, submissionVersionId: "sub-1:1", inputHash: "seed-content-sha" }) },
                        capture: emptyCapture(),
                        sessions: [],
                    }),
                },
                claimed
            )

            expect(outcome.ok).toBe(false)
            expect(outcome.error).toBe("proposal_invalid")
            expect(outcome.retry).toBe(true)
            expect(db.select().from(schema.bugs).all()).toHaveLength(0)
            const job = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, claimed.id)).get()!
            expect(job.state).toBe("retry_wait")
        } finally {
            sqlite.close()
        }
    })

    it("子进程无响应时父进程墙钟超时并强杀", async () => {
        const { db, sqlite } = createTestDb()
        try {
            const { claimed } = seedJob(db)
            let kills = 0
            const silentSource = {
                async *[Symbol.asyncIterator]() {
                    await new Promise(() => {})
                },
            }
            const spawnChild: SpawnChildFn = () => ({
                channel: new JsonLineChannel(silentSource, { write: () => {} }),
                kill: () => {
                    kills += 1
                },
                waitExit: async () => 0,
            })

            const outcome = await runJobOnce({ db, config: testConfig({ wallTimeoutMs: 30 }), workerId: "worker-1", spawnChild }, claimed)

            expect(outcome.ok).toBe(false)
            expect(outcome.error).toBe("timeout")
            expect(kills).toBeGreaterThan(0)
            const job = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, claimed.id)).get()!
            expect(job.state).toBe("retry_wait")
        } finally {
            sqlite.close()
        }
    })

    it("租约被新 worker 接管后，旧 fencingToken 的迟到结果被拒绝", async () => {
        const { db, sqlite } = createTestDb()
        try {
            const seeded = seedSubmission(db, { text: SUBMISSION_TEXT })
            enqueueJob(db, {
                kind: "process_submission",
                idempotencyKey: `process_submission:${seeded.submissionId}:${seeded.revision}`,
                inputHash: "seed-content-sha",
                now: 1_000,
            })
            const [stale] = claimJob(db, "worker-1", { now: 1_000, leaseMs: 10 })
            const [current] = claimJob(db, "worker-2", { now: 5_000, leaseMs: 60_000 })
            expect(stale!.fencingToken).toBe(1)
            expect(current!.fencingToken).toBe(2)

            const outcome = await runJobOnce(
                {
                    db,
                    config: testConfig(),
                    workerId: "worker-1",
                    spawnChild: inMemorySpawn({
                        plan: { text: JSON.stringify(proposalFor(seeded.versionId, "seed-content-sha", SUBMISSION_TEXT)) },
                        capture: emptyCapture(),
                        sessions: [],
                    }),
                },
                stale!
            )

            expect(outcome.ok).toBe(false)
            expect(outcome.error).toBe("fencing_rejected")
            expect(outcome.retry).toBe(false)
            expect(db.select().from(schema.bugs).all()).toHaveLength(0)
            const job = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, stale!.id)).get()!
            expect(job.state).toBe("running")
            expect(job.fencingToken).toBe(2)
            expect(job.leaseOwner).toBe("worker-2")
        } finally {
            sqlite.close()
        }
    })

    it("反馈已有更新 revision 时不调用模型", async () => {
        const { db, sqlite } = createTestDb()
        try {
            const { submissionId, claimed } = seedJob(db)
            db.update(schema.bugSubmissions).set({ currentRevision: 2 }).where(eq(schema.bugSubmissions.id, submissionId)).run()
            let spawned = 0
            const outcome = await runJobOnce(
                {
                    db,
                    config: testConfig(),
                    workerId: "worker-1",
                    spawnChild: () => {
                        spawned += 1
                        throw new Error("不应启动子进程")
                    },
                },
                claimed
            )

            expect(outcome.ok).toBe(false)
            expect(outcome.error).toBe("input_stale")
            expect(outcome.retry).toBe(false)
            expect(spawned).toBe(0)
            const job = db.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, claimed.id)).get()!
            expect(job.state).toBe("failed")
        } finally {
            sqlite.close()
        }
    })

    it("buildAgentOptions 在子进程装配前拒绝额外工具", async () => {
        const capture = emptyCapture()
        const plan: MockPlan = { text: "{}" }
        const streamFn = mockStreamFn(plan, capture)
        const factory = fakeAgentFactory(plan, capture, streamFn)
        await expect(
            factory({
                model: MODEL,
                streamFn,
                allowedToolNames: ["get_submission_evidence"],
                tools: [
                    {
                        name: "get_submission_evidence",
                        label: "a",
                        description: "a",
                        parameters: { type: "object", properties: {} },
                        execute: async () => ({ content: [] }),
                    },
                    {
                        name: "search_bug_candidates",
                        label: "b",
                        description: "b",
                        parameters: { type: "object", properties: {} },
                        execute: async () => ({ content: [] }),
                    },
                ],
            })
        ).rejects.toThrow(/工具清单/)
    })

    it("错误类型可区分可重试与永久失败", () => {
        expect(new PiRunnerError("timeout", "t", { retryable: true }).retryable).toBe(true)
        expect(new PiRunnerError("input_stale", "s").retryable).toBe(false)
    })
})
