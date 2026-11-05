import { describe, expect, test } from "bun:test"
import { applyBuffInstance, buffStacks, findBuff, hasBuff, removeBuffInstance } from "../../src/core/buffs"
import type { BuffHolder } from "../../src/core/types"

function holder(): BuffHolder {
    return { buffs: [] }
}

const base = { buffId: 100, sourceId: "a", now: 0, instanceId: 1, policy: "refresh" as const }

describe("buff 策略", () => {
    test("首个实例：按参数创建", () => {
        const target = holder()
        const outcome = applyBuffInstance(target, { ...base, duration: 2, stacks: 2, level: 3 })
        expect(outcome.created).toBe(true)
        expect(outcome.replaced).toBe(false)
        expect(target.buffs).toHaveLength(1)
        expect(outcome.instance).toMatchObject({ buffId: 100, stacks: 2, level: 3, appliedAt: 0, expiresAt: 2, duration: 2 })
        expect(hasBuff(target, 100)).toBe(true)
        expect(buffStacks(target, 100)).toBe(2)
    })

    test("refresh：重置到期时间，层数不变", () => {
        const target = holder()
        applyBuffInstance(target, { ...base, duration: 1, stacks: 2 })
        const outcome = applyBuffInstance(target, { ...base, now: 0.5, duration: 2, stacks: 5, policy: "refresh" })
        expect(target.buffs).toHaveLength(1)
        expect(outcome.instance.stacks).toBe(2)
        expect(outcome.instance.expiresAt).toBe(2.5)
        expect(outcome.instance.instanceId).toBe(1)
    })

    test("stack：层数相加并受 maxStacks 限制，到期取更晚者", () => {
        const target = holder()
        applyBuffInstance(target, { ...base, duration: 1, stacks: 2 })
        const outcome = applyBuffInstance(target, { ...base, now: 0.5, duration: 5, stacks: 2, policy: "stack", maxStacks: 3 })
        expect(outcome.instance.stacks).toBe(3)
        expect(outcome.instance.expiresAt).toBe(5.5)

        const capped = applyBuffInstance(target, { ...base, now: 6, duration: 1, stacks: 2, policy: "stack", maxStacks: 3 })
        expect(capped.instance.stacks).toBe(3)
    })

    test("replace：新实例替换旧实例", () => {
        const target = holder()
        applyBuffInstance(target, { ...base, duration: 1, stacks: 3 })
        const outcome = applyBuffInstance(target, { ...base, now: 0.2, instanceId: 2, duration: 2, stacks: 1, policy: "replace" })
        expect(outcome.replaced).toBe(true)
        expect(outcome.previous).toEqual({ instanceId: 1, stacks: 3, expiresAt: 1 })
        expect(target.buffs).toHaveLength(1)
        expect(outcome.instance.instanceId).toBe(2)
        expect(outcome.instance.appliedAt).toBe(0.2)
        expect(outcome.instance.stacks).toBe(1)
    })

    test("extend：叠加持续时间", () => {
        const target = holder()
        applyBuffInstance(target, { ...base, duration: 1 })
        const outcome = applyBuffInstance(target, { ...base, now: 0.5, duration: 1, policy: "extend" })
        expect(outcome.instance.expiresAt).toBe(2)
        expect(outcome.instance.instanceId).toBe(1)
    })

    test("缺省 duration 为永久", () => {
        const target = holder()
        const outcome = applyBuffInstance(target, { ...base, policy: "refresh" })
        expect(outcome.instance.expiresAt).toBe(Number.POSITIVE_INFINITY)
        expect(outcome.instance.duration).toBe(Number.POSITIVE_INFINITY)
    })

    test("remove 返回被移除实例", () => {
        const target = holder()
        applyBuffInstance(target, { ...base, stacks: 4 })
        const removed = removeBuffInstance(target, 100)
        expect(removed?.stacks).toBe(4)
        expect(target.buffs).toHaveLength(0)
        expect(removeBuffInstance(target, 100)).toBeUndefined()
        expect(findBuff(target, 100)).toBeUndefined()
    })
})
