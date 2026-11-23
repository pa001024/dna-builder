import type { BugEnvironment, BugRow } from "../types"
import { type PiAgentTool, sha256Hex } from "./agent"
import { DEFAULT_PI_MAX_CANDIDATES, DEFAULT_PI_MAX_TOOL_CALLS, DEFAULT_PI_MAX_TOOL_QUERY_LENGTH, PiRunnerError } from "./config"

export const BUG_TOOL_NAMES = ["get_submission_evidence", "search_bug_candidates", "get_bug_public_context"] as const
export type BugToolName = (typeof BUG_TOOL_NAMES)[number]

export const BUG_TOOL_MANIFEST = BUG_TOOL_NAMES
export const BUG_TOOL_MANIFEST_SHA256 = sha256Hex(JSON.stringify([...BUG_TOOL_MANIFEST]))

/** job grant：工具只能引用当前任务授权的反馈版本；父进程另带 gameId 限定检索与读取范围。 */
export type BugToolGrant = {
    submissionVersionId: string
    gameId?: string
    jobId?: string
    fencingToken?: number
}

export type EvidenceAssetView = {
    assetId: string
    mimeType: string
    bytes: number
    width: number | null
    height: number | null
    scanState: string
    redactionState: string
}

/** 反馈证据视图：只含模型处理需要的原文与图片元数据，不含对象 key、回执或哈希。 */
export type SubmissionEvidenceView = {
    submissionVersionId: string
    text: string | null
    /** 原文的 Unicode code point 长度，证据偏移按该口径。 */
    textLength: number
    context: BugEnvironment | null
    assets: EvidenceAssetView[]
}

/** 公开 BUG 上下文：不含私有反馈、原始图片与内部字段。 */
export type PublicBugContext = {
    bugId: string
    displayKey: string
    title: string
    summary: string
    actual: string | null
    expected: string | null
    steps: string[]
    environment: BugEnvironment | null
    primaryCategory: string
    tags: string[]
    status: string
    fixStage: string | null
    suggestedSeverity: string | null
    confirmedSeverity: string | null
    severitySource: string | null
    createdAt: number | null
    version: number
}

export type BugToolBackend = {
    getSubmissionEvidence(submissionVersionId: string): Promise<SubmissionEvidenceView>
    searchBugCandidates(query: string, limit: number): Promise<unknown>
    getBugPublicContext(bugId: string): Promise<PublicBugContext | null>
}

export type ToolCall = { name: string; args: Record<string, unknown> }

export type ToolCallInvoker = (call: ToolCall & { name: BugToolName; signal?: AbortSignal }) => Promise<unknown>

/** 工具总调用次数上限；所有工具共享一个计数器。 */
class ToolCallBudget {
    private used = 0

    constructor(private readonly maxCalls: number) {}

    consume(name: string): void {
        this.used += 1
        if (this.used > this.maxCalls) {
            throw new PiRunnerError("tool_budget_exceeded", "工具调用超过上限", {
                detail: { name, maxCalls: this.maxCalls },
            })
        }
    }

    get remaining(): number {
        return Math.max(0, this.maxCalls - this.used)
    }
}

function asToolName(value: string): BugToolName {
    if (!(BUG_TOOL_NAMES as readonly string[]).includes(value)) {
        throw new PiRunnerError("tool_call_rejected", `未知工具：${value}`, { detail: { name: value } })
    }
    return value as BugToolName
}

function requireString(args: Record<string, unknown>, field: string, maxLength: number): string {
    const value = args[field]
    if (typeof value !== "string" || !value.trim()) {
        throw new PiRunnerError("tool_call_rejected", `${field} 必填且不能为空`, { detail: { field } })
    }
    if (value.length > maxLength) {
        throw new PiRunnerError("tool_call_rejected", `${field} 超过长度上限`, { detail: { field, maxLength } })
    }
    return value
}

/**
 * @description 规范化工具参数并做 grant 校验：只能是任务授权的证据版本，
 * 检索条数有界，未知参数不参与查询范围扩大。
 * @param name 工具名
 * @param args 模型给出的参数
 * @param grant 任务授权
 * @param maxQueryLength 检索词长度上限
 */
export function normalizeToolArgs(
    name: BugToolName,
    args: Record<string, unknown>,
    grant: BugToolGrant,
    maxQueryLength = DEFAULT_PI_MAX_TOOL_QUERY_LENGTH
): Record<string, unknown> {
    if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new PiRunnerError("tool_call_rejected", "args 必须是对象")
    }

    switch (name) {
        case "get_submission_evidence": {
            const submissionVersionId = requireString(args, "submissionVersionId", 128)
            if (submissionVersionId !== grant.submissionVersionId) {
                throw new PiRunnerError("tool_call_rejected", "证据版本不属于当前任务", { detail: { submissionVersionId } })
            }
            return { submissionVersionId }
        }
        case "search_bug_candidates": {
            const query = requireString(args, "query", maxQueryLength)
            let limit = DEFAULT_PI_MAX_CANDIDATES
            if (args.limit !== undefined) {
                if (typeof args.limit !== "number" || !Number.isFinite(args.limit)) {
                    throw new PiRunnerError("tool_call_rejected", "limit 必须是数字")
                }
                limit = Math.min(DEFAULT_PI_MAX_CANDIDATES, Math.max(1, Math.trunc(args.limit)))
            }
            return { query, limit }
        }
        case "get_bug_public_context": {
            const bugId = requireString(args, "bugId", 128)
            return { bugId }
        }
    }
}

