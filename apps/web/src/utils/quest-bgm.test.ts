import { describe, expect, it } from "vitest"
import { buildQuestBgmUrl, isQuestBgmPlayable } from "./quest-bgm"

describe("quest-bgm", () => {
    it("should return empty url for empty/mute resource", () => {
        expect(buildQuestBgmUrl(undefined)).toBe("")
        expect(buildQuestBgmUrl("")).toBe("")
        expect(buildQuestBgmUrl("mute")).toBe("")
        expect(buildQuestBgmUrl("  ")).toBe("")
        expect(buildQuestBgmUrl("/")).toBe("")
        expect(isQuestBgmPlayable("mute")).toBe(false)
    })

    it("should return direct http url as-is", () => {
        const directUrl = "https://cdn.example.com/bgm/opening.ogg"
        expect(buildQuestBgmUrl(directUrl)).toBe(directUrl)
        expect(isQuestBgmPlayable(directUrl)).toBe(true)
    })

    it("should build dataset url from the full resource path", () => {
        const url = buildQuestBgmUrl("bgm/1_1/0110_story_fushu_theme")
        expect(url).toMatch(/^https:\/\/modelscope\.cn\/datasets\/pa001024\/dna-voice-dataset\/resolve\/master\/bgm\//)
        expect(url.endsWith("/bgm/1_1/0110_story_fushu_theme.ogg")).toBe(true)
        expect(isQuestBgmPlayable("bgm/1_1/0110_story_fushu_theme")).toBe(true)
    })

    it("should normalize leading slash and backslash separators", () => {
        const expected = buildQuestBgmUrl("bgm/cbt01/0002_story_shahai")
        expect(expected.endsWith("/bgm/cbt01/0002_story_shahai.ogg")).toBe(true)
        expect(buildQuestBgmUrl("/bgm/cbt01/0002_story_shahai")).toBe(expected)
        expect(buildQuestBgmUrl("bgm\\cbt01\\0002_story_shahai")).toBe(expected)
        expect(buildQuestBgmUrl("  bgm/cbt01/0002_story_shahai  ")).toBe(expected)
    })
})
