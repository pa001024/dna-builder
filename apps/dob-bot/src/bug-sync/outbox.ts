import { createHash } from "node:crypto"
import type { GithubClient } from "./github/client.ts"
import { GithubApiError } from "./github/client.ts"
import { computeIssueBody, computeIssueTitle, computeLabels } from "./issue-template.ts"
import type { RepoRegistry, ResolvedRepo } from "./repo-registry.ts"
import { BUG_ISSUE_TARGET_FALLBACK } from "./repo-registry.ts"
import type { ActiveMapping, BugOutboxState, BugPipelineServerClient, OutboxItem, OutboxPayload } from "./server-client.ts"
import { BugPipelineServerError } from "./server-client.ts"

/**
 * Outbox 执行器：从 server 读 queued 操作 → 落到 GitHub → 回写结果。
 *
 * 关键口径（spec §17.2）：GET 可安全退避重试；create issue / comment 这类非幂等写入在
 * 超时、5xx 时进入 `unknown_effect` 交给对账，不盲目重发；标签只做受管名称的增删，
 * 绝不全量 PATCH `labels`（会删掉维护者人工标签）。
 */

export type OutboxLogger = (event: string, payload?: unknown) => void

export type OutboxDeps = {
    server: BugPipelineServerClient
    github: GithubClient
    registry: RepoRegistry
    /** 仓库维度的 installation token（惰性解析 + 过期缓存）。 */
    tokenFor: (owner: string, repo: string) => Promise<string>
    /** 401 后作废该仓库缓存 token，下一次请求重新签发。 */
    invalidateToken?: (owner: string, repo: string) => void
    log?: OutboxLogger
    now?: () => number
    maxAttempts?: number
}

export type OutboxFlushResult = {
    read: number
    delivered: number
    retryWait: number
    unknownEffect: number
    blocked: number
    conflict: number
    failed: number
}

type FailureState = Extract<BugOutboxState, "retry_wait" | "unknown_effect" | "blocked" | "conflict" | "failed">

/** payload 结构不符合操作要求：永久失败，不重试。 */
class OutboxPayloadError extends Error {}

/** 仓库未在允许列表、操作未知等需要人工介入的情况。 */
class OutboxBlockedError extends Error {}

/** 远端内容与本站基线不一致（例如评论被人手改），保留冲突不覆盖。 */
class OutboxConflictError extends Error {}

/** 依赖的前置状态还没就绪（例如 Issue 还没创建好），按 retry_wait 处理。 */
class OutboxPendingError extends Error {}

/** 一次出站操作解析出的目标。 */
type Target = {
    repo: ResolvedRepo
    mapping: ActiveMapping | null
    payload: OutboxPayload
}

type ExecuteContext = {
    deps: OutboxDeps
    item: OutboxItem
    target: Target
    token: () => Promise<string>
    onUnauthorized: () => void
}

/**
 * 执行一轮 outbox。
 * @param {OutboxDeps} deps
 * @param {{ limit?: number }} options
 * @returns {Promise<OutboxFlushResult>}
 */
export async function flushOutboxOnce(deps: OutboxDeps, options: { limit?: number } = {}): Promise<OutboxFlushResult> {
    const items = await deps.server.readOutbox({ state: "queued", limit: options.limit ?? 10 })
    const result: OutboxFlushResult = {
        read: items.length,
        delivered: 0,
        retryWait: 0,
        unknownEffect: 0,
        blocked: 0,
        conflict: 0,
        failed: 0,
    }

    let mappingIndex: Map<string, ActiveMapping> | null = null
    const mappings = async () => {
        if (!mappingIndex) {
            const rows = await deps.server.readActiveMappings({ limit: 500 })
            mappingIndex = new Map(rows.map(row => [row.bugId, row]))
        }
        return mappingIndex
    }

    for (const item of items) {
        const outcome = await handleItem(deps, item, mappings)
        if (outcome === "delivered") result.delivered++
        else if (outcome === "retry_wait") result.retryWait++
        else if (outcome === "unknown_effect") result.unknownEffect++
        else if (outcome === "blocked") result.blocked++
        else if (outcome === "conflict") result.conflict++
        else result.failed++
    }

    deps.log?.("outbox.flush", result)
    return result
}

