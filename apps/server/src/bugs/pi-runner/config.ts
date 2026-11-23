/** pi Runner 的错误码：调用方按码区分可重试与永久失败，不解析错误文本。 */
export type PiRunnerErrorCode =
    | "config_invalid"
    | "provider_not_allowed"
    | "model_not_configured"
    | "deps_missing"
    | "protocol_invalid"
    | "tool_manifest_invalid"
    | "tool_call_rejected"
    | "tool_budget_exceeded"
    | "image_load_failed"
    | "agent_failed"
    | "timeout"
    | "lease_lost"
    | "fencing_rejected"
    | "proposal_invalid"
    | "input_stale"

/** 运行器内部错误；`retryable` 表示同一次任务可以安全重跑。 */
export class PiRunnerError extends Error {
    readonly code: PiRunnerErrorCode
    readonly detail?: Record<string, unknown>
    readonly retryable: boolean

    constructor(code: PiRunnerErrorCode, message: string, options: { detail?: Record<string, unknown>; retryable?: boolean } = {}) {
        super(message)
        this.name = "PiRunnerError"
        this.code = code
        this.detail = options.detail
        this.retryable = options.retryable ?? false
    }
}

/** 锁定的运行时版本，记入 bug_ai_runs 以便审计。 */
export const PI_AGENT_CORE_VERSION = "1.5.2"
export const PI_AI_VERSION = "1.5.2"
export const PI_HARNESS_VERSION = `pi-agent-core@${PI_AGENT_CORE_VERSION}+pi-ai@${PI_AI_VERSION}`

export const DEFAULT_PI_WALL_TIMEOUT_MS = 180_000
export const DEFAULT_PI_HEARTBEAT_MS = 15_000
export const DEFAULT_PI_TOOL_CALL_TIMEOUT_MS = 30_000
export const DEFAULT_PI_MAX_TOOL_CALLS = 8
export const DEFAULT_PI_MAX_IMAGES = 8
export const DEFAULT_PI_MAX_TOOL_QUERY_LENGTH = 200
export const DEFAULT_PI_MAX_CANDIDATES = 20

/** 允许注册的 provider；模型必须支持图片输入（spec §7 / §11.3）。 */
export const DEFAULT_PI_PROVIDER_ALLOWLIST = ["anthropic", "openai", "google", "openrouter", "deepseek"] as const

export type PiRunnerConfig = {
    provider: string
    model: string
    apiKey: string
    /** 单 run 墙钟上限；到点 abort 并结束子进程。 */
    wallTimeoutMs: number
    heartbeatIntervalMs: number
    toolCallTimeoutMs: number
    maxToolCalls: number
    maxImages: number
    providerAllowlist: string[]
}

function readInt(env: Record<string, string | undefined>, key: string, fallback: number, min: number): number {
    const raw = env[key]?.trim()
    if (!raw) return fallback
    const value = Number(raw)
    if (!Number.isInteger(value) || value < min) {
        throw new PiRunnerError("config_invalid", `${key} 必须是 ≥${min} 的整数`, { detail: { key, value: raw } })
    }
    return value
}

function readRequired(env: Record<string, string | undefined>, key: string): string {
    const value = env[key]?.trim()
    if (!value) throw new PiRunnerError("config_invalid", `缺少 ${key}`, { detail: { key } })
    return value
}

/**
 * @description 读取并校验 pi Runner 配置：provider / model / apiKey 任一缺失即 fail-closed，
 * provider 必须落在 allowlist 内；超时、工具次数与图片数都有上界，不接受无上限 agent loop。
 * @param env 环境变量（测试可传入普通对象）
 * @returns 已校验的配置
 */
export function readPiRunnerConfig(env: Record<string, string | undefined> = process.env): PiRunnerConfig {
    const provider = readRequired(env, "PI_PROVIDER")
    const model = readRequired(env, "PI_MODEL")
    const apiKey = readRequired(env, "PI_API_KEY")

    const allowlistRaw = env.PI_PROVIDER_ALLOWLIST?.trim()
    const providerAllowlist = allowlistRaw
        ? allowlistRaw
              .split(",")
              .map(item => item.trim())
              .filter(Boolean)
        : [...DEFAULT_PI_PROVIDER_ALLOWLIST]

    if (!providerAllowlist.includes(provider)) {
        throw new PiRunnerError("provider_not_allowed", `provider ${provider} 不在 allowlist 内`, {
            detail: { provider, allowlist: providerAllowlist },
        })
    }

    return {
        provider,
        model,
        apiKey,
        wallTimeoutMs: readInt(env, "PI_WALL_TIMEOUT_MS", DEFAULT_PI_WALL_TIMEOUT_MS, 1_000),
        heartbeatIntervalMs: readInt(env, "PI_HEARTBEAT_MS", DEFAULT_PI_HEARTBEAT_MS, 1_000),
        toolCallTimeoutMs: readInt(env, "PI_TOOL_CALL_TIMEOUT_MS", DEFAULT_PI_TOOL_CALL_TIMEOUT_MS, 100),
        maxToolCalls: readInt(env, "PI_MAX_TOOL_CALLS", DEFAULT_PI_MAX_TOOL_CALLS, 1),
        maxImages: readInt(env, "PI_MAX_IMAGES", DEFAULT_PI_MAX_IMAGES, 0),
        providerAllowlist,
    }
}

/** 子进程环境变量 allowlist：只给模型调用所需项，不传数据库路径、GitHub 凭据与回执 token。 */
export function buildChildEnv(config: PiRunnerConfig): Record<string, string> {
    const env: Record<string, string> = {
        PI_PROVIDER: config.provider,
        PI_MODEL: config.model,
        PI_API_KEY: config.apiKey,
        PI_WALL_TIMEOUT_MS: String(config.wallTimeoutMs),
        PI_TOOL_CALL_TIMEOUT_MS: String(config.toolCallTimeoutMs),
        PI_MAX_TOOL_CALLS: String(config.maxToolCalls),
        PI_MAX_IMAGES: String(config.maxImages),
    }
    for (const key of ["PATH", "SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE", "LANG"]) {
        const value = process.env[key]
        if (value) env[key] = value
    }
    return env
}
