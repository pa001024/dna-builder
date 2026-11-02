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

export function normalizeMethod(raw: string): string {
    return raw.trim().toUpperCase() || "POST"
}

export function parseHeaders(raw: string, event: TemplateEvent): Record<string, string> {
    const rendered = renderTemplate(raw, event).trim()
    if (!rendered) return {}
    const parsed: unknown = JSON.parse(rendered)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("headers must be a JSON object")
    }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = typeof v === "string" ? v : JSON.stringify(v)
    }
    return out
}

export function buildBody(raw: string, event: TemplateEvent): string {
    const rendered = renderTemplate(raw, event)
    if (!rendered.trim()) return JSON.stringify(event)
    return rendered
}

const def: ActionDef = {
    id: "webhook.post",
    title: "POST JSON",
    fields: [
        {
            key: "url",
            label: "请求地址",
            type: "text",
            required: true,
        },
        {
            key: "method",
            label: "方法",
            type: "text",
            def: "POST",
        },
        {
            key: "headers",
            label: "请求头",
            type: "textarea",
            def: "{}",
        },
        {
            key: "bodyTemplate",
            label: "内容模板",
            type: "textarea",
            def: "",
        },
    ],
    async execute(config, ctx) {
        const url = readStr(config, "url", "").trim()
        if (!url) return { ok: false, message: "missing required field: url" }
        let protocol = ""
        try {
            protocol = new URL(url).protocol
        } catch {
            return { ok: false, message: "invalid url" }
        }
        if (protocol !== "http:" && protocol !== "https:") return { ok: false, message: "url must be http(s)" }
        const event = ctx.event ?? {}
        let headers: Record<string, string>
        try {
            headers = parseHeaders(readStr(config, "headers", "{}"), event)
        } catch {
            return { ok: false, message: "headers is not valid JSON" }
        }
        const method = normalizeMethod(readStr(config, "method", "POST"))
        const body = buildBody(readStr(config, "bodyTemplate", ""), event)
        try {
            const res = await ctx.runtime.fetch(url, {
                method,
                headers,
                body: method === "GET" || method === "HEAD" ? undefined : body,
                signal: withTimeout(ctx.signal),
            })
            if (!res.ok) return { ok: false, message: `request failed with status ${res.status}` }
            return { ok: true }
        } catch (error) {
            return { ok: false, message: failureMessage(error, ctx.signal) }
        }
    },
}

export default def
