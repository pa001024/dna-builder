import type { AutomationEvent } from "../types"

/**
 * 构造一条手动触发的测试事件（规则试运行用）。
 * @param kind 事件种类
 * @param data 单层数据字段
 * @param label 展示文本，缺省用 kind
 */
export function manualEvent(kind: string, data: Record<string, unknown>, label?: string): AutomationEvent {
    return { source: "manual", kind, at: Date.now(), label: label ?? kind, data }
}
