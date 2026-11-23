import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { createGithubClient } from "./github/client.ts"
import type { IssueBugRow } from "./issue-template.ts"
import { flushOutboxOnce } from "./outbox.ts"
import { createRepoRegistry } from "./repo-registry.ts"
import type { ActiveMapping, BugPipelineServerClient, OutboxCompletion, OutboxItem } from "./server-client.ts"

const NOW = 1_700_000_000_000

const BUG: IssueBugRow = {
    id: "bug-1",
    displayKey: "BUG-1",
    title: "结算页卡住无法退出",
    summary: "打完关卡后停在结算页",
    expected: "结算后回到主界面",
    actual: "一直停在结算页",
    steps: ["完成任意关卡", "等待结算"],
    environment: { platform: "pc", region: "cn", gameVersion: "1.2.3" },
    primaryCategory: "ui",
    tags: ["type.game_bug", "fix.unconfirmed", "category.ui"],
    status: "untriaged",
}

type RecordedCall = { method: string; path: string; body: any }
type MockIssue = { id: number; number: number; state: string; stateReason: string | null; labels: string[] }
type MockOptions = {
    /** 模拟 App 缺权限：不在列表里的标签不会真正应用。 */
    labelAllowlist?: string[]
    failIssueCreate?: { status: number; headers?: Record<string, string> }
}

function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
    return new Response(JSON.stringify(data), {
        status: init.status ?? 200,
        headers: { "content-type": "application/json", ...init.headers },
    })
}

function sha256(text: string): string {
    return createHash("sha256").update(text, "utf8").digest("hex")
}

const ISSUE_CREATE = /^\/repos\/owner\/repo\/issues$/
const COMMENT_CREATE = /^\/repos\/owner\/repo\/issues\/(\d+)\/comments$/
const COMMENT_ITEM = /^\/repos\/owner\/repo\/issues\/comments\/(\d+)$/
const LABEL_LIST = /^\/repos\/owner\/repo\/issues\/(\d+)\/labels$/
const LABEL_ITEM = /^\/repos\/owner\/repo\/issues\/(\d+)\/labels\/(.+)$/
const ISSUE_ITEM = /^\/repos\/owner\/repo\/issues\/(\d+)$/

