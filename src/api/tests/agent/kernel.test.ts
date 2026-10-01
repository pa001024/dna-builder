import { describe, expect, it } from "vitest"
import { AgentKernel } from "@/api/agent/kernel"
import type { AgentTool } from "@/api/agent/tool"
import type { AgentRoundRequest, AgentRoundResult, AgentTransport, AgentWireMessage } from "@/api/agent/wire"

/**
 * @description 造一个「按脚本返回轮次」的传输实现，用来把主循环的行为钉死。
 *
 * 每轮消耗脚本里的一条：这样测试能精确控制「模型什么时候给工具调用、
 * 什么时候给正文、什么时候触达输出上限」。
 * @param rounds 逐轮的返回结果
 * @returns 传输实现与已执行轮次的记录器
 */
function createScriptTransport(rounds: AgentRoundResult[]): { transport: AgentTransport; calls: AgentRoundRequest[] } {
    const calls: AgentRoundRequest[] = []
    let index = 0

    const transport: AgentTransport = {
        protocol: "chat",
        async runRound(request) {
            calls.push(request)
            const round = rounds[Math.min(index, rounds.length - 1)]
            index += 1
            return round
        },
    }

    return { transport, calls }
}

/**
 * @description 造一个工具，把调用参数原样回灌成结果正文。
 * @param name 工具名
 * @param output 固定返回文本
 * @returns 工具
 */
function echoTool(name: string, output: string): AgentTool<never> {
    return {
        definition: { name, description: `${name} 工具`, parameters: { type: "object", properties: {} } },
        execute: () => output,
    }
}

/**
 * @description 取出上下文里的助手轮，供断言读取工具调用。
 * @param messages 协议中立的对话消息
 * @returns 助手轮列表
 */
function assistantRounds(messages: readonly AgentWireMessage[]): Extract<AgentWireMessage, { role: "assistant" }>[] {
    return messages.filter((message): message is Extract<AgentWireMessage, { role: "assistant" }> => message.role === "assistant")
}

/**
 * @description 取出上下文里的用户轮，供断言读取工具结果。
 * @param messages 协议中立的对话消息
 * @returns 用户轮列表
 */
function userRounds(messages: readonly AgentWireMessage[]): Extract<AgentWireMessage, { role: "user" }>[] {
    return messages.filter((message): message is Extract<AgentWireMessage, { role: "user" }> => message.role === "user")
}

