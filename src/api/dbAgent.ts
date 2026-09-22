import i18next from "i18next"
import OpenAI from "openai"
import type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionToolMessageParam } from "openai/resources/index.mjs"
import { containsDsmlMarker, type DsmlParseResult, DsmlStreamFilter } from "@/api/dsml-tool-call"
import type { OpenAIConfig } from "@/api/openai"
import {
    DAMAGE_TERMS,
    getDamageFields,
    getDamageMode,
    listDamageModes,
    searchDamageSteps,
    searchDamageTerms,
} from "@/data/damage-mechanics"
import { renderDBAgentSystemPrompt } from "@/shared/dbAgentSystemPrompt"
import { DEFAULT_AI_MAX_TOKENS } from "@/utils/ai-config"
import type { AskUserRequest, AskUserResponse } from "@/utils/db-ask-user"
import { formatAskUserResponse, hasAskAnswer, normalizeAskUserRequest, summarizeAskUserRequest } from "@/utils/db-ask-user"
import {
    DB_AGENT_LANGS,
    type DBAgentLang,
    ensureDBAgentLangReady,
    normalizeDBAgentLang,
    resolveCurrentDBAgentLang,
} from "@/utils/db-locale"
import {
    listModuleFilters,
    listModules,
    listVersionAdditions,
    listVersions,
    queryModule,
    readStory,
    searchAll,
    searchStory,
} from "@/utils/db-search"

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
    /** 工具展示名（界面展示，随界面语言切换） */
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
    /**
     * 某一轮的思考结束（该轮开始调用工具，或模型已给出最终回答）。
     * @param toolCallIds 该段思考之后发起的工具调用 id 列表（用于把「思考 → 工具」
     *   按真实顺序串联；最终回答前的最后一段思考传空数组）
     */
    onReasoningEnd?: (toolCallIds: string[]) => void
}

/** Agent 侧的历史消息（来自 Dexie 的会话记录） */
export interface DBAgentHistoryMessage {
    role: "user" | "assistant"
    content: string
}

/** Agent 单条思考片段（一次运行可能有多段，对应多轮工具调用之间的思考） */
export interface DBAgentReasoningSegment {
    /** 思考内容 */
    text: string
    /** 该段思考后续发起了哪些工具调用（按 id 关联 traces） */
    toolCallIds: string[]
}

/** Agent 单轮运行结果 */
export interface DBAgentRunResult {
    /** 最终回复正文（挂起时为空串） */
    reply: string
    /** 本轮的工具调用记录 */
    traces: DBAgentToolTrace[]
    /** 本轮的各段思考内容 */
    reasonings: DBAgentReasoningSegment[]
    /**
     * 本轮挂起时等待用户回答的提问。
     *
     * 非 null 表示这条回复还没结束：模型发起了 ask_user，
     * 循环已停在「等用户作答」这一步，需要外部调用 answerAsk() 或 skipAsk() 继续。
     */
    pendingAsk?: DBAgentPendingAsk
}

/**
 * 挂起中的一次提问。
 *
 * 携带续跑所需的全部上下文（消息序列、已累积的思考与工具痕迹、轮次号），
 * 因此调用方只要原样回传，就能从断点继续同一轮问答。
 */
export interface DBAgentPendingAsk {
    /** 提问 id */
    requestId: string
    /** 归一化后的提问请求（界面据此渲染选项） */
    request: AskUserRequest
    /** 该次 ask_user 工具调用的 id（回填回答时需要） */
    toolCallId: string
}

/** Agent 循环的运行态 */
interface DBAgentLoopState {
    /** 完整消息序列（含 assistant 的工具调用与已回灌的 tool 结果） */
    messages: ChatCompletionMessageParam[]
    /** 已产出的正文 */
    reply: string
    /** 已累积的工具调用痕迹 */
    traces: DBAgentToolTrace[]
    /** 已累积的思考分段 */
    reasonings: DBAgentReasoningSegment[]
    /** 尚未收尾的实时思考文本 */
    reasoningText: string
    /** 当前轮次号 */
    round: number
}

/** 挂起态：运行态 + 待回答的提问 */
interface DBAgentPendingState extends DBAgentLoopState {
    /** 对外暴露的提问信息 */
    ask: DBAgentPendingAsk
}

/**
 * 允许的最大工具调用轮数，防止模型陷入无休止检索。
 *
 * `ask_user` 挂起会占用一轮（回答后从下一轮继续）：这样循环必然推进，
 * 不会出现「模型一直提问、轮次永不前进」的死循环。
 */
const MAX_TOOL_ROUNDS = 4

/**
 * 单轮内因 DSML 标记无法解析而重试的最大次数。
 *
 * 取 1 是刻意保守：这类泄露通常是上游兼容层偶发问题，重试一次能解决绝大多数情况；
 * 再多次重试既浪费时间额度，也说明格式已超出容错能力，不如尽早收敛。
 */
const MAX_DSML_RETRIES = 1

/**
 * 单次回答触达输出上限后允许自动续写的次数。
 *
 * 上游在触达 max_tokens 时会以 `finish_reason === "length"` 收流，正文停在半句上；
 * 续写把这半句当作助手消息回灌，再要一段后续。3 次约等于三倍输出长度，
 * 既足够收尾一份结果清单，也能在模型反复话痨时及时收敛。
 */
