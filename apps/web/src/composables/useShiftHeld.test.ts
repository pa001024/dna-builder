import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * U120：预览卡片按住 Shift 展开专属词条生效字段的共享状态源。
 * node 环境没有 window，这里注入最小事件宿主后动态 import，
 * 每个用例拿到独立的模块级单例。
 */

type Listener = (event: any) => void

/**
 * 最小 window / document 事件宿主：记录监听与 capture 选项，支持手动派发。
 * @returns 事件宿主
 */
function createHost() {
    const listeners = new Map<string, { listener: Listener; options?: unknown }[]>()

    return {
        addEventListener(type: string, listener: Listener, options?: unknown) {
            listeners.set(type, [...(listeners.get(type) ?? []), { listener, options }])
        },
        removeEventListener(type: string, listener: Listener) {
            listeners.set(
                type,
                (listeners.get(type) ?? []).filter(entry => entry.listener !== listener)
            )
        },
        dispatch(type: string, event: any = {}) {
            for (const entry of [...(listeners.get(type) ?? [])]) entry.listener(event)
        },
        listenerCount(type: string) {
            return (listeners.get(type) ?? []).length
        },
        captureOptions(type: string) {
            return (listeners.get(type) ?? []).map(entry => entry.options)
        },
    }
}

describe("useShiftHeld", () => {
    let fakeDocument: ReturnType<typeof createHost> & { hidden: boolean }
    let fakeWindow: ReturnType<typeof createHost> & { document: typeof fakeDocument }

    beforeEach(() => {
        vi.resetModules()
        fakeDocument = Object.assign(createHost(), { hidden: false })
        fakeWindow = Object.assign(createHost(), { document: fakeDocument })
        vi.stubGlobal("window", fakeWindow)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    async function importShiftHeld() {
        const { useShiftHeld } = await import("./useShiftHeld")

        return useShiftHeld()
    }

    it("模块加载即挂监听：首次 useShiftHeld 之前按住的 Shift 也能继承（U120-fix P2）", async () => {
        const { useShiftHeld } = await import("./useShiftHeld")

        // 只加载模块、尚未调用 useShiftHeld，监听已经就位
        expect(fakeWindow.listenerCount("keydown")).toBe(1)
        fakeWindow.dispatch("keydown", { key: "Shift", shiftKey: true })
        expect(useShiftHeld().value).toBe(true)
    })

    it("初始未按住；keydown Shift 置 true，keyup Shift 复位", async () => {
        const shiftHeld = await importShiftHeld()

        expect(shiftHeld.value).toBe(false)
        fakeWindow.dispatch("keydown", { key: "Shift", shiftKey: true })
        expect(shiftHeld.value).toBe(true)
        fakeWindow.dispatch("keyup", { key: "Shift", shiftKey: false })
        expect(shiftHeld.value).toBe(false)
    })

    it("组合键 keydown 也视为按住，且监听挂在捕获阶段", async () => {
        const shiftHeld = await importShiftHeld()

        fakeWindow.dispatch("keydown", { key: "a", shiftKey: true })
        expect(shiftHeld.value).toBe(true)
        expect(fakeWindow.captureOptions("keydown")).toEqual([true])
        expect(fakeWindow.captureOptions("keyup")).toEqual([true])
    })

    it("任意按键在 shiftKey 已松开时 keyup 也复位（Shift 在窗口外松开的兜底）", async () => {
        const shiftHeld = await importShiftHeld()

        fakeWindow.dispatch("keydown", { key: "a", shiftKey: true })
        fakeWindow.dispatch("keyup", { key: "a", shiftKey: false })
        expect(shiftHeld.value).toBe(false)
    })

    it("窗口失焦复位，避免卡在展开态", async () => {
        const shiftHeld = await importShiftHeld()

        fakeWindow.dispatch("keydown", { key: "Shift", shiftKey: true })
        fakeWindow.dispatch("blur", {})
        expect(shiftHeld.value).toBe(false)
    })

    it("页面隐藏复位，重新可见不自动展开", async () => {
        const shiftHeld = await importShiftHeld()

        fakeWindow.dispatch("keydown", { key: "Shift", shiftKey: true })
        fakeDocument.hidden = true
        fakeDocument.dispatch("visibilitychange", {})
        expect(shiftHeld.value).toBe(false)
        fakeDocument.hidden = false
        fakeDocument.dispatch("visibilitychange", {})
        expect(shiftHeld.value).toBe(false)
    })

    it("单例：多次调用共享同一状态，监听只挂一次", async () => {
        const first = await importShiftHeld()
        const second = await importShiftHeld()

        expect(second).toBe(first)
        expect(fakeWindow.listenerCount("keydown")).toBe(1)
        expect(fakeWindow.listenerCount("keyup")).toBe(1)
        expect(fakeWindow.listenerCount("blur")).toBe(1)
        expect(fakeDocument.listenerCount("visibilitychange")).toBe(1)
    })

    it("无 window 环境安全降级：不抛错、状态恒 false", async () => {
        vi.unstubAllGlobals()
        vi.resetModules()
        const { useShiftHeld } = await import("./useShiftHeld")

        expect(useShiftHeld().value).toBe(false)
    })
})
