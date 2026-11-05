import type { SkillBehavior, SkillBehaviorDoc } from "dna-builder-skill-sim/schema"
import { describe, expect, it } from "vitest"
import { buffName, characterSkills, compileManifest, skillForId, skillForSlot, slotsOf } from "../sim/manifest-loader"
import { loadSkillManifest, resolveManifestSources } from "../sim/manifest-source"

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

    it("同槽位冲突时保留先出现（id 最小）的技能并给出 warning", () => {
        const conflict = doc(draft => {
            draft.characters.push({ id: 3, nameKey: "C", skills: [32, 31] })
            draft.skills["31"] = skill(31, 3, "E")
            draft.skills["32"] = skill(32, 3, "E")
        })

        const manifest = compileManifest([{ id: "conflict", doc: conflict }])

        expect(skillForSlot(manifest, 3, "E")?.id).toBe(31)
        const issue = manifest.issues.find(item => item.code === "manifest.slot-conflict")
        expect(issue?.message).toContain("忽略 32")
    })

    it("重复 E/Q 时子技能不会顶掉主技能（4101 Q 必须是 410102 而不是 410121）", () => {
        const duplicate = doc(draft => {
            draft.characters.push({ id: 4101, nameKey: "黎瑟", skills: [410121, 410102, 410122, 410101] })
            draft.skills["410101"] = skill(410101, 4101, "E", "快速出击")
            draft.skills["410102"] = skill(410102, 4101, "Q", "涡旋电场")
            draft.skills["410121"] = skill(410121, 4101, "Q", "正电荷")
            draft.skills["410122"] = skill(410122, 4101, "Q", "负电荷")
        })

        const manifest = compileManifest([{ id: "duplicate-slots", doc: duplicate }])

        expect(skillForSlot(manifest, 4101, "E")?.id).toBe(410101)
        expect(skillForSlot(manifest, 4101, "Q")?.id).toBe(410102)
    })

    it("未知角色 / 技能返回 undefined", () => {
        const manifest = compileManifest([{ id: "empty", doc: doc(() => {}) }])
        expect(skillForSlot(manifest, 999, "E")).toBeUndefined()
        expect(skillForId(manifest, 999)).toBeUndefined()
        expect(characterSkills(manifest, 999)).toEqual([])
    })
})

describe("U7 生成清单来源", () => {
    it("生成清单排在回退之后合并：覆盖同名技能，同时保留回退的其它槽位", () => {
        const generated = doc(draft => {
            draft.characters.push({ id: 4101, nameKey: "黎瑟", skills: [410102] })
            draft.skills["410102"] = skill(410102, 4101, "Q", "生成字段")
        })

        const sources = resolveManifestSources(generated)
        expect(sources.at(-1)).toMatchObject({ id: "generated:skill-sim" })

        const manifest = loadSkillManifest([], generated)
        expect(skillForSlot(manifest, 4101, "Q")?.phases[0].actions[0]).toMatchObject({ field: "生成字段" })
        // 回退清单补足生成清单缺的槽位
        expect(skillForSlot(manifest, 4101, "E")?.id).toBe(410101)
        expect(skillForSlot(manifest, 5301, "Q")?.id).toBe(530102)
    })

    it("生成清单缺席时只有回退来源", () => {
        const sources = resolveManifestSources(null)
        expect(sources.some(source => source.id === "generated:skill-sim")).toBe(false)
        expect(sources.map(source => source.id)).toEqual(["web-dev-fallback", "u5-fixture:lise-q"])
    })
})
