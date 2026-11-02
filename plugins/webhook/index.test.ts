import { describe, expect, test } from "bun:test"
import { getRuntime } from "../../apps/web/src/automation/runtime"
import type { AutomationEvent } from "../../apps/web/src/automation/types"
import def, { buildBody, normalizeMethod, parseHeaders, renderTemplate } from "./index"

describe("renderTemplate", () => {
    test("label and data placeholders", () => {
        expect(renderTemplate("{{label}}:{{data.a}}", { label: "l", data: { a: 1 } })).toBe("l:1")
    })
})

describe("normalizeMethod", () => {
    test("uppercases and defaults", () => {
        expect(normalizeMethod("post")).toBe("POST")
        expect(normalizeMethod("  ")).toBe("POST")
    })
})

describe("parseHeaders", () => {
    test("empty renders to {}", () => {
        expect(parseHeaders("", { label: "x" })).toEqual({})
    })
    test("renders placeholders then parses", () => {
        expect(parseHeaders('{"X-E":"{{label}}","N":{{data.n}}}', { label: "e", data: { n: 2 } })).toEqual({
            "X-E": "e",
            N: "2",
        })
    })
    test("rejects invalid JSON and non-objects", () => {
        expect(() => parseHeaders("{oops", {})).toThrow()
        expect(() => parseHeaders("[1]", {})).toThrow()
    })
})

describe("buildBody", () => {
    test("blank template sends full event JSON", () => {
        const event = { label: "l", data: { a: 1 } }
        expect(buildBody("", event)).toBe(JSON.stringify(event))
        expect(buildBody("   ", event)).toBe(JSON.stringify(event))
    })
    test("template renders placeholders", () => {
        expect(buildBody('{"l":"{{label}}"}', { label: "x" })).toBe('{"l":"x"}')
    })
})

describe("webhook.post def", () => {
    test("id and fields", () => {
        expect(def.id).toBe("webhook.post")
        expect(def.fields.map(f => f.key)).toEqual(["url", "method", "headers", "bodyTemplate"])
        expect(def.fields[0].required).toBe(true)
    })
    test("execute validates without network", async () => {
        function evt(): AutomationEvent {
            return { source: "manual", kind: "test", at: 0, label: "", data: {} }
        }
        const ctx = { event: evt(), signal: AbortSignal.timeout(1000), runtime: getRuntime() }
        expect(await def.execute({}, ctx)).toEqual({ ok: false, message: "missing required field: url" })
        expect(await def.execute({ url: "ftp://x" }, ctx)).toEqual({ ok: false, message: "url must be http(s)" })
        expect(await def.execute({ url: "http://x", headers: "{bad" }, ctx)).toEqual({
            ok: false,
            message: "headers is not valid JSON",
        })
    })
})
