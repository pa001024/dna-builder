import { Elysia, t } from "elysia"
import { buildBuildAgentSystemPromptPattern, normalizeBuildAgentSystemPrompt } from "../../src/shared/buildAgentSystemPrompt"

// 验证环境变量
const AI_API_KEY = process.env.AI_API_KEY
const AI_MODEL = process.env.AI_MODEL || "GLM-4.5-Flash"
const AI_BASE_URL = process.env.AI_BASE_URL || "https://open.bigmodel.cn/api/paas/v4/"

type ProxyMessage =
    | {
          role: "system" | "user" | "assistant"
          content: string | unknown[]
          tool_calls?: Array<{
              id?: string
              type?: string
              function?: {
                  name?: string
                  arguments?: string
              }
          }>
      }
    | {
          role: "tool"
          tool_call_id: string
          content: string
      }

type ProxyError = {
    error: {
        message: string
        type: string
        code: string
        param: null
    }
}
const BUILD_AGENT_SYSTEM_PROMPT_PATTERN = buildBuildAgentSystemPromptPattern()

/**
 * 构建统一代理错误对象
 * @param message 错误消息
 * @param type 错误类型
 * @param code 错误代码
 * @returns 代理错误对象
 */
function createProxyError(message: string, type: string, code: string): ProxyError {
    return {
        error: {
            message,
            type,
            code,
            param: null,
        },
    }
}

/**
 * 构建流式错误响应（OpenAI 兼容格式）
 * @param error 错误对象
 * @param status HTTP状态码
 * @returns 流式错误响应
 */
function createStreamErrorResponse(error: ProxyError, status = 200): Response {
    const errorChunk = `data: ${JSON.stringify(error)}\n\ndata: [DONE]\n\n`
    return new Response(errorChunk, {
        status,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    })
}

/**
 * 构建JSON错误响应
 * @param error 错误对象
 * @param status HTTP状态码
 * @returns JSON错误响应
 */
function createJsonErrorResponse(error: ProxyError, status: number): Response {
    return new Response(JSON.stringify(error), {
        status,
        headers: { "Content-Type": "application/json" },
    })
}

/**
 * 提取首个系统提示词文本
 * @param messages 对话消息数组
 * @returns 系统提示词文本，不存在时返回空字符串
 */
function extractSystemPrompt(messages: ProxyMessage[]): string {
    const systemMessage = messages.find(msg => msg.role === "system")
    if (!systemMessage) {
        return ""
    }
    if (typeof systemMessage.content !== "string") {
        return ""
    }
    return systemMessage.content
}

/**
 * 校验系统提示词是否合法（严格模板匹配，仅允许模板变量变化）
 * @param messages 对话消息数组
 * @returns 校验结果及失败原因
 */
function validateSystemPrompt(messages: ProxyMessage[]): { valid: boolean; reason?: string } {
    const systemPrompt = normalizeBuildAgentSystemPrompt(extractSystemPrompt(messages))
    if (!systemPrompt) {
        return { valid: false, reason: "缺少系统提示词" }
    }

    if (!BUILD_AGENT_SYSTEM_PROMPT_PATTERN.test(systemPrompt)) {
        return { valid: false, reason: "系统提示词与预设模板不匹配" }
    }

    return { valid: true }
}

/**
 * 规范化工具调用消息，提升不同模型实现的兼容性
 * 关键处理：
 * - assistant 携带 tool_calls 且 content 为空字符串时，转为 null
 *   部分上游实现仅在 content 为 null 时才会将其识别为函数调用消息
 * @param messages 原始消息数组
 * @returns 规范化后的消息数组
 */
function normalizeMessagesForUpstream(messages: ProxyMessage[]): Array<Record<string, unknown>> {
    return messages.map(message => {
        if (
            message.role === "assistant" &&
            Array.isArray(message.tool_calls) &&
            message.tool_calls.length > 0 &&
            typeof message.content === "string" &&
            message.content.trim() === ""
        ) {
            return {
                ...message,
                content: null,
            }
        }
        return message as Record<string, unknown>
    })
}

if (!AI_API_KEY || AI_API_KEY === "your_zhipu_api_key_here") {
    console.warn("⚠️ AI_API_KEY 未配置或使用默认值，AI功能将不可用")
}

/**
 * AI代理路由
 * 转发前端请求到智谱AI API
 */