function createGithubMock(options: MockOptions = {}) {
    const issues = new Map<number, MockIssue>()
    const comments = new Map<string, { id: string; body: string }>()
    const calls: RecordedCall[] = []
    let issueSeq = 0
    let commentSeq = 0

    function serialize(issue: MockIssue) {
        return {
            id: issue.id,
            number: issue.number,
            state: issue.state,
            state_reason: issue.stateReason,
            html_url: `https://github.com/owner/repo/issues/${issue.number}`,
        }
    }

    function ensureIssue(number: number): MockIssue {
        const existing = issues.get(number)
        if (existing) return existing
        const created: MockIssue = { id: 1000 + number, number, state: "open", stateReason: null, labels: [] }
        issues.set(number, created)
        return created
    }

    function applyLabels(issue: MockIssue, requested: string[]): void {
        const allowed = requested.filter(name => !options.labelAllowlist || options.labelAllowlist.includes(name))
        for (const name of allowed) if (!issue.labels.includes(name)) issue.labels.push(name)
    }

    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        const method = (init?.method ?? "GET").toUpperCase()
        const path = url.pathname
        const body = init?.body ? JSON.parse(String(init.body)) : undefined
        calls.push({ method, path, body })

        if (method === "POST" && ISSUE_CREATE.test(path)) {
            if (options.failIssueCreate) return json({ message: "boom" }, options.failIssueCreate)
            issueSeq++
            const issue: MockIssue = { id: 1000 + issueSeq, number: issueSeq, state: "open", stateReason: null, labels: [] }
            applyLabels(issue, Array.isArray(body?.labels) ? body.labels : [])
            issues.set(issue.number, issue)
            return json({ ...serialize(issue), node_id: `I_${issue.number}` })
        }

        let match = path.match(COMMENT_CREATE)
        if (match && method === "POST") {
            commentSeq++
            const id = String(4000 + commentSeq)
            const text = String(body?.body ?? "")
            comments.set(id, { id, body: text })
            return json({ id: Number(id), html_url: `https://github.com/owner/repo/issues/${match[1]}#issuecomment-${id}` })
        }

        match = path.match(COMMENT_ITEM)
        if (match) {
            const comment = comments.get(match[1])
            if (!comment) return json({ message: "Not Found" }, { status: 404 })
            if (method === "GET") return json({ id: Number(comment.id), body: comment.body })
            if (method === "PATCH") {
                comment.body = String(body?.body ?? "")
                return json({ id: Number(comment.id), body: comment.body })
            }
            if (method === "DELETE") {
                comments.delete(comment.id)
                return new Response(null, { status: 204 })
            }
        }

        match = path.match(LABEL_ITEM)
        if (match && method === "DELETE") {
            const issue = issues.get(Number(match[1]))
            const name = decodeURIComponent(match[2])
            if (!issue) return json({ message: "Label does not exist" }, { status: 404 })
            if (!issue.labels.includes(name)) return json({ message: "Label does not exist" }, { status: 404 })
            issue.labels = issue.labels.filter(label => label !== name)
            return json(issue.labels.map(label => ({ name: label })))
        }

        match = path.match(LABEL_LIST)
        if (match) {
            const issue = ensureIssue(Number(match[1]))
            if (method === "GET") {
                const page = Number(url.searchParams.get("page") ?? "1")
                return json(page === 1 ? issue.labels.map(name => ({ name })) : [])
            }
            if (method === "POST") {
                applyLabels(issue, Array.isArray(body?.labels) ? body.labels : [])
                return json(issue.labels.map(name => ({ name })))
            }
        }

        match = path.match(ISSUE_ITEM)
        if (match) {
            const number = Number(match[1])
            if (method === "GET") {
                const issue = issues.get(number)
                if (!issue) return json({ message: "Not Found" }, { status: 404 })
                return json(serialize(issue))
            }
            if (method === "PATCH") {
                const issue = ensureIssue(number)
                if (typeof body?.state === "string") issue.state = body.state
                if (typeof body?.state_reason === "string") issue.stateReason = body.state_reason
                return json(serialize(issue))
            }
        }

        return json({ message: "Not Found" }, { status: 404 })
    }) as typeof fetch

    return {
        fetchImpl,
        calls,
        seed(number: number, patch: Partial<MockIssue> = {}) {
            const issue = ensureIssue(number)
            Object.assign(issue, patch)
            return issue
        },
        seedComment(id: string, text: string) {
            comments.set(id, { id, body: text })
        },
        issue(number: number) {
            return issues.get(number) ?? null
        },
        comment(id: string) {
            return comments.get(id) ?? null
        },
    }
}

function createServerMock(
    items: OutboxItem[],
    mappings: ActiveMapping[] = []
): BugPipelineServerClient & { completions: OutboxCompletion[] } {
    const completions: OutboxCompletion[] = []
    return {
        completions,
        async readOutbox() {
            return items
        },
        async completeOutbox(completion) {
            completions.push(completion)
        },
        async writeInbox() {
            return { ok: true, duplicate: false }
        },
        async readActiveMappings() {
            return mappings
        },
        async reportDrift() {},
    }
}

function createHarness(items: OutboxItem[], mockOptions: MockOptions = {}, mappings: ActiveMapping[] = []) {
    const mock = createGithubMock(mockOptions)
    const server = createServerMock(items, mappings)
    const github = createGithubClient({ fetchImpl: mock.fetchImpl, sleep: async () => {}, now: () => NOW })
    const registry = createRepoRegistry({
        repoAllowlist: [{ owner: "owner", repo: "repo", fullName: "owner/repo", repositoryId: "42" }],
        repositoryIds: ["42"],
    })
    const deps = {
        server,
        github,
        registry,
        tokenFor: async () => "installation-token",
        invalidateToken: () => {},
        now: () => NOW,
    }
    return { deps, server, mock }
}

function outboxItem(overrides: Partial<OutboxItem>): OutboxItem {
    return {
        eventId: "event-1",
        operation: "create_issue",
        targetMapping: "repo:42",
        payload: {},
        attempt: 0,
        nextAttemptAt: null,
        ...overrides,
    }
}

