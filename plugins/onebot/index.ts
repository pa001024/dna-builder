import type { ActionDef, ActionResult } from "@dob/host"

export interface TemplateEvent {
    label?: string
    data?: Record<string, unknown>
}

export function renderTemplate(template: string, event: TemplateEvent): string {
    return template.replace(/\{\{\s*([A-Za-z0-9_$.]+)\s*\}\}/g, (_match, expr: string) => {
        if (expr === "label") return event.label ?? ""
        if (expr === "data") return JSON.stringify(event.data ?? {})
        if (expr.startsWith("data.")) {
            let cur: unknown = event.data
            for (const part of expr.slice(5).split(".")) {
                if (typeof cur !== "object" || cur === null) return ""
                cur = (cur as Record<string, unknown>)[part]
            }
            if (cur === undefined || cur === null) return ""
            return typeof cur === "string" ? cur : JSON.stringify(cur)
        }
        return ""
    })
}

export const REQUEST_TIMEOUT_MS = 8000

export function withTimeout(signal: AbortSignal, ms = REQUEST_TIMEOUT_MS): AbortSignal {
    const statics = AbortSignal as unknown as {
        any?: (signals: AbortSignal[]) => AbortSignal
        timeout?: (ms: number) => AbortSignal
    }
    if (typeof statics.any === "function" && typeof statics.timeout === "function") {
        return statics.any([signal, statics.timeout(ms)])
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ms)
    const unref = (timer as unknown as { unref?: () => unknown }).unref
    if (typeof unref === "function") unref.call(timer)
    if (signal.aborted) ctrl.abort()
    else signal.addEventListener("abort", () => ctrl.abort(), { once: true })
    return ctrl.signal
}

export function failureMessage(error: unknown, signal: AbortSignal): string {
    const name = error instanceof Error ? error.name : (error as { name?: string } | null)?.name
    if (signal.aborted || name === "AbortError") return signal.aborted ? "request aborted" : "request timed out"
    if (error instanceof Error) return error.message ? `request failed: ${error.message}` : "request failed"
    return "request failed"
}

function readStr(config: Record<string, unknown>, key: string, fallback: string): string {
    const value = config[key]
    if (value === undefined || value === null) return fallback
    if (typeof value === "string") return value === "" ? fallback : value
    return String(value)
}

export function stripTrailingSlash(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/, "")
}

export function coerceTargetId(raw: string): number | string {
    const trimmed = raw.trim()
    return /^-?\d+$/.test(trimmed) ? Number(trimmed) : trimmed
}

export interface OneBotSendPayload {
    message_type: string
    user_id?: number | string
    group_id?: number | string
    message: string
}

/**
 * OneBot 实现失败时仍返回 HTTP 200（靠 retcode/status 区分），
 * go-cqhttp/Lagrange 等都如此；只看 status 码会把失败报成成功。
 */
export function checkOneBotResult(body: unknown): ActionResult {
    if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: true }
    const record = body as Record<string, unknown>
    const retcode = record.retcode
    if (typeof retcode === "number" && retcode !== 0) {
        return { ok: false, message: `onebot send failed with retcode ${retcode}` }
    }
    if (typeof record.status === "string" && record.status !== "ok") {
        return { ok: false, message: `onebot send failed with status ${record.status}` }
    }
    return { ok: true }
}

export function buildSendPayload(targetType: string, targetId: string, message: string): OneBotSendPayload {
    const kind = targetType.trim().toLowerCase() || "group"
    const id = coerceTargetId(targetId)
    if (kind === "group") return { message_type: "group", group_id: id, message }
    if (kind === "private" || kind === "user" || kind === "friend") {
        return { message_type: "private", user_id: id, message }
    }
    throw new Error(`unsupported targetType: ${targetType.trim() || "(blank)"} (expected group or private)`)
}

const def: ActionDef = {
    id: "onebot.send",
    title: "发送消息",
    fields: [
        {
            key: "baseUrl",
            label: "服务地址",
            type: "text",
            def: "http://127.0.0.1:5700",
        },
        {
            key: "token",
            label: "Token",
            type: "password",
        },
        {
            key: "targetType",
            label: "目标类型",
            type: "text",
            def: "group",
        },
        {
            key: "targetId",
            label: "目标",
            type: "text",
            required: true,
        },
        {
            key: "message",
            label: "消息",
            type: "textarea",
            def: "{{label}}",
        },
    ],
    async execute(config, ctx) {
        const baseUrl = stripTrailingSlash(readStr(config, "baseUrl", "http://127.0.0.1:5700"))
        if (!baseUrl) return { ok: false, message: "missing required field: baseUrl" }
        let protocol = ""
        try {
            protocol = new URL(baseUrl).protocol
        } catch {
            return { ok: false, message: "invalid baseUrl" }
        }
        if (protocol !== "http:" && protocol !== "https:") return { ok: false, message: "baseUrl must be http(s)" }
        const targetId = readStr(config, "targetId", "").trim()
        if (!targetId) return { ok: false, message: "missing required field: targetId" }
        const event = ctx.event ?? {}
        let payload: OneBotSendPayload
        try {
            payload = buildSendPayload(
                readStr(config, "targetType", "group"),
                targetId,
                renderTemplate(readStr(config, "message", "{{label}}"), event)
            )
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) }
        }
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        const token = readStr(config, "token", "").trim()
        if (token) headers.Authorization = `Bearer ${token}`
        try {
            const res = await ctx.runtime.fetch(`${baseUrl}/send_msg`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: withTimeout(ctx.signal),
            })
            if (!res.ok) return { ok: false, message: `onebot send failed with status ${res.status}` }
            return checkOneBotResult(await res.json().catch(() => null))
        } catch (error) {
            return { ok: false, message: failureMessage(error, ctx.signal) }
        }
    },
}

export default def
