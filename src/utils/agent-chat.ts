import i18next from "i18next"
import type { ChatImage } from "@/utils/chat-image"

/** 通用对话流文案的命名空间：两个 Agent 的提示类文案默认继承这一套 */
export const AGENT_CHAT_FALLBACK_PREFIX = "dbAgent.ui"

/**
 * @description 解析 Agent 共用文案：i18next 已初始化时走翻译表，未初始化（单测等环境）退回兜底文案。
 *
 * i18next 未初始化时 `t()` 直接返回 undefined（连 defaultValue 都不生效），
 * 因此这里统一兜底，避免调用方把 undefined 当文案用。
 * @param key 文案键
 * @param fallback 兜底文案（中文）
 * @returns 解析后的文案
 */
export function agentI18nText(key: string, fallback: string): string {
    return i18next.t(key, { defaultValue: fallback }) || fallback
}

/**
 * @description 取 Agent 工具的界面展示名。
 *
 * 资料检索与配装助手共用一套键约定：登记工具的展示名统一放 `dbAgent.tool.*`，
 * 未登记的工具直接展示原始名。
 * @param name 工具名（模型可见的英文 id）
 * @returns 界面展示名
 */
export function agentToolLabel(name: string): string {
    return agentI18nText(`dbAgent.tool.${name}`, name)
}

/**
 * 拼出当前 Agent 的文案键；本命名空间没有该键时回退到通用命名空间。
 *
 * 思考 / 工具用量 / 过程耗时 / 复制提示这类文案在资料库与配装助手上完全一致，
 * 逐个复制会形成两份需要同步维护的翻译，因此只在措辞确实不同的地方另行声明，
 * 其余继承通用命名空间。
 * @param prefix 当前 Agent 的文案命名空间
 * @param key 命名空间内的键名
 * @param t 当前语言的翻译函数
 * @returns 可交给翻译函数解析的完整文案键
 */
export function scopedI18nKey(prefix: string, key: string, t: (key: string, options?: Record<string, unknown>) => string): string {
    if (prefix === AGENT_CHAT_FALLBACK_PREFIX) {
        return `${AGENT_CHAT_FALLBACK_PREFIX}.${key}`
    }

    const scoped = `${prefix}.${key}`

    return t(scoped, { defaultValue: "" }) ? scoped : `${AGENT_CHAT_FALLBACK_PREFIX}.${key}`
}

/** Agent 单次工具调用记录（与内核 AgentToolTrace 结构一致） */
export interface AgentChatToolTrace {
    id: string
    name: string
    label: string
    args: Record<string, unknown>
    summary: string
    status: "running" | "done" | "error"
    /** 工具结果原文（仅后台日志回放会填，前端实时对话只落摘要） */
    result?: string
}

/** Agent 回复中的一段思考，附带该段之后发起的工具调用 id */
export interface AgentChatReasoning {
    text: string
    toolCallIds: string[]
}

/** 挂起中的一次提问（AskUserRequest 的结构化副本） */
export interface AgentChatPendingAsk {
    id: string
    title?: string
    questions: Array<{
        id: string
        header: string
        question?: string
        options: Array<{ id: string; label: string; description?: string }>
        allowCustom: boolean
        multiple: boolean
    }>
}

/** 单条回复的真实 token 用量（与 store/db 的 MessageTokenUsage 结构一致） */
export interface AgentChatTokenUsage {
    /** 末次请求的输入 tokens（含缓存命中） */
    input: number
    /** 本轮累计输出 tokens */
    output: number
    /** 末次请求命中缓存的输入 tokens */
    cacheRead?: number
}

/**
 * 对话流渲染所需的最小消息结构。
 *
 * 只声明渲染层真正读取的字段，资料库与配装助手两边的持久化记录都按此渲染。
 */
export interface AgentChatMessage {
    id: number
    role: "user" | "assistant" | "system"
    content: string
    images?: ChatImage[]
    toolTraces?: AgentChatToolTrace[]
    reasonings?: AgentChatReasoning[]
    processMs?: number
    pendingAsk?: AgentChatPendingAsk
    /** 该条回复的真实 token 用量（上游回传时落库；渲染成消息下方的统计小字） */
    tokenUsage?: AgentChatTokenUsage
    /** 上下文压缩边界（仅 system 角色消息携带；渲染成一条分隔线） */
    compaction?: unknown
    /**
     * 附在消息下方的小字元信息（后台日志回放用）。
     * 前端实时对话不填，渲染层据此决定是否多渲染一行 token 数 / 费用等。
     */
    metaNote?: string
    createdAt: number
    renderedContent?: string
    renderedContentSource?: string
}

/**
 * 找到消息列表中最后一条压缩边界消息（system 角色、带 compaction 标记）的下标。
 *
 * 构建请求历史时边界之前的内容已并入边界摘要，全部丢弃；多次压缩后取最后一条
 * 边界即可，更早的边界自然落在丢弃区间里。
 * @param messages 消息列表
 * @returns 边界下标；没有边界时 -1
 */
export function lastCompactionIndex(messages: ReadonlyArray<{ role: string; compaction?: unknown }>): number {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index]

        if (message.role === "system" && message.compaction) {
            return index
        }
    }

    return -1
}
