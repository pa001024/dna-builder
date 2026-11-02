import { describe, expect, test } from "bun:test"
import { getRuntime } from "../../apps/web/src/automation/runtime"
import type { AutomationEvent } from "../../apps/web/src/automation/types"
import def, { buildSendPayload, renderTemplate } from "./index"

function evt(over: Partial<AutomationEvent> = {}): AutomationEvent {
    return { source: "manual", kind: "test", at: 0, label: "", data: {}, ...over }
}

describe("renderTemplate", () => {
    test("label and nested data placeholders", () => {
        expect(renderTemplate("{{label}} {{data.a.b}}", { label: "l", data: { a: { b: 1 } } })).toBe("l 1")
    })
})

describe("buildSendPayload", () => {
    test("trims chat id, keeps text as-is", () => {
        expect(buildSendPayload("  123  ", "hi")).toEqual({ chat_id: "123", text: "hi" })
    })
})

describe("astrbot.send def", () => {
    test("id and fields", () => {
        expect(def.id).toBe("astrbot.send")
        expect(def.fields.map(f => f.key)).toEqual(["baseUrl", "path", "token", "chatId", "text"])
        expect(def.fields[2].type).toBe("password")
        expect(def.fields[3].required).toBe(true)
    })
    test("execute validates without network", async () => {
        const ctx = { event: evt({ label: "l" }), signal: AbortSignal.timeout(1000), runtime: getRuntime() }
        expect(await def.execute({}, ctx)).toEqual({ ok: false, message: "missing required field: baseUrl" })
        expect(await def.execute({ baseUrl: "http://x" }, ctx)).toEqual({
            ok: false,
            message: "missing required field: chatId",
        })
        expect(await def.execute({ baseUrl: "ftp://x", chatId: "1" }, ctx)).toEqual({
            ok: false,
            message: "baseUrl must be http(s)",
        })
    })
    test("execute never leaks the token in messages", async () => {
        const ctx = { event: evt(), signal: AbortSignal.timeout(1000), runtime: getRuntime() }
        const res = await def.execute({ baseUrl: "ftp://x", chatId: "1", token: "tok-secret-9" }, ctx)
        expect(JSON.stringify(res)).not.toContain("tok-secret-9")
    })
})
