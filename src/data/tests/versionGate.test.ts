import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    closeSafeMode,
    DNA_CURRENT_VERSION_GLOBAL_KEY,
    DNA_SAFE_VERSION_LIMIT,
    getCurrentVersionLimit,
    isSafeModeClosed,
    openSafeMode,
    setCurrentVersionLimit,
} from "../versionGate"

/** 构造一个内存版 localStorage 模拟（Node 测试环境无全局 localStorage，需注入）。 */
function createMockStorage(initial: Record<string, string> = {}): Storage {
    const store = new Map(Object.entries(initial))
    return {
        get length() {
            return store.size
        },
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        key: (index: number) => [...store.keys()][index] ?? null,
        removeItem: (key: string) => void store.delete(key),
        setItem: (key: string, value: string) => void store.set(key, String(value)),
    }
}

describe("versionGate 安全模式按 setting_safe_mode 键值判定", () => {
    beforeEach(() => {
        vi.stubGlobal("localStorage", createMockStorage())
        delete (globalThis as Record<string, unknown>)[DNA_CURRENT_VERSION_GLOBAL_KEY]
    })
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("默认（键缺失）安全模式开启，版本门限为 DNA_SAFE_VERSION_LIMIT", () => {
        expect(isSafeModeClosed()).toBe(false)
        expect(getCurrentVersionLimit()).toBe(DNA_SAFE_VERSION_LIMIT)
    })

    it("closeSafeMode 将键写为当前版本，视为已关闭，版本门限放开为 Infinity", () => {
        closeSafeMode()
        expect(isSafeModeClosed()).toBe(true)
        expect(getCurrentVersionLimit()).toBe(Number.POSITIVE_INFINITY)
    })

    it("openSafeMode 删除键后恢复开启", () => {
        closeSafeMode()
        openSafeMode()
        expect(isSafeModeClosed()).toBe(false)
        expect(getCurrentVersionLimit()).toBe(DNA_SAFE_VERSION_LIMIT)
    })

    it("版本门限更新后旧键值失效，安全模式自动回到开启（含主动关闭用户）", () => {
        // 旧版本关闭时写入的是旧版本号，不等于当前版本 → 视为未关闭（自动回到开启）
        const storage = globalThis.localStorage
        storage.setItem("setting_safe_mode", "0.5")
        expect(isSafeModeClosed()).toBe(false)
        expect(getCurrentVersionLimit()).toBe(DNA_SAFE_VERSION_LIMIT)
    })

    it("getCurrentVersionLimit 优先使用全局版本门限", () => {
        setCurrentVersionLimit(99)
        expect(getCurrentVersionLimit()).toBe(99)
    })
})
