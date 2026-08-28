import { createPinia, setActivePinia, storeToRefs } from "pinia"
import { beforeEach, describe, expect, it } from "vitest"
import { CDN_LIST } from "@/utils/game-download"
import { useGameStore } from "./game"
import { useGameUpdateStore } from "./gameUpdate"

// 与示例 store 测试一致：使用内存 localStorage 避免污染真实环境
const localStorageMock = (() => {
    let store: Record<string, string> = {}

    return {
        clear: () => {
            store = {}
        },
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
            store[key] = String(value)
        },
        removeItem: (key: string) => {
            delete store[key]
        },
    }
})()

describe("gameUpdate store 按渠道路径/CDN 归一化", () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: localStorageMock,
        })
        globalThis.localStorage.clear()
        setActivePinia(createPinia())
    })

    it("syncGamePathByChannel 把 game.path 切到当前渠道专属安装路径", () => {
        const gameUpdateStore = useGameUpdateStore()
        const { channelGamePathMap, selectedChannel } = storeToRefs(gameUpdateStore)
        const gameStore = useGameStore()
        const channel = selectedChannel.value
        const channelPath = `D:\\Game\\CN\\DNA Game\\EM.exe`
        gameStore.path = `D:\\Game\\Old\\DNA Game\\EM.exe`
        gameUpdateStore.saveChannelGamePath(channelPath)
        expect(channelGamePathMap.value[channel]).toBe(channelPath)

        gameUpdateStore.syncGamePathByChannel()
        expect(gameStore.path).toBe(channelPath)
    })

    it("saveChannelGamePath 按渠道隔离，不同渠道路径互不覆盖", () => {
        const gameUpdateStore = useGameUpdateStore()
        const { channelGamePathMap, selectedChannel } = storeToRefs(gameUpdateStore)
        gameUpdateStore.saveChannelGamePath("D:\\CN\\DNA Game\\EM.exe")
        expect(channelGamePathMap.value).toHaveProperty(selectedChannel.value, "D:\\CN\\DNA Game\\EM.exe")
    })

    it("已有全局路径但尚无渠道路径时 syncLauncherInputs 保留该路径", () => {
        const gameUpdateStore = useGameUpdateStore()
        const { channelGamePathMap, selectedChannel } = storeToRefs(gameUpdateStore)
        const gameStore = useGameStore()
        gameStore.path = "D:\\Game\\DNA Game\\EM.exe"
        // 未为该渠道保存过路径，map 为空
        expect(channelGamePathMap.value[selectedChannel.value]).toBeUndefined()
        // 完整流程：先迁移旧版全局路径到当前渠道，再同步，路径不应被清空
        gameUpdateStore.syncLauncherInputs()
        expect(gameStore.path).toBe("D:\\Game\\DNA Game\\EM.exe")
        expect(channelGamePathMap.value[selectedChannel.value]).toBe("D:\\Game\\DNA Game\\EM.exe")
    })

    it("migrateLegacyGamePath 把旧版全局路径首次迁移到当前渠道", () => {
        const gameUpdateStore = useGameUpdateStore()
        const { channelGamePathMap, selectedChannel } = storeToRefs(gameUpdateStore)
        const gameStore = useGameStore()
        const channel = selectedChannel.value
        gameStore.path = "D:\\Game\\DNA Game\\EM.exe"
        // 该渠道尚无专属路径，应迁移
        gameUpdateStore.migrateLegacyGamePath()
        expect(channelGamePathMap.value[channel]).toBe("D:\\Game\\DNA Game\\EM.exe")
        // 已迁移后再次调用不覆盖已有专属路径
        gameUpdateStore.saveChannelGamePath("D:\\New\\DNA Game\\EM.exe")
        gameUpdateStore.migrateLegacyGamePath()
        expect(channelGamePathMap.value[channel]).toBe("D:\\New\\DNA Game\\EM.exe")
    })

    it("ensureValidCDN 把失效的海外 CDN 校正到当前渠道可用列表", () => {
        const gameUpdateStore = useGameUpdateStore()
        const { selectedChannel, selectedCDN, availableCDN } = storeToRefs(gameUpdateStore)
        const overseas = CDN_LIST.find(cdn => cdn.name === "海外")
        expect(overseas).toBeTruthy()
        // 海外渠道仅保留海外 CDN，其余渠道排除海外
        selectedChannel.value = "PC_OBT_Global_Pub"
        expect(availableCDN.value.every(cdn => cdn.name === "海外")).toBe(true)
        // CN 渠道选中海外 CDN 后校正回国内
        selectedChannel.value = "PC_OBT_CN_Pub"
        selectedCDN.value = overseas!.url
        gameUpdateStore.ensureValidCDN()
        expect(availableCDN.value.some(cdn => cdn.url === selectedCDN.value)).toBe(true)
        expect(selectedCDN.value).not.toBe(overseas!.url)
    })

    it("syncLauncherInputs 统一同步路径与 CDN 输入", () => {
        const gameUpdateStore = useGameUpdateStore()
        const { channelGamePathMap, selectedChannel, selectedCDN, availableCDN } = storeToRefs(gameUpdateStore)
        const gameStore = useGameStore()
        const channel = selectedChannel.value
        gameStore.path = "D:\\Old\\DNA Game\\EM.exe"
        gameUpdateStore.saveChannelGamePath("D:\\New\\DNA Game\\EM.exe")
        selectedCDN.value = CDN_LIST.find(cdn => cdn.name === "海外")!.url

        gameUpdateStore.syncLauncherInputs()

        expect(gameStore.path).toBe("D:\\New\\DNA Game\\EM.exe")
        expect(channelGamePathMap.value[channel]).toBe("D:\\New\\DNA Game\\EM.exe")
        expect(availableCDN.value.some(cdn => cdn.url === selectedCDN.value)).toBe(true)
    })
})
