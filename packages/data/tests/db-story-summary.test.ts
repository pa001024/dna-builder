/**
 * 剧情 AI 总结（storysummary.data.ts）在剧情检索工具里的透出测试。
 *
 * 覆盖三件事：
 * 1. `search_story` 关键词检索的命中里带整链总结，且与数据源逐字一致；
 * 2. 纯筛选列举（无关键词）不带总结，避免一次返回十几段梗概刷屏；
 * 3. `read_story` 的 chain 里带总结，模型补上下文时不必逐行翻原文。
 */

import { describe, expect, it } from "vitest"
import questChainData from "@/data/d/questchain.data"
import { storySummaryData } from "@/data/d/storysummary.data"
import { readStory, searchStory } from "@/utils/db-search"

/** 取一条「任务链存在且带总结」的样本：既验证数据接线，也保证用例不受数据版本变化影响 */
function pickSampleChain(): { chainId: number; chainName: string; summary: string } {
    for (const chain of questChainData) {
        const summary = storySummaryData[chain.id]

        if (summary) {
            return { chainId: chain.id, chainName: chain.name, summary }
        }
    }

    throw new Error("数据里没有任何任务链带 AI 总结，测试样本无法构造")
}

describe("剧情检索附带 AI 总结", () => {
    it("关键词检索时命中里带整链总结", async () => {
        const { chainId, chainName, summary } = pickSampleChain()
        const result = await searchStory(chainName, { limit: 12 })

        const hit = result.hits.find(item => item.chainId === chainId)

        expect(hit).toBeDefined()
        // 数据无占位符与富文本标签，清洗只会 trim，因此这里可以逐字对比
        expect(hit?.summary).toBe(summary)
        expect(result.note).toContain("summary")
    }, 60000)

    it("纯筛选列举（无关键词）不返回总结", async () => {
        const result = await searchStory("", { filters: { type: "主线任务" }, limit: 12 })

        expect(result.hits.length).toBeGreaterThan(0)
        expect(result.hits.every(hit => hit.summary === undefined)).toBe(true)
    }, 60000)

    it("read_story 的 chain 带总结，并给出引用提示", async () => {
        const { chainId, summary } = pickSampleChain()
        const result = await readStory(chainId, { limit: 5 })

        expect(result.chain?.chainId).toBe(chainId)
        expect(result.chain?.summary).toBe(summary)
        expect(result.note).toContain("summary")
    }, 60000)

    it("没有总结的任务链照常返回原文，只是不带 summary", async () => {
        const empty = questChainData.find(chain => !storySummaryData[chain.id])
        expect(empty).toBeDefined()

        const result = await readStory(empty!.id, { limit: 5 })

        expect(result.chain?.chainId).toBe(empty!.id)
        expect(result.chain?.summary).toBeUndefined()
        expect(result.note).toBeUndefined()
    }, 60000)
})
