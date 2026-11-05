/**
 * SkillAssetDoc（导出器产物）的宽松校验：
 * - 版本、id 唯一性、时间轴基本形状、authored 相位（IR 口径）严格校验；
 * - 未知字段只 warn，保证导出器可以先行加字段而不会让 dna-builder 直接失败。
 */

import { SKILL_SLOTS } from "./ir"
import {
    addError,
    addWarn,
    finalize,
    indexPath,
    isFiniteNumber,
    isRecord,
    joinPath,
    requireNumber,
    requireString,
    type ValidationIssue,
    type ValidationResult,
    validatePhase,
    warnUnknownKeys,
} from "./validation"
import { checkSchemaVersion } from "./versions"

const DOC_KEYS = ["schemaVersion", "exporter", "characters", "skills", "buffs", "coverage"] as const
const SKILL_KEYS = ["id", "characterId", "slot", "lua", "sources", "montage", "sequences", "blueprint", "animBP", "authored"] as const

export function validateSkillAssetDoc(value: unknown): ValidationResult {
    const errors: ValidationIssue[] = []
    const warnings: ValidationIssue[] = []
    if (!isRecord(value)) {
        addError(errors, "", "schema.type", "SkillAssetDoc 必须是对象")
        return finalize(errors, warnings)
    }
    const version = checkSchemaVersion(value.schemaVersion, "asset")
    if (!version.ok && version.message) addError(errors, "schemaVersion", "schema.version", version.message)

    if (value.exporter !== undefined && !isRecord(value.exporter)) {
        addError(errors, "exporter", "schema.type", "exporter 必须是对象")
    }

    const characterIds = new Set<number>()
    if (value.characters !== undefined) {
        if (!Array.isArray(value.characters)) addError(errors, "characters", "schema.type", "characters 必须是数组")
        else {
            value.characters.forEach((character, index) => {
                const path = indexPath("characters", index)
                if (!isRecord(character)) {
                    addError(errors, path, "schema.type", "character 必须是对象")
                    return
                }
                if (requireNumber(character.id, joinPath(path, "id"), errors, 0)) {
                    if (characterIds.has(character.id as number)) {
                        addError(errors, joinPath(path, "id"), "schema.duplicate", `重复的角色 id ${character.id}`)
                    }
                    characterIds.add(character.id as number)
                }
                if (character.nameKey !== undefined) requireString(character.nameKey, joinPath(path, "nameKey"), errors, true)
                if (character.skills !== undefined) {
                    if (!Array.isArray(character.skills)) addError(errors, joinPath(path, "skills"), "schema.type", "skills 必须是数组")
                    else character.skills.forEach((id, i) => requireNumber(id, indexPath(joinPath(path, "skills"), i), errors, 0))
                }
            })
        }
    }

    const skills = value.skills
    if (!isRecord(skills)) {
        addError(errors, "skills", "schema.type", "skills 必须是对象（技能 id → SkillAssetSkill）")
        return finalize(errors, warnings)
    }
    if (Object.keys(skills).length === 0) addWarn(warnings, "skills", "schema.empty", "skills 为空，build 不会产出任何行为")

    for (const [key, raw] of Object.entries(skills)) {
        const path = joinPath("skills", key)
        if (!/^\d+$/.test(key)) addError(errors, path, "schema.key", `skills 的键必须是技能 id 数字字符串，实际为 "${key}"`)
        if (!isRecord(raw)) {
            addError(errors, path, "schema.type", "SkillAssetSkill 必须是对象")
            continue
        }
        warnUnknownKeys(raw, SKILL_KEYS, path, warnings)
        if (raw.id !== undefined) {
            if (requireNumber(raw.id, joinPath(path, "id"), errors, 0) && String(raw.id) !== key) {
                addError(errors, joinPath(path, "id"), "schema.key-mismatch", `键 "${key}" 与 id ${raw.id} 不一致`)
            }
        }
        if (raw.characterId !== undefined) requireNumber(raw.characterId, joinPath(path, "characterId"), errors, 0)
        if (raw.slot !== undefined && (typeof raw.slot !== "string" || !(SKILL_SLOTS as readonly string[]).includes(raw.slot))) {
            addWarn(warnings, joinPath(path, "slot"), "schema.enum", `未知 slot：${JSON.stringify(raw.slot)}`)
        }
        if (raw.lua !== undefined && !isRecord(raw.lua)) addError(errors, joinPath(path, "lua"), "schema.type", "lua 必须是对象")
        if (raw.sources !== undefined) validateSources(raw.sources, joinPath(path, "sources"), errors)
        if (raw.montage !== undefined) validateMontage(raw.montage, joinPath(path, "montage"), errors)
        if (raw.blueprint !== undefined) validateBlueprint(raw.blueprint, joinPath(path, "blueprint"), errors)
        if (raw.sequences !== undefined && !Array.isArray(raw.sequences)) {
            addError(errors, joinPath(path, "sequences"), "schema.type", "sequences 必须是数组")
        }
        if (raw.authored !== undefined) validateAuthored(raw.authored, joinPath(path, "authored"), errors, warnings)
    }

    if (value.buffs !== undefined) {
        if (!isRecord(value.buffs)) addError(errors, "buffs", "schema.type", "buffs 必须是对象")
        else {
            for (const [key, raw] of Object.entries(value.buffs)) {
                const path = joinPath("buffs", key)
                if (!isRecord(raw)) {
                    addError(errors, path, "schema.type", "SkillAssetBuff 必须是对象")
                    continue
                }
                if (raw.id !== undefined && String(raw.id) !== key && !/^\d+$/.test(key)) {
                    addWarn(warnings, joinPath(path, "id"), "schema.key-mismatch", `键 "${key}" 与 id ${raw.id} 不一致`)
                }
            }
        }
    }

    warnUnknownKeys(value, DOC_KEYS, "", warnings)
    return finalize(errors, warnings)
}

