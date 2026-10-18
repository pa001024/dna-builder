import { describe, expect, it } from "vitest"
import { parseDnaUserImportJson } from "./dna-user-import"

const accountData = {
    applyCancel: 0,
    gender: 3,
    headUrl: "https://example.com/head.png",
    userName: "pa酱",
    dNum: "device-code",
    userId: "771982846880385716",
    token: "access-token",
    refreshToken: "refresh-token",
    isOfficial: 0,
    isRegister: 0,
    status: 0,
    isComplete: 1,
    registerLang: "",
}

describe("parseDnaUserImportJson", () => {
    it("supports the official API response wrapper", () => {
        expect(
            parseDnaUserImportJson(
                JSON.stringify({
                    code: 200,
                    data: accountData,
                    msg: "请求成功",
                    success: true,
                })
            )
        ).toEqual({
            uid: "771982846880385716",
            name: "pa酱",
            dev_code: "device-code",
            token: "access-token",
            server: "cn",
            kf_token: "",
            refreshToken: "refresh-token",
            pic: "https://example.com/head.png",
            status: 0,
            isComplete: 1,
            isOfficial: 0,
            isRegister: 0,
        })
    })

    it("supports directly copied data and legacy field names", () => {
        expect(
            parseDnaUserImportJson(
                JSON.stringify({
                    uid: "100",
                    name: "legacy",
                    dev_code: "legacy-device",
                    token: "legacy-token",
                    server: "global",
                    kf_token: "kf-token",
                    refreshToken: "legacy-refresh",
                    pic: "legacy-pic",
                    status: 1,
                    isComplete: 1,
                })
            )
        ).toMatchObject({
            uid: "100",
            name: "legacy",
            dev_code: "legacy-device",
            token: "legacy-token",
            server: "global",
            kf_token: "kf-token",
            refreshToken: "legacy-refresh",
            pic: "legacy-pic",
            status: 1,
            isComplete: 1,
        })
    })

    it("rejects JSON without an account ID or token", () => {
        expect(() => parseDnaUserImportJson(JSON.stringify({ data: { userName: "missing" } }))).toThrow(
            "账号 JSON 缺少 userId/uid 或 token"
        )
    })
})
