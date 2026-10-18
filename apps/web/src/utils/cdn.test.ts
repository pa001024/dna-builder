import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { env } from "@/env"
import {
    buildCdnUrl,
    fetchWithCdnFallback,
    getActiveCdnBase,
    getActiveCdnSide,
    getOtherCdnBase,
    probeCdnSpeed,
    resetCdnProbe,
    resolveCdnUrls,
    swapCdnBase,
} from "./cdn"

/** 把字节数与耗时包装成带流的响应，模拟测速取样 */
function streamResponse(bytes: number, chunks = 4): Response {
    const size = Math.ceil(bytes / chunks)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (sent >= bytes) {
                controller.close()
                return
            }
            const current = Math.min(size, bytes - sent)
            sent += current
            controller.enqueue(new Uint8Array(current))
        },
    })
    return { ok: true, status: 200, body, arrayBuffer: async () => new ArrayBuffer(bytes) } as unknown as Response
}

describe("地址构造", () => {
    it("resolveCdnUrls 给出两端固定地址", () => {
        const urls = resolveCdnUrls("apk/latest.json")
        expect(urls.primary).toBe(`${env.cdn}/apk/latest.json`)
        expect(urls.backup).toBe(`${env.cdnBackup}/apk/latest.json`)
        expect(urls.primary).not.toBe(urls.backup)
    })

    it("buildCdnUrl 按当前选定端拼地址，容忍前导斜杠", () => {
        expect(buildCdnUrl("/img/res/a.webp")).toBe(`${getActiveCdnBase()}/img/res/a.webp`)
    })

    it("swapCdnBase 在两端之间来回切换，非本站地址返回 null", () => {
        const onOss = `${env.cdn}/img/res/a.webp`
        const onR2 = swapCdnBase(onOss)
        expect(onR2).toBe(`${env.cdnBackup}/img/res/a.webp`)
        expect(swapCdnBase(onR2 as string)).toBe(onOss)
        expect(swapCdnBase("/imgs/local.webp")).toBeNull()
        expect(swapCdnBase("")).toBeNull()
    })
})

describe("probeCdnSpeed", () => {
    beforeEach(() => {
        resetCdnProbe()
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        resetCdnProbe()
    })

    it("两端都能测速时选吞吐更高的一端", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            // R2 造得更慢：加入延迟让吞吐明显更低
            const isBackup = url.startsWith(env.cdnBackup)
            if (isBackup) {
                await new Promise(resolve => setTimeout(resolve, 60))
            }
            return streamResponse(256 * 1024)
        })
        vi.stubGlobal("fetch", fetchMock)

        const result = await probeCdnSpeed()
        expect(result.speeds.oss).toBeGreaterThan(0)
        expect(result.speeds.r2).toBeGreaterThan(0)
        expect(result.side).toBe("oss")
        expect(getActiveCdnBase()).toBe(env.cdn)
    })

    it("兜底端明显更快时改用它", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            const isPrimary = url.startsWith(`${env.cdn}/`)
            if (isPrimary) {
                await new Promise(resolve => setTimeout(resolve, 60))
            }
            return streamResponse(256 * 1024)
        })
        vi.stubGlobal("fetch", fetchMock)

        const result = await probeCdnSpeed()
        expect(result.side).toBe("r2")
        expect(getActiveCdnBase()).toBe(env.cdnBackup)
        // 选定后 fetchWithCdnFallback 应先打选定的快源
        fetchMock.mockClear()
        fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
        await fetchWithCdnFallback("x")
        expect(fetchMock.mock.calls[0][0]).toBe(`${env.cdnBackup}/x`)
    })

    it("一端失败时用另一端", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.startsWith(env.cdnBackup)) {
                throw new Error("down")
            }
            return streamResponse(256 * 1024)
        })
        vi.stubGlobal("fetch", fetchMock)

        const result = await probeCdnSpeed()
        expect(result.speeds.r2).toBeNull()
        expect(result.side).toBe("oss")
    })

    it("两端都失败时保持主源，不抛错", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("all down")))
        const result = await probeCdnSpeed()
        expect(result.speeds).toEqual({ oss: null, r2: null })
        expect(result.side).toBe("oss")
    })

    it("并发调用只测一次", async () => {
        const fetchMock = vi.fn(async () => streamResponse(256 * 1024))
        vi.stubGlobal("fetch", fetchMock)

        await Promise.all([probeCdnSpeed(), probeCdnSpeed(), probeCdnSpeed()])
        // 两端各一次，共 2 次
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("测速后 getActiveCdnSide / getOtherCdnBase 与选定端一致", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => streamResponse(256 * 1024))
        )
        await probeCdnSpeed()

        const side = getActiveCdnSide()
        expect(getActiveCdnBase()).toBe(side === "oss" ? env.cdn : env.cdnBackup)
        expect(getOtherCdnBase()).toBe(side === "oss" ? env.cdnBackup : env.cdn)
    })
})

describe("fetchWithCdnFallback", () => {
    beforeEach(() => {
        resetCdnProbe()
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        resetCdnProbe()
    })

    it("选定快源失败时换另一端", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce({ ok: true, status: 200 })
        vi.stubGlobal("fetch", fetchMock)

        const response = await fetchWithCdnFallback("apk/latest.json")
        expect(response.ok).toBe(true)
        expect(fetchMock.mock.calls[0][0]).toBe(`${env.cdn}/apk/latest.json`)
        expect(fetchMock.mock.calls[1][0]).toBe(`${env.cdnBackup}/apk/latest.json`)
    })

    it("两端都失败时抛错", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("both down")))
        await expect(fetchWithCdnFallback("x")).rejects.toThrow("both down")
    })

    it("调用方已中止信号时不重试另一端", async () => {
        const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
            return new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
            })
        })
        vi.stubGlobal("fetch", fetchMock)

        const controller = new AbortController()
        const promise = fetchWithCdnFallback("x", { signal: controller.signal })
        controller.abort()

        await expect(promise).rejects.toThrow("aborted")
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
