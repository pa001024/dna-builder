import type { ChatImage } from "@/utils/chat-image"

/** 通用对话流文案的命名空间：两个 Agent 的提示类文案默认继承这一套 */
export const AGENT_CHAT_FALLBACK_PREFIX = "dbAgent.ui"

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
    createdAt: number
    renderedContent?: string
    renderedContentSource?: string
}
