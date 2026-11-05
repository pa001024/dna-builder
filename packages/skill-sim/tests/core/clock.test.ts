import { describe, expect, test } from "bun:test"
import { EventQueue, SimClock } from "../../src/core/clock"

describe("SimClock", () => {
    test("网格点用 index * dt 计算", () => {
        const clock = new SimClock(1, 0.25)
        expect(clock.peekGridTime()).toBe(0.25)
        clock.consumeGrid()
        expect(clock.peekGridTime()).toBe(0.5)
        clock.consumeGrid()
        clock.consumeGrid()
        expect(clock.peekGridTime()).toBe(1)
        clock.consumeGrid()
        expect(clock.peekGridTime()).toBe(Number.POSITIVE_INFINITY)
    })

    test("duration 不是 dt 整数倍时截止正确", () => {
        const clock = new SimClock(0.3, 0.2)
        expect(clock.peekGridTime()).toBe(0.2)
        clock.consumeGrid()
        expect(clock.peekGridTime()).toBe(Number.POSITIVE_INFINITY)
    })

    test("时钟不能倒退", () => {
        const clock = new SimClock(1, 0.1)
        clock.advanceTo(0.5)
        expect(() => clock.advanceTo(0.4)).toThrow()
    })

    test("非法参数直接报错", () => {
        expect(() => new SimClock(-1)).toThrow()
        expect(() => new SimClock(1, 0)).toThrow()
        expect(() => new SimClock(Number.NaN)).toThrow()
    })
})

describe("EventQueue", () => {
    test("按时间升序，同刻按插入序稳定", () => {
        const queue = new EventQueue<string>()
        queue.push(1, "a")
        queue.push(0.5, "b")
        queue.push(1, "c")
        queue.push(0.5, "d")
        expect(queue.pop()?.payload).toBe("b")
        expect(queue.pop()?.payload).toBe("d")
        expect(queue.pop()?.payload).toBe("a")
        expect(queue.pop()?.payload).toBe("c")
        expect(queue.pop()).toBeUndefined()
    })

    test("peekTime 空队列为 Infinity，push 后为最小值", () => {
        const queue = new EventQueue<number>()
        expect(queue.peekTime()).toBe(Number.POSITIVE_INFINITY)
        queue.push(2, 2)
        queue.push(1, 1)
        expect(queue.peekTime()).toBe(1)
        expect(queue.size).toBe(2)
        queue.clear()
        expect(queue.size).toBe(0)
    })

    test("同刻先按优先级（用户命令 0 < 内部到期 1），再按插入序", () => {
        const queue = new EventQueue<string>()
        queue.push(1, "expire", 1)
        queue.push(1, "refresh", 0)
        queue.push(1, "damage", 0)
        expect(queue.pop()?.payload).toBe("refresh")
        expect(queue.pop()?.payload).toBe("damage")
        expect(queue.pop()?.payload).toBe("expire")
    })

    test("snapshot 返回 (at, priority, seq) 排序副本", () => {
        const queue = new EventQueue<string>()
        queue.push(3, "c")
        queue.push(1, "a")
        queue.push(1, "b")
        expect(queue.snapshot().map(entry => entry.payload)).toEqual(["a", "b", "c"])
    })
})
