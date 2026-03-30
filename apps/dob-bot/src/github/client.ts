/**
 * GitHub REST 客户端，只使用 fetch。
 */

export type GithubRequestOptions = {
    query?: Record<string, string | number | boolean | undefined>
    body?: unknown
    token?: string
}

export type GithubClient = {
    request: (method: string, path: string, options?: GithubRequestOptions) => Promise<any>
}

/**
 * 创建 GitHub REST 客户端。
 * @param {string} baseUrl
 * @returns {GithubClient}
 */
export function createGithubClient(baseUrl = "https://api.github.com"): GithubClient {
    return {
        async request(method, p, options) {
            const url = new URL(`${baseUrl}${p}`)
            if (options?.query) {
                for (const [k, v] of Object.entries(options.query)) {
                    if (v === undefined) continue
                    url.searchParams.set(k, String(v))
                }
            }

            const headers: Record<string, string> = {
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "dob-bot",
            }
            if (options?.token) headers.Authorization = `Bearer ${options.token}`

            const init: RequestInit = {
                method,
                headers,
            }

            if (options?.body !== undefined) {
                headers["Content-Type"] = "application/json"
                init.body = JSON.stringify(options.body)
            }

            const res = await fetch(url, init)
            const text = await res.text()
            const data = text ? safeJsonParse(text) : null

            if (!res.ok) {
                const msg = typeof data === "object" && data && "message" in data ? String((data as { message?: unknown }).message) : text
                throw new Error(`GitHub API ${method} ${p} 失败: ${res.status} ${res.statusText}: ${msg}`)
            }
            return data
        },
    }
}

/**
 * 解析 JSON，失败时返回原文。
 * @param {string} text
 * @returns {any}
 */
function safeJsonParse(text: string): any {
    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}
