import { describe, expect, it } from "vitest"
import { isDnaLoginInvalid } from "./dna-login"

describe("isDnaLoginInvalid", () => {
    it("msg 含失效/过期时判定失效", () => {
        expect(isDnaLoginInvalid({ code: 1001, msg: "token已失效", data: null, is_success: false })).toBe(true)
        expect(isDnaLoginInvalid({ code: 1001, msg: "登录已过期，请重新登录", data: null, is_success: false })).toBe(true)
    })

    it("msg 为空但 data 为空时判定失效（空值续期回归）", () => {
        expect(isDnaLoginInvalid({ code: 0, msg: "", data: null, is_success: true })).toBe(true)
        expect(isDnaLoginInvalid({ code: 0, msg: "", data: undefined, is_success: true })).toBe(true)
        expect(isDnaLoginInvalid({ code: 0, msg: "", data: {}, is_success: true })).toBe(true)
        expect(isDnaLoginInvalid({ code: 0, msg: "", data: "", is_success: true })).toBe(true)
        expect(isDnaLoginInvalid({ code: 200, msg: "", data: null, is_success: true })).toBe(true)
    })

    it("服务端非成功 code 判定失效", () => {
        expect(isDnaLoginInvalid({ code: 401, msg: "请重新登录", data: null, is_success: false })).toBe(true)
        expect(isDnaLoginInvalid({ code: 400, msg: "用户未登录", data: null, is_success: false })).toBe(true)
        expect(isDnaLoginInvalid({ code: 500, msg: "Internal Server Error", data: null, is_success: false })).toBe(true)
    })

    it("null 响应判定失效", () => {
        expect(isDnaLoginInvalid(null)).toBe(true)
        expect(isDnaLoginInvalid(undefined)).toBe(true)
    })

    it("客户端网络失败(-999)不触发续期", () => {
        expect(isDnaLoginInvalid({ code: -999, msg: "请求服务器失败,已达最大重试次数", data: undefined, is_success: false })).toBe(false)
    })

    it("正常登录态不触发续期", () => {
        expect(isDnaLoginInvalid({ code: 0, msg: "成功", data: { list: [{ id: 1 }] }, is_success: true })).toBe(false)
        expect(isDnaLoginInvalid({ code: 0, msg: "", data: { list: [] }, is_success: true })).toBe(false)
        expect(isDnaLoginInvalid({ code: 200, msg: "", data: { list: [] }, is_success: true })).toBe(false)
    })
})
