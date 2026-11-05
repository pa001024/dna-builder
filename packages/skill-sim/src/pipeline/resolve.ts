/**
 * resolve：把导出数据里的引用对到 packages/data（char / skill / buff / 字段）。
 * 只产出诊断与解析结果，不修改数据；build/check 共用同一套口径。
 */

import type { SkillAssetDoc, SkillAssetEffect, SkillAssetSkill } from "../schema/asset"
import type { Phase, SkillSlot } from "../schema/ir"
import { type Diagnostic, diagnostic, type SkillDataIndex } from "./types"

export interface ResolvedSkill {
    assetKey: string
    asset: SkillAssetSkill
    skillId: number
    characterId: number
    slot: SkillSlot
    data: ReturnType<SkillDataIndex["getSkill"]>
}

export interface ResolveResult {
    skills: ResolvedSkill[]
    diagnostics: Diagnostic[]
}

const SLOT_ORDER: SkillSlot[] = ["E", "Q", "P"]

export function resolveAssetReferences(doc: SkillAssetDoc, index: SkillDataIndex): ResolveResult {
    const diagnostics: Diagnostic[] = []
    const skills: ResolvedSkill[] = []
    const characterSkills = new Map<number, number[]>()

    for (const character of doc.characters ?? []) {
        const data = index.getCharacter(character.id)
        if (!data) {
            diagnostics.push(
                diagnostic(
                    "error",
                    "ref.unknown-character",
                    joinPath("characters", character.id),
                    `角色 ${character.id} 不在 packages/data`
                )
            )
            continue
        }
        characterSkills.set(character.id, data.skills)
        for (const skillId of character.skills ?? []) {
            if (!doc.skills[String(skillId)]) {
                diagnostics.push(
                    diagnostic(
                        "warn",
                        "ref.missing-asset-skill",
                        joinPath(joinPath("characters", character.id), "skills"),
                        `角色 ${character.id} 的技能 ${skillId} 没有行为资产`
                    )
                )
            }
        }
    }

    for (const [key, asset] of Object.entries(doc.skills)) {
        const skillId = asset.id ?? Number(key)
        const skillPath = joinPath("skills", key)
        const characterId = asset.characterId ?? 0
        const data = index.getSkill(skillId)
        if (!data) {
            // 武器 / MOD / 魔灵技能没有稳定的技能 id 语义：作为可迁移资产保留，只提示
            diagnostics.push(
                diagnostic(characterId > 0 ? "error" : "warn", "ref.unknown-skill", skillPath, `技能 ${key} 不在 packages/data`)
            )
        }
        if (characterId > 0) {
            if (!index.getCharacter(characterId)) {
                diagnostics.push(
                    diagnostic(
                        "error",
                        "ref.unknown-character",
                        joinPath(skillPath, "characterId"),
                        `角色 ${characterId} 不在 packages/data`
                    )
                )
            } else if (data?.characterId !== undefined && data.characterId !== characterId) {
                diagnostics.push(
                    diagnostic(
                        "error",
                        "ref.skill-character-mismatch",
                        joinPath(skillPath, "characterId"),
                        `技能 ${key} 在数据里属于角色 ${data.characterId}，导出数据写 ${characterId}`
                    )
                )
            }
        }
        const slot = resolveSlot(asset, characterId, skillId, characterSkills, index, skillPath, diagnostics)
        checkBuffReferences(doc, asset, skillId, skillPath, index, diagnostics)
        checkEffectReferences(asset, skillPath, diagnostics)
        checkAuthoredFields(asset, data?.fields.map(field => field.name) ?? [], skillPath, diagnostics)
        skills.push({ assetKey: key, asset, skillId, characterId, slot, data })
    }

    return { skills, diagnostics }
}

function resolveSlot(
    asset: SkillAssetSkill,
    characterId: number,
    skillId: number,
    characterSkills: Map<number, number[]>,
    index: SkillDataIndex,
    skillPath: string,
    diagnostics: Diagnostic[]
): SkillSlot {
    const order = characterSkills.get(characterId) ?? index.getCharacter(characterId)?.skills ?? []
    const position = order.indexOf(skillId)
    const derived = position >= 0 && position < SLOT_ORDER.length ? SLOT_ORDER[position] : "unknown"
    const declared = asset.slot as SkillSlot | undefined
    if (declared && declared !== derived && position >= 0) {
        diagnostics.push(
            diagnostic("warn", "ref.slot-mismatch", joinPath(skillPath, "slot"), `导出 slot=${declared}，按数据顺序应为 ${derived}`)
        )
        return declared
    }
    return declared ?? derived
}

