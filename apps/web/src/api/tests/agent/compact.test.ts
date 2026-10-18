import { describe, expect, it } from "vitest"
import {
    buildCompactedMessageText,
    compactWireMessages,
    formatCompactSummary,
    groupRoundStartIndexes,
    resolveAutoCompactThreshold,
} from "@/api/agent/compact"
import { buildContextEstimate, estimateTextTokens, resolveModelContextWindow } from "@/api/agent/context-usage"
import type { AgentRoundRequest, AgentRoundResult, AgentTransport, AgentWireMessage } from "@/api/agent/wire"

/**
 * @description 造一个「按脚本返回摘要」的传输实现，把压缩行为钉死。
 * @param responses 逐次请求的返回（耗尽后重复最后一条）
 * @returns 传输实现与收到的请求记录
 */
function createSummaryTransport(responses: Array<{ text: string; toolCalls?: AgentRoundResult["toolCalls"] }>): {
    transport: AgentTransport
    requests: AgentRoundRequest[]
} {
    const requests: AgentRoundRequest[] = []
    let index = 0

    const transport: AgentTransport = {
        protocol: "chat",
        async runRound(request) {
            requests.push(request)
            const response = responses[Math.min(index, responses.length - 1)]
            index += 1

            return { text: response.text, thinking: "", toolCalls: response.toolCalls ?? [], finishReason: "stop" }
        },
    }

    return { transport, requests }
}

/**
 * @description 造一条文本历史（纯文本轮，便于下标对齐断言）。
 * @param texts 依次的用户 / 助手正文
 * @returns 协议中立的对话消息
 */
function textHistory(...texts: string[]): AgentWireMessage[] {
    return texts.map((text, index) =>
        index % 2 === 0 ? { role: "user" as const, text } : { role: "assistant" as const, text, thinking: "", toolCalls: [] }
    )
}

describe("上下文用量估算", () => {
    it("CJK 字符按 2 倍权重估算 tokens", () => {
        // 9 个汉字 → 18 / 3 = 6
        expect(estimateTextTokens("赛琪的构筑推荐清单")).toBe(6)
        // 13 个 ASCII 字符 → ceil(13 / 3) = 5
        expect(estimateTextTokens("hello world!!")).toBe(5)
        // 混合文本：4 汉字 + 6 ASCII（含空格）→ (8 + 6) / 3 = 4.67 → 5
        expect(estimateTextTokens("构筑推荐 build")).toBe(5)
        expect(estimateTextTokens("")).toBe(0)
    })

    it("按模型名解析上下文窗口（对齐 ZCode 内置模型表）", () => {
        expect(resolveModelContextWindow("glm-4.6v-flash")).toBe(131_072)
        expect(resolveModelContextWindow("glm-4.6")).toBe(200_000)
        expect(resolveModelContextWindow("glm-4.7-flash")).toBe(200_000)
        expect(resolveModelContextWindow("glm-5.3-flash")).toBe(1_000_000)
        expect(resolveModelContextWindow("deepseek-flash")).toBe(1_000_000)
        expect(resolveModelContextWindow("deepseek-chat")).toBe(131_072)
        expect(resolveModelContextWindow("unknown-model")).toBe(131_072)
    })

    it("分类估算覆盖系统提示词、工具声明与消息", () => {
        const estimate = buildContextEstimate({
            system: "系统提示词",
            tools: [{ name: "search", description: "工具说明", parameters: { type: "object" } }],
            messages: [{ role: "user", text: "你好" }],
        })

        expect(estimate.categories.systemPrompt).toBeGreaterThan(0)
        expect(estimate.categories.systemTools).toBeGreaterThan(0)
        expect(estimate.categories.messages).toBeGreaterThan(0)
        expect(estimate.total).toBe(estimate.categories.messages + estimate.categories.systemTools + estimate.categories.systemPrompt)
    })
})

describe("压缩阈值与轮次分组", () => {
    it("阈值 = 窗口 - 输出预留 - 安全缓冲", () => {
        // 131072 - min(32768, 21000) - 13000 = 97072
        expect(resolveAutoCompactThreshold(131_072, 32_768)).toBe(97_072)
        // 输出上限小于预留时按实际上限预留
        expect(resolveAutoCompactThreshold(200_000, 8_192)).toBe(200_000 - 8_192 - 13_000)
    })

    it("每条助手消息开启新的一轮", () => {
        const messages = textHistory("问1", "答1", "问2", "答2", "追问")

        // 助手消息在下标 1 / 3：轮起点是 0（首组以用户消息开头）、1、3
        expect(groupRoundStartIndexes(messages)).toEqual([0, 1, 3])
        expect(groupRoundStartIndexes([])).toEqual([0])
    })
})

