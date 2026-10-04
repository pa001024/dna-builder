import { describe, expect, it } from "vitest"
import type { AiLogToolCall, AiLogTurnRecord } from "@/api/aiLog"
import { turnsToChatMessages } from "./ai-log-replay"

/**
 * 构造一条轮次记录（只填转换器关心的字段，其余给安全默认值）。
 * @param overrides 覆盖字段。
 * @returns 轮次记录。
 */
function makeTurn(overrides: Partial<AiLogTurnRecord> = {}): AiLogTurnRecord {
    return {
        requestId: "req-1",
        sessionId: "fp-test",
        upstreamTraceId: null,
        upstreamCompletionId: null,
        time: "2026-10-04T08:00:00Z",
        day: "2026-10-04",
        model: "deepseek-chat",
        stream: false,
        status: 200,
        ok: true,
        durationMs: 1500,
        request: { messages: [], truncated: false, tools: [], temperature: null, maxTokens: null },
        response: { message: null, finishReason: "stop" },
        error: null,
        usage: null,
        costMicros: 0,
        ...overrides,
    }
}

/**
 * 构造一次工具调用。
 * @param overrides 覆盖字段。
 * @returns 工具调用。
 */
function makeToolCall(overrides: Partial<AiLogToolCall> = {}): AiLogToolCall {
    return { id: "call_1", type: "function", name: "全库检索", arguments: '{"keyword":"成就"}', ...overrides }
}

