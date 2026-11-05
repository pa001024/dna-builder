import { describe, expect, it } from "vitest"
import { characterSkills, compileManifest, skillForSlot, slotsOf } from "../sim/manifest-loader"
import { loadSkillManifest, resolveManifestSources } from "../sim/manifest-source"
import { generatedManifest } from "./generated-manifest"

const manifest = loadSkillManifest([], generatedManifest)

describe("U7 生成清单接入 Web", () => {
    it("生成清单校验无 error，并覆盖 34 角色 / 385 技能", () => {
        const generatedIssues = manifest.issues.filter(issue => issue.source === "generated:skill-sim" && issue.severity === "error")
        expect(generatedIssues).toEqual([])
        expect(manifest.characters.size).toBe(34)
        expect(manifest.skills.size).toBe(385)
    })

    it("黎瑟 / 赛琪 的 E、Q 主技能来自生成清单", () => {
        expect(skillForSlot(manifest, 4101, "E")?.id).toBe(410101)
        expect(skillForSlot(manifest, 4101, "Q")?.id).toBe(410102)
        expect(skillForSlot(manifest, 5301, "E")?.id).toBe(530101)
        expect(skillForSlot(manifest, 5301, "Q")?.id).toBe(530102)
    })

    it("生成清单优先于 web 回退：同名技能以生成数据为准", () => {
        const fallback = resolveManifestSources(null).map(source => source.id)
        expect(fallback).not.toContain("generated:skill-sim")

        const generatedOnly = compileManifest([{ id: "generated:skill-sim", doc: generatedManifest }])
        const e = skillForSlot(manifest, 4101, "E")
        expect(e?.sources).toContain("montage")
        expect(skillForSlot(generatedOnly, 4101, "E")?.phases[0].at).toBeCloseTo(e?.phases[0].at ?? -1, 6)
    })

    it("所有角色都没有重复的 E/Q 槽位", () => {
        const conflicts = manifest.issues.filter(issue => issue.code === "manifest.slot-conflict")
        expect(conflicts).toEqual([])
        const realSlots = new Set(["E", "Q", "P", "A", "T", "R", "S"])
        for (const character of manifest.characters.values()) {
            const slots = character.skills.map(skill => skill.slot).filter(slot => realSlots.has(slot))
            expect(new Set(slots).size).toBe(slots.length)
        }
    })

    it("Vite 运行时自动发现生成清单（bun test 无 import.meta.glob 时跳过）", () => {
        const discovered = resolveManifestSources().find(source => source.id === "generated:skill-sim")
        if (!discovered) return
        expect(discovered.doc).toBeTruthy()
        const compiled = loadSkillManifest()
        expect(characterSkills(compiled, 4101).length).toBeGreaterThanOrEqual(4)
        expect(slotsOf(compiled, 4101)).toEqual(["E", "Q", "P"])
    })
})
