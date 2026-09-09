import { describe, expect, it } from "vitest"
import { buildQuestVideoUrl, isQuestVideoPlayable } from "./quest-video"

describe("quest-video", () => {
    it("should return empty url for empty video key", () => {
        expect(buildQuestVideoUrl(undefined)).toBe("")
        expect(buildQuestVideoUrl("")).toBe("")
        expect(buildQuestVideoUrl("  ")).toBe("")
        expect(isQuestVideoPlayable(undefined)).toBe(false)
    })

    it("should return direct http url as-is", () => {
        const directUrl = "https://cdn.example.com/video/opening.mp4"
        expect(buildQuestVideoUrl(directUrl)).toBe(directUrl)
        expect(isQuestVideoPlayable(directUrl)).toBe(true)
    })

    it("should map resource key to dataset mp4 url under video folder", () => {
        const url = buildQuestVideoUrl("SQ_OBT0100_SC018")
        expect(url).toBe("https://modelscope.cn/datasets/pa001024/dna-voice-dataset/resolve/master/video/SQ_OBT0100_SC018.mp4")
        expect(isQuestVideoPlayable("SQ_OBT0100_SC018")).toBe(true)
    })
})
