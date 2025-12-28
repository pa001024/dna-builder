import { Elysia, t } from "elysia"

// 验证环境变量
const AI_API_KEY = process.env.AI_API_KEY
const AI_MODEL = process.env.AI_MODEL || "GLM-4.5-Flash"
const AI_BASE_URL = process.env.AI_BASE_URL || "https://open.bigmodel.cn/api/paas/v4/"

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
            async ({ body, request }) => {
                // 验证API Key
                if (!AI_API_KEY || AI_API_KEY === "your_zhipu_api_key_here") {
                    const errorMsg = {
                        error: {
                            message: "AI服务未配置，请联系管理员配置API密钥",
                            type: "configuration_error",
                            code: "ai_not_configured",
                            param: null,
                        },
                    }

                    // 如果是流式请求，返回流式格式的错误
                    if (body.stream) {
                        // OpenAI 流式错误格式：发送 [DONE] 前先发送错误块
                        const errorChunk = `data: ${JSON.stringify(errorMsg)}\n\ndata: [DONE]\n\n`
                        return new Response(errorChunk, {
                            status: 200, // OpenAI SDK 期望 200，错误信息在流中
                            headers: {
                                "Content-Type": "text/event-stream",
                                "Cache-Control": "no-cache",
                                Connection: "keep-alive",
                            },
                        })
                    }

                    return new Response(JSON.stringify(errorMsg), {
                        status: 401, // 非流式请求返回 401
                        headers: { "Content-Type": "application/json" },
                    })
                }

                try {
                    // 构建请求到智谱AI
                    const requestBody = {
                        ...body,
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
                            const errorChunk = `data: ${JSON.stringify(errorText)}\n\ndata: [DONE]\n\n`
                            return new Response(errorChunk, {
                                status: response.status,
                                headers: {
                                    "Content-Type": "text/event-stream",
                                    "Cache-Control": "no-cache",
                                    Connection: "keep-alive",
                                },
                            })
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
                    const errorMsg = {
                        error: {
                            message: `AI代理请求失败: ${error instanceof Error ? error.message : "未知错误"}`,
                            type: "proxy_error",
                            code: "internal_error",
                        },
                    }

                    // 流式请求返回流式错误
                    if (body.stream) {
                        const errorChunk = `data: ${JSON.stringify(errorMsg)}\n\n`
                        return new Response(errorChunk, {
                            headers: {
                                "Content-Type": "text/event-stream",
                                "Cache-Control": "no-cache",
                                Connection: "keep-alive",
                            },
                        })
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
                                content: t.Union([t.String(), t.Array(t.Any())]),
                            }),
                            // tool 消息（工具调用结果）
                            t.Object({
                                role: t.Literal("tool"),
                                tool_call_id: t.String(),
                                content: t.String(),
                            }),
                        ]),
                    ),
                    model: t.Optional(t.String()),
                    temperature: t.Optional(t.Number()),
                    max_tokens: t.Optional(t.Number()),
                    stream: t.Optional(t.Boolean()),
                    tools: t.Optional(t.Any()),
                    tool_choice: t.Optional(t.Any()),
                }),
            },
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
