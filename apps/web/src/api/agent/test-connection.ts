/**
 * 自定义模型连通性探测。
 *
 * 设置页「测试连接」按钮的唯一入口：用用户当前填写的基址 / 密钥 / 模型跑一轮
 * 极小请求（无工具、固定 16 tokens 上限），不经过 Agent 主循环、不落库、不污染
 * 任何会话。协议判定复用 `createAgentTransport`（DeepSeek 官方与自家反代走
 * Messages，其余网关走 Chat Completions），各端点的探测口径天然与真实问答一致。
 */

import { createAgentTransport, normalizeAgentUpstreamConfig } from "./config"
import type { AgentProtocol, AgentRoundUsage } from "./wire"

/** 测试连接的入参（直接取自设置页自定义模型区的填写值）。 */
export interface AiTestConnectionParams {
    /** 上游基址 */
    baseUrl: string
    /** 上游 API Key */
    apiKey: string
    /** 模型 id */
    model: string
    /** 单次探测的超时（毫秒）；缺省 30 秒，失败快速返回不让按钮一直转 */
    timeout?: number
}

/** 测试连接的结果。 */
export interface AiTestConnectionResult {
    /** 实际走的线协议 */
    protocol: AgentProtocol
    /** 模型回的正文片段（证明真实跑通了一轮，而不只是端点可达） */
    text: string
    /** 本轮真实 token 用量（上游回传时才有） */
    usage?: AgentRoundUsage
}

/** 探测轮的输出上限：只求跑通，不断言内容质量，越小越省。 */
const TEST_MAX_TOKENS = 16

/**
 * @description 用给定配置跑一轮极小请求验证连通性。
 * @param params 基址 / 密钥 / 模型（允许首尾空白，内部统一 trim）
 * @returns 实际协议与模型回文；基址非法、缺密钥、鉴权失败时抛出
 */
export async function aiTestConnection(params: AiTestConnectionParams): Promise<AiTestConnectionResult> {
    const baseUrl = params.baseUrl.trim()
    const apiKey = params.apiKey.trim()
    const model = params.model.trim()

    if (!baseUrl || !apiKey || !model) {
        throw new Error("请先填写基础URL、API密钥和模型名称")
    }

    const config = normalizeAgentUpstreamConfig({
        api_key: apiKey,
        base_url: baseUrl,
        default_model: model,
        timeout: params.timeout ?? 30_000,
        // 探测只跑一次：重试等来的多半是同样的 4xx，白白让按钮多转几十秒
        max_retries: 0,
    })
    const transport = createAgentTransport(config)

    const result = await transport.runRound({
        model,
        system: "",
        messages: [{ role: "user", text: "just reply ok" }],
        temperature: config.default_temperature,
        maxTokens: TEST_MAX_TOKENS,
        isInterrupted: () => false,
    })

    return { protocol: transport.protocol, text: result.text, usage: result.usage }
}
