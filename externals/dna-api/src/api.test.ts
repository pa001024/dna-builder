import { describe, expect, it } from "bun:test"
import { DNAAPI } from "."

describe("dna-api", () => {
    const api = new DNAAPI({ fetchFn: fetch })

    it("获取基础设置", async () => {
        expect(api.sign_api_urls.size).toBe(0)
        await api.initializeSignConfig()
        expect(api.sign_api_urls.size).toBeGreaterThan(0)
    })
    it("获取地图分类列表", async () => {
        const categorizeList = await api.getMapCategorizeList()
        expect(categorizeList.success).toBe(true)
    })
})
