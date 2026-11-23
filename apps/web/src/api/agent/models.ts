/**
 * 上游模型列表探测。
 *
 * 设置页「获取模型」的唯一入口：按 OpenAI 兼容约定读取 `/models`，不经过 Agent 主循环、
 * 不落库。Anthropic 官方用 `x-api-key` + 版本头；其余网关用 Bearer。
 */

import { parseTokenCount } from "@/utils/ai-config"
import { resolveAgentFetch } from "./desktop-fetch"
import { ANTHROPIC_API_VERSION, isAnthropicUpstream, resolveModelsEndpoint } from "./wire"

/** 一条可选的模型。 */
export interface AiModelInfo {
    /** 模型 id（请求体里直接使用） */
    id: string
    /** 上游声明的归属方，仅用于展示/搜索 */
    ownedBy?: string
    /** 模型最大上下文窗口（tokens）；magpie 等网关会给出 */
    contextWindow?: number
    /** 模型最大输出 tokens；magpie 等网关会给出 */
    maxOutputTokens?: number
    /** 模型支持的推理强度（magpie 的 reasoning_levels / supported_reasoning_levels） */
    reasoningLevels?: string[]
}

/** 获取模型列表的入参（直接取自设置页自定义模型区的填写值）。 */
export interface AiModelListParams {
    /** 上游基址 */
    baseUrl: string
    /** 上游 API Key；本机网关可留空 */
    apiKey: string
    /**
     * 覆盖模型列表地址。magpie 等网关的列表在站点根 `/models`，不在对话基址的 `/v1` 下；
     * 缺省时按基址推导（OpenAI 约定 `<base>/models`）。
     */
    modelsEndpoint?: string
    /** 请求超时（毫秒）；缺省 15 秒 */
    timeout?: number
}

/** 列表探测的超时：列表接口通常很快，卡住就让按钮尽快恢复可点。 */
const DEFAULT_MODELS_TIMEOUT = 15_000

/**
 * 非对话模型的 id 特征：Embedding / 语音 / 图像 / 审核等端点不能用于 Agent 对话，
 * 混在列表里只会让选择变难。
 */
const NON_CHAT_MODEL_PATTERN =
    /(?:^|[-_/])(?:embed|embedding|embeddings|whisper|tts|dall-?e|moderation|rerank|transcribe|transcription|speech|audio|realtime|image|imagen|sora|veo|guard|canary)(?:$|[-_/])/i

/**
 * @description 判断模型 id 是否适合作为对话模型展示。
 * @param id 模型 id
 * @returns 可对话返回 true
 */
export function isChatCapableModelId(id: string): boolean {
    return !NON_CHAT_MODEL_PATTERN.test(id)
}

/**
 * @description 把上游返回的模型列表归一化成 `{ id, ownedBy }`。
 *
 * 兼容 OpenAI / Anthropic 的 `{ data: [...] }`、部分网关的 `{ models: [...] }` 与裸数组，
 * 条目既可以是字符串也可以是对象；重复 id 只保留首个。过滤后为空时回退全量，
 * 避免某个网关的命名习惯差异让选择列表整个空掉。
 * @param payload 上游响应体
 * @returns 归一化后的模型列表
 */
export function normalizeModelList(payload: unknown): AiModelInfo[] {
    const entries = extractModelEntries(payload)
    const byId = new Map<string, AiModelInfo>()

    for (const entry of entries) {
        const model = readModelEntry(entry)
        if (model && !byId.has(model.id)) {
            byId.set(model.id, model)
        }
    }

    const all = [...byId.values()]
    const chatOnly = all.filter(model => isChatCapableModelId(model.id))

    return chatOnly.length ? chatOnly : all
}

/**
 * @description 读取上游模型列表。
 *
 * 先打预设/推导出的列表地址；404/405 时再按站点根 `/models` 重试一次，
 * 兼容 magpie 这类把列表挂在根路径、对话挂在 `/v1` 的网关。
 * @param params 基址 / 密钥 / 可选的列表地址覆盖（均允许首尾空白，内部统一 trim）
 * @returns 归一化后的模型列表；基址非法、鉴权失败、超时时抛出
 */
