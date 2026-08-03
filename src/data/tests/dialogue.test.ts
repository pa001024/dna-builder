import { describe, expect, it } from "vitest"
import { getDialogueDisplayContent } from "@/utils/dialogue"

describe("getDialogueDisplayContent", () => {
    it("keeps dialogue content when it exists", () => {
        expect(getDialogueDisplayContent({ content: "你好", options: [{ id: 1, content: "选项" }] })).toBe("你好")
    })

    it("hides missing content when dialogue has options", () => {
        expect(getDialogueDisplayContent({ options: [{ id: 1, content: "选项" }], voice: "voice-id" })).toBe("")
    })

    it("uses an ellipsis for voice-only dialogue", () => {
        expect(getDialogueDisplayContent({ voice: "voice-id" })).toBe("…")
    })
})
