import { describe, expect, it } from "vitest"
import type { ImprEntry } from "@/data/d/impr"
import { getImprEntryKey } from "@/data/d/impr"

describe("getImprEntryKey", () => {
    it("should distinguish source, dialogue, option and value type", () => {
        const baseEntry: ImprEntry = {
            sourceType: "questchain",
            sourceId: 200317,
            sourceQuestId: 20031711,
            sourceDialogueId: 1,
            sourceOptionId: 10,
            sourceName: "若言琴上有琴声",
            regionId: 1041,
            regionLabel: "华胥",
            valueType: "Morality",
            value: 3,
            content: "A",
            displayText: "A",
            searchText: "A",
            sourceLink: "/db/questchain/200317/20031711",
        }

        expect(
            getImprEntryKey({
                ...baseEntry,
                sourceDialogueId: 2,
            })
        ).not.toBe(getImprEntryKey(baseEntry))
        expect(
            getImprEntryKey({
                ...baseEntry,
                sourceOptionId: 11,
            })
        ).not.toBe(getImprEntryKey(baseEntry))
        expect(
            getImprEntryKey({
                ...baseEntry,
                valueType: "Chaos",
            })
        ).not.toBe(getImprEntryKey(baseEntry))
    })
})
