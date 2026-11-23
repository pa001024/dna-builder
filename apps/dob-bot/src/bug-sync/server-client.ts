import type { IssueBugRow } from "./issue-template.ts"

/**
 * server `/internal/bug-pipeline` 内部 REST 客户端。
 *
 * Bridge 不直连 server 的 SQLite，只通过这层读写 outbox / inbox / 映射；字段形状以
 * `apps/server/src/api/bugs.ts` 的 `/internal/bug-pipeline/*` 实现为准。
 */

export type BugOutboxState = "queued" | "sending" | "delivered" | "retry_wait" | "unknown_effect" | "blocked" | "conflict" | "failed"

/**
 * `outbox/read` 的一条待执行操作。
 *
 * `targetMapping` 语义随 operation 变化：
 * - `create_issue`：`repo:<repositoryId>`（或占位 `repo:bug-repository`）
 * - `label_add` / `label_remove`：受管 label 名称——仓库坐标由 Bug 映射反查
 */
export type OutboxItem = {
    eventId: string
    operation: string
    targetMapping: string
    sourceRevision?: number | null
    payloadHash?: string | null
    state?: string
    attempt: number
    nextAttemptAt: number | null
    lastError?: string | null
    payload: OutboxPayload | null
}

/**
 * server 的 outbox payload 投影。Bridge 优先使用显式字段；缺省时按 Bug 行渲染 Issue 模板
 * （`issue-template.ts`），评论正文等无法推导的字段仍要求 server 提供。
 */
export type OutboxPayload = {
    /** 触发本次出站事件的类型（如 `bug_created` / `bug_comment_added`）。 */
    eventKind?: string | null
    bugId?: string | null
    submissionId?: string | null
    eventPayload?: Record<string, unknown> | null
    bug?: IssueBugRow | null
    title?: string
    body?: string
    labels?: string[]
    issueNumber?: number
    commentId?: string
    discussionEntryId?: string
    stateReason?: string
    label?: string
    add?: string[]
    remove?: string[]
    expectedRemoteHash?: string
}

/** `outbox/complete` 写回 Issue 映射。 */
export type OutboxIssueLink = {
    repositoryId: string
    issueId: string
    issueNodeId?: string | null
    issueNumber: number
    htmlUrl: string
    remoteState?: string | null
}

/** `outbox/complete` 写回评论映射。 */
export type OutboxCommentLink = {
    discussionEntryId: string
    repositoryId: string
    issueId: string
    commentId: string
    sourceOrigin?: string
    lastRemoteHash?: string | null
}

/** server 把 `result.state` 作为 outbox 终态，`retryAt` 决定下次重试时间。 */
export type OutboxResult = {
    state: Exclude<BugOutboxState, "queued" | "sending">
    retryAt?: number
    remoteResult?: Record<string, unknown>
    lastError?: string | null
    issue?: OutboxIssueLink
    comment?: OutboxCommentLink
}

export type OutboxCompletion = {
    eventId: string
    operation: string
    targetMapping?: string
    result: OutboxResult
}

export type InboxWriteInput = {
    deliveryId: string
    event: string
    action: string
    repositoryId: string
    installationId?: string | null
    payload: unknown
}

export type InboxWriteResult = {
    ok: boolean
    /** 重复 delivery 复用 inbox，不重复产生业务效果。 */
    duplicate: boolean
}

export type MappingComment = {
    commentId: string
    lastRemoteHash?: string | null
    deletedAt?: number | null
}

export type ActiveMapping = {
    issueLinkId: string
    bugId: string
    repositoryId: string
    issueId?: string
    issueNumber: number
    htmlUrl?: string
    remoteState: string | null
    remoteStateReason?: string | null
    syncState: string
    /** 本站当前期望的受管 label 集合（server 未提供时对账跳过 label 比对）。 */
    expectedLabels?: string[]
    /** Bridge 受管的全部 label 名称（来自 github_label_bindings）。 */
    managedLabels?: string[]
    /** 已映射评论（server 未提供时对账跳过评论比对）。 */
    comments?: MappingComment[]
}

export type DriftReport = {
    issueLinkId: string
    driftType: string
    expected: Record<string, unknown>
    actual: Record<string, unknown>
}

