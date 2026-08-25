import { describe, expect, it } from "vitest"
import { createScriptHeader, parseScriptHeader, replaceScriptHeader } from "@/utils/script-header"

describe("script-header hotkey fields", () => {
    it("parses @hotkey and @hotif from header", () => {
        const header = `// ==UserScript==
// @id abc
// @name test
// @description -
// @author anonymous
// @version 1.0.0
// @category 其他
// @date 2025-01-01
// @hotkey ^c
// @hotif ahk_exe A || ahk_exe B
// ==/UserScript==`
        const parsed = parseScriptHeader(header)
        expect(parsed.hotkey).toBe("^c")
        expect(parsed.hotif).toBe("ahk_exe A || ahk_exe B")
    })

    it("omits @hotkey/@hotif lines when not provided", () => {
        const header = createScriptHeader({ name: "test" })
        expect(header).not.toContain("@hotkey")
        expect(header).not.toContain("@hotif")
    })

    it("writes @hotkey and @hotif lines when provided", () => {
        const header = createScriptHeader({ name: "test", hotkey: "^c", hotif: "ahk_exe A || ahk_exe B" })
        expect(header).toContain("// @hotkey ^c")
        expect(header).toContain("// @hotif ahk_exe A || ahk_exe B")
    })

    it("round-trips @hotkey/@hotif through replaceScriptHeader", () => {
        const content = `// ==UserScript==
// @id abc
// @name test
// @description -
// @author anonymous
// @version 1.0.0
// @category 其他
// @date 2025-01-01
// @hotkey ^c
// @hotif ahk_exe A
// ==/UserScript==

console.log("hi")
`
        const replaced = replaceScriptHeader(content, { name: "test" })
        const parsed = parseScriptHeader(replaced)
        expect(parsed.hotkey).toBe("^c")
        expect(parsed.hotif).toBe("ahk_exe A")
    })

    it("clears existing @hotkey/@hotif when explicitly empty", () => {
        const content = `// ==UserScript==
// @id abc
// @name test
// @description -
// @author anonymous
// @version 1.0.0
// @category 其他
// @date 2025-01-01
// @hotkey ^c
// @hotif ahk_exe A
// ==/UserScript==
`
        const replaced = replaceScriptHeader(content, { name: "test", hotkey: "", hotif: "" })
        expect(replaced).not.toContain("@hotkey")
        expect(replaced).not.toContain("@hotif")
    })
})
