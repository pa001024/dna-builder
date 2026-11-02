import { describe, expect, it } from "vitest"
import { builtinActions, renderTemplate } from "./builtin"

describe("builtin notify.system", () => {
    it("id 与字段", () => {
        expect(builtinActions.map(def => def.id)).toEqual(["notify.system"])
        expect(builtinActions[0].fields.map(f => f.key)).toEqual(["title", "body"])
    })

    it("renderTemplate 占位符", () => {
        expect(renderTemplate("{{label}}", { label: "n", data: {} })).toBe("n")
        expect(renderTemplate("{{data.k}}", { label: "", data: { k: "v" } })).toBe("v")
        expect(renderTemplate("{{data}}", { label: "", data: { k: 1 } })).toBe('{"k":1}')
        expect(renderTemplate("{{missing}}", { label: "", data: {} })).toBe("")
    })

    it("空标题正文直接拒绝不碰运行时", async () => {
        const res = await builtinActions[0].execute(
            { title: "  ", body: "" },
            {
                event: { source: "manual", kind: "test", at: 0, label: "", data: {} },
                signal: AbortSignal.timeout(1000),
                runtime: undefined as never,
            }
        )
        expect(res).toEqual({ ok: false, message: "empty notification" })
    })
})
