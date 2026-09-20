import { Elysia, t } from "elysia"
import jwt from "jsonwebtoken"
import { normalizeSessionId } from "../ai-log-format"
import {
    getAiLogDir,
    isAiLogEnabled,
    listAiLogDays,
    listAiLogSessions,
    normalizeLogDay,
    pruneAiLogs,
    readAiLogRequests,
    readAiLogTurns,
} from "../ai-log-store"
import { type JWTUser, jwtToken } from "../db/yoga"

/**
 * AI 调用日志的检索接口。
 *
 * 日志含完整对话内容，因此整组接口只对管理员开放：校验登录令牌后要求 `admin` 角色。
 * 检索路径与存储结构一一对应：
 * - `GET /logs`：按时间段 / 会话 / 状态查请求元数据（读索引，不读全文）；
 * - `GET /logs/sessions`：列出有日志的会话；
 * - `GET /logs/sessions/:sessionId`：取某个会话的完整轮次（请求 + 响应全文），用于会话回放；
 * - `DELETE /logs?before=<日期>`：清理指定日期之前的日志。
 */

/**
 * @description 解析请求头里的登录令牌。
 * 与 `ai.ts` 一致支持 `token` 与 `Authorization: Bearer` 两种写法。
 * @param headers 请求头。
 * @returns 登录用户；未登录或令牌无效时返回 null。
 */
function resolveUser(headers: Headers): JWTUser | null {
    const raw = (headers.get("token") || headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "").trim()
    if (!raw) return null
    try {
        return jwt.verify(raw, jwtToken) as JWTUser
    } catch {
        return null
    }
}

/** 统一的失败响应。 */
function fail(set: { status?: number | string }, status: number, error: string) {
    set.status = status
    return { success: false as const, error }
}

/** 把查询参数里的布尔值解析成布尔或 null。 */
function parseBooleanFlag(value: string | undefined): boolean | null {
    if (value === undefined || value === "") return null
    const flag = value.trim().toLowerCase()
    if (flag === "true" || flag === "1") return true
    if (flag === "false" || flag === "0") return false
    return null
}

/**
 * 创建 AI 调用日志检索插件。
 * @param dataDir 日志根目录，缺省取环境配置（测试时可注入临时目录）。
 * @param isAdmin 管理员判定，缺省按 JWT 里的 `admin` 角色。
 * @returns Elysia 插件实例。
 */
