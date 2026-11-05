/**
 * buff 实例的纯函数操作（不做事件 / 调度，由 Simulation 负责）。
 *
 * 策略语义（显式、可测试）：
 * - `refresh`（默认）：`expiresAt = now + duration`，层数不变；
 * - `stack`：层数相加（受 maxStacks 限制），`expiresAt` 取「更晚者」；
 * - `replace`：移除旧实例，按新实例重建（appliedAt = now）；
 * - `extend`：`expiresAt += duration`，层数不变。
 *
 * `duration` 缺省 = Infinity（永久）。同一实体上按 buffId 唯一，不区分来源。
 */

import type { BuffHolder, BuffInstance, BuffPolicy } from "./types"

export function hasBuff(holder: BuffHolder, buffId: number | string): boolean {
    return holder.buffs.some(buff => buff.buffId === buffId)
}

export function buffStacks(holder: BuffHolder, buffId: number | string): number {
    const found = holder.buffs.find(buff => buff.buffId === buffId)
    return found ? found.stacks : 0
}

export function findBuff(holder: BuffHolder, buffId: number | string): BuffInstance | undefined {
    return holder.buffs.find(buff => buff.buffId === buffId)
}

export interface ApplyBuffParams {
    buffId: number | string
    sourceId: string
    now: number
    instanceId: number
    duration?: number
    stacks?: number
    level?: number
    policy: BuffPolicy
    maxStacks?: number
}

export interface ApplyBuffOutcome {
    instance: BuffInstance
    created: boolean
    replaced: boolean
    /** 被替换 / 叠层前的旧实例快照（用于溯源） */
    previous?: { instanceId: number; stacks: number; expiresAt: number }
}

function makeInstance(params: ApplyBuffParams): BuffInstance {
    const duration = params.duration === undefined ? Number.POSITIVE_INFINITY : Math.max(0, params.duration)
    return {
        instanceId: params.instanceId,
        buffId: params.buffId,
        sourceId: params.sourceId,
        stacks: Math.max(1, params.stacks ?? 1),
        level: params.level,
        appliedAt: params.now,
        expiresAt: params.now + duration,
        duration,
        policy: params.policy,
    }
}

export function applyBuffInstance(holder: BuffHolder, params: ApplyBuffParams): ApplyBuffOutcome {
    const incoming = makeInstance(params)
    const index = holder.buffs.findIndex(buff => buff.buffId === params.buffId)
    if (index < 0) {
        holder.buffs.push(incoming)
        return { instance: incoming, created: true, replaced: false }
    }

    const existing = holder.buffs[index]
    const previous = { instanceId: existing.instanceId, stacks: existing.stacks, expiresAt: existing.expiresAt }

    if (params.policy === "replace") {
        holder.buffs[index] = incoming
        return { instance: incoming, created: false, replaced: true, previous }
    }

    if (params.policy === "stack") {
        const maxStacks = params.maxStacks ?? Number.POSITIVE_INFINITY
        existing.stacks = Math.min(maxStacks, existing.stacks + incoming.stacks)
        existing.expiresAt = Math.max(existing.expiresAt, incoming.expiresAt)
        existing.duration = Math.max(existing.duration, incoming.duration)
        return { instance: existing, created: false, replaced: false, previous }
    }

    if (params.policy === "extend") {
        existing.expiresAt += incoming.duration
        return { instance: existing, created: false, replaced: false, previous }
    }

    // refresh（默认）：只重置持续时间，层数保持
    existing.expiresAt = incoming.expiresAt
    existing.duration = incoming.duration
    return { instance: existing, created: false, replaced: false, previous }
}

export function removeBuffInstance(holder: BuffHolder, buffId: number | string): BuffInstance | undefined {
    const index = holder.buffs.findIndex(buff => buff.buffId === buffId)
    if (index < 0) return undefined
    const [removed] = holder.buffs.splice(index, 1)
    return removed
}
