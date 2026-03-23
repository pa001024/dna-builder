import { createAppJwt } from "./auth.ts"
import type { GithubClient } from "./client.ts"

/**
 * 获取 installation access token，必要时自动探测 installation。
 */

/**
 * 获取 installation access token。
 * @param {{ client: GithubClient, appId: number, privateKeyPem: string, installationId?: string, owner: string, repo: string }} params
 * @returns {Promise<{ installationId: number, token: string }>}
 */
export async function getInstallationToken(params: {
    client: GithubClient
    appId: number
    privateKeyPem: string
    installationId?: string
    owner: string
    repo: string
}): Promise<{ installationId: number; token: string }> {
    const appJwt = createAppJwt({ appId: params.appId, privateKeyPem: params.privateKeyPem })

    const installationId = params.installationId ? Number(params.installationId) : await autoDetectInstallationId({ ...params, appJwt })
    if (!Number.isFinite(installationId) || installationId <= 0) throw new Error(`installationId 无效: ${params.installationId}`)

    const tokenResp = await params.client.request("POST", `/app/installations/${installationId}/access_tokens`, {
        token: appJwt,
        body: {},
    })
    if (!tokenResp?.token) throw new Error("安装 token 响应缺少 token 字段")
    return { installationId, token: tokenResp.token }
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
            const tok = await client.request("POST", `/app/installations/${id}/access_tokens`, { token: appJwt, body: {} })
            if (!tok?.token) continue
            await client.request("GET", `/repos/${owner}/${repo}`, { token: tok.token })
            return id
        } catch {
            // ignore
        }
    }

    throw new Error(`无法自动探测 installationId: 任何 installation 都无法访问 ${owner}/${repo}`)
}
