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

function readStr(config: Record<string, unknown>, key: string, fallback: string): string {
    const value = config[key]
    if (value === undefined || value === null) return fallback
    if (typeof value === "string") return value === "" ? fallback : value
    return String(value)
}

export function validateSocketUrl(raw: string): string {
    const url = raw.trim()
    if (!url) throw new Error("missing required field: url")
    let protocol = ""
    try {
        protocol = new URL(url).protocol
    } catch {
        throw new Error("invalid url")
    }
    if (protocol !== "ws:" && protocol !== "wss:") throw new Error("url must be ws(s)")
    return url
}

export function buildPayload(raw: string, event: TemplateEvent): string {
    const rendered = renderTemplate(raw, event)
    if (!rendered.trim()) return JSON.stringify(event)
    return rendered
}

interface NativeSocket {
    send(data: string): void
    close(): void
    addEventListener(type: string, listener: () => void, options?: { once?: boolean }): void
    removeEventListener(type: string, listener: () => void): void
}

const def: ActionDef = {
    id: "websocket.send",
    title: "推送消息",
    fields: [
        {
            key: "url",
            label: "地址",
            type: "text",
            required: true,
        },
        {
            key: "payload",
            label: "消息",
            type: "textarea",
            def: "",
        },
        {
            key: "reconnect",
            label: "自动重连",
            type: "boolean",
            def: false,
        },
    ],
    async execute(config, ctx) {
        const event = ctx.event ?? {}
        let url = ""
        try {
            url = validateSocketUrl(readStr(config, "url", ""))
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) }
        }
        const payload = buildPayload(readStr(config, "payload", ""), event)
        const WS = (globalThis as unknown as { WebSocket?: new (url: string) => NativeSocket }).WebSocket
        if (typeof WS !== "function") return { ok: false, message: "WebSocket is not available in this runtime" }
        if (ctx.signal.aborted) return { ok: false, message: "request aborted" }
        return await new Promise<ActionResult>(resolve => {
            let settled = false
            let socket: NativeSocket
            try {
                socket = new WS(url)
            } catch {
                resolve({ ok: false, message: "failed to open websocket" })
                return
            }
            const closeQuiet = (): void => {
                try {
                    socket.close()
                } catch (error) {
                    void error
                }
            }
            const cleanup = (): void => {
                clearTimeout(timer)
                ctx.signal.removeEventListener("abort", onAbort)
            }
            const done = (result: ActionResult): void => {
                if (settled) return
                settled = true
                cleanup()
                resolve(result)
            }
            const onAbort = (): void => {
                closeQuiet()
                done({ ok: false, message: "request aborted" })
            }
            const timer = setTimeout(() => {
                closeQuiet()
                done({ ok: false, message: "websocket timed out" })
            }, REQUEST_TIMEOUT_MS)
            const unref = (timer as unknown as { unref?: () => unknown }).unref
            if (typeof unref === "function") unref.call(timer)
            ctx.signal.addEventListener("abort", onAbort, { once: true })
            socket.addEventListener("open", () => {
                try {
                    socket.send(payload)
                    closeQuiet()
                    done({ ok: true })
                } catch (error) {
                    closeQuiet()
                    done({ ok: false, message: error instanceof Error ? error.message : String(error) })
                }
            })
            socket.addEventListener("error", () => {
                closeQuiet()
                done({ ok: false, message: "websocket error" })
            })
            socket.addEventListener("close", () => {
                done({ ok: false, message: "websocket closed before send" })
            })
        })
    },
}

export default def
