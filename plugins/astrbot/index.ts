import type { ActionDef } from "@dob/host"

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

export interface AstraSendPayload {
    chat_id: string
    text: string
}

export function buildSendPayload(chatId: string, text: string): AstraSendPayload {
    return { chat_id: chatId.trim(), text }
}

const def: ActionDef = {
    id: "astrbot.send",
    title: "发送消息",
    fields: [
        {
            key: "baseUrl",
            label: "服务地址",
            type: "text",
            required: true,
        },
        {
            key: "path",
            label: "接口路径",
            type: "text",
            def: "/sendMessage",
        },
        {
            key: "token",
            label: "Token",
            type: "password",
        },
        {
            key: "chatId",
            label: "会话",
            type: "text",
            required: true,
        },
        {
            key: "text",
            label: "消息",
            type: "textarea",
            def: "{{label}}",
        },
    ],
    async execute(config, ctx) {
        const baseUrl = readStr(config, "baseUrl", "").trim().replace(/\/+$/, "")
        if (!baseUrl) return { ok: false, message: "missing required field: baseUrl" }
        let protocol = ""
        try {
            protocol = new URL(baseUrl).protocol
        } catch {
            return { ok: false, message: "invalid baseUrl" }
        }
        if (protocol !== "http:" && protocol !== "https:") return { ok: false, message: "baseUrl must be http(s)" }
        const chatId = readStr(config, "chatId", "").trim()
        if (!chatId) return { ok: false, message: "missing required field: chatId" }
        const event = ctx.event ?? {}
        const payload = buildSendPayload(chatId, renderTemplate(readStr(config, "text", "{{label}}"), event))
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        const token = readStr(config, "token", "").trim()
        if (token) headers.Authorization = `Bearer ${token}`
        const endpoint = readStr(config, "path", "/sendMessage").trim() || "/sendMessage"
        const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`
        try {
            const res = await ctx.runtime.fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: withTimeout(ctx.signal),
            })
            if (!res.ok) return { ok: false, message: `astrbot send failed with status ${res.status}` }
            return { ok: true }
        } catch (error) {
            return { ok: false, message: failureMessage(error, ctx.signal) }
        }
    },
}

export default def
