import { describe, expect, it } from "vitest"
import { type AgentToolContext, readToolText } from "@/api/agent/tool"
import { createRunGraphCodeTool } from "@/api/agent/tools/graph-code"
import { createGraphAgent } from "@/api/graphAgent"
import { renderGraphAgentSystemPrompt } from "@/shared/graphAgentSystemPrompt"
import { GRAPH_API_DTS } from "@/shared/graphApiContract"
import { setGraphApi } from "@/utils/graph-api"
import type { GraphApi } from "@/utils/graph-api.contract"

const context: AgentToolContext = { isInterrupted: () => false }

async function runTool(code: string) {
    const tool = createRunGraphCodeTool()
    const output = await tool.execute({ code }, context)
    return readToolText(output)
}

function fakeApi(): GraphApi {
    return {
        state: async () => ({ name: "test", nodes: [], edges: [], nodeCount: 0, edgeCount: 0 }),
    } as unknown as GraphApi
}

describe("graph run_code 工具", () => {
    it("空代码直接判失败", async () => {
        const text = await runTool("   ")
        expect(text?.isError).toBe(true)
        expect(text?.content).toContain("code 不能为空")
    })

    it("节点图未就绪时拒绝执行", async () => {
        setGraphApi(null)
        const text = await runTool("return 1")
        expect(text?.isError).toBe(true)
        expect(text?.content).toContain("尚未就绪")
    })

    it("注册接口后能执行并返回结果", async () => {
        setGraphApi(fakeApi())
        const text = await runTool("return (await graph.state()).nodeCount")
        expect(text?.isError).toBe(false)
        expect(JSON.parse(text?.content ?? "{}")).toMatchObject({ ok: true, value: "0" })
        setGraphApi(null)
    })
})

describe("节点图助手装配", () => {
    it("契约原文会原样注入提示词", () => {
        expect(GRAPH_API_DTS).toContain("interface GraphApi")
        const prompt = renderGraphAgentSystemPrompt({ ragEnabled: false })
        expect(prompt).toContain(GRAPH_API_DTS)
        expect(prompt).toContain("run_code")
    })

    it("契约覆盖节点图页面的主要能力", () => {
        for (const name of [
            "types",
            "state",
            "addNode",
            "updateNode",
            "removeNode",
            "connect",
            "disconnect",
            "clear",
            "evaluate",
            "import",
            "export",
            "save",
            "log",
        ]) {
            expect(GRAPH_API_DTS).toContain(`${name}(`)
        }
    })

    it("工具面以 run_code 打头并带配装同口径的检索子集", () => {
        const agent = createGraphAgent({ api_key: "" })
        const tools = (agent as unknown as { resolveTools: () => { definition: { name: string } }[] }).resolveTools()
        expect(tools[0].definition.name).toBe("run_code")
        const names = tools.map(tool => tool.definition.name)
        expect(names).toContain("search_data")
    })
})
