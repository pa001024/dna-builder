import { describe, expect, it } from "vitest"
import { buildQuestBgmUrl, isQuestBgmPlayable } from "./quest-bgm"

describe("quest-bgm", () => {
    it("should return empty url for empty/mute/unknown resource", () => {
        expect(buildQuestBgmUrl(undefined)).toBe("")
        expect(buildQuestBgmUrl("")).toBe("")
        expect(buildQuestBgmUrl("mute")).toBe("")
        expect(buildQuestBgmUrl("  ")).toBe("")
        expect(buildQuestBgmUrl("SC002")).toBe("")
    })

    it("should return direct http url as-is", () => {
        const directUrl = "https://cdn.example.com/bgm/opening.ogg"
        expect(buildQuestBgmUrl(directUrl)).toBe(directUrl)
        expect(isQuestBgmPlayable(directUrl)).toBe(true)
    })

    it("should resolve known musicbox resource to dataset audio url", () => {
        const url = buildQuestBgmUrl("0002_story_shahai")
        expect(url).toMatch(/^https:\/\/modelscope\.cn\/datasets\/pa001024\/dna-voice-dataset\/resolve\/master\/bgm\//)
        expect(url.endsWith("/musicbox/0002_story_shahai.ogg")).toBe(true)
        expect(isQuestBgmPlayable("0002_story_shahai")).toBe(true)
    })
})