/**
 * @param {OutboxDeps} deps
 * @param {OutboxItem} item
 * @param {() => Promise<Map<string, ActiveMapping>>} mappings
 * @returns {Promise<"delivered" | FailureState>}
 */
async function handleItem(
    deps: OutboxDeps,
    item: OutboxItem,
    mappings: () => Promise<Map<string, ActiveMapping>>
): Promise<"delivered" | FailureState> {
    let target: Target
    try {
        target = await resolveTarget(deps, item, mappings)
    } catch (error) {
        if (error instanceof BugPipelineServerError) throw error
        return classifyFailure(deps, item, null, error)
    }

    try {
        const result = await executeOperation({
            deps,
            item,
            target,
            token: () => deps.tokenFor(target.repo.owner, target.repo.repo),
            onUnauthorized: () => deps.invalidateToken?.(target.repo.owner, target.repo.repo),
        })
        await deps.server.completeOutbox({
            eventId: item.eventId,
            operation: item.operation,
            targetMapping: item.targetMapping,
            result: { state: "delivered", ...result },
        })
        deps.log?.("outbox.delivered", { eventId: item.eventId, operation: item.operation })
        return "delivered"
    } catch (error) {
        if (error instanceof BugPipelineServerError) throw error
        return classifyFailure(deps, item, target, error)
    }
}

/**
 * 解析出站目标：仓库坐标只来自 allowlist / 已映射 Issue，不从 payload 或用户内容读取。
 * @param {OutboxDeps} deps
 * @param {OutboxItem} item
 * @param {() => Promise<Map<string, ActiveMapping>>} mappings
 * @returns {Promise<Target>}
 */
async function resolveTarget(deps: OutboxDeps, item: OutboxItem, mappings: () => Promise<Map<string, ActiveMapping>>): Promise<Target> {
    const payload: OutboxPayload = item.payload && typeof item.payload === "object" ? item.payload : {}
    const bugId = readOptionalString(payload, "bugId") ?? readOptionalString(payload.bug ?? {}, "id")

    let mapping: ActiveMapping | null = null
    if (bugId) mapping = (await mappings()).get(bugId) ?? null

    const repo =
        deps.registry.resolveTargetMapping(item.targetMapping) ??
        (mapping ? deps.registry.byRepositoryId(mapping.repositoryId) : null) ??
        // 标签类操作的 targetMapping 是 label 名；没有映射时退回唯一允许仓库，让后续以 pending 处理。
        (item.targetMapping.startsWith("repo:") ? null : deps.registry.resolveTargetMapping(`repo:${BUG_ISSUE_TARGET_FALLBACK}`))
    if (!repo) throw new OutboxBlockedError(`repository_not_allowlisted:${item.targetMapping}`)

    return { repo, mapping, payload }
}

/**
 * @param {ExecuteContext} context
 * @returns {Promise<Record<string, unknown>>}
 */
async function executeOperation(context: ExecuteContext): Promise<Record<string, unknown>> {
    switch (context.item.operation) {
        case "create_issue":
            return createIssue(context)
        case "create_comment":
        case "comment":
            return createComment(context)
        case "edit_comment":
            return editComment(context)
        case "delete_comment":
            return deleteComment(context)
        case "close_issue":
            return setIssueState(context, "closed")
        case "reopen_issue":
            return setIssueState(context, "open")
        case "label_add":
        case "add_label":
            return addLabel(context)
        case "label_remove":
        case "remove_label":
            return removeLabel(context)
        case "update_labels":
            return updateLabels(context)
        default:
            throw new OutboxBlockedError(`unsupported_operation:${context.item.operation}`)
    }
}

/**
 * @param {ExecuteContext} context
 * @returns {Promise<Record<string, unknown>>}
 */
