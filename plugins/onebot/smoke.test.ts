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

/** 按 OneBot11 协议校验请求体的桩：字段缺失直接 400，业务失败按真实实现返回 200 + retcode != 0。 */
function stub(handler: (body: Record<string, unknown>, headers: Headers) => Response): number {
    server = Bun.serve({
        port: 0,
        async fetch(req) {
            const url = new URL(req.url)
            if (url.pathname !== "/send_msg") return new Response("not found", { status: 404 })
            return handler((await req.json()) as Record<string, unknown>, req.headers)
        },
    })
    return server.port
}

describe("onebot.send smoke（OneBot11 桩）", () => {
    test("群消息字段符合协议且成功", async () => {
        let seen: Record<string, unknown> | null = null
        let auth: string | null = null
        const port = stub((body, headers) => {
            seen = body
            auth = headers.get("authorization")
            if (body.message_type !== "group" || body.group_id !== 123 || typeof body.message !== "string") {
                return Response.json({ status: "failed", retcode: 100, data: null, echo: "" })
            }
            return Response.json({ status: "ok", retcode: 0, data: { message_id: 42 }, echo: "" })
        })
        const res = await def.execute(
            { baseUrl: `http://127.0.0.1:${port}`, token: "t", targetType: "group", targetId: "123", message: "hi-{{label}}" },
            ctx()
        )
        expect(res).toEqual({ ok: true })
        expect(auth).toBe("Bearer t")
        expect(seen).toMatchObject({ message_type: "group", group_id: 123, message: "hi-L" })
    })

    test("私聊映射到 user_id", async () => {
        let seen: Record<string, unknown> | null = null
        const port = stub(body => {
            seen = body
            if (body.message_type !== "private" || body.user_id !== 777) {
                return Response.json({ status: "failed", retcode: 100, data: null, echo: "" })
            }
            return Response.json({ status: "ok", retcode: 0, data: { message_id: 7 }, echo: "" })
        })
        const res = await def.execute({ baseUrl: `http://127.0.0.1:${port}`, targetType: "private", targetId: "777", message: "m" }, ctx())
        expect(res).toEqual({ ok: true })
        expect(seen).toMatchObject({ message_type: "private", user_id: 777 })
    })

    test("业务失败（HTTP 200 + retcode!=0）必须报失败", async () => {
        const port = stub(() => Response.json({ status: "failed", retcode: 1200, data: null, echo: "" }))
        const res = await def.execute({ baseUrl: `http://127.0.0.1:${port}`, targetType: "group", targetId: "0", message: "m" }, ctx())
        expect(res.ok).toBe(false)
        expect(res.message).toContain("1200")
    })
})