const MAX_CONTINUATIONS = 3

/**
 * 续写提示词。
 *
 * 必须显式要求「不重复、不重开头」：只给「继续」两字时，模型常常把已输出的段落再讲一遍。
 */
const CONTINUATION_PROMPT = "上一条回复因长度上限被截断。请紧接着未完成处继续输出剩余内容，不要重复已经输出过的部分，也不要重新开头。"

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
    default_max_tokens: DEFAULT_AI_MAX_TOKENS,
}

/** 工具展示名映射（界面用中文标注检索动作） */
const TOOL_LABELS: Record<string, string> = {
    list_data_modules: "dbAgent.tool.list_data_modules",
    list_filter_options: "dbAgent.tool.list_filter_options",
    search_data: "dbAgent.tool.search_data",
    query_module_entries: "dbAgent.tool.query_module_entries",
    list_version_additions: "dbAgent.tool.list_version_additions",
    search_story: "dbAgent.tool.search_story",
    read_story: "dbAgent.tool.read_story",
    explain_damage: "dbAgent.tool.explain_damage",
    ask_user: "dbAgent.tool.ask_user",
}

/**
 * 取工具的展示名：已登记的工具走 i18n（带中文 defaultValue 兜底，
 * 保证 i18next 未初始化的环境如单测也能拿到可读文案），未登记的工具直接展示原始名。
 * @param name 工具名（模型可见的英文 id）
 * @returns 界面展示名
 */
function toolLabel(name: string): string {
    const key = TOOL_LABELS[name]

    return key ? i18next.t(key, { defaultValue: name }) : name
}

/**
 * filters 参数的说明文案。
 *
 * 单独抽出来是因为它同时出现在两个工具的 schema 里，措辞必须一致：
 * 模型看到两个不同说法时容易以为取值口径不同，从而多做一次无谓的查询。
 */
const FILTERS_DESCRIPTION =
    '筛选项条件，键为筛选项 id、值为目标取值，例如 {"type":"主线任务"} 或 {"quality":3}。' +
    "取值必须来自 list_filter_options 返回的 values，不要凭记忆编造；多个条件之间是「与」的关系。布尔类筛选项传 true 表示只要具备该特征的条目。"

/**
 * lang 参数的说明文案。
 *
 * 单独抽出来是因为它出现在除 ask_user 之外的每个工具上，措辞必须一致：
 * 各工具对 lang 的措辞一旦不同，模型会以为语义有差异，从而在不同工具上给出不同的语言取值。
 */
const LANG_DESCRIPTION =
    "可选，检索所用的数据语言：zh（游戏原文）/ en / jp / kr / fr / tc（繁中）。不传则用当前界面语言。" +
    "剧情对话与角色语音是按语言切分的独立数据集，查这两类内容时传提问语言对应的取值；" +
    "其余模块的条目名称会按该语言返回译文（名称未收录译文时保留原文）。" +
    "能否真正拿到其他语言的内容取决于该模块是否有多语言数据，返回结果里的 note 会说明实际使用的语言。"

