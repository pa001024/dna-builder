/**
 * 从 packages/data 构建 resolve/build 需要的最小索引。
 *
 * 口径（与 CharBuild 一致）：
 * - 角色技能顺序 `[E, Q, P, …]`；
 * - buffMap / effectMap 以**名称**为键，所以额外按 `id` 建数字索引；
 * - 武器 / MOD 技能没有稳定的技能 id 语义，暂不纳入（见 U3 报告开放问题）。
 */

import { charMap } from "dna-builder-data/d"
import buffData from "dna-builder-data/d/buff.data"
import effectData from "dna-builder-data/d/effect.data"
import type { Skill } from "dna-builder-data/leveled/LeveledSkill"
import { type DataBuff, type DataCharacter, type DataSkill, type DataSkillField, KNOWN_SKILL_RESOURCES, type SkillDataIndex } from "./types"

export function createGameDataIndex(): SkillDataIndex {
    const characters = new Map<number, DataCharacter>()
    const skills = new Map<number, DataSkill>()

    for (const [key, character] of charMap) {
        if (typeof key !== "number") continue
        const skillIds: number[] = []
        for (const skill of character.技能 ?? []) {
            const id = registerSkill(skill, character.id)
            if (id !== undefined) skillIds.push(id)
            for (const sub of skill.子技能 ?? []) registerSkill(sub, character.id)
        }
        characters.set(character.id, { id: character.id, name: character.名称, skills: skillIds })
    }

    const buffsById = new Map<number, DataBuff>()
    const buffsByName = new Map<string, DataBuff>()
    for (const entry of [...buffData, ...effectData]) {
        const record: DataBuff = { id: entry.id, name: entry.名称 }
        buffsByName.set(entry.名称, record)
        if (typeof entry.id === "number") buffsById.set(entry.id, record)
    }

    function registerSkill(skill: Skill | undefined, characterId: number): number | undefined {
        if (!skill || typeof skill.id !== "number") return undefined
        const fields: DataSkillField[] = (skill.字段 ?? []).map(field => ({
            name: field.名称,
            values: field.值,
            tag: field.tag,
            impact: field.影响,
        }))
        skills.set(skill.id, {
            id: skill.id,
            name: skill.名称 ?? `SKILL${skill.id}`,
            type: skill.类型,
            characterId,
            cd: skill.cd,
            fields,
        })
        return skill.id
    }

    return {
        getCharacter(id: number) {
            return characters.get(id)
        },
        getSkill(id: number) {
            return skills.get(id)
        },
        getKnownResources() {
            return KNOWN_SKILL_RESOURCES
        },
        getBuff(ref: number | string) {
            if (typeof ref === "number") return buffsById.get(ref)
            if (/^\d+$/.test(ref)) {
                const numeric = Number(ref)
                return buffsById.get(numeric) ?? buffsByName.get(ref)
            }
            return buffsByName.get(ref)
        },
    }
}
