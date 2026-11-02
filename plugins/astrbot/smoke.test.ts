import { afterEach, describe, expect, test } from "bun:test"
import type { ActionContext } from "@dob/host"
import def from "./index"

function ctx(): ActionContext {
    return {
        event: { source: "manual", kind: "test", at: 0, label: "L", data: {} },
        signal: AbortSignal.timeout(5000),
        runtime: { fetch } as unknown as ActionContext["runtime"],
    }
}

let server: ReturnType<typeof Bun.serve> | null = null
afterEach(() => {
    server?.stop(true)
    server = null
})

/** 按插件 README 假定契约实现的桩（真实实例尚未验证，路径可配）。 */
function stub(expectedPath: string, onBody: (body: Record<string, unknown>) => void): number {
    server = Bun.serve({
        port: 0,
        async fetch(req) {
            const url = new URL(req.url)
            if (url.pathname !== expectedPath) return new Response("not found", { status: 404 })
            if (req.headers.get("authorization") !== "Bearer t") return new Response("unauthorized", { status: 401 })
            onBody((await req.json()) as Record<string, unknown>)
            return Response.json({ ok: true })
        },
    })
    return server.port
}

describe("astrbot.send smoke（假定契约桩）", () => {
    test("默认路径 /sendMessage，chat_id/text 原样到达", async () => {
        let seen: Record<string, unknown> | null = null
        const port = stub("/sendMessage", body => {
            seen = body
        })
        const res = await def.execute({ baseUrl: `http://127.0.0.1:${port}`, token: "t", chatId: "123", text: "hi-{{label}}" }, ctx())
        expect(res).toEqual({ ok: true })
        expect(seen).toEqual({ chat_id: "123", text: "hi-L" })
    })

    test("自定义路径（无前导斜杠也拼得对）", async () => {
        let hit = false
        const port = stub("/api/send_message", () => {
            hit = true
        })
        const res = await def.execute(
            { baseUrl: `http://127.0.0.1:${port}`, token: "t", path: "api/send_message", chatId: "1", text: "x" },
            ctx()
        )
        expect(res).toEqual({ ok: true })
        expect(hit).toBe(true)
    })

    test("鉴权失败报失败", async () => {
        const port = stub("/sendMessage", () => {})
        const res = await def.execute({ baseUrl: `http://127.0.0.1:${port}`, token: "wrong", chatId: "1", text: "x" }, ctx())
        expect(res.ok).toBe(false)
    })
})
