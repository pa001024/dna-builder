import { ref } from "vue"
import { ensurePluginsLoaded } from "./loader"
import { getRuntime } from "./runtime"
import { manualEvent } from "./sources/manual"
import { useAutomationStore } from "./store"
import type { ActionDef, ActionResult, AutomationEvent, AutomationRule, MatchCond, Matcher } from "./types"

const actions = new Map<string, ActionDef>()

/** 注册表版本号：注册/注销时 +1，驱动界面列表刷新。 */
export const actionVersion = ref(0)

/** 注册一个动作实现（同 id 后注册覆盖先注册）。 */
export function registerAction(def: ActionDef) {
    actions.set(def.id, def)
    actionVersion.value++
}

/** 已注册动作按 id 排序返回（保证列表确定性）。 */
export function listActions(): ActionDef[] {
    return [...actions.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** 注销一个动作实现（插件卸载时调用）。 */
export function unregisterAction(actionId: string): void {
    if (actions.delete(actionId)) actionVersion.value++
}

/**
 * 单条件匹配：field 只取 event.data 单层键；gte/lte 按数值比，非数值恒为 false。
 * @param cond 匹配条件
 * @param data 事件数据
 */
export function matchCond(cond: MatchCond, data: Record<string, unknown>): boolean {
    const actual = data[cond.field]
    switch (cond.op) {
        case "eq":
            return String(actual) === String(cond.value)
        case "neq":
            return String(actual) !== String(cond.value)
        case "contains":
            return String(actual ?? "").includes(String(cond.value))
        case "gte":
        case "lte": {
            const a = Number(actual)
            const b = Number(cond.value)
            if (Number.isNaN(a) || Number.isNaN(b)) return false
            return cond.op === "gte" ? a >= b : a <= b
        }
    }
}

/**
 * 整条规则匹配器：kind 为空表示不限种类，when 全部满足才命中。
 * @param matcher 规则匹配器
 * @param event 自动化事件
 */
export function matchEvent(matcher: Matcher, event: AutomationEvent): boolean {
    if (matcher.kind && matcher.kind !== event.kind) return false
    if (matcher.when) return matcher.when.every(cond => matchCond(cond, event.data))
    return true
}

export interface DispatchOutcome {
    ruleId: string
    result: ActionResult
}

function errorOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/**
 * 按规则数组顺序执行启用的命中规则：缺失动作记错并继续，
 * fireOnce 规则整批执行完后统一关闭（手动 fireRuleNow 不受影响）。
 * @param event 自动化事件
 * @returns 每条命中规则的执行结果
 */
export function pluginOf(actionId: string) {
    return actionId.split(".")[0] ?? actionId
}

export async function dispatch(event: AutomationEvent): Promise<DispatchOutcome[]> {
    await ensurePluginsLoaded().catch(() => {})
    const store = useAutomationStore()
    const matched = store.rules.filter(
        rule => rule.enabled && store.isPluginEnabled(pluginOf(rule.actionId)) && matchEvent(rule.match, event)
    )
    const controller = new AbortController()
    const outcomes: DispatchOutcome[] = []
    for (const rule of matched) {
        const def = actions.get(rule.actionId)
        if (!def) {
            const result: ActionResult = { ok: false, message: `unknown action: ${rule.actionId}` }
            store.markError(rule.id, result.message ?? "")
            outcomes.push({ ruleId: rule.id, result })
            continue
        }
        try {
            const result = await def.execute(rule.actionConfig, { event, signal: controller.signal, runtime: getRuntime() })
            if (result.ok) store.markFired(rule.id)
            else store.markError(rule.id, result.message ?? "")
            outcomes.push({ ruleId: rule.id, result })
        } catch (error) {
            const message = errorOf(error)
            store.markError(rule.id, message)
            outcomes.push({ ruleId: rule.id, result: { ok: false, message } })
        }
    }
    for (const rule of matched) {
        if (rule.fireOnce) store.updateRule(rule.id, { enabled: false })
    }
    return outcomes
}

/**
 * 手动立即执行一条规则：无视 enabled/fireOnce，且永不翻转开关。
 * @param rule 规则
 * @returns 执行结果
 */
export async function fireRuleNow(rule: AutomationRule): Promise<ActionResult> {
    await ensurePluginsLoaded().catch(() => {})
    const store = useAutomationStore()
    const def = actions.get(rule.actionId)
    const event = manualEvent(rule.match.kind ?? "manual", {}, rule.name)
    if (!def) {
        const message = `unknown action: ${rule.actionId}`
        store.markError(rule.id, message)
        return { ok: false, message }
    }
    if (!store.isPluginEnabled(pluginOf(rule.actionId))) {
        return { ok: false, message: "plugin disabled" }
    }
    try {
        const result = await def.execute(rule.actionConfig, { event, signal: new AbortController().signal, runtime: getRuntime() })
        if (result.ok) store.markFired(rule.id)
        else store.markError(rule.id, result.message ?? "")
        return result
    } catch (error) {
        const message = errorOf(error)
        store.markError(rule.id, message)
        return { ok: false, message }
    }
}
