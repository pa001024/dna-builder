/**
 * Agent 框架的对外出口。
 *
 * 业务侧只需要 import 这里：线协议 / 上游配置 / 传输 / 主循环 / 工具契约构成一个整体，
 * 单独 import 内部文件会把「协议中立层」与「循环层」的边界又拆开。
 */

export { createChatTransport } from "./chat-transport"
export {
    AGENT_MESSAGES_IDLE_TIMEOUT,
    AGENT_PROXY_BASE_URL_SUFFIX,
    AGENT_PROXY_MODEL,
    type AgentUpstreamConfig,
    buildProxyAgentConfig,
    createAgentTransport,
    normalizeAgentUpstreamConfig,
} from "./config"
export type {
    AgentCallbacks,
    AgentHistoryMessage,
    AgentKernelOptions,
    AgentPendingAsk,
    AgentReasoningSegment,
    AgentRunResult,
    AgentToolTrace,
} from "./kernel"
export { AgentKernel } from "./kernel"
export { createMessagesTransport } from "./messages-transport"
export type { AgentTool, AgentToolContext, AgentToolOutput, AgentToolSuspendOutput, AgentToolTextOutput } from "./tool"
export {
    type AgentFinishReason,
    type AgentImageAttachment,
    type AgentProtocol,
    type AgentRoundRequest,
    type AgentRoundResult,
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
