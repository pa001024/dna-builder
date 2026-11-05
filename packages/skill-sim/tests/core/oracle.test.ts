import { describe, expect, test } from "bun:test"
import { applyBuffInstance } from "../../src/core/buffs"
import type { DamageRequest } from "../../src/core/oracle"
import {
    CharBuildDamageOracle,
    createDamageOracle,
    MissingDamageOracle,
    snapshotActor,
    snapshotTarget,
    targetSnapshotKey,
} from "../../src/core/oracle"
import type { ActorState, TargetState } from "../../src/core/types"

function actor(): ActorState {
    return {
        id: "hero",
        characterId: 4101,
        team: "ally",
        position: { x: 0, y: 0 },
        resources: { 神智: { current: 80, max: 100 } },
        cooldowns: {},
        buffs: [],
        alive: true,
        meta: { build: "ctx" },
    }
}

function target(): TargetState {
    return {
        id: "e1",
        level: 40,
        hp: 900,
        maxHp: 1000,
        shield: 20,
        def: 100,
        resist: 0.1,
        position: { x: 1, y: 0 },
        buffs: [],
        alive: true,
    }
}

function request(overrides: Partial<DamageRequest> = {}): DamageRequest {
    const a = actor()
    const t = target()
    return { skillField: "伤害", tag: "技能", actor: snapshotActor(a, 0.5), target: snapshotTarget(t, 0.5), at: 0.5, ...overrides }
}

describe("快照", () => {
    test("actor / target 快照是只读副本", () => {
        const a = actor()
        const t = target()
        const aSnapshot = snapshotActor(a, 1)
        const tSnapshot = snapshotTarget(t, 1)
        expect(Object.isFrozen(aSnapshot)).toBe(true)
        expect(Object.isFrozen(tSnapshot)).toBe(true)
        expect(aSnapshot.resources.神智).toEqual({ current: 80, max: 100 })
        expect(aSnapshot.meta).toBe(a.meta)
        a.resources.神智.current = 1
        t.hp = 1
        expect(aSnapshot.resources.神智.current).toBe(80)
        expect(tSnapshot.hp).toBe(900)
    })

    test("targetSnapshotKey 随 buff / hp 变化", () => {
        const t = target()
        const first = targetSnapshotKey(snapshotTarget(t, 0))
        applyBuffInstance(t, { buffId: 7, sourceId: "hero", now: 0, instanceId: 1, duration: 1, policy: "refresh" })
        const second = targetSnapshotKey(snapshotTarget(t, 0))
        expect(second).not.toBe(first)
        t.hp = 800
        expect(targetSnapshotKey(snapshotTarget(t, 0))).not.toBe(second)
    })
})

describe("CharBuildDamageOracle", () => {
    test("委托注入函数并缓存同一键", () => {
        let calls = 0
        const oracle = createDamageOracle(_req => {
            calls++
            return { damage: 100, kind: "crit" }
        })
        const req = request()
        expect(oracle.apply(req)).toEqual({ damage: 100, kind: "crit" })
        expect(oracle.apply(req)).toEqual({ damage: 100, kind: "crit" })
        expect(calls).toBe(1)
        expect(oracle.cacheHits).toBe(1)
        expect(oracle.cacheMisses).toBe(1)
        expect(oracle.apply({ ...req, at: 0.6 })).toEqual({ damage: 100, kind: "crit" })
        expect(calls).toBe(2)
    })

    test("数字返回值归一为 normal", () => {
        const oracle = createDamageOracle(() => 42)
        expect(oracle.apply(request())).toEqual({ damage: 42, kind: "normal" })
    })

    test("负伤害归零、非有限值报错", () => {
        expect(createDamageOracle(() => -5).apply(request()).damage).toBe(0)
        expect(() => createDamageOracle(() => Number.NaN).apply(request())).toThrow()
        expect(() => createDamageOracle(() => ({ damage: Number.POSITIVE_INFINITY, kind: "x" })).apply(request())).toThrow()
    })

    test("cacheSize = 0 关闭缓存", () => {
        let calls = 0
        const oracle = createDamageOracle(
            () => {
                calls++
                return 1
            },
            { cacheSize: 0 }
        )
        const req = request()
        oracle.apply(req)
        oracle.apply(req)
        expect(calls).toBe(2)
        expect(oracle.cacheHits).toBe(0)
    })

    test("接受 CharBuildLike 对象", () => {
        const oracle = new CharBuildDamageOracle({ calculateDamage: () => ({ damage: 7, kind: "skill" }) })
        expect(oracle.apply(request())).toEqual({ damage: 7, kind: "skill" })
    })

    test("MissingDamageOracle 明确报错", () => {
        expect(() => new MissingDamageOracle().apply(request())).toThrow(/damage 命令需要 amount/)
    })
})
