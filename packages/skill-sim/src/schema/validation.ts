/**
 * SkillBehaviorDoc 的运行时校验（零依赖、手写）。
 * 返回带 JSON 风格 path 的问题列表，调用方按 severity 转成诊断 / 门禁，不抛裸异常。
 */

import {
    ACTION_KINDS,
    BEHAVIOR_SOURCES,
    CONDITION_KINDS,
    type Condition,
    type CoverageReport,
    type Phase,
    SKILL_SLOTS,
    TARGET_FILTER_KINDS,
    TARGET_KINDS,
    type TargetFilter,
    type TargetSpec,
} from "./ir"
import { checkSchemaVersion } from "./versions"

export type IssueSeverity = "error" | "warn"

export interface ValidationIssue {
    path: string
    code: string
    message: string
}

export interface ValidationResult {
    ok: boolean
    errors: ValidationIssue[]
    warnings: ValidationIssue[]
}

export function emptyValidationResult(): ValidationResult {
    return { ok: true, errors: [], warnings: [] }
}

export function finalize(errors: ValidationIssue[], warnings: ValidationIssue[]): ValidationResult {
    return { ok: errors.length === 0, errors, warnings }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
}

export function joinPath(base: string, key: string): string {
    return base ? `${base}.${key}` : key
}

export function indexPath(base: string, index: number): string {
    return `${base}[${index}]`
}

export function addError(out: ValidationIssue[], path: string, code: string, message: string): void {
    out.push({ path, code, message })
}

export function addWarn(out: ValidationIssue[], path: string, code: string, message: string): void {
    out.push({ path, code, message })
}

/** 顶层 / 对象级未知字段提示（只提示一层，避免把原始证据里的扩展字段刷屏） */
export function warnUnknownKeys(
    value: Record<string, unknown>,
    allowed: readonly string[],
    base: string,
    warnings: ValidationIssue[]
): void {
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) {
            addWarn(warnings, joinPath(base, key), "schema.unknown-field", `未知字段 "${key}"（已被忽略，请确认契约版本）`)
        }
    }
}

export function requireNumber(value: unknown, path: string, errors: ValidationIssue[], min?: number): boolean {
    if (!isFiniteNumber(value)) {
        addError(errors, path, "schema.type", `必须是有限数字，实际为 ${describeValue(value)}`)
        return false
    }
    if (min !== undefined && value < min) {
        addError(errors, path, "schema.range", `必须 >= ${min}，实际为 ${value}`)
        return false
    }
    return true
}

export function requireString(value: unknown, path: string, errors: ValidationIssue[], allowEmpty = false): boolean {
    if (typeof value !== "string") {
        addError(errors, path, "schema.type", `必须是字符串，实际为 ${describeValue(value)}`)
        return false
    }
    if (!allowEmpty && value.length === 0) {
        addError(errors, path, "schema.range", "不能为空字符串")
        return false
    }
    return true
}

function describeValue(value: unknown): string {
    if (value === undefined) return "undefined"
    if (value === null) return "null"
    if (Array.isArray(value)) return "array"
    return typeof value
}

export function validateTargetSpec(value: unknown, path: string, errors: ValidationIssue[]): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "target 必须是对象")
        return
    }
    const kind = value.kind
    if (typeof kind !== "string" || !(TARGET_KINDS as readonly string[]).includes(kind)) {
        addError(
            errors,
            joinPath(path, "kind"),
            "schema.enum",
            `未知 target.kind：${JSON.stringify(kind)}（支持 ${TARGET_KINDS.join(", ")}）`
        )
        return
    }
    if (kind === "stored") requireString(value.ref, joinPath(path, "ref"), errors)
    if (kind === "nearest") {
        requireNumber(value.count, joinPath(path, "count"), errors, 0)
        requireNumber(value.radius, joinPath(path, "radius"), errors, 0)
    }
}

