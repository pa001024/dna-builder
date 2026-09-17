import { Elysia, t } from "elysia"
import jwt from "jsonwebtoken"
import { chargeUsage, readDailyQuota } from "./ai-billing"
import {
    beijingDayKey,
    DAILY_LIMIT_MICROS,
    formatYuan,
    isPeakPricing,
    MICROS_PER_YUAN,
    MIN_REQUEST_MICROS,
    PRICE_PER_MILLION_TOKENS,
    pipeWithUsage,
    resolveMaxTokens,
} from "./ai-pricing"
import { type JWTUser, jwtToken } from "./db/yoga"

/**
 * AI 中转路由。
 *
 * 与旧实现的区别：
 * - 不再校验「固定系统提示词模板」：该接口现在按调用方自己的提示词转发（但仍然是同一把上游 Key），
 *   只做登录与计费，不再限制只能用于配装助手场景；
 * - 改为登录账号计费：每次请求必须带登录令牌，按上游返回的真实 tokens 记费；
 * - 每人每天有额度上限，额度按北京时间的自然日重置，峰谷单价见 `ai-billing.ts`；
 * - 上游模型固定为 DeepSeek 的 deepseek-flash，计费口径与 DeepSeek 官方价目表对齐。
 */

/** 上游 API Key。 */
const AI_API_KEY = process.env.AI_API_KEY
/** 上游模型：DeepSeek V4.1 Flash。 */
const AI_MODEL = process.env.AI_MODEL || "deepseek-flash"
/** 上游 OpenAI 兼容 base_url（需以 / 结尾，拼接后为 `${base}chat/completions`）。 */
const AI_BASE_URL = process.env.AI_BASE_URL || "https://api.deepseek.com/"

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
 * @description 规范化工具调用消息，提升不同模型实现的兼容性。
 * 关键处理：assistant 携带 tool_calls 且 content 为空字符串时转为 null，
 * 部分上游实现仅在 content 为 null 时才会将其识别为函数调用消息。
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

/**
 * @description 判断上游 API Key 是否已配置（未配置或仍是 .env.example 里的 your_* 占位值时视为不可用）。
 * @returns 是否已配置
 */
function isApiKeyConfigured(): boolean {
    const key = AI_API_KEY?.trim()
    return !!key && !key.startsWith("your_")
}

/**
 * @description 从请求头解析登录用户。
 * 支持两种写法：`token: <jwt>`（与 GraphQL、MOD 接口一致）与 `Authorization: Bearer <jwt>`（OpenAI SDK 默认走这个头）。
 * @param headers 请求头集合
 * @returns 解析出的用户信息；未登录或令牌无效时返回 null
 */
function resolveUser(headers: Record<string, string | undefined>): JWTUser | null {
    const raw = (headers.token || headers.authorization?.replace(/^Bearer\s+/i, "") || "").trim()
    if (!raw) return null
    try {
        return jwt.verify(raw, jwtToken) as JWTUser
    } catch {
        return null
    }
}

if (!isApiKeyConfigured()) {
    console.warn("⚠️ AI_API_KEY 未配置或使用默认值，AI 代理功能将不可用")
}

/**
 * AI代理路由
 * 转发前端请求到 DeepSeek OpenAI 兼容接口，按登录账号计费
 */
