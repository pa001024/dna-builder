import { describe, expect, it } from "vitest"
import { AgentKernel, type AgentKernelOptions, type AgentToolTrace } from "@/api/agent/kernel"
import type { AgentTool, AgentToolOutput } from "@/api/agent/tool"
import type {
    AgentRoundRequest,
    AgentRoundResult,
    AgentToolCall,
    AgentToolResult,
    AgentTransport,
    AgentWireMessage,
} from "@/api/agent/wire"

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

/** 受控工具只由测试放行；失败清理时释放全部门闩，避免留下悬空运行。 */
function controlledTools<TPayload = never>(specs: { name: string; concurrentSafe?: boolean }[]) {
    const started: string[] = []
    let active = 0
    let peak = 0
    const controls = specs.map(spec => ({
        ...spec,
        entered: Promise.withResolvers<void>(),
        output: Promise.withResolvers<AgentToolOutput<TPayload>>(),
        isInterrupted: (): boolean => false,
    }))
    const tools: AgentTool<TPayload>[] = controls.map(control => ({
        definition: { name: control.name, description: control.name, parameters: { type: "object", properties: {} } },
        concurrentSafe: control.concurrentSafe,
        async execute(_args, context) {
            control.isInterrupted = context.isInterrupted
            started.push(control.name)
            active += 1
            peak = Math.max(peak, active)
            control.entered.resolve()
            try {
                return await control.output.promise
            } finally {
                active -= 1
            }
        },
    }))
    return {
        tools,
        controls,
        started,
        get active() {
            return active
        },
        get peak() {
            return peak
        },
        releaseAll() {
            for (const control of controls) {
                control.output.resolve(`result:${control.name}`)
            }
        },
    }
}

/** 下一轮请求是唯一的结果观察点，不能依赖内核私有状态。 */
function concurrencyKernel<TPayload>(
    tools: AgentTool<TPayload>[],
    toolCalls: AgentToolCall[],
    options: Partial<AgentKernelOptions<TPayload>> = {}
) {
    const { transport, calls } = createScriptTransport([
        { text: "", thinking: "准备调用", toolCalls, finishReason: "tool_calls" },
        { text: "完成", thinking: "", toolCalls: [], finishReason: "stop" },
    ])
    const kernel = new AgentKernel<TPayload>({
        name: "test",
        config: { api_key: "k" },
        tools,
        systemPrompt: () => "系统提示",
        transport,
        ...options,
    })
    return { kernel, calls }
}

function concurrencyCalls(names: string[]): AgentToolCall[] {
    return names.map(name => ({ id: name, name, arguments: "{}" }))
}

function toolResults(messages: readonly AgentWireMessage[]): AgentToolResult[] {
    return userRounds(messages).flatMap(message => message.toolResults ?? [])
}

