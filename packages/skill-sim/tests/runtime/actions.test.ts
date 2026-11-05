import { describe, expect, test } from "bun:test"
import type { Action, BuffBehavior, Phase } from "../../src/schema/ir"
import { doc, harness, skill } from "./helpers"

function run(
    phases: Phase[],
    options: { buffs?: Record<string, BuffBehavior>; duration?: number; recastPolicy?: "fail" | "toggle-off" } = {}
) {
    const context = harness({
        doc: doc([skill(1, phases)], options.buffs),
        config: { duration: options.duration ?? 10 },
        runtime: { recastPolicy: options.recastPolicy },
    })
    const cast = context.runtime.cast(1, 0)
    const result = context.runtime.run()
    return { ...context, cast, result }
}

const damageTo = (target: Action extends never ? never : Extract<Action, { kind: "damage" }>["target"], field = "伤害"): Action => ({
    kind: "damage",
    field,
    tag: "技能",
    hits: { count: 1, interval: 0 },
    target,
})

describe("动作 — damage", () => {
    test("hits.count / interval 展开为多次伤害", () => {
        const { result } = run([
            {
                at: 1,
                actions: [{ kind: "damage", field: "伤害", tag: "技能", hits: { count: 3, interval: 0.25 }, target: { kind: "primary" } }],
            },
        ])
        const hits = result.events.filter(event => event.kind === "damage")
        expect(hits.map(event => event.at)).toEqual([1, 1.25, 1.5])
        expect(hits.map(event => event.tag)).toEqual(["技能", "技能", "技能"])
    })

    test("hits.tag 覆盖 action.tag", () => {
        const { result } = run([
            {
                at: 0,
                actions: [
                    {
                        kind: "damage",
                        field: "伤害",
                        tag: "外层",
                        hits: { count: 1, interval: 0, tag: "内层" },
                        target: { kind: "primary" },
                    },
                ],
            },
        ])
        expect(result.events.find(event => event.kind === "damage")).toMatchObject({ tag: "内层" })
    })

    test("self 目标：unsupported 诊断，不产生伤害", () => {
        const { result, runtime } = run([{ at: 0, actions: [damageTo({ kind: "self" })] }])
        expect(result.events.filter(event => event.kind === "damage")).toHaveLength(0)
        expect(runtime.diagnostics().find(item => item.kind === "unsupported")).toMatchObject({ feature: "damage-self-target" })
    })

    test("nearest 目标解析（半径过滤）", () => {
        const context = harness({
            doc: doc([skill(1, [{ at: 0, actions: [damageTo({ kind: "nearest", count: 2, radius: 5 })] }])]),
        })
        context.runtime.cast(1, 0)
        const result = context.runtime.run()
        expect(result.events.filter(event => event.kind === "damage").map(event => event.targetId)).toEqual(["e1", "e2"])
    })

    test("多段命中超出模拟时长：裁剪并诊断", () => {
        const { result, runtime } = run(
            [
                {
                    at: 9.9,
                    actions: [{ kind: "damage", field: "伤害", tag: "", hits: { count: 3, interval: 1 }, target: { kind: "primary" } }],
                },
            ],
            { duration: 10 }
        )
        expect(result.events.filter(event => event.kind === "damage")).toHaveLength(1)
        expect(runtime.diagnostics().some(item => item.kind === "phase-clipped")).toBe(true)
    })
})