export const aiPlugin = () =>
    new Elysia({ prefix: "/api/v1" })
        .post(
            "/chat/completions",
            async ({ body, headers }) => {
                const stream = !!body.stream

                // 验证API Key
                if (!isApiKeyConfigured()) {
                    const errorMsg = createProxyError("AI服务未配置，请联系管理员配置API密钥", "configuration_error", "ai_not_configured")
                    return stream ? createStreamErrorResponse(errorMsg) : createJsonErrorResponse(errorMsg, 401)
                }

                // 验证登录：该接口按登录账号计费，未登录不转发
                const user = resolveUser(headers)
                if (!user) {
                    const errorMsg = createProxyError(
                        "请先登录后再使用 AI 助手，该接口按登录账号计费",
                        "authentication_error",
                        "login_required"
                    )
                    return createJsonErrorResponse(errorMsg, 403)
                }

                // 校验当日额度。查库与落库都放进 try：即使额度表迁移没跑，也只是返回可读的代理错误而不是 500
                const requestedAt = new Date()
                const peak = isPeakPricing(requestedAt)
                const day = beijingDayKey(requestedAt)

                try {
                    const quota = await readDailyQuota(user.id, day)
                    if (quota.remainingMicros < MIN_REQUEST_MICROS) {
                        const errorMsg = createProxyError(
                            `今日 AI 额度已用完（每人每天 ${formatYuan(DAILY_LIMIT_MICROS)} 元，北京时间自然日重置），请明天再试`,
                            "insufficient_quota",
                            "daily_quota_exceeded"
                        )
                        return createJsonErrorResponse(errorMsg, 402)
                    }

                    const maxTokens = resolveMaxTokens(body.max_tokens, quota.remainingMicros, peak)
                    if (typeof body.max_tokens === "number" && maxTokens < Math.floor(body.max_tokens)) {
                        console.warn(
                            `[ai] 用户 ${user.id} 剩余额度 ${formatYuan(quota.remainingMicros)} 元，max_tokens 由 ${body.max_tokens} 收紧为 ${maxTokens}`
                        )
                    }

                    const normalizedMessages = normalizeMessagesForUpstream(body.messages as ProxyMessage[])

                    // 构建请求到上游：模型固定，流式响应显式要求带上 usage（否则无法计费）
                    const requestBody: Record<string, unknown> = {
                        ...body,
                        messages: normalizedMessages,
                        model: AI_MODEL,
                        max_tokens: maxTokens,
                    }
                    if (stream) {
                        requestBody.stream_options = {
                            ...((body.stream_options as Record<string, unknown> | undefined) ?? {}),
                            include_usage: true,
                        }
                    }

                    const response = await fetch(`${AI_BASE_URL}chat/completions`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${AI_API_KEY}`,
                            // 添加Accept头以支持流式响应
                            Accept: stream ? "text/event-stream" : "application/json",
                        },
                        body: JSON.stringify(requestBody),
                    })

                    // 如果响应不成功，返回错误信息
                    if (!response.ok) {
                        const errorText = await response.json()
                        console.error("DeepSeek API错误:", response.status, errorText)

                        // 流式请求返回流式错误
                        if (stream) {
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

                    // 处理流式响应：原样透传，同时旁路解析 usage 记账
                    if (stream) {
                        if (!response.body) {
                            const errorMsg = createProxyError("上游未返回响应体", "api_error", "upstream_empty_body")
                            return createStreamErrorResponse(errorMsg)
                        }

                        return new Response(
                            pipeWithUsage(response.body, usage => void chargeUsage(user.id, day, peak, usage)),
                            {
                                headers: {
                                    "Content-Type": "text/event-stream",
                                    "Cache-Control": "no-cache",
                                    Connection: "keep-alive",
                                },
                            }
                        )
                    }

                    // 非流式响应：直接用响应里的 usage 记账，再把原始结果返回
                    const data = await response.json()
                    await chargeUsage(user.id, day, peak, data?.usage)
                    return data
                } catch (error) {
                    console.error("AI代理错误:", error)
                    const errorMsg = createProxyError(
                        `AI代理请求失败: ${error instanceof Error ? error.message : "未知错误"}`,
                        "proxy_error",
                        "internal_error"
                    )

                    // 流式请求返回流式错误
                    if (stream) {
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
                    stream_options: t.Optional(t.Any()),
                    tools: t.Optional(t.Any()),
                    tool_choice: t.Optional(t.Any()),
                    parallel_tool_calls: t.Optional(t.Boolean()),
                }),
            }
        )
        .get("/models", async () => {
            // 验证API Key
            if (!isApiKeyConfigured()) {
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
                    console.error("DeepSeek API错误:", response.status, errorText)
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
                configured: isApiKeyConfigured(),
                model: AI_MODEL,
                base_url: AI_BASE_URL,
                /** 每个账号每天的额度上限（元）。 */
                daily_limit_yuan: DAILY_LIMIT_MICROS / MICROS_PER_YUAN,
            }
        })
        .get("/usage", async ({ headers }) => {
            // 查询当前登录账号在北京当日的额度使用情况
            const user = resolveUser(headers)
            if (!user) {
                return createJsonErrorResponse(createProxyError("请先登录后再查询 AI 额度", "authentication_error", "login_required"), 403)
            }

            const now = new Date()
            const day = beijingDayKey(now)
            const quota = await readDailyQuota(user.id, day)

            return {
                /** 额度所属的北京自然日。 */
                day,
                model: AI_MODEL,
                /** 当前是否处于高峰计费时段。 */
                peak: isPeakPricing(now),
                /** 每日额度（元）。 */
                limit_yuan: DAILY_LIMIT_MICROS / MICROS_PER_YUAN,
                /** 已用额度（元，保留 4 位小数）。 */
                used_yuan: Number((quota.usedMicros / MICROS_PER_YUAN).toFixed(4)),
                /** 剩余额度（元，保留 4 位小数）。 */
                remaining_yuan: Number((quota.remainingMicros / MICROS_PER_YUAN).toFixed(4)),
                /** 已用额度（微元，1 元 = 1_000_000 微元，精确值）。 */
                used_micros: quota.usedMicros,
                /** 剩余额度（微元，精确值）。 */
                remaining_micros: quota.remainingMicros,
                /** 当日已记账的请求次数。 */
                requests: quota.requests,
                /** 计费单价（元 / 百万 tokens），空闲与高峰两档。 */
                pricing_per_million_tokens: PRICE_PER_MILLION_TOKENS,
            }
        })