describe("AgentKernel 主循环", () => {
    it("没有工具调用时直接给出最终回复", async () => {
        const { transport } = createScriptTransport([{ text: "最终答案", thinking: "想了一下", toolCalls: [], finishReason: "stop" }])
        const kernel = new AgentKernel<never>({
            name: "test",
            config: { api_key: "k" },
            tools: [echoTool("echo", "ok")],
            systemPrompt: () => "系统提示",
            transport,
        })
        // 传输是可注入的：测试里换成脚本传输，避免真的发请求
        const result = await kernel.run([{ role: "user", content: "问题" }])

        expect(result.reply).toBe("最终答案")
        expect(result.reasonings).toEqual([{ text: "想了一下", toolCallIds: [] }])
        expect(result.traces).toEqual([])
    })

    it("执行工具调用后把结果回灌进下一轮", async () => {
        const { transport, calls } = createScriptTransport([
            {
                text: "",
                thinking: "先查一下",
                toolCalls: [{ id: "c1", name: "echo", arguments: '{"a":1}' }],
                finishReason: "tool_calls",
            },
            { text: "查到了", thinking: "", toolCalls: [], finishReason: "stop" },
        ])
        const kernel = new AgentKernel<never>({
            name: "test",
            config: { api_key: "k" },
            tools: [echoTool("echo", "结果内容")],
            systemPrompt: () => "系统提示",
            transport,
        })
        const result = await kernel.run([{ role: "user", content: "问题" }])

        expect(result.reply).toBe("查到了")
        expect(result.traces).toHaveLength(1)
        expect(result.traces[0]).toMatchObject({ id: "c1", name: "echo", status: "done" })
        // 第二轮上下文里必须同时有助手的工具调用与 user 轮的工具结果
        const secondRound = calls[1]
        const assistant = assistantRounds(secondRound.messages).find(message => message.toolCalls.length > 0)
        const results = userRounds(secondRound.messages).filter(message => (message.toolResults?.length ?? 0) > 0)

        expect(assistant?.toolCalls[0].name).toBe("echo")
        expect(results).toHaveLength(1)
        expect(results[0].toolResults?.[0].content).toBe("结果内容")
    })

    it("工具声明在轮次用尽后依然在场", async () => {
        // 预算只有 1 轮：第 2 轮模型仍在调工具，此时不执行、回灌「额度已用尽」，但声明必须照旧带上
        const { transport, calls } = createScriptTransport([
            {
                text: "",
                thinking: "",
                toolCalls: [{ id: "c1", name: "echo", arguments: "{}" }],
                finishReason: "tool_calls",
            },
            {
                text: "",
                thinking: "",
                toolCalls: [{ id: "c2", name: "echo", arguments: "{}" }],
                finishReason: "tool_calls",
            },
            { text: "收尾", thinking: "", toolCalls: [], finishReason: "stop" },
        ])
        const kernel = new AgentKernel<never>({
            name: "test",
            config: { api_key: "k" },
            tools: [echoTool("echo", "ok")],
            systemPrompt: () => "系统提示",
            transport,
            maxToolRounds: 1,
        })
        const result = await kernel.run([{ role: "user", content: "问题" }])

        // 轮次预算用尽那一轮仍要带 tools，否则上游会把工具语法当正文吐出来
        expect(calls[0].tools).toHaveLength(1)
        expect(calls[1].tools).toHaveLength(1)
        expect(result.reply).toBe("收尾")
        expect(result.traces[0].status).toBe("done")
        expect(result.traces[1].status).toBe("error")
        // 用尽预算的调用要回灌一条明确告知模型的工具结果，而不是默默丢弃
        const exhaustedUser = userRounds(calls[2].messages)
            .filter(message => (message.toolResults?.length ?? 0) > 0)
            .at(-1)
        expect(exhaustedUser?.toolResults?.[0].isError).toBe(true)
    })

    it("输出上限触发续写并最终拼接完整回复", async () => {
        const { transport, calls } = createScriptTransport([
            { text: "前半句", thinking: "", toolCalls: [], finishReason: "length" },
            { text: "后半句", thinking: "", toolCalls: [], finishReason: "stop" },
        ])
        const kernel = new AgentKernel<never>({
            name: "test",
            config: { api_key: "k" },
            tools: [],
            systemPrompt: () => "系统提示",
            transport,
        })
        const result = await kernel.run([{ role: "user", content: "问题" }])

        expect(result.reply).toBe("前半句后半句")
        // 续写请求里必须先把已产出的正文作为助手消息回灌
        const lastUser = [...calls[1].messages].reverse().find(message => message.role === "user")
        expect(lastUser?.text).toContain("继续")
    })

    it("挂起后作答会从断点继续同一轮问答", async () => {
        const { transport } = createScriptTransport([
            {
                text: "",
                thinking: "需要问清楚",
                toolCalls: [{ id: "ask1", name: "ask", arguments: '{"q":"选哪个"}' }],
                finishReason: "tool_calls",
            },
            { text: "按 A 配置好了", thinking: "", toolCalls: [], finishReason: "stop" },
        ])
        const kernel = new AgentKernel<{ q: string }>({
            name: "test",
            config: { api_key: "k" },
            tools: [
                {
                    definition: { name: "ask", description: "提问", parameters: { type: "object", properties: { q: { type: "string" } } } },
                    execute: args => ({ suspend: { q: `${args.q}` }, summary: "等待回答" }),
                },
            ],
            systemPrompt: () => "系统提示",
            transport,
            formatAnswer: (payload, answer) => `${payload.q}=>${String(answer)}`,
            hasAnswer: (_payload, answer) => String(answer).length > 0,
        })
        const first = await kernel.run([{ role: "user", content: "帮我配装" }])

        expect(first.pendingAsk?.toolCallId).toBe("ask1")
        expect(first.traces[0].status).toBe("running")

        const second = await kernel.answerPending("A")

        expect(second.reply).toBe("按 A 配置好了")
        expect(second.traces[0].status).toBe("done")
        expect(kernel.getPendingAsk()).toBeNull()
    })

    it("回答无效时不推进循环", async () => {
        const { transport } = createScriptTransport([
            {
                text: "",
                thinking: "",
                toolCalls: [{ id: "ask1", name: "ask", arguments: '{"q":"选哪个"}' }],
                finishReason: "tool_calls",
            },
        ])
        const kernel = new AgentKernel<{ q: string }>({
            name: "test",
            config: { api_key: "k" },
            tools: [
                {
                    definition: { name: "ask", description: "提问", parameters: { type: "object", properties: { q: { type: "string" } } } },
                    execute: args => ({ suspend: { q: `${args.q}` } }),
                },
            ],
            systemPrompt: () => "系统提示",
            transport,
            formatAnswer: payload => `${payload.q}`,
            hasAnswer: (_payload, answer) => String(answer).length > 0,
        })
        await kernel.run([{ role: "user", content: "帮我配装" }])

        await expect(kernel.answerPending("")).rejects.toThrow()
        // 挂起现场仍然存在：界面可以继续等用户作答
        expect(kernel.getPendingAsk()).not.toBeNull()
    })

    it("缺少 API Key 时直接报错", async () => {
        const kernel = new AgentKernel<never>({ name: "test", config: { api_key: "" }, tools: [], systemPrompt: () => "系统提示" })

        await expect(kernel.run([{ role: "user", content: "问题" }])).rejects.toThrow("API Key")
    })

    it("工具有效载荷返回结构化摘要", async () => {
        const { transport } = createScriptTransport([
            { text: "", thinking: "", toolCalls: [{ id: "c1", name: "echo", arguments: "{}" }], finishReason: "tool_calls" },
            { text: "完成", thinking: "", toolCalls: [], finishReason: "stop" },
        ])
        const kernel = new AgentKernel<never>({
            name: "test",
            config: { api_key: "k" },
            tools: [echoTool("echo", '{"total":3}')],
            systemPrompt: () => "系统提示",
            transport,
            summarize: ({ payload }) => `共 ${(payload as { total: number }).total} 条`,
        })
        const result = await kernel.run([{ role: "user", content: "问题" }])

        expect(result.traces[0].summary).toBe("共 3 条")
    })
})
