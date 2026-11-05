import { describe, expect, test } from "bun:test"
import { createSimulation } from "../../src/core/simulation"
import type { SimConfig } from "../../src/core/types"

function config(overrides: Partial<SimConfig> = {}): SimConfig {
    return {
        duration: 1,
        dt: 0.25,
        seed: 1,
        actors: [{ id: "hero", characterId: 4101, resources: { 神智: { current: 100, max: 100 } } }],
        enemies: [{ id: "e1", hp: 1000, level: 40 }],
        ...overrides,
    }
}

describe("伤害结算", () => {
    test("护盾优先，再扣 HP", () => {
        const sim = createSimulation(config({ enemies: [{ id: "e1", hp: 1000, shield: 30 }] }))
        sim.schedule(0.1, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" }, amount: 100 })
        const result = sim.run()
        const event = result.events.find(event => event.kind === "damage")
        expect(event).toMatchObject({ raw: 100, shieldAbsorb: 30, hpLoss: 70, effective: 100, overkill: 0, hpAfter: 930, shieldAfter: 0 })
        expect(result.summary.totalDamage).toBe(100)
    })

    test("overkill 与死亡事件", () => {
        const sim = createSimulation(config({ enemies: [{ id: "e1", hp: 50, shield: 20 }] }))
        sim.schedule(0.1, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" }, amount: 100 })
        const result = sim.run()
        const damage = result.events.find(event => event.kind === "damage")
        expect(damage).toMatchObject({ shieldAbsorb: 20, hpLoss: 50, overkill: 30, effective: 70 })
        const death = result.events.find(event => event.kind === "death")
        expect(death).toMatchObject({ targetId: "e1", killerId: "hero", at: 0.1 })
        expect(sim.getTarget("e1")?.alive).toBe(false)
        expect(result.summary.totalDamage).toBe(70)
    })

    test("死亡后不再造成伤害", () => {
        const sim = createSimulation(config({ enemies: [{ id: "e1", hp: 10 }] }))
        sim.schedule(0.1, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" }, amount: 10 })
        sim.schedule(0.2, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" }, amount: 10 })
        const result = sim.run()
        expect(result.events.filter(event => event.kind === "damage")).toHaveLength(1)
        expect(result.events.filter(event => event.kind === "death")).toHaveLength(1)
        expect(result.summary.totalDamage).toBe(10)
    })

    test("同刻命令按调度序稳定执行", () => {
        const sim = createSimulation(
            config({
                actors: [
                    { id: "hero1", characterId: 1 },
                    { id: "hero2", characterId: 2 },
                ],
            })
        )
        sim.schedule(0.1, { kind: "damage", actorId: "hero2", skillField: "伤害", target: { kind: "primary" }, amount: 1 })
        sim.schedule(0.1, { kind: "damage", actorId: "hero1", skillField: "伤害", target: { kind: "primary" }, amount: 1 })
        const events = sim.run().events.filter(event => event.kind === "damage")
        expect(events.map(event => event.actorId)).toEqual(["hero2", "hero1"])
        expect(events.map(event => event.seq)).toEqual([0, 1])
    })

    test("未知 actor / 无目标时静默跳过", () => {
        const sim = createSimulation(config({ enemies: [] }))
        sim.schedule(0.1, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" }, amount: 10 })
        sim.schedule(0.2, { kind: "damage", actorId: "nobody", skillField: "伤害", target: { kind: "primary" }, amount: 10 })
        const result = sim.run()
        expect(result.summary.totalDamage).toBe(0)
        expect(result.events).toHaveLength(0)
    })
})

describe("时间网格与事件边界", () => {
    test("非网格事件插入采样点，网格事件不重复采样", () => {
        const sim = createSimulation(config())
        sim.schedule(0.1, { kind: "resource", actorId: "hero", resource: "神智", delta: -1 })
        sim.schedule(0.3, { kind: "resource", actorId: "hero", resource: "神智", delta: -1 })
        sim.schedule(0.5, { kind: "resource", actorId: "hero", resource: "神智", delta: -1 })
        const result = sim.run()
        expect(result.frames.map(frame => frame.t)).toEqual([0, 0.1, 0.25, 0.3, 0.5, 0.75, 1])
    })

    test("边界采样反映事件后状态", () => {
        const sim = createSimulation(config())
        sim.schedule(0.1, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" }, amount: 100 })
        const result = sim.run()
        const boundary = result.frames.find(frame => frame.t === 0.1)
        expect(boundary?.targets[0].hp).toBe(900)
        expect(boundary?.targets[0].damageDelta).toBe(100)
        expect(boundary?.actors[0].damageDelta).toBe(100)
        const before = result.frames.find(frame => frame.t === 0)
        expect(before?.targets[0].hp).toBe(1000)
        expect(before?.targets[0].damageDelta).toBe(0)
    })

    test("单步与 run 等价，暂停即停止调用 step", () => {
        const build = () => {
            const sim = createSimulation(config())
            sim.schedule(0.1, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" }, amount: 3 })
            return sim
        }
        const stepped = build()
        let guard = 0
        while (stepped.step()) {
            if (++guard > 1000) throw new Error("step 未收敛")
        }
        const ran = build().run()
        expect(stepped.result().frames.length).toBe(ran.frames.length)
        expect(stepped.result().summary.totalDamage).toBe(ran.summary.totalDamage)
        expect(stepped.isFinished).toBe(true)
        expect(stepped.step()).toBe(false)
    })

    test("超出时长的调度直接报错", () => {
        const sim = createSimulation(config())
        expect(() => sim.schedule(1.5, { kind: "resource", actorId: "hero", resource: "神智", delta: 1 })).toThrow()
        expect(() => sim.schedule(-0.1, { kind: "resource", actorId: "hero", resource: "神智", delta: 1 })).toThrow()
    })
})

describe("buff 生命周期", () => {
    test("施加、按到期时刻过期（边界采样）", () => {
        const sim = createSimulation(config())
        sim.schedule(0, { kind: "applyBuff", actorId: "hero", target: { kind: "primary" }, buffId: 900, duration: 0.3, stacks: 2 })
        const result = sim.run()
        const apply = result.events.find(event => event.kind === "buff-apply")
        expect(apply).toMatchObject({ entityKind: "target", entityId: "e1", buffId: 900, stacks: 2, expiresAt: 0.3, policy: "refresh" })
        const expire = result.events.find(event => event.kind === "buff-expire")
        expect(expire).toMatchObject({ entityKind: "target", buffId: 900, reason: "expired", at: 0.3 })
        expect(result.frames.map(frame => frame.t)).toContain(0.3)
        expect(result.frames.find(frame => frame.t === 0.25)?.targets[0].buffCount).toBe(1)
        expect(result.frames.find(frame => frame.t === 0.3)?.targets[0].buffCount).toBe(0)
    })

    test("刷新后旧定时器失效，只在最终到期时过期一次", () => {
        const sim = createSimulation(config())
        sim.schedule(0, { kind: "applyBuff", actorId: "hero", target: { kind: "primary" }, buffId: 901, duration: 0.5 })
        sim.schedule(0.3, { kind: "applyBuff", actorId: "hero", target: { kind: "primary" }, buffId: 901, duration: 0.5 })
        const result = sim.run()
        const expires = result.events.filter(event => event.kind === "buff-expire")
        expect(expires).toHaveLength(1)
        expect(expires[0].at).toBe(0.8)
    })

    test("self 目标作用于 actor；stack 策略叠层", () => {
        const sim = createSimulation(config({ maxStacks: { 902: 3 } }))
        sim.schedule(0, { kind: "applyBuff", actorId: "hero", target: { kind: "self" }, buffId: 902, stacks: 2, policy: "stack" })
        sim.schedule(0.1, { kind: "applyBuff", actorId: "hero", target: { kind: "self" }, buffId: 902, stacks: 2, policy: "stack" })
        const result = sim.run()
        const applies = result.events.filter(event => event.kind === "buff-apply")
        expect(applies[0]).toMatchObject({ entityKind: "actor", entityId: "hero", stacks: 2 })
        expect(applies[1]).toMatchObject({ entityKind: "actor", entityId: "hero", stacks: 3 })
    })

    test("removeBuff 发出 removed 事件", () => {
        const sim = createSimulation(config())
        sim.schedule(0, { kind: "applyBuff", actorId: "hero", target: { kind: "primary" }, buffId: 903 })
        sim.schedule(0.5, { kind: "removeBuff", actorId: "hero", target: { kind: "primary" }, buffId: 903 })
        const result = sim.run()
        const removed = result.events.find(event => event.kind === "buff-expire")
        expect(removed).toMatchObject({ reason: "removed", at: 0.5 })
    })
})

describe("资源与冷却", () => {
    test("资源 clamp 与事件", () => {
        const sim = createSimulation(config({ actors: [{ id: "hero", characterId: 1, resources: { 神智: { current: 5, max: 10 } } }] }))
        sim.schedule(0.1, { kind: "resource", actorId: "hero", resource: "神智", delta: -8 })
        sim.schedule(0.2, { kind: "resource", actorId: "hero", resource: "神智", delta: 20 })
        sim.schedule(0.3, { kind: "resource", actorId: "hero", resource: "不存在", delta: 1 })
        const result = sim.run()
        const events = result.events.filter(event => event.kind === "resource")
        expect(events).toHaveLength(2)
        expect(events[0]).toMatchObject({ before: 5, after: 0, delta: -5, requested: -8 })
        expect(events[1]).toMatchObject({ before: 0, after: 10, delta: 10, requested: 20 })
        expect(result.frames.find(frame => frame.t === 0.25)?.actors[0].resources.神智.current).toBe(10)
    })

    test("cast 消耗资源、写冷却、冷却中不重复施放", () => {
        const sim = createSimulation(config({ duration: 3, dt: 0.5 }))
        const cast = { kind: "cast" as const, actorId: "hero", skillId: 410102, cooldown: 2, costs: [{ resource: "神智", amount: 20 }] }
        sim.schedule(0, cast)
        sim.schedule(1, cast)
        sim.schedule(2, cast)
        const result = sim.run()
        const casts = result.events.filter(event => event.kind === "cast")
        expect(casts.map(event => event.at)).toEqual([0, 2])
        expect(casts[0]).toMatchObject({ skillId: 410102, cooldown: 2, readyAt: 2, costs: [{ resource: "神智", amount: 20 }] })
        expect(sim.getActor("hero")?.resources.神智.current).toBe(60)
        expect(result.frames.find(frame => frame.t === 1)?.actors[0].cooldowns["410102"]).toBe(1)
    })
})

describe("目标选择 / 生成 / 移动", () => {
    test("selectTargets 写入存储并发事件；stored 伤害命中全部", () => {
        const sim = createSimulation(
            config({
                duration: 1,
                enemies: [
                    { id: "e1", hp: 100, position: { x: 1, y: 0 } },
                    { id: "e2", hp: 100, position: { x: 2, y: 0 } },
                    { id: "e3", hp: 100, position: { x: 3, y: 0 } },
                ],
            })
        )
        sim.schedule(0, { kind: "selectTargets", actorId: "hero", store: "group", filter: { kind: "all" } })
        sim.schedule(0.1, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "stored", ref: "group" }, amount: 10 })
        const result = sim.run()
        const select = result.events.find(event => event.kind === "target-select")
        expect(select).toMatchObject({ store: "group", filter: "all", targetIds: ["e1", "e2", "e3"] })
        expect(result.events.filter(event => event.kind === "damage")).toHaveLength(3)
        expect(result.summary.totalDamage).toBe(30)
        expect(sim.getStoredTargets("group")).toEqual(["e1", "e2", "e3"])
    })

    test("random 选敌同 seed 可复现", () => {
        const build = () => {
            const sim = createSimulation(
                config({
                    duration: 1,
                    enemies: [
                        { id: "e1", hp: 100 },
                        { id: "e2", hp: 100 },
                        { id: "e3", hp: 100 },
                    ],
                })
            )
            sim.schedule(0.1, { kind: "selectTargets", actorId: "hero", store: "r", filter: { kind: "random", count: 2 } })
            return sim
        }
        const first = build().run()
        const second = build().run()
        const ids = (result: typeof first) => result.events.find(event => event.kind === "target-select")
        expect(ids(first)).toEqual(ids(second))
    })

    test("生成重名目标自动加后缀；despawn 与 move 事件", () => {
        const sim = createSimulation(config({ duration: 1 }))
        sim.schedule(0.1, { kind: "spawn", enemy: { id: "e1", hp: 10 } })
        sim.schedule(0.2, { kind: "move", entity: "target", id: "e1", position: { x: 5, y: 6 } })
        sim.schedule(0.3, { kind: "despawn", targetId: "e1", reason: "test" })
        const result = sim.run()
        const spawn = result.events.find(event => event.kind === "spawn")
        expect(spawn).toMatchObject({ targetId: "e1#2", at: 0.1 })
        const move = result.events.find(event => event.kind === "move")
        expect(move).toMatchObject({ entityKind: "target", entityId: "e1", position: { x: 5, y: 6 } })
        const despawn = result.events.find(event => event.kind === "despawn")
        expect(despawn).toMatchObject({ targetId: "e1", reason: "test" })
        expect(sim.getTarget("e1")?.alive).toBe(false)
    })
})

describe("DamageOracle 接线", () => {
    test("无 amount 时调用注入 oracle，并携带事件时刻快照", () => {
        const requests: { at: number; buffs: unknown[]; hp: number }[] = []
        const sim = createSimulation(
            config({
                oracle: {
                    apply: req => {
                        requests.push({ at: req.at, buffs: req.target.buffs.map(buff => buff.buffId), hp: req.target.hp })
                        return { damage: 37, kind: "skill" }
                    },
                },
            })
        )
        sim.schedule(0, { kind: "applyBuff", actorId: "hero", target: { kind: "primary" }, buffId: 777, duration: 1 })
        sim.schedule(0.1, { kind: "damage", actorId: "hero", skillField: "伤害", tag: "技能", target: { kind: "primary" } })
        sim.schedule(0.2, { kind: "damage", actorId: "hero", skillField: "伤害", tag: "技能", target: { kind: "primary" } })
        const result = sim.run()
        expect(requests).toHaveLength(2)
        expect(requests[0]).toEqual({ at: 0.1, buffs: [777], hp: 1000 })
        expect(requests[1]).toEqual({ at: 0.2, buffs: [777], hp: 963 })
        const damage = result.events.find(event => event.kind === "damage")
        expect(damage).toMatchObject({ raw: 37, damageKind: "skill", tag: "技能" })
    })

    test("缺少 oracle 且无 amount 时明确报错", () => {
        const sim = createSimulation(config())
        sim.schedule(0.1, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" } })
        expect(() => sim.run()).toThrow(/damage 命令需要 amount/)
    })
})

describe("trace / summary 不变量", () => {
    test("frames 时间单调，累计伤害等于 summary，dps 公式成立", () => {
        const sim = createSimulation(
            config({
                duration: 2,
                dt: 0.1,
                enemies: [
                    { id: "e1", hp: 5000 },
                    { id: "e2", hp: 5000 },
                ],
            })
        )
        for (let i = 0; i < 20; i++) {
            sim.schedule(i * 0.1, {
                kind: "damage",
                actorId: "hero",
                skillField: i % 2 === 0 ? "伤害" : "追击",
                target: { kind: "primary" },
                amount: 3,
            })
        }
        sim.schedule(0.35, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "id", id: "e2" }, amount: 5 })
        const result = sim.run()

        const times = result.frames.map(frame => frame.t)
        expect(times).toEqual(times.slice().sort((a, b) => a - b))
        expect(times.length).toBeGreaterThan(1)
        expect(new Set(times).size).toBe(times.length)

        const frameTotal = result.frames.reduce(
            (sum, frame) => sum + frame.targets.reduce((inner, target) => inner + target.damageDelta, 0),
            0
        )
        expect(frameTotal).toBe(result.summary.totalDamage)

        const eventTotal = result.events.reduce((sum, event) => sum + (event.kind === "damage" ? event.effective : 0), 0)
        expect(eventTotal).toBe(result.summary.totalDamage)
        expect(result.summary.dps).toBe(result.summary.totalDamage / result.duration)
        expect(result.summary.perSkill.伤害 + (result.summary.perSkill.追击 ?? 0)).toBe(result.summary.totalDamage)
        expect(result.summary.damageEvents).toBe(result.events.filter(event => event.kind === "damage").length)
        expect(result.summary.frames).toBe(result.frames.length)
    })

    test("同 seed 同配置两次运行逐位一致", () => {
        const build = () =>
            createSimulation(
                config({
                    duration: 2,
                    dt: 1 / 60,
                    seed: 2024,
                    enemies: [
                        { id: "e1", hp: 1000, position: { x: 2, y: 0 } },
                        { id: "e2", hp: 1000, position: { x: 1, y: 0 } },
                        { id: "e3", hp: 1000, position: { x: 3, y: 0 } },
                    ],
                    rotation: [
                        {
                            at: 0.1,
                            command: { kind: "selectTargets", actorId: "hero", store: "group", filter: { kind: "random", count: 2 } },
                        },
                        {
                            at: 0.2,
                            command: {
                                kind: "damage",
                                actorId: "hero",
                                skillField: "伤害",
                                target: { kind: "stored", ref: "group" },
                                amount: 17,
                            },
                        },
                        {
                            at: 0.35,
                            command: { kind: "applyBuff", actorId: "hero", target: { kind: "primary" }, buffId: 1, duration: 0.7 },
                        },
                        {
                            at: 0.4,
                            command: { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" }, amount: 11 },
                        },
                    ],
                })
            )
        const first = build().run()
        const second = build().run()
        expect(JSON.stringify(first)).toBe(JSON.stringify(second))

        const bits = (value: number) => {
            const buffer = new ArrayBuffer(8)
            new DataView(buffer).setFloat64(0, value)
            return Buffer.from(buffer).toString("hex")
        }
        expect(bits(first.summary.totalDamage)).toBe(bits(second.summary.totalDamage))
        expect(bits(first.summary.dps)).toBe(bits(second.summary.dps))
    })

    test("不同 seed 改变随机选敌结果（事件序列不必相同）", () => {
        const build = (seed: number) =>
            createSimulation(
                config({
                    duration: 0.5,
                    seed,
                    enemies: [
                        { id: "e1", hp: 100 },
                        { id: "e2", hp: 100 },
                        { id: "e3", hp: 100 },
                        { id: "e4", hp: 100 },
                        { id: "e5", hp: 100 },
                    ],
                })
            ).run()
        const selection = (seed: number) => {
            const sim = createSimulation(
                config({
                    duration: 0.5,
                    seed,
                    enemies: [
                        { id: "e1", hp: 100 },
                        { id: "e2", hp: 100 },
                        { id: "e3", hp: 100 },
                        { id: "e4", hp: 100 },
                    ],
                })
            )
            sim.schedule(0.1, { kind: "selectTargets", actorId: "hero", store: "r", filter: { kind: "random", count: 1 } })
            const event = sim.run().events.find(event => event.kind === "target-select")
            return event?.kind === "target-select" ? event.targetIds[0] : undefined
        }
        const picks = new Set(Array.from({ length: 8 }, (_, index) => selection(index + 1)))
        expect(picks.size).toBeGreaterThan(1)
        expect(build(1).summary.totalDamage).toBe(0)
    })
})

describe("性能 smoke", () => {
    test("单角色 60s / dt=1/60 在 200ms 量级内完成", () => {
        const sim = createSimulation({
            duration: 60,
            dt: 1 / 60,
            seed: 99,
            actors: [{ id: "hero", characterId: 4101, resources: { 神智: { current: 500, max: 500 } } }],
            enemies: Array.from({ length: 5 }, (_, index) => ({ id: `e${index}`, hp: 1_000_000, position: { x: index, y: 0 } })),
        })
        for (let i = 0; i < 600; i++) {
            const at = i * 0.1
            sim.schedule(at, {
                kind: "damage",
                actorId: "hero",
                skillField: i % 3 === 0 ? "伤害" : "追击",
                target: { kind: "nearest" },
                amount: 100,
            })
            if (i % 10 === 0) {
                sim.schedule(at, { kind: "applyBuff", actorId: "hero", target: { kind: "self" }, buffId: 1, duration: 2, policy: "stack" })
                sim.schedule(at, { kind: "resource", actorId: "hero", resource: "神智", delta: -5 })
            }
        }
        const started = performance.now()
        const result = sim.run()
        const elapsed = performance.now() - started
        console.log(
            `[perf] 60s sim: ${elapsed.toFixed(1)}ms, frames=${result.frames.length}, events=${result.events.length}, damage=${result.summary.totalDamage}`
        )
        expect(result.frames.length).toBe(3601)
        expect(result.frames[result.frames.length - 1].t).toBe(60)
        expect(result.summary.totalDamage).toBe(60_000)
        expect(elapsed).toBeLessThan(1000)
    })
})
