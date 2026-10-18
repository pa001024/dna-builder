import { beforeEach, describe, expect, it, vi } from "vitest"
import { getSafeModeVaultStatus, verifySafeModeVaultPassword } from "@/api/safe-mode"

function mockResponse(status: number, payload: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    } as Response
}

describe("安全模式恢复包接口", () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it("status 返回配置与分享信息", async () => {
        const payload = {
            configured: true,
            status: {
                fileName: "dna-builder-safe-mode-recovery.zip",
                fid: "fid-1",
                shareUrl: "https://pan.quark.cn/s/abc",
                size: 123,
                sha256: "deadbeef",
                uploadedAt: 1700000000000,
            },
        }
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => mockResponse(200, payload))
        )
        await expect(getSafeModeVaultStatus()).resolves.toEqual(payload)
    })

    it("verify 正确返回 true，401 返回 false", async () => {
        const stub = vi.fn(async (url: string) => {
            if (String(url).endsWith("/verify")) {
                return mockResponse(200, { success: true })
            }
            return mockResponse(404, {})
        })
        vi.stubGlobal("fetch", stub)
        await expect(verifySafeModeVaultPassword("K7QW-9M2X-6TFA-8HBD")).resolves.toBe(true)

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => mockResponse(401, { success: false, error: "恢复密码错误" }))
        )
        await expect(verifySafeModeVaultPassword("WRONG")).resolves.toBe(false)
    })

    it("服务端异常时抛错", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => mockResponse(500, { success: false }))
        )
        await expect(verifySafeModeVaultPassword("x")).rejects.toThrow("500")
        await expect(getSafeModeVaultStatus()).rejects.toThrow("500")
    })
})