async function createIssue(context: ExecuteContext): Promise<Record<string, unknown>> {
    const { target, item, deps } = context
    const bug = target.payload.bug
    const explicitTitle = readOptionalString(target.payload, "title")
    if (!bug && !explicitTitle) throw new OutboxPayloadError("create_issue 缺少 Bug 投影或显式标题")

    const labels = Array.isArray(target.payload.labels) ? target.payload.labels : bug ? computeLabels(bug) : []
    const title = explicitTitle ?? computeIssueTitle(bug!)
    const body = readOptionalString(target.payload, "body") ?? (bug ? computeIssueBody(bug, { eventId: item.eventId, labels }) : "")

    const data = await deps.github.request("POST", repoPath(target.repo, "/issues"), {
        body: { title, body, ...(labels.length ? { labels } : {}) },
        token: await context.token(),
        onUnauthorized: context.onUnauthorized,
        idempotent: false,
    })

    const issueId = String(data?.id ?? "")
    const issueNumber = Number(data?.number ?? Number.NaN)
    if (!issueId || !Number.isFinite(issueNumber) || issueNumber <= 0) throw new OutboxPayloadError("create_issue 响应缺少 issue id/number")
    const htmlUrl = String(data?.html_url ?? "")

    const applied = labels.length ? await readIssueLabels(context, issueNumber) : []
    const missingLabels = labels.filter(label => !applied.includes(label))

    return {
        issue: {
            repositoryId: target.repo.repositoryId,
            issueId,
            issueNodeId: data?.node_id ?? null,
            issueNumber,
            htmlUrl,
            remoteState: "open",
        },
        remoteResult: {
            issueId,
            issueNumber,
            htmlUrl,
            appliedLabels: applied.filter(label => labels.includes(label)),
            missingLabels,
        },
    }
}

/**
 * @param {ExecuteContext} context
 * @returns {Promise<Record<string, unknown>>}
 */
async function createComment(context: ExecuteContext): Promise<Record<string, unknown>> {
    const { target, item } = context
    const body = readOptionalString(target.payload, "body") ?? readOptionalString(target.payload.eventPayload ?? {}, "body")
    if (!body) throw new OutboxPayloadError("create_comment 缺少正文")
    const issueNumber = resolveIssueNumber(context)
    const issueId = target.mapping?.issueId
    const discussionEntryId =
        readOptionalString(target.payload, "discussionEntryId") ?? readOptionalString(target.payload.eventPayload ?? {}, "entryId")
    // 没有 discussionEntryId 就无法回写映射：先失败，避免产生无法双向同步的孤儿评论。
    if (!discussionEntryId) throw new OutboxPayloadError("create_comment 缺少 discussionEntryId")
    if (!issueId) throw new OutboxPendingError("create_comment 缺少 Issue 映射")

    const data = await context.deps.github.request("POST", repoPath(target.repo, `/issues/${issueNumber}/comments`), {
        body: { body },
        token: await context.token(),
        onUnauthorized: context.onUnauthorized,
        idempotent: false,
    })
    const commentId = String(data?.id ?? "")
    if (!commentId) throw new OutboxPayloadError("create_comment 响应缺少 comment id")
    const lastRemoteHash = sha256Hex(body)

    return {
        comment: {
            discussionEntryId,
            repositoryId: target.repo.repositoryId,
            issueId,
            commentId,
            sourceOrigin: "local",
            lastRemoteHash,
        },
        remoteResult: {
            commentId,
            issueNumber,
            htmlUrl: String(data?.html_url ?? ""),
            remoteHash: lastRemoteHash,
            eventKind: item.payload?.eventKind ?? null,
        },
    }
}

/**
 * @param {ExecuteContext} context
 * @returns {Promise<Record<string, unknown>>}
 */
async function editComment(context: ExecuteContext): Promise<Record<string, unknown>> {
    const commentId = readRequiredString(context.target.payload, "commentId")
    const body = readRequiredString(context.target.payload, "body")
    const expectedRemoteHash = readOptionalString(context.target.payload, "expectedRemoteHash")
    const token = await context.token()

    if (expectedRemoteHash) {
        const current = await context.deps.github.request("GET", repoPath(context.target.repo, `/issues/comments/${commentId}`), { token })
        const currentHash = sha256Hex(String(current?.body ?? ""))
        if (currentHash !== expectedRemoteHash) {
            throw new OutboxConflictError(`评论已被远端改写，放弃覆盖: comment=${commentId}`)
        }
    }

    const data = await context.deps.github.request("PATCH", repoPath(context.target.repo, `/issues/comments/${commentId}`), {
        body: { body },
        token,
        onUnauthorized: context.onUnauthorized,
        idempotent: true,
    })
    const lastRemoteHash = sha256Hex(body)
    return {
        remoteResult: { commentId, htmlUrl: String(data?.html_url ?? ""), remoteHash: lastRemoteHash },
    }
}

