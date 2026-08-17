import { DNA_GAME_ID, DNAAPI, TimeBasicResponse } from "dna-api"
import { describe, expect, it, vi } from "vitest"

describe("DNA 手机号登录", () => {
    it("使用与验证码一致的 H5 协议登录", async () => {
        const api = new DNAAPI({ dev_code: "test-device-code" })
        const response = new TimeBasicResponse({
            code: 200,
            data: {
                token: "test-token",
            },
        })
        const request = vi.spyOn(api, "_dna_request_h5").mockResolvedValue(response)

        const result = await api.login("13800138000", "123456")

        expect(request).toHaveBeenCalledWith(
            "user/sdkLogin",
            {
                mobile: "13800138000",
                code: "123456",
                gameList: DNA_GAME_ID,
            },
            { sign: true }
        )
        expect(result).toBe(response)
        expect(api.token).toBe("test-token")
    })
})
