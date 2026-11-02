import type { AutomationEvent } from "../types"

/**
 * 密函任务转自动化事件（只做映射，不负责轮询）。
 * 订阅命中即整点刷新出想要的任务，语义是“刷新”而非“完成”。
 * @param mission 任务名与类型
 */
export function mihanToAutomationEvent(mission: { name: string; type: string }): AutomationEvent {
    return {
        source: "mihan",
        kind: "commission_refresh",
        at: Date.now(),
        label: mission.name,
        data: { mission: mission.name, type: mission.type },
    }
}