/**
 * @param {ExecuteContext} context
 * @returns {Promise<Record<string, unknown>>}
 */
async function deleteComment(context: ExecuteContext): Promise<Record<string, unknown>> {
    const commentId = readRequiredString(context.target.payload, "commentId")
    try {
        await context.deps.github.request("DELETE", repoPath(context.target.repo, `/issues/comments/${commentId}`), {
            token: await context.token(),
            onUnauthorized: context.onUnauthorized,
            idempotent: true,
        })
    } catch (error) {
        if (!(error instanceof GithubApiError) || error.status !== 404) throw error
        return { remoteResult: { commentId, alreadyAbsent: true } }
    }
    return { remoteResult: { commentId, alreadyAbsent: false } }
}

/**
 * @param {ExecuteContext} context
 * @param {"open" | "closed"} state
 * @returns {Promise<Record<string, unknown>>}
 */
async function setIssueState(context: ExecuteContext, state: "open" | "closed"): Promise<Record<string, unknown>> {
    const issueNumber = resolveIssueNumber(context)
    const stateReason = readOptionalString(context.target.payload, "stateReason")
    const body: Record<string, unknown> = { state }
    if (state === "closed" && stateReason) body.state_reason = normalizeStateReason(stateReason)

    const data = await context.deps.github.request("PATCH", repoPath(context.target.repo, `/issues/${issueNumber}`), {
        body,
        token: await context.token(),
        onUnauthorized: context.onUnauthorized,
        idempotent: true,
    })
    const remoteState = String(data?.state ?? "")
    if (remoteState !== state) throw new Error(`Issue 状态核验失败: 期望 ${state}，实际 ${remoteState || "unknown"}`)
    return { remoteResult: { issueNumber, state: remoteState, stateReason: data?.state_reason ?? null } }
}

/**
 * @param {ExecuteContext} context
 * @returns {Promise<Record<string, unknown>>}
 */
async function addLabel(context: ExecuteContext): Promise<Record<string, unknown>> {
    const issueNumber = resolveIssueNumber(context)
    const label = resolveLabelName(context)
    const token = await context.token()

    await context.deps.github.request("POST", repoPath(context.target.repo, `/issues/${issueNumber}/labels`), {
        body: { labels: [label] },
        token,
        onUnauthorized: context.onUnauthorized,
        idempotent: true,
    })
    const applied = await readIssueLabels(context, issueNumber)
    const present = applied.includes(label)
    return { remoteResult: { issueNumber, label, applied: present, missingLabels: present ? [] : [label] } }
}

/**
 * @param {ExecuteContext} context
 * @returns {Promise<Record<string, unknown>>}
 */
async function removeLabel(context: ExecuteContext): Promise<Record<string, unknown>> {
    const issueNumber = resolveIssueNumber(context)
    const label = resolveLabelName(context)
    const token = await context.token()

    try {
        await context.deps.github.request(
            "DELETE",
            repoPath(context.target.repo, `/issues/${issueNumber}/labels/${encodeURIComponent(label)}`),
            {
                token,
                onUnauthorized: context.onUnauthorized,
                idempotent: true,
            }
        )
    } catch (error) {
        if (!(error instanceof GithubApiError) || error.status !== 404) throw error
    }
    const applied = await readIssueLabels(context, issueNumber)
    return { remoteResult: { issueNumber, label, removed: !applied.includes(label) } }
}

/**
 * 逐条增删受管标签；全量 `PATCH labels` 会抹掉维护者人工标签，这里绝不使用。
 * @param {ExecuteContext} context
 * @returns {Promise<Record<string, unknown>>}
 */
