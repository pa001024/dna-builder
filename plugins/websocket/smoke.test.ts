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

describe("websocket.send smoke（本地靶点）", () => {
    test("消息原文到达后断开", async () => {
        const received: string[] = []
        server = Bun.serve({
            port: 0,
            fetch(req, srv) {
                if (srv.upgrade(req)) return undefined as unknown as Response
                return new Response("expected websocket", { status: 400 })
            },
            websocket: {
                message(_ws, message) {
                    received.push(String(message))
                },
            },
        })
        const res = await def.execute({ url: `ws://127.0.0.1:${server.port}/ws`, payload: "hello-{{label}}" }, ctx())
        expect(res).toEqual({ ok: true })
        for (let i = 0; i < 50 && received.length === 0; i++) {
            await new Promise(resolve => setTimeout(resolve, 10))
        }
        expect(received).toEqual(["hello-L"])
    })

    test("连不上报失败不断言抛错", async () => {
        const res = await def.execute({ url: "ws://127.0.0.1:1/none" }, ctx())
        expect(res.ok).toBe(false)
    })
})
