import { describe, expect, test } from "bun:test"
import { getRuntime } from "../../apps/web/src/automation/runtime"
import type { AutomationEvent } from "../../apps/web/src/automation/types"
import def, { buildSendPayload, coerceTargetId, stripTrailingSlash } from "./index"

function evt(): AutomationEvent {
    return { source: "manual", kind: "test", at: 0, label: "", data: {} }
}

describe("stripTrailingSlash", () => {
    test("trims slashes and whitespace", () => {
        expect(stripTrailingSlash("http://x:5700///  ")).toBe("http://x:5700")
        expect(stripTrailingSlash("http://x")).toBe("http://x")
    })
})

describe("coerceTargetId", () => {
    test("numeric ids become numbers", () => {
        expect(coerceTargetId("123456")).toBe(123456)
    })
    test("non-numeric ids stay strings", () => {
        expect(coerceTargetId("abc")).toBe("abc")
    })
})

describe("buildSendPayload", () => {
    test("group maps to group_id", () => {
        expect(buildSendPayload("group", "123", "hi")).toEqual({ message_type: "group", group_id: 123, message: "hi" })
    })
    test("private and aliases map to user_id", () => {
        expect(buildSendPayload("private", "42", "hi")).toEqual({ message_type: "private", user_id: 42, message: "hi" })
        expect(buildSendPayload("  USER ", "qq", "hi")).toEqual({ message_type: "private", user_id: "qq", message: "hi" })
    })
    test("blank type defaults to group, unknown types throw", () => {
        expect(buildSendPayload("", "1", "m").message_type).toBe("group")
        expect(() => buildSendPayload("channel", "1", "m")).toThrow("unsupported targetType")
    })
})

describe("onebot.send def", () => {
    test("id and fields", () => {
        expect(def.id).toBe("onebot.send")
        expect(def.fields.map(f => f.key)).toEqual(["baseUrl", "token", "targetType", "targetId", "message"])
        expect(def.fields[1].type).toBe("password")
        expect(def.fields[3].required).toBe(true)
    })
    test("execute validates without network", async () => {
        const ctx = { event: evt(), signal: AbortSignal.timeout(1000), runtime: getRuntime() }
        expect(await def.execute({ targetId: "1", baseUrl: "bad" }, ctx)).toEqual({
            ok: false,
            message: "invalid baseUrl",
        })
        expect(await def.execute({ baseUrl: "http://x" }, ctx)).toEqual({
            ok: false,
            message: "missing required field: targetId",
        })
        expect(await def.execute({ baseUrl: "http://x", targetId: "1", targetType: "nope" }, ctx)).toEqual({
            ok: false,
            message: "unsupported targetType: nope (expected group or private)",
        })
    })
})
