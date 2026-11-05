/**
 * 蓝图 native 调用登记表（显式、可审阅）。
 *
 * 只登记「能翻译成 IR 动作」或「语义已识别但 IR 不建模（削韧 / 特效 / 相机）」的调用；
 * 未登记的一律保留 `{kind:"native"}` 动作并计入 `coverage.nativeCallsUnknown`——
 * 不静默丢弃，也不假装执行。
 */

import type { Action, TargetSpec } from "../schema/ir"
import type { DataSkillField } from "./types"

export interface NativeCallContext {
    fields: DataSkillField[]
    /** 已导出 buff id 集合（用于 target 推断 / 校验提示） */
    buffIds?: Set<string>
}

export interface NativeMappingResult {
    actions: Action[]
    /** 登记表是否认识这个调用 */
    known: boolean
    /** 是否至少产出一条 IR 动作 */
    mapped: boolean
    /** 登记表里的规范名（未知时等于原 fn） */
    canonical: string
}

export interface NativeMapping {
    canonical: string
    aliases: string[]
    /** 语义已识别但 IR 不建模：只保留 native 动作，不算 unknown */
    preserveOnly?: boolean
    map?: (args: unknown[], ctx: NativeCallContext, fn: string) => Action[] | null
}

const REGISTRY: NativeMapping[] = [
    {
        canonical: "AddBuffToTarget",
        aliases: ["AddBuffToTarget", "AddBuff", "ApplyBuff", "AddBuffToSelf", "AddBuffToTargetByClass"],
        map: (args, _ctx, fn) => {
            const buffId = literal(args[0])
            if (typeof buffId !== "number" && typeof buffId !== "string") return []
            const level = typeof literal(args[1]) === "number" ? (literal(args[1]) as number) : undefined
            const duration = typeof literal(args[2]) === "number" ? (literal(args[2]) as number) : undefined
            return [{ kind: "applyBuff", buffId, level, duration, target: targetFromArgs(args, "primary"), origin: `native:${fn}` }]
        },
    },
    {
        canonical: "ApplyDamage",
        aliases: ["ApplyDamage", "AddDamage", "Damage", "ApplyDamageToTarget", "CauseDamage"],
        map: (args, ctx, fn) => {
            const first = literal(args[0])
            const second = literal(args[1])
            const tagValue = Array.isArray(second) ? second.join(",") : typeof second === "string" ? second : ""
            let field: string | undefined
            if (typeof first === "string" && ctx.fields.some(item => item.name === first)) field = first
            if (!field && typeof first === "number") field = resolveFieldByRate(ctx.fields, first)
            if (!field) return []
            return [
                {
                    kind: "damage",
                    field,
                    tag: tagValue,
                    hits: { count: 1, interval: 0 },
                    target: targetFromArgs(args, "primary"),
                    origin: `native:${fn}`,
                },
            ]
        },
    },
    {
        canonical: "SpawnActor",
        aliases: ["SpawnActor", "SpawnSkillCreature", "SpawnCreature", "CreateSkillCreature", "CreateUnit"],
        map: (args, _ctx, fn) => {
            const creatureId = literal(args[0])
            if (typeof creatureId !== "number") return []
            const duration = typeof literal(args[1]) === "number" ? (literal(args[1]) as number) : undefined
            return [{ kind: "summon", creatureId, duration, origin: `native:${fn}` }]
        },
    },
    {
        canonical: "ChangeResource",
        aliases: ["SetSp", "AddSp", "ConsumeSp", "SetResource", "AddResource", "ChangeSp"],
        map: (args, _ctx, fn) => {
            const first = literal(args[0])
            const second = literal(args[1])
            if (typeof first === "number") {
                const sign = fn.toLowerCase().includes("consume") ? -1 : 1
                return [{ kind: "resource", resource: "神智", delta: first * sign, origin: `native:${fn}` }]
            }
            if (typeof first === "string" && typeof second === "number") {
                return [{ kind: "resource", resource: first, delta: second, origin: `native:${fn}` }]
            }
            return []
        },
    },
    preserve("CutToughness", ["CutToughness", "CutStagger", "CutBossToughness", "ReduceToughness"]),
    preserve("PlayFX", ["PlayFX", "PlayNiagara", "SpawnEmitter", "PlayEffect"]),
    preserve("PlaySound", ["PlaySound", "PlaySound2D", "PlayAudio"]),
    preserve("PlayMontage", ["PlayMontage", "PlayAnimMontage", "PlayAnimation"]),
    preserve("CameraShake", ["CameraShake", "PlayCameraShake"]),
    preserve("SetCharacterTag", ["SetCharacterTag", "AddCharacterTag", "RemoveCharacterTag"]),
    preserve("ChangeModel", ["ChangeModel", "SwitchWeapon"]),
    preserve("RemoveEntity", ["RemoveEntity", "RemoveActor", "DestroyActor"]),
    preserve("Execute", ["Execute", "ExecuteClientPassiveFunction", "TriggerPassiveFunction", "TriggerPassive"]),
]

