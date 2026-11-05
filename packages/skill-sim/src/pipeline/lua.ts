/**
 * Lua / SkillEffects 证据 → IR 动作。
 *
 * 这是**兜底**来源（PLAN §2.3）：只在 montage / blueprint 没有产出动作时决定 phases，
 * 但 buff 的持续消耗（DotDatas）、TaskEffects 等结构化证据会一直参与推导。
 * 无法结构化的语句原文进 `unparsedLua`，不静默丢弃。
 */

import type { SkillAssetEffect, SkillAssetTaskEffect } from "../schema/asset"
import type { Action, BuffDotBehavior, NativeCall, Phase, TargetSpec } from "../schema/ir"
import { isKnownNative, literal, mapNativeCall, resolveFieldByRate } from "./native-map"
import type { DataSkillField } from "./types"

export interface LuaContext {
    fields: DataSkillField[]
    effects: SkillAssetEffect[]
    /** buff id → 原始 Buff.json props（用于时长 / 每跳消耗） */
    buffProps: Map<string, Record<string, unknown>>
}

export interface LuaParseResult {
    phases: Phase[]
    calls: NativeCall[]
    unparsed: string[]
    unknownTaskFunctions: string[]
}

export interface TaskEffectMapResult {
    actions: Action[]
    calls: NativeCall[]
    unknownFunctions: string[]
    warnings: string[]
}

/** 解析 Lua `行为` 文本（分号分隔，括号内不切分） */
export function parseLuaBehavior(behavior: string | undefined, ctx: LuaContext): LuaParseResult {
    const result: LuaParseResult = { phases: [], calls: [], unparsed: [], unknownTaskFunctions: [] }
    if (!behavior) return result
    const actions: Action[] = []
    const tickPhases: Phase[] = []

    for (const statement of splitTopLevel(behavior, ";")) {
        const text = statement.trim()
        if (!text) continue
        const parsed = parseStatement(text, ctx)
        if (!parsed) {
            result.unparsed.push(text)
            continue
        }
        actions.push(...parsed.actions)
        result.calls.push(...parsed.calls)
        tickPhases.push(...parsed.tickPhases)
        result.unknownTaskFunctions.push(...parsed.unknownFunctions)
    }

    if (actions.length > 0) {
        result.phases.push({ at: 0, actions, source: "lua", origin: "lua:behavior" })
    }
    result.phases.push(...tickPhases)
    result.phases.sort((a, b) => a.at - b.at)
    return result
}

interface StatementResult {
    actions: Action[]
    calls: NativeCall[]
    tickPhases: Phase[]
    unknownFunctions: string[]
}

