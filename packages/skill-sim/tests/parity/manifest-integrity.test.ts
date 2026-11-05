/** 生成 manifest 的槽位 / 归属 / authored 溯源完整性。 */

import { describe, expect, test } from "bun:test"
import matrix from "../../generated/coverage-matrix.json"
import { hasExecutableAction } from "../../src/schema/ir"
import { loadManifest } from "./helpers"

const manifest = await loadManifest()

describe("生成 manifest 完整性", () => {
    test("34 角色 / 169 个主技能引用；每个角色最多一个 E/Q/P", () => {
        expect(manifest.characters).toHaveLength(34)
        expect(manifest.characters.reduce((sum, character) => sum + character.skills.length, 0)).toBe(169)
        for (const character of manifest.characters) {
            for (const slot of ["E", "Q", "P"] as const) {
                const ids = character.skills.filter(skillId => manifest.skills[String(skillId)]?.slot === slot)
                expect({ character: character.id, slot, count: ids.length }).toEqual({ character: character.id, slot, count: 1 })
            }
            expect(character.skills.filter(skillId => manifest.skills[String(skillId)]?.slot === "Q")).toEqual([
                character.skills.find(skillId => manifest.skills[String(skillId)]?.slot === "Q")!,
            ])
        }
    })

    test("E/Q 槽位不被子技能抢占（4101 Q=410102、5301 E=530101）", () => {
        const slots = (characterId: number) => {
            const character = manifest.characters.find(item => item.id === characterId)!
            const skills = character.skills.map(skillId => manifest.skills[String(skillId)]!)
            return {
                E: skills.find(skill => skill.slot === "E")?.id,
                Q: skills.find(skill => skill.slot === "Q")?.id,
            }
        }
        expect(slots(4101)).toEqual({ E: 410101, Q: 410102 })
        expect(slots(5301)).toEqual({ E: 530101, Q: 530102 })
    })

    test("缺失 packages/data 条目的子技能保留真实 characterId（不再写成 0）", () => {
        const expected: Record<number, number> = {
            110111: 1101,
            150311: 1503,
            310211: 3102,
            330112: 3301,
            410211: 4102,
            410327: 4103,
            510107: 5101,
            530105: 5301,
        }
        for (const [skillId, characterId] of Object.entries(expected)) {
            const skill = manifest.skills[skillId]!
            expect(skill.characterId).toBe(characterId)
            expect(skill.slot).toBe("unknown")
        }
    })

    test("authored buff 标 manual 且保留理由", () => {
        for (const buffId of [410122, 150324, 120231, 120232]) {
            const buff = manifest.buffs[String(buffId)]!
            expect(buff.sources).toEqual(["manual"])
            expect(buff.note?.length ?? 0).toBeGreaterThan(0)
        }
    })

    test("authored override 的 note 进入 provenance", () => {
        for (const skillId of [410101, 410102, 530101, 530102, 210202, 220102, 310401, 540201]) {
            expect(manifest.skills[String(skillId)]?.provenance?.authoredNote?.length ?? 0).toBeGreaterThan(0)
        }
    })

    test("coverage.skillsWithBehavior 与可执行动作 / 覆盖矩阵分类一致", () => {
        const executable = Object.values(manifest.skills).filter(hasExecutableAction).length
        expect(manifest.coverage.skillsWithBehavior).toBe(executable)
        expect(matrix.summary.skills.simulated).toBe(executable)
    })

    test("coverage-matrix 逐技能给出 montage/blueprint/animBP 缺失标记", () => {
        for (const character of matrix.characters) {
            for (const skill of character.skills) {
                expect(typeof skill.hasMontage).toBe("boolean")
                expect(typeof skill.hasBlueprint).toBe("boolean")
                expect(typeof skill.hasAnimBP).toBe("boolean")
                expect(Array.isArray(skill.missing)).toBe(true)
                expect(skill.missing.every((item: string) => ["montage", "blueprint", "animBP"].includes(item))).toBe(true)
            }
        }
    })
})
