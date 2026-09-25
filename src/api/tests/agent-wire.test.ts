import { describe, expect, it } from "vitest"
import { parseToolArguments, resolveAgentProtocol, resolveChatEndpoint, resolveMessagesEndpoint } from "@/api/agent-wire"

/**
 * 线协议选择的单元测试。
 *
 * 判据是**端点能力**而不是模型名：DeepSeek 官方与自家代理走 Messages，
 * 只有 OpenAI 兼容入口的网关退回 Chat Completions。
 */
describe("resolveAgentProtocol", () => {
    it("DeepSeek 官方走 Messages（Anthropic 兼容入口与 OpenAI 兼容入口同源）", () => {
        expect(resolveAgentProtocol("https://api.deepseek.com/")).toBe("messages")
        expect(resolveAgentProtocol("https://api.deepseek.com/anthropic")).toBe("messages")
        expect(resolveAgentProtocol("https://api.deepseek.com/v1")).toBe("messages")
    })

    it("自家代理（基址以 /api/v1 结尾）走 Messages", () => {
        expect(resolveAgentProtocol("https://api.example.com/api/v1")).toBe("messages")
        expect(resolveAgentProtocol("https://api.example.com/api/v1/")).toBe("messages")
    })

    it("其余网关退回 Chat Completions", () => {
        expect(resolveAgentProtocol("https://open.bigmodel.cn/api/paas/v4/")).toBe("chat")
        expect(resolveAgentProtocol("https://api.example.com/v1")).toBe("chat")
        expect(resolveAgentProtocol("http://127.0.0.1:8887/chat/completions")).toBe("chat")
    })

    it("基址非法时按 Chat Completions 处理", () => {
        expect(resolveAgentProtocol("")).toBe("chat")
        expect(resolveAgentProtocol("not a url")).toBe("chat")
    })
})

describe("resolveMessagesEndpoint", () => {
    it("按官方约定补出 /anthropic/v1/messages", () => {
        expect(resolveMessagesEndpoint("https://api.deepseek.com/")).toBe("https://api.deepseek.com/anthropic/v1/messages")
        expect(resolveMessagesEndpoint("https://api.deepseek.com")).toBe("https://api.deepseek.com/anthropic/v1/messages")
    })

    it("基址已带 /anthropic 或 /anthropic/v1 时不重复拼接", () => {
        expect(resolveMessagesEndpoint("https://api.deepseek.com/anthropic")).toBe("https://api.deepseek.com/anthropic/v1/messages")
        expect(resolveMessagesEndpoint("https://api.deepseek.com/anthropic/v1/")).toBe("https://api.deepseek.com/anthropic/v1/messages")
    })

    it("代理基址直接续接 /messages", () => {
        expect(resolveMessagesEndpoint("https://api.example.com/api/v1")).toBe("https://api.example.com/api/v1/messages")
        expect(resolveMessagesEndpoint("https://api.example.com/api/v1/")).toBe("https://api.example.com/api/v1/messages")
    })

    it("基址非法时返回 null", () => {
        expect(resolveMessagesEndpoint("")).toBeNull()
        expect(resolveMessagesEndpoint("not a url")).toBeNull()
    })
})

describe("resolveChatEndpoint", () => {
    it("按 OpenAI 约定拼出 /chat/completions", () => {
        expect(resolveChatEndpoint("https://open.bigmodel.cn/api/paas/v4/")).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions")
        expect(resolveChatEndpoint("https://open.bigmodel.cn/api/paas/v4")).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions")
    })
})

describe("parseToolArguments", () => {
    it("解析对象字面量", () => {
        expect(parseToolArguments('{"module":"achievement","limit":5}')).toEqual({ module: "achievement", limit: 5 })
    })

    it("空串与非法 JSON 都退回空对象", () => {
        expect(parseToolArguments("")).toEqual({})
        expect(parseToolArguments("   ")).toEqual({})
        expect(parseToolArguments("{截断了")).toEqual({})
    })

    it("非对象字面量（数组 / 标量）按空对象处理", () => {
        expect(parseToolArguments("[1,2]")).toEqual({})
        expect(parseToolArguments("42")).toEqual({})
        expect(parseToolArguments("null")).toEqual({})
    })
})