export function validateTargetFilter(value: unknown, path: string, errors: ValidationIssue[]): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "filter 必须是对象")
        return
    }
    const kind = value.kind
    if (typeof kind !== "string" || !(TARGET_FILTER_KINDS as readonly string[]).includes(kind)) {
        addError(
            errors,
            joinPath(path, "kind"),
            "schema.enum",
            `未知 filter.kind：${JSON.stringify(kind)}（支持 ${TARGET_FILTER_KINDS.join(", ")}）`
        )
        return
    }
    for (const key of ["count", "radius"]) {
        if (value[key] !== undefined) requireNumber(value[key], joinPath(path, key), errors, 0)
    }
}

export function validateCondition(value: unknown, path: string, errors: ValidationIssue[]): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "condition 必须是对象")
        return
    }
    const kind = value.kind
    if (typeof kind !== "string" || !(CONDITION_KINDS as readonly string[]).includes(kind)) {
        addError(
            errors,
            joinPath(path, "kind"),
            "schema.enum",
            `未知 condition.kind：${JSON.stringify(kind)}（支持 ${CONDITION_KINDS.join(", ")}）`
        )
        return
    }
    if (kind === "hasBuff") validateBuffId(value.buffId, joinPath(path, "buffId"), errors)
    if (kind === "resourceAtLeast") {
        requireString(value.resource, joinPath(path, "resource"), errors)
        requireNumber(value.value, joinPath(path, "value"), errors)
    }
    if (kind === "targetCountAtLeast") requireNumber(value.value, joinPath(path, "value"), errors, 0)
    if (kind === "opaque") requireString(value.ref, joinPath(path, "ref"), errors)
}

function validateBuffId(value: unknown, path: string, errors: ValidationIssue[]): void {
    const ok = (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.length > 0)
    if (!ok) addError(errors, path, "schema.type", `buffId 必须是数字或非空字符串，实际为 ${describeValue(value)}`)
}

function validateHitSpec(value: unknown, path: string, errors: ValidationIssue[]): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "hits 必须是对象")
        return
    }
    requireNumber(value.count, joinPath(path, "count"), errors, 1)
    requireNumber(value.interval, joinPath(path, "interval"), errors, 0)
    if (value.tag !== undefined) requireString(value.tag, joinPath(path, "tag"), errors)
}

function expectArray(value: unknown, path: string, errors: ValidationIssue[]): unknown[] {
    if (!Array.isArray(value)) {
        addError(errors, path, "schema.type", `必须是数组，实际为 ${describeValue(value)}`)
        return []
    }
    return value
}

export function validateActions(value: unknown, path: string, errors: ValidationIssue[]): void {
    const actions = expectArray(value, path, errors)
    actions.forEach((action, index) => validateAction(action, indexPath(path, index), errors))
}

function validateAction(value: unknown, path: string, errors: ValidationIssue[]): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "action 必须是对象")
        return
    }
    const kind = value.kind
    if (typeof kind !== "string" || !(ACTION_KINDS as readonly string[]).includes(kind)) {
        addError(
            errors,
            joinPath(path, "kind"),
            "schema.enum",
            `未知 action.kind：${JSON.stringify(kind)}（支持 ${ACTION_KINDS.join(", ")}）`
        )
        return
    }
    if (
        value.source !== undefined &&
        (typeof value.source !== "string" || !(BEHAVIOR_SOURCES as readonly string[]).includes(value.source))
    ) {
        addError(errors, joinPath(path, "source"), "schema.enum", `未知 action.source：${JSON.stringify(value.source)}`)
    }
    switch (kind) {
        case "damage":
            requireString(value.field, joinPath(path, "field"), errors)
            requireString(value.tag, joinPath(path, "tag"), errors, true)
            validateHitSpec(value.hits, joinPath(path, "hits"), errors)
            validateTargetSpec(value.target, joinPath(path, "target"), errors)
            break
        case "applyBuff":
            validateBuffId(value.buffId, joinPath(path, "buffId"), errors)
            validateTargetSpec(value.target, joinPath(path, "target"), errors)
            for (const key of ["level", "duration", "stacks"]) {
                if (value[key] !== undefined) requireNumber(value[key], joinPath(path, key), errors, 0)
            }
            break
        case "removeBuff":
            validateBuffId(value.buffId, joinPath(path, "buffId"), errors)
            validateTargetSpec(value.target, joinPath(path, "target"), errors)
            break
        case "resource":
            requireString(value.resource, joinPath(path, "resource"), errors)
            requireNumber(value.delta, joinPath(path, "delta"), errors)
            break
        case "summon":
            requireNumber(value.creatureId, joinPath(path, "creatureId"), errors, 0)
            if (value.duration !== undefined) requireNumber(value.duration, joinPath(path, "duration"), errors, 0)
            if (value.target !== undefined) validateTargetSpec(value.target, joinPath(path, "target"), errors)
            break
        case "select":
            validateTargetFilter(value.filter, joinPath(path, "filter"), errors)
            requireString(value.store, joinPath(path, "store"), errors)
            if (value.count !== undefined) requireNumber(value.count, joinPath(path, "count"), errors, 0)
            break
        case "branch":
            requireString(value.on, joinPath(path, "on"), errors)
            validateActions(value.then, joinPath(path, "then"), errors)
            if (value.else !== undefined) validateActions(value.else, joinPath(path, "else"), errors)
            break
        case "native":
            requireString(value.fn, joinPath(path, "fn"), errors)
            expectArray(value.args, joinPath(path, "args"), errors)
            break
    }
}

