import { describe, expect, test } from "bun:test"
import { createGithubClient, GithubApiError, readRetryAfterMs } from "./client.ts"

type RecordedCall = { url: URL; init: RequestInit | undefined }

function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
    return new Response(JSON.stringify(data), {
        status: init.status ?? 200,
        headers: { "content-type": "application/json", ...init.headers },
    })
}

function createMockFetch(handler: (call: { url: URL; init: RequestInit | undefined; index: number }) => Response | Promise<Response>) {
    const calls: RecordedCall[] = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        calls.push({ url, init })
        return handler({ url, init, index: calls.length - 1 })
    }) as typeof fetch
    return { fetchImpl, calls }
}

function makeItems(start: number, count: number): Array<{ id: number }> {
    return Array.from({ length: count }, (_, index) => ({ id: start + index }))
}

describe("github client pagination", () => {
    test("完整拉取超过 100 条的评论", async () => {
        const pages = [makeItems(0, 100), makeItems(100, 100), makeItems(200, 30)]
        const { fetchImpl, calls } = createMockFetch(({ url }) => {
            const page = Number(url.searchParams.get("page"))
            return json(pages[page - 1] ?? [])
        })
        const client = createGithubClient({ fetchImpl, sleep: async () => {} })

        const collected: Array<{ id: number }> = []
        for await (const page of client.paginate<{ id: number }>("/repos/owner/repo/issues/1/comments")) {
            collected.push(...page)
        }

        expect(collected).toHaveLength(230)
        expect(collected.at(-1)?.id).toBe(229)
        expect(calls.map(call => call.url.searchParams.get("page"))).toEqual(["1", "2", "3"])
        expect(calls.every(call => call.url.searchParams.get("per_page") === "100")).toBe(true)
    })

    test("恰好 100 / 页时以空页收尾，不丢也不重复", async () => {
        const pages = [makeItems(0, 100), makeItems(100, 100), []]
        const { fetchImpl, calls } = createMockFetch(({ url }) => json(pages[Number(url.searchParams.get("page")) - 1] ?? []))
        const client = createGithubClient({ fetchImpl, sleep: async () => {} })

        let total = 0
        for await (const page of client.paginate<{ id: number }>("/repos/owner/repo/issues/1/labels")) total += page.length

        expect(total).toBe(200)
        expect(calls).toHaveLength(3)
    })

    test("分页保留调用方已有查询参数", async () => {
        const { fetchImpl, calls } = createMockFetch(() => json([]))
        const client = createGithubClient({ fetchImpl, sleep: async () => {} })

        let pageCount = 0
        for await (const page of client.paginate("/repos/owner/repo/issues/1/comments", {
            query: { since: "2024-01-01T00:00:00Z" },
        })) {
            pageCount += page.length
        }

        expect(pageCount).toBe(0)

        expect(calls[0].url.searchParams.get("since")).toBe("2024-01-01T00:00:00Z")
        expect(calls[0].url.searchParams.get("per_page")).toBe("100")
    })
})

describe("github client rate limit", () => {
    test("403 secondary rate limit 尊重 Retry-After 后退避重试", async () => {
        const sleeps: number[] = []
        const { fetchImpl, calls } = createMockFetch(({ index }) =>
            index === 0
                ? json({ message: "You have exceeded a secondary rate limit." }, { status: 403, headers: { "retry-after": "2" } })
                : json({ ok: true })
        )
        const client = createGithubClient({
            fetchImpl,
            sleep: async ms => {
                sleeps.push(ms)
            },
        })

        const data = await client.request("GET", "/repos/owner/repo/issues/1")

        expect(data).toEqual({ ok: true })
        expect(sleeps).toEqual([2000])
        expect(calls).toHaveLength(2)
    })

    test("429 用 X-RateLimit-Reset 计算等待时间", async () => {
        const nowMs = 1_700_000_000_000
        const resetSeconds = Math.floor(nowMs / 1000) + 60
        const sleeps: number[] = []
        const { fetchImpl } = createMockFetch(({ index }) =>
            index === 0
                ? json(
                      { message: "API rate limit exceeded" },
                      {
                          status: 429,
                          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetSeconds) },
                      }
                  )
                : json({ ok: true })
        )
        const client = createGithubClient({
            fetchImpl,
            now: () => nowMs,
            sleep: async ms => {
                sleeps.push(ms)
            },
        })

        await client.request("GET", "/repos/owner/repo/issues/1")

        expect(sleeps).toEqual([60_000])
    })

    test("超出 maxRetryDelayMs 的限流不再等待，直接抛出 retryAfterMs", async () => {
        const sleeps: number[] = []
        const { fetchImpl, calls } = createMockFetch(() =>
            json({ message: "You have exceeded a secondary rate limit." }, { status: 403, headers: { "retry-after": "3600" } })
        )
        const client = createGithubClient({
            fetchImpl,
            maxRetryDelayMs: 120_000,
            sleep: async ms => {
                sleeps.push(ms)
            },
        })

        const error = await client.request("POST", "/repos/owner/repo/issues/1/comments", { body: {}, idempotent: false }).catch(e => e)

        expect(error).toBeInstanceOf(GithubApiError)
        expect(error.retryAfterMs).toBe(3_600_000)
        expect(error.secondaryRateLimited).toBe(true)
        expect(error.unknownEffect).toBe(false)
        expect(sleeps).toEqual([])
        expect(calls).toHaveLength(1)
    })

    test("普通 403（权限不足）不当作限流、不重试", async () => {
        const sleeps: number[] = []
        const { fetchImpl, calls } = createMockFetch(() => json({ message: "Resource not accessible by integration" }, { status: 403 }))
        const client = createGithubClient({
            fetchImpl,
            sleep: async ms => {
                sleeps.push(ms)
            },
        })

        const error = await client.request("GET", "/repos/owner/repo/issues/1").catch(e => e)

        expect(error).toBeInstanceOf(GithubApiError)
        expect(error.rateLimited).toBe(false)
        expect(error.secondaryRateLimited).toBe(false)
        expect(sleeps).toEqual([])
        expect(calls).toHaveLength(1)
    })
})

