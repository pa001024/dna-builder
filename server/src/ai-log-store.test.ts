import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildClientIdentity, resolveSessionId } from "./ai-log-format"
import {
    appendAiLogRequest,
    createAiCallLogger,
    flushAiLogWrites,
    getAiLogDir,
    listAiLogDays,
    listAiLogSessions,
    normalizeLogDay,
    pruneAiLogs,
    readAiLogRequests,
    readAiLogTurns,
} from "./ai-log-store"

/** 每个用例一个独立日志目录，避免互相污染。 */
let dataDir: string

/** 造一个带会话历史的请求体。 */
function makeMessages(anchor: string, extra: Array<Record<string, unknown>> = []) {
    return [{ role: "system", content: "系统提示" }, { role: "user", content: anchor }, ...extra]
}

/**
 * 用给定的时间点跑一次完整的日志记录，返回会话 id。
 * @param options 时间、会话锚点与结束参数。
 * @returns 本次请求的会话 id 与 requestId。
 */
async function runLogger(options: {
    startedAt: Date
    anchor: string
    ok?: boolean
    status?: number
    error?: { code: string; type: string; message: string; raw: string | null } | null
    usage?: { prompt_tokens: number; completion_tokens: number } | null
    responseContent?: string
    /** 上游追踪 id，缺省给一个固定值便于断言落盘。 */
    upstreamTraceId?: string | null
    /** 上游补全 id，缺省给一个固定值便于断言落盘。 */
    upstreamCompletionId?: string | null
}): Promise<{ sessionId: string; requestId: string }> {
    const messages = makeMessages(options.anchor)
    const sessionId = resolveSessionId({ userId: "u1", messages })
    const requestId = `req-${options.anchor}`

    const logger = createAiCallLogger({
        requestId,
        sessionId,
        startedAt: options.startedAt,
        client: buildClientIdentity({ id: "u1", name: "主人" }, new Headers({ "user-agent": "test-agent", "x-forwarded-for": "1.2.3.4" })),
        model: "deepseek-flash",
        stream: false,
        peak: false,
        temperature: 0.5,
        maxTokensRequested: 4096,
        messages,
        toolNames: ["search"],
        dataDir,
    })

    logger.finish({
        status: options.status ?? 200,
        ok: options.ok ?? true,
        upstreamStatus: 200,
        upstreamTraceId: options.upstreamTraceId === undefined ? "trace-abc" : options.upstreamTraceId,
        upstreamCompletionId: options.upstreamCompletionId === undefined ? "completion-abc" : options.upstreamCompletionId,
        error: options.error ?? null,
        // undefined 表示用默认 usage，null 表示这次上游没返回 usage
        usage: options.usage === undefined ? { prompt_tokens: 10, completion_tokens: 5 } : options.usage,
        maxTokensResolved: 4096,
        // 固定耗时，便于断言 durationMs（真实运行时以流结束时刻收尾）
        finishedAt: new Date(options.startedAt.getTime() + 500),
        assistant: {
            message: { role: "assistant", content: options.responseContent ?? "回答", reasoningContent: null, toolCalls: [] },
            finishReason: "stop",
        },
    })

    await flushAiLogWrites()
    return { sessionId, requestId }
}

beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "ai-log-test-"))
})

afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
})

describe("日志目录与日期校验", () => {
    it("默认日志目录落在 server/data/ai-logs", () => {
        expect(getAiLogDir().replace(/\\/g, "/").endsWith("server/data/ai-logs")).toBe(true)
    })

    it("只接受合法日期", () => {
        expect(normalizeLogDay("2026-09-20")).toBe("2026-09-20")
        expect(normalizeLogDay("2026-02-30")).toBeNull()
        expect(normalizeLogDay("../2026-09-20")).toBeNull()
        expect(normalizeLogDay("2026-9-20")).toBeNull()
    })
})

