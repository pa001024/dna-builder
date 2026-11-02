import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it } from "vitest"
import { fireRuleNow, listActions, matchCond, matchEvent, registerAction } from "./bus"
import { manualEvent } from "./sources/manual"
import { useAutomationStore } from "./store"
import type { ActionDef, AutomationRule } from "./types"

const order: string[] = []

const stub: ActionDef = {
    id: "test.stub",
    title: "测试桩",
    fields: [],
    execute: async config => {
        order.push(String(config.tag ?? ""))
        if (config.fail) return { ok: false, message: "boom" }
        return { ok: true }
    },
}

function addRule(store: ReturnType<typeof useAutomationStore>, patch: Partial<AutomationRule> = {}) {
    return store.addRule({
        enabled: true,
        name: "r",
        fireOnce: false,
        match: {},
        actionId: "test.stub",
        actionConfig: {},
        ...patch,
    })
}

describe("matcher ops", () => {
    it("eq/neq 按字符串口径比对，缺字段 eq 为 false", () => {
        expect(matchCond({ field: "a", op: "eq", value: 1 }, { a: 1 })).toBe(true)
        expect(matchCond({ field: "a", op: "eq", value: "1" }, { a: 1 })).toBe(true)
        expect(matchCond({ field: "a", op: "eq", value: 2 }, { a: 1 })).toBe(false)
        expect(matchCond({ field: "missing", op: "eq", value: "x" }, {})).toBe(false)
        expect(matchCond({ field: "a", op: "neq", value: 2 }, { a: 1 })).toBe(true)
        expect(matchCond({ field: "a", op: "neq", value: 1 }, { a: 1 })).toBe(false)
    })

    it("contains 做子串匹配", () => {
        expect(matchCond({ field: "name", op: "contains", value: "羊毛" }, { name: "金羊毛" })).toBe(true)
        expect(matchCond({ field: "name", op: "contains", value: "银" }, { name: "金羊毛" })).toBe(false)
        expect(matchCond({ field: "missing", op: "contains", value: "x" }, {})).toBe(false)
    })

    it("gte/lte 按数值比，非数值恒为 false", () => {
        expect(matchCond({ field: "rarity", op: "gte", value: 4 }, { rarity: 5 })).toBe(true)
        expect(matchCond({ field: "rarity", op: "gte", value: 4 }, { rarity: 3 })).toBe(false)
        expect(matchCond({ field: "count", op: "lte", value: 10 }, { count: "7" })).toBe(true)
        expect(matchCond({ field: "name", op: "gte", value: 1 }, { name: "金羊毛" })).toBe(false)
        expect(matchCond({ field: "missing", op: "lte", value: 1 }, {})).toBe(false)
    })

    it("kind 为空不限种类，when 需全部满足", () => {
        const event = manualEvent("dungeon", { status: "complete" })
        expect(matchEvent({}, event)).toBe(true)
        expect(matchEvent({ kind: "reward" }, event)).toBe(false)
        expect(matchEvent({ kind: "dungeon", when: [{ field: "status", op: "eq", value: "complete" }] }, event)).toBe(true)
        expect(
            matchEvent(
                {
                    kind: "dungeon",
                    when: [
                        { field: "status", op: "eq", value: "complete" },
                        { field: "status", op: "eq", value: "enter" },
                    ],
                },
                event
            )
        ).toBe(false)
    })
})

describe("bus dispatch", () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        order.length = 0
        registerAction(stub)
        expect(listActions().some(def => def.id === "test.stub")).toBe(true)
    })

    it("只执行启用且命中的规则，并按数组顺序执行", async () => {
        const store = useAutomationStore()
        const event = manualEvent("dungeon", { status: "complete" })
        addRule(store, { actionConfig: { tag: "first" }, match: { kind: "dungeon" } })
        addRule(store, { enabled: false, actionConfig: { tag: "disabled" }, match: { kind: "dungeon" } })
        addRule(store, { actionConfig: { tag: "nomatch" }, match: { kind: "reward" } })
        addRule(store, {
            actionConfig: { tag: "second" },
            match: { kind: "dungeon", when: [{ field: "status", op: "eq", value: "complete" }] },
        })

        const outcomes = await store.dispatch(event)
        expect(order).toEqual(["first", "second"])
        expect(outcomes.map(o => o.result.ok)).toEqual([true, true])
        expect(Object.values(store.fireError).every(message => message === "")).toBe(true)
    })

    it("缺失动作记错并继续执行后续规则", async () => {
        const store = useAutomationStore()
        const event = manualEvent("manual", {})
        const badId = addRule(store, { actionId: "test.missing", actionConfig: {} })
        const goodId = addRule(store, { actionConfig: { tag: "after" } })

        const outcomes = await store.dispatch(event)
        expect(outcomes).toHaveLength(2)
        expect(outcomes[0]).toMatchObject({ ruleId: badId, result: { ok: false } })
        expect(outcomes[1]).toMatchObject({ ruleId: goodId, result: { ok: true } })
        expect(store.fireError[badId]).toContain("test.missing")
        expect(order).toEqual(["after"])
    })

    it("动作返回失败记错并继续，不中断批次", async () => {
        const store = useAutomationStore()
        const event = manualEvent("manual", {})
        const failId = addRule(store, { actionConfig: { tag: "fail", fail: true } })
        addRule(store, { actionConfig: { tag: "after" } })

        await store.dispatch(event)
        expect(store.fireError[failId]).toBe("boom")
        expect(store.lastFiredAt[failId]).toBeUndefined()
        expect(order).toEqual(["fail", "after"])
    })
})

describe("plugin gate", () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        order.length = 0
        registerAction(stub)
    })

    it("插件关闭后其规则不再被触发", async () => {
        const store = useAutomationStore()
        const event = manualEvent("manual", {})
        addRule(store, { actionConfig: { tag: "gated" } })
        store.setPluginEnabled("test", false)
        expect(store.isPluginEnabled("test")).toBe(false)

        const outcomes = await store.dispatch(event)
        expect(outcomes).toHaveLength(0)
        expect(order).toEqual([])

        store.setPluginEnabled("test", true)
        await store.dispatch(event)
        expect(order).toEqual(["gated"])
    })

    it("手动执行同样受插件开关约束", async () => {
        const store = useAutomationStore()
        const id = addRule(store, { actionConfig: { tag: "manual" } })
        const rule = store.rules.find(item => item.id === id)!
        store.setPluginEnabled("test", false)
        const result = await fireRuleNow(rule)
        expect(result).toMatchObject({ ok: false, message: "plugin disabled" })
        expect(order).toEqual([])
    })
})
