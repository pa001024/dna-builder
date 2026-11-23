import type { AfkDungeonEvent, AfkEvent, AfkRewardEvent } from "@/api/afkSupport"
import type { LogEvent } from "@/api/logAnalysis"
import { normalizeRarity } from "@/utils/afk-ledger"

/**
 * 从日志事件里收集副本 ID → 名称。
 * 任务栏播报的 name 在当前版本可能为空，保留最后一次非空值即可。
 * @param names 副本名映射（原地更新）
 * @param event 日志事件
 */
export function collectLogDungeonName(names: Map<number, string>, event: LogEvent) {
    if (event.k === "taskbar" && event.id > 0 && event.name) names.set(event.id, event.name)
}

/**
 * 解析奖励推送的 JSON，只接受账本关心的 reward 形状。
 * @param json 原始 DispatchJson
 * @returns 账本奖励字段；无法解析或不是 reward 时返回 null
 */
function parseReward(json: string): Omit<AfkRewardEvent, "kind" | "receivedAt" | "raw"> | null {
    try {
        const data = JSON.parse(json) as Record<string, unknown>
        if (data.type !== "reward" || typeof data.name !== "string" || !data.name) return null
        const count = Number(data.count)
        if (!Number.isFinite(count) || count <= 0) return null
        const parsedId = Number(data.id)
        return {
            id: Number.isFinite(parsedId) ? parsedId : null,
            name: data.name,
            rarity: normalizeRarity(data.rarity),
            count,
        }
    } catch {
        return null
    }
}

/**
 * 构造副本进出事件；日志没有原始 JSON 行，用固定占位满足协议。
 * @param id 副本 ID
 * @param status 进入 / 完成
 * @param name 副本名
 * @param receivedAt 真实 epoch 毫秒
 * @returns 账本副本事件
 */
function toDungeonEvent(id: number, status: AfkDungeonEvent["status"], name: string, receivedAt: number): AfkDungeonEvent {
    return { kind: "dungeon", id: String(id), status, name, receivedAt, raw: "log-analysis" }
}

/**
 * 把一条日志分析事件映射成账本可消费的事件。
 *
 * 日志只提供账本关心的三类信息：掉落、副本进入、副本完成。
 * 时间由调用方换成真实 epoch 毫秒，账本据此与管道事件做跨来源去重。
 * @param event 日志事件
 * @param names 已收集的副本名
 * @param receivedAt 事件真实 epoch 毫秒
 * @returns 账本事件；与账本无关或字段非法时返回 null
 */
export function logEventToAfkEvent(event: LogEvent, names: Map<number, string>, receivedAt: number): AfkEvent | null {
    if (!Number.isFinite(receivedAt)) return null
    switch (event.k) {
        case "reward": {
            const reward = parseReward(event.json)
            return reward ? { kind: "reward", ...reward, receivedAt, raw: event.json } : null
        }
        case "taskbar": {
            if (event.id <= 0 || (event.status !== "enter" && event.status !== "complete")) return null
            return toDungeonEvent(event.id, event.status, event.name || names.get(event.id) || "", receivedAt)
        }
        case "dunEnter":
        case "enterGuide":
            return event.dungeonId > 0 ? toDungeonEvent(event.dungeonId, "enter", names.get(event.dungeonId) ?? "", receivedAt) : null
        case "settle":
        case "finish":
            // 大世界 BOSS 的结算行 DungeonId 为 -1，不属于账本的副本次数
            return event.dungeonId > 0 ? toDungeonEvent(event.dungeonId, "complete", names.get(event.dungeonId) ?? "", receivedAt) : null
        default:
            return null
    }
}
