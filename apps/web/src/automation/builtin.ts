import type { ActionDef } from "./types"

/** 模板事件（规则事件的子集，只取渲染需要的字段）。 */
export interface TemplateEvent {
    label?: string
    data?: Record<string, unknown>
}

/** 渲染 `{{label}}` / `{{data}}` / `{{data.<key>}}` 占位符。 */
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

function readStr(config: Record<string, unknown>, key: string, fallback: string): string {
    const value = config[key]
    if (value === undefined || value === null) return fallback
    if (typeof value === "string") return value === "" ? fallback : value
    return String(value)
}

interface TauriNotificationApi {
    isPermissionGranted?: () => Promise<boolean>
    requestPermission?: () => Promise<unknown>
    sendNotification?: (opts: string | { title?: string; body?: string }) => void | Promise<void>
}

const TAURI_NOTIFICATION_SPECIFIER = "@tauri-apps/plugin-notification"

async function sendViaTauri(title: string, body: string): Promise<boolean> {
    try {
        const mod = (await import(/* @vite-ignore */ TAURI_NOTIFICATION_SPECIFIER)) as unknown as TauriNotificationApi
        if (typeof mod.sendNotification !== "function") return false
        try {
            if (typeof mod.isPermissionGranted === "function") {
                const granted = await mod.isPermissionGranted()
                if (!granted && typeof mod.requestPermission === "function") await mod.requestPermission()
            }
        } catch {
            return false
        }
        await mod.sendNotification(body ? { title, body } : { title })
        return true
    } catch {
        return false
    }
}

type WebNotificationCtor = new (title: string, options?: { body?: string }) => unknown

interface WebNotificationApi extends WebNotificationCtor {
    permission?: string
    requestPermission?: () => Promise<string>
}

async function sendViaWeb(title: string, body: string): Promise<boolean> {
    const Notify = (globalThis as unknown as { Notification?: WebNotificationApi }).Notification
    if (typeof Notify !== "function") return false
    try {
        if (Notify.permission === "default" && typeof Notify.requestPermission === "function") {
            await Notify.requestPermission()
        }
        if (Notify.permission !== "granted") return false
        new Notify(title, body ? { body } : undefined)
        return true
    } catch {
        return false
    }
}

/** 系统通知（原生能力非插件）：桌面端走 Tauri 通知，其次走 Web Notification。 */
const notifySystem: ActionDef = {
    id: "notify.system",
    title: "系统通知",
    fields: [
        {
            key: "title",
            label: "标题",
            type: "text",
            def: "{{label}}",
        },
        {
            key: "body",
            label: "内容",
            type: "textarea",
            def: "{{label}}",
        },
    ],
    async execute(config, ctx) {
        try {
            const event = ctx.event ?? {}
            const title = renderTemplate(readStr(config, "title", "{{label}}"), event)
            const body = renderTemplate(readStr(config, "body", "{{label}}"), event)
            if (!title.trim() && !body.trim()) return { ok: false, message: "empty notification" }
            const shown = title.trim() || "notification"
            if (await sendViaTauri(shown, body)) return { ok: true }
            if (await sendViaWeb(shown, body)) return { ok: true }
            return { ok: false, message: "notifications are not available in this runtime" }
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) }
        }
    },
}

/** 引擎原生动作（插件加载后注册，原生能力优先）。 */
export const builtinActions: ActionDef[] = [notifySystem]