export function validatePhase(value: unknown, path: string, errors: ValidationIssue[], options?: { requireSort?: number }): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "phase 必须是对象")
        return
    }
    requireNumber(value.at, joinPath(path, "at"), errors, 0)
    if (value.until !== undefined) {
        requireNumber(value.until, joinPath(path, "until"), errors, 0)
        if (isFiniteNumber(value.at) && isFiniteNumber(value.until) && value.until < value.at) {
            addError(errors, joinPath(path, "until"), "schema.order", `until(${value.until}) 不能小于 at(${value.at})`)
        }
    }
    if (options?.requireSort !== undefined && isFiniteNumber(value.at) && value.at < options.requireSort) {
        addError(errors, joinPath(path, "at"), "schema.order", `phase 必须按 at 升序：${value.at} < 前一项 ${options.requireSort}`)
    }
    if (value.tick !== undefined) {
        if (!isRecord(value.tick)) addError(errors, joinPath(path, "tick"), "schema.type", "tick 必须是对象")
        else {
            requireNumber(value.tick.interval, joinPath(joinPath(path, "tick"), "interval"), errors, 0)
            if (value.tick.interval === 0) {
                addError(errors, joinPath(joinPath(path, "tick"), "interval"), "schema.range", "tick.interval 必须 > 0")
            }
            if (value.tick.count !== undefined) requireNumber(value.tick.count, joinPath(joinPath(path, "tick"), "count"), errors, 1)
        }
    }
    if (value.condition !== undefined) validateCondition(value.condition, joinPath(path, "condition"), errors)
    if (
        value.source !== undefined &&
        (typeof value.source !== "string" || !(BEHAVIOR_SOURCES as readonly string[]).includes(value.source))
    ) {
        addError(errors, joinPath(path, "source"), "schema.enum", `未知 phase.source：${JSON.stringify(value.source)}`)
    }
    validateActions(value.actions, joinPath(path, "actions"), errors)
}

function validatePhases(value: unknown, path: string, errors: ValidationIssue[]): void {
    const phases = expectArray(value, path, errors)
    let previous: number | undefined
    phases.forEach((phase, index) => {
        validatePhase(phase, indexPath(path, index), errors, { requireSort: previous })
        if (isRecord(phase) && isFiniteNumber(phase.at)) previous = phase.at
    })
}

