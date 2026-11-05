/**
 * build：SkillAssetDoc + packages/data → SkillBehaviorIR。
 *
 * 合并优先级：
 * 1. `authored.phases` 存在 → 整体替换派生相位（人工语义优先，provenance 仍保留全部证据）；
 * 2. montage notify / branching point → 时间轴；
 * 3. 蓝图字节码 → native 登记表翻译的动作（无时间，统一挂在 0 秒）；
 * 4. Lua `行为` / SkillEffects → 仅在前三路都没产出动作时兜底；
 * 5. Buff DotDatas → 持续消耗 tick 相位（无论来源，只要有 applyBuff）。
 */

import type { SkillAssetDoc, SkillAssetField, SkillAssetSkill } from "../schema/asset"
import {
    type Action,
    BEHAVIOR_SOURCES,
    type BehaviorSource,
    type BranchingPoint,
    type BuffBehavior,
    type CoverageReport,
    emptyCoverageReport,
    type NativeCall,
    type Phase,
    type ResourceCost,
    type SkillBehaviorDoc,
} from "../schema/ir"
import { validateSkillBehaviorDoc } from "../schema/validation"
import { deriveBuffDots, type LuaContext, mapEffectList, parseLuaBehavior } from "./lua"
import { levelTenValue, mapNativeCall } from "./native-map"
import { normalizeEffects, type ResolvedSkill, resolveAssetReferences } from "./resolve"
import { type Diagnostic, diagnostic, hasErrors, type SkillDataIndex } from "./types"

export interface BuildOptions {
    /** 覆盖导出器记录的 gameVersion */
    gameVersion?: string
}

export interface BuildResult {
    doc: SkillBehaviorDoc
    diagnostics: Diagnostic[]
    ok: boolean
}

const INERT_NOTIFIES = new Set(["BP_SkillCancel_C", "BP_NextCombo_C", "BP_SkillCancel", "BP_NextCombo"])

export function buildSkillBehaviorDoc(asset: SkillAssetDoc, index: SkillDataIndex, options: BuildOptions = {}): BuildResult {
    const diagnostics: Diagnostic[] = []
    const resolved = resolveAssetReferences(asset, index)
    diagnostics.push(...resolved.diagnostics)

    const buffs = buildBuffs(asset)
    const skills: SkillBehaviorDoc["skills"] = {}
    const coverage = emptyCoverageReport()

    const unknownTaskFunctions: string[] = []
    for (const item of resolved.skills) {
        const built = buildSkill(item, buffs, diagnostics)
        skills[String(item.skillId)] = built.behavior
        unknownTaskFunctions.push(...built.unknownTaskFunctions)
        accumulateCoverage(coverage, item.asset, built.behavior, Boolean(item.asset.authored?.phases))
    }

    coverage.charactersTotal = asset.characters?.length ?? 0
    coverage.skillsTotal = resolved.skills.length
    coverage.skillsWithBehavior = Object.values(skills).filter(skill => skill.phases.some(phase => phase.actions.length > 0)).length
    coverage.nativeCallsUnknown = uniqueSorted(coverage.nativeCallsUnknown)
    coverage.unmatchedNotifies = uniqueSorted(coverage.unmatchedNotifies)
    coverage.unknownTaskFunctions = uniqueSorted(unknownTaskFunctions)
    const doc: SkillBehaviorDoc = {
        schemaVersion: 1,
        gameVersion: options.gameVersion ?? asset.exporter?.gameVersion ?? "unknown",
        exporter: asset.exporter
            ? {
                  gitCommit: asset.exporter.gitCommit,
                  parserVersion: asset.exporter.parserVersion,
                  gameVersion: asset.exporter.gameVersion,
              }
            : undefined,
        characters: (asset.characters ?? [])
            .map(character => ({ id: character.id, nameKey: character.nameKey ?? String(character.id), skills: character.skills ?? [] }))
            .sort((a, b) => a.id - b.id),
        skills,
        buffs,
        coverage,
    }

    const validation = validateSkillBehaviorDoc(doc)
    for (const issue of validation.errors) diagnostics.push(diagnostic("error", issue.code, issue.path, issue.message))
    for (const issue of validation.warnings) diagnostics.push(diagnostic("warn", issue.code, issue.path, issue.message))

    return { doc, diagnostics, ok: !hasErrors(diagnostics) }
}

interface SkillBuildOutput {
    behavior: SkillBehaviorDoc["skills"][string]
    unknownTaskFunctions: string[]
}