function collectStructuredBuffRefs(asset: SkillAssetSkill): { ref: number | string; path: string }[] {
    const refs: { ref: number | string; path: string }[] = []
    const lua = asset.lua
    if (!lua) return refs
    if (Array.isArray(lua.buffIds)) {
        lua.buffIds.forEach((id, index) => {
            if (typeof id === "number" || typeof id === "string") refs.push({ ref: id, path: `lua.buffIds[${index}]` })
        })
    }
    for (const effect of normalizeEffects(lua.effects)) {
        for (const task of effect.TaskEffects ?? []) {
            if (task.BuffId !== undefined) refs.push({ ref: task.BuffId, path: `lua.effects.${effect.TaskId ?? "?"}.BuffId` })
        }
    }
    for (const notify of asset.montage?.notifies ?? []) {
        const buffId = notify.payload?.BuffId
        if (typeof buffId === "number" || typeof buffId === "string") refs.push({ ref: buffId, path: `montage.notifies[${notify.name}]` })
    }
    return refs
}

function checkBuffReferences(
    doc: SkillAssetDoc,
    asset: SkillAssetSkill,
    skillId: number,
    skillPath: string,
    index: SkillDataIndex,
    diagnostics: Diagnostic[]
): void {
    const seen = new Set<string>()
    for (const { ref, path: refPath } of collectStructuredBuffRefs(asset)) {
        const key = String(ref)
        if (seen.has(key)) continue
        seen.add(key)
        if (doc.buffs?.[key] || index.getBuff(ref)) continue
        diagnostics.push(
            diagnostic(
                "error",
                "ref.unknown-buff",
                joinPath(skillPath, refPath),
                `技能 ${skillId} 引用的 buff ${key} 既不在导出数据也不在 packages/data`
            )
        )
    }
    // Lua 行为文本里的 id 无法保证是 buff id（可能是实体/效果），只做提示
    if (asset.lua?.behavior) {
        for (const id of extractBehaviorBuffIds(asset.lua.behavior)) {
            if (doc.buffs?.[id] || index.getBuff(id)) continue
            diagnostics.push(
                diagnostic(
                    "warn",
                    "ref.unverified-buff",
                    joinPath(skillPath, "lua.behavior"),
                    `Lua 行为引用的 ${id} 未在导出 buffs / packages/data 中找到（按不透明 id 保留）`
                )
            )
        }
    }
}

function checkEffectReferences(asset: SkillAssetSkill, skillPath: string, diagnostics: Diagnostic[]): void {
    const effects = normalizeEffects(asset.lua?.effects)
    const effectIds = new Set(effects.map(effect => effect.TaskId).filter((id): id is number => typeof id === "number"))
    for (const notify of asset.montage?.notifies ?? []) {
        const effectId = notify.payload?.EffectId
        if (typeof effectId !== "number") continue
        if (!effectIds.has(effectId)) {
            diagnostics.push(
                diagnostic(
                    "warn",
                    "ref.unknown-effect",
                    joinPath(skillPath, "montage.notifies"),
                    `notify ${notify.name} 的 EffectId ${effectId} 不在导出 effects 中`
                )
            )
        }
    }
}

function checkAuthoredFields(asset: SkillAssetSkill, fieldNames: string[], skillPath: string, diagnostics: Diagnostic[]): void {
    const phases = asset.authored?.phases
    if (!Array.isArray(phases)) return
    const known = new Set(fieldNames)
    if (known.size === 0) return
    walkPhases(phases, (action, actionPath) => {
        if (action.kind === "damage" && typeof action.field === "string" && !known.has(action.field)) {
            diagnostics.push(
                diagnostic(
                    "warn",
                    "ref.unknown-field",
                    joinPath(skillPath, `authored.${actionPath}.field`),
                    `伤害字段 "${action.field}" 不在技能数据字段中（${fieldNames.slice(0, 4).join(", ")}…）`
                )
            )
        }
    })
}

function walkPhases(phases: Phase[], visit: (action: Phase["actions"][number], path: string) => void): void {
    phases.forEach((phase, phaseIndex) => {
        phase.actions?.forEach((action, actionIndex) => walkAction(action, `phases[${phaseIndex}].actions[${actionIndex}]`))
    })

    function walkAction(action: Phase["actions"][number], actionPath: string): void {
        visit(action, actionPath)
        if (action.kind === "branch") {
            action.then.forEach((child, index) => walkAction(child, `${actionPath}.then[${index}]`))
            action.else?.forEach((child, index) => walkAction(child, `${actionPath}.else[${index}]`))
        }
    }
}

export function normalizeEffects(value: unknown): SkillAssetEffect[] {
    return Array.isArray(value) ? value.filter((effect): effect is SkillAssetEffect => typeof effect === "object" && effect !== null) : []
}

/** 从 Lua 行为文本里提取 `附加增益(id)` / `召唤实体(id)` 等显式 id（仅用于诊断提示） */
export function extractBehaviorBuffIds(behavior: string): string[] {
    const ids = new Set<string>()
    for (const match of behavior.matchAll(/(?:附加增益|移除增益)\((\d+)\)/g)) ids.add(match[1]!)
    return [...ids]
}

function joinPath(base: string, key: string | number): string {
    return base ? `${base}.${key}` : String(key)
}
