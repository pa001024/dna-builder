import { describe, expect, it } from "bun:test"
import {
    createStreamAggregator,
    extractContentText,
    extractToolNames,
    extractUpstreamCompletionId,
    normalizeLogUsage,
    normalizeSessionId,
    parseUpstreamError,
    resolveClientIp,
    resolveLogCostMicros,
    resolveSessionId,
    stringifyErrorRaw,
    summarizeMessages,
    truncateMessages,
} from "./ai-log-format"

/** 构造一个带会话历史的请求消息数组。 */
function messagesWithAnchor(anchor: string, extra: unknown[] = []) {
    return [{ role: "system", content: "系统提示词" }, { role: "user", content: anchor }, ...extra]
}

/** 造一个头集合，模拟请求头。 */
function makeHeaders(init: Record<string, string> = {}): Headers {
    return new Headers(init)
}

describe("normalizeSessionId", () => {
    it("接受常规 id", () => {
        expect(normalizeSessionId("conv-0a1b_2.C")).toBe("conv-0a1b_2.C")
        expect(normalizeSessionId("  trimmed  ")).toBe("trimmed")
    })

    it("拒绝路径穿越、超长与非字符串", () => {
        expect(normalizeSessionId("..")).toBeNull()
        expect(normalizeSessionId(".")).toBeNull()
        expect(normalizeSessionId("a..b")).toBeNull()
        expect(normalizeSessionId("abc.")).toBeNull()
        expect(normalizeSessionId(".hidden")).toBeNull()
        expect(normalizeSessionId("a/b")).toBeNull()
        expect(normalizeSessionId("a\\b")).toBeNull()
        expect(normalizeSessionId("x".repeat(65))).toBeNull()
        expect(normalizeSessionId("")).toBeNull()
        expect(normalizeSessionId(undefined)).toBeNull()
        expect(normalizeSessionId(123)).toBeNull()
    })
})

describe("resolveSessionId", () => {
    it("会话 id 一律是服务端指纹（上游不返回会话级标识）", () => {
        const sessionId = resolveSessionId({ userId: "u1", messages: messagesWithAnchor("你好") })
        expect(sessionId.startsWith("fp-")).toBe(true)
        expect(sessionId.length).toBe(19)
    })

    it("同一会话的多轮请求归并到同一个会话", () => {
        const first = resolveSessionId({ userId: "u1", messages: messagesWithAnchor("第一个问题") })
        const second = resolveSessionId({
            userId: "u1",
            messages: messagesWithAnchor("第一个问题", [
                { role: "assistant", content: "回答" },
                { role: "user", content: "追问" },
            ]),
        })
        expect(second).toBe(first)
    })

    it("不同开场白或不同账号落到不同会话", () => {
        const base = resolveSessionId({ userId: "u1", messages: messagesWithAnchor("问题 A") })
        expect(resolveSessionId({ userId: "u1", messages: messagesWithAnchor("问题 B") })).not.toBe(base)
        expect(resolveSessionId({ userId: "u2", messages: messagesWithAnchor("问题 A") })).not.toBe(base)
    })

    it("没有 user 消息时也能得到稳定的匿名会话", () => {
        const messages = [{ role: "system", content: "只有系统提示" }]
        expect(resolveSessionId({ userId: null, messages })).toBe(resolveSessionId({ userId: null, messages }))
    })
})

describe("extractUpstreamCompletionId", () => {
    it("取出响应体或 SSE chunk 上的补全 id", () => {
        expect(extractUpstreamCompletionId({ id: "abc-123", object: "chat.completion" })).toBe("abc-123")
        expect(extractUpstreamCompletionId({ id: "abc-123", object: "chat.completion.chunk" })).toBe("abc-123")
    })

    it("缺失或类型不符时返回 null", () => {
        expect(extractUpstreamCompletionId({})).toBeNull()
        expect(extractUpstreamCompletionId({ id: "" })).toBeNull()
        expect(extractUpstreamCompletionId({ id: 42 })).toBeNull()
        expect(extractUpstreamCompletionId(null)).toBeNull()
        expect(extractUpstreamCompletionId([{ id: "x" }])).toBeNull()
    })
})

describe("extractContentText", () => {
    it("兼容字符串与多模态数组", () => {
        expect(extractContentText("纯文本")).toBe("纯文本")
        expect(
            extractContentText([
                { type: "text", text: "第一段" },
                { type: "image_url", image_url: { url: "http://x/a.png" } },
                { type: "text", text: "第二段" },
            ])
        ).toBe("第一段\n第二段")
        expect(extractContentText(null)).toBe("")
        expect(extractContentText(42)).toBe("")
    })
})

