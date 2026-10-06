import { describe, expect, it } from "vitest"
import { npcMap } from "@/data/d"
import { getDialogueDisplayContent, getDialogueSpeakerName } from "@/utils/dialogue"
import { DEFAULT_STORY_TEXT_CONFIG } from "@/utils/story-text"

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

describe("getDialogueSpeakerName", () => {
    it("prefers the exporter-provided speakerName", () => {
        expect(getDialogueSpeakerName({ speakerName: "导出器说话人", npc: 1001 }, DEFAULT_STORY_TEXT_CONFIG)).toBe("导出器说话人")
    })

    it("returns an empty string when the dialogue has no speaker", () => {
        expect(getDialogueSpeakerName({}, DEFAULT_STORY_TEXT_CONFIG)).toBe("")
    })

    it("falls back to the npc id when the npc is unknown", () => {
        expect(getDialogueSpeakerName({ npc: 999999 }, DEFAULT_STORY_TEXT_CONFIG)).toBe("999999")
    })

    it("resolves the npc name and replaces story placeholders", () => {
        npcMap.set(424242, { id: 424242, name: "{nickname}的同伴" })
        try {
            expect(getDialogueSpeakerName({ npc: 424242 }, DEFAULT_STORY_TEXT_CONFIG)).toBe("维塔的同伴")
        } finally {
            npcMap.delete(424242)
        }
    })
})