describe("AgentKernel 工具并发调度", () => {
    it("安全工具实际重叠执行，逆序完成后仍按模型顺序注册痕迹并回灌结果", async () => {
        const controlled = controlledTools([
            { name: "first", concurrentSafe: true },
            { name: "second", concurrentSafe: true },
        ])
        const { kernel, calls } = concurrencyKernel(controlled.tools, concurrencyCalls(["first", "second"]))
        const events: AgentToolTrace[] = []
        const secondDone = Promise.withResolvers<void>()
        const running = kernel.run([{ role: "user", content: "问题" }], {
            onToolTrace: trace => {
                events.push({ ...trace })
                if (trace.id === "second" && trace.status === "done") secondDone.resolve()
            },
        })
        try {
            await controlled.controls[0].entered.promise
            expect(controlled.started).toEqual(["first", "second"])
            expect(controlled.active).toBe(2)
            expect(events.filter(trace => trace.status === "running").map(trace => trace.id)).toEqual(["first", "second"])
            controlled.controls[1].output.resolve("second result")
            await secondDone.promise
            expect(controlled.active).toBe(1)
            expect(calls).toHaveLength(1)
            controlled.controls[0].output.resolve("first result")
            const result = await running

            expect(result.traces.map(trace => [trace.id, trace.status])).toEqual([
                ["first", "done"],
                ["second", "done"],
            ])
            expect(events.filter(trace => trace.status === "done").map(trace => trace.id)).toEqual(["second", "first"])
            expect(toolResults(calls[1].messages)).toEqual([
                { toolCallId: "first", content: "first result" },
                { toolCallId: "second", content: "second result" },
            ])
            expect(result.reasonings[0].toolCallIds).toEqual(["first", "second"])
        } finally {
            controlled.releaseAll()
            await running
        }
    })

    it.each([undefined, false])("未显式声明安全时保持串行（%s）", async concurrentSafe => {
        const controlled = controlledTools([
            { name: "first", concurrentSafe },
            { name: "second", concurrentSafe },
        ])
        const { kernel } = concurrencyKernel(controlled.tools, concurrencyCalls(["first", "second"]))
        const running = kernel.run([{ role: "user", content: "问题" }])
        try {
            await controlled.controls[0].entered.promise
            expect(controlled.started).toEqual(["first"])
            controlled.controls[0].output.resolve("first result")
            await controlled.controls[1].entered.promise
            expect(controlled.started).toEqual(["first", "second"])
            expect(controlled.peak).toBe(1)
            controlled.controls[1].output.resolve("second result")
            expect((await running).traces.map(trace => trace.status)).toEqual(["done", "done"])
        } finally {
            controlled.releaseAll()
            await running
        }
    })

    it("上限为一时显式安全工具也串行", async () => {
        const controlled = controlledTools([
            { name: "first", concurrentSafe: true },
            { name: "second", concurrentSafe: true },
        ])
        const { kernel } = concurrencyKernel(controlled.tools, concurrencyCalls(["first", "second"]), { maxToolConcurrency: 1 })
        const running = kernel.run([{ role: "user", content: "问题" }])
        try {
            await controlled.controls[0].entered.promise
            expect(controlled.started).toEqual(["first"])
            controlled.controls[0].output.resolve("first result")
            await controlled.controls[1].entered.promise
            expect(controlled.peak).toBe(1)
            controlled.controls[1].output.resolve("second result")
            await running
        } finally {
            controlled.releaseAll()
            await running
        }
    })

    it("并发上限切组并等待整组，串行屏障阻止后续安全工具提前执行", async () => {
        const controlled = controlledTools([
            { name: "a", concurrentSafe: true },
            { name: "b", concurrentSafe: true },
            { name: "c", concurrentSafe: true },
            { name: "barrier", concurrentSafe: false },
            { name: "d", concurrentSafe: true },
            { name: "e", concurrentSafe: true },
        ])
        const { kernel, calls } = concurrencyKernel(controlled.tools, concurrencyCalls(["a", "b", "c", "barrier", "d", "e"]), {
            maxToolConcurrency: 2,
        })
        const bDone = Promise.withResolvers<void>()
        const running = kernel.run([{ role: "user", content: "问题" }], {
            onToolTrace: trace => {
                if (trace.id === "b" && trace.status === "done") bDone.resolve()
            },
        })
        try {
            await controlled.controls[0].entered.promise
            expect(controlled.started).toEqual(["a", "b"])
            controlled.controls[1].output.resolve("b result")
            await bDone.promise
            expect(controlled.started).toEqual(["a", "b"])
            controlled.controls[0].output.resolve("a result")
            await controlled.controls[2].entered.promise
            expect(controlled.started).toEqual(["a", "b", "c"])
            controlled.controls[2].output.resolve("c result")
            await controlled.controls[3].entered.promise
            expect(controlled.started).toEqual(["a", "b", "c", "barrier"])
            expect(controlled.active).toBe(1)
            controlled.controls[3].output.resolve("barrier result")
            await controlled.controls[4].entered.promise
            expect(controlled.started).toEqual(["a", "b", "c", "barrier", "d", "e"])
            expect(controlled.active).toBe(2)
            controlled.releaseAll()
            await running
            expect(controlled.peak).toBe(2)
            expect(toolResults(calls[1].messages).map(result => result.toolCallId)).toEqual(["a", "b", "c", "barrier", "d", "e"])
        } finally {
            controlled.releaseAll()
            await running
        }
    })

    it("失败、未知工具、显式错误和摘要异常彼此隔离，仍执行其余工具并按顺序回灌", async () => {
        const controlled = controlledTools([
            { name: "throw", concurrentSafe: true },
            { name: "ok", concurrentSafe: true },
            { name: "flagged", concurrentSafe: true },
            { name: "summary", concurrentSafe: true },
            { name: "last", concurrentSafe: true },
        ])
        const { kernel, calls } = concurrencyKernel(
            controlled.tools,
            concurrencyCalls(["throw", "ok", "missing", "flagged", "summary", "last"]),
            {
                summarize: ({ name }) => {
                    if (name === "summary") throw new Error("summary failed")
                    return `summary:${name}`
                },
            }
        )
        const running = kernel.run([{ role: "user", content: "问题" }])
        try {
            await controlled.controls[0].entered.promise
            expect(controlled.started).toEqual(["throw", "ok"])
            controlled.controls[0].output.reject(new Error("execute failed"))
            controlled.controls[1].output.resolve("ok result")
            await controlled.controls[2].entered.promise
            expect(controlled.started).toEqual(["throw", "ok", "flagged", "summary", "last"])
            controlled.controls[2].output.resolve({ content: "flagged failure", isError: true })
            controlled.controls[3].output.resolve("summary result")
            controlled.controls[4].output.resolve("last result")
            const result = await running
            const results = toolResults(calls[1].messages)

            expect(result.reply).toBe("完成")
            expect(results.map(item => item.toolCallId)).toEqual(["throw", "ok", "missing", "flagged", "summary", "last"])
            expect(results.map(item => item.isError === true)).toEqual([true, false, true, true, true, false])
            expect(results[0].content).toContain("execute failed")
            expect(results[2].content).toContain("missing")
            expect(results[3].content).toBe("flagged failure")
            expect(results[4].content).toContain("summary failed")
            expect(results[5].content).toBe("last result")
            expect(result.traces.filter(trace => trace.id !== "missing").map(trace => trace.status)).toEqual([
                "error",
                "done",
                "error",
                "error",
                "done",
            ])
        } finally {
            controlled.releaseAll()
            await running
        }
    })

    it("并发调用只消耗一轮预算，下一轮每个调用都回灌预算错误且不执行", async () => {
        const executed: string[] = []
        const tools = ["a", "b"].map(name => ({
            ...echoTool(name, "ok"),
            concurrentSafe: true,
            execute: () => {
                executed.push(name)
                return "ok"
            },
        }))
        const { transport, calls } = createScriptTransport([
            { text: "", thinking: "", toolCalls: concurrencyCalls(["a", "b"]), finishReason: "tool_calls" },
            {
                text: "",
                thinking: "",
                toolCalls: [
                    { id: "a2", name: "a", arguments: "{}" },
                    { id: "b2", name: "b", arguments: "{}" },
                ],
                finishReason: "tool_calls",
            },
            { text: "收尾", thinking: "", toolCalls: [], finishReason: "stop" },
        ])
        const kernel = new AgentKernel<never>({
            name: "test",
            config: { api_key: "k" },
            tools,
            systemPrompt: () => "系统提示",
            transport,
            maxToolRounds: 1,
        })
        const result = await kernel.run([{ role: "user", content: "问题" }])

        expect(executed).toEqual(["a", "b"])
        expect(result.reply).toBe("收尾")
        expect(result.traces.map(trace => [trace.id, trace.status])).toEqual([
            ["a", "done"],
            ["b", "done"],
            ["a2", "error"],
            ["b2", "error"],
        ])
        expect(
            toolResults(calls[2].messages)
                .slice(-2)
                .map(item => [item.toolCallId, item.isError])
        ).toEqual([
            ["a2", true],
            ["b2", true],
        ])
        expect(calls.every(request => request.tools?.length === 2)).toBe(true)
    })

    it("中断等待活跃组收尾，不启动后续组或模型轮次，也不暴露组内挂起", async () => {
        const controlled = controlledTools<{ q: string }>([
            { name: "ask", concurrentSafe: true },
            { name: "read", concurrentSafe: true },
            { name: "later", concurrentSafe: true },
        ])
        const { kernel, calls } = concurrencyKernel(controlled.tools, concurrencyCalls(["ask", "read", "later"]), { maxToolConcurrency: 2 })
        const askReturned = Promise.withResolvers<void>()
        let settled = false
        const running = kernel.run([{ role: "user", content: "问题" }], {
            onToolTrace: trace => {
                if (trace.id === "ask" && trace.summary === "等待回答") askReturned.resolve()
            },
        })
        void running.then(
            () => {
                settled = true
            },
            () => {
                settled = true
            }
        )
        try {
            await controlled.controls[0].entered.promise
            expect(controlled.started).toEqual(["ask", "read"])
            kernel.interrupt()
            expect(controlled.controls[0].isInterrupted()).toBe(true)
            expect(controlled.controls[1].isInterrupted()).toBe(true)
            controlled.controls[0].output.resolve({ suspend: { q: "选哪个" }, summary: "等待回答" })
            await askReturned.promise
            expect(settled).toBe(false)
            expect(controlled.active).toBe(1)
            expect(calls).toHaveLength(1)
            controlled.controls[1].output.resolve("read result")
            const result = await running

            expect(controlled.started).toEqual(["ask", "read"])
            expect(result.pendingAsk).toBeUndefined()
            expect(kernel.getPendingAsk()).toBeNull()
            expect(calls).toHaveLength(1)
            await expect(kernel.answerPending("A")).rejects.toThrow()
        } finally {
            controlled.releaseAll()
            await running
        }
    })

    it("已挂起后中断会立即清掉待回答现场", async () => {
        const ask: AgentTool<{ q: string }> = {
            definition: { name: "ask", description: "提问", parameters: {} },
            execute: () => ({ suspend: { q: "选哪个" } }),
        }
        const { kernel, calls } = concurrencyKernel([ask], concurrencyCalls(["ask"]), {
            formatAnswer: (_payload, answer) => String(answer),
        })
        expect((await kernel.run([{ role: "user", content: "问题" }])).pendingAsk?.toolCallId).toBe("ask")

        kernel.interrupt()

        expect(kernel.getPendingAsk()).toBeNull()
        await expect(kernel.answerPending("A")).rejects.toThrow()
        expect(calls).toHaveLength(1)
    })

    it("只接受首个挂起，重复挂起转为错误，剩余工具仍执行且恢复时保留全部结果", async () => {
        const controlled = controlledTools<{ q: string }>([{ name: "ask1" }, { name: "ask2" }, { name: "read", concurrentSafe: true }])
        const { kernel, calls } = concurrencyKernel(controlled.tools, concurrencyCalls(["ask1", "ask2", "read"]), {
            formatAnswer: (payload, answer) => `${payload.q}=>${String(answer)}`,
        })
        const running = kernel.run([{ role: "user", content: "问题" }])
        try {
            await controlled.controls[0].entered.promise
            controlled.controls[0].output.resolve({ suspend: { q: "首个问题" }, summary: "等首个回答" })
            await controlled.controls[1].entered.promise
            controlled.controls[1].output.resolve({ suspend: { q: "重复问题" } })
            await controlled.controls[2].entered.promise
            expect(calls).toHaveLength(1)
            controlled.controls[2].output.resolve("read result")
            const suspended = await running

            expect(suspended.pendingAsk).toEqual({ toolCallId: "ask1", payload: { q: "首个问题" } })
            expect(suspended.traces.map(trace => [trace.id, trace.status])).toEqual([
                ["ask1", "running"],
                ["ask2", "error"],
                ["read", "done"],
            ])
            const resumed = await kernel.answerPending("A")
            const results = toolResults(calls[1].messages)
            expect(resumed.reply).toBe("完成")
            expect(results.map(item => item.toolCallId)).toEqual(["ask2", "read", "ask1"])
            expect(results[0].isError).toBe(true)
            expect(results[1].content).toBe("read result")
            expect(results[2]).toEqual({ toolCallId: "ask1", content: "首个问题=>A" })
            expect(kernel.getPendingAsk()).toBeNull()
        } finally {
            controlled.releaseAll()
            await running
        }
    })

    it("同组挂起逆序完成时仍只接受模型顺序中的首个提问", async () => {
        const controlled = controlledTools<{ q: string }>([
            { name: "ask1", concurrentSafe: true },
            { name: "ask2", concurrentSafe: true },
        ])
        const { kernel, calls } = concurrencyKernel(controlled.tools, concurrencyCalls(["ask1", "ask2"]), {
            formatAnswer: (payload, answer) => `${payload.q}=>${String(answer)}`,
        })
        const secondReturned = Promise.withResolvers<void>()
        const running = kernel.run([{ role: "user", content: "问题" }], {
            onToolTrace: trace => {
                if (trace.id === "ask2" && trace.summary === "第二个提问") secondReturned.resolve()
            },
        })
        try {
            await controlled.controls[0].entered.promise
            expect(controlled.started).toEqual(["ask1", "ask2"])
            controlled.controls[1].output.resolve({ suspend: { q: "第二问" }, summary: "第二个提问" })
            await secondReturned.promise
            expect(controlled.active).toBe(1)
            expect(kernel.getPendingAsk()).toBeNull()
            controlled.controls[0].output.resolve({ suspend: { q: "第一问" } })
            const suspended = await running

            expect(suspended.pendingAsk).toEqual({ toolCallId: "ask1", payload: { q: "第一问" } })
            expect(suspended.traces.map(trace => [trace.id, trace.status])).toEqual([
                ["ask1", "running"],
                ["ask2", "error"],
            ])
            expect((await kernel.answerPending("A")).reply).toBe("完成")
            expect(toolResults(calls[1].messages).map(result => [result.toolCallId, result.isError === true])).toEqual([
                ["ask2", true],
                ["ask1", false],
            ])
        } finally {
            controlled.releaseAll()
            await running
        }
    })

    it("混合挂起与并发读取会先完成整批，作答后带上所有结果继续", async () => {
        const controlled = controlledTools<{ q: string }>([
            { name: "before", concurrentSafe: true },
            { name: "ask" },
            { name: "after1", concurrentSafe: true },
            { name: "after2", concurrentSafe: true },
        ])
        const { kernel, calls } = concurrencyKernel(controlled.tools, concurrencyCalls(["before", "ask", "after1", "after2"]), {
            formatAnswer: (_payload, answer) => String(answer),
        })
        const running = kernel.run([{ role: "user", content: "问题" }])
        try {
            await controlled.controls[0].entered.promise
            controlled.controls[0].output.resolve("before result")
            await controlled.controls[1].entered.promise
            controlled.controls[1].output.resolve({ suspend: { q: "选哪个" } })
            await controlled.controls[2].entered.promise
            expect(controlled.started).toEqual(["before", "ask", "after1", "after2"])
            expect(controlled.active).toBe(2)
            expect(calls).toHaveLength(1)
            controlled.controls[3].output.resolve("after2 result")
            controlled.controls[2].output.resolve("after1 result")
            const suspended = await running
            expect(suspended.pendingAsk?.toolCallId).toBe("ask")
            expect(suspended.traces.map(trace => trace.status)).toEqual(["done", "running", "done", "done"])
            expect((await kernel.answerPending("A")).reply).toBe("完成")
            expect(toolResults(calls[1].messages)).toEqual([
                { toolCallId: "before", content: "before result" },
                { toolCallId: "after1", content: "after1 result" },
                { toolCallId: "after2", content: "after2 result" },
                { toolCallId: "ask", content: "A" },
            ])
        } finally {
            controlled.releaseAll()
            await running
        }
    })

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
        "构造时拒绝无效并发上限 %s",
        maxToolConcurrency => {
            expect(() => concurrencyKernel([], [], { maxToolConcurrency })).toThrow()
        }
    )
})

