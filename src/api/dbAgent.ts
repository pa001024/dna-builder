import OpenAI from "openai"
import type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionToolMessageParam } from "openai/resources/index.mjs"
import type { OpenAIConfig } from "@/api/openai"
import { renderDBAgentSystemPrompt } from "@/shared/dbAgentSystemPrompt"
import { listModules, listVersionAdditions, listVersions, queryModule, readStory, searchAll, searchStory } from "@/utils/db-search"

/**
 * 资料检索 Agent。
 *
 * 只挂载「资料库检索」类工具（模块清单 / 全库检索 / 模块明细 / 版本新增 / 剧情检索 / 剧情原文），
 * 自己实现「流式 + 多轮工具调用」循环：每轮把模型的工具调用落到 src/utils/db-search.ts 上执行，
 * 再把工具结果回灌给模型，直到模型给出最终回答。
 *
 * 不复用 AIClient.streamChatWithTools 的原因：该方法只累积单个 tool_call（多工具会串行覆盖），
 * 且只处理一轮工具调用，无法支撑多轮检索。
 */

/** 工具调用记录：供对话界面展示检索过程 */
export interface DBAgentToolTrace {
    /** 工具调用 ID */
    id: string
    /** 工具名（英文，模型可见） */
    name: string
    /** 工具展示名（中文，界面展示） */
    label: string
    /** 调用参数 */
    args: Record<string, unknown>
    /** 结果摘要（界面展示用，非完整结果） */
    summary: string
    /** 执行状态 */
    status: "running" | "done" | "error"
}

/** Agent 回调 */
export interface DBAgentCallbacks {
    /** 流式增量：reasoning 为思考内容（部分模型返回），content 为正文 */
    onDelta?: (text: string, type: "reasoning" | "content") => void
    /** 工具调用状态变化 */
    onToolTrace?: (trace: DBAgentToolTrace) => void
}

/** Agent 侧的历史消息（来自 Dexie 的会话记录） */
export interface DBAgentHistoryMessage {
    role: "user" | "assistant"
    content: string
}

/** Agent 单轮运行结果 */
export interface DBAgentRunResult {
    /** 最终回复正文 */
    reply: string
    /** 本轮的工具调用记录 */
    traces: DBAgentToolTrace[]
}

/** 允许的最大工具调用轮数，防止模型陷入无休止检索 */
const MAX_TOOL_ROUNDS = 4

/** 默认模型参数（设置项缺失时使用） */
const DEFAULT_CONFIG: Pick<
    OpenAIConfig,
    "base_url" | "timeout" | "max_retries" | "default_model" | "default_temperature" | "default_max_tokens"
> = {
    base_url: "https://open.bigmodel.cn/api/paas/v4/",
    timeout: 60000,
    max_retries: 2,
    default_model: "glm-4.6v-flash",
    default_temperature: 0.4,
    default_max_tokens: 1536,
}

/** 工具展示名映射（界面用中文标注检索动作） */
const TOOL_LABELS: Record<string, string> = {
    list_data_modules: "模块清单",
    search_data: "全库检索",
    query_module_entries: "模块明细",
    list_version_additions: "版本新增",
    search_story: "剧情检索",
    read_story: "剧情原文",
}

/**
 * 工具定义（OpenAI function calling 格式）。
 * 工具名与参数说明面向模型，需要保持稳定，避免提示词与实现对不上。
 */
