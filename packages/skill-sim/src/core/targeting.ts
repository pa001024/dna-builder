/**
 * 目标选择：把 `TargetRef` / `TargetFilter` 解析成当前存活的 target 列表。
 *
 * 所有排序都是显式的（距离 → id 字典序），不依赖 Map/Object 遍历顺序；
 * `random` 过滤器走注入的 `Rng`，保证同 seed 复现。
 */

import type { TargetFilter } from "../schema/ir"
import type { Rng } from "./rng"
import type { ActorState, TargetRef, Vec2 } from "./types"

export interface TargetLike {
    id: string
    position: Vec2
    alive: boolean
    buffs: { buffId: number | string }[]
}

export interface TargetingContext<T extends TargetLike = TargetLike> {
    actor: ActorState
    /** 按加入顺序排列的 target 列表（含已死亡，解析时过滤） */
    targets: readonly T[]
    primaryTargetId?: string
    stored: ReadonlyMap<string, readonly string[]>
}

export function distance(a: Vec2, b: Vec2): number {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy)
}

function compareIds(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0
}

/** 按距离升序、同距离按 id 字典序；保证确定性 */
export function sortByDistance<T extends { id: string; position: Vec2 }>(origin: Vec2, items: readonly T[]): T[] {
    return items
        .map(item => ({ item, d: distance(origin, item.position) }))
        .sort((a, b) => (a.d !== b.d ? a.d - b.d : compareIds(a.item.id, b.item.id)))
        .map(entry => entry.item)
}

function nearestTargets<T extends TargetLike>(ctx: TargetingContext<T>, count: number, radius: number): T[] {
    const candidates = ctx.targets.filter(target => target.alive && distance(ctx.actor.position, target.position) <= radius)
    return sortByDistance(ctx.actor.position, candidates).slice(0, Math.max(0, count))
}

export function primaryTarget<T extends TargetLike>(ctx: TargetingContext<T>): T | undefined {
    const alive = ctx.targets.filter(target => target.alive)
    if (alive.length === 0) return undefined
    if (ctx.primaryTargetId) {
        const found = alive.find(target => target.id === ctx.primaryTargetId)
        if (found) return found
    }
    return alive[0]
}

export function resolveTargetRef<T extends TargetLike>(ref: TargetRef, ctx: TargetingContext<T>): T[] {
    switch (ref.kind) {
        case "primary": {
            const target = primaryTarget(ctx)
            return target ? [target] : []
        }
        case "stored": {
            const ids = ctx.stored.get(ref.ref) ?? []
            const byId = new Map(ctx.targets.map(target => [target.id, target]))
            return ids.map(id => byId.get(id)).filter((target): target is T => !!target?.alive)
        }
        case "nearest":
            return nearestTargets(ctx, ref.count ?? 1, ref.radius ?? Number.POSITIVE_INFINITY)
        case "id": {
            const found = ctx.targets.find(target => target.id === ref.id)
            return found?.alive ? [found] : []
        }
    }
}

export function selectTargets<T extends TargetLike>(filter: TargetFilter, ctx: TargetingContext<T>, rng: Rng, countOverride?: number): T[] {
    if (filter.kind === "primary") {
        const target = primaryTarget(ctx)
        return target ? [target] : []
    }

    const radius = filter.radius ?? Number.POSITIVE_INFINITY
    const filterCount = "count" in filter ? filter.count : undefined
    const count = countOverride ?? filterCount ?? 1
    let candidates = ctx.targets.filter(target => target.alive && distance(ctx.actor.position, target.position) <= radius)

    if (filter.kind === "random") {
        if (filter.requiresBuff !== undefined) {
            candidates = candidates.filter(target => target.buffs.some(buff => buff.buffId === filter.requiresBuff))
        }
        if (filter.excludesBuff !== undefined) {
            candidates = candidates.filter(target => !target.buffs.some(buff => buff.buffId === filter.excludesBuff))
        }
        // 先按 id 固定基线再洗牌，避免依赖插入顺序以外的不确定结构
        const baseline = candidates.slice().sort((a, b) => compareIds(a.id, b.id))
        return rng.shuffle(baseline).slice(0, Math.max(0, count))
    }

    if (filter.kind === "all") {
        return sortByDistance(ctx.actor.position, candidates)
    }

    return nearestTargets(ctx, count, radius)
}
