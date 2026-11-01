import { describe, expect, it } from "bun:test"
import { clientAcceptsZstd, maybeCompressGraphqlResponse, ZSTD_THRESHOLD_BYTES } from "./zstdResponse"

function graphqlJsonResponse(payload: string): Response {
    return new Response(payload, { headers: { "content-type": "application/json; charset=utf-8" } })
}

function requestWithEncoding(acceptEncoding: string | null): Request {
    return new Request("http://localhost/graphql", { headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {} })
}

describe("clientAcceptsZstd", () => {
    it("识别常规 Accept-Encoding", () => {
        expect(clientAcceptsZstd(requestWithEncoding("gzip, deflate, br, zstd"))).toBe(true)
        expect(clientAcceptsZstd(requestWithEncoding("gzip, deflate, br"))).toBe(false)
        expect(clientAcceptsZstd(requestWithEncoding(null))).toBe(false)
    })

    it("q=0 表示拒绝", () => {
        expect(clientAcceptsZstd(requestWithEncoding("zstd;q=0, gzip"))).toBe(false)
        expect(clientAcceptsZstd(requestWithEncoding("zstd;q=0.5"))).toBe(true)
    })
})

describe("maybeCompressGraphqlResponse", () => {
    it(`小于 ${ZSTD_THRESHOLD_BYTES}B 的响应不压缩`, async () => {
        const res = await maybeCompressGraphqlResponse(
            requestWithEncoding("zstd"),
            graphqlJsonResponse(JSON.stringify({ data: { ok: true } }))
        )
        expect(res.headers.get("content-encoding")).toBeNull()
        expect(await res.json()).toEqual({ data: { ok: true } })
    })

    it("大于阈值时压缩并可回解", async () => {
        const big = JSON.stringify({
            data: { items: Array.from({ length: 500 }, (_, i) => ({ id: i, name: `name-${i}-${"x".repeat(40)}` })) },
        })
        expect(Buffer.byteLength(big)).toBeGreaterThan(ZSTD_THRESHOLD_BYTES)
        const res = await maybeCompressGraphqlResponse(requestWithEncoding("gzip, br, zstd"), graphqlJsonResponse(big))
        expect(res.headers.get("content-encoding")).toBe("zstd")
        expect(res.headers.get("vary")).toContain("Accept-Encoding")
        const raw = Buffer.from(await res.arrayBuffer())
        expect(raw.length).toBeLessThan(Buffer.byteLength(big))
        expect((await Bun.zstdDecompress(raw)).toString("utf-8")).toBe(big)
    })

    it("客户端不支持 zstd 时不压缩", async () => {
        const big = "x".repeat(ZSTD_THRESHOLD_BYTES + 100)
        const res = await maybeCompressGraphqlResponse(requestWithEncoding("gzip, br"), graphqlJsonResponse(big))
        expect(res.headers.get("content-encoding")).toBeNull()
        expect(await res.text()).toBe(big)
    })

    it("非 JSON 响应不压缩", async () => {
        const big = new Response("x".repeat(ZSTD_THRESHOLD_BYTES + 100), { headers: { "content-type": "text/event-stream" } })
        const res = await maybeCompressGraphqlResponse(requestWithEncoding("zstd"), big)
        expect(res.headers.get("content-encoding")).toBeNull()
    })

    it("已有 Content-Encoding 时直接透传", async () => {
        const big = new Response("x".repeat(ZSTD_THRESHOLD_BYTES + 100), {
            headers: { "content-type": "application/json", "content-encoding": "gzip" },
        })
        const res = await maybeCompressGraphqlResponse(requestWithEncoding("zstd"), big)
        expect(res.headers.get("content-encoding")).toBe("gzip")
    })
})
