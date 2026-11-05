import { describe, expect, test } from "bun:test"
import { createRng } from "../../src/core/rng"
import type { TargetingContext, TargetLike } from "../../src/core/targeting"
import { primaryTarget, resolveTargetRef, selectTargets } from "../../src/core/targeting"
import type { ActorState } from "../../src/core/types"

function actor(): ActorState {
    return {
        id: "hero",
        characterId: 4101,
        team: "ally",
        position: { x: 0, y: 0 },
        resources: {},
        cooldowns: {},
        buffs: [],
        alive: true,
    }
}

function target(id: string, x: number, y = 0, buffs: number[] = [], alive = true): TargetLike {
    return { id, position: { x, y }, alive, buffs: buffs.map(buffId => ({ buffId })) }
}

function ctx(targets: TargetLike[], primaryTargetId?: string, stored?: Map<string, string[]>): TargetingContext<TargetLike> {
    return { actor: actor(), targets, primaryTargetId, stored: stored ?? new Map() }
}

describe("resolveTargetRef", () => {
    test("nearest 按距离排序、同距离按 id", () => {
        const context = ctx([target("c", 5), target("b", 2), target("a", 2), target("dead", 0, 0, [], false)])
        expect(resolveTargetRef({ kind: "nearest", count: 3 }, context).map(t => t.id)).toEqual(["a", "b", "c"])
        expect(resolveTargetRef({ kind: "nearest" }, context).map(t => t.id)).toEqual(["a"])
    })

    test("nearest 半径过滤", () => {
        const context = ctx([target("a", 1), target("b", 4)])
        expect(resolveTargetRef({ kind: "nearest", count: 5, radius: 2 }, context)).toHaveLength(1)
    })

    test("primary 优先配置，失效时回退第一个存活", () => {
        const context = ctx([target("a", 1), target("b", 2)], "b")
        expect(primaryTarget(context)?.id).toBe("b")
        const fallback = ctx([target("a", 1), target("b", 2)], "missing")
        expect(primaryTarget(fallback)?.id).toBe("a")
        expect(primaryTarget(ctx([target("dead", 0, 0, [], false)]))).toBeUndefined()
    })

    test("stored 保持存储顺序并过滤死亡", () => {
        const targets = [target("a", 1), target("b", 2), target("c", 3)]
        const stored = new Map([["group", ["c", "a", "b"]]])
        const context = ctx(targets, undefined, stored)
        targets[1].alive = false
        expect(resolveTargetRef({ kind: "stored", ref: "group" }, context).map(t => t.id)).toEqual(["c", "a"])
        expect(resolveTargetRef({ kind: "stored", ref: "missing" }, context)).toEqual([])
    })

    test("id 精确引用且跳过死亡", () => {
        const context = ctx([target("a", 1), target("dead", 0, 0, [], false)])
        expect(resolveTargetRef({ kind: "id", id: "a" }, context).map(t => t.id)).toEqual(["a"])
        expect(resolveTargetRef({ kind: "id", id: "dead" }, context)).toEqual([])
        expect(resolveTargetRef({ kind: "id", id: "missing" }, context)).toEqual([])
    })
})

describe("selectTargets", () => {
    test("all 返回全部存活按距离排序", () => {
        const context = ctx([target("c", 3), target("a", 1), target("dead", 0, 0, [], false)])
        expect(selectTargets({ kind: "all" }, context, createRng(1)).map(t => t.id)).toEqual(["a", "c"])
    })

    test("random 同 seed 可复现，且 count 生效", () => {
        const context = ctx([target("a", 1), target("b", 2), target("c", 3), target("d", 4)])
        const first = selectTargets({ kind: "random", count: 2 }, context, createRng(42)).map(t => t.id)
        const second = selectTargets({ kind: "random", count: 2 }, context, createRng(42)).map(t => t.id)
        expect(first).toEqual(second)
        expect(first).toHaveLength(2)
        expect(new Set(first).size).toBe(2)
    })

    test("random 的 buff 前置过滤在洗牌前生效", () => {
        const context = ctx([target("a", 1, 0, [7]), target("b", 2), target("c", 3, 0, [7, 8])])
        const picked = selectTargets({ kind: "random", count: 2, requiresBuff: 7, excludesBuff: 8 }, context, createRng(5))
        expect(picked.map(t => t.id)).toEqual(["a"])
    })

    test("countOverride 覆盖 filter.count", () => {
        const context = ctx([target("a", 1), target("b", 2), target("c", 3)])
        expect(selectTargets({ kind: "nearest", count: 1 }, context, createRng(1), 3)).toHaveLength(3)
    })
})
