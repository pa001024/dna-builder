import { afterEach, describe, expect, it, vi } from "vitest"
import { isChatCapableModelId, listAiModels, normalizeModelList } from "@/api/agent/models"

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("normalizeModelList", () => {
    it("兼容 data / models / 裸数组与字符串条目", () => {
        expect(normalizeModelList({ data: [{ id: "gpt-4.1", owned_by: "openai" }] })).toEqual([{ id: "gpt-4.1", ownedBy: "openai" }])
        expect(normalizeModelList({ models: [{ name: "deepseek-chat" }] })).toEqual([{ id: "deepseek-chat" }])
        expect(normalizeModelList(["kimi-k2", { id: "glm-4.6" }])).toEqual([{ id: "kimi-k2" }, { id: "glm-4.6" }])
    })

    it("去重并过滤非对话模型", () => {
        const models = normalizeModelList({
            data: [
                { id: "gpt-4.1" },
                { id: "gpt-4.1" },
                { id: "text-embedding-3-small" },
                { id: "whisper-1" },
                { id: "dall-e-3" },
                { id: "o4-mini" },
            ],
        })

        expect(models.map(model => model.id)).toEqual(["gpt-4.1", "o4-mini"])
    })

    it("过滤后为空时回退全量，避免整张列表空掉", () => {
        expect(normalizeModelList({ data: [{ id: "text-embedding-3-small" }] })).toEqual([{ id: "text-embedding-3-small" }])
    })

    it("解析 magpie 的 context_window / max_output_tokens", () => {
        expect(
            normalizeModelList({
                data: [{ id: "deepseek/pro", owned_by: "deepseek", context_window: 1_000_000, max_output_tokens: 32768 }],
            })
        ).toEqual([{ id: "deepseek/pro", ownedBy: "deepseek", contextWindow: 1_000_000, maxOutputTokens: 32768 }])
    })

    it("兼容 OpenRouter 的 context_length / top_provider.max_completion_tokens", () => {
        expect(
            normalizeModelList({
                data: [
                    { id: "openai/gpt-5", context_length: "400K", max_completion_tokens: 65536 },
                    { id: "anthropic/claude", context_length: 200000, top_provider: { max_completion_tokens: 8192 } },
                ],
            })
        ).toEqual([
            { id: "openai/gpt-5", contextWindow: 400_000, maxOutputTokens: 65536 },
            { id: "anthropic/claude", contextWindow: 200_000, maxOutputTokens: 8192 },
        ])
    })

    it("解析 magpie 的 reasoning_levels 与 supported_reasoning_levels", () => {
        expect(
            normalizeModelList({
                data: [
                    {
                        id: "auto/claude-sonnet-5-5",
                        reasoning_levels: ["low", "medium", "high"],
                        supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }, { effort: "high" }],
                    },
                    { id: "auto/only-supported", supported_reasoning_levels: [{ effort: "high" }, { effort: "max" }] },
                ],
            })
        ).toEqual([
            { id: "auto/claude-sonnet-5-5", reasoningLevels: ["low", "medium", "high"] },
            { id: "auto/only-supported", reasoningLevels: ["high", "max"] },
        ])
    })

    it("无法识别的响应返回空数组", () => {
        expect(normalizeModelList(null)).toEqual([])
        expect(normalizeModelList({ foo: 1 })).toEqual([])
    })
})

describe("isChatCapableModelId", () => {
    it("识别对话模型与专用模型", () => {
        expect(isChatCapableModelId("gpt-4.1")).toBe(true)
        expect(isChatCapableModelId("qwen3-coder")).toBe(true)
        expect(isChatCapableModelId("text-embedding-3-large")).toBe(false)
        expect(isChatCapableModelId("gpt-4o-audio-preview")).toBe(false)
        expect(isChatCapableModelId("gemini-2.5-flash-image")).toBe(false)
    })
})

describe("listAiModels", () => {
    it("缺少基址时不发请求", async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)

        await expect(listAiModels({ baseUrl: " ", apiKey: "sk-x" })).rejects.toThrow()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("按 /models 请求并带上 Bearer", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "m1" }] }), { status: 200 }))
        vi.stubGlobal("fetch", fetchMock)

        const models = await listAiModels({ baseUrl: "https://api.example.com/v1", apiKey: " sk-x " })

        expect(models).toEqual([{ id: "m1" }])
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe("https://api.example.com/v1/models")
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-x")
    })

    it("Anthropic 官方用 x-api-key、版本头与浏览器直连头", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "claude-sonnet-5-5" }] }), { status: 200 }))
        vi.stubGlobal("fetch", fetchMock)

        await listAiModels({ baseUrl: "https://api.anthropic.com", apiKey: "sk-ant" })

        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        const headers = init.headers as Record<string, string>
        expect(url).toBe("https://api.anthropic.com/v1/models")
        expect(headers["x-api-key"]).toBe("sk-ant")
        expect(headers["anthropic-version"]).toBe("2023-06-01")
        expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true")
        expect(headers.Authorization).toBeUndefined()
    })

    it("magpie 预设覆盖列表地址，直接打站点根 /models", async () => {
        const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ data: [{ id: "deepseek/pro" }] }), { status: 200 }))
        vi.stubGlobal("fetch", fetchMock)

        await listAiModels({
            baseUrl: "http://127.0.0.1:3425/v1",
            apiKey: "magpie",
            modelsEndpoint: "http://127.0.0.1:3425/models",
        })

        expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:3425/models")
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("列表地址 404 时回退到站点根 /models", async () => {
        const fetchMock = vi.fn(async (url: string) =>
            url.endsWith("/v1/models")
                ? new Response("not found", { status: 404 })
                : new Response(JSON.stringify({ data: [{ id: "m1" }] }), { status: 200 })
        )
        vi.stubGlobal("fetch", fetchMock)

        const models = await listAiModels({ baseUrl: "http://127.0.0.1:3425/v1", apiKey: "magpie" })

        expect(models).toEqual([{ id: "m1" }])
        expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["http://127.0.0.1:3425/v1/models", "http://127.0.0.1:3425/models"])
    })

    it("非 2xx 用上游错误消息抛出", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ error: { message: "invalid api key" } }), { status: 401 }))
        )

        await expect(listAiModels({ baseUrl: "https://api.example.com/v1", apiKey: "sk-x" })).rejects.toThrow(
            "上游返回 401：invalid api key"
        )
    })
})