function buildSkill(resolved: ResolvedSkill, buffs: Record<string, BuffBehavior>, diagnostics: Diagnostic[]): SkillBuildOutput {
    const { asset: skill, data, skillId, characterId, slot } = resolved
    const skillPath = `skills.${skillId}`
    const fields = toDataFields(skill.lua?.fields, data?.fields)
    const buffProps = new Map<string, Record<string, unknown>>()
    for (const [key, buff] of Object.entries(buffs)) {
        if (buff.props) buffProps.set(key, buff.props)
    }
    const luaCtx: LuaContext = { fields, effects: normalizeEffects(skill.lua?.effects), buffProps }
    const nativeCalls: NativeCall[] = []
    const unmatchedNotify: string[] = []
    const inertNotifies: string[] = []
    const unparsedLua: string[] = []
    const unknownTaskFunctions: string[] = []

    const montage = deriveFromMontage(skill, luaCtx, skillPath, diagnostics)
    nativeCalls.push(...montage.calls)
    unmatchedNotify.push(...montage.unmatched)
    inertNotifies.push(...montage.inert)
    unknownTaskFunctions.push(...montage.unknownFunctions)

    const blueprint = deriveFromBlueprint(skill, fields)
    nativeCalls.push(...blueprint.calls)

    let phases: Phase[] = [...montage.phases, ...blueprint.phases]

    if (phases.some(phase => phase.actions.length > 0)) {
        phases.push(...deriveBuffTickPhases(phases, buffProps))
    } else {
        const lua = parseLuaBehavior(skill.lua?.behavior, luaCtx)
        nativeCalls.push(...lua.calls)
        unparsedLua.push(...lua.unparsed)
        unknownTaskFunctions.push(...lua.unknownTaskFunctions)
        phases = lua.phases
    }

    const authored = skill.authored
    if (authored?.phases) {
        phases = authored.phases.map(phase => structuredClonePhase(phase))
    }
    phases = sortPhases(phases)

    const authoredCast = authored?.cast
    const montageActionTime = montage.phases.find(phase => phase.actions.length > 0)?.at
    const cast = {
        time: authoredCast?.time ?? montageActionTime ?? firstActionTime(phases),
        cooldown: authoredCast?.cooldown ?? data?.cd ?? 0,
        costs: authoredCast?.costs ?? parseCosts(fields),
        canMove: authoredCast?.canMove ?? montage.canMove,
    }

    const sources = collectSources(skill, authored !== undefined)
    const provenance = {
        bpPackages: skill.sources?.bpPackages ?? [],
        nativeCalls,
        unmatchedNotify: uniqueSorted(unmatchedNotify),
        inertNotifies: uniqueSorted(inertNotifies),
        montageLength: skill.montage?.length,
        branchingPoints: toBranchingPoints(skill),
        unparsedLua: unparsedLua.length > 0 ? uniqueSorted(unparsedLua) : undefined,
    }

    if (!phases.some(phase => phase.actions.length > 0)) {
        diagnostics.push(diagnostic("warn", "build.no-actions", skillPath, `技能 ${skillId} 没有可执行动作（仅数值字段或未识别 notify）`))
    }

    return { behavior: { id: skillId, characterId, slot, cast, phases, sources, provenance }, unknownTaskFunctions }
}

function structuredClonePhase(phase: Phase): Phase {
    return JSON.parse(JSON.stringify(phase)) as Phase
}

function accumulateCoverage(
    coverage: CoverageReport,
    skill: SkillAssetSkill,
    behavior: SkillBehaviorDoc["skills"][string],
    authored: boolean
): void {
    if (skill.montage) coverage.skillsWithMontage++
    if (skill.blueprint) coverage.skillsWithBlueprint++
    if (skill.animBP) coverage.skillsWithAnimBP++
    if (skill.lua?.behavior || (skill.lua?.effects?.length ?? 0) > 0 || (skill.lua?.buffIds?.length ?? 0) > 0) coverage.skillsWithLua++
    if (authored) coverage.skillsAuthored++
    for (const call of behavior.provenance?.nativeCalls ?? []) {
        coverage.nativeCallsTotal++
        if (!call.known) coverage.nativeCallsUnknown.push(call.fn)
    }
    for (const name of behavior.provenance?.unmatchedNotify ?? []) coverage.unmatchedNotifies.push(name)
}

function toBranchingPoints(skill: SkillAssetSkill): BranchingPoint[] | undefined {
    const points = skill.montage?.branchingPoints
    if (!points || points.length === 0) return undefined
    return points.map(point => ({ time: point.time, type: point.type }))
}

function collectSources(skill: SkillAssetSkill, authored: boolean): BehaviorSource[] {
    const set = new Set<BehaviorSource>()
    if (skill.montage) set.add("montage")
    if ((skill.sources?.bpPackages?.length ?? 0) > 0 || skill.blueprint) set.add("blueprint")
    if (skill.lua?.behavior || (skill.lua?.effects?.length ?? 0) > 0 || (skill.lua?.buffIds?.length ?? 0) > 0) set.add("lua")
    if (authored) set.add("manual")
    if (set.size > 1) set.add("hybrid")
    return BEHAVIOR_SOURCES.filter(source => set.has(source))
}

