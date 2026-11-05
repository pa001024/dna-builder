/**
 * check：manifest 门禁。
 *
 * 硬错误（--strict 与否都失败）：schema 校验、构建期 error 诊断、重复技能 id、
 * 未知 char/skill/buff 引用、`--simulated` 集合内缺行为。
 * `--strict` 额外把 warn 升级为失败（用于 CI / U8 集成）。
 */

import { type Action, type CoverageReport, emptyCoverageReport, type SkillBehaviorDoc } from "../schema/ir"
import { validateSkillBehaviorDoc } from "../schema/validation"
import { type Diagnostic, diagnostic, type SkillBehaviorManifest, type SkillDataIndex } from "./types"

export interface CheckOptions {
    /** 必须可模拟的技能 id 集合；缺 phase/action 即失败 */
    simulated?: (number | string)[]
    strict?: boolean
    /** 提供后用 packages/data 复核引用（CLI 默认提供） */
    index?: SkillDataIndex
}

export interface CheckStats {
    skillsTotal: number
    skillsWithActions: number
    skillsWithoutActions: number
    simulatedRequested: number
    simulatedSatisfied: number
}

export interface CheckResult {
    ok: boolean
    errors: Diagnostic[]
    warnings: Diagnostic[]
    /** --strict 下被升级为失败的 warn */
    strictFailures: Diagnostic[]
    infos: Diagnostic[]
    coverage: CoverageReport
    stats: CheckStats
}

export function checkManifest(manifest: SkillBehaviorManifest | SkillBehaviorDoc, options: CheckOptions = {}): CheckResult {
    const errors: Diagnostic[] = []
    const warnings: Diagnostic[] = []
    const infos: Diagnostic[] = []

    const validation = validateSkillBehaviorDoc(manifest)
    for (const issue of validation.errors) errors.push(diagnostic("error", issue.code, issue.path, issue.message))
    for (const issue of validation.warnings) warnings.push(diagnostic("warn", issue.code, issue.path, issue.message))

    const embedded = (manifest as SkillBehaviorManifest).diagnostics
    if (Array.isArray(embedded)) {
        for (const item of embedded) {
            if (item.severity === "error") errors.push(item)
            else if (item.severity === "warn") warnings.push(item)
            else infos.push(item)
        }
    }

    checkDuplicates(manifest, errors)
    if (options.index) checkReferences(manifest, options.index, errors, warnings)

    const skillEntries = Object.entries(manifest.skills)
    const withActions = skillEntries.filter(([, skill]) => skill.phases.some(phase => phase.actions.length > 0))
    const simulated = expandSimulated(manifest, options.simulated ?? [], errors)
    let satisfied = 0
    for (const id of simulated) {
        const skill = manifest.skills[id]
        if (!skill) {
            errors.push(diagnostic("error", "gate.missing-behavior", `skills.${id}`, `--simulated 技能 ${id} 不在 manifest 中`))
            continue
        }
        const hasAction = skill.phases.some(phase => phase.actions.length > 0)
        if (!hasAction) {
            errors.push(diagnostic("error", "gate.missing-behavior", `skills.${id}`, `--simulated 技能 ${id} 没有任何可执行动作`))
            continue
        }
        satisfied++
    }

    if ((manifest.coverage?.skillsTotal ?? 0) === 0) {
        errors.push(diagnostic("error", "gate.empty-manifest", "coverage.skillsTotal", "manifest 不含任何技能"))
    }

    const uniqueErrors = dedupe(errors)
    const uniqueWarnings = dedupe(warnings)
    const strictFailures = options.strict ? uniqueWarnings.filter(isStrictFatal) : []
    const ok = uniqueErrors.length === 0 && strictFailures.length === 0
    return {
        ok,
        errors: uniqueErrors,
        warnings: uniqueWarnings,
        strictFailures,
        infos,
        coverage: manifest.coverage ?? emptyCoverageReport(),
        stats: {
            skillsTotal: skillEntries.length,
            skillsWithActions: withActions.length,
            skillsWithoutActions: skillEntries.length - withActions.length,
            simulatedRequested: simulated.length,
            simulatedSatisfied: satisfied,
        },
    }
}

/** `--simulated` 既可写角色 id（展开为该角色全部技能），也可写技能 id */
function expandSimulated(manifest: SkillBehaviorDoc, values: (number | string)[], errors: Diagnostic[]): string[] {
    const result = new Set<string>()
    for (const value of values) {
        const id = String(value)
        if (manifest.skills[id]) {
            result.add(id)
            continue
        }
        const character = manifest.characters.find(item => String(item.id) === id)
        if (!character) {
            errors.push(diagnostic("error", "gate.missing-behavior", `skills.${id}`, `--simulated 引用的 ${id} 既不是技能也不是角色`))
            continue
        }
        const owned = character.skills.map(String).filter(skillId => manifest.skills[skillId])
        if (owned.length === 0) {
            errors.push(
                diagnostic("error", "gate.missing-behavior", `characters.${id}`, `--simulated 角色 ${id} 在 manifest 中没有任何技能`)
            )
            continue
        }
        for (const skillId of owned) result.add(skillId)
    }
    return [...result]
}