function preserve(canonical: string, aliases: string[]): NativeMapping {
    return { canonical, aliases, preserveOnly: true }
}

const LOOKUP = new Map<string, NativeMapping>()
for (const mapping of REGISTRY) {
    LOOKUP.set(mapping.canonical.toLowerCase(), mapping)
    for (const alias of mapping.aliases) LOOKUP.set(alias.toLowerCase(), mapping)
}

export function findNativeMapping(fn: string): NativeMapping | undefined {
    return LOOKUP.get(fn.replace(/^K2_/, "").toLowerCase())
}

export function isKnownNative(fn: string): boolean {
    return findNativeMapping(fn) !== undefined
}

export function mapNativeCall(fn: string, args: unknown[], ctx: NativeCallContext): NativeMappingResult {
    const mapping = findNativeMapping(fn)
    if (!mapping) {
        return {
            actions: [{ kind: "native", fn, args, origin: `native:${fn}` }],
            known: false,
            mapped: false,
            canonical: fn,
        }
    }
    const mapped = mapping.preserveOnly ? [] : (mapping.map?.(args, ctx, fn) ?? [])
    if (mapped.length === 0) {
        return {
            actions: [{ kind: "native", fn: mapping.canonical, args, origin: `native:${fn}` }],
            known: true,
            mapped: false,
            canonical: mapping.canonical,
        }
    }
    return { actions: mapped, known: true, mapped: true, canonical: mapping.canonical }
}

/** 字节码字面量：`{op:"IntConst", value}` / 裸值 / 目标引用 */
export function literal(value: unknown): unknown {
    if (value === null || value === undefined) return undefined
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value
    if (Array.isArray(value)) return value.map(literal)
    if (typeof value !== "object") return undefined
    const node = value as Record<string, unknown>
    if ("value" in node) return literal(node.value)
    if (node.op === "Self" || node.op === "SelfRef") return "self"
    if (node.op === "None") return undefined
    if (typeof node.IntegerValue === "number") return node.IntegerValue
    if (typeof node.NumberValue === "number") return node.NumberValue
    if (typeof node.StringValue === "string") return node.StringValue
    return undefined
}

function targetFromArgs(args: unknown[], fallback: TargetSpec["kind"]): TargetSpec {
    for (const arg of args) {
        const value = literal(arg)
        if (value === "self" || value === "Self") return { kind: "self" }
        if (value === "primary" || value === "Target") return { kind: "primary" }
    }
    return fallback === "self" ? { kind: "self" } : { kind: "primary" }
}

/** 按倍率匹配技能字段（4.13 ↔ 413%），用于 Lua/bytecode 只给出数值的场景 */
export function resolveFieldByRate(fields: DataSkillField[], rate: number): string | undefined {
    if (!Number.isFinite(rate) || rate === 0) return undefined
    const candidates = rate > 100 ? rate / 100 : rate
    for (const field of fields) {
        if (!field.name.includes("伤害")) continue
        const value = levelTenValue(field.values)
        if (value === undefined) continue
        if (Math.abs(value - candidates) <= Math.max(0.005, Math.abs(value) * 0.001)) return field.name
    }
    return undefined
}

/** 字段第 10 级（CharBuild 默认等级）的值 */
export function levelTenValue(values: number | number[]): number | undefined {
    if (typeof values === "number") return values
    if (!Array.isArray(values) || values.length === 0) return undefined
    return values.length >= 10 ? values[9] : values[values.length - 1]
}
