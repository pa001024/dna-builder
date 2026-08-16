import { describe, expect, it } from "vitest"
import { generateCode, toIdentifier } from "./codegen"
import { createDefaultDoc, type FlowNode } from "./types"

let seq = 0
function nid(prefix: string): string {
    seq += 1
    return `${prefix}_${seq}`
}

function doc(main: FlowNode[], extra: Partial<ReturnType<typeof createDefaultDoc>> = {}) {
    return { ...createDefaultDoc(), ...extra, main }
}

describe("toIdentifier", () => {
    it("converts illegal chars and leading digits", () => {
        expect(toIdentifier("循环 次数")).toBe("循环_次数")
        expect(toIdentifier("1st")).toBe("v_1st")
        expect(toIdentifier("")).toBe("v")
    })
})

describe("generateCode", () => {
    it("emits empty main with default cap bootstrap", () => {
        const { code } = generateCode(doc([]))
        expect(code).toContain('import { Cap } from "cap"')
        expect(code).toContain('const c = new Cap(getWindowByProcessName("EM-Win64-Shipping.exe"))')
        expect(code).toContain("async function main() {")
        expect(code.trim().endsWith("main()")).toBe(true)
    })

    it("emits frameless option", () => {
        const { code } = generateCode(doc([], { frameless: true, processName: "game.exe" }))
        expect(code).toContain('new Cap(getWindowByProcessName("game.exe"), { resize: false, yOffset: 0 })')
    })

    it("emits config vars", () => {
        const { code } = generateCode(
            doc([], {
                configVars: [
                    { name: "次数", desc: "循环次数", kind: "number", options: [], defaultValue: 5, varName: "times" },
                    { name: "模式", desc: "", kind: "select", options: ["速刷", "慢刷"], defaultValue: "速刷", varName: "mode" },
                ],
            })
        )
        expect(code).toContain('const times = readConfig("次数", "循环次数", "number", 5)')
        expect(code).toContain('const mode = readConfig("模式", "", { type: "select", options: ["速刷","慢刷"] }, "速刷")')
    })

    it("emits mouse/key/sleep actions through Cap", () => {
        const { code } = generateCode(
            doc([
                { id: nid("a"), kind: "mouseClick", x: 800, y: 600, button: "left" },
                { id: nid("a"), kind: "keyPress", key: "q", duration: 100 },
                { id: nid("a"), kind: "sleep", ms: 500 },
                { id: nid("a"), kind: "capFrame" },
            ])
        )
        expect(code).toContain("c.mc(800, 600)")
        expect(code).toContain('await c.kb("q", 100)')
        expect(code).toContain("await sleep(500)")
        expect(code).toContain("c.cap()")
    })

    it("emits playDsl and stopPlay", () => {
        const { code } = generateCode(
            doc([
                { id: nid("a"), kind: "playDsl", dsl: "L(800,600)0.1 q" },
                { id: nid("a"), kind: "playDsl", dsl: "+0 q0.1", saveAs: "task" },
                { id: nid("a"), kind: "stopPlay" },
            ])
        )
        expect(code).toContain('await c.play("L(800,600)0.1 q")')
        expect(code).toContain('const task = c.play("+0 q0.1")')
        expect(code).toContain("c.stopPlay()")
    })

    it("emits while/if-else/switch control flow", () => {
        const { code } = generateCode(
            doc([
                {
                    id: nid("c"),
                    kind: "loop",
                    loopType: "while",
                    condition: {
                        op: "and",
                        items: [
                            { op: "call", fn: "colorExists", x: 100, y: 200, color: 0xffaa00, tolerance: 10 },
                            { op: "cmp", left: { type: "var", name: "times" }, cmp: ">", right: { type: "literal", value: 0 } },
                        ],
                    },
                    body: [
                        {
                            id: nid("c"),
                            kind: "if",
                            condition: {
                                op: "cmp",
                                left: { type: "var", name: "mode" },
                                cmp: "==",
                                right: { type: "literal", value: "速刷" },
                            },
                            thenBody: [{ id: nid("a"), kind: "keyPress", key: "e" }],
                            elseBody: [{ id: nid("a"), kind: "sleep", ms: 100 }],
                        },
                        {
                            id: nid("c"),
                            kind: "switch",
                            subjectVar: "mode",
                            cases: [
                                { id: nid("s"), match: "速刷", body: [{ id: nid("a"), kind: "break" }] },
                                { id: nid("s"), match: "慢刷", body: [{ id: nid("a"), kind: "continue" }] },
                            ],
                            defaultBody: [{ id: nid("a"), kind: "code", source: 'setStatus("提示", "未知模式")' }],
                        },
                    ],
                },
            ])
        )
        expect(code).toContain("while ((cc(c.frame, 100, 200, 0xFFAA00, 10)) && (times > 0)) {")
        expect(code).toContain('if (mode == "速刷") {')
        expect(code).toContain("} else {")
        expect(code).toContain("switch (mode) {")
        expect(code).toContain('case "速刷":')
        expect(code).toContain("break")
        expect(code).toContain("default:")
        expect(code).toContain('setStatus("提示", "未知模式")')
    })

    it("emits async function definitions and calls", () => {
        const { code, issues } = generateCode(
            doc([
                {
                    id: nid("f"),
                    kind: "functionDef",
                    funcName: "刷图",
                    body: [{ id: nid("a"), kind: "mouseClick", x: 1, y: 2, button: "right" }],
                },
                { id: nid("f"), kind: "functionCall", funcName: "刷图" },
                { id: nid("f"), kind: "functionCall", funcName: "不存在" },
            ])
        )
        expect(code).toContain("async function fn_刷图() {")
        expect(code).toContain("await fn_刷图()")
        expect(code).toContain("// TODO: 未定义的函数 不存在")
        expect(issues.some(i => i.message.includes("不存在"))).toBe(true)
    })

    it("emits waitColor with variable capture", () => {
        const { code } = generateCode(
            doc([{ id: nid("a"), kind: "waitColor", x: 10, y: 20, color: 0xffffff, tolerance: 5, timeout: 3000, saveAs: "found" }])
        )
        expect(code).toContain("const found = await c.waitColor(10, 20, 0xFFFFFF, 5, 3000)")
    })

    it("emits c.croi region feature checks", () => {
        const { code } = generateCode(
            doc([
                {
                    id: nid("c"),
                    kind: "if",
                    condition: {
                        op: "and",
                        items: [
                            {
                                op: "call",
                                fn: "roiExists",
                                x: 10,
                                y: 20,
                                width: 80,
                                height: 40,
                                hash: "0123456789abcdef",
                                tolerance: 10,
                                useFilter: true,
                                filterColor: 0xffffff,
                                filterTolerance: 30,
                            },
                            {
                                op: "call",
                                fn: "roiNotExists",
                                x: 100,
                                y: 200,
                                width: 20,
                                height: 16,
                                hash: "fedcba9876543210",
                                tolerance: 5,
                                useFilter: false,
                                filterColor: 0,
                                filterTolerance: 0,
                            },
                        ],
                    },
                    thenBody: [],
                    elseBody: [],
                },
            ])
        )
        expect(code).toContain(
            'if ((c.croi(c.frame.roi(10, 20, 80, 40), "0123456789abcdef", 10, 1, 0xFFFFFF, 30)) && (!c.croi(c.frame.roi(100, 200, 20, 16), "fedcba9876543210", 5))) {'
        )
    })

    it("emits count loop as for", () => {
        const { code } = generateCode(doc([{ id: nid("c"), kind: "loop", loopType: "count", count: 3, body: [] }]))
        expect(code).toContain("for (let i = 0; i < 3; i++) {")
        expect(code).toContain("// (空循环体)")
    })

    it("generated code is syntactically valid", () => {
        const { code } = generateCode(
            doc(
                [
                    {
                        id: nid("f"),
                        kind: "functionDef",
                        funcName: "farm",
                        body: [{ id: nid("a"), kind: "playDsl", dsl: "L(1,2)0.1" }],
                    },
                    {
                        id: nid("c"),
                        kind: "loop",
                        loopType: "forever",
                        body: [
                            { id: nid("f"), kind: "functionCall", funcName: "farm" },
                            {
                                id: nid("c"),
                                kind: "if",
                                condition: { op: "not", item: { op: "call", fn: "colorNotExists", x: 1, y: 1, color: 0, tolerance: 0 } },
                                thenBody: [{ id: nid("a"), kind: "break" }],
                                elseBody: [],
                            },
                        ],
                    },
                ],
                { configVars: [{ name: "n", desc: "d", kind: "boolean", options: [], defaultValue: true, varName: "flag" }] }
            )
        )
        expect(() => new Function(`return async () => { ${code.replace('import { Cap } from "cap"', "")} }`)).not.toThrow()
    })
})
