import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AfkEvent } from "@/api/afkSupport"

const mihomeRunScene = vi.fn()

vi.mock("@/api/mihome", () => ({
    mihomeListScenes: vi.fn(),
    mihomeLogout: vi.fn(),
    mihomeQrBegin: vi.fn(),
    mihomeQrWait: vi.fn(),
    mihomeRunScene: (...args: unknown[]) => mihomeRunScene(...args),
    mihomeStatus: vi.fn(),
}))

const { useMiHomeLinkStore } = await import("@/store/mihomeLink")

const dungeonEvent: AfkEvent = {
    kind: "dungeon",
    id: "64102",
    status: "complete",
    name: "扼守/无尽",
    receivedAt: 1,
    raw: "",
}

/**
 * 给 store 装一条“任意副本完成”规则。
 * @param store 米家联动 store
 */
function addAnyDungeonRule(store: ReturnType<typeof useMiHomeLinkStore>) {
    store.rules = [
        {
            id: "r1",
            enabled: true,
            kind: "dungeon_complete",
            dungeonId: "",
            itemName: "",
            minRarity: 1,
            sceneId: "s1",
            homeId: "h1",
            sceneName: "灯",
        },
    ]
}

describe("mihome fire-once", () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        mihomeRunScene.mockReset()
        mihomeRunScene.mockResolvedValue(undefined)
    })

    it("默认开启仅一次：命中后自动关闭总开关，重复事件不再执行", async () => {
        const store = useMiHomeLinkStore()
        expect(store.fireOnce).toBe(true)
        store.enabled = true
        addAnyDungeonRule(store)

        store.maybeFire(dungeonEvent, false)
        expect(store.enabled).toBe(false)
        await vi.waitFor(() => expect(mihomeRunScene).toHaveBeenCalledTimes(1))
        expect(mihomeRunScene).toHaveBeenCalledWith({ scene_id: "s1", home_id: "h1" })

        store.maybeFire(dungeonEvent, false)
        await new Promise(resolve => setTimeout(resolve, 20))
        expect(mihomeRunScene).toHaveBeenCalledTimes(1)
    })

    it("关闭仅一次后可重复触发，总开关保持开启", async () => {
        const store = useMiHomeLinkStore()
        store.setFireOnce(false)
        store.enabled = true
        addAnyDungeonRule(store)

        store.maybeFire(dungeonEvent, false)
        store.maybeFire(dungeonEvent, false)
        expect(store.enabled).toBe(true)
        await vi.waitFor(() => expect(mihomeRunScene).toHaveBeenCalledTimes(2))
    })

    it("回放事件不触发，手动执行不受仅一次影响", async () => {
        const store = useMiHomeLinkStore()
        store.enabled = true
        addAnyDungeonRule(store)

        store.maybeFire(dungeonEvent, true)
        expect(store.enabled).toBe(true)
        expect(mihomeRunScene).not.toHaveBeenCalled()

        await store.fireRule("r1")
        expect(store.enabled).toBe(true)
        expect(mihomeRunScene).toHaveBeenCalledTimes(1)
    })
})