export async function listAiModels(params: AiModelListParams): Promise<AiModelInfo[]> {
    const baseUrl = params.baseUrl.trim()

    if (!baseUrl) {
        throw new Error("请先填写基础URL")
    }

    const endpoints = buildModelListEndpoints(baseUrl, params.modelsEndpoint)

    if (!endpoints.length) {
        throw new Error("基础URL格式不正确")
    }

    const controller = new AbortController()
    const timeout = params.timeout ?? DEFAULT_MODELS_TIMEOUT
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
        const requestFetch = resolveAgentFetch() ?? fetch
        const headers = buildModelListHeaders(baseUrl, params.apiKey)
        let failureStatus = 0
        let failureDetail = ""

        for (const endpoint of endpoints) {
            const response = await requestFetch(endpoint, { method: "GET", headers, signal: controller.signal })

            if (response.ok) {
                const payload = await response.json().catch(() => null)
                if (payload !== null) {
                    return normalizeModelList(payload)
                }
                // 200 但不是 JSON：记住这次失败，继续试下一个候选
                if (!failureStatus) {
                    failureStatus = response.status
                    failureDetail = "上游响应不是有效的 JSON 模型列表"
                }
                continue
            }

            if (response.status !== 404 && response.status !== 405) {
                failureStatus = response.status
                failureDetail = await readErrorDetail(response)
                break
            }

            if (!failureStatus) {
                failureStatus = response.status
                failureDetail = await readErrorDetail(response)
            }
        }

        throw new Error(`上游返回 ${failureStatus}${failureDetail ? `：${failureDetail}` : ""}`)
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error("获取模型超时")
        }
        throw error
    } finally {
        clearTimeout(timer)
    }
}

/**
 * @description 生成模型列表的候选地址：覆盖值或推导值优先，其次站点根 `/models`。
 * @param baseUrl 上游基址
 * @param override 页面按预设传入的列表地址
 * @returns 去重后的端点列表；基址非法时为空
 */
function buildModelListEndpoints(baseUrl: string, override?: string): string[] {
    const primary = override?.trim() || resolveModelsEndpoint(baseUrl)

    if (!primary) {
        return []
    }

    const endpoints = [primary]

    try {
        const root = `${new URL(primary).origin}/models`
        if (!endpoints.includes(root)) {
            endpoints.push(root)
        }
    } catch {
        // primary 由 resolveModelsEndpoint / 页面预设给出，正常不会解析失败
    }

    return endpoints
}

/** 模型条目的宽松形态。 */
type ModelEntryRecord = Record<string, unknown>

/**
 * @description 从响应体里取出模型条目数组。
 * @param payload 上游响应体
 * @returns 条目数组；无法识别时为空数组
 */
function extractModelEntries(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
        return payload
    }

    if (!payload || typeof payload !== "object") {
        return []
    }

    const record = payload as ModelEntryRecord

    for (const key of ["data", "models"]) {
        if (Array.isArray(record[key])) {
            return record[key] as unknown[]
        }
    }

    return []
}

/**
 * @description 把单条模型条目读成 `{ id, ownedBy, contextWindow, maxOutputTokens }`。
 *
 * 上下文 / 输出上限兼容 magpie 的 `context_window` / `max_output_tokens`、
 * OpenRouter 的 `context_length` / `top_provider.max_completion_tokens` 等常见字段；
 * 缺失时留空，由调用方按「用户配置 > 模型元数据 > 应用默认」回落。
 * @param entry 字符串或对象形式的条目
 * @returns 模型信息；缺少 id 时 null
 */
