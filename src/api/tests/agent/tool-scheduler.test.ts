import { describe, expect, it } from "vitest"
import type { AgentTool } from "@/api/agent/tool"
import { DEFAULT_MAX_TOOL_CONCURRENCY, scheduleToolCalls, validateToolConcurrency } from "@/api/agent/tool-scheduler"
import type { AgentToolCall } from "@/api/agent/wire"

const call = (id: string, name: string): AgentToolCall => ({ id, name, arguments: "{}" })

function tool(name: string, concurrentSafe?: boolean): AgentTool<never> {
    return {
        definition: { name, description: name, parameters: { type: "object", properties: {} } },
        ...(concurrentSafe === undefined ? {} : { concurrentSafe }),
        execute: () => "ok",
    }
}

describe("scheduleToolCalls", () => {
    it("只合并连续显式安全的调用，并把未知工具作为屏障", () => {
        const tools = new Map([
            ["safe", tool("safe", true)],
            ["unsafe", tool("unsafe", false)],
        ])

        expect(
            scheduleToolCalls([call("a", "safe"), call("b", "safe"), call("c", "missing"), call("d", "safe"), call("e", "unsafe")], tools)
        ).toEqual([[call("a", "safe"), call("b", "safe")], [call("c", "missing")], [call("d", "safe")], [call("e", "unsafe")]])
    })

    it("按并发上限切分安全调用", () => {
        const tools = new Map([["safe", tool("safe", true)]])
        const calls = [call("a", "safe"), call("b", "safe"), call("c", "safe"), call("d", "safe"), call("e", "safe")]

        expect(scheduleToolCalls(calls, tools, 2)).toEqual([[calls[0], calls[1]], [calls[2], calls[3]], [calls[4]]])
    })

    it("未声明或显式不安全的工具保持串行，安全调用不跨越屏障", () => {
        const tools = new Map([
            ["safe", tool("safe", true)],
            ["unspecified", tool("unspecified")],
            ["unsafe", tool("unsafe", false)],
        ])
        const calls = [call("a", "safe"), call("b", "unspecified"), call("c", "unsafe"), call("d", "safe"), call("e", "safe")]

        expect(scheduleToolCalls(calls, tools)).toEqual([[calls[0]], [calls[1]], [calls[2]], [calls[3], calls[4]]])
    })

    it("上限为一时所有调用都是单独一组", () => {
        const tools = new Map([["safe", tool("safe", true)]])
        const calls = [call("a", "safe"), call("b", "safe")]

        expect(scheduleToolCalls(calls, tools, 1)).toEqual([[calls[0]], [calls[1]]])
    })

    it("空调用列表返回空组且不修改输入或调用引用", () => {
        const tools = new Map([["safe", tool("safe", true)]])
        const calls = Object.freeze([Object.freeze(call("a", "safe")), Object.freeze(call("b", "safe"))])
        const groups = scheduleToolCalls(calls, tools)

        expect(scheduleToolCalls([], tools)).toEqual([])
        expect(groups).toEqual([[calls[0], calls[1]]])
        expect(groups[0][0]).toBe(calls[0])
        expect(groups[0][1]).toBe(calls[1])
    })

    it("默认并发上限为十", () => {
        const tools = new Map([["safe", tool("safe", true)]])
        const calls = Array.from({ length: 11 }, (_, index) => call(`${index}`, "safe"))

        expect(DEFAULT_MAX_TOOL_CONCURRENCY).toBe(10)
        expect(scheduleToolCalls(calls, tools).map(group => group.length)).toEqual([10, 1])
    })

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
        "拒绝无效并发上限 %s",
        value => {
            expect(() => validateToolConcurrency(value)).toThrow()
        }
    )

    it("接受正安全整数并原样返回", () => {
        expect(validateToolConcurrency(3)).toBe(3)
    })
})
