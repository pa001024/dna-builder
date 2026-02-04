import { describe, expect, it } from "vitest"
import { DNAAPI } from "."

describe("dna-api", () => {
    const api = new DNAAPI({ fetchFn: fetch })

    it("获取基础设置", async () => {
        api.server = "cn"
        expect(api.sign_api_urls.size).toBe(0)
        await api.initializeSignConfig()
        expect(api.sign_api_urls.size).toBeGreaterThan(0)
    })
    it("获取地图分类列表", async () => {
        const categorizeList = await api.getMapCategorizeList()
        expect(categorizeList.success).toBe(true)
    })

    // it("email login sendEmailVerifyCode", async () => {
    //     api.server = "global"
    //     const res = await api.user.sendEmailVerifyCode("?")
    //     expect(res.code).toBe(0)
    // })
    // it("email login sendEmailVerifyCode", async () => {
    //     api.server = "global"
    //     const res = await api.user.emailVerify("?", "5972")
    //     expect(res.code).toBe(0)
    //     console.log(res)
    // })
    // it("email login loginEmail", async () => {
    //     api.server = "global"
    //     const res = await api.user.loginEmail("?", "5972", "?", "a469aff1-5308-4ab8-a3xx-hgadf63a2c3f")
    //     console.log(res)
    //     expect(res.code).toBe(200)
    // })
    // it("email login decodeAccessToken", async () => {
    //     api.server = "global"
    //     api.token = "?"
    //     const res = await api.game.defaultRoleForTool()
    //     console.log(res)
    //     expect(res.code).toBe(200)
    // })
})
