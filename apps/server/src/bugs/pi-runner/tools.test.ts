import { describe, expect, it } from "bun:test"
import { assertToolManifest, type PiAgentTool } from "./agent"
import {
    BUG_TOOL_MANIFEST,
    BUG_TOOL_NAMES,
    type BugToolBackend,
    type BugToolGrant,
    createReadOnlyTools,
    createToolRequestHandler,
    normalizeToolArgs,
    toBugTokenUsage,
} from "./tools"

const grant: BugToolGrant = {
    submissionVersionId: "sub-1:1",
    gameId: "duet-night-abyss",
    jobId: "job-1",
    fencingToken: 3,
}

function fakeBackend(overrides: Partial<BugToolBackend> = {}): BugToolBackend {
    return {
        getSubmissionEvidence: async versionId => ({
            submissionVersionId: versionId,
            text: "游戏卡在结算页",
            textLength: 8,
            context: null,
            assets: [],
        }),
        searchBugCandidates: async (query, limit) => ({ candidates: [{ bugId: "bug-1", title: query, limit }] }),
        getBugPublicContext: async bugId =>
            bugId === "bug-1"
                ? {
                      bugId,
                      displayKey: "BUG-1",
                      title: "结算页卡住",
                      summary: "摘要",
                      actual: null,
                      expected: null,
                      steps: [],
                      environment: null,
                      primaryCategory: "ui",
                      tags: [],
                      status: "untriaged",
                      fixStage: null,
                      suggestedSeverity: null,
                      confirmedSeverity: null,
                      severitySource: null,
                      createdAt: null,
                      version: 1,
                  }
                : null,
        ...overrides,
    }
}

describe("pi runner tools", () => {
    it("工具清单恰为三个允许的只读工具", () => {
        const tools = createReadOnlyTools({ grant, invoke: async () => ({}) })
        expect(tools.map(tool => tool.name)).toEqual([...BUG_TOOL_NAMES])
        expect(() => assertToolManifest(tools, BUG_TOOL_MANIFEST)).not.toThrow()
        for (const tool of tools) {
            expect(tool.executionMode).toBe("sequential")
            expect(tool.parameters.type).toBe("object")
        }
    })

    it("额外工具、缺失工具与重名工具都 fail-closed", () => {
        const tools = createReadOnlyTools({ grant, invoke: async () => ({}) })
        const extra = [...tools, { ...tools[0]!, name: "run_shell", label: "shell" }]
        expect(() => assertToolManifest(extra, BUG_TOOL_MANIFEST)).toThrow(/工具清单/)
        expect(() => assertToolManifest(tools.slice(0, 2), BUG_TOOL_MANIFEST)).toThrow(/工具清单/)
        expect(() => assertToolManifest([tools[0]!, tools[0]!, tools[2]!], BUG_TOOL_MANIFEST)).toThrow(/重复/)
        expect(() => assertToolManifest([{ ...tools[0]!, label: "" }, tools[1]!, tools[2]!], BUG_TOOL_MANIFEST)).toThrow(/label/)
    })

    it("工具 execute 经 invoke 转发并返回 JSON 文本与 details", async () => {
        const calls: Array<Record<string, unknown>> = []
        const tools = createReadOnlyTools({
            grant,
            invoke: async call => {
                calls.push({ name: call.name, args: call.args })
                return { candidates: [] }
            },
        })
        const search = tools.find(tool => tool.name === "search_bug_candidates")!
        const result = await search.execute("call-1", { query: "结算页", limit: 99 })
        expect(calls[0]).toEqual({ name: "search_bug_candidates", args: { query: "结算页", limit: 20 } })
        expect(result.content[0]).toEqual({ type: "text", text: JSON.stringify({ candidates: [] }) })
        expect(result.details).toEqual({ candidates: [] })
    })

    it("证据版本不在 grant 范围内时拒绝且不发起 IPC", async () => {
        let invoked = 0
        const tools = createReadOnlyTools({ grant, invoke: async () => (invoked += 1) })
        const evidence = tools.find(tool => tool.name === "get_submission_evidence")!
        await expect(evidence.execute("call-1", { submissionVersionId: "sub-2:1" })).rejects.toThrow(/不属于当前任务/)
        expect(invoked).toBe(0)
    })

    it("工具总调用次数有上限，超出后不再执行", async () => {
        let invoked = 0
        const tools = createReadOnlyTools({ grant, invoke: async () => (invoked += 1), maxCalls: 2 })
        const context = tools.find(tool => tool.name === "get_bug_public_context")!
        await context.execute("call-1", { bugId: "bug-1" })
        await context.execute("call-2", { bugId: "bug-1" })
        await expect(context.execute("call-3", { bugId: "bug-1" })).rejects.toThrow(/超过上限/)
        expect(invoked).toBe(2)
    })

    it("检索参数校验：空查询与超长查询拒绝，limit 收敛到 1..20", () => {
        expect(() => normalizeToolArgs("search_bug_candidates", { query: "   " }, grant)).toThrow(/必填/)
        expect(() => normalizeToolArgs("search_bug_candidates", { query: "字".repeat(201) }, grant)).toThrow(/长度上限/)
        expect(normalizeToolArgs("search_bug_candidates", { query: "卡", limit: 0 }, grant).limit).toBe(1)
        expect(normalizeToolArgs("search_bug_candidates", { query: "卡", limit: 500 }, grant).limit).toBe(20)
        expect(() => normalizeToolArgs("search_bug_candidates", { query: "卡", limit: "5" }, grant)).toThrow(/limit/)
    })

    it("父进程执行器二次校验工具名、参数与授权", async () => {
        const backend = fakeBackend()
        const handler = createToolRequestHandler({ backend, grant, maxCalls: 1 })

        await expect(handler({ name: "run_shell", args: {} })).resolves.toEqual({
            ok: false,
            error: expect.stringContaining("tool_call_rejected"),
        })
        await expect(handler({ name: "get_submission_evidence", args: { submissionVersionId: "other:1" } })).resolves.toEqual({
            ok: false,
            error: expect.stringContaining("tool_call_rejected"),
        })

        const search = await handler({ name: "search_bug_candidates", args: { query: "结算页" } })
        expect(search).toEqual({ ok: true, result: { candidates: [{ bugId: "bug-1", title: "结算页", limit: 20 }] } })

        const third = await handler({ name: "get_bug_public_context", args: { bugId: "bug-1" } })
        expect(third).toEqual({ ok: false, error: expect.stringContaining("tool_budget_exceeded") })
    })

    it("后端错误转成 ok:false，而不是伪造成功", async () => {
        const handler = createToolRequestHandler({
            backend: fakeBackend({ searchBugCandidates: async () => Promise.reject(new Error("索引不可用")) }),
            grant,
        })
        await expect(handler({ name: "search_bug_candidates", args: { query: "卡" } })).resolves.toEqual({
            ok: false,
            error: "索引不可用",
        })
    })

    it("token 用量按 bug_ai_runs 字段口径映射", () => {
        expect(toBugTokenUsage(undefined)).toBeUndefined()
        expect(toBugTokenUsage({ input: 12, output: 3, cachedInput: 4 })).toEqual({
            inputTokens: 12,
            outputTokens: 3,
            cachedInputTokens: 4,
        })
    })

    it("工具类型声明包含 pi 必需的 label", () => {
        const tool: PiAgentTool = createReadOnlyTools({ grant, invoke: async () => ({}) })[0]!
        expect(typeof tool.label).toBe("string")
    })
})