/** lang 参数定义（各检索工具共用） */
const LANG_SCHEMA = {
    type: "string",
    enum: DB_AGENT_LANGS,
    description: LANG_DESCRIPTION,
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
                properties: { lang: LANG_SCHEMA },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "list_filter_options",
            description:
                "列出某个模块可用的筛选项与全部合法取值（对应资料库各列表页上的筛选行），例如剧情模块的任务类型（主线任务 / 支线任务 / 限时任务 / 活动任务）、篇章、印象检定、印象增加。用于在按分类过滤前先确认取值。",
            parameters: {
                type: "object",
                properties: {
                    lang: LANG_SCHEMA,
                    module: {
                        type: "string",
                        description: "模块 id，见 list_data_modules。剧情请用 questchain",
                    },
                },
                required: ["module"],
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
                    lang: LANG_SCHEMA,
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
                "按模块查询条目明细，支持关键词、版本与分类筛选（筛选项与资料库各列表页一致），返回名称、副信息、版本与详情路径。适合回答“某个版本新增了哪些成就”“某系列有哪些魔之楔”“三星星级的成就有多少”。",
            parameters: {
                type: "object",
                properties: {
                    lang: LANG_SCHEMA,
                    module: { type: "string", description: "模块 id，见 list_data_modules，例如 achievement / mod / char / weapon" },
                    keyword: { type: "string", description: "可选，模块内关键词（名称、分类、描述等字段）" },
                    version: { type: "string", description: "可选，版本号，例如 1.6" },
                    filters: {
                        type: "object",
                        description: FILTERS_DESCRIPTION,
                        additionalProperties: { type: ["string", "number", "boolean"] },
                    },
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
                    lang: LANG_SCHEMA,
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
                "剧情检索：在任务链与剧情对话正文中查找人名、地点、事件，返回命中的任务链以及说话人与台词片段。用于回答“某某剧情里谁做了什么”“这句话是谁说的”。" +
                '也可不带关键词、只用 filters 按剧情列表页的筛选规则列举任务链，例如列出全部主线任务（filters 传 {"type":"主线任务"}）。' +
                "关键词与 filters 可以同时给出，此时先按 filters 收窄范围再检索。",
            parameters: {
                type: "object",
                properties: {
                    lang: LANG_SCHEMA,
                    keyword: {
                        type: "string",
                        description: "检索关键词，优先使用具体人名、地名或事件名。只按类型/篇章筛选时可省略",
                    },
                    filters: {
                        type: "object",
                        description: `${FILTERS_DESCRIPTION} 剧情模块（questchain）的可用筛选项见 list_filter_options；常用 type（主线任务/支线任务/限时任务/活动任务）、chapter（篇章名）、imprCheck、imprIncrease。`,
                        additionalProperties: { type: ["string", "number", "boolean"] },
                    },
                    limit: { type: "integer", description: "返回任务链数量上限，默认 5，最大 12" },
                    snippet_limit: { type: "integer", description: "每个任务链返回的台词片段上限，默认 6，最大 20" },
                },
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
                    lang: LANG_SCHEMA,
                    chain_id: { type: "integer", description: "任务链 id，例如 110201" },
                    quest_id: { type: "integer", description: "可选，任务 id" },
                    offset: { type: "integer", description: "可选，起始行号，默认 0" },
                    limit: { type: "integer", description: "可选，行数上限，默认 60，最大 200" },
                },
                required: ["chain_id"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "explain_damage",
            description:
                "查询伤害机制：返回技能伤害 / 武器伤害 / DOT 伤害三种结算模式的公式步骤，以及昂扬、背水、充盈、失衡、抗性乘区、防御乘区等机制术语的解释。" +
                "回答「伤害是怎么算的」「某个乘区或名词是什么」「某项属性收益为什么递减」这类问题时用它；" +
                "不带参数时返回三种模式的概览与全部术语清单。",
            parameters: {
                type: "object",
                properties: {
                    lang: {
                        ...LANG_SCHEMA,
                        description: `${LANG_DESCRIPTION}注意：伤害机制的步骤名与公式只有游戏原文（中文），lang 只用于标注本次检索语言，不改变返回内容。`,
                    },
                    mode: {
                        type: "string",
                        description:
                            "可选，结算模式：weapon（武器伤害）/ skill（技能伤害）/ dot（DOT 伤害）。指定后返回该模式的完整公式链与输入参数",
                    },
                    keyword: {
                        type: "string",
                        description: "可选，关键词，例如 暴击 / 充盈 / 背水 / 抗性 / 防御 / 增伤；在步骤名称、公式与术语解释里定位",
                    },
                    step_id: {
                        type: "string",
                        description: "可选，步骤 id，例如 expectedDamage / defenseMultiplier / dotDamage；只取该步骤的完整信息",
                    },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "ask_user",
            description:
                "向用户提问，让用户在若干选项中挑选，或自己输入文本作答。调用后本轮会暂停并等待用户回答，拿到答案后你会继续检索并给出最终回答。\n" +
                "使用场景（其余情况不要用）：\n" +
                "1. 提问含糊、有多个同样合理的理解，且不同理解会导向完全不同的检索结果时；\n" +
                "2. 需要用户在有限分类里做选择才能继续时（例如要哪一类剧情、哪个版本、哪个篇章）；\n" +
                "3. 检索结果太多、需要用户缩小范围时。\n" +
                "不要用于：打招呼、确认「是否需要帮助」、追问用户已经说过的信息、以及在能直接检索出结果时偷懒求澄清。一次提问可以包含多道题。",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string", description: "可选，整张提问卡片的引导语，一句话说明为什么要问" },
                    questions: {
                        type: "array",
                        maxItems: 5,
                        description: "题目列表，1~5 道",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string", description: "题号，用简短英文标识，例如 type / version" },
                                header: { type: "string", description: "题干，简短一句话，例如「要查哪一类剧情？」" },
                                question: { type: "string", description: "可选，题干的补充说明" },
                                options: {
                                    type: "array",
                                    maxItems: 8,
                                    description: "可选项，2~8 个；每项给出 label 与可选 description",
                                    items: {
                                        type: "object",
                                        properties: {
                                            id: { type: "string", description: "选项 id，简短英文标识" },
                                            label: { type: "string", description: "选项展示文案" },
                                            description: { type: "string", description: "可选，选项说明" },
                                        },
                                        required: ["label"],
                                    },
                                },
                                allowCustom: {
                                    type: "boolean",
                                    description: "是否允许用户自己输入文本，默认 true；除非确实不适合自由输入，否则保持默认",
                                },
                                multiple: { type: "boolean", description: "是否允许多选，默认 false" },
                            },
                            required: ["header", "options"],
                        },
                    },
                },
                required: ["questions"],
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
 * 归一化模型的 filters 参数。
 *
 * 模型偶尔会把筛选项直接平铺在参数顶层（`{"type": "主线任务"}`），也会把 `filters`
 * 写成 JSON 字符串。这里统一成对象，并剔除空值，避免下游判空逻辑散落各处。
 * @param raw 原始 filters 参数
 * @returns 归一化后的筛选条件
 */
function normalizeFilters(raw: unknown): Record<string, string | number | boolean> {
    let source = raw

    if (typeof raw === "string" && raw.trim()) {
        try {
            source = JSON.parse(raw)
        } catch {
            return {}
        }
    }

    if (!source || typeof source !== "object" || Array.isArray(source)) {
        return {}
    }

    const filters: Record<string, string | number | boolean> = {}

    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        if (value === undefined || value === null || `${value}`.trim() === "") {
            continue
        }

        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            filters[key] = value
        }
    }

    return filters
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
            return i18next.t("dbAgent.summary.modulesTotal", { count: (data.modules as unknown[])?.length ?? 0 })
        case "list_filter_options": {
            const facets = (data.facets as unknown[] | undefined) ?? []
            return facets.length
                ? i18next.t("dbAgent.summary.facets", { prefix: data.module ? `${data.module}.` : "", count: facets.length })
                : i18next.t("dbAgent.summary.noFacets")
        }
        case "search_data": {
            const results = data.results as unknown[] | undefined
            return i18next.t("dbAgent.summary.searchHits", { prefix: "", count: results?.length ?? 0 })
        }
        case "query_module_entries":
            return i18next.t("dbAgent.summary.searchHits", { prefix: data.module ? `${data.module}.` : "", count: data.total ?? 0 })
        case "list_version_additions": {
            const modules = (data.modules as Array<{ count: number }> | undefined) ?? []
            const total = modules.reduce((sum, item) => sum + item.count, 0)
            return i18next.t("dbAgent.summary.versionAdditions", { version: data.version, count: total })
        }
        case "search_story": {
            const hits = (data.hits as unknown[] | undefined) ?? []
            return i18next.t("dbAgent.summary.storyHits", { count: hits.length })
        }
        case "read_story":
            return i18next.t("dbAgent.summary.storyLines", { count: (data.lines as unknown[])?.length ?? 0 })
        case "explain_damage": {
            const steps = (data.steps as unknown[] | undefined) ?? []
            const modes = (data.modes as unknown[] | undefined) ?? []
            const terms = (data.terms as unknown[] | undefined) ?? []

            if (steps.length) {
                return i18next.t("dbAgent.summary.damageSteps", { count: steps.length })
            }

            if (terms.length && modes.length === 0) {
                return i18next.t("dbAgent.summary.damageTerms", { count: terms.length })
            }

            return i18next.t("dbAgent.summary.damageModes", { count: modes.length })
        }
        case "ask_user": {
            const request = data.request as AskUserRequest | undefined
            return request ? summarizeAskUserRequest(request) : i18next.t("dbAgent.summary.waitingUser")
        }
        default:
            return i18next.t("dbAgent.summary.done")
    }
}

/**
 * 执行单个工具调用。
 * @param name 工具名
 * @param args 调用参数
 * @returns 工具结果（序列化后的字符串）
 */
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    // 数据语言：模型显式指定优先，否则跟随界面语言。
    // ask_user 的题面由模型按对话语言自行生成，与数据语言无关，因此不会用到这个值。
    const lang: DBAgentLang = normalizeDBAgentLang(args.lang) ?? resolveCurrentDBAgentLang()

    // 检索期需要在同步路径里读译文与语音数据集，先统一预热；同一语言重复调用会直接返回
    await ensureDBAgentLangReady(lang)

    switch (name) {
        case "list_data_modules": {
            return JSON.stringify({ lang, modules: listModules(lang), versions: listVersions() })
        }
        case "list_filter_options": {
            const moduleId = `${args.module ?? ""}`.trim()
            const { module: moduleInfo, facets, note } = await listModuleFilters(moduleId, lang)

            if (!moduleInfo) {
                return JSON.stringify({
                    lang,
                    error: `不支持的模块 "${moduleId}"`,
                    supported: listModules(lang).map(item => item.id),
                })
            }

            return JSON.stringify({
                lang,
                module: moduleInfo.id,
                moduleLabel: moduleInfo.label,
                total: moduleInfo.count,
                note: note || undefined,
                facets: facets.map(facet => ({
                    id: facet.id,
                    label: facet.label,
                    kind: facet.kind,
                    description: facet.description,
                    values: facet.values,
                })),
                tip: "过滤时把这里给出的取值放进 query_module_entries 或 search_story 的 filters 参数。",
            })
        }
        case "search_data": {
            const query = `${args.query ?? ""}`.trim()
            const moduleId = `${args.module ?? ""}`.trim()
            const pathPrefix = moduleId ? listModules(lang).find(item => item.id === moduleId)?.path : undefined
            const results = searchAll(query, { limit: Number(args.limit) || undefined, pathPrefix, lang })

            return JSON.stringify({ lang, query, module: moduleId || undefined, results })
        }
        case "query_module_entries": {
            const moduleId = `${args.module ?? ""}`.trim()
            const filters = normalizeFilters(args.filters)
            const { module, entries, total } = queryModule(moduleId, {
                keyword: args.keyword ? `${args.keyword}` : undefined,
                version: args.version ? `${args.version}` : undefined,
                filters,
                limit: Number(args.limit) || undefined,
                lang,
            })

            if (!module) {
                return JSON.stringify({
                    lang,
                    error: `不支持的模块 "${moduleId}"`,
                    supported: listModules(lang).map(item => item.id),
                })
            }

            return JSON.stringify({
                lang,
                module: module.id,
                moduleLabel: module.label,
                modulePath: module.path,
                versioned: module.versioned,
                appliedFilters: Object.keys(filters).length ? filters : undefined,
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
                return JSON.stringify({ lang, error: "缺少版本号", knownVersions: listVersions() })
            }

            return JSON.stringify({ lang, ...listVersionAdditions(version, lang) })
        }
        case "search_story": {
            const keyword = `${args.keyword ?? ""}`.trim()
            const filters = normalizeFilters(args.filters)
            const { hits, total, note } = await searchStory(keyword, {
                limit: Number(args.limit) || undefined,
                snippetLimit: Number(args.snippet_limit) || undefined,
                filters,
                lang,
            })

            return JSON.stringify({
                lang,
                keyword: keyword || undefined,
                appliedFilters: Object.keys(filters).length ? filters : undefined,
                total,
                note: note || undefined,
                hits: hits.map(hit => ({
                    chainId: hit.chainId,
                    chainName: hit.chainName,
                    chapter: hit.chapter,
                    episode: hit.episode,
                    version: hit.version,
                    questType: hit.questType,
                    imprCheck: hit.imprCheck || undefined,
                    imprIncrease: hit.imprIncrease || undefined,
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
                lang,
            })

            if (!result.chain) {
                return JSON.stringify({ lang, error: `未找到任务链 ${chainId}` })
            }

            return JSON.stringify({
                lang,
                chain: result.chain,
                total: result.total,
                lines: result.lines.map(line => ({
                    questName: line.questName,
                    speaker: line.speaker || undefined,
                    text: truncate(line.text, 220),
                })),
            })
        }
        case "explain_damage": {
            const modeId = `${args.mode ?? ""}`.trim()
            const keyword = `${args.keyword ?? ""}`.trim()
            const stepId = `${args.step_id ?? ""}`.trim()
            const mode = modeId ? getDamageMode(modeId) : undefined

            if (modeId && !mode) {
                return JSON.stringify({
                    error: `未知的结算模式 "${modeId}"`,
                    supported: listDamageModes().map(item => ({ id: item.id, label: item.label })),
                })
            }

            /** 步骤条目统一投影，避免各分支重复拼字段 */
            const toStepPayload = (hit: ReturnType<typeof searchDamageSteps>[number]) => ({
                mode: hit.mode,
                modeLabel: hit.modeLabel,
                id: hit.step.id,
                title: hit.step.title,
                group: hit.step.group,
                formula: hit.step.formula,
            })

            // 指定步骤：按 id 精确命中，命中不到时退化成关键词命中，便于模型用名称当 id 试一次
            if (stepId) {
                const hits = searchDamageSteps(stepId, { mode: modeId || undefined, limit: 10 })
                const exact = hits.filter(hit => hit.step.id === stepId)
                const picked = exact.length ? exact : hits

                if (!picked.length) {
                    return JSON.stringify({
                        error: `未找到步骤 "${stepId}"`,
                        hint: "可先不带参数取三种模式概览，或用 keyword 模糊查找步骤名称。",
                    })
                }

                return JSON.stringify({ page: "/db/damage", steps: picked.map(toStepPayload) })
            }

            // 关键词：步骤与术语一起命中，模型一次调用就能拿到公式与名词解释
            if (keyword) {
                const steps = searchDamageSteps(keyword, { mode: modeId || undefined, limit: 24 })
                const terms = searchDamageTerms(keyword, 8)

                return JSON.stringify({
                    keyword,
                    mode: mode ? { id: mode.id, label: mode.label } : undefined,
                    modeSummary: mode?.summary,
                    resultStepId: mode?.resultStepId,
                    fields: mode ? getDamageFields(mode.id, keyword) : undefined,
                    steps: steps.map(toStepPayload),
                    terms: terms.length ? terms : undefined,
                    note:
                        steps.length || terms.length
                            ? undefined
                            : "没有命中任何步骤或术语。可换更常见的说法（暴击 / 增伤 / 充盈 / 抗性 / 防御），或不带 keyword 取某个模式的完整公式链。",
                    page: mode ? `/db/damage?mode=${mode.id}` : "/db/damage",
                })
            }

            // 指定模式：返回该模式的完整公式链与输入参数
            if (mode) {
                return JSON.stringify({
                    mode: { id: mode.id, label: mode.label },
                    summary: mode.summary,
                    resultStepId: mode.resultStepId,
                    fields: getDamageFields(mode.id),
                    steps: mode.steps.map(step => ({
                        id: step.id,
                        title: step.title,
                        group: step.group,
                        formula: step.formula,
                    })),
                    tip: "术语解释（昂扬 / 背水 / 充盈 / 独立增伤 等）用 keyword 单独查。",
                    page: `/db/damage?mode=${mode.id}`,
                })
            }

            // 无参数：模式概览 + 全部术语，让模型知道伤害机制里有哪些可查内容
            return JSON.stringify({
                modes: listDamageModes(),
                terms: DAMAGE_TERMS.map(term => ({ term: term.term, aliases: term.aliases, description: term.description })),
                tip: "指定 mode 取某个模式的完整公式链；用 keyword 或 step_id 定位具体步骤与术语。",
                page: "/db/damage",
            })
        }
        case "ask_user": {
            // 真正的挂起动作在 run() 里做：这里只负责把模型给的题面归一化，
            // 归一化失败时返回错误，避免界面上出现一张没有可选项的空卡片。
            const request = normalizeAskUserRequest(args)

            if (!request) {
                return JSON.stringify({
                    error: "提问格式无法解析，至少需要一道带题干或选项的问题。",
                })
            }

            return JSON.stringify({ status: "waiting", request })
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
     * 挂起中的提问现场。
     *
     * 非 null 表示这一轮问答停在「等用户作答」：消息序列、已累积的思考与痕迹都在里面，
     * answerAsk() / skipAsk() 据此续跑。同一时刻最多一个。
     */
    private pending: DBAgentPendingState | null = null

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
     *
     * 若模型发起了 `ask_user`，本方法会在「等用户作答」处返回（结果带 `pendingAsk`），
     * 之后由 answerAsk() / skipAsk() 从断点继续同一轮问答。
     * @param history 会话历史（不含本轮回复）
     * @param callbacks 流式与工具回调
     * @returns 最终回复与工具调用记录；挂起时附带 pendingAsk
     */
    public async run(history: DBAgentHistoryMessage[], callbacks: DBAgentCallbacks = {}): Promise<DBAgentRunResult> {
        if (!this.client) {
            throw new Error(i18next.t("dbAgent.error.clientNotInit"))
        }

        if (!this.config.api_key) {
            throw new Error(i18next.t("dbAgent.error.noApiKey"))
        }

        this.interrupted = false
        this.pending = null

        const messages: ChatCompletionMessageParam[] = [
            { role: "system", content: renderDBAgentSystemPrompt() },
            ...history.map(item => ({ role: item.role, content: item.content }) as ChatCompletionMessageParam),
        ]

        return this.runLoop({ messages, reply: "", traces: [], reasonings: [], reasoningText: "", round: 0 }, callbacks)
    }

    /**
     * 用户作答后从挂起点继续。
     *
     * 回答会以 `tool` 消息回灌到挂起时的上下文里，因此模型看到的正是
     * 「我问了什么 → 用户选了什么」，接着的那一轮就能带着答案继续检索。
     * @param response 用户回答（题目 id 与选项 id 来自挂起时的 pendingAsk）
     * @param callbacks 续跑过程的回调（与 run 一致）
     * @returns 最终回复与工具调用记录
     */
    public async answerAsk(response: AskUserResponse, callbacks: DBAgentCallbacks = {}): Promise<DBAgentRunResult> {
        const state = this.pending

        if (!state) {
            throw new Error(i18next.t("dbAgent.error.noPendingAsk"))
        }

        return this.resolvePending(state, response, callbacks)
    }

    /**
     * 跳过当前提问：与作答走同一条续跑路径，只是回填给模型的是「用户未提供信息」。
     * @param callbacks 续跑过程的回调
     * @returns 最终回复与工具调用记录
     */
    public async skipAsk(callbacks: DBAgentCallbacks = {}): Promise<DBAgentRunResult> {
        const state = this.pending

        if (!state) {
            throw new Error(i18next.t("dbAgent.error.noPendingAsk"))
        }

        return this.resolvePending(state, { requestId: state.ask.requestId, answers: [], skipped: true }, callbacks)
    }

    /**
     * 当前是否有挂起中的提问。
     * @returns 挂起的提问信息；无则 null
     */
    public getPendingAsk(): DBAgentPendingAsk | null {
        return this.pending?.ask ?? null
    }

    /**
     * 丢弃挂起的提问现场（切换会话 / 用户放弃作答时调用）。
     *
     * 清掉之后 answerAsk() 会直接抛错，避免出现「回答了一个已经不在等的问题」。
     */
    public clearPending(): void {
        this.pending = null
    }

    /**
     * 把用户回答回填成工具结果，并从挂起点继续循环。
     * @param state 挂起时的状态
     * @param response 用户回答
     * @param callbacks 续跑回调
     * @returns 最终回复与工具调用记录
     */
    private async resolvePending(
        state: DBAgentPendingState,
        response: AskUserResponse,
        callbacks: DBAgentCallbacks
    ): Promise<DBAgentRunResult> {
        const { request } = state.ask

        // 回答为空且不是主动跳过时，不推进循环，让界面继续等待用户作答
        if (!response.skipped && !hasAskAnswer(request, response)) {
            throw new Error(i18next.t("dbAgent.error.needAnswer"))
        }

        this.pending = null
        this.interrupted = false

        state.messages.push({
            role: "tool",
            tool_call_id: state.ask.toolCallId,
            content: formatAskUserResponse(request, response),
        })

        const trace = state.traces.find(item => item.id === state.ask.toolCallId)

        if (trace) {
            trace.status = "done"
            trace.summary = response.skipped ? i18next.t("dbAgent.summary.skipped") : i18next.t("dbAgent.summary.answered")
            callbacks.onToolTrace?.({ ...trace })
        }

        // 发起提问的那一轮已经结束，推进轮次（保证循环必然前进，不会无限提问）
        state.round += 1

        return this.runLoop(state, callbacks)
    }

    /**
     * 工具调用主循环：流式请求 → 解析工具调用 → 执行 → 回灌，直到模型给出最终回答或挂起。
     *
     * 抽成独立方法的唯一目的是支持**挂起后恢复**：`state` 里带着消息序列与已累积的思考，
     * 恢复时把用户回答补进 `messages` 再调用本方法，就能从断点继续同一轮问答。
     * @param state 循环状态（新建时为初始态，恢复时为挂起时保存的态）
     * @param callbacks 流式与工具回调
     * @returns 最终回复与工具调用记录；挂起时附带 pendingAsk
     */
    private async runLoop(state: DBAgentLoopState, callbacks: DBAgentCallbacks = {}): Promise<DBAgentRunResult> {
        const { messages, traces, reasonings } = state

        /** 把已累积的思考收束成一段，并记录它后续发起的工具调用 */
        const flushReasoning = (toolCallIds: string[] = []) => {
            if (!state.reasoningText.trim()) {
                return
            }

            reasonings.push({ text: state.reasoningText, toolCallIds })
            state.reasoningText = ""
        }

        let round = state.round
        /** 当前轮已重试次数（每轮独立计数，防止死循环） */
        let roundRetries = 0
        /** 本次问答已自动续写的次数 */
        let continuations = 0

        while (round <= MAX_TOOL_ROUNDS) {
            const isLastRound = round === MAX_TOOL_ROUNDS
            const stream = await this.client!.chat.completions.create({
                model: this.config.default_model,
                messages,
                temperature: this.config.default_temperature,
                max_tokens: this.config.default_max_tokens,
                stream: true,
                // 最后一轮不再带工具，强制模型基于已有检索结果作答
                tools: isLastRound ? undefined : DB_AGENT_TOOLS,
            })

            let content = ""
            /** 本轮的收流原因：`length` 表示正文被输出上限截断 */
            let roundFinishReason: string | null = null
            const callSlots = new Map<number, { id: string; name: string; args: string }>()
            /**
             * DSML 泄露过滤器。
             *
             * 上游兼容层偶尔把工具调用写成正文文本（见 dsml-tool-call.ts 的说明），
             * 这里逐块过滤：DSML 块不进正文、不吐给界面，而是解析成工具调用补进调用表，
             * 让这一轮能像正常调用一样继续检索。
             */
            const dsmlFilter = new DsmlStreamFilter()
            /** 本轮流式过程中从正文里捞出的 DSML 工具调用数量 */
            let dsmlCallCount = 0

            /**
             * 把 DSML 解析出的工具调用塞进调用表。
             *
             * 索引从当前表长度往后排，避免和真实 `tool_calls` 分片的下标撞车。
             * @param result 一次解析结果
             */
            const absorbDsmlCalls = (result: DsmlParseResult) => {
                for (const call of result.calls) {
                    const index = callSlots.size
                    callSlots.set(index, {
                        id: `dsml_call_${index}_${Date.now()}`,
                        name: call.name,
                        args: JSON.stringify(call.args),
                    })
                    dsmlCallCount++
                }
            }

            for await (const chunk of stream) {
                if (this.interrupted) {
                    break
                }

                const delta = chunk.choices[0]?.delta

                const finishReason = chunk.choices[0]?.finish_reason

                if (finishReason) {
                    roundFinishReason = finishReason
                }

                if (delta?.reasoning_content) {
                    state.reasoningText += delta.reasoning_content
                    callbacks.onDelta?.(delta.reasoning_content, "reasoning")
                }

                if (delta?.content) {
                    // 正文增量先过 DSML 过滤：命中的部分转成工具调用，剩余文本才是真正的正文
                    const cleaned = dsmlFilter.push(delta.content)

                    absorbDsmlCalls(cleaned)

                    if (cleaned.text) {
                        content += cleaned.text
                        state.reply += cleaned.text
                        callbacks.onDelta?.(cleaned.text, "content")
                    }
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

            // 收流尾：缓冲区里可能还压着未闭合的片段，这里一次性判定
            absorbDsmlCalls(dsmlFilter.flush())

            // 留一条日志：这类泄露是上游兼容层的偶发问题，出现频率本身就是有用信号
            if (dsmlCallCount) {
                console.warn("[DBAgent] 检测到 DSML 标记泄露，已转为正常工具调用", {
                    round,
                    count: dsmlCallCount,
                })
            }

            if (this.interrupted) {
                return { reply: state.reply, traces, reasonings }
            }

            const calls = [...callSlots.values()].filter(call => call.name)

            // 兜底路线：正文里出现过 DSML 标记，却一个有效工具调用都没解析出来。
            // 说明格式又变了（例如新增了别的标记形态），此时这轮内容没有任何价值，
            // 丢弃并重发一次，避免把垃圾文本当成最终回答展示给用户。
            if (!calls.length && containsDsmlMarker(content)) {
                if (roundRetries < MAX_DSML_RETRIES) {
                    roundRetries++
                    console.warn("[DBAgent] 检测到无法解析的 DSML 标记，丢弃本轮并重试", {
                        round,
                        retry: roundRetries,
                    })
                    continue
                }

                // 重试次数用尽：宁可给出干净的提示，也不把标记原文抛给用户
                console.error("[DBAgent] DSML 容错重试耗尽，已丢弃污染内容", { round })
                state.reply = state.reply.replace(content, "")
                flushReasoning()
                callbacks.onReasoningEnd?.([])
                return { reply: state.reply, traces, reasonings }
            }

            if (!calls.length) {
                // 正文被输出上限截断时，上游以 finish_reason=length 收流，这里接着要一段续写，
                // 否则用户看到的就是半句话。已产出的正文先作为助手消息回灌，模型才知道从哪里接。
                if (roundFinishReason === "length" && content.trim() && continuations < MAX_CONTINUATIONS) {
                    continuations++
                    flushReasoning()
                    callbacks.onReasoningEnd?.([])
                    messages.push({ role: "assistant", content: content.trim() })
                    messages.push({ role: "user", content: CONTINUATION_PROMPT })
                    console.warn("[DBAgent] 回复触达输出上限，已自动续写", { continuations })
                    continue
                }

                // 没有工具调用说明本轮就是最终回答，收束最后一段思考
                flushReasoning()
                callbacks.onReasoningEnd?.([])
                return { reply: state.reply, traces, reasonings }
            }

            // 这一轮思考的落点就是下面这批工具调用，先把思考收束并关联起来
            const roundCallIds = calls.map(call => call.id || `call_${Date.now()}`)

            flushReasoning(roundCallIds)
            callbacks.onReasoningEnd?.(roundCallIds)

            // 回灌助手消息（携带工具调用）与工具结果，进入下一轮。
            // 注意：ask_user 的 tool 消息**不在这里**推送，它要等用户作答后由 resolvePending 补上；
            // 其余工具调用照常回灌，保证「一次提问 + 若干检索」同时发生时上下文依然完整。
            messages.push({
                role: "assistant",
                content: content.trim(),
                tool_calls: calls.map(call => ({
                    id: call.id || `call_${Date.now()}`,
                    type: "function" as const,
                    function: { name: call.name, arguments: call.args },
                })),
            })

            // 同一轮里可能同时出现 ask_user 与其它检索工具，先跑完检索再处理提问，
            // 这样挂起时除 ask_user 外的每个 tool_call 都已经有对应的 tool 消息。
            const askCall = calls.find(call => call.name === "ask_user")

            for (const call of calls) {
                if (call === askCall) {
                    continue
                }

                const id = call.id || `call_${Date.now()}`
                const args = parseToolArguments(call.args)
                const trace: DBAgentToolTrace = {
                    id,
                    name: call.name,
                    label: toolLabel(call.name),
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
                    trace.summary = error instanceof Error ? error.message : i18next.t("dbAgent.summary.toolError")
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

            if (askCall) {
                const id = askCall.id || `call_${Date.now()}`
                const request = normalizeAskUserRequest(parseToolArguments(askCall.args))

                // 题面解析不出来时不能把用户晾在空卡片上：当成工具错误回灌，让模型换个方式继续
                if (!request) {
                    const trace: DBAgentToolTrace = {
                        id,
                        name: askCall.name,
                        label: toolLabel(askCall.name),
                        args: parseToolArguments(askCall.args),
                        summary: i18next.t("dbAgent.summary.askInvalid"),
                        status: "error",
                    }

                    traces.push(trace)
                    callbacks.onToolTrace?.({ ...trace })

                    messages.push({
                        role: "tool",
                        tool_call_id: id,
                        content: JSON.stringify({
                            error: "提问格式无效：至少需要一道带题干或选项的问题。请直接检索，或用更简单的结构重新提问。",
                        }),
                    })

                    round++
                    roundRetries = 0
                    continue
                }

                const trace: DBAgentToolTrace = {
                    id,
                    name: askCall.name,
                    label: toolLabel(askCall.name),
                    args: parseToolArguments(askCall.args),
                    summary: summarizeAskUserRequest(request),
                    // 停在 running：这一步的完成与否取决于用户，不取决于模型
                    status: "running",
                }

                traces.push(trace)
                callbacks.onToolTrace?.({ ...trace })

                // 挂起：保存完整现场，等外部把用户回答喂回来
                this.pending = {
                    messages,
                    reply: state.reply,
                    traces,
                    reasonings,
                    reasoningText: state.reasoningText,
                    round,
                    ask: { requestId: request.id, request, toolCallId: id },
                }

                state.round = round
                flushReasoning()
                callbacks.onReasoningEnd?.([])

                return { reply: state.reply, traces, reasonings, pendingAsk: this.pending.ask }
            }

            // 本轮已正常消费，推进轮次并重置重试计数
            round++
            roundRetries = 0
        }

        return { reply: state.reply, traces, reasonings }
    }
}
