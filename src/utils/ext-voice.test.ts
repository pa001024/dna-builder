import { describe, expect, it, vi } from "vitest"

vi.mock("@/data/d", () => ({
    extVoiceMap: new Map([[10018701, { id: 10018701, voice: "aistory/10018701" }]]),
}))

import { hasDialogueVoice, resolveDialogueEffectiveVoice } from "@/utils/ext-voice"

describe("resolveDialogueEffectiveVoice", () => {
    const base = { language: "zh-CN", gender: "female" as const, gender2: "female" as const }

    it("原生 voice 优先且标记非 AI", () => {
        const result = resolveDialogueEffectiveVoice({ id: 1, voice: "story/1002/100293/1914AD4C", npc: 81101 }, "你回来了。", base)
        expect(result?.ai).toBe(false)
        expect(result?.url).toContain("story_1002_100293_1914AD4C")
    })

    it("无原生 voice 时回退 AI 补语音", () => {
        const result = resolveDialogueEffectiveVoice({ id: 10018701, npc: 100001 }, "我是谁？", base)
        expect(result?.ai).toBe(true)
        expect(result?.url).toContain("aistory_10018701")
    })

    it("两者皆无时返回 null", () => {
        expect(resolveDialogueEffectiveVoice({ id: 99999999 }, "……", base)).toBeNull()
    })
})

describe("hasDialogueVoice", () => {
    it("原生或 AI 任一存在即为 true", () => {
        expect(hasDialogueVoice({ id: 1, voice: "story/1" })).toBe(true)
        expect(hasDialogueVoice({ id: 10018701 })).toBe(true)
        expect(hasDialogueVoice({ id: 99999999 })).toBe(false)
    })
})