function mapping(overrides: Partial<ActiveMapping> = {}): ActiveMapping {
    return {
        issueLinkId: "link-1",
        bugId: "bug-1",
        repositoryId: "42",
        issueId: "1001",
        issueNumber: 1,
        remoteState: "open",
        syncState: "synced",
        ...overrides,
    }
}

describe("outbox flush — issue", () => {
    test("create_issue 用 Bug 投影渲染模板、核验标签并回写映射", async () => {
        const { deps, server, mock } = createHarness([outboxItem({ payload: { eventKind: "bug_created", bugId: "bug-1", bug: BUG } })], {
            labelAllowlist: ["type:game-bug"],
        })

        const result = await flushOutboxOnce(deps)

        expect(result).toMatchObject({ read: 1, delivered: 1, failed: 0, blocked: 0 })
        const completion = server.completions[0]
        expect(completion.result.state).toBe("delivered")
        expect(completion.result.issue).toMatchObject({
            repositoryId: "42",
            issueId: "1001",
            issueNumber: 1,
            htmlUrl: "https://github.com/owner/repo/issues/1",
            remoteState: "open",
        })

        const createCall = mock.calls.find(call => call.method === "POST" && call.path === "/repos/owner/repo/issues")
        expect(createCall?.body.title).toBe("[BUG-1] 结算页卡住无法退出")
        expect(createCall?.body.body).toContain("## 摘要\n\n打完关卡后停在结算页")
        expect(createCall?.body.body).toContain("### 复现步骤\n\n1. 完成任意关卡\n2. 等待结算")
        expect(createCall?.body.body).toContain("<!-- bug-bridge bug=bug-1 event=event-1 schema=1 -->")
        expect(createCall?.body.labels).toEqual(["category:ui", "fix:unconfirmed", "type:game-bug", "unverified"])
        expect(completion.result.remoteResult).toMatchObject({
            appliedLabels: ["type:game-bug"],
            missingLabels: ["category:ui", "fix:unconfirmed", "unverified"],
        })
    })

    test("显式 title/body/labels 优先于模板渲染", async () => {
        const { deps, mock } = createHarness([
            outboxItem({
                payload: { bugId: "bug-1", bug: BUG, title: "[BUG-1] 人工标题", body: "人工正文", labels: ["type:game-bug"] },
            }),
        ])

        await flushOutboxOnce(deps)

        const createCall = mock.calls.find(call => call.method === "POST" && call.path === "/repos/owner/repo/issues")
        expect(createCall?.body).toMatchObject({ title: "[BUG-1] 人工标题", body: "人工正文", labels: ["type:game-bug"] })
    })

    test("close_issue 与 reopen_issue 通过映射定位 Issue 并核验远端状态", async () => {
        const { deps, server, mock } = createHarness(
            [
                outboxItem({ eventId: "e-close", operation: "close_issue", payload: { bugId: "bug-1", stateReason: "completed" } }),
                outboxItem({ eventId: "e-reopen", operation: "reopen_issue", payload: { bugId: "bug-1" } }),
            ],
            {},
            [mapping()]
        )
        mock.seed(1)

        const result = await flushOutboxOnce(deps, { limit: 10 })

        expect(result.delivered).toBe(2)
        expect(server.completions[0].result).toMatchObject({
            state: "delivered",
            remoteResult: { state: "closed", stateReason: "completed" },
        })
        expect(server.completions[1].result).toMatchObject({ state: "delivered", remoteResult: { state: "open" } })
        expect(mock.issue(1)?.state).toBe("open")
    })

    test("Issue 还没创建时关闭操作进 retry_wait 而不是永久失败", async () => {
        const { deps, server } = createHarness([outboxItem({ operation: "close_issue", payload: { bugId: "bug-1" } })])

        const result = await flushOutboxOnce(deps)

        expect(result.retryWait).toBe(1)
        expect(server.completions[0].result.state).toBe("retry_wait")
        expect(server.completions[0].result.lastError).toContain("Issue 尚未创建")
    })
})

