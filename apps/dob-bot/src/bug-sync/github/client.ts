/**
 * GitHub REST 客户端，只依赖 fetch。
 *
 * 在 dob-bot 原版基础上补齐 spec §17.2 要求的三件事：完整分页、限流退避
 * （429 / 403 secondary 尊重 `Retry-After` 与 `X-RateLimit-Reset`）、以及非幂等写入
 * 在超时 / 5xx 时标记 `unknownEffect`——交给 outbox 先对账，不盲目重发。
 */

export type GithubQueryValue = string | number | boolean | undefined

/** token 可以是常量，也可以是每次发送前才解析的惰性来源（installation token 会过期）。 */
export type GithubTokenSource = () => string | Promise<string>

export type GithubRequestOptions = {
    query?: Record<string, GithubQueryValue>
    body?: unknown
    token?: string | GithubTokenSource
    /** 401 后调用一次，用于让调用方作废缓存的 installation token。 */
    onUnauthorized?: () => void | Promise<void>
    headers?: Record<string, string>
    signal?: AbortSignal
    /** 覆盖幂等判定：GET/HEAD 之外默认按非幂等写入处理。 */
    idempotent?: boolean
}

export type GithubPaginateOptions = GithubRequestOptions & {
    perPage?: number
    maxPages?: number
}

export type GithubClientOptions = {
    baseUrl?: string
    fetchImpl?: typeof fetch
    sleep?: (ms: number) => Promise<void>
    now?: () => number
    maxRetries?: number
    /** 超过该延迟不再等待，直接抛出，让 outbox 落 retry_wait。 */
    maxRetryDelayMs?: number
    timeoutMs?: number
    userAgent?: string
    apiVersion?: string
}

export type GithubClient = {
    request: (method: string, path: string, options?: GithubRequestOptions) => Promise<any>
    paginate: <T>(path: string, options?: GithubPaginateOptions) => AsyncGenerator<T[]>
}

export type GithubApiErrorInit = {
    method: string
    path: string
    status: number
    message: string
    responseBody: unknown
    retryAfterMs: number | null
    rateLimited: boolean
    secondaryRateLimited: boolean
    unknownEffect: boolean
}

/**
 * GitHub 请求失败：区分「可退避的限流」「权限 / 参数永久错误」与「写入结果不明」。
 */
export class GithubApiError extends Error {
    readonly method: string
    readonly path: string
    readonly status: number
    readonly responseBody: unknown
    readonly retryAfterMs: number | null
    readonly rateLimited: boolean
    readonly secondaryRateLimited: boolean
    readonly unknownEffect: boolean

    constructor(init: GithubApiErrorInit) {
        super(init.message)
        this.name = "GithubApiError"
        this.method = init.method
        this.path = init.path
        this.status = init.status
        this.responseBody = init.responseBody
        this.retryAfterMs = init.retryAfterMs
        this.rateLimited = init.rateLimited
        this.secondaryRateLimited = init.secondaryRateLimited
        this.unknownEffect = init.unknownEffect
    }
}

/**
 * 创建 GitHub REST 客户端。
 * @param {GithubClientOptions} options
 * @returns {GithubClient}
 */
