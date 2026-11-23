import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { createGithubClient } from "./github/client.ts"
import { reconcileOnce } from "./reconcile.ts"
import { createRepoRegistry } from "./repo-registry.ts"
import type { ActiveMapping, BugPipelineServerClient, DriftReport, OutboxCompletion, OutboxItem } from "./server-client.ts"

const REPO = { owner: "owner", repo: "repo", fullName: "owner/repo", repositoryId: "42" }

type MockComment = { id: string; body: string }
type MockIssue = { number: number; state: string; stateReason: string | null; labels: string[] }

function sha256(text: string): string {
    return createHash("sha256").update(text, "utf8").digest("hex")
}

function json(data: unknown, init: { status?: number } = {}): Response {
    return new Response(JSON.stringify(data), { status: init.status ?? 200, headers: { "content-type": "application/json" } })
}

const ISSUE_ITEM = /^\/repos\/owner\/repo\/issues\/(\d+)$/
const LABEL_LIST = /^\/repos\/owner\/repo\/issues\/(\d+)\/labels$/
const COMMENT_LIST = /^\/repos\/owner\/repo\/issues\/(\d+)\/comments$/

function createGithubMock(issue: MockIssue, comments: MockComment[] = []) {
    const calls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        const path = url.pathname
        calls.push(`${init?.method ?? "GET"} ${path}?${url.searchParams.toString()}`)

        const issueMatch = path.match(ISSUE_ITEM)
        if (issueMatch) {
            return json({
                number: issue.number,
                state: issue.state,
                state_reason: issue.stateReason,
                labels: issue.labels.map(name => ({ name })),
            })
        }
        if (path.match(LABEL_LIST)) {
            const page = Number(url.searchParams.get("page") ?? "1")
            return json(page === 1 ? issue.labels.map(name => ({ name })) : [])
        }
        if (path.match(COMMENT_LIST)) {
            const page = Number(url.searchParams.get("page") ?? "1")
            const perPage = Number(url.searchParams.get("per_page") ?? "100")
            const slice = comments.slice((page - 1) * perPage, page * perPage)
            return json(slice.map(comment => ({ id: Number(comment.id), body: comment.body })))
        }
        return json({ message: "Not Found" }, { status: 404 })
    }) as typeof fetch
    return { fetchImpl, calls }
}

function createServerMock(mappings: ActiveMapping[]) {
    const drifts: DriftReport[] = []
    const client: BugPipelineServerClient = {
        async readOutbox(): Promise<OutboxItem[]> {
            return []
        },
        async completeOutbox(_completion: OutboxCompletion) {},
        async writeInbox() {
            return { ok: true, duplicate: false }
        },
        async readActiveMappings() {
            return mappings
        },
        async reportDrift(report) {
            drifts.push(report)
        },
    }
    return { client, drifts }
}

function createHarness(mappings: ActiveMapping[], issue: MockIssue, comments: MockComment[] = []) {
    const mock = createGithubMock(issue, comments)
    const server = createServerMock(mappings)
    const github = createGithubClient({ fetchImpl: mock.fetchImpl, sleep: async () => {} })
    const registry = createRepoRegistry({ repoAllowlist: [REPO], repositoryIds: ["42"] })
    const deps = {
        server: server.client,
        github,
        registry,
        tokenFor: async () => "installation-token",
        invalidateToken: () => {},
        now: () => 1_700_000_000_000,
    }
    return { deps, server, mock }
}

function mapping(overrides: Partial<ActiveMapping> = {}): ActiveMapping {
    return {
        issueLinkId: "link-1",
        bugId: "bug-1",
        repositoryId: "42",
        issueNumber: 1,
        remoteState: "open",
        remoteStateReason: null,
        syncState: "synced",
        ...overrides,
    }
}