function toDataFields(assetFields: unknown, dataFields: { name: string; values: number | number[]; tag?: string[] }[] | undefined) {
    if (dataFields && dataFields.length > 0) return dataFields
    if (!Array.isArray(assetFields)) return []
    return assetFields
        .filter(
            (field): field is SkillAssetField =>
                typeof field === "object" && field !== null && typeof (field as SkillAssetField).名称 === "string"
        )
        .map(field => ({ name: field.名称, values: field.值, tag: field.tag, impact: field.影响 }))
}

interface DerivedPhaseSet {
    phases: Phase[]
    calls: NativeCall[]
    unmatched: string[]
    inert: string[]
    unknownFunctions: string[]
    canMove: boolean
}

function deriveFromMontage(skill: SkillAssetSkill, luaCtx: LuaContext, skillPath: string, diagnostics: Diagnostic[]): DerivedPhaseSet {
    const result: DerivedPhaseSet = {
        phases: [],
        calls: [],
        unmatched: [],
        inert: [],
        unknownFunctions: [],
        canMove: false,
    }
    const montage = skill.montage
    if (!montage) return result
    const notifies = [...(montage.notifies ?? [])].sort((a, b) => a.time - b.time)
    const length = montage.length ?? 0

    for (const notify of notifies) {
        const name = notify.name
        if (INERT_NOTIFIES.has(name)) {
            result.inert.push(name)
            if (name.includes("Cancel")) result.canMove = true
            continue
        }
        const payload = notify.payload ?? {}
        const effects = luaCtx.effects.filter(effect => {
            if (payload.EffectId !== undefined && effect.TaskId === payload.EffectId) return true
            return Array.isArray(effect.NotifyName) && effect.NotifyName.includes(name)
        })
        let actions: Action[] = []
        if (effects.length > 0) {
            const mapped = mapEffectList(effects, luaCtx)
            actions = mapped.actions
            result.calls.push(...mapped.calls)
            result.unknownFunctions.push(...mapped.unknownFunctions)
            for (const warning of mapped.warnings) diagnostics.push(diagnostic("warn", "build.effect", skillPath, warning))
        }
        if (actions.length === 0) {
            const buffId = payload.BuffId
            if (typeof buffId === "number" || typeof buffId === "string") {
                actions = [
                    {
                        kind: "applyBuff",
                        buffId,
                        target: payload.Target === "Self" ? { kind: "self" } : { kind: "primary" },
                        origin: `notify:${name}@${notify.time}`,
                    },
                ]
            }
        }
        if (actions.length === 0) {
            // 关联到 effect 但无法翻译不算“未匹配 notify”，证据已进 nativeCalls
            if (effects.length === 0) result.unmatched.push(name)
            continue
        }
        for (const action of actions) {
            if (action.source === undefined) action.source = "montage"
            if (action.origin === undefined) action.origin = `notify:${name}@${notify.time}`
        }
        const until = activeWindowEnd(notify.time, montage.branchingPoints ?? [], length)
        result.phases.push({
            at: notify.time,
            until,
            actions,
            source: "montage",
            origin: `notify:${name}@${notify.time}`,
        })
    }
    return result
}

function activeWindowEnd(time: number, points: { time: number; type: string }[], length: number): number | undefined {
    const end = points
        .filter(point => point.time > time && /end/i.test(point.type))
        .map(point => point.time)
        .sort((a, b) => a - b)[0]
    const until = end ?? (length > time ? length : undefined)
    return until !== undefined && until > time ? until : undefined
}

interface DerivedBlueprint {
    phases: Phase[]
    calls: NativeCall[]
}

function deriveFromBlueprint(
    skill: SkillAssetSkill,
    fields: { name: string; values: number | number[]; tag?: string[] }[]
): DerivedBlueprint {
    const result: DerivedBlueprint = { phases: [], calls: [] }
    const functions = skill.blueprint?.functions
    if (!Array.isArray(functions)) return result
    const seen = new Set<string>()
    const actions: Action[] = []
    for (const fn of functions) {
        const calls: { fn: string; args: unknown[] }[] = []
        collectCalls(fn.body, calls)
        for (const call of calls) {
            const signature = `${call.fn}|${JSON.stringify(call.args)}`
            if (seen.has(signature)) continue
            seen.add(signature)
            const mapped = mapNativeCall(call.fn, call.args, { fields })
            result.calls.push({ fn: call.fn, args: call.args, known: mapped.known, mapped: mapped.mapped, source: "blueprint" })
            for (const action of mapped.actions) {
                if (action.source === undefined) action.source = "blueprint"
                actions.push(action)
            }
        }
    }
    if (actions.length > 0) {
        result.phases.push({ at: 0, actions, source: "blueprint", origin: "blueprint:bytecode" })
    }
    return result
}

