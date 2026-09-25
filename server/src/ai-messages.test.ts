import { describe, expect, it } from "bun:test"
import { createMessagesStreamAggregator, resolveSessionAnchor, summarizeMessages } from "./ai-log-format"
import { consumeMessagesSseBuffer, createMessagesUsageAccumulator, normalizeUsage, pipeMessagesWithEvents } from "./ai-pricing"

/**
 * Messages（Anthropic 兼容）协议的用量与日志聚合测试。
 *
 * 覆盖本次改动新增的三块纯逻辑：
 * 1. Messages 形态的 usage 归一化（输入口径与 Chat Completions 不同）；
 * 2. 跨事件的 usage 累加（输入侧在 message_start，输出侧在 message_delta）；
 * 3. 事件流的聚合与字节透传。
 */

/** 把若干事件拼成上游 SSE 文本。 */
function toSse(events: readonly unknown[]): string {
    return events.map(event => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`).join("")
}

describe("normalizeUsage（Messages 形态）", () => {
    it("输入总量是 input + cache_read + cache_creation 三者之和", () => {
        const tokens = normalizeUsage({
            input_tokens: 100,
            cache_read_input_tokens: 900,
            cache_creation_input_tokens: 50,
            output_tokens: 20,
        })

        expect(tokens).toEqual({ cacheHit: 900, cacheMiss: 150, output: 20 })
    })

    it("缺少缓存字段时全部输入按未命中计", () => {
        expect(normalizeUsage({ input_tokens: 800, output_tokens: 12 })).toEqual({ cacheHit: 0, cacheMiss: 800, output: 12 })
    })

    it("只有缓存命中字段也能识别成 Messages 形态", () => {
        expect(normalizeUsage({ cache_read_input_tokens: 300, output_tokens: 0 })).toEqual({ cacheHit: 300, cacheMiss: 0, output: 0 })
    })

    it("不改动 Chat Completions 形态的口径", () => {
        const tokens = normalizeUsage({ prompt_tokens: 1000, prompt_cache_hit_tokens: 900, completion_tokens: 20 })

        expect(tokens).toEqual({ cacheHit: 900, cacheMiss: 100, output: 20 })
    })
})

describe("createMessagesUsageAccumulator", () => {
    it("跨 message_start 与 message_delta 累加出完整用量", () => {
        const accumulator = createMessagesUsageAccumulator()

        expect(accumulator.snapshot()).toBeUndefined()

        expect(
            accumulator.push({
                type: "message_start",
                message: { usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 900 } },
            })
        ).toBe(true)

        expect(accumulator.push({ type: "message_delta", usage: { output_tokens: 250 } })).toBe(true)

        expect(accumulator.snapshot()).toEqual({ input_tokens: 100, output_tokens: 250, cache_read_input_tokens: 900 })
    })

    it("无关事件不改变累计值", () => {
        const accumulator = createMessagesUsageAccumulator()

        expect(accumulator.push({ type: "content_block_delta", delta: { type: "text_delta", text: "hi" } })).toBe(false)
        expect(accumulator.snapshot()).toBeUndefined()
    })

    it("多次 message_delta 取最后一次的累计输出", () => {
        const accumulator = createMessagesUsageAccumulator()

        accumulator.push({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } })
        accumulator.push({ type: "message_delta", usage: { output_tokens: 40 } })
        accumulator.push({ type: "message_delta", usage: { output_tokens: 77 } })

        expect(accumulator.snapshot()?.output_tokens).toBe(77)
    })
})

describe("consumeMessagesSseBuffer", () => {
    it("逐行取出事件，未成行的尾部留在缓冲区", () => {
        const events: Array<Record<string, unknown>> = []
        const head = toSse([{ type: "message_start" }, { type: "message_delta" }])
        const buffer = `${head}data: {"type":"message_`

        const rest = consumeMessagesSseBuffer(buffer, event => events.push(event))

        expect(events.map(event => event.type)).toEqual(["message_start", "message_delta"])
        expect(rest).toBe('data: {"type":"message_')
    })

    it("忽略非 data 行与非法 JSON", () => {
        const events: Array<Record<string, unknown>> = []

        consumeMessagesSseBuffer('event: ping\n: keep-alive\ndata: not-json\ndata: {"type":"message_stop"}\n', event => events.push(event))

        expect(events).toEqual([{ type: "message_stop" }])
    })
})