describe("写入与索引检索", () => {
    it("一次请求落一条索引与一条轮次记录", async () => {
        const { sessionId } = await runLogger({ startedAt: new Date("2026-09-18T10:00:00Z"), anchor: "第一问" })

        const { logs, truncated, scannedDays } = await readAiLogRequests({}, dataDir)
        expect(logs).toHaveLength(1)
        expect(truncated).toBe(false)
        expect(scannedDays).toBe(1)
        expect(logs[0]).toMatchObject({
            requestId: "req-第一问",
            sessionId,
            model: "deepseek-flash",
            ok: true,
            status: 200,
            durationMs: 500,
        })
        // 北京时间的归档日：UTC 10:00 落在北京时间同一天的 18:00
        expect(logs[0].day).toBe("2026-09-18")
        expect(logs[0].stream).toBe(false)
        expect(logs[0].ttftMs).toBeNull()
        expect(logs[0].client).toEqual({ userId: "u1", userName: "主人", ip: "1.2.3.4", userAgent: "test-agent" })
        expect(logs[0].usage).toMatchObject({ prompt: 10, output: 5, total: 15 })
        expect(logs[0].request).toMatchObject({
            messageCount: 2,
            lastUserMessage: "第一问",
            maxTokensRequested: 4096,
            maxTokensResolved: 4096,
            peak: false,
            toolNames: ["search"],
        })
        expect(logs[0].turnRef).toBe(`sessions/${sessionId}/2026-09-18.jsonl`)
        // 上游请求级标识在索引与轮次两处都落盘，用于向 DeepSeek 对账
        expect(logs[0].upstreamTraceId).toBe("trace-abc")
        expect(logs[0].upstreamCompletionId).toBe("completion-abc")

        const { turns } = await readAiLogTurns(sessionId, {}, dataDir)
        expect(turns).toHaveLength(1)
        expect(turns[0].request.messages).toHaveLength(2)
        expect(turns[0].response.message?.content).toBe("回答")
        expect(turns[0].upstreamTraceId).toBe("trace-abc")
        expect(turns[0].upstreamCompletionId).toBe("completion-abc")
    })

    it("没调通上游的请求把两个上游标识都记成 null", async () => {
        const { sessionId } = await runLogger({
            startedAt: new Date("2026-09-18T10:00:00Z"),
            anchor: "被拒",
            ok: false,
            status: 403,
            upstreamTraceId: null,
            upstreamCompletionId: null,
        })

        const { logs } = await readAiLogRequests({}, dataDir)
        expect(logs[0].upstreamTraceId).toBeNull()
        expect(logs[0].upstreamCompletionId).toBeNull()

        const { turns } = await readAiLogTurns(sessionId, {}, dataDir)
        expect(turns[0].upstreamTraceId).toBeNull()
        expect(turns[0].upstreamCompletionId).toBeNull()
    })

    it("按时间段与状态码过滤", async () => {
        await runLogger({ startedAt: new Date("2026-09-17T02:00:00Z"), anchor: "前天", status: 200 })
        await runLogger({ startedAt: new Date("2026-09-18T02:00:00Z"), anchor: "昨天失败", ok: false, status: 502 })
        await runLogger({ startedAt: new Date("2026-09-19T02:00:00Z"), anchor: "今天" })

        const range = await readAiLogRequests({ from: "2026-09-18", to: "2026-09-19" }, dataDir)
        expect(range.logs).toHaveLength(2)
        expect(range.scannedDays).toBe(2)

        const failed = await readAiLogRequests({ ok: false }, dataDir)
        expect(failed.logs).toHaveLength(1)
        expect(failed.logs[0].request.lastUserMessage).toBe("昨天失败")

        const byStatus = await readAiLogRequests({ status: 502 }, dataDir)
        expect(byStatus.logs).toHaveLength(1)

        const bySession = await readAiLogRequests({ sessionId: (await listAiLogSessions(dataDir))[0] }, dataDir)
        expect(bySession.logs.length).toBeGreaterThan(0)
    })

    it("结果按时间倒序且受 limit 约束", async () => {
        await runLogger({ startedAt: new Date("2026-09-18T02:00:00Z"), anchor: "早上" })
        await runLogger({ startedAt: new Date("2026-09-18T06:00:00Z"), anchor: "中午" })
        await runLogger({ startedAt: new Date("2026-09-18T12:00:00Z"), anchor: "晚上" })

        const { logs, truncated } = await readAiLogRequests({ limit: 2 }, dataDir)
        expect(truncated).toBe(true)
        expect(logs.map(entry => entry.request.lastUserMessage)).toEqual(["晚上", "中午"])
    })

    it("跨日期检索时从新到旧扫描，凑满 limit 就停", async () => {
        await runLogger({ startedAt: new Date("2026-09-16T02:00:00Z"), anchor: "16 日" })
        await runLogger({ startedAt: new Date("2026-09-17T02:00:00Z"), anchor: "17 日" })
        await runLogger({ startedAt: new Date("2026-09-18T02:00:00Z"), anchor: "18 日" })

        const { logs, scannedDays } = await readAiLogRequests({ limit: 1 }, dataDir)
        expect(logs.map(entry => entry.request.lastUserMessage)).toEqual(["18 日"])
        // 最新一天就凑满了，更早的两天不会被读进内存
        expect(scannedDays).toBe(1)
    })

    it("同一会话的多轮请求归并到同一个目录，且按时间正序返回", async () => {
        const second = await runLogger({
            startedAt: new Date("2026-09-18T08:00:00Z"),
            anchor: "第一问",
            responseContent: "第一答",
        })
        const third = await runLogger({
            startedAt: new Date("2026-09-18T09:00:00Z"),
            anchor: "第一问",
            responseContent: "第二答",
        })
        expect(third.sessionId).toBe(second.sessionId)

        const { turns, days } = await readAiLogTurns(second.sessionId, {}, dataDir)
        expect(days).toEqual(["2026-09-18"])
        expect(turns.map(turn => turn.response.message?.content)).toEqual(["第一答", "第二答"])
    })

    it("跨日期归档时同一会话落到两个日期文件", async () => {
        await runLogger({ startedAt: new Date("2026-09-18T02:00:00Z"), anchor: "跨天" })
        await runLogger({ startedAt: new Date("2026-09-19T02:00:00Z"), anchor: "跨天" })

        const sessionId = (await listAiLogSessions(dataDir))[0]
        const { days } = await readAiLogTurns(sessionId, {}, dataDir)
        expect(days).toEqual(["2026-09-18", "2026-09-19"])
        expect(await listAiLogDays(dataDir)).toEqual(["2026-09-18", "2026-09-19"])
    })

    it("按日期裁剪轮次范围", async () => {
        await runLogger({ startedAt: new Date("2026-09-18T02:00:00Z"), anchor: "跨天", responseContent: "18 日" })
        await runLogger({ startedAt: new Date("2026-09-19T02:00:00Z"), anchor: "跨天", responseContent: "19 日" })

        const sessionId = (await listAiLogSessions(dataDir))[0]
        const { turns } = await readAiLogTurns(sessionId, { from: "2026-09-19", to: "2026-09-19" }, dataDir)
        expect(turns.map(turn => turn.response.message?.content)).toEqual(["19 日"])
    })
})

