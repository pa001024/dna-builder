import type { RepoRef } from "./config.ts"
import type { GithubClient } from "./github/client.ts"

/**
 * 出站目标仓库白名单。
 *
 * spec §15.1 要求「所有目标路径来自 allowlisted repositoryId 和映射，不从用户提供的
 * URL、正文或模型输出决定」：outbox 只按 server 给的 `targetMapping` 反查已解析的仓库
 * 坐标，解析不到就 blocked，绝不采用 payload 里自带的 owner/repo。
 */

/** server 在未配置仓库 id 时写入的占位 targetMapping。 */
export const BUG_ISSUE_TARGET_FALLBACK = "bug-repository"

export type ResolvedRepo = {
    repositoryId: string
    owner: string
    repo: string
    fullName: string
}

export type RepoRegistry = {
    /** 入站 / 出站双重校验；两边都没有配置时 fail-closed。 */
    isAllowed: (input: { repositoryId?: string | number | null; fullName?: string | null }) => boolean
    remember: (repo: ResolvedRepo) => void
    byRepositoryId: (repositoryId: string | number) => ResolvedRepo | null
    byFullName: (fullName: string) => ResolvedRepo | null
    /** `repo:<repositoryId>` 形式的出站目标；占位值只在唯一允许仓库时解析。 */
    resolveTargetMapping: (targetMapping: string) => ResolvedRepo | null
    /** 未配置显式 id 的条目不阻塞启动：解析失败的条目返回在 `failed` 里，对应出站会 blocked。 */
    resolve: (
        github: GithubClient,
        tokenFor: (owner: string, repo: string) => Promise<string>
    ) => Promise<{ resolved: ResolvedRepo[]; failed: Array<{ entry: RepoRef; error: string }> }>
    entries: RepoRef[]
}

/**
 * @param {{ repoAllowlist: RepoRef[], repositoryIds: string[] }} config
 * @returns {RepoRegistry}
 */
export function createRepoRegistry(config: { repoAllowlist: RepoRef[]; repositoryIds: string[] }): RepoRegistry {
    const allowedNames = new Set(config.repoAllowlist.map(entry => entry.fullName.toLowerCase()))
    const allowedIds = new Set<string>(config.repositoryIds)
    for (const entry of config.repoAllowlist) {
        if (entry.repositoryId) allowedIds.add(entry.repositoryId)
    }

    const byId = new Map<string, ResolvedRepo>()
    const byName = new Map<string, ResolvedRepo>()

    function remember(repo: ResolvedRepo): void {
        byId.set(String(repo.repositoryId), repo)
        byName.set(repo.fullName.toLowerCase(), repo)
    }

    for (const entry of config.repoAllowlist) {
        if (entry.repositoryId) {
            remember({ repositoryId: entry.repositoryId, owner: entry.owner, repo: entry.repo, fullName: entry.fullName })
        }
    }

    return {
        isAllowed(input) {
            if (!allowedNames.size && !allowedIds.size) return false
            if (allowedIds.size) {
                const id = input.repositoryId === null || input.repositoryId === undefined ? null : String(input.repositoryId)
                if (!id || !allowedIds.has(id)) return false
            }
            if (allowedNames.size) {
                const name = input.fullName ? input.fullName.toLowerCase() : null
                if (!name || !allowedNames.has(name)) return false
            }
            return true
        },
        remember,
        byRepositoryId(repositoryId) {
            return byId.get(String(repositoryId)) ?? null
        },
        byFullName(fullName) {
            return byName.get(fullName.toLowerCase()) ?? null
        },
        resolveTargetMapping(targetMapping) {
            const match = /^repo:(.*)$/.exec(targetMapping ?? "")
            const rawId = (match ? (match[1] ?? "") : String(targetMapping ?? "")).trim()
            const direct = rawId ? byId.get(rawId) : undefined
            if (direct) return direct

            // 占位值 / 未知 id：只有在唯一个已允许仓库时才落到它，避免向任意仓库写入。
            if (!rawId || rawId === BUG_ISSUE_TARGET_FALLBACK || allowedIds.has(rawId)) {
                const resolvedRepos = [...new Map([...byId.values()].map(repo => [repo.repositoryId, repo])).values()]
                if (resolvedRepos.length === 1) return resolvedRepos[0]
                if (resolvedRepos.length === 0 && config.repoAllowlist.length === 1) {
                    const entry = config.repoAllowlist[0]
                    return {
                        repositoryId: rawId || entry.repositoryId || "",
                        owner: entry.owner,
                        repo: entry.repo,
                        fullName: entry.fullName,
                    }
                }
            }
            return null
        },
        async resolve(github, tokenFor) {
            const resolved: ResolvedRepo[] = []
            const failed: Array<{ entry: RepoRef; error: string }> = []
            for (const entry of config.repoAllowlist) {
                const known = byId.get(entry.repositoryId ?? "") ?? byName.get(entry.fullName.toLowerCase())
                if (known) {
                    resolved.push(known)
                    continue
                }
                try {
                    const token = await tokenFor(entry.owner, entry.repo)
                    const data = await github.request("GET", `/repos/${entry.owner}/${entry.repo}`, { token })
                    const repositoryId = String(data?.id ?? "")
                    if (!repositoryId) throw new Error("响应缺少 repository id")
                    if (allowedIds.size && !allowedIds.has(repositoryId)) throw new Error(`仓库 id ${repositoryId} 不在允许列表内`)
                    const repo: ResolvedRepo = {
                        repositoryId,
                        owner: String(data?.owner?.login ?? entry.owner),
                        repo: String(data?.name ?? entry.repo),
                        fullName: String(data?.full_name ?? entry.fullName),
                    }
                    remember(repo)
                    resolved.push(repo)
                } catch (error) {
                    failed.push({ entry, error: error instanceof Error ? error.message : String(error) })
                }
            }
            return { resolved, failed }
        },
        entries: config.repoAllowlist,
    }
}
