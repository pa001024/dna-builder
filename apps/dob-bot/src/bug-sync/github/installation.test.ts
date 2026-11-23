import { describe, expect, test } from "bun:test"
import { generateKeyPairSync } from "node:crypto"
import { createAppJwt } from "./auth.ts"
import { createGithubClient } from "./client.ts"
import { createInstallationTokenCache, getInstallationToken, installationCacheKey } from "./installation.ts"

/** 真实的测试用 RSA 私钥：JWT 在取 token 之前就必须签出来，占位串无法通过 OpenSSL。 */
const { privateKey: TEST_KEY } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const PRIVATE_KEY_PEM = TEST_KEY.export({ type: "pkcs1", format: "pem" }).toString()

type RecordedCall = { method: string; path: string; authorization: string | null }

function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
    return new Response(JSON.stringify(data), {
        status: init.status ?? 200,
        headers: { "content-type": "application/json", ...init.headers },
    })
}

function createMockFetch(handler: (call: RecordedCall) => Response | Promise<Response>) {
    const calls: RecordedCall[] = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const call = {
            method: (init?.method ?? "GET").toUpperCase(),
            path: new URL(String(input)).pathname,
            authorization: new Headers(init?.headers).get("authorization"),
        }
        calls.push(call)
        return handler(call)
    }) as typeof fetch
    return { fetchImpl, calls }
}

describe("installation token cache", () => {
    test("同一仓库重复取 token 只签发一次，并在过期缓冲后重新签发", async () => {
        let now = 1_700_000_000_000
        let issued = 0
        const { fetchImpl, calls } = createMockFetch(call => {
            if (call.method === "POST" && call.path === "/app/installations/77/access_tokens") {
                issued++
                return json({ token: `tok-${issued}`, expires_at: new Date(now + 60 * 60 * 1000).toISOString() })
            }
            return json({}, { status: 404 })
        })
        const github = createGithubClient({ fetchImpl, sleep: async () => {} })
        const cache = createInstallationTokenCache({ now: () => now, expiryBufferMs: 5 * 60 * 1000 })
        const params = { client: github, appId: 1, privateKeyPem: PRIVATE_KEY_PEM, installationId: 77, owner: "Owner", repo: "Repo" }

        const first = await cache.get(params)
        now += 30 * 60 * 1000
        const second = await cache.get(params)

        expect(first.token).toBe("tok-1")
        expect(second.token).toBe("tok-1")
        expect(issued).toBe(1)
        expect(calls.filter(call => call.method === "POST")).toHaveLength(1)

        // 距离过期不足 5 分钟缓冲，必须重新签发。
        now += 26 * 60 * 1000
        const third = await cache.get(params)
        expect(third.token).toBe("tok-2")
        expect(issued).toBe(2)
    })

    test("invalidate 后下一次请求重新签发", async () => {
        let issued = 0
        const { fetchImpl } = createMockFetch(() => {
            issued++
            return json({ token: `tok-${issued}` })
        })
        const github = createGithubClient({ fetchImpl, sleep: async () => {} })
        const cache = createInstallationTokenCache({ now: () => 1_700_000_000_000 })
        const params = { client: github, appId: 1, privateKeyPem: PRIVATE_KEY_PEM, installationId: 77, owner: "owner", repo: "repo" }

        await cache.get(params)
        cache.invalidate("owner", "repo")
        expect(cache.peek("owner", "repo")).toBeNull()
        await cache.get(params)

        expect(issued).toBe(2)
        expect(installationCacheKey("Owner", "Repo")).toBe("owner/repo")
    })

    test("未配置 installationId 时按仓库定位安装", async () => {
        const { fetchImpl, calls } = createMockFetch(call => {
            if (call.path === "/repos/owner/repo/installation") return json({ id: 4242 })
            if (call.path === "/app/installations/4242/access_tokens") return json({ token: "tok", expires_at: "2030-01-01T00:00:00Z" })
            return json({}, { status: 404 })
        })
        const github = createGithubClient({ fetchImpl, sleep: async () => {} })
        const token = await getInstallationToken({ client: github, appId: 1, privateKeyPem: PRIVATE_KEY_PEM, owner: "owner", repo: "repo" })

        expect(token.installationId).toBe(4242)
        expect(token.token).toBe("tok")
        expect(calls.map(call => call.path)).toEqual(["/repos/owner/repo/installation", "/app/installations/4242/access_tokens"])
    })
})

describe("app jwt", () => {
    test("用真实 RSA 私钥可以签出三段式 JWT", () => {
        const jwt = createAppJwt({ appId: 123, privateKeyPem: PRIVATE_KEY_PEM, nowMs: 0 })

        expect(jwt.split(".")).toHaveLength(3)
        const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString("utf8"))
        expect(payload.iss).toBe("123")
        expect(payload.exp).toBe(9 * 60)
    })

    test("私钥无效时明确报错", () => {
        const broken = "-----BEGIN RSA PRIVATE KEY-----\nnot-a-key\n-----END RSA PRIVATE KEY-----"
        expect(() => createAppJwt({ appId: 1, privateKeyPem: broken })).toThrow()
    })
})