describe("错误与超长内容", () => {
    it("重复收尾只落一份记录", async () => {
        const messages = makeMessages("重复收尾")
        const logger = createAiCallLogger({
            requestId: "req-once",
            sessionId: "sess-once",
            startedAt: new Date("2026-09-18T02:00:00Z"),
            client: buildClientIdentity(null, new Headers()),
            model: "deepseek-flash",
            stream: true,
            peak: false,
            temperature: null,
            maxTokensRequested: null,
            messages,
            toolNames: [],
            dataDir,
        })

        logger.finish({ status: 200, ok: true })
        logger.finish({ status: 200, ok: true })
        await flushAiLogWrites()

        const { logs } = await readAiLogRequests({}, dataDir)
        expect(logs).toHaveLength(1)
        const { turns } = await readAiLogTurns("sess-once", {}, dataDir)
        expect(turns).toHaveLength(1)
    })

    it("失败请求同样落盘并带上错误信息", async () => {
        const { sessionId } = await runLogger({
            startedAt: new Date("2026-09-18T02:00:00Z"),
            anchor: "会失败",
            ok: false,
            status: 502,
            usage: null,
            error: { code: "upstream_error", type: "api_error", message: "上游挂了", raw: '{"error":"boom"}' },
        })

        const { logs } = await readAiLogRequests({}, dataDir)
        expect(logs[0].error).toEqual({ code: "upstream_error", type: "api_error", message: "上游挂了", raw: '{"error":"boom"}' })
        expect(logs[0].usage).toBeNull()
        expect(logs[0].costMicros).toBe(0)

        const { turns } = await readAiLogTurns(sessionId, {}, dataDir)
        expect(turns[0].error?.message).toBe("上游挂了")
    })

    it("超长消息按上限截断并打标记（不指定上限时不截断）", async () => {
        const longText = "长".repeat(200)
        const messages = [{ role: "user", content: longText }]
        const logger = createAiCallLogger({
            requestId: "req-long",
            sessionId: "sess-long",
            startedAt: new Date("2026-09-18T02:00:00Z"),
            client: buildClientIdentity(null, new Headers()),
            model: "deepseek-flash",
            stream: false,
            peak: false,
            temperature: null,
            maxTokensRequested: null,
            messages,
            toolNames: [],
            dataDir,
        })
        logger.finish({ status: 200, ok: true, messages })
        await flushAiLogWrites()

        const { turns } = await readAiLogTurns("sess-long", {}, dataDir)
        expect(turns[0].request.truncated).toBe(false)
        expect((turns[0].request.messages[0] as { content: string }).content).toBe(longText)
    })
})

