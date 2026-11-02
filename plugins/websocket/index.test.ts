import { describe, expect, test } from "bun:test"
import { getRuntime } from "../../apps/web/src/automation/runtime"
import type { AutomationEvent } from "../../apps/web/src/automation/types"
import def, { buildPayload, validateSocketUrl } from "./index"

function evt(): AutomationEvent {
    return { source: "manual", kind: "test", at: 0, label: "", data: {} }
}

describe("validateSocketUrl", () => {
    test("accepts ws/wss", () => {
        expect(validateSocketUrl("wss://example.com/x")).toBe("wss://example.com/x")
        expect(validateSocketUrl("  ws://127.0.0.1:9000  ")).toBe("ws://127.0.0.1:9000")
    })
    test("rejects blank, invalid and non-ws urls", () => {
        expect(() => validateSocketUrl("")).toThrow("missing required field: url")
        expect(() => validateSocketUrl("http://example.com")).toThrow("url must be ws(s)")
        expect(() => validateSocketUrl("::::")).toThrow("invalid url")
    })
})

describe("buildPayload", () => {
    test("blank template sends full event JSON", () => {
        const event = { label: "l", data: { a: 1 } }
        expect(buildPayload("", event)).toBe(JSON.stringify(event))
    })
    test("renders placeholders", () => {
        expect(buildPayload("go {{label}} {{data.a}}", { label: "x", data: { a: 2 } })).toBe("go x 2")
    })
})

describe("websocket.send def", () => {
    test("id and fields", () => {
        expect(def.id).toBe("websocket.send")
        expect(def.fields.map(f => f.key)).toEqual(["url", "payload", "reconnect"])
        expect(def.fields[2].type).toBe("boolean")
    })
    test("execute validates url without network", async () => {
        const good = { event: evt(), signal: AbortSignal.timeout(1000), runtime: getRuntime() }
        expect(await def.execute({}, good)).toEqual({ ok: false, message: "missing required field: url" })
        expect(await def.execute({ url: "https://x" }, good)).toEqual({
            ok: false,
            message: "url must be ws(s)",
        })
    })
    test("execute honors pre-aborted signal", async () => {
        const ctrl = new AbortController()
        ctrl.abort()
        const res = await def.execute({ url: "ws://127.0.0.1:9" }, { event: evt(), signal: ctrl.signal, runtime: getRuntime() })
        expect(res).toEqual({ ok: false, message: "request aborted" })
    })
})