describe("turnsToChatMessages", () => {
    it("丢弃 system 提示词，每轮只保留最后一条 user 提问与助手回复", () => {
        const turns = [
            makeTurn({
                request: {
                    messages: [
                        { role: "system", content: "系统提示词" },
                        { role: "user", content: "第一条提问" },
                    ],
                    truncated: false,
                    tools: [],
                    temperature: null,
                    maxTokens: null,
                },
                response: {
                    message: { role: "assistant", content: "第一条回复", reasoningContent: null, toolCalls: [] },
                    finishReason: "stop",
                },
            }),
        ]

        const messages = turnsToChatMessages(turns)

        expect(messages).toHaveLength(2)
        expect(messages[0]).toMatchObject({ role: "user", content: "第一条提问" })
        expect(messages[1]).toMatchObject({ role: "assistant", content: "第一条回复" })
    })

    it("连续轮次的重复历史提问不重复展示", () => {
        const turns = [
            makeTurn({
                request: {
                    messages: [{ role: "user", content: "第一条提问" }],
                    truncated: false,
                    tools: [],
                    temperature: null,
                    maxTokens: null,
                },
            }),
            makeTurn({
                request: {
                    messages: [
                        { role: "user", content: "第一条提问" },
                        { role: "assistant", content: "第一条回复" },
                        { role: "user", content: "第二条提问" },
                    ],
                    truncated: false,
                    tools: [],
                    temperature: null,
                    maxTokens: null,
                },
            }),
        ]

        const contents = turnsToChatMessages(turns)
            .filter(message => message.role === "user")
            .map(message => message.content)

        expect(contents).toEqual(["第一条提问", "第二条提问"])
    })

    it("工具调用按 tool_call_id 配对下一轮请求里的结果原文", () => {
        const turns = [
            makeTurn({
                response: {
                    message: { role: "assistant", content: "", reasoningContent: "思考内容", toolCalls: [makeToolCall()] },
                    finishReason: "tool_calls",
                },
            }),
            makeTurn({
                request: {
                    messages: [
                        { role: "tool", tool_call_id: "call_1", content: "查询结果原文" },
                        { role: "assistant", content: "第一条回复" },
                        { role: "user", content: "追问" },
                    ],
                    truncated: false,
                    tools: [],
                    temperature: null,
                    maxTokens: null,
                },
                response: {
                    message: { role: "assistant", content: "最终回答", reasoningContent: null, toolCalls: [] },
                    finishReason: "stop",
                },
            }),
        ]

        const messages = turnsToChatMessages(turns)
        // 首轮请求里没有 user 消息，消息列表以助手回复开头
        const firstReply = messages[0]

        expect(firstReply.toolTraces).toHaveLength(1)
        expect(firstReply.toolTraces?.[0]).toMatchObject({
            id: "call_1",
            label: "全库检索",
            args: { keyword: "成就" },
            status: "done",
            result: "查询结果原文",
        })
        expect(firstReply.reasonings).toEqual([{ text: "思考内容", toolCallIds: ["call_1"] }])

        // 结果摘要取自结果原文，工具结果消息本身不再单独成条
        expect(firstReply.toolTraces?.[0].summary).toContain("查询结果原文")
        expect(messages.filter(message => message.role === "user").map(message => message.content)).toEqual(["追问"])
    })

    it("参数不是合法 JSON 时保留原文", () => {
        const turns = [
            makeTurn({
                response: {
                    message: {
                        role: "assistant",
                        content: "",
                        reasoningContent: null,
                        toolCalls: [makeToolCall({ arguments: "不是json" })],
                    },
                    finishReason: "tool_calls",
                },
            }),
        ]

        const messages = turnsToChatMessages(turns)

        expect(messages[0].toolTraces?.[0].args).toEqual({ raw: "不是json" })
    })

    it("Anthropic 格式：tool_result 块配对结果原文，且不当成用户提问", () => {
        const turns = [
            makeTurn({
                response: {
                    message: {
                        role: "assistant",
                        content: "",
                        reasoningContent: null,
                        toolCalls: [makeToolCall({ id: "call_00abc", name: "explain_damage" })],
                    },
                    finishReason: "tool_use",
                },
            }),
            makeTurn({
                request: {
                    messages: [
                        // 工具结果的载体消息（user 角色 + tool_result 块），不是真正的提问
                        {
                            role: "user",
                            content: [
                                {
                                    type: "tool_result",
                                    tool_use_id: "call_00abc",
                                    content: [{ type: "text", text: "抗性乘区 = (1 - 敌人抗性) * (1 + 属性穿透)" }],
                                },
                            ],
                        },
                        // 真正的下一轮提问
                        { role: "user", content: "那穿透怎么算" },
                    ],
                    truncated: false,
                    tools: [],
                    temperature: null,
                    maxTokens: null,
                },
                response: {
                    message: { role: "assistant", content: "最终回答", reasoningContent: null, toolCalls: [] },
                    finishReason: "stop",
                },
            }),
        ]

        const messages = turnsToChatMessages(turns)

        // 首轮请求里没有 user 消息，消息列表以助手回复开头
        expect(messages[0].toolTraces?.[0]).toMatchObject({ id: "call_00abc", result: "抗性乘区 = (1 - 敌人抗性) * (1 + 属性穿透)" })
        expect(messages.filter(message => message.role === "user").map(message => message.content)).toEqual(["那穿透怎么算"])
    })

    it("元信息小字带 token 数、费用与耗时，失败时带错误摘要", () => {
        const okTurn = makeTurn({
            usage: { prompt: 1234, completion: 567, total: 1801, cacheHit: 0, cacheMiss: 1234, output: 567 },
            costMicros: 3100,
            durationMs: 1500,
        })
        const failedTurn = makeTurn({ ok: false, error: { code: "502", type: "upstream", message: "上游超时", raw: null } })

        const messages = turnsToChatMessages([okTurn, failedTurn])

        // 两个轮次都没有 user 提问，各产出一条助手回复
        expect(messages[0].metaNote).toContain("输入 1,234 / 输出 567")
        expect(messages[0].metaNote).toContain("¥0.0031")
        expect(messages[0].metaNote).toContain("1.50s")
        expect(messages[1].metaNote).toContain("失败 [502] 上游超时")
    })
})
