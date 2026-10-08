import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    __resetHourVerifyRegistriesForTest,
    cancelAllHourSessions,
    createAbortError,
    getActiveHourSessionCount,
    getFirstSampleAt,
    getHourStart,
    getLastAdminPushHourStart,
    getVerifyAt,
    HOUR_VERIFY_WINDOW_MS,
    invokeHourAdminPush,
    isAbortError,
    isInVerifyWindow,
    runDoubleWriteVerify,
    runHourlyDoubleWriteSession,
    setHourAdminPushHandler,
    trackHourSession,
    waitWithSignal,
} from "./hour-verify"

const HOUR = new Date(2026, 4, 15, 10, 0, 0, 0).getTime()
const isSameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(HOUR)
    __resetHourVerifyRegistriesForTest()
})

afterEach(() => {
    __resetHourVerifyRegistriesForTest()
    vi.useRealTimers()
})

describe("整点时间口径", () => {
    it("应该按整点对齐首轮与验真时间点", () => {
        expect(getHourStart(HOUR + 5 * 60 * 1000)).toBe(HOUR)
        expect(getFirstSampleAt(HOUR)).toBe(HOUR + 80 * 1000)
        expect(getVerifyAt(HOUR)).toBe(HOUR + 110 * 1000)
    })

    it("应该只在整点 110 秒窗口内要求重排验真", () => {
        expect(isInVerifyWindow(HOUR + 10 * 1000, HOUR)).toBe(true)
        expect(isInVerifyWindow(HOUR + HOUR_VERIFY_WINDOW_MS, HOUR)).toBe(true)
        expect(isInVerifyWindow(HOUR + HOUR_VERIFY_WINDOW_MS + 1, HOUR)).toBe(false)
        expect(isInVerifyWindow(HOUR + 30 * 60 * 1000, HOUR)).toBe(false)
    })
})

describe("可取消等待", () => {
    it("应该在超时后 resolve", async () => {
        const pending = waitWithSignal(1000, new AbortController().signal)
        await vi.advanceTimersByTimeAsync(1000)
        await expect(pending).resolves.toBeUndefined()
    })

    it("应该在取消时以 AbortError reject", async () => {
        const controller = new AbortController()
        const pending = waitWithSignal(30 * 1000, controller.signal)
        const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" })
        controller.abort()
        await assertion
    })

    it("应该识别取消错误", () => {
        expect(isAbortError(createAbortError())).toBe(true)
        expect(isAbortError(new Error("网络失败"))).toBe(false)
        expect(isAbortError(null)).toBe(false)
    })
})