export function aiLogPlugin(
    dataDir: string = getAiLogDir(),
    isAdmin: (user: JWTUser) => boolean = user => !!user.roles?.includes("admin")
) {
    return new Elysia({ prefix: "/api/v1/ai/logs" })
        .get(
            "/",
            async ({ query, request, set }) => {
                const user = resolveUser(request.headers)
                if (!user) return fail(set, 401, "请先登录")
                if (!isAdmin(user)) return fail(set, 403, "仅管理员可查看 AI 调用日志")

                const from = query.from ? normalizeLogDay(query.from) : null
                const to = query.to ? normalizeLogDay(query.to) : null
                if (query.from && !from) return fail(set, 400, "from 日期格式无效（应为 YYYY-MM-DD）")
                if (query.to && !to) return fail(set, 400, "to 日期格式无效（应为 YYYY-MM-DD）")
                if (from && to && from > to) return fail(set, 400, "from 不能晚于 to")

                const sessionId = query.sessionId ? normalizeSessionId(query.sessionId) : null
                if (query.sessionId && !sessionId) return fail(set, 400, "sessionId 格式无效")

                const status = query.status === undefined || query.status === "" ? null : Number(query.status)
                if (status !== null && !Number.isInteger(status)) return fail(set, 400, "status 必须是整数状态码")

                const limit = query.limit === undefined || query.limit === "" ? null : Number(query.limit)
                if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) return fail(set, 400, "limit 必须是正整数")

                const { logs, truncated, scannedDays } = await readAiLogRequests(
                    { from, to, sessionId, ok: parseBooleanFlag(query.ok), status, limit },
                    dataDir
                )

                return {
                    success: true as const,
                    /** 是否开启日志记录（关闭时下面的结果必然为空）。 */
                    enabled: isAiLogEnabled(),
                    /** 本次返回条数。 */
                    count: logs.length,
                    /** 结果是否被 limit 截断（还有更早的命中记录未返回）。 */
                    truncated,
                    /** 实际扫描的日期文件数。 */
                    scannedDays,
                    logs,
                }
            },
            {
                query: t.Object({
                    from: t.Optional(t.String()),
                    to: t.Optional(t.String()),
                    sessionId: t.Optional(t.String()),
                    ok: t.Optional(t.String()),
                    status: t.Optional(t.String()),
                    limit: t.Optional(t.String()),
                }),
            }
        )
        .get("/sessions", async ({ request, set }) => {
            const user = resolveUser(request.headers)
            if (!user) return fail(set, 401, "请先登录")
            if (!isAdmin(user)) return fail(set, 403, "仅管理员可查看 AI 调用日志")

            const [sessions, days] = await Promise.all([listAiLogSessions(dataDir), listAiLogDays(dataDir)])
            return { success: true as const, count: sessions.length, sessions, days }
        })
        .get(
            "/sessions/:sessionId",
            async ({ params, query, request, set }) => {
                const user = resolveUser(request.headers)
                if (!user) return fail(set, 401, "请先登录")
                if (!isAdmin(user)) return fail(set, 403, "仅管理员可查看 AI 调用日志")

                const sessionId = normalizeSessionId(params.sessionId)
                if (!sessionId) return fail(set, 400, "sessionId 格式无效")

                const from = query.from ? normalizeLogDay(query.from) : null
                const to = query.to ? normalizeLogDay(query.to) : null
                if (query.from && !from) return fail(set, 400, "from 日期格式无效（应为 YYYY-MM-DD）")
                if (query.to && !to) return fail(set, 400, "to 日期格式无效（应为 YYYY-MM-DD）")

                const { turns, days } = await readAiLogTurns(sessionId, { from, to }, dataDir)
                if (!turns.length) return fail(set, 404, "未找到该会话的日志")

                return {
                    success: true as const,
                    sessionId,
                    /** 该会话涉及到的归档日期。 */
                    days,
                    /** 对话轮次（按时间正序）。 */
                    count: turns.length,
                    turns,
                }
            },
            {
                params: t.Object({ sessionId: t.String() }),
                query: t.Object({ from: t.Optional(t.String()), to: t.Optional(t.String()) }),
            }
        )
        .delete(
            "/",
            async ({ query, request, set }) => {
                const user = resolveUser(request.headers)
                if (!user) return fail(set, 401, "请先登录")
                if (!isAdmin(user)) return fail(set, 403, "仅管理员可清理 AI 调用日志")

                const before = normalizeLogDay(query.before)
                if (!before) return fail(set, 400, "before 日期格式无效（应为 YYYY-MM-DD）")

                try {
                    const removed = await pruneAiLogs(before, dataDir)
                    return { success: true as const, before, removed }
                } catch (error) {
                    return fail(set, 500, error instanceof Error ? error.message : "清理失败")
                }
            },
            { query: t.Object({ before: t.String() }) }
        )
        .get("/stats", async ({ request, set }) => {
            const user = resolveUser(request.headers)
            if (!user) return fail(set, 401, "请先登录")
            if (!isAdmin(user)) return fail(set, 403, "仅管理员可查看 AI 调用日志")

            const days = await listAiLogDays(dataDir)
            return {
                success: true as const,
                enabled: isAiLogEnabled(),
                dir: dataDir,
                days,
                /** 日志覆盖的起始 / 结束日期。 */
                firstDay: days[0] ?? null,
                lastDay: days.at(-1) ?? null,
                sessionCount: (await listAiLogSessions(dataDir)).length,
            }
        })
}