export type BugPipelineServerClient = {
    readOutbox: (options?: { state?: BugOutboxState; limit?: number }) => Promise<OutboxItem[]>
    completeOutbox: (completion: OutboxCompletion) => Promise<void>
    writeInbox: (input: InboxWriteInput) => Promise<InboxWriteResult>
    readActiveMappings: (options?: { limit?: number }) => Promise<ActiveMapping[]>
    reportDrift: (report: DriftReport) => Promise<void>
}

export type BugPipelineServerClientOptions = {
    endpoint: string
    workerToken: string
    /** worker 身份，写进 drift 事件审计。 */
    workerId?: string
    fetchImpl?: typeof fetch
    timeoutMs?: number
}

/**
 * 内部接口失败：`unreachable` 表示网络 / 5xx，调用方必须按可重试处理（webhook 要回 503 而不是假 ACK）。
 */
export class BugPipelineServerError extends Error {
    readonly status: number
    readonly code: string | null
    readonly unreachable: boolean

    constructor(init: { message: string; status: number; code?: string | null; unreachable: boolean }) {
        super(init.message)
        this.name = "BugPipelineServerError"
        this.status = init.status
        this.code = init.code ?? null
        this.unreachable = init.unreachable
    }
}

/**
 * @param {BugPipelineServerClientOptions} options
 * @returns {BugPipelineServerClient}
 */
export function createBugPipelineServerClient(options: BugPipelineServerClientOptions): BugPipelineServerClient {
    const endpoint = options.endpoint.replace(/\/+$/, "")
    const fetchImpl = options.fetchImpl ?? fetch
    const timeoutMs = options.timeoutMs ?? 15_000
    const workerId = options.workerId ?? "bug-sync-bridge"

    async function requestJson(method: string, path: string, body?: unknown): Promise<any> {
        const headers: Record<string, string> = {
            "x-worker-token": options.workerToken,
            Accept: "application/json",
        }
        const init: RequestInit = { method, headers, signal: AbortSignal.timeout(timeoutMs) }
        if (body !== undefined) {
            headers["Content-Type"] = "application/json"
            init.body = JSON.stringify(body)
        }

        let res: Response
        try {
            res = await fetchImpl(`${endpoint}${path}`, init)
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            throw new BugPipelineServerError({
                message: `bug-pipeline 请求失败: ${method} ${path}: ${reason}`,
                status: 0,
                unreachable: true,
            })
        }

        const text = await res.text()
        const data = text ? safeJsonParse(text) : null
        if (!res.ok) {
            const code = data && typeof data === "object" && "code" in data ? String((data as { code?: unknown }).code) : null
            const message = data && typeof data === "object" && "error" in data ? String((data as { error?: unknown }).error) : text
            throw new BugPipelineServerError({
                message: `bug-pipeline ${method} ${path} 失败: ${res.status} ${message}`,
                status: res.status,
                code,
                unreachable: res.status >= 500,
            })
        }
        return data
    }

    return {
        async readOutbox(readOptions) {
            const state = readOptions?.state ?? "queued"
            const limit = readOptions?.limit ?? 10
            const data = await requestJson("GET", `/internal/bug-pipeline/outbox/read?state=${encodeURIComponent(state)}&limit=${limit}`)
            return Array.isArray(data?.items) ? (data.items as OutboxItem[]) : []
        },
        async completeOutbox(completion) {
            await requestJson("POST", "/internal/bug-pipeline/outbox/complete", completion)
        },
        async writeInbox(input) {
            const data = await requestJson("POST", "/internal/bug-pipeline/inbox/write", input)
            return { ok: data?.ok !== false, duplicate: data?.duplicate === true }
        },
        async readActiveMappings(mappingOptions) {
            const limit = mappingOptions?.limit ?? 200
            const data = await requestJson("GET", `/internal/bug-pipeline/sync/active-mappings?limit=${limit}`)
            return Array.isArray(data?.mappings) ? (data.mappings as ActiveMapping[]) : []
        },
        async reportDrift(report) {
            await requestJson("POST", "/internal/bug-pipeline/sync/report-drift", { workerId, ...report })
        },
    }
}

/**
 * @param {string} text
 * @returns {any}
 */
function safeJsonParse(text: string): any {
    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}