const DB_AGENT_TOOLS: ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "list_data_modules",
            description: "列出资料库中可检索的模块清单，包含模块 id、名称、条目数与是否支持按版本过滤。用于确认某个提问应该查哪个模块。",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
    {
        type: "function",
        function: {
            name: "search_data",
            description:
                "全库关键词检索，覆盖资料库所有模块（角色、武器、魔之楔、成就、任务链、活动、副本、怪物、道具等），返回标题、副信息、类型与跳转路径。适合不确定内容属于哪个模块时先定位。",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "检索关键词，例如角色名、道具名、副本名" },
                    module: {
                        type: "string",
                        description: "可选，限定只在该模块内检索，取值见 list_data_modules 的 id，例如 char / weapon / mod / achievement",
                    },
                    limit: { type: "integer", description: "返回条数上限，默认 20，最大 50" },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "query_module_entries",
            description:
                "按模块查询条目明细，支持关键词与版本过滤，返回名称、副信息、版本与详情路径。适合回答“某个版本新增了哪些成就”“某系列有哪些魔之楔”。",
            parameters: {
                type: "object",
                properties: {
                    module: { type: "string", description: "模块 id，见 list_data_modules，例如 achievement / mod / char / weapon" },
                    keyword: { type: "string", description: "可选，模块内关键词（名称、分类、描述等字段）" },
                    version: { type: "string", description: "可选，版本号，例如 1.6" },
                    limit: { type: "integer", description: "返回条数上限，默认 20，最大 80" },
                },
                required: ["module"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "list_version_additions",
            description: "汇总某个版本在角色、武器、魔之楔、成就、任务链中新增的内容（数量 + 名称样例）。",
            parameters: {
                type: "object",
                properties: {
                    version: { type: "string", description: "版本号，例如 1.6" },
                },
                required: ["version"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "search_story",
            description:
                "剧情全文检索：在任务链与剧情对话正文中查找人名、地点、事件，返回命中的任务链以及说话人与台词片段。用于回答“某某剧情里谁做了什么”“这句话是谁说的”。",
            parameters: {
                type: "object",
                properties: {
                    keyword: { type: "string", description: "检索关键词，优先使用具体人名、地名或事件名" },
                    limit: { type: "integer", description: "返回任务链数量上限，默认 5，最大 12" },
                    snippet_limit: { type: "integer", description: "每个任务链返回的台词片段上限，默认 6，最大 20" },
                },
                required: ["keyword"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "read_story",
            description:
                "读取指定任务链（可用 quest_id 限定单个任务）的剧情原文，按行返回说话人与台词，用于补充上下文。任务链 id 可由 search_story 或 search_data 得到。",
            parameters: {
                type: "object",
                properties: {
                    chain_id: { type: "integer", description: "任务链 id，例如 110201" },
                    quest_id: { type: "integer", description: "可选，任务 id" },
                    offset: { type: "integer", description: "可选，起始行号，默认 0" },
                    limit: { type: "integer", description: "可选，行数上限，默认 60，最大 200" },
                },
                required: ["chain_id"],
            },
        },
    },
]

/**
 * 合并流式返回的工具名分片。
 * 不同服务端可能一次性给出完整名称，也可能拆成多片，这里按前缀关系合并避免重复拼接。
 * @param current 已累积的名称
 * @param incoming 本次分片
 * @returns 合并后的名称
 */
function mergeToolName(current: string, incoming: string): string {
    if (!current) {
        return incoming
    }
    if (!incoming || incoming === current || current.endsWith(incoming)) {
        return current
    }
    if (incoming.startsWith(current)) {
        return incoming
    }
    if (current.startsWith(incoming)) {
        return current
    }
    return current + incoming
}

/**
 * 截断过长文本，避免工具结果撑爆上下文。
 * @param text 原始文本
 * @param maxLength 长度上限
 * @returns 截断后的文本
 */
function truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/**
 * 生成工具结果摘要，用于界面展示。
 * @param name 工具名
 * @param payload 工具返回值
 * @returns 摘要文本
 */
function summarizeToolResult(name: string, payload: unknown): string {
    const data = payload as Record<string, unknown>

    switch (name) {
        case "list_data_modules":
            return `共 ${(data.modules as unknown[])?.length ?? 0} 个可检索模块`
        case "search_data": {
            const results = data.results as unknown[] | undefined
            return `命中 ${results?.length ?? 0} 条`
        }
        case "query_module_entries":
            return `${data.module ? `${data.module}.` : ""}命中 ${data.total ?? 0} 条`
        case "list_version_additions": {
            const modules = (data.modules as Array<{ count: number }> | undefined) ?? []
            const total = modules.reduce((sum, item) => sum + item.count, 0)
            return `版本 ${data.version} 新增 ${total} 条`
        }
        case "search_story": {
            const hits = (data.hits as unknown[] | undefined) ?? []
            return `命中 ${hits.length} 个任务链`
        }
        case "read_story":
            return `返回 ${(data.lines as unknown[])?.length ?? 0} 行对话`
        default:
            return "已完成"
    }
}

/**
 * 执行单个工具调用。
 * @param name 工具名
 * @param args 调用参数
 * @returns 工具结果（序列化后的字符串）
 */
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
        case "list_data_modules": {
            return JSON.stringify({ modules: listModules(), versions: listVersions() })
        }
        case "search_data": {
            const query = `${args.query ?? ""}`.trim()
            const moduleId = `${args.module ?? ""}`.trim()
            const pathPrefix = moduleId ? listModules().find(item => item.id === moduleId)?.path : undefined
            const results = searchAll(query, { limit: Number(args.limit) || undefined, pathPrefix })

            return JSON.stringify({ query, module: moduleId || undefined, results })
        }
        case "query_module_entries": {
            const moduleId = `${args.module ?? ""}`.trim()
            const { module, entries, total } = queryModule(moduleId, {
                keyword: args.keyword ? `${args.keyword}` : undefined,
                version: args.version ? `${args.version}` : undefined,
                limit: Number(args.limit) || undefined,
            })

            if (!module) {
                return JSON.stringify({
                    error: `不支持的模块 "${moduleId}"`,
                    supported: listModules().map(item => item.id),
                })
            }

            return JSON.stringify({
                module: module.id,
                moduleLabel: module.label,
                modulePath: module.path,
                versioned: module.versioned,
                total,
                entries: entries.map(entry => ({
                    id: entry.id,
                    name: entry.name,
                    subtitle: entry.subtitle,
                    version: entry.version,
                    path: entry.path,
                })),
            })
        }
        case "list_version_additions": {
            const version = `${args.version ?? ""}`.trim()

            if (!version) {
                return JSON.stringify({ error: "缺少版本号", knownVersions: listVersions() })
            }

            return JSON.stringify(listVersionAdditions(version))
        }
        case "search_story": {
            const keyword = `${args.keyword ?? ""}`.trim()
            const { hits, note } = await searchStory(keyword, {
                limit: Number(args.limit) || undefined,
                snippetLimit: Number(args.snippet_limit) || undefined,
            })

            return JSON.stringify({
                keyword,
                note: note || undefined,
                hits: hits.map(hit => ({
                    chainId: hit.chainId,
                    chainName: hit.chainName,
                    chapter: hit.chapter,
                    episode: hit.episode,
                    version: hit.version,
                    path: hit.path,
                    snippets: hit.snippets.map(snippet => ({
                        questName: snippet.questName,
                        speaker: snippet.speaker || undefined,
                        text: truncate(snippet.text, 220),
                    })),
                })),
            })
        }
        case "read_story": {
            const chainId = Number(args.chain_id)

            if (!Number.isFinite(chainId)) {
                return JSON.stringify({ error: "chain_id 必须是任务链数字 id" })
            }

            const result = await readStory(chainId, {
                questId: Number(args.quest_id) || undefined,
                offset: Number(args.offset) || undefined,
                limit: Number(args.limit) || undefined,
            })

            if (!result.chain) {
                return JSON.stringify({ error: `未找到任务链 ${chainId}` })
            }

            return JSON.stringify({
                chain: result.chain,
                total: result.total,
                lines: result.lines.map(line => ({
                    questName: line.questName,
                    speaker: line.speaker || undefined,
                    text: truncate(line.text, 220),
                })),
            })
        }
        default:
            return JSON.stringify({ error: `未知工具 ${name}` })
    }
}

/**
 * 解析工具参数：模型偶尔会返回非法 JSON，这里做兜底。
 * @param rawArguments 原始参数串
 * @returns 解析后的参数对象
 */
function parseToolArguments(rawArguments: string): Record<string, unknown> {
    if (!rawArguments?.trim()) {
        return {}
    }

    try {
        const parsed = JSON.parse(rawArguments)
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
    } catch {
        return {}
    }
}

/**
 * 资料检索 Agent 客户端。
 */
export class DBAgent {
    private client: OpenAI | null = null
    private config: typeof DEFAULT_CONFIG & { api_key: string }
    /** 中断标记：置位后当前这一轮会在下一个数据块处停止 */
    private interrupted = false

    /**
     * 创建资料检索 Agent。
     * @param config AI 配置（来自设置页，可缺省）
     */
    constructor(config: Partial<OpenAIConfig> = {}) {
        this.config = {
            ...DEFAULT_CONFIG,
            api_key: config.api_key ?? "",
            base_url: config.base_url || DEFAULT_CONFIG.base_url,
            timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
            max_retries: config.max_retries ?? DEFAULT_CONFIG.max_retries,
            default_model: config.default_model || DEFAULT_CONFIG.default_model,
            default_temperature: config.default_temperature ?? DEFAULT_CONFIG.default_temperature,
            default_max_tokens: config.default_max_tokens ?? DEFAULT_CONFIG.default_max_tokens,
        }

        this.createClient()
    }

    /**
     * 更新配置（设置页改动后调用）。
     * @param config 新的 AI 配置
     */
    public updateConfig(config: Partial<OpenAIConfig>): void {
        this.config = {
            ...this.config,
            api_key: config.api_key ?? this.config.api_key,
            base_url: config.base_url || this.config.base_url,
            default_model: config.default_model || this.config.default_model,
            default_temperature: config.default_temperature ?? this.config.default_temperature,
            default_max_tokens: config.default_max_tokens ?? this.config.default_max_tokens,
        }

        this.createClient()
    }

    /**
     * 中断当前流式输出。
     */
    public interrupt(): void {
        this.interrupted = true
    }

    /**
     * 创建底层 OpenAI 客户端（OpenAI 兼容接口）。
     */
    private createClient(): void {
        this.client = new OpenAI({
            apiKey: this.config.api_key || "missing-api-key",
            baseURL: this.config.base_url,
            timeout: this.config.timeout,
            maxRetries: this.config.max_retries,
            dangerouslyAllowBrowser: true,
        })
    }

    /**
     * 运行一轮问答：流式输出 + 多轮工具调用。
     * @param history 会话历史（不含本轮回复）
     * @param callbacks 流式与工具回调
     * @returns 最终回复与工具调用记录
     */
    public async run(history: DBAgentHistoryMessage[], callbacks: DBAgentCallbacks = {}): Promise<DBAgentRunResult> {
        if (!this.client) {
            throw new Error("AI 客户端未初始化")
        }

        if (!this.config.api_key) {
            throw new Error("尚未配置 AI 密钥，请先在设置中填写")
        }

        this.interrupted = false

        const messages: ChatCompletionMessageParam[] = [
            { role: "system", content: renderDBAgentSystemPrompt() },
            ...history.map(item => ({ role: item.role, content: item.content }) as ChatCompletionMessageParam),
        ]

        const traces: DBAgentToolTrace[] = []
        let reply = ""

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
            const isLastRound = round === MAX_TOOL_ROUNDS
            const stream = await this.client.chat.completions.create({
                model: this.config.default_model,
                messages,
                temperature: this.config.default_temperature,
                max_tokens: this.config.default_max_tokens,
                stream: true,
                // 最后一轮不再带工具，强制模型基于已有检索结果作答
                tools: isLastRound ? undefined : DB_AGENT_TOOLS,
            })

            let content = ""
            const callSlots = new Map<number, { id: string; name: string; args: string }>()

            for await (const chunk of stream) {
                if (this.interrupted) {
                    break
                }

                const delta = chunk.choices[0]?.delta

                if (delta?.reasoning_content) {
                    callbacks.onDelta?.(delta.reasoning_content, "reasoning")
                }

                if (delta?.content) {
                    content += delta.content
                    reply += delta.content
                    callbacks.onDelta?.(delta.content, "content")
                }

                for (const toolCall of delta?.tool_calls ?? []) {
                    const index = toolCall.index ?? 0
                    const slot = callSlots.get(index) ?? { id: "", name: "", args: "" }

                    if (toolCall.id) {
                        slot.id = toolCall.id
                    }
                    if (toolCall.function?.name) {
                        slot.name = mergeToolName(slot.name, toolCall.function.name)
                    }
                    if (toolCall.function?.arguments) {
                        slot.args += toolCall.function.arguments
                    }

                    callSlots.set(index, slot)
                }
            }

            if (this.interrupted) {
                return { reply, traces }
            }

            const calls = [...callSlots.values()].filter(call => call.name)

            if (!calls.length) {
                return { reply, traces }
            }

            // 回灌助手消息（携带工具调用）与工具结果，进入下一轮
            messages.push({
                role: "assistant",
                content: content.trim(),
                tool_calls: calls.map(call => ({
                    id: call.id || `call_${Date.now()}`,
                    type: "function" as const,
                    function: { name: call.name, arguments: call.args },
                })),
            })

            for (const call of calls) {
                const id = call.id || `call_${Date.now()}`
                const args = parseToolArguments(call.args)
                const trace: DBAgentToolTrace = {
                    id,
                    name: call.name,
                    label: TOOL_LABELS[call.name] ?? call.name,
                    args,
                    summary: "",
                    status: "running",
                }

                traces.push(trace)
                callbacks.onToolTrace?.({ ...trace })

                let toolContent: string

                try {
                    toolContent = await executeTool(call.name, args)
                    const parsed = JSON.parse(toolContent) as unknown
                    trace.summary = summarizeToolResult(call.name, parsed)
                    trace.status = "done"
                } catch (error) {
                    trace.status = "error"
                    trace.summary = error instanceof Error ? error.message : "工具执行失败"
                    toolContent = JSON.stringify({ error: trace.summary })
                }

                callbacks.onToolTrace?.({ ...trace })

                const toolMessage: ChatCompletionToolMessageParam = {
                    role: "tool",
                    tool_call_id: id,
                    content: toolContent,
                }

                messages.push(toolMessage)
            }
        }

        return { reply, traces }
    }
}
