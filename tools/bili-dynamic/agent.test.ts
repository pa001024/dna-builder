import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { formatCompactSummary, groupRoundStartIndexes, resolveAutoCompactThreshold } from "./agent/compact.ts"
import { estimateMessagesTokens, estimateTextTokens, resolveModelContextWindow } from "./agent/context.ts"
import { validateGeneratedHtml } from "./agent/index.ts"
import { createRepoAgentTools } from "./agent/repo-tools.ts"
import type { AgentTool } from "./agent/tool.ts"
import { scheduleToolCalls } from "./agent/tool.ts"
import type { AgentToolDefinition } from "./agent/wire.ts"

const hasRg = (() => {
    try {
        execFileSync("rg", ["--version"], { stdio: "ignore" })
        return true
    } catch {
        return false
    }
})()

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

    it("拒绝内联事件属性", () => {
        expect(() => validateGeneratedHtml('<html><body><img src="x" onerror="alert(1)"></body></html>')).toThrow()
        expect(() => validateGeneratedHtml('<html><body><svg onload = "alert(1)"></svg></body></html>')).toThrow()
    })

    it("拒绝会加载外部资源的元素与 CSS 指令", () => {
        expect(() => validateGeneratedHtml('<html><body><iframe src="https://github.com/x"></iframe></body></html>')).toThrow()
        expect(() => validateGeneratedHtml('<html><head><link rel="stylesheet" href="/a.css"></head><body></body></html>')).toThrow()
        expect(() =>
            validateGeneratedHtml("<html><head><style>@import url(https://evil.example/a.css);</style></head><body></body></html>")
        ).toThrow()
    })

    it("拒绝相似域名与协议相对 URL", () => {
        // 结尾精确匹配主机名：github.com.evil.example 不能通过
        expect(() => validateGeneratedHtml('<html><body><img src="https://github.com.evil.example/a.png"></body></html>')).toThrow()
        expect(() => validateGeneratedHtml('<html><body><img src="//evil.example/a.png"></body></html>')).toThrow()
        // 不带文件扩展名同样要拦住
        expect(() =>
            validateGeneratedHtml('<html><body><div style="background:url(https://evil.example/a)"></div></body></html>')
        ).toThrow()
    })

    it("允许仓库与站点自身链接", () => {
        expect(() =>
            validateGeneratedHtml('<html><body><a href="https://github.com/pa001024/dna-builder">repo</a></body></html>')
        ).not.toThrow()
        expect(() =>
            validateGeneratedHtml('<html><body><a href="https://dna-builder.cn/">站</a><img src="https://dobapp.cc/a.png"></body></html>')
        ).not.toThrow()
    })

    it("允许 data: 内联资源与纯文本内容", () => {
        expect(() =>
            validateGeneratedHtml(
                '<html><body><img src="data:image/png;base64,AAAA"><div style="background:url(data:image/svg+xml;base64,AA)"></div></body></html>'
            )
        ).not.toThrow()
        expect(() => validateGeneratedHtml("<html><body><p>https: 不是 URL</p></body></html>")).not.toThrow()
    })
})

describe("仓库工具的安全边界", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "bili-dynamic-tools-"))
    const tools = new Map(createRepoAgentTools(root, new Map()).map(tool => [tool.definition.name, tool]))
    const call = (name: string, args: Record<string, unknown>) =>
        tools.get(name)?.execute(args, {
            isInterrupted: () => false,
            round: 1,
        })

    beforeAll(() => {
        writeFileSync(path.join(root, "app.ts"), "const answer = 42\n")
        // 以 ".." 开头但仍在仓库内的文件名不能被当成越界路径
        writeFileSync(path.join(root, "..foo.txt"), "dotdot\n")
        writeFileSync(path.join(root, ".env"), "SECRET=1\n")
        mkdirSync(path.join(root, "node_modules"))
        writeFileSync(path.join(root, "node_modules", "pkg.js"), "module.exports = 1\n")
        writeFileSync(path.join(root, "..outside.txt"), "outside\n")
    })

    afterAll(() => {
        rmSync(root, { recursive: true, force: true })
    })

    it("仓库根路径可以被列出，屏蔽项不出现", async () => {
        const output = String(await call("list_dir", { path: "." }))
        expect(output).toContain("app.ts")
        expect(output).toContain("..foo.txt")
        expect(output).not.toContain(".env")
        expect(output).not.toContain("node_modules/")
    })

    it("以 .. 开头的文件名可读，真正的越界路径被拒绝", async () => {
        expect(String(await call("read_file", { path: "..foo.txt" }))).toContain("dotdot")
        expect(() => call("read_file", { path: "../outside.txt" })).toThrow()
        expect(() => call("read_file", { path: ".env" })).toThrow()
    })

    it("搜索模式以 - 开头时按正则处理，不会被当成 rg 参数", async () => {
        if (!hasRg) return
        expect(String(await call("search_code", { pattern: "--pre=id" }))).toBe("（无匹配）")
        expect(String(await call("search_code", { pattern: "answer = 42" }))).toContain("app.ts")
    })

    it("git 工具拒绝写文件、越界读取与变更仓库状态的参数", () => {
        expect(() => call("git", { args: ["diff", "--no-index", "/etc/passwd", "app.ts"] })).toThrow()
        expect(() => call("git", { args: ["show", "--output=out.txt", "HEAD"] })).toThrow()
        expect(() => call("git", { args: ["show", "HEAD:.env"] })).toThrow()
        expect(() => call("git", { args: ["tag", "v9.9.9"] })).toThrow()
        expect(() => call("git", { args: ["tag", "-d", "v1.0.0"] })).toThrow()
    })
})
