import { describe, expect, it } from "bun:test"
import { DNAAPI } from "."

describe("dna-api", () => {
    const api = new DNAAPI("", "", { fetchFn: fetch })

    it("获取地图分类列表", async () => {
        const categorizeList = await api.getMapCategorizeList()
        expect(categorizeList.success).toBe(true)
    })
})