function readModelEntry(entry: unknown): AiModelInfo | null {
    if (typeof entry === "string") {
        const id = entry.trim()
        return id ? { id } : null
    }

    if (!entry || typeof entry !== "object") {
        return null
    }

    const record = entry as ModelEntryRecord
    const id = readString(record.id) ?? readString(record.name) ?? readString(record.model)

    if (!id) {
        return null
    }

    const model: AiModelInfo = { id }
    const ownedBy = readString(record.owned_by) ?? readString(record.ownedBy)
    const contextWindow =
        readTokenCount(record.context_window) ??
        readTokenCount(record.contextWindow) ??
        readTokenCount(record.context_length) ??
        readTokenCount(record.contextLength) ??
        readTokenCount(record.max_model_len)
    const topProvider = readRecord(record.top_provider) ?? readRecord(record.topProvider)
    const maxOutputTokens =
        readTokenCount(record.max_output_tokens) ??
        readTokenCount(record.maxOutputTokens) ??
        readTokenCount(record.max_completion_tokens) ??
        readTokenCount(record.maxCompletionTokens) ??
        (topProvider ? readTokenCount(topProvider.max_completion_tokens) : undefined)
    const reasoningLevels = readReasoningLevels(record.reasoning_levels) ?? readReasoningLevels(record.supported_reasoning_levels)

    if (ownedBy) {
        model.ownedBy = ownedBy
    }
    if (contextWindow) {
        model.contextWindow = contextWindow
    }
    if (maxOutputTokens) {
        model.maxOutputTokens = maxOutputTokens
    }
    if (reasoningLevels) {
        model.reasoningLevels = reasoningLevels
    }

    return model
}

/**
 * @description 读取模型支持的推理强度列表，兼容字符串数组与 `{ effort }` 对象数组。
 * @param value 原始字段值
 * @returns 去重后的强度列表；无有效项返回 undefined
 */
function readReasoningLevels(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined
    }

    const levels: string[] = []

    for (const entry of value) {
        const level = typeof entry === "string" ? readString(entry) : readString(readRecord(entry)?.effort)
        if (level && !levels.includes(level)) {
            levels.push(level)
        }
    }

    return levels.length ? levels : undefined
}

/**
 * @description 读取对象字段里的 token 数，兼容 200000 与 "200K" 两种写法。
 * @param value 原始字段值
 * @returns 正整数的 token 数；无法解析返回 undefined
 */
function readTokenCount(value: unknown): number | undefined {
    return parseTokenCount(value) ?? undefined
}

/**
 * @description 把对象字段读成 Record。
 * @param value 原始字段值
 * @returns 对象本体；非对象返回 undefined
 */
function readRecord(value: unknown): ModelEntryRecord | undefined {
    return value && typeof value === "object" ? (value as ModelEntryRecord) : undefined
}

/**
 * @description 读取对象里的非空字符串字段。
 * @param value 原始字段值
 * @returns 去空白后的字符串；非字符串或空串返回 undefined
 */
function readString(value: unknown): string | undefined {
    if (typeof value !== "string" || !value.trim()) {
        return undefined
    }
    return value.trim()
}

/**
 * @description 构造模型列表请求头。
 * @param baseUrl 上游基址
 * @param apiKey 上游密钥
 * @returns 请求头
 */
function buildModelListHeaders(baseUrl: string, apiKey: string): Record<string, string> {
    const key = apiKey.trim()

    if (isAnthropicUpstream(baseUrl)) {
        return {
            Accept: "application/json",
            "anthropic-version": ANTHROPIC_API_VERSION,
            // 浏览器/WebView 直连 Anthropic 必须显式声明，否则会被 CORS 拦截
            "anthropic-dangerous-direct-browser-access": "true",
            ...(key ? { "x-api-key": key } : {}),
        }
    }

    return { Accept: "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }
}

/**
 * @description 从失败响应里提取可读的错误信息。
 * @param response 非 2xx 响应
 * @returns 上游消息或截断的响应正文
 */
async function readErrorDetail(response: Response): Promise<string> {
    const text = await response.text().catch(() => "")

    if (!text) {
        return response.statusText
    }

    try {
        const parsed = JSON.parse(text) as unknown
        const message = extractErrorMessage(parsed)
        if (message) {
            return message
        }
    } catch {
        // 非 JSON 响应按原文截断展示
    }

    return text.slice(0, 200)
}

/**
 * @description 从错误响应体里读取 `error.message` / `message` / `msg`。
 * @param payload 已解析的响应体
 * @returns 错误文案；没有则 undefined
 */
function extractErrorMessage(payload: unknown): string | undefined {
    if (!payload || typeof payload !== "object") {
        return undefined
    }

    const record = payload as ModelEntryRecord
    const error = record.error

    if (error && typeof error === "object") {
        const message = readString((error as ModelEntryRecord).message)
        if (message) {
            return message
        }
    }

    if (typeof error === "string" && error.trim()) {
        return error.trim()
    }

    return readString(record.message) ?? readString(record.msg)
}
