import type { BugSyncConfig } from "./config.ts"
import { loadConfig, loadDotEnv } from "./config.ts"
import type { GithubClient } from "./github/client.ts"
import { createGithubClient } from "./github/client.ts"
import type { InstallationTokenCache } from "./github/installation.ts"
import { createInstallationTokenCache } from "./github/installation.ts"
import type { OutboxDeps, OutboxFlushResult } from "./outbox.ts"
import { flushOutboxOnce } from "./outbox.ts"
import { reconcileOnce } from "./reconcile.ts"
import type { RepoRegistry } from "./repo-registry.ts"
import { createRepoRegistry } from "./repo-registry.ts"
import type { BugPipelineServerClient } from "./server-client.ts"
import { createBugPipelineServerClient } from "./server-client.ts"
import { startWebhookServer } from "./webhook.ts"

/**
 * Bug Bridge 独立入口：`once` 跑一轮 outbox，`loop` 常驻 outbox + 对账，`webhook` 起接收端。
 * 与 dob-bot 代码执行链（runner/codex/scheduler/planner/state）零 import。
 */

const MODES = ["once", "loop", "webhook"] as const

export type BugSyncMode = (typeof MODES)[number]

export type BugSyncApp = {
    config: BugSyncConfig
    github: GithubClient
    tokens: InstallationTokenCache
    registry: RepoRegistry
    server: BugPipelineServerClient
    deps: OutboxDeps
}

/**
 * 统一日志前缀，避免和 dob-bot 的 `[dob-bot]` 混在一起。
 * @param {string} event
 * @param {unknown} payload
 * @returns {void}
 */
export function logBugSync(event: string, payload?: unknown): void {
    if (payload === undefined) {
        console.log(`[bug-sync][${event}]`)
        return
    }
    console.log(`[bug-sync][${event}] ${typeof payload === "string" ? payload : JSON.stringify(payload)}`)
}

/**
 * 组装 client / token 缓存 / 仓库白名单 / server 客户端。
 * @param {BugSyncConfig} config
 * @returns {BugSyncApp}
 */
export function createBugSyncApp(config: BugSyncConfig): BugSyncApp {
    const github = createGithubClient({
        baseUrl: config.githubApiBaseUrl,
        apiVersion: config.apiVersion,
        userAgent: "dob-bug-bridge",
        timeoutMs: config.requestTimeoutMs,
        maxRetryDelayMs: config.maxRetryDelayMs,
    })
    const tokens = createInstallationTokenCache()
    const registry = createRepoRegistry(config)
    const server = createBugPipelineServerClient({
        endpoint: config.serverEndpoint,
        workerToken: config.workerToken,
        workerId: config.workerId,
        timeoutMs: Math.min(config.requestTimeoutMs, 15_000),
    })

    const tokenFor = async (owner: string, repo: string) =>
        (
            await tokens.get({
                client: github,
                appId: config.appId,
                privateKeyPem: config.privateKeyPem,
                installationId: config.installationId ?? undefined,
                owner,
                repo,
            })
        ).token

    const deps: OutboxDeps = {
        server,
        github,
        registry,
        tokenFor,
        invalidateToken: (owner, repo) => tokens.invalidate(owner, repo),
        log: logBugSync,
        maxAttempts: config.maxAttempts,
    }

    return { config, github, tokens, registry, server, deps }
}

/**
 * 解析允许仓库的 repositoryId；失败只告警，不阻塞启动（对应仓库的出站会 blocked）。
 * @param {BugSyncApp} app
 * @returns {Promise<void>}
 */
export async function resolveRepositories(app: BugSyncApp): Promise<void> {
    try {
        const result = await app.registry.resolve(app.github, app.deps.tokenFor)
        logBugSync("repos.resolved", { resolved: result.resolved.length, failed: result.failed.length })
        for (const failure of result.failed) {
            logBugSync("repos.resolve_failed", { entry: failure.entry.fullName, error: failure.error })
        }
    } catch (error) {
        logBugSync("repos.resolve_error", error instanceof Error ? error.message : String(error))
    }
}

/**
 * @param {BugSyncApp} app
 * @returns {Promise<OutboxFlushResult>}
 */
export async function runOnce(app: BugSyncApp): Promise<OutboxFlushResult> {
    return flushOutboxOnce(app.deps, { limit: app.config.outboxBatchSize })
}

/**
 * 常驻循环：outbox 按 `outboxPollMs`；活跃映射按 `reconcileIntervalMs`；全量对账按 `reconcileFullScanMs`。
 * @param {BugSyncApp} app
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
export async function runLoop(app: BugSyncApp, signal: AbortSignal): Promise<void> {
    let nextReconcileAt = Date.now() + app.config.reconcileIntervalMs
    let nextFullScanAt = Date.now()

    while (!signal.aborted) {
        try {
            await runOnce(app)
        } catch (error) {
            logBugSync("loop.outbox_error", error instanceof Error ? error.message : String(error))
        }

        if (Date.now() >= nextFullScanAt) {
            try {
                await reconcileOnce(app.deps, { limit: app.config.reconcileFullScanBatchSize })
            } catch (error) {
                logBugSync("loop.full_scan_error", error instanceof Error ? error.message : String(error))
            }
            nextFullScanAt = Date.now() + app.config.reconcileFullScanMs
        } else if (Date.now() >= nextReconcileAt) {
            try {
                await reconcileOnce(app.deps, { limit: app.config.reconcileBatchSize })
            } catch (error) {
                logBugSync("loop.reconcile_error", error instanceof Error ? error.message : String(error))
            }
            nextReconcileAt = Date.now() + app.config.reconcileIntervalMs
        }

        await sleep(app.config.outboxPollMs, signal)
    }
    logBugSync("loop.stopped")
}

/**
 * @param {number} ms
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise(resolve => {
        if (signal.aborted) {
            resolve()
            return
        }
        const done = () => {
            clearTimeout(timer)
            signal.removeEventListener("abort", done)
            resolve()
        }
        const timer = setTimeout(done, ms)
        signal.addEventListener("abort", done, { once: true })
    })
}

/**
 * @param {BugSyncMode} mode
 * @returns {Promise<void>}
 */
async function main(mode: BugSyncMode): Promise<void> {
    loadDotEnv()
    const config = loadConfig(process.env)
    const app = createBugSyncApp(config)

    if (mode === "webhook") {
        await startWebhookServer({ config, registry: app.registry, server: app.server, log: logBugSync })
        return
    }

    await resolveRepositories(app)

    if (mode === "once") {
        const result = await runOnce(app)
        logBugSync("once.result", result)
        return
    }

    const controller = new AbortController()
    const stop = () => {
        logBugSync("loop.stopping")
        controller.abort()
    }
    process.on("SIGINT", stop)
    process.on("SIGTERM", stop)
    await runLoop(app, controller.signal)
}

if (import.meta.main) {
    const raw = process.argv[2] ?? "once"
    if (!MODES.includes(raw as BugSyncMode)) {
        console.error("用法: bun src/bug-sync/index.ts once|loop|webhook")
        process.exitCode = 2
    } else {
        await main(raw as BugSyncMode)
    }
}
