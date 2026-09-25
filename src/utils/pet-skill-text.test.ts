import { describe, expect, it } from "vitest"
import { formatPetSkillText } from "./pet-skill-text"

describe("formatPetSkillText", () => {
    it("按出现顺序把 {%} 与 {} 代入对应数值", () => {
        const text = formatPetSkillText("造成主角色攻击{%}的伤害，自身每秒恢复{}点神智，技能速度提高{%}。", [60, 15, 0.3])
        expect(text).toBe("造成主角色攻击6000%的伤害，自身每秒恢复15点神智，技能速度提高30%。")
    })

    it("数值少于占位符时保留未代入的占位符", () => {
        expect(formatPetSkillText("攻击{%}，恢复{}点。", [60])).toBe("攻击6000%，恢复{}点。")
    })

    it("译文模板照常代入，保证「先翻译、后代入」的顺序可用", () => {
        const text = formatPetSkillText("Deals damage equal to {%} of ATK and restores {} Sanity for {}s.", [5.85, 12, 4])
        expect(text).toBe("Deals damage equal to 585% of ATK and restores 12 Sanity for 4s.")
    })
})
