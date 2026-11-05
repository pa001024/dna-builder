import { describe, expect, test } from "bun:test"
import type { SkillBehavior } from "../../src/schema/ir"
import { doc, harness, skill } from "./helpers"

const noop: SkillBehavior["phases"] = []

describe("cast — 未知技能 / 时钟边界", () => {
    test("未知技能：拒绝 + unknown-skill 诊断", () => {
        const { runtime } = harness({ doc: doc([skill(1, noop)]) })
        const result = runtime.cast(999, 0)
        expect(result.ok).toBe(false)
        expect(result.reason).toBe("unknown-skill")
        expect(runtime.diagnostics().map(item => item.kind)).toContain("unknown-skill")
    })

    test("过去 / 超出时长 / 负时刻：拒绝且不产生事件", () => {
        const { simulation, runtime } = harness({ doc: doc([skill(1, noop)]) })
        simulation.step()
        expect(runtime.cast(1, -1).reason).toBe("time")
        expect(runtime.cast(1, 50).reason).toBe("time")
        simulation.step()
        const now = simulation.now
        expect(runtime.cast(1, now - 0.1).reason).toBe("time")
        simulation.run()
        expect(runtime.cast(1, now).reason).toBe("time")
    })

    test("actor 死亡：actor-dead", () => {
        const { simulation, runtime } = harness({ doc: doc([skill(1, noop)]) })
        const actor = simulation.getActor("lise")
        if (!actor) throw new Error("missing actor")
        actor.alive = false
        expect(runtime.cast(1, 0).reason).toBe("actor-dead")
    })
})