function validateSources(value: unknown, path: string, errors: ValidationIssue[]): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "sources 必须是对象")
        return
    }
    if (value.montage !== undefined) requireString(value.montage, joinPath(path, "montage"), errors, true)
    for (const key of ["bpPackages", "animBPs"]) {
        if (value[key] === undefined) continue
        if (!Array.isArray(value[key])) addError(errors, joinPath(path, key), "schema.type", `${key} 必须是字符串数组`)
        else value[key].forEach((item: unknown, index: number) => requireString(item, indexPath(joinPath(path, key), index), errors, true))
    }
}

function validateMontage(value: unknown, path: string, errors: ValidationIssue[]): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "montage 必须是对象")
        return
    }
    if (value.length !== undefined) requireNumber(value.length, joinPath(path, "length"), errors, 0)
    if (value.sections !== undefined) {
        if (!Array.isArray(value.sections)) addError(errors, joinPath(path, "sections"), "schema.type", "sections 必须是数组")
        else
            value.sections.forEach((section: unknown, index: number) => {
                const sectionPath = indexPath(joinPath(path, "sections"), index)
                if (!isRecord(section)) {
                    addError(errors, sectionPath, "schema.type", "section 必须是对象")
                    return
                }
                requireString(section.name, joinPath(sectionPath, "name"), errors, true)
                requireNumber(section.begin, joinPath(sectionPath, "begin"), errors, 0)
                requireNumber(section.length, joinPath(sectionPath, "length"), errors, 0)
            })
    }
    if (value.segments !== undefined && !Array.isArray(value.segments)) {
        addError(errors, joinPath(path, "segments"), "schema.type", "segments 必须是数组")
    }
    if (value.notifies !== undefined) {
        if (!Array.isArray(value.notifies)) addError(errors, joinPath(path, "notifies"), "schema.type", "notifies 必须是数组")
        else
            value.notifies.forEach((notify: unknown, index: number) => {
                const notifyPath = indexPath(joinPath(path, "notifies"), index)
                if (!isRecord(notify)) {
                    addError(errors, notifyPath, "schema.type", "notify 必须是对象")
                    return
                }
                requireString(notify.name, joinPath(notifyPath, "name"), errors, true)
                requireNumber(notify.time, joinPath(notifyPath, "time"), errors, 0)
                if (notify.duration !== undefined) requireNumber(notify.duration, joinPath(notifyPath, "duration"), errors, 0)
            })
    }
    if (value.branchingPoints !== undefined) {
        if (!Array.isArray(value.branchingPoints)) {
            addError(errors, joinPath(path, "branchingPoints"), "schema.type", "branchingPoints 必须是数组")
        } else {
            value.branchingPoints.forEach((point: unknown, index: number) => {
                const pointPath = indexPath(joinPath(path, "branchingPoints"), index)
                if (!isRecord(point)) {
                    addError(errors, pointPath, "schema.type", "branching point 必须是对象")
                    return
                }
                requireNumber(point.time, joinPath(pointPath, "time"), errors, 0)
                requireString(point.type, joinPath(pointPath, "type"), errors, true)
            })
        }
    }
}

function validateBlueprint(value: unknown, path: string, errors: ValidationIssue[]): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "blueprint 必须是对象")
        return
    }
    if (value.events !== undefined && !Array.isArray(value.events)) {
        addError(errors, joinPath(path, "events"), "schema.type", "events 必须是数组")
    }
    if (value.functions !== undefined) {
        if (!Array.isArray(value.functions)) addError(errors, joinPath(path, "functions"), "schema.type", "functions 必须是数组")
        else
            value.functions.forEach((fn: unknown, index: number) => {
                const fnPath = indexPath(joinPath(path, "functions"), index)
                if (!isRecord(fn)) {
                    addError(errors, fnPath, "schema.type", "function 必须是对象")
                    return
                }
                requireString(fn.name, joinPath(fnPath, "name"), errors, true)
                if (fn.body !== undefined && !Array.isArray(fn.body)) {
                    addError(errors, joinPath(fnPath, "body"), "schema.type", "body 必须是数组")
                }
            })
    }
    if (value.variables !== undefined && !Array.isArray(value.variables)) {
        addError(errors, joinPath(path, "variables"), "schema.type", "variables 必须是数组")
    }
}

function validateAuthored(value: unknown, path: string, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "authored 必须是对象")
        return
    }
    if (value.cast !== undefined && !isRecord(value.cast)) addError(errors, joinPath(path, "cast"), "schema.type", "cast 必须是对象")
    if (value.notes !== undefined && value.note === undefined) {
        addWarn(warnings, joinPath(path, "notes"), "schema.unknown-field", "字段名应为 note")
    }
    if (value.phases === undefined) return
    if (!Array.isArray(value.phases)) {
        addError(errors, joinPath(path, "phases"), "schema.type", "phases 必须是数组")
        return
    }
    let previous: number | undefined
    value.phases.forEach((phase, index) => {
        validatePhase(phase, indexPath(joinPath(path, "phases"), index), errors, { requireSort: previous })
        if (isRecord(phase) && isFiniteNumber(phase.at)) previous = phase.at
    })
}
