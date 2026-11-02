import { describe, expect, test } from "bun:test"
import def, { renderTemplate } from "./index"

describe("run.program", () => {
    test("id 与字段", () => {
        expect(def.id).toBe("run.program")
        expect(def.fields.map(f => f.key)).toEqual(["mode", "path", "params"])
    })

    test("模板渲染", () => {
        expect(renderTemplate("{{label}}-{{data.id}}", { label: "n", data: { id: 1 } })).toBe("n-1")
    })

    test("非桌面环境直接拒绝", async () => {
        const res = await def.execute(
            { path: "C:\\x.exe" },
            {
                event: { source: "manual", kind: "test", at: 0, label: "", data: {} },
                signal: AbortSignal.timeout(1000),
                runtime: undefined as never,
            }
        )
        expect(res.ok).toBe(false)
    })

    test("缺路径报错", async () => {
        const res = await def.execute(
            {},
            {
                event: { source: "manual", kind: "test", at: 0, label: "", data: {} },
                signal: AbortSignal.timeout(1000),
                runtime: undefined as never,
            }
        )
        expect(res).toEqual({ ok: false, message: "missing required field: path" })
    })
})
