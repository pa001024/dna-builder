import { StorageSerializers, useLocalStorage } from "@vueuse/core"
import { defineStore } from "pinia"
import { dispatch as dispatchBusEvent } from "./bus"
import type { AutomationEvent, AutomationRule } from "./types"

/** 新规则表单草稿（无 id）。 */
export type AutomationRuleDraft = Omit<AutomationRule, "id">

/**
 * 生成规则 id：优先 crypto.randomUUID，降级为时间 + 随机。
 * @returns 唯一 id
 */
function newRuleId() {
    try {
        return crypto.randomUUID()
    } catch {
        return `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }
}

export const useAutomationStore = defineStore("automation", {
    state: () => ({
        rules: useLocalStorage<AutomationRule[]>("setting_automation_rules", [], {
            serializer: StorageSerializers.object,
            writeDefaults: false,
        }),
        /** 规则 id → 最近一次触发时刻（毫秒），供列表展示“上次执行”。 */
        lastFiredAt: {} as Record<string, number>,
        /** 规则 id → 最近一次触发错误（成功时清空）。 */
        fireError: {} as Record<string, string>,
        /** 手动关闭的插件 id：缺省全开，关掉后该插件的规则不再被触发。 */
        disabledPlugins: useLocalStorage<string[]>("setting_automation_disabled_plugins", [], {
            serializer: StorageSerializers.object,
            writeDefaults: false,
        }),
    }),
    getters: {
        enabledRules(state): AutomationRule[] {
            return state.rules.filter(rule => rule.enabled)
        },
    },
    actions: {
        /**
         * 新增一条规则。
         * @param draft 表单草稿
         * @returns 新规则 id
         */
        addRule(draft: AutomationRuleDraft) {
            const rule: AutomationRule = { ...draft, id: newRuleId() }
            this.rules = [...this.rules, rule]
            return rule.id
        },
        /**
         * 更新一条规则。
         * @param id 规则 id
         * @param patch 部分字段
         */
        updateRule(id: string, patch: Partial<AutomationRuleDraft>) {
            this.rules = this.rules.map(rule => (rule.id === id ? { ...rule, ...patch } : rule))
        },
        /**
         * 删除一条规则。
         * @param id 规则 id
         */
        removeRule(id: string) {
            this.rules = this.rules.filter(rule => rule.id !== id)
        },
        /**
         * 插件是否启用（动作 id 按点分命名，前缀即插件 id）。
         * @param pluginId 插件 id
         */
        isPluginEnabled(pluginId: string) {
            return !this.disabledPlugins.includes(pluginId)
        },
        /**
         * 开关一个插件：关闭后该插件的规则不再被触发（已有规则保留）。
         * @param pluginId 插件 id
         * @param enabled 目标状态
         */
        setPluginEnabled(pluginId: string, enabled: boolean) {
            const next = new Set(this.disabledPlugins)
            if (enabled) next.delete(pluginId)
            else next.add(pluginId)
            this.disabledPlugins = [...next]
        },
        /**
         * 翻转一条规则的启用开关。
         * @param id 规则 id
         */
        toggleRule(id: string) {
            const rule = this.rules.find(item => item.id === id)
            if (rule) this.updateRule(id, { enabled: !rule.enabled })
        },
        /**
         * 记录一次成功触发： stamp 时刻并清空旧错误。
         * @param id 规则 id
         */
        markFired(id: string) {
            this.lastFiredAt = { ...this.lastFiredAt, [id]: Date.now() }
            this.fireError = { ...this.fireError, [id]: "" }
        },
        /**
         * 记录一次触发错误。
         * @param id 规则 id
         * @param message 错误信息
         */
        markError(id: string, message: string) {
            this.fireError = { ...this.fireError, [id]: message }
        },
        /**
         * 分发一条事件到底层总线（触发记录由总线回写本 store）。
         * @param event 自动化事件
         * @returns 每条命中规则的执行结果
         */
        async dispatch(event: AutomationEvent) {
            return await dispatchBusEvent(event)
        },
    },
})
