import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

/**
 * Bug Bridge 独立配置：只读 `BUG_SYNC_*` 与 `GITHUB_BUG_REPOSITORY*`，
 * 与代码执行链的 `DOB_BOT_*` 完全隔离（独立进程 / 独立 App / 独立密钥）。
 */

type EnvSource = Record<string, string | undefined>

export type RepoRef = {
    owner: string
    repo: string
    fullName: string
    /** `owner/repo@123456` 形式的显式 repositoryId，可省掉启动时的解析请求。 */
    repositoryId?: string
}

export type BugSyncConfig = {
    appId: number
    privateKeyPem: string
    installationId: string | null
    webhookSecret: string
    webhookHost: string
    webhookPort: number
    webhookPath: string
    /** 出站目标仓库；`BUG_SYNC_REPO_ALLOWLIST`，缺省时出站会因无法解析仓库坐标而 blocked。 */
    repoAllowlist: RepoRef[]
    /** Webhook 入站允许的 repositoryId；`GITHUB_BUG_REPOSITORY_ID`，与 server 同口径。 */
    repositoryIds: string[]
    serverEndpoint: string
    workerToken: string
    /** worker 身份，写进 drift / 审计事件。 */
    workerId: string
    outboxPollMs: number
    reconcileIntervalMs: number
    reconcileFullScanMs: number
    outboxBatchSize: number
    reconcileBatchSize: number
    reconcileFullScanBatchSize: number
    requestTimeoutMs: number
    maxRetryDelayMs: number
    maxAttempts: number
    githubApiBaseUrl: string
    apiVersion: string
}

/**
 * 读取 dob-bot 目录下的 `.env`（不覆盖已存在的进程环境变量）。
 * @returns {void}
 */
export function loadDotEnv(): void {
    dotenv.config({
        path: fileURLToPath(new URL("../../.env", import.meta.url)),
        quiet: true,
    })
}

/**
 * 解析并校验 `BUG_SYNC_*` 配置。
 * @param {EnvSource} env
 * @returns {BugSyncConfig}
 */
export function loadConfig(env: EnvSource = process.env): BugSyncConfig {
    const repoAllowlist = envCsv(env, "BUG_SYNC_REPO_ALLOWLIST").map(parseRepoEntry)
    const repositoryIds = envCsv(env, "GITHUB_BUG_REPOSITORY_ID").concat(envCsv(env, "GITHUB_BUG_REPOSITORY"))
    if (!repoAllowlist.length && !repositoryIds.length) {
        throw new Error("缺少目标仓库配置: 需要 BUG_SYNC_REPO_ALLOWLIST 或 GITHUB_BUG_REPOSITORY_ID")
    }

    return Object.freeze({
        appId: envIntRequired(env, "BUG_SYNC_APP_ID"),
        privateKeyPem: readPrivateKeyPem(env),
        installationId: envValue(env, "BUG_SYNC_INSTALLATION_ID") ?? null,
        webhookSecret: envRequired(env, "BUG_SYNC_WEBHOOK_SECRET"),
        webhookHost: envValue(env, "BUG_SYNC_WEBHOOK_HOST") ?? "0.0.0.0",
        webhookPort: envInt(env, "BUG_SYNC_WEBHOOK_PORT", 8788),
        webhookPath: normalizePath(envValue(env, "BUG_SYNC_WEBHOOK_PATH") ?? "/bug-sync/webhook"),
        repoAllowlist,
        repositoryIds,
        serverEndpoint: (envValue(env, "BUG_SYNC_SERVER_ENDPOINT") ?? "http://localhost:8887").replace(/\/+$/, ""),
        workerToken: envRequired(env, "BUG_SYNC_WORKER_TOKEN"),
        workerId: envValue(env, "BUG_SYNC_WORKER_ID") ?? "bug-sync-bridge",
        outboxPollMs: envInt(env, "BUG_SYNC_OUTBOX_POLL_MS", 15_000),
        reconcileIntervalMs: envInt(env, "BUG_SYNC_RECONCILE_MS", 900_000),
        reconcileFullScanMs: envInt(env, "BUG_SYNC_FULL_SCAN_MS", 86_400_000),
        outboxBatchSize: envInt(env, "BUG_SYNC_OUTBOX_BATCH_SIZE", 10),
        reconcileBatchSize: envInt(env, "BUG_SYNC_RECONCILE_BATCH_SIZE", 50),
        // server 的 active-mappings 单页上限是 500，全量扫描按上限取。
        reconcileFullScanBatchSize: envInt(env, "BUG_SYNC_FULL_SCAN_BATCH_SIZE", 500),
        requestTimeoutMs: envInt(env, "BUG_SYNC_REQUEST_TIMEOUT_MS", 30_000),
        maxRetryDelayMs: envInt(env, "BUG_SYNC_MAX_RETRY_DELAY_MS", 120_000),
        maxAttempts: envInt(env, "BUG_SYNC_MAX_ATTEMPTS", 8),
        githubApiBaseUrl: envValue(env, "BUG_SYNC_GITHUB_API_BASE_URL") ?? "https://api.github.com",
        apiVersion: envValue(env, "GITHUB_API_VERSION") ?? "2022-11-28",
    })
}

