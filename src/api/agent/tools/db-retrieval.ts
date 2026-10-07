/**
 * 资料库检索工具集（资料检索助手与配装助手共用）。
 *
 * 真正干活的检索层在 `src/utils/db-search.ts` 与 `src/utils/rag/search.ts`，
 * 这里只负责：参数归一化 → 调检索层 → 序列化成模型可引用的 JSON，
 * 外加一份界面摘要（`summary`），避免两个 Agent 各自写一套一模一样的投影。
 *
 * 不同 Agent 需要的工具面不同，用 {@link DbRetrievalToolOptions} 一次性裁剪：
 * - `modules`：条目模块白名单，配装助手只要角色 / 武器 / 魔之楔 / 魔灵 / 怪物 / 伤害，其余不暴露；
 * - `story`：剧情类工具（`search_story` / `read_story` / `list_version_additions`）与配装无关；
 * - `ragEnabled`：上下文检索增强关闭时连 rag_search 都不声明，提示词侧同样没有它。
 */

import i18next from "i18next"
import {
    DAMAGE_TERMS,
    getDamageFields,
    getDamageMode,
    listDamageModes,
    searchDamageSteps,
    searchDamageTerms,
} from "@/data/damage-mechanics"
import { RAG_CHUNK_KINDS, type RagChunkKind } from "@/data/rag/types"
import type { AskUserRequest } from "@/utils/db-ask-user"
import { normalizeAskUserRequest, summarizeAskUserRequest } from "@/utils/db-ask-user"
import {
    DB_AGENT_LANGS,
    type DBAgentLang,
    ensureDBAgentLangReady,
    normalizeDBAgentLang,
    resolveCurrentDBAgentLang,
} from "@/utils/db-locale"
import {
    listEntryFields,
    listModuleFilters,
    listModules,
    listVersionAdditions,
    listVersions,
    queryModule,
    readEntry,
    readStory,
    searchAll,
    searchStory,
} from "@/utils/db-search"
import { isRagEnabled } from "@/utils/rag/enabled"
import { ragSearch } from "@/utils/rag/search"
import type { AgentTool, AgentToolContext, AgentToolOutput } from "../tool"

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
 * mode 参数的说明文案。
 *
 * 与 `filters` 一样，措辞必须只在参数定义处维护一份：模型对「同义不同词」的参数说明
 * 容易读成两种口径，从而多做一次无谓查询。
 */
const MODE_DESCRIPTION =
    "检索模式。fuzzy（默认）：匹配条目名称、副信息与隐藏检索词，适合「知道大概叫什么」。 " +
    "grep：下钻条目的原始字段，按字段名与字段值做包含匹配，适合「按字段找条目」—— " +
    "例如「哪些魔之楔带技能威力」「哪些魔之楔的效果里提到护盾」这类名称和副信息里看不到的字段，必须用 grep 才搜得到。 " +
    "grep 会在每条命中里返回 matches（命中的字段路径与取值），便于直接引用。 " +
    "模块没有可下钻的原始字段时会退回 fuzzy，返回值里的 appliedMode 与 note 会说明。"

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

/** 工具集裁剪项。 */
export interface DbRetrievalToolOptions {
    /**
     * 暴露给模型的条目模块白名单，取值见 `list_data_modules` 的 id。
     *
     * 不传表示全量开放。配装助手按需求收敛到角色 / 武器 / 魔之楔 / 魔灵 / 怪物 / 伤害，
     * 免得模型把检索面铺到剧情、钓鱼这些无关模块上。
     */
    modules?: readonly string[]
    /** 是否包含剧情类工具（search_story / read_story / list_version_additions） */
    story?: boolean
    /** 上下文检索增强是否可用；false 时不声明 rag_search */
    ragEnabled?: boolean
    /** 是否包含 ask_user（会挂起等待用户作答） */
    askUser?: boolean
}