describe("摘要整理", () => {
    it("优先取 summary 标签内文", () => {
        expect(formatCompactSummary("<analysis>思考</analysis><summary>摘要正文</summary>")).toBe("摘要正文")
    })

    it("没有 summary 标签时剥掉 analysis 段兜底", () => {
        expect(formatCompactSummary("<analysis>思考</analysis>剩余正文")).toBe("剩余正文")
        expect(formatCompactSummary("纯文本回复")).toBe("纯文本回复")
        expect(formatCompactSummary("")).toBe("")
    })

    it("压缩消息文本包含摘要正文与来历说明", () => {
        const text = buildCompactedMessageText("摘要正文")

        expect(text).toContain("<summary>")
        expect(text).toContain("摘要正文")
        expect(text).toContain("压缩")
    })
})

describe("compactWireMessages", () => {
    it("助手轮不足两轮时返回 null（无需压缩）", async () => {
        const { transport } = createSummaryTransport([{ text: "<summary>摘要</summary>" }])

        expect(await compactWireMessages(toolsAnd({ transport, messages: textHistory("问1", "答1") }))).toBeNull()
        expect(await compactWireMessages(toolsAnd({ transport, messages: textHistory("问1") }))).toBeNull()
    })

    it("原样保留最近一轮，其余替换为摘要", async () => {
        const { transport, requests } = createSummaryTransport([{ text: "<analysis>思考</analysis><summary>历史摘要</summary>" }])
        const messages = textHistory("问1", "答1", "问2", "答2", "问3", "答3", "追问")

        const outcome = await compactWireMessages(toolsAnd({ transport, messages }))

        expect(outcome).not.toBeNull()
        // 保留轮 = 最后一条助手消息及其后的用户消息
        expect(outcome!.keptCount).toBe(2)
        expect(outcome!.summarizedCount).toBe(5)
        expect(outcome!.messages).toEqual([{ role: "user", text: outcome!.compactedText }, ...messages.slice(5)])
        expect(outcome!.compactedText).toContain("历史摘要")
        // 摘要请求包含被压缩的消息与压缩指令，且工具声明在场（防 DSML 泄露）
        expect(requests).toHaveLength(1)
        expect(requests[0].tools).toHaveLength(1)
        expect(requests[0].messages.at(-1)?.role).toBe("user")
    })

    it("模型未返回摘要文本时按保留轮数逐级重试", async () => {
        // 第一次抢着调工具（无正文），第二次正常返回摘要
        const { transport, requests } = createSummaryTransport([
            { text: "", toolCalls: [{ id: "c1", name: "search", arguments: "{}" }] },
            { text: "<summary>重试后的摘要</summary>" },
        ])
        const messages = textHistory("问1", "答1", "问2", "答2", "问3")

        const outcome = await compactWireMessages(toolsAnd({ transport, messages }))

        expect(outcome).not.toBeNull()
        expect(outcome!.compactedText).toContain("重试后的摘要")
        expect(requests).toHaveLength(2)
    })

    it("全部重试失败后抛出最后一个错误", async () => {
        const { transport } = createSummaryTransport([{ text: "" }])

        await expect(compactWireMessages(toolsAnd({ transport, messages: textHistory("问1", "答1", "问2", "答2") }))).rejects.toThrow(
            "模型未返回摘要文本"
        )
    })

    it("压缩后上下文估算显著下降", async () => {
        const { transport } = createSummaryTransport([{ text: "<summary>很短的摘要</summary>" }])
        const messages = textHistory(
            "很长的问题一".repeat(50),
            "很长的回答一".repeat(50),
            "很长的问题二".repeat(50),
            "很长的回答二".repeat(50),
            "追问"
        )

        const outcome = await compactWireMessages(toolsAnd({ transport, messages }))

        expect(outcome).not.toBeNull()
        expect(outcome!.preTokens).toBeGreaterThan(outcome!.postTokens)
    })
})

/**
 * @description 给压缩输入补上公共的装配字段（传输之外的部分），减少用例样板。
 * @param partial 传输与消息
 * @returns 完整的压缩装配
 */
function toolsAnd(partial: { transport: AgentTransport; messages: AgentWireMessage[] }) {
    return {
        ...partial,
        model: "glm-4.6v-flash",
        system: "系统提示词",
        tools: [{ name: "search", description: "工具", parameters: { type: "object" as const } }],
        temperature: 0.4,
        maxTokens: 8_192,
    }
}
