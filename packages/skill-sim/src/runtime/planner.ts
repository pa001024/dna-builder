/**
 * 相位 → 动作调用（invocation）的纯函数展开：不接触 Simulation，可直接单测。
 *
 * 时间口径（与 IR 契约一致）：
 * - `Phase.at` / `Phase.until` / `CastSpec.time` 都相对**施法开始**；
 * - tick 时刻 = `castAt + phase.at + k * interval`，k = 0,1,…；`until` 为**闭区间**上界；
 * - 无 `count` 也无 `until` 的 tick 相位裁到模拟结束（不无限展开）；
 * - 所有时刻裁到 `[0, duration]`，越界部分不产生调用。
 */

import { TIME_EPS } from "../core/clock"
import type { Action, HitSpec, Phase, SkillBehavior } from "../schema/ir"

/** 单次相位展开的安全上限：超过即视为数据错误（防止 interval 极小导致队列爆炸） */
export const MAX_INVOCATIONS = 10000

export interface Invocation {
    phaseIndex: number
    /** 相位内第几次 tick（非 tick 相位恒为 0） */
    tickIndex: number
    /** 绝对时刻 */
    at: number
}

export interface SkillPlan {
    invocations: Invocation[]
    /** 排程的动作调用数 */
    count: number
    /** 前摇结束 = castAt + cast.time */
    castEndAt: number
    /** 最后一个动作（含多段命中）的绝对时刻 */
    endsAt: number
    /** 被模拟时长裁掉的调用数 */
    clipped: number
    /** 触发展开上限的调用数 */
    truncated: number
}

export function planSkill(skill: SkillBehavior, castAt: number, duration: number): SkillPlan {
    const invocations: Invocation[] = []
    let clipped = 0
    let truncated = 0
    let endsAt = castAt + Math.max(0, skill.cast.time)
    for (let phaseIndex = 0; phaseIndex < skill.phases.length; phaseIndex++) {
        const phase = skill.phases[phaseIndex]
        const expansion = expandPhase(phase, castAt, duration)
        clipped += expansion.clipped
        truncated += expansion.truncated
        for (let tickIndex = 0; tickIndex < expansion.times.length; tickIndex++) {
            const at = expansion.times[tickIndex]
            if (at < -TIME_EPS) continue
            if (invocations.length >= MAX_INVOCATIONS) {
                truncated++
                break
            }
            invocations.push({ phaseIndex, tickIndex, at })
            const end = actionEnd(phase.actions, at)
            if (end > endsAt) endsAt = end
        }
    }
    // 全局按时间升序（同刻按 phase 顺序），调用方按数组顺序串行推进
    invocations.sort((a, b) => a.at - b.at || a.phaseIndex - b.phaseIndex || a.tickIndex - b.tickIndex)
    return { invocations, count: invocations.length, castEndAt: castAt + Math.max(0, skill.cast.time), endsAt, clipped, truncated }
}

export interface PhaseExpansion {
    times: number[]
    clipped: number
    truncated: number
}

export function expandPhase(phase: Phase, castAt: number, duration: number): PhaseExpansion {
    const start = castAt + phase.at
    if (!phase.tick) {
        if (start > duration + TIME_EPS) return { times: [], clipped: 1, truncated: 0 }
        return { times: [start], clipped: 0, truncated: 0 }
    }
    const interval = phase.tick.interval
    if (!Number.isFinite(interval) || interval <= 0) {
        return { times: start <= duration + TIME_EPS ? [start] : [], clipped: start <= duration + TIME_EPS ? 0 : 1, truncated: 0 }
    }
    const until = phase.until === undefined ? undefined : castAt + phase.until
    const limit = until === undefined ? duration : Math.min(until, duration)
    if (start > limit + TIME_EPS) return { times: [], clipped: 1, truncated: 0 }
    let count = phase.tick.count
    if (count === undefined) count = Math.floor((limit - start) / interval + TIME_EPS) + 1
    const times: number[] = []
    let truncated = 0
    for (let k = 0; k < count; k++) {
        if (times.length >= MAX_INVOCATIONS) {
            truncated++
            break
        }
        const t = start + k * interval
        if (t > limit + TIME_EPS) break
        if (t < -TIME_EPS) continue
        times.push(t)
    }
    const clipped = phase.tick.count !== undefined ? Math.max(0, count - times.length) : 0
    return { times, clipped, truncated }
}

/** 多段命中：第 k 段在 `at + k * interval` */
export function hitTimes(hits: HitSpec, at: number): number[] {
    const count = Math.max(0, Math.floor(hits.count))
    const interval = Math.max(0, hits.interval)
    const times: number[] = []
    for (let k = 0; k < count; k++) times.push(at + k * interval)
    return times
}

/** 动作树在 `at` 之后最晚的影响时刻（用于 endsAt / active 窗口） */
export function actionEnd(actions: readonly Action[], at: number): number {
    let end = at
    for (const action of actions) {
        const candidate = actionEndOne(action, at)
        if (candidate > end) end = candidate
    }
    return end
}

function actionEndOne(action: Action, at: number): number {
    switch (action.kind) {
        case "damage": {
            const count = Math.max(0, Math.floor(action.hits.count))
            const interval = Math.max(0, action.hits.interval)
            return at + Math.max(0, count - 1) * interval
        }
        case "branch":
            return Math.max(at, actionEnd(action.then, at), actionEnd(action.else ?? [], at))
        default:
            return at
    }
}