async function updateLabels(context: ExecuteContext): Promise<Record<string, unknown>> {
    const issueNumber = resolveIssueNumber(context)
    const add = readStringArray(context.target.payload, "add")
    const remove = readStringArray(context.target.payload, "remove")
    if (!add.length && !remove.length) throw new OutboxPayloadError("update_labels 未提供 add/remove")
    const token = await context.token()

    const before = await readIssueLabels(context, issueNumber)
    for (const label of remove) {
        if (!before.includes(label)) continue
        try {
            await context.deps.github.request(
                "DELETE",
                repoPath(context.target.repo, `/issues/${issueNumber}/labels/${encodeURIComponent(label)}`),
                {
                    token,
                    onUnauthorized: context.onUnauthorized,
                    idempotent: true,
                }
            )
        } catch (error) {
            if (!(error instanceof GithubApiError) || error.status !== 404) throw error
        }
    }

    const afterRemove = await readIssueLabels(context, issueNumber)
    for (const label of add) {
        if (afterRemove.includes(label)) continue
        await context.deps.github.request("POST", repoPath(context.target.repo, `/issues/${issueNumber}/labels`), {
            body: { labels: [label] },
            token,
            onUnauthorized: context.onUnauthorized,
            idempotent: true,
        })
    }

    const after = await readIssueLabels(context, issueNumber)
    return {
        remoteResult: {
            issueNumber,
            labels: after,
            added: add.filter(label => after.includes(label)),
            missingLabels: add.filter(label => !after.includes(label)),
            removed: remove.filter(label => !after.includes(label)),
            stillPresent: remove.filter(label => after.includes(label)),
        },
    }
}

/**
 * Issue 编号只来自显式 payload 或 server 的映射，不做任何推断。
 * @param {ExecuteContext} context
 * @returns {number}
 */
function resolveIssueNumber(context: ExecuteContext): number {
    const explicit = Number(context.target.payload.issueNumber)
    if (Number.isFinite(explicit) && explicit > 0) return explicit
    const mapped = context.target.mapping?.issueNumber
    if (mapped && Number.isFinite(mapped) && mapped > 0) return mapped
    if (context.target.mapping) throw new OutboxPayloadError("Issue 映射缺少有效 issueNumber")
    // 映射还没建立（create_issue 仍在队列）：按可重试处理，最多退避到 maxAttempts。
    throw new OutboxPendingError("Issue 尚未创建，等待映射")
}

/**
 * 标签操作由 server 把 label 名称放在 `targetMapping` 上（见 tags.ts 的出站写法）。
 * @param {ExecuteContext} context
 * @returns {string}
 */
function resolveLabelName(context: ExecuteContext): string {
    const explicit = readOptionalString(context.target.payload, "label")
    if (explicit) return explicit
    if (!context.item.targetMapping.startsWith("repo:")) return context.item.targetMapping
    throw new OutboxPayloadError("缺少 label 名称")
}

/**
 * 完整分页读取 Issue 的当前标签集合。
 * @param {ExecuteContext} context
 * @param {number} issueNumber
 * @returns {Promise<string[]>}
 */
async function readIssueLabels(context: ExecuteContext, issueNumber: number): Promise<string[]> {
    const token = await context.token()
    const names: string[] = []
    for await (const page of context.deps.github.paginate<{ name?: unknown }>(
        repoPath(context.target.repo, `/issues/${issueNumber}/labels`),
        {
            token,
            onUnauthorized: context.onUnauthorized,
        }
    )) {
        for (const label of page) {
            if (typeof label?.name === "string") names.push(label.name)
        }
    }
    return names
}

/**
 * @param {OutboxDeps} deps
 * @param {OutboxItem} item
 * @param {Target | null} target
 * @param {unknown} error
 * @returns {Promise<FailureState>}
 */