export const aiPlugin = () =>
    new Elysia({ prefix: "/api/v1" })
        .post(
            "/chat/completions",
            async ({ body }) => {
                // 验证API Key
                if (!AI_API_KEY || AI_API_KEY === "your_zhipu_api_key_here") {
                    const errorMsg = createProxyError("AI服务未配置，请联系管理员配置API密钥", "configuration_error", "ai_not_configured")

                    // 如果是流式请求，返回流式格式的错误
                    if (body.stream) {
                        return createStreamErrorResponse(errorMsg)
                    }

                    return createJsonErrorResponse(errorMsg, 401) // 非流式请求返回 401
                }

                /**
                 * 校验系统提示词整段模板，防止将代理接口用于无关场景
                 */
                const promptValidation = validateSystemPrompt(body.messages as ProxyMessage[])
                if (!promptValidation.valid) {
                    const errorMsg = createProxyError(
                        `系统提示词校验失败：${promptValidation.reason}。该接口仅用于DNA Builder配装助手场景。`,
                        "validation_error",
                        "system_prompt_validation_failed"
                    )
                    if (body.stream) {
                        return createStreamErrorResponse(errorMsg)
                    }
                    return createJsonErrorResponse(errorMsg, 403)
                }

                try {
                    const normalizedMessages = normalizeMessagesForUpstream(body.messages as ProxyMessage[])

                    // 构建请求到智谱AI
                    const requestBody = {
                        ...body,
                        messages: normalizedMessages,
                        // 覆盖使用配置的默认model
                        model: AI_MODEL,
                    }

                    const response = await fetch(`${AI_BASE_URL}chat/completions`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${AI_API_KEY}`,
                            // 添加Accept头以支持流式响应
                            Accept: body.stream ? "text/event-stream" : "application/json",
                        },
                        body: JSON.stringify(requestBody),
                    })

                    // 如果响应不成功，返回错误信息
                    if (!response.ok) {
                        const errorText = await response.json()
                        console.error("智谱AI API错误:", response.status, errorText)

                        // 流式请求返回流式错误
                        if (body.stream) {
                            const errorMsg = createProxyError(
                                typeof errorText?.error?.message === "string"
                                    ? errorText.error.message
                                    : `上游AI服务错误: ${response.status}`,
                                "api_error",
                                "upstream_error"
                            )
                            return createStreamErrorResponse(errorMsg, response.status)
                        }

                        return new Response(JSON.stringify(errorText), {
                            status: response.status,
                            headers: { "Content-Type": "application/json" },
                        })
                    }

                    // 处理流式响应
                    if (body.stream) {
                        // 返回流式响应
                        return new Response(response.body, {
                            headers: {
                                "Content-Type": "text/event-stream",
                                "Cache-Control": "no-cache",
                                Connection: "keep-alive",
                            },
                        })
                    }

                    // 非流式响应，直接返回JSON
                    const data = await response.json()
                    return data
                } catch (error) {
                    console.error("AI代理错误:", error)
                    const errorMsg = createProxyError(
                        `AI代理请求失败: ${error instanceof Error ? error.message : "未知错误"}`,
                        "proxy_error",
                        "internal_error"
                    )

                    // 流式请求返回流式错误
                    if (body.stream) {
                        return createStreamErrorResponse(errorMsg)
                    }

                    return errorMsg
                }
            },
            {
                body: t.Object({
                    messages: t.Array(
                        t.Union([
                            // system/user/assistant 消息
                            t.Object({
                                role: t.Union([t.Literal("system"), t.Literal("user"), t.Literal("assistant")]),
                                content: t.Union([t.String(), t.Array(t.Any()), t.Null()]),
                                tool_calls: t.Optional(
                                    t.Array(
                                        t.Object({
                                            id: t.Optional(t.String()),
                                            type: t.Optional(t.String()),
                                            function: t.Optional(
                                                t.Object({
                                                    name: t.Optional(t.String()),
                                                    arguments: t.Optional(t.String()),
                                                })
                                            ),
                                        })
                                    )
                                ),
                            }),
                            // tool 消息（工具调用结果）
                            t.Object({
                                role: t.Literal("tool"),
                                tool_call_id: t.String(),
                                content: t.String(),
                            }),
                        ])
                    ),
                    model: t.Optional(t.String()),
                    temperature: t.Optional(t.Number()),
                    max_tokens: t.Optional(t.Number()),
                    stream: t.Optional(t.Boolean()),
                    tools: t.Optional(t.Any()),
                    tool_choice: t.Optional(t.Any()),
                    parallel_tool_calls: t.Optional(t.Boolean()),
                }),
            }
        )
        .get("/models", async () => {
            // 验证API Key
            if (!AI_API_KEY || AI_API_KEY === "your_zhipu_api_key_here") {
                return {
                    error: {
                        message: "AI服务未配置，请联系管理员配置API密钥",
                        type: "configuration_error",
                        code: "ai_not_configured",
                    },
                }
            }

            try {
                const response = await fetch(`${AI_BASE_URL}models`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${AI_API_KEY}`,
                    },
                })

                if (!response.ok) {
                    const errorText = await response.text()
                    console.error("智谱AI API错误:", response.status, errorText)
                    return {
                        error: {
                            message: `获取模型列表失败: ${response.status} ${response.statusText}`,
                            type: "api_error",
                            code: response.status,
                        },
                    }
                }

                const data = await response.json()
                return data
            } catch (error) {
                console.error("获取模型列表错误:", error)
                return {
                    error: {
                        message: `获取模型列表失败: ${error instanceof Error ? error.message : "未知错误"}`,
                        type: "proxy_error",
                        code: "internal_error",
                    },
                }
            }
        })
        .get("/config", async () => {
            // 返回AI配置信息（不包含敏感信息）
            return {
                configured: !!(AI_API_KEY && AI_API_KEY !== "your_zhipu_api_key_here"),
                model: AI_MODEL,
                base_url: AI_BASE_URL,
            }
        })
