import type { SkillBehavior, SkillBehaviorDoc } from "dna-builder-skill-sim/schema"
import { describe, expect, it } from "vitest"
import { buffName, characterSkills, compileManifest, skillForId, skillForSlot, slotsOf } from "../sim/manifest-loader"

function skill(id: number, characterId: number, slot: SkillBehavior["slot"], field = "伤害"): SkillBehavior {
    return {
        id,
        characterId,
        slot,
        cast: { time: 0.2, cooldown: 1, costs: [], canMove: true },
        phases: [
            {
                at: 0,
                actions: [{ kind: "damage", field, tag: "技能", hits: { count: 1, interval: 0 }, target: { kind: "primary" } }],
            },
        ],
        sources: ["manual"],
    }
}

function doc(build: (draft: SkillBehaviorDoc) => void): SkillBehaviorDoc {
    const draft: SkillBehaviorDoc = {
        schemaVersion: 1,
        gameVersion: "test",
        characters: [],
        skills: {},
        buffs: {},
        coverage: {
            charactersTotal: 0,
            skillsTotal: 0,
            skillsWithMontage: 0,
            skillsWithBlueprint: 0,
            skillsWithAnimBP: 0,
            skillsWithLua: 0,
            skillsAuthored: 0,
            skillsWithBehavior: 0,
            nativeCallsTotal: 0,
            nativeCallsUnknown: [],
            unknownTaskFunctions: [],
            unmatchedNotifies: [],
        },
    }
    build(draft)
    return draft
}

describe("compileManifest", () => {
    it("合并多份文档：同名技能后者覆盖，角色技能取并集", () => {
        const base = doc(draft => {
            draft.characters.push({ id: 1, nameKey: "A", skills: [11] })
            draft.skills["11"] = skill(11, 1, "E", "旧字段")
        })
        const overlay = doc(draft => {
            draft.characters.push({ id: 1, nameKey: "A", skills: [11, 12] })
            draft.skills["11"] = skill(11, 1, "E", "新字段")
            draft.skills["12"] = skill(12, 1, "Q")
            draft.buffs["9001"] = { id: 9001, name: "增益", sources: ["manual"] }
        })

        const manifest = compileManifest([
            { id: "base", doc: base },
            { id: "overlay", doc: overlay },
        ])

        expect(manifest.issues.filter(issue => issue.severity === "error")).toHaveLength(0)
        expect(skillForId(manifest, 11)?.phases[0].actions[0]).toMatchObject({ field: "新字段" })
        expect(
            characterSkills(manifest, 1)
                .map(item => item.id)
                .sort()
        ).toEqual([11, 12])
        expect(slotsOf(manifest, 1)).toEqual(["E", "Q"])
        expect(skillForSlot(manifest, 1, "Q")?.id).toBe(12)
        expect(buffName(manifest, 9001)).toBe("增益")
        expect(manifest.doc.gameVersion).toBe("test")
    })

    it("校验失败的文档整份跳过并记录 error", () => {
        const broken = doc(draft => {
            draft.characters.push({ id: 2, nameKey: "B", skills: [21] })
            draft.skills["21"] = { ...skill(21, 2, "E"), slot: "X" as never }
        })

        const manifest = compileManifest([{ id: "broken", doc: broken }])

        expect(manifest.characters.size).toBe(0)
        expect(manifest.issues.some(issue => issue.source === "broken" && issue.severity === "error")).toBe(true)
        expect(manifest.doc.coverage.skillsTotal).toBe(0)
    })

    it("同槽位冲突时后者覆盖并给出 warning", () => {
        const conflict = doc(draft => {
            draft.characters.push({ id: 3, nameKey: "C", skills: [31, 32] })
            draft.skills["31"] = skill(31, 3, "E")
            draft.skills["32"] = skill(32, 3, "E")
        })

        const manifest = compileManifest([{ id: "conflict", doc: conflict }])

        expect(skillForSlot(manifest, 3, "E")?.id).toBe(32)
        expect(manifest.issues.some(issue => issue.code === "manifest.slot-conflict")).toBe(true)
    })

    it("未知角色 / 技能返回 undefined", () => {
        const manifest = compileManifest([{ id: "empty", doc: doc(() => {}) }])
        expect(skillForSlot(manifest, 999, "E")).toBeUndefined()
        expect(skillForId(manifest, 999)).toBeUndefined()
        expect(characterSkills(manifest, 999)).toEqual([])
    })
})
