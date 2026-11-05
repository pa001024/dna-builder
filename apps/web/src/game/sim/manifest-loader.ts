/**
 * SkillBehaviorDoc 清单装载：校验 → 合并 → 按角色 / 槽位索引。
 *
 * 数据源由 `manifest-source.ts` 提供（U5 fixture + web 开发回退；U7 生成物就位后追加）。
 * 合并顺序即优先级：后出现的文档覆盖同 id 的技能 / 增益，角色技能列表取并集。
 * 校验失败的文档整份跳过并记录 issue，不让半个 manifest 进入运行时。
 */

import type { BuffBehavior, CharacterBehavior, SkillBehavior, SkillBehaviorDoc, SkillSlot } from "dna-builder-skill-sim/schema"
import { emptyCoverageReport, SKILL_SLOTS, validateSkillBehaviorDoc } from "dna-builder-skill-sim/schema"

export interface ManifestSource {
    /** 溯源标签，如 "u5-fixture:lise-q" / "generated" */
    id: string
    doc: unknown
}

export interface ManifestIssue {
    source: string
    severity: "error" | "warn"
    path: string
    code: string
    message: string
}

export interface CharacterManifest {
    characterId: number
    nameKey: string
    /** 按 E → Q → 被动 → 其它顺序 */
    skills: SkillBehavior[]
    bySlot: Partial<Record<SkillSlot, SkillBehavior>>
}

export interface CompiledManifest {
    doc: SkillBehaviorDoc
    issues: ManifestIssue[]
    skills: ReadonlyMap<string, SkillBehavior>
    characters: ReadonlyMap<number, CharacterManifest>
    buffs: ReadonlyMap<string, BuffBehavior>
}

const SLOT_ORDER: Record<SkillSlot, number> = {
    E: 0,
    Q: 1,
    P: 2,
    A: 3,
    T: 4,
    R: 5,
    S: 6,
    unknown: 7,
}

export function compileManifest(sources: readonly ManifestSource[]): CompiledManifest {
    const issues: ManifestIssue[] = []
    const skills = new Map<string, SkillBehavior>()
    const buffs = new Map<string, BuffBehavior>()
    const characters = new Map<number, { nameKey: string; skillIds: number[] }>()

    for (const source of sources) {
        const validation = validateSkillBehaviorDoc(source.doc)
        for (const issue of validation.errors) {
            issues.push({ source: source.id, severity: "error", path: issue.path, code: issue.code, message: issue.message })
        }
        for (const issue of validation.warnings) {
            issues.push({ source: source.id, severity: "warn", path: issue.path, code: issue.code, message: issue.message })
        }
        if (!validation.ok) continue

        const doc = source.doc as SkillBehaviorDoc
        for (const [key, skill] of Object.entries(doc.skills)) skills.set(key, skill)
        for (const [key, buff] of Object.entries(doc.buffs)) buffs.set(key, buff)
        for (const character of doc.characters) mergeCharacter(characters, character)
    }

    const orderedCharacters = new Map<number, CharacterManifest>()
    for (const [characterId, entry] of characters) {
        const own = entry.skillIds
            .map(id => skills.get(String(id)))
            .filter((skill): skill is SkillBehavior => !!skill)
            .sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || a.id - b.id)
        const bySlot: Partial<Record<SkillSlot, SkillBehavior>> = {}
        for (const skill of own) {
            const existing = bySlot[skill.slot]
            if (existing) {
                issues.push({
                    source: "merge",
                    severity: "warn",
                    path: `characters.${characterId}.slot.${skill.slot}`,
                    code: "manifest.slot-conflict",
                    message: `槽位 ${skill.slot} 同时被技能 ${existing.id} 与 ${skill.id} 占用，保留后者`,
                })
            }
            bySlot[skill.slot] = skill
        }
        orderedCharacters.set(characterId, { characterId, nameKey: entry.nameKey, skills: own, bySlot })
    }

    const coverage = emptyCoverageReport()
    coverage.charactersTotal = orderedCharacters.size
    coverage.skillsTotal = skills.size
    coverage.skillsWithBehavior = [...skills.values()].filter(skill => skill.phases.some(phase => phase.actions.length > 0)).length

    return {
        doc: {
            schemaVersion: 1,
            gameVersion: latestGameVersion(sources, issues),
            characters: [...orderedCharacters.values()].map(character => ({
                id: character.characterId,
                nameKey: character.nameKey,
                skills: character.skills.map(skill => skill.id),
            })),
            skills: Object.fromEntries(skills),
            buffs: Object.fromEntries(buffs),
            coverage,
        },
        issues,
        skills,
        characters: orderedCharacters,
        buffs,
    }
}

function mergeCharacter(characters: Map<number, { nameKey: string; skillIds: number[] }>, character: CharacterBehavior): void {
    const existing = characters.get(character.id)
    if (!existing) {
        characters.set(character.id, { nameKey: character.nameKey, skillIds: [...character.skills] })
        return
    }
    existing.nameKey = character.nameKey || existing.nameKey
    for (const skillId of character.skills) {
        if (!existing.skillIds.includes(skillId)) existing.skillIds.push(skillId)
    }
}

function latestGameVersion(sources: readonly ManifestSource[], issues: ManifestIssue[]): string {
    let version = "unknown"
    for (const source of sources) {
        const doc = source.doc as Partial<SkillBehaviorDoc> | null
        if (doc && typeof doc.gameVersion === "string" && doc.gameVersion.length > 0) version = doc.gameVersion
        else {
            issues.push({
                source: source.id,
                severity: "warn",
                path: "gameVersion",
                code: "manifest.game-version",
                message: "manifest 缺少 gameVersion，使用 unknown 兜底",
            })
        }
    }
    return version
}

export function skillForId(manifest: CompiledManifest, skillId: number | string): SkillBehavior | undefined {
    return manifest.skills.get(String(skillId))
}

export function skillForSlot(manifest: CompiledManifest, characterId: number, slot: SkillSlot): SkillBehavior | undefined {
    return manifest.characters.get(characterId)?.bySlot[slot]
}

export function characterSkills(manifest: CompiledManifest, characterId: number): SkillBehavior[] {
    return manifest.characters.get(characterId)?.skills ?? []
}

export function buffName(manifest: CompiledManifest, buffId: number | string): string | undefined {
    return manifest.buffs.get(String(buffId))?.name
}

export function slotsOf(manifest: CompiledManifest, characterId: number): SkillSlot[] {
    const character = manifest.characters.get(characterId)
    if (!character) return []
    return SKILL_SLOTS.filter(slot => character.bySlot[slot] !== undefined)
}
