import { describe, expect, it } from "vitest"
import { createDbRetrievalTools } from "@/api/agent/tools/db-retrieval"
import { DB_RETRIEVAL_PROFILES } from "@/api/agent/tools/retrieval-modules"

/**
 * @description 执行工具并解析它返回的 JSON 正文。
 * @param tool 待执行工具
 * @param args 调用参数
 * @returns 解析后的结果对象
 */
async function callTool(
    tool: { execute: (args: Record<string, unknown>, ctx: { isInterrupted(): boolean }) => unknown },
    args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
    const output = (await tool.execute(args, { isInterrupted: () => false })) as { content?: string }

    return JSON.parse(output.content ?? "{}") as Record<string, unknown>
}

/**
 * @description 取工具集里的工具名清单。
 * @param tools 工具集
 * @returns 工具名数组
 */
function names(tools: { definition: { name: string } }[]): string[] {
    return tools.map(tool => tool.definition.name)
}

describe("资料检索工具集裁剪", () => {
    it("默认给出全套工具（含剧情与 ask_user）", () => {
        const tools = createDbRetrievalTools({ ragEnabled: true })

        expect(names(tools)).toContain("search_story")
        expect(names(tools)).toContain("read_story")
        expect(names(tools)).toContain("list_version_additions")
        expect(names(tools)).toContain("ask_user")
    })

    it("story=false 时去掉剧情与版本新增工具", () => {
        const tools = createDbRetrievalTools({ story: false })

        expect(names(tools)).not.toContain("search_story")
        expect(names(tools)).not.toContain("read_story")
        expect(names(tools)).not.toContain("list_version_additions")
        // 与配装直接相关的检索能力必须保留
        expect(names(tools)).toContain("read_entry")
        expect(names(tools)).toContain("explain_damage")
    })

    it("上下文检索增强关闭时不声明 rag_search", () => {
        expect(names(createDbRetrievalTools({ ragEnabled: false }))).not.toContain("rag_search")
    })

    it("页面渲染工具只按 page 开关声明", () => {
        expect(names(createDbRetrievalTools({ page: true }))).toContain("render_page")
        expect(names(createDbRetrievalTools({}))).not.toContain("render_page")
        // 资料检索 profile 开、配装 profile 不开：配装页自己有 read_page
        expect(DB_RETRIEVAL_PROFILES.db.page).toBe(true)
        expect(DB_RETRIEVAL_PROFILES.build.page).not.toBe(true)
    })

    it("render_page 拒绝非资料库路径并给出提示", async () => {
        const tools = createDbRetrievalTools({ page: true })
        const pageTool = tools.find(tool => tool.definition.name === "render_page")

        expect(pageTool).toBeDefined()

        const denied = (await pageTool!.execute({ path: "/setting" }, { isInterrupted: () => false })) as {
            content?: string
            isError?: boolean
        }

        expect(denied.isError).toBe(true)
        expect(JSON.parse(denied.content ?? "{}")).toMatchObject({ path: "/setting" })
    })

    it("模块白名单会收敛 list_data_modules 与越权访问", async () => {
        const tools = createDbRetrievalTools({ modules: ["mod", "weapon"], story: false })
        const byName = new Map(tools.map(tool => [tool.definition.name, tool]))

        const listTool = byName.get("list_data_modules")

        expect(listTool).toBeDefined()

        const listed = await callTool(listTool!)
        const ids = (listed.modules as Array<{ id: string }>).map(item => item.id)

        expect(ids).toContain("mod")
        expect(ids).toContain("weapon")
        expect(ids.every(id => ["mod", "weapon"].includes(id))).toBe(true)

        // 越权模块：报错里要带上可用模块，模型才知道该换哪个
        const readTool = byName.get("read_entry")
        const denied = await callTool(readTool!, { module: "char" })

        expect(typeof denied.error).toBe("string")
        expect((denied.supported as string[]).sort()).toEqual(["mod", "weapon"])
    })

    it("ask_user 返回挂起载荷而不是结果正文", () => {
        const tools = createDbRetrievalTools({})
        const askTool = tools.find(tool => tool.definition.name === "ask_user")

        expect(askTool).toBeDefined()

        const output = askTool!.execute(
            { questions: [{ id: "type", header: "要查哪一类？", options: [{ id: "mod", label: "魔之楔" }] }] },
            { isInterrupted: () => false }
        ) as { suspend?: { id?: string }; isError?: boolean }

        // 挂起由主循环接手：这里只看「没有正文、有载荷」
        expect(output.suspend).toBeDefined()
        expect(output.isError).not.toBe(true)

        const invalid = askTool!.execute({ questions: [] }, { isInterrupted: () => false }) as { isError?: boolean }

        expect(invalid.isError).toBe(true)
    })
})

describe("任务链解锁条件（unlock，条件表 id）", () => {
    it("read_entry 返回解锁条件 id 与可读文本", async () => {
        const tools = createDbRetrievalTools({})
        const readTool = tools.find(tool => tool.definition.name === "read_entry")

        expect(readTool).toBeDefined()

        const result = await callTool(readTool!, { module: "questchain", id: "100102", lang: "zh" })
        const fields = (result.entry as { fields: Record<string, unknown> }).fields

        expect(fields["解锁条件id"]).toBe(100101)
        expect(fields["解锁条件"]).toContain("逃离净界岛")

        // 无前置要求的任务链不带解锁字段
        const noUnlock = await callTool(readTool!, { module: "questchain", id: "100101", lang: "zh" })
        const noFields = (noUnlock.entry as { fields: Record<string, unknown> }).fields

        expect(noFields["解锁条件id"]).toBeUndefined()
        expect(noFields["解锁条件"]).toBeUndefined()
    })

    it("search_story 命中携带 unlock", async () => {
        const tools = createDbRetrievalTools({})
        const searchTool = tools.find(tool => tool.definition.name === "search_story")

        expect(searchTool).toBeDefined()

        const result = await callTool(searchTool!, { keyword: "时光掩埋之地", lang: "zh" })
        const hits = result.hits as Array<{ chainId: number; unlock?: number }>
        const hit = hits.find(item => item.chainId === 100102)

        expect(hit?.unlock).toBe(100101)
    })

    it("read_story 的 chain 携带 unlock", async () => {
        const tools = createDbRetrievalTools({})
        const readStoryTool = tools.find(tool => tool.definition.name === "read_story")

        expect(readStoryTool).toBeDefined()

        const result = await callTool(readStoryTool!, { chain_id: 100102, lang: "zh", limit: 1 })

        expect((result.chain as { unlock?: number }).unlock).toBe(100101)
    })
})
