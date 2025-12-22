import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { MihanNotify } from "./mihan"

// Mock dependencies
vi.mock("@vueuse/core", () => ({
    useLocalStorage: vi.fn((key: string, defaultValue: any) => ({
        value: defaultValue,
    })),
}))

vi.mock("@vueuse/sound", () => ({
    useSound: vi.fn(() => ({
        play: vi.fn(),
    })),
}))

vi.mock("@tauri-apps/plugin-notification", () => ({
    isPermissionGranted: vi.fn().mockResolvedValue(true),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    sendNotification: vi.fn(),
}))

vi.mock("i18next", () => ({
    t: vi.fn((key: string, params?: any) => {
        if (params?.types) return params.types
        return key
    }),
}))

vi.mock("../api/query", () => ({
    missionsIngameQuery: vi.fn().mockResolvedValue({
        missions: [
            ["探险/无尽", "驱离"],
            ["扼守/无尽", "护送"],
            ["勘探/无尽", "追缉"],
        ],
    }),
}))

vi.mock("../env", () => ({
    env: {
        isApp: true,
    },
}))

vi.mock("./setting", () => ({
    useSettingStore: vi.fn(() => ({
        getDNAAPI: vi.fn().mockResolvedValue(null),
    })),
}))

vi.mock("./ui", () => ({
    useUIStore: vi.fn(() => ({
        mihanVisible: false,
    })),
}))