describe("summarizeMessages", () => {
    it("统计角色分布并取最后一条 user 消息", () => {
        const summary = summarizeMessages([
            { role: "system", content: "s" },
            { role: "user", content: "第一问" },
            { role: "assistant", content: "答", tool_calls: [] },
            { role: "tool", tool_call_id: "call_1", content: "结果" },
            { role: "user", content: "第二问" },
        ])

        expect(summary.messageCount).toBe(5)
        expect(summary.roles).toEqual({ system: 1, user: 2, assistant: 1, tool: 1, other: 0 })
        expect(summary.lastUserMessage).toBe("第二问")
    })

    it("超长 user 消息按上限截断", () => {
        const summary = summarizeMessages([{ role: "user", content: "x".repeat(50) }], 10)
        expect(summary.lastUserMessage).toBe(`${"x".repeat(10)}…[truncated]`)
    })
})

describe("extractToolNames", () => {
    it("只取函数名", () => {
        expect(
            extractToolNames([
                { type: "function", function: { name: "search", parameters: { type: "object" } } },
                { type: "function", function: { name: "ask_user" } },
                { name: "plain" },
                { type: "function" },
            ])
        ).toEqual(["search", "ask_user", "plain"])
        expect(extractToolNames(undefined)).toEqual([])
    })
})

describe("truncateMessages", () => {
    it("超长正文被截断并打标记", () => {
        const { messages, truncated } = truncateMessages([{ role: "user", content: "a".repeat(20) }], 5)
        expect(truncated).toBe(true)
        expect((messages[0] as { content: string }).content).toBe("aaaaa…[truncated 15 chars]")
    })

    it("工具调用参数同样受上限约束", () => {
        const { messages, truncated } = truncateMessages(
            [{ role: "assistant", tool_calls: [{ id: "c1", function: { name: "f", arguments: "b".repeat(20) } }] }],
            5
        )
        expect(truncated).toBe(true)
        expect((messages[0] as { tool_calls: Array<{ function: { arguments: string } }> }).tool_calls[0].function.arguments).toBe(
            "bbbbb…[truncated 15 chars]"
        )
    })

    it("非正数上限表示不截断", () => {
        const { truncated } = truncateMessages([{ role: "user", content: "a".repeat(100) }], 0)
        expect(truncated).toBe(false)
    })

    it("内联图片整块脱敏，不留 Base64 残片", () => {
        const { messages } = truncateMessages(
            [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "这把武器叫什么？" },
                        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "A".repeat(5000) } },
                        { type: "image_url", image_url: { url: `data:image/png;base64,${"B".repeat(5000)}` } },
                        { type: "image_url", image_url: { url: "https://example.com/a.png" } },
                    ],
                },
            ],
            100_000
        )

        const parts = (messages[0] as { content: Array<Record<string, unknown>> }).content

        // 脱敏发生在截断之前，因此无论上限多大都不会把 Base64 写进日志
        expect(parts).toHaveLength(4)
        expect(parts[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "[image omitted]" } })
        expect(parts[2]).toEqual({ type: "image_url", image_url: { url: "[image omitted]" } })
        // 外链只是文本，保留原样供排查
        expect(parts[3]).toEqual({ type: "image_url", image_url: { url: "https://example.com/a.png" } })
        expect(JSON.stringify(parts)).not.toContain("AAAAA")
    })
})

describe("用量与费用", () => {
    it("归一化出三档 tokens 与总量", () => {
        expect(
            normalizeLogUsage({ prompt_tokens: 120, prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 20, completion_tokens: 7 })
        ).toEqual({ prompt: 120, completion: 7, total: 127, cacheHit: 100, cacheMiss: 20, output: 7 })
        expect(normalizeLogUsage(undefined)).toBeNull()
    })

    it("费用口径与 ai-pricing 一致", () => {
        const usage = { prompt_tokens: 1000, prompt_cache_hit_tokens: 400, prompt_cache_miss_tokens: 600, completion_tokens: 100 }
        // 空闲：400×0.02 + 600×1 + 100×4 = 1008 微元；高峰翻倍
        expect(resolveLogCostMicros(usage, false)).toBe(1008)
        expect(resolveLogCostMicros(usage, true)).toBe(2016)
        expect(resolveLogCostMicros(undefined, false)).toBe(0)
    })
})