async function classifyFailure(deps: OutboxDeps, item: OutboxItem, target: Target | null, error: unknown): Promise<FailureState> {
    const message = error instanceof Error ? error.message : String(error)
    const now = deps.now?.() ?? Date.now()

    if (error instanceof OutboxPayloadError) return completeItem(deps, item, target, "failed", message)
    if (error instanceof OutboxBlockedError) return completeItem(deps, item, target, "blocked", message)
    if (error instanceof OutboxConflictError) return completeItem(deps, item, target, "conflict", message)
    if (error instanceof OutboxPendingError)
        return completeItem(deps, item, target, "retry_wait", message, { retryAt: now + backoffMs(item.attempt) })

    if (error instanceof GithubApiError) {
        if (error.unknownEffect) return completeItem(deps, item, target, "unknown_effect", message)
        if (error.rateLimited || error.secondaryRateLimited) {
            const retryAfterMs = error.retryAfterMs ?? backoffMs(item.attempt)
            return completeItem(deps, item, target, "retry_wait", message, { retryAt: now + retryAfterMs })
        }
        if (error.status === 0 || error.status >= 500) return retryOrFail(deps, item, target, message, now)
        // 401（刷新后仍失败）/ 403 权限 / 404 / 422：重试无意义，停下来告警。
        return completeItem(deps, item, target, "blocked", message)
    }

    return retryOrFail(deps, item, target, message, now)
}

/**
 * @param {OutboxDeps} deps
 * @param {OutboxItem} item
 * @param {Target | null} target
 * @param {string} message
 * @param {number} now
 * @returns {Promise<FailureState>}
 */
async function retryOrFail(deps: OutboxDeps, item: OutboxItem, target: Target | null, message: string, now: number): Promise<FailureState> {
    const maxAttempts = deps.maxAttempts ?? 8
    if ((item.attempt ?? 0) + 1 >= maxAttempts) return completeItem(deps, item, target, "failed", message)
    return completeItem(deps, item, target, "retry_wait", message, { retryAt: now + backoffMs(item.attempt) })
}

/**
 * @param {OutboxDeps} deps
 * @param {OutboxItem} item
 * @param {Target | null} target
 * @param {FailureState} state
 * @param {string} message
 * @param {{ retryAt?: number }} extra
 * @returns {Promise<FailureState>}
 */
async function completeItem(
    deps: OutboxDeps,
    item: OutboxItem,
    target: Target | null,
    state: FailureState,
    message: string,
    extra: { retryAt?: number } = {}
): Promise<FailureState> {
    await deps.server.completeOutbox({
        eventId: item.eventId,
        operation: item.operation,
        targetMapping: item.targetMapping,
        result: {
            state,
            retryAt: extra.retryAt,
            lastError: message.slice(0, 2000),
            remoteResult: target ? { repositoryId: target.repo.repositoryId, operation: item.operation } : undefined,
        },
    })
    deps.log?.(`outbox.${state}`, { eventId: item.eventId, operation: item.operation, error: message })
    return state
}

/**
 * @param {number} attempt
 * @returns {number}
 */
function backoffMs(attempt: number): number {
    return Math.min(15 * 60 * 1000, 5000 * 2 ** Math.max(0, attempt))
}

/**
 * @param {ResolvedRepo} repo
 * @param {string} suffix
 * @returns {string}
 */
function repoPath(repo: ResolvedRepo, suffix: string): string {
    return `/repos/${repo.owner}/${repo.repo}${suffix}`
}

/**
 * @param {string} stateReason
 * @returns {string}
 */
function normalizeStateReason(stateReason: string): string {
    return stateReason === "completed" || stateReason === "not_planned" || stateReason === "duplicate" ? stateReason : "not_planned"
}

/**
 * @param {string} text
 * @returns {string}
 */
function sha256Hex(text: string): string {
    return createHash("sha256").update(text, "utf8").digest("hex")
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} key
 * @returns {string}
 */
function readRequiredString(payload: Record<string, unknown>, key: string): string {
    const value = payload[key]
    if (typeof value !== "string" || !value) throw new OutboxPayloadError(`payload.${key} 必须是非空字符串`)
    return value
}

/**
 * @param {Record<string, any>} payload
 * @param {string} key
 * @returns {string | null}
 */
function readOptionalString(payload: Record<string, any>, key: string): string | null {
    const value = payload[key]
    if (value === undefined || value === null) return null
    return typeof value === "string" && value ? value : null
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} key
 * @returns {string[]}
 */
function readStringArray(payload: Record<string, unknown>, key: string): string[] {
    const value = payload[key]
    if (value === undefined || value === null) return []
    if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item)) {
        throw new OutboxPayloadError(`payload.${key} 必须是字符串数组`)
    }
    return value as string[]
}