describe("github client unknown effect", () => {
    test("GET 5xx 自动重试后成功", async () => {
        const { fetchImpl, calls } = createMockFetch(({ index }) =>
            index === 0 ? json({ message: "boom" }, { status: 502 }) : json({ ok: true })
        )
        const client = createGithubClient({ fetchImpl, sleep: async () => {} })

        const data = await client.request("GET", "/repos/owner/repo/issues/1")

        expect(data).toEqual({ ok: true })
        expect(calls).toHaveLength(2)
    })

    test("POST 5xx 结果不明：只调用一次并标记 unknownEffect", async () => {
        const sleeps: number[] = []
        const { fetchImpl, calls } = createMockFetch(() => json({ message: "boom" }, { status: 502 }))
        const client = createGithubClient({
            fetchImpl,
            sleep: async ms => {
                sleeps.push(ms)
            },
        })

        const error = await client.request("POST", "/repos/owner/repo/issues", { body: { title: "t" } }).catch(e => e)

        expect(error).toBeInstanceOf(GithubApiError)
        expect(error.status).toBe(502)
        expect(error.unknownEffect).toBe(true)
        expect(sleeps).toEqual([])
        expect(calls).toHaveLength(1)
    })

    test("POST 4xx 明确未生效，不算未知结果", async () => {
        const { fetchImpl } = createMockFetch(() => json({ message: "Validation Failed" }, { status: 422 }))
        const client = createGithubClient({ fetchImpl, sleep: async () => {} })

        const error = await client.request("POST", "/repos/owner/repo/issues", { body: {} }).catch(e => e)

        expect(error).toBeInstanceOf(GithubApiError)
        expect(error.unknownEffect).toBe(false)
    })

    test("网络失败按方法判定 unknownEffect", async () => {
        const fetchImpl = (async () => {
            throw new TypeError("fetch failed")
        }) as unknown as typeof fetch
        const client = createGithubClient({ fetchImpl, sleep: async () => {} })

        const error = await client.request("POST", "/repos/owner/repo/issues", { body: {} }).catch(e => e)

        expect(error).toBeInstanceOf(GithubApiError)
        expect(error.status).toBe(0)
        expect(error.unknownEffect).toBe(true)
    })
})

describe("github client token refresh", () => {
    test("401 触发 onUnauthorized 并用新 token 重试一次", async () => {
        const tokens = ["stale", "fresh"]
        let tokenIndex = 0
        let refreshed = 0
        const { fetchImpl, calls } = createMockFetch(({ index }) =>
            index === 0 ? json({ message: "Bad credentials" }, { status: 401 }) : json({ ok: true })
        )
        const client = createGithubClient({ fetchImpl, sleep: async () => {} })

        const data = await client.request("GET", "/repos/owner/repo/issues/1", {
            token: () => tokens[tokenIndex++],
            onUnauthorized: () => {
                refreshed++
            },
        })

        expect(data).toEqual({ ok: true })
        expect(refreshed).toBe(1)
        expect(calls.map(call => new Headers(call.init?.headers).get("authorization"))).toEqual(["Bearer stale", "Bearer fresh"])
    })
})

describe("readRetryAfterMs", () => {
    test("解析秒数与 HTTP 日期", () => {
        const now = Date.parse("2026-01-01T00:00:00Z")
        expect(readRetryAfterMs(new Headers({ "retry-after": "30" }), () => now)).toBe(30_000)
        expect(readRetryAfterMs(new Headers({ "retry-after": "Thu, 01 Jan 2026 00:01:00 GMT" }), () => now)).toBe(60_000)
        expect(readRetryAfterMs(new Headers({}), () => now)).toBeNull()
    })
})