function validateCast(value: unknown, path: string, errors: ValidationIssue[]): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "cast 必须是对象")
        return
    }
    requireNumber(value.time, joinPath(path, "time"), errors, 0)
    requireNumber(value.cooldown, joinPath(path, "cooldown"), errors, 0)
    if (typeof value.canMove !== "boolean") addError(errors, joinPath(path, "canMove"), "schema.type", "canMove 必须是布尔值")
    const costs = expectArray(value.costs, joinPath(path, "costs"), errors)
    costs.forEach((cost, index) => {
        const costPath = indexPath(joinPath(path, "costs"), index)
        if (!isRecord(cost)) {
            addError(errors, costPath, "schema.type", "cost 必须是对象")
            return
        }
        requireString(cost.resource, joinPath(costPath, "resource"), errors)
        requireNumber(cost.amount, joinPath(costPath, "amount"), errors)
        if (cost.perSecond !== undefined && typeof cost.perSecond !== "boolean") {
            addError(errors, joinPath(costPath, "perSecond"), "schema.type", "perSecond 必须是布尔值")
        }
    })
}

function validateSources(value: unknown, path: string, errors: ValidationIssue[]): void {
    const sources = expectArray(value, path, errors)
    if (sources.length === 0) addError(errors, path, "schema.range", "sources 不能为空")
    sources.forEach((source, index) => {
        if (typeof source !== "string" || !(BEHAVIOR_SOURCES as readonly string[]).includes(source)) {
            addError(errors, indexPath(path, index), "schema.enum", `未知 source：${JSON.stringify(source)}`)
        }
    })
}

function validateProvenance(value: unknown, path: string, errors: ValidationIssue[]): void {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "provenance 必须是对象")
        return
    }
    expectArray(value.bpPackages, joinPath(path, "bpPackages"), errors).forEach((item, index) => {
        requireString(item, indexPath(joinPath(path, "bpPackages"), index), errors, true)
    })
    expectArray(value.unmatchedNotify, joinPath(path, "unmatchedNotify"), errors).forEach((item, index) => {
        requireString(item, indexPath(joinPath(path, "unmatchedNotify"), index), errors, true)
    })
    if (value.unparsedLua !== undefined) {
        expectArray(value.unparsedLua, joinPath(path, "unparsedLua"), errors).forEach((item, index) => {
            requireString(item, indexPath(joinPath(path, "unparsedLua"), index), errors, true)
        })
    }
    const calls = expectArray(value.nativeCalls, joinPath(path, "nativeCalls"), errors)
    calls.forEach((call, index) => {
        const callPath = indexPath(joinPath(path, "nativeCalls"), index)
        if (!isRecord(call)) {
            addError(errors, callPath, "schema.type", "nativeCall 必须是对象")
            return
        }
        requireString(call.fn, joinPath(callPath, "fn"), errors)
        expectArray(call.args, joinPath(callPath, "args"), errors)
        if (typeof call.known !== "boolean") addError(errors, joinPath(callPath, "known"), "schema.type", "known 必须是布尔值")
        if (typeof call.mapped !== "boolean") addError(errors, joinPath(callPath, "mapped"), "schema.type", "mapped 必须是布尔值")
        if (call.source !== "blueprint" && call.source !== "lua") {
            addError(errors, joinPath(callPath, "source"), "schema.enum", `nativeCall.source 必须是 blueprint 或 lua`)
        }
    })
}

function validateCoverage(value: unknown, path: string, errors: ValidationIssue[]): value is CoverageReport {
    if (!isRecord(value)) {
        addError(errors, path, "schema.type", "coverage 必须是对象")
        return false
    }
    for (const key of [
        "charactersTotal",
        "skillsTotal",
        "skillsWithMontage",
        "skillsWithBlueprint",
        "skillsWithAnimBP",
        "skillsWithLua",
        "skillsAuthored",
        "skillsWithBehavior",
        "nativeCallsTotal",
    ]) {
        requireNumber(value[key], joinPath(path, key), errors, 0)
    }
    for (const key of ["nativeCallsUnknown", "unknownTaskFunctions", "unmatchedNotifies"]) {
        const list = expectArray(value[key], joinPath(path, key), errors)
        list.forEach((item, index) => requireString(item, indexPath(joinPath(path, key), index), errors, true))
    }
    return true
}

