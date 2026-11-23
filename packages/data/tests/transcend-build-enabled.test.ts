import { describe, expect, it } from "vitest"
import {
    createDefaultTranscendGearVariant,
    createDefaultTranscendSettings,
    isTranscendBuildEnabled,
    type TranscendSettings,
} from "../transcendSettings"

/** 构筑类型判定的唯一口径（U140-fix / FEEDBACK §156）：只看 transcend.enabled。 */
describe("isTranscendBuildEnabled", () => {
    const base = createDefaultTranscendSettings()

    it("enabled:true 为升华", () => {
        expect(isTranscendBuildEnabled({ ...base, enabled: true })).toBe(true)
    })

    it("enabled:false 即使含天赋 / 装备变体也不是升华", () => {
        const disabledWithContent: TranscendSettings = {
            ...base,
            enabled: false,
            talentLevels: [[1, 1]],
            gearVariants: [createDefaultTranscendGearVariant()],
        }
        expect(isTranscendBuildEnabled(disabledWithContent)).toBe(false)
    })

    it("缺失 / null / undefined 一律 false", () => {
        expect(isTranscendBuildEnabled(undefined)).toBe(false)
        expect(isTranscendBuildEnabled(null)).toBe(false)
        expect(isTranscendBuildEnabled(createDefaultTranscendSettings())).toBe(false)
    })

    it("非对象 / 其它真值一律 false", () => {
        expect(isTranscendBuildEnabled("true" as unknown as TranscendSettings)).toBe(false)
        expect(isTranscendBuildEnabled(1 as unknown as TranscendSettings)).toBe(false)
        expect(isTranscendBuildEnabled([] as unknown as TranscendSettings)).toBe(false)
        expect(isTranscendBuildEnabled({ enabled: 1 } as unknown as TranscendSettings)).toBe(false)
    })
})
