import type { DamageOracle, SimEvent } from "dna-builder-skill-sim/core"
import { describe, expect, it } from "vitest"
import { FIXED_STEP, FixedStepAccumulator } from "../sim/fixed-step"
import { loadSkillManifest } from "../sim/manifest-source"
import { SimDriver } from "../sim/sim-driver"

const manifest = loadSkillManifest()

function fakeOracle(): DamageOracle {
    return { apply: () => ({ damage: 10, kind: "test" }) }
}

/** 用视图同样的方式驱动模拟：rAF dt → 累加器 → 固定步内做攻击 / 推进 */
function runSession(fps: number, seconds: number) {
    const accumulator = new FixedStepAccumulator(FIXED_STEP)
    const driver = new SimDriver({
        manifest,
        characterId: 4101,
        oracle: fakeOracle(),
        resources: {
            生命: { max: 100000, current: 100000 },
            护盾: { max: 100, current: 100 },
            神智: { max: 100, current: 100 },
            电能量: { max: 100, current: 0 },
        },
        seed: 3,
    })
    driver.spawnEnemy({ id: "e1", level: 1, hp: 100000, position: { x: 1, y: 0 } })

    const events: SimEvent[] = []
    let attackTimer = 0
    let totalSteps = 0
    const frameDt = 1 / fps
    const frames = Math.ceil(seconds * fps)

    for (let frame = 0; frame < frames; frame++) {
        const steps = accumulator.add(frameDt)
        for (let step = 0; step < steps; step++) {
            attackTimer -= FIXED_STEP
            if (attackTimer <= 0) {
                attackTimer = 1
                driver.damagePlayer(7)
            }
            driver.advance(FIXED_STEP)
            events.push(...driver.drainEvents())
            totalSteps++
        }
    }
    return { events, now: driver.now, totalSteps }
}

describe("FixedStepAccumulator", () => {
    it("同一段时间在不同帧率下产出相同的固定步数", () => {
        const counts = [30, 60, 144, 240].map(fps => {
            const accumulator = new FixedStepAccumulator()
            const frames = Math.ceil(4 * fps)
            let steps = 0
            for (let frame = 0; frame < frames; frame++) steps += accumulator.add(1 / fps)
            return steps
        })
        for (const count of counts) expect(Math.abs(count - 240)).toBeLessThanOrEqual(1)
    })

    it("单帧超长 dt 被追帧上限截断", () => {
        const accumulator = new FixedStepAccumulator(FIXED_STEP, 0.25)
        expect(accumulator.add(10)).toBe(15)
        expect(accumulator.pending).toBeLessThan(FIXED_STEP)
    })
})

describe("帧率无关的战斗节奏", () => {
    it("30 / 60 / 144 Hz 下同一段墙钟时间产生相同事件序列", () => {
        const low = runSession(30, 5)
        const medium = runSession(60, 5)
        const high = runSession(144, 5)

        for (const run of [low, medium, high]) expect(Math.abs(run.totalSteps - 300)).toBeLessThanOrEqual(1)
        for (const run of [medium, high]) expect(Math.abs(run.now - low.now)).toBeLessThanOrEqual(FIXED_STEP + 1e-9)

        // 末尾不足一步的余数可能造成 1 步差异：比较 4.5s 之前的事件
        const stable = (events: SimEvent[]) => JSON.stringify(events.filter(event => event.at < 4.5))
        expect(stable(medium.events)).toBe(stable(low.events))
        expect(stable(high.events)).toBe(stable(low.events))
    })
})
