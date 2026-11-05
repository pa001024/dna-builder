import { describe, expect, test } from "bun:test"
import { createDamageOracle, snapshotActor, snapshotTarget } from "../../src/core/oracle"
import { createSimulation } from "../../src/core/simulation"
import type { SimConfig } from "../../src/core/types"

function config(overrides: Partial<SimConfig> = {}): SimConfig {
    return {
        duration: 1,
        dt: 0.25,
        seed: 1,
        actors: [{ id: "hero", characterId: 4101, resources: { 神智: { current: 100, max: 100 } } }],
        enemies: [{ id: "e1", hp: 1000 }],
        ...overrides,
    }
}

describe("调度防护", () => {
    test("不能调度到已推进的时刻", () => {
        const sim = createSimulation(config({ dt: 0.5 }))
        sim.step()
        sim.step()
        expect(sim.now).toBe(0.5)
        expect(() => sim.schedule(0.1, { kind: "resource", actorId: "hero", resource: "神智", delta: 1 })).toThrow(/早于当前时钟/)
        expect(() => sim.schedule(0.5, { kind: "resource", actorId: "hero", resource: "神智", delta: 1 })).not.toThrow()
        expect(sim.run().summary.events).toBeGreaterThan(0)
    })

    test("结束后不能再调度", () => {
        const sim = createSimulation(config())
        sim.run()
        expect(() => sim.schedule(0.5, { kind: "resource", actorId: "hero", resource: "神智", delta: 1 })).toThrow(/已结束/)
    })

    test("result 返回事件 / 帧数组副本", () => {
        const sim = createSimulation(config())
        sim.schedule(0.1, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" }, amount: 1 })
        const result = sim.run()
        const eventCount = result.events.length
        const frameCount = result.frames.length
        result.events.push({ ...result.events[0] })
        result.frames.length = 0
        expect(sim.events.length).toBe(eventCount)
        expect(sim.frames.length).toBe(frameCount)
    })
})

describe("buff 与死亡 / 替换", () => {
    test("死亡清空 buff 并补发 expire(removed)", () => {
        const sim = createSimulation(config({ enemies: [{ id: "e1", hp: 10 }] }))
        sim.schedule(0, { kind: "applyBuff", actorId: "hero", target: { kind: "primary" }, buffId: 500, duration: 10 })
        sim.schedule(0.1, { kind: "damage", actorId: "hero", skillField: "伤害", target: { kind: "primary" }, amount: 10 })
        const result = sim.run()
        const expire = result.events.find(event => event.kind === "buff-expire")
        expect(expire).toMatchObject({ buffId: 500, reason: "removed", at: 0.1 })
        expect(result.frames[result.frames.length - 1].targets[0].buffCount).toBe(0)
        expect(sim.getTarget("e1")?.buffs).toHaveLength(0)
    })

    test("replace 先发 replaced 到期事件，再发新的 apply", () => {
        const sim = createSimulation(config())
        sim.schedule(0, { kind: "applyBuff", actorId: "hero", target: { kind: "primary" }, buffId: 501, duration: 5, stacks: 2 })
        sim.schedule(0.25, { kind: "applyBuff", actorId: "hero", target: { kind: "primary" }, buffId: 501, duration: 5, policy: "replace" })
        const result = sim.run()
        const buffEvents = result.events.filter(event => event.kind === "buff-apply" || event.kind === "buff-expire")
        expect(buffEvents.map(event => event.kind)).toEqual(["buff-apply", "buff-expire", "buff-apply"])
        expect(buffEvents[1]).toMatchObject({ reason: "replaced", stacks: 2 })
        expect(buffEvents[2]).toMatchObject({ replaced: true, stacks: 1 })
    })

    test("同刻刷新优先于内部到期，不产生瞬断", () => {
        const sim = createSimulation(config({ duration: 3, dt: 0.5 }))
        sim.schedule(0, { kind: "applyBuff", actorId: "hero", target: { kind: "primary" }, buffId: 502, duration: 1 })
        sim.schedule(1, { kind: "applyBuff", actorId: "hero", target: { kind: "primary" }, buffId: 502, duration: 1 })
        const result = sim.run()
        const expires = result.events.filter(event => event.kind === "buff-expire")
        expect(expires.map(event => event.at)).toEqual([2])
        expect(result.frames.find(frame => frame.t === 1)?.targets[0].buffCount).toBe(1)
    })
})

describe("施法资源门槛", () => {
    test("资源不足时施法失败且不进冷却", () => {
        const sim = createSimulation(config({ actors: [{ id: "hero", characterId: 1, resources: { 神智: { current: 10, max: 100 } } }] }))
        sim.schedule(0, { kind: "cast", actorId: "hero", skillId: 1, cooldown: 2, costs: [{ resource: "神智", amount: 50 }] })
        sim.schedule(0.5, { kind: "cast", actorId: "hero", skillId: 1, cooldown: 2, costs: [{ resource: "神智", amount: 5 }] })
        const result = sim.run()
        const casts = result.events.filter(event => event.kind === "cast")
        expect(casts).toHaveLength(1)
        expect(casts[0].at).toBe(0.5)
        expect(sim.getActor("hero")?.resources.神智.current).toBe(5)
    })
})

describe("oracle 缓存隔离", () => {
    test("actor buff / meta 身份参与缓存键；返回值是副本", () => {
        let calls = 0
        const oracle = createDamageOracle(req => {
            calls++
            return { damage: req.actor.buffs.length, kind: "x" }
        })
        const baseActor = {
            id: "hero",
            characterId: 1,
            team: "ally" as const,
            position: { x: 0, y: 0 },
            resources: {},
            cooldowns: {},
            buffs: [],
            alive: true,
            meta: { build: "A" },
        }
        const target = {
            id: "e1",
            level: 1,
            hp: 100,
            maxHp: 100,
            shield: 0,
            def: 0,
            resist: 0,
            position: { x: 1, y: 0 },
            buffs: [],
            alive: true,
        }
        const makeRequest = (buffCount: number, meta: Record<string, unknown>) => ({
            skillField: "伤害",
            tag: "",
            actor: snapshotActor(
                {
                    ...baseActor,
                    meta,
                    buffs: Array.from({ length: buffCount }, (_, index) => ({
                        instanceId: index + 1,
                        buffId: 1,
                        sourceId: "hero",
                        stacks: 1,
                        appliedAt: 0,
                        expiresAt: 10,
                        duration: 10,
                        policy: "refresh" as const,
                    })),
                },
                0.5
            ),
            target: snapshotTarget(target, 0.5),
            at: 0.5,
        })

        const metaA = { build: "A" }
        const first = oracle.apply(makeRequest(0, metaA))
        expect(first.damage).toBe(0)
        first.damage = 999
        expect(oracle.apply(makeRequest(0, metaA)).damage).toBe(0)
        expect(calls).toBe(1)

        expect(oracle.apply(makeRequest(1, metaA)).damage).toBe(1)
        expect(oracle.apply(makeRequest(0, { build: "B" })).damage).toBe(0)
        expect(calls).toBe(3)
    })
})
