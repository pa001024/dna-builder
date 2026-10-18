import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HEARTBEAT_FAST_WAIT_MS, heartbeatFastStarted, retryAfterHeartbeatReady } from "./heartbeat"

const T0 = new Date(2026, 4, 15, 10, 0, 0, 0).getTime()

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
})

afterEach(() => {
    vi.useRealTimers()
})

describe("心跳快速启动", () => {
    it("握手慢时应该在 500ms 乐观返回，后台握手继续完成", async () => {
        let resolveReady!: (value: boolean) => void
        const ready = new Promise<boolean>(resolve => {
            resolveReady = resolve
        })
        const startedAt: number[] = []
        const started = heartbeatFastStarted(ready)
        void started.then(() => {
            startedAt.push(Date.now())
        })
        await vi.advanceTimersByTimeAsync(HEARTBEAT_FAST_WAIT_MS)
        // 500ms 到即返回，不会等到握手完成
        expect(startedAt).toEqual([T0 + HEARTBEAT_FAST_WAIT_MS])
        expect(await started).toBe(true)
        // 握手稍后在后台完成
        resolveReady(true)
        expect(await ready).toBe(true)
    })

    it("握手快速失败时应该直接返回失败 verdict", async () => {
        await expect(heartbeatFastStarted(Promise.resolve(false))).resolves.toBe(false)
    })

    it("握手快速抛错时应该直接抛出", async () => {
        await expect(heartbeatFastStarted(Promise.reject(new Error("建连失败")))).rejects.toThrow("建连失败")
    })
})

describe("就绪后重试", () => {
    it("首次失败应该等握手 resolve 后重试一次并成功", async () => {
        let calls = 0
        const task = async () => {
            calls++
            if (calls === 1) throw new Error("心跳未就绪")
            return "ok"
        }
        const result = await retryAfterHeartbeatReady(Promise.resolve(true), task)
        expect(result).toBe("ok")
        expect(calls).toBe(2)
    })

    it("首次成功时不应该重试", async () => {
        let calls = 0
        const result = await retryAfterHeartbeatReady(Promise.resolve(true), async () => {
            calls++
            return "ok"
        })
        expect(result).toBe("ok")
        expect(calls).toBe(1)
    })

    it("没有可等待的握手时应该直接抛原错误", async () => {
        let calls = 0
        await expect(
            retryAfterHeartbeatReady(null, async () => {
                calls++
                throw new Error("原错误")
            })
        ).rejects.toThrow("原错误")
        expect(calls).toBe(1)
    })

    it("握手本身失败时不应该重试", async () => {
        let calls = 0
        await expect(
            retryAfterHeartbeatReady(Promise.resolve(false), async () => {
                calls++
                throw new Error("原错误")
            })
        ).rejects.toThrow("原错误")
        expect(calls).toBe(1)
    })

    it("握手 promise  rejects 时不应该重试", async () => {
        let calls = 0
        await expect(
            retryAfterHeartbeatReady(Promise.reject(new Error("建连失败")), async () => {
                calls++
                throw new Error("原错误")
            })
        ).rejects.toThrow("原错误")
        expect(calls).toBe(1)
    })

    it("重试依然失败时应该抛出重试的错误", async () => {
        let calls = 0
        await expect(
            retryAfterHeartbeatReady(Promise.resolve(true), async () => {
                calls++
                throw new Error(`第${calls}次失败`)
            })
        ).rejects.toThrow("第2次失败")
        expect(calls).toBe(2)
    })
})