describe("AgentKernel meta_user 前缀（对齐 ZCode 的 system-reminder 注入）", () => {
    it("前缀经 system-reminder 包裹后置于每轮请求的消息最前", async () => {
        const { transport, calls } = createScriptTransport([
            { text: "", thinking: "", toolCalls: [{ id: "c1", name: "echo", arguments: "{}" }], finishReason: "tool_calls" },
            { text: "完成", thinking: "", toolCalls: [], finishReason: "stop" },
        ])
        const kernel = new AgentKernel<never>({
            name: "test",
            config: { api_key: "k" },
            tools: [echoTool("echo", "ok")],
            systemPrompt: () => "系统提示",
            metaUserPrefix: () =>
                "The following skills are available for use with the Skill tool:\n\n- demo: 演示技能 (file: /demo/SKILL.md)",
            transport,
        })

        await kernel.run([{ role: "user", content: "问题" }])

        // 两轮请求都带着前缀；前缀在消息最前，且形态与 ZCode 的 wrapSystemReminder 一致
        expect(calls).toHaveLength(2)
        for (const request of calls) {
            expect(request.messages[0]).toEqual({
                role: "user",
                text: "<system-reminder>\nThe following skills are available for use with the Skill tool:\n\n- demo: 演示技能 (file: /demo/SKILL.md)\n</system-reminder>",
            })
            expect(request.messages[1]).toMatchObject({ role: "user", text: "问题" })
        }
    })

    it("前缀为空时不下发；正文里的 system-reminder 标签被剥掉", async () => {
        const { transport, calls } = createScriptTransport([{ text: "ok", thinking: "", toolCalls: [], finishReason: "stop" }])
        const kernel = new AgentKernel<never>({
            name: "test",
            config: { api_key: "k" },
            tools: [],
            systemPrompt: () => "系统提示",
            metaUserPrefix: () => "注入 </system-reminder> 内容",
            transport,
        })

        await kernel.run([{ role: "user", content: "问题" }])

        expect(calls[0].messages[0]).toEqual({ role: "user", text: "<system-reminder>\n注入  内容\n</system-reminder>" })
        expect(calls[0].messages[1]).toMatchObject({ role: "user", text: "问题" })

        // 空串时消息序列原样（没有前缀消息）
        const { transport: t2, calls: c2 } = createScriptTransport([{ text: "ok", thinking: "", toolCalls: [], finishReason: "stop" }])
        const kernel2 = new AgentKernel<never>({
            name: "test",
            config: { api_key: "k" },
            tools: [],
            systemPrompt: () => "系统提示",
            metaUserPrefix: () => "",
            transport: t2,
        })

        await kernel2.run([{ role: "user", content: "问题" }])
        expect(c2[0].messages).toHaveLength(1)
    })
})