describe("cast — 资源 / 冷却 / 前摇", () => {
    test("资源不足：失败、不进冷却、不扣资源", () => {
        const { simulation, runtime } = harness({
            doc: doc([
                skill(
                    1,
                    [
                        {
                            at: 0,
                            actions: [
                                { kind: "damage", field: "伤害", tag: "", hits: { count: 1, interval: 0 }, target: { kind: "primary" } },
                            ],
                        },
                    ],
                    {
                        cast: { time: 0, cooldown: 5, costs: [{ resource: "神智", amount: 300 }], canMove: true },
                    }
                ),
            ]),
        })
        const result = runtime.cast(1, 0)
        expect(result.ok).toBe(false)
        expect(result.reason).toBe("resource")
        expect(result.missing).toEqual([{ resource: "神智", required: 300, available: 240 }])
        expect(simulation.getActor("lise")?.cooldowns["1"]).toBeUndefined()
        expect(simulation.getActor("lise")?.resources.神智.current).toBe(240)
        expect(runtime.run().events).toHaveLength(0)
    })

    test("成功施法：扣除一次性消耗、设置冷却、记录 castEndAt", () => {
        const { simulation, runtime } = harness({
            doc: doc([skill(1, noop, { cast: { time: 0.45, cooldown: 2, costs: [{ resource: "神智", amount: 30 }], canMove: true } })]),
        })
        const result = runtime.cast(1, 0)
        expect(result.ok).toBe(true)
        expect(result.castEndAt).toBe(0.45)
        expect(result.endsAt).toBe(0.45)
        simulation.run()
        expect(simulation.getActor("lise")?.resources.神智.current).toBe(210)
        expect(simulation.getActor("lise")?.cooldowns["1"]).toBe(2)
        const cast = simulation.events.find(event => event.kind === "cast")
        expect(cast).toMatchObject({ at: 0, skillId: 1, cooldown: 2, costs: [{ resource: "神智", amount: 30 }] })
    })

    test("冷却中：拒绝并给出 readyAt", () => {
        const { simulation, runtime } = harness({
            doc: doc([skill(1, noop, { cast: { time: 0, cooldown: 3, costs: [], canMove: true } })]),
        })
        expect(runtime.cast(1, 0).ok).toBe(true)
        while (simulation.now < 2) simulation.step()
        const result = runtime.cast(1, 2)
        expect(result).toMatchObject({ ok: false, reason: "cooldown", readyAt: 3 })
        while (simulation.now < 3) simulation.step()
        expect(runtime.cast(1, 3).ok).toBe(true)
    })

    test("perSecond 消耗不立即扣除，进入 sustained + 诊断", () => {
        const { simulation, runtime } = harness({
            doc: doc([
                skill(1, noop, {
                    cast: {
                        time: 0,
                        cooldown: 0,
                        costs: [
                            { resource: "神智", amount: 10 },
                            { resource: "神智", amount: 20, perSecond: true },
                        ],
                        canMove: true,
                    },
                }),
            ]),
        })
        const result = runtime.cast(1, 0)
        expect(result.ok).toBe(true)
        expect(result.sustained).toEqual([{ resource: "神智", amount: 20, perSecond: true }])
        simulation.run()
        expect(simulation.getActor("lise")?.resources.神智.current).toBe(230)
        expect(runtime.diagnostics().find(item => item.kind === "sustained-cost")).toMatchObject({ resource: "神智", amount: 20 })
    })

    test("缺失资源池：core 忽略消耗，运行时报 unsupported", () => {
        const { simulation, runtime } = harness({
            doc: doc([skill(1, noop, { cast: { time: 0, cooldown: 0, costs: [{ resource: "电能", amount: 5 }], canMove: true } })]),
        })
        expect(runtime.cast(1, 0).ok).toBe(true)
        simulation.run()
        expect(runtime.diagnostics().map(item => item.kind)).toContain("unsupported")
    })

    test("重复施放：默认 fail，toggle-off 关闭旧实例", () => {
        const behavior = skill(
            1,
            [{ at: 0, tick: { interval: 1 }, until: 5, actions: [{ kind: "resource", resource: "神智", delta: -1 }] }],
            {
                cast: { time: 0, cooldown: 0, costs: [], canMove: true },
            }
        )
        const failing = harness({ doc: doc([behavior]) })
        expect(failing.runtime.cast(1, 0).ok).toBe(true)
        expect(failing.runtime.cast(1, 0)).toMatchObject({ ok: false, reason: "active" })
        failing.runtime.run()
        expect(failing.runtime.diagnostics().some(item => item.kind === "unsupported")).toBe(false)

        const toggling = harness({ doc: doc([behavior]), runtime: { recastPolicy: "toggle-off" } })
        expect(toggling.runtime.cast(1, 0).ok).toBe(true)
        const off = toggling.runtime.cast(1, 0)
        expect(off).toMatchObject({ ok: true, toggledOff: true, invocations: 0 })
        expect(toggling.runtime.active()).toEqual([])
        expect(toggling.runtime.diagnostics().some(item => item.kind === "unsupported")).toBe(true)
        toggling.runtime.run()
        expect(toggling.simulation.getActor("lise")?.resources.神智.current).toBe(240)
    })

    test("延迟施法：先返回 deferred，执行时刻校验失败转 cast-failed 诊断", () => {
        const { simulation, runtime } = harness({
            doc: doc([skill(1, noop, { cast: { time: 0, cooldown: 0, costs: [{ resource: "神智", amount: 10 }], canMove: true } })]),
        })
        const result = runtime.cast(1, 2)
        expect(result).toMatchObject({ ok: true, deferred: true })
        simulation.run()
        expect(simulation.events.filter(event => event.kind === "cast")).toHaveLength(1)
    })

    test("延迟施法被同刻扣除抢跑：cast-failed", () => {
        const { simulation, runtime } = harness({
            doc: doc([skill(1, noop, { cast: { time: 0, cooldown: 0, costs: [{ resource: "神智", amount: 200 }], canMove: true } })]),
        })
        expect(runtime.cast(1, 1).ok).toBe(true)
        // 在 1s 前把神智扣到不足
        simulation.schedule(0.5, { kind: "resource", actorId: "lise", resource: "神智", delta: -100 })
        simulation.run()
        expect(simulation.events.filter(event => event.kind === "cast")).toHaveLength(0)
        expect(runtime.diagnostics().find(item => item.kind === "cast-failed")).toMatchObject({ reason: "resource" })
    })
})
