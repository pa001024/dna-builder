import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

dotenv.config({
    path: fileURLToPath(new URL("../.env", import.meta.url)),
    quiet: true,
})

/**
 * 读取环境变量，空字符串按未设置处理。
 * @param {string} name
 * @param {string | undefined} fallback
 * @returns {string | undefined}
 */
function env(name: string): string | undefined
function env(name: string, fallback: string): string
function env(name: string, fallback?: string): string | undefined {
    const v = process.env[name]
    if (v === undefined || v === "") return fallback
    return v
}

/**
 * 读取必填环境变量。
 * @param {string} name
 * @returns {string}
 */
function envRequired(name: string): string {
    const v = env(name)
    if (!v) throw new Error(`缺少环境变量: ${name}`)
    return v
}

/**
 * 读取正整数环境变量。
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function envInt(name: string, fallback: number): number {
    const v = env(name)
    if (!v) return fallback
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) throw new Error(`环境变量 ${name} 不是有效正整数: ${v}`)
    return Math.trunc(n)
}

/**
 * 读取布尔型环境变量。
 * @param {string} name
 * @returns {boolean}
 */
function envBool(name: string): boolean {
    const v = env(name, "") ?? ""
    return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes"
}

/**
 * 读取逗号分隔列表。
 * @param {string} name
 * @returns {string[]}
 */
function envCsv(name: string): string[] {
    const v = env(name, "") ?? ""
    return v
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
}

/**
 * 读取 GitHub App 私钥 PEM。
 * 优先使用明文环境变量，其次读取文件路径。
 * @returns {string}
 */
function readPrivateKeyPem(): string {
    const inline = env("DOB_BOT_PRIVATE_KEY_PEM")
    if (inline) return inline

    const privateKeyPath = envRequired("DOB_BOT_PRIVATE_KEY_PATH")
    const resolved = path.resolve(privateKeyPath)
    return fs.readFileSync(resolved, "utf8")
}

export const config = Object.freeze({
    appId: envInt("DOB_BOT_APP_ID", 3157654),
    installationId: env("DOB_BOT_INSTALLATION_ID"),
    owner: envRequired("DOB_BOT_OWNER"),
    repo: envRequired("DOB_BOT_REPO"),
    label: env("DOB_BOT_LABEL", "dob-bot"),
    allowedMentionAuthors: envCsv("DOB_BOT_ALLOWED_MENTION_AUTHORS"),
    intervalMs: envInt("DOB_BOT_INTERVAL_MS", 10 * 60 * 1000),
    dryRun: envBool("DOB_BOT_DRY_RUN"),
    privateKeyPem: readPrivateKeyPem(),
    llmApiKey: env("DOB_BOT_LLM_API_KEY", env("OPENAI_API_KEY", "")),
    llmBaseUrl: env("DOB_BOT_LLM_BASE_URL", "http://localhost:23000/v1"),
    schedulerModel: env("DOB_BOT_SCHEDULER_MODEL", "gpt-5.4-mini"),
    schedulerFallbackModel: env("DOB_BOT_SCHEDULER_FALLBACK_MODEL", "gpt-5.1"),
    schedulerTemperature: Number(env("DOB_BOT_SCHEDULER_TEMPERATURE", "0") ?? 0),
    schedulerMaxTokens: envInt("DOB_BOT_SCHEDULER_MAX_TOKENS", 1024),
    codexModel: env("DOB_BOT_CODEX_MODEL", "gpt-5.1-codex"),
    codexTemperature: Number(env("DOB_BOT_CODEX_TEMPERATURE", "0") ?? 0),
    codexMaxTokens: envInt("DOB_BOT_CODEX_MAX_TOKENS", 4096),
    webhookPort: envInt("DOB_BOT_WEBHOOK_PORT", 8787),
    webhookHost: env("DOB_BOT_WEBHOOK_HOST", "0.0.0.0"),
    webhookPath: normalizeWebhookPath(env("DOB_BOT_WEBHOOK_PATH", "/github/webhook")!),
    webhookSecret: envRequired("DOB_BOT_WEBHOOK_SECRET"),
    frpcToken: env("DOB_BOT_FRPC_TOKEN", ""),
    frpcTunnelIds: env("DOB_BOT_FRPC_TUNNEL_IDS", ""),
    insecureTls: envBool("DOB_BOT_INSECURE_TLS"),
})

if (config.insecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
}

/**
 * 规范 webhook 路由路径，避免 Windows / dotenv 把绝对路径读歪。
 * @param {string} value
 * @returns {string}
 */
function normalizeWebhookPath(value: string): string {
    const trimmed = value.trim().replaceAll("\\", "/")
    const suffix = trimmed.match(/(\/github\/webhook)$/i)
    if (suffix) return suffix[1]
    if (trimmed.startsWith("/")) return trimmed
    const withoutDrive = trimmed.replace(/^[A-Za-z]:/, "")
    return withoutDrive.startsWith("/") ? withoutDrive : `/${withoutDrive}`
}

export type DobBotConfig = typeof config