describe("保留期清理", () => {
    it("删除截止日前的日志并清掉空会话目录", async () => {
        await runLogger({ startedAt: new Date("2026-09-15T02:00:00Z"), anchor: "旧会话" })
        await runLogger({ startedAt: new Date("2026-09-19T02:00:00Z"), anchor: "新会话" })

        const removed = await pruneAiLogs("2026-09-18", dataDir)
        // 一个索引文件 + 一个轮次文件
        expect(removed).toBe(2)
        expect(await listAiLogDays(dataDir)).toEqual(["2026-09-19"])
        expect(await listAiLogSessions(dataDir)).toHaveLength(1)

        const left = await readAiLogRequests({}, dataDir)
        expect(left.logs[0].request.lastUserMessage).toBe("新会话")
    })

    it("截止日期非法时直接报错，不做删除", async () => {
        await runLogger({ startedAt: new Date("2026-09-15T02:00:00Z"), anchor: "旧会话" })
        await expect(pruneAiLogs("2026-9-x", dataDir)).rejects.toThrow()
        expect(await listAiLogDays(dataDir)).toEqual(["2026-09-15"])
    })

    it("清理后仍能继续写入（重建目录）", async () => {
        await runLogger({ startedAt: new Date("2026-09-15T02:00:00Z"), anchor: "旧会话" })
        await pruneAiLogs("2026-09-18", dataDir)

        await runLogger({ startedAt: new Date("2026-09-20T02:00:00Z"), anchor: "新会话" })
        expect(await listAiLogDays(dataDir)).toEqual(["2026-09-20"])
        const entries = await readdir(join(dataDir, "index"))
        expect(entries).toEqual(["2026-09-20.jsonl"])
    })
})

describe("开关", () => {
    it("AI_LOG_ENABLED=false 时不落任何记录", async () => {
        const previous = process.env.AI_LOG_ENABLED
        process.env.AI_LOG_ENABLED = "false"
        try {
            await runLogger({ startedAt: new Date("2026-09-18T02:00:00Z"), anchor: "不该被记录" })
            expect(await listAiLogDays(dataDir)).toEqual([])
            expect(await listAiLogSessions(dataDir)).toEqual([])
        } finally {
            process.env.AI_LOG_ENABLED = previous
        }
    })
})

describe("解析容错", () => {
    it("坏行与不存在的文件都被跳过", async () => {
        await appendAiLogRequest(
            {
                requestId: "req-1",
                sessionId: "sess-1",
                upstreamTraceId: null,
                upstreamCompletionId: null,
                time: "2026-09-18T02:00:00.000Z",
                day: "2026-09-18",
                client: { userId: null, userName: null, ip: null, userAgent: null },
                model: "deepseek-flash",
                stream: false,
                status: 200,
                ok: true,
                upstreamStatus: 200,
                durationMs: 12,
                ttftMs: null,
                usage: null,
                costMicros: 0,
                error: null,
                request: {
                    messageCount: 1,
                    roles: { system: 0, user: 1, assistant: 0, tool: 0, other: 0 },
                    lastUserMessage: "hi",
                    temperature: null,
                    maxTokensRequested: null,
                    maxTokensResolved: null,
                    peak: false,
                    toolNames: [],
                },
                turnRef: "sessions/sess-1/2026-09-18.jsonl",
            },
            dataDir
        )
        await flushAiLogWrites()

        // 手工追加一行坏数据，模拟写入被中断
        await Bun.write(
            join(dataDir, "index", "2026-09-18.jsonl"),
            `${await Bun.file(join(dataDir, "index", "2026-09-18.jsonl")).text()}{"broken"\n`
        )

        const { logs, truncated, scannedDays } = await readAiLogRequests({}, dataDir)
        expect(logs).toHaveLength(1)
        expect(truncated).toBe(false)
        expect(scannedDays).toBe(1)
        expect(logs[0].requestId).toBe("req-1")

        expect(await readAiLogTurns("不存在的会话", {}, dataDir)).toEqual({ turns: [], days: [] })
    })
})
