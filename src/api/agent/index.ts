/**
 * Agent 框架的对外出口。
 *
 * 业务侧只需要 import 这里：线协议 / 上游配置 / 传输 / 主循环 / 工具契约构成一个整体，
 * 单独 import 内部文件会把「协议中立层」与「循环层」的边界又拆开。
 */

export { createChatTransport } from "./chat-transport"
export {
    type AgentCompactionOutcome,
    AUTOCOMPACT_BUFFER_TOKENS,
    AUTOCOMPACT_OUTPUT_RESERVE_TOKENS,
    buildCompactedMessageText,
    COMPACT_SUMMARY_MAX_OUTPUT_TOKENS,
    compactWireMessages,
    formatCompactSummary,
    groupRoundStartIndexes,
    MIN_ROUNDS_FOR_COMPACT,
    resolveAutoCompactThreshold,
} from "./compact"
export {
    AGENT_MESSAGES_IDLE_TIMEOUT,
    AGENT_PROXY_BASE_URL_SUFFIX,
    AGENT_PROXY_MODEL,
    type AgentUpstreamConfig,
    buildProxyAgentConfig,
    createAgentTransport,
    normalizeAgentUpstreamConfig,
} from "./config"
export {
    type AgentContextEstimate,
    buildContextEstimate,
    DEFAULT_MODEL_CONTEXT_WINDOW,
    estimateJsonTokens,
    estimateMessagesTokens,
    estimateMessageTokens,
    estimateTextTokens,
    estimateToolTokens,
    resolveModelContextWindow,
} from "./context-usage"
export type {
    AgentCallbacks,
    AgentContextInfo,
    AgentHistoryMessage,
    AgentKernelOptions,
    AgentPendingAsk,
    AgentReasoningSegment,
    AgentRunResult,
    AgentToolTrace,
} from "./kernel"
export { AgentKernel, toWireMessages } from "./kernel"
export { createMessagesTransport } from "./messages-transport"
export { ensureAgentSkillsReady, getAgentSkillRegistry } from "./skills/registry"
export type { AgentTool, AgentToolContext, AgentToolOutput, AgentToolSuspendOutput, AgentToolTextOutput } from "./tool"
export { createSkillTools } from "./tools/skill-files"
export {
    type AgentFinishReason,
    type AgentImageAttachment,
    type AgentProtocol,
    type AgentRoundRequest,
    type AgentRoundResult,
    type AgentRoundUsage,
    type AgentStreamHandlers,
    type AgentToolCall,
    type AgentToolDefinition,
    type AgentToolResult,
    type AgentTransport,
    type AgentTransportOptions,
    type AgentWireMessage,
    parseToolArguments,
    resolveAgentProtocol,
    resolveChatEndpoint,
    resolveMessagesEndpoint,
} from "./wire"