function collectCalls(value: unknown, out: { fn: string; args: unknown[] }[]): void {
    if (Array.isArray(value)) {
        for (const item of value) collectCalls(item, out)
        return
    }
    if (typeof value !== "object" || value === null) return
    const node = value as Record<string, unknown>
    const op = typeof node.op === "string" ? node.op : undefined
    const fn = typeof node.fn === "string" ? node.fn : typeof node.Function === "string" ? node.Function : undefined
    const looksLikeCall = fn !== undefined && (op === undefined || /call|finalfunction|virtual/i.test(op))
    if (looksLikeCall) {
        const argsRaw = Array.isArray(node.args) ? node.args : Array.isArray(node.AllParams) ? node.AllParams : []
        out.push({ fn: fn as string, args: argsRaw.map(literalValue) })
    }
    for (const key of ["args", "value", "then", "else", "body", "children", "expr", "condition"]) {
        collectCalls(node[key], out)
    }
}

function literalValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(literalValue)
    if (typeof value !== "object" || value === null) return value
    const node = value as Record<string, unknown>
    if (node.op === "Self" || node.op === "SelfRef") return "self"
    if ("value" in node && (typeof node.value === "number" || typeof node.value === "string" || typeof node.value === "boolean")) {
        return node.value
    }
    if (typeof node.IntegerValue === "number") return node.IntegerValue
    if (typeof node.NumberValue === "number") return node.NumberValue
    if (typeof node.StringValue === "string") return node.StringValue
    return { op: node.op ?? "Object", fn: node.fn }
}

function deriveBuffTickPhases(phases: Phase[], buffProps: Map<string, Record<string, unknown>>): Phase[] {
    const result: Phase[] = []
    const seen = new Set<string>()
    for (const phase of phases) {
        for (const action of phase.actions) {
            if (action.kind !== "applyBuff") continue
            const key = String(action.buffId)
            const props = buffProps.get(key)
            const dots = deriveBuffDots(props)
            if (!dots) continue
            for (const dot of dots) {
                const at = phase.at + (dot.delay ?? 0)
                const signature = `${key}|${at}|${dot.interval}|${dot.delta}`
                if (seen.has(signature)) continue
                seen.add(signature)
                result.push({
                    at,
                    until: phase.until,
                    tick: { interval: dot.interval },
                    condition: { kind: "hasBuff", buffId: action.buffId },
                    actions: [
                        {
                            kind: "resource",
                            resource: dot.resource,
                            delta: dot.delta,
                            source: "lua",
                            origin: `buff:${key}:DotDatas`,
                        },
                    ],
                    source: "lua",
                    origin: `buff:${key}:DotDatas`,
                })
            }
        }
    }
    return result
}

function sortPhases(phases: Phase[]): Phase[] {
    return phases
        .map((phase, index) => ({ phase, index }))
        .sort((a, b) => a.phase.at - b.phase.at || a.index - b.index)
        .map(item => item.phase)
}

function firstActionTime(phases: Phase[]): number {
    for (const phase of phases) {
        if (phase.actions.length > 0) return phase.at
    }
    return 0
}

function parseCosts(fields: { name: string; values: number | number[]; impact?: string }[]): ResourceCost[] {
    const costs: ResourceCost[] = []
    for (const field of fields) {
        const perSecond = field.name.includes("每秒")
        const baseName = field.name.replace("每秒", "")
        const match = baseName.match(/^(.+?)消耗$/)
        if (!match) continue
        const resource = match[1]!.replace(/[[\]]/g, "")
        const amount = levelTenValue(field.values)
        if (amount === undefined || amount <= 0) continue
        costs.push(perSecond ? { resource, amount, perSecond: true } : { resource, amount })
    }
    return costs
}

function buildBuffs(asset: SkillAssetDoc): Record<string, BuffBehavior> {
    const result: Record<string, BuffBehavior> = {}
    for (const [key, buff] of Object.entries(asset.buffs ?? {})) {
        const id = buff.id ?? (/^\d+$/.test(key) ? Number(key) : key)
        const hasEvidence = Boolean(buff.lua || buff.props || (buff.bpPackages?.length ?? 0) > 0)
        const duration = typeof buff.props?.LastTime === "number" && buff.props.LastTime > 0 ? buff.props.LastTime : undefined
        result[key] = {
            id,
            name: buff.name,
            lua: buff.lua,
            props: buff.props,
            bpPackages: buff.bpPackages,
            dots: deriveBuffDots(buff.props),
            duration,
            sources: hasEvidence ? ["lua"] : [],
        }
    }
    return result
}

function uniqueSorted(values: string[]): string[] {
    return [...new Set(values)].sort()
}
