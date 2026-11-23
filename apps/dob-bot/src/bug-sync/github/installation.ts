import { createAppJwt } from "./auth.ts"
import type { GithubClient } from "./client.ts"

/**
 * 获取 installation access token，并按过期时间做短期缓存。
 */

export type InstallationToken = {
    installationId: number
    token: string
    /** epoch 毫秒；响应缺 expires_at 时按 GitHub 默认 1 小时估算。 */
    expiresAt: number
}

export type InstallationTokenParams = {
    client: GithubClient
    appId: number
    privateKeyPem: string
    installationId?: string | number
    owner: string
    repo: string
}

export type InstallationTokenCache = {
    get: (params: InstallationTokenParams) => Promise<InstallationToken>
    peek: (owner: string, repo: string) => InstallationToken | null
    invalidate: (owner?: string, repo?: string) => void
}

/** 缓存键：installation token 按仓库维度收窄，同一 App 的不同安装互不串用。 */
export function installationCacheKey(owner: string, repo: string): string {
    return `${owner.toLowerCase()}/${repo.toLowerCase()}`
}

/**
 * 获取 installation access token（不缓存）。
 * @param {InstallationTokenParams} params
 * @returns {Promise<InstallationToken>}
 */
export async function getInstallationToken(params: InstallationTokenParams): Promise<InstallationToken> {
    const appJwt = createAppJwt({ appId: params.appId, privateKeyPem: params.privateKeyPem })

    const installationId = params.installationId ? Number(params.installationId) : await resolveInstallationId({ ...params, appJwt })
    if (!Number.isFinite(installationId) || installationId <= 0) throw new Error(`installationId 无效: ${params.installationId}`)

    const tokenResp = await params.client.request("POST", `/app/installations/${installationId}/access_tokens`, {
        token: appJwt,
        body: {},
        idempotent: true,
    })
    if (!tokenResp?.token) throw new Error("安装 token 响应缺少 token 字段")

    const expiresAt = parseExpiresAt(tokenResp.expires_at)
    return { installationId, token: String(tokenResp.token), expiresAt }
}

/**
 * 创建带过期感知（默认提前 5 分钟作废）的 token 缓存。
 * @param {{ now?: () => number, expiryBufferMs?: number }} options
 * @returns {InstallationTokenCache}
 */
export function createInstallationTokenCache(options: { now?: () => number; expiryBufferMs?: number } = {}): InstallationTokenCache {
    const now = options.now ?? Date.now
    const expiryBufferMs = options.expiryBufferMs ?? 5 * 60 * 1000
    const cache = new Map<string, InstallationToken>()

    return {
        async get(params) {
            const key = installationCacheKey(params.owner, params.repo)
            const cached = cache.get(key)
            if (cached && cached.expiresAt - expiryBufferMs > now()) return cached
            const token = await getInstallationToken(params)
            cache.set(key, token)
            return token
        },
        peek(owner, repo) {
            return cache.get(installationCacheKey(owner, repo)) ?? null
        },
        invalidate(owner, repo) {
            if (owner === undefined || repo === undefined) {
                cache.clear()
                return
            }
            cache.delete(installationCacheKey(owner, repo))
        },
    }
}

/**
 * 优先用 `/repos/{owner}/{repo}/installation` 直接定位安装，失败再退回遍历 installations。
 * @param {{ client: GithubClient, appJwt: string, owner: string, repo: string }} params
 * @returns {Promise<number>}
 */
async function resolveInstallationId({
    client,
    appJwt,
    owner,
    repo,
}: {
    client: GithubClient
    appJwt: string
    owner: string
    repo: string
}): Promise<number> {
    try {
        const installation = await client.request("GET", `/repos/${owner}/${repo}/installation`, { token: appJwt })
        const id = Number(installation?.id)
        if (Number.isFinite(id) && id > 0) return id
    } catch {
        // 未安装时会 404，走下面的全量探测。
    }
    return autoDetectInstallationId({ client, appJwt, owner, repo })
}

/**
 * 在没有 webhook 且没配置 installationId 的情况下，自动探测可访问目标仓库的 installation。
 * 这一步会比较慢，但能省掉手动查 installation id。
 * @param {{ client: GithubClient, appJwt: string, owner: string, repo: string }} params
 * @returns {Promise<number>}
 */
async function autoDetectInstallationId({
    client,
    appJwt,
    owner,
    repo,
}: {
    client: GithubClient
    appJwt: string
    owner: string
    repo: string
}): Promise<number> {
    const installations = await client.request("GET", "/app/installations", { token: appJwt, query: { per_page: 100 } })
    if (!Array.isArray(installations) || installations.length === 0) throw new Error("未找到任何 installations（请确认 App 已安装到仓库）")

    for (const inst of installations) {
        const id = Number((inst as { id?: unknown })?.id)
        if (!Number.isFinite(id) || id <= 0) continue
        try {
            const tok = await client.request("POST", `/app/installations/${id}/access_tokens`, {
                token: appJwt,
                body: {},
                idempotent: true,
            })
            if (!tok?.token) continue
            await client.request("GET", `/repos/${owner}/${repo}`, { token: tok.token })
            return id
        } catch {
            // 该 installation 无权访问目标仓库，继续下一个。
        }
    }

    throw new Error(`无法自动探测 installationId: 任何 installation 都无法访问 ${owner}/${repo}`)
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function parseExpiresAt(value: unknown): number {
    if (typeof value === "string") {
        const parsed = Date.parse(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return Date.now() + 55 * 60 * 1000
}