describe("动作 — buff / resource / select", () => {
    test("applyBuff self：走 core，duration 缺省取 doc.buffs.duration", () => {
        const { result } = run([{ at: 0, actions: [{ kind: "applyBuff", buffId: 900, target: { kind: "self" } }] }], {
            buffs: { "900": { id: 900, duration: 4, sources: ["lua"] } },
        })
        const applied = result.events.find(event => event.kind === "buff-apply")
        expect(applied).toMatchObject({ entityKind: "actor", buffId: 900, duration: 4, expiresAt: 4 })
    })

    test("applyBuff stored + removeBuff stored", () => {
        const { result } = run([
            {
                at: 0,
                actions: [
                    { kind: "select", filter: { kind: "nearest", count: 1 }, store: "pick" },
                    { kind: "applyBuff", buffId: "mark", duration: 5, target: { kind: "stored", ref: "pick" } },
                ],
            },
            { at: 2, actions: [{ kind: "removeBuff", buffId: "mark", target: { kind: "stored", ref: "pick" } }] },
        ])
        const apply = result.events.find(event => event.kind === "buff-apply")
        expect(apply).toMatchObject({ entityKind: "target", entityId: "e1", buffId: "mark", duration: 5 })
        const expire = result.events.find(event => event.kind === "buff-expire")
        expect(expire).toMatchObject({ entityId: "e1", buffId: "mark", reason: "removed", at: 2 })
    })

    test("多目标 nearest 的 applyBuff：只作用最近 1 个并诊断", () => {
        const { result, runtime } = run([
            { at: 0, actions: [{ kind: "applyBuff", buffId: 1, duration: 1, target: { kind: "nearest", count: 2, radius: 10 } }] },
        ])
        expect(result.events.filter(event => event.kind === "buff-apply")).toHaveLength(1)
        expect(runtime.diagnostics().find(item => item.kind === "unsupported")).toMatchObject({ feature: "multi-target-buff" })
    })

    test("resource 动作按 core 的 clamp 语义", () => {
        const { result } = run([{ at: 0, actions: [{ kind: "resource", resource: "神智", delta: -1000 }] }])
        expect(result.events.find(event => event.kind === "resource")).toMatchObject({
            requested: -1000,
            delta: -240,
            before: 240,
            after: 0,
        })
    })

    test("select → stored → damage 链路", () => {
        const { result } = run([
            {
                at: 1,
                actions: [
                    { kind: "select", filter: { kind: "random", count: 1, radius: 50 }, store: "pick" },
                    damageTo({ kind: "stored", ref: "pick" }, "命中"),
                ],
            },
        ])
        const select = result.events.find(event => event.kind === "target-select")
        const hit = result.events.find(event => event.kind === "damage")
        expect(select).toMatchObject({ store: "pick", filter: "random" })
        if (select?.kind !== "target-select") throw new Error("missing select")
        expect(hit).toMatchObject({ targetId: select.targetIds[0], skillField: "命中" })
    })

    test("未执行的 select（stored 为空）：伤害静默无事件", () => {
        const { result } = run([{ at: 0, actions: [damageTo({ kind: "stored", ref: "neverSelected" })] }])
        expect(result.events.filter(event => event.kind === "damage")).toHaveLength(0)
    })
})

describe("动作 — branch / 条件", () => {
    test("分支谓词在动作执行时刻求值（前面动作的 buff 可见）", () => {
        const { result } = run([
            {
                at: 0,
                actions: [
                    { kind: "applyBuff", buffId: "stance", duration: 10, target: { kind: "self" } },
                    {
                        kind: "branch",
                        on: "hasBuff:stance",
                        // biome-ignore lint/suspicious/noThenProperty: IR 的 branch 动作字段名为 then
                        then: [{ kind: "resource", resource: "神智", delta: -10 }],
                        else: [{ kind: "resource", resource: "神智", delta: 10 }],
                    },
                ],
            },
        ])
        const resources = result.events.filter(event => event.kind === "resource")
        expect(resources).toHaveLength(1)
        expect(resources[0]).toMatchObject({ resource: "神智", delta: -10 })
    })

    test("嵌套分支与 else 缺省", () => {
        const { result } = run([
            {
                at: 0,
                actions: [
                    {
                        kind: "branch",
                        on: "targetCountAtLeast:1",
                        // biome-ignore lint/suspicious/noThenProperty: IR 的 branch 动作字段名为 then
                        then: [
                            {
                                kind: "branch",
                                on: "random:1",
                                // biome-ignore lint/suspicious/noThenProperty: IR 的 branch 动作字段名为 then
                                then: [{ kind: "resource", resource: "神智", delta: -5 }],
                            },
                        ],
                    },
                ],
            },
        ])
        expect(result.events.filter(event => event.kind === "resource")).toHaveLength(1)
    })

    test("未知谓词：then / else 都不执行 + opaque-condition", () => {
        const { result, runtime } = run([
            {
                at: 0,
                actions: [
                    {
                        kind: "branch",
                        on: "bp:branch_12",
                        // biome-ignore lint/suspicious/noThenProperty: IR 的 branch 动作字段名为 then
                        then: [{ kind: "resource", resource: "神智", delta: -10 }],
                        else: [{ kind: "resource", resource: "神智", delta: 10 }],
                    },
                ],
            },
        ])
        expect(result.events.filter(event => event.kind === "resource")).toHaveLength(0)
        expect(runtime.diagnostics().find(item => item.kind === "opaque-condition")).toMatchObject({
            where: "branch",
            ref: "bp:branch_12",
        })
    })

    test("相位条件 opaque：跳过整次调用 + 诊断", () => {
        const { result, runtime } = run([
            {
                at: 0,
                until: 3,
                tick: { interval: 1 },
                condition: { kind: "opaque", ref: "bp:cond" },
                actions: [{ kind: "resource", resource: "神智", delta: -1 }],
            },
        ])
        expect(result.events.filter(event => event.kind === "resource")).toHaveLength(0)
        expect(runtime.diagnostics().find(item => item.kind === "opaque-condition")).toMatchObject({ where: "phase", occurrences: 4 })
    })

    test("相位条件 hasBuff：buff 到期后停止调用", () => {
        const { result } = run(
            [
                { at: 0, actions: [{ kind: "applyBuff", buffId: "s", duration: 2.5, target: { kind: "self" } }] },
                {
                    at: 1,
                    until: 6,
                    tick: { interval: 1 },
                    condition: { kind: "hasBuff", buffId: "s" },
                    actions: [{ kind: "resource", resource: "神智", delta: -1 }],
                },
            ],
            { duration: 8 }
        )
        // s 在 0s 施加、2.5s 到期：条件只在 1s / 2s 成立
        expect(result.events.filter(event => event.kind === "resource").map(event => event.at)).toEqual([1, 2])
    })
})