describe("二次写入验真", () => {
    it("三轮一致时应该只写首轮、推送一次", async () => {
        const sampleTimes: number[] = []
        const sample = vi.fn(async () => {
            sampleTimes.push(Date.now())
            return "A"
        })
        const writes: string[] = []
        const pushes: string[] = []
        const promise = runHourlyDoubleWriteSession({
            hourStart: HOUR,
            sample,
            isSame: (a, b) => a === b,
            onSample: value => {
                writes.push(value)
            },
            onVerifiedPush: async value => {
                pushes.push(value)
            },
            signal: new AbortController().signal,
        })
        await vi.advanceTimersByTimeAsync(80 * 1000)
        await vi.advanceTimersByTimeAsync(30 * 1000)
        await vi.advanceTimersByTimeAsync(30 * 1000)
        const result = await promise
        // 首轮 +80s 写入，验真 +110s，确认 +140s
        expect(sampleTimes).toEqual([HOUR + 80 * 1000, HOUR + 110 * 1000, HOUR + 140 * 1000])
        expect(writes).toEqual(["A"])
        expect(pushes).toEqual(["A"])
        expect(result).toMatchObject({ samples: 2, pushed: true, corrected: false })
    })

    it("第二轮不一致应该判首轮为假并覆盖写入", async () => {
        const sample = vi.fn(async () => "A")
        sample.mockResolvedValueOnce("A").mockResolvedValueOnce("B")
        const writes: string[] = []
        const pushes: string[] = []
        const promise = runHourlyDoubleWriteSession({
            hourStart: HOUR,
            sample,
            isSame: (a, b) => a === b,
            onSample: value => {
                writes.push(value)
            },
            onVerifiedPush: async value => {
                pushes.push(value)
            },
            signal: new AbortController().signal,
        })
        await vi.advanceTimersByTimeAsync(80 * 1000)
        await vi.advanceTimersByTimeAsync(30 * 1000)
        const result = await promise
        expect(writes).toEqual(["A", "B"])
        expect(pushes).toEqual(["B"])
        expect(result).toMatchObject({ samples: 1, pushed: true, corrected: true })
        // 不一致路径不再取第三轮
        await vi.advanceTimersByTimeAsync(60 * 1000)
        expect(sample).toHaveBeenCalledTimes(2)
    })

    it("前两轮一致、第三轮不一致应该再次推送修正", async () => {
        const sample = vi.fn(async () => "A")
        sample.mockResolvedValueOnce("A").mockResolvedValueOnce("A").mockResolvedValueOnce("C")
        const writes: string[] = []
        const pushes: string[] = []
        const promise = runHourlyDoubleWriteSession({
            hourStart: HOUR,
            sample,
            isSame: (a, b) => a === b,
            onSample: value => {
                writes.push(value)
            },
            onVerifiedPush: async value => {
                pushes.push(value)
            },
            signal: new AbortController().signal,
        })
        await vi.advanceTimersByTimeAsync(80 * 1000)
        await vi.advanceTimersByTimeAsync(30 * 1000)
        await vi.advanceTimersByTimeAsync(30 * 1000)
        const result = await promise
        expect(writes).toEqual(["A", "C"])
        expect(pushes).toEqual(["A", "C"])
        expect(result).toMatchObject({ samples: 2, pushed: true, corrected: true })
    })

    it("取消后应该不再取数与推送", async () => {
        const controller = new AbortController()
        const sample = vi.fn(async () => "A")
        const pushes: string[] = []
        const promise = runHourlyDoubleWriteSession({
            hourStart: HOUR,
            sample,
            isSame: (a, b) => a === b,
            onSample: () => {},
            onVerifiedPush: async value => {
                pushes.push(value)
            },
            signal: controller.signal,
        })
        const assertion = expect(promise).rejects.toMatchObject({ name: "AbortError" })
        await vi.advanceTimersByTimeAsync(10 * 1000)
        controller.abort()
        await assertion
        expect(sample).not.toHaveBeenCalled()
        expect(pushes).toEqual([])
    })
})

describe("会话注册表与推送注册表", () => {
    it("取消全部会话应该返回数量并中断等待", async () => {
        const first = trackHourSession("整点验真")
        const second = trackHourSession("管理员整点验真")
        expect(getActiveHourSessionCount()).toBe(2)
        const waiting = waitWithSignal(60 * 1000, first.signal)
        const assertion = expect(waiting).rejects.toMatchObject({ name: "AbortError" })
        expect(cancelAllHourSessions("弹窗立刻取数")).toBe(2)
        await assertion
        expect(first.signal.aborted).toBe(true)
        expect(second.signal.aborted).toBe(true)
        first.done()
        second.done()
        expect(getActiveHourSessionCount()).toBe(0)
    })

    it("未启用管理员推送时应该返回 false 且不记录", async () => {
        expect(await invokeHourAdminPush(HOUR, [["a"]])).toBe(false)
        expect(getLastAdminPushHourStart()).toBeNull()
    })

    it("推送失败时不应该记录整点", async () => {
        setHourAdminPushHandler(async () => {
            throw new Error("上传失败")
        })
        await expect(invokeHourAdminPush(HOUR, [["a"]])).rejects.toThrow("上传失败")
        expect(getLastAdminPushHourStart()).toBeNull()
    })
})

