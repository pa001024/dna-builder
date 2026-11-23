import { afterEach, describe, expect, it, vi } from "vitest"
import { createChatTransport } from "@/api/agent/chat-transport"

/** 把若干 chunk 拼成 OpenAI 兼容的 SSE 响应。 */
function sseResponse(chunks: readonly unknown[]): Response {
    const text = `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`
    const bytes = new TextEncoder().encode(text)

    return new Response(
        new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(bytes)
                controller.close()
            },
        }),
        { headers: { "Content-Type": "text/event-stream" } }
    )
}

/** 记录请求体并返回一段固定的流式回答。 */
function mockFetch() {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []

    vi.stubGlobal("fetch", async (url: unknown, init: unknown) => {
        const request = (init ?? {}) as RequestInit
        calls.push({ url: String(url), body: JSON.parse(String(request.body)) as Record<string, unknown> })

        return sseResponse([
            {
                id: "chat_1",
                object: "chat.completion.chunk",
                created: 1,
                model: "test-model",
                choices: [{ index: 0, delta: { content: "好" }, finish_reason: null }],
            },
            {
                id: "chat_1",
                object: "chat.completion.chunk",
                created: 1,
                model: "test-model",
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
            },
        ])
    })

    return calls
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("createChatTransport", () => {
    it("reasoningEffort 作为 reasoning_effort 下发", async () => {
        const calls = mockFetch()
        const transport = createChatTransport({
            apiKey: "sk-test",
            baseUrl: "https://api.example.com/v1",
            timeout: 5000,
            maxRetries: 0,
        })

        const result = await transport.runRound({
            model: "test-model",
            system: "系统提示",
            messages: [{ role: "user", text: "你好" }],
            temperature: 0.4,
            maxTokens: 128,
            reasoningEffort: "xhigh",
        })

        expect(calls[0].url).toBe("https://api.example.com/v1/chat/completions")
        expect(calls[0].body.reasoning_effort).toBe("xhigh")
        expect(result.text).toBe("好")
        expect(result.usage).toMatchObject({ inputTokens: 5, outputTokens: 2 })
    })

    it("未设置 reasoningEffort 时不带该字段", async () => {
        const calls = mockFetch()
        const transport = createChatTransport({
            apiKey: "sk-test",
            baseUrl: "https://api.example.com/v1",
            timeout: 5000,
            maxRetries: 0,
        })

        await transport.runRound({
            model: "test-model",
            system: "系统提示",
            messages: [{ role: "user", text: "你好" }],
            temperature: 0.4,
            maxTokens: 128,
        })

        expect("reasoning_effort" in calls[0].body).toBe(false)
    })
})
