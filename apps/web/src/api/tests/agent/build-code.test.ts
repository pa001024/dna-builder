import { describe, expect, it } from "vitest"
import { type AgentToolContext, readToolText } from "@/api/agent/tool"
import { createRunCodeTool } from "@/api/agent/tools/build-code"
import { renderBuildAgentSystemPrompt } from "@/shared/buildAgentSystemPrompt"
import { BUILD_API_DTS } from "@/shared/buildApiContract"
import { setBuildApi } from "@/utils/build-api"
import type { BuildApi } from "@/utils/build-api.contract"

const context: AgentToolContext = { isInterrupted: () => false }

async function runTool(code: string) {
    const tool = createRunCodeTool()
    const output = await tool.execute({ code }, context)
    return readToolText(output)
}

function fakeApi(): BuildApi {
    return { damage: () => 12345 } as unknown as BuildApi
}

describe("run_code 工具", () => {
    it("空代码直接判失败", async () => {
        const text = await runTool("   ")
        expect(text?.isError).toBe(true)
        expect(text?.content).toContain("code 不能为空")
    })

    it("配装页未就绪时拒绝执行", async () => {
        setBuildApi(null)
        const text = await runTool("return 1")
        expect(text?.isError).toBe(true)
        expect(text?.content).toContain("尚未就绪")
    })

    it("注册接口后能执行并返回结果", async () => {
        setBuildApi(fakeApi())
        const text = await runTool("return build.damage()")
        expect(text?.isError).toBe(false)
        expect(JSON.parse(text?.content ?? "{}")).toMatchObject({ ok: true, value: "12345" })
        setBuildApi(null)
    })
})

describe("沙箱契约", () => {
    it("契约原文会原样注入提示词", () => {
        expect(BUILD_API_DTS).toContain("interface BuildApi")
        const prompt = renderBuildAgentSystemPrompt({ ragEnabled: false })
        expect(prompt).toContain(BUILD_API_DTS)
        expect(prompt).toContain("run_code")
    })

    it("契约覆盖配装页的主要能力", () => {
        for (const name of [
            "settings",
            "weapon",
            "mods",
            "aura",
            "variant",
            "pet",
            "traits",
            "buffs",
            "team",
            "enemy",
            "target",
            "variable",
            "dot",
            "autoSolve",
            "raw",
            "current",
        ]) {
            expect(BUILD_API_DTS).toContain(`${name}(`)
        }
        expect(BUILD_API_DTS).toContain("compute: BuildCompute")
        expect(BUILD_API_DTS).toContain("util: BuildUtil")
        expect(BUILD_API_DTS).toContain("data: BuildData")
        expect(BUILD_API_DTS).toContain("ui: BuildUi")
    })

    it("沙箱方法一律是异步的（代码跑在独立线程里）", () => {
        const methods = [...BUILD_API_DTS.matchAll(/^\s{4}(?:\w+)\(.*\):\s*(.+)$/gm)].map(match => match[1])
        expect(methods.length).toBeGreaterThan(40)
        expect(methods.filter(type => !type.startsWith("Promise<")).map(type => type)).toEqual([])
    })
})