function parseStatement(text: string, ctx: LuaContext): StatementResult | undefined {
    const result: StatementResult = { actions: [], calls: [], tickPhases: [], unknownFunctions: [] }

    const addBuff = text.match(/^附加增益\((\d+)\)(?:\[(.*)\])?$/)
    if (addBuff) {
        const buffId = Number(addBuff[1])
        const props = addBuff[2]
            ? splitTopLevel(addBuff[2], ",")
                  .map(item => item.trim())
                  .filter(Boolean)
            : []
        const duration = findDuration(props, ctx, buffId)
        result.actions.push({ kind: "applyBuff", buffId, duration, target: { kind: "self" }, origin: `lua:${text}` })
        result.calls.push({ fn: "Lua.附加增益", args: [buffId], known: true, mapped: true, source: "lua" })
        for (const prop of props) {
            const perSecond = prop.match(/^每(\d+(?:\.\d+)?)秒(?:消耗|减少)(\d+)神智$/)
            if (perSecond) {
                result.tickPhases.push({
                    at: 0,
                    tick: { interval: Number(perSecond[1]) },
                    condition: { kind: "hasBuff", buffId },
                    actions: [{ kind: "resource", resource: "神智", delta: -Number(perSecond[2]), source: "lua", origin: `lua:${prop}` }],
                    source: "lua",
                    origin: `lua:${text}`,
                })
                continue
            }
            const tickEffect = prop.match(/^每(\d+(?:\.\d+)?)秒执行技能效果\((\d+)\)$/)
            if (tickEffect) {
                const mapped = mapEffectById(Number(tickEffect[2]), ctx)
                result.calls.push(...mapped.calls)
                result.unknownFunctions.push(...mapped.unknownFunctions)
                if (mapped.actions.length > 0) {
                    result.tickPhases.push({
                        at: 0,
                        tick: { interval: Number(tickEffect[1]) },
                        condition: { kind: "hasBuff", buffId },
                        actions: mapped.actions,
                        source: "lua",
                        origin: `lua:${prop}`,
                    })
                }
                continue
            }
            if (/^(激活技能|霸体|召唤武器|禁用\[.*\]|防抓取|重击.*|移动速度.*|滑移速度.*|跳跃速度.*|螺旋飞跃速度.*)$/.test(prop)) {
                result.calls.push({ fn: "Lua.BuffProp", args: [buffId, prop], known: true, mapped: false, source: "lua" })
                continue
            }
            result.calls.push({ fn: "Lua.BuffProp", args: [buffId, prop], known: true, mapped: false, source: "lua" })
        }
        return result
    }

    const removeBuff = text.match(/^移除增益\((\d+)\)(?:\[.*\])?$/)
    if (removeBuff) {
        result.actions.push({ kind: "removeBuff", buffId: Number(removeBuff[1]), target: { kind: "self" }, origin: `lua:${text}` })
        result.calls.push({ fn: "Lua.移除增益", args: [Number(removeBuff[1])], known: true, mapped: true, source: "lua" })
        return result
    }

    const summon = text.match(/^召唤(?:实体|单位)\((\d+)\)$/)
    if (summon) {
        result.actions.push({ kind: "summon", creatureId: Number(summon[1]), origin: `lua:${text}` })
        result.calls.push({ fn: "Lua.召唤", args: [Number(summon[1])], known: true, mapped: true, source: "lua" })
        return result
    }

    const damage = text.match(/^造成(?:角色|自身)攻击([\d.]+)%的伤害(?:\(([^)]*)\))?$/)
    if (damage) {
        const rate = Number(damage[1]) / 100
        const field = resolveFieldByRate(ctx.fields, rate)
        const tags = damage[2]?.split("/").filter(Boolean) ?? []
        if (field) {
            const fieldTag = ctx.fields.find(item => item.name === field)?.tag?.join(",") ?? tags.join(",")
            result.actions.push({
                kind: "damage",
                field,
                tag: fieldTag,
                hits: { count: 1, interval: 0 },
                target: { kind: "primary" },
                origin: `lua:${text}`,
            })
            result.calls.push({ fn: "Lua.造成伤害", args: [field, rate, tags.join("/")], known: true, mapped: true, source: "lua" })
        } else {
            result.calls.push({ fn: "Lua.造成伤害", args: [rate, tags.join("/")], known: true, mapped: false, source: "lua" })
        }
        return result
    }

    const preserve = text.match(/^(削减(?:战姿|韧性)(?:\d+)?|执行\[.*\]|触发被动功能\[.*\]|移除实体\(\d+\)|造成[^\d]*\d+%的[^\s]*)$/)
    if (preserve) {
        result.calls.push({ fn: `Lua.${text.replace(/[[(].*$/, "")}`, args: [text], known: true, mapped: false, source: "lua" })
        return result
    }

    return undefined
}

/** SkillEffects 条目 → 动作（montage notify / 每 N 秒执行技能效果 共用） */
export function mapEffectList(effects: SkillAssetEffect[], ctx: LuaContext): TaskEffectMapResult {
    const result: TaskEffectMapResult = { actions: [], calls: [], unknownFunctions: [], warnings: [] }
    for (const effect of effects) {
        const filter = targetFromFilter(effect.TargetFilter)
        for (const task of effect.TaskEffects ?? []) {
            const mapped = mapTaskEffect(task, filter.target, ctx)
            result.actions.push(...mapped.actions)
            result.calls.push(...mapped.calls)
            result.unknownFunctions.push(...mapped.unknownFunctions)
            if (filter.unknown && effect.TargetFilter)
                result.warnings.push(`未识别的 TargetFilter "${effect.TargetFilter}"，按 primary 处理`)
        }
    }
    return result
}

function mapEffectById(effectId: number, ctx: LuaContext): TaskEffectMapResult {
    const effects = ctx.effects.filter(effect => effect.TaskId === effectId)
    return mapEffectList(effects, ctx)
}