/**
 * @description 截断过长文本，避免工具结果撑爆上下文。
 * @param text 原始文本
 * @param maxLength 长度上限
 * @returns 截断后的文本
 */
function truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/**
 * @description 归一化模型的 filters 参数。
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
 * @description 解析本次调用的检索语言。
 *
 * 模型显式指定优先，否则跟随界面语言；取值非法时同样跟随界面语言。
 * 取值确定后统一预热语言包：检索期需要在同步路径里读译文与语音数据集。
 * @param args 工具参数
 * @returns 本次使用的语言
 */
async function resolveLang(args: Record<string, unknown>): Promise<DBAgentLang> {
    const lang: DBAgentLang = normalizeDBAgentLang(args.lang) ?? resolveCurrentDBAgentLang()

    // 同一语言重复调用会直接返回，不存在重复装配
    await ensureDBAgentLangReady(lang)

    return lang
}

/**
 * @description 生成工具结果摘要，用于界面展示。
 *
 * 两个 Agent 共用同一份 i18n 键（`dbAgent.summary.*`）：同一句话不必在两个地方各维护一套译文。
 * @param name 工具名
 * @param payload 工具返回值里解析出的 JSON 对象
 * @returns 摘要文本；非 JSON 结果返回空串
 */
export function summarizeDbToolResult(name: string, payload: unknown): string {
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
        case "list_entry_fields": {
            const fields = (data.fields as unknown[] | undefined) ?? []
            return i18next.t("dbAgent.summary.entryFieldSchema", {
                defaultValue: "{{prefix}}{{count}} 个可投影字段",
                prefix: data.module ? `${data.module}.` : "",
                count: fields.length,
            })
        }
        case "search_data": {
            const results = data.results as unknown[] | undefined
            return i18next.t("dbAgent.summary.searchHits", { prefix: "", count: results?.length ?? 0 })
        }
        case "rag_search": {
            // 开关关闭时工具只返回不可用提示，展示成「已关闭」而不是「召回 0 条」
            if (data.error) {
                return i18next.t("dbAgent.summary.ragDisabled", { defaultValue: "上下文检索增强未开启" })
            }

            const hits = (data.hits as unknown[] | undefined) ?? []
            return i18next.t("dbAgent.summary.ragHits", { count: hits.length })
        }
        case "query_module_entries":
            return i18next.t("dbAgent.summary.searchHits", { prefix: data.module ? `${data.module}.` : "", count: data.total ?? 0 })
        case "read_entry": {
            const entry = data.entry as { name?: string; fields?: Record<string, unknown> } | undefined

            if (entry) {
                return i18next.t("dbAgent.summary.entryFields", {
                    defaultValue: "{{name}}：{{count}} 项字段",
                    name: entry.name ?? "",
                    count: Object.keys(entry.fields ?? {}).length,
                })
            }

            const candidates = (data.candidates as unknown[] | undefined) ?? []

            return i18next.t("dbAgent.summary.searchHits", {
                defaultValue: "命中 {{count}} 条",
                prefix: "",
                count: candidates.length,
            })
        }
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
 * @description 把「执行体 + 定义」包装成 {@link AgentTool}。
 *
 * 摘要统一走 {@link summarizeDbToolResult}：工具自己不必关心界面文案，
 * 结果正文里解析不出 JSON 时（理论上不该发生）摘要降级为空串。
 * @param definition 工具定义
 * @param execute 执行体，返回 JSON 字符串
 * @returns 可直接挂到主循环上的工具
 */
function defineTool<TPayload>(
    definition: AgentToolDefinitionLike,
    execute: (args: Record<string, unknown>, context: AgentToolContext) => Promise<string>
): AgentTool<TPayload> {
    return {
        definition,
        concurrentSafe: true,
        async execute(args, context) {
            const content = await execute(args, context)

            return { content, summary: summarizeDbToolResult(definition.name, tryParse(content)) }
        },
    }
}

/** {@link defineTool} 接受的本地工具定义形态，字段与 {@link AgentToolDefinition} 一致。 */
type AgentToolDefinitionLike = AgentTool<never>["definition"]

/**
 * @description 把工具返回文本解析成 JSON 对象。
 * @param raw 工具返回文本
 * @returns 解析结果；非 JSON 时返回 null
 */
function tryParse(raw: string): unknown {
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/**
 * @description 构造一组资料库检索工具。
 * @param options 裁剪项
 * @returns 工具列表（已按需要用白名单过滤）
 */
export function createDbRetrievalTools<TPayload = never>(options: DbRetrievalToolOptions = {}): AgentTool<TPayload>[] {
    const includeStory = options.story !== false
    const includeAskUser = options.askUser !== false
    const includeRag = options.ragEnabled === true && isRagEnabled()
    /** 模块白名单为空表示不裁剪 */
    const allowedModules = options.modules?.length ? new Set(options.modules) : null

    /**
     * @description 判断某个模块是否允许被检索。
     * @param moduleId 模块 id
     * @returns 是否允许
     */
    const isModuleAllowed = (moduleId: string): boolean => (allowedModules ? allowedModules.has(moduleId) : true)

    /**
     * @description 模块不在白名单内时的报错文案，把可用模块一并告诉模型。
     * @param moduleId 模块 id
     * @param lang 当前语言
     * @returns 序列化后的错误
     */
    const moduleNotAllowed = (moduleId: string, lang: DBAgentLang): string =>
        JSON.stringify({
            lang,
            error: `不支持的模块 "${moduleId}"`,
            supported: visibleModuleIds(lang),
        })

    /**
     * @description 列出当前白名单下暴露的模块 id。
     * @param lang 语言
     * @returns 模块 id 列表
     */
    function visibleModuleIds(lang: DBAgentLang): string[] {
        return listModules(lang)
            .filter(item => isModuleAllowed(item.id))
            .map(item => item.id)
    }

    const tools: AgentTool<TPayload>[] = []

    tools.push(
        defineTool<TPayload>(
            {
                name: "list_data_modules",
                description:
                    "列出资料库中可检索的模块清单，包含模块 id、名称、条目数与是否支持按版本过滤。用于确认某个提问应该查哪个模块。",
                parameters: { type: "object", properties: { lang: LANG_SCHEMA } },
            },
            async args => {
                const lang = await resolveLang(args)

                return JSON.stringify({
                    lang,
                    modules: listModules(lang).filter(item => isModuleAllowed(item.id)),
                    versions: listVersions(),
                })
            }
        )
    )

    tools.push(
        defineTool<TPayload>(
            {
                name: "list_filter_options",
                description:
                    "列出某个模块可用的筛选项与全部合法取值（对应资料库各列表页上的筛选行），例如剧情模块的任务类型（主线任务 / 支线任务 / 限时任务 / 活动任务）、篇章、印象检定、印象增加。用于在按分类过滤前先确认取值。",
                parameters: {
                    type: "object",
                    properties: {
                        lang: LANG_SCHEMA,
                        module: { type: "string", description: "模块 id，见 list_data_modules。剧情请用 questchain" },
                    },
                    required: ["module"],
                },
            },
            async args => {
                const lang = await resolveLang(args)
                const moduleId = `${args.module ?? ""}`.trim()

                if (!isModuleAllowed(moduleId)) {
                    return moduleNotAllowed(moduleId, lang)
                }

                const { module: moduleInfo, facets, note } = await listModuleFilters(moduleId, lang)

                if (!moduleInfo) {
                    return moduleNotAllowed(moduleId, lang)
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
        )
    )

    tools.push(
        defineTool<TPayload>(
            {
                name: "search_data",
                description:
                    "全库关键词检索，覆盖资料库所有模块（角色、武器、魔之楔、成就、任务链、活动、副本、怪物、NPC、道具等），返回标题、副信息、类型与跳转路径。适合不确定内容属于哪个模块时先定位。",
                parameters: {
                    type: "object",
                    properties: {
                        lang: LANG_SCHEMA,
                        query: { type: "string", description: "检索关键词，例如角色名、道具名、副本名" },
                        module: {
                            type: "string",
                            description:
                                "可选，限定只在该模块内检索，取值见 list_data_modules 的 id，例如 char / weapon / mod / achievement",
                        },
                        limit: { type: "integer", description: "返回条数上限，默认 20，最大 50" },
                    },
                    required: ["query"],
                },
            },
            async args => {
                const lang = await resolveLang(args)
                const query = `${args.query ?? ""}`.trim()
                const moduleId = `${args.module ?? ""}`.trim()

                if (moduleId && !isModuleAllowed(moduleId)) {
                    return moduleNotAllowed(moduleId, lang)
                }

                const pathPrefix = moduleId ? listModules(lang).find(item => item.id === moduleId)?.path : undefined
                const results = searchAll(query, { limit: Number(args.limit) || undefined, pathPrefix, lang })

                return JSON.stringify({ lang, query, module: moduleId || undefined, results })
            }
        )
    )

    tools.push(
        defineTool<TPayload>(
            {
                name: "list_entry_fields",
                description:
                    "列出某个模块条目的原始字段结构（字段名、类型、下钻字段、覆盖面），用于写 read_entry 的 select。" +
                    "**只在要查 fields 之外的深层字段时才用**（如角色的等级成长表 `升级`、技能的弹道参数 `实体`、魔之楔的 `buff` 原始结构）——" +
                    "倍率、技能、面板、灾厄熔炼这些 read_entry 的 fields 已经给了，不需要 select。",
                parameters: {
                    type: "object",
                    properties: {
                        lang: LANG_SCHEMA,
                        module: { type: "string", description: "模块 id，见 list_data_modules，例如 char / weapon / mod" },
                    },
                    required: ["module"],
                },
            },
            async args => {
                const lang = await resolveLang(args)
                const moduleId = `${args.module ?? ""}`.trim()

                if (!isModuleAllowed(moduleId)) {
                    return moduleNotAllowed(moduleId, lang)
                }

                const { module, fields, note } = listEntryFields(moduleId, lang)

                if (!module) {
                    return moduleNotAllowed(moduleId, lang)
                }

                return JSON.stringify({
                    lang,
                    module: module.id,
                    total: fields.length,
                    note,
                    fields,
                    tip: '拿这些字段名去 read_entry 传 select，例如 "{ 名称 升级 }"；coverage 是有该字段的条目占比，coverage 低说明只有个别条目有。',
                })
            }
        )
    )

    if (includeRag) {
        tools.push(
            defineTool<TPayload>(
                {
                    name: "rag_search",
                    description:
                        "统一召回：一次跨「剧情台词 / 剧情 AI 总结 / 角色语音 / 角色档案 / 调查墙线索板 / 剧情回顾 / 游戏内百科 / 全库条目」检索，返回可直接引用的证据——命中正文、前后几行的上下文片段、出处路径与得分。" +
                        "用于回答“谁说过什么”“哪段剧情、哪句语音、哪条角色档案、哪件道具提到过 X”“某个词在资料库里出现在哪”这类需要证据的问题；" +
                        "要「这条剧情讲了什么」这类整链梗概时，用 kinds 只查 summary（剧情 AI 总结）——一条任务链一条，一次性拿到完整脉络，比逐行台词快得多。" +
                        "调查墙线索板（clue）、剧情回顾（review）与游戏内百科（wiki）的正文只有中文原文，命中时按中文引用。" +
                        "不确定内容属于哪个模块、或需要跨模块找线索时也先用它。返回的是片段：要某个条目的完整字段（生日、CV、面板数值）或某条档案的全文仍用 read_entry，要按分类穷举仍用 query_module_entries。",
                    parameters: {
                        type: "object",
                        properties: {
                            lang: LANG_SCHEMA,
                            query: { type: "string", description: "检索关键词或一句话描述，例如角色名、道具名、机制术语、台词片段" },
                            kinds: {
                                type: "array",
                                items: { type: "string", enum: [...RAG_CHUNK_KINDS] },
                                description:
                                    "可选，限定语料种类：story 剧情台词 / summary 任务链剧情 AI 总结（整链梗概）/ voice 角色语音 / profile 角色档案（角色背景故事原文）/ clue 调查墙线索板（线索板上的文字记录）/ review 剧情回顾（回顾页的剧情梗概）/ wiki 游戏内百科（百科词条的正文段）/ entry 全库条目。不传则八者都查",
                            },
                            modules: {
                                type: "array",
                                items: { type: "string" },
                                description:
                                    "可选，限定条目模块（char / weapon / mod / charprofile 等，取值见 list_data_modules）。只给 modules 未给 kinds 时自动只查带模块归属的语料（条目 + 角色档案）",
                            },
                            version: { type: "string", description: "可选，限定版本号，例如 1.6" },
                            limit: { type: "integer", description: "返回条数上限，默认 8，最大 30" },
                            context_lines: { type: "integer", description: "剧情命中行前后附带的台词行数，默认 2，最大 5" },
                        },
                        required: ["query"],
                    },
                },
                async args => {
                    const lang = await resolveLang(args)

                    // 兜底：上下文检索增强关闭时不声明该工具，正常路径下模型不会调到它。
                    // 真被调到也要在这里拦住——否则会触发语料装配与索引构建。
                    if (!isRagEnabled()) {
                        return JSON.stringify({ lang, error: "上下文检索增强未开启" })
                    }

                    const query = `${args.query ?? ""}`.trim()
                    // 种类与模块由模型给出，可能夹带不存在的取值：先按白名单收敛，避免脏参数把检索面清空
                    const kinds = Array.isArray(args.kinds)
                        ? ([...new Set(args.kinds.map(item => `${item}`.trim()))].filter(item =>
                              (RAG_CHUNK_KINDS as readonly string[]).includes(item)
                          ) as RagChunkKind[])
                        : undefined
                    const modules = Array.isArray(args.modules)
                        ? [...new Set(args.modules.map(item => `${item}`.trim()))].filter(item => isModuleAllowed(item))
                        : undefined
                    const result = await ragSearch(query, {
                        lang,
                        kinds: kinds?.length ? kinds : undefined,
                        modules: modules?.length ? modules : undefined,
                        version: args.version ? `${args.version}` : undefined,
                        limit: Number(args.limit) || undefined,
                        contextLines: Number(args.context_lines) || undefined,
                    })

                    return JSON.stringify({
                        lang,
                        query,
                        total: result.total,
                        note: result.note,
                        hits: result.hits.map(hit => ({
                            kind: hit.kind,
                            module: hit.module,
                            id: hit.entityId,
                            title: hit.title,
                            text: hit.text,
                            snippet: hit.snippet,
                            meta: hit.meta,
                            version: hit.version,
                            path: hit.path,
                            score: hit.score,
                            matchedBy: hit.matchedBy,
                        })),
                        tip: "snippet 是带上下文的片段（`> ` 标出命中行）。要某条目的完整字段请用 read_entry（module + id）；要按分类穷举请用 query_module_entries；kind=summary 的命中是整链剧情梗概（中文），可直接用来概括剧情，需要逐句原文再 read_story（chainId 取自路径 /db/questchain/<id>）；kind=profile 的命中是角色档案（角色背景故事原文），要整篇正文用 read_entry（module=charprofile + id）；kind=clue / review / wiki 的命中是调查墙线索板、剧情回顾与游戏内百科的正文（中文），已召回完整条目正文，直接引用即可，无需再查其它工具。",
                    })
                }
            )
        )
    }

    tools.push(
        defineTool<TPayload>(
            {
                name: "query_module_entries",
                description:
                    "按模块查询条目明细，支持关键词、版本与分类筛选（筛选项与资料库各列表页一致），返回名称、副信息、版本与详情路径。" +
                    "适合回答“某个版本新增了哪些成就”“某系列有哪些魔之楔”“三星星级的成就有多少”。" +
                    "关键词默认走 fuzzy 模式（匹配名称、副信息与隐藏检索词）；要「按字段找条目」——例如“哪些魔之楔带技能威力”“哪些魔之楔的效果提到护盾”" +
                    "——必须把 mode 设为 grep：fuzzy 只能看标题与描述，字段级的内容（词条属性、效果文案里的关键术语）只有 grep 下钻原始字段才匹配得到。" +
                    "返回的是条目摘要：要某个条目的完整字段（角色生日 / 出生地 / CV、武器面板、魔之楔效果等）请再用 read_entry 按 id 取详情。",
                parameters: {
                    type: "object",
                    properties: {
                        lang: LANG_SCHEMA,
                        module: { type: "string", description: "模块 id，见 list_data_modules，例如 achievement / mod / char / weapon" },
                        keyword: { type: "string", description: "可选，模块内关键词（名称、分类、描述等字段）" },
                        mode: { type: "string", enum: ["fuzzy", "grep"], description: MODE_DESCRIPTION },
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
            async args => {
                const lang = await resolveLang(args)
                const moduleId = `${args.module ?? ""}`.trim()

                if (!isModuleAllowed(moduleId)) {
                    return moduleNotAllowed(moduleId, lang)
                }

                const filters = normalizeFilters(args.filters)
                const mode = args.mode === "grep" ? "grep" : args.mode === "fuzzy" ? "fuzzy" : undefined
                const { module, entries, total, appliedMode, note } = queryModule(moduleId, {
                    keyword: args.keyword ? `${args.keyword}` : undefined,
                    version: args.version ? `${args.version}` : undefined,
                    filters,
                    mode,
                    limit: Number(args.limit) || undefined,
                    lang,
                })

                if (!module) {
                    return moduleNotAllowed(moduleId, lang)
                }

                return JSON.stringify({
                    lang,
                    module: module.id,
                    moduleLabel: module.label,
                    modulePath: module.path,
                    versioned: module.versioned,
                    appliedMode,
                    note,
                    appliedFilters: Object.keys(filters).length ? filters : undefined,
                    total,
                    entries: entries.map(entry => ({
                        id: entry.id,
                        name: entry.name,
                        subtitle: entry.subtitle,
                        version: entry.version,
                        path: entry.path,
                        matches: entry.matches?.length ? entry.matches : undefined,
                    })),
                    tip: "这里只有条目摘要。需要某条目的完整字段（角色生日 / 出生地 / CV、武器面板、魔之楔效果等）时，用 read_entry 按 module + id 取详情。",
                })
            }
        )
    )

    tools.push(
        defineTool<TPayload>(
            {
                name: "read_entry",
                description:
                    "读取单个条目的完整字段（详情页上的档案与面板）：角色的生日 / 出生地 / 势力 / 阵营 / CV / 基础属性 / 突破材料，" +
                    "角色与武器技能的逐条倍率（`技能字段`：伤害倍率、属性影响、标签如充盈/远程/武器、削韧、连段/取消秒数）、" +
                    "技能术语解释（`技能术语解释`：`处决目标`、`羽化`、`充盈` 这类机制名词的官方定义）、" +
                    "武器的灾厄熔炼（`灾厄熔炼`：逐档潜能的解锁效果与加成，面板数值、熔炼文案、突破材料），" +
                    "魔之楔的词条属性与效果、招式替换后的倍率（`技能替换字段`），成就奖励，怪物属性，" +
                    "魔之楔 / 武器 / 资源的获取来源（`来源` / `获取途径`：副本掉落、商店售卖、任务链、角色突破、道具箱、活动等），" +
                    "角色档案的整篇正文（module=charprofile），以及读物与资源的地图坐标（书页位置 / 宝藏位置 / 采集位置）等。" +
                    "回答「某某的生日是什么」「谁配的音」「这把武器暴击多少」「这个技能伤害倍率多少」「这把武器的灾厄熔炼有什么」" +
                    "「处决目标是什么意思」「某某的档案里讲了什么」「这件道具 / 这本书在哪」「这个魔之楔 / 武器 / 道具怎么获得、哪来的」这类问题必须调用它——" +
                    "query_module_entries 与 search_data 只返回条目摘要，不含这些字段。" +
                    "先用 query_module_entries 或 search_data 定位条目拿到 id，再用本工具；给名称也可以，但只在唯一命中时直接返回详情，否则会返回候选列表。",
                parameters: {
                    type: "object",
                    properties: {
                        lang: LANG_SCHEMA,
                        module: {
                            type: "string",
                            description: "模块 id，见 list_data_modules，例如 char / weapon / mod / achievement / charprofile（角色档案）",
                        },
                        id: { type: "string", description: "条目 id（取自 query_module_entries / search_data 的返回），优先用它定位" },
                        name: { type: "string", description: "可选，条目名称；不确定 id 时可只给名称，命中唯一时直接返回详情" },
                        select: {
                            type: "string",
                            description:
                                "可选，只取原始数据里的指定字段（GraphQL 风格选择集，空格或逗号分隔、不需要冒号）：" +
                                "`{ id 名称 技能 { 名称 字段 { 名称 值 格式 tag } } }`。" +
                                "用于查 fields 里没有投影的深层字段——返回的 selectableFields 就是这条还能 select 的字段名。" +
                                "数组会按元素展开；`a.b` 等价于 `a { b }`。**多数问题不需要它**——倍率、技能、面板、灾厄熔炼等已在 fields 里给成可读文本，" +
                                "只有 selectableFields 里列出的字段才需要 select。语法错误会返回 error 与正确写法。",
                        },
                    },
                    required: ["module"],
                },
            },
            async args => {
                const lang = await resolveLang(args)
                const moduleId = `${args.module ?? ""}`.trim()
                const id = args.id === undefined || args.id === null ? undefined : `${args.id}`.trim()
                const name = args.name ? `${args.name}`.trim() : undefined

                if (!isModuleAllowed(moduleId)) {
                    return moduleNotAllowed(moduleId, lang)
                }

                const {
                    module: moduleInfo,
                    entry,
                    data,
                    selection,
                    selectableFields,
                    candidates,
                    error,
                } = readEntry(moduleId, {
                    id,
                    name,
                    lang,
                    select: args.select ? `${args.select}` : undefined,
                })

                if (!moduleInfo) {
                    return moduleNotAllowed(moduleId, lang)
                }

                return JSON.stringify({
                    lang,
                    module: moduleInfo.id,
                    moduleLabel: moduleInfo.label,
                    modulePath: moduleInfo.path,
                    total: moduleInfo.count,
                    entry: entry
                        ? {
                              id: entry.id,
                              name: entry.name,
                              subtitle: entry.subtitle,
                              version: entry.version,
                              path: entry.path,
                              fields: entry.fields,
                          }
                        : undefined,
                    data,
                    selectionError: selection?.error,
                    selectableFields,
                    candidates: candidates?.map(candidate => ({
                        id: candidate.id,
                        name: candidate.name,
                        subtitle: candidate.subtitle,
                        version: candidate.version,
                        path: candidate.path,
                    })),
                    error,
                    tip: entry ? undefined : "candidates 是关键词命中的相近条目：确认哪个才是目标，再用它的 id 重新调用本工具。",
                })
            }
        )
    )

    tools.push(
        defineTool<TPayload>(
            {
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
            async args => {
                const lang = await resolveLang(args)
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

                    return JSON.stringify({ lang, page: "/db/damage", steps: picked.map(toStepPayload) })
                }

                // 关键词：步骤与术语一起命中，模型一次调用就能拿到公式与名词解释
                if (keyword) {
                    const steps = searchDamageSteps(keyword, { mode: modeId || undefined, limit: 24 })
                    const terms = searchDamageTerms(keyword, 8)

                    return JSON.stringify({
                        lang,
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
                        lang,
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
                    lang,
                    modes: listDamageModes(),
                    terms: DAMAGE_TERMS.map(term => ({ term: term.term, aliases: term.aliases, description: term.description })),
                    tip: "指定 mode 取某个模式的完整公式链；用 keyword 或 step_id 定位具体步骤与术语。",
                    page: "/db/damage",
                })
            }
        )
    )

    if (includeStory) {
        tools.push(
            defineTool<TPayload>(
                {
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
                async args => {
                    const lang = await resolveLang(args)
                    const version = `${args.version ?? ""}`.trim()

                    if (!version) {
                        return JSON.stringify({ lang, error: "缺少版本号", knownVersions: listVersions() })
                    }

                    return JSON.stringify({ lang, ...listVersionAdditions(version, lang) })
                }
            )
        )

        tools.push(
            defineTool<TPayload>(
                {
                    name: "search_story",
                    description:
                        "剧情检索：在任务链与剧情对话正文中查找人名、地点、事件，返回命中的任务链以及说话人与台词片段。用于回答“某某剧情里谁做了什么”“这句话是谁说的”。" +
                        '也可不带关键词、只用 filters 按剧情列表页的筛选规则列举任务链，例如列出全部主线任务（filters 传 {"type":"主线任务"}）。' +
                        "关键词与 filters 可以同时给出，此时先按 filters 收窄范围再检索。" +
                        "有关键词时，每条命中都附带 summary（该任务链的整链 AI 剧情总结，中文）：问“这条剧情讲了什么”时直接用 summary 作答即可，不必再读原文。",
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
                async args => {
                    const lang = await resolveLang(args)
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
                            summary: hit.summary,
                            path: hit.path,
                            snippets: hit.snippets.map(snippet => ({
                                questName: snippet.questName,
                                speaker: snippet.speaker || undefined,
                                text: truncate(snippet.text, 220),
                            })),
                        })),
                    })
                }
            )
        )

        tools.push(
            defineTool<TPayload>(
                {
                    name: "read_story",
                    description:
                        "读取指定任务链（可用 quest_id 限定单个任务）的剧情原文，按行返回说话人与台词，用于补充上下文。任务链 id 可由 search_story 或 search_data 得到。" +
                        "返回里 chain.summary 是该链的整链 AI 剧情总结（中文）：要概括剧情先看它，lines 用来核对细节，不必把整链读完。",
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
                async args => {
                    const lang = await resolveLang(args)
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
                        note: result.note,
                        lines: result.lines.map(line => ({
                            questName: line.questName,
                            speaker: line.speaker || undefined,
                            text: truncate(line.text, 220),
                        })),
                    })
                }
            )
        )
    }

    if (includeAskUser) {
        tools.push(createAskUserTool<TPayload>())
    }

    return tools
}

/**
 * @description 创建 ask_user 工具。
 *
 * 它不返回结果，而是返回 `{ suspend }`：主循环据此封存现场等用户作答，
 * 题面无法解析时退化成工具错误回灌，避免界面出现一张没有可选项的空卡片。
 * @returns ask_user 工具
 */
export function createAskUserTool<TPayload>(): AgentTool<TPayload> {
    return {
        definition: {
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

        execute(args): AgentToolOutput<TPayload> {
            const request = normalizeAskUserRequest(args) as TPayload | null

            if (!request) {
                return {
                    content: JSON.stringify({ error: "提问格式无法解析，至少需要一道带题干或选项的问题。" }),
                    isError: true,
                }
            }

            return { suspend: request, summary: summarizeAskUserRequest(request as unknown as AskUserRequest) }
        },
    }
}