/**
 * @param {EnvSource} env
 * @returns {number}
 */
function envInt(env: EnvSource, name: string, fallback: number): number {
    const raw = envValue(env, name)
    if (!raw) return fallback
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) throw new Error(`环境变量 ${name} 不是有效正数: ${raw}`)
    return Math.trunc(value)
}

/**
 * @param {EnvSource} env
 * @param {string} name
 * @returns {number}
 */
function envIntRequired(env: EnvSource, name: string): number {
    const raw = envValue(env, name)
    if (!raw) throw new Error(`缺少环境变量: ${name}`)
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) throw new Error(`环境变量 ${name} 不是有效正数: ${raw}`)
    return Math.trunc(value)
}

/**
 * @param {EnvSource} env
 * @param {string} name
 * @returns {string | undefined}
 */
function envValue(env: EnvSource, name: string): string | undefined {
    const value = env[name]?.trim()
    return value ? value : undefined
}

/**
 * @param {EnvSource} env
 * @param {string} name
 * @returns {string}
 */
function envRequired(env: EnvSource, name: string): string {
    const value = envValue(env, name)
    if (!value) throw new Error(`缺少环境变量: ${name}`)
    return value
}

/**
 * @param {EnvSource} env
 * @param {string} name
 * @returns {string[]}
 */
function envCsv(env: EnvSource, name: string): string[] {
    return (envValue(env, name) ?? "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
}

/**
 * 私钥优先取明文 PEM，其次读文件；明文里的 `\n` 转义会被还原。
 * @param {EnvSource} env
 * @returns {string}
 */
function readPrivateKeyPem(env: EnvSource): string {
    const inline = envValue(env, "BUG_SYNC_PRIVATE_KEY_PEM")
    if (inline) return inline.replaceAll("\\n", "\n")
    const keyPath = envRequired(env, "BUG_SYNC_PRIVATE_KEY_PATH")
    return fs.readFileSync(path.resolve(keyPath), "utf8")
}

/**
 * @param {string} value
 * @returns {RepoRef}
 */
function parseRepoEntry(value: string): RepoRef {
    const [coordinate, repositoryId] = value.split("@")
    const [owner, repo] = coordinate.split("/")
    if (!owner || !repo) throw new Error(`BUG_SYNC_REPO_ALLOWLIST 条目无效: ${value}`)
    return { owner, repo, fullName: `${owner}/${repo}`, repositoryId: repositoryId || undefined }
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizePath(value: string): string {
    const trimmed = value.trim().replaceAll("\\", "/")
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}
