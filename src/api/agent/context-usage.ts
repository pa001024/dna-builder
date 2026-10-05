/**
 * Agent 上下文用量的本地估算层。
 *
 * 客户端拿不到分词器，这里用「CJK 字符 ×2 + 其它字符」除以固定除数的方式估算 tokens，
 * 与 ZCode（`zcode.estimateTokens.v1`）的口径一致。估算只服务于两件事：
 * 上下文容量面板的分类占比，与压缩阈值的前置判定；真实用量以请求回传的 usage 为准。
 */

import type { AgentToolDefinition, AgentWireMessage } from "./wire"

/** 估算除数：平均每个 token 对应的字符数（英文约 4，这里取偏保守的 3） */
const ESTIMATED_TOKEN_CHAR_DIVISOR = 3

/** CJK 字符的权重：中日韩字符的信息密度约为拉丁字符的两倍 */
const CJK_TOKEN_CHAR_WEIGHT = 2

/**
 * 单张内联图片的估算 tokens。
 *
 * 图片按 Base64 计字符会严重高估（视觉模型按图块计费，与字节量关系不大），
 * 这里取一个常见截图分辨率下的经验值。
 */
const ESTIMATED_IMAGE_TOKENS = 1500

/** 匹配不到任何规则时的兜底上下文窗口（约 128K） */
export const DEFAULT_MODEL_CONTEXT_WINDOW = 131_072

/**
 * 模型名 → 上下文窗口的启发式表（首次命中生效）。
 *
 * 取值对齐 ZCode 内置模型表：glm-4.6v-flash / glm-4.5 系为 128K，
 * glm-4.6 / 4.7 / 5 系为 200K，glm-5.3 与 deepseek v4 系为 1M；
 * 表只是估算口径，模型迭代后以此为准的数字可能滞后。
 */
const MODEL_CONTEXT_WINDOW_RULES: ReadonlyArray<readonly [RegExp, number]> = [
    [/glm-5\.3/, 1_000_000],
    [/glm-5|glm-4\.7|glm-4\.6(?!v)/, 200_000],
    [/glm-4\.\dv|glm/, 131_072],
    [/deepseek-v4|deepseek-flash/, 1_000_000],
    [/deepseek/, 131_072],
    [/claude/, 200_000],
    [/gpt-5|gpt-4\.1/, 400_000],
    [/gpt/, 131_072],
    [/qwen/, 131_072],
]

/**
 * @description 按模型名解析上下文窗口（tokens）。
 * @param model 模型 id（大小写不敏感）
 * @returns 上下文窗口大小；匹配不到时返回兜底值
 */
export function resolveModelContextWindow(model: string): number {
    const id = model.toLowerCase()

    for (const [pattern, window] of MODEL_CONTEXT_WINDOW_RULES) {
        if (pattern.test(id)) {
            return window
        }
    }

    return DEFAULT_MODEL_CONTEXT_WINDOW
}

/**
 * @description 估算一段文本的 tokens：CJK 字符按 2 倍权重、其余按 1 倍，除以固定除数后向上取整。
 * @param text 待估算文本
 * @returns 估算 tokens（至少为 0）
 */
export function estimateTextTokens(text: string): number {
    if (!text) {
        return 0
    }

    const cjkChars = (text.match(/[一-鿿]/g) ?? []).length
    const otherChars = text.length - cjkChars

    return Math.ceil((cjkChars * CJK_TOKEN_CHAR_WEIGHT + otherChars) / ESTIMATED_TOKEN_CHAR_DIVISOR)
}

/**
 * @description 估算一个可序列化值的 tokens（按 JSON 文本计）。
 * @param value 任意可序列化值
 * @returns 估算 tokens
 */
export function estimateJsonTokens(value: unknown): number {
    return estimateTextTokens(JSON.stringify(value ?? "") ?? "")
}

/**
 * @description 估算一条协议中立消息的 tokens。
 *
 * 消息按「字段结构序列化后计字符」，工具结果原文完整参与估算（回灌时确实逐字重传）；
 * 图片不按 Base64 计，改用单张经验值（见 {@link ESTIMATED_IMAGE_TOKENS}）。
 * @param message 协议中立的对话消息
 * @returns 估算 tokens
 */
export function estimateMessageTokens(message: AgentWireMessage): number {
    if (message.role === "assistant") {
        return estimateJsonTokens({ role: "assistant", text: message.text, thinking: message.thinking, toolCalls: message.toolCalls })
    }

    const imageTokens = (message.images?.length ?? 0) * ESTIMATED_IMAGE_TOKENS

    return estimateJsonTokens({ role: "user", text: message.text, toolResults: message.toolResults ?? [] }) + imageTokens
}

/**
 * @description 估算一组消息的 tokens。
 * @param messages 协议中立的对话消息
 * @returns 估算 tokens
 */
export function estimateMessagesTokens(messages: readonly AgentWireMessage[]): number {
    let total = 0

    for (const message of messages) {
        total += estimateMessageTokens(message)
    }

    return total
}

/**
 * @description 估算工具声明的 tokens（每条工具按定义 JSON 计）。
 * @param tools 工具定义列表
 * @returns 估算 tokens
 */
export function estimateToolTokens(tools: readonly AgentToolDefinition[]): number {
    let total = 0

    for (const tool of tools) {
        total += estimateJsonTokens(tool)
    }

    return total
}

/** 一次上下文估算的分类结果（tokens） */
export interface AgentContextEstimateCategories {
    /** 对话消息（含工具结果与图片的折算） */
    messages: number
    /** 工具声明（JSON Schema） */
    systemTools: number
    /** 系统提示词 */
    systemPrompt: number
}

/** 一次上下文估算的完整结果 */
export interface AgentContextEstimate {
    /** 总量（各分类之和） */
    total: number
    /** 分类明细 */
    categories: AgentContextEstimateCategories
}

/**
 * @description 对一次请求的完整上下文做分类估算。
 * @param params 系统提示词、工具定义与消息序列
 * @returns 分类估算结果
 */
export function buildContextEstimate(params: {
    system: string
    tools: readonly AgentToolDefinition[]
    messages: readonly AgentWireMessage[]
}): AgentContextEstimate {
    const systemPrompt = estimateTextTokens(params.system)
    const systemTools = estimateToolTokens(params.tools)
    const messages = estimateMessagesTokens(params.messages)

    return { total: systemPrompt + systemTools + messages, categories: { messages, systemTools, systemPrompt } }
}