describe("启用 admin 推送时队列被取消", () => {
    it("应该提交正确数据：最后取数大于 80s 且被 80+30 验真", async () => {
        const STALE = [["旧委托"]]
        const FRESH = [["新委托"]]
        const pushed: string[][][] = []
        // 模拟“启用 admin 推送”：cron 启动时注册的处理函数
        setHourAdminPushHandler(async (_hourStart, missions) => {
            pushed.push(missions)
        })

        const sampleTimes: number[] = []
        const dnaSamples = [STALE, FRESH, FRESH]
        let callIndex = 0
        const sample = async () => {
            sampleTimes.push(Date.now())
            return dnaSamples[callIndex++]
        }
        const writes: string[][][] = []

        // 整点会话启动，首轮在 +80s 取到旧数据并写入
        const hourlyTracked = trackHourSession("整点验真")
        const hourly = runHourlyDoubleWriteSession({
            hourStart: HOUR,
            sample,
            isSame: isSameJson,
            onSample: value => {
                writes.push(value)
            },
            onVerifiedPush: null,
            signal: hourlyTracked.signal,
        })
        const hourlyAssertion = expect(hourly).rejects.toMatchObject({ name: "AbortError" })
        await vi.advanceTimersByTimeAsync(80 * 1000)
        expect(writes).toEqual([STALE])

        // 弹窗立刻取数：取消当前队列
        expect(cancelAllHourSessions("弹窗立刻取数")).toBe(1)
        await hourlyAssertion
        hourlyTracked.done()

        // 手动取到新数据并写入
        const manual = await sample()
        const manualAt = Date.now()
        writes.push(manual)
        expect(isInVerifyWindow(manualAt, HOUR)).toBe(true)

        // 在 80+30 秒处重排验真
        const reverifyTracked = trackHourSession("手动重验")
        const reverify = runDoubleWriteVerify({
            hourStart: HOUR,
            first: { value: manual, at: manualAt },
            verifyAt: getVerifyAt(HOUR),
            extraGapMs: 0,
            sample,
            isSame: isSameJson,
            onSample: value => {
                writes.push(value)
            },
            onVerifiedPush: async value => {
                await invokeHourAdminPush(HOUR, value)
            },
            signal: reverifyTracked.signal,
        })
        await vi.advanceTimersByTimeAsync(30 * 1000)
        const result = await reverify
        reverifyTracked.done()

        // 最后一次取数发生在 80+30 验真点，且大于 80s
        expect(sampleTimes).toEqual([HOUR + 80 * 1000, HOUR + 80 * 1000, HOUR + 110 * 1000])
        expect(sampleTimes[sampleTimes.length - 1]).toBe(HOUR + 110 * 1000)
        expect(sampleTimes[sampleTimes.length - 1]).toBeGreaterThan(HOUR + 80 * 1000)
        // 推送的是验真后的正确数据，且记录了所属整点
        expect(pushed).toEqual([FRESH])
        expect(getLastAdminPushHourStart()).toBe(HOUR)
        expect(result).toMatchObject({ pushed: true, corrected: false })
        expect(writes).toEqual([STALE, FRESH])
    })

    it("验真不一致应该判手动取数为假并推送修正数据", async () => {
        const FRESH = [["新委托"]]
        const FRESHER = [["更新委托"]]
        const pushed: string[][][] = []
        setHourAdminPushHandler(async (_hourStart, missions) => {
            pushed.push(missions)
        })
        const verifySample = vi.fn(async () => FRESHER)
        const writes: string[][][] = [FRESH]
        // 手动取数发生在整点后 90 秒，验真等待按当时时间只剩 20 秒
        vi.setSystemTime(HOUR + 90 * 1000)
        const reverifyTracked = trackHourSession("手动重验")
        const reverify = runDoubleWriteVerify({
            hourStart: HOUR,
            first: { value: FRESH, at: Date.now() },
            verifyAt: getVerifyAt(HOUR),
            extraGapMs: 0,
            sample: verifySample,
            isSame: isSameJson,
            onSample: value => {
                writes.push(value)
            },
            onVerifiedPush: async value => {
                await invokeHourAdminPush(HOUR, value)
            },
            signal: reverifyTracked.signal,
        })
        await vi.advanceTimersByTimeAsync(20 * 1000)
        const result = await reverify
        reverifyTracked.done()
        expect(verifySample).toHaveBeenCalledTimes(1)
        expect(writes).toEqual([FRESH, FRESHER])
        expect(pushed).toEqual([FRESHER])
        expect(result).toMatchObject({ pushed: true, corrected: true })
    })
})
