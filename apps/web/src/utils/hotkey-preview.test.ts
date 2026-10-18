import { describe, expect, it } from "vitest"
import {
    buildRecordedHotkey,
    normalizeRecordedKeyboardKey,
    normalizeRecordedMouseButton,
    tokenizeHotkeyDisplay,
    tokenizeHotkeyPreview,
} from "@/utils/hotkey-preview"

describe("tokenizeHotkeyPreview", () => {
    it("splits modifier prefixes", () => {
        expect(tokenizeHotkeyPreview("^c").map(token => token.text)).toEqual(["^", "c"])
    })

    it("splits combo separators", () => {
        expect(tokenizeHotkeyPreview("CapsLock & c").map(token => token.text)).toEqual(["CapsLock", "&", "c"])
    })

    it("splits plus chains", () => {
        expect(tokenizeHotkeyPreview("Ctrl+Shift+Del").map(token => token.text)).toEqual(["Ctrl", "+", "Shift", "+", "Del"])
    })

    it("renders human readable display tokens", () => {
        expect(tokenizeHotkeyDisplay("^c").map(token => token.text)).toEqual(["Ctrl", "+", "C"])
    })

    it("builds recorder hotkeys", () => {
        expect(buildRecordedHotkey({ ctrl: true, alt: false, shift: true, meta: false }, "Del")).toBe("^+Del")
    })

    it("normalizes keyboard keys", () => {
        expect(normalizeRecordedKeyboardKey({ key: "ArrowUp", code: "ArrowUp" } as KeyboardEvent)).toBe("Up")
    })

    it("normalizes mouse buttons", () => {
        expect(normalizeRecordedMouseButton(2)).toBe("RButton")
    })

    it("normalizes space and numpad keys", () => {
        expect(normalizeRecordedKeyboardKey({ key: " ", code: "Space" } as KeyboardEvent)).toBe("Space")
        expect(normalizeRecordedKeyboardKey({ key: "NumpadAdd", code: "NumpadAdd" } as KeyboardEvent)).toBe("NumpadAdd")
    })
})
