import { createPinia, setActivePinia } from "pinia"
import { describe, expect, it, vi } from "vitest"
import { registerAction } from "@/automation/bus"
import type { AutomationEvent } from "@/automation/types"

vi.mock("@/api/external", () => ({ getInstanceInfo: vi.fn() }))
vi.mock("@/api/graphql", () => ({ missionsIngameQuery: vi.fn() }))
vi.mock("@/store/setting", () => ({ useSettingStore: () => ({ screenBar: { enabled: false, items: [] } }) }))
vi.mock("@/utils/dna-channel", () => ({ serializeTaskData: (v: unknown) => JSON.stringify(v) }))
vi.mock("@/utils/dna-hour-sample", () => ({ sampleDNAHour: vi.fn() }))
vi.mock("@/utils/hour-verify", () => ({
    cancelAllHourSessions: vi.fn(),
    formatHourOffset: () => "",
    getHourAdminPushHandler: () => null,
    getHourStart: () => 0,
    getLastAdminPushHourStart: () => 0,
    getVerifyAt: () => 0,
    invokeHourAdminPush: vi.fn(),
    isAbortError: () => false,
    isInVerifyWindow: () => false,
    logHourVerify: vi.fn(),
    runDoubleWriteVerify: vi.fn(),
    runHourlyDoubleWriteSession: vi.fn(),
    trackHourSession: () => ({ signal: AbortSignal.abort(), done: vi.fn() }),
}))
vi.mock("@/utils/screen-bar", () => ({ SHORT_NOTE_STORAGE_KEY: "test-short-note" }))
vi.mock("@/store/ui", () => ({ useUIStore: () => ({ mihanVisible: false }) }))
vi.mock("@vueuse/sound", () => ({ useSound: () => ({ play: vi.fn() }) }))
vi.mock("@/env", () => ({ env: { isApp: false } }))

const { useMihanNotify } = await import("@/store/mihan")
const { useAutomationStore } = await import("@/automation/store")

describe("mihan 订阅命中派发自动化事件", () => {
    it("命中时每条任务派发 commission_refresh，未命中/未订阅不派发", async () => {
        setActivePinia(createPinia())
        const seen: AutomationEvent[] = []
        registerAction({
            id: "test.mihan-capture",
            title: "t",
            fields: [],
            execute: async (_config, ctx) => {
                seen.push(ctx.event)
                return { ok: true }
            },
        })
        const automation = useAutomationStore()
        automation.addRule({
            enabled: true,
            name: "r",
            fireOnce: false,
            match: { kind: "commission_refresh" },
            actionId: "test.mihan-capture",
            actionConfig: {},
        })
        const mihan = useMihanNotify()
        mihan.mihanData.value = [["秘银任务"], [], []]
        mihan.mihanEnableNotify.value = true
        mihan.mihanNotifyTypes.value = [0]
        mihan.mihanNotifyMissions.value = ["秘银任务"]
        await mihan.checkNotify()
        for (let i = 0; i < 100 && seen.length === 0; i++) await new Promise(r => setTimeout(r, 20))
        expect(seen.length).toBe(1)
        expect(seen[0].kind).toBe("commission_refresh")
        expect(seen[0].source).toBe("mihan")
        expect(seen[0].data).toEqual({ mission: "秘银任务", type: "角色" })

        seen.length = 0
        mihan.mihanNotifyMissions.value = ["不存在的任务"]
        await mihan.checkNotify()
        expect(seen.length).toBe(0)

        mihan.mihanNotifyMissions.value = ["秘银任务"]
        mihan.mihanEnableNotify.value = false
        await mihan.checkNotify()
        expect(seen.length).toBe(0)
    })
})
