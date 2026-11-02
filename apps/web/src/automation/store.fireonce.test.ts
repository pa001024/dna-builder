import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireRuleNow, registerAction } from "./bus"
import { manualEvent } from "./sources/manual"
import { useAutomationStore } from "./store"
import type { ActionDef } from "./types"

const runScene = vi.fn()

const sceneAction: ActionDef = {
    id: "test.scene",
    title: "测试场景",
    fields: [],
    execute: async config => {
        await runScene(config)
        return { ok: true }
    },
}

function addDungeonRule(store: ReturnType<typeof useAutomationStore>, fireOnce = true) {
    return store.addRule({
        enabled: true,
        name: "灯",
        fireOnce,
        match: { kind: "dungeon", when: [{ field: "status", op: "eq", value: "complete" }] },
        actionId: "test.scene",
        actionConfig: { scene: "s1" },
    })
}

const dungeonEvent = () => manualEvent("dungeon", { id: "64102", status: "complete", name: "扼守/无尽" }, "副本完成")

describe("automation fire-once", () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        runScene.mockReset()
        runScene.mockResolvedValue(undefined)
    })

    it("命中后关闭该规则，重复事件不再执行", async () => {
        registerAction(sceneAction)
        const store = useAutomationStore()
        const id = addDungeonRule(store)

        await store.dispatch(dungeonEvent())
        expect(runScene).toHaveBeenCalledTimes(1)
        expect(store.rules.find(rule => rule.id === id)?.enabled).toBe(false)
        expect(store.lastFiredAt[id]).toBeGreaterThan(0)

        await store.dispatch(dungeonEvent())
        expect(runScene).toHaveBeenCalledTimes(1)
    })

    it("关闭仅一次后可重复触发，规则保持开启", async () => {
        registerAction(sceneAction)
        const store = useAutomationStore()
        const id = addDungeonRule(store, false)

        await store.dispatch(dungeonEvent())
        await store.dispatch(dungeonEvent())
        expect(store.rules.find(rule => rule.id === id)?.enabled).toBe(true)
        expect(runScene).toHaveBeenCalledTimes(2)
    })

    it("手动执行不受仅一次与开关影响，也不翻转开关", async () => {
        registerAction(sceneAction)
        const store = useAutomationStore()
        const id = addDungeonRule(store)

        await store.dispatch(dungeonEvent())
        expect(runScene).toHaveBeenCalledTimes(1)

        const rule = store.rules.find(item => item.id === id)
        expect(rule?.enabled).toBe(false)
        if (rule) await fireRuleNow(rule)
        expect(runScene).toHaveBeenCalledTimes(2)
        expect(store.rules.find(item => item.id === id)?.enabled).toBe(false)

        store.updateRule(id, { enabled: false })
        const disabled = store.rules.find(item => item.id === id)
        if (disabled) await fireRuleNow(disabled)
        expect(runScene).toHaveBeenCalledTimes(3)
    })
})