describe("outbox flush — comment", () => {
    test("create_comment 回写评论映射与正文 hash", async () => {
        const body = "来自本站匿名反馈者的补充说明"
        const { deps, server } = createHarness(
            [
                outboxItem({
                    operation: "create_comment",
                    payload: { bugId: "bug-1", eventPayload: { body }, discussionEntryId: "entry-1" },
                }),
            ],
            {},
            [mapping()]
        )

        await flushOutboxOnce(deps)

        expect(server.completions[0].result.state).toBe("delivered")
        expect(server.completions[0].result.comment).toEqual({
            discussionEntryId: "entry-1",
            repositoryId: "42",
            issueId: "1001",
            commentId: "4001",
            sourceOrigin: "local",
            lastRemoteHash: sha256(body),
        })
    })

    test("没有 Issue 映射时 create_comment 进 retry_wait，不产生孤儿评论", async () => {
        const { deps, server, mock } = createHarness([
            outboxItem({
                operation: "create_comment",
                payload: { bugId: "bug-1", eventPayload: { body: "补充" }, discussionEntryId: "entry-1" },
            }),
        ])

        const result = await flushOutboxOnce(deps)

        expect(result.retryWait).toBe(1)
        expect(server.completions[0].result.state).toBe("retry_wait")
        expect(mock.calls.filter(call => call.path.includes("/comments"))).toHaveLength(0)
    })

    test("edit_comment 发现远端被人工改写时进 conflict，不覆盖", async () => {
        const { deps, server, mock } = createHarness([
            outboxItem({
                operation: "edit_comment",
                payload: { commentId: "4001", body: "本站新版本", expectedRemoteHash: sha256("本站旧版本") },
            }),
        ])
        mock.seedComment("4001", "维护者手工改过的内容")

        await flushOutboxOnce(deps)

        expect(server.completions[0].result.state).toBe("conflict")
        expect(mock.comment("4001")?.body).toBe("维护者手工改过的内容")
        expect(mock.calls.some(call => call.method === "PATCH")).toBe(false)
    })

    test("edit_comment 基线一致时正常编辑", async () => {
        const { deps, server, mock } = createHarness([
            outboxItem({
                operation: "edit_comment",
                payload: { commentId: "4001", body: "本站新版本", expectedRemoteHash: sha256("本站旧版本") },
            }),
        ])
        mock.seedComment("4001", "本站旧版本")

        await flushOutboxOnce(deps)

        expect(server.completions[0].result.state).toBe("delivered")
        expect(server.completions[0].result.remoteResult).toMatchObject({ commentId: "4001", remoteHash: sha256("本站新版本") })
        expect(mock.comment("4001")?.body).toBe("本站新版本")
    })

    test("delete_comment 远端已不存在时视为完成", async () => {
        const { deps, server } = createHarness([outboxItem({ operation: "delete_comment", payload: { commentId: "9999" } })])

        await flushOutboxOnce(deps)

        expect(server.completions[0].result.state).toBe("delivered")
        expect(server.completions[0].result.remoteResult).toMatchObject({ commentId: "9999", alreadyAbsent: true })
    })
})