describe("reconcile", () => {
    test("两端一致时不产生漂移，人工标签不算差异", async () => {
        const { deps, server } = createHarness(
            [mapping({ expectedLabels: ["fix:confirmed"], managedLabels: ["fix:confirmed", "fix:released"] })],
            {
                number: 1,
                state: "open",
                stateReason: null,
                labels: ["fix:confirmed", "human:keep"],
            }
        )

        const result = await reconcileOnce(deps)

        expect(result).toMatchObject({ mappings: 1, checked: 1, drifted: 0, errors: 0 })
        expect(server.drifts).toEqual([])
    })

    test("远端关闭与受管标签变化分别上报漂移", async () => {
        const { deps, server } = createHarness(
            [mapping({ expectedLabels: ["fix:confirmed"], managedLabels: ["fix:confirmed", "fix:released"], remoteState: "open" })],
            {
                number: 1,
                state: "closed",
                stateReason: "completed",
                labels: ["fix:released", "human:keep"],
            }
        )

        const result = await reconcileOnce(deps)

        expect(result.drifted).toBe(1)
        expect(server.drifts.map(drift => drift.driftType)).toEqual(["remote_state_changed", "labels_changed"])
        expect(server.drifts[0]).toMatchObject({
            issueLinkId: "link-1",
            expected: { state: "open" },
            actual: { state: "closed", stateReason: "completed" },
        })
        expect(server.drifts[1].actual).toMatchObject({ missing: ["fix:confirmed"], unexpected: ["fix:released"] })
    })

    test("评论超过 100 条时完整分页，缺失与人工改写都能发现", async () => {
        const comments: MockComment[] = Array.from({ length: 150 }, (_, index) => ({
            id: String(1000 + index),
            body: `评论 ${index}`,
        }))
        const { deps, server, mock } = createHarness(
            [
                mapping({
                    comments: [
                        // 第 2 页上的评论：只看前 100 条会误判缺失。
                        { commentId: "1100", lastRemoteHash: sha256("评论 100") },
                        { commentId: "1999", lastRemoteHash: null },
                        { commentId: "1050", lastRemoteHash: sha256("维护者改写过的正文") },
                        { commentId: "1001", lastRemoteHash: sha256("评论 1"), deletedAt: 1 },
                    ],
                }),
            ],
            { number: 1, state: "open", stateReason: null, labels: [] },
            comments
        )

        const result = await reconcileOnce(deps)

        expect(result.drifted).toBe(1)
        expect(mock.calls.filter(call => call.includes("/comments?")).length).toBe(2)
        const missing = server.drifts.find(drift => drift.driftType === "comments_missing")
        expect(missing?.expected).toMatchObject({ commentIds: ["1999"] })
        const edited = server.drifts.find(drift => drift.driftType === "comment_edited")
        expect(edited?.expected).toMatchObject({ comments: [{ commentId: "1050" }] })
    })

    test("Issue 被删除时上报 issue_missing", async () => {
        const fetchImpl = (async () => json({ message: "Not Found" }, { status: 404 })) as unknown as typeof fetch
        const server = createServerMock([mapping()])
        const deps = {
            server: server.client,
            github: createGithubClient({ fetchImpl, sleep: async () => {} }),
            registry: createRepoRegistry({ repoAllowlist: [REPO], repositoryIds: ["42"] }),
            tokenFor: async () => "token",
        }

        const result = await reconcileOnce(deps)

        expect(result.drifted).toBe(1)
        expect(server.drifts[0].driftType).toBe("issue_missing")
    })

    test("仓库不在 allowlist 的映射跳过，不请求 GitHub", async () => {
        const { deps, server, mock } = createHarness([mapping({ repositoryId: "999" })], {
            number: 1,
            state: "open",
            stateReason: null,
            labels: [],
        })

        const result = await reconcileOnce(deps)

        expect(result).toMatchObject({ skipped: 1, checked: 0 })
        expect(mock.calls).toEqual([])
        expect(server.drifts).toEqual([])
    })

    test("limit 限制单轮处理量", async () => {
        const mappings = [mapping({ issueLinkId: "a" }), mapping({ issueLinkId: "b" })]
        const { deps } = createHarness(mappings, { number: 1, state: "open", stateReason: null, labels: [] })

        const result = await reconcileOnce(deps, { limit: 1 })

        expect(result).toMatchObject({ mappings: 2, checked: 1 })
    })
})
