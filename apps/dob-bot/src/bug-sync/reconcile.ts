import { createHash } from "node:crypto"
import { GithubApiError } from "./github/client.ts"
import type { OutboxDeps } from "./outbox.ts"
import type { ActiveMapping, DriftReport } from "./server-client.ts"

/**
 * 对账：按映射回查 GitHub，把状态 / 标签 / 评论的漂移上报给 server 由领域层纠正。
 *
 * Bridge 只负责「发现差异并如实上报」，不直接改本站数据；GitHub 侧只读，
 * 避免对账本身变成会覆盖维护者操作的写路径（spec §17.3）。
 */

export type ReconcileResult = {
    mappings: number
    checked: number
    drifted: number
    skipped: number
    errors: number
}

type RemoteComment = {
    id: string
    body: string
}

/**
 * 跑一轮对账；`limit` 控制单轮处理量，每日全量扫描用更大的批量。
 * @param {OutboxDeps} deps
 * @param {{ limit?: number }} options
 * @returns {Promise<ReconcileResult>}
 */
export async function reconcileOnce(deps: OutboxDeps, options: { limit?: number } = {}): Promise<ReconcileResult> {
    const limit = options.limit ?? 200
    const mappings = await deps.server.readActiveMappings({ limit })
    const target = mappings.slice(0, limit)
    const result: ReconcileResult = { mappings: mappings.length, checked: 0, drifted: 0, skipped: 0, errors: 0 }

    for (const mapping of target) {
        const repo = deps.registry.byRepositoryId(mapping.repositoryId)
        if (!repo) {
            deps.log?.("reconcile.skipped", { issueLinkId: mapping.issueLinkId, repositoryId: mapping.repositoryId })
            result.skipped++
            continue
        }

        const onUnauthorized = () => deps.invalidateToken?.(repo.owner, repo.repo)
        const issuePath = `/repos/${repo.owner}/${repo.repo}/issues/${mapping.issueNumber}`
        const report = (drift: Omit<DriftReport, "issueLinkId">) => deps.server.reportDrift({ issueLinkId: mapping.issueLinkId, ...drift })

        try {
            // token 生成也可能失败（App 被卸载 / 私钥轮换），一并算作该映射的错误而不是中断整轮。
            const token = await deps.tokenFor(repo.owner, repo.repo)
            const issue = await deps.github.request("GET", issuePath, { token, onUnauthorized })
            const drifts = await collectDrifts(deps, mapping, issue, issuePath, token, onUnauthorized)
            for (const drift of drifts) await report(drift)
            result.checked++
            if (drifts.length) {
                result.drifted++
                deps.log?.("reconcile.drift", { issueLinkId: mapping.issueLinkId, types: drifts.map(drift => drift.driftType) })
            }
        } catch (error) {
            if (error instanceof GithubApiError && error.status === 404) {
                await report({ driftType: "issue_missing", expected: { issueNumber: mapping.issueNumber }, actual: { status: 404 } })
                result.drifted++
                continue
            }
            if (error instanceof GithubApiError && (error.status === 401 || error.status === 403)) {
                // App 被卸载 / 权限被收回：暂停该映射的同步，但不伪造成功（spec §17.3）。
                await report({
                    driftType: "access_denied",
                    expected: { issueNumber: mapping.issueNumber },
                    actual: { status: error.status },
                })
                result.drifted++
                continue
            }
            result.errors++
            deps.log?.("reconcile.error", {
                issueLinkId: mapping.issueLinkId,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }

    deps.log?.("reconcile.done", result)
    return result
}

/**
 * @param {OutboxDeps} deps
 * @param {ActiveMapping} mapping
 * @param {any} issue
 * @param {string} issuePath
 * @param {string} token
 * @param {() => void} onUnauthorized
 * @returns {Promise<Array<Omit<DriftReport, "issueLinkId">>>}
 */
async function collectDrifts(
    deps: OutboxDeps,
    mapping: ActiveMapping,
    issue: any,
    issuePath: string,
    token: string,
    onUnauthorized: () => void
): Promise<Array<Omit<DriftReport, "issueLinkId">>> {
    const drifts: Array<Omit<DriftReport, "issueLinkId">> = []

    const remoteState = typeof issue?.state === "string" ? issue.state : null
    if (mapping.remoteState && remoteState && remoteState !== mapping.remoteState) {
        drifts.push({
            driftType: "remote_state_changed",
            expected: { state: mapping.remoteState, stateReason: mapping.remoteStateReason ?? null },
            actual: { state: remoteState, stateReason: issue?.state_reason ?? null },
        })
    }

    if (mapping.expectedLabels) {
        // 只比对受管 namespace：维护者人工打的标签不算漂移，漏掉的受管标签才算。
        const expected = [...mapping.expectedLabels].sort()
        const remote = await readAllLabels(deps, issuePath, token, onUnauthorized)
        const missing = expected.filter(label => !remote.includes(label))
        const managed = new Set(mapping.managedLabels ?? [])
        const unmapped = remote.filter(label => managed.has(label) && !expected.includes(label)).sort()
        if (missing.length || unmapped.length) {
            drifts.push({
                driftType: "labels_changed",
                expected: { labels: expected },
                actual: { labels: [...remote].sort(), missing, unexpected: unmapped },
            })
        }
    }

    if (mapping.comments) {
        const remoteComments = await readAllComments(deps, issuePath, token, onUnauthorized)
        const missing = mapping.comments
            .filter(comment => !comment.deletedAt)
            .filter(comment => !remoteComments.has(comment.commentId))
            .map(comment => comment.commentId)
        if (missing.length) {
            drifts.push({
                driftType: "comments_missing",
                expected: { commentIds: missing.slice(0, 50), total: missing.length },
                actual: { remoteTotal: remoteComments.size },
            })
        }

        const edited = mapping.comments
            .filter(comment => !comment.deletedAt && comment.lastRemoteHash)
            .map(comment => {
                const remote = remoteComments.get(comment.commentId)
                if (!remote) return null
                const actualHash = sha256Hex(remote.body)
                if (actualHash === comment.lastRemoteHash) return null
                return { commentId: comment.commentId, expectedHash: comment.lastRemoteHash, actualHash }
            })
            .filter((item): item is { commentId: string; expectedHash: string; actualHash: string } => item !== null)
        if (edited.length) {
            drifts.push({
                driftType: "comment_edited",
                expected: { comments: edited.slice(0, 50), total: edited.length },
                actual: { source: "github" },
            })
        }
    }

    return drifts
}

/**
 * @param {OutboxDeps} deps
 * @param {string} issuePath
 * @param {string} token
 * @param {() => void} onUnauthorized
 * @returns {Promise<string[]>}
 */
async function readAllLabels(deps: OutboxDeps, issuePath: string, token: string, onUnauthorized: () => void): Promise<string[]> {
    const labels: string[] = []
    for await (const page of deps.github.paginate<{ name?: unknown }>(`${issuePath}/labels`, { token, onUnauthorized })) {
        for (const label of page) {
            if (typeof label?.name === "string") labels.push(label.name)
        }
    }
    return labels
}

/**
 * 完整分页读取评论（per_page=100 逐页直到不足一页），不会只看前 100 条。
 * @param {OutboxDeps} deps
 * @param {string} issuePath
 * @param {string} token
 * @param {() => void} onUnauthorized
 * @returns {Promise<Map<string, RemoteComment>>}
 */
async function readAllComments(
    deps: OutboxDeps,
    issuePath: string,
    token: string,
    onUnauthorized: () => void
): Promise<Map<string, RemoteComment>> {
    const comments = new Map<string, RemoteComment>()
    for await (const page of deps.github.paginate<{ id?: unknown; body?: unknown }>(`${issuePath}/comments`, { token, onUnauthorized })) {
        for (const comment of page) {
            const id = comment?.id === undefined ? "" : String(comment.id)
            if (!id) continue
            comments.set(id, { id, body: typeof comment.body === "string" ? comment.body : "" })
        }
    }
    return comments
}

/**
 * @param {string} text
 * @returns {string}
 */
function sha256Hex(text: string): string {
    return createHash("sha256").update(text, "utf8").digest("hex")
}