describe("outbox flush — labels", () => {
    test("label_add / label_remove 以 targetMapping 作为 label 名，只动受管名称", async () => {
        const { deps, server, mock } = createHarness(
            [
                outboxItem({ eventId: "e-add", operation: "label_add", targetMapping: "fix:confirmed", payload: { bugId: "bug-1" } }),
                outboxItem({
                    eventId: "e-remove",
                    operation: "label_remove",
                    targetMapping: "fix:unconfirmed",
                    payload: { bugId: "bug-1" },
                }),
            ],
            {},
            [mapping()]
        )
        mock.seed(1, { labels: ["fix:unconfirmed", "human:keep"] })

        const result = await flushOutboxOnce(deps)

        expect(result.delivered).toBe(2)
        expect(server.completions[0].result.remoteResult).toMatchObject({ label: "fix:confirmed", applied: true, missingLabels: [] })
        expect(server.completions[1].result.remoteResult).toMatchObject({ label: "fix:unconfirmed", removed: true })
        expect(mock.issue(1)?.labels).toEqual(["human:keep", "fix:confirmed"])
    })

    test("标签操作缺少 Issue 映射时 retry_wait，等待 create_issue 落地", async () => {
        const { deps, server, mock } = createHarness([
            outboxItem({ operation: "label_add", targetMapping: "fix:confirmed", payload: { bugId: "bug-1" } }),
        ])

        const result = await flushOutboxOnce(deps)

        expect(result.retryWait).toBe(1)
        expect(server.completions[0].result.state).toBe("retry_wait")
        expect(mock.calls).toHaveLength(0)
    })

    test("update_labels 逐条增删，不整包 PATCH labels", async () => {
        const { deps, server, mock } = createHarness(
            [
                outboxItem({
                    operation: "update_labels",
                    payload: { bugId: "bug-1", issueNumber: 1, add: ["severity:s2"], remove: ["severity:s3"] },
                }),
            ],
            {},
            [mapping()]
        )
        mock.seed(1, { labels: ["severity:s3", "human:keep"] })

        await flushOutboxOnce(deps)

        expect(server.completions[0].result.state).toBe("delivered")
        expect(server.completions[0].result.remoteResult).toMatchObject({
            added: ["severity:s2"],
            missingLabels: [],
            removed: ["severity:s3"],
            stillPresent: [],
        })
        expect(mock.issue(1)?.labels.sort()).toEqual(["human:keep", "severity:s2"])
        expect(mock.calls.some(call => call.method === "PATCH")).toBe(false)
    })
})

describe("outbox flush — failure handling", () => {
    test("限流等待超过阈值时落 retry_wait，不阻塞进程", async () => {
        const { deps, server, mock } = createHarness([outboxItem({ payload: { bugId: "bug-1", bug: BUG } })], {
            failIssueCreate: { status: 403, headers: { "retry-after": "3600" } },
        })

        const result = await flushOutboxOnce(deps)

        expect(result.retryWait).toBe(1)
        expect(server.completions[0].result).toMatchObject({ state: "retry_wait", retryAt: NOW + 3_600_000 })
        expect(mock.calls).toHaveLength(1)
    })

    test("create_issue 5xx 结果不明时进 unknown_effect，不盲目重发", async () => {
        const { deps, server, mock } = createHarness([outboxItem({ payload: { bugId: "bug-1", bug: BUG } })], {
            failIssueCreate: { status: 502 },
        })

        const result = await flushOutboxOnce(deps)

        expect(result.unknownEffect).toBe(1)
        expect(server.completions[0].result.state).toBe("unknown_effect")
        expect(mock.calls.filter(call => call.method === "POST")).toHaveLength(1)
    })

    test("仓库不在 allowlist 时 blocked，不发任何请求", async () => {
        const { deps, server, mock } = createHarness([outboxItem({ targetMapping: "repo:999" })])

        const result = await flushOutboxOnce(deps)

        expect(result.blocked).toBe(1)
        expect(server.completions[0].result.state).toBe("blocked")
        expect(server.completions[0].result.lastError).toContain("repository_not_allowlisted")
        expect(mock.calls).toHaveLength(0)
    })

    test("占位 targetMapping 在唯一允许仓库时仍可解析", async () => {
        const { deps, mock } = createHarness([outboxItem({ targetMapping: "repo:bug-repository", payload: { bugId: "bug-1", bug: BUG } })])

        const result = await flushOutboxOnce(deps)

        expect(result.delivered).toBe(1)
        expect(mock.calls.some(call => call.path === "/repos/owner/repo/issues")).toBe(true)
    })

    test("未知操作 blocked，缺字段 failed", async () => {
        const { deps, server } = createHarness([
            outboxItem({ eventId: "e-unknown", operation: "transfer_repo" }),
            outboxItem({ eventId: "e-payload", operation: "create_issue", payload: {} }),
        ])

        const result = await flushOutboxOnce(deps)

        expect(result.blocked).toBe(1)
        expect(result.failed).toBe(1)
        expect(server.completions[0].result.lastError).toContain("unsupported_operation")
        expect(server.completions[1].result.state).toBe("failed")
    })
})
