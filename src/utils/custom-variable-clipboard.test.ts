import { describe, expect, it } from "vitest"
import { formatCustomVariablesClipboardText, parseCustomVariablesClipboardText } from "./custom-variable-clipboard"

describe("custom-variable-clipboard", () => {
    it("应该将自定义变量序列化为逐行等号格式", () => {
        expect(
            formatCustomVariablesClipboardText([
                ["A", "B"],
                ["", ""],
                ["C", "D"],
            ])
        ).toBe("A=B\nC=D")
    })

    it("应该按首个等号解析并兼容空行与 CRLF", () => {
        expect(parseCustomVariablesClipboardText(" A = B=C\r\n\r\nC=D ")).toEqual([
            ["A", "B=C"],
            ["C", "D"],
        ])
    })

    it("应该拒绝缺少等号的非空行", () => {
        expect(() => parseCustomVariablesClipboardText("A=B\ninvalid")).toThrow("第 2 行格式错误")
    })
})
