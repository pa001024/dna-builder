import { beforeEach, describe, expect, it, vi } from "vitest"

const clientMock = vi.hoisted(() => ({ mutation: vi.fn(), query: vi.fn() }))

vi.mock("@/api/client", () => ({ gqClient: clientMock }))

import {
    BugApiError,
    bugAssetContentUrl,
    clearIdempotencyKey,
    getBugAssetStatus,
    getOrCreateIdempotencyKey,
    getReceiptToken,
    getSubmission,
    listReceiptSubmissions,
    receiptHeaders,
    removeReceiptToken,
    setReceiptToken,
    setVote,
    submitBug,
    uploadBugAsset,
} from "@/api/bugs"

/** 内存版 localStorage，避免测试环境没有 Storage。 */
function installLocalStorage() {
    const map = new Map<string, string>()
    const storage: Storage = {
        get length() {
            return map.size
        },
        key: (index: number) => Array.from(map.keys())[index] ?? null,
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
            map.set(key, String(value))
        },
        removeItem: (key: string) => {
            map.delete(key)
        },
        clear: () => map.clear(),
    }
    vi.stubGlobal("localStorage", storage)
    return map
}

function mockResponse(status: number, payload: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    } as Response
}

function mutationResult(payload: unknown, error?: unknown) {
    return { toPromise: async () => ({ data: payload, error }) }
}

function queryResult(payload: unknown, error?: unknown) {
    return { toPromise: async () => ({ data: payload, error }) }
}

describe("BUG 库 API", () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        clientMock.mutation.mockReset()
        clientMock.query.mockReset()
        installLocalStorage()
    })

    it("回执 token 按 submissionId 存取，可列出与删除", () => {
        setReceiptToken("sub-1", "tok-1")
        setReceiptToken("sub-2", "tok-2")
        expect(getReceiptToken("sub-1")).toBe("tok-1")
        expect(listReceiptSubmissions().sort()).toEqual(["sub-1", "sub-2"])

        removeReceiptToken("sub-1")
        expect(getReceiptToken("sub-1")).toBeNull()
        expect(listReceiptSubmissions()).toEqual(["sub-2"])
    })

    it("幂等键按作用域持久化，清除后换新", () => {
        const first = getOrCreateIdempotencyKey("submit")
        expect(getOrCreateIdempotencyKey("submit")).toBe(first)
        expect(getOrCreateIdempotencyKey("feedback:bug-1")).not.toBe(first)

        clearIdempotencyKey("submit")
        expect(getOrCreateIdempotencyKey("submit")).not.toBe(first)
    })

    it("回执请求头使用 Authorization: Receipt", () => {
        expect(receiptHeaders("tok-1")).toEqual({ Authorization: "Receipt tok-1" })
        expect(receiptHeaders(null)).toBeUndefined()
    })

    it("上传图片走 multipart，策略转小写并带登录令牌", async () => {
        const stub = vi.fn(async () => mockResponse(200, { success: true, assetId: "asset-1", scanState: "pending" }))
        vi.stubGlobal("fetch", stub)
        const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" })

        await expect(uploadBugAsset(file, "GITHUB_SAFE", { token: "jwt" })).resolves.toMatchObject({ assetId: "asset-1" })

        const [url, init] = stub.mock.calls[0] as unknown as [string, RequestInit]
        expect(String(url)).toContain("/api/v1/bug-assets")
        expect(init.method).toBe("POST")
        expect((init.headers as Record<string, string>).token).toBe("jwt")
        const form = init.body as FormData
        expect(form.get("publicationPolicy")).toBe("github_safe")
        expect(form.get("file")).toBeInstanceOf(File)
    })

    it("上传失败抛出带错误码的 BugApiError", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => mockResponse(429, { success: false, code: "RATE_LIMITED", error: "上传过于频繁，请稍后重试" }))
        )
        const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" })
        const error = await uploadBugAsset(file).catch(reason => reason)
        expect(error).toBeInstanceOf(BugApiError)
        expect(error.code).toBe("RATE_LIMITED")
        expect(error.message).toContain("上传过于频繁")
    })

    it("查询图片状态：404 抛 NOT_FOUND，成功返回状态", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => mockResponse(404, { success: false, code: "NOT_FOUND", error: "资产不存在" }))
        )
        const error = await getBugAssetStatus("asset-1").catch(reason => reason)
        expect(error).toBeInstanceOf(BugApiError)
        expect(error.code).toBe("NOT_FOUND")

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => mockResponse(200, { success: true, assetId: "asset-1", scanState: "clean" }))
        )
        await expect(getBugAssetStatus("asset-1")).resolves.toMatchObject({ scanState: "clean" })
    })

    it("图片内容地址指向鉴权代理", () => {
        expect(bugAssetContentUrl("asset 1")).toContain("/api/v1/bug-assets/asset%201/content")
    })

    it("submitBug 复用幂等键并自动落盘回执", async () => {
        clientMock.mutation.mockReturnValue(
            mutationResult({
                submitBug: {
                    submissionId: "sub-9",
                    revision: 1,
                    state: "queued",
                    processingMode: "immediate",
                    receiptToken: "rec-9",
                    suggestedPollAfterSeconds: 3,
                },
            })
        )
        const result = await submitBug(
            { text: "卡住了", publicationPolicy: "GITHUB_SAFE", context: { gameId: "duet-night-abyss" } },
            { idempotencyKey: "idem-1" }
        )
        expect(result.error).toBeUndefined()
        expect(result.data?.submissionId).toBe("sub-9")
        expect(getReceiptToken("sub-9")).toBe("rec-9")

        const [, variables] = clientMock.mutation.mock.calls[0] as unknown as [unknown, { idempotencyKey: string }]
        expect(variables.idempotencyKey).toBe("idem-1")
    })

    it("setVote 不吞 GraphQL 错误码", async () => {
        clientMock.mutation.mockReturnValue(
            mutationResult(null, {
                message: "GraphQL Error",
                graphQLErrors: [{ message: "投票过于频繁", extensions: { code: "RATE_LIMITED" } }],
            })
        )
        const result = await setVote("bug-1", true)
        expect(result.data).toBeUndefined()
        expect(result.error?.code).toBe("RATE_LIMITED")
        expect(result.error?.message).toBe("投票过于频繁")
    })

    it("getSubmission 用回执头并强制走网络", async () => {
        clientMock.query.mockReturnValue(
            queryResult({ submission: { submission: { submissionId: "sub-1" }, versions: [], assets: [], bugIds: [] } })
        )
        const result = await getSubmission("sub-1", { receiptToken: "rec-1" })
        expect(result.data?.submission.submissionId).toBe("sub-1")

        const context = clientMock.query.mock.calls[0][2] as {
            requestPolicy: string
            fetchOptions: { headers: Record<string, string> }
        }
        expect(context.requestPolicy).toBe("network-only")
        expect(context.fetchOptions.headers.Authorization).toBe("Receipt rec-1")
    })

    it("getSubmission 网络错误转成 BugApiError", async () => {
        clientMock.query.mockReturnValue(queryResult(null, { message: "network", networkError: new Error("断网了") }))
        const result = await getSubmission("sub-1")
        expect(result.error?.message).toBe("断网了")
    })
})