/** 校验 SkillBehaviorDoc；不抛异常 */
export function validateSkillBehaviorDoc(value: unknown): ValidationResult {
    const errors: ValidationIssue[] = []
    const warnings: ValidationIssue[] = []
    if (!isRecord(value)) {
        addError(errors, "", "schema.type", "SkillBehaviorDoc 必须是对象")
        return finalize(errors, warnings)
    }
    const version = checkSchemaVersion(value.schemaVersion, "behavior")
    if (!version.ok && version.message) addError(errors, "schemaVersion", "schema.version", version.message)

    requireString(value.gameVersion, "gameVersion", errors, true)
    if (value.exporter !== undefined && !isRecord(value.exporter)) addError(errors, "exporter", "schema.type", "exporter 必须是对象")

    const characterIds = new Set<number>()
    const characters = expectArray(value.characters, "characters", errors)
    characters.forEach((character, index) => {
        const path = indexPath("characters", index)
        if (!isRecord(character)) {
            addError(errors, path, "schema.type", "character 必须是对象")
            return
        }
        if (requireNumber(character.id, joinPath(path, "id"), errors, 0)) {
            if (characterIds.has(character.id as number))
                addError(errors, joinPath(path, "id"), "schema.duplicate", `重复的角色 id ${character.id}`)
            characterIds.add(character.id as number)
        }
        requireString(character.nameKey, joinPath(path, "nameKey"), errors, true)
        const skillIds = expectArray(character.skills, joinPath(path, "skills"), errors)
        skillIds.forEach((skillId, skillIndex) => requireNumber(skillId, indexPath(joinPath(path, "skills"), skillIndex), errors, 0))
    })

    const skills = isRecord(value.skills) ? value.skills : undefined
    if (!skills) addError(errors, "skills", "schema.type", "skills 必须是对象（id → SkillBehavior）")

    if (skills) {
        for (const [key, raw] of Object.entries(skills)) {
            const path = joinPath("skills", key)
            if (!isRecord(raw)) {
                addError(errors, path, "schema.type", "SkillBehavior 必须是对象")
                continue
            }
            if (!/^\d+$/.test(key)) addError(errors, path, "schema.key", `skills 的键必须是技能 id 数字字符串，实际为 "${key}"`)
            if (requireNumber(raw.id, joinPath(path, "id"), errors, 0) && String(raw.id) !== key) {
                addError(errors, joinPath(path, "id"), "schema.key-mismatch", `键 "${key}" 与 id ${raw.id} 不一致`)
            }
            requireNumber(raw.characterId, joinPath(path, "characterId"), errors, 0)
            if (typeof raw.slot !== "string" || !(SKILL_SLOTS as readonly string[]).includes(raw.slot)) {
                addError(
                    errors,
                    joinPath(path, "slot"),
                    "schema.enum",
                    `未知 slot：${JSON.stringify(raw.slot)}（支持 ${SKILL_SLOTS.join(", ")}）`
                )
            }
            validateCast(raw.cast, joinPath(path, "cast"), errors)
            validatePhases(raw.phases, joinPath(path, "phases"), errors)
            validateSources(raw.sources, joinPath(path, "sources"), errors)
            if (raw.provenance !== undefined) validateProvenance(raw.provenance, joinPath(path, "provenance"), errors)
            if (isFiniteNumber(raw.characterId) && raw.characterId > 0 && !characterIds.has(raw.characterId) && characters.length > 0) {
                addWarn(
                    warnings,
                    joinPath(path, "characterId"),
                    "schema.reference",
                    `characterId ${raw.characterId} 不在 characters 列表中`
                )
            }
        }
    }

    const buffs = isRecord(value.buffs) ? value.buffs : undefined
    if (!buffs) addError(errors, "buffs", "schema.type", "buffs 必须是对象（id → BuffBehavior）")
    if (buffs) {
        for (const [key, raw] of Object.entries(buffs)) {
            const path = joinPath("buffs", key)
            if (!isRecord(raw)) {
                addError(errors, path, "schema.type", "BuffBehavior 必须是对象")
                continue
            }
            const idOk = (typeof raw.id === "number" && Number.isFinite(raw.id)) || (typeof raw.id === "string" && raw.id.length > 0)
            if (!idOk) addError(errors, joinPath(path, "id"), "schema.type", "buff.id 必须是数字或非空字符串")
            else if (String(raw.id) !== key)
                addError(errors, joinPath(path, "id"), "schema.key-mismatch", `键 "${key}" 与 id ${raw.id} 不一致`)
            validateSources(raw.sources, joinPath(path, "sources"), errors)
            if (raw.dots !== undefined) {
                expectArray(raw.dots, joinPath(path, "dots"), errors).forEach((dot, index) => {
                    const dotPath = indexPath(joinPath(path, "dots"), index)
                    if (!isRecord(dot)) {
                        addError(errors, dotPath, "schema.type", "dot 必须是对象")
                        return
                    }
                    requireNumber(dot.interval, joinPath(dotPath, "interval"), errors, 0)
                    if (dot.interval === 0) addError(errors, joinPath(dotPath, "interval"), "schema.range", "dot.interval 必须 > 0")
                    if (dot.delay !== undefined) requireNumber(dot.delay, joinPath(dotPath, "delay"), errors, 0)
                    requireString(dot.resource, joinPath(dotPath, "resource"), errors)
                    requireNumber(dot.delta, joinPath(dotPath, "delta"), errors)
                })
            }
        }
    }

    // 引用完整性：角色列出的技能必须存在；buff 引用尽量自包含（缺失仅 warn，check 会用数据索引升级）
    if (characters.length > 0 && skills) {
        characters.forEach((character, index) => {
            if (!isRecord(character) || !Array.isArray(character.skills)) return
            character.skills.forEach((skillId, skillIndex) => {
                if (typeof skillId === "number" && !skills[String(skillId)]) {
                    addError(
                        errors,
                        indexPath(joinPath(indexPath("characters", index), "skills"), skillIndex),
                        "schema.reference",
                        `技能 ${skillId} 不在 skills 中`
                    )
                }
            })
        })
    }
    if (buffs && skills) {
        for (const [key, raw] of Object.entries(skills)) {
            if (!isRecord(raw) || !Array.isArray(raw.phases)) continue
            collectBuffRefs(raw.phases, joinPath(joinPath("skills", key), "phases"), buffs, warnings)
        }
    }

    if (value.coverage === undefined) addError(errors, "coverage", "schema.required", "缺少 coverage")
    else validateCoverage(value.coverage, "coverage", errors)

    // manifest 在 IR 之上附加 generator / diagnostics（check 的输入形态）
    warnUnknownKeys(
        value,
        ["schemaVersion", "gameVersion", "exporter", "characters", "skills", "buffs", "coverage", "generator", "diagnostics"],
        "",
        warnings
    )
    return finalize(errors, warnings)
}

