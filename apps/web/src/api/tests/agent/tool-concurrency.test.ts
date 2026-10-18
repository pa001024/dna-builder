import { describe, expect, it } from "vitest"
import { createRunCodeTool } from "@/api/agent/tools/build-code"
import {
    createClickTool,
    createPressKeyTool,
    createReadPageTool,
    createScrollTool,
    createSelectOptionTool,
    createTypeTool,
} from "@/api/agent/tools/build-ui"
import { createDbRetrievalTools } from "@/api/agent/tools/db-retrieval"
import { createSkillTools } from "@/api/agent/tools/skill-files"

describe("内置工具并发安全契约", () => {
    it("所有资料检索工具可并发，但提问保持串行", () => {
        const tools = createDbRetrievalTools({ ragEnabled: true })
        const retrievals = tools.filter(tool => tool.definition.name !== "ask_user")

        expect(retrievals.length).toBeGreaterThan(0)
        expect(retrievals.every(tool => tool.concurrentSafe === true)).toBe(true)
        expect(tools.find(tool => tool.definition.name === "ask_user")?.concurrentSafe).not.toBe(true)
    })

    it("技能文件访问可并发", () => {
        const tools = createSkillTools()

        expect(tools.map(tool => tool.definition.name)).toEqual(["skill", "list_file", "read_file", "grep"])
        expect(tools.every(tool => tool.concurrentSafe === true)).toBe(true)
    })

    it("共享沙箱和页面状态的工具保持串行", () => {
        const tools = [
            createRunCodeTool(),
            createReadPageTool(),
            createClickTool(),
            createTypeTool(),
            createSelectOptionTool(),
            createPressKeyTool(),
            createScrollTool(),
        ]

        expect(tools.every(tool => tool.concurrentSafe !== true)).toBe(true)
    })
})
