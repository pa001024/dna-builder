import type { MiHomeScene } from "../../../../packages/mihome-api/src/index"
import type { AutomationRuntime } from "./runtime"

export interface AutomationEvent {
    source: "afk" | "mihan" | "manual"
    kind: string
    at: number
    label: string
    data: Record<string, unknown>
    replayed?: boolean
}

export type MatchOp = "eq" | "neq" | "contains" | "gte" | "lte"

export interface MatchCond {
    field: string
    op: MatchOp
    value: string | number
}

export interface Matcher {
    /** 事件种类（单选）；为空表示不限种类。 */
    kind?: string
    when?: MatchCond[]
}

export interface AutomationRule {
    id: string
    enabled: boolean
    name: string
    fireOnce: boolean
    match: Matcher
    actionId: string
    actionConfig: Record<string, unknown>
}

/** 新规则预设：快捷按钮填充 kind + when，编辑器接管后落库。 */
export interface AutomationRulePreset {
    name?: string
    kind?: string
    when?: MatchCond[]
    actionConfig?: Record<string, unknown>
}

export interface ActionContext {
    event: AutomationEvent
    signal: AbortSignal
    runtime: AutomationRuntime
}

export interface ActionResult {
    ok: boolean
    message?: string
}

/**
 * 插件提供的账号能力（登录 / 登出 / 列表），由宿主设置界面调用。
 * fetch 由调用方按运行时注入，插件不直接依赖网络实现。
 */
export interface PluginAccount {
    status(fetchFn: typeof fetch): Promise<boolean>
    qrBegin(fetchFn: typeof fetch): Promise<{ already: true } | { already: false; login_url: string; lp: string }>
    qrWait(fetchFn: typeof fetch, loginUrl: string, lp: string): Promise<void>
    logout(fetchFn: typeof fetch): Promise<void>
    listScenes(fetchFn: typeof fetch): Promise<MiHomeScene[]>
}

export interface ActionField {
    key: string
    label: string
    type: "text" | "password" | "number" | "boolean" | "textarea"
    required?: boolean
    def?: string | number | boolean
}

export interface ActionDef {
    id: string
    title: string
    fields: ActionField[]
    execute(config: Record<string, unknown>, ctx: ActionContext): Promise<ActionResult>
}
