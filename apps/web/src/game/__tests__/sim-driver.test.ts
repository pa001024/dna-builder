import type { DamageOracle, SimEvent } from "dna-builder-skill-sim/core"
import { describe, expect, it } from "vitest"
import { loadSkillManifest } from "../sim/manifest-source"
import { SimDriver } from "../sim/sim-driver"
import { generatedManifest } from "./generated-manifest"

// 显式注入 U7 生成清单，保证 vitest / bun test 看到同一份技能数据
const manifest = loadSkillManifest([], generatedManifest)

function fakeOracle(damage = 100): DamageOracle {
    return { apply: () => ({ damage, kind: "test" }) }
}

function driver(overrides: { seed?: number; duration?: number; oracle?: DamageOracle } = {}) {
    return new SimDriver({
        manifest,
        characterId: 4101,
        oracle: overrides.oracle ?? fakeOracle(),
        resources: {
            生命: { max: 1000, current: 1000 },
            护盾: { max: 100, current: 100 },
            神智: { max: 100, current: 100 },
            电能量: { max: 100, current: 40 },
        },
        seed: overrides.seed ?? 11,
        duration: overrides.duration,
    })
}

function advance(driverInstance: SimDriver, seconds: number, step = 1 / 60): void {
    const iterations = Math.ceil(seconds / step)
    for (let index = 0; index < iterations; index++) driverInstance.advance(step)
}

function kinds(events: readonly SimEvent[]): string[] {
    return events.map(event => event.kind)
}

describe("SimDriver", () => {
    it("真实 dt 累加后按固定网格推进（不是可变 dt）", () => {
        const instance = driver()
        instance.advance(1 / 30)
        expect(instance.now).toBeCloseTo(1 / 30, 6)

        instance.advance(1 / 60)
        expect(instance.now).toBeCloseTo(1 / 20, 6)

        // 超过 MAX_REAL_DT 的部分被截断，避免一次 rAF 追帧把模拟拉爆
        instance.advance(10)
        expect(instance.now).toBeCloseTo(0.3, 6)
    })

    it("未知技能返回 unknown-skill 而不是抛异常", () => {
        const instance = driver()
        // 生成清单里 4101 有 E/Q/P；R 槽位仍为空
        const outcome = instance.castSlot("R")
        expect(outcome.ok).toBe(false)
        expect(outcome.reason).toBe("unknown-skill")
        expect(driver().castSkill(999999).ok).toBe(false)
    })

    it("重施策略按技能区分：瞬时技能拒绝，持续技能再按关闭", () => {
        const instance = driver()
        expect(instance.castSlot("E").ok).toBe(true)
        expect(instance.castSlot("E")).toMatchObject({ ok: false, reason: "active" })

        expect(instance.castSlot("Q").ok).toBe(true)
        expect(instance.castSlot("Q")).toMatchObject({ ok: true, toggledOff: true })
    })

    it("黎瑟 E：施法 → 位移伤害与神智消耗来自生成清单", () => {
        const instance = driver()
        instance.spawnEnemy({ id: "e1", level: 80, hp: 1000, position: { x: 1, y: 0 } })
        advance(instance, 0.05)

        const outcome = instance.castSlot("E")
        expect(outcome).toMatchObject({ ok: true, skillId: 410101, slot: "E" })

        advance(instance, 0.5)
        const events = instance.drainEvents()
        expect(kinds(events)).toContain("cast")
        expect(kinds(events)).toContain("damage")

        const actor = instance.simulation.getActor(instance.actorId)
        expect(actor?.resources["神智"].current).toBe(80)
        expect(instance.simulation.getTarget("e1")?.hp).toBe(900)
        // 电能回复 / 攻速 buff 未建模（见 fixtures/overrides/lise-saiqi.json 的 410101 note）
        expect(kinds(events)).not.toContain("buff-apply")
        expect(actor?.resources["电能量"].current).toBe(40)
    })

    it("黎瑟 Q：生成清单驱动 buff / 选敌 / 资源 / 分支", () => {
        const instance = driver()
        instance.spawnEnemy({ id: "e1", level: 80, hp: 5000, position: { x: 1, y: 0 } })
        instance.spawnEnemy({ id: "e2", level: 80, hp: 5000, position: { x: 2, y: 0 } })
        advance(instance, 0.05)

        const outcome = instance.castSlot("Q")
        expect(outcome).toMatchObject({ ok: true, skillId: 410102, slot: "Q" })

        advance(instance, 1.2)
        const events = instance.drainEvents()
        const eventKinds = kinds(events)
        expect(eventKinds).toContain("cast")
        expect(eventKinds).toContain("buff-apply")
        expect(eventKinds).toContain("damage")
        expect(eventKinds).toContain("target-select")
        expect(eventKinds).toContain("resource")

        const actor = instance.simulation.getActor(instance.actorId)
        // 施法 10 神智 + 电场每秒 20 神智
        expect(actor?.resources["神智"].current).toBe(70)
        expect(instance.simulation.getTarget("e1")?.hp).toBeLessThan(5000)
    })

    it("同 seed + 同输入两次运行事件流逐位一致", () => {
        const run = () => {
            const instance = driver({ seed: 42 })
            instance.spawnEnemy({ id: "e1", level: 80, hp: 5000, position: { x: 2, y: 1 } })
            instance.castSlot("Q")
            advance(instance, 2)
            return instance.drainEvents()
        }
        expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
    })

    it("drainEvents 只返回一次", () => {
        const instance = driver()
        instance.castSlot("E")
        advance(instance, 0.5)
        expect(instance.drainEvents().length).toBeGreaterThan(0)
        expect(instance.drainEvents()).toEqual([])
    })

    it("通用伤害入口（普攻 / 射击）经 oracle 结算扣血", () => {
        const instance = driver({ oracle: fakeOracle(25) })
        instance.spawnEnemy({ id: "e1", level: 1, hp: 100, position: { x: 1, y: 0 } })
        advance(instance, 0.05)
        instance.dealDamage("普通攻击", ["e1"])
        advance(instance, 0.05)

        const damage = instance.drainEvents().filter(event => event.kind === "damage")
        expect(damage).toHaveLength(1)
        expect(damage[0]).toMatchObject({ skillField: "普通攻击::伤害", effective: 25, hpAfter: 75 })
    })

    it("玩家受击：先扣护盾再扣生命，UI 数据来自帧采样", () => {
        const instance = driver()
        instance.damagePlayer(150)
        advance(instance, 0.05)

        const actor = instance.simulation.getActor(instance.actorId)
        expect(actor?.resources["护盾"].current).toBe(0)
        expect(actor?.resources["生命"].current).toBe(950)

        const frame = instance.latestFrame()
        expect(frame?.actors[0].resources["生命"].current).toBe(950)
    })

    it("会话到点进入 finished，restart 后时钟归零并保留敌人", () => {
        const instance = driver({ duration: 0.5, oracle: fakeOracle(1) })
        instance.spawnEnemy({ id: "e1", level: 1, hp: 100, position: { x: 0, y: 0 } })
        advance(instance, 0.4, 0.05)
        instance.advance(0.25)
        expect(instance.finished).toBe(true)

        instance.restart([{ id: "e1", level: 1, hp: 100, position: { x: 0, y: 0 } }])
        expect(instance.finished).toBe(false)
        expect(instance.now).toBe(0)
        advance(instance, 0.05)
        expect(instance.simulation.getTarget("e1")).toBeDefined()
    })
})
