/**
 * IR 条件 / 分支谓词求值（在动作执行时刻调用）。
 *
 * `Condition` 与 `branch.on` 都是**施法者（self）**口径：IR 没有 target 字段，
 * 所以 `hasBuff` 查施法者自身的 buff，`resourceAtLeast` 查施法者资源池。
 * 无法解释的条件返回 `{ ok: false }`，调用方必须跳过而不是假设成立。
 */

import { TIME_EPS } from "../core/clock"
import type { Rng } from "../core/rng"
import type { ActorState, TargetState } from "../core/types"
import type { Condition } from "../schema/ir"

export interface ConditionContext {
    actor: ActorState
    targets: readonly TargetState[]
    rng: Rng
}

export type Evaluation = { ok: true; value: boolean } | { ok: false; ref: string }

const TRUE: Evaluation = { ok: true, value: true }

export function aliveTargets(ctx: ConditionContext): TargetState[] {
    return ctx.targets.filter(target => target.alive)
}

export function evaluateCondition(condition: Condition | undefined, ctx: ConditionContext): Evaluation {
    if (!condition) return TRUE
    switch (condition.kind) {
        case "hasBuff":
            return { ok: true, value: ctx.actor.buffs.some(buff => buff.buffId === condition.buffId) }
        case "resourceAtLeast": {
            const pool = ctx.actor.resources[condition.resource]
            return { ok: true, value: (pool?.current ?? 0) + TIME_EPS >= condition.value }
        }
        case "targetCountAtLeast":
            return { ok: true, value: aliveTargets(ctx).length >= condition.value }
        case "opaque":
            return { ok: false, ref: condition.ref }
        default:
            return { ok: false, ref: `condition:${String((condition as { kind?: unknown }).kind)}` }
    }
}

/**
 * `branch.on` 谓词登记表（IR README 的已知键 + 运行时的显式扩展）：
 * - `random` / `random:<p>`：seeded RNG 掷骰（缺省 0.5）
 * - `hasBuff:<buffId>`
 * - `resourceAtLeast:<resource>:<n>`（资源名可含 `:`，只把最后一段当数字）
 * - `targetCountAtLeast:<n>`：全场存活敌人数
 */
export function evaluateBranch(on: string, ctx: ConditionContext): Evaluation {
    if (on === "random") return { ok: true, value: ctx.rng.chance(0.5) }
    if (on.startsWith("random:")) {
        const raw = on.slice("random:".length).trim()
        const probability = raw.length === 0 ? Number.NaN : Number(raw)
        if (!Number.isFinite(probability) || probability < 0 || probability > 1) return { ok: false, ref: on }
        return { ok: true, value: ctx.rng.chance(probability) }
    }
    if (on.startsWith("hasBuff:")) {
        const raw = on.slice("hasBuff:".length)
        if (raw.length === 0) return { ok: false, ref: on }
        const buffId = parseBuffId(raw)
        return { ok: true, value: ctx.actor.buffs.some(buff => buff.buffId === buffId) }
    }
    if (on.startsWith("resourceAtLeast:")) {
        const rest = on.slice("resourceAtLeast:".length)
        const split = rest.lastIndexOf(":")
        if (split <= 0) return { ok: false, ref: on }
        const resource = rest.slice(0, split)
        const value = parseNumber(rest.slice(split + 1))
        if (value === undefined) return { ok: false, ref: on }
        const pool = ctx.actor.resources[resource]
        return { ok: true, value: (pool?.current ?? 0) + TIME_EPS >= value }
    }
    if (on.startsWith("targetCountAtLeast:")) {
        const value = parseNumber(on.slice("targetCountAtLeast:".length))
        if (value === undefined) return { ok: false, ref: on }
        return { ok: true, value: aliveTargets(ctx).length >= value }
    }
    return { ok: false, ref: on }
}

function parseNumber(raw: string): number | undefined {
    const trimmed = raw.trim()
    if (trimmed.length === 0) return undefined
    const value = Number(trimmed)
    return Number.isFinite(value) ? value : undefined
}

function parseBuffId(raw: string): number | string {
    return /^-?\d+$/.test(raw) ? Number(raw) : raw
}
