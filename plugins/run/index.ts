import { type ActionDef, env, launchExe, launchNormal } from "@dob/host"

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

function readStr(config: Record<string, unknown>, key: string, fallback: string): string {
    const value = config[key]
    if (value === undefined || value === null) return fallback
    if (typeof value === "string") return value === "" ? fallback : value
    return String(value)
}

const def: ActionDef = {
    id: "run.program",
    title: "启动程序",
    fields: [
        {
            key: "mode",
            label: "模式",
            type: "text",
            def: "normal",
        },
        {
            key: "path",
            label: "路径",
            type: "text",
            required: true,
        },
        {
            key: "params",
            label: "参数",
            type: "text",
            def: "",
        },
    ],
    async execute(config, ctx) {
        const mode = readStr(config, "mode", "normal")
        if (mode !== "normal" && mode !== "exe") return { ok: false, message: `unknown mode: ${mode}` }
        const event = ctx.event ?? {}
        const path = renderTemplate(readStr(config, "path", ""), event).trim()
        if (!path) return { ok: false, message: "missing required field: path" }
        if (!env.isApp) return { ok: false, message: "run.program is desktop-only" }
        const params = renderTemplate(readStr(config, "params", ""), event)
        try {
            const ok = mode === "exe" ? await launchExe(path, params) : await launchNormal(path, params)
            return ok ? { ok: true } : { ok: false, message: "launch failed" }
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) }
        }
    },
}

export default def
