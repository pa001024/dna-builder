import { describe, expect, it } from "bun:test"
import { createIpLimiter, RateLimiter } from "./rate-limit"

/**
 * @description 构造一个由测试手动推进的时钟，避免真实等待。
 */
function createClock(start = 0) {
    let now = start
    return {
        now: () => now,
        advance(ms: number) {
            now += ms
        },
    }
}

describe("RateLimiter", () => {
    it("窗口内允许到上限，超出后拒绝并给出重试等待", () => {
        const clock = createClock()
        const limiter = new RateLimiter(2, 1000, clock.now)

        expect(limiter.allow("user:1")).toEqual({ allowed: true })
        expect(limiter.allow("user:1")).toEqual({ allowed: true })
        expect(limiter.allow("user:1")).toEqual({ allowed: false, retryAfterMs: 1000 })

        clock.advance(400)
        expect(limiter.allow("user:1")).toEqual({ allowed: false, retryAfterMs: 600 })

        clock.advance(600)
        expect(limiter.allow("user:1")).toEqual({ allowed: true })
    })

    it("不同 key 独立计数", () => {
        const clock = createClock()
        const limiter = new RateLimiter(1, 1000, clock.now)

        expect(limiter.allow("user:1").allowed).toBe(true)
        expect(limiter.allow("user:1").allowed).toBe(false)
        expect(limiter.allow("user:2").allowed).toBe(true)
        expect(limiter.allow("ip:1.2.3.4").allowed).toBe(true)
    })

    it("reset 清空全部计数", () => {
        const limiter = new RateLimiter(1, 1000)
        expect(limiter.allow("k").allowed).toBe(true)
        expect(limiter.allow("k").allowed).toBe(false)
        limiter.reset()
        expect(limiter.allow("k").allowed).toBe(true)
    })

    it("maxRequests 为 0 时全部拒绝并给出窗口等待", () => {
        const limiter = new RateLimiter(0, 1000)
        expect(limiter.allow("k")).toEqual({ allowed: false, retryAfterMs: 1000 })
    })

    it("大量不同 key 时桶数量有硬上限", () => {
        const limiter = new RateLimiter(10, 60_000)
        for (let index = 0; index < 12_000; index++) {
            limiter.allow(`ip:${index}`)
        }
        expect(limiter.size).toBeLessThanOrEqual(10_000)
    })
})

describe("createIpLimiter", () => {
    it("按转发头首跳区分 IP", () => {
        const clock = createClock()
        const limiter = createIpLimiter(1, 1000, clock.now)

        expect(limiter.allow(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })).allowed).toBe(true)
        expect(limiter.allow(new Headers({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" })).allowed).toBe(false)
        expect(limiter.allow(new Headers({ "x-forwarded-for": "5.6.7.8" })).allowed).toBe(true)
    })

    it("解析不到 IP 时共用 unknown 桶，避免无头请求绕过限额", () => {
        const clock = createClock()
        const limiter = createIpLimiter(1, 1000, clock.now)

        expect(limiter.allow(new Headers()).allowed).toBe(true)
        expect(limiter.allow(new Headers()).allowed).toBe(false)
    })

    it("user key 与 ip key 互不影响", () => {
        const clock = createClock()
        const limiter = createIpLimiter(1, 1000, clock.now)

        expect(limiter.allow(new Headers({ "x-real-ip": "10.0.0.1" })).allowed).toBe(true)
        expect(limiter.limiter.allow("user:1").allowed).toBe(true)
        expect(limiter.allow(new Headers({ "x-real-ip": "10.0.0.1" })).allowed).toBe(false)
    })
})