describe("动作 — native / summon", () => {
    test("native 只记诊断（known/mapped 来自 provenance），不产生效果", () => {
        const behavior = skill(1, [
            { at: 0, actions: [{ kind: "native", fn: "K2_PlayUnknownEffect", args: [1, "x"] }] },
            { at: 1, actions: [{ kind: "native", fn: "CutToughness", args: [90] }] },
        ])
        behavior.provenance = {
            bpPackages: [],
            unmatchedNotify: [],
            nativeCalls: [
                { fn: "K2_PlayUnknownEffect", args: [1, "x"], known: false, mapped: false, source: "blueprint" },
                { fn: "CutToughness", args: [90], known: true, mapped: false, source: "lua" },
            ],
        }
        const context = harness({ doc: doc([behavior]) })
        context.runtime.cast(1, 0)
        const result = context.runtime.run()
        expect(result.events.filter(event => event.kind !== "cast")).toHaveLength(0)
        const natives = context.runtime.diagnostics().filter(item => item.kind === "native")
        expect(natives.map(item => item.kind === "native" && [item.fn, item.known, item.mapped, item.occurrences])).toEqual([
            ["K2_PlayUnknownEffect", false, false, 1],
            ["CutToughness", true, false, 1],
        ])
        expect(natives[0]).toMatchObject({ severity: "warn" })
        expect(natives[1]).toMatchObject({ severity: "info" })
    })

    test("召唤：spawn 占位实体 + 到期 despawn + 诊断", () => {
        const { result, runtime } = run([{ at: 1, actions: [{ kind: "summon", creatureId: 410101, duration: 2 }] }])
        const spawn = result.events.find(event => event.kind === "spawn")
        const despawn = result.events.find(event => event.kind === "despawn")
        expect(spawn).toMatchObject({ at: 1 })
        expect(despawn).toMatchObject({ at: 3, reason: "summon-expired" })
        if (spawn?.kind !== "spawn" || despawn?.kind !== "despawn") throw new Error("missing summon events")
        expect(despawn.targetId).toBe(spawn.targetId)
        expect(runtime.diagnostics().find(item => item.kind === "summon")).toMatchObject({ creatureId: 410101, placeholder: true })
    })

    test("召唤 duration 超时长：只 spawn 不 despawn", () => {
        const { result } = run([{ at: 9, actions: [{ kind: "summon", creatureId: 1, duration: 5 }] }], { duration: 10 })
        expect(result.events.filter(event => event.kind === "spawn")).toHaveLength(1)
        expect(result.events.filter(event => event.kind === "despawn")).toHaveLength(0)
    })
})

describe("active() — 激活窗口", () => {
    test("前摇 / 结束时间 / 取消诊断字段", () => {
        const behavior = skill(
            1,
            [{ at: 1, until: 3, tick: { interval: 1 }, actions: [{ kind: "resource", resource: "神智", delta: -1 }] }],
            {
                cast: { time: 0.5, cooldown: 0, costs: [], canMove: true },
            }
        )
        behavior.provenance = {
            bpPackages: [],
            unmatchedNotify: [],
            nativeCalls: [],
            inertNotifies: ["BP_SkillCancel_C", "BP_NextCombo_C"],
        }
        const context = harness({ doc: doc([behavior]) })
        context.runtime.cast(1, 0)
        const active = context.runtime.active()
        expect(active).toHaveLength(1)
        expect(active[0]).toMatchObject({ skillId: 1, castAt: 0, castEndAt: 0.5, endsAt: 3, canMove: true, cancelable: true, combo: true })
        expect(active[0].windows).toEqual([{ kind: "move", begin: 0.5, end: 3 }])
        context.simulation.run()
        expect(context.runtime.active()).toEqual([])
    })
})