/** 把落库 Bug 投影为公开上下文；调用方必须先校验 visibility 与 gameId。 */
export function toPublicBugContext(bug: BugRow): PublicBugContext {
    return {
        bugId: bug.id,
        displayKey: bug.displayKey,
        title: bug.title,
        summary: bug.summary,
        actual: bug.actual,
        expected: bug.expected,
        steps: bug.steps ?? [],
        environment: bug.environment ?? null,
        primaryCategory: bug.primaryCategory,
        tags: bug.tags ?? [],
        status: bug.status,
        fixStage: bug.fixStage,
        suggestedSeverity: bug.suggestedSeverity,
        confirmedSeverity: bug.confirmedSeverity,
        severitySource: bug.severitySource,
        createdAt: bug.createdAt,
        version: bug.version,
    }
}

function toolResult(payload: unknown): { content: { type: "text"; text: string }[]; details: unknown } {
    return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload }
}

/**
 * @description 子进程侧装配三个只读工具：execute 通过窄 IPC 把请求转给父进程执行，
 * 子进程既不持有数据库也不持有存储凭据；参数在发出前按 grant 校验并计入总调用预算。
 * @param options 授权、调用通道与预算
 * @returns 恰为三个工具的对象数组
 */
export function createReadOnlyTools(options: {
    grant: BugToolGrant
    invoke: ToolCallInvoker
    maxCalls?: number
    maxQueryLength?: number
    onCall?: (call: { name: BugToolName; args: Record<string, unknown> }) => void
}): PiAgentTool[] {
    const budget = new ToolCallBudget(options.maxCalls ?? DEFAULT_PI_MAX_TOOL_CALLS)

    const build = (
        name: BugToolName,
        label: string,
        description: string,
        properties: Record<string, unknown>,
        required: string[]
    ): PiAgentTool => ({
        name,
        label,
        description,
        parameters: { type: "object", properties, required },
        executionMode: "sequential",
        execute: async (_toolCallId, params, signal) => {
            const args = normalizeToolArgs(name, params, options.grant, options.maxQueryLength)
            budget.consume(name)
            options.onCall?.({ name, args })
            const result = await options.invoke({ name, args, signal })
            return toolResult(result)
        },
    })

    return [
        build(
            "get_submission_evidence",
            "读取反馈证据",
            "Read the submission's text and image evidence. Returns text spans and image metadata.",
            { submissionVersionId: { type: "string" } },
            ["submissionVersionId"]
        ),
        build(
            "search_bug_candidates",
            "检索疑似重复 BUG",
            "Search public bugs for potential duplicates. Returns ranked candidates.",
            { query: { type: "string" }, limit: { type: "number" } },
            ["query"]
        ),
        build(
            "get_bug_public_context",
            "读取公开 BUG 上下文",
            "Get public detail of a specific bug by ID.",
            { bugId: { type: "string" } },
            ["bugId"]
        ),
    ]
}

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string }

/**
 * @description 父进程侧工具执行器：再次校验工具名、参数与 grant，执行后端读取并返回 JSON，
 * 出错转成 `{ok:false}` 由子进程工具 execute 抛出（模型看到错误结果，而不是伪造成功）。
 * @param options 后端、授权与预算
 */
export function createToolRequestHandler(options: {
    backend: BugToolBackend
    grant: BugToolGrant
    maxCalls?: number
    maxQueryLength?: number
    onCall?: (call: { name: BugToolName; args: Record<string, unknown> }) => void
}): (call: ToolCall) => Promise<ToolOutcome> {
    const budget = new ToolCallBudget(options.maxCalls ?? DEFAULT_PI_MAX_TOOL_CALLS)

    return async call => {
        try {
            const name = asToolName(call.name)
            const args = normalizeToolArgs(name, call.args, options.grant, options.maxQueryLength)
            budget.consume(name)
            options.onCall?.({ name, args })
            return { ok: true, result: await executeTool(options.backend, options.grant, name, args) }
        } catch (error) {
            if (error instanceof PiRunnerError) return { ok: false, error: `${error.code}: ${error.message}` }
            return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
    }
}

function executeTool(backend: BugToolBackend, grant: BugToolGrant, name: BugToolName, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case "get_submission_evidence": {
            const submissionVersionId = args.submissionVersionId as string
            if (submissionVersionId !== grant.submissionVersionId) {
                throw new PiRunnerError("tool_call_rejected", "证据版本不属于当前任务")
            }
            return backend.getSubmissionEvidence(submissionVersionId)
        }
        case "search_bug_candidates":
            return backend.searchBugCandidates(args.query as string, args.limit as number)
        case "get_bug_public_context":
            return backend.getBugPublicContext(args.bugId as string)
    }
}

/** 把 token 用量映射成 bug_ai_runs 字段口径；未知字段留空。 */
export function toBugTokenUsage(usage: { input?: number; output?: number; cachedInput?: number; imageCalls?: number } | undefined) {
    if (!usage) return undefined
    const result: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; imageCalls?: number } = {}
    if (usage.input !== undefined) result.inputTokens = usage.input
    if (usage.output !== undefined) result.outputTokens = usage.output
    if (usage.cachedInput !== undefined) result.cachedInputTokens = usage.cachedInput
    if (usage.imageCalls !== undefined) result.imageCalls = usage.imageCalls
    return result
}
