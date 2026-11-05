import { describe, expect, test } from "bun:test"
import { expandPhase, hitTimes, MAX_INVOCATIONS, planSkill } from "../../src/runtime/planner"
import type { Phase, SkillBehavior } from "../../src/schema/ir"

function phase(overrides: Partial<Phase> = {}): Phase {
    return { at: 0, actions: [], ...overrides }
}

function skill(phases: Phase[], castTime = 0): SkillBehavior {
    return {
        id: 1,
        characterId: 4101,
        slot: "Q",
        cast: { time: castTime, cooldown: 0, costs: [], canMove: true },
        phases,
        sources: ["manual"],
    }
}

describe("expandPhase — tick 展开", () => {
    test("无 tick：单次调用", () => {
        expect(expandPhase(phase({ at: 0.5 }), 0, 10)).toEqual({ times: [0.5], clipped: 0, truncated: 0 })
    })

    test("until 为闭区间上界（1s 网格）", () => {
        const result = expandPhase(phase({ at: 1, until: 10, tick: { interval: 1 } }), 0, 10)
        expect(result.times).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })

    test("until 不含非整数尾（0.9..3.9）", () => {
        const result = expandPhase(phase({ at: 0.9, until: 3.9, tick: { interval: 1 } }), 0, 10)
        expect(result.times.map(t => Number(t.toFixed(3)))).toEqual([0.9, 1.9, 2.9, 3.9])
    })

    test("count 优先于 until", () => {
        const result = expandPhase(phase({ at: 1, until: 10, tick: { interval: 1, count: 3 } }), 0, 10)
        expect(result.times).toEqual([1, 2, 3])
        expect(result.clipped).toBe(0)
    })

    test("无 count / until：裁到模拟时长", () => {
        const result = expandPhase(phase({ at: 0, tick: { interval: 2 } }), 0, 5)
        expect(result.times).toEqual([0, 2, 4])
    })

    test("相位起点超出模拟时长：全部裁剪", () => {
        const result = expandPhase(phase({ at: 20, tick: { interval: 1 } }), 0, 10)
        expect(result.times).toEqual([])
        expect(result.clipped).toBeGreaterThan(0)
    })

    test("castAt 偏移全部相位时刻", () => {
        const result = expandPhase(phase({ at: 1, until: 3, tick: { interval: 1 } }), 2, 10)
        expect(result.times).toEqual([3, 4, 5])
    })

    test("interval 极小触发展开上限", () => {
        const result = expandPhase(phase({ at: 0, until: 10, tick: { interval: 0.0001 } }), 0, 10)
        expect(result.times.length).toBe(MAX_INVOCATIONS)
        expect(result.truncated).toBe(1)
    })

    test("非法 interval 退化为单次", () => {
        expect(expandPhase(phase({ at: 1, tick: { interval: 0 } }), 0, 10).times).toEqual([1])
    })
})

describe("hitTimes — 多段命中", () => {
    test("count × interval", () => {
        expect(hitTimes({ count: 3, interval: 0.2 }, 1)).toEqual([1, 1.2, 1.4])
    })
    test("count=1 / interval=0", () => {
        expect(hitTimes({ count: 1, interval: 0 }, 2)).toEqual([2])
    })
})

describe("planSkill — 全局排序与边界", () => {
    test("不同 phase 的 tick 按时间交叉排序", () => {
        const plan = planSkill(
            skill([phase({ at: 0, until: 2, tick: { interval: 2 } }), phase({ at: 1, until: 3, tick: { interval: 2 } })]),
            0,
            10
        )
        expect(plan.invocations.map(item => `${item.at}@${item.phaseIndex}`)).toEqual(["0@0", "1@1", "2@0", "3@1"])
    })

    test("同刻按 phase 顺序（IR 顺序）", () => {
        const plan = planSkill(skill([phase({ at: 1 }), phase({ at: 1 }), phase({ at: 1 })]), 0, 10)
        expect(plan.invocations.map(item => item.phaseIndex)).toEqual([0, 1, 2])
    })

    test("castEndAt = castAt + cast.time；endsAt 覆盖多段命中", () => {
        const plan = planSkill(
            skill(
                [
                    phase({
                        at: 0,
                        actions: [
                            {
                                kind: "damage",
                                field: "伤害",
                                tag: "",
                                hits: { count: 3, interval: 0.5 },
                                target: { kind: "primary" },
                            },
                        ],
                    }),
                ],
                0.4
            ),
            5,
            20
        )
        expect(plan.castEndAt).toBe(5.4)
        expect(plan.endsAt).toBe(6)
    })

    test("无相位：endsAt = castEndAt", () => {
        const plan = planSkill(skill([], 1.2), 0, 10)
        expect(plan.count).toBe(0)
        expect(plan.endsAt).toBe(1.2)
    })

    test("超时长相位计入 clipped", () => {
        const plan = planSkill(skill([phase({ at: 9, tick: { interval: 1, count: 5 } })]), 0, 10)
        expect(plan.count).toBe(2)
        expect(plan.clipped).toBe(3)
    })
})