function collectBuffRefs(phases: unknown[], basePath: string, buffs: Record<string, unknown>, warnings: ValidationIssue[]): void {
    phases.forEach((phase, phaseIndex) => {
        if (!isRecord(phase)) return
        const phasePath = indexPath(basePath, phaseIndex)
        if (isRecord(phase.condition) && phase.condition.kind === "hasBuff") checkBuffRef(phase.condition.buffId)
        if (Array.isArray(phase.actions))
            phase.actions.forEach((action, actionIndex) => walkAction(action, indexPath(joinPath(phasePath, "actions"), actionIndex)))

        function walkAction(action: unknown, path: string): void {
            if (!isRecord(action)) return
            if ((action.kind === "applyBuff" || action.kind === "removeBuff") && action.buffId !== undefined) checkBuffRef(action.buffId)
            if (action.kind === "branch") {
                if (Array.isArray(action.then))
                    action.then.forEach((child, index) => walkAction(child, indexPath(joinPath(path, "then"), index)))
                if (Array.isArray(action.else))
                    action.else.forEach((child, index) => walkAction(child, indexPath(joinPath(path, "else"), index)))
            }
        }

        function checkBuffRef(buffId: unknown): void {
            const key = String(buffId)
            if (!buffs[key]) {
                addWarn(warnings, phasePath, "schema.reference", `引用的 buff ${key} 不在 buffs 中（check 会用数据索引复核）`)
            }
        }
    })
}

export type { Condition, Phase, TargetFilter, TargetSpec }