describe("resolveClientIp", () => {
    it("优先取转发头的第一跳", () => {
        expect(resolveClientIp(makeHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4")
    })

    it("退回真实 IP 头与直连地址", () => {
        expect(resolveClientIp(makeHeaders({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9")
        expect(resolveClientIp(makeHeaders(), "127.0.0.1")).toBe("127.0.0.1")
        expect(resolveClientIp(makeHeaders())).toBeNull()
    })
})

describe("parseUpstreamError", () => {
    it("解析 OpenAI 兼容错误体", () => {
        expect(parseUpstreamError({ error: { message: "额度不足", type: "insufficient_quota", code: "402" } }, "兜底")).toEqual({
            message: "额度不足",
            type: "insufficient_quota",
            code: "402",
        })
    })

    it("非标准错误体退回兜底消息", () => {
        expect(parseUpstreamError("boom", "兜底")).toEqual({ message: "兜底", type: "api_error", code: "upstream_error" })
    })
})

describe("stringifyErrorRaw", () => {
    it("序列化对象并截断超长内容", () => {
        expect(stringifyErrorRaw({ a: 1 })).toBe('{"a":1}')
        expect(stringifyErrorRaw(null)).toBeNull()
        expect(stringifyErrorRaw("x".repeat(5000))?.length).toBe(4000 + "…[truncated]".length)
    })
})

describe("createStreamAggregator", () => {
    it("把正文分片拼成完整回复", () => {
        const aggregator = createStreamAggregator()
        aggregator.push({ choices: [{ delta: { role: "assistant", content: "你" } }] })
        aggregator.push({ choices: [{ delta: { content: "好" } }] })
        aggregator.push({ choices: [{ delta: {}, finish_reason: "stop" }] })

        const state = aggregator.snapshot()
        expect(state.message?.content).toBe("你好")
        expect(state.finishReason).toBe("stop")
        expect(state.firstTokenAt).not.toBeNull()
    })

    it("按 index 归并分片的工具调用参数", () => {
        const aggregator = createStreamAggregator()
        aggregator.push({
            choices: [
                { delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "search", arguments: '{"q":' } }] } },
            ],
        })
        aggregator.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"词条"}' } }] } }] })
        aggregator.push({
            choices: [{ delta: { tool_calls: [{ index: 1, id: "call_2", function: { name: "ask_user", arguments: "{}" } }] } }],
        })

        const state = aggregator.snapshot()
        expect(state.message?.toolCalls).toEqual([
            { id: "call_1", type: "function", name: "search", arguments: '{"q":"词条"}' },
            { id: "call_2", type: "function", name: "ask_user", arguments: "{}" },
        ])
    })

    it("保留思维链并区分首字时间", () => {
        const timestamps = [1000, 1200]
        let index = 0
        const aggregator = createStreamAggregator(() => timestamps[Math.min(index++, timestamps.length - 1)])

        aggregator.push({ choices: [{ delta: { reasoning_content: "思考" } }] })
        aggregator.push({ choices: [{ delta: { content: "答" } }] })

        const state = aggregator.snapshot()
        expect(state.message?.reasoningContent).toBe("思考")
        expect(state.message?.content).toBe("答")
        expect(state.firstTokenAt).toBe(1000)
    })

    it("没有任何内容时返回空回复", () => {
        const aggregator = createStreamAggregator()
        aggregator.push({ usage: { prompt_tokens: 1 } })
        expect(aggregator.snapshot()).toEqual({ message: null, finishReason: null, firstTokenAt: null, completionId: null })
    })

    it("记下首个 chunk 的补全 id，且无 choices 的收尾 chunk 也能取到", () => {
        const aggregator = createStreamAggregator()
        aggregator.push({ id: "chunk-id-1", choices: [{ delta: { content: "你" } }] })
        aggregator.push({ id: "chunk-id-1", choices: [{ delta: { content: "好" } }] })
        // include_usage 的收尾 chunk 没有 choices，id 必须在判 choices 之前取
        aggregator.push({ id: "chunk-id-1", choices: [], usage: { prompt_tokens: 3 } })

        expect(aggregator.snapshot().completionId).toBe("chunk-id-1")
    })

    it("能解析非流式响应体（choices[].message）", () => {
        const aggregator = createStreamAggregator()
        aggregator.push({
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: "完整回答",
                        tool_calls: [{ id: "c1", function: { name: "f", arguments: "{}" } }],
                    },
                    finish_reason: "tool_calls",
                },
            ],
        })
        const state = aggregator.snapshot()
        expect(state.message?.content).toBe("完整回答")
        expect(state.message?.toolCalls).toHaveLength(1)
        expect(state.finishReason).toBe("tool_calls")
    })
})
