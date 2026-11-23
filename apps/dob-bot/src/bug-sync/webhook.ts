import { createHmac, timingSafeEqual } from "node:crypto"
import { Elysia } from "elysia"
import type { BugSyncConfig } from "./config.ts"
import type { RepoRegistry } from "./repo-registry.ts"
import type { InboxWriteInput } from "./server-client.ts"

/**
 * GitHub Webhook 接收端。
 *
 * 对原始请求字节验签（不重新序列化），通过 repository allowlist 后把 delivery 交给 server
 * `/internal/bug-pipeline/inbox/write` 持久化；只有落库成功才回 2xx——server 不可达时回 503，
 * 让 GitHub 重投，绝不假 ACK（spec §17.1）。
 */

const SIGNATURE_HEADER = "x-hub-signature-256"

/** 与 server 侧同口径：GitHub 投递远小于 1MB，超限直接拒绝。 */
const MAX_WEBHOOK_BYTES = 1024 * 1024

/** 需要落 Inbox 的事件；其他事件确认后忽略，不启动任何下游处理。 */
const HANDLED_EVENTS = new Set(["issues", "issue_comment", "label", "installation", "installation_repositories"])

export type WebhookLogger = (event: string, payload?: unknown) => void

export type WebhookDeps = {
    config: Pick<BugSyncConfig, "webhookSecret" | "webhookHost" | "webhookPort" | "webhookPath">
    registry: Pick<RepoRegistry, "isAllowed">
    server: { writeInbox: (input: InboxWriteInput) => Promise<{ ok: boolean; duplicate: boolean }> }
    log?: WebhookLogger
}

type RepoIdentity = { repositoryId: string | null; fullName: string | null }

/**
 * 校验 GitHub Webhook 签名：对原始字节做 HMAC-SHA256，与 `x-hub-signature-256` 恒定时间比较。
 * @param {string} secret
 * @param {Uint8Array} rawBody
 * @param {string | null | undefined} signature
 * @returns {boolean}
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

/**
 * 创建 Webhook 应用（test 用 `app.handle(new Request(...))`，生产用 `listen`）。
 * @param {WebhookDeps} deps
 * @returns {Elysia}
 */
export function createWebhookApp(deps: WebhookDeps) {
    const log = deps.log

    return new Elysia()
        .get("/health", () => ({ ok: true, service: "bug-sync" }))
        .post(deps.config.webhookPath, async ({ request, set }) => {
            const declaredLength = Number(request.headers.get("content-length") ?? "")
            if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
                set.status = 413
                return { ok: false, error: "payload too large" }
            }

            const rawBody = new Uint8Array(await request.arrayBuffer())
            if (rawBody.byteLength > MAX_WEBHOOK_BYTES) {
                set.status = 413
                return { ok: false, error: "payload too large" }
            }

            if (!verifyGithubSignature(deps.config.webhookSecret, rawBody, request.headers.get(SIGNATURE_HEADER))) {
                set.status = 401
                return { ok: false, error: "invalid signature" }
            }

            const event = request.headers.get("x-github-event") ?? ""
            const deliveryId = request.headers.get("x-github-delivery") ?? ""
            if (!event || !deliveryId) {
                set.status = 400
                return { ok: false, error: "missing github headers" }
            }

            const payload = tryParseJson(rawBody)
            if (payload === null) {
                set.status = 400
                return { ok: false, error: "invalid json" }
            }

            if (event === "ping") {
                return { ok: true, event, delivery: deliveryId, zen: readZen(payload) }
            }

            const candidates = readRepositoryCandidates(payload)
            const accepted = candidates.find(candidate => deps.registry.isAllowed(candidate)) ?? null
            if (!accepted) {
                // 非 allowlist 仓库回 200：不给 GitHub 制造无意义重试，交付结果用 accepted 标记。
                log?.("webhook.rejected", { event, deliveryId, candidates })
                return { ok: true, accepted: false, event, delivery: deliveryId }
            }

            if (!HANDLED_EVENTS.has(event)) {
                return { ok: true, accepted: true, ignored: true, event, delivery: deliveryId }
            }

            const action = readAction(payload)
            if (!action || !accepted.repositoryId) {
                // server 侧 action / repositoryId 为必填：缺字段时不写、也不让 GitHub 无限重投。
                log?.("webhook.missing_fields", { event, deliveryId, action, repositoryId: accepted.repositoryId })
                return { ok: true, accepted: false, event, delivery: deliveryId, reason: "missing_action_or_repository" }
            }

            try {
                const result = await deps.server.writeInbox({
                    deliveryId,
                    event,
                    action,
                    repositoryId: accepted.repositoryId,
                    installationId: readInstallationId(payload),
                    payload,
                })
                log?.("webhook.accepted", { event, deliveryId, duplicate: result.duplicate })
                return { ok: true, accepted: true, event, action, delivery: deliveryId, duplicate: result.duplicate }
            } catch (error) {
                // 落库失败 / server 不可达：不假 ACK，交给 GitHub 重投。
                log?.("webhook.unavailable", { event, deliveryId, error: error instanceof Error ? error.message : String(error) })
                set.status = 503
                return { ok: false, error: "inbox unavailable" }
            }
        })
}

