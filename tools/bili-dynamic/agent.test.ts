import { describe, expect, it } from "vitest"
import { formatCompactSummary, groupRoundStartIndexes, resolveAutoCompactThreshold } from "./agent/compact.ts"
import { estimateMessagesTokens, estimateTextTokens, resolveModelContextWindow } from "./agent/context.ts"
import { validateGeneratedHtml } from "./agent/index.ts"
import type { AgentTool } from "./agent/tool.ts"
import { scheduleToolCalls } from "./agent/tool.ts"
import type { AgentToolDefinition } from "./agent/wire.ts"

function tool(name: string, concurrentSafe?: boolean): AgentTool {
    const definition: AgentToolDefinition = { name, description: name, parameters: {} }
    return { definition, concurrentSafe, execute: () => "ok" }
}

describe("estimateTextTokens", () => {
    it("CJK 按双权重、其余按单权重，除以 3 向上取整", () => {
        expect(estimateTextTokens("")).toBe(0)
        expect(estimateTextTokens("abc")).toBe(1)
        expect(estimateTextTokens("中文")).toBe(2)
    })

    it("消息估算把工具结果算进上下文", () => {
        const withResult = estimateMessagesTokens([
            { role: "user", text: "", toolResults: [{ toolCallId: "a", content: "x".repeat(300) }] },
        ])
        expect(withResult).toBeGreaterThan(estimateMessagesTokens([{ role: "user", text: "" }]))
    })
})

describe("resolveModelContextWindow", () => {
    it("按模型名解析窗口", () => {
        expect(resolveModelContextWindow("deepseek-flash")).toBe(1_000_000)
        expect(resolveModelContextWindow("gpt-4o")).toBe(131_072)
    })
})

describe("resolveAutoCompactThreshold", () => {
    it("阈值 = 窗口 − 输出预留 − 安全缓冲，且不为负", () => {
        expect(resolveAutoCompactThreshold(1_000_000, 16_000)).toBe(1_000_000 - 16_000 - 13_000)
        expect(resolveAutoCompactThreshold(10_000, 32_768)).toBe(0)
    })
})

describe("groupRoundStartIndexes", () => {
    it("每条助手消息开启新一轮", () => {
        expect(
            groupRoundStartIndexes([
                { role: "user", text: "" },
                { role: "assistant", text: "", toolCalls: [] },
            ])
        ).toEqual([0, 1])
    })
})

describe("formatCompactSummary", () => {
    it("优先取 summary 标签", () => {
        expect(formatCompactSummary("<analysis>x</analysis><summary>摘要</summary>")).toBe("摘要")
    })

    it("没有标签时剥掉 analysis", () => {
        expect(formatCompactSummary("<analysis>x</analysis>正文")).toBe("正文")
    })
})

describe("scheduleToolCalls", () => {
    it("并发安全工具合并执行，串行工具是屏障", () => {
        const tools = new Map([
            ["a", tool("a", true)],
            ["b", tool("b", true)],
            ["c", tool("c")],
        ])
        const groups = scheduleToolCalls(
            [
                { id: "1", name: "a", arguments: "{}" },
                { id: "2", name: "b", arguments: "{}" },
                { id: "3", name: "c", arguments: "{}" },
            ],
            tools
        )
        expect(groups.map(group => group.map(call => call.name))).toEqual([["a", "b"], ["c"]])
    })
})

describe("validateGeneratedHtml", () => {
    it("接受完整文档", () => {
        expect(validateGeneratedHtml("<html><body>ok</body></html>")).toContain("<body>")
    })

    it("拒绝片段", () => {
        expect(() => validateGeneratedHtml("<div>片段</div>")).toThrow()
    })

    it("拒绝脚本", () => {
        expect(() => validateGeneratedHtml("<html><body><script>alert(1)</script></body></html>")).toThrow()
    })

    it("拒绝外部图片与字体", () => {
        expect(() => validateGeneratedHtml('<html><body><img src="https://evil.example/a.png"></body></html>')).toThrow()
    })

    it("允许仓库与站点自身链接", () => {
        expect(() =>
            validateGeneratedHtml('<html><body><a href="https://github.com/pa001024/dna-builder">repo</a></body></html>')
        ).not.toThrow()
    })
})