describe("pipeMessagesWithEvents", () => {
    it("字节原样透传，同时旁路观察每个事件", async () => {
        const raw = toSse([
            { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 5, output_tokens: 1 } } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "你" } },
            { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 9 } },
        ])
        const source = new ReadableStream<Uint8Array>({
            start(controller) {
                // 故意按字节边界切开，验证跨数据块的缓冲
                const bytes = new TextEncoder().encode(raw)

                for (let offset = 0; offset < bytes.length; offset += 7) {
                    controller.enqueue(bytes.slice(offset, offset + 7))
                }

                controller.close()
            },
        })

        const seen: string[] = []
        const stream = pipeMessagesWithEvents(source, event => seen.push(String(event.type)))
        const text = await new Response(stream).text()

        expect(text).toBe(raw)
        expect(seen).toEqual(["message_start", "content_block_delta", "message_delta"])
    })
})

describe("createMessagesStreamAggregator", () => {
    it("拼出正文、思维链、工具调用与结束原因", () => {
        const aggregator = createMessagesStreamAggregator(() => 1_700_000_000_000)

        for (const event of [
            { type: "message_start", message: { id: "msg_abc", usage: { input_tokens: 20, output_tokens: 1 } } },
            { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
            { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "先看模块" } },
            { type: "content_block_stop", index: 0 },
            { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
            { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "查到了" } },
            { type: "content_block_stop", index: 1 },
            {
                type: "content_block_start",
                index: 2,
                content_block: { type: "tool_use", id: "toolu_1", name: "query_module_entries", input: {} },
            },
            { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"module":"ach' } },
            { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: 'ievement"}' } },
            { type: "content_block_stop", index: 2 },
            { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 64 } },
            { type: "message_stop" },
        ]) {
            aggregator.push(event)
        }

        const state = aggregator.snapshot()

        expect(state.completionId).toBe("msg_abc")
        expect(state.finishReason).toBe("tool_calls")
        expect(state.message?.content).toBe("查到了")
        expect(state.message?.reasoningContent).toBe("先看模块")
        expect(state.message?.toolCalls).toEqual([
            { id: "toolu_1", type: "function", name: "query_module_entries", arguments: '{"module":"achievement"}' },
        ])
        expect(state.usage).toEqual({ input_tokens: 20, output_tokens: 64 })
        expect(state.firstTokenAt).toBe(1_700_000_000_000)
    })

    it("整条流没有任何内容时回复为 null", () => {
        const aggregator = createMessagesStreamAggregator()

        aggregator.push({ type: "message_start", message: { id: "msg_x", usage: { input_tokens: 1 } } })
        aggregator.push({ type: "message_stop" })

        const state = aggregator.snapshot()

        expect(state.message).toBeNull()
        expect(state.finishReason).toBeNull()
        expect(state.firstTokenAt).toBeNull()
    })
})

describe("Messages 形态的会话归并与角色统计", () => {
    const conversation = [
        { role: "user", content: [{ type: "text", text: "1.6 新增了哪些成就？" }] },
        {
            role: "assistant",
            content: [{ type: "tool_use", id: "toolu_1", name: "query_module_entries", input: { module: "achievement" } }],
        },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "{}" }] }] },
        { role: "assistant", content: [{ type: "text", text: "共 12 个。" }] },
    ]

    it("锚点跳过承载工具结果的 user 轮", () => {
        expect(resolveSessionAnchor(conversation)).toBe("1.6 新增了哪些成就？")
    })

    it("工具结果的 user 轮记成 tool，最后一条 user 消息仍取真实提问", () => {
        const summary = summarizeMessages(conversation)

        expect(summary.roles).toEqual({ system: 0, user: 1, assistant: 2, tool: 1, other: 0 })
        expect(summary.lastUserMessage).toBe("1.6 新增了哪些成就？")
    })
})