describe("MihanNotify", () => {
    let mihanNotify: MihanNotify

    beforeEach(() => {
        vi.clearAllMocks()
        mihanNotify = new MihanNotify()
    })

    afterEach(() => {
        vi.clearAllTimers()
    })

    describe("Constructor", () => {
        it("should create MihanNotify instance", () => {
            expect(mihanNotify).toBeInstanceOf(MihanNotify)
        })

        it("should initialize with default values", () => {
            expect(mihanNotify.mihanData).toBeDefined()
            expect(mihanNotify.mihanEnableNotify).toBeDefined()
            expect(mihanNotify.mihanNotifyOnce).toBeDefined()
            expect(mihanNotify.mihanNotifyTypes).toBeDefined()
            expect(mihanNotify.mihanNotifyMissions).toBeDefined()
        })

        it("should have watch flag set to false initially", () => {
            expect(mihanNotify.watch).toBe(false)
        })

        it("should have sfx instance", () => {
            expect(mihanNotify.sfx).toBeDefined()
        })
    })

    describe("Static Properties", () => {
        it("should have TYPES array with correct values", () => {
            expect(MihanNotify.TYPES).toEqual(["角色", "武器", "魔之楔"])
            expect(MihanNotify.TYPES).toHaveLength(3)
        })

        it("should have MISSIONS array with all mission types", () => {
            expect(MihanNotify.MISSIONS).toContain("探险/无尽")
            expect(MihanNotify.MISSIONS).toContain("驱离")
            expect(MihanNotify.MISSIONS).toContain("拆解")
            expect(MihanNotify.MISSIONS).toContain("护送")
            expect(MihanNotify.MISSIONS).toHaveLength(11)
        })
    })

    describe("updateMihanData", () => {
        it("should return true if data is already current", async () => {
            mihanNotify.mihanData.value = [["test"]]
            vi.spyOn(mihanNotify, "shouldUpdate").mockReturnValue(false)

            const result = await mihanNotify.updateMihanData()
            expect(result).toBe(true)
        })

        it("should fetch data from API if available", async () => {
            const mockAPI = {
                getDefaultRoleForTool: vi.fn().mockResolvedValue({
                    data: {
                        instanceInfo: [
                            { instances: [{ name: "test1" }, { name: "test2" }] },
                        ],
                    },
                }),
            }

            const { useSettingStore } = await import("./setting")
            vi.mocked(useSettingStore).mockReturnValue({
                getDNAAPI: vi.fn().mockResolvedValue(mockAPI),
            } as any)

            const result = await mihanNotify.updateMihanData()
            expect(result).toBe(true)
            expect(mockAPI.getDefaultRoleForTool).toHaveBeenCalled()
        })

        it("should fallback to missionsIngameQuery if API not available", async () => {
            const { missionsIngameQuery } = await import("../api/query")

            await mihanNotify.updateMihanData()
            expect(missionsIngameQuery).toHaveBeenCalled()
        })

        it("should return false if data hasn't changed", async () => {
            const testData = [["test1"], ["test2"]]
            mihanNotify.mihanData.value = testData

            const { missionsIngameQuery } = await import("../api/query")
            vi.mocked(missionsIngameQuery).mockResolvedValue({
                missions: testData,
            })

            const result = await mihanNotify.updateMihanData()
            expect(result).toBe(false)
        })

        it("should update mihanData when new data is available", async () => {
            const newData = [["new1"], ["new2"]]

            const { missionsIngameQuery } = await import("../api/query")
            vi.mocked(missionsIngameQuery).mockResolvedValue({
                missions: newData,
            })

            await mihanNotify.updateMihanData()
            expect(mihanNotify.mihanData.value).toEqual(newData)
        })
    })

    describe("show", () => {
        it("should set mihanVisible to true", () => {
            const { useUIStore } = require("./ui")
            const mockUI = { mihanVisible: false }
            vi.mocked(useUIStore).mockReturnValue(mockUI)

            mihanNotify.show()
            expect(mockUI.mihanVisible).toBe(true)
        })
    })

    describe("showMihanNotification", () => {
        beforeEach(() => {
            mihanNotify.mihanData.value = [
                ["探险/无尽", "驱离"],
                ["扼守/无尽", "护送"],
                ["勘探/无尽"],
            ]
            mihanNotify.mihanNotifyTypes.value = [0, 1]
            mihanNotify.mihanNotifyMissions.value = ["探险/无尽", "护送"]
        })

        it("should disable notify if notifyOnce is true", async () => {
            mihanNotify.mihanNotifyOnce.value = true
            mihanNotify.mihanEnableNotify.value = true

            await mihanNotify.showMihanNotification()
            expect(mihanNotify.mihanEnableNotify.value).toBe(false)
        })

        it("should not disable notify if notifyOnce is false", async () => {
            mihanNotify.mihanNotifyOnce.value = false
            mihanNotify.mihanEnableNotify.value = true

            await mihanNotify.showMihanNotification()
            expect(mihanNotify.mihanEnableNotify.value).toBe(true)
        })

        it("should send notification in app environment", async () => {
            const { sendNotification } = await import("@tauri-apps/plugin-notification")

            await mihanNotify.showMihanNotification()
            expect(sendNotification).toHaveBeenCalled()
        })

        it("should play sound", async () => {
            const playSpy = vi.spyOn(mihanNotify.sfx, "play")
            await mihanNotify.showMihanNotification()
            expect(playSpy).toHaveBeenCalled()
        })

        it("should show mihan panel", async () => {
            const showSpy = vi.spyOn(mihanNotify, "show")
            await mihanNotify.showMihanNotification()
            expect(showSpy).toHaveBeenCalled()
        })

        it("should request permission if not granted", async () => {
            const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification")
            vi.mocked(isPermissionGranted).mockResolvedValue(false)

            await mihanNotify.showMihanNotification()
            expect(requestPermission).toHaveBeenCalled()
        })

        it("should not send notification if permission denied", async () => {
            const { isPermissionGranted, requestPermission, sendNotification } = await import(
                "@tauri-apps/plugin-notification"
            )
            vi.mocked(isPermissionGranted).mockResolvedValue(false)
            vi.mocked(requestPermission).mockResolvedValue("denied")

            await mihanNotify.showMihanNotification()
            expect(sendNotification).not.toHaveBeenCalled()
        })
    })

    describe("getNextUpdateTime", () => {
        it("should return next hour timestamp", () => {
            const now = new Date("2024-01-01T10:30:00").getTime()
            const next = mihanNotify.getNextUpdateTime(now)
            const expected = new Date("2024-01-01T11:00:00").getTime()
            expect(next).toBe(expected)
        })

        it("should round up to next hour", () => {
            const now = new Date("2024-01-01T10:00:01").getTime()
            const next = mihanNotify.getNextUpdateTime(now)
            const expected = new Date("2024-01-01T11:00:00").getTime()
            expect(next).toBe(expected)
        })

        it("should use current time if no parameter provided", () => {
            const before = Date.now()
            const next = mihanNotify.getNextUpdateTime()
            const after = Date.now()
            
            expect(next).toBeGreaterThan(before)
            expect(next).toBeLessThan(after + 60 * 60 * 1000)
        })

        it("should handle edge case at exact hour", () => {
            const now = new Date("2024-01-01T10:00:00").getTime()
            const next = mihanNotify.getNextUpdateTime(now)
            const expected = new Date("2024-01-01T11:00:00").getTime()
            expect(next).toBe(expected)
        })
    })

    describe("shouldUpdate", () => {
        it("should always return true", () => {
            expect(mihanNotify.shouldUpdate()).toBe(true)
        })
    })

    describe("shouldNotify", () => {
        beforeEach(() => {
            mihanNotify.mihanData.value = [
                ["探险/无尽", "驱离"],
                ["扼守/无尽", "护送"],
                ["勘探/无尽"],
            ]
        })

        it("should return true when matching conditions exist", () => {
            mihanNotify.mihanNotifyTypes.value = [0, 1]
            mihanNotify.mihanNotifyMissions.value = ["探险/无尽", "护送"]

            expect(mihanNotify.shouldNotify()).toBe(true)
        })

        it("should return false when no matching types", () => {
            mihanNotify.mihanNotifyTypes.value = [2]
            mihanNotify.mihanNotifyMissions.value = ["探险/无尽"]

            expect(mihanNotify.shouldNotify()).toBe(false)
        })

        it("should return false when no matching missions", () => {
            mihanNotify.mihanNotifyTypes.value = [0]
            mihanNotify.mihanNotifyMissions.value = ["不存在的任务"]

            expect(mihanNotify.shouldNotify()).toBe(false)
        })

        it("should return false with empty data", () => {
            mihanNotify.mihanData.value = undefined
            mihanNotify.mihanNotifyTypes.value = [0]
            mihanNotify.mihanNotifyMissions.value = ["探险/无尽"]

            expect(mihanNotify.shouldNotify()).toBe(false)
        })

        it("should return false with empty notify types", () => {
            mihanNotify.mihanNotifyTypes.value = []
            mihanNotify.mihanNotifyMissions.value = ["探险/无尽"]

            expect(mihanNotify.shouldNotify()).toBe(false)
        })

        it("should return false with empty notify missions", () => {
            mihanNotify.mihanNotifyTypes.value = [0]
            mihanNotify.mihanNotifyMissions.value = []

            expect(mihanNotify.shouldNotify()).toBe(false)
        })
    })

    describe("checkNotify", () => {
        it("should call showMihanNotification if should notify", async () => {
            vi.spyOn(mihanNotify, "shouldNotify").mockReturnValue(true)
            const showSpy = vi.spyOn(mihanNotify, "showMihanNotification").mockResolvedValue()

            await mihanNotify.checkNotify()
            expect(showSpy).toHaveBeenCalled()
        })

        it("should not call showMihanNotification if should not notify", async () => {
            vi.spyOn(mihanNotify, "shouldNotify").mockReturnValue(false)
            const showSpy = vi.spyOn(mihanNotify, "showMihanNotification")

            await mihanNotify.checkNotify()
            expect(showSpy).not.toHaveBeenCalled()
        })
    })

    describe("sleep", () => {
        it("should return a promise", () => {
            const result = mihanNotify.sleep(100)
            expect(result).toBeInstanceOf(Promise)
        })

        it("should resolve after specified duration", async () => {
            const start = Date.now()
            await mihanNotify.sleep(100)
            const end = Date.now()
            const elapsed = end - start
            expect(elapsed).toBeGreaterThanOrEqual(95)
            expect(elapsed).toBeLessThan(150)
        })

        it("should work with 0 duration", async () => {
            const start = Date.now()
            await mihanNotify.sleep(0)
            const end = Date.now()
            expect(end - start).toBeLessThan(10)
        })
    })

    describe("startWatch", () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it("should not start if already watching", () => {
            mihanNotify.watch = true
            const consoleSpy = vi.spyOn(console, "log")

            mihanNotify.startWatch()
            expect(consoleSpy).not.toHaveBeenCalledWith("start watch")
        })

        it("should set watch flag to true", () => {
            mihanNotify.startWatch()
            expect(mihanNotify.watch).toBe(true)
        })

        it("should schedule update at next hour boundary", () => {
            const now = new Date("2024-01-01T10:30:00").getTime()
            vi.setSystemTime(now)

            mihanNotify.startWatch()
            
            const expectedDelay = 30 * 60 * 1000 + 3000 // 30 minutes + 3 seconds
            expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), expectedDelay)
        })

        it("should retry update on failure", async () => {
            vi.spyOn(mihanNotify, "updateMihanData")
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true)

            mihanNotify.startWatch()

            // Fast-forward to trigger the timeout
            await vi.runAllTimersAsync()

            expect(mihanNotify.updateMihanData).toHaveBeenCalledTimes(3)
        })

        it("should check notify after update", async () => {
            vi.spyOn(mihanNotify, "updateMihanData").mockResolvedValue(true)
            const checkSpy = vi.spyOn(mihanNotify, "checkNotify").mockResolvedValue()

            mihanNotify.startWatch()
            await vi.runAllTimersAsync()

            expect(checkSpy).toHaveBeenCalled()
        })

        it("should restart watch if notify is still enabled", async () => {
            mihanNotify.mihanEnableNotify.value = true
            vi.spyOn(mihanNotify, "updateMihanData").mockResolvedValue(true)
            vi.spyOn(mihanNotify, "checkNotify").mockResolvedValue()

            mihanNotify.startWatch()
            await vi.runAllTimersAsync()

            // Should be called twice: once initially, once after callback
            expect(mihanNotify.watch).toBe(true)
        })

        it("should not restart watch if notify is disabled", async () => {
            mihanNotify.mihanEnableNotify.value = false
            vi.spyOn(mihanNotify, "updateMihanData").mockResolvedValue(true)
            vi.spyOn(mihanNotify, "checkNotify").mockResolvedValue()

            mihanNotify.startWatch()
            const initialWatch = mihanNotify.watch
            await vi.runAllTimersAsync()

            expect(mihanNotify.watch).toBe(false)
        })

        it("should stop retry after 3 failures", async () => {
            vi.spyOn(mihanNotify, "updateMihanData").mockResolvedValue(false)
            const consoleSpy = vi.spyOn(console, "log")

            mihanNotify.startWatch()
            await vi.runAllTimersAsync()

            expect(mihanNotify.updateMihanData).toHaveBeenCalledTimes(3)
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("retry"))
        })
    })

    describe("Integration Tests", () => {
        it("should complete full notification flow", async () => {
            mihanNotify.mihanData.value = [["探险/无尽"], [], []]
            mihanNotify.mihanNotifyTypes.value = [0]
            mihanNotify.mihanNotifyMissions.value = ["探险/无尽"]
            mihanNotify.mihanNotifyOnce.value = false

            const { sendNotification } = await import("@tauri-apps/plugin-notification")
            const playSpy = vi.spyOn(mihanNotify.sfx, "play")

            await mihanNotify.checkNotify()

            expect(sendNotification).toHaveBeenCalled()
            expect(playSpy).toHaveBeenCalled()
        })

        it("should handle multiple notification types", async () => {
            mihanNotify.mihanData.value = [
                ["探险/无尽"],
                ["护送"],
                ["勘探/无尽"],
            ]
            mihanNotify.mihanNotifyTypes.value = [0, 1, 2]
            mihanNotify.mihanNotifyMissions.value = ["探险/无尽", "护送", "勘探/无尽"]

            expect(mihanNotify.shouldNotify()).toBe(true)
        })
    })
})