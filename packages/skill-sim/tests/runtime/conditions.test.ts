import { describe, expect, test } from "bun:test"
import { createRng } from "../../src/core/rng"
import type { ActorState, TargetState } from "../../src/core/types"
import { type ConditionContext, evaluateBranch, evaluateCondition } from "../../src/runtime/conditions"

function actor(overrides: Partial<ActorState> = {}): ActorState {
    return {
        id: "lise",
        characterId: 4101,
        team: "ally",
        position: { x: 0, y: 0 },
        resources: { 神智: { current: 50, max: 100 } },
        cooldowns: {},
        buffs: [],
        alive: true,
        ...overrides,
    }
}

function target(id: string, alive = true): TargetState {
    return {
        id,
        level: 1,
        hp: alive ? 100 : 0,
        maxHp: 100,
        shield: 0,
        def: 0,
        resist: 0,
        position: { x: 1, y: 0 },
        buffs: [],
        alive,
    }
}

function ctx(overrides: Partial<ConditionContext> = {}): ConditionContext {
    return { actor: actor(), targets: [target("e1"), target("e2")], rng: createRng(1), ...overrides }
}

const buffedActor = actor({
    buffs: [{ instanceId: 1, buffId: 410111, sourceId: "lise", stacks: 1, appliedAt: 0, expiresAt: 10, duration: 10, policy: "refresh" }],
})

describe("evaluateCondition — 相位条件", () => {
    test("缺省条件恒真", () => {
        expect(evaluateCondition(undefined, ctx())).toEqual({ ok: true, value: true })
    })

    test("hasBuff 查施法者自身", () => {
        expect(evaluateCondition({ kind: "hasBuff", buffId: 410111 }, ctx({ actor: buffedActor }))).toEqual({ ok: true, value: true })
        expect(evaluateCondition({ kind: "hasBuff", buffId: 410111 }, ctx())).toEqual({ ok: true, value: false })
        expect(evaluateCondition({ kind: "hasBuff", buffId: "named" }, ctx({ actor: buffedActor }))).toEqual({ ok: true, value: false })
    })

    test("resourceAtLeast：缺资源池按 0 计", () => {
        expect(evaluateCondition({ kind: "resourceAtLeast", resource: "神智", value: 50 }, ctx())).toEqual({ ok: true, value: true })
        expect(evaluateCondition({ kind: "resourceAtLeast", resource: "神智", value: 51 }, ctx())).toEqual({ ok: true, value: false })
        expect(evaluateCondition({ kind: "resourceAtLeast", resource: "电能", value: 1 }, ctx())).toEqual({ ok: true, value: false })
    })

    test("targetCountAtLeast 只数存活目标", () => {
        const mixed = ctx({ targets: [target("e1"), target("e2", false)] })
        expect(evaluateCondition({ kind: "targetCountAtLeast", value: 1 }, mixed)).toEqual({ ok: true, value: true })
        expect(evaluateCondition({ kind: "targetCountAtLeast", value: 2 }, mixed)).toEqual({ ok: true, value: false })
    })

    test("opaque 不假装成立", () => {
        expect(evaluateCondition({ kind: "opaque", ref: "bp:cond_7" }, ctx())).toEqual({ ok: false, ref: "bp:cond_7" })
    })
})

describe("evaluateBranch — branch.on 谓词", () => {
    test("random 走注入 RNG 且 0/1 边界确定", () => {
        const results = new Set<string>()
        const rng = createRng(9)
        const context = ctx({ rng })
        for (let i = 0; i < 40; i++) {
            const evaluation = evaluateBranch("random", context)
            expect(evaluation.ok).toBe(true)
            if (evaluation.ok) results.add(String(evaluation.value))
        }
        expect(results).toEqual(new Set(["true", "false"]))
        expect(evaluateBranch("random:0", context)).toEqual({ ok: true, value: false })
        expect(evaluateBranch("random:1", context)).toEqual({ ok: true, value: true })
    })

    test("random 同 seed 复现", () => {
        const run = () => {
            const context = ctx({ rng: createRng(42) })
            return Array.from({ length: 20 }, () => {
                const evaluation = evaluateBranch("random", context)
                return evaluation.ok ? evaluation.value : null
            })
        }
        expect(run()).toEqual(run())
    })

    test("hasBuff:<id> 支持数字与字符串 id", () => {
        const context = ctx({
            actor: actor({
                buffs: [
                    {
                        instanceId: 1,
                        buffId: "stance",
                        sourceId: "lise",
                        stacks: 1,
                        appliedAt: 0,
                        expiresAt: 5,
                        duration: 5,
                        policy: "refresh",
                    },
                ],
            }),
        })
        expect(evaluateBranch("hasBuff:stance", context)).toEqual({ ok: true, value: true })
        expect(evaluateBranch("hasBuff:410111", context)).toEqual({ ok: true, value: false })
        expect(evaluateBranch("hasBuff:", context).ok).toBe(false)
    })

    test("resourceAtLeast 冒号切分：资源名含冒号也取最后一段为数值", () => {
        const context = ctx({
            actor: actor({ resources: { "神智:x": { current: 5, max: 10 } } }),
        })
        expect(evaluateBranch("resourceAtLeast:神智:x:5", context)).toEqual({ ok: true, value: true })
        expect(evaluateBranch("resourceAtLeast:神智:x:6", context)).toEqual({ ok: true, value: false })
        expect(evaluateBranch("resourceAtLeast:神智:x:abc", context).ok).toBe(false)
    })

    test("targetCountAtLeast", () => {
        expect(evaluateBranch("targetCountAtLeast:2", ctx())).toEqual({ ok: true, value: true })
        expect(evaluateBranch("targetCountAtLeast:3", ctx())).toEqual({ ok: true, value: false })
    })

    test("未知 / 非法谓词 → ok:false（不得默认走 then）", () => {
        for (const key of ["", "bp:branch_1", "random:1.5", "random:", "resourcesAtLeast:神智:1", "hasBuff"]) {
            expect({ key, ...evaluateBranch(key, ctx()) }).toMatchObject({ key, ok: false })
        }
    })
})
