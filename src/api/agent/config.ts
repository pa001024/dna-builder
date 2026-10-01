/**
 * Agent 框架的上游连接配置。
 *
 * 资料检索 Agent 与配装 Agent 共用同一套凭证策略：设置页里有用户自己的密钥就用密钥，
 * 没有就回退到服务端反代（`${apiEndpoint}/api/v1`，按登录账号计费，凭证是登录令牌）。
 * 反代地址由 `resolveProxyAgentConfig` 统一给出，两个 Agent 不允许各自拼 URL。
 */

import { createChatTransport } from "./chat-transport"
import { createMessagesTransport } from "./messages-transport"
import type { AgentTransport } from "./wire"
import { resolveAgentProtocol } from "./wire"

/** 单个 Agent 跑起来需要的上游参数（从 `OpenAIConfig` 里裁出与 Agent 相关的部分）。 */
export interface AgentUpstreamConfig {
    /** 上游 API Key；直连时为密钥，走反代时为登录令牌 */
    api_key: string
    /** 上游基址 */
    base_url: string
    /** 整轮超时（毫秒）：Chat 协议与 gated 场景使用 */
    timeout: number
    /** 重试次数 */
    max_retries: number
    /** 模型 id */
    default_model: string
    /** 采样温度 */
    default_temperature: number
    /** 输出 tokens 上限 */
    default_max_tokens: number
}

/**
 * Messages 协议下「两块增量之间」允许的最大间隔（毫秒）。
 *
 * 不能复用 `timeout`：那是整轮超时（默认 30 秒），而思考模型在长上下文下可能数十秒才吐出
 * 第一个 token，按 30 秒判空闲会把正常回答掐断。取值与 DSH 的 `streamIdleTimeoutMs` 对齐。
 */
export const AGENT_MESSAGES_IDLE_TIMEOUT = 300_000

/** 服务端反代使用的模型（服务端也会强制覆盖成同一个，这里只是让请求体看起来一致） */
export const AGENT_PROXY_MODEL = "deepseek-flash"

/** 服务端反代的基址后缀；带这个后缀的基址会走 Messages 协议（见 {@link resolveAgentProtocol}）。 */
export const AGENT_PROXY_BASE_URL_SUFFIX = "/api/v1"

/** 缺省上游参数（设置项缺失时使用）。 */
export const DEFAULT_AGENT_UPSTREAM: Omit<AgentUpstreamConfig, "api_key"> = {
    base_url: "https://open.bigmodel.cn/api/paas/v4/",
    timeout: 60000,
    max_retries: 2,
    default_model: "glm-4.6v-flash",
    default_temperature: 0.4,
    default_max_tokens: 32768,
}

/**
 * @description 用局部覆盖项补齐成一份完整的上游配置。
 * @param config 局部配置（多为设置页直出的 `OpenAIConfig`）
 * @returns 补齐缺省值后的完整配置
 */
export function normalizeAgentUpstreamConfig(config: Partial<AgentUpstreamConfig> = {}): AgentUpstreamConfig {
    return {
        api_key: config.api_key ?? "",
        base_url: config.base_url || DEFAULT_AGENT_UPSTREAM.base_url,
        timeout: config.timeout ?? DEFAULT_AGENT_UPSTREAM.timeout,
        max_retries: config.max_retries ?? DEFAULT_AGENT_UPSTREAM.max_retries,
        default_model: config.default_model || DEFAULT_AGENT_UPSTREAM.default_model,
        default_temperature: config.default_temperature ?? DEFAULT_AGENT_UPSTREAM.default_temperature,
        default_max_tokens: config.default_max_tokens ?? DEFAULT_AGENT_UPSTREAM.default_max_tokens,
    }
}

/**
 * @description 构造服务端反代形态的上游配置。
 *
 * 基址必须带 `/api/v1` 后缀：`resolveAgentProtocol` 靠它把这条端到端路程径判定成 Messages 协议，
 * 反代同时也提供 `/chat/completions`，两者走同一份登录令牌。
 * @param apiEndpoint 服务端接口根地址（如 `https://api.example.com`）
 * @param token 登录令牌，反代据此识别账号并扣额度
 * @param overrides 覆盖项（温度、输出上限等来自设置页的偏好）
 * @returns 反代形态的上游配置
 */
export function buildProxyAgentConfig(
    apiEndpoint: string,
    token: string,
    overrides: Partial<AgentUpstreamConfig> = {}
): AgentUpstreamConfig {
    return normalizeAgentUpstreamConfig({
        api_key: token,
        base_url: `${apiEndpoint.replace(/\/+$/, "")}${AGENT_PROXY_BASE_URL_SUFFIX}`,
        default_model: AGENT_PROXY_MODEL,
        ...overrides,
    })
}

/**
 * @description 按端点能力创建传输实现。
 *
 * 判据是端点能力而不是模型名：DeepSeek 官方与服务端反代都提供 Messages 入口，
 * 只有 OpenAI 兼容入口的网关才退回 Chat Completions。
 * @param config 上游配置
 * @returns 该配置应使用的传输
 */
export function createAgentTransport(config: AgentUpstreamConfig): AgentTransport {
    if (resolveAgentProtocol(config.base_url) === "messages") {
        return createMessagesTransport({
            apiKey: config.api_key,
            baseUrl: config.base_url,
            // Messages 侧的超时口径是「两块增量之间的空闲」，与配置里的整轮超时不同义
            timeout: AGENT_MESSAGES_IDLE_TIMEOUT,
            maxRetries: config.max_retries,
        })
    }

    return createChatTransport({
        apiKey: config.api_key,
        baseUrl: config.base_url,
        timeout: config.timeout,
        maxRetries: config.max_retries,
    })
}