/** --strict 的升级口径：引用 / 门禁 / 数据自洽类 warn 失败；覆盖率与未知字段类 warn 只提示 */
export function isStrictFatal(item: Diagnostic): boolean {
    if (item.severity === "error") return true
    return (
        item.code.startsWith("ref.") ||
        item.code.startsWith("gate.") ||
        item.code === "schema.reference" ||
        item.code === "schema.duplicate"
    )
}

function dedupe(items: Diagnostic[]): Diagnostic[] {
    const seen = new Map<string, Diagnostic>()
    for (const item of items) seen.set(`${item.severity}|${item.code}|${item.path}|${item.message}`, item)
    return [...seen.values()]
}

function checkDuplicates(manifest: SkillBehaviorDoc, errors: Diagnostic[]): void {
    const owner = new Map<number, number>()
    for (const character of manifest.characters) {
        const seen = new Set<number>()
        for (const skillId of character.skills) {
            if (seen.has(skillId)) {
                errors.push(
                    diagnostic(
                        "error",
                        "gate.duplicate-skill",
                        `characters.${character.id}.skills`,
                        `角色 ${character.id} 重复列出技能 ${skillId}`
                    )
                )
            }
            seen.add(skillId)
            const previous = owner.get(skillId)
            if (previous !== undefined && previous !== character.id) {
                errors.push(
                    diagnostic(
                        "error",
                        "gate.duplicate-skill",
                        `skills.${skillId}`,
                        `技能 ${skillId} 同时属于角色 ${previous} 与 ${character.id}`
                    )
                )
            }
            owner.set(skillId, character.id)
        }
    }
}

function checkReferences(manifest: SkillBehaviorDoc, index: SkillDataIndex, errors: Diagnostic[], warnings: Diagnostic[]): void {
    for (const character of manifest.characters) {
        if (!index.getCharacter(character.id)) {
            errors.push(
                diagnostic("error", "gate.unknown-character", `characters.${character.id}`, `角色 ${character.id} 不在 packages/data`)
            )
        }
    }
    for (const [key, skill] of Object.entries(manifest.skills)) {
        const data = index.getSkill(skill.id)
        if (!data) {
            const target = skill.characterId > 0 ? errors : warnings
            target.push(
                diagnostic(
                    skill.characterId > 0 ? "error" : "warn",
                    "gate.unknown-skill",
                    `skills.${key}`,
                    `技能 ${key} 不在 packages/data（${skill.characterId > 0 ? "角色技能" : "非角色技能"}）`
                )
            )
            continue
        }
        if (skill.characterId > 0 && data.characterId !== undefined && data.characterId !== skill.characterId) {
            errors.push(
                diagnostic(
                    "error",
                    "gate.skill-character-mismatch",
                    `skills.${key}.characterId`,
                    `技能 ${key} 在数据里属于角色 ${data.characterId}，manifest 写 ${skill.characterId}`
                )
            )
        }
        const fieldNames = new Set(data.fields.map(field => field.name))
        for (const phase of skill.phases) {
            if (phase.condition?.kind === "hasBuff") checkBuff(phase.condition.buffId)
            walkActions(phase.actions, action => {
                if (action.kind === "applyBuff" || action.kind === "removeBuff") checkBuff(action.buffId)
                if (action.kind === "damage" && fieldNames.size > 0 && !fieldNames.has(action.field)) {
                    warnings.push(
                        diagnostic("warn", "gate.unknown-field", `skills.${key}`, `伤害字段 "${action.field}" 不在技能 ${key} 的字段表中`)
                    )
                }
            })
        }
    }

    function checkBuff(buffId: number | string): void {
        const key = String(buffId)
        if (manifest.buffs?.[key]) return
        if (index.getBuff(buffId)) return
        errors.push(diagnostic("error", "gate.unknown-buff", `buffs.${key}`, `buff ${key} 既不在 manifest 也不在 packages/data`))
    }
}

function walkActions(actions: Action[], visit: (action: Action) => void): void {
    for (const action of actions) {
        visit(action)
        if (action.kind === "branch") {
            walkActions(action.then, visit)
            if (action.else) walkActions(action.else, visit)
        }
    }
}
