import { afterEach, describe, expect, it, vi } from "vitest"
import type { AgentRoundRequest } from "@/api/agent-wire"
import { createMessagesTransport } from "@/api/messages-transport"

/**
 * Messages 传输的集成测试。
 *
 * 覆盖两件在 DSH 那边同样被固定下来的契约：
 * 1. **序列化**：顶层 `system`、工具声明用 `input_schema`、助手轮的 `thinking` 顺序、
 *    用户轮的 `tool_result` 排在最前、相邻同角色轮合并；
 * 2. **流式翻译**：`input_json_delta` 分片拼装成参数对象，参数不完整时丢弃该次调用。
 */

/** 把若干事件拼成上游 SSE 响应。 */
function sseResponse(events: readonly unknown[], init: ResponseInit = { status: 200 }): Response {
    const text = events.map(event => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`).join("")
    const bytes = new TextEncoder().encode(text)

    return new Response(
        new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(bytes)
                controller.close()
            },
        }),
        { ...init, headers: { "Content-Type": "text/event-stream" } }
    )
}

/** 记录最近一次请求的假 fetch。 */
function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
    const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = []

    vi.stubGlobal("fetch", async (url: unknown, init: unknown) => {
        const request = (init ?? {}) as RequestInit
        calls.push({
            url: String(url),
            body: JSON.parse(String(request.body)) as Record<string, unknown>,
            headers: (request.headers ?? {}) as Record<string, string>,
        })

        return handler(String(url), request)
    })

    return calls
}

/** 最小可用的单轮请求。 */
function makeRequest(overrides: Partial<AgentRoundRequest> = {}): AgentRoundRequest {
    return {
        model: "deepseek-flash",
        system: "你是一个检索助手",
        messages: [{ role: "user", text: "1.6 新增了哪些成就？" }],
        temperature: 0.4,
        maxTokens: 1024,
        ...overrides,
    }
}

const OPTIONS = { apiKey: "sk-test", baseUrl: "https://api.deepseek.com/", timeout: 5000, maxRetries: 0 }

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("createMessagesTransport 序列化", () => {
    it("用顶层 system 与 input_schema，端点按官方约定拼接", async () => {
        const calls = mockFetch(() =>
            sseResponse([
                { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 5, output_tokens: 1 } } },
                { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
                { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "好" } },
                { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } },
            ])
        )

        const transport = createMessagesTransport(OPTIONS)
        const result = await transport.runRound(
            makeRequest({
                tools: [{ name: "list_data_modules", description: "列出模块", parameters: { type: "object", properties: {} } }],
            })
        )

        expect(transport.protocol).toBe("messages")
        expect(calls[0].url).toBe("https://api.deepseek.com/anthropic/v1/messages")
        expect(calls[0].body.system).toBe("你是一个检索助手")
        expect(calls[0].body.stream).toBe(true)
        expect(calls[0].body.thinking).toEqual({ type: "enabled" })
        expect(calls[0].body.tools).toEqual([
            { name: "list_data_modules", description: "列出模块", input_schema: { type: "object", properties: {} } },
        ])
        // messages 里不应再出现 role:"system"，它已经提到顶层
        expect(calls[0].body.messages).toEqual([{ role: "user", content: [{ type: "text", text: "1.6 新增了哪些成就？" }] }])
        expect(result).toEqual({ text: "好", thinking: "", toolCalls: [], finishReason: "stop" })
    })

    it("助手轮内 thinking 在 text 之前，用户轮内 tool_result 在 text 之前，且相邻同角色轮合并", async () => {
        const calls = mockFetch(() => sseResponse([{ type: "message_start", message: { id: "m" } }, { type: "message_stop" }]))

        const transport = createMessagesTransport(OPTIONS)
        await transport.runRound(
            makeRequest({
                messages: [
                    { role: "user", text: "问题" },
                    {
                        role: "assistant",
                        text: "先查一下",
                        thinking: "想想要查哪个模块",
                        toolCalls: [{ id: "toolu_1", name: "search_data", arguments: '{"query":"成就"}' }],
                    },
                    // 工具结果与续写说明分两条相邻的 user 轮压入，序列化时必须合并成一条
                    { role: "user", text: "", toolResults: [{ toolCallId: "toolu_1", content: '{"total":12}' }] },
                    { role: "user", text: "继续" },
                ],
            })
        )

        expect(calls[0].body.messages).toEqual([
            { role: "user", content: [{ type: "text", text: "问题" }] },
            {
                role: "assistant",
                content: [
                    { type: "thinking", thinking: "想想要查哪个模块" },
                    { type: "text", text: "先查一下" },
                    { type: "tool_use", id: "toolu_1", name: "search_data", input: { query: "成就" } },
                ],
            },
            {
                role: "user",
                content: [
                    { type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: '{"total":12}' }] },
                    { type: "text", text: "继续" },
                ],
            },
        ])
    })

    it("工具结果带 is_error 时透传错误标记", async () => {
        const calls = mockFetch(() => sseResponse([{ type: "message_start", message: { id: "m" } }, { type: "message_stop" }]))

        const transport = createMessagesTransport(OPTIONS)
        await transport.runRound(
            makeRequest({
                messages: [
                    { role: "user", text: "问题" },
                    { role: "assistant", text: "", thinking: "", toolCalls: [{ id: "t1", name: "read_story", arguments: "{}" }] },
                    { role: "user", text: "", toolResults: [{ toolCallId: "t1", content: '{"error":"未找到"}', isError: true }] },
                ],
            })
        )

        const messages = calls[0].body.messages as Array<{ content: Array<Record<string, unknown>> }>
        expect(messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1", is_error: true })
    })

    it("历史里的非法参数按空对象回灌，保不住调用本身", async () => {
        const calls = mockFetch(() => sseResponse([{ type: "message_start", message: { id: "m" } }, { type: "message_stop" }]))

        const transport = createMessagesTransport(OPTIONS)
        await transport.runRound(
            makeRequest({
                messages: [
                    { role: "user", text: "问题" },
                    {
                        role: "assistant",
                        text: "",
                        thinking: "",
                        toolCalls: [{ id: "t1", name: "search_data", arguments: "{截断了" }],
                    },
                ],
            })
        )

        const messages = calls[0].body.messages as Array<{ content: Array<Record<string, unknown>> }>
        expect(messages[1].content[0]).toEqual({ type: "tool_use", id: "t1", name: "search_data", input: {} })
    })
})

describe("createMessagesTransport 流式翻译", () => {
    it("把 input_json_delta 分片拼成参数对象，并逐段吐出正文与思考", async () => {
        mockFetch(() =>
            sseResponse([
                { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 20, output_tokens: 1 } } },
                { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "先" } },
                { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "想" } },
                { type: "content_block_stop", index: 0 },
                { type: "content_block_start", index: 1, content_block: { type: "text", text: "查" } },
                { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "到" } },
                { type: "content_block_stop", index: 1 },
                {
                    type: "content_block_start",
                    index: 2,
                    content_block: { type: "tool_use", id: "toolu_9", name: "query_module_entries", input: {} },
                },
                { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"module":"ach' } },
                { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: 'ievement"}' } },
                { type: "content_block_stop", index: 2 },
                { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 64 } },
                { type: "message_stop" },
            ])
        )

        const texts: string[] = []
        const thoughts: string[] = []

        const result = await createMessagesTransport(OPTIONS).runRound(
            makeRequest({ handlers: { onText: text => texts.push(text), onThinking: text => thoughts.push(text) } })
        )

        expect(thoughts.join("")).toBe("先想")
        expect(texts.join("")).toBe("查到")
        expect(result.text).toBe("查到")
        expect(result.thinking).toBe("先想")
        expect(result.finishReason).toBe("tool_calls")
        expect(result.toolCalls).toEqual([{ id: "toolu_9", name: "query_module_entries", arguments: '{"module":"achievement"}' }])
    })

    it("参数被输出上限截断时丢弃该次调用，而不是拿半截参数去执行", async () => {
        mockFetch(() =>
            sseResponse([
                { type: "message_start", message: { id: "msg_1" } },
                { type: "content_block_start", index: 0, content_block: { type: "text", text: "查" } },
                {
                    type: "content_block_start",
                    index: 1,
                    content_block: { type: "tool_use", id: "toolu_1", name: "search_data", input: {} },
                },
                { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"que' } },
                { type: "message_delta", delta: { stop_reason: "max_tokens" } },
            ])
        )

        const result = await createMessagesTransport(OPTIONS).runRound(makeRequest())

        expect(result.finishReason).toBe("length")
        expect(result.toolCalls).toEqual([])
    })

    it("中断时返回已产出的内容", async () => {
        mockFetch(() =>
            sseResponse([
                { type: "message_start", message: { id: "msg_1" } },
                { type: "content_block_start", index: 0, content_block: { type: "text", text: "半" } },
                { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "句" } },
                { type: "message_delta", delta: { stop_reason: "end_turn" } },
            ])
        )

        let interrupted = false

        const result = await createMessagesTransport(OPTIONS).runRound(
            makeRequest({
                handlers: {
                    onText: () => {
                        interrupted = true
                    },
                },
                isInterrupted: () => interrupted,
            })
        )

        expect(result.text).toBe("半")
    })
})

describe("createMessagesTransport 鉴权头", () => {
    it("直连 DeepSeek 官方入口时用 x-api-key（官方 Anthropic 入口不认 Bearer）", async () => {
        const calls = mockFetch(() => sseResponse([{ type: "message_start", message: { id: "m" } }, { type: "message_stop" }]))

        await createMessagesTransport(OPTIONS).runRound(makeRequest())

        expect(calls[0].url).toBe("https://api.deepseek.com/anthropic/v1/messages")
        expect(calls[0].headers["x-api-key"]).toBe("sk-test")
        expect(calls[0].headers.Authorization).toBeUndefined()
    })

    it("走自建代理时用 Authorization Bearer，不发 x-api-key", async () => {
        const calls = mockFetch(() => sseResponse([{ type: "message_start", message: { id: "m" } }, { type: "message_stop" }]))

        await createMessagesTransport({ ...OPTIONS, apiKey: "jwt-token", baseUrl: "https://example.com/api/v1" }).runRound(makeRequest())

        expect(calls[0].url).toBe("https://example.com/api/v1/messages")
        expect(calls[0].headers.Authorization).toBe("Bearer jwt-token")
        expect(calls[0].headers["x-api-key"]).toBeUndefined()
    })
})

describe("createMessagesTransport 失败处理", () => {
    it("4xx 直接失败且不重试，报错用上游的消息", async () => {
        const calls = mockFetch(
            () =>
                new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "API Key 无效" } }), {
                    status: 401,
                })
        )

        await expect(createMessagesTransport({ ...OPTIONS, maxRetries: 3 }).runRound(makeRequest())).rejects.toThrow("API Key 无效")
        expect(calls).toHaveLength(1)
    })

    it("5xx 按配置重试，成功后正常返回", async () => {
        let attempt = 0
        const calls = mockFetch(() => {
            attempt++

            if (attempt === 1) {
                return new Response(JSON.stringify({ error: { message: "服务繁忙" } }), { status: 503 })
            }

            return sseResponse([
                { type: "message_start", message: { id: "msg_1" } },
                { type: "content_block_start", index: 0, content_block: { type: "text", text: "好了" } },
                { type: "message_delta", delta: { stop_reason: "end_turn" } },
            ])
        })

        const result = await createMessagesTransport({ ...OPTIONS, maxRetries: 1 }).runRound(makeRequest())

        expect(calls).toHaveLength(2)
        expect(result.text).toBe("好了")
    })
})
