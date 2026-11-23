import { describe, expect, it } from "vitest"
import type { LogEvent } from "@/api/logAnalysis"
import { dropFingerprint } from "@/utils/afk-ledger"
import { collectLogDungeonName, logEventToAfkEvent } from "@/utils/log-ledger"

function logEvent<T extends LogEvent["k"]>(kind: T, fields: Record<string, unknown>): Extract<LogEvent, { k: T }> {
    return { t: 1000, k: kind, ...fields } as Extract<LogEvent, { k: T }>
}

const receivedAt = 1_000_000

function toAfk(event: LogEvent, names = new Map<number, string>()) {
    return logEventToAfkEvent(event, names, receivedAt)
}

describe("logEventToAfkEvent", () => {
    it("奖励推送映射为账本 reward，时间取日志时间戳的毫秒", () => {
        const event = logEvent("reward", {
            json: JSON.stringify({ type: "reward", id: 51007, name: "坚守", rarity: 5, count: 2 }),
        })
        expect(toAfk(event)).toEqual({
            kind: "reward",
            id: 51007,
            name: "坚守",
            rarity: 5,
            count: 2,
            receivedAt,
            raw: event.json,
        })
    })

    it("拒绝非 reward、缺名与非法数量", () => {
        expect(toAfk(logEvent("reward", { json: "not json" }))).toBeNull()
        expect(toAfk(logEvent("reward", { json: JSON.stringify({ type: "chat", name: "x", count: 1 }) }))).toBeNull()
        expect(toAfk(logEvent("reward", { json: JSON.stringify({ type: "reward", name: "", count: 1 }) }))).toBeNull()
        expect(toAfk(logEvent("reward", { json: JSON.stringify({ type: "reward", name: "x", count: 0 }) }))).toBeNull()
    })

    it("任务栏 enter/complete 映射为副本事件，空 name 回落到已收集的名字", () => {
        const names = new Map<number, string>()
        collectLogDungeonName(names, logEvent("taskbar", { id: 40604, status: "enter", name: "联袂演绎" }))
        const event = logEvent("taskbar", { id: 40604, status: "complete", name: "" })
        expect(toAfk(event, names)).toMatchObject({
            kind: "dungeon",
            id: "40604",
            status: "complete",
            name: "联袂演绎",
            receivedAt,
        })
    })

    it("忽略 id=0 的任务栏与大世界 BOSS 的 -1 结算", () => {
        expect(toAfk(logEvent("taskbar", { id: 0, status: "complete", name: "西比尔" }))).toBeNull()
        expect(toAfk(logEvent("settle", { dungeonId: -1, win: true }))).toBeNull()
    })

    it("进本兜底与两种结算行都映射为副本事件", () => {
        const names = new Map([[40604, "联袂演绎"]])
        expect(toAfk(logEvent("enterGuide", { dungeonId: 40604 }), names)).toMatchObject({
            kind: "dungeon",
            status: "enter",
            id: "40604",
            name: "联袂演绎",
        })
        expect(toAfk(logEvent("finish", { dungeonId: 40604, ok: true }), names)).toMatchObject({
            kind: "dungeon",
            status: "complete",
            id: "40604",
        })
    })

    it("与账本无关的事件返回 null", () => {
        expect(toAfk(logEvent("skill", { eid: 1, skillId: 410321, localRole: 3 }))).toBeNull()
    })
})

describe("dropFingerprint", () => {
    it("同内容不同时间的掉落指纹一致", () => {
        expect(dropFingerprint({ kind: "reward", itemId: 1, itemName: "A", count: 2 })).toBe(
            dropFingerprint({ kind: "reward", itemId: 1, itemName: "A", count: 2 })
        )
    })

    it("数量或 id 不同则指纹不同", () => {
        expect(dropFingerprint({ kind: "reward", itemId: 1, itemName: "A", count: 2 })).not.toBe(
            dropFingerprint({ kind: "reward", itemId: 1, itemName: "A", count: 3 })
        )
        expect(dropFingerprint({ kind: "reward", itemId: 1, itemName: "A", count: 2 })).not.toBe(
            dropFingerprint({ kind: "reward", itemId: 2, itemName: "A", count: 2 })
        )
    })
})