export function createGithubClient(options: GithubClientOptions = {}): GithubClient {
    const baseUrl = options.baseUrl ?? "https://api.github.com"
    const fetchImpl = options.fetchImpl ?? fetch
    const sleep = options.sleep ?? defaultSleep
    const now = options.now ?? Date.now
    const maxRetries = options.maxRetries ?? 3
    const maxRetryDelayMs = options.maxRetryDelayMs ?? 120_000
    const userAgent = options.userAgent ?? "dob-bug-bridge"
    const apiVersion = options.apiVersion ?? "2022-11-28"
    const timeoutMs = options.timeoutMs ?? 30_000

    async function send(method: string, p: string, requestOptions: GithubRequestOptions | undefined, idempotent: boolean): Promise<any> {
        const url = new URL(`${baseUrl}${p}`)
        if (requestOptions?.query) {
            for (const [key, value] of Object.entries(requestOptions.query)) {
                if (value === undefined) continue
                url.searchParams.set(key, String(value))
            }
        }

        const headers: Record<string, string> = {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": apiVersion,
            "User-Agent": userAgent,
            ...requestOptions?.headers,
        }
        const token = typeof requestOptions?.token === "function" ? await requestOptions.token() : requestOptions?.token
        if (token) headers.Authorization = `Bearer ${token}`

        const init: RequestInit = {
            method,
            headers,
            signal: requestOptions?.signal ?? AbortSignal.timeout(timeoutMs),
        }
        if (requestOptions?.body !== undefined) {
            headers["Content-Type"] = "application/json"
            init.body = JSON.stringify(requestOptions.body)
        }

        let res: Response
        try {
            res = await fetchImpl(url, init)
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            throw new GithubApiError({
                method,
                path: p,
                status: 0,
                message: `GitHub API ${method} ${p} 网络失败: ${reason}`,
                responseBody: null,
                retryAfterMs: null,
                rateLimited: false,
                secondaryRateLimited: false,
                unknownEffect: !idempotent,
            })
        }

        const text = await res.text()
        const data = text ? safeJsonParse(text) : null
        if (res.ok) return data

        const message = readErrorMessage(data, text)
        const retryAfterMs = readRetryAfterMs(res.headers, now)
        const remaining = res.headers.get("x-ratelimit-remaining")
        const rateLimited = res.status === 429 || (res.status === 403 && remaining === "0")
        const secondaryRateLimited =
            res.status === 403 && !rateLimited && (res.headers.has("retry-after") || /secondary rate limit|abuse detection/i.test(message))

        throw new GithubApiError({
            method,
            path: p,
            status: res.status,
            message: `GitHub API ${method} ${p} 失败: ${res.status} ${res.statusText}: ${message}`,
            responseBody: data,
            retryAfterMs,
            rateLimited,
            secondaryRateLimited,
            // 非幂等写入的超时 / 5xx 结果不明；4xx 明确未生效，可以安全判定。
            unknownEffect: !idempotent && res.status >= 500,
        })
    }

    async function request(method: string, p: string, requestOptions?: GithubRequestOptions): Promise<any> {
        const idempotent = requestOptions?.idempotent ?? isIdempotentMethod(method)
        let refreshed = false

        for (let attempt = 0; ; attempt++) {
            try {
                return await send(method, p, requestOptions, idempotent)
            } catch (error) {
                if (!(error instanceof GithubApiError)) throw error

                if (error.status === 401 && requestOptions?.onUnauthorized && !refreshed) {
                    refreshed = true
                    await requestOptions.onUnauthorized()
                    continue
                }

                const retriable =
                    error.rateLimited || error.secondaryRateLimited || (idempotent && (error.status === 0 || error.status >= 500))
                if (!retriable || attempt >= maxRetries) throw error

                const delay = error.retryAfterMs ?? backoffDelay(attempt)
                if (delay > maxRetryDelayMs) throw error
                await sleep(delay)
            }
        }
    }

    async function* paginate<T>(p: string, paginateOptions: GithubPaginateOptions = {}): AsyncGenerator<T[]> {
        const perPage = paginateOptions.perPage ?? 100
        const maxPages = paginateOptions.maxPages ?? 1000
        for (let page = 1; page <= maxPages; page++) {
            const data = await request("GET", p, {
                ...paginateOptions,
                query: { ...paginateOptions.query, per_page: perPage, page },
            })
            if (!Array.isArray(data)) throw new Error(`GitHub 分页接口返回非数组: ${p}`)
            if (data.length === 0) return
            yield data as T[]
            if (data.length < perPage) return
        }
    }

    return { request, paginate }
}

/**
 * 组装分页请求参数（供不便于使用 generator 的调用方复用同一口径）。
 * @param {number} page
 * @param {number} perPage
 * @returns {Record<string, number>}
 */
export function paginationQuery(page: number, perPage = 100): Record<string, number> {
    return { per_page: perPage, page }
}

/**
 * 判断方法是否幂等；只有幂等请求允许在超时 / 5xx 后自动重试。
 * @param {string} method
 * @returns {boolean}
 */
export function isIdempotentMethod(method: string): boolean {
    const upper = method.toUpperCase()
    return upper === "GET" || upper === "HEAD" || upper === "OPTIONS"
}

/**
 * 解析 `Retry-After`（秒或 HTTP 日期）与 `X-RateLimit-Reset`（epoch 秒）。
 * @param {Headers} headers
 * @param {() => number} now
 * @returns {number | null}
 */
export function readRetryAfterMs(headers: Headers, now: () => number = Date.now): number | null {
    const retryAfter = headers.get("retry-after")
    if (retryAfter) {
        const seconds = Number(retryAfter)
        if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000))
        const date = Date.parse(retryAfter)
        if (Number.isFinite(date)) return Math.max(0, date - now())
    }
    if (headers.get("x-ratelimit-remaining") === "0") {
        const reset = Number(headers.get("x-ratelimit-reset"))
        if (Number.isFinite(reset)) return Math.max(0, reset * 1000 - now())
    }
    return null
}

/**
 * 指数退避：1s、2s、4s……上限 30s。
 * @param {number} attempt
 * @returns {number}
 */
function backoffDelay(attempt: number): number {
    return Math.min(30_000, 1000 * 2 ** attempt)
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function defaultSleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * @param {unknown} data
 * @param {string} text
 * @returns {string}
 */
function readErrorMessage(data: unknown, text: string): string {
    if (data && typeof data === "object" && "message" in data) return String((data as { message?: unknown }).message)
    if (data && typeof data === "object" && "errors" in data) return JSON.stringify((data as { errors?: unknown }).errors)
    return text
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