/**
 * 启动 Webhook 服务并常驻。
 * @param {WebhookDeps} deps
 * @returns {Promise<void>}
 */
export async function startWebhookServer(deps: WebhookDeps): Promise<void> {
    const app = createWebhookApp(deps)
    app.listen({ port: deps.config.webhookPort, hostname: deps.config.webhookHost })
    console.log(`bug-sync webhook listening on http://${deps.config.webhookHost}:${deps.config.webhookPort}${deps.config.webhookPath}`)
    await new Promise(() => {})
}

/**
 * 取 payload 里所有可能的目标仓库（installation 类事件把仓库放在数组里）。
 * @param {unknown} payload
 * @returns {RepoIdentity[]}
 */
function readRepositoryCandidates(payload: unknown): RepoIdentity[] {
    const record = toRecord(payload)
    const candidates: RepoIdentity[] = []
    const push = (value: unknown) => {
        const repo = toRecord(value)
        if (!repo) return
        const fullName = typeof repo.full_name === "string" ? repo.full_name : null
        const repositoryId = idOf(repo.id)
        if (!fullName && !repositoryId) return
        candidates.push({ repositoryId, fullName })
    }

    push(record?.repository)
    for (const key of ["repositories", "repositories_added", "repositories_removed"]) {
        const list = record?.[key]
        if (!Array.isArray(list)) continue
        for (const repo of list) push(repo)
    }
    return candidates
}

/**
 * @param {unknown} payload
 * @returns {string | null}
 */
function readAction(payload: unknown): string | null {
    const action = toRecord(payload)?.action
    return typeof action === "string" ? action : null
}

/**
 * @param {unknown} payload
 * @returns {string | null}
 */
function readInstallationId(payload: unknown): string | null {
    return idOf(toRecord(toRecord(payload)?.installation)?.id)
}

/**
 * @param {unknown} payload
 * @returns {string | null}
 */
function readZen(payload: unknown): string | null {
    const zen = toRecord(payload)?.zen
    return typeof zen === "string" ? zen : null
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function idOf(value: unknown): string | null {
    if (typeof value === "string" && value) return value
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
    return null
}

/**
 * @param {unknown} value
 * @returns {Record<string, any> | null}
 */
function toRecord(value: unknown): Record<string, any> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : null
}

/**
 * @param {Uint8Array} rawBody
 * @returns {unknown | null}
 */
function tryParseJson(rawBody: Uint8Array): unknown | null {
    try {
        return JSON.parse(new TextDecoder().decode(rawBody))
    } catch {
        return null
    }
}
