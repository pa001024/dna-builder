import type { AfkEvent } from "@/api/afkSupport"
import { formatAfkEvent } from "@/store/afkSupport"
import type { AutomationEvent } from "../types"

/**
 * 管道协议事件转自动化事件：kind 沿用协议原值，data 只取单层匹配字段。
 * @param event 协议事件
 * @returns 自动化事件（穷举无遗漏，default 仅为类型兜底）
 */
export function afkToAutomationEvent(event: AfkEvent): AutomationEvent | null {
    const head = { source: "afk" as const, at: event.receivedAt || Date.now(), label: formatAfkEvent(event) }
    switch (event.kind) {
        case "dungeon":
            return { ...head, kind: "dungeon", data: { id: event.id, status: event.status, name: event.name } }
        case "reward":
            return { ...head, kind: "reward", data: { name: event.name, count: event.count, rarity: event.rarity } }
        case "craft":
            return { ...head, kind: "craft", data: { name: event.name } }
        case "character":
            return {
                ...head,
                kind: "character",
                data: { id: event.id, state: event.state, scene: event.scene, name: event.name },
            }
        case "monster":
            return { ...head, kind: "monster", data: { id: event.id } }
        case "chat":
            return { ...head, kind: "chat", data: { team: event.team, world: event.world, party: event.party } }
        case "language":
            return { ...head, kind: "language", data: { lang: event.lang } }
        case "control":
            return { ...head, kind: "control", data: { action: event.action } }
        default:
            return null
    }
}
