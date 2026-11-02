import { afterEach, describe, expect, test } from "bun:test"
import type { ActionContext } from "@dob/host"
import def from "./index"

function ctx(): ActionContext {
    return {
        event: { source: "manual", kind: "test", at: 0, label: "L", data: { k: "v" } },
        signal: AbortSignal.timeout(5000),
        runtime: { fetch } as unknown as ActionContext["runtime"],
    }
}

let server: ReturnType<typeof Bun.serve> | null = null
afterEach(() => {
    server?.stop(true)
    server = null
})

describe("webhook.post smoke（本地靶点）", () => {
    test("POST JSON：方法/头/体原样到达", async () => {
        let seen: { method: string; headers: Record<string, string>; body: string } | null = null
        server = Bun.serve({
            port: 0,
            async fetch(req) {
                seen = {
                    method: req.method,
                    headers: Object.fromEntries(req.headers.entries()),
                    body: await req.text(),
                }
                return Response.json({ ok: true })
            },
        })
        const res = await def.execute(
            {
                url: `http://127.0.0.1:${server.port}/hook`,
                method: "POST",
                headers: '{"X-Tag":"1"}',
                bodyTemplate: '{"label":"{{label}}","k":"{{data.k}}"}',
            },
            ctx()
        )
        expect(res).toEqual({ ok: true })
        expect(seen?.method).toBe("POST")
        expect(seen?.headers["x-tag"]).toBe("1")
        expect(JSON.parse(seen?.body ?? "{}")).toEqual({ label: "L", k: "v" })
    })

    test("GET 不带 body", async () => {
        let seen: { method: string; body: string } | null = null
        server = Bun.serve({
            port: 0,
            async fetch(req) {
                seen = { method: req.method, body: await req.text() }
                return new Response("ok")
            },
        })
        const res = await def.execute({ url: `http://127.0.0.1:${server.port}/ping`, method: "get" }, ctx())
        expect(res).toEqual({ ok: true })
        expect(seen?.method).toBe("GET")
        expect(seen?.body).toBe("")
    })

    test("靶点 500 报失败", async () => {
        server = Bun.serve({ port: 0, fetch: () => new Response("boom", { status: 500 }) })
        const res = await def.execute({ url: `http://127.0.0.1:${server.port}/x` }, ctx())
        expect(res.ok).toBe(false)
    })
})