function mapTaskEffect(task: SkillAssetTaskEffect, target: TargetSpec, ctx: LuaContext): TaskEffectMapResult {
    const result: TaskEffectMapResult = { actions: [], calls: [], unknownFunctions: [], warnings: [] }
    const fn = task.Function
    const record = (known: boolean, mapped: boolean) => result.calls.push({ fn, args: [task], known, mapped, source: "lua" })

    switch (fn) {
        case "AddBuff": {
            if (typeof task.BuffId === "number") {
                const duration = typeof task.LastTime === "number" && task.LastTime > 0 ? task.LastTime : undefined
                result.actions.push({ kind: "applyBuff", buffId: task.BuffId, duration, target, origin: "lua:effect:AddBuff" })
                record(true, true)
            } else {
                record(true, false)
            }
            break
        }
        case "RemoveBuff": {
            if (typeof task.BuffId === "number") {
                result.actions.push({ kind: "removeBuff", buffId: task.BuffId, target, origin: "lua:effect:RemoveBuff" })
                record(true, true)
            } else {
                record(true, false)
            }
            break
        }
        case "Damage": {
            const field = typeof task.Rate === "number" ? resolveFieldByRate(ctx.fields, task.Rate) : undefined
            if (field) {
                const tag = ctx.fields.find(item => item.name === field)?.tag?.join(",") ?? (task.DamageTag ?? []).join(",")
                result.actions.push({ kind: "damage", field, tag, hits: { count: 1, interval: 0 }, target, origin: "lua:effect:Damage" })
                record(true, true)
            } else {
                record(true, false)
                result.warnings.push(`Damage 倍率 ${JSON.stringify(task.Rate)} 无法匹配技能字段`)
            }
            break
        }
        case "SpChange":
        case "ChangeSp": {
            if (typeof task.Value === "number") {
                result.actions.push({ kind: "resource", resource: "神智", delta: task.Value, origin: "lua:effect:SpChange" })
                record(true, true)
            } else {
                record(true, false)
            }
            break
        }
        case "CreateSkillCreature":
        case "CreateUnit":
        case "SummonEntity": {
            const creatureId = literal(task.CreatureId ?? task.UnitId)
            if (typeof creatureId === "number") {
                result.actions.push({ kind: "summon", creatureId, origin: "lua:effect:Summon" })
                record(true, true)
            } else {
                record(true, false)
            }
            break
        }
        default: {
            const known = isKnownNative(fn) || ["CutToughness", "PlayFX", "PlaySound", "PlayNiagara"].includes(fn)
            const mapped = mapNativeCall(fn, [task], { fields: ctx.fields })
            result.actions.push(...mapped.actions)
            record(known || mapped.known, mapped.mapped)
            if (!known && !mapped.known) result.unknownFunctions.push(fn)
            break
        }
    }
    return result
}

function findDuration(props: string[], ctx: LuaContext, buffId: number): number | undefined {
    for (const prop of props) {
        const match = prop.match(/^持续(\d+(?:\.\d+)?)秒$/)
        if (match) return Number(match[1])
    }
    const raw = ctx.buffProps.get(String(buffId))
    const lastTime = raw?.LastTime
    return typeof lastTime === "number" && lastTime > 0 ? lastTime : undefined
}

function targetFromFilter(value: unknown): { target: TargetSpec; unknown: boolean } {
    if (typeof value !== "string") return { target: { kind: "primary" }, unknown: false }
    switch (value) {
        case "Self":
        case "SelfPlayer":
        case "Owner":
            return { target: { kind: "self" }, unknown: false }
        case "Target":
        case "Enemy":
        case "HatredTarget":
            return { target: { kind: "primary" }, unknown: false }
        default:
            return { target: { kind: "primary" }, unknown: true }
    }
}

/** Buff.json DotDatas → 持续效果（当前只建模 SpChange） */
export function deriveBuffDots(props: Record<string, unknown> | undefined): BuffDotBehavior[] | undefined {
    const dots = props?.DotDatas
    if (!Array.isArray(dots)) return undefined
    const result: BuffDotBehavior[] = []
    for (const raw of dots) {
        if (typeof raw !== "object" || raw === null) continue
        const dot = raw as Record<string, unknown>
        if (dot.Type !== "SpChange") continue
        const interval = typeof dot.Interval === "number" && dot.Interval > 0 ? dot.Interval : 1
        const delta = typeof dot.Value === "number" ? dot.Value : undefined
        if (delta === undefined) continue
        result.push({
            delay: typeof dot.DotDelay === "number" ? dot.DotDelay : undefined,
            interval,
            resource: "神智",
            delta,
        })
    }
    return result.length > 0 ? result : undefined
}

/** 按分隔符切分，忽略 `()` / `[]` 内的分隔符 */
export function splitTopLevel(text: string, separator: string): string[] {
    const parts: string[] = []
    let depth = 0
    let current = ""
    for (const char of text) {
        if (char === "(" || char === "[") depth++
        else if (char === ")" || char === "]") depth = Math.max(0, depth - 1)
        if (char === separator && depth === 0) {
            parts.push(current)
            current = ""
        } else {
            current += char
        }
    }
    if (current.length > 0) parts.push(current)
    return parts
}
